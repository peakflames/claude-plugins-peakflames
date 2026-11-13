// The autopilot skill's mechanics (autopilot-poc-plan.md §5.2, §10 P3), end to end against
// fake-claude: every command here is the one skills/autopilot/SKILL.md tells the session to run,
// and the launch line is taken from SKILL.md itself. What the skill says to the user is checked
// by the dry-run simulation plugins/peak-workflow/CLAUDE.md "Validating Changes" describes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR, run } from '../driver.mjs';
import { DRIVER, E1, addEpic, alive, buildActions, git, happy, makeProject, planScript, readJson, waitFor, wrapupScript } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(PLUGIN_DIR, 'skills', 'autopilot', 'SKILL.md'), 'utf8');
const driver = (...args) => { const r = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' }); return { ...r, json: () => JSON.parse(r.stdout) }; };

/** The launch line from SKILL.md Step 3, with its placeholders filled from preflight's `launch` block, as the skill fills them. */
function launchLine(launch) {
  const line = SKILL.split('\n').find((l) => l.trim().startsWith('nohup '));
  assert.ok(line, 'SKILL.md has a nohup launch line');
  let cmd = line.trim().replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_DIR).replaceAll('<launch.workspace>', launch.workspace).replaceAll('<launch.runDir>', launch.runDir).replaceAll('<launch.run>', launch.run);
  assert.ok(!/<launch\./.test(cmd), cmd);
  if (process.platform !== 'darwin') cmd = cmd.replace('caffeinate -i ', ''); // as SKILL.md says for Linux and Windows
  return cmd;
}
async function launchAndWait(launch) {
  const r = spawnSync('sh', ['-c', launchLine(launch)], { stdio: 'ignore' });
  assert.equal(r.status, 0);
  const lock = path.join(launch.workspace, 'lock');
  const pid = await waitFor(() => readJson(lock).pid);
  await waitFor(() => !fs.existsSync(lock) && fs.existsSync(path.join(launch.runDir, 'report.md')), { timeoutMs: 60000 });
  await waitFor(() => !alive(pid));
}
/** SKILL.md Step 2 item 4: the run's config.json, and nothing else. */
function confirm(launch, project, queue, extra = {}) {
  fs.mkdirSync(launch.runDir, { recursive: true });
  fs.writeFileSync(path.join(launch.runDir, 'config.json'), JSON.stringify({ project, queue, explicit: [], endBy: launch.config.endBy, runBudgetUsd: 80, ...extra }, null, 2));
}
const preflight = (p, ...more) => driver('preflight', '--project', p.project, '--json', ...more).json();

test('SKILL.md: the launch names the workspace and the run, appends to the run\'s autopilot.log, and the hard rules are stated', () => {
  const line = SKILL.split('\n').find((l) => l.trim().startsWith('nohup '));
  assert.match(line, /^\s*nohup caffeinate -i node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/autopilot\/driver\.mjs" run --workspace "<launch\.workspace>" --run "<launch\.run>" >> "<launch\.runDir>\/autopilot\.log" 2>&1 &$/);
  assert.ok(!/[^>]> "<launch\.runDir>\/autopilot\.log"/.test(SKILL), 'never a truncating redirect');
  for (const rule of ['never edits project code', 'never runs `/peak-workflow:start-epic` or `/peak-workflow:wrapup-epic`', 'never answers a gate', 'never picks among ready epics']) assert.ok(SKILL.includes(rule), rule);
  // Rule 1 is one rule for every project file: a fix the skill named itself, approved as that exact change, and nothing else.
  for (const rule of ['A project fix it has named itself', 'the `**Tests:**` or `**Build:**` line', 'a `.gitignore` line', 'only after the owner approves that exact change through `AskUserQuestion`', 'Never unasked, never anything else']) assert.ok(SKILL.replace(/\s+/g, ' ').includes(rule), rule);
  // One short screen, and no question about a technical setting the run cannot work without.
  for (const rule of ['print **one short screen**', 'is saved without asking and reported in one line', 'Save `setup`, `readOnly` and `network` without asking', '**A `copy` file is the owner\'s call**', 'Run it without asking when no probe stands', '**Details, only when the owner asks**']) assert.ok(SKILL.replace(/\s+/g, ' ').includes(rule), rule);
  for (const cmd of ['--budget <step>.<key>=<value>', '--gate \'<command>\'', 'prepare --project "<root>" --probe']) assert.ok(SKILL.includes(cmd), cmd);
  assert.match(SKILL, /preflight --project "<root>" --json/);
  assert.match(SKILL, /decided: \{answer, by, date, scope: "next-run"\}/);
  assert.match(SKILL, /^name: autopilot$/m);
  // The per-run layout of P3 is gone from the skill.
  for (const old of ['stateDir', 'carryGatesFrom', 'carriedSettings', '<state>', '--state ']) assert.ok(!SKILL.includes(old), old);
});

test('readiness: preflight --json names the workspace, the new run, the launch facts and scope flags; the bare seed is refused', (t) => {
  const p = makeProject(t);
  const net = addEpic(p.project, { id: 'Lg4Fx2q', slug: 'currency', name: 'Currency conversion', nn: '04' });
  const feature = path.join(p.project, 'docs', 'requirements', '04-currency.feature.md');
  fs.writeFileSync(feature, fs.readFileSync(feature, 'utf8').replace('Given the user passes', 'Given the rates server at https://rates.example.com is online\n    And the user passes'));
  git(p.project, 'commit', '-qam', 'docs: the rate comes from the network');
  fs.rmSync(p.state, { recursive: true });

  const r = driver('preflight', '--project', p.project, '--json');
  assert.equal(r.status, 0, r.stderr);
  const pre = r.json();
  assert.equal(pre.launch.ok, true);
  assert.equal(pre.launch.workspace, p.state);
  assert.equal(pre.launch.clone, p.clone);
  assert.match(pre.launch.run, /^\d{8}-\d{6}$/);
  assert.equal(pre.launch.runDir, path.join(p.state, 'runs', pre.launch.run));
  assert.equal(pre.launch.integration, 'develop');
  assert.equal(pre.launch.lastRun, null);
  assert.deepEqual([pre.launch.runs, pre.launch.openGates, pre.launch.decidedGates], [[], [], []]);
  assert.equal(pre.launch.settingsFileExists, false);
  assert.equal(pre.launch.config.claudeBin, 'claude');
  assert.deepEqual(pre.epics.map((e) => [e.id, e.eligibility]), [[E1.id, 'eligible'], [net.id, 'eligible']]);
  assert.deepEqual(pre.epics[0].scopeFlags, []);
  assert.deepEqual(pre.epics[1].scopeFlags, [{ tor: net.tors[0], flags: ['network'] }]);
  assert.equal(git(p.project, 'status', '--porcelain'), '', 'readiness writes nothing');
  assert.ok(!fs.existsSync(p.state), 'not even the workspace');

  // The ledger seed as checked in is not a repository of its own: a real run refuses it.
  const seedCopy = path.join(p.tmp, 'bare-seed');
  fs.cpSync(p.project, seedCopy, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
  const bare = driver('preflight', '--project', seedCopy, '--json').json();
  assert.equal(bare.launch.ok, false);
  assert.match(bare.launch.refuse[0], /is not the root of a git repository with a develop, main or master branch/);
});

test('allowTestDouble: a claudeBin other than `claude` in settings.json is refused unless this run\'s config allows it', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));

  // Readiness refuses it, and names the way through; with the flag it is a warning.
  const pre = preflight(p);
  assert.equal(pre.launch.ok, false);
  assert.match(pre.launch.refuse.join('\n'), /claudeBin is .*fake-claude\.mjs, not the real `claude`: a test double runs only when the run's config\.json says "allowTestDouble": true/);
  const rehearsal = preflight(p, '--allow-test-double');
  assert.equal(rehearsal.launch.ok, true, rehearsal.launch.refuse.join('\n'));
  assert.ok(rehearsal.launch.warn.some((w) => /rehearsal against a test double/.test(w)));

  // The driver refuses too, whoever launches it: nothing is cloned and no session starts.
  const refused = driver('run', '--workspace', p.state);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /a test double runs only when/);
  await assert.rejects(run({ workspace: p.state }), /a test double runs only when/);
  assert.deepEqual([p.calls(), fs.existsSync(p.clone), fs.existsSync(path.join(p.state, 'runs'))], [[], false, false]);

  // A run whose own config says so uses it — and the next run does not inherit that.
  confirm(rehearsal.launch, p.project, [E1.id], { allowTestDouble: true });
  await launchAndWait(rehearsal.launch);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(readJson(path.join(p.runDir(), 'config.json')).allowTestDouble, true);
  assert.equal(readJson(path.join(p.state, 'settings.json')).allowTestDouble, undefined);
  assert.equal(preflight(p).launch.ok, false);
  await assert.rejects(run({ workspace: p.state }), /a test double runs only when/);
});

test('P3.5 Part 1: one workspace — two runs share one clone and one gates/, each run has its own directory and report', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categories', name: 'Categories', nn: '02' });
  const question = `${e2.tors[0]} cannot be fully met: the category list is not final. How to proceed?`;
  const ask = { do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, header: 'Deferral', multiSelect: false, options: ['Fix now', 'Defer', 'Stop'].map((label) => ({ label, description: '' })) }] } };
  p.scenario({ ...happy(E1), [`${e2.id}/plan`]: planScript(e2), [`${e2.id}/build`]: { actions: [ask, ...buildActions(e2)] }, [`${e2.id}/verify`]: wrapupScript(e2) });

  // Step 1 — readiness. The workspace holds only the owner's settings.json (here: the test double).
  const pre = preflight(p, '--allow-test-double');
  assert.equal(pre.ok && pre.launch.ok, true, JSON.stringify(pre.launch.refuse));
  assert.equal(pre.launch.settingsFileExists, true);

  // Step 2 — confirm: the full eligible set in the order given, written as this run's config.json.
  const queue = pre.epics.filter((e) => e.eligibility === 'eligible').map((e) => e.id);
  assert.deepEqual(queue, [E1.id, e2.id]);
  confirm(pre.launch, p.project, queue, { allowTestDouble: true });
  const settingsBefore = fs.readFileSync(path.join(p.state, 'settings.json'), 'utf8');

  // Step 3 — launch, exactly as SKILL.md words it.
  await launchAndWait(pre.launch);
  const run1 = pre.launch.runDir;
  assert.equal(p.runDir(), run1);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(p.epic(e2.id).state, 'PARKED');
  const log = fs.readFileSync(path.join(run1, 'autopilot.log'), 'utf8');
  assert.match(log, /run \d{8}-\d{6}: queue Lg1Csv7, Lg2Cat4/); // the driver's own first lines survive the redirect
  assert.match(log, /run ended: queue done/);
  assert.deepEqual(fs.readdirSync(p.state).sort(), ['clone', 'current', 'epics.json', 'gates', 'runs', 'settings.json']);
  assert.deepEqual(fs.readdirSync(run1).sort(), ['autopilot.log', 'config.json', 'epics', 'preflight.json', 'report.json', 'report.md', 'state.json']);
  assert.equal(fs.readFileSync(path.join(p.state, 'settings.json'), 'utf8'), settingsBefore, 'the driver never rewrites the owner\'s settings');
  const tip1 = git(p.clone, 'rev-parse', e2.branch);

  // Step 4 — report: find the run, refresh, read, present.
  const found = preflight(p, '--allow-test-double').launch;
  assert.deepEqual([found.lastRun.runDir, found.lastRun.status, found.runs.length], [run1, 'DONE', 1]);
  assert.deepEqual(found.openGates.map((g) => [g.file, g.epic, g.kind]), [[`gates/${e2.id}-1.json`, e2.id, 'deferral']]);
  assert.deepEqual([found.sync.state, found.sync.waiting.length], ['clone-ahead', 1]); // E1's merge, not fetched yet
  assert.equal(found.workspace, p.state, 'the next run uses the same workspace');
  assert.notEqual(found.runDir, run1);
  assert.equal(driver('report', '--workspace', p.state).status, 0);
  const report = readJson(path.join(run1, 'report.json'));
  assert.deepEqual(report.epics.map((e) => [e.id, e.outcome]), [[E1.id, 'MERGED'], [e2.id, 'PARKED']]);
  assert.match(report.next[0], /Answer 1 waiting question: `\/peak-workflow:autopilot report` \(Lg2Cat4\)/);
  const [gate] = report.gates;
  assert.deepEqual([gate.file, gate.kind, gate.question, gate.options, gate.decided, gate.run], [`gates/${e2.id}-1.json`, 'deferral', question, ['Fix now', 'Defer', 'Stop'], null, path.basename(run1)]);

  // Step 4.5 — the owner answers; the skill records exactly that.
  const decided = driver('decide', '--workspace', p.state, '--gate', gate.file, '--answer', 'Fix now', '--by', 'Pat Owner');
  assert.equal(decided.status, 0, decided.stderr);
  assert.deepEqual([decided.json().effect, decided.json().enters], ['resume', 'BUILD']);
  assert.deepEqual(readJson(path.join(p.state, gate.file)).decided, { answer: 'Fix now', by: 'Pat Owner', date: new Date().toISOString().slice(0, 10), scope: 'next-run' });

  // Step 4.6 — the fetch command from the report brings the merged work into the owner's repository.
  const fetch = readJson(path.join(run1, 'report.json')).next.find((n) => n.includes('git fetch')).split('\n')[1].trim();
  assert.equal(spawnSync('sh', ['-c', fetch], { cwd: p.project, encoding: 'utf8' }).status, 0);
  git(p.project, 'merge', '-q', '--ff-only', 'autopilot/develop');

  // The next run: the same workspace, clone and gates/; a new run directory.
  const next = preflight(p, '--allow-test-double');
  assert.deepEqual(next.epics.map((e) => [e.id, e.eligibility]), [[E1.id, 'complete'], [e2.id, 'eligible']]);
  assert.deepEqual([next.launch.openGates.length, next.launch.decidedGates.map((g) => [g.file, g.answer, g.state, g.enters])], [0, [[gate.file, 'Fix now', 'resume', 'BUILD']]]);
  assert.match(next.epics[1].reasons.join(' '), /resumes at BUILD on feature\/epic-Lg2Cat4-categories: you answered "Fix now" on gates\/Lg2Cat4-1\.json/);
  assert.ok(!next.launch.warn.some((w) => /wait for your decision/.test(w)), next.launch.warn.join(' | '));
  assert.equal(next.launch.sync.state, 'same'); // a fast-forward merge in the project leaves the decision valid
  confirm(next.launch, p.project, [e2.id], { allowTestDouble: true });
  const cloneGit = fs.statSync(path.join(p.clone, '.git')).ino;
  await launchAndWait(next.launch);

  const run2 = next.launch.runDir;
  assert.equal(p.runDir(), run2);
  assert.equal(fs.statSync(path.join(p.clone, '.git')).ino, cloneGit, 'the same clone, not a new one');
  assert.deepEqual(readJson(path.join(run2, 'state.json')).queue.map((q) => [q.id, q.state]), [[e2.id, 'MERGED']]);
  // The second run resumed the epic: its first session is the build that asked, not a new plan.
  assert.deepEqual(fs.readdirSync(path.join(run2, 'epics', e2.id)).filter((n) => /-\d+$/.test(n)).sort(), ['audit-1', 'build-1', 'verify-1']);
  assert.ok(git(p.clone, 'merge-base', '--is-ancestor', tip1, 'develop') === '', 'the work the first run left on the branch is what merged');
  // One gates/ for both runs: the first run's gate file is the one the second run used.
  assert.deepEqual(fs.readdirSync(path.join(p.state, 'gates')), [`${e2.id}-1.json`]);
  const used = readJson(path.join(p.state, gate.file));
  assert.deepEqual([used.run, used.decided.used.run, used.decided.used.session], [path.basename(run1), path.basename(run2), 'build-1']);
  const answered = fs.readFileSync(path.join(run2, 'epics', e2.id, 'build-1', 'hooks.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((h) => h.rule === 'R8');
  assert.equal(answered.decision, 'answer');
  assert.match(answered.reason, /^answered from the owner's recorded decision: Fix now$/);
  const report2 = readJson(path.join(run2, 'report.json'));
  assert.deepEqual([report2.referee.gatesAnswered, report2.referee.ownerAnswers], [0, 1]); // never reported as a policy answer
  assert.deepEqual(report2.gates.map((g) => [g.file, g.fromEarlierRun]), [[gate.file, true]]);
  // Each run keeps its own directory and report; nothing offers that answer again.
  assert.deepEqual(fs.readdirSync(path.join(p.state, 'runs')).sort(), [path.basename(run1), path.basename(run2)].sort());
  assert.deepEqual(readJson(path.join(run1, 'report.json')).epics.map((e) => e.outcome), ['MERGED', 'PARKED']);
  assert.deepEqual(preflight(p, '--allow-test-double').launch.decidedGates, []);
  assert.equal(git(p.project, 'status', '--porcelain'), '', 'the project is never written by a run');
});

test('the queue is remembered: readiness offers the last confirmed queue minus what finished, beside the full list', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categories', name: 'Categories', nn: '02' });
  const e3 = addEpic(p.project, { id: 'Lg3Rep6', slug: 'report', name: 'Report', nn: '03' });
  assert.equal(preflight(p, '--allow-test-double').launch.lastQueue, null, 'no run yet');

  // The owner cut the queue to two of three; one merged, the other parked (a budget stop, with a resume gate).
  p.scenario({ ...happy(E1), [`${e2.id}/plan`]: planScript(e2), [`${e2.id}/build`]: { actions: buildActions(e2), result: { subtype: 'error_max_turns', is_error: true } } });
  const first = preflight(p, '--allow-test-double');
  confirm(first.launch, p.project, [E1.id, e2.id], { allowTestDouble: true });
  await launchAndWait(first.launch);
  assert.deepEqual([p.epic(E1.id).state, p.epic(e2.id).state], ['MERGED', 'PARKED']);

  const next = preflight(p, '--allow-test-double');
  assert.deepEqual(next.launch.lastQueue, { run: first.launch.run, ids: [e2.id], labels: [`${e2.id} (${e2.slug}) — Categories`], finishedSince: [E1.id] });
  // A strict subset of what could run tonight: the skill asks which; the driver proposes nothing by itself.
  const eligible = next.epics.filter((e) => e.eligibility !== 'complete').map((e) => e.id);
  assert.deepEqual(eligible, [e2.id, e3.id]);
  assert.match(SKILL, /Same queue as last time \(<labels>\) or all <N> eligible epics\?/);
});
