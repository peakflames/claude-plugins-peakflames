// Run a child process synchronously under a watchdog that does not depend on the child-exit
// signal reaching node. A small Node wrapper (lib/watchdog-child.mjs) runs the step with stdout and
// stderr going to files and writes the exit status to a file when the step ends. This process
// polls for that file and, past the deadline, kills the step's whole process tree.
// Why: under emulation (linux/amd64 on Apple silicon via Rosetta) spawnSync was seen to sleep in
// epoll forever after its children had exited, ignoring its own `timeout` (WP9 verify-1 F1).
// One implementation on every OS (DEC-52): no /bin/sh, so it runs the same on Windows.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'watchdog-child.mjs');

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const nap = (ms) => Atomics.wait(sleeper, 0, 0, ms);

/** Step timeout in ms: PEAK_MEDIA_STEP_TIMEOUT_S (seconds) overrides every default. */
export function stepTimeoutMs(defaultMs) {
  const s = Number(process.env.PEAK_MEDIA_STEP_TIMEOUT_S);
  return Number.isFinite(s) && s > 0 ? s * 1000 : defaultMs;
}

export const fmtDuration = (ms) => (ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 100) / 10} s`);

/**
 * Kill pid and everything it started. win32: `taskkill /T /F` (the tree by parent pid).
 * POSIX: SIGKILL to the process group pid leads (the watchdog wrapper is spawned detached).
 */
export function killTree(pid, platform = process.platform) {
  if (platform === 'win32') {
    const taskkill = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe') : 'taskkill';
    spawnSync(taskkill, ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 30_000 });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

/** Read an env var case-insensitively (Windows keeps `Path`, not `PATH`, in a copied env). */
function envVar(env, name) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key === undefined ? undefined : env[key];
}

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/**
 * Absolute path of bin (as given, or found on PATH), or null when it doesn't exist. On win32 each
 * PATHEXT extension is tried (`ffmpeg` finds `ffmpeg.exe`). `platform`/`pathMod` are for tests.
 */
export function resolveBin(bin, env = process.env, { platform = process.platform, pathMod = platform === 'win32' ? path.win32 : path.posix, exists = isFile } = {}) {
  const win = platform === 'win32';
  const exts = win ? String(envVar(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [];
  const candidates = (p) => (win ? [...(pathMod.extname(p) ? [p] : []), ...exts.map((e) => p + e)] : [p]);
  const first = (p) => candidates(p).find(exists) ?? null;
  if (pathMod.isAbsolute(bin) || bin.includes('/') || bin.includes(pathMod.sep)) return first(bin);
  for (const dir of String(envVar(env, 'PATH') ?? '').split(pathMod.delimiter)) {
    const hit = dir && first(pathMod.join(dir, bin));
    if (hit) return hit;
  }
  return null;
}

/**
 * Run `bin args` and wait (synchronously) for it, at most timeoutMs.
 * Returns {status, stdout, stderr, error?, timedOut}. error.code = 'ENOENT' when the binary is missing.
 */
export function runWatched(bin, args = [], { cwd, env, input, timeoutMs = 10 * 60_000, encoding = 'utf8' } = {}) {
  // "not found" only when the binary itself doesn't exist, never from the step's own output
  const resolved = resolveBin(bin, env ?? process.env);
  if (!resolved) return { status: null, stdout: '', stderr: '', timedOut: false, error: Object.assign(new Error(`${bin}: not found`), { code: 'ENOENT' }) };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pm-run-'));
  const f = (n) => path.join(dir, n);
  try {
    if (input !== undefined) writeFileSync(f('in'), input);
    const child = spawn(process.execPath, [CHILD, f('status'), input !== undefined ? f('in') : '', f('out'), f('err'), dir, String(process.pid), resolved, ...args],
      { cwd, env, detached: process.platform !== 'win32', stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    const deadline = Date.now() + timeoutMs;
    let wait = 1, timedOut = false;
    while (!existsSync(f('status'))) {
      if (Date.now() > deadline) {
        timedOut = true;
        if (child.pid) killTree(child.pid);
        break;
      }
      nap(wait);
      wait = Math.min(wait * 2, 50);
    }
    const read = (n) => (existsSync(f(n)) ? readFileSync(f(n), encoding === 'buffer' ? undefined : encoding) : (encoding === 'buffer' ? Buffer.alloc(0) : ''));
    const stdout = read('out'), stderr = read('err');
    if (timedOut) return { status: null, stdout, stderr, timedOut: true };
    const status = Number(readFileSync(f('status'), 'utf8').trim());
    return { status, stdout, stderr, timedOut: false };
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a killed step may still hold a file (win32) */ }
  }
}
