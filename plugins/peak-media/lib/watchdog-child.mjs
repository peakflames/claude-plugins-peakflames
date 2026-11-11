// The wrapper process lib/watchdog.mjs starts for every watched step (DEC-52: one Node
// implementation on every OS, no /bin/sh). It runs the real binary with stdin/stdout/stderr bound
// to files, waits for it, and writes its exit status to the status file atomically (.tmp, rename).
// Every second it checks that the node process that started it is still alive: that process is
// blocked in a synchronous wait (Atomics.wait), so its own signal handlers can't run. When it is
// gone (Ctrl-C, SIGTERM, a crash), this wrapper kills the step's process tree and removes the
// step's temp folder, so nothing is left running or on disk.
//
// argv: <status file> <stdin file|''> <stdout file> <stderr file> <temp folder> <parent pid> <bin> [args...]
import { spawn } from 'node:child_process';
import { openSync, closeSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import { killTree } from './watchdog.mjs';

const [statusFile, inFile, outFile, errFile, dir, ppidArg, bin, ...args] = process.argv.slice(2);
const ppid = Number(ppidArg);

// A console Ctrl-C reaches every process on the console (Windows) or in the foreground group:
// this wrapper must outlive the parent to clean up after it, so it ignores the interrupt itself.
for (const sig of ['SIGINT', 'SIGBREAK', 'SIGHUP']) { try { process.on(sig, () => {}); } catch { /* not on this OS */ } }

const fds = [inFile ? openSync(inFile, 'r') : 'ignore', openSync(outFile, 'w'), openSync(errFile, 'w')];
const closeFds = () => { for (const fd of fds) if (typeof fd === 'number') { try { closeSync(fd); } catch { /* closed */ } } };

let done = false;
function finish(status) {
  if (done) return;
  done = true;
  clearInterval(watch);
  closeFds();
  writeFileSync(`${statusFile}.tmp`, `${status}\n`);
  renameSync(`${statusFile}.tmp`, statusFile);
  process.exit(0);
}

const child = spawn(bin, args, { stdio: fds, windowsHide: true });
child.on('error', (e) => finish(e.code === 'ENOENT' ? 127 : 126));
child.on('exit', (code, signal) => finish(code ?? 128 + (os.constants.signals[signal] ?? 0)));

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const watch = setInterval(() => {
  if (alive(ppid)) return;
  done = true;
  clearInterval(watch);
  closeFds();
  // win32: the step's tree, by parent pid. POSIX: this wrapper leads the step's process group,
  // so the group goes down after the cleanup, this wrapper included.
  if (process.platform === 'win32' && child.pid) killTree(child.pid);
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* best effort */ }
  if (process.platform !== 'win32') killTree(process.pid);
  process.exit(1);
}, 1000);
