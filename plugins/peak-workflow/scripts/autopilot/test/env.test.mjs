// The clone's environment: what git does not carry (ignored files), what the project declares
// about it (`setup`, `copy` in .claude/peak-workflow/autopilot.json), and readiness's proof
// (`driver.mjs prepare`) that the clone can run the project's own test command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { REGISTRIES } from '../driver.mjs';
import { DRIVER, E1, git, happy, makeProject, readJson } from './helpers.mjs';

const driver = (...args) => { const r = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' }); return { ...r, json: () => JSON.parse(r.stdout) }; };
const settingsFile = (p) => path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');

/** A project whose tests need two things git ignores: a local `.env` and an installed dependency. */
function needy(t) {
  const p = makeProject(t);
  fs.writeFileSync(path.join(p.project, 'test', 'env.test.js'), "import test from 'node:test';\nimport fs from 'node:fs';\ntest('env', () => { fs.readFileSync('.env'); fs.readFileSync('node_modules/ready'); });\n");
  git(p.project, 'add', '-A');
  git(p.project, 'commit', '-q', '-m', 'test: needs .env and an installed dependency');
  fs.writeFileSync(path.join(p.project, '.env'), 'KEY=1\n');
  fs.mkdirSync(path.join(p.project, 'node_modules'));
  fs.writeFileSync(path.join(p.project, 'node_modules', 'ready'), 'ok\n');
  return p;
}
const SETUP = 'mkdir -p node_modules && echo ok > node_modules/ready';

test('readiness lists what the clone will lack: every git-ignored path of the project, read-only', (t) => {
  const p = needy(t);
  const env = driver('preflight', '--project', p.project, '--json').json().launch.env;
  assert.deepEqual(env.ignored, [{ path: '.env', dir: false, status: 'absent' }, { path: 'node_modules/', dir: true, status: 'absent' }]);
  assert.deepEqual([env.setup, env.copy, env.problems, env.cloneExists], [null, [], [], false]);
  assert.ok(!fs.existsSync(p.clone), 'preflight makes no clone');
});

test('prepare without setup or copy: the test command fails in the clone, before any run', (t) => {
  const p = needy(t);
  const r = driver('prepare', '--project', p.project);
  assert.equal(r.status, 1, r.stderr);
  const out = r.json();
  assert.deepEqual([out.ok, out.failed, out.cloneMade, out.tests.pass], [false, 'tests', true, false]);
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')), 'the lock is released');
  assert.ok(!fs.existsSync(path.join(p.state, 'current')), 'no run was created');
});

test('configure writes setup and copy into the project settings, keeps other keys, and refuses a path git would commit', (t) => {
  const p = needy(t);
  fs.mkdirSync(path.dirname(settingsFile(p)), { recursive: true });
  fs.writeFileSync(settingsFile(p), JSON.stringify({ onPark: 'continue' }));
  const bad = driver('configure', '--project', p.project, '--copy', 'README.md');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /README\.md is not ignored by git/);
  assert.match(driver('configure', '--project', p.project, '--copy', '../x').stderr, /not a path inside the project/);
  assert.match(driver('configure', '--project', p.project, '--copy', '.env.local').stderr, /does not exist in the project/);
  const ok = driver('configure', '--project', p.project, '--setup', SETUP, '--copy', '.env');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readJson(settingsFile(p)), { onPark: 'continue', setup: SETUP, copy: ['.env'] });
  driver('configure', '--project', p.project, '--setup', '');
  assert.deepEqual(readJson(settingsFile(p)), { onPark: 'continue', copy: ['.env'] });
});

test('prepare with setup and copy: the clone passes the tests; the project is untouched; statuses say how each path got there', (t) => {
  const p = needy(t);
  driver('configure', '--project', p.project, '--setup', SETUP, '--copy', '.env');
  const before = git(p.project, 'status', '--porcelain');
  const r = driver('prepare', '--project', p.project);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.json();
  assert.deepEqual([out.ok, out.failed, out.copied, out.setup.pass, out.tests.pass, out.leftovers], [true, null, ['.env'], true, true, []]);
  assert.equal(fs.readFileSync(path.join(p.clone, '.env'), 'utf8'), 'KEY=1\n');
  assert.deepEqual(out.env.ignored.map((i) => [i.path, i.status]), [['.env', 'copied'], ['node_modules/', 'present']]);
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'ignored files leave the clone clean');
  assert.equal(git(p.project, 'status', '--porcelain'), before);
  assert.equal(readJson(path.join(p.state, 'prepare.json')).ok, true);
});

test('a command that is not found is reported as could-not-run, not as failing tests', (t) => {
  const p = makeProject(t);
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replaceAll('`node --test`', '`no-such-tool-xyz test`'));
  git(p.project, 'commit', '-qam', 'docs: a test command this shell does not have');
  const out = driver('prepare', '--project', p.project).json();
  assert.deepEqual([out.ok, out.failed, out.tests.couldNotRun, out.tests.code], [false, 'tests', true, 127]);
});

test('setup or tests that leave files git would commit fail the proof, and the clone is left clean', (t) => {
  const p = makeProject(t);
  driver('configure', '--project', p.project, '--setup', 'echo x > stray.txt');
  const out = driver('prepare', '--project', p.project).json();
  assert.deepEqual([out.ok, out.failed, out.leftovers], [false, 'leftovers', ['?? stray.txt']]);
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
});

test('a run copies and sets up before the base check; a failing setup stops it before any session, with its own message', async (t) => {
  const p = needy(t);
  driver('configure', '--project', p.project, '--setup', SETUP, '--copy', '.env');
  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.queue[0].state, 'MERGED', JSON.stringify(state.queue[0]));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /environment: copied \.env from the project\n.*environment: setup .* passed/);

  const q = needy(t);
  driver('configure', '--project', q.project, '--setup', 'echo no network >&2; exit 3');
  q.scenario(happy(E1));
  const failed = await q.go();
  assert.deepEqual([failed.status, failed.stoppedBecause, failed.setupFailed.exit], ['STOPPED', 'setup failed', 3]);
  assert.deepEqual(q.calls(), []);
  const report = readJson(path.join(q.runDir(), 'report.json'));
  assert.match(report.tldr.join('\n'), /could not get its private copy of your project ready: the setup command .* failed \(no network\)/);
  assert.match(report.next[0], /Fix what stopped the private copy/);
});

test('base red from a missing command: the report says the tests never ran', async (t) => {
  const p = makeProject(t);
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replaceAll('`node --test`', '`no-such-tool-xyz test`'));
  git(p.project, 'commit', '-qam', 'docs: a test command this shell does not have');
  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.stoppedBecause, 'base red');
  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.match(report.tldr.join('\n'), /could not be run in autopilot's private copy .*The tests never ran/);
  assert.ok(!/already failing/.test(report.tldr.join('\n')));
});

test('configure --read-only accepts a narrow directory outside the project and refuses a broad, private or overlapping one', (t) => {
  const p = makeProject(t);
  const cache = path.join(p.tmp, 'cache'); fs.mkdirSync(cache);
  const refuse = (value, re) => { const r = driver('configure', '--project', p.project, '--read-only', value); assert.equal(r.status, 2, value); assert.match(r.stderr, re, value); };
  refuse('/', /home directory or above it/);
  refuse('~/', /home directory or above it/);
  refuse(path.dirname(os.homedir()), /home directory or above it/);
  refuse('cache', /must be an absolute path or start with ~\//);
  refuse(path.join(p.tmp, 'missing'), /not an existing directory/);
  refuse(path.join(p.project, 'src'), /overlaps the project/);
  refuse(p.tmp, /overlaps the project/);
  refuse(p.state, /overlaps the autopilot workspace/);
  for (const d of ['.ssh', '.claude', '.config']) if (fs.existsSync(path.join(os.homedir(), d))) refuse(`~/${d}`, /credentials or private settings/);
  assert.ok(!fs.existsSync(settingsFile(p)), 'a refused list writes nothing');

  const ok = driver('configure', '--project', p.project, '--read-only', `${cache},${cache}`);
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readJson(settingsFile(p)), { readOnly: [cache] });
  const env = driver('preflight', '--project', p.project, '--json').json().launch.env;
  assert.deepEqual([env.readOnly, env.problems], [[cache], []]);
  const dry = driver('run', '--project', p.project, '--workspace', p.state, '--dry-run').stdout;
  assert.ok(dry.includes(`readable outside the clone: ${cache}`), dry.split('\n').find((l) => l.startsWith('Clone environment')));
  driver('configure', '--project', p.project, '--read-only', '');
  assert.deepEqual(readJson(settingsFile(p)), {});
});

test('a run hands the declared directories to the referee: a build session reads the cache and is denied a write to it', async (t) => {
  const p = makeProject(t);
  const cache = path.join(p.tmp, 'cache'); fs.mkdirSync(cache); fs.writeFileSync(path.join(cache, 'lib.txt'), 'x');
  driver('configure', '--project', p.project, '--read-only', cache);
  const s = happy(E1);
  s[`${E1.id}/build`].actions.unshift({ do: 'tool', tool_name: 'Read', tool_input: { file_path: path.join(cache, 'lib.txt') } }, { do: 'tool', tool_name: 'Write', tool_input: { file_path: path.join(cache, 'new.txt'), content: 'x' } });
  p.scenario(s);
  const state = await p.go();
  assert.deepEqual(state.readOnly, [cache]);
  assert.equal(state.queue[0].state, 'MERGED', JSON.stringify(state.queue[0]));
  const tools = fs.readFileSync(p.dir(E1.id, 'build-1', 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(tools[0].out, null, 'the read is not the referee\'s business');
  assert.match(tools[1].out.hookSpecificOutput.permissionDecisionReason, /read-only for this session/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /sessions may read \(never write\): /);

  // A directory that has gone since it was saved refuses the launch rather than running without it.
  fs.rmSync(cache, { recursive: true });
  const pre = driver('preflight', '--project', p.project, '--json', '--allow-test-double').json();
  assert.ok(pre.launch.refuse.some((r) => /is not an existing directory/.test(r)), JSON.stringify(pre.launch.refuse));
});

test('configure --network saves host names only; a run writes them into each session\'s sandbox settings and leaves the auditor with none', async (t) => {
  const p = makeProject(t);
  for (const [bad, re] of [['https://api.nuget.org', /names a scheme/], ['*.org', /whole top-level domain/], ['api.nuget.org/v3', /not a bare host name/]]) {
    const r = driver('configure', '--project', p.project, '--network', bad);
    assert.equal(r.status, 2, bad); assert.match(r.stderr, re, bad);
  }
  assert.ok(!fs.existsSync(settingsFile(p)));
  const ok = driver('configure', '--project', p.project, '--network', 'PKGS.example.org,registry.npmjs.org');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readJson(settingsFile(p)), { network: ['pkgs.example.org', 'registry.npmjs.org'] });
  const pre = driver('preflight', '--project', p.project, '--json', '--allow-test-double').json();
  assert.deepEqual([pre.launch.env.network, pre.launch.env.registries], [['pkgs.example.org', 'registry.npmjs.org'], REGISTRIES]);
  const dry = driver('run', '--project', p.project, '--workspace', p.state, '--dry-run').stdout;
  assert.match(dry, /^Network: +plan, build, repair and verify sessions may use local sockets and ports, and reach \d+ package registries plus pkgs\.example\.org, registry\.npmjs\.org; nothing else\. The auditor has no network/m);

  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.queue[0].state, 'MERGED');
  const net = (step) => readJson(p.dir(E1.id, step, 'settings.json')).sandbox.network;
  for (const step of ['plan-1', 'build-1', 'verify-1']) assert.deepEqual(net(step), { allowedDomains: [...REGISTRIES, 'pkgs.example.org'], strictAllowlist: true, allowAllUnixSockets: true, allowLocalBinding: true }, step);
  assert.deepEqual(net('audit-1'), { allowedDomains: [], strictAllowlist: true });

  // A hand-edited list that is not host names refuses the launch.
  fs.writeFileSync(settingsFile(p), JSON.stringify({ network: ['*'] }));
  assert.ok(driver('preflight', '--project', p.project, '--json', '--allow-test-double').json().launch.refuse.some((r) => /^network: "\*"/.test(r)));
  driver('configure', '--project', p.project, '--network', '');
  assert.deepEqual(readJson(settingsFile(p)), {});
});

test('prepare --probe: one session, launched as a build is, runs the test command in the sandbox; judged from the exit code the command wrote', (t) => {
  const p = makeProject(t);
  driver('configure', '--project', p.project, '--network', 'registry.npmjs.org');
  const probe = (...extra) => driver('prepare', '--project', p.project, '--probe', ...extra);

  // Under a test double nothing is probed unless the run is a declared rehearsal.
  const skipped = probe();
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.deepEqual([skipped.json().ok, skipped.json().probe.ran], [true, false]);
  assert.match(skipped.json().probe.skipped, /test double/);
  assert.deepEqual(p.calls(), []);
  assert.equal(driver('prepare', '--project', p.project).json().probe, undefined, 'no probe unless asked');

  p.scenario({ '*/probe': { actions: [{ do: 'exec', cmd: 'echo 0 > .autopilot-probe-exit' }], result: { total_cost_usd: 0.02, result: 'exit code 0' } } });
  const ok = probe('--allow-test-double');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const out = ok.json();
  assert.deepEqual([out.ok, out.failed, out.probe.ran, out.probe.pass, out.probe.exit, out.probe.costUsd, out.probe.network], [true, null, true, true, 0, 0.02, REGISTRIES]);
  const [call] = p.calls();
  assert.deepEqual([call.key, call.cwd, call.env.AUTOPILOT_ROLE, call.argv[call.argv.indexOf('--model') + 1]], ['probe/probe-1', p.clone, 'verifier', 'haiku']);
  assert.match(call.prompt, /run this one command exactly as written[\s\S]*node --test; echo \$\? > \.autopilot-probe-exit/);
  const step = path.join(p.state, 'probe', 'probe-1');
  assert.deepEqual(readJson(path.join(step, 'settings.json')).sandbox.network, { allowedDomains: REGISTRIES, strictAllowlist: true, allowAllUnixSockets: true, allowLocalBinding: true });
  assert.ok(readJson(path.join(step, 'settings.json')).hooks.PreToolUse, 'the referee is on, as in a build');
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'the probe leaves the clone clean');
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')));
  // A later proof without a probe keeps what the last probe found, and against what.
  const kept = driver('prepare', '--project', p.project).json();
  assert.deepEqual([kept.probe, kept.lastProbe.pass, kept.lastProbe.against], [undefined, true, { testCommand: 'node --test', setup: null, readOnly: [], network: ['registry.npmjs.org'] }]);

  // The command fails inside the sandbox although it passed in the plain shell; a referee denial is shown with it.
  p.scenario({ '*/probe': { actions: [{ do: 'tool', tool_name: 'Read', tool_input: { file_path: '/etc/hosts' } }, { do: 'exec', cmd: 'echo 134 > .autopilot-probe-exit' }], result: { result: 'dotnet: Operation not permitted' } } });
  const bad = probe('--allow-test-double');
  assert.equal(bad.status, 1);
  const b = bad.json();
  assert.deepEqual([b.ok, b.failed, b.tests.pass, b.probe.pass, b.probe.exit], [false, 'probe', true, false, 134]);
  assert.match(b.probe.why, /exited 134 inside the sandbox, although it passed in a plain shell/);
  assert.match(b.probe.tail, /Operation not permitted/);
  assert.match(b.probe.denials[0], /^R2: path jail/);

  // No exit code at all: the command never ran to its end (refused, killed, or the session gave up).
  p.scenario({ '*/probe': { actions: [], result: { result: 'I could not run it' } } });
  const none = probe('--allow-test-double').json();
  assert.deepEqual([none.ok, none.failed, none.probe.exit], [false, 'probe', null]);
  assert.match(none.probe.why, /no exit code was written/);
});

test('configure --budget sets a step\'s model, effort and caps without hand-editing JSON; readiness shows them; a workspace value that still wins is named', (t) => {
  const p = makeProject(t);
  for (const [bad, re] of [['build.turns=9', /"turns" is not a setting/], ['deploy.model=opus', /"deploy" is not a step/], ['verify.effort=huge', /must be one of low, medium, high, xhigh, max/], ['build.wallMin=2', /whole minutes from 5 to 480/], ['build.usd=free', /dollars from 0\.5 to 200/], ['opus', /is not <step>\.<key>=<value>/]]) {
    const r = driver('configure', '--project', p.project, '--budget', bad);
    assert.equal(r.status, 2, bad); assert.match(r.stderr, re, bad);
  }
  assert.ok(!fs.existsSync(settingsFile(p)), 'a refused setting writes nothing');

  const ok = driver('configure', '--project', p.project, '--budget', 'build.model=opus', '--budget', 'verify.effort=high,build.wallMin=120', '--budget', 'build.usd=25');
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readJson(settingsFile(p)), { budgets: { build: { model: 'opus', wallMin: 120, usd: 25 }, verify: { effort: 'high' } } });
  assert.deepEqual(ok.json().shadowed, []);
  const caps = Object.fromEntries(driver('preflight', '--project', p.project, '--json', '--allow-test-double').json().launch.caps.map((c) => [c.session, c]));
  assert.deepEqual([caps.build.model, caps.build.effort, caps.build.size, caps.build.minutes, caps.build.usd], ['opus', 'medium', 'L', 120, 25]); // effort follows the model's family
  assert.deepEqual([caps.verify.model, caps.verify.effort, caps.plan.model, caps.fix.model], ['opus', 'high', 'sonnet', 'sonnet']); // each step has its own model
  const dry = driver('run', '--project', p.project, '--workspace', p.state, '--dry-run').stdout;
  assert.match(dry, /build-1 — role builder, wall clock 120 min/);
  assert.match(dry.split('\n').find((l) => l.includes('/build-1/settings.json') && l.includes('--model')), /--max-budget-usd 25 .*--model opus --effort medium/);

  // The workspace's settings.json is read after the project's file: say so instead of saving silently.
  const ws = path.join(p.state, 'settings.json');
  fs.writeFileSync(ws, JSON.stringify({ ...readJson(ws), budgets: { build: { model: 'sonnet' } } }));
  const shadowed = driver('configure', '--project', p.project, '--budget', 'build.model=opus').json().shadowed;
  assert.equal(shadowed.length, 1);
  assert.match(shadowed[0], /budgets\.build\.model is "sonnet" in .*settings\.json, which wins/);
  const launch = driver('preflight', '--project', p.project, '--json', '--allow-test-double').json().launch;
  assert.deepEqual([launch.workspaceBudgets, launch.caps.find((c) => c.session === 'build').model], [{ build: { model: 'sonnet' } }, 'sonnet']);

  // An empty value goes back to the default, and the file keeps nothing empty.
  driver('configure', '--project', p.project, '--budget', 'build.model=,build.wallMin=,build.usd=,verify.effort=');
  assert.deepEqual(readJson(settingsFile(p)), {});
});

test('prepare --gate tries the other quality gates in the clone after the tests: each is reported, and a failing one is a warning, not a refusal', (t) => {
  const p = makeProject(t);
  const r = driver('prepare', '--project', p.project, '--gate', 'node -e "process.exit(0)"', '--gate', 'echo "lint: 3 problems" >&2; exit 4', '--gate', 'no-such-linter-xyz .', '--gate', 'echo built > out.txt');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.json();
  assert.deepEqual([out.ok, out.failed, out.tests.pass], [true, null, true]);
  assert.deepEqual(out.gates.map((g) => [g.pass, g.code, g.couldNotRun]), [[true, 0, false], [false, 4, false], [false, 127, true], [true, 0, false]]);
  assert.deepEqual(out.gatesFailed, ['echo "lint: 3 problems" >&2; exit 4', 'no-such-linter-xyz .']);
  assert.match(out.gates[1].tail, /lint: 3 problems/);
  assert.deepEqual(out.gates[3].leftovers, ['?? out.txt']);
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'what a gate leaves is removed');
  assert.equal(driver('prepare', '--project', p.project).json().gates, undefined);

  // Gates are not tried on a copy whose tests do not pass: the tests stay the refusal.
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replaceAll('`node --test`', '`no-such-tool-xyz test`'));
  git(p.project, 'commit', '-qam', 'docs: a test command this shell does not have');
  const red = driver('prepare', '--project', p.project, '--gate', 'true').json();
  assert.deepEqual([red.ok, red.failed, red.gates], [false, 'tests', []]);
});
