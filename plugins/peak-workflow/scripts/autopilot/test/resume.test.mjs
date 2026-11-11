// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, gateFacts } from '../driver.mjs';
import { DRIVER, E1, addEpic, buildActions, buildScript, git, happy, makeProject, planScript, readJson, waitFor, wrapupActions, wrapupScript } from './helpers.mjs';

const cli = (...args) => spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });
const gate = (p, id, n = 1) => readJson(path.join(p.state, 'gates', `${id}-${n}.json`));
function decide(p, id, answer, { n = 1, note } = {}) {
  const r = cli('decide', '--workspace', p.state, '--gate', `gates/${id}-${n}.json`, '--answer', answer, '--by', 'Pat Owner', ...(note ? ['--note', note] : []));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.effect, 'resume'); // every decided gate resumes; there is no by-hand split
  return out;
}
/** Runs once more and returns that run's sessions only, as `<epic>/<step>` keys. */
async function again(p, opts = {}) {
  const before = p.calls().length;
  const state = await p.go(opts);
  return { state, steps: p.steps().slice(before), calls: p.calls().slice(before) };
}
const ask = (question, options) => ({ do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, header: 'Gate', multiSelect: false, options: options.map((label) => ({ label, description: '' })) }] } });
const tools = (p, id, step) => fs.readFileSync(p.dir(id, step, 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).out);
const finding = (category, severity = 'high') => ({ category, severity, evidence: 'test/rates.test.js:12', explanation: `the ${category} problem` });
const audit = (findings) => ({ result: { total_cost_usd: 0.5, structured_output: { findings, recommend: findings.length ? 'park' : 'proceed', summary: 'canned' } } });
const merged = (p, tip) => spawnSync('git', ['merge-base', '--is-ancestor', tip, 'develop'], { cwd: p.clone }).status === 0;
const DEFERRAL = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];

/** An epic with one operator-observed requirement: preflight marks it human-check. */
function addLookEpic(p, spec = { id: 'Lg5Chr8', slug: 'chart', name: 'Spending chart', nn: '05' }) {
  const e = addEpic(p.project, spec);
  const file = path.join(p.project, 'docs', 'requirements', `${spec.nn}-${spec.slug}.feature.md`);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^(Scenario: .*)$/m, '$1\n    # Verification: operator-observed'));
  git(p.project, 'commit', '-qam', 'docs: the chart is checked by a person');
  return e;
}
const buildWithManual = (e) => ({ actions: [...buildActions(e, { commit: false }), { do: 'write', path: `tests/manual/${e.tors[0]}.md`, content: '# Manual check\n\n1. Open chart.html\n' }, { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }] });

// ---- a question a session asked ----------------------------------------------------------------

test('question gate (deferral, asked in build): the next run starts a fresh build session on the same branch and R8 answers that question once', async (t) => {
  const p = makeProject(t);
  const q = `${E1.tors[3]} cannot be fully met: amounts with three decimals. How to proceed?`;
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, DEFERRAL)] } });
  await p.go();
  const run1 = p.runName();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const g = gate(p, E1.id);
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.deepEqual([g.kind, g.session, g.run, g.branch, g.branchTip, g.base], ['deferral', 'build-1', run1, E1.branch, tip, git(p.clone, 'rev-parse', 'develop')], 'the gate is sealed after the WIP commit');
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', E1.branch), 'wip(autopilot): uncommitted work at park');

  const d = decide(p, E1.id, 'Fix now');
  assert.equal(d.enters, 'BUILD');
  assert.equal(gateFacts(p.state, 'develop').get(E1.id).state, 'resume');
  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.match(pre.epics[0].reasons.join(' '), /resumes at BUILD on feature\/epic-Lg1Csv7-csv-import: you answered "Fix now"/);
  assert.deepEqual(pre.launch.decidedGates.map((x) => [x.epic, x.state, x.enters]), [[E1.id, 'resume', 'BUILD']]);

  p.scenario({ [`${E1.id}/build`]: { actions: [ask(q, DEFERRAL), ...buildActions(E1)] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'no plan session: the first run\'s plan is used');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.deepEqual([e.resumed.phase, e.resumed.gate, e.resumed.branchTip, e.resumed.fromRun], ['BUILD', `gates/${E1.id}-1.json`, tip, run1]);
  assert.equal(r.calls[0].prompt, 'Implement the following plan:\n\n' + fs.readFileSync(path.join(p.state, 'runs', run1, 'epics', E1.id, 'plan-1', 'plan.md'), 'utf8').replaceAll('${CLAUDE_PLUGIN_ROOT}', r.calls[0].argv[r.calls[0].argv.indexOf('--plugin-dir') + 1]));
  assert.equal(Object.values(tools(p, E1.id, 'build-1')[0].hookSpecificOutput.updatedInput.answers)[0], 'Fix now');
  assert.deepEqual([gate(p, E1.id).decided.used.run, gate(p, E1.id).decided.used.session], [p.runName(), 'build-1']);
  assert.ok(merged(p, tip), 'the branch the first run left is what merged');
  assert.deepEqual(readJson(path.join(p.state, 'epics.json')), {}, 'a merged epic carries nothing forward');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Resumed at BUILD on `feature\/epic-Lg1Csv7-csv-import` .*Pat Owner answered "Fix now" on `gates\/Lg1Csv7-1\.json`/);
});

test('unmatched question (asked in plan): replayable — the next run plans again and R8 matches the recorded question text', async (t) => {
  const p = makeProject(t);
  const q = 'The spec names both a monthly and a weekly budget period. Which should this epic build?';
  p.scenario({ [`${E1.id}/plan`]: { actions: [ask(q, ['Monthly', 'Weekly'])] } });
  await p.go();
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).session], ['unmatched', 'plan-1']);
  assert.equal(decide(p, E1.id, 'Weekly').enters, 'PLAN');

  p.scenario({ ...happy(E1), [`${E1.id}/plan`]: { actions: [ask(q.replace('  ', ' '), ['Monthly', 'Weekly']), ask('Which colour should the bars be?', ['Red', 'Blue']), ...planScript(E1).actions] } });
  const r = await again(p);

  // The recorded question is answered once with the owner's answer; a different unmatched question still parks.
  const [first, second] = tools(p, E1.id, 'plan-1');
  assert.equal(Object.values(first.hookSpecificOutput.updatedInput.answers)[0], 'Weekly');
  assert.equal(second.stopReason, 'autopilot: parked at human gate');
  assert.deepEqual(r.steps, [`${E1.id}/plan-1`]);
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.deepEqual([gate(p, E1.id).decided.used.session, gate(p, E1.id, 2).kind, gate(p, E1.id, 2).question], ['plan-1', 'unmatched', 'Which colour should the bars be?']);
});

// ---- audit -------------------------------------------------------------------------------------

test('audit gate, "Not real — verify as built": the next run goes straight to VERIFY on the same tip; the audit is not re-run', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]) });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.deepEqual(gate(p, E1.id).options, [ANSWERS.auditReal, ANSWERS.auditNotReal]);
  assert.equal(decide(p, E1.id, ANSWERS.auditNotReal).enters, 'VERIFY');

  const r = await again(p);

  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.equal(e.preVerify.branchTip, tip);
  assert.deepEqual(e.auditOverruled, { gate: `gates/${E1.id}-1.json`, by: 'Pat Owner' });
  assert.deepEqual([gate(p, E1.id).decided.used.run, gate(p, E1.id).decided.used.phase], [p.runName(), 'VERIFY']);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Verified as built: Pat Owner judged the auditor's findings not real/);
});

test('audit gate, "Real — fix before verify": the fix round runs with the parking findings as the brief, then a delta audit and verify', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in'), finding('scope', 'low')]) });
  await p.go();
  const run1 = p.runName(); const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.equal(decide(p, E1.id, ANSWERS.auditReal, { note: 'the live path must be exercised' }).enters, 'FIX_PLAN');

  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/live.js', content: 'export const live = true;\n' }, { do: 'commit', message: `feat(epic-${E1.id}): exercise the live path` }] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-fix-1', 'fix-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.fixRounds], ['MERGED', 1]);
  const brief = fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8');
  assert.match(brief, /confirmed they are real/);
  assert.match(brief, /\*\*F1 stand-in\*\* — the stand-in problem/);
  assert.ok(!brief.includes('scope'), 'only the findings that parked');
  assert.match(brief, /The owner's note: the live path must be exercised/);
  assert.ok(r.calls[0].argv.includes(p.dir(E1.id, 'fix-brief.md')));
  // The audit after the fix covers only the delta since the first run's audit, and only the fix session.
  const a = readJson(p.dir(E1.id, 'audit-1', 'audit.json'));
  assert.deepEqual([a.delta, a.base], [true, tip]);
  assert.deepEqual(readJson(p.dir(E1.id, 'audit-1', 'bundle', 'bundle.json')).steps, ['fix-1']);
  assert.ok(fs.existsSync(path.join(p.state, 'runs', run1, 'epics', E1.id, 'audit-1', 'audit.json')));
});

test('audit gate, "Real", when the one fix round is already used: FAILED without a session', async (t) => {
  const p = makeProject(t);
  p.scenario({
    ...happy(E1), [`${E1.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL' } },
    [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'x\n' }, { do: 'commit', message: `feat(epic-${E1.id}): fix` }] },
    [`${E1.id}/audit-2`]: audit([finding('cannot-fail')]),
  });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).fixRounds, readJson(path.join(p.state, 'epics.json'))[E1.id].fixRounds], ['PARKED', 1, 1]);
  decide(p, E1.id, ANSWERS.auditReal);

  const r = await again(p);

  assert.deepEqual(r.steps, []);
  assert.equal(p.epic(E1.id).state, 'FAILED');
  assert.match(p.epic(E1.id).reason, /one fix round is already used/);
});

// ---- human-check -------------------------------------------------------------------------------

test('human-check gate carries an artifact; "Looks right" goes to VERIFY and R8 answers the manual-verification question with the owner\'s look', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { Lg5Chr8: "echo '<svg/>' > chart.html && echo chart written" } } });
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });

  assert.equal(p.epic(e5.id).state, 'PARKED');
  assert.equal(p.epic(e5.id).reason, 'human check needed before verify');
  assert.deepEqual(p.steps(), [`${e5.id}/plan-1`, `${e5.id}/build-1`, `${e5.id}/audit-1`], 'no verify session before the look');
  const g = gate(p, e5.id);
  const dir = `${p.rel()}/epics/${e5.id}/artifacts`;
  assert.deepEqual([g.kind, g.options], ['human-check', [ANSWERS.looksRight, ANSWERS.notRight]]);
  assert.deepEqual(g.artifacts, [`clone:tests/manual/${e5.tors[0]}.md`, `${dir}/run-output.txt`, `${dir}/files/chart.html`]);
  assert.match(fs.readFileSync(path.join(p.state, dir, 'run-output.txt'), 'utf8'), /^\$ echo '<svg\/>' > chart\.html && echo chart written\n\(exit 0, on feature\/epic-Lg5Chr8-chart at [0-9a-f]{40}\)\n\nchart written/);
  assert.equal(fs.readFileSync(path.join(p.state, dir, 'files', 'chart.html'), 'utf8'), '<svg/>\n');
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'the clone is left as committed');
  const tip = git(p.clone, 'rev-parse', e5.branch);
  assert.equal(decide(p, e5.id, ANSWERS.looksRight, { note: 'one bar per category, labels readable' }).enters, 'VERIFY');

  const manual = 'Did you perform any manual verification beyond the automated gates I ran?';
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(manual, ['Yes — I performed manual verification', 'No — only automated gates were run']), ...wrapupActions(e5)], result: { result: 'Verdict: PASS' } } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED');
  const [answer] = tools(p, e5.id, 'verify-1');
  assert.deepEqual(answer.hookSpecificOutput.updatedInput.answers, { [manual]: 'Yes — I performed manual verification' });
  assert.match(answer.hookSpecificOutput.updatedInput.annotations[manual].notes, /Pat Owner looked at clone:tests\/manual\/.* and answered "Looks right" — "one bar per category, labels readable"/);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /answered from the owner's recorded decision/);
  assert.equal(readJson(p.dir(e5.id, 'verify-1', 'step.json')).look.branchTip, tip);
  // The verifier is handed the owner's observation up front, so wrapup Step 1.2 item 7 does not ask for it.
  const lookFile = r.calls[0].argv[r.calls[0].argv.indexOf('--append-system-prompt-file') + 1];
  assert.equal(lookFile, p.dir(e5.id, 'verify-1', 'owner-look.md'));
  const lookText = fs.readFileSync(lookFile, 'utf8');
  assert.match(lookText, /Pat Owner, \d{4}-\d{2}-\d{2}/);
  assert.ok(lookText.includes(`branch tip ${tip}`) && lookText.includes('"one bar per category, labels readable"') && lookText.includes(e5.tors[0]), lookText);
  assert.match(lookText, /do not use\s+`AskUserQuestion`/);
  assert.ok(merged(p, tip));
});

test('human-check gate, "Not right — describe": the fix round gets the owner\'s note, and the changed build parks for a new look', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  // No humanCheck command: the artifact is the project's **Run:** command from CLAUDE.md, placeholders dropped.
  assert.match(fs.readFileSync(path.join(p.state, gate(p, e5.id).artifacts[1]), 'utf8'), /^\$ node bin\/ledger\.js\n/);
  assert.equal(decide(p, e5.id, ANSWERS.notRight, { note: 'the bars overlap' }).enters, 'FIX_PLAN');

  p.scenario({ [`${e5.id}/plan-fix`]: planScript(e5), [`${e5.id}/fix`]: { actions: [{ do: 'checkout', name: e5.branch }, { do: 'write', path: 'src/bars.js', content: 'export const gap = 4;\n' }, { do: 'commit', message: `feat(epic-${e5.id}): space the bars` }] } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, ['plan-fix-1', 'fix-1', 'audit-1'].map((s) => `${e5.id}/${s}`));
  assert.match(fs.readFileSync(p.dir(e5.id, 'fix-brief.md'), 'utf8'), /Pat Owner\) looked at what was built and answered "Not right — describe":\n[\s\S]*> the bars overlap/);
  assert.deepEqual([p.epic(e5.id).state, p.epic(e5.id).fixRounds], ['PARKED', 1]);
  const g2 = gate(p, e5.id, 2);
  assert.deepEqual([g2.kind, g2.decided, g2.branchTip], ['human-check', null, git(p.clone, 'rev-parse', e5.branch)]);

  // The second look passes: verify, merge.
  // A look without the owner's words is refused: the note is the evidence.
  const bare = cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-2.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner');
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /a human-check answer needs --note: what you did to check and what you saw/);
  assert.equal(gate(p, e5.id, 2).decided, null);
  assert.match(cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-2.json`, '--answer', ANSWERS.notRight, '--by', 'Pat Owner', '--note', '  ').stderr, /needs --note: what you looked at and what is wrong/);
  decide(p, e5.id, ANSWERS.looksRight, { n: 2, note: 'opened chart.html: the bars no longer overlap' });
  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const last = await again(p, { queue: [e5.id] });
  assert.deepEqual(last.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED');
});

test('human-check gate with nothing to look at says so plainly', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace(/^- \*\*Run:\*\*.*\n/m, ''));
  git(p.project, 'commit', '-qam', 'docs: no run command');
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildScript(e5) });
  await p.go({ queue: [e5.id] });

  const g = gate(p, e5.id);
  assert.deepEqual(g.artifacts, []);
  assert.match(g.why, /could not produce anything to look at: the build wrote no tests\/manual\/<TOR>\.md file for this epic; CLAUDE\.md has no \*\*Run:\*\* command/);
  assert.match(p.epic(e5.id).reason, /nothing could be produced to look at/);
});

// ---- plan-lint ---------------------------------------------------------------------------------

test('plan-lint gate has options; "Approve this plan" builds the captured plan, recorded as approved by the owner', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['reconcile'] }) });
  await p.go();
  const run1 = p.runName();
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.options, g.artifacts], ['plan-lint', [ANSWERS.approvePlan, ANSWERS.replan], [`runs/${run1}/epics/${E1.id}/plan-1/plan.md`]]);
  assert.equal(decide(p, E1.id, ANSWERS.approvePlan).enters, 'BUILD');

  p.scenario({ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.planApprovedBy, e.plan], ['MERGED', 'Pat Owner', g.artifacts[0]]);
  assert.ok(r.calls[0].prompt.startsWith('Implement the following plan:\n\n# Plan'));
  assert.ok(!r.calls[0].prompt.includes('Reconcile spec'), 'the plan as captured, lint failure and all');
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /Plans were approved by lint, not by a person — except Lg1Csv7 \(approved by Pat Owner\)\./);
  assert.match(md, /plan-1\/plan\.md` — approved by Pat Owner\./);
});

test('plan-lint gate, "Re-plan": the next run plans again on the same branch', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['mark'] }) });
  await p.go();
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.equal(decide(p, E1.id, ANSWERS.replan).enters, 'PLAN');

  p.scenario(happy(E1));
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).planApprovedBy], ['MERGED', 'lint']);
  assert.equal(git(p.clone, 'for-each-ref', 'refs/autopilot/superseded/'), '', 'the same branch, not a fresh one');
  assert.ok(merged(p, tip));
});

// ---- resume (budget, infra, STOP, auditor outage) ----------------------------------------------

test('resume gate (budget park in build), "Resume from where it stopped": CHECK_BUILD judges the branch; no session is repeated', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: buildActions(E1), result: { subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 15 } } });
  await p.go();
  const e1 = p.epic(E1.id);
  assert.equal(e1.state, 'PARKED');
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.options, e1.gates], ['resume', 'CHECK_BUILD', [ANSWERS.resume, ANSWERS.startOver], [`${E1.id}-1.json`]]);
  assert.match(g.question, /stopped: budget: build-1 hit error_max_budget_usd\. Continue it in the next run\?/);
  assert.match(readJson(path.join(p.runDir(), 'report.json')).next[0], /Answer 1 waiting question/);
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'CHECK_BUILD');

  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, [`${E1.id}/audit-1`, `${E1.id}/verify-1`]);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(readJson(p.dir(E1.id, 'check-build-1.json')).pass, true);
  // The auditor reads the first run's build session.
  assert.deepEqual(readJson(p.dir(E1.id, 'audit-1', 'bundle', 'bundle.json')).steps, ['build-1']);
  assert.ok(merged(p, tip));
});

test('resume gate, "Start over": the old branch is kept under refs/autopilot/superseded/ and the epic is planned afresh', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: buildActions(E1, { commit: false }), result: { subtype: 'error_max_turns', is_error: true } } });
  await p.go();
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.match(decide(p, E1.id, ANSWERS.startOver).enters, /^PLAN \(from scratch/);

  p.scenario(happy(E1));
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.equal(git(p.clone, 'rev-parse', e.superseded[0]), tip);
  assert.match(e.superseded[0], /^refs\/autopilot\/superseded\/Lg1Csv7-\d+$/);
  assert.ok(!merged(p, tip), 'the abandoned work did not merge');
});

test('auditor outage fails closed with a resume gate: the next run audits again instead of rebuilding', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { result: { structured_output: { findings: 'none' } } } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.match(p.epic(E1.id).reason, /^auditor: audit-1 returned no usable result .*not verified without an audit$/);
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1'].map((s) => `${E1.id}/${s}`), 'nothing is verified without an audit');
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).phase], ['resume', 'AUDIT']);
  decide(p, E1.id, ANSWERS.resume);

  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, [`${E1.id}/audit-1`, `${E1.id}/verify-1`]);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(readJson(p.dir(E1.id, 'audit-1', 'bundle', 'bundle.json')).steps, ['build-1']);
});

test('resume gate (STOP mid-build): the STOP file is cleared, and resuming finishes the half-built branch through the one fix round', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'hang' }] } });
  const running = p.go();
  await waitFor(() => fs.existsSync(path.join(p.clone, 'src', 'half.js')));
  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  await running;
  assert.ok(!fs.existsSync(path.join(p.state, 'STOP')), 'a STOP that was honoured does not stop the next run');
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).phase], ['resume', 'CHECK_BUILD']);
  const tip = git(p.clone, 'rev-parse', E1.branch);
  decide(p, E1.id, ANSWERS.resume);

  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: buildActions(E1) }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-fix-1', 'fix-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).fixRounds], ['MERGED', 1]);
  assert.ok(merged(p, tip), 'the WIP commit is part of what merged');
});

// ---- void decisions, waiting gates -------------------------------------------------------------

test('void decision: the branch tip moved after the gate was written — reported, re-planned from scratch, old branch kept', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]) });
  await p.go();
  decide(p, E1.id, ANSWERS.auditNotReal);
  git(p.clone, 'checkout', '-q', E1.branch);
  git(p.clone, 'commit', '-q', '--allow-empty', '-m', 'someone committed here by hand');
  git(p.clone, 'checkout', '-q', 'develop');
  const moved = git(p.clone, 'rev-parse', E1.branch);

  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.match(pre.launch.warn.join('\n'), /1 decision\(s\) can no longer be used \(Lg1Csv7: the branch feature\/epic-Lg1Csv7-csv-import moved since the gate was written/);
  assert.equal(pre.epics[0].eligibility, 'eligible');

  p.scenario(happy(E1));
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'not VERIFY: the decision no longer describes this branch');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.match(e.voided.why, /moved since the gate was written/);
  assert.equal(git(p.clone, 'rev-parse', e.superseded[0]), moved);
  const g = gate(p, E1.id);
  assert.deepEqual([g.void.run, g.decided.used], [p.runName(), undefined]);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /1 decision could not be used and the epic was planned again from scratch \(Lg1Csv7\)/);
  assert.match(md, /Your decision "Not real — verify as built" on `gates\/Lg1Csv7-1\.json` was void — the branch/);
  assert.equal(cli('decide', '--workspace', p.state, '--gate', `${E1.id}-1.json`, '--answer', ANSWERS.auditReal, '--by', 'Pat').status, 2, 'a void gate cannot be decided again');
});

test('another epic merged after the park: the decision still holds, because the parked branch merges cleanly — resumed, not rebuilt', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d) });
  const s1 = await p.go();
  assert.deepEqual(s1.queue.map((q) => q.state), ['PARKED', 'MERGED']); // Run A's shape: a park, then an independent merge
  const tip = git(p.clone, 'rev-parse', E1.branch);
  decide(p, E1.id, ANSWERS.auditNotReal);
  const f = gateFacts(p.state, 'develop').get(E1.id);
  assert.deepEqual([f.state, f.enters, f.behind > 0], ['resume', 'VERIFY', true]);

  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.voided, e.resumed.behind > 0], ['MERGED', undefined, true]);
  assert.ok(merged(p, tip));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /The branch was \d+ commits? behind `develop` and merged cleanly in a trial merge\./);
});

test('void decision: the parked branch no longer merges cleanly into the integration line — reported with the files, re-planned from scratch', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  const clash = (text) => ({ do: 'write', path: 'src/shared.js', content: text });
  const building = (e, text) => ({ actions: [...buildActions(e, { commit: false }), clash(text), { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }] });
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: building(E1, 'export const mode = "a";\n'), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d), [`${d.id}/build`]: building(d, 'export const mode = "b";\n') });
  await p.go();
  decide(p, E1.id, ANSWERS.auditNotReal);
  const before = git(p.clone, 'status', '--porcelain') + git(p.clone, 'rev-parse', 'develop');
  const f = gateFacts(p.state, 'develop').get(E1.id);
  assert.equal(f.state, 'void');
  assert.match(f.why, /no longer merges cleanly into develop \(conflicts in src\/shared\.js\)/);
  assert.equal(git(p.clone, 'status', '--porcelain') + git(p.clone, 'rev-parse', 'develop'), before, 'the trial merge changes nothing in the clone');

  p.scenario(happy(E1));
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.match(p.epic(E1.id).voided.why, /conflicts in src\/shared\.js/);
});

// ---- onPark ------------------------------------------------------------------------------------

test('onPark defaults to "stop": the first epic that parks ends the run, and the report says how to change that', async (t) => {
  const p = makeProject(t);
  const settings = readJson(path.join(p.state, 'settings.json'));
  delete settings.onPark; // the default, as a real workspace has it
  fs.writeFileSync(path.join(p.state, 'settings.json'), JSON.stringify(settings));
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d) });

  const s = await p.go();

  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[E1.id, 'PARKED'], [d.id, 'QUEUED']], 'the independent epic is not started');
  assert.deepEqual([s.status, s.stoppedBecause], ['STOPPED', `${E1.id} parked (onPark: stop)`]);
  assert.ok(p.steps().every((k) => k.startsWith(E1.id)));
  const file = path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');
  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.deepEqual(report.epics.map((e) => e.outcome), ['PARKED', 'NOT STARTED']);
  assert.ok(report.next.some((n) => n.includes('1 epic did not start (Lg6Cfg3): the run stops at the first epic that parks or fails') && n.includes(`\`{"onPark": "continue"}\` in \`${file}\``)), report.next.join('\n'));
  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.deepEqual([pre.launch.config.onPark, pre.launch.projectSettingsFile, pre.launch.projectSettingsFileExists], ['stop', file, false]);

  // The setting lives with the project: .claude/peak-workflow/autopilot.json. With "continue", the independent epic runs after the park.
  decide(p, E1.id, ANSWERS.auditNotReal);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ onPark: 'continue', claudeBin: '/somewhere/else', queue: ['nope'] }));
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'chore: autopilot keeps building after a park');
  const pre2 = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.deepEqual([pre2.launch.config.onPark, pre2.launch.projectSettingsFileExists, pre2.launch.config.queue], ['continue', true, null]);
  assert.match(pre2.launch.config.claudeBin, /fake-claude\.mjs$/, 'a project file never names the session binary');
  p.scenario({ [`${E1.id}/verify`]: { actions: [], result: { result: 'Verdict: FAIL' } }, [`${E1.id}/plan-fix`]: planScript(E1, { omit: ['mark'] }), ...happy(d) });
  const r = await again(p);
  assert.deepEqual(r.state.queue.map((q) => [q.id, q.state]), [[E1.id, 'PARKED'], [d.id, 'MERGED']]);
  assert.equal(r.state.stoppedBecause, 'queue done');

  fs.writeFileSync(file, JSON.stringify({ onPark: 'sometimes' }));
  await assert.rejects(p.go(), /onPark must be "stop" or "continue", not "sometimes"/);
});

test('an undecided gate keeps its epic out of the next run: nothing is rebuilt while the owner has not answered', async (t) => {
  const p = makeProject(t);
  const dep = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02', deps: [E1.id] });
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]) });
  await p.go();
  const tip = git(p.clone, 'rev-parse', E1.branch);

  const r = await again(p);

  assert.deepEqual(r.steps, []);
  assert.deepEqual(r.state.queue.map((q) => q.state), ['SKIPPED', 'BLOCKED']);
  assert.match(p.epic(E1.id).reason, /waiting for your decision on gates\/Lg1Csv7-1\.json \(audit\)/);
  assert.equal(git(p.clone, 'rev-parse', E1.branch), tip);
  assert.equal(gate(p, E1.id).superseded, undefined);
  // The second run's report still tells the owner to decide it.
  assert.match(readJson(path.join(p.runDir(), 'report.json')).next[0], /Answer 1 waiting question: `\/peak-workflow:autopilot report` \(Lg1Csv7\)/);
  assert.ok(dep.id);
});

// ---- P3.5 exit ---------------------------------------------------------------------------------

test('P3.5 exit: one run parks an epic at each resumable gate kind; decided through `driver.mjs decide`, the next run finishes each on the branch the first run left', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { '*': 'echo looked' } } });
  const eq = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' }); // question
  const ea = addEpic(p.project, { id: 'Lg4Fx2q', slug: 'currency', name: 'Currency conversion', nn: '04' }); // audit
  const eh = addLookEpic(p); // human-check
  const el = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' }); // plan-lint
  const er = addEpic(p.project, { id: 'Lg7Exp5', slug: 'export', name: 'Export', nn: '07' }); // resume (budget)
  const ef = E1; // audit, fix round already used → FAILED
  const q = `${eq.tors[0]} cannot be fully met: the rule list is not final. How to proceed?`;
  p.scenario({
    [`${eq.id}/plan`]: planScript(eq), [`${eq.id}/build`]: { actions: [{ do: 'branch', name: eq.branch }, ask(q, DEFERRAL)] },
    ...happy(ea), [`${ea.id}/audit`]: audit([finding('never-ran-real')]),
    [`${eh.id}/plan`]: planScript(eh), [`${eh.id}/build`]: buildScript(eh),
    [`${el.id}/plan`]: planScript(el, { omit: ['amendment'] }),
    [`${er.id}/plan`]: planScript(er), [`${er.id}/build`]: { actions: buildActions(er), result: { subtype: 'error_max_turns', is_error: true } },
    ...happy(ef), [`${ef.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL' } }, [`${ef.id}/plan-fix`]: planScript(ef),
    [`${ef.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'x\n' }, { do: 'commit', message: `feat(epic-${ef.id}): fix` }] }, [`${ef.id}/audit-2`]: audit([finding('test-weakened')]),
  });

  const s1 = await p.go();
  const run1 = p.runName();
  assert.deepEqual(s1.queue.map((x) => [x.id, x.state]), [ef, eq, ea, eh, el, er].map((e) => [e.id, 'PARKED']));
  const kinds = Object.fromEntries([ef, eq, ea, eh, el, er].map((e) => [e.id, gate(p, e.id).kind]));
  assert.deepEqual(kinds, { [ef.id]: 'audit', [eq.id]: 'deferral', [ea.id]: 'audit', [eh.id]: 'human-check', [el.id]: 'plan-lint', [er.id]: 'resume' });
  const tips = Object.fromEntries([ef, eq, ea, eh, el, er].map((e) => [e.id, git(p.clone, 'rev-parse', e.branch)]));
  const ran1 = p.steps();

  for (const [e, answer] of [[ef, ANSWERS.auditReal], [eq, 'Fix now'], [ea, ANSWERS.auditNotReal], [eh, ANSWERS.looksRight], [el, ANSWERS.approvePlan], [er, ANSWERS.resume]]) decide(p, e.id, answer, answer === ANSWERS.looksRight ? { note: 'opened the page: it reads well' } : {});
  assert.match(readJson(path.join(p.state, 'runs', run1, 'report.json')).next.join('\n'), /6 decided gates \(.*\) resume their epics on the branch this run left/);

  p.scenario({
    [`${eq.id}/build`]: { actions: [ask(q, DEFERRAL), ...buildActions(eq)] }, [`${eq.id}/verify`]: wrapupScript(eq),
    [`${ea.id}/verify`]: wrapupScript(ea), [`${eh.id}/verify`]: wrapupScript(eh),
    [`${el.id}/build`]: buildScript(el), [`${el.id}/verify`]: wrapupScript(el), [`${er.id}/verify`]: wrapupScript(er),
  });
  const r = await again(p);

  assert.deepEqual(r.state.queue.map((x) => [x.id, x.state]), [[ef.id, 'FAILED'], ...[eq, ea, eh, el, er].map((e) => [e.id, 'MERGED'])]);
  assert.deepEqual(r.steps, [
    `${eq.id}/build-1`, `${eq.id}/audit-1`, `${eq.id}/verify-1`, // the session that asked, then on
    `${ea.id}/verify-1`, `${eh.id}/verify-1`, // straight to verify
    `${el.id}/build-1`, `${el.id}/audit-1`, `${el.id}/verify-1`, // the approved plan is built
    `${er.id}/audit-1`, `${er.id}/verify-1`, // the parked build is checked, audited, verified
  ]);
  // No session the first run finished is run again: only the build that parked at its question.
  const repeated = r.steps.filter((s) => ran1.includes(s) && !/audit-1|verify-1/.test(s) && s !== `${eq.id}/build-1`);
  assert.deepEqual(repeated.filter((s) => s !== `${el.id}/build-1`), []);
  assert.ok(!ran1.includes(`${el.id}/build-1`), 'the plan-lint epic had not been built before');
  for (const e of [eq, ea, eh, el, er]) assert.ok(merged(p, tips[e.id]), `${e.id}: the first run's branch tip is in develop`);
  assert.equal(git(p.clone, 'rev-parse', ef.branch), tips[ef.id], 'the failed epic keeps its branch');
  assert.equal(git(p.clone, 'for-each-ref', 'refs/autopilot/superseded/'), '', 'nothing was started over');
  for (const e of [ef, eq, ea, eh, el, er]) assert.equal(gate(p, e.id).decided.used.run, p.runName(), e.id);
  assert.deepEqual(Object.keys(readJson(path.join(p.state, 'epics.json'))), [ef.id]);
  assert.equal(git(p.project, 'status', '--porcelain'), '', 'the project is never written');
});
