// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
// This file: autopilot's own bookkeeping, the owner's answer reaching the next session, a put-off check, the look. Shared helpers: resume-helpers.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, ensureResumeGates, ownerAnswers, preflight } from '../driver.mjs';
import { E1, buildActions, buildScript, git, happy, makeProject, planScript, readJson, wrapupActions, wrapupScript } from './helpers.mjs';
import { cli, gate, decide, again, ask, tools, audit, merged, addLookEpic, buildWithManual, appended, addScreenEpic } from './resume-helpers.mjs';

// ---- a finished build must not die on autopilot's own bookkeeping ---------------------------------

/** A build that changes an existing test, records why as the referee asks, and commits its work file by file — leaving the record uncommitted. */
const buildLeavingRecord = (e) => ({ actions: [
  ...buildActions(e, { commit: false }),
  { do: 'write', path: '.autopilot/test-changes.jsonl', content: '{"path":"test/ledger.test.js","reason":"the epic changes what it prints"}\n' },
  { do: 'write', path: 'test/ledger.test.js', content: "import test from 'node:test';\ntest('still passes', () => {});\n" },
  { do: 'write', path: 'test/package.json', content: '{"type":"module","devDependencies":{"x":"1"}}\n' },
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

test('tests beside the code: a build that changes production files in a listed directory keeps its repair round (issue #41 B2)', async (t) => {
  const p = makeProject(t);
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('**Test directories:** test/', '**Test directories:** test/, src/'));
  fs.writeFileSync(path.join(p.project, 'src', 'index.test.js'), "import test from 'node:test';\ntest('passes', () => {});\n");
  fs.writeFileSync(path.join(p.project, 'src', 'format.js'), 'export const format = (n) => String(n);\n');
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'test: tests beside the code');
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: [
    ...buildActions(E1, { commit: false }),
    { do: 'write', path: 'src/format.js', content: 'export const format = (n) => n.toFixed(2);\n' },
    { do: 'exec', cmd: `git add src test docs && git commit -q -m "feat(epic-${E1.id}): implement ${E1.slug}"` },
  ] } });
  await p.go();
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.equal(e.fixRounds, 0, 'no repair round was spent');
  assert.deepEqual(readJson(p.dir(E1.id, 'check-build-1.json')).checks.find((c) => c.name === 'test-integrity').evidence.existingTestsChanged, []);
});

test('the build check takes an empty reason for no reason, as the referee does', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: [
    ...buildActions(E1, { commit: false }),
    { do: 'exec', cmd: 'echo "// changed" >> test/smoke.test.js', unchecked: 'the referee refuses a test edit with no reason; this tests the build check behind it' },
    { do: 'write', path: '.autopilot/test-changes.jsonl', content: '{"path":"test/smoke.test.js","reason":" "}\n' },
    { do: 'exec', cmd: `git add -A && git commit -q -m "feat(epic-${E1.id}): implement ${E1.slug}"` },
  ] } });
  await p.go();
  const check = readJson(p.dir(E1.id, 'check-build-1.json'));
  assert.deepEqual(check.checks.find((c) => c.name === 'test-integrity'), { name: 'test-integrity', pass: false, evidence: { existingTestsChanged: [{ path: 'test/smoke.test.js', reason: null }] } });
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
  assert.ok(appended(fresh).includes(fs.readFileSync(told, 'utf8').trimEnd()), 'the new session is told through its system prompt, in the one file `claude` reads');
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

test('a check the owner puts off ends the verify without a verdict: parked to run the check again, no FAIL, no fix round; the later session is not told "Not now" and keeps the look', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const tip = git(p.clone, 'rev-parse', e5.branch);

  // The verifier asks for a check only a person can do (twice: the first is met with the owner's record); the owner is away.
  const live = ask(signIn(e5.tors[0]), ['Yes — start it, I\'ll sign in', LATER]);
  p.scenario({ [`${e5.id}/verify`]: { actions: [live, live] } });
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

// ---- the look: seen for real, and kept across a repair that changes no screen (UAT issues 34, 35) --

test('the look says what must be seen for real: a yes from pictures is refused for an operator-observed line; a live yes is told to the verifier as such', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { Lg5Chr8: "echo '<svg/>' > chart.html" } } });
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  const g = gate(p, e5.id);
  assert.deepEqual(g.live, [{ tor: e5.tors[0], checklist: `tests/manual/${e5.tors[0]}.md` }], 'the operator-observed requirement and the checklist that says how to see it for real');

  const dec = (obs) => cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-1.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner', '--observations', JSON.stringify(obs));
  const all = (how) => g.checks.map((c) => ({ n: c.n, answer: 'yes', how }));
  assert.match(dec(all('pictures')).stderr, /seen only in pictures.*is not the owner's observation.*check it for real, or decide later/s);
  assert.match(dec(all('a guess')).stderr, /how .* was seen is "live" or "pictures"/);
  assert.equal(gate(p, e5.id).decided, null);
  const ok = dec(all('live'));
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(gate(p, e5.id).decided.observations.every((o) => o.how === 'live'));

  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const r = await again(p, { queue: [e5.id] });
  assert.equal(p.epic(e5.id).state, 'MERGED');
  assert.match(appended(r.calls[0]), /yes, I saw this \(for real, on the running build: not in a picture\)/);
});

const repair = (ui, file) => ({ actions: [{ do: 'checkout', name: ui.branch }, { do: 'write', path: file, content: '/* repaired */\n' }, { do: 'commit', message: `fix(epic-${ui.id}): repair ${file}` }] });

test('a repair that changes no screen file keeps the owner\'s look: no second look, and the verifier is told what changed since', async (t) => {
  const p = makeProject(t);
  const { ui, build } = addScreenEpic(p);
  p.scenario({ [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: build });
  await p.go({ queue: [ui.id] });
  assert.equal(p.epic(ui.id).reason, 'human check needed before verify');
  const looked = git(p.clone, 'rev-parse', ui.branch);
  decide(p, ui.id, ANSWERS.looksRight, { note: 'the home page shows three figures' });

  p.scenario({ [`${ui.id}/verify-1`]: { actions: [], result: { result: '## Verdict: FAIL\nthe total is rounded wrong' } }, [`${ui.id}/fix`]: repair(ui, 'src/rounding.js'), [`${ui.id}/verify-2`]: wrapupScript(ui) });
  const r = await again(p, { queue: [ui.id] });
  assert.deepEqual(r.steps, ['verify-1', 'fix-1', 'audit-1', 'verify-2'].map((s) => `${ui.id}/${s}`), 'no park for a second look');
  assert.equal(p.epic(ui.id).state, 'MERGED', p.epic(ui.id).reason);
  const told = appended(r.calls.at(-1));
  assert.match(told, /the home page shows three figures/);
  assert.ok(told.includes(`branch tip ${looked}`) && /Since then a repair changed only src\/rounding\.js, no file a screen is built from/.test(told), told);
  assert.deepEqual(fs.readdirSync(path.join(p.state, 'gates')), [`${ui.id}-1.json`]);
});

test('a repair that changes a screen file still parks for a new look', async (t) => {
  const p = makeProject(t);
  const { ui, build } = addScreenEpic(p);
  p.scenario({ [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: build });
  await p.go({ queue: [ui.id] });
  decide(p, ui.id, ANSWERS.looksRight, { note: 'the home page shows three figures' });
  p.scenario({ [`${ui.id}/verify-1`]: { actions: [], result: { result: '## Verdict: FAIL\nthe heading overlaps' } }, [`${ui.id}/fix`]: repair(ui, 'src/home.css') });
  const r = await again(p, { queue: [ui.id] });
  assert.deepEqual(r.steps, ['verify-1', 'fix-1', 'audit-1'].map((s) => `${ui.id}/${s}`));
  assert.deepEqual([p.epic(ui.id).state, p.epic(ui.id).reason, gate(p, ui.id, 2).kind], ['PARKED', 'human check needed before verify', 'human-check']);
});

test('a verifier that asks the owner to redo a check they already recorded is refused once and pointed at the record; asking again still reaches the owner', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  const obs = gate(p, e5.id).checks.map((c) => ({ n: c.n, answer: 'yes', how: 'live' }));
  assert.equal(cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-1.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner', '--observations', JSON.stringify(obs), '--note', 'real sign-in done, it works').status, 0);

  // Seen live: handed the owner's recorded sign-in, the verifier asked them to sign in again.
  const q = signIn(e5.tors[0]);
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(q, ['Yes — start it, I\'ll sign in', 'Not now']), ...wrapupActions(e5)], result: { result: 'Verdict: PASS' } } });
  const r = await again(p, { queue: [e5.id] });
  assert.equal(p.epic(e5.id).state, 'MERGED', p.epic(e5.id).reason);
  const [refused] = tools(p, e5.id, 'verify-1');
  assert.equal(refused.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(refused.hookSpecificOutput.permissionDecisionReason, new RegExp(`not put to the owner: Pat Owner already did this check for ${e5.tors[0]} .* real sign-in done, it works.*Do not ask them to do it again`, 's'));
  assert.equal(refused.continue, undefined, 'a reminder, not a stop');
  assert.deepEqual(fs.readdirSync(path.join(p.state, 'gates')), [`${e5.id}-1.json`]);
  assert.deepEqual(r.steps, [`${e5.id}/verify-1`]);
});

test('a verifier that asks for the recorded check a second time is asking something else: it goes to the owner', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const q = signIn(e5.tors[0]);
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(q, ['Yes', 'Not now']), ask(q, ['Yes', 'Not now'])] } });
  await again(p, { queue: [e5.id] });
  assert.deepEqual([p.epic(e5.id).state, gate(p, e5.id, 2).kind, gate(p, e5.id, 2).question], ['PARKED', 'unmatched', q]);
  assert.deepEqual(ensureResumeGates(p.state), [], 'a question that got past the refusal is the owner\'s to answer');
});

test('a redo question an earlier driver let through is replaced by "run the final check again"; the owner does not do the check twice', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'real sign-in done, it works' });
  const q = signIn(e5.tors[0]);
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(q, ['Yes', 'Not now']), ask(q, ['Yes', 'Not now'])] } });
  await again(p, { queue: [e5.id] });
  fs.rmSync(p.dir(e5.id, 'verify-1', 'look-reminded.json')); // as the earlier driver left it: asked once, never refused

  assert.deepEqual(ensureResumeGates(p.state), [`${e5.id}-3.json`]);
  const g3 = gate(p, e5.id, 3);
  assert.deepEqual([g3.kind, g3.phase, g3.options, gate(p, e5.id, 2).superseded.by], ['resume', 'VERIFY', [ANSWERS.resume, ANSWERS.startOver], `gates/${e5.id}-3.json`]);
  assert.match(g3.question, /a check for TOR-\S+ again that you had already done and recorded/);
  assert.deepEqual(ensureResumeGates(p.state), [], 'written once');
  assert.equal(decide(p, e5.id, ANSWERS.resume, { n: 3 }).enters, 'VERIFY');

  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(q, ['Yes', 'Not now']), ...wrapupActions(e5)], result: { result: 'Verdict: PASS' } } });
  const last = await again(p, { queue: [e5.id] });
  assert.equal(p.epic(e5.id).state, 'MERGED', p.epic(e5.id).reason);
  assert.match(tools(p, e5.id, 'verify-1')[0].hookSpecificOutput.permissionDecisionReason, /Do not ask them to do it again/);
  assert.match(appended(last.calls[0]), /real sign-in done, it works/);
});
