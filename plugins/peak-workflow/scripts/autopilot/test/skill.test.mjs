// The autopilot skill's mechanics (autopilot-poc-plan.md §5.2, §10 P3), end to end against
// fake-claude: every command here is the one skills/autopilot/SKILL.md tells the session to run,
// and the launch line is taken from SKILL.md itself. What the skill says to the user is checked
// by the dry-run simulation plugins/peak-workflow/CLAUDE.md "Validating Changes" describes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR } from '../driver.mjs';
import { DRIVER, E1, FAKE, addEpic, alive, buildActions, git, happy, makeProject, planScript, readJson, waitFor, wrapupScript } from './helpers.mjs';

const SKILL = fs.readFileSync(path.join(PLUGIN_DIR, 'skills', 'autopilot', 'SKILL.md'), 'utf8');
const driver = (...args) => { const r = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' }); return { ...r, json: () => JSON.parse(r.stdout) }; };

/** The launch line from SKILL.md Step 3, with its placeholders filled as the skill fills them. */
function launchLine(stateDir) {
  const line = SKILL.split('\n').find((l) => l.trim().startsWith('nohup '));
  assert.ok(line, 'SKILL.md has a nohup launch line');
  let cmd = line.trim().replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_DIR).replaceAll('<launch.stateDir>', stateDir);
  if (process.platform !== 'darwin') cmd = cmd.replace('caffeinate -i ', ''); // as SKILL.md says for Linux and Windows
  return cmd;
}
async function launchAndWait(stateDir) {
  const r = spawnSync('sh', ['-c', launchLine(stateDir)], { stdio: 'ignore' });
  assert.equal(r.status, 0);
  const pid = await waitFor(() => readJson(path.join(stateDir, 'lock')).pid);
  await waitFor(() => !fs.existsSync(path.join(stateDir, 'lock')) && fs.existsSync(path.join(stateDir, 'report.md')), { timeoutMs: 60000 });
  await waitFor(() => !alive(pid));
}

test('SKILL.md: the launch appends to autopilot.log, runs detached, and the hard rules are stated', () => {
  const line = SKILL.split('\n').find((l) => l.trim().startsWith('nohup '));
  assert.match(line, /^\s*nohup caffeinate -i node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/autopilot\/driver\.mjs" run --state "<launch\.stateDir>" >> "<launch\.stateDir>\/autopilot\.log" 2>&1 &$/);
  assert.ok(!/[^>]> "<launch\.stateDir>\/autopilot\.log"/.test(SKILL), 'never a truncating redirect');
  for (const rule of ['never edits project code', 'never runs `/peak-workflow:start-epic` or `/peak-workflow:wrapup-epic`', 'never answers a gate', 'never picks among ready epics']) assert.ok(SKILL.includes(rule), rule);
  assert.match(SKILL, /preflight --project "<root>" --json/);
  assert.match(SKILL, /decided: \{answer, by, date, scope: "next-run"\}/);
  assert.match(SKILL, /^name: autopilot$/m);
});

test('readiness: preflight --json names the fresh state directory, the launch facts and scope flags; the bare seed is refused', (t) => {
  const p = makeProject(t);
  const net = addEpic(p.project, { id: 'Lg4Fx2q', slug: 'currency', name: 'Currency conversion', nn: '04' });
  const feature = path.join(p.project, 'docs', 'requirements', '04-currency.feature.md');
  fs.writeFileSync(feature, fs.readFileSync(feature, 'utf8').replace('Given the user passes', 'Given the rates server at https://rates.example.com is online\n    And the user passes'));
  git(p.project, 'commit', '-qam', 'docs: the rate comes from the network');
  fs.rmSync(path.join(p.state, 'config.json'));

  const r = driver('preflight', '--project', p.project, '--json');
  assert.equal(r.status, 0, r.stderr);
  const pre = r.json();
  assert.equal(pre.launch.ok, true);
  assert.equal(pre.launch.stateDir, p.state);
  assert.equal(pre.launch.integration, 'develop');
  assert.equal(pre.launch.lastRun, null);
  assert.equal(pre.launch.configFileExists, false);
  assert.equal(pre.launch.config.claudeBin, 'claude');
  assert.deepEqual(pre.epics.map((e) => [e.id, e.eligibility]), [[E1.id, 'eligible'], [net.id, 'eligible']]);
  assert.deepEqual(pre.epics[0].scopeFlags, []);
  assert.deepEqual(pre.epics[1].scopeFlags, [{ tor: net.tors[0], flags: ['network'] }]);
  assert.equal(git(p.project, 'status', '--porcelain'), '', 'readiness writes nothing');

  // The ledger seed as checked in is not a repository of its own: a real run refuses it.
  const seedCopy = path.join(p.tmp, 'bare-seed');
  fs.cpSync(p.project, seedCopy, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
  const bare = driver('preflight', '--project', seedCopy, '--json').json();
  assert.equal(bare.launch.ok, false);
  assert.match(bare.launch.refuse[0], /is not the root of a git repository with a develop, main or master branch/);
});

test('P3 exit: confirm writes config.json, the SKILL.md launch runs end to end, report presents it, a decided gate is replayed once in the next run', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categories', name: 'Categories', nn: '02' });
  const question = `${e2.tors[0]} cannot be fully met: the category list is not final. How to proceed?`;
  const ask = { do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, header: 'Deferral', multiSelect: false, options: ['Fix now', 'Defer', 'Stop'].map((label) => ({ label, description: '' })) }] } };
  p.scenario({ ...happy(E1), [`${e2.id}/plan`]: planScript(e2), [`${e2.id}/build`]: { actions: [ask, ...buildActions(e2)] }, [`${e2.id}/verify`]: wrapupScript(e2) });

  // Step 1 — readiness. The state directory holds only a pre-seeded config.json (the test double), no run.
  fs.writeFileSync(path.join(p.state, 'config.json'), JSON.stringify({ claudeBin: FAKE, diskFloorGb: 0, timing: { pollMs: 100, killGraceMs: 300, infraRetryMs: 0 } }));
  const pre = driver('preflight', '--project', p.project, '--json').json();
  assert.equal(pre.ok && pre.launch.ok, true, JSON.stringify(pre.launch.refuse));
  assert.equal(pre.launch.stateDir, p.state);
  assert.equal(pre.launch.configFileExists, true);
  assert.ok(pre.launch.warn.some((w) => w.includes('not the real `claude`')), 'a test double is called out at confirm');

  // Step 2 — confirm: the full eligible set in the order given; config.json keeps the keys it does not set.
  const queue = pre.epics.filter((e) => e.eligibility === 'eligible').map((e) => e.id);
  assert.deepEqual(queue, [E1.id, e2.id]);
  const write = (stateDir, extra = {}) => fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({ ...readJson(path.join(stateDir, 'config.json')), project: p.project, queue, explicit: [], testCommand: pre.testCommand, testDirs: pre.testDirs, endBy: pre.launch.config.endBy, runBudgetUsd: 80, ...extra }, null, 2));
  write(p.state);

  // Step 3 — launch, exactly as SKILL.md words it.
  await launchAndWait(p.state);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(p.epic(e2.id).state, 'PARKED');
  const log = fs.readFileSync(path.join(p.state, 'autopilot.log'), 'utf8');
  assert.match(log, /run .*: queue Lg1Csv7, Lg2Cat4/); // the driver's own first lines survive the redirect
  assert.match(log, /run ended: queue done/);

  // Step 4 — report: find the run, refresh, read, present.
  const found = driver('preflight', '--project', p.project, '--json').json().launch;
  assert.equal(found.lastRun.stateDir, p.state);
  assert.equal(found.lastRun.status, 'DONE');
  assert.equal(found.lastRun.undecidedGates, 1);
  assert.equal(found.lastRun.mergedWorkNotInProject, true);
  assert.equal(found.stateDir, `${p.project}.autopilot-2`, 'a new run gets a fresh state directory');
  assert.equal(driver('report', '--state', p.state).status, 0);
  const report = readJson(path.join(p.state, 'report.json'));
  assert.deepEqual(report.epics.map((e) => [e.id, e.outcome]), [[E1.id, 'MERGED'], [e2.id, 'PARKED']]);
  assert.match(report.next[0], /Decide 1 parked gate: `\/peak-workflow:autopilot report` \(Lg2Cat4\)/);
  const [gate] = report.gates;
  assert.deepEqual([gate.kind, gate.question, gate.options, gate.decided, gate.effect], ['deferral', question, ['Fix now', 'Defer', 'Stop'], null, 'next-run']);

  // Step 4.5 — the owner answers; the skill records exactly that.
  const decided = driver('decide', '--state', p.state, '--gate', gate.file, '--answer', 'Fix now', '--by', 'Pat Owner');
  assert.equal(decided.status, 0, decided.stderr);
  assert.equal(decided.json().effect, 'next-run');
  assert.deepEqual(readJson(path.join(p.state, gate.file)).decided, { answer: 'Fix now', by: 'Pat Owner', date: new Date().toISOString().slice(0, 10), scope: 'next-run' });

  // Step 4.6 — the fetch command from the report brings the merged work into the owner's repository.
  const fetch = report.next.find((n) => n.includes('git fetch')).split('\n')[1].trim();
  assert.equal(spawnSync('sh', ['-c', fetch], { cwd: p.project, encoding: 'utf8' }).status, 0);
  git(p.project, 'merge', '-q', '--ff-only', 'autopilot/develop');

  // The next run: a fresh state directory, the decided answer carried in and used once.
  const next = driver('preflight', '--project', p.project, '--json').json();
  assert.deepEqual(next.epics.map((e) => [e.id, e.eligibility]), [[E1.id, 'complete'], [e2.id, 'eligible']]);
  assert.equal(next.launch.carryGatesFrom, p.state);
  assert.ok(!next.launch.warn.some((w) => /undecided|not on develop/.test(w)), next.launch.warn.join(' | '));
  const state2 = next.launch.stateDir;
  // The settings confirmed last time (here, the test double) are offered for the new state directory.
  assert.equal(next.launch.configFileExists, false);
  assert.deepEqual(next.launch.carriedSettings, { claudeBin: FAKE, diskFloorGb: 0, timing: { pollMs: 100, killGraceMs: 300, infraRetryMs: 0 } });
  assert.equal(next.launch.config.claudeBin, FAKE);
  fs.mkdirSync(state2);
  fs.writeFileSync(path.join(state2, 'config.json'), JSON.stringify(next.launch.carriedSettings));
  queue.splice(0, queue.length, e2.id);
  write(state2, { carryGatesFrom: next.launch.carryGatesFrom });
  t.after(() => fs.rmSync(state2, { recursive: true, force: true }));
  await launchAndWait(state2);

  const run2 = readJson(path.join(state2, 'state.json'));
  assert.deepEqual(run2.queue.map((q) => [q.id, q.state]), [[e2.id, 'MERGED']]);
  const carried = readJson(path.join(state2, 'gates', path.basename(gate.file)));
  assert.equal(carried.decided.used.session, 'build-1');
  const answered = fs.readFileSync(path.join(state2, 'epics', e2.id, 'build-1', 'hooks.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((h) => h.rule === 'R8');
  assert.equal(answered.decision, 'answer');
  assert.match(answered.reason, /^answered from the owner's recorded decision: Fix now$/);
  const referee2 = readJson(path.join(state2, 'report.json')).referee;
  assert.deepEqual([referee2.gatesAnswered, referee2.ownerAnswers], [0, 1]); // never reported as a policy answer
  // The first run's gate is marked used as well, so nothing offers that answer again.
  assert.equal(readJson(path.join(p.state, gate.file)).decided.used.session, 'build-1');
  assert.equal(driver('preflight', '--project', p.project, '--json').json().launch.carryGatesFrom, null);
  assert.equal(git(p.project, 'status', '--porcelain'), '', 'the project is never written by a run');
});
