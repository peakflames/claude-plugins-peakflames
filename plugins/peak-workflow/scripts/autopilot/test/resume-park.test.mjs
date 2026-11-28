// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
// This file: resume after a stop, void decisions and waiting gates, never started over unasked, onPark, the P3.5 exit. Shared helpers: resume-helpers.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, continueRun, ensureResumeGates, gateFacts, preflight, status } from '../driver.mjs';
import { LEAVE_IT, PROVISIONAL_BY, TRY_AGAIN, prototypeReasked } from '../lib.mjs';
import { plainReason } from '../attend.mjs';
import { E1, addEpic, buildActions, buildScript, git, happy, makeProject, planScript, readJson, waitFor, wrapupActions, wrapupScript } from './helpers.mjs';
import { cli, gate, decide, again, ask, tools, finding, audit, roundSpent, merged, settle, DEFERRAL, addLookEpic, buildWithManual, setAutoContinue } from './resume-helpers.mjs';

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
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'exec', cmd: 'touch "{{state}}/STOP"', unchecked: 'the owner makes the STOP file, not the session' }, { do: 'tool', tool_name: 'Bash', tool_input: { command: 'ls' } }] } });
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
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'exec', cmd: 'touch "{{state}}/STOP"', unchecked: 'the owner makes the STOP file, not the session' }, { do: 'tool', tool_name: 'Bash', tool_input: { command: 'ls' } }] } });
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

test('moved: the branch tip moved after the gate was written — not planned again: a technical question, and "Resume" checks the branch as it now is', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]) });
  await p.go();
  decide(p, E1.id, ANSWERS.auditNotReal);
  git(p.clone, 'checkout', '-q', E1.branch);
  git(p.clone, 'commit', '-q', '--allow-empty', '-m', `docs(epic-${E1.id}): a note added by hand`);
  git(p.clone, 'checkout', '-q', 'develop');
  const moved = git(p.clone, 'rev-parse', E1.branch);

  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.match(pre.launch.warn.join('\n'), /1 decision\(s\) can no longer be used as given \(Lg1Csv7: the branch feature\/epic-Lg1Csv7-csv-import moved since the gate was written[^)]*\)\); autopilot asks how to go on with those epics/);
  assert.doesNotMatch(pre.launch.warn.join('\n'), /from scratch/);

  // No status in between: the run itself finds the decision void, writes the question and parks with no session.
  p.scenario(happy(E1));
  const r = await again(p);
  assert.deepEqual(r.steps, [], 'nothing is planned again unasked');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.deepEqual([e.voided.gate, e.voided.asked, e.superseded ?? []], [`gates/${E1.id}-1.json`, `gates/${E1.id}-2.json`, []]);
  assert.equal(git(p.clone, 'rev-parse', E1.branch), moved, 'the branch is left as it is');
  const old = gate(p, E1.id);
  assert.deepEqual([old.void.run, old.void.by, old.decided.used], [p.runName(), `gates/${E1.id}-2.json`, undefined]);
  const g = gate(p, E1.id, 2);
  assert.deepEqual([g.kind, g.phase, g.technical, g.branchTip, g.decided, g.options], ['resume', 'CHECK_BUILD', true, moved, null, [ANSWERS.resume, ANSWERS.startOver]]);
  assert.match(g.question, /its branch was changed after you answered "Not real — verify as built" \(new commits on it\)\. Check it again from where its branch is now\?$/);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /1 decision could not be used as given \(Lg1Csv7\)/);
  assert.match(md, /Your decision "Not real — verify as built" on `gates\/Lg1Csv7-1\.json` could not be used — the branch .* moved since the gate was written .*\. You are asked how to go on: `gates\/Lg1Csv7-2\.json`\./);
  assert.doesNotMatch(md, /planned again from scratch/);
  assert.equal(cli('decide', '--workspace', p.state, '--gate', `${E1.id}-1.json`, '--answer', ANSWERS.auditReal, '--by', 'Pat').status, 2, 'a void gate cannot be decided again');

  setAutoContinue(p, 1);
  assert.deepEqual(continueRun(p.state, { by: 'Pat Owner' }).continued.map((x) => [x.enters, x.did]), [['CHECK_BUILD', 'checked it again from where its branch is now']]);
  const r2 = await again(p);
  assert.deepEqual(r2.steps, ['audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'checks, review and final check on the branch as it is; no plan, no build');
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  assert.ok(merged(p, moved));
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

test('a build continued on a branch that is behind develop is brought up to date first, so it builds on the other epics\' work (Pilot Light JlkOIsy, 2026-11-23)', async (t) => {
  // Seen live: resumed 13 commits behind and merging cleanly, the build changed the same files the other epics had,
  // and only the catch-up before verify found the overlap, after $5 of build and review.
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: buildActions(E1, { commit: false }), result: { subtype: 'error_max_turns', is_error: true } }, ...happy(d) });
  const s1 = await p.go();
  assert.deepEqual(s1.queue.map((q) => q.state), ['PARKED', 'MERGED']);
  const parkedTip = git(p.clone, 'rev-parse', E1.branch);
  decide(p, E1.id, ANSWERS.resume);

  p.scenario({ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.equal(r.steps[0], `${E1.id}/build-1`, 'the cut-off build is continued');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  const log = fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8');
  assert.match(log, /brought up to date with develop before the build/);
  const merge = git(p.clone, 'log', '--format=%H %s', 'develop').split('\n').find((l) => /\(autopilot: catch up before the build\)$/.test(l))?.split(' ')[0];
  assert.ok(merge, 'the catch-up merge landed with the epic');
  assert.deepEqual(git(p.clone, 'rev-list', '--parents', '-n', '1', merge).split(' ').slice(1)[0], parkedTip);
  assert.ok(log.indexOf('before the build') < log.indexOf(`${E1.id}: build-1 starting`), 'before the session starts');
  assert.doesNotMatch(log, /before verify/, 'nothing is left to catch up before verify');
});

test('a branch that stops merging cleanly during the run is parked before its build, not after it: no session is spent', async (t) => {
  // The run-start check found it clean; an epic that merged earlier in the same run then changed the same file.
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  const notes = (who) => ({ do: 'write', path: 'docs/notes.md', content: `notes by ${who}\n` });
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: [...buildActions(E1, { commit: false }), notes('csv')], result: { subtype: 'error_max_turns', is_error: true } } });
  await p.go({ queue: [E1.id] });
  assert.equal(p.epic(E1.id).state, 'PARKED');
  decide(p, E1.id, ANSWERS.resume);

  p.scenario({ ...happy(d), [`${d.id}/build`]: { actions: [...buildActions(d, { commit: false }), notes('config'), { do: 'commit', message: `feat(epic-${d.id}): config` }] }, [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p, { queue: [d.id, E1.id] });
  if (p.epic(d.id).state !== 'MERGED') return t.skip(`setup: ${d.id} did not merge (${p.epic(d.id).reason})`);
  assert.deepEqual(r.steps.filter((x) => x.startsWith(E1.id)), [], 'no session is spent on a branch that cannot land');
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.match(p.epic(E1.id).reason, /does not merge cleanly with develop \(docs\/notes\.md\)/);
  // The conflict gate, not the old non-technical one: the standing answer may take it, and "Resume" brings the branch up to date.
  const g = gate(p, E1.id, 2);
  assert.deepEqual([g.kind, g.phase, g.technical, g.mergeIn, g.conflicts, g.options], ['resume', 'BUILD', true, true, ['docs/notes.md'], [ANSWERS.resume, ANSWERS.startOver]]);
  assert.match(g.question, /other finished work merged since, and its branch no longer fits on top of it \(both changed docs\/notes\.md\)\. Bring it up to date and go on\?$/);
  assert.doesNotMatch(`${g.question} ${g.why}`, /\/peak-workflow|BUILD|\.json|git /, 'in the owner\'s words');
  assert.equal(plainReason(g.reason), 'its work no longer fits on top of the other finished work');

  setAutoContinue(p, 1);
  assert.deepEqual(continueRun(p.state, { by: 'Pat Owner' }).continued.map((x) => [x.gate, x.did]), [[`gates/${E1.id}-2.json`, 'brought it up to date with the other finished work']]);
  p.scenario({ [`${E1.id}/catchup`]: settle('docs/notes.md', 'notes by csv\nnotes by config\n'), [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r2 = await again(p, { queue: [E1.id] });
  assert.deepEqual(r2.steps, ['catchup-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'brought up to date, then the cut-short build is continued; never planned again');
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  assert.equal(git(p.clone, 'show', 'develop:docs/notes.md'), 'notes by csv\nnotes by config');
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

// ---- an epic is never started over without asking (handoff Step 3) --------------------------------
// conflict: a short session brings the branch up to date and the old answer carries; moved: checked again as it is;
// gone: asked, and a provisional run starts it over itself and lists it. Nothing is planned again unless "Start over".

const clash = (text) => ({ do: 'write', path: 'src/shared.js', content: text });
const building = (e, text) => ({ actions: [...buildActions(e, { commit: false }), clash(text), { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }] });
const CFG = { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' };
const noPlan = (r) => assert.deepEqual(r.steps.filter((s) => /\/plan-\d+$/.test(s)), [], 'never planned again unasked');

test('conflict between runs: the owner\'s look stands; a technical question, the standing answer takes it, a catch-up session settles the clash, and the final check runs on the old answer', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { Lg5Chr8: "echo '<svg/>' > chart.html && echo chart written" } } });
  const e5 = addLookEpic(p);
  const d = addEpic(p.project, CFG);
  const look = buildWithManual(e5).actions;
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: { actions: [...look.slice(0, -1), clash('export const mode = "chart";\n'), look.at(-1)] }, ...happy(d), [`${d.id}/build`]: building(d, 'export const mode = "config";\n') });
  const s1 = await p.go({ queue: [e5.id, d.id] });
  assert.deepEqual(s1.queue.map((q) => [q.id, q.state]), [[e5.id, 'PARKED'], [d.id, 'MERGED']]);
  const tip = git(p.clone, 'rev-parse', e5.branch);
  decide(p, e5.id, ANSWERS.looksRight, { note: 'one bar per category, labels readable' });

  // Between runs (status, continue): the void decision becomes one question; it is not acted on silently.
  assert.deepEqual(ensureResumeGates(p.state), [`${e5.id}-2.json`]);
  const g = gate(p, e5.id, 2);
  assert.deepEqual([g.kind, g.phase, g.technical, g.mergeIn, g.then, g.conflicts, g.branchTip, g.decided], ['resume', 'VERIFY', true, true, `gates/${e5.id}-1.json`, ['src/shared.js'], tip, null]);
  assert.match(g.question, /other finished work merged since, and its branch no longer fits on top of it \(both changed src\/shared\.js\)\. Bring it up to date and go on with your answer "Looks right"\?$/);
  assert.match(g.why, /a short session merges the other work into this epic's branch and settles the clashing lines; the final check and the merge check then judge everything\. "Start over" plans the epic again from scratch/);
  const old = gate(p, e5.id);
  assert.deepEqual([old.restarted?.by, old.void, old.decided.answer], [`gates/${e5.id}-2.json`, undefined, ANSWERS.looksRight], 'the look still stands: it is carried on, not void');
  assert.equal(gateFacts(p.state, 'develop').get(e5.id).state, 'waiting');
  assert.deepEqual(ensureResumeGates(p.state), [], 'written once');

  setAutoContinue(p, 1);
  assert.deepEqual(continueRun(p.state, { by: 'Pat Owner' }).continued.map((x) => [x.gate, x.did]), [[`gates/${e5.id}-2.json`, 'brought it up to date with the other finished work']]);
  assert.equal(gateFacts(p.state, 'develop').get(e5.id).state, 'resume', 'a gate that brings the branch up to date expects it not to merge cleanly');

  const manual = 'Did you perform any manual verification beyond the automated gates I ran?';
  p.scenario({ [`${e5.id}/catchup`]: settle('src/shared.js', 'export const mode = "chart";\nexport const also = "config";\n'), [`${e5.id}/verify`]: { actions: [ask(manual, ['Yes — I performed manual verification', 'No — only automated gates were run']), ...wrapupActions(e5)], result: { result: 'Verdict: PASS' } } });
  const r = await again(p, { queue: [e5.id] });
  assert.deepEqual(r.steps, ['catchup-1', 'verify-1'].map((s) => `${e5.id}/${s}`), 'no plan, no build, no look again');
  noPlan(r);
  const e = p.epic(e5.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.match(r.calls[0].prompt, /src\/shared\.js/);
  assert.match(r.calls[0].prompt, /git merge --no-ff develop/);
  assert.deepEqual([e.caughtUp.from, e.caughtUp.session], [tip, 'catchup-1']);
  assert.equal(readJson(p.dir(e5.id, 'verify-1', 'step.json')).look.gate, `gates/${e5.id}-1.json`, 'the verifier is handed the owner\'s look');
  assert.equal(fs.readdirSync(path.join(p.state, 'gates')).filter((f) => f.startsWith(e5.id)).length, 2, 'the look is not asked again');
  assert.equal(git(p.clone, 'show', 'develop:src/shared.js'), 'export const mode = "chart";\nexport const also = "config";');
  assert.equal(gate(p, e5.id, 2).decided.used.run, p.runName());
});

test('conflict on a question asked in the build: found when the run starts, it parks with no session; "Resume" catches up, then the build goes on with the owner\'s answer', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, CFG);
  const q = `${E1.tors[3]} cannot be fully met: amounts with three decimals. How to proceed?`;
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, clash('export const mode = "a";\n'), ask(q, DEFERRAL)] }, ...happy(d), [`${d.id}/build`]: building(d, 'export const mode = "b";\n') });
  await p.go({ queue: [E1.id, d.id] });
  assert.deepEqual([p.epic(E1.id).state, p.epic(d.id).state], ['PARKED', 'MERGED']);
  decide(p, E1.id, 'Fix now');

  p.scenario({});
  const r = await again(p, { queue: [E1.id] });
  assert.deepEqual(r.steps, [], 'no session: the run writes the question and parks');
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.match(p.epic(E1.id).reason, /does not merge cleanly with develop \(src\/shared\.js\)/);
  const g = gate(p, E1.id, 2);
  assert.deepEqual([g.mergeIn, g.then, g.phase, g.technical], [true, `gates/${E1.id}-1.json`, 'BUILD', true]);
  assert.match(g.question, /go on with your answer "Fix now"\?$/);
  assert.deepEqual([p.epic(E1.id).voided.asked, gate(p, E1.id).restarted.by], [`gates/${E1.id}-2.json`, `gates/${E1.id}-2.json`]);

  decide(p, E1.id, ANSWERS.resume, { n: 2 });
  p.scenario({ [`${E1.id}/catchup`]: settle('src/shared.js', 'export const mode = "a";\nexport const other = "b";\n'), [`${E1.id}/build`]: { actions: [ask(q, DEFERRAL), ...buildActions(E1)] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r2 = await again(p, { queue: [E1.id] });
  assert.deepEqual(r2.steps, ['catchup-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  noPlan(r2);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  // The branch now holds other epics' work, so a new build session takes over; it is told the answer, and R8 gives it again.
  assert.match(fs.readFileSync(p.dir(E1.id, 'build-1', 'owner-answers.md'), 'utf8'), /Fix now/);
  assert.deepEqual(Object.values(tools(p, E1.id, 'build-1')[0].hookSpecificOutput.updatedInput.answers), ['Fix now']);
});

test('a catch-up session that leaves conflict markers: its work is undone and the same question parks again, counted; past the count it is "Try again" / "Leave it for now"', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, CFG);
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: building(E1, 'export const mode = "a";\n'), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d), [`${d.id}/build`]: building(d, 'export const mode = "b";\n') });
  await p.go();
  const tip = git(p.clone, 'rev-parse', E1.branch);
  decide(p, E1.id, ANSWERS.auditNotReal);
  setAutoContinue(p, 1);
  assert.deepEqual(continueRun(p.state, { by: 'Pat Owner' }).continued.map((x) => x.gate), [`gates/${E1.id}-2.json`]);

  p.scenario({ [`${E1.id}/catchup`]: { actions: [{ do: 'exec', cmd: 'git merge --no-ff develop -m "Merge develop" || true' }, { do: 'commit', message: 'Merge develop' }] } });
  const r = await again(p, { queue: [E1.id] });
  assert.deepEqual(r.steps, [`${E1.id}/catchup-1`]);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /catchup-1 did not bring it up to date: conflict markers are left in src\/shared\.js/);
  assert.equal(git(p.clone, 'rev-parse', E1.branch), tip, 'what the session did is undone; the branch is as the gate says');
  assert.ok(e.catchUpRejected.at(-1).startsWith(`refs/autopilot/rejected/${E1.id}-catchup-`), 'and kept');
  const g = gate(p, E1.id, 3);
  assert.deepEqual([g.mergeIn, g.then, g.technical, g.branchTip], [true, `gates/${E1.id}-1.json`, true, tip]);

  const c = continueRun(p.state, { by: 'Pat Owner' });
  assert.deepEqual([c.continued, c.left.map((x) => x.gate)], [[], [`gates/${E1.id}-3.json`]], 'the standing answer covered one; it cannot loop');
  const st = status(p.project, p.state);
  assert.deepEqual(st.waiting.map((w) => [w.file, w.options]), [[`gates/${E1.id}-3.json`, [TRY_AGAIN, LEAVE_IT]]]);
  assert.ok(!p.steps().some((s) => s === `${E1.id}/plan-2`), 'never planned again');
});

test('a catch-up that keeps only its own side (`git merge -s ours`) throws away the other epics\' work: undone, and asked again', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, CFG);
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: building(E1, 'export const mode = "a";\n'), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d), [`${d.id}/build`]: building(d, 'export const mode = "b";\n') });
  await p.go();
  const tip = git(p.clone, 'rev-parse', E1.branch);
  decide(p, E1.id, ANSWERS.auditNotReal);
  ensureResumeGates(p.state);
  decide(p, E1.id, ANSWERS.resume, { n: 2 });
  p.scenario({ [`${E1.id}/catchup`]: { actions: [{ do: 'exec', cmd: 'git merge --no-ff -s ours develop -m "Merge develop"' }] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p, { queue: [E1.id] });
  assert.deepEqual(r.steps, [`${E1.id}/catchup-1`], 'no final check on a branch that dropped the other work');
  assert.match(p.epic(E1.id).reason, /src\/config\.js.* not what the merge of the two sides makes/);
  assert.equal(git(p.clone, 'rev-parse', E1.branch), tip);
  assert.equal(gate(p, E1.id, 3).then, `gates/${E1.id}-1.json`);
});

test('a catch-up cut off by its own limit: the next run brings the branch up to date again and still goes on with the owner\'s answer', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, CFG);
  const q = `${E1.tors[3]} cannot be fully met: amounts with three decimals. How to proceed?`;
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, clash('export const mode = "a";\n'), ask(q, DEFERRAL)] }, ...happy(d), [`${d.id}/build`]: building(d, 'export const mode = "b";\n') });
  await p.go({ queue: [E1.id, d.id] });
  decide(p, E1.id, 'Fix now');
  ensureResumeGates(p.state);
  decide(p, E1.id, ANSWERS.resume, { n: 2 });
  p.scenario({ [`${E1.id}/catchup`]: { actions: [{ do: 'exec', cmd: 'git merge --no-ff develop -m "Merge develop" || true' }], result: { subtype: 'error_max_turns', is_error: true } } });
  await again(p, { queue: [E1.id] });
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const g3 = gate(p, E1.id, 3);
  assert.deepEqual([g3.phase, g3.technical === true || /^budget:/.test(g3.reason)], ['CATCH_UP', true]);
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'the half-done merge is not committed as work');

  decide(p, E1.id, ANSWERS.resume, { n: 3 });
  p.scenario({ [`${E1.id}/catchup`]: settle('src/shared.js', 'export const mode = "a";\nexport const other = "b";\n'), [`${E1.id}/build`]: { actions: [ask(q, DEFERRAL), ...buildActions(E1)] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p, { queue: [E1.id] });
  assert.deepEqual(r.steps, ['catchup-1', 'build-1', 'audit-1', 'verify-1'].map((x) => `${E1.id}/${x}`));
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  assert.deepEqual(Object.values(tools(p, E1.id, 'build-1')[0].hookSpecificOutput.updatedInput.answers), ['Fix now'], 'the answer carried through the stop');
});

test('gone, full run: the branch was deleted — "Start over" or "Leave it for now", never the standing answer; only "Start over" plans it again', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: buildActions(E1, { commit: false }), result: { subtype: 'error_max_turns', is_error: true } } });
  await p.go();
  decide(p, E1.id, ANSWERS.resume);
  git(p.clone, 'checkout', '-q', '-f', 'develop');
  git(p.clone, 'branch', '-q', '-D', E1.branch);

  assert.deepEqual(ensureResumeGates(p.state), [`${E1.id}-2.json`]);
  const g = gate(p, E1.id, 2);
  assert.deepEqual([g.kind, g.restart, g.technical, g.options], ['resume', 'gone', undefined, [ANSWERS.startOver, LEAVE_IT]]);
  assert.match(g.question, /there is nothing left to continue it from: its branch is gone\. Start it over from scratch\?$/);
  assert.deepEqual(gate(p, E1.id).void.by, `gates/${E1.id}-2.json`);
  setAutoContinue(p, 3);
  const c = continueRun(p.state, { by: 'Pat Owner' });
  assert.deepEqual([c.continued, c.left.map((x) => x.why)], [[], ['not a technical stop: there is nothing left to continue it from']]);
  const leave = cli('decide', '--workspace', p.state, '--gate', `gates/${E1.id}-2.json`, '--answer', LEAVE_IT, '--by', 'Pat Owner');
  assert.equal(JSON.parse(leave.stdout).effect, 'none');

  p.scenario(happy(E1));
  const r = await again(p);
  assert.deepEqual(r.steps, [], 'left for now: nothing runs');
  assert.equal(p.epic(E1.id).state, 'SKIPPED');

  decide(p, E1.id, ANSWERS.startOver, { n: 2 });
  const r2 = await again(p);
  assert.deepEqual(r2.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'planned again: the owner answered "Start over"');
  assert.equal(p.epic(E1.id).state, 'MERGED');
});

test('gone, provisional run: it starts the epic over itself and lists it under "Decided for you"; a later full run does not ask it again', async (t) => {
  const setup = async () => {
    const p = makeProject(t, { config: { mode: 'provisional' } });
    p.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: buildActions(E1, { commit: false }), result: { subtype: 'error_max_turns', is_error: true } } });
    await p.go();
    decide(p, E1.id, ANSWERS.resume);
    git(p.clone, 'checkout', '-q', '-f', 'develop');
    git(p.clone, 'branch', '-q', '-D', E1.branch);
    p.scenario(happy(E1));
    return p;
  };
  for (const between of [true, false]) { // the question written between runs (status), or found by the run itself
    const p = await setup();
    if (between) assert.deepEqual(ensureResumeGates(p.state), [`${E1.id}-2.json`]);
    const r = await again(p);
    assert.deepEqual(r.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'nothing left to continue from: started over');
    assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
    const g = gate(p, E1.id, 2);
    assert.deepEqual([g.restart, g.decided.answer, g.decided.by, g.decided.standing, g.decided.prototype, !!g.decided.used], ['gone', ANSWERS.startOver, PROVISIONAL_BY, true, true, true]);
    const st = status(p.project, p.state);
    assert.deepEqual(st.decidedForYou.map((x) => [x.gate, x.prototype, x.did]), [[`gates/${E1.id}-2.json`, true, 'started it over from scratch: its branch was gone']]);
    assert.deepEqual(prototypeReasked(fs.readdirSync(path.join(p.state, 'gates')).map((f) => ({ file: `gates/${f}`, ...readJson(path.join(p.state, 'gates', f)) })), E1.id), [], 'a full run does not ask it again');
  }
});


// ---- onPark ------------------------------------------------------------------------------------

test('onPark, not set and nobody said they are away: the first epic that parks ends the run, and the report says why without naming a file to edit', async (t) => {
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
  assert.ok(report.next.some((n) => n.includes('1 epic did not start (Lg6Cfg3): the run stops at the first epic that needs you while you are there to answer')), report.next.join('\n'));
  assert.ok(!/onPark|autopilot\.json/.test(report.next.join('\n') + report.tldr.join('\n')), 'the owner is not told to edit a settings file');
  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.deepEqual([pre.launch.config.onPark, pre.launch.projectSettingsFile, pre.launch.projectSettingsFileExists], [null, file, false], 'not set by the project: it follows the owner\'s answer at launch, which preflight does not have yet');

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

// I2 (issue 41): a park while the owner is away must not idle the night.
/** One epic that parks, one independent of it, one that depends on it; `onPark` not set in the workspace. */
function parkAndTwoMore(t) {
  const p = makeProject(t);
  const settings = readJson(path.join(p.state, 'settings.json'));
  delete settings.onPark;
  fs.writeFileSync(path.join(p.state, 'settings.json'), JSON.stringify(settings));
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  const dep = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02', deps: [E1.id] });
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d), ...happy(dep) });
  p.launch = (cfg) => {
    const name = '20261121-010101';
    fs.mkdirSync(path.join(p.state, 'runs', name), { recursive: true });
    fs.writeFileSync(path.join(p.state, 'runs', name, 'config.json'), JSON.stringify({ project: p.project, allowTestDouble: true, ...cfg }));
    return p.go({ run: name });
  };
  return { p, d, dep };
}

test('onPark follows the launch answer: with the owner away, a parked epic is set aside, the independent one is built and the dependent one is blocked', async (t) => {
  const { p, d, dep } = parkAndTwoMore(t);

  const s = await p.launch({ attended: false });

  assert.deepEqual(Object.fromEntries(s.queue.map((q) => [q.id, q.state])), { [E1.id]: 'PARKED', [d.id]: 'MERGED', [dep.id]: 'BLOCKED' });
  assert.equal(s.stoppedBecause, 'queue done'); // a BLOCKED epic is settled for this run: nothing is left to try
  assert.ok(!s.stoppedOnPark);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /when an epic parks: continue \(you said you would be away\)/);
});

test('onPark follows the launch answer: with the owner there, the first park ends the run', async (t) => {
  const { p, d, dep } = parkAndTwoMore(t);

  const s = await p.launch({ attended: true });

  assert.deepEqual(Object.fromEntries(s.queue.map((q) => [q.id, q.state])), { [E1.id]: 'PARKED', [d.id]: 'QUEUED', [dep.id]: 'QUEUED' });
  assert.deepEqual([s.status, s.stoppedBecause], ['STOPPED', `${E1.id} parked (onPark: stop)`]);
});

test('onPark set by the project wins over the launch answer: "stop" stops the run although the owner is away', async (t) => {
  const { p, d } = parkAndTwoMore(t);
  const file = path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ onPark: 'stop' }));
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'chore: autopilot stops at the first park');
  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.equal(pre.launch.config.onPark, 'stop');

  const s = await p.launch({ attended: false });

  assert.equal(s.stoppedBecause, `${E1.id} parked (onPark: stop)`);
  assert.equal(s.queue.find((q) => q.id === d.id).state, 'QUEUED');
  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.ok(report.next.some((n) => n.includes('this project is set to stop at the first epic that needs you')), report.next.join('\n'));
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
    ...roundSpent(ef), [`${ef.id}/audit`]: audit([finding('test-weakened')]),
  });

  const s1 = await p.go();
  const run1 = p.runName();
  assert.deepEqual(s1.queue.map((x) => [x.id, x.state]), [ef, eq, ea, eh, el, er].map((e) => [e.id, 'PARKED']));
  const kinds = Object.fromEntries([ef, eq, ea, eh, el, er].map((e) => [e.id, gate(p, e.id).kind]));
  assert.deepEqual(kinds, { [ef.id]: 'audit', [eq.id]: 'deferral', [ea.id]: 'audit', [eh.id]: 'human-check', [el.id]: 'plan-lint', [er.id]: 'resume' });
  const tips = Object.fromEntries([ef, eq, ea, eh, el, er].map((e) => [e.id, git(p.clone, 'rev-parse', e.branch)]));
  const ran1 = p.steps();

  for (const [e, answer] of [[ef, ANSWERS.auditReal], [eq, 'Fix now'], [ea, ANSWERS.auditNotReal], [eh, ANSWERS.looksRight], [el, ANSWERS.approvePlan], [er, ANSWERS.resume]]) decide(p, e.id, answer, answer === ANSWERS.looksRight ? { note: 'opened the page: it reads well' } : {});
  // The spent-repair epic's answer is a standing one (nobody gave it just now): a person's "Real" would run one more repair (its own test above).
  { const g = path.join(p.state, 'gates', `${ef.id}-1.json`); fs.writeFileSync(g, JSON.stringify({ ...readJson(g), decided: { ...readJson(g).decided, standing: true } }, null, 2)); }
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
