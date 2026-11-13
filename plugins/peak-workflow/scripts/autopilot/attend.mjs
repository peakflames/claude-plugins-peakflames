// Autopilot, attended: what a session that stays with a run reads. `eventLine` turns one line of
// `runs/<run>/events.jsonl` into a sentence a non-developer can read; `watch` follows a run and
// prints one line per thing worth saying (built for the Monitor tool: one stdout line is one
// notification); `friction` counts what the referee refused. Everything here only reads files:
// the driver alone decides what runs, and nothing in this file changes a run.
import fs from 'node:fs';
import path from 'node:path';

const tryJson = (p, fallback = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const usd = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const took = (minutes) => (minutes >= 1 ? `${Math.round(minutes)} min` : 'under a minute');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const oneLine = (s, max = 300) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

/** `<id> — <Name>` from the driver's `<id> (<slug>) — <Name>`: the short form a status line can carry. */
export const shortLabel = (label) => String(label ?? '').replace(/^(\S+) \([^)]*\) — /, '$1 — ');

/** What each kind of session is doing, in plain words: [doing, done]. */
const STEP_WORDS = {
  plan: ['Planning', 'Plan'], build: ['Building', 'Build'], fix: ['Repairing', 'Repair'],
  audit: ['Reviewing', 'Review'], verify: ['Verifying', 'Verification'],
};
/** A driver check, as what is wrong when it fails. */
const CHECK_WORDS = {
  'branch-and-commit': 'the work was not committed as expected', 'clean-tree': 'files were left uncommitted',
  sidecar: 'the epic was not marked as built', handoff: 'the hand-over note is missing or lists unfinished work',
  traceability: 'a requirement has no test that names it', 'tests-green': 'the tests do not pass',
  'requirements-health': 'the requirements check found a problem', scope: 'files outside this epic were changed',
  'test-integrity': 'an existing test was changed without a recorded reason',
  verdict: 'the merge was not made the expected way', 'sidecar-on-integration': 'the epic was not marked complete',
  'no-waivers': 'a requirement was waived or put off', 'tests-green-on-integration': 'the tests do not pass after the merge',
};

/** Why an epic stopped, without phase names, step names or file names. */
export function plainReason(reason) {
  const r = String(reason ?? '');
  const table = [
    [/STOP file/, 'you asked it to stop'],
    [/run stopped \(end time\)/, 'the run reached its end time'],
    [/run stopped \(run budget\)/, 'the run reached its spending limit'],
    [/disk floor/, 'the disk is nearly full'],
    [/growth cap/, 'the work grew far larger on disk than expected'],
    [/hit wall clock/, 'a step reached its time limit'],
    [/^budget:/, 'a step reached its limit'],
    [/^infra error/, 'a technical error stopped a step'],
    [/^auditor: .*(could not start|no usable result)/, 'the independent reviewer could not run'],
    [/^auditor:/, 'the independent reviewer found a serious problem'],
    [/deferral/, 'the build left part of a requirement undone'],
    [/CHECK_BUILD still fails/, "autopilot's checks on the build still fail after the repair"],
    [/CHECK_BUILD/, "autopilot's own checks on the build did not pass"],
    [/merge gate failed/, 'the final checks failed, so the merge was undone'],
    [/did not merge it/, 'it was verified but not merged'],
    [/does not merge cleanly|could not be brought up to date/, 'its work no longer fits on top of the other finished work'],
    [/recorded look did not settle/, 'the check needs one more look from you'],
    [/human check needed/, 'it is built and needs you to look at it'],
    [/plan lint failed|without a captured plan/, 'its plan is missing a required part'],
    [/parked at a human gate/, 'it has a question only you can answer'],
    [/interrupted/, 'the driver was interrupted'],
    [/fix round is already used|after the fix round/, 'it did not pass its independent check, even after the one repair'],
    [/dependency/, 'it depends on an epic that did not finish'],
    [/TBD|Not decided yet|requirements decision/, 'the project has a decision to make first'],
  ];
  return table.find(([re]) => re.test(r))?.[1] ?? 'it needs you';
}

/** Reviewer findings that say the work was not exercised for real, whatever their severity. */
export const UNPROVEN_CATEGORIES = ['never-ran-real', 'stand-in'];
/**
 * What a verifier's final report says it did not run or could not prove for real: the bullets under
 * a "Not proven for real" heading, and any "Not run: …" line. Pure. The report is the session's own
 * account, so this is quoted to the owner as the verifier's words, never as a finding of autopilot's.
 */
export function unprovenLines(text) {
  const out = []; let under = false;
  const clean = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(#+\s*|\*\*)?not proven for real\b[^\n]{0,6}$/i.test(line.replace(/\*\*\s*$/, ''))) { under = true; continue; }
    const notRun = clean(line).match(/^not run\s*[:—–-]\s*(.+)$/i);
    if (notRun) { out.push(notRun[1].trim()); continue; }
    if (!under) continue;
    if (/^(#+\s|\*\*[^*]+\*\*:?\s*$)/.test(line)) { under = false; continue; } // the next heading ends the section
    if (/^(?:[-*•]|\d+[.)])\s+\S/.test(line) && !/^[-*•]?\s*(none|nothing)\b/i.test(clean(line))) out.push(clean(line));
  }
  return [...new Set(out)].map((t) => oneLine(t, 400));
}

/** Why a run ended, in plain words. */
export function plainEnd(why) {
  const w = String(why ?? '');
  const table = [
    [/^queue done$/, 'everything queued was worked through'], [/^nothing runnable$/, 'nothing more can run'],
    [/STOP file/, 'you asked it to stop'], [/^end time$/, 'it reached its end time'], [/^run budget$/, 'it reached its spending limit'],
    [/^disk floor$/, 'the disk is nearly full'], [/^infra$/, 'two technical errors in a row'],
    [/^base red$/, "your project's own tests were failing before it started"], [/^setup failed$/, "autopilot's copy of your project could not be made ready"],
    [/onPark: stop/, 'an epic stopped'], [/^preflight:/, 'the project is not ready for an unattended run'], [/^lock lost$/, 'another autopilot took over'],
  ];
  return table.find(([re]) => re.test(w))?.[1] ?? (w || 'it stopped');
}

/**
 * One event of `events.jsonl` as one plain sentence, or null for an event that is not worth a
 * line. Pure. No phase names and no file paths: a question the owner must answer is quoted as the
 * gate asks it.
 */
export function eventLine(ev) {
  const who = shortLabel(ev.label ?? ev.epic ?? 'the epic');
  const [doing, done] = STEP_WORDS[ev.kind] ?? ['Working on', 'Step'];
  switch (ev.type) {
    case 'run-start': return ev.resuming ? 'Autopilot picked the run back up.' : `Autopilot started: ${plural((ev.queue ?? []).length, 'epic')} queued.`;
    case 'epic-start': return ev.resumedAt ? `Continuing ${who} from where it stopped` : `Starting ${who}`;
    case 'step-start': return `${ev.continuing ? `${doing} (carrying on)` : doing} ${who}`;
    case 'step-end': {
      const cost = ev.costUsd ? ` (${usd(ev.costUsd)})` : '';
      if (ev.outcome === 'ok') return `${done} finished in ${took(ev.minutes)}${cost}`;
      if (ev.outcome === 'stopped') return `${done} stopped, as you asked, after ${took(ev.minutes)}${cost}`;
      if (ev.outcome === 'budget') return `${done} stopped at its ${/wall clock/.test(ev.why ?? '') ? 'time' : /disk|growth/.test(ev.why ?? '') ? 'disk' : 'spending'} limit after ${took(ev.minutes)}${cost}`;
      return `${done} stopped on a technical error after ${took(ev.minutes)}${cost}`;
    }
    case 'check': {
      const what = ev.name === 'verify' ? 'Final checks after the merge' : "Autopilot's checks on the build";
      if (ev.pass) return `${what} passed`;
      return `${what} found a problem: ${(ev.failed ?? []).map((n) => CHECK_WORDS[n] ?? n).join('; ') || 'see the report'}`;
    }
    case 'fix-round': return `${who} needs a repair: starting the one repair round`;
    case 'audit': return ev.parks ? `The independent reviewer found ${plural(ev.parks, 'serious problem')}` : ev.findings ? `The independent reviewer found ${plural(ev.findings, 'thing')} to note, none serious` : 'The independent reviewer found nothing';
    case 'merged': return `Finished and merged: ${who} (${took(ev.minutes)}, ${usd(ev.costUsd)})${ev.unproven ? ` — ${plural(ev.unproven, 'thing')} not proven for real` : ''}`;
    case 'parked':
      if (ev.question && ev.kind !== 'resume') return `Waiting for you: ${who} — ${oneLine(ev.question)}`;
      return `Stopped: ${who} — ${plainReason(ev.reason)}`;
    case 'failed': return `Did not pass: ${who} — ${plainReason(ev.reason)}`;
    case 'blocked': return `Not started: ${who} — ${plainReason(ev.reason)}`;
    case 'run-end': return `RUN ENDED: ${plainEnd(ev.why)}. Spent ${usd(ev.spentUsd)}.`;
    default: return null;
  }
}

// ---- reading a run ----------------------------------------------------------------------------

const runDirOf = (workspace, name) => path.join(workspace, 'runs', name);
function latestRun(workspace) {
  let name = null;
  try { name = fs.readFileSync(path.join(workspace, 'current'), 'utf8').trim(); } catch { /* no run yet */ }
  if (name && fs.existsSync(runDirOf(workspace, name))) return name;
  const dir = path.join(workspace, 'runs');
  return (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).sort() : []).at(-1) ?? null;
}
export function driverPid(workspace) {
  const pid = tryJson(path.join(workspace, 'lock'))?.pid;
  return pid && pidAlive(pid) ? pid : null;
}
/** The complete lines of a JSON-lines file from byte `offset` on: `{rows, offset}`; a half-written last line waits. */
function readFrom(file, offset) {
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return { rows: [], offset: 0 }; }
  if (size < offset) offset = 0; // the file was replaced
  if (size === offset) return { rows: [], offset };
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    const end = buf.lastIndexOf(0x0a);
    if (end < 0) return { rows: [], offset };
    const rows = buf.subarray(0, end).toString('utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return { rows, offset: offset + end + 1 };
  } finally { fs.closeSync(fd); }
}

const STATE_WORDS = { QUEUED: 'waiting its turn', PLAN: 'planning', BUILD: 'building', FIX_PLAN: 'repairing', FIX_BUILD: 'repairing', CHECK_BUILD: 'checking the build', AUDIT: 'reviewing', VERIFY: 'verifying', CHECK_VERIFY: 'running the final checks' };
const sinceMin = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
/** What the driver is doing right now, from `state.json`: "building X, 12 min" — or null when nothing is in flight. */
export function activity(state) {
  const q = (state?.queue ?? []).find((x) => x.step) ?? (state?.queue ?? []).find((x) => STATE_WORDS[x.state] && x.state !== 'QUEUED');
  if (!q) return null;
  const words = STATE_WORDS[q.state] ?? 'working on';
  return `${words} ${shortLabel(q.label ?? q.id)}${q.step?.startedAt ? `, ${sinceMin(q.step.startedAt)} min` : ''}`;
}
/** One line on where a run is: what merged, what waits, what is in flight, what was spent. */
export function snapshotLine(state, { running }) {
  if (!state) return running ? 'Autopilot is starting: getting its copy of your project ready.' : 'No autopilot run has started here yet.';
  const n = (s) => (state.queue ?? []).filter((q) => q.state === s).length;
  const parts = [
    n('MERGED') && `${n('MERGED')} finished and merged`, n('PARKED') && `${n('PARKED')} stopped and waiting`, n('FAILED') && `${n('FAILED')} did not pass`,
    running && activity(state) && `now ${activity(state)}`, running && n('QUEUED') && `${n('QUEUED')} still to start`,
  ].filter(Boolean);
  const budget = state.runBudgetUsd == null ? '' : ` of $${state.runBudgetUsd}`;
  return `${running ? 'Autopilot is running' : 'The last autopilot run has ended'}: ${parts.join(', ') || (running ? 'just started' : 'nothing was built')}. Spent ${usd(state.spentUsd)}${budget}.`;
}

/** What the referee is for, one phrase per rule (the report's own names). */
export const RULES = {
  R0: 'referee error', R1: 'kill switch', R2: 'path jail', R3: 'git rule', R4: 'container, VM or global install', R5: 'disk floor or growth cap',
  R6: 'background task', R7: 'test edit without reason', R8: 'gate policy', R9: 'plan mode',
};
const hookRows = (file) => readFrom(file, 0).rows;
/**
 * What autopilot's rules got in the way of, over the given runs: every refused call grouped by
 * rule and reason, most frequent first. A parked question (rule R8) is not friction and is left out.
 */
export function friction(workspace, runs, { max = 10 } = {}) {
  const groups = new Map();
  for (const run of runs) {
    const state = tryJson(path.join(runDirOf(workspace, run), 'state.json'));
    for (const q of state?.queue ?? []) {
      for (const name of new Set([...(q.sessions ?? []).map((s) => s.name), ...(q.step ? [q.step.name] : [])])) {
        for (const h of hookRows(path.join(runDirOf(workspace, run), 'epics', q.id, name, 'hooks.jsonl'))) {
          if (h.hook !== 'PreToolUse' || h.decision !== 'deny') continue;
          const key = `${h.rule}\n${h.reason}`;
          const g = groups.get(key) ?? { rule: h.rule ?? null, what: RULES[h.rule] ?? null, reason: h.reason ?? null, count: 0 };
          g.count += 1; groups.set(key, g);
        }
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

/**
 * The Bash command a session has started and not finished, from its referee log: `{description,
 * command, startedAt, minutes, needsYou}`, or null. `needsYou`: the session marked it as waiting
 * for the owner (its description starts "Needs you:"). This is the only view anyone has inside a
 * step: seen live, a browser sign-in waited five minutes on an owner who was told nothing.
 */
export function openCommand(hooksFile) {
  const open = new Map();
  for (const h of readFrom(hooksFile, 0).rows) {
    if (h.tool_name !== 'Bash' || !h.tool_use_id) continue;
    if (h.hook === 'PreToolUse' && h.decision !== 'deny' && h.decision !== 'park' && h.decision !== 'remind') open.set(h.tool_use_id, h);
    else if (/^PostToolUse/.test(h.hook ?? '')) open.delete(h.tool_use_id);
  }
  const h = [...open.values()].at(-1);
  if (!h) return null;
  const description = typeof h.tool_input === 'object' && h.tool_input ? String(h.tool_input.description ?? '') : '';
  const needs = description.match(/^\s*needs you\s*[:—–-]\s*(.*)$/i);
  return { id: h.tool_use_id, description: needs ? needs[1].trim() : description.trim(), command: oneLine(commandOf(h), 160), startedAt: h.t ?? null, minutes: h.t ? sinceMin(h.t) : 0, needsYou: !!needs };
}

/** The command a Bash hook line ran, whether the log kept the input whole or clipped it to text. */
const commandOf = (h) => (typeof h.tool_input === 'string' ? h.tool_input : h.tool_input?.command ?? '');

/**
 * Follows one run and prints a line per thing worth saying. Read-only and long-running.
 *   first line   where the run is now (left out with `after`: the caller already knows)
 *   then         one `eventLine` per new event; `REFUSED …` the first and the third time the
 *                referee refuses the same thing; `TESTS passed|failed` when a session runs the
 *                project's test command; `NEEDS YOU: …` when the session starts a command that
 *                waits for the owner; one line for a command open `longMin` minutes; a heartbeat
 *                when nothing else was said for a while
 *   last line    `RUN ENDED: <why>`, once the run has ended or the driver is gone
 * `once`: return after the first thing said, or after `onceMin` minutes (a session without the
 * Monitor tool runs this in a loop, passing the returned `after` back in).
 * Resolves with `{ ended, after }`: whether the run ended, and how many events have been said.
 */
export async function watch({ workspace, run = null, heartbeatMin = 10, longMin = 3, once = false, onceMin = 10, replay = false, after = null, pollMs = 2000, graceMs = 15000, out = (line) => process.stdout.write(`${line}\n`) }) {
  const started = Date.now();
  // A driver that was just launched has not made its run directory or state yet, and until it has, the latest run
  // on disk is the one before it. Wait for the driver to say which run is its own before reading anything.
  let name = run ?? latestRun(workspace);
  const settled = () => {
    const st = name ? tryJson(path.join(runDirOf(workspace, name), 'state.json')) : null;
    if (!driverPid(workspace)) return !!st || Date.now() - started >= graceMs;
    if (!name) return false; // the driver is alive and has no run yet: it will, or it will go
    return !!run || !st || st.status === 'running' || Date.now() - started >= graceMs;
  };
  while (!settled()) { await sleep(Math.min(pollMs, 250)); name = run ?? latestRun(workspace); }
  if (!name) { out(snapshotLine(null, { running: false })); out('RUN ENDED: no run to watch.'); return { ended: true, after: 0 }; }
  const runDir = runDirOf(workspace, name);
  const stateFile = path.join(runDir, 'state.json'); const eventsFile = path.join(runDir, 'events.jsonl');
  const isLive = () => !!driverPid(workspace) && (latestRun(workspace) === name || !tryJson(stateFile));

  let said = 0; let lastSaid = Date.now(); let seen = 0; let offset = 0; let ended = false;
  const say = (line, { quiet = false } = {}) => { out(line); lastSaid = Date.now(); if (!quiet) said += 1; };
  const state0 = tryJson(stateFile);
  if (after === null) say(snapshotLine(state0, { running: isLive() }), { quiet: true });
  // Events already there: said again with `replay`, skipped up to `after`, otherwise taken as known (the first line covers them).
  const skip = replay ? 0 : after === null ? readFrom(eventsFile, 0).rows.length : Number(after) || 0;
  const events = () => {
    const r = readFrom(eventsFile, offset); offset = r.offset;
    for (const row of r.rows) {
      seen += 1;
      if (seen <= skip) continue;
      const line = eventLine(row);
      if (line) say(line);
      if (row.type === 'run-end') ended = true;
    }
  };
  // The referee's log of the step in flight: a watch that joins mid-step starts at its end; a step that starts later is read whole.
  const hookOffsets = new Map();
  const hookFile = (state) => { const q = (state?.queue ?? []).find((x) => x.step); return q ? path.join(runDir, 'epics', q.id, q.step.name, 'hooks.jsonl') : null; };
  if (!replay && hookFile(state0)) { try { hookOffsets.set(hookFile(state0), fs.statSync(hookFile(state0)).size); } catch { /* not written yet */ } }
  const refusals = new Map();
  const flagged = new Set(); // commands already said to be waiting

  for (;;) {
    const live = isLive();
    events();
    const state = tryJson(stateFile);
    const hf = hookFile(state);
    if (hf && !ended) {
      const r = readFrom(hf, hookOffsets.get(hf) ?? 0); hookOffsets.set(hf, r.offset);
      const testCommand = String(state?.testCommand ?? '').trim();
      for (const h of r.rows) {
        if (h.hook === 'PreToolUse' && h.decision === 'deny') {
          const key = `${h.rule}\n${h.reason}`; const n = (refusals.get(key) ?? 0) + 1; refusals.set(key, n);
          if (n === 1) say(`REFUSED (${RULES[h.rule] ?? h.rule ?? 'rule'}): ${oneLine(h.reason, 240)}`);
          else if (n === 3) say(`REFUSED 3 times (${RULES[h.rule] ?? h.rule ?? 'rule'}): ${oneLine(h.reason, 240)}`);
        } else if (testCommand && h.tool_name === 'Bash' && /^PostToolUse/.test(h.hook ?? '')) {
          const cmd = commandOf(h); const at = cmd.indexOf(testCommand);
          // A result piped into another command (`| tail`) says nothing about the tests: stay silent rather than guess.
          if (at >= 0 && !/^[^&;]*\|(?!\|)/.test(cmd.slice(at + testCommand.length))) say(h.hook === 'PostToolUse' ? 'TESTS passed' : 'TESTS failed');
        }
      }
    }
    // Inside the step: a command that waits for the owner is said at once; any command open for `longMin` minutes is said once.
    const cmd = hf && !ended ? openCommand(hf) : null;
    if (cmd?.needsYou && !flagged.has(cmd.id)) { flagged.add(cmd.id); say(`NEEDS YOU: ${oneLine(cmd.description, 200) || 'a step is waiting for you at this computer'}`); }
    else if (cmd && !flagged.has(cmd.id) && cmd.startedAt && Date.now() - Date.parse(cmd.startedAt) >= longMin * 60000) { flagged.add(cmd.id); say(`One command has been running for ${cmd.minutes} min${cmd.description ? `: "${oneLine(cmd.description, 120)}"` : ''}`); }
    if (ended) { for (let waited = 0; driverPid(workspace) && waited < 5000; waited += 100) await sleep(100); break; } // the report is written; let the driver let go
    if (!live) {
      const last = tryJson(stateFile);
      if (!last && Date.now() - started < graceMs) { await sleep(Math.min(pollMs, 250)); continue; }
      // One more read: the driver may have written its last events between the two looks above.
      events();
      if (!ended) say(last && last.status !== 'running' ? `RUN ENDED: ${plainEnd(last.stoppedBecause)}. Spent ${usd(last.spentUsd)}.` : 'RUN ENDED: the driver is no longer running and left the run unfinished.');
      ended = true; break;
    }
    if (once && (said > 0 || Date.now() - started >= onceMin * 60000)) break;
    if (Date.now() - lastSaid >= heartbeatMin * 60000) say(`still ${activity(state) ?? 'working'}`, { quiet: true });
    await sleep(pollMs);
  }
  if (once && !ended) out(`(next: --after ${seen})`);
  return { ended, after: seen };
}
