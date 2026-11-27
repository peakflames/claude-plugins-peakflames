// The clone's environment: what git does not carry (ignored files), what the project declares
// about it (`setup`, `copy` in .claude/peak-workflow/autopilot.json), and readiness's proof
// (`driver.mjs prepare`) that the clone can run the project's own test command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR, REGISTRIES, claudeMdReads, loadConfig, preflight, sleepWarning, windowsWarning } from '../driver.mjs';
import { writeReport } from '../report.mjs';
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
  assert.match(report.next[0], /autopilot could not get its private copy of your project ready .*If it still cannot: Autopilot cannot repair this itself yet; it needs someone who maintains the code\./);
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
  const p = makeProject(t, { config: { sandbox: true } });
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
  const p = makeProject(t, { config: { sandbox: true } });
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
  assert.match(dry, /^Sandbox: +on — sessions write only in the clone, may use local sockets and ports, and reach \d+ package registries plus pkgs\.example\.org, registry\.npmjs\.org; nothing else\. The auditor has no network/m);

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
  const p = makeProject(t, { config: { sandbox: true } });
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
  assert.match(b.probe.why, /exited 134 in a session, although it passed in a plain shell/);
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
  assert.match(dry.split('\n').find((l) => l.includes(`${path.sep}build-1${path.sep}settings.json`) && l.includes('--model')), /--max-budget-usd 25 .*--model opus --effort medium/);

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

test('files CLAUDE.md names outside the project: single existing files in backticks, never credentials, settings, history or transcripts', (t) => {
  const p = makeProject(t);
  const home = path.join(p.tmp, 'home'); const old = process.env.HOME; const oldProfile = process.env.USERPROFILE;
  process.env.HOME = home; process.env.USERPROFILE = home; // Windows reads the home folder from USERPROFILE
  t.after(() => { process.env.HOME = old; if (oldProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldProfile; });
  const mk = (rel, link = null) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); if (link) fs.symlinkSync(path.join(home, link), f); else fs.writeFileSync(f, 'x'); return f; };
  const tether = mk('.claude/scripts/tethered.mjs'); const tool = mk('tools/lint.sh'); const fenced = mk('tools/fenced.sh');
  for (const f of ['.claude/.credentials.json', '.claude/settings.json', '.claude/projects/x/t.jsonl', '.claude/state/x.json', '.claude.json', '.ssh/config', '.zsh_history', 'work/other/.env', '.claude/scripts/unnamed.mjs']) mk(f);
  mk('.claude/history.jsonl'); mk('.claude/scripts/link.mjs', '.claude/history.jsonl');
  const md = [
    'Start dev servers with `node ~/.claude/scripts/tethered.mjs start -- npm run dev`, never directly.',
    `Lint with \`${tool}\`. The sources are in \`${path.join(p.project, 'src', 'index.js')}\` and \`src/index.js\`.`,
    'A path without backticks does not count: ~/.claude/scripts/unnamed.mjs',
    'Not files: `~/.claude/scripts`, `~/tools/missing.sh`, `~/tools/*.sh`, `/peak-workflow:autopilot`.',
    'Closed: `~/.claude/.credentials.json` `~/.claude/settings.json` `~/.claude/projects/x/t.jsonl` `~/.claude/state/x.json` `~/.claude.json` `~/.ssh/config` `~/.zsh_history` `~/work/other/.env` `~/.claude/scripts/link.mjs`',
    '```sh', 'sh $HOME/tools/fenced.sh --fix', '```',
  ].join('\n');
  const r = claudeMdReads(md, { project: p.project, workspace: p.state });
  assert.deepEqual(r.files, [tether, tool, fenced].map((f) => fs.realpathSync.native(f)));
  assert.deepEqual(r.refused.map((x) => x.path), ['~/.claude/.credentials.json', '~/.claude/settings.json', '~/.claude/projects/x/t.jsonl', '~/.claude/state/x.json', '~/.claude.json', '~/.ssh/config', '~/.zsh_history', '~/work/other/.env', '~/.claude/scripts/link.mjs']);
  assert.ok(r.refused.every((x) => /credentials|sign-in/.test(x.why)));
  // macOS and Windows ignore case in file names: a path spelled in capitals is the same private place.
  if (process.platform === 'darwin') assert.deepEqual(claudeMdReads('`~/.SSH/config` `~/.CLAUDE/settings.json`', {}).files, []);
  assert.deepEqual(claudeMdReads('', {}), { files: [], refused: [] });
});

test('a run hands the files CLAUDE.md names to the referee and says so at launch', async (t) => {
  const p = makeProject(t, { config: { sandbox: true } });
  const script = path.join(p.tmp, 'tools', 'tether.mjs'); fs.mkdirSync(path.dirname(script)); fs.writeFileSync(script, '// starts a dev server\n');
  // Quoted: on Windows the temp path can hold a space (C:\Users\Todd Schavey), as a user's own path may.
  fs.appendFileSync(path.join(p.project, 'CLAUDE.md'), `\nStart dev servers with \`node "${script}" start\`.\n`);
  git(p.project, 'commit', '-qam', 'docs: name the dev-server script');
  assert.deepEqual(driver('preflight', '--project', p.project, '--json', '--allow-test-double').json().launch.env.readFiles, [script]);
  assert.ok(driver('run', '--project', p.project, '--workspace', p.state, '--dry-run').stdout.includes(`files CLAUDE.md names outside the project: ${script}`));
  const s = happy(E1);
  s[`${E1.id}/build`].actions.unshift({ do: 'tool', tool_name: 'Bash', tool_input: { command: `node "${script}" start` } }, { do: 'tool', tool_name: 'Read', tool_input: { file_path: path.join(p.tmp, 'tools', 'other.mjs') } });
  p.scenario(s);
  const state = await p.go();
  assert.deepEqual(state.readFiles, [script]);
  assert.equal(state.queue[0].state, 'MERGED', JSON.stringify(state.queue[0]));
  assert.ok(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8').includes(`the files CLAUDE.md names outside the project: ${script}`));
  const tools = fs.readFileSync(p.dir(E1.id, 'build-1', 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(tools[0].out, null, 'the named script may be run');
  assert.match(tools[1].out.hookSpecificOutput.permissionDecisionReason, /outside the private clone/);
});

test('by default sessions run with the sandbox off: settings say so, the run records it for the referee, and the dry run states what still guards the machine', async (t) => {
  const p = makeProject(t);
  const dry = driver('run', '--project', p.project, '--workspace', p.state, '--dry-run').stdout;
  assert.match(dry, /^Sandbox: +off — sessions run commands as a terminal does, with open network; the referee keeps file writes inside the clone/m);
  assert.equal(driver('preflight', '--project', p.project, '--json', '--allow-test-double').json().launch.env.sandbox, false);
  const s = happy(E1);
  // A build session looks a package up in a cache nobody declared, and tries to write outside the clone.
  s[`${E1.id}/build`].actions.unshift({ do: 'tool', tool_name: 'Bash', tool_input: { command: 'ls ~/.nuget/packages/ | head -3' } }, { do: 'tool', tool_name: 'Bash', tool_input: { command: 'echo x > ~/autopilot-should-not-write.txt' } });
  p.scenario(s);
  const state = await p.go();
  assert.deepEqual([state.sandbox, state.queue[0].state], [false, 'MERGED']);
  for (const step of ['plan-1', 'build-1', 'audit-1', 'verify-1']) assert.deepEqual(readJson(p.dir(E1.id, step, 'settings.json')).sandbox, { enabled: false }, step);
  const tools = fs.readFileSync(p.dir(E1.id, 'build-1', 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(tools[0].out, null, 'the read is allowed');
  assert.match(tools[1].out.hookSpecificOutput.permissionDecisionReason, /writes only inside it/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /sandbox off: sessions run commands unsandboxed/);

  // A project may turn it back on; anything but true or false is refused at launch.
  fs.mkdirSync(path.dirname(settingsFile(p)), { recursive: true });
  fs.writeFileSync(settingsFile(p), JSON.stringify({ sandbox: 'yes' }));
  p.scenario(happy(E1));
  await assert.rejects(p.go(), /sandbox must be true or false/);
});

test('tor-lifecycle finds its folder when the path it is given uses backslashes, as Windows passes it', (t) => {
  // POSIX has no backslash separator, so the Windows path is stood in for by a file whose name holds one:
  // `sub\tor-lifecycle` beside a folder `sub` that holds the Python file.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.copyFileSync(path.join(PLUGIN_DIR, 'scripts', 'tor-lifecycle'), path.join(dir, 'sub\\tor-lifecycle'));
  fs.writeFileSync(path.join(dir, 'sub', 'tor_lifecycle.py'), 'print("found")\n');
  const r = spawnSync('sh', ['sub\\tor-lifecycle'], { cwd: dir, encoding: 'utf8' });
  assert.deepEqual([r.status, r.stdout.trim()], [0, 'found'], r.stderr);
});

// ---- a project with no tests yet ------------------------------------------------------------

/** The seed as a new project is before its first epic: no test files, and a test command that fails because of it. */
function noTestsYet(p) {
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replaceAll('`node --test`', '`node --test test/`'));
  git(p.project, 'rm', '-rq', 'test');
  git(p.project, 'commit', '-qam', 'chore: a project before its first test');
}

test('no tests on the integration line yet: the base check is skipped and the first epic is built', async (t) => {
  const p = makeProject(t);
  noTestsYet(p);
  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.stoppedBecause, 'queue done');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(state.baseEmpty, { before: E1.id, testDirs: ['test/'] });
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /no test files under test\/ on develop yet: the base test run is skipped/);
  // The epic's own checks still ran the tests: the first epic must leave them passing.
  assert.equal(readJson(p.dir(E1.id, 'check-build-1.json')).checks.find((c) => c.name === 'tests-green').pass, true);
});

test('a failing test command is still base red once a test file exists', async (t) => {
  const p = makeProject(t);
  noTestsYet(p);
  fs.mkdirSync(path.join(p.project, 'test'));
  fs.writeFileSync(path.join(p.project, 'test', 'red.test.js'), "import test from 'node:test';\ntest('red', () => { throw new Error('red'); });\n");
  git(p.project, 'add', '-A');
  git(p.project, 'commit', '-qm', 'test: a failing test');
  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.stoppedBecause, 'base red');
  assert.equal(state.baseEmpty, undefined);
});

test('prepare on a project with no tests yet: the proof passes and says the tests were not run', (t) => {
  const p = makeProject(t);
  noTestsYet(p);
  const r = spawnSync(process.execPath, [DRIVER, 'prepare', '--project', p.project, '--workspace', p.state, '--allow-test-double'], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(out.ok, true);
  assert.equal(out.failed, null);
  assert.deepEqual(out.tests, { command: 'node --test test/', pass: true, skipped: 'no test files under test/ on develop yet' });
});

// ---- the Python guard (scripts/tor-lifecycle) ----------------------------------------------

test('tor-lifecycle: an old python3 first on PATH does not hide a newer one further along', { skip: process.platform === 'win32' }, (t) => {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-py-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10 }));
  // Two stand-in interpreters: each answers the version probe; the newer one says what it was asked to run.
  const fake = (dir, version, ok) => {
    fs.mkdirSync(path.join(tmp, dir));
    fs.writeFileSync(path.join(tmp, dir, 'python3'), `#!/bin/sh\nif [ "$1" = "-c" ]; then echo ${version}; exit ${ok ? 0 : 1}; fi\necho "ran ${dir}: $2"\n`, { mode: 0o755 });
    return path.join(tmp, dir);
  };
  const old = fake('old', '3.9.6', false);
  const cur = fake('new', '3.15.2', true);
  const guard = path.join(PLUGIN_DIR, 'scripts', 'tor-lifecycle');
  const run = (PATH) => spawnSync('/bin/sh', [guard, 'format'], { encoding: 'utf8', env: { PATH } });

  const found = run(`${old}:${cur}`);
  assert.equal(found.status, 0, found.stderr);
  assert.match(found.stdout, /^ran new: format/);
});

test('preflight: with no Python 3.11 the format guard refuses in one line, not the whole install hint of the guard (Step 10)', (t) => {
  const p = makeProject(t);
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-nopy-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10 }));
  // The real guard, with every interpreter it probes answering "too old" or "not here".
  const guard = fs.readFileSync(path.join(PLUGIN_DIR, 'scripts', 'tor-lifecycle'), 'utf8');
  const blind = guard.replace(/^probe\(\) \{\n[^\n]*\n\}/m, 'probe() { return 1; }');
  assert.notEqual(blind, guard);
  fs.mkdirSync(path.join(tmp, 'scripts'));
  fs.writeFileSync(path.join(tmp, 'scripts', 'tor-lifecycle'), blind);
  assert.equal(spawnSync('sh', [path.join(tmp, 'scripts', 'tor-lifecycle'), 'format'], { encoding: 'utf8' }).status, 3, 'the guard finds no Python');
  const pre = preflight(p.project, loadConfig(p.state, { project: p.project }), { pluginDir: tmp });
  const lines = pre.refuse.filter((r) => /format guard|Python|Install|brew|winget/i.test(r));
  assert.deepEqual(lines, ['format guard: needs Python 3.11 or newer, and none was found — install a current Python (https://www.python.org/downloads/), then try again']);
});

// ---- an overnight run on a flaky or sleepy machine (#41 B6, B10; #40 item 6) ----------------------

/** A test file on develop that fails the first time it runs and passes from then on (the marker lives outside the clone). */
function failsOnce(p, name = 'flaky') {
  const marker = path.join(p.tmp, `${name}-tried`);
  fs.writeFileSync(path.join(p.project, 'test', `${name}.test.js`), `import test from 'node:test';\nimport fs from 'node:fs';\ntest('${name}', () => { if (!fs.existsSync(${JSON.stringify(marker)})) { fs.writeFileSync(${JSON.stringify(marker)}, 'x'); throw new Error('${name}'); } });\n`);
  git(p.project, 'add', '-A');
  git(p.project, 'commit', '-q', '-m', `test: ${name}`);
}

test('a base check that fails once and passes when run again is not base red: the epic is built and the retry is recorded', async (t) => {
  const p = makeProject(t);
  failsOnce(p);
  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.stoppedBecause, 'queue done');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(state.baseRed, undefined);
  assert.equal(state.baseRetried.length, 1);
  assert.equal(state.baseRetried[0].before, E1.id);
  assert.deepEqual(state.baseRetried[0].tries.map((x) => x.pass), [false, true]);
  assert.ok(state.baseRetried[0].tries.every((x) => typeof x.ms === 'number' && typeof x.sleptSec === 'number'));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /base check: `node --test` failed on develop \(exit 1\); running it once more[\s\S]*base check passed when run again/);
  assert.ok(fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').includes('"type":"base-retried"'));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Your project's own tests failed once on `develop` before .* and passed when run again: a flaky test/);
});

test('a base check that fails twice is base red, with both tries recorded; a check the machine slept through says so', async (t) => {
  const p = makeProject(t);
  fs.writeFileSync(path.join(p.project, 'test', 'red.test.js'), "import test from 'node:test';\ntest('red', () => { throw new Error('base is red'); });\n");
  git(p.project, 'add', '-A');
  git(p.project, 'commit', '-q', '-m', 'test: a failing test on develop');
  p.scenario(happy(E1));
  const state = await p.go();
  assert.equal(state.stoppedBecause, 'base red');
  assert.deepEqual(p.calls(), []);
  assert.deepEqual(state.baseRed.tries.map((x) => [x.pass, x.exit]), [[false, 1], [false, 1]]);
  assert.equal(typeof state.baseRed.sleptSec, 'number');
  // The machine slept ten minutes through the first try: the report says so.
  const file = path.join(p.runDir(), 'state.json');
  const s = readJson(file); s.baseRed.tries[0].sleptSec = 600; fs.writeFileSync(file, JSON.stringify(s));
  writeReport(p.runDir());
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /the machine slept 10 min during the check/);
});

test('the launch warns about sleep on macOS and on Windows', () => {
  assert.match(sleepWarning('darwin'), /lid closed on battery/);
  assert.match(sleepWarning('win32'), /power plan .*never sleep.*plugged in/i);
  assert.equal(sleepWarning('linux'), null);
  // Windows testers are told it is unproven, and what to send; no by-hand command.
  assert.equal(windowsWarning('win32'), "Windows is new for autopilot and not yet proven. If a run breaks, send the run's report and its hooks.jsonl to the maintainer (issue #41)");
  assert.equal(windowsWarning('darwin'), null);
  assert.equal(windowsWarning('linux'), null);
});

test('prepare --gate runs a failing gate once more: one that passes the second time is flaky, not failed', (t) => {
  const p = makeProject(t);
  const marker = path.join(p.tmp, 'gate-tried');
  const flaky = `if [ -f "${marker}" ]; then exit 0; else touch "${marker}"; echo "  1) [chromium] › e2e/progress.spec.ts:48:3 › progress" >&2; echo "e2e: 1 timeout" >&2; exit 1; fi`;
  const r = driver('prepare', '--project', p.project, '--gate', flaky, '--gate', 'exit 4', '--gate', 'no-such-linter-xyz .', '--gate', 'true');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.json();
  assert.deepEqual(out.gates.map((g) => [g.pass, g.tries, !!g.flaky]), [[true, 2, true], [false, 2, false], [false, 1, false], [true, 1, false]]);
  assert.deepEqual(out.gatesFailed, ['exit 4', 'no-such-linter-xyz .']);
  assert.deepEqual(out.gatesFlaky, [flaky]);
  assert.match(out.gates[0].first.tail, /e2e: 1 timeout/);
  // Which test failed the first time is kept by name (Pilot Light, 2026-11-27: only "test:e2e was flaky" survived).
  assert.deepEqual(out.gates[0].first.failing, ['[chromium] › e2e/progress.spec.ts:48:3 › progress']);
});

test('setup runs again on the epic branch when the epic adds a manifest: an epic that creates web/package.json has its dependencies before its checks', async (t) => {
  const p = makeProject(t);
  driver('configure', '--project', p.project, '--setup', 'if [ -f web/package.json ]; then mkdir -p node_modules && echo ok > node_modules/ready && echo "" >> web/package.json; fi');
  const s = happy(E1);
  const acts = s[`${E1.id}/build`].actions;
  acts.splice(acts.length - 1, 0,
    { do: 'write', path: 'web/package.json', content: '{ "name": "ledger-web" }\n' },
    { do: 'write', path: 'test/deps.test.js', content: "import test from 'node:test';\nimport fs from 'node:fs';\ntest('dependencies are installed', () => { fs.readFileSync('node_modules/ready'); });\n" });
  p.scenario(s);
  const state = await p.go();
  assert.equal(p.epic(E1.id).state, 'MERGED', JSON.stringify(p.epic(E1.id)));
  assert.equal(readJson(p.dir(E1.id, 'check-build-1.json')).checks.find((c) => c.name === 'tests-green').pass, true);
  assert.equal(p.epic(E1.id).fixRounds, 0);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /setup changed 1 file\(s\) on .* \(web\/package\.json\); put back as committed/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`${E1.id}: ${E1.branch.replaceAll('/', '\\/')} changed web\\/package\\.json: running setup on it[\\s\\S]*environment: setup .* passed`));
  assert.equal(state.stoppedBecause, 'queue done');
});

test('a setup that fails on the epic branch parks the epic resumably, in the words of a failed setup', async (t) => {
  const p = makeProject(t);
  driver('configure', '--project', p.project, '--setup', 'if [ -f web/package.json ]; then echo no network >&2; exit 3; fi');
  const s = happy(E1);
  const acts = s[`${E1.id}/build`].actions;
  acts.splice(acts.length - 1, 0, { do: 'write', path: 'web/package.json', content: '{ "name": "ledger-web" }\n' });
  p.scenario(s);
  await p.go();
  const q = p.epic(E1.id);
  assert.equal(q.state, 'PARKED');
  assert.match(q.reason, /setup failed on feature\/epic-Lg1Csv7-csv-import \(exit 3\): no network/);
  assert.ok(!p.steps().includes(`${E1.id}/audit-1`), 'no check or session ran on a branch without its dependencies');
  assert.equal(readJson(path.join(p.state, 'gates', `${E1.id}-1.json`)).kind, 'resume');
});
