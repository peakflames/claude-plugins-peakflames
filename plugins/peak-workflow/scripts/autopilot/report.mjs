// Autopilot morning report (autopilot-poc-plan.md §6.9). `collectReport` reads a run directory
// and returns the data written as report.json; `renderReport` turns that data into report.md.
// Both are pure with respect to the run: they read files and never touch the clone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
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

/** Gate kinds hook R8 can replay from a person's recorded answer: the ones its policy table knows. */
export function replayableKinds(pluginAutopilotDir = HERE) {
  const policy = readJson(path.join(pluginAutopilotDir, 'policy', 'gates.json'), { answer: [], park: [] });
  return new Set([...policy.answer, ...policy.park].map((r) => r.kind));
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
  const replay = replayableKinds();

  // This run's gates: the ones it wrote, and the ones (from an earlier run) it used an answer of.
  const gateDir = path.join(workspace, 'gates');
  const gates = (fs.existsSync(gateDir) ? fs.readdirSync(gateDir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [])
    .map((file) => ({ file, g: readJson(path.join(gateDir, file)) })).filter(({ g }) => g && ((g.run ?? runName) === runName || g.decided?.used?.run === runName))
    .map(({ file, g }) => ({
      file: `gates/${file}`, epic: g.epic, label: (s.queue ?? []).find((q) => q.id === g.epic)?.label ?? g.epic, kind: g.kind, session: g.session ?? null, skillStep: g.skillStep ?? null, question: g.question ?? null, options: g.options ?? [],
      tor: g.tor ?? null, why: g.why ?? null, artifacts: g.artifacts ?? [], branch: g.branch ?? null, resume: g.resume ?? null, decided: g.decided ?? null,
      run: g.run ?? runName, fromEarlierRun: (g.run ?? runName) !== runName, effect: replay.has(g.kind) ? 'next-run' : 'by-hand',
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
      planApprovedBy: q.planStep ? 'lint, not a person' : null, plan: q.planStep ? `${rel}/${q.planStep}/plan.md` : null,
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
    driverVersion: s.driverVersion ?? null, epics, gates, referee,
  };
  report.next = nextSteps(report);
  return report;
}

/** "Do this next": what the owner does in the morning, most blocking first. */
function nextSteps(r) {
  const next = [];
  const ids = (list) => list.map((e) => e.id).join(', ');
  const by = (o) => r.epics.filter((e) => e.outcome === o);
  if (r.baseRed) next.push(`Fix the failing tests on \`${r.integration}\` (\`${r.testCommand}\`), then run autopilot again. Nothing was built on a red base.`);
  if (/^preflight:/.test(r.stoppedBecause ?? '')) next.push(`Fix what preflight refused (${r.stoppedBecause.replace(/^preflight:\s*/, '')}), then run autopilot again.`);
  const parked = by('PARKED');
  const open = r.gates.filter((g) => !g.decided && parked.some((e) => e.id === g.epic));
  const withGate = parked.filter((e) => open.some((g) => g.epic === e.id));
  const noGate = parked.filter((e) => !r.gates.some((g) => g.epic === e.id && e.gates.includes(path.basename(g.file))));
  if (open.length) next.push(`Decide ${plural(open.length, 'parked gate')}: \`/peak-workflow:autopilot report\` (${ids(withGate)})`);
  if (noGate.length) next.push(`Look at ${plural(noGate.length, 'parked epic')} with no question to answer (${ids(noGate)}): the reason and the branch are under "Per epic".`);
  const decided = r.gates.filter((g) => g.decided && !g.decided.used);
  const epicsOf = (list) => [...new Set(list.map((g) => g.epic))].join(', ');
  const byHand = decided.filter((g) => g.effect === 'by-hand'); const replay = decided.filter((g) => g.effect === 'next-run');
  if (byHand.length) next.push(`Carry on by hand where you decided a gate (${epicsOf(byHand)}): the command is under "Per epic".`);
  if (by('FAILED').length) next.push(`Read why ${plural(by('FAILED').length, 'epic')} failed verification (${ids(by('FAILED'))}); its branch is kept in the clone.`);
  if (by('MERGED').length) next.push(`Review and bring in the merged work (${ids(by('MERGED'))}):\n   git fetch "${r.clone}" ${r.integration}:autopilot/${r.integration} && git log ${r.integration}..autopilot/${r.integration}`);
  if (replay.length) next.push(`${by('MERGED').length ? 'Once the merged work is in the project, run' : 'Run'} \`/peak-workflow:autopilot\` again to use ${plural(replay.length, 'decided answer')} (${epicsOf(replay)}): each is pre-approved once.`);
  if (r.referee.testChanges.length) next.push(`Read the recorded reason for ${plural(r.referee.testChanges.length, 'changed existing test')} (under "Per epic").`);
  if (by('BLOCKED').length) next.push(`${plural(by('BLOCKED').length, 'epic')} never started because a dependency did not merge (${ids(by('BLOCKED'))}); queue them again once it has.`);
  return next;
}

export function renderReport(r) {
  const L = [];
  L.push(`# Autopilot — ${stamp(r.run)} → ${r.ended ? stamp(r.ended) : 'still running'} (stopped: ${r.stoppedBecause ?? 'not yet'})`);
  L.push(`Workspace: ${r.workspace} — run ${r.name}. Paths below are relative to the workspace.`);
  L.push(`Integration line: ${r.integration} in ${r.clone} (not pushed). Spent ${usd(r.spentUsd)}${r.budgetUsd == null ? '' : ` of $${r.budgetUsd}`}.`);

  L.push('', '## Do this next');
  if (r.next.length) r.next.forEach((n, i) => L.push(`${i + 1}. ${n}`)); else L.push('Nothing to do.');

  L.push('', '## Results', '| Epic | Outcome | Why | Evidence | Cost | Time |', '|---|---|---|---|---|---|');
  for (const e of r.epics) L.push(`| ${cell(e.label)} | ${e.outcome} | ${cell(e.reason)} | ${cell(e.evidence)} | ${usd(e.costUsd)} | ${mins(e.elapsedMs)} |`);
  if (!r.epics.length) L.push('| (the queue was empty) | | | | | |');

  const ref = r.referee;
  L.push('', '## Referee');
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
  L.push('Every plan was approved by lint, not by a person.');

  L.push('', '## Per epic');
  for (const e of r.epics) {
    L.push('', `### ${e.label} — ${e.outcome}`, '', e.reason ?? '(no reason recorded)');
    if (e.plan) L.push('', `Plan: \`${e.plan}\` — approved by lint, not by a person.${e.fixRounds ? ' One fix round was used.' : ''}`);
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
        const d = g.decided ? `decided "${g.decided.answer}" by ${g.decided.by} on ${g.decided.date}${g.decided.used ? ' (used)' : g.effect === 'next-run' ? ' — pre-approved once for the next run' : ' — continue by hand'}` : 'NOT DECIDED';
        L.push(`- \`${g.file}\` (${g.kind}${g.fromEarlierRun ? `, from run ${g.run}` : ''}) — ${cell(g.question)} — ${d}`);
        if (g.artifacts.length) L.push(`  Look at: ${g.artifacts.map((a) => `\`${a}\``).join(', ')}`);
        if (!g.decided?.used && g.resume && g.effect === 'by-hand') L.push(`  By hand: ${g.resume}`);
      }
    }
    if (e.testChanges.length) {
      L.push('', 'Existing tests changed:');
      for (const t of e.testChanges) L.push(`- \`${t.path}\` — ${t.reason ?? 'NO REASON RECORDED'}`);
    }
    for (const ref2 of e.rejected) L.push('', `A rejected merge is kept in the clone at \`${ref2}\`.`);
  }
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
