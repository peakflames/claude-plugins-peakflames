// DEC-53 platform subset: lib/watchdog.mjs on every OS (AC-XP-01, -02, -03). The fake steps are
// Node scripts, so this file runs the same on macOS, Windows and Linux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { runWatched, resolveBin } from '../../lib/watchdog.mjs';
import { ROOT, tmpDir } from '../helpers/run.mjs';

const node = process.execPath;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const until = async (cond, ms, what) => {
  const t = Date.now();
  while (!cond()) { if (Date.now() - t > ms) assert.fail(what); await new Promise((r) => setTimeout(r, 100)); }
};
/** A fake step: a Node script written into dir. */
function fake(dir, name, body) {
  const f = path.join(dir, `${name}.mjs`);
  writeFileSync(f, body);
  return f;
}
// a step whose own child (the grandchild) never exits; the grandchild's pid goes to pidFile
const parentOfSleeper = (pidFile) => `import { spawn } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\n`
  + `const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\n`
  + `writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));\nsetInterval(() => {}, 1000);\n`;

test('watchdog: passes the exit status, stdout, stderr and stdin through (not AC-bound)', () => {
  const dir = tmpDir('pm-wd-io-');
  const echo = fake(dir, 'echo', `let s = '';\nprocess.stdin.on('data', (d) => { s += d; });\nprocess.stdin.on('end', () => {\n`
    + `  process.stdout.write('out:' + s.toUpperCase());\n  process.stderr.write('err:' + process.argv[2]);\n  process.exit(Number(process.argv[3]));\n});\n`);
  const r = runWatched(node, [echo, 'a b', '7'], { input: 'hello', timeoutMs: 30_000 });
  assert.deepEqual([r.status, r.stdout, r.stderr, r.timedOut, r.error], [7, 'out:HELLO', 'err:a b', false, undefined]);
  // no input: stdin is empty (not inherited), so a step reading it ends at once
  const z = runWatched(node, [echo, 'x', '0'], { timeoutMs: 30_000 });
  assert.deepEqual([z.status, z.stdout], [0, 'out:']);
  // binary output survives as a Buffer
  const bin = fake(dir, 'bin', 'process.stdout.write(Buffer.from([0, 255, 10, 13, 1]));\n');
  const b = runWatched(node, [bin], { encoding: 'buffer', timeoutMs: 30_000 });
  assert.deepEqual([...b.stdout], [0, 255, 10, 13, 1]);
  // cwd and env reach the step
  const cwd = fake(dir, 'cwd', 'process.stdout.write(process.cwd() + "|" + process.env.PM_WD_X);\n');
  const c = runWatched(node, [cwd], { cwd: dir, env: { ...process.env, PM_WD_X: 'y' }, timeoutMs: 30_000 });
  assert.ok([path.resolve(dir), realpathSync(dir), realpathSync.native(dir)].some((d) => c.stdout.toLowerCase() === `${d}|y`.toLowerCase()), c.stdout);
});

test('AC-XP-01: a step that overruns its timeout is stopped with its whole process tree (grandchild included)', async () => {
  const dir = tmpDir('pm-wd-timeout-');
  const pidFile = path.join(dir, 'grandchild.pid');
  const step = fake(dir, 'hang', parentOfSleeper(pidFile));
  const t0 = Date.now();
  const r = runWatched(node, [step], { timeoutMs: 2500 });
  assert.equal(r.timedOut, true);
  assert.equal(r.status, null);
  assert.ok(Date.now() - t0 < 15_000, `stopped promptly (${Date.now() - t0} ms)`);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await until(() => !alive(pid), 10_000, `the grandchild (pid ${pid}) was killed with the tree`);
});

test('watchdog: "not found" only when the binary does not exist, not from a real step\'s exit 127 (not AC-bound)', () => {
  const dir = tmpDir('pm-wd-enoent-');
  const s = fake(dir, 'exits127', 'process.stderr.write("No such file or directory: input.mp4\\n");\nprocess.exit(127);\n');
  const real = runWatched(node, [s], { timeoutMs: 30_000 });
  assert.equal(real.status, 127);
  assert.equal(real.error, undefined, 'a real binary exiting 127 is not "not found"');
  assert.equal(runWatched(path.join(dir, 'nope'), [], { timeoutMs: 10_000 }).error?.code, 'ENOENT');
  assert.equal(runWatched('pm-no-such-binary-xyz', [], { timeoutMs: 10_000 }).error?.code, 'ENOENT');
  // a bare name found on PATH (node itself), with PATH from the env given
  const r = runWatched(path.basename(node, path.extname(node)), ['-e', 'process.stdout.write("ok")'], { env: { ...process.env, PATH: path.dirname(node) }, timeoutMs: 30_000 });
  assert.equal(r.stdout, 'ok', JSON.stringify(r));
});

test('AC-XP-02: when the parent node process dies mid-step, the step\'s tree is killed and its temp folder removed', async () => {
  const dir = tmpDir('pm-wd-parent-');
  const tmp = path.join(dir, 'tmp');
  mkdirSync(tmp);
  const pidFile = path.join(dir, 'grandchild.pid');
  const step = fake(dir, 'hang', parentOfSleeper(pidFile));
  const parent = fake(dir, 'parent', `import { runWatched } from ${JSON.stringify(path.join(ROOT, 'lib', 'watchdog.mjs'))};\n`
    + `runWatched(process.execPath, [${JSON.stringify(step)}], { timeoutMs: 600000 });\n`);
  const child = spawn(node, [parent], { env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp }, stdio: 'ignore', windowsHide: true });
  const exited = new Promise((res) => child.on('exit', res));
  await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim(), 15_000, 'the step started');
  const pid = Number(readFileSync(pidFile, 'utf8'));
  assert.equal(readdirSync(tmp).filter((x) => x.startsWith('pm-run-')).length, 1, 'the step has its temp folder while it runs');
  child.kill('SIGKILL'); // a crash: nothing in the parent gets to run
  await exited;
  await until(() => !alive(pid), 10_000, `the step's grandchild (pid ${pid}) is gone`);
  await until(() => readdirSync(tmp).filter((x) => x.startsWith('pm-run-')).length === 0, 10_000, 'no pm-run-* temp folder left');
});

test('AC-XP-03: resolveBin splits PATH on the OS delimiter and tries each PATHEXT extension on win32', () => {
  const files = new Set(['C:\\ff\\ffmpeg.EXE', 'C:\\tools\\npx.CMD', 'C:\\abs\\tool.exe', '/usr/local/bin/ffmpeg']);
  const exists = (p) => files.has(p);
  const win = { platform: 'win32', exists };
  const env = { Path: 'C:\\nope;C:\\ff;C:\\tools', PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  assert.equal(resolveBin('ffmpeg', env, win), 'C:\\ff\\ffmpeg.EXE', 'Path (any case), ; delimiter, PATHEXT');
  assert.equal(resolveBin('npx', env, win), 'C:\\tools\\npx.CMD');
  assert.equal(resolveBin('C:\\abs\\tool.exe', env, win), 'C:\\abs\\tool.exe', 'an absolute path with its extension');
  assert.equal(resolveBin('C:\\abs\\tool', { ...env, PATHEXT: '.exe' }, win), 'C:\\abs\\tool.exe', 'an absolute path without one');
  assert.equal(resolveBin('missing', env, win), null);
  assert.equal(resolveBin('ffmpeg', { PATH: '/nope:/usr/local/bin' }, { platform: 'darwin', exists }), '/usr/local/bin/ffmpeg', ': delimiter on POSIX');
  assert.equal(resolveBin('ffmpeg', { PATH: '/usr/local/bin' }, { platform: 'linux', exists: (p) => p === '/usr/local/bin/ffmpeg.exe' }), null, 'no PATHEXT on POSIX');
});
