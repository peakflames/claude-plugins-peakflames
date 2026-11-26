// Autopilot, attended: what a session that stays with a run reads. `eventLine` turns one line of
// `runs/<run>/events.jsonl` into a sentence a non-developer can read; `watch` follows a run and
// prints one line per thing worth saying (built for the Monitor tool: one stdout line is one
// notification); `friction` counts what the referee refused. Everything here only reads files:
// the driver alone decides what runs, and nothing in this file changes a run.
import fs from 'node:fs';
import path from 'node:path';
import { ANSWERS, LEAVE_IT, TRY_AGAIN, atLimit, gateReason, isProvisional } from './lib.mjs';

const tryJson = (p, fallback = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const usd = (n) => `$${Number(n ?? 0).toFixed(2)}`;
/** A clock time, with the day when it is not today. */
const clock = (iso) => { const d = new Date(iso); const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === new Date().toDateString() ? t : `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${t}`; };
const took = (minutes) => (minutes >= 1 ? `${Math.round(minutes)} min` : 'under a minute');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const oneLine = (s, max = 300) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

/** `<id> — <Name>` from the driver's `<id> (<slug>) — <Name>`: the short form a status line can carry. */
export const shortLabel = (label) => String(label ?? '').replace(/^(\S+) \([^)]*\) — /, '$1 — ');

/** What each kind of session is doing, in plain words: [doing, done]. */
const STEP_WORDS = {
  plan: ['Planning', 'Plan'], build: ['Building', 'Build'], fix: ['Repairing', 'Repair'],
  audit: ['Reviewing', 'Review'], verify: ['Verifying', 'Verification'], catchup: ['Bringing up to date with the other finished work', 'Catch-up'],
};
/** What follows a step that finished, so every line says where the run goes from here. The chat is the one display every device has. */
const NEXT = { plan: 'the build', build: "autopilot's own checks, then an independent review", fix: "autopilot's own checks, then an independent review", verify: 'checks on the merged result', catchup: 'the rest of the epic, on the answer already given' };
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
    [/^usage limit/, 'your Claude usage limit was reached'],
    [/STOP file/, 'you asked it to stop'],
    [/run stopped \(end time\)/, 'the run reached its end time'],
    [/run stopped \(run budget\)/, 'the run reached its spending limit'],
    [/disk floor/, 'the disk is nearly full'],
    [/growth cap/, 'the work grew far larger on disk than expected'],
    [/hit wall clock/, 'a step reached its time limit'],
    [/^budget:/, 'a step reached its limit'],
    [/^infra error/, 'a technical error stopped a step'],
    [/^setup failed/, "autopilot could not get its private copy of your project ready"],
    [/^auditor: .*(could not start|no usable result)/, 'the independent reviewer could not run'],
    [/^auditor:/, 'the independent reviewer found a serious problem'],
    [/deferral/, 'the build left part of a requirement undone'],
    [/CHECK_BUILD still fails/, "autopilot's checks on the build still fail after the repair"],
    [/CHECK_BUILD/, "autopilot's own checks on the build did not pass"],
    [/merge gate failed/, "autopilot's checks on the merge failed, so the merge was undone"],
    [/kept work could not be merged again/, "the final check's kept work could not be merged again"],
    [/did not merge it/, 'it was verified but not merged'],
    [/did not bring it up to date|does not merge cleanly|could not be brought up to date/, 'its work no longer fits on top of the other finished work'],
    [/moved since the gate was written/, 'someone changed its branch after the answer was given'],
    [/no longer exists in the clone|private clone is gone|has appeared since the gate was written/, 'there is nothing left to continue it from'],
    [/ended without a verdict/, 'the final check ended before it judged anything'],
    [/already done and recorded/, 'the final check asked for a check you had already done'],
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

/**
 * The one plain question for a technical stop autopilot may not answer itself any more (`atLimit`
 * in lib.mjs), asked in place of the gate's own: try again, or leave it. Null for any other gate.
 * Autopilot picks how to try again; the owner is not asked a technical question.
 */
export function atLimitAsk(gate, gates, n, label) {
  const lim = atLimit(gate, gates, n);
  if (!lim) return null;
  const who = [lim.standing ? `autopilot answered ${lim.standing}` : '', lim.owner ? `you answered ${lim.owner}` : ''].filter(Boolean).join(', ');
  const stopped = lim.stops === 1 ? `has stopped 1 time for technical reasons (${plainReason(gateReason(gate))})` : `has stopped ${lim.stops} times for technical reasons (${who}). This time: ${plainReason(gateReason(gate))}`;
  return { question: `${label ?? gate.epic} ${stopped}. ${lim.answer === ANSWERS.startOver ? 'Its one repair is used, so trying again means planning and building it again from the start, which costs the most. Try again, or leave it for now?' : 'Try again, which costs more, or leave it for now?'}`, options: [TRY_AGAIN, LEAVE_IT], ...lim };
}

/** Reviewer findings that say the work was not exercised for real, whatever their severity. */
export const UNPROVEN_CATEGORIES = ['never-ran-real', 'stand-in', 'cannot-fail'];
/**
 * What a verifier's final report says it did not run or could not prove for real: the bullets under
 * a "Not proven for real" heading, and any "Not run: …" line. Pure. The report is the session's own
 * account, so this is quoted to the owner as the verifier's words, never as a finding of autopilot's.
 */
export function unprovenLines(text) {
  const out = []; let under = false; let top = null; // `top`: the indent of the section's points; deeper ones belong to the point above
  const clean = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const indent = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
    if (/^(#+\s*|\*\*)?not proven for real\b[^\n]{0,6}$/i.test(line.replace(/\*\*\s*$/, ''))) { under = true; continue; }
    const notRun = clean(line).match(/^not run\s*[:—–-]\s*(.+)$/i);
    if (notRun) { out.push(notRun[1].trim()); continue; }
    if (!under) continue;
    if (/^(#+\s|\*\*[^*]+\*\*:?\s*$)/.test(line)) { under = false; continue; } // the next heading ends the section
    if (!/^(?:[-*•]|\d+[.)])\s+\S/.test(line) || /^[-*•]?\s*(none|nothing)\b/i.test(clean(line))) continue;
    // A sub-point is part of the point above it (seen live: "What it was checked against instead:" and its three
    // sub-points were each written into the project as a note of their own).
    if (top !== null && indent > top && out.length) { out[out.length - 1] = `${out.at(-1)} ${clean(line)}`; continue; }
    top = indent;
    out.push(clean(line));
  }
  return [...new Set(out)].map((t) => oneLine(t, 700));
}

/**
 * What the verifier says it saw wrong and left as it was: the points under a "Seen but not fixed" heading. A defect
 * it noticed (wrong text in a picture, a console error) otherwise reaches nobody (Pilot Light, 2026-11-22: the epic
 * merged with it). Pure; "none" and "nothing" are no entries.
 */
const LEFT_HEADING = (line) => /^(#+\s*|\*\*)?seen but not fixed\b(?!\s*yet\b)[^\n]{0,6}$/i.test(line.replace(/\*\*\s*$/, ''));
/** Whether a verify report has the "Seen but not fixed" heading at all (its list may be "none"). */
export const saysLeft = (text) => String(text ?? '').split(/\r?\n/).some((l) => LEFT_HEADING(l.trim()));
export function leftLines(text) {
  const out = []; let under = false;
  const clean = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (LEFT_HEADING(line)) { under = true; continue; }
    if (!under) continue;
    if (/^(#+\s|\*\*[^*]+\*\*:?\s*$)/.test(line)) { under = false; continue; }
    if (!/^(?:[-*•]|\d+[.)])\s+\S/.test(line)) { if (line && out.length && /^\s/.test(raw)) out[out.length - 1] = `${out.at(-1)} ${clean(line)}`; continue; }
    if (/^(none|nothing)\b/i.test(clean(line))) continue;
    if (/^\s{2,}/.test(raw) && out.length) { out[out.length - 1] = `${out.at(-1)} ${clean(line)}`; continue; }
    out.push(clean(line));
  }
  return [...new Set(out)].map((t) => oneLine(t, 700));
}

/**
 * What a verifier's final report says it saw in the pictures of an epic with screens: the bullets
 * under a "What the pictures show" heading. Pure, and quoted to the owner as the verifier's words.
 */
export function pictureLines(text) {
  const out = []; let under = false;
  const clean = (l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(#+\s*|\*\*)?what the pictures show\b[^\n]{0,6}$/i.test(line.replace(/\*\*\s*$/, ''))) { under = true; continue; }
    if (!under) continue;
    if (/^(#+\s|\*\*[^*]+\*\*:?\s*$)/.test(line)) { under = false; continue; }
    if (/^(?:[-*•]|\d+[.)])\s+\S/.test(line)) out.push(clean(line));
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
    case 'run-start': return ev.resuming ? 'Autopilot picked the run back up.' : `Autopilot started: ${plural((ev.queue ?? []).length, 'epic')} queued${isProvisional(ev.mode) ? ', as a provisional run: it keeps building and lists what it decided for you at the end' : ''}.`;
    case 'epic-start': { const at = ev.pos && ev.of > 1 ? `${ev.pos} of ${ev.of}: ` : ''; return ev.resumedAt ? `Continuing ${at}${who} from where it stopped` : `Starting ${at}${who}`; }
    case 'step-start': return ev.continuing ? `Picking ${who} back up where it stopped (${doing.toLowerCase()}); nothing is started over` : `${doing} ${who}`;
    case 'step-end': {
      const cost = ev.costUsd ? ` (${usd(ev.costUsd)}${ev.estimated ? ', estimated' : ''})` : '';
      if (ev.outcome === 'ok' && ev.asked) return `${done} stopped to ask you something after ${took(ev.minutes)}${cost}`;
      if (ev.outcome === 'ok') return `${done} finished in ${took(ev.minutes)}${cost}${NEXT[ev.kind] ? `. Next: ${NEXT[ev.kind]}` : ''}`;
      if (ev.outcome === 'stopped') return `${done} stopped, as you asked, after ${took(ev.minutes)}${cost}`;
      if (ev.outcome === 'limit') return `${done} stopped after ${took(ev.minutes)}${cost}: your usage limit was reached`;
      if (ev.outcome === 'budget') return `${done} stopped at its ${/wall clock/.test(ev.why ?? '') ? 'time' : /disk|growth/.test(ev.why ?? '') ? 'disk' : 'spending'} limit after ${took(ev.minutes)}${cost}`;
      return `${done} stopped on a technical error after ${took(ev.minutes)}${cost}`;
    }
    case 'limit-wait': return `Paused: your ${ev.words ? `${ev.words} ` : ''}usage limit was reached. ${ev.resets ? `It resets at ${clock(ev.resets)}; autopilot carries on then.` : `Autopilot tries again at ${clock(ev.until)}.`}`;
    case 'limit-resume': return 'Your usage limit has reset; autopilot is carrying on.';
    case 'check': {
      const what = ev.name === 'verify' ? 'Final checks after the merge' : "Autopilot's checks on the build";
      if (ev.pass) return `${what} passed`;
      return `${what} found a problem: ${(ev.failed ?? []).map((n) => CHECK_WORDS[n] ?? n).join('; ') || 'see the report'}`;
    }
    case 'base-retried': return "Your project's own tests failed once before the work began and passed when run again: a flaky test. Going on";
    case 'fix-round': return `${who} needs a repair: starting the one repair round`;
    case 'audit': if (ev.thin && !ev.parks) return `The independent reviewer barely looked: it read ${ev.read ?? '?'} of ${ev.of ?? '?'} changed code files`;
      return ev.parks ? `The independent reviewer found ${plural(ev.parks, 'serious problem')}` : ev.findings ? `The independent reviewer found ${plural(ev.findings, 'thing')} to note, none serious` : 'The independent reviewer found nothing';
    case 'merged': return `Finished and merged: ${who} (${took(ev.minutes)}, ${usd(ev.costUsd)})${ev.unproven ? ` — ${plural(ev.unproven, 'thing')} not proven for real` : ''}${ev.left ? ` — ${plural(ev.left, 'thing')} seen wrong and left as is` : ''}${ev.deferred ? ` — ${plural(ev.deferred, 'requirement')} left for a later epic` : ''}`;
    case 'parked':
      if (ev.question && ev.kind !== 'resume') return `Waiting for you: ${who} — ${oneLine(ev.question)}`;
      return `Stopped: ${who} — ${plainReason(ev.reason)}`;
    case 'failed': return `Did not pass: ${who} — ${plainReason(ev.reason)}`;
    case 'blocked': return `Not started: ${who} — ${plainReason(ev.reason)}`;
    // A provisional run went on where a full run would have asked: said as it happens, and listed again at the end.
    case 'thin-review': return `The independent reviewer is reviewing ${who} again: it read ${ev.read ?? '?'} of ${ev.of ?? '?'} changed code files`;
    case 'prototype-answer':
      if (ev.kind === 'thin-review') return `Went on to the final check after a thin independent review of ${who} for you (provisional run)`;
      if (ev.kind === 'amendment') return `Took the planner's correction to ${ev.tor ?? 'a requirement'} for you (provisional run)`;
      return `Took the builder's recommendation for ${ev.tor ?? 'a requirement'} for you: ${/^\W*defer\b/i.test(ev.answer ?? '') ? 'left for a later epic' : 'fix it now'} (provisional run)`;
    case 'prototype-skip': {
      const parts = [(ev.unobserved ?? []).length ? `${ev.unobserved.join(', ')} will be recorded as not observed` : null, ev.pictures ? `${plural(ev.pictures, 'picture')} kept` : null, ev.claudeMd ? 'the change to the project\'s instructions file kept' : null].filter(Boolean);
      return `Not stopping ${who} for your look (provisional run)${parts.length ? `: ${parts.join('; ')}` : ''}`;
    }
    case 'run-end': return `RUN ENDED: ${plainEnd(ev.why)}. Spent ${usd(ev.spentUsd)}.`;
    default: return null;
  }
}

/**
 * Where the whole run stands, said after each epic ends: how many are merged, waiting for the
 * owner, failed or not started, and how many are still to go. `outcomes` maps an epic to the
 * last of `merged`, `parked`, `failed`, `blocked` said about it; `total` is the queue's length.
 */
export function progressLine(outcomes, total) {
  const n = (t) => [...outcomes.values()].filter((v) => v === t).length;
  const left = Math.max(0, total - outcomes.size);
  const parts = [n('merged') && `${n('merged')} merged`, n('parked') && `${n('parked')} waiting for you`, n('failed') && `${n('failed')} did not pass`, n('blocked') && `${n('blocked')} not started`, `${left} still to go`].filter(Boolean);
  return `Progress: ${parts.join(', ')} (${plural(total, 'epic')} in this run)`;
}

/**
 * The piece of work a run belongs to: the runs chained by `continues` (a relaunch after a stop or an
 * answer), the queue the owner confirmed when the first of them was launched, the budget they set
 * then, and what the earlier runs spent. Reads only.
 */
export function chainOf(workspace, run) {
  const dir = (name) => path.join(workspace, 'runs', name);
  const runs = [];
  for (let name = run; name && !runs.includes(name) && runs.length < 50; name = tryJson(path.join(dir(name), 'config.json'))?.continues ?? null) {
    if (!fs.existsSync(dir(name))) break;
    runs.unshift(name);
  }
  const state = (name) => tryJson(path.join(dir(name), 'state.json')) ?? {};
  const first = runs[0] ? state(runs[0]) : {}; const cfg = runs[0] ? tryJson(path.join(dir(runs[0]), 'config.json')) ?? {} : {};
  const queue = Array.isArray(cfg.queue) && cfg.queue.length ? cfg.queue : (first.queue ?? []).map((q) => q.id);
  const spentBefore = +runs.slice(0, -1).reduce((sum, name) => sum + (state(name).spentUsd ?? 0), 0).toFixed(4);
  /** Each queued epic's latest state anywhere in the chain (a later run's word wins). */
  const states = () => { const m = new Map(queue.map((id) => [id, 'QUEUED'])); for (const name of runs) for (const q of state(name).queue ?? []) if (m.has(q.id)) m.set(q.id, q.state); return m; };
  // The budget set when the chain began; a higher one the owner has since set for the project replaces it (as `status` does).
  const begun = cfg.runBudgetUsd ?? first.runBudgetUsd ?? null;
  const project = cfg.project ? Number(tryJson(path.join(cfg.project, '.claude', 'peak-workflow', 'autopilot.json'))?.runBudgetUsd) || 0 : 0;
  return { runs, queue, runBudgetUsd: begun == null ? null : Math.max(begun, project), spentBefore, states };
}

/**
 * Where the whole queue stands, counted over the queue the owner confirmed and across every
 * relaunch: "Progress: 2 of 4 done (50%); 1 waiting for you; 1 still to go". The percentage counts
 * epics, not effort.
 */
export function queueLine(states) {
  const all = [...states.values()]; const n = (s) => all.filter((v) => v === s).length;
  const done = n('MERGED'); const left = all.length - done - n('PARKED') - n('FAILED') - n('BLOCKED') - n('SKIPPED');
  const parts = [`${done} of ${all.length} done (${Math.round((done / all.length) * 100)}%)`, n('PARKED') && `${n('PARKED')} waiting for you`, n('FAILED') && `${n('FAILED')} did not pass`, (n('BLOCKED') + n('SKIPPED')) && `${n('BLOCKED') + n('SKIPPED')} not started`, left > 0 && `${left} still to go`].filter(Boolean);
  return `Progress: ${parts.join('; ')}`;
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
  if (state?.limitWait) return `waiting for your usage limit to reset (it carries on at ${clock(state.limitWait.until)})`;
  const q = (state?.queue ?? []).find((x) => x.step) ?? (state?.queue ?? []).find((x) => STATE_WORDS[x.state] && x.state !== 'QUEUED');
  if (!q) return null;
  const words = STATE_WORDS[q.state] ?? 'working on';
  return `${words} ${shortLabel(q.label ?? q.id)}${q.step?.startedAt ? `, ${sinceMin(q.step.startedAt)} min` : ''}`;
}
/** One line on where a run is: what merged, what waits, what is in flight, what was spent. */
export function snapshotLine(state, { running, spentUsd = state?.spentUsd, runBudgetUsd = state?.runBudgetUsd }) {
  if (!state) return running ? 'Autopilot is starting: getting its copy of your project ready.' : 'No autopilot run has started here yet.';
  const n = (s) => (state.queue ?? []).filter((q) => q.state === s).length;
  const parts = [
    n('MERGED') && `${n('MERGED')} finished and merged`, n('PARKED') && `${n('PARKED')} stopped and waiting`, n('FAILED') && `${n('FAILED')} did not pass`,
    running && activity(state) && `now ${activity(state)}`, running && n('QUEUED') && `${n('QUEUED')} still to start`,
  ].filter(Boolean);
  const budget = runBudgetUsd == null ? '' : ` of $${runBudgetUsd}`; // runs chained by `continues` are one piece of work: the caller passes their sum
  return `${running ? 'Autopilot is running' : 'The last autopilot run has ended'}: ${parts.join(', ') || (running ? 'just started' : 'nothing was built')}. Spent ${usd(spentUsd)}${budget}.`;
}

/** What the referee is for, one phrase per rule (the report's own names). */
export const RULES = {
  R0: 'referee error', R1: 'kill switch', R2: 'path jail', R3: 'git rule', R4: 'container, VM or global install', R5: 'disk floor or growth cap',
  R6: 'background task', R7: 'test edit without reason', R8: 'gate policy', R9: 'plan mode',
  R10: 'catch-up rule', R11: 'connector rule',
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

/**
 * The commands of one step that asked the owner to come (`Needs you: …`) and ended without
 * success: `[{ description, command, minutes }]`. The driver tells later sessions of the epic.
 */
export function unansweredNeeds(hooksFile) {
  const asked = new Map(); const out = [];
  for (const h of readFrom(hooksFile, 0).rows) {
    if (h.tool_name !== 'Bash' || !h.tool_use_id) continue;
    if (h.hook === 'PreToolUse') {
      const needs = (typeof h.tool_input === 'object' && h.tool_input ? String(h.tool_input.description ?? '') : '').match(/^\s*needs you\s*[:—–-]\s*(.*)$/i);
      if (needs && !['deny', 'park', 'remind'].includes(h.decision)) asked.set(h.tool_use_id, { description: oneLine(needs[1].trim(), 200), command: oneLine(commandOf(h), 160), startedAt: h.t ?? null });
    } else if (/^PostToolUse/.test(h.hook ?? '') && asked.has(h.tool_use_id)) {
      const a = asked.get(h.tool_use_id); asked.delete(h.tool_use_id);
      if (h.hook !== 'PostToolUse') out.push({ description: a.description, command: a.command, minutes: a.startedAt && h.t ? Math.max(0, Math.round((Date.parse(h.t) - Date.parse(a.startedAt)) / 60000)) : null });
    }
  }
  return out;
}

/** The command a Bash hook line ran, whether the log kept the input whole or clipped it to text. */
const commandOf = (h) => (typeof h.tool_input === 'string' ? h.tool_input : h.tool_input?.command ?? '');

/**
 * Whether a Bash command's exit says how the project's tests went: the test command is there as
 * a command of its own (`build.py test`, not `build.py test-live`) and is the last thing run, so
 * the exit is its own. Anything piped on or chained after it says nothing about the tests. Seen
 * live: a command that only named `test-live` died on a shell typo and was reported as failed tests.
 */
export function testsOutcomeKnown(command, testCommand) {
  const cmd = String(command ?? ''); const test = String(testCommand ?? '').trim();
  if (!test) return false;
  for (let at = cmd.indexOf(test); at >= 0; at = cmd.indexOf(test, at + 1)) {
    const before = cmd.slice(0, at); const after = cmd.slice(at + test.length).replace(/\d*>>?\s*&?\s*[^\s|;&]+/g, ' ');
    if ((before === '' || /[\s;&|(]$/.test(before)) && !/^[\w-]/.test(after) && !/[|;&\n]/.test(after.trim())) return true;
  }
  return false;
}
/** A hook line's error text, in one line (a failed Bash call carries what it printed). */
const errorOf = (h) => oneLine(typeof h.error === 'string' ? h.error : h.error ? JSON.stringify(h.error) : '', 160);

/**
 * Follows one run and prints a line per thing worth saying. Read-only and long-running.
 *   first line   where the run is now (left out with `after`: the caller already knows)
 *   then         one `eventLine` per new event, and a `Progress: …` line after each epic ends
 *                (runs of more than one epic); `REFUSED 3 times …` when the referee refuses the
 *                same thing a third time; with `routine`, also the first `REFUSED …` and
 *                `TESTS passed|failed` when a session runs the project's test command (an
 *                attending session is not woken for those); `NEEDS YOU: …` when the session starts a command that
 *                waits for the owner, and `NO LONGER NEEDS YOU: …` when that command ends (done,
 *                or given up); one line for a command open `longMin` minutes; a heartbeat
 *                when nothing else was said for a while
 *   last line    `RUN ENDED: <why>`, once the run has ended or the driver is gone
 * `once`: return after the first thing said, or after `onceMin` minutes (a session without the
 * Monitor tool runs this in a loop, passing the returned `after` back in).
 * Resolves with `{ ended, after }`: whether the run ended, and how many events have been said.
 */
export async function watch({ workspace, run = null, heartbeatMin = 10, longMin = 3, routine = false, once = false, onceMin = 10, replay = false, after = null, pollMs = 2000, graceMs = 15000, out = (line) => process.stdout.write(`${line}\n`) }) {
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
  // One piece of work, however many relaunches: the queue the owner confirmed, their budget, and one spend figure.
  const chain = chainOf(workspace, name);
  const spent = (runUsd) => `${usd(chain.spentBefore + (runUsd ?? 0))}${chain.runBudgetUsd == null ? '' : ` of $${chain.runBudgetUsd}`}`;
  if (after === null) say(snapshotLine(state0, { running: isLive(), ...(state0 ? { spentUsd: chain.spentBefore + (state0.spentUsd ?? 0), runBudgetUsd: chain.runBudgetUsd } : {}) }), { quiet: true });
  // Events already there: said again with `replay`, skipped up to `after`, otherwise taken as known (the first line covers them).
  const skip = replay ? 0 : after === null ? readFrom(eventsFile, 0).rows.length : Number(after) || 0;
  const outcomes = new Map(); let total = 0; let lastProgress = null; // how each epic of the run ended so far, for the progress line
  const events = () => {
    const r = readFrom(eventsFile, offset); offset = r.offset;
    for (const row of r.rows) {
      seen += 1;
      if (row.type === 'run-start') total = (row.queue ?? []).length;
      const ends = ['merged', 'parked', 'failed', 'blocked'].includes(row.type) && row.epic;
      if (ends) outcomes.set(row.epic, row.type);
      if (seen <= skip) continue;
      const pos = row.type === 'epic-start' ? chain.queue.indexOf(row.epic) + 1 : 0;
      const line = row.type === 'run-end' ? `RUN ENDED: ${plainEnd(row.why)}. Spent ${spent(row.spentUsd)}.` : eventLine(pos ? { ...row, pos, of: chain.queue.length } : row);
      if (line) say(line);
      // Said again only when it reads differently: epics blocked together end in a burst, and state.json gives them one line.
      const progress = ends && chain.queue.length > 1 ? queueLine(chain.states()) : ends && total > 1 ? progressLine(outcomes, total) : null;
      if (progress && progress !== lastProgress) { lastProgress = progress; say(progress, { quiet: true }); }
      if (row.type === 'run-end') ended = true;
    }
  };
  // The referee's log of the step in flight: a watch that joins mid-step starts at its end; a step that starts later is read whole.
  const hookOffsets = new Map();
  const hookFile = (state) => { const q = (state?.queue ?? []).find((x) => x.step); return q ? path.join(runDir, 'epics', q.id, q.step.name, 'hooks.jsonl') : null; };
  if (!replay && hookFile(state0)) { try { hookOffsets.set(hookFile(state0), fs.statSync(hookFile(state0)).size); } catch { /* not written yet */ } }
  const refusals = new Map();
  const flagged = new Set(); // commands already said to be waiting
  const waiting = new Map(); // commands said to need the owner, until they end: tool_use_id → what was said

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
          // One refusal is routine (the session reads the reason and carries on): it is on the closing screen's list.
          if (n === 1 && routine) say(`REFUSED (${RULES[h.rule] ?? h.rule ?? 'rule'}): ${oneLine(h.reason, 240)}`);
          else if (n === 3) say(`REFUSED 3 times (${RULES[h.rule] ?? h.rule ?? 'rule'}): ${oneLine(h.reason, 240)}`);
        } else if (h.tool_name === 'Bash' && /^PostToolUse/.test(h.hook ?? '')) {
          // A command the owner was told to come for has ended: say how, so nobody goes looking for it.
          const w = waiting.get(h.tool_use_id);
          if (w) {
            waiting.delete(h.tool_use_id);
            const min = w.startedAt && h.t ? Math.max(0, Math.round((Date.parse(h.t) - Date.parse(w.startedAt)) / 60000)) : null;
            const took = min === null ? '' : ` after ${min} min`;
            if (h.hook === 'PostToolUse') say(`NO LONGER NEEDS YOU: done${took} — ${w.description}`);
            else say(`NO LONGER NEEDS YOU: it gave up${took} without that being done — ${w.description}${errorOf(h) ? ` (${errorOf(h)})` : ''}`);
          }
          // Only an exit that is the test command's own says how the tests went: otherwise stay silent rather than guess.
          if (routine && testsOutcomeKnown(commandOf(h), testCommand)) say(h.hook === 'PostToolUse' ? 'TESTS passed' : 'TESTS failed');
        }
      }
    }
    // Inside the step: a command that waits for the owner is said at once; any command open for `longMin` minutes is said once.
    const cmd = hf && !ended ? openCommand(hf) : null;
    if (cmd?.needsYou && !flagged.has(cmd.id)) {
      const description = oneLine(cmd.description, 200) || 'a step is waiting for you at this computer';
      flagged.add(cmd.id); waiting.set(cmd.id, { description, startedAt: cmd.startedAt });
      say(`NEEDS YOU: ${description}`);
    }
    else if (cmd && !flagged.has(cmd.id) && cmd.startedAt && Date.now() - Date.parse(cmd.startedAt) >= longMin * 60000) { flagged.add(cmd.id); say(`One command has been running for ${cmd.minutes} min${cmd.description ? `: "${oneLine(cmd.description, 120)}"` : ''}`); }
    if (ended) { for (let waited = 0; driverPid(workspace) && waited < 5000; waited += 100) await sleep(100); break; } // the report is written; let the driver let go
    if (!live) {
      const last = tryJson(stateFile);
      if (!last && Date.now() - started < graceMs) { await sleep(Math.min(pollMs, 250)); continue; }
      // One more read: the driver may have written its last events between the two looks above.
      events();
      if (!ended) say(last && last.status !== 'running' ? `RUN ENDED: ${plainEnd(last.stoppedBecause)}. Spent ${spent(last.spentUsd)}.` : 'RUN ENDED: the driver is no longer running and left the run unfinished.');
      ended = true; break;
    }
    if (once && (said > 0 || Date.now() - started >= onceMin * 60000)) break;
    if (Date.now() - lastSaid >= heartbeatMin * 60000) say(`still ${activity(state) ?? 'working'}`, { quiet: true });
    await sleep(pollMs);
  }
  if (once && !ended) out(`(next: --after ${seen})`);
  return { ended, after: seen };
}
