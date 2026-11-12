// Autopilot morning report (autopilot-poc-plan.md §6.9). `collectReport` reads a run directory
// and returns the data written as report.json; `renderReport` turns that data into report.md.
// Both are pure with respect to the run: they read files and never touch the clone.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gateEntry } from './lib.mjs';

const TERMINAL = new Set(['MERGED', 'PARKED', 'FAILED', 'SKIPPED', 'BLOCKED']);
const RULES = {
  R0: 'referee error', R1: 'kill switch', R2: 'path jail', R3: 'git rule', R4: 'container, VM or global install', R5: 'disk floor or growth cap',
  R6: 'background task', R7: 'test edit without reason', R8: 'gate policy', R9: 'plan mode',
};

const readJson = (p, fallback = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const readLines = (p) => {
  try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
};
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
  const gates = (fs.existsSync(gateDir) ? fs.readdirSync(gateDir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [])
    .map((file) => ({ file, g: readJson(path.join(gateDir, file)) })).filter(({ g }) => g && ((g.run ?? runName) === runName || g.decided?.used?.run === runName || g.void?.run === runName || (queued.has(g.epic) && live(g) && g.kind !== 'preflight')))
    .map(({ file, g }) => ({
      file: `gates/${file}`, epic: g.epic, label: (s.queue ?? []).find((q) => q.id === g.epic)?.label ?? g.epic, kind: g.kind, session: g.session ?? null, skillStep: g.skillStep ?? null, question: g.question ?? null, options: g.options ?? [],
      tor: g.tor ?? null, why: g.why ?? null, artifacts: g.artifacts ?? [], branch: g.branch ?? null, branchTip: g.branchTip ?? null, phase: g.phase ?? null, resume: g.resume ?? null, decided: g.decided ?? null,
      run: g.run ?? runName, fromEarlierRun: (g.run ?? runName) !== runName, void: g.void ?? null, superseded: !!g.superseded, cleared: !!g.cleared,
      // Every gate with options resumes its epic in the next run once decided; `resume` is the by-hand fallback.
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
      return { step: a.step, file: `${rel}/${a.file}`, delta: !!a.delta, base: a.base ?? null, tip: a.tip ?? null, recommend: j.recommend ?? null, summary: j.summary ?? null, findings: j.findings ?? [] };
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
      testChanges: q.testChanges ?? [], rejected: q.rejected ?? [], fixRounds: q.fixRounds ?? 0,
      planApprovedBy: q.planStep || q.plan ? (!q.planApprovedBy || q.planApprovedBy === 'lint' ? 'lint, not a person' : q.planApprovedBy) : null, plan: q.plan ?? (q.planStep ? `${rel}/${q.planStep}/plan.md` : null),
      resumed: q.resumed ?? null, voided: q.voided ?? null, superseded: q.superseded ?? [], auditOverruled: q.auditOverruled ?? null, look: q.look ?? null, fixedAtWrapup: q.fixedAtWrapup ?? null,
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
    spentUsd: s.spentUsd ?? 0, budgetUsd: s.runBudgetUsd ?? config.runBudgetUsd ?? null, testCommand: s.testCommand ?? config.testCommand ?? null, baseRed: s.baseRed ?? null,
    driverVersion: s.driverVersion ?? null, sync: s.sync ?? null, stoppedOnPark: s.stoppedOnPark ?? null, epics, gates, referee,
  };
  // Is the clone's integration tip already in the project? (null: cannot tell — no project, no clone.) Read-only.
  const git = (cwd, ...args) => { try { return spawnSync('git', args, { cwd, encoding: 'utf8' }); } catch { return { status: 1, stdout: '' }; } };
  const cloneTip = fs.existsSync(clone) ? (git(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${s.integration}`).stdout ?? '').trim() : '';
  report.workInProject = cloneTip && config.project && fs.existsSync(config.project) ? git(config.project, 'merge-base', '--is-ancestor', cloneTip, s.integration).status === 0 : null;
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
      : `The finished work is in autopilot's own private copy of your project, not in your project yet. Nothing in your project has changed; you bring the work in yourself with one command (under "Do this next").`)
    : 'Nothing in your project has changed. Autopilot works in its own private copy and never writes to your project.');
  if (open) T.push(`${plural(open, 'question')} only you can answer ${open === 1 ? 'is' : 'are'} waiting. Run \`/peak-workflow:autopilot report\` and it asks you each one; the work then continues from where it stopped in the next run.`);
  if (r.baseRed) T.push(`Nothing was built, because your project's own tests were already failing before autopilot started.`);
  else if (r.stoppedOnPark) T.push('The run ended early on purpose: by default it stops at the first epic that needs you, so nothing else is built on a guess.');
  else if (r.stoppedBecause && !['queue done', 'nothing runnable'].includes(r.stoppedBecause)) T.push(`The run ended early: ${r.stoppedBecause}.`);
  T.push(`It ran from ${stamp(r.run)} to ${r.ended ? stamp(r.ended) : '(still running)'} and spent ${usd(r.spentUsd)}${r.budgetUsd == null ? '' : ` of a $${r.budgetUsd} limit`}.`);
  T.push(r.next.length ? `What to do: follow "Do this next" below, from the top. It has ${plural(r.next.length, 'step')}.` : 'Nothing needs you.');
  return T;
}

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

/** "Do this next": what the owner does in the morning, most blocking first. */
function nextSteps(r) {
  const next = [];
  const ids = (list) => list.map((e) => e.id).join(', ');
  const by = (o) => r.epics.filter((e) => e.outcome === o);
  if (r.baseRed) next.push(`Fix the failing tests on \`${r.integration}\` (\`${r.testCommand}\`), then run autopilot again. Nothing was built on a red base.`);
  if (/^preflight:/.test(r.stoppedBecause ?? '')) next.push(`Fix what preflight refused (${r.stoppedBecause.replace(/^preflight:\s*/, '')}), then run autopilot again.`);
  const parked = by('PARKED');
  const liveGate = (g) => !g.decided?.used && !g.void && !g.superseded && !g.cleared;
  const epicsOf = (list) => [...new Set(list.map((g) => g.epic))].join(', ');
  const open = r.gates.filter((g) => !g.decided && liveGate(g) && g.effect === 'resume');
  const noGate = parked.filter((e) => !r.gates.some((g) => g.epic === e.id && e.gates.includes(path.basename(g.file))));
  const projectFix = r.gates.filter((g) => g.kind === 'preflight' && liveGate(g) && parked.some((e) => e.id === g.epic));
  if (open.length) next.push(`Answer ${plural(open.length, 'waiting question')}: \`/peak-workflow:autopilot report\` (${epicsOf(open)})`);
  if (projectFix.length) next.push(`Fix in the project what stopped ${plural(projectFix.length, 'epic')} before it started (${epicsOf(projectFix)}); nothing to answer — the reason is under "Per epic".`);
  if (noGate.length) next.push(`Look at ${plural(noGate.length, 'parked epic')} with no question to answer (${ids(noGate)}): the reason and the branch are under "Per epic". Queued again, such an epic starts over.`);
  const decided = r.gates.filter((g) => g.decided && liveGate(g));
  const voided = r.epics.filter((e) => e.voided);
  if (voided.length) next.push(`${plural(voided.length, 'decision')} could not be used and the epic was planned again from scratch (${ids(voided)}): the reason is under "Per epic".`);
  if (by('FAILED').length) next.push(`Read why ${plural(by('FAILED').length, 'epic')} failed verification (${ids(by('FAILED'))}); its branch is kept in the clone.`);
  const waiting = r.sync?.state === 'clone-ahead' ? r.sync.waiting : [];
  const fetch = `git fetch "${r.clone}" ${r.integration}:autopilot/${r.integration} && git log ${r.integration}..autopilot/${r.integration}`;
  if (r.workInProject === true) { if (by('MERGED').length) next.push(`The merged work (${ids(by('MERGED'))}) is already in your project's \`${r.integration}\`: nothing to bring in.`); }
  else if (by('MERGED').length) next.push(`Review and bring in the merged work (${ids(by('MERGED'))}${waiting.length ? `, and ${plural(waiting.length, 'commit')} from earlier runs still waiting in the clone` : ''}):\n   ${fetch}`);
  else if (waiting.length) next.push(`Bring in the work earlier runs merged, still waiting in the clone (${plural(waiting.length, 'commit')}):\n   ${fetch}`);
  if (decided.length) next.push(`Run \`/peak-workflow:autopilot\` again: ${plural(decided.length, 'decided gate')} (${epicsOf(decided)}) ${decided.length === 1 ? 'resumes its epic' : 'resume their epics'} on the branch this run left. A decision holds while that branch is unchanged and still merges cleanly into \`${r.integration}\`.`);
  if (r.referee.testChanges.length) next.push(`Read the recorded reason for ${plural(r.referee.testChanges.length, 'changed existing test')} (under "Per epic").`);
  const notStarted = by('NOT STARTED');
  if (r.stoppedOnPark && notStarted.length) next.push(`${plural(notStarted.length, 'epic')} did not start (${ids(notStarted)}): the run stops at the first epic that parks or fails. To keep building independent epics after a park, put \`{"onPark": "continue"}\` in \`${r.stoppedOnPark.settingsFile}\`.`);
  if (by('BLOCKED').length) next.push(`${plural(by('BLOCKED').length, 'epic')} never started because a dependency did not merge (${ids(by('BLOCKED'))}); queue them again once it has.`);
  return next;
}

export function renderReport(r) {
  const L = [];
  L.push(`# Autopilot — ${stamp(r.run)} → ${r.ended ? stamp(r.ended) : 'still running'} (stopped: ${r.stoppedBecause ?? 'not yet'})`);
  L.push('', '## TL;DR', ...r.tldr.map((t) => `- ${t}`));
  L.push('', 'New to this report? "Words used in this report", at the end, explains every term.');
  L.push('', '## Where things are');
  L.push(`Workspace: ${r.workspace} — run ${r.name}. Paths below are relative to the workspace.`);
  L.push(`Integration line: ${r.integration} in ${r.clone} (not pushed). Spent ${usd(r.spentUsd)}${r.budgetUsd == null ? '' : ` of $${r.budgetUsd}`}.`);

  if (r.sync?.state === 'project-ahead') L.push(`At the start the clone's ${r.integration} was fast-forwarded to the project's (${String(r.sync.cloneTip).slice(0, 9)} → ${String(r.sync.projectTip).slice(0, 9)}).`);
  if (r.sync?.state === 'clone-ahead') L.push(`At the start the clone was ahead of the project by work not fetched yet; this run built on top of it: ${r.sync.waiting.join('; ')}.`);

  L.push('', '## Do this next');
  if (r.next.length) r.next.forEach((n, i) => L.push(`${i + 1}. ${n}`)); else L.push('Nothing to do.');

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
    if (e.voided) L.push('', `Your decision "${e.voided.answer}" on \`${e.voided.gate}\` was void — ${e.voided.why}. The epic was planned again from scratch.`);
    for (const ref of e.superseded) L.push('', `The earlier branch is kept in the clone at \`${ref}\`.`);
    if (e.fixedAtWrapup?.approvedBy) L.push('', `Fixed during verification, on your "Fix now" (\`${e.fixedAtWrapup.approvedBy}\`): ${e.fixedAtWrapup.files.join(', ') || 'no code file'}. The verifier checked its own fix; no separate audit ran on it.`);
    if (e.auditOverruled) L.push('', `Verified as built: ${e.auditOverruled.by} judged the auditor's findings not real (\`${e.auditOverruled.gate}\`).`);
    if (e.look) L.push('', `Human check: ${e.look.by} looked on ${e.look.date} and answered "Looks right" (\`${e.look.gate}\`); wrapup's manual-verification question was answered with that.`);
    if (e.plan) L.push('', `Plan: \`${e.plan}\` — approved by ${!e.planApprovedBy || e.planApprovedBy === 'lint, not a person' ? 'lint, not by a person' : e.planApprovedBy}.${e.fixRounds ? ' One fix round was used.' : ''}`);
    if (e.sessions.length) {
      L.push('', '| Session | Ended | Cost | Turns | Time | Refused calls (parked questions included) |', '|---|---|---|---|---|---|');
      for (const x of e.sessions) L.push(`| ${x.name} | ${cell(x.outcome === 'ok' ? 'ok' : `${x.outcome}: ${x.why}`)} | ${usd(x.costUsd)} | ${x.turns ?? 0} | ${mins(x.wallMs)} | ${x.denials ?? 0} |`);
    }
    if (e.checks.length) {
      L.push('', '| Driver check | Result | Failed |', '|---|---|---|');
      for (const c of e.checks) L.push(`| \`${c.file}\` | ${c.pass ? 'pass' : 'FAIL'} | ${cell(c.failed.join(', ') || '—')} |`);
    }
    if (e.audit?.skipped) L.push('', `Auditor: skipped — ${e.audit.skipped}.`);
    for (const a of e.audit?.runs ?? []) {
      L.push('', `Auditor ${a.step} (${a.delta ? 'changes since the last audit only' : 'the whole epic diff'}): recommends ${a.recommend ?? '—'} — ${cell(a.summary)} (\`${a.file}\`)`);
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
        const d = g.decided ? `decided "${g.decided.answer}" by ${g.decided.by} on ${g.decided.date}${fate}${g.enters && !g.void ? ` at ${g.enters}` : ''}` : g.effect === 'none' ? `nothing to answer: fix it in the project${fate}` : `NOT DECIDED${fate}`;
        L.push(`- \`${g.file}\` (${g.kind}${g.fromEarlierRun ? `, from run ${g.run}` : ''}) — ${cell(g.question)} — ${d}`);
        if (g.options.length && !g.decided) L.push(`  Options: ${g.options.map((o) => `"${o}"`).join(', ')}`);
        if (g.artifacts.length) L.push(`  Look at: ${g.artifacts.map((a) => `\`${a}\``).join(', ')}`);
        if (!g.decided?.used && !g.superseded && !g.cleared && g.resume) L.push(`  By hand instead: ${g.resume}`);
      }
    }
    if (e.testChanges.length) {
      L.push('', 'Existing tests changed:');
      for (const t of e.testChanges) L.push(`- \`${t.path}\` — ${t.reason ?? 'NO REASON RECORDED'}`);
    }
    for (const ref2 of e.rejected) L.push('', `A rejected merge is kept in the clone at \`${ref2}\`.`);
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
