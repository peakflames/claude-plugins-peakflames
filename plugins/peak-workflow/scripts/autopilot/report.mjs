// Autopilot morning report (autopilot-poc-plan.md §6.9). `collectReport` reads a run directory
// and returns the data written as report.json; `renderReport` turns that data into report.md.
// Both are pure with respect to the run: they read files and never touch the clone.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RULES, atLimitAsk, chainOf } from './attend.mjs';
import { connectorLine, connectorUse, gateEntry, isProvisional, mergeConnectorUse } from './lib.mjs';

const TERMINAL = new Set(['MERGED', 'PARKED', 'FAILED', 'SKIPPED', 'BLOCKED']);

const readJson = (p, fallback = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const readLines = (p) => {
  try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
};
/**
 * What an epic's sessions did with the owner's connectors (#43): the calls by tool, the refused ones, and the pages a
 * browser call ended on, local and off-site. `sessions` are the epic's step names.
 */
export function epicConnectorUse(epicDir, sessions) {
  return mergeConnectorUse(sessions.map((name) => connectorUse(readLines(path.join(epicDir, name, 'hooks.jsonl')))));
}
const usd = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const mins = (ms) => `${Math.round((ms ?? 0) / 60000)} m`;
const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function stamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * `runDir` is `<workspace>/runs/<run>`. The report is per run; gates and the clone belong to the
 * workspace, and every path in the report is relative to the workspace.
 */
/** "the machine slept N min during the check", when a try of the base check slept 30 s or more (#41 B10); else null. */
function sleptWords(tries = []) {
  const sec = Math.max(0, ...(tries ?? []).map((x) => x.sleptSec ?? 0));
  return sec >= 30 ? `the machine slept ${Math.max(1, Math.round(sec / 60))} min during the check` : null;
}

export function collectReport(runDir) {
  const s = readJson(path.join(runDir, 'state.json'));
  if (!s) throw new Error(`${path.join(runDir, 'state.json')} is missing or unreadable: no run to report`);
  const workspace = path.resolve(runDir, '..', '..'); const runName = path.basename(runDir);
  const config = { ...readJson(path.join(workspace, 'settings.json'), {}), ...readJson(path.join(runDir, 'config.json'), {}) };
  const clone = path.join(workspace, 'clone');
  const queued = new Set((s.queue ?? []).map((q) => q.id));
  const live = (g) => !g.decided?.used && !g.void && !g.superseded && !g.cleared;

  // This run's gates: the ones it wrote, the ones from an earlier run it used or voided, and any
  // still waiting on the owner for an epic in this run's queue.
  const gateDir = path.join(workspace, 'gates');
  const everyGate = (fs.existsSync(gateDir) ? fs.readdirSync(gateDir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [])
    .map((file) => ({ file, g: readJson(path.join(gateDir, file)) }));
  const labelOf = (id) => (s.queue ?? []).find((q) => q.id === id)?.label ?? id;
  const gates = everyGate.filter(({ g }) => g && ((g.run ?? runName) === runName || g.decided?.used?.run === runName || g.void?.run === runName || (queued.has(g.epic) && live(g) && g.kind !== 'preflight')))
    .map(({ file, g }) => ({
      file: `gates/${file}`, epic: g.epic, label: labelOf(g.epic), kind: g.kind, session: g.session ?? null, skillStep: g.skillStep ?? null, question: g.question ?? null, options: g.options ?? [],
      tor: g.tor ?? null, why: g.why ?? null, artifacts: g.artifacts ?? [], open: g.open ?? [], checks: g.checks ?? [], checklists: g.checklists ?? [], earlier: g.earlier ?? null, asks: g.asks ?? [], branch: g.branch ?? null, branchTip: g.branchTip ?? null, phase: g.phase ?? null, resume: g.resume ?? null, decided: g.decided ?? null,
      run: g.run ?? runName, fromEarlierRun: (g.run ?? runName) !== runName, void: g.void ?? null, superseded: !!g.superseded, cleared: !!g.cleared,
      ...(g.kind === 'thin-review' ? { review: { read: g.read ?? null, of: g.of ?? null, seconds: g.seconds ?? null, unread: g.unread ?? [], untested: g.untested ?? [] } } : {}),
      // A technical stop autopilot may not answer itself any more: the one plain question the owner gets in place of the gate's own.
      ask: (() => { const a = atLimitAsk(g, everyGate.map((x) => x.g).filter(Boolean), Number(config.autoContinue) || 0, labelOf(g.epic)); return a ? { question: a.question, options: a.options } : null; })(),
      // Every gate with options resumes its epic in the next run once decided. `resume` stays in report.json as a record; it is never printed for the owner.
      effect: (g.options ?? []).length ? 'resume' : 'none',
      // Where a decided gate re-enters its epic in the next run (null until decided, or when it cannot).
      enters: g.decided && !g.decided.used ? (gateEntry(g)?.fresh ? 'PLAN (from scratch, on a fresh branch)' : gateEntry(g)?.phase ?? null) : null,
    }));

  const blocked = []; const setups = []; let gatesAnswered = 0; let ownerAnswers = 0;
  const epics = (s.queue ?? []).map((q) => {
    const rel = `runs/${runName}/epics/${q.id}`; const dir = path.join(workspace, rel);
    for (const ses of q.sessions ?? []) {
      for (const h of readLines(path.join(dir, ses.name, 'hooks.jsonl'))) {
        if (h.hook !== 'PreToolUse') continue;
        if (h.decision === 'deny') blocked.push({ epic: q.id, step: ses.name, rule: h.rule, tool: h.tool_name ?? null, reason: h.reason ?? null });
        if (h.decision === 'answer') { if (/the owner's recorded decision/.test(h.reason ?? '')) ownerAnswers += 1; else gatesAnswered += 1; }
      }
      const init = readJson(path.join(dir, ses.name, 'effective-setup.json'))?.init;
      if (init && !ses.name.startsWith('audit-')) {
        const plugin = (init.plugins ?? []).find((p) => p.name === 'peak-workflow');
        setups.push({ epic: q.id, step: ses.name, digest: `Claude Code ${init.claude_code_version ?? '?'}, peak-workflow ${plugin ? `${plugin.version} (${plugin.source ?? plugin.path})` : 'NOT LOADED'}, ${init.permissionMode ?? '?'}` });
      }
    }
    const checks = (q.checks ?? []).map((c) => ({ file: `${rel}/${c.file}`, pass: c.pass, failed: c.failed ?? [], items: (readJson(path.join(dir, c.file))?.checks ?? []).map((i) => ({ name: i.name, pass: i.pass })) }));
    const runs = (q.audits ?? []).map((a) => {
      const j = readJson(path.join(dir, a.file), {});
      return { step: a.step, file: `${rel}/${a.file}`, delta: !!a.delta, base: a.base ?? null, tip: a.tip ?? null, recommend: j.recommend ?? null, summary: j.summary ?? null, findings: j.findings ?? [], ...(j.coverage ? { coverage: j.coverage } : {}), ...(a.thin ? { thin: true, accepted: a.accepted ?? null } : {}) };
    });
    const audit = runs.length
      ? { findings: runs.flatMap((r) => r.findings.map((f) => ({ ...f, step: r.step }))), recommend: runs.at(-1).recommend, summary: runs.at(-1).summary, runs }
      : q.audit?.skipped ? { skipped: q.audit.skipped, findings: [] } : null;
    const mine = gates.filter((g) => g.epic === q.id && (q.gates ?? []).includes(path.basename(g.file)));
    const outcome = TERMINAL.has(q.state) ? q.state : q.state === 'QUEUED' ? 'NOT STARTED' : q.state;
    const parking = audit?.findings?.filter((f) => f.parks) ?? [];
    let evidence = null;
    if (outcome === 'PARKED' && /^auditor:/.test(q.reason ?? '') && parking.length) evidence = `${runs.at(-1).file} ${parking.filter((f) => f.step === runs.at(-1).step).map((f) => f.id).join(', ')}`;
    else if (outcome === 'PARKED' && mine.length) evidence = mine.at(-1).artifacts[0] ?? mine.at(-1).file;
    else if (outcome === 'MERGED' || /merge gate|CHECK_BUILD/.test(q.reason ?? '')) evidence = checks.at(-1)?.file ?? null;
    else if ((q.sessions ?? []).length && outcome !== 'SKIPPED' && outcome !== 'BLOCKED') evidence = `${rel}/${q.sessions.at(-1).name}/result.json`;
    const elapsedMs = q.startedAt && q.endedAt ? Date.parse(q.endedAt) - Date.parse(q.startedAt) : q.wallMs ?? 0;
    return {
      id: q.id, label: q.label ?? q.id, outcome, reason: q.reason ?? null, evidence, checks, audit, gates: q.gates ?? [],
      costUsd: q.costUsd ?? 0, turns: q.turns ?? 0, wallMs: q.wallMs ?? 0, elapsedMs, sessions: q.sessions ?? [],
      testChanges: q.testChanges ?? [], unproven: (q.unproven ?? []).filter((u) => u.kind !== 'left'), left: (q.unproven ?? []).filter((u) => u.kind === 'left'), rejected: q.rejected ?? [], verifiedKept: q.verifiedKept ?? null, fixRounds: q.fixRounds ?? 0,
      planApprovedBy: q.planStep || q.plan ? (!q.planApprovedBy || q.planApprovedBy === 'lint' ? 'lint, not a person' : q.planApprovedBy) : null, plan: q.plan ?? (q.planStep ? `${rel}/${q.planStep}/plan.md` : null),
      resumed: q.resumed ?? null, voided: q.voided ?? null, superseded: q.superseded ?? [], auditOverruled: q.auditOverruled ?? null, look: q.look ?? null, fixedAtWrapup: q.fixedAtWrapup ?? null,
      // What the closing screen says and this report used to leave out: approved amendments, the verifier's words on the pictures, sign-ins nobody answered.
      amended: q.amended ?? [], amendedUnseen: q.amendedUnseen ?? [], seen: q.seen ?? [], unanswered: q.unanswered ?? [], unlooked: q.unlooked ?? null,
      // A provisional run: the questions it answered with a session's own recommendation, and what nobody observed.
      connectors: epicConnectorUse(dir, (q.sessions ?? []).map((x) => x.name)),
      prototype: q.prototype ?? [], unobserved: (q.unobserved ?? []).map((u) => ({ ...u, check: `/peak-workflow:wrapup-epic ${q.id} reverify ${u.tor}` })), deferred: q.deferred ?? [],
    };
  });

  const digests = [...new Set(setups.map((x) => x.digest))];
  const findings = epics.flatMap((e) => (e.audit?.findings ?? []).map((f) => ({ epic: e.id, ...f })));
  const referee = {
    blocked, gatesAnswered, ownerAnswers,
    testChanges: epics.flatMap((e) => e.testChanges.map((t) => ({ epic: e.id, ...t }))),
    unmatchedParks: gates.filter((g) => g.kind === 'unmatched' && !g.fromEarlierRun).map((g) => g.file),
    setup: { digest: digests[0] ?? null, differs: digests.length > 1 ? setups : [] },
    auditFindings: Object.fromEntries(['high', 'medium', 'low'].map((sev) => [sev, findings.filter((f) => f.severity === sev).length])),
  };

  const report = {
    run: s.run, name: runName, ended: s.endedAt ?? null, status: s.status, stoppedBecause: s.stoppedBecause ?? null, integration: s.integration, workspace, clone, startSha: s.startSha ?? null,
    spentUsd: s.spentUsd ?? 0, budgetUsd: s.runBudgetUsd ?? config.runBudgetUsd ?? null, testCommand: s.testCommand ?? config.testCommand ?? null, baseRed: s.baseRed ?? null, baseRetried: s.baseRetried ?? [], setupFailed: s.setupFailed ?? null,
    realSpend: typeof s.realSpend === 'boolean' ? s.realSpend : null, attended: typeof s.attended === 'boolean' ? s.attended : null, mode: isProvisional(s.mode) ? 'provisional' : 'full', driverVersion: s.driverVersion ?? null, sync: s.sync ?? null, leftovers: s.leftovers ?? [], stoppedOnPark: s.stoppedOnPark ?? null, epics, gates, referee,
  };
  // Sessions stopped before they wrote their result line: their cost is an estimate from the tokens their messages used.
  const est = epics.flatMap((e) => e.sessions.filter((x) => x.costEstimated));
  report.estimated = est.length ? { usd: +est.reduce((sum, x) => sum + (x.costUsd ?? 0), 0).toFixed(4), sessions: est.length, unpriced: [...new Set(est.flatMap((x) => x.unpriced ?? []))] } : null;
  // Runs chained by `continues` share one budget: what they spent together, so the report and `status` agree.
  const chain = chainOf(workspace, runName);
  report.chain = chain.runs.length > 1 ? { before: chain.runs.length - 1, spentUsd: +(chain.spentBefore + report.spentUsd).toFixed(2), budgetUsd: chain.runBudgetUsd } : null;
  // Is the clone's integration tip already in the project? (null: cannot tell — no project, no clone.) Read-only.
  const git = (cwd, ...args) => { try { return spawnSync('git', args, { cwd, encoding: 'utf8' }); } catch { return { status: 1, stdout: '' }; } };
  const cloneTip = fs.existsSync(clone) ? (git(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${s.integration}`).stdout ?? '').trim() : '';
  report.workInProject = cloneTip && config.project && fs.existsSync(config.project) ? git(config.project, 'merge-base', '--is-ancestor', cloneTip, s.integration).status === 0 : null;
  // The command that brings the merged work into the project: a record for whoever runs it for the owner (the skill does). Never printed in report.md.
  report.fetch = `git fetch "${clone}" ${s.integration}:autopilot/${s.integration} && git log ${s.integration}..autopilot/${s.integration}`;
  report.next = nextSteps(report);
  report.tldr = tldr(report);
  return report;
}

/** The few plain sentences at the top of the report: what happened, where the work is, what needs the owner. No jargon. */
function tldr(r) {
  const n = (o) => r.epics.filter((e) => e.outcome === o).length;
  const merged = n('MERGED'); const failed = n('FAILED'); const blocked = n('BLOCKED'); const notStarted = n('NOT STARTED'); const skipped = n('SKIPPED');
  const waiting = r.epics.filter((e) => e.outcome === 'PARKED').length;
  const open = r.gates.filter((g) => !g.decided && !g.void && !g.superseded && !g.cleared && g.effect === 'resume').length;
  const parts = [
    merged && `${merged} finished and passed every check`,
    waiting && `${waiting} stopped part-way and ${waiting === 1 ? 'needs' : 'need'} you`,
    failed && `${failed} failed its independent check`,
    (blocked + notStarted + skipped) && `${blocked + notStarted + skipped} did not start`,
  ].filter(Boolean);
  const T = [];
  T.push(r.epics.length ? `Autopilot worked through ${plural(r.epics.length, 'epic')} (an epic is one planned piece of work): ${parts.join(', ') || 'none was started'}.` : 'Autopilot had nothing to work on: the queue was empty.');
  T.push(merged
    ? (r.workInProject === true
      ? `The finished work is already in your project: you brought it in from autopilot's private copy.`
      : `The finished work is in autopilot's own private copy of your project, not in your project yet. Nothing in your project has changed; run \`/peak-workflow:autopilot\` and it brings the work in for you, after asking.`)
    : 'Nothing in your project has changed. Autopilot works in its own private copy and never writes to your project.');
  if (open) T.push(`${plural(open, 'question')} only you can answer ${open === 1 ? 'is' : 'are'} waiting. Run \`/peak-workflow:autopilot report\` and it asks you each one; the work then continues from where it stopped in the next run.`);
  if (r.setupFailed) T.push(`Nothing was built, because autopilot could not get its private copy of your project ready: ${setupWhy(r.setupFailed)}.`);
  else if (r.baseRed?.couldNotRun) T.push(`Nothing was built, because the test command could not be run in autopilot's private copy (\`${r.testCommand}\`: ${lastLine(r.baseRed.tail) || `exit ${r.baseRed.exit}`}). The tests never ran; this is a missing tool or setup step, not a failing test.`);
  else if (r.baseRed) T.push(`Nothing was built, because your project's own tests were already failing before autopilot started${(r.baseRed.tries ?? []).length > 1 ? ' (they failed twice: autopilot ran them once more)' : ''}.${sleptWords(r.baseRed.tries) ? ` It may not be the code: ${sleptWords(r.baseRed.tries)}. Keep the computer awake and on power, then run \`/peak-workflow:autopilot\` again.` : ''}`);
  else if (r.stoppedOnPark) T.push(r.stoppedOnPark.from === 'project' ? 'The run ended early on purpose: this project is set to stop at the first epic that needs you.' : 'The run ended early on purpose: while you are there to answer it stops at the first epic that needs you, so nothing else is built on a guess.');
  else if (/^usage limit: /.test(r.stoppedBecause ?? '')) T.push(`The run ended early: ${r.stoppedBecause.replace(/^usage limit: /, '')}. Run \`/peak-workflow:autopilot\` once it has reset to carry on.`);
  else if (r.stoppedBecause && !['queue done', 'nothing runnable'].includes(r.stoppedBecause)) T.push(`The run ended early: ${r.stoppedBecause}.`);
  T.push(`It ran from ${stamp(r.run)} to ${r.ended ? stamp(r.ended) : '(still running)'} and spent ${usd(r.spentUsd)}${estimatedWords(r, { named: true })}${r.chain ? ` in this run; with the ${plural(r.chain.before, 'run')} before it, ${usd(r.chain.spentUsd)}${r.chain.budgetUsd == null ? '' : ` of the $${r.chain.budgetUsd} budget`} is spent` : r.budgetUsd == null ? '' : ` of a $${r.budgetUsd} limit`}.`);
  T.push(r.next.length ? `What to do: follow "Do this next" below, from the top. It has ${plural(r.next.length, 'step')}.` : 'Nothing needs you.');
  return T;
}

/** The clause after a run's spend when some of it is estimated; `named`: also name, once, a model with no known price. */
function estimatedWords(r, { named = false } = {}) {
  const x = r.estimated;
  if (!x) return '';
  const unpriced = named && x.unpriced.length ? `; ${x.unpriced.join(', ')} could not be priced, so ${x.unpriced.length === 1 ? 'its' : 'their'} tokens are not in that figure` : '';
  return ` (including ${usd(x.usd)} estimated for ${plural(x.sessions, 'session')} stopped before ${x.sessions === 1 ? 'it' : 'they'} reported ${x.sessions === 1 ? 'its' : 'their'} cost${unpriced})`;
}

const lastLine = (text) => String(text ?? '').trim().split('\n').filter(Boolean).at(-1) ?? '';
const setupWhy = (f) => (f.step === 'copy' ? f.problems.join('; ') : `the setup command \`${f.command}\` ${f.timedOut ? 'timed out' : f.couldNotRun ? 'could not be run' : 'failed'} (${lastLine(f.tail) || `exit ${f.exit}`})`);

const GLOSSARY = [
  ['Epic', 'one planned piece of work, built from its written requirements.'],
  ['Merged', "finished, checked, and combined into autopilot's private copy. It is not in your project until you bring it in."],
  ['Parked', 'stopped part-way because something needs a person. The work so far is kept.'],
  ['Gate', 'a question only you can answer. Each parked epic has one, unless the report says there is nothing to answer.'],
  ['Failed', "the independent check found the work does not meet a requirement, and the one allowed fix attempt did not cure it."],
  ['Blocked / not started', 'never begun: it depends on an epic that did not finish, or the run ended first.'],
  ['Private copy (the "clone")', "autopilot's own copy of your project, where all of this happened. Your project is never written."],
  ['Integration line', 'the main branch that finished epics are combined into (usually `develop`).'],
  ['Session', 'one unattended Claude Code conversation. Each epic gets separate ones to plan, build, and check.'],
  ['Referee', 'fixed rules that stop a session doing what it must not: touching files outside the private copy, pushing, weakening an existing test, answering your questions for you.'],
  ['Auditor', 'a second, read-only reviewer that looks for shortcuts in the build. It only advises; a serious finding becomes a question for you.'],
  ['Plan approved by lint', 'a script checked that the plan has every required part. No person read it.'],
];

/** What autopilot says when only a person who maintains the code can act: it names the problem and offers nothing to type. */
const NEEDS_MAINTAINER = 'Autopilot cannot repair this itself yet; it needs someone who maintains the code.';

/**
 * "Do this next": what the owner does in the morning, most blocking first. The owner is not a
 * developer: no git command and no slash command except `/peak-workflow:autopilot`, which does the
 * routine steps for them.
 */
function nextSteps(r) {
  const next = [];
  const ids = (list) => list.map((e) => e.id).join(', ');
  const by = (o) => r.epics.filter((e) => e.outcome === o);
  if (r.setupFailed) next.push(`Nothing was built: autopilot could not get its private copy of your project ready (${setupWhy(r.setupFailed)}). Run \`/peak-workflow:autopilot\` again: it checks this before it launches and sets up what it can. If it still cannot: ${NEEDS_MAINTAINER}`);
  else if (r.baseRed?.couldNotRun) next.push(`Nothing was built: the test command (\`${r.testCommand}\`) could not be run in autopilot's private copy. Run \`/peak-workflow:autopilot\` again: it lists what the copy is missing and sets up what it can. If it still cannot: ${NEEDS_MAINTAINER}`);
  else if (r.baseRed) next.push(`Nothing was built: your project's own tests were already failing on \`${r.integration}\` before autopilot started. ${NEEDS_MAINTAINER} Once the tests pass, run \`/peak-workflow:autopilot\` again.`);
  if (/^preflight:/.test(r.stoppedBecause ?? '')) next.push(`Autopilot refused to start: ${r.stoppedBecause.replace(/^preflight:\s*/, '')}. ${NEEDS_MAINTAINER}`);
  const parked = by('PARKED');
  const liveGate = (g) => !g.decided?.used && !g.void && !g.superseded && !g.cleared && !g.restarted;
  const epicsOf = (list) => [...new Set(list.map((g) => g.epic))].join(', ');
  const open = r.gates.filter((g) => !g.decided && liveGate(g) && g.effect === 'resume');
  const noGate = parked.filter((e) => !r.gates.some((g) => g.epic === e.id && e.gates.includes(path.basename(g.file))));
  const projectFix = r.gates.filter((g) => g.kind === 'preflight' && liveGate(g) && parked.some((e) => e.id === g.epic));
  if (open.length) next.push(`Answer ${plural(open.length, 'waiting question')}: \`/peak-workflow:autopilot report\` (${epicsOf(open)})`);
  if (projectFix.length) next.push(`Something in the project stopped ${plural(projectFix.length, 'epic')} before it started (${epicsOf(projectFix)}); there is nothing to answer, and the reason is under "Per epic". ${NEEDS_MAINTAINER}`);
  if (noGate.length) next.push(`${plural(noGate.length, 'parked epic')} stopped with no question to answer (${ids(noGate)}): the reason is under "Per epic". ${NEEDS_MAINTAINER} Queued again, such an epic starts over.`);
  const decided = r.gates.filter((g) => g.decided && liveGate(g));
  const voided = r.epics.filter((e) => e.voided);
  if (voided.length) next.push(`${plural(voided.length, 'decision')} could not be used as given (${ids(voided)}): what was asked or decided instead is under "Per epic".`);
  if (by('FAILED').length) next.push(`${plural(by('FAILED').length, 'epic')} did not pass the final check (${ids(by('FAILED'))}): why is under "Per epic", and the work is kept. Run \`/peak-workflow:autopilot\` to queue it again; it then starts over.`);
  const waiting = r.sync?.state === 'clone-ahead' ? r.sync.waiting : [];
  const bring = 'Run `/peak-workflow:autopilot`: it shows you what is new and brings it into your project for you, after asking.';
  if (r.workInProject === true) { if (by('MERGED').length) next.push(`The merged work (${ids(by('MERGED'))}) is already in your project's \`${r.integration}\`: nothing to bring in.`); }
  else if (by('MERGED').length) next.push(`Review and bring in the merged work (${ids(by('MERGED'))}${waiting.length ? `, and ${plural(waiting.length, 'commit')} from earlier runs still waiting in the clone` : ''}). ${bring}`);
  else if (waiting.length) next.push(`Bring in the work earlier runs merged, still waiting in the clone (${plural(waiting.length, 'commit')}). ${bring}`);
  if (decided.length) next.push(`Run \`/peak-workflow:autopilot\` again: ${plural(decided.length, 'decided gate')} (${epicsOf(decided)}) ${decided.length === 1 ? 'resumes its epic' : 'resume their epics'} on the branch this run left. A decision holds while that branch is unchanged and still merges cleanly into \`${r.integration}\`.`);
  const left = r.epics.reduce((n, e) => n + (e.left ?? []).length, 0);
  if (left) next.push(`Read the ${plural(left, 'thing')} the final check saw wrong and left (under "Per epic"). Any of them is a \`/peak-workflow:quick-fix\` away.`);
  if (r.referee.testChanges.length) next.push(`Read the recorded reason for ${plural(r.referee.testChanges.length, 'changed existing test')} (under "Per epic").`);
  const notStarted = by('NOT STARTED');
  if (r.stoppedOnPark && notStarted.length) next.push(`${plural(notStarted.length, 'epic')} did not start (${ids(notStarted)}): ${r.stoppedOnPark.from === 'project' ? 'this project is set to stop at the first epic that needs you' : 'the run stops at the first epic that needs you while you are there to answer. When you say at launch that you will be away, the epics that do not depend on it keep building'}. They are built in the next run.`);
  if (by('BLOCKED').length) next.push(`${plural(by('BLOCKED').length, 'epic')} never started because a dependency did not merge (${ids(by('BLOCKED'))}); queue them again once it has.`);
  return next;
}

/**
 * "Decided for you in this provisional run": everything a provisional run did where a full run would
 * have stopped and asked, for the owner to review. Empty for a full run with nothing of the kind.
 */
export function prototypeSection(r) {
  const took = r.epics.flatMap((e) => (e.prototype ?? []).map((x) => ({ ...x, epic: e })));
  const unobserved = r.epics.flatMap((e) => (e.unobserved ?? []).map((x) => ({ ...x, epic: e })));
  const unlooked = r.epics.filter((e) => e.unlooked?.prototype);
  if (r.mode !== 'provisional' && !took.length && !unobserved.length && !unlooked.length) return [];
  const L = ['', '## Decided for you in this provisional run'];
  if (!took.length && !unobserved.length && !unlooked.length) { L.push('Nothing: no session asked a question this run answered for you, and no epic needed your look.'); return L; }
  L.push('Where a full run would have stopped and asked you, this run went on. Each item is yours to review. If one is wrong, say so when you run autopilot again: work built on it may need to change.');
  const state = (e) => (e.outcome === 'MERGED' ? 'merged' : `not merged: ${String(e.outcome).toLowerCase()}`);
  const amended = took.filter((x) => x.kind === 'amendment');
  if (amended.length) {
    L.push('', '**Requirements changed on a session\'s proposal**');
    for (const x of amended) {
      L.push(`- ${x.tor ?? 'a requirement'} (${x.epic.label}; ${state(x.epic)}) — \`${x.gate}\``);
      if (x.was) L.push('  As it read:', ...x.was.split('\n').map((l) => `  > ${l}`));
      L.push(`  Proposed: ${cell(x.proposed ?? x.question)}`);
    }
  }
  const deferred = took.filter((x) => x.kind === 'deferral' && /^\W*defer\b/i.test(x.answer));
  if (deferred.length) {
    L.push('', '**Requirements left for a later epic, on the builder\'s recommendation**');
    for (const x of deferred) L.push(`- ${x.tor} (${x.epic.label}; ${state(x.epic)}) — ${cell(x.question)} — \`${x.gate}\``);
  }
  const fixed = took.filter((x) => x.kind === 'deferral' && !/^\W*defer\b/i.test(x.answer));
  if (fixed.length) {
    L.push('', '**Fixed in the same build, on the builder\'s recommendation**');
    for (const x of fixed) L.push(`- ${x.tor} (${x.epic.label}; ${state(x.epic)}) — ${cell(x.question)} — \`${x.gate}\``);
  }
  const thin = took.filter((x) => x.kind === 'thin-review');
  if (thin.length) {
    L.push('', '**Reviews that were thin** (the independent reviewer read too little, twice; the final check ran anyway)');
    for (const x of thin) {
      const g = (r.gates ?? []).find((y) => y.file === x.gate)?.review ?? {};
      L.push(`- ${x.epic.label} (${state(x.epic)}) — read ${g.read ?? '?'} of ${g.of ?? '?'} changed code files${g.seconds == null ? '' : ` in ${g.seconds} s`}${(g.untested ?? []).length ? `; no test checked for ${g.untested.join(', ')}` : ''} — \`${x.gate}\``);
      if ((g.unread ?? []).length) L.push(`  Not opened: ${g.unread.map((f) => `\`${f}\``).join(', ')}`);
    }
  }
  const defects = took.filter((x) => x.kind === 'defect');
  if (defects.length) {
    L.push('', '**Defects left as is, on the final check\'s own judgement** (it recommended leaving them, or they were past the count of small fixes or too big for one)');
    for (const x of defects) L.push(`- ${x.epic.label} (${state(x.epic)}) — ${cell(x.question)} — \`${x.gate}\``);
  }
  if (unobserved.length) {
    L.push('', '**Requirements nobody observed** (recorded as not verified in the epic\'s status file, never as verified)');
    for (const x of unobserved) {
      L.push(`- ${x.tor} (${x.epic.label}; ${state(x.epic)}). A person must still see:`, ...(x.clauses ?? []).map((c) => `  - ${c}`));
      L.push(`  To check it later, with the work in the project: \`${x.check}\``);
    }
  }
  if (unlooked.length) {
    L.push('', '**Looks that were skipped**');
    for (const e of unlooked) {
      L.push(`- ${e.label} (${state(e)}): ${e.unlooked.pictures.length ? `${plural(e.unlooked.pictures.length, 'picture')} of its screens in \`look/${e.id}/\`` : 'no pictures'}${e.unlooked.claudeMd ? `; it changed the project's instructions file (CLAUDE.md) in ${e.unlooked.claudeMd.sections.join(', ')}, which every later session follows:` : ''}`);
      for (const l of e.unlooked.claudeMd?.lines ?? []) L.push(`  \`${l}\``);
      if (e.unlooked.claudeMd?.more) L.push(`  … and ${e.unlooked.claudeMd.more} more changed line(s)`);
    }
  }
  return L;
}

export function renderReport(r) {
  const L = [];
  L.push(`# Autopilot — ${stamp(r.run)} → ${r.ended ? stamp(r.ended) : 'still running'} (stopped: ${r.stoppedBecause ?? 'not yet'})`);
  L.push('', '## TL;DR', ...r.tldr.map((t) => `- ${t}`));
  L.push('', 'New to this report? "Words used in this report", at the end, explains every term.');
  L.push('', '## Where things are');
  L.push(`Workspace: ${r.workspace} — run ${r.name}. Paths below are relative to the workspace.`);
  L.push(`Integration line: ${r.integration} in ${r.clone} (not pushed). Spent ${usd(r.spentUsd)}${estimatedWords(r)}${r.chain ? ` in this run; ${usd(r.chain.spentUsd)}${r.chain.budgetUsd == null ? '' : ` of $${r.chain.budgetUsd}`} across this run and the ${r.chain.before} before it` : r.budgetUsd == null ? '' : ` of $${r.budgetUsd}`}.`);

  if (r.sync?.state === 'project-ahead') L.push(`At the start the clone's ${r.integration} was fast-forwarded to the project's (${String(r.sync.cloneTip).slice(0, 9)} → ${String(r.sync.projectTip).slice(0, 9)}).`);
  if (r.sync?.state === 'clone-ahead') L.push(`At the start the clone was ahead of the project by work not fetched yet; this run built on top of it: ${r.sync.waiting.join('; ')}.`);
  const setAside = (r.leftovers ?? []).reduce((n, l) => n + (l.count ?? l.files.length), 0);
  if (setAside) L.push(`Autopilot set aside ${setAside} file(s) an earlier session left behind. Nothing is lost.`);
  for (const b of r.baseRetried ?? []) L.push(`Your project's own tests failed once on \`${r.integration}\` before ${b.before} and passed when run again: a flaky test${sleptWords(b.tries) ? `, or ${sleptWords(b.tries)}` : ''}. It may stop a later run; whoever maintains the tests can make it steady.`);

  L.push(`Real money on outside services: ${r.realSpend === true ? 'you allowed it when a check needs it' : r.realSpend === false ? 'you said not to spend any; what that left unproven is in each verify report under "Not proven for real"' : 'not decided at launch; a session that needs it asks you'}.`);

  L.push(`Whether you were there: ${r.attended === true ? 'you said you would be at the computer; a step that needed you told you and waited' : r.attended === false ? 'you said you would be away; no session started anything that waits for a person' : 'not asked at launch'}.`);
  const fixed = r.epics.filter((e) => e.fixedAtWrapup?.standing);
  if (fixed.length) L.push(`Small fixes made without asking, on your standing answer: ${fixed.map((e) => `${e.id} (${e.fixedAtWrapup.files.join(', ') || 'no code file'})`).join('; ')} — what was asked is under each epic below.`);
  const auto = r.epics.filter((e) => e.fixedAtWrapup?.auto);
  if (auto.length) L.push(`Fixes the final check made to its own findings without asking, checked only by the verifier: ${auto.map((e) => `${e.id} (${e.fixedAtWrapup.files.join(', ') || 'no code file'})`).join('; ')}.`);
  L.push(`How careful this run was: ${r.mode === 'provisional' ? 'a provisional run, as you chose at launch. It kept building: it took a session\'s own recommendation where a full run would have asked you, and did not stop for your looks. Every one of those is under "Decided for you in this provisional run"' : 'a full run: it stopped and asked whenever a requirement, a deferral or a look needed you'}.`);
  const decided = r.gates.filter((g) => g.decided?.standing && !g.decided.prototype);
  if (decided.length) L.push(`Decided by autopilot for you, on your standing answer for technical stops: ${decided.map((g) => `${g.epic} — "${g.decided.answer}" (\`${g.file}\`)`).join('; ')}.`);
  const nobody = r.epics.filter((e) => e.unanswered.length);
  if (nobody.length) L.push(`Waited for you and nobody came: ${nobody.map((e) => `${e.id} ×${e.unanswered.length}`).join(', ')} — each is under its epic below. Run autopilot when you are at the computer and it will take you through them.`);

  L.push('', '## Do this next');
  if (r.next.length) r.next.forEach((n, i) => L.push(`${i + 1}. ${n}`)); else L.push('Nothing to do.');

  L.push(...prototypeSection(r));

  L.push('', '## Results', 'One row per epic, in the order they were queued.', '', '| Epic | Outcome | Why | Evidence | Cost | Time |', '|---|---|---|---|---|---|');
  for (const e of r.epics) L.push(`| ${cell(e.label)} | ${e.outcome} | ${cell(e.reason)} | ${cell(e.evidence)} | ${usd(e.costUsd)} | ${mins(e.elapsedMs)} |`);
  if (!r.epics.length) L.push('| (the queue was empty) | | | | | |');

  const ref = r.referee;
  L.push('', '## Referee', 'What the guardrails did while nobody was watching: calls they refused, questions answered from the pre-agreed list, and what the reviewer found.');
  const groups = new Map();
  for (const b of ref.blocked) { const k = `${b.rule} ${RULES[b.rule] ?? ''}`.trim(); groups.set(k, (groups.get(k) ?? 0) + 1); }
  const blockedText = ref.blocked.length ? `${ref.blocked.length} (${[...groups].map(([k, n]) => `${k} ×${n}`).join(', ')})` : '0';
  L.push(`Blocked: ${blockedText}. Gates answered from policy: ${ref.gatesAnswered}${ref.ownerAnswers ? `; from your recorded decisions: ${ref.ownerAnswers}` : ''}. Test changes with recorded reason: ${ref.testChanges.filter((t) => t.reason).length}${ref.testChanges.some((t) => !t.reason) ? `; WITHOUT a reason: ${ref.testChanges.filter((t) => !t.reason).length}` : ''}${ref.testChanges.length ? ' (listed per epic below)' : ''}.`);
  const audited = r.epics.filter((e) => e.audit?.runs?.length).length;
  const f = ref.auditFindings; const total = f.high + f.medium + f.low;
  if (audited) L.push(`Auditor findings: ${total}${total ? ` (${['high', 'medium', 'low'].filter((k) => f[k]).map((k) => `${f[k]} ${k}`).join(', ')}) — listed per epic below` : ''}. The auditor advises; the driver parks only on a high finding in a park category.`);
  else L.push('Auditor: no audit ran.');
  L.push(`Questions parked because no policy row matched: ${ref.unmatchedParks.length}${ref.unmatchedParks.length ? ` (${ref.unmatchedParks.join(', ')}) — if a pre-approved row clearly applied, that is a needless park worth reporting` : ''}.`);
  if (ref.setup.digest) L.push(`Session setup: ${ref.setup.digest}${ref.setup.differs.length ? ` — DIFFERS between sessions: ${ref.setup.differs.map((x) => `${x.epic}/${x.step}: ${x.digest}`).join('; ')}` : ' — the same in every session'}.`);
  const owned = r.epics.filter((e) => e.planApprovedBy && e.planApprovedBy !== 'lint, not a person');
  L.push(owned.length ? `Plans were approved by lint, not by a person — except ${owned.map((e) => `${e.id} (approved by ${e.planApprovedBy})`).join(', ')}.` : 'Every plan was approved by lint, not by a person.');

  L.push('', '## Per epic', 'The detail behind each row of Results: what ran, what was checked, and anything waiting for you.');
  for (const e of r.epics) {
    L.push('', `### ${e.label} — ${e.outcome}`, '', e.reason ?? '(no reason recorded)');
    if (e.resumed) L.push('', e.resumed.fresh ? `Started over: ${e.resumed.by} answered "${e.resumed.answer}" on \`${e.resumed.gate}\`.` : `Resumed at ${e.resumed.phase} on \`${e.resumed.branch}\` (${String(e.resumed.branchTip).slice(0, 9)}, left by run ${e.resumed.fromRun ?? '?'}): ${e.resumed.by} answered "${e.resumed.answer}" on \`${e.resumed.gate}\`. No earlier session was run again.${e.resumed.behind ? ` The branch was ${plural(e.resumed.behind, 'commit')} behind \`${r.integration}\` and merged cleanly in a trial merge.` : ''}`);
    if (e.voided) L.push('', `Your decision "${e.voided.answer}" on \`${e.voided.gate}\` could not be used — ${e.voided.why}. ${e.voided.startedOver ? `Nothing was left to continue from, so this provisional run started the epic over from scratch (\`${e.voided.asked}\`); it is listed under what was decided for you.` : e.voided.asked ? `You are asked how to go on: \`${e.voided.asked}\`.` : 'The epic was planned again from scratch.'}`);
    for (const ref of e.superseded) L.push('', `The earlier branch is kept in the clone at \`${ref}\`.`);
    if (e.fixedAtWrapup?.standing) L.push('', `Fixed during verification, on your standing answer for small fixes: ${e.fixedAtWrapup.files.join(', ') || 'no code file'}. What the verifier asked: ${e.fixedAtWrapup.standing.map((x) => `"${x.question}"`).join('; ')}.${e.fixedAtWrapup.standing.some((x) => x.testOnly) ? ` A test was added for a requirement the build left untested: ${e.fixedAtWrapup.standing.filter((x) => x.testOnly).map((x) => x.tor).join(', ')}.` : ''} The verifier checked its own fix; no separate audit ran on it.`);
    else if (e.fixedAtWrapup?.auto) L.push('', `Fixed during the final check without asking you, on your standing answer for technical stops (\`${e.fixedAtWrapup.approvedBy}\`): ${e.fixedAtWrapup.files.join(', ') || 'no code file'}. Only the verifier checked this fix; no second reviewer judged it.`);
    else if (e.fixedAtWrapup?.approvedBy) L.push('', `Fixed during verification, on your "Fix now" (\`${e.fixedAtWrapup.approvedBy}\`): ${e.fixedAtWrapup.files.join(', ') || 'no code file'}. The verifier checked its own fix; no separate audit ran on it.`);
    if (e.auditOverruled) L.push('', `Verified as built: ${e.auditOverruled.by} judged the auditor's findings not real (\`${e.auditOverruled.gate}\`).`);
    if (e.look) {
      const pics = (e.look.artifacts ?? []).filter((a) => a.startsWith('look/')).length;
      const live = (e.look.observations ?? []).filter((o) => o.how === 'live').length;
      L.push('', `Human check: ${e.look.by} looked on ${e.look.date} and answered "Looks right" (\`${e.look.gate}\`)${pics ? `, with ${pics} picture(s) of the screens` : ''}${live ? `; ${live} line(s) seen for real, on the running build` : ''}; wrapup's manual-verification question was answered with that.${e.look.kept ? ` The look was kept across a repair that changed no screen file (${e.look.kept.files.join(', ') || 'no files'}).` : ''}`);
      for (const o of e.look.observations ?? []) L.push(`- ${o.tor}: "${o.clause}" — ${o.answer}${o.how ? ` (${o.how === 'live' ? 'seen for real' : 'from pictures'})` : ''}`);
    }
    if (e.unlooked?.prototype) L.push('', `Not stopped for your look (provisional run): ${e.unlooked.pictures.length} picture(s) of its screens are kept in \`look/${e.id}/\`${e.unlooked.claudeMd ? `, and it changed the project's instructions file (CLAUDE.md) in ${e.unlooked.claudeMd.sections.join(', ')}` : ''}. See "Decided for you in this provisional run".`);
    else if (e.unlooked) L.push('', `Merged without your look ("look": "after"): ${e.unlooked.pictures.length} picture(s) of its screens are kept in \`look/${e.id}/\` for you to review. The verifier judged them; its words are below.`);
    const yours = e.amended.filter((t) => !(e.amendedUnseen ?? []).includes(t));
    if (yours.length) L.push('', `Requirement amended with your approval: ${yours.join(', ')}. The build rewrote it in your name and the checks followed the amended text.`);
    if ((e.amendedUnseen ?? []).length) L.push('', `Requirement amended without your approval, on a session's proposal (provisional run): ${e.amendedUnseen.join(', ')}. The checks followed the amended text. See "Decided for you in this provisional run".`);
    if (e.seen.length) L.push('', 'What the verifier saw in the pictures (its own words):', ...e.seen.map((x) => `- ${x}`));
    if (e.unanswered.length) L.push('', 'Waited for you and nobody came:', ...e.unanswered.map((u) => `- ${u.step ? `${u.step}: ` : ''}${u.description}`), 'Run autopilot when you are at the computer and it will take you through them.');
    const use = connectorLine(e.connectors);
    if (use) L.push('', `Connector use: ${use}.`);
    if (e.connectors?.offsite.length) L.push('', 'Off-site pages a browser call ended on (a sign-in your app sent it to, or a link it followed):', ...e.connectors.offsite.map((a) => `- ${a}`));
    if (e.connectors?.denied.length) L.push('', 'Connector calls refused (connectors are read-only; browser tools stay on your app\'s local pages):', ...e.connectors.denied.map((d) => `- R11: ${cell(d.reason)}`));
    if (e.plan) L.push('', `Plan: \`${e.plan}\` — approved by ${!e.planApprovedBy || e.planApprovedBy === 'lint, not a person' ? 'lint, not by a person' : e.planApprovedBy}.${e.fixRounds ? ' One fix round was used.' : ''}`);
    if (e.sessions.length) {
      L.push('', '| Session | Ended | Cost | Turns | Time | Refused calls (parked questions included) |', '|---|---|---|---|---|---|');
      for (const x of e.sessions) L.push(`| ${x.name} | ${cell(x.outcome === 'ok' ? 'ok' : `${x.outcome}: ${x.why}`)} | ${usd(x.costUsd)}${x.costEstimated ? ' (estimated)' : ''} | ${x.turns ?? 0} | ${mins(x.wallMs)} | ${x.denials ?? 0} |`);
    }
    if (e.checks.length) {
      L.push('', '| Driver check | Result | Failed |', '|---|---|---|');
      for (const c of e.checks) L.push(`| \`${c.file}\` | ${c.pass ? 'pass' : 'FAIL'} | ${cell(c.failed.join(', ') || '—')} |`);
    }
    if (e.audit?.skipped) L.push('', `Auditor: skipped — ${e.audit.skipped}.`);
    for (const a of e.audit?.runs ?? []) {
      const read = a.coverage ? ` It read ${a.coverage.read} of ${a.coverage.of} changed code files${a.coverage.seconds == null ? '' : ` in ${a.coverage.seconds} s`}${a.thin ? `: a thin review, ${a.accepted ? `passed on by ${a.accepted}` : 'not counted as the audit'}` : ''}.` : '';
      L.push('', `Auditor ${a.step} (${a.delta ? 'changes since the last audit only' : 'the whole epic diff'}): recommends ${a.recommend ?? '—'} — ${cell(a.summary)} (\`${a.file}\`)${read ? `.${read}` : ''}`);
      if (a.findings.length) {
        L.push('', '| # | Severity | Category | Parks | Evidence | Explanation |', '|---|---|---|---|---|---|');
        for (const x of a.findings) L.push(`| ${x.id} | ${x.severity} | ${x.category} | ${x.parks ? 'yes' : 'no'} | ${cell(x.evidence)} | ${cell(x.explanation)} |`);
      }
    }
    const mine = r.gates.filter((g) => g.epic === e.id);
    if (mine.length) {
      L.push('', 'Gates:');
      for (const g of mine) {
        const fate = g.void ? ` — VOID: ${g.void.why}` : g.decided?.used ? ` (used by run ${g.decided.used.run ?? '?'})` : g.superseded ? ' (superseded: the epic started over)' : g.cleared ? ' (cleared)' : g.decided ? ' — resumes the epic in the next run' : '';
        const d = g.decided ? `decided "${g.decided.answer}" by ${g.decided.by} on ${g.decided.date}${g.decided.prototype ? ' (answered by autopilot with the session\'s own recommendation, because this was a provisional run; nobody was asked)' : g.decided.standing ? ' (decided by autopilot on their standing answer for technical stops, given at launch; nobody was asked again)' : g.decided.asked ? ` (they were asked "${g.decided.asked}" and said yes)` : ''}${fate}${g.enters && !g.void ? ` at ${g.enters}` : ''}` : g.effect === 'none' ? `nothing to answer: it needs a change in the project${fate}` : `NOT DECIDED${fate}`;
        L.push(`- \`${g.file}\` (${g.kind}${g.fromEarlierRun ? `, from run ${g.run}` : ''}) — ${cell(g.decided ? g.question : g.ask?.question ?? g.question)} — ${d}`);
        if (g.options.length && !g.decided) L.push(`  Options: ${(g.ask?.options ?? g.options).map((o) => `"${o}"`).join(', ')}`);
        if (g.artifacts.length) L.push(`  Look at: ${g.artifacts.map((a) => `\`${a}\``).join(', ')}`);
        if (!g.decided && g.open?.length) L.push(`  Open: ${g.open.map((a) => `\`${a}\``).join(', ')}`);
        if (!g.decided && g.checks?.length) { L.push('  To confirm, one yes or no each:'); for (const c of g.checks) L.push(`  ${c.n}. ${c.clause} (${c.tor})`); }
        if (g.decided?.observations?.length) L.push(`  Confirmed line by line: ${g.decided.observations.map((o) => `${o.answer} — ${o.clause}`).join('; ')}`);
      }
    }
    if (e.unproven.length) {
      L.push('', 'Not proven for real (said by the reviewer or the verifier; nothing here stopped the epic):');
      for (const u of e.unproven) L.push(`- ${u.source === 'reviewer' ? `Reviewer${u.id ? ` ${u.id}` : ''}` : 'Verifier'}: ${cell(u.text)}`);
    }
    if (e.left.length) {
      L.push('', 'Seen wrong and left as is (said by the final check; each is a known defect in what merged or in what it stands on):');
      for (const u of e.left) L.push(`- ${cell(u.text)}`);
    }
    if (e.testChanges.length) {
      L.push('', 'Existing tests changed:');
      for (const t of e.testChanges) L.push(`- \`${t.path}\` — ${t.reason ?? 'NO REASON RECORDED'}`);
    }
    for (const ref2 of e.rejected) L.push('', `A rejected merge is kept in the clone at \`${ref2}\`.`);
    if (e.verifiedKept) L.push('', `The merge was undone; the final check's work is kept in the clone at \`${e.verifiedKept}\`.`);
  }
  L.push('', '## Words used in this report', ...GLOSSARY.map(([w, d]) => `- **${w}** — ${d}`));
  return L.join('\n') + '\n';
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Writes report.json and report.md into the run directory and returns the report data. */
export function writeReport(runDir) {
  const report = collectReport(runDir);
  writeAtomic(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeAtomic(path.join(runDir, 'report.md'), renderReport(report));
  return report;
}
