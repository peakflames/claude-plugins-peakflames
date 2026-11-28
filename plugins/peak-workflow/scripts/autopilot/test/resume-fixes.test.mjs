// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
// This file: the standing answer for small fixes, a requirement that lacks its test, a failed merge check, requirements read together. Shared helpers: resume-helpers.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, continueRun, ensureResumeGates, ownerAnswers, status } from '../driver.mjs';
import { SMALL_FIX_PROBLEM } from '../lib.mjs';
import { E1, TL, buildActions, git, happy, makeProject, planScript, readJson, wrapupActions, wrapupScript } from './helpers.mjs';
import { gate, decide, again, ask, tools, audit, roundSpent, merged, settle, appended, setAutoContinue } from './resume-helpers.mjs';

// ---- the standing answer for small fixes the verifier recommends (UAT issue 37) -------------------

const PRE_OPTS = ['Accept as pre-existing', 'Fix on this branch', 'Stop — epic FAILs'];
const PRE_Q = 'Tests failed on test/ledger.test.js "totals add up", which this epic did not change, and they fail the same way on develop: 1 failing, expected 10 got 9. Recommendation: Accept as pre-existing — the ledger epic owns it. How to proceed?';
/** A final check that meets a test another epic owns, already failing on develop: asks the one question, then merges and lists it. */
const preExistingWrapup = (e) => {
  const a = wrapupActions(e);
  return { actions: [a[0], ask(PRE_Q, PRE_OPTS), ...a.slice(1)], result: { total_cost_usd: 1.3, result: 'Verdict: PASS\n\n## Seen but not fixed\n- test/ledger.test.js "totals add up" — fails the same way on develop: expected 10 got 9' } };
};

test('a test that already fails on develop at the final check: a full run parks with the three options; "Accept as pre-existing" goes back to the final check, which merges (#46 item 2)', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: preExistingWrapup(E1) });
  const s = await p.go();
  assert.equal(s.queue[0].state, 'PARKED');
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.options, g.decided, g.session], ['pre-existing', PRE_OPTS, null, 'verify-1']);
  assert.equal(decide(p, E1.id, 'Accept as pre-existing').enters, 'VERIFY');
  const r = await again(p);
  assert.deepEqual(r.steps, [`${E1.id}/verify-1`], 'nothing is planned or built again');
  assert.equal(r.state.queue[0].state, 'MERGED', r.state.queue[0].reason);
  assert.equal(gate(p, E1.id).decided.used.session, 'verify-1');
  assert.deepEqual(status(p.project, p.state).decidedForYou, [], 'the owner decided it');
});

const FIXQ = 'Console error on the home page: 404 for /favicon.ico. Recommendation: Fix now — a one-line link tag. How to proceed?';
const FIXOPTS = ['Fix now (Recommended)', 'Leave as is', 'Stop — epic FAILs'];
const smallFix = (files) => [{ do: 'checkout', name: E1.branch }, ...files.map((f) => ({ do: 'write', path: f, content: 'export const fixed = 1;\n' })), { do: 'commit', message: `fix(epic-${E1.id}): what the verifier found` }];

test('a small fix the verifier recommends is made on the standing answer: no stop, within the limits, and listed afterwards', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(FIXQ, FIXOPTS), ...smallFix(['src/favicon.js']), ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await p.go();
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  const [answer] = tools(p, E1.id, 'verify-1');
  assert.deepEqual(Object.values(answer.hookSpecificOutput.updatedInput.answers), ['Fix now (Recommended)']);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /the owner's standing answer for small fixes/);
  assert.deepEqual([e.fixedAtWrapup.count, e.fixedAtWrapup.files, e.fixedAtWrapup.approvedBy, e.fixedAtWrapup.standing.map((x) => x.question)], [1, ['src/favicon.js'], 'the standing answer for small fixes', [FIXQ]]);
  assert.ok(!fs.existsSync(path.join(p.state, 'gates', `${E1.id}-1.json`)), 'the owner is not asked');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Fixed during verification, on your standing answer for small fixes: src\/favicon\.js\. What the verifier asked: "Console error on the home page: 404 for \/favicon\.ico\./);
});

test('a fix bigger than the standing answer allows is not merged: rolled back, the work kept, and the owner is asked to allow it; allowed, the kept work merges with no new final check', async (t) => {
  const p = makeProject(t);
  const big = { actions: [ask(FIXQ, FIXOPTS), ...smallFix(['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js', 'src/e.js', 'src/f.js']), ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } };
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: big });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).reason], ['PARKED', 'merge gate failed (verdict); develop rolled back']);
  const verdict = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'verdict');
  assert.match(verdict.evidence.join(' | '), /the fix made on the standing answer changes 6 files \(the limit is 5\)/);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.approvesFix, g.technical, g.options], ['resume', 'CHECK_VERIFY', true, true, [ANSWERS.resume, ANSWERS.startOver]]);
  assert.match(g.question, /bigger than your standing answer for small fixes allows: 6 files \(your limit is 5\)\. The merge was undone and its work is kept\. Allow that change for this epic and check the merge again\?/);
  assert.equal(g.verifiedTip, git(p.clone, 'rev-parse', `refs/autopilot/verified/${E1.id}`), 'the final check\'s work is pinned');
  assert.equal(g.verifyStep, `${p.rel()}/epics/${E1.id}/verify-1`);
  assert.equal(merged(p, g.verifiedTip), false, 'nothing merged');

  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'CHECK_VERIFY');
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, [], 'no session: the kept work is merged and checked');
  assert.ok(!fs.existsSync(p.dir(E1.id, 'verify-1')), 'no new final check');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.equal(git(p.clone, 'rev-parse', 'develop^2'), g.verifiedTip);
  assert.deepEqual([e.fixedAtWrapup.files.length, e.fixedAtWrapup.approvedBy], [6, `gates/${E1.id}-1.json`]);
});

test('the small-fix limit is 80 changed lines: 80 merges on the standing answer, 81 is over it, in a full run and a provisional one (Step 6)', async (t) => {
  const fixOf = (n) => ({ actions: [ask(FIXQ, FIXOPTS), { do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/fix.js', content: Array.from({ length: n }, (_, i) => `export const line${i} = ${i};`).join('\n') + '\n' }, { do: 'commit', message: `fix(epic-${E1.id}): what the verifier found` }, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } });
  for (const [n, mode] of [[80, 'full'], [81, 'full'], [81, 'provisional']]) {
    const p = makeProject(t, { config: { mode } });
    p.scenario({ ...happy(E1), [`${E1.id}/verify`]: fixOf(n) });
    await p.go();
    const e = p.epic(E1.id);
    if (n === 80) {
      assert.equal(e.state, 'MERGED', e.reason);
      assert.deepEqual([e.fixedAtWrapup.files, e.fixedAtWrapup.approvedBy], [['src/fix.js'], 'the standing answer for small fixes']);
      continue;
    }
    assert.deepEqual([e.state, e.reason], ['PARKED', 'merge gate failed (verdict); develop rolled back'], mode);
    assert.match(readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'verdict').evidence.join(' | '), /the fix made on the standing answer changes 81 lines \(the limit is 80\)/, mode);
    const g = gate(p, E1.id);
    assert.deepEqual([g.kind, g.approvesFix, g.decided ?? null], ['resume', true, null], `${mode}: the owner is asked to allow it`);
    assert.match(g.question, /bigger than your standing answer for small fixes allows: 81 changed lines \(your limit is 80\)/, mode);
  }
});

/** As an earlier driver left a failed merge check: rolled back, parked, and no gate written. */
function asLegacy(p, id) {
  for (const f of fs.readdirSync(path.join(p.state, 'gates')).filter((f) => f.startsWith(`${id}-`))) fs.rmSync(path.join(p.state, 'gates', f));
  git(p.clone, 'update-ref', '-d', `refs/autopilot/verified/${id}`);
}

test('a fix an earlier autopilot held back under the old rule (any changed test line), parked with no gate: recovered from the undone merge, "check the merge again", and it merges', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [...smallFix(['src/wait.js']), ...wrapupActions(E1)], result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.equal(p.epic(E1.id).reason, 'merge gate failed (verdict); develop rolled back');
  // As the earlier driver left it: the verifier had asked the small fix (its standing answer recorded), the merge gate refused it
  // under the old rule, rolled back, and parked with nothing to answer. The undone merge is under refs/autopilot/rejected/.
  asLegacy(p, E1.id);
  fs.writeFileSync(p.dir(E1.id, 'verify-1', 'small-fixes.json'), JSON.stringify([{ question: FIXQ }]));
  const file = p.dir(E1.id, 'check-verify-1.json'); const check = readJson(file);
  check.checks.find((c) => c.name === 'verdict').evidence = ['the fix made on the standing answer changes 4 files (the limit is 3): tests/a.cs, tests/b.cs, tests/c.cs, tests/d.cs', 'the fix made on the standing answer removes lines from a test (tests/a.cs, tests/b.cs)'];
  fs.writeFileSync(file, JSON.stringify(check, null, 2));
  const rejected = p.epic(E1.id).rejected.at(-1);

  assert.deepEqual(ensureResumeGates(p.state), [`${E1.id}-1.json`]);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.technical, g.approvesFix ?? false, g.verifiedTip, g.verifyStep], ['resume', 'CHECK_VERIFY', true, false, git(p.clone, 'rev-parse', `${rejected}^2`), `${p.rel()}/epics/${E1.id}/verify-1`]);
  assert.match(g.question, /held back the small fix it made under a rule that has since been loosened\. The merge was undone and its work is kept\. Check the merge again\?/);
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'CHECK_VERIFY');
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, []);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.equal(e.fixedAtWrapup.approvedBy, 'the standing answer for small fixes');
});

test('a failed merge check an earlier driver parked with no gate and no usable undone merge: the gate runs the final check again', async (t) => {
  const p = redAfterMerge(t);
  await p.go();
  assert.match(p.epic(E1.id).reason, /^merge gate failed \(tests-green-on-integration\)/);
  asLegacy(p, E1.id);
  for (const ref of p.epic(E1.id).rejected) git(p.clone, 'update-ref', '-d', ref);
  fs.rmSync(path.join(p.clone, 'ledger.json'));
  assert.deepEqual(ensureResumeGates(p.state), [`${E1.id}-1.json`]);
  const g = gate(p, E1.id);
  assert.deepEqual([g.phase, g.technical, g.verifiedTip], ['VERIFY', true, undefined]);
  assert.match(g.question, /the tests failed once its work was merged\. It was not merged\. Run the final check again\?/);
});

// ---- a requirement that only lacks its test, and the final check's own repair (issue #41 B5) ------

const TORQ = `${E1.tors[0]} is FAIL: no test mirrors the Then; the code itself looks right. Recommendation: Fix now — one small test. How to proceed?`;
const TOROPTS = ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'];
const addTest = (files) => [{ do: 'checkout', name: E1.branch }, ...files.map((f) => ({ do: 'write', path: f, content: "import test from 'node:test';\ntest('the Then holds', () => {});\n" })), { do: 'commit', message: `test(epic-${E1.id}): the test the requirement lacked` }];
// One undisclosed deferral, fixed at the final check: its mark stays in the count (wrapup-epic Step 1.4b).
const UNDISCLOSED_FIXED = { counts: [1, 1, 0, 1, 0, 0] };

test('a requirement that only lacks its test: the final check adds the test on the standing answer and the epic merges', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(TORQ, TOROPTS), ...addTest(['test/then.test.js']), ...wrapupActions(E1, UNDISCLOSED_FIXED)], result: { result: 'Verdict: PASS' } } });
  await p.go();
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  const [answer] = tools(p, E1.id, 'verify-1');
  assert.deepEqual(Object.values(answer.hookSpecificOutput.updatedInput.answers), ['Fix now']);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, new RegExp(`For ${E1.tors[0]} the fix is the missing test alone, in a test file`));
  assert.deepEqual([e.fixedAtWrapup.files, e.fixedAtWrapup.standing], [['test/then.test.js'], [{ question: TORQ, tor: E1.tors[0], testOnly: true }]]);
  assert.ok(!fs.existsSync(path.join(p.state, 'gates', `${E1.id}-1.json`)), 'the owner is not asked');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), new RegExp(`A test was added for a requirement the build left untested: ${E1.tors[0]}\\.`));
});

test('"add the missing test" that also changes the product is not merged: the owner is asked to allow it, and then it merges', async (t) => {
  const p = makeProject(t);
  const script = { actions: [ask(TORQ, TOROPTS), ...addTest(['test/then.test.js', 'src/patch.js']), ...wrapupActions(E1, UNDISCLOSED_FIXED)], result: { result: 'Verdict: PASS' } };
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: script });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).reason], ['PARKED', 'merge gate failed (verdict); develop rolled back']);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.approvesFix], ['resume', 'CHECK_VERIFY', true]);
  assert.match(g.question, /it changed the product itself \(src\/patch\.js\), where your standing answer covers only adding a missing test\. The merge was undone and its work is kept\./);

  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'CHECK_VERIFY');
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, []);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
});

// ---- a failed merge check keeps the final check's work and always asks (issue #35) -----------------

/** A final check that passes, and a test command that fails while ledger.json (git-ignored) is in the clone. */
function redAfterMerge(t, mode = 'full') {
  const p = makeProject(t, { config: { testCommand: 'test ! -e ledger.json', mode } });
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [{ do: 'exec', cmd: 'touch ledger.json' }, ...wrapupActions(E1)], result: { result: 'Verdict: PASS' } } });
  return p;
}

test('tests red only once the final check\'s work is merged: a technical gate; the standing answer checks the merge again, with no new final check', async (t) => {
  const p = redAfterMerge(t);
  await p.go();
  const e1 = p.epic(E1.id);
  assert.deepEqual([e1.state, e1.reason], ['PARKED', 'merge gate failed (tests-green-on-integration); develop rolled back']);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.technical, g.approvesFix ?? false, g.artifacts], ['resume', 'CHECK_VERIFY', true, false, [`${p.rel()}/epics/${E1.id}/check-verify-1.json`]]);
  assert.match(g.question, /the final check passed, but the tests failed once its work was merged\. The merge was undone and its work is kept\. Check the merge again\?$/);
  assert.doesNotMatch(`${g.question} ${g.why}`, /\/peak-workflow|CHECK_VERIFY|\.json/, 'in the owner\'s words');
  assert.equal(e1.verifiedKept, `refs/autopilot/verified/${E1.id}`);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /the final check's work is kept in the clone at `refs\/autopilot\/verified\/Lg1Csv7`/);
  // Its verified lines, Complete status and handoff are in the kept commit, not on develop.
  assert.match(git(p.clone, 'show', `${g.verifiedTip}:docs/implementation-plan/status/epic-${E1.id}.md`), /status: Complete/);
  assert.equal(merged(p, g.verifiedTip), false);

  fs.rmSync(path.join(p.clone, 'ledger.json'));
  setAutoContinue(p, 2);
  const c = continueRun(p.state, { by: 'Pat Owner' });
  assert.deepEqual(c.continued.map((x) => [x.gate, x.enters, x.did]), [[`gates/${E1.id}-1.json`, 'CHECK_VERIFY', 'checked the final check\'s merge again']]);
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, [], 'no session');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.equal(git(p.clone, 'rev-parse', 'develop^2'), g.verifiedTip);
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', 'develop'), `Merge branch '${E1.branch}' into develop`);
});

test('a provisional run: tests red once the final check\'s work is merged keep that work and ask the same way; nothing is taken on the run\'s own say (Step 6)', async (t) => {
  const p = redAfterMerge(t, 'provisional');
  await p.go();
  assert.equal(readJson(path.join(p.runDir(), 'state.json')).mode, 'provisional');
  const e1 = p.epic(E1.id);
  assert.deepEqual([e1.state, e1.reason, e1.verifiedKept], ['PARKED', 'merge gate failed (tests-green-on-integration); develop rolled back', `refs/autopilot/verified/${E1.id}`]);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.technical, g.decided ?? null], ['resume', 'CHECK_VERIFY', true, null], 'a technical stop: the provisional run does not answer it');
  assert.match(g.question, /The merge was undone and its work is kept\. Check the merge again\?$/);
  assert.equal(merged(p, g.verifiedTip), false);
  fs.rmSync(path.join(p.clone, 'ledger.json'));
  decide(p, E1.id, ANSWERS.resume);
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, [], 'no session');
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  assert.equal(git(p.clone, 'rev-parse', 'develop^2'), g.verifiedTip);
});

test('the integration line moved before the re-check: the kept work merges onto the new tip', async (t) => {
  const p = redAfterMerge(t);
  await p.go();
  assert.equal(gate(p, E1.id).phase, 'CHECK_VERIFY');
  fs.rmSync(path.join(p.clone, 'ledger.json'));
  // The owner commits to develop meanwhile: the next run brings the clone up to it.
  fs.writeFileSync(path.join(p.project, 'src', 'other.js'), 'export const other = 1;\n');
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'feat: other work');
  const moved = git(p.project, 'rev-parse', 'develop');
  decide(p, E1.id, ANSWERS.resume);
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, []);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  assert.deepEqual(git(p.clone, 'rev-list', '--parents', '-n', '1', 'develop').split(' ').slice(1), [moved, gate(p, E1.id).verifiedTip]);
});

test('the kept work no longer merges at the re-check: the epic parks with a gate to run the final check again, nothing merged', async (t) => {
  const p = redAfterMerge(t);
  await p.go();
  fs.rmSync(path.join(p.clone, 'ledger.json'));
  // A commit on develop that conflicts with the kept work's architecture.md, but not with the branch as built.
  fs.writeFileSync(path.join(p.project, 'docs', 'architecture.md'), '# Architecture\n\nSomeone else.\n');
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'docs: architecture by hand');
  const before = git(p.project, 'rev-parse', 'develop');
  decide(p, E1.id, ANSWERS.resume);
  p.scenario({});
  const r = await again(p);
  assert.deepEqual(r.steps, []);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /^the final check's kept work could not be merged again: it conflicts with develop as it now is$/);
  assert.equal(git(p.clone, 'rev-parse', 'develop'), before, 'nothing merged');
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'no merge left half done');
  const g2 = gate(p, E1.id, 2);
  assert.deepEqual([g2.kind, g2.phase, g2.technical], ['resume', 'VERIFY', true]);
  assert.match(g2.question, /its work could not be merged again \(it conflicts with develop as it now is\)\. Run the final check again\?/);
});

test('a status file missing a verified line: a technical gate that runs the final check again, answered by the standing answer', async (t) => {
  const p = makeProject(t);
  const unmarked = wrapupActions(E1).map((a) => (a.do === 'exec' && a.cmd.includes('--pass') ? { ...a, cmd: `${TL} mark ${E1.id} --pass ${E1.tors.slice(1).join(' ')}` } : a));
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: unmarked, result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.match(p.epic(E1.id).reason, /^merge gate failed \(sidecar-on-integration[,)]/);
  const g = gate(p, E1.id);
  assert.deepEqual([g.phase, g.technical, g.verifiedTip ?? null], ['VERIFY', true, null]);
  assert.match(g.question, /the epic's status file does not record every requirement as verified\. It was not merged\. Run the final check again\?/);
  setAutoContinue(p, 1);
  assert.deepEqual(continueRun(p.state, { by: 'Pat Owner' }).continued.map((x) => [x.enters, x.did]), [['VERIFY', 'ran the final check again']]);
  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);
  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
});

test('a missing test and an ordinary small fix in one final check: product code changed is the owner\'s to allow, the referee\'s record is not counted', async (t) => {
  const p = makeProject(t);
  fs.writeFileSync(path.join(p.project, 'test', 'old.test.js'), "import test from 'node:test';\ntest('passes', () => {});\n");
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'test: an existing test');
  // The missing test goes into an existing test file, with the reason the referee asks for: tests only, so it merges.
  const intoExisting = [{ do: 'checkout', name: E1.branch }, { do: 'write', path: '.autopilot/test-changes.jsonl', content: '{"path":"test/old.test.js","reason":"the Then had no test"}\n' },
    { do: 'exec', cmd: "printf \"test('the Then holds', () => {});\\n\" >> test/old.test.js" }, { do: 'commit', message: 'test(epic-' + E1.id + '): the test the requirement lacked' }];
  p.scenario({ ...happy(E1), [E1.id + '/verify']: { actions: [ask(TORQ, TOROPTS), ...intoExisting, ...wrapupActions(E1, UNDISCLOSED_FIXED)], result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);

  const p2 = makeProject(t);
  p2.scenario({ ...happy(E1), [E1.id + '/verify']: { actions: [ask(FIXQ, FIXOPTS), ask(TORQ, TOROPTS), ...addTest(['test/then.test.js', 'src/favicon.js']), ...wrapupActions(E1, { counts: [2, 1, 0, 2, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await p2.go();
  assert.equal(p2.epic(E1.id).state, 'PARKED');
  assert.match(gate(p2, E1.id).question, /it changed the product itself \(src\/favicon\.js\)/);
});

test('without a fix on the standing answer, an undisclosed deferral still fails the merge gate', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: wrapupActions(E1, { counts: [1, 1, 0, 0, 0, 0] }), result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.deepEqual(readJson(p.dir(E1.id, 'check-verify-1.json')).checks.filter((c) => !c.pass).map((c) => c.name), ['no-waivers']);
});

test('the final check keeps its own fix round when the build\'s checks spent theirs', async (t) => {
  const p = makeProject(t);
  p.scenario({
    ...roundSpent(E1), [`${E1.id}/verify-1`]: { actions: [], result: { result: `Verdict: FAIL\n${E1.tors[2]}: the description is trimmed` } },
    [`${E1.id}/fix-2`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = true;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): keep the description verbatim` }] },
    [`${E1.id}/verify`]: wrapupScript(E1),
  });
  await p.go();
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual([e.fixRounds, e.verifyFixRounds], [1, 1]);
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'fix-1', 'audit-1', 'verify-1', 'fix-2', 'audit-2', 'verify-2'].map((s) => `${E1.id}/${s}`));
});

test('a final check that fails again after its fix round asks the owner, keeps the branch, and repairs once more on their answer', async (t) => {
  const p = makeProject(t);
  const still = `Verdict: FAIL\n${E1.tors[2]}: the description is still trimmed`;
  p.scenario({
    ...happy(E1), [`${E1.id}/plan-fix`]: planScript(E1),
    [`${E1.id}/verify-1`]: { actions: [], result: { result: `Verdict: FAIL\n${E1.tors[2]}: the description is trimmed` } },
    [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = 1;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): first try` }] },
    [`${E1.id}/verify-2`]: { actions: [], result: { result: still } },
  });
  await p.go();
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.reason], ['PARKED', 'verify-2 FAIL after the fix round: Verdict: FAIL']);
  const tip = git(p.clone, 'rev-parse', E1.branch);
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.phase, g.options, g.branchTip], ['resume', 'FIX_BUILD', [ANSWERS.resume, ANSWERS.startOver], tip]);
  assert.match(g.question, /the final check still finds a requirement not met, after one repair \("Verdict: FAIL"\)\. Repair it once more\?/);

  // An epic an earlier driver left FAILED there, with nothing to answer, gets the same question.
  fs.rmSync(path.join(p.state, 'gates', `${E1.id}-1.json`));
  const file = path.join(p.state, 'epics.json'); const recs = readJson(file);
  recs[E1.id].state = 'FAILED';
  fs.writeFileSync(file, JSON.stringify(recs, null, 2));
  assert.deepEqual(ensureResumeGates(p.state), [`${E1.id}-1.json`]);
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).phase, gate(p, E1.id).question], [g.kind, g.phase, g.question]);

  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'FIX_BUILD');
  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/fix.js', content: 'export const fixed = 2;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): second try` }] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);
  assert.deepEqual(r.steps, ['fix-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'nothing is planned or built again');
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  assert.match(fs.readFileSync(p.dir(E1.id, 'fix-1', 'prompt.md'), 'utf8'), /the description is still trimmed/);
  assert.ok(merged(p, tip), 'on the branch the first run left');
});

test('the standing answer never covers a requirement file or a weakened test, and stops after its count', async (t) => {
  const p = makeProject(t);
  const weaken = [{ do: 'checkout', name: E1.branch }, { do: 'exec', cmd: `f=$(grep -l assert test/*.test.js | head -1); sed -i.bak '/assert\\./d' "$f"; rm -f "$f.bak"; git add -A test` }, { do: 'write', path: 'docs/requirements/note.md', content: 'changed\n' }, { do: 'commit', message: `fix(epic-${E1.id}): quieter` }];
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(FIXQ, FIXOPTS), ...weaken, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const evidence = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'verdict').evidence.join(' | ');
  assert.match(evidence, /removes checks from a test \(test\/[^)]*\)/);
  assert.match(evidence, /changes a requirement file \(docs\/requirements\/note\.md\)/);
  // Never offered for approval: the final check runs again, and the re-run still may not merge a requirement change.
  const g = gate(p, E1.id);
  assert.deepEqual([g.phase, g.technical, g.approvesFix ?? false, g.verifiedTip ?? null], ['VERIFY', true, false, null]);
  assert.match(g.question, /it changed a requirement file, which the final check may not do; and a fix it made makes a test check less\. It was not merged\. Run the final check again\?/);
  assert.equal(decide(p, E1.id, ANSWERS.resume).enters, 'VERIFY');
  const r = await again(p);
  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.equal(gate(p, E1.id, 2).phase, 'VERIFY');

  // Two per final check: the third recommended fix is the owner's to decide.
  const p2 = makeProject(t);
  const third = FIXQ.replace('favicon.ico', 'robots.txt');
  p2.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(FIXQ, FIXOPTS), ask(FIXQ.replace('favicon.ico', 'logo.png'), FIXOPTS), ask(third, FIXOPTS)] } });
  await p2.go();
  assert.deepEqual([p2.epic(E1.id).state, gate(p2, E1.id).question], ['PARKED', third]);
});

// A fix on the standing answer that weakens a test in a way the line count does not show (Step 4 box 1).
const testFile = `test/${E1.slug}.test.js`;
const testLines = (body = '') => E1.tors.map((t) => `test('${t} is met', ${body ? 'async ' : ''}() => {${body}});`).join('\n');
const withFixture = { actions: [...buildActions(E1, { commit: false }), { do: 'write', path: 'test/fixtures/rows.json', content: '[1, 2]\n' }, { do: 'commit', message: `feat(epic-${E1.id}): implement ${E1.slug}` }], result: { total_cost_usd: 0.3 } };
const onStanding = (fix) => ({ actions: [ask(FIXQ, FIXOPTS), { do: 'checkout', name: E1.branch }, ...fix, { do: 'commit', message: `fix(epic-${E1.id}): what the verifier found` }, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } });
const evidenceOf = (p) => [].concat(readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'verdict').evidence).join(' | ');

for (const [what, fix, problem] of [
  ['wraps the checks in `if (false)`', [{ do: 'write', path: testFile, content: `import test from 'node:test';\nif (false) {\n${testLines()}\n}\n` }], `puts a check where it never runs (${testFile})`],
  ['moves the test out of the test directories', [{ do: 'exec', cmd: `git mv ${testFile} src/${E1.slug}-cases.js` }], `deletes a test (${testFile})`],
  ['rewrites a fixture the test compares with', [{ do: 'write', path: 'test/fixtures/rows.json', content: '[1, 2, 3]\n' }], 'rewrites an expected result a test compares with (test/fixtures/rows.json)'],
]) {
  test(`the standing answer does not merge a fix that ${what}`, async (t) => {
    const p = makeProject(t);
    p.scenario({ ...happy(E1), [`${E1.id}/build`]: withFixture, [`${E1.id}/verify`]: onStanding(fix) });
    await p.go();
    assert.equal(p.epic(E1.id).state, 'PARKED');
    assert.ok(evidenceOf(p).includes(`${SMALL_FIX_PROBLEM}${problem}`), evidenceOf(p));
    assert.match(gate(p, E1.id).question, /a fix it made makes a test check less/);
  });
}

test('the standing answer still merges a fix that only waits before a click, with a new fixture beside it', async (t) => {
  const p = makeProject(t);
  const fix = [{ do: 'write', path: testFile, content: `import test from 'node:test';\nconst settle = () => new Promise((r) => setImmediate(r));\n${testLines(' await settle(); ')}\n` }, { do: 'write', path: 'test/fixtures/more.json', content: '[3]\n' }];
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: withFixture, [`${E1.id}/verify`]: onStanding(fix) });
  await p.go();
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual(e.fixedAtWrapup.files.sort(), [testFile, 'test/fixtures/more.json'].sort());
});

// ---- requirements are read against each other at planning time -----------------------------------

test('the planning session is told to check the requirements first; a plan without the "checked" line fails plan lint', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['checked'] }) });
  await p.go();
  const call = p.calls()[0];
  assert.match(appended(call), /# Autopilot planning rule: check the requirements first[\s\S]*Do any two contradict each other\?[\s\S]*Requirements checked for contradictions: none found/);
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind], ['PARKED', 'plan-lint']);
  assert.match(gate(p, E1.id).why, /missing "Requirements checked for contradictions"/);
});

test('a contradiction the planner finds is asked before any plan or build: an amendment question, answered, and the plan session picks up', async (t) => {
  const p = makeProject(t);
  const tor = E1.tors[0];
  const q = `${tor} — The tool shall import every row looks wrong: its Then contradicts ${E1.tors[1] ?? 'the header rule'}. Proposed: same title / Then: "rows after the header are imported". How to proceed?`;
  const AMEND = [`Amend ${tor} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];
  p.scenario({ [`${E1.id}/plan`]: { actions: [ask(q, AMEND)] } });
  await p.go();
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`], 'asked at planning: nothing was built');
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind, gate(p, E1.id).tor, gate(p, E1.id).session], ['PARKED', 'amendment', tor, 'plan-1']);
  assert.equal(decide(p, E1.id, AMEND[0]).enters, 'PLAN');
});

test('an approved amendment outlives a start from scratch: the new plan session is told it and the owner is not asked again (issue #41 B9)', async (t) => {
  const p = makeProject(t);
  const tor = E1.tors[0];
  const q = tor + ' — The tool shall import every row looks wrong: its Then contradicts the header rule. Proposed: same title / Then: "rows after the header are imported". How to proceed?';
  const AMEND = ['Amend ' + tor + ' (owner approval)', 'Implement as written', "Stop — I'll take it from here"];
  const asking = { actions: [ask(q, AMEND), ...planScript(E1).actions] };
  const cut = { actions: buildActions(E1, { commit: false }), result: { subtype: 'error_max_turns', is_error: true } };
  p.scenario({ [E1.id + '/plan']: { actions: [ask(q, AMEND)] } });
  await p.go();
  decide(p, E1.id, AMEND[0]);
  // Approved; the plan is made, and the build is then cut short. The owner starts the epic over.
  p.scenario({ [E1.id + '/plan']: asking, [E1.id + '/build']: cut });
  await again(p);
  assert.equal(gate(p, E1.id, 2).kind, 'resume');
  decide(p, E1.id, ANSWERS.startOver, { n: 2 });

  p.scenario({ [E1.id + '/plan']: asking, [E1.id + '/build']: cut });
  const r = await again(p);
  assert.deepEqual(r.steps, [E1.id + '/plan-1', E1.id + '/build-1'], 'planned again from scratch');
  assert.ok(!r.calls[0].argv.includes('--resume'), 'a new plan session');
  // The same question, asked again by the new planner, is answered from the owner's earlier approval.
  assert.deepEqual(Object.values(tools(p, E1.id, 'plan-1')[0].hookSpecificOutput.updatedInput.answers), [AMEND[0]]);
  assert.match(fs.readFileSync(p.dir(E1.id, 'plan-1', 'owner-answers.md'), 'utf8'), new RegExp('Amend ' + tor));
  assert.match(fs.readFileSync(p.dir(E1.id, 'build-1', 'owner-answers.md'), 'utf8'), new RegExp('Amend ' + tor));
  const gates = fs.readdirSync(path.join(p.state, 'gates')).map((f) => readJson(path.join(p.state, 'gates', f)));
  assert.deepEqual(gates.map((g) => g.kind), ['amendment', 'resume', 'resume'], 'no second amendment question');
  assert.ok(!gates[0].superseded && !gates[0].void, 'the amendment stands');
  assert.deepEqual(ownerAnswers(p.state, E1.id).map((a) => [a.gateKind, a.answer]), [['amendment', AMEND[0]]]);
});
