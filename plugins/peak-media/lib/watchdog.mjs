// Run a child process synchronously under a watchdog that does not depend on the child-exit
// signal reaching node. The child runs detached (its own process group) inside `sh`, with stdout
// and stderr going to files; sh writes the exit status to a file when the child ends. This process
// polls for that file and, past the deadline, kills the whole process group (SIGKILL).
// Why: under emulation (linux/amd64 on Apple silicon via Rosetta) spawnSync was seen to sleep in
// epoll forever after its children had exited, ignoring its own `timeout` (WP9 verify-1 F1).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const nap = (ms) => Atomics.wait(sleeper, 0, 0, ms);

/** Step timeout in ms: PEAK_MEDIA_STEP_TIMEOUT_S (seconds) overrides every default. */
export function stepTimeoutMs(defaultMs) {
  const s = Number(process.env.PEAK_MEDIA_STEP_TIMEOUT_S);
  return Number.isFinite(s) && s > 0 ? s * 1000 : defaultMs;
}

export const fmtDuration = (ms) => (ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 100) / 10} s`);

// sh: $1 = status file, $2 = stdin file ('' = /dev/null), $3 = stdout file, $4 = stderr file,
// $5 = this call's temp folder, $6.. = command. A background watcher checks every second that the
// node process ($PPID) is still alive; if it is gone (Ctrl-C, SIGTERM, a crash: node is blocked in
// a synchronous wait, so JS signal handlers can't run), it deletes the temp folder and kills the
// step's whole process group, so nothing is left running or on disk.
const SH = [
  'st="$1"; in="${2:-/dev/null}"; o="$3"; e="$4"; d="$5"; shift 5; p=$PPID',
  '( while kill -0 "$p" 2>/dev/null; do sleep 1; done; rm -rf "$d"; kill -KILL -- -$$ ) & w=$!',
  '"$@" <"$in" >"$o" 2>"$e"; s=$?',
  'kill "$w" 2>/dev/null',
  'echo "$s" >"$st.tmp"; mv "$st.tmp" "$st"',
].join('\n');

/** Absolute path of bin (as given, or found on PATH), or null when it doesn't exist. */
function resolveBin(bin, env) {
  if (bin.includes('/')) return existsSync(bin) ? bin : null;
  for (const dir of String((env ?? process.env).PATH ?? '').split(':')) {
    if (dir && existsSync(path.join(dir, bin))) return path.join(dir, bin);
  }
  return null;
}

/**
 * Run `bin args` and wait (synchronously) for it, at most timeoutMs.
 * Returns {status, stdout, stderr, error?, timedOut}. error.code = 'ENOENT' when the binary is missing.
 */
export function runWatched(bin, args = [], { cwd, env, input, timeoutMs = 10 * 60_000, encoding = 'utf8' } = {}) {
  // "not found" only when the binary itself doesn't exist, never from the step's own output
  if (!resolveBin(bin, env)) return { status: null, stdout: '', stderr: '', timedOut: false, error: Object.assign(new Error(`${bin}: not found`), { code: 'ENOENT' }) };
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pm-run-'));
  const f = (n) => path.join(dir, n);
  try {
    if (input !== undefined) writeFileSync(f('in'), input);
    const child = spawn('/bin/sh', ['-c', SH, 'pm-watchdog', f('status'), input !== undefined ? f('in') : '', f('out'), f('err'), dir, bin, ...args],
      { cwd, env, detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    const deadline = Date.now() + timeoutMs;
    let wait = 1, timedOut = false;
    while (!existsSync(f('status'))) {
      if (Date.now() > deadline) {
        timedOut = true;
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
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
    rmSync(dir, { recursive: true, force: true });
  }
}
