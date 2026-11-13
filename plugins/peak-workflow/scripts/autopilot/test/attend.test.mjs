// Autopilot, attended: what a session that stays with a run reads and asks the driver —
// `watch` (the lines it relays), `status` (what to do next) and `continue` (the standing answer
// for technical stops). All against fake-claude.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, ensureResumeGates, gateReason, newRunName, standingCovers } from '../driver.mjs';
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
  assert.deepEqual(r.lines(), ['The last autopilot run has ended: 1 finished and merged. Spent $2.01 of $80.', 'RUN ENDED: everything queued was worked through. Spent $2.01.']);

  // --replay says the whole run again, from its first event; --once --after picks up where a caller left off.
  const replay = driver('watch', '--workspace', p.state, '--replay').lines();
  assert.deepEqual([replay[1], replay[2], replay.at(-2), replay.at(-1)], ['Autopilot started: 1 epic queued.', `Starting ${NAME}`, `Finished and merged: ${NAME} (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01.']);
  assert.equal(replay.filter((l) => /^RUN ENDED/.test(l)).length, 1);
  assert.deepEqual(driver('watch', '--workspace', p.state, '--once', '--after', '13').lines(), [`Finished and merged: ${NAME} (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01.']);

  // A run from before events existed is still read from its state; a workspace with no run says so.
  fs.rmSync(path.join(p.runDir(), 'events.jsonl'));
  assert.equal(driver('watch', '--workspace', p.state).lines().at(-1), 'RUN ENDED: everything queued was worked through. Spent $2.01.');
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
  const w = startWatch(p, '--replay');
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
  assert.match(late.lines()[0], new RegExp(`^Autopilot is running: now building ${NAME}, \\d+ min\\. Spent \\$0\\.40 of \\$80\\.$`));

  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  assert.equal(await w.done, 0);
  assert.equal(await late.done, 0);
  await waitFor(() => !alive(run.pid));
  const end = w.lines().slice(mid.length);
  assert.match(end[0], /^Build stopped, as you asked, after under a minute$/);
  assert.deepEqual(end.slice(1), [`Stopped: ${NAME} — you asked it to stop`, 'RUN ENDED: you asked it to stop. Spent $0.40.']);
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
  const all = driver('watch', '--workspace', p.state, '--once', '--replay', '--poll-ms', '40').lines().filter((l) => /^REFUSED/.test(l));
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

test('status.next: decide for a gate only the owner answers (a look, an audit finding); continue never touches one', async (t) => {
  const p = makeProject(t);
  const e5 = addEpic(p.project, { id: 'Lg5Chr8', slug: 'chart', name: 'Spending chart', nn: '05' });
  const feature = path.join(p.project, 'docs', 'requirements', '05-chart.feature.md');
  fs.writeFileSync(feature, fs.readFileSync(feature, 'utf8').replace(/^(Scenario: .*)$/m, '$1\n    # Verification: operator-observed'));
  git(p.project, 'commit', '-qam', 'docs: the chart is checked by a person');
  const manual = { actions: [...buildActions(e5, { commit: false }), { do: 'write', path: `test/${e5.slug}.test.js`, content: "import test from 'node:test';\ntest('the chart command exists', () => {});\n" }, { do: 'write', path: `tests/manual/${e5.tors[0]}.md`, content: `# Manual check — ${e5.tors[0]}\n\n1. Open chart.html\n` }, { do: 'commit', message: `feat(epic-${e5.id}): implement ${e5.slug}` }] };
  const finding = { category: 'stand-in', severity: 'high', evidence: 'test/x.test.js:1', explanation: 'a stand-in' };
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
  assert.deepEqual(c1.json(), { autoContinue: 2, continued: [{ gate: `gates/${E1.id}-1.json`, epic: E1.id, label: LABEL, why: 'a step reached its limit', enters: 'BUILD', standingAnswers: 1, of: 2 }], left: [] });
  assert.deepEqual(gateFile(p, E1.id).decided, { answer: ANSWERS.resume, by: 'Pat Owner', date: new Date().toISOString().slice(0, 10), scope: 'next-run', standing: true });

  // The run that continues it: named by status, with the same queue and what is left of the budget.
  const s2 = st(p);
  assert.deepEqual([s2.next, s2.why, s2.waiting, s2.autoContinue], ['readiness', 'a decided gate waits to be used', [], []]);
  assert.deepEqual(s2.relaunch.config, { project: p.project, queue: [E1.id], explicit: [], endBy: null, runBudgetUsd: 78.6, autoContinue: 2, continues: run1, allowTestDouble: true });
  const relaunch = async (s) => { confirmRun(p, s.relaunch.config, s.relaunch.run); const before = p.calls().length; await p.go({ run: s.relaunch.run }); return p.steps().slice(before); };
  assert.deepEqual(await relaunch(s2), [`${E1.id}/build-1`], 'the build is continued; nothing is planned again');
  assert.equal(readJson(path.join(p.runDir(), 'config.json')).continues, run1);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /decided "Resume from where it stopped" by Pat Owner on \d{4}-\d{2}-\d{2} \(their standing answer for technical stops, given at launch; nobody was asked again\)/);

  // Stopped the same way again: the second and last standing answer.
  const s3 = st(p);
  assert.deepEqual([s3.next, s3.autoContinue.map((g) => g.file), s3.spentUsd, s3.runBudgetUsd], ['continue', [`gates/${E1.id}-2.json`], 2.4, 80]);
  assert.deepEqual(driver('continue', '--workspace', p.state, '--json', '--by', 'Pat Owner').json().continued.map((c) => [c.gate, c.standingAnswers]), [[`gates/${E1.id}-2.json`, 2]]);
  await relaunch(st(p));

  // A third time: the owner is asked.
  const s4 = st(p);
  assert.deepEqual([s4.next, s4.autoContinue, s4.waiting.map((g) => g.file)], ['decide', [], [`gates/${E1.id}-3.json`]]);
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
