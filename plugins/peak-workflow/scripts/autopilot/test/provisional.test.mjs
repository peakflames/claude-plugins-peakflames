// A provisional run (the run's `mode: "provisional"`, the owner's answer at launch), against fake-claude:
// what it goes past that a full run stops at, what it records for the owner, and what still stops it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadConfig, parseSidecar, status } from '../driver.mjs';
import { eventLine } from '../attend.mjs';
import { PROTOTYPE_LIMIT } from '../lib.mjs';
import { DRIVER, E1, TL, addEpic, buildActions, buildScript, git, happy, makeProject, planScript, readJson, wrapupActions, wrapupScript } from './helpers.mjs';

const PROTO = { config: { mode: 'provisional' } };
const gate = (p, id, n = 1) => readJson(path.join(p.state, 'gates', `${id}-${n}.json`));
const gateCount = (p) => (fs.existsSync(path.join(p.state, 'gates')) ? fs.readdirSync(path.join(p.state, 'gates')).length : 0);
const ask = (question, options) => ({ do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, header: 'Gate', multiSelect: false, options: options.map((label) => ({ label, description: '' })) }] } });
const tools = (p, id, step) => fs.readFileSync(p.dir(id, step, 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).out);
const check = (p, id, name) => readJson(p.dir(id, name));
const sidecar = (p, e) => parseSidecar(git(p.clone, 'show', `develop:docs/implementation-plan/status/epic-${e.id}.md`));
const appended = (call) => call.argv.filter((a, i) => call.argv[i - 1] === '--append-system-prompt-file').map((f) => fs.readFileSync(f, 'utf8')).join('\n');

/** What the change record of an amendment nobody approved says (the hook tells the session to write it so). */
const PROTO_RECORD = '# change record\napproved_via = "epic-branch"\napproved_by = "autopilot (provisional run)"\n';
const DEFERRAL = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];
const deferQ = (tor, rec = 'Defer — the export screen is built by a later epic') => `${tor} cannot be fully met: it needs the export screen. Recommendation: ${rec}. How to proceed?`;
const amendQ = (tor) => `${tor} — The tool shall import every row looks wrong: the sample data has a header row. Proposed: same title / Then: "rows after the header are imported". How to proceed?`;
const AMEND = (tor) => [`Amend ${tor} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];

/** An epic with one operator-observed requirement (as resume-helpers.mjs builds it). */
function addLookEpic(p, spec = { id: 'Lg5Chr8', slug: 'chart', name: 'Spending chart', nn: '05' }) {
  const e = addEpic(p.project, spec);
  const file = path.join(p.project, 'docs', 'requirements', `${spec.nn}-${spec.slug}.feature.md`);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^(Scenario: .*)$/m, '$1\n    # Verification: operator-observed'));
  git(p.project, 'commit', '-qam', 'docs: the chart is checked by a person');
  return e;
}
const buildWithManual = (e) => ({ actions: [...buildActions(e, { commit: false }), { do: 'write', path: `test/${e.slug}.test.js`, content: "import test from 'node:test';\ntest('the chart command exists', () => {});\n" }, { do: 'write', path: `tests/manual/${e.tors[0]}.md`, content: `# Manual check — ${e.tors[0]}\n\n1. Open chart.html\n` }, { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }] });
/** A final check that records the requirement as the provisional rules say (or as `mark` says instead), then completes and merges. */
const wrapupMarking = (e, mark, opts = {}) => {
  const a = wrapupActions(e, opts);
  a[1] = { do: 'exec', cmd: `${TL} mark ${e.id} ${mark}` };
  return { actions: a, result: { total_cost_usd: 1.3, result: `Verdict: PASS\n\n## Not proven for real\n- ${e.tors[0]}: nobody opened the chart` } };
};
/** The implemented handoff of a build that deferred `tors`, each to epic `succ`. */
const handoffDeferring = (tors, succ) => `# Epic handoff\n\n## Deferrals\n\nCount: ${tors.length}\n\n| TOR ID | Unmet | Why | Decision | Successor epic |\n|---|---|---|---|---|\n${tors.map((t) => `| ${t} | the export | needs the export screen | Defer | ${succ} |`).join('\n')}\n\n## Key Files\n\n- src\n`;
/** A build that asks the deferral question(s), then leaves what the skill leaves after "Defer": the row, and the skipped test. */
function deferringBuild(e, questions, deferredTors, succ) {
  const a = buildActions(e, { commit: false });
  return { actions: [
    { do: 'branch', name: e.branch }, ...questions, ...a.slice(1),
    { do: 'write', path: `test/${e.slug}.test.js`, content: `import test from 'node:test';\n${e.tors.map((t) => (deferredTors.includes(t) ? `test('${t} is met', { skip: 'Deferred: ${t} — needs the export screen' }, () => {});` : `test('${t} is met', () => {});`)).join('\n')}\n` },
    { do: 'write', path: `docs/implementation-plan/session-handoffs/epic-${e.id}-implemented.md`, content: handoffDeferring(deferredTors, succ.id) },
    { do: 'exec', cmd: `printf '\\n| %s | later |\\n' '${deferredTors[0]}' >> docs/implementation-plan/phase-1-core/epic-${succ.id}-${succ.slug}.md && sed -i.bak 's/^requirements: .*/&, ${deferredTors.join(', ')}/' docs/implementation-plan/status/epic-${succ.id}.md && rm docs/implementation-plan/status/epic-${succ.id}.md.bak` },
    { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` },
  ] };
}
/** The final check of an epic whose deferral stands: the same question, the waiver, and the counts that say so. */
function waivingWrapup(e, deferredTors, succ) {
  const a = wrapupActions(e, { counts: [deferredTors.length, 0, deferredTors.length, 0, 0, 0] });
  a[1] = { do: 'exec', cmd: `${TL} mark ${e.id} --pass ${e.tors.filter((t) => !deferredTors.includes(t)).join(' ')}` };
  a[2] = { do: 'sidecar', set: { ...a[2].set, waived: deferredTors.map((t) => `${t} → ${succ.id}`).join(', ') } };
  const asks = deferredTors.map((t) => ask(`${t} is FAIL: the export is not there. Recommendation: Defer — the implementer's row names ${succ.id}. How to proceed?`, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs']));
  return { actions: [a[0], ...asks, ...a.slice(1)], result: { total_cost_usd: 1.3, result: 'Verdict: PASS' } };
}

test('a full run is unchanged: a requirement a person must observe, a proposed correction and a recommended deferral each park', async (t) => {
  const p = makeProject(t);
  const look = addLookEpic(p);
  const am = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' });
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, ask(deferQ(E1.tors[3]), DEFERRAL)] },
    [`${am.id}/plan`]: { actions: [ask(amendQ(am.tors[0]), AMEND(am.tors[0]))] },
    [`${look.id}/plan`]: planScript(look), [`${look.id}/build`]: buildWithManual(look),
  });
  const s = await p.go();
  assert.equal(s.mode, 'full');
  assert.deepEqual(s.queue.map((q) => [q.id, q.state]).sort(), [[E1.id, 'PARKED'], [am.id, 'PARKED'], [look.id, 'PARKED']].sort());
  assert.deepEqual([gate(p, E1.id), gate(p, am.id), gate(p, look.id)].map((g) => [g.kind, g.decided]), [['deferral', null], ['amendment', null], ['human-check', null]]);
  assert.ok(!p.steps().some((k) => /verify/.test(k)), 'nothing reached the final check');
  const st = status(p.project, p.state);
  assert.deepEqual([st.mode, st.unobserved, st.decidedForYou], ['full', [], []], 'the default is recorded with the run; nothing was decided for the owner');
});

test('provisional: a requirement a person must observe does not park; it merges recorded as not verified, and is listed with the command that checks it later', async (t) => {
  const p = makeProject(t, PROTO);
  const e = addLookEpic(p);
  p.scenario({ ...happy(E1), [`${e.id}/plan`]: planScript(e), [`${e.id}/build`]: buildWithManual(e), [`${e.id}/verify`]: wrapupMarking(e, `--fail ${e.tors[0]} "NOT OBSERVED — provisional run: open chart.html and look at the bars"`) });
  const s = await p.go();
  assert.equal(s.mode, 'provisional');
  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[E1.id, 'MERGED'], [e.id, 'MERGED']]);
  assert.equal(gateCount(p), 0, 'no look gate was written');
  // The verifier was told before it started, and so was the referee.
  const call = p.calls().find((c) => c.key === `${e.id}/verify-1`);
  assert.match(appended(call), new RegExp(`# Requirements nobody will observe in this run[\\s\\S]*\\*\\*${e.tors[0]}\\*\\*[\\s\\S]*the standard output should contain the string "chart"[\\s\\S]*never\\s+record a PASS[\\s\\S]*NOT OBSERVED — provisional run`));
  assert.deepEqual(readJson(p.dir(e.id, 'verify-1', 'step.json')).unobserved.map((u) => u.tor), [e.tors[0]]);
  // The status file says so, and never says verified.
  const sc = sidecar(p, e);
  assert.deepEqual([sc.fields.status, Object.keys(sc.verified)], ['Complete', []]);
  assert.match(sc.unverified[e.tors[0]], /^\d{4}-\d{2}-\d{2} NOT OBSERVED — provisional run: open chart\.html/);
  assert.deepEqual(check(p, e.id, 'check-verify-1.json').checks.find((c) => c.name === 'sidecar-on-integration').evidence.notObservedInThisPrototypeRun, [e.tors[0]]);
  const st = status(p.project, p.state);
  assert.deepEqual(st.unobserved.map((u) => [u.epic, u.tor, u.check]), [[e.id, e.tors[0], `/peak-workflow:wrapup-epic ${e.id} reverify ${e.tors[0]}`]]);
  assert.ok(st.unobserved[0].clauses.length >= 1);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /How careful this run was: a provisional run/);
  assert.match(md, new RegExp(`## Decided for you in this provisional run[\\s\\S]*\\*\\*Requirements nobody observed\\*\\*[\\s\\S]*${e.tors[0]}[\\s\\S]*wrapup-epic ${e.id} reverify ${e.tors[0]}`));
  const events = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => eventLine(JSON.parse(l)));
  assert.ok(events.includes('Autopilot started: 2 epics queued, as a provisional run: it keeps building and lists what it decided for you at the end.'));
  assert.ok(events.some((l) => /^Not stopping .*Spending chart for your look \(provisional run\): .* will be recorded as not observed$/.test(l ?? '')), events.join('\n'));
});

test('provisional: without the not-observed record the merge check fails, and so does a verified line nobody could have earned', async (t) => {
  for (const [mark, evidence] of [[null, 'anchorsWithoutVerifiedLine'], ['--pass', 'verifiedThoughNobodyObserved'], ['--fail-plain', 'anchorsWithoutVerifiedLine']]) {
    const p = makeProject(t, PROTO);
    const e = addLookEpic(p);
    const verify = mark === null ? wrapupMarking(e, '') : mark === '--pass' ? wrapupScript(e) : wrapupMarking(e, `--fail ${e.tors[0]} "the bars overlap"`);
    if (mark === null) verify.actions.splice(1, 1); // nothing recorded at all
    p.scenario({ [`${e.id}/plan`]: planScript(e), [`${e.id}/build`]: buildWithManual(e), [`${e.id}/verify`]: verify });
    const s = await p.go({ queue: [e.id] });
    assert.equal(s.queue[0].state, 'PARKED', String(mark));
    assert.match(s.queue[0].reason, /merge gate failed \(sidecar-on-integration\)/, String(mark));
    assert.deepEqual(check(p, e.id, 'check-verify-1.json').checks.find((c) => c.name === 'sidecar-on-integration').evidence[evidence], [e.tors[0]], String(mark));
    assert.deepEqual(status(p.project, p.state).unobserved, [], 'nothing unmerged is listed as merged');
  }
});

test('provisional: the planner\'s proposed correction is taken; the gate is recorded decided, the build may change the requirement file, and the owner is shown old and proposed text', async (t) => {
  const p = makeProject(t, PROTO);
  const tor = E1.tors[0];
  const build = buildActions(E1, { commit: false });
  p.scenario({
    [`${E1.id}/plan`]: { actions: [ask(amendQ(tor), AMEND(tor)), ...planScript(E1).actions], result: planScript(E1).result },
    // The builder meets the same requirement and asks again: the same answer, not a second decision.
    [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, ask(amendQ(tor), AMEND(tor)), ...build.slice(1), { do: 'exec', cmd: "printf '\\n# amended in the epic\\n' >> docs/requirements/01-csv-import.feature.tracing.json.note" }, { do: 'write', path: 'docs/requirements/changes/CR-test.md', content: PROTO_RECORD }, { do: 'commit', message: `feat(epic-${E1.id}): implement ${E1.slug}` }] },
    [`${E1.id}/verify`]: wrapupScript(E1),
  });
  const s = await p.go();
  const q = s.queue[0];
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`, `${E1.id}/build-1`, `${E1.id}/audit-1`, `${E1.id}/verify-1`], 'nothing parked');
  assert.deepEqual(Object.values(tools(p, E1.id, 'plan-1')[0].hookSpecificOutput.updatedInput.answers), [AMEND(tor)[0]]);
  assert.match(tools(p, E1.id, 'plan-1')[0].hookSpecificOutput.permissionDecisionReason, /the owner's provisional setting for this run: Amend .*No person picked this just now/);
  assert.deepEqual(Object.values(tools(p, E1.id, 'build-1').find((o) => o?.hookSpecificOutput?.updatedInput?.answers).hookSpecificOutput.updatedInput.answers), [AMEND(tor)[0]]);
  assert.equal(gateCount(p), 1, 'one decision, one record');
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.tor, g.session, g.decided.answer, g.decided.by, g.decided.standing, g.decided.prototype, g.decided.used.session], ['amendment', tor, 'plan-1', AMEND(tor)[0], 'autopilot (provisional run)', true, true, 'plan-1']);
  const scope = check(p, E1.id, 'check-build-1.json').checks.find((c) => c.name === 'scope');
  assert.equal(scope.pass, true, JSON.stringify(scope));
  assert.match(scope.evidence, /requirement files changed under the amendment this provisional run took, not yet seen by the owner, of /);
  assert.equal(check(p, E1.id, 'check-build-1.json').checks.find((c) => c.name === 'amendment-record').pass, true);
  assert.match(tools(p, E1.id, 'plan-1')[0].hookSpecificOutput.permissionDecisionReason, /approved_by = "autopilot \(provisional run\)"/);
  assert.deepEqual(q.amendedUnseen, [tor]);
  assert.equal(q.state, 'MERGED', q.reason);
  assert.equal(q.prototype.length, 1);
  assert.match(q.prototype[0].was, new RegExp(`^Scenario: \\[${tor}\\]`));
  assert.equal(q.prototype[0].proposed, 'same title / Then: "rows after the header are imported".');
  const st = status(p.project, p.state);
  assert.deepEqual(st.decidedForYou.map((d) => [d.prototype, d.kind, d.tor, d.did]), [[true, 'amendment', tor, `took the proposed correction to ${tor}`]]);
  assert.ok(st.decidedForYou[0].was && st.decidedForYou[0].proposed);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, new RegExp(`\\*\\*Requirements changed on a session's proposal\\*\\*\\n- ${tor} \\(.*; merged\\)[\\s\\S]*As it read:\\n  > Scenario: \\[${tor}\\][\\s\\S]*Proposed: same title`));
  assert.ok(!/on your standing answer for technical stops: /.test(md), 'not listed as a technical stop');
  assert.ok(!/amended with your approval/.test(md) && /amended without your approval, on a session's proposal/.test(md), 'never said to be approved by the owner');
  const events = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => eventLine(JSON.parse(l)));
  assert.ok(events.includes(`Took the planner's correction to ${tor} for you (provisional run)`), events.join('\n'));
});

test('provisional: a deferral the builder recommends is taken through the build checks and the merge; "Stop" still parks', async (t) => {
  const p = makeProject(t, PROTO);
  const succ = addEpic(p.project, { id: 'Lg7Exp5', slug: 'export', name: 'Export', nn: '07', deps: [E1.id] });
  const stop = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' });
  const tor = E1.tors[3];
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: deferringBuild(E1, [ask(deferQ(tor), DEFERRAL)], [tor], succ), [`${E1.id}/verify`]: waivingWrapup(E1, [tor], succ),
    [`${stop.id}/plan`]: planScript(stop), [`${stop.id}/build`]: { actions: [{ do: 'branch', name: stop.branch }, ask(deferQ(stop.tors[0], 'Stop — the rule list is not final'), DEFERRAL)] },
    // The later epic builds only its own requirement: the driver now holds it to the deferred one too.
    ...happy(succ),
  });
  const s = await p.go({ queue: [E1.id, stop.id, succ.id] });
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`${succ.id}: now also anchors ${E1.tors[3]}, deferred to it by ${E1.id}`));
  assert.deepEqual([s.queue[2].state, s.queue[2].reason], ['PARKED', `plan lint failed: does not name anchor ${E1.tors[3]}`], 'its plan, written for its own requirement alone, is not accepted');
  const q = s.queue[0];
  assert.equal(q.state, 'MERGED', `${q.reason} ${JSON.stringify(q.checks)}`);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.tor, g.recommendation, g.decided.answer, g.decided.prototype], ['deferral', tor, 'Defer', DEFERRAL[1], true]);
  const cb = check(p, E1.id, 'check-build-1.json').checks;
  assert.match(cb.find((c) => c.name === 'handoff').evidence, new RegExp(`Deferrals Count: 1 \\(${tor}: deferred on the builder's recommendation`));
  assert.equal(cb.find((c) => c.name === 'tests-green').evidence.skipsAllowedForDeferrals, 1);
  assert.equal(cb.find((c) => c.name === 'scope').pass, true, 'the later epic\'s spec and status file may gain the requirement');
  // The final check asked the same thing and was given the same answer, with no second record.
  assert.deepEqual(Object.values(tools(p, E1.id, 'verify-1').find((o) => o?.hookSpecificOutput?.updatedInput?.answers).hookSpecificOutput.updatedInput.answers), [DEFERRAL[1]]);
  const cv = check(p, E1.id, 'check-verify-1.json').checks;
  assert.deepEqual(cv.find((c) => c.name === 'no-waivers').evidence.deferredInThisPrototypeRun, [tor]);
  assert.deepEqual(sidecar(p, E1).fields.waived, `${tor} → ${succ.id}`);
  assert.deepEqual(status(p.project, p.state).decidedForYou.filter((d) => d.epic === E1.id).map((d) => d.did), [`deferred ${tor} to a later epic, as the builder recommended`]);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), new RegExp(`\\*\\*Requirements left for a later epic, on the builder's recommendation\\*\\*\\n- ${tor} `));
  // "Stop" is nobody's to take: it parks, as in a full run.
  assert.deepEqual([s.queue[1].state, gate(p, stop.id).kind, gate(p, stop.id).decided], ['PARKED', 'deferral', null]);
});

test('provisional: one more deferral than was taken parks, and so does a waiver nobody took', async (t) => {
  // The handoff records two deferrals; the run took one.
  const p = makeProject(t, PROTO);
  const succ = addEpic(p.project, { id: 'Lg7Exp5', slug: 'export', name: 'Export', nn: '07', deps: [E1.id] });
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: deferringBuild(E1, [ask(deferQ(E1.tors[3]), DEFERRAL)], [E1.tors[3], E1.tors[4]], succ) });
  const s = await p.go({ queue: [E1.id] });
  assert.equal(s.queue[0].state, 'PARKED');
  assert.match(s.queue[0].reason, /CHECK_BUILD: the handoff records 2 deferral\(s\): a human decision/);

  // A waived line at the final check with no deferral taken at all.
  const p2 = makeProject(t, PROTO);
  p2.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1, { waived: true, counts: [1, 0, 1, 0, 0, 0] }) });
  const s2 = await p2.go();
  assert.equal(s2.queue[0].state, 'PARKED');
  assert.match(s2.queue[0].reason, /merge gate failed \(.*no-waivers/);
});

test(`provisional: ${PROTOTYPE_LIMIT} answers per epic, then the next question is the owner's; one answer per requirement`, async (t) => {
  const p = makeProject(t, PROTO);
  const fix = (tor) => deferQ(tor, 'Fix now — a small parser change');
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, ...E1.tors.slice(0, 4).map((tor) => ask(fix(tor), DEFERRAL))] } });
  const s = await p.go();
  assert.equal(s.queue[0].state, 'PARKED');
  const gates = [1, 2, 3, 4].map((n) => gate(p, E1.id, n));
  assert.deepEqual(gates.map((g) => g.decided?.answer ?? null), ['Fix now', 'Fix now', 'Fix now', null]);
  assert.match(gates[3].why, /the provisional setting covers 3 answers per epic, and this is one more/);
  assert.equal(s.queue[0].prototype.length, 3, 'the three it took are kept for the owner although the epic parked');

  // Amended, then the same requirement "cannot be met": the second question about it goes to the owner.
  const p2 = makeProject(t, PROTO);
  const tor = E1.tors[0];
  p2.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, ask(amendQ(tor), AMEND(tor)), ask(fix(tor), DEFERRAL)] } });
  const s2 = await p2.go();
  assert.equal(s2.queue[0].state, 'PARKED');
  assert.match(gate(p2, E1.id, 2).why, new RegExp(`one answer per requirement, and ${tor} already had one`));
});

test('provisional: a Safety-style correction (no "Amend" on offer), another epic\'s requirement and a question without a recommendation all park', async (t) => {
  const p = makeProject(t, PROTO);
  const other = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' });
  const third = addEpic(p.project, { id: 'Lg4Fx2q', slug: 'currency', name: 'Currency conversion', nn: '04' });
  p.scenario({
    [`${E1.id}/plan`]: { actions: [ask(amendQ(E1.tors[0]), ['Implement as written', "Stop — I'll take it from here"])] },
    [`${other.id}/plan`]: { actions: [ask(amendQ(E1.tors[1]), AMEND(E1.tors[1]))] },
    [`${third.id}/plan`]: planScript(third), [`${third.id}/build`]: { actions: [{ do: 'branch', name: third.branch }, ask(`${third.tors[0]} cannot be fully met: the rate service is down. How to proceed?`, DEFERRAL)] },
  });
  const s = await p.go();
  assert.deepEqual(s.queue.map((q) => q.state), ['PARKED', 'PARKED', 'PARKED']);
  assert.deepEqual([gate(p, E1.id), gate(p, other.id), gate(p, third.id)].map((g) => [g.kind, g.decided]), [['amendment', null], ['amendment', null], ['deferral', null]]);
  assert.match(gate(p, other.id).why, /does not name one of this epic's own requirements/);
  assert.deepEqual(status(p.project, p.state).decidedForYou, []);
});

test('provisional: failing tests and a file out of scope still stop the epic, and an independent epic still runs', async (t) => {
  const p = makeProject(t, { config: { mode: 'provisional', onPark: undefined } });
  const red = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' });
  const out = addEpic(p.project, { id: 'Lg4Fx2q', slug: 'currency', name: 'Currency conversion', nn: '04' });
  const broken = { actions: buildActions(red, { testBody: " throw new Error('red'); " }) };
  const strays = { actions: [...buildActions(out, { commit: false }), { do: 'write', path: '.claude/settings.json', content: '{}\n', unchecked: 'the scope check is the driver\'s, whatever the referee says' }, { do: 'commit', message: `feat(epic-${out.id}): implement ${out.slug}` }] };
  p.scenario({
    [`${red.id}/plan`]: planScript(red), [`${red.id}/build`]: broken, [`${red.id}/fix`]: { actions: [{ do: 'exec', cmd: 'true' }] },
    [`${out.id}/plan`]: planScript(out), [`${out.id}/build`]: strays, [`${out.id}/fix`]: { actions: [{ do: 'exec', cmd: 'true' }] },
    ...happy(E1),
  });
  const s = await p.go({ queue: [red.id, out.id, E1.id] });
  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[red.id, 'PARKED'], [out.id, 'PARKED'], [E1.id, 'MERGED']]);
  assert.match(s.queue[0].reason, /CHECK_BUILD still fails after the fix round \(.*tests-green/);
  assert.match(s.queue[1].reason, /CHECK_BUILD still fails after the fix round \(.*scope/);
  assert.equal(s.stoppedOnPark, undefined, 'a provisional run does not stop the line at the first park');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /when an epic parks: continue \(a provisional run keeps going\); mode provisional: the AI decides now, you confirm later\. It keeps building/);
});

test('mode: an unknown value is refused; a project file cannot set it; status carries it into a relaunch or asks for it', async (t) => {
  const p = makeProject(t, { config: { onPark: undefined } });
  const cfg = (mode) => loadConfig(p.state, { overrides: mode === undefined ? {} : { mode } });
  assert.deepEqual([cfg().mode, cfg().onPark, cfg().onParkFrom], ['full', 'stop', 'default']);
  assert.deepEqual([cfg('provisional').mode, cfg('provisional').onPark, cfg('provisional').onParkFrom], ['provisional', 'continue', 'provisional']);
  assert.throws(() => cfg('fast'), /mode must be "full" or "provisional", not "fast"/);
  assert.deepEqual([cfg('prototype').mode, cfg('prototype').onPark, cfg('prototype').onParkFrom], ['provisional', 'continue', 'provisional'], '"prototype", the name before 3.1.0, still reads');
  fs.mkdirSync(path.join(p.project, '.claude', 'peak-workflow'), { recursive: true });
  fs.writeFileSync(path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json'), JSON.stringify({ mode: 'provisional', onPark: 'stop' }));
  assert.deepEqual([cfg().mode, cfg('provisional').onPark, cfg('provisional').onParkFrom], ['full', 'stop', 'project'], 'the mode is the run\'s; an explicit project onPark still wins');
  const r = spawnSync(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double', '--dry-run'], { encoding: 'utf8' });
  assert.match(r.stdout, /How careful: +full: it stops and asks/);
});

test('mode: a relaunch carries the run\'s mode; a chain that began before the question existed is asked once', async (t) => {
  const p = makeProject(t, PROTO);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, ask(deferQ(E1.tors[3], 'Stop — beyond this session'), DEFERRAL)] } });
  await p.go();
  const cfgFile = path.join(p.runDir(), 'config.json');
  assert.equal(readJson(cfgFile).mode, 'provisional', 'the run records its mode');
  const r = spawnSync(process.execPath, [DRIVER, 'decide', '--workspace', p.state, '--gate', `gates/${E1.id}-1.json`, '--answer', 'Fix now', '--by', 'Pat Owner'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const st = status(p.project, p.state);
  assert.deepEqual([st.mode, st.relaunch.config.mode, st.relaunch.ask.includes('mode')], ['provisional', 'provisional', false]);
  fs.writeFileSync(cfgFile, JSON.stringify({ ...readJson(cfgFile), mode: 'prototype' }));
  const old = status(p.project, p.state);
  assert.deepEqual([old.mode, old.relaunch.config.mode], ['provisional', 'provisional'], 'a run from before the rename relaunches as provisional');
  const { mode, ...before } = readJson(cfgFile);
  fs.writeFileSync(cfgFile, JSON.stringify(before));
  const st2 = status(p.project, p.state);
  assert.deepEqual([st2.mode, 'mode' in st2.relaunch.config, st2.relaunch.ask.includes('mode')], [null, false, true]);
});

// ---- a full run after a provisional run: what the provisional run took is the owner's to answer -------

/** The next run of this workspace is a full one (the owner's answer at the relaunch). */
const setMode = (p, mode) => { const f = path.join(p.state, 'settings.json'); fs.writeFileSync(f, JSON.stringify({ ...readJson(f), mode })); };
const decideGate = (p, id, n, answer) => { const r = spawnSync(process.execPath, [DRIVER, 'decide', '--workspace', p.state, '--gate', `gates/${id}-${n}.json`, '--answer', answer, '--by', 'Pat Owner'], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
/** A question no policy row knows: it parks the epic in a provisional run too, which is how these tests end the first run. */
const COLOUR = ask('Which colour should the totals row be?', ['Red', 'Blue']);

/** The first run, a provisional one: `scripts` take something for the owner, then the final check parks on a question nobody can take. The owner answers that, and the next run is a full one. */
async function protoThenFull(t, scripts, { extra = () => ({}) } = {}) {
  const p = makeProject(t, PROTO);
  const more = extra(p);
  p.scenario({ ...scripts(more), [`${E1.id}/verify`]: { actions: [COLOUR] } });
  await p.go({ queue: [E1.id] });
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).decided.prototype, gate(p, E1.id, 2).session, gate(p, E1.id, 2).decided], ['PARKED', true, 'verify-1', null], 'built on what the provisional run took, parked at the final check');
  assert.equal(decideGate(p, E1.id, 2, 'Red').enters, 'VERIFY');
  setMode(p, 'full');
  return { p, ...more };
}
/** The full run that follows: it starts no session for the epic; it asks the owner what the provisional run took. */
async function reasked(p, kind, tor) {
  const before = p.calls().length;
  const s = await p.go({ queue: [E1.id] });
  assert.equal(s.mode, 'full');
  assert.equal(s.queue[0].state, 'PARKED', s.queue[0].reason);
  assert.match(s.queue[0].reason, /a provisional run took .* a full run asks the owner/);
  assert.equal(p.calls().length, before, 'no session was started before the owner answered');
  const [old, g] = [gate(p, E1.id), gate(p, E1.id, 3)];
  assert.ok(old.superseded, 'what the provisional run took no longer stands');
  assert.deepEqual([g.kind, g.tor, g.decided, g.question, g.options, g.reask.of, g.reask.took], [kind, tor, null, old.question, old.options, `gates/${E1.id}-1.json`, old.decided.answer]);
  assert.match(g.why, /a provisional run answered ".*" to this for you/);
  assert.deepEqual(status(p.project, p.state).waiting.map((w) => w.file), [`gates/${E1.id}-3.json`]);
  return before;
}

test('full run after a provisional run: a deferral the provisional run took is asked again before anything runs; the owner\'s "Defer" finishes the epic as theirs, any other answer goes back to the build', async (t) => {
  const tor = E1.tors[3];
  const start = () => protoThenFull(t, ({ succ }) => ({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: deferringBuild(E1, [ask(deferQ(tor), DEFERRAL)], [tor], succ) }), { extra: (p) => ({ succ: addEpic(p.project, { id: 'Lg7Exp5', slug: 'export', name: 'Export', nn: '07', deps: [E1.id] }) }) });

  // "Defer": their decision now; the epic goes on from where it stood.
  const { p, succ } = await start();
  p.scenario({ [`${E1.id}/verify`]: waivingWrapup(E1, [tor], succ) });
  const before = await reasked(p, 'deferral', tor);
  assert.equal(decideGate(p, E1.id, 3, DEFERRAL[1]).enters, 'VERIFY');
  const s = await p.go({ queue: [E1.id] });
  assert.equal(s.queue[0].state, 'MERGED', s.queue[0].reason);
  assert.ok(!p.steps().slice(before).some((k) => /plan|build/.test(k)), 'nothing was built again');
  const nw = check(p, E1.id, 'check-verify-1.json').checks.find((c) => c.name === 'no-waivers');
  assert.deepEqual([nw.pass, nw.evidence.deferredWithTheOwnersApproval, nw.evidence.deferredInThisPrototypeRun], [true, [tor], undefined]);

  // "Fix now": the builder is sent back. One that defers all the same is stopped by the build check.
  const b = await start();
  await reasked(b.p, 'deferral', tor);
  assert.equal(decideGate(b.p, E1.id, 3, DEFERRAL[0]).enters, 'BUILD');
  b.p.scenario({ [`${E1.id}/build`]: deferringBuild(E1, [], [tor], b.succ), [`${E1.id}/verify`]: waivingWrapup(E1, [tor], b.succ) });
  const s2 = await b.p.go({ queue: [E1.id] });
  assert.equal(s2.queue[0].state, 'PARKED');
  assert.match(s2.queue[0].reason, /CHECK_BUILD: the handoff records 1 deferral\(s\): a human decision/);
  const cb = check(b.p, E1.id, 'check-build-1.json').checks;
  assert.equal(cb.find((c) => c.name === 'handoff').pass, false);
  assert.equal(cb.find((c) => c.name === 'tests-green').evidence.skipsAllowedForDeferrals, undefined, 'the skipped test is not excused');
});

test('full run after a provisional run: an amendment the provisional run took is asked again before anything runs; the owner\'s "Amend" makes it theirs, "Implement as written" sends it back and the change is out of scope', async (t) => {
  const tor = E1.tors[0];
  const amending = () => ({ actions: [...buildActions(E1, { commit: false }), { do: 'exec', cmd: "printf '\\n# amended in the epic\\n' >> docs/requirements/01-csv-import.feature.tracing.json.note" }, { do: 'write', path: 'docs/requirements/changes/CR-test.md', content: PROTO_RECORD }, { do: 'commit', message: `feat(epic-${E1.id}): implement ${E1.slug}` }] });
  const start = () => protoThenFull(t, () => ({ [`${E1.id}/plan`]: { actions: [ask(amendQ(tor), AMEND(tor)), ...planScript(E1).actions], result: planScript(E1).result }, [`${E1.id}/build`]: amending() }));

  const { p } = await start();
  assert.deepEqual(p.epic(E1.id).amendedUnseen, [tor]);
  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const before = await reasked(p, 'amendment', tor);
  assert.equal(decideGate(p, E1.id, 3, AMEND(tor)[0]).enters, 'VERIFY');
  const s = await p.go();
  const q = s.queue[0];
  assert.equal(q.state, 'MERGED', q.reason);
  assert.ok(!p.steps().slice(before).some((k) => /plan|build/.test(k)), 'nothing was built again');
  assert.deepEqual([q.amended, q.amendedUnseen], [[tor], undefined], 'the report says the requirement was amended, and that the owner approved it');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /amended with your approval/);

  const b = await start();
  await reasked(b.p, 'amendment', tor);
  assert.equal(decideGate(b.p, E1.id, 3, 'Implement as written').enters, 'PLAN');
  b.p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'exec', cmd: 'true' }] }, [`${E1.id}/fix`]: { actions: [{ do: 'exec', cmd: 'true' }] } });
  const s2 = await b.p.go();
  assert.equal(s2.queue[0].state, 'PARKED', s2.queue[0].reason);
  const scope = check(b.p, E1.id, 'check-build-1.json').checks.find((c) => c.name === 'scope');
  assert.equal(scope.pass, false, JSON.stringify(scope));
  assert.match([scope.evidence].flat().join(' '), /requirements are frozen during a run/);
});

test('full run after a provisional run: an epic started from scratch does not inherit the amendment; a later provisional run does not take up what the owner turned down', async (t) => {
  const tor = E1.tors[0];
  const p = makeProject(t, PROTO);
  p.scenario({ [`${E1.id}/plan`]: { actions: [ask(amendQ(tor), AMEND(tor)), COLOUR] } });
  await p.go();
  assert.deepEqual([gate(p, E1.id).decided.prototype, gate(p, E1.id, 2).decided], [true, null]);
  decideGate(p, E1.id, 2, 'Red');
  setMode(p, 'full');
  await p.go();
  assert.equal(gate(p, E1.id, 3).reask.of, `gates/${E1.id}-1.json`);
  assert.equal(decideGate(p, E1.id, 3, 'Implement as written').enters, 'PLAN');
  // The owner said no. The next run is a provisional one again, and the planner asks the same thing.
  setMode(p, 'provisional');
  p.scenario({ [`${E1.id}/plan`]: { actions: [ask(amendQ(tor), AMEND(tor)), ...planScript(E1).actions], result: planScript(E1).result }, ...{ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) } });
  const s = await p.go();
  assert.equal(s.queue[0].state, 'MERGED', s.queue[0].reason);
  assert.deepEqual(Object.values(tools(p, E1.id, 'plan-1')[0].hookSpecificOutput.updatedInput.answers), ['Implement as written'], 'answered with the owner\'s own decision');
  assert.equal(s.queue[0].amended, undefined);
});

test('full run: a deferral the owner answers "Defer" to goes through the build checks and the merge as theirs; one they were not asked about still parks', async (t) => {
  const p = makeProject(t);
  const succ = addEpic(p.project, { id: 'Lg7Exp5', slug: 'export', name: 'Export', nn: '07', deps: [E1.id] });
  const tor = E1.tors[3];
  const build = deferringBuild(E1, [ask(deferQ(tor), DEFERRAL)], [tor], succ);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: build, [`${E1.id}/verify`]: waivingWrapup(E1, [tor], succ) });
  await p.go({ queue: [E1.id] });
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind, gate(p, E1.id).decided], ['PARKED', 'deferral', null], 'a full run asks');
  assert.equal(decideGate(p, E1.id, 1, DEFERRAL[1]).enters, 'BUILD');
  const s = await p.go({ queue: [E1.id] });
  const q = s.queue[0];
  assert.equal(q.state, 'MERGED', `${q.reason} ${JSON.stringify(q.checks)}`);
  assert.equal(gateCount(p), 1, 'asked once: the final check\'s same question is not a second decision');
  const g = gate(p, E1.id);
  assert.deepEqual([g.decided.answer, g.decided.by, g.decided.prototype ?? false], [DEFERRAL[1], 'Pat Owner', false]);
  const cb = check(p, E1.id, 'check-build-1.json').checks;
  assert.match(cb.find((c) => c.name === 'handoff').evidence, new RegExp(`Deferrals Count: 1 \\(${tor}: deferred with the owner's approval`));
  assert.equal(cb.find((c) => c.name === 'tests-green').evidence.skipsAllowedForDeferrals, 1);
  assert.equal(cb.find((c) => c.name === 'scope').pass, true);
  assert.deepEqual(Object.values(tools(p, E1.id, 'verify-1').find((o) => o?.hookSpecificOutput?.updatedInput?.answers).hookSpecificOutput.updatedInput.answers), [DEFERRAL[1]]);
  const nw = check(p, E1.id, 'check-verify-1.json').checks.find((c) => c.name === 'no-waivers');
  assert.deepEqual([nw.pass, nw.evidence.deferredWithTheOwnersApproval, nw.evidence.deferredInThisPrototypeRun], [true, [tor], undefined]);
  assert.deepEqual(sidecar(p, E1).fields.waived, `${tor} → ${succ.id}`);
  assert.deepEqual(q.deferred, [tor]);
  assert.deepEqual(status(p.project, p.state).decidedForYou, [], 'the owner decided it; nothing was decided for them');

  // The owner said "Defer" for one requirement; the handoff defers two.
  const p2 = makeProject(t);
  const succ2 = addEpic(p2.project, { id: 'Lg7Exp5', slug: 'export', name: 'Export', nn: '07', deps: [E1.id] });
  p2.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: deferringBuild(E1, [ask(deferQ(tor), DEFERRAL)], [tor, E1.tors[4]], succ2) });
  await p2.go({ queue: [E1.id] });
  decideGate(p2, E1.id, 1, DEFERRAL[1]);
  const s2 = await p2.go({ queue: [E1.id] });
  assert.equal(s2.queue[0].state, 'PARKED');
  assert.match(s2.queue[0].reason, /CHECK_BUILD: the handoff records 2 deferral\(s\): a human decision/);
});

test('provisional: an amendment whose change record names a person as approver does not pass the build check', async (t) => {
  const p = makeProject(t, PROTO);
  const tor = E1.tors[0];
  const build = buildActions(E1, { commit: false });
  p.scenario({
    [`${E1.id}/plan`]: { actions: [ask(amendQ(tor), AMEND(tor)), ...planScript(E1).actions], result: planScript(E1).result },
    [`${E1.id}/build`]: { actions: [...build, { do: 'exec', cmd: "printf '\\n# amended\\n' >> docs/requirements/01-csv-import.feature.tracing.json.note" }, { do: 'write', path: 'docs/requirements/changes/CR-test.md', content: '# change record\napproved_via = "epic-branch"\napproved_by = "Pat Owner"\n' }, { do: 'commit', message: `feat(epic-${E1.id}): implement ${E1.slug}` }] },
    [`${E1.id}/fix`]: { actions: [{ do: 'exec', cmd: 'true' }] },
  });
  const s = await p.go();
  assert.equal(s.queue[0].state, 'PARKED');
  assert.match(s.queue[0].reason, /CHECK_BUILD still fails after the fix round \(.*amendment-record/);
  assert.match(check(p, E1.id, 'check-build-1.json').checks.find((c) => c.name === 'amendment-record').evidence, /must say approved_by = "autopilot \(provisional run\)"/);
});

test('provisional: a run launched as "prototype" (the name before 3.1.0) takes the correction, and a change record that says "autopilot (prototype run)" still passes', async (t) => {
  const p = makeProject(t, { config: { mode: 'prototype' } });
  const tor = E1.tors[0];
  const build = buildActions(E1, { commit: false });
  p.scenario({
    [`${E1.id}/plan`]: { actions: [ask(amendQ(tor), AMEND(tor)), ...planScript(E1).actions], result: planScript(E1).result },
    [`${E1.id}/build`]: { actions: [...build, { do: 'exec', cmd: "printf '\\n# amended\\n' >> docs/requirements/01-csv-import.feature.tracing.json.note" }, { do: 'write', path: 'docs/requirements/changes/CR-test.md', content: '# change record\napproved_via = "epic-branch"\napproved_by = "autopilot (prototype run)"\n' }, { do: 'commit', message: `feat(epic-${E1.id}): implement ${E1.slug}` }] },
    [`${E1.id}/verify`]: wrapupScript(E1),
  });
  const s = await p.go();
  assert.equal(s.mode, 'provisional');
  assert.equal(s.queue[0].state, 'MERGED', s.queue[0].reason);
  assert.equal(check(p, E1.id, 'check-build-1.json').checks.find((c) => c.name === 'amendment-record').pass, true);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /## Decided for you in this provisional run/);
});

// ---- a defect the final check sees in the epic's own work (handoff Step 4 box 2) -----------------

const DEFECT = ['Fix now', 'Leave as is', 'Stop — epic FAILs'];
const defectQ = (what) => `Seen but not fixed yet: ${what}. Recommendation: Fix now — one line. How to proceed?`;
/** A final check that asks about three defects in the epic's own work, then merges and says which it left. */
const defectWrapup = (e) => {
  const a = wrapupActions(e);
  const asks = ['the 404 copy says "Lost?"', 'a stray "·" at 320 px', 'the footer link is underlined twice'].map((w) => ask(defectQ(w), DEFECT));
  return { actions: [a[0], ...asks, ...a.slice(1)], result: { total_cost_usd: 1.3, result: 'Verdict: PASS\n\n## Seen but not fixed\n- the footer link is underlined twice (footer.css)' } };
};

test('a defect the final check sees: a provisional run fixes two on the standing answer, leaves the third as is, merges and lists it as decided for the owner', async (t) => {
  const p = makeProject(t, PROTO);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: defectWrapup(E1) });
  const s = await p.go();
  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[E1.id, 'MERGED']], s.queue[0].reason);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.decided.answer, g.decided.by], ['defect', 'Leave as is', 'autopilot (provisional run)']);
  const st = status(p.project, p.state);
  assert.deepEqual(st.decidedForYou.map((x) => [x.kind, x.did]), [['defect', 'left a defect as is: the footer link is underlined twice']]);
  assert.deepEqual([st.left.map((x) => x.text), st.unproven], [['the footer link is underlined twice (footer.css)'], []]);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /## Decided for you in this provisional run[\s\S]*\*\*Defects left as is, on the final check's own judgement\*\*[\s\S]*underlined twice/);
  assert.match(md, /Seen wrong and left as is \(said by the final check[^\n]*\n- the footer link is underlined twice/);
  assert.ok(!/Not proven for real \(said/.test(md), 'a left defect is not "not proven"');
  assert.match(md, /## Do this next[\s\S]*Read the 1 thing the final check saw wrong and left/);
});

test('a defect the final check sees: a full run parks on the one past the standing answer\'s count', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: defectWrapup(E1) });
  const s = await p.go();
  assert.equal(s.queue[0].state, 'PARKED');
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.decided, g.question], ['defect', null, defectQ('the footer link is underlined twice')]);
  assert.match(g.why, /past the count/);
});

const PRE_OPTS = ['Accept as pre-existing', 'Fix on this branch', 'Stop — epic FAILs'];
const PRE_Q = 'Tests failed on test/ledger.test.js "totals add up", which this epic did not change, and they fail the same way on develop: 1 failing, expected 10 got 9. Recommendation: Accept as pre-existing — the ledger epic owns it. How to proceed?';
/** A final check that meets a test another epic owns, already failing on develop: asks the one question, then merges and lists it. */
const preExistingWrapup = (e) => {
  const a = wrapupActions(e);
  return { actions: [a[0], ask(PRE_Q, PRE_OPTS), ...a.slice(1)], result: { total_cost_usd: 1.3, result: 'Verdict: PASS\n\n## Seen but not fixed\n- test/ledger.test.js "totals add up" — fails the same way on develop: expected 10 got 9' } };
};

test('a test that already fails on develop at the final check: a provisional run accepts it as pre-existing, merges, and lists it as decided for the owner (#46 item 2)', async (t) => {
  const p = makeProject(t, PROTO);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: preExistingWrapup(E1) });
  const s = await p.go();
  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[E1.id, 'MERGED']], s.queue[0].reason);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.decided.answer, g.decided.by, g.decided.prototype], ['pre-existing', 'Accept as pre-existing', 'autopilot (provisional run)', true]);
  const st = status(p.project, p.state);
  assert.deepEqual(st.decidedForYou.map((x) => [x.kind, x.did]), [['pre-existing', 'accepted test/ledger.test.js "totals add up" as already failing on develop']]);
  assert.deepEqual(st.left.map((x) => x.text), ['test/ledger.test.js "totals add up" — fails the same way on develop: expected 10 got 9']);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /## Decided for you in this provisional run[\s\S]*\*\*Failing checks this epic did not change, already failing the same way on the base\*\*[\s\S]*"Accept as pre-existing": Tests failed on test\/ledger\.test\.js/);
});

test('a second final check\'s "Seen but not fixed" list replaces the first\'s', async (t) => {
  const p = makeProject(t);
  p.scenario({
    ...happy(E1),
    [`${E1.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL\nTOR-01-Hd3Yc8L: the description is trimmed\n\n## Seen but not fixed\n- the 404 copy says "Lost?"\n- a stray "·" at 320 px' } },
    [`${E1.id}/plan-fix`]: planScript(E1),
    [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = true;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): keep the description verbatim` }] },
    [`${E1.id}/verify-2`]: { actions: wrapupActions(E1), result: { total_cost_usd: 1.3, result: 'Verdict: PASS\n\n## Seen but not fixed\n- a stray "·" at 320 px\n- the header wraps at 320 px' } },
  });
  const s = await p.go();
  assert.equal(s.queue[0].state, 'MERGED', s.queue[0].reason);
  assert.deepEqual(status(p.project, p.state).left.map((x) => x.text), ['a stray "·" at 320 px', 'the header wraps at 320 px']);
});

test('provisional: a review thin twice does not park; the final check runs, and it is listed under "Decided for you" with what was read', async (t) => {
  const p = makeProject(t, PROTO);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { reads: false, result: { total_cost_usd: 0.5, structured_output: { findings: [], recommend: 'proceed', summary: 'looked fine' } } } });

  const s = await p.go();

  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[E1.id, 'MERGED']]);
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'audit-2', 'verify-1'].map((x) => `${E1.id}/${x}`));
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.decided.answer, g.decided.by, g.decided.prototype, g.decided.standing], ['thin-review', 'Verify as built', 'autopilot (provisional run)', true, true]);
  const e = p.epic(E1.id);
  assert.deepEqual(e.prototype.map((x) => [x.kind, x.answer]), [['thin-review', 'Verify as built']]);
  assert.equal(e.audits.at(-1).accepted, 'autopilot (provisional run)');
  const did = 'went on after a thin review: read 0 of 2 changed files';
  assert.deepEqual(status(p.project, p.state).decidedForYou.map((d) => [d.prototype, d.kind, d.did]), [[true, 'thin-review', did]]);
  const report = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(report, /\*\*Reviews that were thin\*\*/);
  assert.match(report, new RegExp(`read 0 of 2 changed code files in \\d+ s — \`gates/${E1.id}-1\\.json\``));
  assert.ok(report.includes(`Not opened: \`src/${E1.slug}.js\`, \`test/${E1.slug}.test.js\``));
  const lines = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => eventLine(JSON.parse(l))).filter(Boolean);
  assert.ok(lines.some((l) => /^The independent reviewer is reviewing .* again: it read 0 of 2 changed code files$/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /after a thin independent review .* for you \(provisional run\)$/.test(l)), lines.join('\n'));
});

test('a requirement a person observes has no test to name: a review that says so is not thin', async (t) => {
  const p = makeProject(t, PROTO);
  const e = addLookEpic(p);
  const checked = e.tors.map((tor) => ({ tor, tests: [], code: [`src/${e.slug}.js`], whenExercised: false, note: 'operator-observed: a person looks' }));
  p.scenario({ ...happy(E1), [`${e.id}/plan`]: planScript(e), [`${e.id}/build`]: buildWithManual(e), [`${e.id}/audit`]: { result: { structured_output: { checked, findings: [], recommend: 'proceed', summary: 's' } } }, [`${e.id}/verify`]: wrapupMarking(e, `--fail ${e.tors[0]} "NOT OBSERVED — provisional run: open chart.html and look at the bars"`) });
  await p.go();
  assert.ok(!p.steps().includes(`${e.id}/audit-2`), p.steps().join(' '));
  assert.equal(readJson(p.dir(e.id, 'audit-1', 'audit.json')).decision, 'proceed');
});
