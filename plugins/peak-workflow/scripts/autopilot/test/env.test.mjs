// The clone's environment: what git does not carry (ignored files), what the project declares
// about it (`setup`, `copy` in .claude/peak-workflow/autopilot.json), and readiness's proof
// (`driver.mjs prepare`) that the clone can run the project's own test command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
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
