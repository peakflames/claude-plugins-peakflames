// Run-alone gate for timing-sensitive evals (AC-REC-06 "run alone").
// `node --test <folder>` runs each test file in its own child process, in parallel. A file that
// calls waitUntilAlone() waits until it is the only test process left under the same runner, so
// its real-time captures don't share the CPU with HyperFrames renders or other captures. Run
// directly (`node --test <this file>` or ac-run), there are no siblings and it returns at once.
// Only ONE eval file may use this gate, or two waiting files would wait for each other.
import { execFileSync } from 'node:child_process';

/** Other node processes started by the same test runner (same parent, not us). */
export function siblings() {
  let ps;
  try { ps = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' }); } catch { return []; }
  const out = [];
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [pid, ppid, cmd] = [Number(m[1]), Number(m[2]), m[3]];
    if (ppid === process.ppid && pid !== process.pid && cmd.startsWith(process.execPath)) out.push({ pid, cmd: cmd.slice(0, 160) });
  }
  return out;
}

/** Wait until no sibling test process is running, seen on `emptyPolls` consecutive polls (the
 *  runner starts a queued file as soon as a slot frees, so one empty poll can land in that gap).
 *  Returns {alone, waitedMs, siblingsAtStart}. */
export async function waitUntilAlone({ timeoutMs = 30 * 60_000, pollMs = 1000, emptyPolls = 2 } = {}) {
  const t0 = Date.now();
  const atStart = siblings().length;
  let empty = 0;
  while (empty < emptyPolls) {
    empty = siblings().length ? 0 : empty + 1;
    if (empty >= emptyPolls) break;
    if (Date.now() - t0 > timeoutMs) return { alone: false, waitedMs: Date.now() - t0, siblingsAtStart: atStart };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { alone: true, waitedMs: Date.now() - t0, siblingsAtStart: atStart };
}
