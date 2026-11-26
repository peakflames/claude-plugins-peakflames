// Sync with the project at run start (autopilot-poc-plan.md §10 P3.5 Part 3), against fake-claude:
// one test per row of the table — same, project ahead, clone ahead, diverged — plus the
// `preflight` gate, which only a fix in the project clears.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, PLUGIN_DIR, syncFacts } from '../driver.mjs';
import { DRIVER, E1, addEpic, git, happy, makeProject, readJson } from './helpers.mjs';

const cli = (...args) => spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });
const status = (p) => { const r = cli('status', '--project', p.project, '--json'); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
const preflight = (p) => JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
const tip = (repo, ref = 'develop') => git(repo, 'rev-parse', ref);
const audit = (category) => ({ result: { structured_output: { findings: [{ category, severity: 'high', evidence: 'x:1', explanation: 'canned' }], recommend: 'park', summary: 's' } } });
const E2 = { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' };
/** The owner brings the clone's merged work into the project with the report's own fetch command, fast-forward. */
function ownerFetches(p) {
  const fetch = readJson(path.join(p.runDir(), 'report.json')).fetch;
  assert.equal(spawnSync('sh', ['-c', fetch], { cwd: p.project }).status, 0);
  git(p.project, 'merge', '-q', '--ff-only', 'autopilot/develop');
}

test('sync, P == C: nothing moves; the clone is reused as it is', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, E2);
  p.scenario({ ...happy(E1), ...happy(e2) });
  await p.go({ queue: [E1.id] });
  assert.equal(readJson(path.join(p.runDir(), 'report.json')).workInProject, false);
  ownerFetches(p);
  // Once the work is in the project, a re-rendered report stops telling the owner to fetch it.
  assert.equal(cli('report', '--workspace', p.state).status, 0);
  const after = readJson(path.join(p.runDir(), 'report.json'));
  assert.equal(after.workInProject, true);
  assert.ok(!after.next.some((n) => /brings it into your project/.test(n)), after.next.join('\n'));
  assert.match(after.next.join('\n'), /The merged work \(Lg1Csv7\) is already in your project's `develop`: nothing to bring in\./);
  assert.match(after.tldr.join('\n'), /The finished work is already in your project/);
  const c = tip(p.clone);
  assert.deepEqual([preflight(p).launch.sync.state, tip(p.project)], ['same', c]);

  const s = await p.go({ queue: [e2.id] });

  assert.deepEqual([s.sync.state, s.startSha, s.queue[0].state], ['same', c, 'MERGED']);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /sync: develop is the same in the project and the clone/);
  assert.equal(git(p.clone, 'remote'), '', 'the fetch is by URL: the clone still has no remote');
});

test('sync, P ahead of C: the clone is fast-forwarded and the new work is built on; a parked branch that still merges cleanly keeps its decision', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, E2);
  p.scenario({ ...happy(E1), ...happy(e2), [`${e2.id}/audit`]: audit('stand-in') });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, p.epic(e2.id).state], ['MERGED', 'PARKED']);
  assert.equal(cli('decide', '--workspace', p.state, '--gate', `${e2.id}-1.json`, '--answer', ANSWERS.auditNotReal, '--by', 'Pat Owner').status, 0);

  // The owner brings the night's work in with a merge commit (this repository's convention), then plans a new epic by day.
  const fetch = readJson(path.join(p.runDir(), 'report.json')).fetch;
  assert.equal(spawnSync('sh', ['-c', fetch], { cwd: p.project }).status, 0);
  git(p.project, 'merge', '-q', '--no-ff', '-m', 'Merge autopilot/develop', 'autopilot/develop');
  const e6 = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  const P = tip(p.project); const C = tip(p.clone);
  assert.deepEqual(syncFacts(p.project, p.state, 'develop'), { state: 'project-ahead', projectTip: P, cloneTip: C, waiting: [] });
  const pre = preflight(p);
  assert.match(pre.launch.warn.join('\n'), /develop moved in the project since the last run; the run fast-forwards the clone to it first; a decision on a parked branch still holds if that branch merges cleanly/);
  assert.deepEqual(pre.launch.decidedGates.map((g) => [g.epic, g.state]), [[e2.id, 'resume']]);
  assert.match(pre.epics.find((e) => e.id === e2.id).reasons.join(' '), /resumes at VERIFY .*\(whether the branch still merges cleanly is checked when the run starts\)/);

  p.scenario({ [`${e2.id}/verify`]: happy(e2)[`${e2.id}/verify`], ...happy(e6) });
  const before = p.calls().length;
  const s = await p.go();

  assert.deepEqual([s.sync.state, s.startSha], ['project-ahead', P]);
  assert.ok(git(p.clone, 'log', '--format=%s', 'develop').includes(`docs: add epic ${e6.id}`));
  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[e2.id, 'MERGED'], [e6.id, 'MERGED']]);
  assert.deepEqual(p.steps().slice(before, before + 1), [`${e2.id}/verify-1`], 'the parked epic resumed; it was not rebuilt');
  assert.equal(p.epic(e2.id).voided, undefined);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /At the start the clone's develop was fast-forwarded to the project's/);
  assert.equal(tip(p.project), P, 'the project is only read');
});

test('sync, C ahead of P: the run builds on the clone; readiness reads the clone\'s statuses; the report repeats the fetch command and lists what waits', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, { ...E2, deps: [E1.id] });
  p.scenario({ ...happy(E1), ...happy(e2) });
  await p.go({ queue: [E1.id] });
  const P = tip(p.project);

  // Not fetched. Readiness sees E1 as merged in the clone, so its dependent is runnable, not blocked.
  const pre = preflight(p);
  assert.equal(pre.launch.sync.state, 'clone-ahead');
  assert.match(pre.launch.sync.waiting.join('\n'), /^[0-9a-f]+ Merge branch 'feature\/epic-Lg1Csv7-csv-import' into develop$/);
  assert.match(pre.launch.warn.join('\n'), /has merged work the project has not fetched yet; the run builds on top of it\. Waiting in the clone: .*Bring it in with: git fetch ".*clone" develop:autopilot\/develop/);
  assert.deepEqual(pre.epics.map((e) => [e.id, e.eligibility]), [[E1.id, 'complete'], [e2.id, 'eligible']]);
  assert.match(pre.epics[0].reasons[0], /already Complete in the autopilot clone/);

  const s = await p.go();

  assert.deepEqual([s.sync.state, s.queue.map((q) => [q.id, q.state])], ['clone-ahead', [[e2.id, 'MERGED']]]);
  assert.deepEqual(p.steps().slice(4).map((k) => k.split('/')[0]), [e2.id, e2.id, e2.id, e2.id], 'E1 is not built again');
  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.match(report.next.join('\n'), /bring in the merged work \(Lg2Cat4, and 1 commit from earlier runs still waiting in the clone\)\. Run `\/peak-workflow:autopilot`/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /this run built on top of it: [0-9a-f]+ Merge branch 'feature\/epic-Lg1Csv7-csv-import' into develop\./);
  assert.equal(tip(p.project), P, 'the project is never written');
  // One fetch brings both runs' work in.
  ownerFetches(p);
  assert.equal(preflight(p).launch.sync.state, 'same');
});

test('status names the finished epics that wait in the clone, for the status dashboard: clone ahead, diverged, while a driver runs, and none once fetched', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, { ...E2, deps: [E1.id] });
  p.scenario({ ...happy(E1), ...happy(e2) });
  await p.go({ queue: [E1.id] });
  const P = tip(p.project);
  const waits = (s) => [s.sync.state, s.sync.epics.map((e) => e.id)];

  // Clone ahead: E1 is Complete in the clone and Not Started in the project.
  const ahead = status(p);
  assert.deepEqual(waits(ahead), ['clone-ahead', [E1.id]]);
  assert.match(ahead.sync.epics[0].label, new RegExp(`^${E1.id} .*CSV import`));
  assert.equal(ahead.sync.fetch.length, 2);
  // The command exactly as skills/status/SKILL.md Step 0.6 writes it.
  const line = fs.readFileSync(path.join(PLUGIN_DIR, 'skills', 'status', 'SKILL.md'), 'utf8').match(/`(node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/autopilot\/driver\.mjs" status [^`]+)`/)?.[1];
  assert.ok(line, 'status SKILL.md names the driver status command');
  const r = spawnSync('sh', ['-c', line.replaceAll('${CLAUDE_PLUGIN_ROOT}', PLUGIN_DIR).replaceAll('<root>', p.project)], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout).sync.epics, ahead.sync.epics);

  // While a driver runs, the same facts, and no fetch to offer: the run is still writing the clone.
  fs.writeFileSync(path.join(p.state, 'lock'), JSON.stringify({ pid: process.pid }));
  const live = status(p);
  assert.deepEqual([live.next, ...waits(live), live.sync.fetch], ['attend', 'clone-ahead', [E1.id], []]);
  fs.rmSync(path.join(p.state, 'lock'));

  // Diverged: the owner committed by day; the finished epic still waits.
  fs.writeFileSync(path.join(p.project, 'NOTES.md'), 'a commit made by day\n');
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'docs: notes');
  assert.deepEqual(waits(status(p)), ['diverged', [E1.id]]);
  git(p.project, 'reset', '-q', '--hard', P);

  // Once fetched, nothing waits.
  git(p.project, 'fetch', '-q', p.clone, 'develop:autopilot/develop');
  git(p.project, 'merge', '-q', '--ff-only', 'autopilot/develop');
  assert.deepEqual(waits(status(p)), ['same', []]);
  assert.equal(fs.existsSync(path.join(p.state, 'lock')), false);
});

test('sync, diverged: readiness and the driver both refuse and print both tips; nothing is written', async (t) => {
  const p = makeProject(t);
  const e2 = addEpic(p.project, E2);
  p.scenario({ ...happy(E1), ...happy(e2) });
  await p.go({ queue: [E1.id] });
  fs.writeFileSync(path.join(p.project, 'NOTES.md'), 'a commit made by day, without fetching the night\'s work\n');
  git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'docs: notes');
  const P = tip(p.project); const C = tip(p.clone);
  const runs = fs.readdirSync(path.join(p.state, 'runs'));

  const pre = preflight(p);
  assert.equal(pre.launch.ok, false);
  assert.equal(pre.launch.sync.state, 'diverged');
  const both = new RegExp(`diverged on develop: the project is at ${P.slice(0, 12)} .*the clone at ${C.slice(0, 12)} .*git fetch ".*clone" develop:autopilot/develop\`, then merge \`autopilot/develop\` into develop`);
  assert.match(pre.launch.refuse.join('\n'), both);

  const calls = p.calls().length;
  await assert.rejects(p.go({ queue: [e2.id] }), both);
  const r = cli('run', '--workspace', p.state, '--allow-test-double', '--queue', e2.id);
  assert.equal(r.status, 2);
  assert.match(r.stderr, both);
  assert.deepEqual([p.calls().length, fs.readdirSync(path.join(p.state, 'runs')), tip(p.clone), fs.existsSync(path.join(p.state, 'lock'))], [calls, runs, C, false]);

  // The owner merges the night's work; the project is then ahead and the next run fast-forwards.
  git(p.project, 'fetch', '-q', p.clone, 'develop:autopilot/develop');
  git(p.project, 'merge', '-q', '--no-ff', '-m', 'Merge autopilot/develop', 'autopilot/develop');
  assert.equal(preflight(p).launch.sync.state, 'project-ahead');
  const s = await p.go({ queue: [e2.id] });
  assert.deepEqual([s.sync.state, s.queue[0].state, s.startSha], ['project-ahead', 'MERGED', tip(p.project)]);
});

test('values still to decide park nothing: the walking skeleton is told it settles them, the other epics run meanwhile; "none" is the all-clear (owner, 2026-11-25)', async (t) => {
  const p = makeProject(t);
  const dep = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02', deps: [E1.id] });
  const free = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  const md = path.join(p.project, 'CLAUDE.md');
  const original = fs.readFileSync(md, 'utf8');
  const read = (line) => {
    fs.writeFileSync(md, `${original}\n${line}\n`);
    return preflight(p).epics.filter((e) => [E1.id, dep.id, free.id].includes(e.id)).map((e) => [e.id, e.eligibility, e.reasons.filter((r) => /values to decide/.test(r))]);
  };
  for (const clear of ['**Not decided yet:** none', '**Not decided yet:** None.', '**Not decided yet:** nothing', '**Not decided yet:** n/a', '**Not decided yet:** —', '**Not decided yet:**', '**Not decided yet:** none — CI, database, and auth are all already decided and shipped', '**Not decided yet:** None: everything is chosen.', '**Not decided yet:** n/a - nothing left']) {
    assert.deepEqual(read(clear), [[E1.id, 'eligible', []], [dep.id, 'eligible', []], [free.id, 'eligible', []]], clear);
  }
  const skeleton = 'CLAUDE.md still has values to decide (TBD / Not decided yet): this epic, the walking skeleton, settles them; any that costs money or depends on your accounts is asked';
  const meanwhile = 'CLAUDE.md still has values to decide (TBD / Not decided yet): the walking skeleton settles them; this epic runs meanwhile and may not change them';
  for (const open of ['**Not decided yet:** database (default SQLite), CI', '**Not decided yet:** none of the hosting options', '**Not decided yet:** - database', '**Not decided yet:** nothing but the database', '**Hosting:** TBD — set by the walking-skeleton epic']) {
    assert.deepEqual(read(open), [[E1.id, 'eligible', [skeleton]], [dep.id, 'eligible', [meanwhile]], [free.id, 'eligible', [meanwhile]]], open);
  }
  // An epic that parks or is skipped for its own reason is not told it runs.
  const sc = path.join(p.project, 'docs', 'implementation-plan', 'status', `epic-${free.id}.md`);
  fs.writeFileSync(sc, fs.readFileSync(sc, 'utf8').replace(/^requirements: (.*)$/m, 'requirements: $1, TOR-01-Zz9Zz9Z'));
  assert.deepEqual(read('**Not decided yet:** CI').find(([id]) => id === free.id), [free.id, 'park', []]);
  // A skeleton already Complete left them: nobody is said to settle them.
  const s1 = path.join(p.project, 'docs', 'implementation-plan', 'status', `epic-${E1.id}.md`);
  fs.writeFileSync(s1, fs.readFileSync(s1, 'utf8').replace(/^status: .*$/m, 'status: Complete'));
  assert.deepEqual(read('**Not decided yet:** CI').find(([id]) => id === dep.id)[2], ['CLAUDE.md still has values to decide (TBD / Not decided yet): no epic in the plan is left to settle them, so a person must; this epic runs meanwhile and may not change them']);
});

test('preflight gate: not resumable — nothing to answer; it clears when the fix reaches the clone and preflight passes', async (t) => {
  const p = makeProject(t);
  // A requirements decision only the owner can make: the epic names a requirement that does not exist.
  const md = path.join(p.project, 'docs', 'implementation-plan', 'status', `epic-${E1.id}.md`);
  const original = fs.readFileSync(md, 'utf8');
  fs.writeFileSync(md, original.replace(/^requirements: (.*)$/m, 'requirements: $1, TOR-01-Zz9Zz9Z'));
  git(p.project, 'commit', '-qam', 'docs: an unknown requirement');
  p.scenario(happy(E1));
  await p.go();

  assert.deepEqual([p.epic(E1.id).state, p.calls().length], ['PARKED', 0]);
  const file = path.join(p.state, 'gates', `${E1.id}-1.json`);
  assert.deepEqual([readJson(file).kind, readJson(file).options], ['preflight', []]);
  const refused = cli('decide', '--workspace', p.state, '--gate', `${E1.id}-1.json`, '--answer', 'ok', '--by', 'Pat Owner');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /has no answer to record: the fix is in the project/);
  assert.match(readJson(path.join(p.runDir(), 'report.json')).next.join('\n'), /Something in the project stopped 1 epic before it started \(Lg1Csv7\); there is nothing to answer, and the reason is under "Per epic"\. Autopilot cannot repair this itself yet; it needs someone who maintains the code\./);
  assert.deepEqual(preflight(p).launch.openGates, [], 'not a gate that waits for an answer');

  // Still unfixed: it parks again, with a new note. Fixed in the project: the sync brings the fix in and the epic runs.
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  fs.writeFileSync(md, original);
  git(p.project, 'commit', '-qam', 'docs: the requirement fixed');
  const s = await p.go();

  assert.deepEqual([s.sync.state, p.epic(E1.id).state], ['project-ahead', 'MERGED']);
  for (const n of [1, 2]) assert.equal(readJson(path.join(p.state, 'gates', `${E1.id}-${n}.json`)).cleared.run, p.runName(), `gate ${n} is cleared`);
});
