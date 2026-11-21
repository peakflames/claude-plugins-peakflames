// Autopilot, attended: what a session that stays with a run reads and asks the driver —
// `watch` (the lines it relays), `status` (what to do next) and `continue` (the standing answer
// for technical stops). All against fake-claude.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, atLimit, ensureResumeGates, gateReason, newRunName, standingAnswer, standingCovers, strayProcesses } from '../driver.mjs';
import { chainOf, eventLine, progressLine, queueLine, snapshotLine, testsOutcomeKnown, unansweredNeeds } from '../attend.mjs';
import { DRIVER, E1, addEpic, alive, buildActions, buildScript, git, happy, makeProject, planScript, readJson, waitFor, wrapupScript } from './helpers.mjs';

const driver = (...args) => { const r = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' }); return { ...r, lines: () => r.stdout.trim().split('\n'), json: () => JSON.parse(r.stdout) }; };
const NAME = `${E1.id} — CSV import`;

/** `driver.mjs watch` as a child process whose stdout lines are collected as they arrive. */
function startWatch(p, ...args) {
  const child = spawn(process.execPath, [DRIVER, 'watch', '--workspace', p.state, '--poll-ms', '40', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  const w = { child, text: '', lines: () => w.text.split('\n').filter(Boolean), done: new Promise((resolve) => child.on('close', resolve)) };
  child.stdout.on('data', (d) => { w.text += d; });
  return w;
}

test('watch on a finished run: one line on where it ended, then RUN ENDED, exit 0', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  await p.go();

  const r = driver('watch', '--workspace', p.state);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lines(), ['The last autopilot run has ended: 1 finished and merged. Spent $2.01 of $250.', 'RUN ENDED: everything queued was worked through. Spent $2.01 of $250.']);

  // --replay says the whole run again, from its first event; --once --after picks up where a caller left off.
  const replay = driver('watch', '--workspace', p.state, '--replay').lines();
  assert.deepEqual([replay[1], replay[2], replay.at(-2), replay.at(-1)], ['Autopilot started: 1 epic queued.', `Starting ${NAME}`, `Finished and merged: ${NAME} (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01 of $250.']);
  assert.equal(replay.filter((l) => /^RUN ENDED/.test(l)).length, 1);
  assert.deepEqual(driver('watch', '--workspace', p.state, '--once', '--after', '13').lines(), [`Finished and merged: ${NAME} (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01 of $250.']);

  // A run from before events existed is still read from its state; a workspace with no run says so.
  fs.rmSync(path.join(p.runDir(), 'events.jsonl'));
  assert.equal(driver('watch', '--workspace', p.state).lines().at(-1), 'RUN ENDED: everything queued was worked through. Spent $2.01 of $250.');
  fs.rmSync(path.join(p.state, 'runs'), { recursive: true }); fs.rmSync(path.join(p.state, 'current'));
  assert.deepEqual(driver('watch', '--workspace', p.state, '--grace-ms', '0').lines(), ['No autopilot run has started here yet.', 'RUN ENDED: no run to watch.']);
  assert.equal(spawnSync(process.execPath, [DRIVER, 'watch'], { encoding: 'utf8' }).status, 2, 'watch needs --workspace');
});

test('watch on a live run: step lines as they happen, a repeated refusal said once, the tests\' result, and the end', async (t) => {
  const p = makeProject(t);
  const push = { do: 'tool', tool_name: 'Bash', tool_input: { command: 'git push origin develop' } };
  const tests = (hook) => ({ do: 'write', path: '{{step}}/hooks.jsonl', append: true, content: `${JSON.stringify({ hook, tool_name: 'Bash', tool_input: { command: 'cd . && node --test' } })}\n` });
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, push, push, tests('PostToolUseFailure'), tests('PostToolUse'), { do: 'write', path: '{{state}}/mid-build', content: '' }, { do: 'hang' }] },
  });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => readJson(path.join(p.state, 'lock')).pid);
  const w = startWatch(p, '--replay', '--verbose');
  t.after(() => w.child.kill('SIGKILL'));

  await waitFor(() => fs.existsSync(path.join(p.state, 'mid-build')) && w.lines().some((l) => l === 'TESTS passed'));
  assert.ok(alive(w.child.pid), 'the watch stays while the run does');
  const mid = w.lines();
  assert.match(mid[0], /^Autopilot is (running|starting)/);
  assert.deepEqual(mid.slice(1, 4), ['Autopilot started: 1 epic queued.', `Starting ${NAME}`, `Planning ${NAME}`]);
  assert.match(mid[4], /^Plan finished in under a minute/);
  assert.equal(mid[5], `Building ${NAME}`);
  const refused = mid.filter((l) => /^REFUSED/.test(l));
  assert.equal(refused.length, 1, 'the same refusal twice is one line');
  assert.match(refused[0], /^REFUSED \(git rule\): /);
  assert.deepEqual(mid.filter((l) => /^TESTS/.test(l)), ['TESTS failed', 'TESTS passed']);

  // A second watch that joins mid-step starts from where the run is: no old lines, no old refusals.
  const late = startWatch(p);
  t.after(() => late.child.kill('SIGKILL'));
  await waitFor(() => late.lines().length >= 1);
  assert.match(late.lines()[0], new RegExp(`^Autopilot is running: now building ${NAME}, \\d+ min\\. Spent \\$0\\.40 of \\$250\\.$`));

  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  assert.equal(await w.done, 0);
  assert.equal(await late.done, 0);
  await waitFor(() => !alive(run.pid));
  const end = w.lines().slice(mid.length);
  assert.match(end[0], /^Build stopped, as you asked, after under a minute$/);
  assert.deepEqual(end.slice(1), [`Stopped: ${NAME} — you asked it to stop`, 'RUN ENDED: you asked it to stop. Spent $0.40 of $250.']);
  assert.deepEqual(late.lines().slice(1), end, 'the late watch says what happened after it joined, and nothing from before');
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')), 'the watch ends once the driver has let go');
});

test('watch --once: returns after the first thing said, with where to pick up; a third identical refusal is said again', async (t) => {
  const p = makeProject(t);
  const push = { do: 'tool', tool_name: 'Bash', tool_input: { command: 'git push origin develop' } };
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, push, push, push, { do: 'write', path: '{{state}}/mid-build', content: '' }, { do: 'hang' }] } });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => fs.existsSync(path.join(p.state, 'mid-build')));

  // Nothing new since this watch joined: it waits, and gives up quietly at its time limit.
  const idle = driver('watch', '--workspace', p.state, '--once', '--once-min', '0.01', '--poll-ms', '40');
  assert.equal(idle.status, 0);
  assert.match(idle.lines()[0], /^Autopilot is running: now building/);
  assert.deepEqual(idle.lines().slice(1), ['(next: --after 5)']);
  // From an earlier point it says what it missed and returns at once.
  const caught = driver('watch', '--workspace', p.state, '--once', '--after', '3', '--poll-ms', '40');
  assert.match(caught.lines()[0], /^Plan finished/);
  assert.deepEqual(caught.lines().slice(1), [`Building ${NAME}`, '(next: --after 5)']);
  // The whole step, replayed: the refusal is said the first time and the third.
  const all = driver('watch', '--workspace', p.state, '--once', '--replay', '--verbose', '--poll-ms', '40').lines().filter((l) => /^REFUSED/.test(l));
  // An attending session is not woken for a first refusal or a test run: without --verbose only the third refusal is said.
  assert.deepEqual(driver('watch', '--workspace', p.state, '--once', '--replay', '--poll-ms', '40').lines().filter((l) => /^REFUSED|^TESTS/.test(l)).map((l) => l.slice(0, 15)), ['REFUSED 3 times']);
  assert.equal(all.length, 2);
  assert.match(all[1], /^REFUSED 3 times \(git rule\): /);

  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  await waitFor(() => !alive(run.pid));
});

// ---- status and the standing answer ------------------------------------------------------------

const st = (p, ...more) => { const r = driver('status', '--project', p.project, '--json', ...more); assert.equal(r.status, 0, r.stderr); return r.json(); };
const LABEL = `${E1.id} (${E1.slug}) — CSV import`;
const gateFile = (p, id, n = 1) => readJson(path.join(p.state, 'gates', `${id}-${n}.json`));
/** What the skill's Step 2 item 4 writes: a new run's config.json. Returns the run's name. */
function confirmRun(p, cfg = {}, name = newRunName(p.state)) {
  fs.mkdirSync(path.join(p.state, 'runs', name), { recursive: true });
  fs.writeFileSync(path.join(p.state, 'runs', name, 'config.json'), JSON.stringify({ project: p.project, queue: [E1.id], explicit: [], endBy: null, runBudgetUsd: 80, allowTestDouble: true, ...cfg }, null, 2));
  return name;
}
const overBudget = (e) => ({ actions: buildActions(e, { commit: false }), result: { subtype: 'error_max_turns', is_error: true, total_cost_usd: 1 } });

test('standingCovers: only an undecided resume gate for a technical stop, and only n times per epic', () => {
  const g = (reason, extra = {}) => ({ file: 'gates/a-9.json', epic: 'a', kind: 'resume', phase: 'CHECK_BUILD', options: [ANSWERS.resume, ANSWERS.startOver], decided: null, reason, ...extra });
  const covered = ['infra error during build-1: exit 1, no result line', 'budget: build-1 hit wall clock', 'budget: fix-1 hit error_max_turns', 'budget: verify-1 hit error_max_budget_usd', 'CHECK_BUILD: the build left uncommitted work (failed: clean-tree)', 'CHECK_BUILD still fails after the fix round (tests-green)', 'interrupted: the driver was restarted mid-build and CHECK_BUILD does not pass (sidecar)', 'auditor: the audit could not start (x); not verified without an audit', 'auditor: audit-1 returned no usable result (y); not verified without an audit'];
  for (const r of covered) assert.equal(standingCovers(g(r), [], 2), true, r);
  // The owner's own stop, a run limit, the disk, a branch that no longer fits, a verified epic nobody merged: all asked.
  const asked = ['stopped by the STOP file during build-1', 'run stopped (STOP file) before VERIFY', 'run stopped (end time) before BUILD', 'run stopped (run budget) before AUDIT', 'run stopped (disk floor) before PLAN', 'budget: build-1 hit disk floor', 'budget: build-1 hit growth cap', 'feature/x does not merge cleanly with develop (a.js): merge develop into the branch by hand, then resume', 'verify-1 verified every requirement and marked the epic Complete on feature/x, but did not merge it into develop', 'CHECK_BUILD: the handoff records 2 deferral(s): a human decision (failed: handoff)', ''];
  for (const r of asked) assert.equal(standingCovers(g(r), [], 2), false, r);
  const ok = covered[1];
  assert.equal(standingCovers(g(undefined, { question: `a (x) — X stopped: ${ok}. Continue it in the next run?` }), [], 2), true, 'a gate from an earlier driver: the reason is read from its question');
  assert.equal(gateReason(g(undefined, { question: `a (x) — X stopped: ${ok}. Continue it in the next run?` })), ok);
  for (const n of [0, undefined, null, -1]) assert.equal(standingCovers(g(ok), [], n), false, `n = ${n}`);
  for (const other of [{ kind: 'audit' }, { kind: 'human-check' }, { kind: 'deferral' }, { kind: 'plan-lint' }, { decided: { answer: ANSWERS.resume } }, { superseded: { run: 'r' } }, { void: { why: 'x' } }, { phase: null }, { options: [] }]) assert.equal(standingCovers(g(ok, other), [], 2), false, JSON.stringify(other));
  const earlier = (epic) => ({ epic, kind: 'resume', decided: { answer: ANSWERS.resume, standing: true, used: { run: 'r' } } });
  assert.equal(standingCovers(g(ok), [earlier('a'), earlier('b'), { epic: 'a', kind: 'resume', decided: { answer: ANSWERS.resume } }], 2), true, 'one standing answer so far; the owner\'s own answers do not count');
  assert.equal(standingCovers(g(ok), [earlier('a'), earlier('a')], 2), false, 'a third is asked');
});

test('status.next: readiness with no run, attend while a driver runs, decide for the owner\'s own stop', async (t) => {
  const p = makeProject(t);
  const none = st(p);
  assert.deepEqual([none.next, none.run, none.running, none.epics, none.waiting, none.relaunch], ['readiness', null, null, [], [], null]);
  assert.deepEqual(fs.readdirSync(p.state), ['settings.json'], 'status writes nothing');

  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, { do: 'write', path: '{{state}}/mid-build', content: '' }, { do: 'hang' }] } });
  const name = confirmRun(p, { autoContinue: 2 });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--run', name], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => fs.existsSync(path.join(p.state, 'mid-build')));

  const live = st(p);
  assert.deepEqual([live.next, live.run, live.running.pid, live.autoContinueLimit], ['attend', name, readJson(path.join(p.state, 'lock')).pid, 2]);
  assert.deepEqual(live.epics.map((e) => [e.label, e.state, e.step]), [[LABEL, 'BUILD', 'build-1']]);
  assert.match(live.say[0], /^Autopilot is running: now building Lg1Csv7 — CSV import, \d+ min\. Spent \$0\.40 of \$80\.$/);
  assert.match(live.say[2], /^Nothing needs you right now: it is building/);
  assert.equal(driver('continue', '--workspace', p.state, '--json').status, 2, 'never while a driver runs');

  assert.equal(driver('stop', '--workspace', p.state).status, 0);
  await waitFor(() => !alive(run.pid));
  // The owner stopped it: that is theirs to continue, whatever the standing answer says.
  const stopped = st(p);
  assert.deepEqual([stopped.next, stopped.running, stopped.autoContinue], ['decide', null, []]);
  assert.deepEqual(stopped.waiting.map((g) => [g.file, g.kind, g.why]), [[`gates/${E1.id}-1.json`, 'resume', 'you asked it to stop']]);
  const refused = driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner');
  assert.equal(refused.status, 1);
  assert.deepEqual([refused.json().continued, refused.json().left.map((l) => l.why)], [[], ['not a technical stop: you asked it to stop']]);
  assert.equal(gateFile(p, E1.id).decided, null);
});

test('status.next: decide for a gate only the owner answers (a look, a finding that a paid service was never really called); continue never touches one', async (t) => {
  const p = makeProject(t);
  const e5 = addEpic(p.project, { id: 'Lg5Chr8', slug: 'chart', name: 'Spending chart', nn: '05' });
  const feature = path.join(p.project, 'docs', 'requirements', '05-chart.feature.md');
  fs.writeFileSync(feature, fs.readFileSync(feature, 'utf8').replace(/^(Scenario: .*)$/m, '$1\n    # Verification: operator-observed'));
  git(p.project, 'commit', '-qam', 'docs: the chart is checked by a person');
  const manual = { actions: [...buildActions(e5, { commit: false }), { do: 'write', path: `test/${e5.slug}.test.js`, content: "import test from 'node:test';\ntest('the chart command exists', () => {});\n" }, { do: 'write', path: `tests/manual/${e5.tors[0]}.md`, content: `# Manual check — ${e5.tors[0]}\n\n1. Open chart.html\n` }, { do: 'commit', message: `feat(epic-${e5.id}): implement ${e5.slug}` }] };
  const finding = { category: 'never-ran-real', severity: 'high', evidence: 'test/x.test.js:1', explanation: 'the rates service was never called' };
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { result: { structured_output: { findings: [finding], recommend: 'park', summary: 'canned' } } }, [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: manual });
  await p.go({ run: confirmRun(p, { queue: [E1.id, e5.id], autoContinue: 2 }) });
  assert.deepEqual([p.epic(E1.id).state, p.epic(e5.id).state], ['PARKED', 'PARKED']);

  const s = st(p);
  assert.deepEqual([s.next, s.autoContinue, s.relaunch], ['decide', [], null]);
  assert.deepEqual(s.waiting.map((g) => [g.epic, g.kind]), [[E1.id, 'audit'], [e5.id, 'human-check']]);
  assert.equal(s.say[2], '2 question(s) wait for you.');
  const r = driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner');
  assert.equal(r.status, 1);
  assert.deepEqual(r.json().left.map((l) => l.why), ['a question only the owner answers (audit)', 'a question only the owner answers (human-check)']);
  assert.deepEqual([gateFile(p, E1.id).decided, gateFile(p, e5.id).decided], [null, null]);
});

test('status.next: fetch when everything queued merged and the clone is ahead, then nothing; --queue keeps to what the owner confirmed', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categories', name: 'Categories', nn: '02' });
  p.scenario(happy(E1));
  await p.go({ run: confirmRun(p) });

  const all = st(p);
  assert.deepEqual([all.next, all.why], ['readiness', '1 epic(s) can run'], 'a fresh look: the other epic can still run');
  const mine = st(p, '--queue', E1.id);
  assert.deepEqual([mine.next, mine.merged, mine.waiting, mine.spentUsd, mine.runBudgetUsd, mine.sync.state], ['fetch', [LABEL], [], 2.01, 80, 'clone-ahead']);
  assert.match(mine.sync.fetch[0], /^git fetch ".*clone" develop:autopilot\/develop && git log develop\.\.autopilot\/develop$/);
  for (const line of mine.sync.fetch) assert.equal(spawnSync('sh', ['-c', line], { cwd: p.project, encoding: 'utf8' }).status, 0, line);
  const done = st(p, '--queue', E1.id);
  assert.deepEqual([done.next, done.sync.state, done.sync.fetch], ['nothing', 'same', []]);
  assert.equal(st(p, '--queue', `${E1.id},${e2.id}`).next, 'readiness');
  // The plain form is what "how is it going?" gets: three lines and the next step.
  const plain = driver('status', '--project', p.project, '--queue', E1.id).lines();
  assert.deepEqual(plain, ['The last autopilot run has ended: 1 finished and merged. Spent $2.01 of $80.', `${NAME}: finished and merged`, 'Nothing needs you right now.', 'next: nothing (nothing is left to run)']);
});

test('continue: a budget stop is resumed on the standing answer, twice per epic; the third is the owner\'s, and the next run resumes', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: overBudget(E1) });
  const run1 = confirmRun(p, { autoContinue: 2 });
  await p.go({ run: run1 });
  assert.equal(p.epic(E1.id).reason, 'budget: build-1 hit error_max_turns');
  assert.equal(gateFile(p, E1.id).reason, 'budget: build-1 hit error_max_turns');

  const s1 = st(p);
  assert.deepEqual([s1.next, s1.waiting, s1.relaunch], ['continue', [], null]);
  assert.deepEqual(s1.autoContinue.map((g) => [g.file, g.kind, g.why]), [[`gates/${E1.id}-1.json`, 'resume', 'a step reached its limit']]);
  const c1 = driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner');
  assert.equal(c1.status, 0, c1.stderr);
  assert.deepEqual(c1.json(), { autoContinue: 2, continued: [{ gate: `gates/${E1.id}-1.json`, epic: E1.id, label: LABEL, why: 'a step reached its limit', answer: ANSWERS.resume, did: 'continued it from where it stopped', enters: 'BUILD', standingAnswers: 1, of: 2 }], left: [] });
  assert.deepEqual(gateFile(p, E1.id).decided, { answer: ANSWERS.resume, by: 'Pat Owner', date: new Date().toISOString().slice(0, 10), scope: 'next-run', standing: true });

  // The run that continues it: named by status, with the same queue and what is left of the budget.
  const s2 = st(p);
  assert.deepEqual([s2.next, s2.why, s2.waiting, s2.autoContinue], ['readiness', 'a decided gate waits to be used', [], []]);
  assert.deepEqual(s2.relaunch.config, { project: p.project, queue: [E1.id], explicit: [], endBy: null, runBudgetUsd: 78.6, autoContinue: 2, continues: run1, allowTestDouble: true });
  const relaunch = async (s) => { confirmRun(p, s.relaunch.config, s.relaunch.run); const before = p.calls().length; await p.go({ run: s.relaunch.run }); return p.steps().slice(before); };
  assert.deepEqual(await relaunch(s2), [`${E1.id}/build-1`], 'the build is continued; nothing is planned again');
  assert.equal(readJson(path.join(p.runDir(), 'config.json')).continues, run1);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /decided "Resume from where it stopped" by Pat Owner on \d{4}-\d{2}-\d{2} \(decided by autopilot on their standing answer for technical stops, given at launch; nobody was asked again\)/);

  // Stopped the same way again: the second and last standing answer.
  const s3 = st(p);
  assert.deepEqual([s3.next, s3.autoContinue.map((g) => g.file), s3.spentUsd, s3.runBudgetUsd], ['continue', [`gates/${E1.id}-2.json`], 2.4, 80]);
  assert.deepEqual(driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner').json().continued.map((c) => [c.gate, c.standingAnswers]), [[`gates/${E1.id}-2.json`, 2]]);
  await relaunch(st(p));

  // A third time: the owner is asked.
  const s4 = st(p);
  assert.deepEqual([s4.next, s4.autoContinue, s4.waiting.map((g) => [g.file, g.options, g.atLimit])], ['decide', [], [[`gates/${E1.id}-3.json`, ['Try again', 'Leave it for now'], { stops: 3 }]]]);
  const c3 = driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner');
  assert.equal(c3.status, 1);
  assert.deepEqual(c3.json().left.map((l) => l.why), ['this epic was already continued 2 time(s); the standing answer covers 2']);
  assert.equal(gateFile(p, E1.id, 3).decided, null);

  // They answer it themselves; the run after that resumes and finishes.
  assert.equal(driver('decide', '--workspace', p.state, '--gate', `gates/${E1.id}-3.json`, '--answer', ANSWERS.resume, '--by', 'Pat Owner').status, 0);
  assert.equal(gateFile(p, E1.id, 3).decided.standing, undefined);
  p.scenario({ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const s5 = st(p);
  assert.equal(s5.relaunch.config.runBudgetUsd, 76.6);
  assert.deepEqual(await relaunch(s5), [`${E1.id}/build-1`, `${E1.id}/audit-1`, `${E1.id}/verify-1`]);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  const end = st(p, '--queue', E1.id);
  assert.deepEqual([end.next, end.merged, end.spentUsd, end.runBudgetUsd, end.relaunch], ['fetch', [LABEL], 5.01, 80, null]);
  assert.equal(fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').split('\n').map((l) => l && JSON.parse(l)).find((e) => e.type === 'epic-start').resumedAt, 'BUILD');
});

test('status reports the gate a dead-end park still needs without writing it; continue writes and answers it', async (t) => {
  const p = makeProject(t);
  // A finished build that autopilot's own check stopped, with no question left behind (as an earlier driver left it).
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [...buildActions(E1), { do: 'write', path: 'src/left.js', content: '// left\n' }] } });
  await p.go({ run: confirmRun(p, { autoContinue: 1 }) });
  assert.match(p.epic(E1.id).reason, /^CHECK_BUILD: the build left uncommitted work/);
  fs.rmSync(path.join(p.state, 'gates'), { recursive: true });

  const s = st(p);
  assert.deepEqual([s.next, s.autoContinue.map((g) => [g.file, g.why])], ['continue', [[`gates/${E1.id}-1.json`, "autopilot's own checks on the build did not pass"]]]);
  assert.ok(!fs.existsSync(path.join(p.state, 'gates')), 'status only reports');
  assert.deepEqual(ensureResumeGates(p.state, { write: false }), [`${E1.id}-1.json`]);
  assert.ok(!fs.existsSync(path.join(p.state, 'gates')));
  const c = driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner');
  assert.deepEqual([c.status, c.json().continued.map((x) => x.gate)], [0, [`gates/${E1.id}-1.json`]]);
  assert.equal(gateFile(p, E1.id).decided.standing, true);
});

test('status.next: readiness when the only epics left are ones the owner could queue explicitly; never once a queue is confirmed', (t) => {
  const p = makeProject(t);
  git(p.project, 'config', 'user.name', 'Someone Else'); // the seed's epic is planned by another person
  const s = st(p);
  assert.deepEqual([s.next, s.why], ['readiness', '1 epic(s) can be queued explicitly']);
  assert.equal(st(p, '--queue', 'Lg9None').next, 'nothing');
});

// ---- inside a step: a command that waits for the owner, and what a session leaves running --------

test('watch and status see inside the step: a command marked "Needs you:" is said at once, a long one once; neither is a guess', async (t) => {
  const p = makeProject(t);
  const pre = (id, description) => ({ do: 'write', path: '{{step}}/hooks.jsonl', append: true, content: `${JSON.stringify({ t: new Date().toISOString(), hook: 'PreToolUse', tool_name: 'Bash', decision: 'pass', tool_use_id: id, tool_input: { command: 'python build.py mcp tools --oauth', description } })}\n` });
  const post = (id) => ({ do: 'write', path: '{{step}}/hooks.jsonl', append: true, content: `${JSON.stringify({ t: new Date().toISOString(), hook: 'PostToolUse', tool_name: 'Bash', tool_use_id: id, tool_input: { command: 'x' } })}\n` });
  const mark = (name) => ({ do: 'write', path: `{{state}}/${name}`, content: '' });
  const until = (name) => ({ do: 'exec', cmd: `while [ ! -f "{{state}}/${name}" ]; do sleep 0.05; done` });
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [pre('t1', 'Run the unit tests'), mark('at-1'), until('go-1'), post('t1'), pre('t2', 'Needs you: sign in to Okta in the browser window that opens'), mark('at-2'), until('go-2'), post('t2'), ...wrapupScript(E1).actions], result: { result: 'Verdict: PASS', total_cost_usd: 1.3 } } });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => fs.existsSync(path.join(p.state, 'at-1')));
  const w = startWatch(p, '--long-min', '0.005');
  t.after(() => w.child.kill('SIGKILL'));

  // An ordinary command that has been open a while is said once, with the session's own description of it.
  await waitFor(() => w.lines().some((l) => /^One command has been running/.test(l)));
  assert.deepEqual(w.lines().filter((l) => /^One command/.test(l)), ['One command has been running for 0 min: "Run the unit tests"']);
  const s1 = st(p);
  assert.deepEqual([s1.next, s1.inFlight.description, s1.inFlight.needsYou], ['attend', 'Run the unit tests', false]);
  assert.match(s1.say[2], /^Nothing needs you right now: it is verifying/);

  // A command the session marked as waiting for the owner is said at once, and status says the same.
  fs.writeFileSync(path.join(p.state, 'go-1'), '');
  await waitFor(() => fs.existsSync(path.join(p.state, 'at-2')) && w.lines().some((l) => /^NEEDS YOU/.test(l)));
  assert.deepEqual(w.lines().filter((l) => /^NEEDS YOU/.test(l)), ['NEEDS YOU: sign in to Okta in the browser window that opens']);
  const s2 = st(p);
  assert.deepEqual([s2.inFlight.description, s2.inFlight.needsYou], ['sign in to Okta in the browser window that opens', true]);
  assert.match(s2.say[2], /^It is waiting for you at this computer: sign in to Okta in the browser window that opens \(\d+ min so far\)\.$/);

  fs.writeFileSync(path.join(p.state, 'go-2'), '');
  assert.equal(await w.done, 0);
  await waitFor(() => !alive(run.pid));
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(w.lines().filter((l) => /^NEEDS YOU|^One command/.test(l)).length, 2, 'each said once');
  // How the wait ended is said too: nobody is left looking for a window that is gone.
  assert.deepEqual(w.lines().filter((l) => /^NO LONGER NEEDS YOU/.test(l)), ['NO LONGER NEEDS YOU: done after 0 min — sign in to Okta in the browser window that opens']);
  assert.equal(st(p, '--queue', E1.id).inFlight, null);
});

test('a command the owner was called for and that gave up is said so; only an exit that is the test command\'s own says how the tests went', async (t) => {
  const p = makeProject(t);
  const line = (row) => ({ do: 'write', path: '{{step}}/hooks.jsonl', append: true, content: `${JSON.stringify({ t: new Date().toISOString(), tool_name: 'Bash', ...row })}\n` });
  const mark = (name) => ({ do: 'write', path: `{{state}}/${name}`, content: '' });
  const until = (name) => ({ do: 'exec', cmd: `while [ ! -f "{{state}}/${name}" ]; do sleep 0.05; done` });
  const needs = { command: 'python build.py mcp tools --oauth', description: 'Needs you: sign in to Okta' };
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [
    line({ hook: 'PreToolUse', decision: 'pass', tool_use_id: 'n1', tool_input: needs }), mark('at-1'), until('go-1'),
    line({ hook: 'PostToolUseFailure', tool_use_id: 'n1', tool_input: needs, error: 'OAuth callback timed out after 300.0 seconds' }),
    // Seen live: a command that only names `test-live`, and dies on a shell typo, is not a test result.
    line({ hook: 'PostToolUseFailure', tool_use_id: 'x1', tool_input: { command: 'python build.py status; echo ===LIVE; node --test-live 2>&1 | tail -6' } }),
    line({ hook: 'PostToolUseFailure', tool_use_id: 'x2', tool_input: { command: 'node --test; echo done' } }),
    line({ hook: 'PostToolUseFailure', tool_use_id: 'x3', tool_input: { command: 'cd . && node --test > /tmp/t.log 2>&1' } }),
    ...wrapupScript(E1).actions], result: { result: 'Verdict: PASS', total_cost_usd: 1.3 } } });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => fs.existsSync(path.join(p.state, 'at-1')));
  const w = startWatch(p, '--verbose');
  t.after(() => w.child.kill('SIGKILL'));
  await waitFor(() => w.lines().some((l) => /^NEEDS YOU/.test(l)));
  fs.writeFileSync(path.join(p.state, 'go-1'), '');
  assert.equal(await w.done, 0);
  await waitFor(() => !alive(run.pid));
  assert.deepEqual(w.lines().filter((l) => /NEEDS YOU/.test(l)), ['NEEDS YOU: sign in to Okta', 'NO LONGER NEEDS YOU: it gave up after 0 min without that being done — sign in to Okta (OAuth callback timed out after 300.0 seconds)']);
  assert.deepEqual(w.lines().filter((l) => /^TESTS/.test(l)), ['TESTS failed'], 'one result: the command that ended with the test command');
  assert.deepEqual(unansweredNeeds(p.dir(E1.id, 'verify-1', 'hooks.jsonl')).map((u) => [u.description, u.command, u.minutes]), [['sign in to Okta', 'python build.py mcp tools --oauth', 0]]);

  const test = '.venv/bin/python build.py test';
  for (const [command, known] of [[test, true], [`cd x && ${test} 2>&1`, true], [`${test} > /tmp/x.log 2>&1`, true], [`echo a; ${test} --filter X`, true], [`${test}-live`, false], [`${test} | tail -3`, false], [`${test}; echo done`, false], [`x${test}`, false], ['echo hi', false]]) assert.equal(testsOutcomeKnown(command, test), known, command);
  assert.equal(testsOutcomeKnown(test, ''), false);
});

test('the first line counts the spend of every run chained to this one, when the caller knows it', () => {
  const state = { queue: [{ state: 'MERGED' }], spentUsd: 2.44, runBudgetUsd: 72.91 };
  assert.equal(snapshotLine(state, { running: false }), 'The last autopilot run has ended: 1 finished and merged. Spent $2.44 of $72.91.');
  // Seen live: "$2.44 of $72.91" for work that had cost $9.53 of the $80 the owner set.
  assert.equal(snapshotLine(state, { running: false, spentUsd: 9.53, runBudgetUsd: 80 }), 'The last autopilot run has ended: 1 finished and merged. Spent $9.53 of $80.');
});

test('the progress line counts how each epic of the run ended, and what is still to go', () => {
  assert.equal(progressLine(new Map([['a', 'merged'], ['b', 'parked']]), 3), 'Progress: 1 merged, 1 waiting for you, 1 still to go (3 epics in this run)');
  assert.equal(progressLine(new Map([['a', 'merged'], ['b', 'failed'], ['c', 'blocked']]), 3), 'Progress: 1 merged, 1 did not pass, 1 not started, 0 still to go (3 epics in this run)');
  assert.equal(progressLine(new Map(), 2), 'Progress: 2 still to go (2 epics in this run)');
});

test('a process a session leaves running out of the clone is stopped when the session ends, and the log says so', async (t) => {
  const p = makeProject(t);
  // As seen live: a server started detached from the session (its own daemon mode, or nohup) keeps running after it.
  const daemon = { do: 'exec', cmd: `node -e "const c=require('child_process').spawn('sleep',['300'],{detached:true,stdio:'ignore'});require('fs').writeFileSync(process.argv[1],String(c.pid));c.unref()" "{{state}}/stray.pid"` };
  const scripts = happy(E1);
  scripts[`${E1.id}/verify`].actions.unshift(daemon);
  p.scenario(scripts);
  await p.go();
  const pid = Number(fs.readFileSync(path.join(p.state, 'stray.pid'), 'utf8'));
  t.after(() => { try { process.kill(pid, 'SIGKILL'); } catch { /* gone, as it should be */ } });
  assert.equal(p.epic(E1.id).state, 'MERGED');
  await waitFor(() => !alive(pid), { timeoutMs: 5000 });
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`verify-1 left 1 process\\(es\\) running in the clone; stopped: ${pid} `));
  assert.deepEqual(strayProcesses(p.clone), []);
  // A status or a watch reading the clone, and this test, are never swept.
  assert.equal(st(p, '--queue', E1.id).next, 'fetch');
});

test('the run budget: $250 by default, the project may set its own, and a higher one raises a chain in progress', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  await p.go();
  const st1 = st(p);
  assert.equal(st1.runBudgetUsd, 250);
  const file = path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');
  assert.match(driver('configure', '--project', p.project, '--run-budget', 'lots').stderr, /run budget is a dollar amount above 0/);
  assert.equal(driver('configure', '--project', p.project, '--run-budget', '400').status, 0);
  assert.equal(readJson(file).runBudgetUsd, 400);
  assert.equal(st(p).runBudgetUsd, 400, 'the chain in progress is raised');
  assert.equal(chainOf(p.state, p.runName()).runBudgetUsd, 400, 'and the watch says the same figure');
  assert.equal(driver('configure', '--project', p.project, '--run-budget', '').status, 0);
  assert.equal(readJson(file).runBudgetUsd, undefined);
});

test('the queue line counts over the confirmed queue: done, percent, waiting, still to go', () => {
  assert.equal(queueLine(new Map([['a', 'MERGED'], ['b', 'PARKED'], ['c', 'QUEUED'], ['d', 'QUEUED']])), 'Progress: 1 of 4 done (25%); 1 waiting for you; 2 still to go');
  assert.equal(queueLine(new Map([['a', 'MERGED'], ['b', 'MERGED']])), 'Progress: 2 of 2 done (100%)');
  assert.equal(queueLine(new Map([['a', 'FAILED'], ['b', 'BLOCKED'], ['c', 'BUILD']])), 'Progress: 0 of 3 done (0%); 1 did not pass; 1 not started; 1 still to go');
  assert.equal(eventLine({ type: 'epic-start', epic: 'b', label: 'b (x) — Second', pos: 2, of: 4 }), 'Starting 2 of 4: b — Second');
  assert.equal(eventLine({ type: 'step-end', kind: 'build', outcome: 'ok', minutes: 12, costUsd: 4.2 }), "Build finished in 12 min ($4.20). Next: autopilot's own checks, then an independent review");
});

// ---- autopilot answers a technical stop itself (issue #41, I6) -------------------------------------

const TRY = ['Try again', 'Leave it for now'];
const canned = (...categories) => ({ result: { total_cost_usd: 0.5, structured_output: { findings: categories.map((category) => ({ category, severity: 'high', evidence: 'test/rates.test.js:12', explanation: `the ${category} problem` })), recommend: 'park', summary: 'canned' } } });
const askTool = (question, options) => ({ do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, header: 'Gate', multiSelect: false, options: options.map((label) => ({ label, description: '' })) }] } });
const cont = (p) => driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner');
async function relaunch(p) {
  const s = st(p);
  assert.ok(s.relaunch, `nothing to relaunch: ${s.next} (${s.why})`);
  confirmRun(p, s.relaunch.config, s.relaunch.run);
  const before = p.calls().length;
  await p.go({ run: s.relaunch.run });
  return p.steps().slice(before);
}

test('standingAnswer: which answer autopilot gives a technical stop, one count per epic for every kind', () => {
  const base = { file: 'gates/a-9.json', epic: 'a', decided: null };
  const resume = (extra = {}) => ({ ...base, kind: 'resume', phase: 'VERIFY', options: [ANSWERS.resume, ANSWERS.startOver], reason: 'verify-2 FAIL after the fix round: Verdict: FAIL', ...extra });
  const lint = { ...base, kind: 'plan-lint', options: [ANSWERS.approvePlan, ANSWERS.replan] };
  const review = (categories, fixRounds = 0) => ({ ...base, kind: 'audit', options: [ANSWERS.auditReal, ANSWERS.auditNotReal], categories, fixRounds });

  assert.equal(standingAnswer(resume(), [], 2), null, 'a stop the driver did not mark technical stays a question');
  assert.equal(standingAnswer(resume({ technical: true }), [], 2), ANSWERS.resume);
  assert.equal(standingAnswer(resume({ reason: 'budget: build-1 hit wall clock' }), [], 2), ANSWERS.resume, 'the listed reasons, as before');
  assert.equal(standingAnswer(lint, [], 2), ANSWERS.replan);
  assert.equal(standingAnswer(review(['stand-in', 'cannot-fail']), [], 2), ANSWERS.auditReal, 'a reviewer\'s finding is treated as real');
  assert.equal(standingAnswer(review(['stand-in', 'never-ran-real']), [], 2), null, 'a paid service never really called is the owner\'s');
  assert.equal(standingAnswer(review(['stand-in'], 1), [], 2), null, 'the one repair is spent: nothing to do without asking');
  assert.equal(standingAnswer({ ...review(['stand-in']), categories: undefined }, [], 2), null, 'a gate from an earlier driver names no categories');
  for (const kind of ['human-check', 'deferral', 'amendment', 'unmatched', 'preflight']) assert.equal(standingAnswer({ ...base, kind, technical: true, phase: 'VERIFY', options: [ANSWERS.resume, 'x'] }, [], 2), null, kind);
  assert.equal(standingCovers(lint, [], 2), true);

  // One count for the epic, whatever was answered.
  const earlier = (answer) => ({ epic: 'a', kind: 'x', decided: { answer, standing: true, used: { run: 'r' } } });
  const two = [earlier(ANSWERS.resume), earlier(ANSWERS.auditReal)];
  for (const g of [resume({ technical: true }), lint, review(['stand-in'])]) assert.equal(standingAnswer(g, two, 2), null, g.kind);
  assert.equal(standingAnswer(lint, [two[0]], 2), ANSWERS.replan);

  // At the limit (or with no standing answer) the owner gets one plain question; a gate that is theirs anyway does not.
  assert.deepEqual(atLimit(lint, two, 2), { answer: ANSWERS.replan, stops: 3 });
  assert.deepEqual(atLimit(resume({ technical: true }), [], 0), { answer: ANSWERS.resume, stops: 1 });
  assert.deepEqual(atLimit(review(['stand-in'], 1), [], 2), { answer: ANSWERS.startOver, stops: 1 }, 'the repair is spent: trying again means starting over');
  assert.equal(atLimit(lint, [], 2), null, 'within the count nothing is asked');
  assert.equal(atLimit(review(['never-ran-real']), two, 2), null);
  assert.equal(atLimit(resume({ reason: 'stopped by the STOP file during build-1' }), two, 2), null);
});

test('a reviewer\'s finding is repaired without asking; a paid service never really called still asks', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: canned('stand-in') });
  await p.go({ run: confirmRun(p, { autoContinue: 2 }) });
  assert.deepEqual([gateFile(p, E1.id).kind, gateFile(p, E1.id).categories, gateFile(p, E1.id).fixRounds], ['audit', ['stand-in'], 0]);

  const s = st(p);
  assert.deepEqual([s.next, s.waiting, s.autoContinue.map((g) => [g.file, g.kind, g.why])], ['continue', [], [[`gates/${E1.id}-1.json`, 'audit', 'the independent reviewer found a serious problem']]]);
  const c = cont(p);
  assert.equal(c.status, 0, c.stderr);
  assert.deepEqual(c.json().continued.map((x) => [x.answer, x.did, x.enters, x.standingAnswers]), [[ANSWERS.auditReal, 'had what the reviewer found repaired', 'FIX_BUILD', 1]]);
  assert.deepEqual([gateFile(p, E1.id).decided.answer, gateFile(p, E1.id).decided.standing], [ANSWERS.auditReal, true]);

  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/live.js', content: 'export const live = true;\n' }, { do: 'commit', message: `feat(epic-${E1.id}): exercise the live path` }] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  assert.deepEqual(await relaunch(p), ['fix-1', 'audit-1', 'verify-1'].map((x) => `${E1.id}/${x}`));
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  const brief = fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8');
  assert.match(brief, /treated as real on the owner's standing answer/);
  assert.ok(!/confirmed they are real/.test(brief), 'nobody confirmed anything');
  // The closing screen says what was decided in the owner's name.
  assert.deepEqual(st(p, '--queue', E1.id).decidedForYou.map((d) => [d.label, d.did, d.why]), [[LABEL, 'had what the reviewer found repaired', 'the independent reviewer found a serious problem']]);

  const q = makeProject(t);
  q.scenario({ ...happy(E1), [`${E1.id}/audit`]: canned('stand-in', 'never-ran-real') });
  await q.go({ run: confirmRun(q, { autoContinue: 2 }) });
  const s2 = st(q);
  assert.deepEqual([s2.next, s2.autoContinue, s2.waiting.map((g) => [g.kind, g.options ?? null])], ['decide', [], [['audit', null]]], 'their own question, as the gate asks it');
  assert.match(s2.waiting[0].question, /Are they real\?$/);
  assert.equal(cont(q).status, 1);
  assert.equal(gateFile(q, E1.id).decided, null);
});

test('the final check\'s own product fix is allowed without asking, and listed; a weakened test or a changed requirement in it is still refused', async (t) => {
  const TORQ = `${E1.tors[0]} is FAIL: no test mirrors the Then; the code itself looks right. Recommendation: Fix now — one small test. How to proceed?`;
  const TOROPTS = ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'];
  const fix = (extra = []) => ({ actions: [askTool(TORQ, TOROPTS), { do: 'checkout', name: E1.branch }, { do: 'write', path: 'test/then.test.js', content: "import test from 'node:test';\ntest('the Then holds', () => {});\n" }, { do: 'write', path: 'src/patch.js', content: 'export const patched = 1;\n' }, ...extra, { do: 'commit', message: `test(epic-${E1.id}): the test the requirement lacked` }, ...wrapupScript(E1, { counts: [1, 1, 0, 1, 0, 0] }).actions], result: { result: 'Verdict: PASS' } });

  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: fix() });
  await p.go({ run: confirmRun(p, { autoContinue: 2 }) });
  assert.deepEqual([p.epic(E1.id).state, gateFile(p, E1.id).approvesFix, gateFile(p, E1.id).technical], ['PARKED', true, true]);
  assert.equal(st(p).next, 'continue');
  assert.deepEqual(cont(p).json().continued.map((x) => [x.answer, x.did]), [[ANSWERS.resume, 'let the final check make its own fix and ran it again']]);
  p.scenario({ [`${E1.id}/verify`]: fix() });
  await relaunch(p);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual([e.fixedAtWrapup.files.sort(), e.fixedAtWrapup.approvedBy, !!e.fixedAtWrapup.auto], [['src/patch.js', 'test/then.test.js'], `gates/${E1.id}-1.json`, true]);
  // Nobody but the verifier judged this change: the owner is told which files.
  assert.deepEqual(st(p, '--queue', E1.id).fixes.map((f) => [f.label, f.files.sort(), f.auto]), [[LABEL, ['src/patch.js', 'test/then.test.js'], true]]);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Fixed during the final check without asking you, on your standing answer for technical stops \(`gates\/Lg1Csv7-1\.json`\): src\/patch\.js, test\/then\.test\.js\. Only the verifier checked this fix/);

  // The same stop, but the second final check also changes a requirement file and takes the checks out of a test.
  const q = makeProject(t);
  q.scenario({ ...happy(E1), [`${E1.id}/verify`]: fix() });
  await q.go({ run: confirmRun(q, { autoContinue: 2 }) });
  assert.equal(cont(q).status, 0);
  q.scenario({ [`${E1.id}/verify`]: fix([{ do: 'write', path: 'docs/requirements/note.md', content: 'changed\n' }, { do: 'exec', cmd: `sed -i.bak '/is met/d' test/${E1.slug}.test.js; rm -f test/${E1.slug}.test.js.bak` }]) });
  await relaunch(q);
  assert.equal(q.epic(E1.id).state, 'PARKED', q.epic(E1.id).reason);
  const evidence = readJson(q.dir(E1.id, 'check-verify-1.json')).checks.find((x) => x.name === 'verdict').evidence.join(' | ');
  assert.match(evidence, /changes a requirement file \(docs\/requirements\/note\.md\)/);
  assert.match(evidence, /removes checks from a test \(test\/csv-import\.test\.js\)/);
  assert.equal(git(q.clone, 'rev-parse', 'develop'), git(q.project, 'rev-parse', 'develop'), 'nothing merged');
});

test('at the limit the owner gets one plain question: "Try again" records the technical answer as theirs, "Leave it for now" records nothing', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: overBudget(E1) });
  await p.go({ run: confirmRun(p, { autoContinue: 0 }) });

  const s = st(p);
  assert.deepEqual([s.next, s.autoContinue], ['decide', []]);
  assert.deepEqual(s.waiting.map((g) => [g.file, g.question, g.options]), [[`gates/${E1.id}-1.json`, `${LABEL} has stopped 1 time for technical reasons (a step reached its limit). Try again, which costs more, or leave it for now?`, TRY]]);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /has stopped 1 time for technical reasons \(a step reached its limit\)\. Try again, which costs more, or leave it for now\? — NOT DECIDED\n  Options: "Try again", "Leave it for now"/);

  const leave = driver('decide', '--workspace', p.state, '--gate', `gates/${E1.id}-1.json`, '--answer', 'Leave it for now', '--by', 'Pat Owner');
  assert.equal(leave.status, 0, leave.stderr);
  assert.deepEqual([leave.json().effect, gateFile(p, E1.id).decided], ['none', null]);

  const again = driver('decide', '--workspace', p.state, '--gate', `gates/${E1.id}-1.json`, '--answer', 'Try again', '--by', 'Pat Owner');
  assert.equal(again.status, 0, again.stderr);
  assert.deepEqual([again.json().enters, gateFile(p, E1.id).decided.answer, gateFile(p, E1.id).decided.asked, gateFile(p, E1.id).decided.standing], ['BUILD', ANSWERS.resume, 'Try again', undefined]);

  // A question that is the owner's own never takes "Try again".
  const q = makeProject(t);
  q.scenario({ ...happy(E1), [`${E1.id}/audit`]: canned('never-ran-real') });
  await q.go({ run: confirmRun(q, { autoContinue: 0 }) });
  const no = driver('decide', '--workspace', q.state, '--gate', `gates/${E1.id}-1.json`, '--answer', 'Try again', '--by', 'Pat Owner');
  assert.notEqual(no.status, 0);
  assert.match(no.stderr, /is not one of this gate's options/);

  // A reviewer's finding when the one repair is spent: trying again is starting over, and the owner is asked first.
  const r = makeProject(t);
  const red = { actions: buildActions(E1, { testBody: " throw new Error('red'); " }), result: { total_cost_usd: 0.3 } };
  r.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: red, [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'write', path: `test/${E1.slug}.test.js`, content: `import test from 'node:test';\n${E1.tors.map((x) => `test('${x} is met', () => {});`).join('\n')}\n` }, { do: 'commit', message: `fix(epic-${E1.id}): green` }] }, [`${E1.id}/audit`]: canned('cannot-fail') });
  await r.go({ run: confirmRun(r, { autoContinue: 2 }) });
  const s3 = st(r);
  assert.deepEqual([s3.next, s3.waiting.map((g) => g.options)], ['decide', [TRY]]);
  const over = driver('decide', '--workspace', r.state, '--gate', `gates/${E1.id}-1.json`, '--answer', 'try again', '--by', 'Pat Owner');
  assert.equal(over.status, 0, over.stderr);
  assert.deepEqual([over.json().enters, gateFile(r, E1.id).decided.answer], ['PLAN (from scratch, on a fresh branch)', ANSWERS.startOver]);
});

test('a final check that still fails after its repair is repaired once more without asking, then asked at the limit', async (t) => {
  const p = makeProject(t);
  const fail = (words) => ({ actions: [], result: { result: `Verdict: FAIL\n${E1.tors[2]}: ${words}` } });
  const repair = (n) => ({ actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/fix.js', content: `export const fixed = ${n};\n` }, { do: 'commit', message: `fix(epic-${E1.id}): try ${n}` }] });
  p.scenario({ ...happy(E1), [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/verify-1`]: fail('trimmed'), [`${E1.id}/fix`]: repair(1), [`${E1.id}/verify-2`]: fail('still trimmed') });
  await p.go({ run: confirmRun(p, { autoContinue: 1 }) });
  assert.deepEqual([p.epic(E1.id).state, gateFile(p, E1.id).technical], ['PARKED', true]);
  assert.deepEqual(cont(p).json().continued.map((x) => [x.did, x.why, x.enters]), [['had it repaired once more', 'it did not pass its independent check, even after the one repair', 'FIX_BUILD']]);
  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: repair(2), [`${E1.id}/verify`]: fail('trimmed even now') });
  await relaunch(p);
  assert.equal(p.epic(E1.id).state, 'PARKED');

  const s = st(p);
  assert.deepEqual([s.next, s.waiting.map((g) => [g.file, g.options])], ['decide', [[`gates/${E1.id}-2.json`, TRY]]]);
  assert.match(s.waiting[0].question, /has stopped 2 times for technical reasons \(it did not pass its independent check, even after the one repair\)\. Try again, which costs more, or leave it for now\?$/);
  assert.equal(cont(p).status, 1);
});
