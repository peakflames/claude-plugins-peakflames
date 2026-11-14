// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, ensureResumeGates, gateFacts, ownerAnswers } from '../driver.mjs';
import { pictureLines } from '../attend.mjs';
import { DRIVER, E1, TL, addEpic, buildActions, buildScript, git, happy, makeProject, planScript, readJson, waitFor, wrapupActions, wrapupScript } from './helpers.mjs';

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
// As a real build leaves it: the operator-observed requirement is named only by its checklist, not by a test under test/.
const buildWithManual = (e) => ({ actions: [...buildActions(e, { commit: false }), { do: 'write', path: `test/${e.slug}.test.js`, content: "import test from 'node:test';\ntest('the chart command exists', () => {});\n" }, { do: 'write', path: `tests/manual/${e.tors[0]}.md`, content: `# Manual check — ${e.tors[0]}\n\n1. Open chart.html\n` }, { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }] });

// ---- a question a session asked ----------------------------------------------------------------

test('question gate (deferral, asked in build): the next run resumes the build session that asked, with the owner\'s answer, and R8 answers that question once', async (t) => {
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
  // The session that asked is taken up again with what it knows: its transcript, a new id, and one message with the answer.
  const asked = readJson(path.join(p.state, 'runs', run1, 'epics', E1.id, 'build-1', 'step.json')).sessionId;
  const [build] = r.calls;
  assert.deepEqual(build.argv.slice(build.argv.indexOf('--resume'), build.argv.indexOf('--resume') + 3), ['--resume', asked, '--fork-session']);
  assert.notEqual(build.argv[build.argv.indexOf('--session-id') + 1], asked);
  assert.equal(build.prompt, fs.readFileSync(p.dir(E1.id, 'build-1', 'resume-prompt.md'), 'utf8'));
  assert.match(build.prompt, /^You were stopped while the project's owner was asked your question\. They have answered\./);
  assert.ok(build.prompt.includes(`**Asked:** "${q}"`) && build.prompt.includes('**The owner\'s answer:** "Fix now" — Pat Owner'), build.prompt);
  assert.match(build.prompt, /Continue from exactly where you stopped\. Do not start the step over/);
  assert.deepEqual(readJson(p.dir(E1.id, 'build-1', 'step.json')).resumeOf, { sessionId: asked, step: 'build-1', run: run1 });
  assert.ok(!r.calls[1].argv.includes('--resume') && !r.calls[2].argv.includes('--resume'), 'only the session that asked is resumed');
  assert.equal(Object.values(tools(p, E1.id, 'build-1')[0].hookSpecificOutput.updatedInput.answers)[0], 'Fix now');
  assert.deepEqual([gate(p, E1.id).decided.used.run, gate(p, E1.id).decided.used.session], [p.runName(), 'build-1']);
  assert.ok(merged(p, tip), 'the branch the first run left is what merged');
  assert.deepEqual(readJson(path.join(p.state, 'epics.json')), {}, 'a merged epic carries nothing forward');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Resumed at BUILD on `feature\/epic-Lg1Csv7-csv-import` .*Pat Owner answered "Fix now" on `gates\/Lg1Csv7-1\.json`/);
});

test('amendment gate, "Amend": the build changes the requirement in the owner\'s name, and the checks follow the amended anchors instead of failing the build for it', async (t) => {
  const p = makeProject(t);
  const old = E1.tors[0]; const fresh = 'TOR-01-Am3nd3d';
  const q = `${old} — The tool shall import every row looks wrong: its Then cannot be met. Proposed: same title / Then: "rows after the header are imported". How to proceed?`;
  const AMEND = [`Amend ${old} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, AMEND)] } });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind, gate(p, E1.id).tor], ['PARKED', 'amendment', old]);
  assert.match(gate(p, E1.id).why, /a requirement changes only with the owner's approval/);
  assert.equal(decide(p, E1.id, AMEND[0]).enters, 'BUILD');

  // As seen live: the old requirement is retired and a new one takes its place, in the requirement files, the
  // sidecar and the tests; the session's last commit is a `test(…)` one on top of the build's `feat(…)`.
  const E1a = { ...E1, tors: [fresh, ...E1.tors.slice(1)] };
  // The change record `tor-lifecycle check` asks for when a requirement goes away, written before the swap.
  const head = ['id = "CR-Am3nd3d"', 'date = 2026-11-13', 'kind = "supersede"', 'title = "Rows after the header"', 'reason = "The old Then cannot be met."', 'approved_via = "epic-branch"', 'approved_by = "Pat Owner"', 'refs = ["epic Lg1Csv7"]', 'keywords = ["header row"]', '', '[[changes]]', `tor = "${old}"`];
  const record = { do: 'exec', cmd: `mkdir -p docs/requirements/changes && f=$(basename "$(grep -l "${old}" docs/requirements/*.feature.md)") && fp=$(${TL} fingerprint | awk '$1=="${old}"{print $2}') && { printf '%s\\n' ${head.map((l) => `'${l}'`).join(' ')} "feature_file = \\"$f\\"" "fingerprint = \\"$fp\\"" 'successors = ["${fresh}"]' "text = '''"; ${TL} text ${old}; printf '%s\\n' "'''"; } > docs/requirements/changes/2026-11-13-Am3nd3d.toml` };
  const swap = { do: 'exec', cmd: `grep -rl "${old}" docs/requirements/*.feature.* docs/implementation-plan | xargs sed -i.bak "s/${old}/${fresh}/g" && find docs -name "*.bak" -delete` };
  p.scenario({
    [`${E1.id}/build`]: { actions: [ask(q, AMEND), { do: 'branch', name: E1.branch }, record, swap, ...buildActions(E1a).slice(1), { do: 'write', path: 'test/extra.test.js', content: `// ${fresh}\n` }, { do: 'commit', message: `test(epic-${E1.id}): cite only the live requirement ${fresh}` }] },
    [`${E1.id}/verify`]: wrapupScript(E1a),
  });
  const r = await again(p);
  const checks = Object.fromEntries(readJson(p.dir(E1.id, 'check-build-1.json')).checks.map((c) => [c.name, c]));
  assert.deepEqual(['branch-and-commit', 'traceability', 'scope'].map((n) => checks[n].pass), [true, true, true], JSON.stringify([checks['branch-and-commit'], checks.traceability, checks.scope]));
  assert.match(checks.traceability.evidence, new RegExp(`after the owner's approved amendment of ${old}`));
  assert.match(checks.scope.evidence, new RegExp(`requirement files changed under the owner's approved amendment of ${old}`));
  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((x) => `${E1.id}/${x}`), 'no repair round');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.epic(E1.id).amended, [old]);
});

test('requirement files a session changes without the owner\'s approval are still out of scope', async (t) => {
  const p = makeProject(t);
  const scripts = happy(E1);
  scripts[`${E1.id}/build`].actions.splice(-1, 0, { do: 'exec', cmd: 'for f in docs/requirements/*.feature.md; do echo "" >> "$f"; done' });
  p.scenario(scripts);
  await p.go();
  const scope = readJson(p.dir(E1.id, 'check-build-1.json')).checks.find((c) => c.name === 'scope');
  assert.equal(scope.pass, false);
  assert.match(scope.evidence.join(' '), /requirements are frozen during a run/);
});

test('unmatched question (asked in plan): replayable — the next run plans again and R8 matches the recorded question text', async (t) => {
  const p = makeProject(t);
  const q = 'The spec names both a monthly and a weekly budget period. Which should this epic build?';
  p.scenario({ [`${E1.id}/plan`]: { actions: [ask(q, ['Monthly', 'Weekly'])] } });
  await p.go();
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).session], ['unmatched', 'plan-1']);
  assert.equal(decide(p, E1.id, 'Weekly').enters, 'PLAN');

  p.scenario({ ...happy(E1), [`${E1.id}/plan`]: { actions: [ask(q.replace('  ', ' '), ['Monthly', 'Weekly']), ask('Which colour should the bars be?', ['Red', 'Blue']), ask('Which colour should the bars be?', ['Red', 'Blue']), ...planScript(E1).actions] } });
  const r = await again(p);

  // The recorded question is answered once with the owner's answer; a different unmatched question still parks.
  // Before it reaches the owner, the session is reminded once of what they already answered; asked again, it parks.
  const [first, second, third] = tools(p, E1.id, 'plan-1');
  assert.equal(Object.values(first.hookSpecificOutput.updatedInput.answers)[0], 'Weekly');
  assert.deepEqual([second.hookSpecificOutput.permissionDecision, second.continue, second.stopReason], ['deny', undefined, undefined]);
  assert.match(second.hookSpecificOutput.permissionDecisionReason, /not put to the owner yet\. They have already answered 1 question\(s\) for this step: \(1\) asked "The spec names both .*" — the owner answered "Weekly"\. If what you are asking is one of those in other words, do not ask it: act on their answer now\. If it is a different decision, ask it again/);
  assert.equal(third.stopReason, 'autopilot: parked at human gate');
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
  assert.equal(decide(p, E1.id, ANSWERS.auditReal, { note: 'the live path must be exercised' }).enters, 'FIX_BUILD');

  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/live.js', content: 'export const live = true;\n' }, { do: 'commit', message: `feat(epic-${E1.id}): exercise the live path` }] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['fix-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.fixRounds], ['MERGED', 1]);
  const brief = fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8');
  assert.match(brief, /confirmed they are real/);
  assert.match(brief, /\*\*F1 stand-in\*\* — the stand-in problem/);
  assert.ok(!brief.includes('scope'), 'only the findings that parked');
  assert.match(brief, /The owner's note: the live path must be exercised/);
  assert.ok(r.calls[0].prompt.includes(fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8').trim()), 'the one repair session is given the brief as its prompt');
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

test('unattended, a verifier that repairs code on its own and merges is rolled back, whatever it reports', async (t) => {
  const p = makeProject(t);
  const inline = [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/usage.js', content: 'export const usage = 1;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): usage text` }];
  // Unattended: a verifier that changes code on its own and merges is rolled back, whatever it reports.
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [...inline, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.match(p.epic(E1.id).reason, /merge gate/);
  const failed = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.filter((c) => !c.pass).map((c) => c.name);
  assert.deepEqual(failed, ['verdict', 'no-waivers']);
  assert.equal(merged(p, git(p.clone, 'rev-parse', E1.branch)), false, 'the merge was rolled back');
});

test('owner-approved "Fix now" in verify: the inline repair merges and the report names it', async (t) => {
  const p = makeProject(t);
  const q = 'Code-review finding in Epic Lg1Csv7: the usage text omits a command. Recommendation: Fix now. How to proceed?';
  const options = ['Fix now (Recommended)', 'Leave as is', 'Stop — epic FAILs'];
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, options)] } });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind], ['PARKED', 'unmatched']);
  assert.equal(decide(p, E1.id, 'Fix now (Recommended)').enters, 'VERIFY');

  const inline = [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/usage.js', content: 'export const usage = 1;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): usage text` }];
  p.scenario({ [`${E1.id}/verify`]: { actions: [ask(q, options), ...inline, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  const r = await again(p);
  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual([e.fixedAtWrapup.count, e.fixedAtWrapup.files, e.fixedAtWrapup.approvedBy], [1, ['src/usage.js'], `gates/${E1.id}-1.json`]);
  const verdict = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'verdict');
  assert.deepEqual(verdict.evidence.fixedDuringWrapup, ['src/usage.js']);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Fixed during verification, on your "Fix now" \(`gates\/Lg1Csv7-1\.json`\): src\/usage\.js\. The verifier checked its own fix/);

  // The same approval does not cover a waiver or an undisclosed deferral.
  const p2 = makeProject(t);
  p2.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, options)] } });
  await p2.go();
  decide(p2, E1.id, 'Fix now (Recommended)');
  p2.scenario({ [`${E1.id}/verify`]: { actions: [ask(q, options), ...inline, ...wrapupActions(E1, { counts: [2, 1, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await again(p2);
  assert.equal(p2.epic(E1.id).state, 'PARKED');
  assert.deepEqual(readJson(p2.dir(E1.id, 'check-verify-1.json')).checks.filter((c) => !c.pass).map((c) => c.name), ['no-waivers']);
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

test('an epic with screens: the build must leave pictures for the look; the gate carries them, the verifier looks too, and none of it is committed', async (t) => {
  const p = makeProject(t);
  const ui = addEpic(p.project, { id: 'Lg6Scr1', slug: 'dashboard', name: 'Dashboard', nn: '06' });
  fs.appendFileSync(path.join(p.project, 'docs', 'implementation-plan', 'phase-1-core', `epic-${ui.id}-${ui.slug}.md`), '\n## Screens\n\n- S-01 Home\n');
  const claude = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace('**Project type:** CLI tool', '**Project type:** Web app'));
  git(p.project, 'commit', '-qam', 'docs: the dashboard has a screen');
  const png = (name) => ({ do: 'exec', cmd: `mkdir -p .autopilot/look && printf 'PNG' > .autopilot/look/${name}` });
  const index = { do: 'exec', cmd: "printf '%s\\n' '- home.png — the home page, signed in, with three figures — TOR-06-Lg6Scr1' '- home-narrow.png — the home page at 320 px wide — TOR-06-Lg6Scr1' > .autopilot/look/index.md" };

  // The build takes no pictures: its checks send it back, and the one repair round takes them.
  p.scenario({
    [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: buildScript(ui),
    [`${ui.id}/fix`]: { actions: [{ do: 'checkout', name: ui.branch }, png('home.png'), png('home-narrow.png'), index, { do: 'commit', message: `fix(epic-${ui.id}): pictures for the look` }] },
  });
  await p.go({ queue: [ui.id] });
  assert.match(fs.readFileSync(p.dir(ui.id, 'build-1', 'build-rules.md'), 'utf8'), /# Pictures for the owner's look\n\nThis epic changes screens\./);
  const first = readJson(p.dir(ui.id, 'check-build-1.json')).checks.find((c) => c.name === 'look-pictures');
  assert.equal(first.pass, false);
  assert.match(first.evidence, /no pictures in \.autopilot\/look\/: take a screenshot of every screen and state the requirements name/);
  assert.match(fs.readFileSync(p.dir(ui.id, 'fix-brief.md'), 'utf8'), /\*\*look-pictures\*\*/);
  assert.equal(readJson(p.dir(ui.id, 'check-build-2.json')).checks.find((c) => c.name === 'look-pictures').pass, true);

  // Parked for the look, with the pictures on the gate by full path and with the build's captions.
  assert.deepEqual([p.epic(ui.id).state, p.epic(ui.id).reason], ['PARKED', 'human check needed before verify']);
  const g = gate(p, ui.id);
  assert.deepEqual(g.artifacts.slice(0, 2), [`look/${ui.id}/home-narrow.png`, `look/${ui.id}/home.png`]); // then the project's run command output, as before
  assert.deepEqual(g.pictures, [{ path: path.join(p.state, 'look', ui.id, 'home-narrow.png'), shows: 'the home page at 320 px wide — TOR-06-Lg6Scr1' }, { path: path.join(p.state, 'look', ui.id, 'home.png'), shows: 'the home page, signed in, with three figures — TOR-06-Lg6Scr1' }]);
  assert.deepEqual(g.open.slice(0, 2), g.pictures.map((x) => x.path));
  // Git never saw them: nothing to commit, nothing on the branch.
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  assert.equal(git(p.clone, 'ls-tree', '-r', '--name-only', ui.branch, '--', '.autopilot/look'), '');

  // The verifier is given the same pictures in the clone and told to say what it sees; its words are kept.
  assert.equal(decide(p, ui.id, ANSWERS.looksRight, { note: 'looked at both pictures: three figures, readable at 320 px' }).enters, 'VERIFY');
  fs.rmSync(path.join(p.clone, '.autopilot', 'look'), { recursive: true, force: true }); // as after another epic's build
  const report = 'Verdict: PASS\n\n## What the pictures show\n\n- `home.png`: a signed-in page with three figures and a Sign out button. Matches TOR-06-Lg6Scr1.\n- home-narrow.png: the same page in one column, nothing cut off. Matches.\n\n## Next\n\n- nothing';
  p.scenario({ [`${ui.id}/verify`]: { actions: [{ do: 'exec', cmd: 'test -f .autopilot/look/home.png && test -f .autopilot/look/index.md' }, ...wrapupActions(ui)], result: { result: report } } });
  await again(p, { queue: [ui.id] });
  assert.match(fs.readFileSync(p.dir(ui.id, 'verify-1', 'verify-rules.md'), 'utf8'), /# The pictures of what was built[\s\S]*under the heading "What the pictures show", write one line per picture/);
  assert.equal(p.epic(ui.id).state, 'MERGED');
  assert.deepEqual(p.epic(ui.id).seen, ['home.png: a signed-in page with three figures and a Sign out button. Matches TOR-06-Lg6Scr1.', 'home-narrow.png: the same page in one column, nothing cut off. Matches.']);
  assert.equal(git(p.clone, 'ls-tree', '-r', '--name-only', 'develop', '--', '.autopilot/look'), '', 'the pictures are not in the merged code');
  const status = JSON.parse(cli('status', '--project', p.project, '--json').stdout);
  assert.deepEqual(status.seen.map((x) => [x.epic, x.lines.length]), [[ui.id, 2]]);
});

test('an epic without screens is told nothing about pictures and is not checked for them', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  await p.go();
  assert.doesNotMatch(fs.readFileSync(p.dir(E1.id, 'build-1', 'build-rules.md'), 'utf8'), /Pictures for the owner's look/);
  assert.doesNotMatch(fs.readFileSync(p.dir(E1.id, 'verify-1', 'verify-rules.md'), 'utf8'), /The pictures of what was built/);
  assert.equal(readJson(p.dir(E1.id, 'check-build-1.json')).checks.some((c) => c.name === 'look-pictures'), false);
  assert.deepEqual(pictureLines('## What the pictures show\n- a.png: fine\n\n## Other\n- not this'), ['a.png: fine']);
});

test('a look that does not settle the requirement goes back to the owner with the verifier\'s reason; no repair session, no fix round used', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const tip = git(p.clone, 'rev-parse', e5.branch);

  // The real wrapup asks this when it cannot judge; policy answers "Stop — epic FAILs" and nothing merges.
  const cannot = `${e5.tors[0]} is CANNOT VERIFY: the recorded observation says nothing about the bar heights. Recommendation: Stop — the missing observation has to be recorded. How to proceed?`;
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(cannot, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'])], result: { result: '## Verdict: FAIL' } } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, [`${e5.id}/verify-1`], 'no repair session: no code is wrong');
  const e = p.epic(e5.id);
  assert.deepEqual([e.state, e.fixRounds ?? 0, e.look], ['PARKED', 0, null]);
  assert.equal(e.reason, `the owner's recorded look did not settle ${e5.tors[0]}`);
  const g2 = gate(p, e5.id, 2);
  assert.deepEqual([g2.kind, g2.options, g2.decided, g2.branchTip], ['human-check', [ANSWERS.looksRight, ANSWERS.notRight], null, tip]);
  assert.equal(g2.question, `The verifier could not judge ${e5.tors[0]} from what you recorded. the recorded observation says nothing about the bar heights. Look again with that in mind: does what was built look right?`);
  assert.deepEqual(g2.artifacts, gate(p, e5.id, 1).artifacts, 'the same things to look at');

  // The owner looks again and says what was missing: verify runs on the same tip and merges.
  assert.equal(decide(p, e5.id, ANSWERS.looksRight, { n: 2, note: 'the tallest bar is the largest total; the half-size one is half as tall' }).enters, 'VERIFY');
  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const last = await again(p, { queue: [e5.id] });
  assert.deepEqual(last.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED');
  assert.match(fs.readFileSync(last.calls[0].argv[last.calls[0].argv.indexOf('--append-system-prompt-file') + 1], 'utf8'), /the half-size one is half as tall/);
});

test('the look as a form: the gate lists the requirement\'s Then lines, the file to open and the checklist; a yes to every line is a complete "Looks right"', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { Lg5Chr8: "echo '<svg/>' > chart.html" } } });
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  const g = gate(p, e5.id);
  assert.ok(g.checks.length >= 2, JSON.stringify(g.checks));
  assert.deepEqual(g.checks.map((c) => [c.n, c.tor]), g.checks.map((_, i) => [i + 1, e5.tors[0]]));
  assert.ok(g.checks.every((c) => c.clause && !/^(Then|And|But)\b/.test(c.clause)), 'the lines are the requirement\'s own, without the keyword');
  assert.deepEqual(g.open, [path.join(p.state, `${p.rel()}/epics/${e5.id}/artifacts/files/chart.html`)], 'a full path a person can open');
  assert.deepEqual(g.checklists.map((c) => c.path), [`tests/manual/${e5.tors[0]}.md`]);
  assert.match(g.checklists[0].text, /Manual check/);

  const dec = (answer, obs, note) => cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-1.json`, '--answer', answer, '--by', 'Pat Owner', '--observations', JSON.stringify(obs), ...(note ? ['--note', note] : []));
  const all = (v) => g.checks.map((c) => ({ n: c.n, answer: v }));
  assert.match(dec(ANSWERS.looksRight, all('yes').slice(1)).stderr, /line 1 .* needs a yes or a no/);
  assert.match(dec(ANSWERS.looksRight, [{ n: 1, answer: "couldn't tell" }, ...all('yes').slice(1)]).stderr, /"could not tell" is not an answer to record/);
  assert.match(dec(ANSWERS.looksRight, [{ n: 1, answer: 'no' }, ...all('yes').slice(1)]).stderr, /a "no" on a line means the answer is "Not right — describe"/);
  assert.match(dec(ANSWERS.notRight, all('yes')).stderr, /every line was answered yes/);
  assert.match(dec(ANSWERS.notRight, [{ n: 1, answer: 'no' }, ...all('yes').slice(1)]).stderr, /a "no" needs --note/);
  assert.equal(gate(p, e5.id).decided, null, 'nothing was recorded by a refused answer');

  const ok = dec(ANSWERS.looksRight, all('yes'));
  assert.equal(ok.status, 0, ok.stderr);
  const d = gate(p, e5.id).decided;
  assert.deepEqual(d.observations.map((o) => [o.n, o.answer, o.clause]), g.checks.map((c) => [c.n, 'yes', c.clause]));
  assert.ok(d.note.startsWith('Confirmed line by line by the owner. Yes: ') && g.checks.every((c) => d.note.includes(c.clause)), d.note);

  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const r = await again(p, { queue: [e5.id] });
  assert.equal(p.epic(e5.id).state, 'MERGED');
  const look = fs.readFileSync(r.calls[0].argv[r.calls[0].argv.indexOf('--append-system-prompt-file') + 1], 'utf8');
  assert.match(look, /What they confirmed, one Then at a time/);
  for (const c of g.checks) assert.ok(look.includes(`"${c.clause}" — yes, I saw this`), c.clause);
  assert.match(look, /"Looks right" is the owner's answer to the whole requirement/);
  assert.match(look, /Give CANNOT VERIFY only where the record contradicts a Then or says it was not checked/);
});

test('after the verifier asks for more, the earlier look is kept: only the lines not yet confirmed are asked, and the new words are added to the old', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const cannot = `${e5.tors[0]} is CANNOT VERIFY: the record says the heights were not checked. Recommendation: Stop. How to proceed?`;
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(cannot, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'])], result: { result: '## Verdict: FAIL' } } });
  await again(p, { queue: [e5.id] });

  const g2 = gate(p, e5.id, 2);
  assert.deepEqual([g2.earlier.note, g2.earlier.by], ['six bars, labels readable', 'Pat Owner']);
  assert.deepEqual(g2.asks, [`${e5.tors[0]}: the record says the heights were not checked.`]);
  assert.deepEqual(g2.checks.map((c) => c.clause), gate(p, e5.id, 1).checks.map((c) => c.clause), 'a free-text look confirmed no line, so every line is asked once');
  const r = cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-2.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner', '--observations', JSON.stringify(g2.checks.map((c) => ({ n: c.n, answer: 'yes' }))));
  assert.equal(r.status, 0, r.stderr);
  const d = gate(p, e5.id, 2).decided;
  assert.ok(d.note.startsWith('six bars, labels readable Added after the verifier asked: Confirmed line by line by the owner.'), d.note);
  assert.equal(d.observations.length, g2.checks.length);

  // A second time round, the lines already confirmed are not asked again.
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(cannot, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'])], result: { result: '## Verdict: FAIL' } } });
  await again(p, { queue: [e5.id] });
  const g3 = gate(p, e5.id, 3);
  assert.deepEqual(g3.checks, [], 'every line has the owner\'s yes already');
  assert.equal(g3.earlier.observations.length, g2.checks.length);
  assert.match(cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-3.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner').stderr, /needs --note/);
});

test('human-check gate, "Not right — describe": the fix round gets the owner\'s note, and the changed build parks for a new look', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  // No humanCheck command: the artifact is the project's **Run:** command from CLAUDE.md, placeholders dropped.
  assert.match(fs.readFileSync(path.join(p.state, gate(p, e5.id).artifacts[1]), 'utf8'), /^\$ node bin\/ledger\.js\n/);
  assert.equal(decide(p, e5.id, ANSWERS.notRight, { note: 'the bars overlap' }).enters, 'FIX_BUILD');

  p.scenario({ [`${e5.id}/plan-fix`]: planScript(e5), [`${e5.id}/fix`]: { actions: [{ do: 'checkout', name: e5.branch }, { do: 'write', path: 'src/bars.js', content: 'export const gap = 4;\n' }, { do: 'commit', message: `feat(epic-${e5.id}): space the bars` }] } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, ['fix-1', 'audit-1'].map((s) => `${e5.id}/${s}`));
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

test('resume gate (STOP mid-build): the STOP file is cleared, and resuming continues the build in a new session instead of checking a half-built branch', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'hang' }] } });
  const running = p.go();
  await waitFor(() => fs.existsSync(path.join(p.clone, 'src', 'half.js')));
  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  await running;
  assert.ok(!fs.existsSync(path.join(p.state, 'STOP')), 'a STOP that was honoured does not stop the next run');
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).phase], ['resume', 'CHECK_BUILD']);
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.match(git(p.clone, 'log', '-1', '--format=%s', E1.branch), /^wip\(autopilot\)/);
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'BUILD');
  assert.equal(JSON.parse(cli('preflight', '--project', p.project, '--workspace', p.state, '--json', '--allow-test-double').stdout).epics.find((e) => e.id === E1.id).gate.enters, 'BUILD');

  p.scenario({ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'no check before the build, no fix round');
  assert.match(r.calls[0].prompt, /^An earlier session started this work and was stopped before it finished\.[\s\S]*wip\(autopilot\)[\s\S]*\n\nImplement the following plan:\n\n# Plan — epic Lg1Csv7/);
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).fixRounds, p.epic(E1.id).resumed.phase], ['MERGED', 0, 'BUILD']);
  assert.equal(readJson(p.dir(E1.id, 'check-build-1.json')).pass, true);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /resuming at BUILD on .*build-1 was cut short/);
  // The auditor reads both build sessions: the one that was stopped and the one that finished.
  assert.deepEqual(readJson(p.dir(E1.id, 'audit-1', 'bundle', 'bundle.json')).steps, ['build-1', 'build-1']);
  assert.ok(merged(p, tip), 'the WIP commit is part of what merged');
});

test('STOP honoured by the referee (the session ends itself with a success line): parked as stopped, and resumed at BUILD', async (t) => {
  const p = makeProject(t, { config: { timing: { pollMs: 600000, killGraceMs: 300, infraRetryMs: 0 } } }); // the driver's own STOP poll stays out of it
  // As seen live: the hook ends the session at its next tool call, before the driver's poll kills it.
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'exec', cmd: 'touch "{{state}}/STOP"' }, { do: 'tool', tool_name: 'Bash', tool_input: { command: 'ls' } }] } });
  await p.go();
  assert.match(p.epic(E1.id).reason, /stopped by the STOP file during build-1/);
  assert.equal(readJson(p.dir(E1.id, 'build-1', 'result.json')).terminal_reason, 'hook_stopped');
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'BUILD');
  p.scenario({ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);
  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.equal(p.epic(E1.id).state, 'MERGED');
});

test('a gate an earlier driver wrote ("stopped before CHECK_BUILD" after a build the referee ended) follows the same rule; a build that ended by itself is still checked', async (t) => {
  const p = makeProject(t, { config: { timing: { pollMs: 600000, killGraceMs: 300, infraRetryMs: 0 } } });
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'exec', cmd: 'touch "{{state}}/STOP"' }, { do: 'tool', tool_name: 'Bash', tool_input: { command: 'ls' } }] } });
  await p.go();
  // Rewritten as driver 0.4.0 left it: the session counted as ended, and the run stopped before the check.
  const file = path.join(p.state, 'gates', `${E1.id}-1.json`);
  fs.writeFileSync(file, JSON.stringify({ ...readJson(file), question: 'stopped: run stopped (STOP file) before CHECK_BUILD. Continue it in the next run?' }));
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'BUILD');
  assert.equal(gateFacts(p.state, 'develop').get(E1.id).enters, 'BUILD');

  // The same branch, had its session ended by itself: the rule leaves it to CHECK_BUILD and the repair round.
  const result = p.dir(E1.id, 'build-1', 'result.json');
  fs.writeFileSync(result, JSON.stringify({ ...readJson(result), terminal_reason: 'completed' }));
  assert.equal(gateFacts(p.state, 'develop').get(E1.id).enters, 'CHECK_BUILD');
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
  // Before the verify session started, the driver brought the waiting branch up to date with develop.
  assert.equal(e.caughtUp.from, tip);
  assert.match(git(p.clone, 'log', '-1', '--format=%s', e.caughtUp.to), /^Merge develop into .* \(autopilot: catch up before verify\)$/);
  assert.deepEqual(git(p.clone, 'rev-list', '--parents', '-n', '1', e.caughtUp.to).split(' ').slice(1), [tip, e.caughtUp.integration]);
  assert.equal(e.preVerify.branchTip, e.caughtUp.to, 'the merge gate measures the verifier from the caught-up tip');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /brought up to date with develop before verify/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /The branch was \d+ commits? behind `develop` and merged cleanly in a trial merge\./);
});

test('a verifier that first merges develop into the waiting branch is not blamed for the other epic\'s files; a file it writes itself still is', async (t) => {
  const setup = async () => {
    const p = makeProject(t);
    const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
    p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d) });
    await p.go();
    decide(p, E1.id, ANSWERS.auditNotReal);
    return p;
  };
  const catchUp = { do: 'merge', branch: 'develop', message: `Merge branch 'develop' into ${E1.branch}` };

  const p = await setup();
  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1, { extraOnBranch: [catchUp] }) });
  await again(p);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);

  const q = await setup();
  q.scenario({ [`${E1.id}/verify`]: wrapupScript(E1, { extraOnBranch: [catchUp, { do: 'write', path: 'src/extra.js', content: 'export const x = 1;\n' }, { do: 'commit', message: 'fix: something of the verifier\'s own' }] }) });
  await again(q);
  assert.equal(q.epic(E1.id).state, 'PARKED');
  assert.match(JSON.stringify(q.epic(E1.id).checks.at(-1)), /verdict/);
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
  p.scenario({ [`${E1.id}/verify`]: { actions: [], result: { result: 'Verdict: FAIL' } }, [`${E1.id}/fix`]: { actions: [ask('Should the repair also rename the command?', ['Yes', 'No'])] }, ...happy(d) });
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

// ---- a finished build must not die on autopilot's own bookkeeping ---------------------------------

/** A build that changes an existing test, records why as the referee asks, and commits its work file by file — leaving the record uncommitted. */
const buildLeavingRecord = (e) => ({ actions: [
  ...buildActions(e, { commit: false }),
  { do: 'write', path: 'test/ledger.test.js', content: "import test from 'node:test';\ntest('still passes', () => {});\n" },
  { do: 'write', path: 'test/package.json', content: '{"type":"module","devDependencies":{"x":"1"}}\n' },
  { do: 'write', path: '.autopilot/test-changes.jsonl', content: '{"path":"test/ledger.test.js","reason":"the epic changes what it prints"}\n' },
  { do: 'exec', cmd: `git add src test docs && git commit -q -m "feat(epic-${e.id}): implement ${e.slug}"` },
] });

test('a build that leaves only the referee\'s record uncommitted is not parked: the driver commits it and the checks run', async (t) => {
  const p = makeProject(t);
  fs.writeFileSync(path.join(p.project, 'test', 'ledger.test.js'), "import test from 'node:test';\ntest('passes', () => {});\n");
  fs.writeFileSync(path.join(p.project, 'test', 'package.json'), '{"type":"module"}\n');
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'test: an existing test and a manifest');
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: buildLeavingRecord(E1) });
  await p.go();
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  const check = readJson(p.dir(E1.id, 'check-build-1.json'));
  assert.equal(check.pass, true, JSON.stringify(check.checks.filter((c) => !c.pass)));
  // The session's own commit is what is judged; the manifest under test/ needs no reason, the test does and has one.
  assert.match(check.checks.find((c) => c.name === 'branch-and-commit').evidence.tipSubject, /^feat\(epic-/);
  assert.deepEqual(check.checks.find((c) => c.name === 'test-integrity').evidence.existingTestsChanged, [{ path: 'test/ledger.test.js', reason: 'the epic changes what it prints' }]);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /committed the referee's record \(\.autopilot\/\)/);
});

test('an epic an earlier driver parked on that record, with no question, gets one from `driver.mjs report` and then finishes from CHECK_BUILD', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: buildScript(E1) });
  // As driver 0.5.0 left it: built and committed, then parked at CHECK_BUILD with a wip commit on top and no gate.
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [...buildActions(E1), { do: 'write', path: 'stray.txt', content: 'x' }] } });
  await p.go();
  assert.match(p.epic(E1.id).reason, /^CHECK_BUILD: the build left uncommitted work/);
  for (const f of fs.readdirSync(path.join(p.state, 'gates'))) fs.rmSync(path.join(p.state, 'gates', f)); // the old driver wrote none
  git(p.clone, 'rm', '-q', 'stray.txt'); git(p.clone, 'commit', '-q', '-m', 'wip(autopilot): uncommitted work at park'); // its tip: a driver commit, tree as the build left it

  assert.deepEqual(cli('preflight', '--project', p.project, '--workspace', p.state, '--json', '--allow-test-double').stdout.includes('"openGates": []'), true);
  const r = cli('report', '--workspace', p.state);
  assert.equal(r.status, 0, r.stderr);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.options, g.branchTip], ['resume', 'CHECK_BUILD', [ANSWERS.resume, ANSWERS.startOver], git(p.clone, 'rev-parse', E1.branch)]);
  assert.ok(readJson(path.join(p.runDir(), 'report.json')).gates.some((x) => x.file === `gates/${E1.id}-1.json` && !x.decided), 'the report asks it');
  assert.deepEqual(ensureResumeGates(p.state), [], 'written once');
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'CHECK_BUILD');

  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const again2 = await again(p);
  assert.deepEqual(again2.steps, [`${E1.id}/audit-1`, `${E1.id}/verify-1`], 'no rebuild');
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
});

// ---- the owner's answer reaches the session that takes the step up again --------------------------

test('an answered question is not asked twice: the verify session that asked is resumed; reworded, the question is met with a reminder, not a new park', async (t) => {
  const p = makeProject(t);
  const q1 = "The live check needs a real sign-in in your browser. Should I open the browser sign-in now so the live check can run?";
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q1, ['Yes — open sign-in', 'No — use in-process proof'])], result: { total_cost_usd: 1.5 } } });
  await p.go();
  const run1 = p.runName();
  const asking = p.epic(E1.id).sessions.at(-1);
  assert.deepEqual([asking.name, asking.costUsd], ['verify-1', 1.5]);
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind, gate(p, E1.id).session], ['PARKED', 'unmatched', 'verify-1']);
  assert.equal(decide(p, E1.id, 'Yes — open sign-in').enters, 'VERIFY');

  // Seen live: the session that takes the step up again words the same question differently, with other options.
  const q2 = 'The gate opens a browser to your real sign-in. Can you complete that sign-in now?';
  // Seen live: a resumed session's result line counts the session it continues too ($1.5 here, already in the books).
  p.scenario({ [`${E1.id}/verify`]: { actions: [ask(q2, ['Yes — open the browser', 'Yes — tools list only', 'No — not now']), ...wrapupActions(E1)], result: { result: 'Verdict: PASS', total_cost_usd: 2.25 } } });
  const r = await again(p);
  const resumed = p.epic(E1.id).sessions.at(-1);
  assert.deepEqual([resumed.costUsd, resumed.reportedCostUsd, resumed.resumed], [0.75, 2.25, asking.sessionId], 'only what the resumed session added is counted');
  assert.equal(readJson(path.join(p.runDir(), 'state.json')).spentUsd, 0.75);

  assert.deepEqual(r.steps, [`${E1.id}/verify-1`], 'one session, no second park');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  const [verify] = r.calls;
  const asked = readJson(path.join(p.state, 'runs', run1, 'epics', E1.id, 'verify-1', 'step.json')).sessionId;
  assert.deepEqual(verify.argv.slice(verify.argv.indexOf('--resume'), verify.argv.indexOf('--resume') + 3), ['--resume', asked, '--fork-session']);
  assert.ok(verify.prompt.includes(`**Asked:** "${q1}"`) && verify.prompt.includes('"Yes — open sign-in" — Pat Owner'));
  assert.match(verify.prompt, /If the answer needs something only a person can do \(a sign-in in a browser, a look\s+at a screen\), the owner chose it knowing that: start it, give them time, and carry on\./);
  assert.match(verify.prompt, /may have been put back to how it was when you started/);
  const [reworded] = tools(p, E1.id, 'verify-1');
  assert.equal(reworded.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(reworded.hookSpecificOutput.permissionDecisionReason, /They have already answered 1 question\(s\) for this step: \(1\) asked "The live check needs .*" — the owner answered "Yes — open sign-in"/);
  assert.equal(reworded.continue, undefined, 'a reminder, not a stop');
  assert.deepEqual(fs.readdirSync(path.join(p.state, 'gates')), [`${E1.id}-1.json`], 'the owner is not asked again');
  // The answer is spent by the session that was told it, and the record says so.
  assert.deepEqual([gate(p, E1.id).decided.used.run, gate(p, E1.id).decided.used.note], [p.runName(), 'the session was told this answer before it started and did not ask again']);
  // A reminder is not a refusal: it is not counted as something the referee blocked.
  assert.deepEqual(readJson(path.join(p.runDir(), 'report.json')).referee.blocked, []);
  assert.equal(readJson(path.join(p.runDir(), 'events.jsonl').replace('events.jsonl', 'state.json')).queue[0].answers.length, 1);
});

test('a different question still reaches the owner, and later sessions of the step are told every answer so far', async (t) => {
  const p = makeProject(t);
  const q1 = 'Should I open the browser sign-in now?';
  const q2 = 'The narration sample costs real money to synthesize. Run it?';
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q1, ['Yes', 'No'])] } });
  await p.go();
  decide(p, E1.id, 'Yes');

  // Reminded once, the session asks again: it is a different decision, so it parks for the owner.
  p.scenario({ [`${E1.id}/verify`]: { actions: [ask(q2, ['Run it', 'Skip it']), ask(q2, ['Run it', 'Skip it'])] } });
  const second = await again(p);
  assert.deepEqual(second.steps, [`${E1.id}/verify-1`]);
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id, 2).question, gate(p, E1.id, 2).decided], ['PARKED', q2, null]);
  assert.equal(gate(p, E1.id).decided.used.run, p.runName());
  decide(p, E1.id, 'Skip it', { n: 2 });

  // The next session is resumed with both answers; asked verbatim, either is answered with the owner's own answer.
  p.scenario({ [`${E1.id}/verify`]: { actions: [ask(q1, ['Yes', 'No']), ask(q2, ['Run it', 'Skip it']), ...wrapupActions(E1)], result: { result: 'Verdict: PASS' } } });
  const third = await again(p);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  const [verify] = third.calls;
  assert.ok(verify.prompt.includes(`1. **Asked:** "${q1}"`) && verify.prompt.includes(`2. **Asked:** "${q2}"`), verify.prompt);
  assert.deepEqual(readJson(p.dir(E1.id, 'verify-1', 'step.json')).answers.map((a) => [a.gate, a.kind, a.answer]), [[`gates/${E1.id}-1.json`, 'verify', 'Yes'], [`gates/${E1.id}-2.json`, 'verify', 'Skip it']]);
  const [a1, a2] = tools(p, E1.id, 'verify-1');
  assert.deepEqual([Object.values(a1.hookSpecificOutput.updatedInput.answers)[0], Object.values(a2.hookSpecificOutput.updatedInput.answers)[0]], ['Yes', 'Skip it']);
  assert.match(a1.hookSpecificOutput.permissionDecisionReason, /answered from the owner's recorded decision: Yes/);
  assert.deepEqual(fs.readdirSync(path.join(p.state, 'gates')).length, 2);
});

test('a session that cannot be resumed is replaced by a new one that is told the answers up front; that is not an infra error', async (t) => {
  const p = makeProject(t);
  const q = 'Should I open the browser sign-in now?';
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, ['Yes', 'No'])] } });
  await p.go();
  decide(p, E1.id, 'Yes');

  // The earlier session's transcript is gone: `--resume` ends at once with no result line.
  p.scenario({ [`${E1.id}/verify-1`]: { result: false, exit: 1 }, [`${E1.id}/verify-2`]: wrapupScript(E1) });
  const r = await again(p);
  assert.deepEqual(r.steps, [`${E1.id}/verify-1`, `${E1.id}/verify-2`]);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(r.state.consecutiveInfra, 0);
  const [resumed, fresh] = r.calls;
  assert.ok(resumed.argv.includes('--resume') && !fresh.argv.includes('--resume'));
  assert.equal(fresh.prompt, `/peak-workflow:wrapup-epic ${E1.id}`);
  const told = p.dir(E1.id, 'verify-2', 'owner-answers.md');
  assert.ok(fresh.argv.includes(told), 'the new session is told through its system prompt');
  const text = fs.readFileSync(told, 'utf8');
  assert.match(text, /^# Questions the owner has already answered/);
  assert.ok(text.includes(`**Asked:** "${q}"`) && text.includes('**The owner\'s answer:** "Yes" — Pat Owner'));
  assert.match(text, /Do not ask the same thing again in any wording/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /verify-1 could not resume the earlier session \(.*\); starting a new session for this step/);
});

test('starting over retires earlier answers: the fresh attempt is told none of them', async (t) => {
  const p = makeProject(t);
  const q = 'Should I open the browser sign-in now?';
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, ['Yes', 'No'])] } });
  await p.go();
  decide(p, E1.id, 'Yes');
  // Told the answer, the verify session is then cut short (a budget stop), and the owner starts the epic over.
  p.scenario({ [`${E1.id}/verify`]: { result: { subtype: 'error_max_turns', is_error: true } } });
  await again(p);
  assert.equal(gate(p, E1.id, 2).kind, 'resume');
  assert.deepEqual(ownerAnswers(p.state, E1.id).map((a) => a.answer), ['Yes'], 'kept while the same attempt goes on');
  decide(p, E1.id, ANSWERS.startOver, { n: 2 });
  p.scenario(happy(E1));
  const r = await again(p);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(ownerAnswers(p.state, E1.id), []);
  assert.ok(r.calls.every((c) => !c.argv.includes('--resume') && !c.argv.some((a) => a.endsWith('owner-answers.md'))));
});

// ---- a check the owner puts off is not a verdict (UAT 2026-11-14, G8jMzOz) -----------------------

const LATER = 'Not now — end the session';
const NONE = 'The wrapup ended without recording any verdicts, as you chose. The epic stays **Implemented** and nothing was written or committed.';
const signIn = (tor) => `${tor} is operator-observed. Can you do the real sign-in now? If you can't, the session ends with no verdicts and you re-run wrapup later.`;
const appended = (call) => call.argv.flatMap((a, i) => (a === '--append-system-prompt-file' ? [fs.readFileSync(call.argv[i + 1], 'utf8')] : [])).join('\n');

test('a check the owner puts off ends the verify without a verdict: parked to run the check again, no FAIL, no fix round; the later session is not told "Not now" and keeps the look', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const tip = git(p.clone, 'rev-parse', e5.branch);

  // The verifier asks for a check only a person can do; the owner is away.
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(signIn(e5.tors[0]), ['Yes — start it, I\'ll sign in', LATER])] } });
  await again(p, { queue: [e5.id] });
  assert.deepEqual([p.epic(e5.id).state, gate(p, e5.id, 2).kind], ['PARKED', 'unmatched']);
  assert.equal(decide(p, e5.id, LATER, { n: 2 }).enters, 'VERIFY');

  // The session that asked hears "Not now" and ends with no verdict: that is not a FAIL.
  p.scenario({ [`${e5.id}/verify`]: { actions: [], result: { result: NONE } } });
  const r = await again(p, { queue: [e5.id] });
  assert.ok(r.calls[0].prompt.includes(LATER), 'the session that asked is told the answer to its own question');
  assert.deepEqual(r.steps, [`${e5.id}/verify-1`], 'no repair session');
  const e = p.epic(e5.id);
  assert.deepEqual([e.state, e.fixRounds ?? 0], ['PARKED', 0], e.reason);
  assert.equal(e.reason, 'verify-1 ended without a verdict: nothing was recorded or committed');
  const g3 = gate(p, e5.id, 3);
  assert.deepEqual([g3.kind, g3.phase, g3.options, g3.decided, g3.branchTip], ['resume', 'VERIFY', [ANSWERS.resume, ANSWERS.startOver], null, tip]);
  assert.match(g3.why, /nothing is rebuilt/);

  // Resumed: a new verify session, told nothing about "Not now", handed the owner's look; it merges.
  assert.equal(decide(p, e5.id, ANSWERS.resume, { n: 3 }).enters, 'VERIFY');
  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const last = await again(p, { queue: [e5.id] });
  assert.deepEqual(last.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED', p.epic(e5.id).reason);
  const told = last.calls[0].prompt + appended(last.calls[0]);
  assert.ok(!told.includes(LATER), 'a postponement is not a decision to carry forward');
  assert.match(told, /six bars, labels readable/, 'the owner\'s look on this tip still stands');
  assert.deepEqual(readJson(p.dir(e5.id, 'verify-1', 'step.json')).answers ?? [], []);
  assert.ok(merged(p, tip));
});

test('an epic an earlier driver FAILED for a verify with no verdicts gets a resume gate at VERIFY, and finishes with the owner\'s look', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  p.scenario({ [`${e5.id}/verify`]: { actions: [], result: { result: NONE } } });
  await again(p, { queue: [e5.id] });
  const tip = git(p.clone, 'rev-parse', e5.branch);
  // As the earlier driver left it: FAILED after the fix round, and no gate to answer.
  fs.rmSync(path.join(p.state, 'gates', `${e5.id}-2.json`));
  const file = path.join(p.state, 'epics.json'); const recs = readJson(file);
  Object.assign(recs[e5.id], { state: 'FAILED', fixRounds: 1, reason: `verify-1 FAIL after the fix round: ${NONE}` });
  fs.writeFileSync(file, JSON.stringify(recs, null, 2));

  assert.deepEqual(ensureResumeGates(p.state), [`${e5.id}-2.json`]);
  const g = gate(p, e5.id, 2);
  assert.deepEqual([g.kind, g.phase, g.options, g.branchTip], ['resume', 'VERIFY', [ANSWERS.resume, ANSWERS.startOver], tip]);
  assert.match(g.question, /final check ended without a verdict/);
  assert.deepEqual(ensureResumeGates(p.state), [], 'written once');
  assert.equal(decide(p, e5.id, ANSWERS.resume, { n: 2 }).enters, 'VERIFY');

  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const last = await again(p, { queue: [e5.id] });
  assert.deepEqual(last.steps, [`${e5.id}/verify-1`], 'nothing is rebuilt');
  assert.equal(p.epic(e5.id).state, 'MERGED', p.epic(e5.id).reason);
  assert.match(appended(last.calls[0]), /six bars, labels readable/);
});
