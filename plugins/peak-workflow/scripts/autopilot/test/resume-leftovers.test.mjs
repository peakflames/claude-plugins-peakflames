// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
// This file: "look": "after", files a session left behind, the usage limit. Shared helpers: resume-helpers.mjs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, continueRun, limitDecision, status, usageLimit } from '../driver.mjs';
import { activity, eventLine, plainReason } from '../attend.mjs';
import { DRIVER, E1, addEpic, alive, buildActions, buildScript, git, happy, makeProject, planScript, readJson, waitFor, wrapupScript } from './helpers.mjs';
import { cli, gate, decide, again, ask, finding, audit, merged, DEFERRAL, addLookEpic, buildWithManual, addScreenEpic } from './resume-helpers.mjs';

// ---- "look": "after" — a screens-only epic does not stop for the owner ---------------------------

test('with "look": "after", an epic that only has screens goes straight to the final check and is listed as merged without the owner\'s look', async (t) => {
  const p = makeProject(t, { config: { look: 'after' } });
  const { ui, build } = addScreenEpic(p);
  p.scenario({ [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: build, [`${ui.id}/verify`]: wrapupScript(ui) });
  await p.go({ queue: [ui.id] });
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${ui.id}/${s}`), 'no stop for a look');
  const e = p.epic(ui.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual(e.unlooked.pictures.map((x) => path.basename(x)), ['home.png']);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Merged without your look \("look": "after"\): 1 picture\(s\) of its screens are kept in /);
  const s = JSON.parse(cli('status', '--project', p.project, '--workspace', p.state, '--json').stdout);
  assert.deepEqual(s.unlooked.map((u) => [u.epic, u.pictures.length]), [[ui.id, 1]]);
});

test('with "look": "after", a run resumed after the driver was killed mid-review still keeps the screens for the owner', async (t) => {
  const p = makeProject(t, { config: { look: 'after' } });
  const { ui, build } = addScreenEpic(p);
  p.scenario({ [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: build, [`${ui.id}/audit-1`]: { actions: [{ do: 'hang' }] }, [`${ui.id}/verify`]: wrapupScript(ui) });
  const child = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--queue', ui.id, '--allow-test-double'], { stdio: 'ignore' });
  const exited = new Promise((r) => child.on('exit', r));
  const sessionPid = await waitFor(() => p.epic(ui.id)?.step?.name === 'audit-1' && p.epic(ui.id).step.pid);
  child.kill('SIGKILL');
  await exited;
  await p.go({ resume: true });
  assert.equal(alive(sessionPid), false);
  const e = p.epic(ui.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual(e.unlooked?.pictures.map((x) => path.basename(x)), ['home.png'], 'listed for the owner to see afterwards');
});

test("`configure --look after` writes the project setting; `before` removes it; anything else is refused; `--human-check` sets the look's run command", (t) => {
  const p = makeProject(t);
  const file = path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');
  assert.equal(cli('configure', '--project', p.project, '--look', 'after').status, 0);
  assert.equal(readJson(file).look, 'after');
  assert.match(cli('configure', '--project', p.project, '--look', 'never').stderr, /look is "before" or "after"/);
  // The look's run command: for every epic, for one, and removed again; other keys stay.
  const settingsFile = path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');
  assert.equal(cli('configure', '--project', p.project, '--human-check', 'bun run desktop -- samples/ledger').status, 0);
  assert.equal(cli('configure', '--project', p.project, '--human-check', 'Lg5Chr8=node bin/ledger.js chart').status, 0);
  assert.deepEqual(readJson(settingsFile).humanCheck, { '*': 'bun run desktop -- samples/ledger', Lg5Chr8: 'node bin/ledger.js chart' });
  assert.equal(readJson(settingsFile).look, 'after');
  assert.equal(cli('configure', '--project', p.project, '--human-check', 'Lg5Chr8=').status, 0);
  assert.equal(cli('configure', '--project', p.project, '--human-check', '').status, 0);
  assert.equal(readJson(settingsFile).humanCheck, undefined);
  assert.equal(cli('configure', '--project', p.project, '--look', 'before').status, 0);
  assert.equal(readJson(file).look, undefined);
});

test('turning "look": "after" on answers a look at screens that is already waiting: the next run goes to the final check', async (t) => {
  const p = makeProject(t);
  const { ui, build } = addScreenEpic(p);
  p.scenario({ [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: build });
  await p.go({ queue: [ui.id] });
  assert.equal(p.epic(ui.id).reason, 'human check needed before verify');
  const out = JSON.parse(cli('configure', '--project', p.project, '--workspace', p.state, '--look', 'after').stdout);
  assert.deepEqual(out.answered, [`${ui.id}-2.json`]);
  const g2 = gate(p, ui.id, 2);
  assert.deepEqual([g2.kind, g2.phase, g2.lookAfter, g2.decided.answer, g2.decided.by, gate(p, ui.id, 1).superseded.by], ['resume', 'VERIFY', true, ANSWERS.resume, '"look": "after" (project setting)', `gates/${ui.id}-2.json`]);
  p.scenario({ [`${ui.id}/verify`]: wrapupScript(ui) });
  const r = await again(p, { queue: [ui.id] });
  assert.deepEqual(r.steps, [`${ui.id}/verify-1`]);
  assert.equal(p.epic(ui.id).state, 'MERGED', p.epic(ui.id).reason);
  assert.equal(p.epic(ui.id).unlooked.pictures.length, 1);
});

test('"look": "after" never skips a requirement a person must observe', async (t) => {
  const p = makeProject(t, { config: { look: 'after' } });
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  assert.deepEqual([p.epic(e5.id).state, p.epic(e5.id).reason], ['PARKED', 'human check needed before verify']);
});

// ---- files a session left behind (issue #41 B15) and the branch a resumed epic starts on (B14) ----

const leftoverRefs = (p) => git(p.clone, 'for-each-ref', '--format=%(refname)', 'refs/autopilot/leftover/').split('\n').filter(Boolean);
/** Every file a set-aside ref holds: the changed tracked ones, and the untracked ones git keeps in the stash's third parent. */
const heldBy = (p, ref) => [
  ...git(p.clone, 'diff', '--name-only', `${ref}^1`, ref).split('\n'),
  ...git(p.clone, 'ls-tree', '-r', '--name-only', `${ref}^3`).split('\n'),
].filter(Boolean).sort();

test('files left in the clone do not stop a launch: they are set aside under refs/autopilot/leftover/, nothing is deleted, and the log and the report say so', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d) });
  const s1 = await p.go();
  assert.deepEqual(s1.queue.map((q) => q.state), ['PARKED', 'MERGED']);
  assert.equal(git(p.clone, 'branch', '--show-current'), 'develop');
  // What the reporter found: a scratch folder nobody committed, and a tracked file changed and left.
  fs.mkdirSync(path.join(p.clone, 'tmp_playwright'));
  fs.writeFileSync(path.join(p.clone, 'tmp_playwright', 'shot.txt'), 'a session left this\n');
  fs.appendFileSync(path.join(p.clone, 'README.md'), '\nleft half-edited\n');
  decide(p, E1.id, ANSWERS.auditNotReal);

  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  const refs = leftoverRefs(p);
  assert.equal(refs.length, 1);
  assert.match(refs[0], /^refs\/autopilot\/leftover\/develop-\d+$/);
  assert.deepEqual(heldBy(p, refs[0]), ['README.md', 'tmp_playwright/shot.txt']);
  assert.equal(git(p.clone, 'show', `${refs[0]}^3:tmp_playwright/shot.txt`), 'a session left this');
  assert.match(git(p.clone, 'show', `${refs[0]}:README.md`), /left half-edited/);
  assert.equal(git(p.clone, 'stash', 'list'), '', 'the stash list is not where it is kept');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`set aside 2 file\\(s\\) left uncommitted on develop \\(README\\.md, tmp_playwright/shot\\.txt\\); nothing is lost: they are kept at ${refs[0]}`));
  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.deepEqual(report.leftovers.map((l) => [l.branch, l.ref, l.files]), [['develop', refs[0], ['README.md', 'tmp_playwright/shot.txt']]]);
  assert.ok(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8').includes('Autopilot set aside 2 file(s) an earlier session left behind. Nothing is lost.'));
  assert.equal(r.state.stoppedBecause, 'queue done');
});

test('files an epic branch ignores are not set aside on the integration line, and a large set-aside keeps 50 names and a count', async (t) => {
  const p = makeProject(t);
  // develop does not ignore node_modules yet: the epic's own .gitignore adds it (a new project's first epic).
  const gi = path.join(p.project, '.gitignore');
  const full = fs.readFileSync(gi, 'utf8');
  fs.writeFileSync(gi, full.replace('node_modules/\n', ''));
  git(p.project, 'commit', '-qam', 'chore: no node_modules yet');
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  const s = { ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]), ...happy(d) };
  s[`${E1.id}/build`].actions.splice(-1, 0, { do: 'write', path: '.gitignore', content: full });
  p.scenario(s);
  const s1 = await p.go();
  assert.deepEqual(s1.queue.map((q) => q.state), ['PARKED', 'MERGED']);
  assert.equal(git(p.clone, 'branch', '--show-current'), 'develop');
  // What the build left in the clone: dependencies the branch ignores, and 60 scratch files nobody ignores.
  fs.mkdirSync(path.join(p.clone, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(p.clone, 'node_modules', 'x', 'index.js'), '// a dependency\n');
  // Readiness's proof sees the same: no leftover, and nothing deleted.
  const proof = JSON.parse(cli('prepare', '--project', p.project).stdout);
  assert.deepEqual([proof.ok, proof.leftovers], [true, []], JSON.stringify(proof.leftovers));
  assert.ok(fs.existsSync(path.join(p.clone, 'node_modules', 'x', 'index.js')), 'the proof leaves what the branch ignores');
  fs.mkdirSync(path.join(p.clone, 'scratch'));
  for (let i = 0; i < 60; i += 1) fs.writeFileSync(path.join(p.clone, 'scratch', `f${String(i).padStart(2, '0')}.txt`), `${i}\n`);
  decide(p, E1.id, ANSWERS.auditNotReal);
  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.ok(fs.existsSync(path.join(p.clone, 'node_modules', 'x', 'index.js')), 'what the branch ignores stays where it is');
  const refs = leftoverRefs(p);
  assert.equal(refs.length, 1);
  assert.ok(!heldBy(p, refs[0]).some((f) => f.startsWith('node_modules/')), 'node_modules is not set aside');
  assert.equal(heldBy(p, refs[0]).length, 60);
  const [left] = r.state.leftovers;
  assert.deepEqual([left.files.length, left.count, left.files[0], left.files[49]], [50, 60, 'scratch/f00.txt', 'scratch/f49.txt']);
  const log = fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8');
  assert.match(log, /set aside 60 file\(s\) left uncommitted on develop \(scratch\/f00\.txt, .*scratch\/f49\.txt and 10 more\)/);
  assert.ok(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8').includes('Autopilot set aside 60 file(s) an earlier session left behind. Nothing is lost.'));
});

test('an epic that stops away from its own branch with files left uncommitted does not stop the queue: they are set aside and the next epic runs', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  // The build wanders onto a branch of its own, leaves a scratch file there and asks: nothing commits it at the park.
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: { actions: [...buildActions(E1), { do: 'branch', name: 'spike/try-it' }, { do: 'write', path: 'tmp_playwright/shot.txt', content: 'a session left this\n' }, ask('Which rounding?', ['Half up', 'Half even'])] },
    ...happy(d),
  });

  const s = await p.go();

  assert.deepEqual(s.queue.map((q) => [q.id, q.state]), [[E1.id, 'PARKED'], [d.id, 'MERGED']]);
  assert.equal(s.stoppedBecause, 'queue done');
  const refs = leftoverRefs(p);
  assert.equal(refs.length, 1);
  assert.ok(refs[0].startsWith('refs/autopilot/leftover/spike/try-it-'), refs[0]);
  assert.equal(git(p.clone, 'show', `${refs[0]}^3:tmp_playwright/shot.txt`), 'a session left this');
  assert.deepEqual(s.leftovers.map((l) => [l.branch, l.files, l.why]), [['spike/try-it', ['tmp_playwright/shot.txt'], `when ${E1.id} parked off its branch`]]);
});

test('a resumed epic is put on its branch by the driver: a session that does not switch branches itself still commits to the epic branch (issue #41 B14)', async (t) => {
  const p = makeProject(t);
  const q = `${E1.tors[3]} cannot be fully met: amounts with three decimals. How to proceed?`;
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, DEFERRAL)] } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  decide(p, E1.id, 'Fix now');
  const developBefore = git(p.clone, 'rev-parse', 'develop');

  // The resumed session works where it is started: it never checks the epic branch out.
  const feat = `feat(epic-${E1.id}): implement ${E1.slug}`;
  p.scenario({ [`${E1.id}/build`]: { actions: [ask(q, DEFERRAL), { do: 'exec', cmd: 'git branch --show-current > "$AUTOPILOT_SCRATCH/started-on.txt"' }, ...buildActions(E1, { message: feat }).filter((a) => a.do !== 'branch')] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.equal(fs.readFileSync(p.dir(E1.id, 'build-1', 'scratch', 'started-on.txt'), 'utf8').trim(), E1.branch);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  // The build's commit reached develop through the epic's merge, not as a commit made on develop itself.
  const onDevelopItself = git(p.clone, 'log', '--first-parent', '--format=%s', `${developBefore}..develop`).split('\n');
  assert.ok(!onDevelopItself.includes(feat), onDevelopItself.join(' | '));
  assert.ok(git(p.clone, 'log', '--format=%s', `${developBefore}..develop`).split('\n').includes(feat));
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  assert.deepEqual(leftoverRefs(p), []);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`${E1.id}: checked out ${E1.branch} for its build session \\(the clone was on develop\\)`));
  assert.equal(r.state.stoppedBecause, 'queue done');
});

test('a stash a session leaves behind is kept under refs/autopilot/leftover/, out of the stash list, and the report says so (#46 item 9)', async (t) => {
  const p = makeProject(t);
  const b = buildScript(E1);
  b.actions.push({ do: 'write', path: 'notes/half-done.md', content: 'not finished\n' }, { do: 'exec', cmd: 'git stash push -q --include-untracked -m "session wip"' });
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: b });
  const s = await p.go();

  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(git(p.clone, 'stash', 'list'), '', 'the stash list is empty again');
  const refs = leftoverRefs(p);
  assert.equal(refs.length, 1, refs.join(' '));
  assert.match(refs[0], new RegExp(`^refs/autopilot/leftover/${E1.branch}-stash-\\d+-1$`));
  assert.equal(git(p.clone, 'show', `${refs[0]}^3:notes/half-done.md`), 'not finished');
  assert.deepEqual(s.leftovers.map((l) => [l.stash, l.ref, l.files]), [[true, refs[0], ['notes/half-done.md']]]);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /a session put work in a stash \(1 file\(s\): notes\/half-done\.md\) and did not restore it; nothing is lost/);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.ok(md.includes(`A session put work in a stash and did not restore it (${E1.id}'s build-1 put work in a stash and did not restore it); kept at \`${refs[0]}\``), md);
  assert.ok(!md.includes('Autopilot set aside'), 'a stash is not counted as files set aside');
});

/** A session script that writes autopilot's own record of a question: what hook R8 alone may write. */
const forge = (n, decided) => {
  const js = `const fs = require('fs'); fs.mkdirSync(process.env.AUTOPILOT_STATE + '/gates', { recursive: true }); const f = process.env.AUTOPILOT_STATE + '/gates/' + process.env.AUTOPILOT_EPIC + '-${n}.json'; const g = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { epic: process.env.AUTOPILOT_EPIC, kind: 'amendment', question: 'Amend it?', options: ['Amend the requirement', 'Stop'] }; fs.writeFileSync(f, JSON.stringify({ ...g, decided: ${JSON.stringify(decided)} }));`;
  return { do: 'exec', unchecked: 'forging a gate', cmd: `node -e "eval(Buffer.from('${Buffer.from(js).toString('base64')}', 'base64').toString())"` };
};

test('a session that writes its own answer into a new gate file has it moved to gates/.tampered/ and the epic parked as the owner\'s question', async (t) => {
  const p = makeProject(t);
  const b = buildScript(E1);
  b.actions.push(forge(1, { answer: 'Amend the requirement', by: 'Todd' }));
  p.scenario({ ...happy(E1), [`${E1.id}/build`]: b });
  await p.go();

  assert.equal(p.epic(E1.id).state, 'PARKED');
  const moved = fs.readdirSync(path.join(p.state, 'gates', '.tampered'));
  assert.ok(p.epic(E1.id).reason.includes(`A session changed autopilot's own record of a question (gates/.tampered/${moved[0]}); it was put back`), p.epic(E1.id).reason);
  assert.equal(moved.length, 1);
  assert.equal(readJson(path.join(p.state, 'gates', '.tampered', moved[0])).decided.by, 'Todd');
  const g = gate(p, E1.id, 1);
  assert.equal(g.kind, 'resume');
  assert.equal(g.decided, null, 'the faked answer is not the gate the owner is asked');
  assert.equal(g.technical, undefined, "the owner's question, never a technical stop");
  assert.deepEqual(g.tampered, [`gates/.tampered/${moved[0]}`]);
  assert.equal(git(p.clone, 'rev-parse', 'develop'), git(p.project, 'rev-parse', 'develop'), 'nothing reached develop');
});

test('a session that rewrites the owner\'s answer on an existing gate has it put back and the epic parked for the owner', async (t) => {
  const p = makeProject(t);
  const q = `${E1.tors[3]} cannot be fully met: amounts with three decimals. How to proceed?`;
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, DEFERRAL)] } });
  await p.go();
  decide(p, E1.id, 'Fix now');
  const before = gate(p, E1.id, 1);

  // The owner's answer is taken (the referee marks it used), then the session rewrites it.
  p.scenario({ [`${E1.id}/build`]: { actions: [ask(q, DEFERRAL), forge(1, { answer: 'Defer', by: 'Pat Owner', date: '2026-11-26' })] } });
  await again(p);

  assert.equal(p.epic(E1.id).state, 'PARKED');
  // Put back as it was before the session (the driver then marks it spent, as at any park after a resumed gate).
  const { used, ...answer } = gate(p, E1.id, 1).decided;
  assert.deepEqual(answer, before.decided);
  assert.ok(used, 'the driver marked it spent at the park');
  const g = gate(p, E1.id, 2);
  assert.equal(g.kind, 'resume');
  assert.deepEqual(g.tampered, [`gates/${E1.id}-1.json`]);
  assert.match(g.reason, new RegExp(`A session changed autopilot's own record of a question \\(gates/${E1.id}-1\\.json\\); it was put back`));
});

// ---- the owner's usage limit -------------------------------------------------------------------

/** What a real session sent when it reached the 5-hour limit (Pilot Light, 2026-11-23), part of the build done. */
const LIMIT_RESULT = { subtype: 'success', is_error: true, terminal_reason: 'api_error', api_error_status: 429, api_error: 'usage_limit_reached', result: "You've hit your 5-hour limit · resets 1pm (America/Detroit)", total_cost_usd: 0.5 };
const limitHit = (e, resetsAt, rateLimitType = 'five_hour') => ({
  actions: [...buildActions(e, { commit: false }), { do: 'emit', line: { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt, rateLimitType } } }],
  result: LIMIT_RESULT, exit: 1,
});
const LIMIT_TIMING = { timing: { pollMs: 100, killGraceMs: 300, infraRetryMs: 0, limitMarginMs: 0 } };

test('usageLimit reads the limit from what the session sent; anything else is not one', () => {
  const info = { status: 'rejected', resetsAt: 1795456800, rateLimitType: 'five_hour' };
  assert.deepEqual(usageLimit(LIMIT_RESULT, info), { kind: 'five_hour', words: '5-hour', resetsAt: 1795456800 });
  assert.deepEqual(usageLimit(LIMIT_RESULT, null), { kind: null, words: '', resetsAt: null }, 'the result alone says it; the reset time is not known');
  assert.deepEqual(usageLimit({ ...LIMIT_RESULT, api_error: null }, { ...info, rateLimitType: 'seven_day' }), { kind: 'seven_day', words: 'weekly', resetsAt: 1795456800 });
  assert.equal(usageLimit({ subtype: 'success', is_error: false }, null), null);
  assert.equal(usageLimit({ subtype: 'success', is_error: false }, { ...info, status: 'allowed' }), null);
  assert.equal(usageLimit({ subtype: 'success', is_error: true, api_error_status: 529, api_error: 'overloaded_error' }, null), null, 'an overloaded service is a technical error, not the owner\'s limit');
  assert.equal(usageLimit(null, null), null);
  // While the driver waits, `status` says so instead of naming the step it was on.
  // An hour from now can be tomorrow (run near midnight): then the day is named too.
  assert.match(activity({ limitWait: { until: new Date(Date.now() + 3600000).toISOString() }, queue: [{ id: 'x', state: 'BUILD', step: null }] }), /^waiting for your usage limit to reset \(it carries on at (?:[A-Z][a-z]+day )?\d{1,2}:\d{2} [AP]M\)$/);
});

test('limitDecision: wait until the reset, or stop when it is too far off, after the end time, or reached again too often', () => {
  const now = Date.parse('2026-11-23T15:00:00Z'); const timing = { limitMarginMs: 120000, limitRetryMs: 600000, limitWaitMaxMs: 6 * 3600000, limitWaitsMax: 3 };
  const at = (min) => Math.floor((now + min * 60000) / 1000);
  assert.deepEqual(limitDecision({ resetsAt: at(120), now, timing, waits: 0 }), { wait: true, until: now + 120 * 60000 + 120000 });
  assert.deepEqual(limitDecision({ resetsAt: null, now, timing, waits: 0 }), { wait: true, until: now + 600000 + 120000 }, 'no reset time: try again after a while');
  assert.deepEqual(limitDecision({ resetsAt: at(-5), now, timing, waits: 0 }), { wait: true, until: now + 120000 }, 'a reset already past waits only the margin');
  assert.match(limitDecision({ resetsAt: at(3 * 24 * 60), now, timing, waits: 0 }).stop, /^it resets .+, too long to wait$/);
  assert.match(limitDecision({ resetsAt: at(120), now, timing, waits: 0, endBy: new Date(now + 60 * 60000).toISOString() }).stop, /^it resets .+, after the run's end time$/);
  assert.equal(limitDecision({ resetsAt: at(120), now, timing, waits: 3 }).stop, 'it was reached again 3 times after waiting');
});

test('a usage limit is waited out and the same session carries on: not an infra error, no question, nothing lost', async (t) => {
  const p = makeProject(t, { config: LIMIT_TIMING });
  const resetsAt = Math.floor(Date.now() / 1000) + 2;
  p.scenario({ ...happy(E1), [`${E1.id}/build-1`]: limitHit(E1, resetsAt), [`${E1.id}/build-2`]: { actions: buildActions(E1) } });
  const started = Date.now();
  await p.go();

  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'build-2', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.ok(Date.now() - started >= 1000, 'it waited for the reset');
  const [b1, b2] = p.calls().filter((c) => c.kind === 'build');
  const flag = (c, name) => c.argv[c.argv.indexOf(name) + 1];
  assert.equal(flag(b2, '--resume'), flag(b1, '--session-id'), 'the interrupted session is resumed');
  assert.match(b2.prompt, /usage limit/);
  assert.deepEqual(e.sessions.slice(1, 3).map((x) => [x.name, x.outcome]), [['build-1', 'limit'], ['build-2', 'ok']]);
  assert.match(e.sessions[1].why, /^your 5-hour usage limit was reached; it resets /);
  const log = fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8');
  assert.doesNotMatch(log, /infra error/);
  assert.match(log, /usage limit was reached; it resets .*waiting until .* then carrying on/);
  const events = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const wait = events.find((x) => x.type === 'limit-wait');
  assert.equal(wait.limit, 'five_hour');
  assert.match(eventLine(wait), /^Paused: your 5-hour usage limit was reached\. It resets at .+; autopilot carries on then\.$/);
  assert.equal(eventLine(events.find((x) => x.type === 'limit-resume')), 'Your usage limit has reset; autopilot is carrying on.');
  assert.equal(fs.existsSync(path.join(p.state, 'gates')) ? fs.readdirSync(path.join(p.state, 'gates')).length : 0, 0);
  assert.equal(readJson(path.join(p.runDir(), 'state.json')).limitWait ?? null, null, 'nothing is left saying it waits');
});

test('a usage limit that resets too late stops the run: the epic parks with a question (not a technical stop) and the next run continues the build', async (t) => {
  const p = makeProject(t, { config: LIMIT_TIMING });
  const e2 = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02' });
  const resetsAt = Math.floor(Date.now() / 1000) + 3 * 24 * 3600;
  p.scenario({ ...happy(E1), ...happy(e2), [`${E1.id}/build-1`]: limitHit(E1, resetsAt, 'seven_day') });
  const s = await p.go({ queue: [E1.id, e2.id] });

  assert.deepEqual(p.steps(), ['plan-1', 'build-1'].map((x) => `${E1.id}/${x}`), 'nothing is retried, and no other epic starts');
  assert.match(s.stoppedBecause, /^usage limit: your weekly usage limit was reached; it resets .+, too long to wait$/);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.technical], ['resume', undefined], 'the standing answer for technical stops does not relaunch into the same limit');
  assert.match(g.reason, /^usage limit during build-1: your weekly usage limit was reached/);
  assert.equal(plainReason(g.reason), 'your Claude usage limit was reached');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /The run ended early: your weekly usage limit was reached; it resets/);

  // Answered "Resume": the cut-off build is continued by a build session, not judged as if it had finished.
  decide(p, E1.id, ANSWERS.resume);
  p.scenario({ ...happy(E1), ...happy(e2) });
  const r = await again(p, { queue: [E1.id] });
  assert.equal(r.steps[0], `${E1.id}/build-1`);
  assert.equal(p.epic(E1.id).state, 'MERGED');
});

test('checks that still fail after the repair on something running again cannot cure (scope): asked, not continued; the owner\'s "Resume" runs one more repair, briefed with them, and the epic merges (Pilot Light, 2026-11-27)', async (t) => {
  const p = makeProject(t, { config: { autoContinue: 2 } });
  const stray = { do: 'write', path: 'package-lock.json', content: '{ "lockfileVersion": 3 }\n' }; // a lockfile with no package.json change: out of scope
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: { actions: [...buildActions(E1, { commit: false }), stray, { do: 'commit', message: `feat(epic-${E1.id}): implement ${E1.slug}` }], result: { total_cost_usd: 0.3 } },
    [`${E1.id}/fix-1`]: { actions: [{ do: 'commit', message: `fix(epic-${E1.id}): try again` }] }, // leaves the stray file: the check fails the same way
    [`${E1.id}/verify`]: wrapupScript(E1),
  });
  await p.go();
  assert.match(p.epic(E1.id).reason, /^CHECK_BUILD still fails after the fix round \(scope\)/);
  // Running the same checks on the same branch fails the same way: the standing answer does not take it.
  const st = status(p.project, p.state);
  assert.equal(st.next, 'decide', JSON.stringify(st.autoContinue));
  assert.equal(continueRun(p.state, { by: 'Pat Owner' }).continued.length, 0); // writes the resume gate, answers nothing
  assert.equal(gate(p, E1.id).decided, null);
  assert.match(gate(p, E1.id).why, /"Resume from where it stopped" runs one more repair, told which checks fail/);

  decide(p, E1.id, ANSWERS.resume);
  // The next run's repair (its own fix-1) takes the stray file out.
  p.scenario({
    [`${E1.id}/fix-1`]: { actions: [{ do: 'rm', path: 'package-lock.json' }, { do: 'commit', message: `fix(epic-${E1.id}): drop the stray lockfile` }] },
    [`${E1.id}/verify`]: wrapupScript(E1),
  });
  const { steps } = await again(p);
  assert.deepEqual(steps.slice(0, 1), [`${E1.id}/fix-1`]);
  assert.match(fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8'), /still failed after the repair, and the owner \(Pat Owner\) asked for one more[\s\S]*\*\*scope\*\*.*package-lock\.json/);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
});
