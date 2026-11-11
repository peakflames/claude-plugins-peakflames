// Helpers for evals: run a plugin entry point and capture its output.
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runWatched } from '../../lib/watchdog.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const fx = (...p) => path.join(ROOT, 'evals', 'fixtures', ...p);
export const pluginVersion = () => JSON.parse(readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;

const made = [];
let hooked = false;
/** A fresh folder under the OS temp dir, deleted when this test process exits
 *  (set PEAK_MEDIA_KEEP_TMP=1 to keep them for debugging). Use it for every eval scratch folder. */
export function tmpDir(prefix = 'pm-') {
  const d = mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(d);
  if (!hooked) {
    hooked = true;
    process.on('exit', () => {
      if (process.env.PEAK_MEDIA_KEEP_TMP) return;
      for (const x of made) { try { rmSync(x, { recursive: true, force: true }); } catch { /* best effort */ } }
    });
  }
  return d;
}

/** Run `node <script> ...args` with network blocked unless opts.network. */
export function run(script, args = [], opts = {}) {
  const pre = opts.network ? [] : ['--import', pathToFileURL(path.join(ROOT, 'evals', 'helpers', 'no-network.mjs')).href];
  const t0 = Date.now();
  const [bin, argv] = [process.execPath, [...pre, path.join(ROOT, script), ...args]];
  // per-step watchdog (lib/watchdog.mjs): a hung step fails its test in one line instead of hanging the suite
  const limit = (Number(process.env.PEAK_MEDIA_EVAL_STEP_TIMEOUT_S) || 0) * 1000 || opts.timeoutMs || 30 * 60_000;
  const r = runWatched(bin, argv, { cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env }, timeoutMs: limit });
  if (r.timedOut) return { code: null, stdout: r.stdout, stderr: `${r.stderr}eval step timed out after ${limit / 1000} s: ${script} ${args.join(' ')}\n`, ms: Date.now() - t0, timedOut: true };
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - t0 };
}

/** Baseline checks shared by every entry point (AC-BASE-*). */
export function baseline(t, assert, script, { flags, badArgs }) {
  const help = run(script, ['--help']);
  assert.equal(help.code, 0, 'help exits 0');
  for (const f of [...flags, '--help', '--version']) assert.ok(help.stdout.includes(f), `--help lists ${f}`);
  const ver = run(script, ['--version']);
  assert.equal(ver.code, 0);
  assert.equal(ver.stdout.trim(), pluginVersion(), '--version = plugin.json');
  for (const args of badArgs) {
    const r = run(script, args);
    assert.notEqual(r.code, 0, `non-zero exit for ${args.join(' ')}`);
    const lines = r.stderr.trim().split('\n').filter((l) => !/^Run '.+ --help' for usage\.$/.test(l));
    assert.equal(lines.length, 1, `one-line error for ${args.join(' ')}: ${r.stderr}`);
    assert.match(lines[0], /\S/, 'error text present');
    assert.doesNotMatch(r.stderr, /\n\s+at .+:\d+:\d+/, 'no stack trace');
    assert.doesNotMatch(r.stderr, /NETWORK-ATTEMPT/, 'no network');
  }
  for (const r of [help, ver]) assert.doesNotMatch(r.stderr, /NETWORK-ATTEMPT/, 'no network');
}
