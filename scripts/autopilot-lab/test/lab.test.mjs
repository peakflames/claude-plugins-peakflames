// The lab's own tests. No model is called: the seeded project is checked as files, the oracle is
// run against the reference implementation, and `evaluate` is exercised on runs the real driver
// makes with fake-claude.
//   node --test scripts/autopilot-lab/test/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { preflight, defaultConfig, readEpics, run as drive } from '../../../plugins/peak-workflow/scripts/autopilot/driver.mjs';
import { FAKE, buildActions, git, planScript, readJson, wrapupScript } from '../../../plugins/peak-workflow/scripts/autopilot/test/helpers.mjs';
import { evaluate, expected, render, reset, scenario } from '../lab.mjs';

const LAB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = fs.readFileSync(path.join(LAB, 'reference', 'src', 'index.js'), 'utf8');
const IDS = ['Lg1Csv7', 'Lg2Cat4', 'Lg3Sum9', 'Lg6Cfg3', 'Lg4Fx2q', 'Lg5Chr8']; // phase and index order
const quiet = () => {};

function tmpdir(t) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-lab-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  return tmp;
}
/** A reset project with a workspace whose sessions are fake-claude, as the driver's own tests set one up. */
function rehearsal(t, run) {
  const tmp = tmpdir(t);
  const dir = path.join(tmp, 'ledger');
  const r = reset({ run, dir, out: quiet });
  fs.mkdirSync(r.workspace);
  fs.writeFileSync(path.join(r.workspace, 'settings.json'), JSON.stringify({ project: dir, claudeBin: FAKE, endBy: null, diskFloorGb: 0, timing: { pollMs: 100, killGraceMs: 300, infraRetryMs: 0 } }));
  process.env.FAKE_CLAUDE_LOG = path.join(tmp, 'fake.log');
  process.env.FAKE_CLAUDE_SCENARIO = path.join(tmp, 'scenario.json');
  const epics = Object.fromEntries(readEpics(dir).map((e) => [e.id, { id: e.id, slug: e.slug, branch: e.branch, tors: e.anchors }]));
  return { tmp, dir, ...r, epics, script: (s) => fs.writeFileSync(process.env.FAKE_CLAUDE_SCENARIO, JSON.stringify(s)), go: () => drive({ workspace: r.workspace, allowTestDouble: true, queue: r.queue }) };
}
const build = (e, extra = []) => ({ actions: [...buildActions(e, { commit: false }), ...extra, { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }], result: { total_cost_usd: 0.3 } });

test('reset: each scenario is a valid peak-workflow project with six epics, and the same bytes every time', (t) => {
  const tmp = tmpdir(t);
  for (const run of ['A', 'B', 'C']) {
    const a = reset({ run, dir: path.join(tmp, `${run}1`), out: quiet });
    const b = reset({ run, dir: path.join(tmp, `${run}2`), out: quiet });
    assert.equal(git(a.root, 'rev-parse', 'HEAD^{tree}'), git(b.root, 'rev-parse', 'HEAD^{tree}'), `run ${run}: two resets differ`);
    assert.equal(git(a.root, 'rev-parse', 'HEAD'), git(b.root, 'rev-parse', 'HEAD'), `run ${run}: the seed commit is not reproducible`);
    assert.deepEqual([git(a.root, 'branch', '--show-current'), git(a.root, 'status', '--porcelain'), git(a.root, 'remote')], ['develop', '', '']);
    assert.equal(a.baseGreen, run !== 'C');
    const pre = preflight(a.root, defaultConfig(a.root));
    assert.deepEqual([pre.ok, pre.refuse], [true, []]);
    assert.deepEqual(pre.epics.map((e) => e.id), IDS);
    assert.deepEqual(pre.epics.map((e) => e.eligibility), IDS.map(() => 'eligible'), JSON.stringify(pre.epics.map((e) => e.reasons)));
    assert.deepEqual(pre.epics.filter((e) => e.humanCheck).map((e) => e.id), ['Lg5Chr8']);
    assert.deepEqual(Object.fromEntries(pre.epics.map((e) => [e.id, e.deps])), { Lg1Csv7: [], Lg2Cat4: ['Lg1Csv7'], Lg3Sum9: ['Lg2Cat4'], Lg6Cfg3: [], Lg4Fx2q: ['Lg1Csv7'], Lg5Chr8: ['Lg3Sum9'] });
    // The planted traps are visible to the readiness review: the live rate and the ten-year ledger.
    const flags = Object.fromEntries(pre.epics.flatMap((e) => e.scopeFlags.map((f) => [f.tor, f.flags])));
    assert.ok(flags['TOR-04-Lv4Ft2q']?.includes('network'), JSON.stringify(flags));
    assert.ok(flags['TOR-03-Pf5Tn8k']?.includes('big data'), JSON.stringify(flags));
    // Every queued and expected epic exists; the oracle never reaches a seeded project.
    assert.deepEqual([...scenario(run).queue].sort(), [...IDS].sort());
    assert.deepEqual(Object.keys(expected(run).epics).sort(), [...IDS].sort());
    assert.equal(git(a.root, 'ls-files').split('\n').some((f) => /oracle|reference|expected|scenarios/.test(f)), false);
  }
  assert.throws(() => reset({ run: 'A', dir: path.join(tmp, 'A1'), out: quiet }), /already exists/);
  reset({ run: 'A', dir: path.join(tmp, 'A1'), force: true, out: quiet });
});

test('reset B: only E2\'s requirement differs from run A, and it now contradicts E1\'s verbatim rule', (t) => {
  const tmp = tmpdir(t);
  const a = reset({ run: 'A', dir: path.join(tmp, 'a'), out: quiet });
  const b = reset({ run: 'B', dir: path.join(tmp, 'b'), out: quiet });
  const diff = spawnSync('diff', ['-rq', '-x', '.git', a.root, b.root], { encoding: 'utf8' }).stdout.trim().split('\n');
  assert.equal(diff.length, 1, diff.join('\n'));
  assert.match(diff[0], /02-categorize\.feature\.md/);
  const text = fs.readFileSync(path.join(b.root, 'docs', 'requirements', '02-categorize.feature.md'), 'utf8');
  assert.match(text, /\[TOR-02-Ci4Ws7d\] The tool shall store every description upper-cased and trimmed/);
  assert.match(fs.readFileSync(path.join(b.root, 'docs', 'requirements', '01-import.feature.md'), 'utf8'), /\[TOR-01-Vp6Js1G\] The tool shall store each imported description verbatim/);
});

test('oracle: the reference implementation passes every oracle test, and the summed-refund variant fails only the weak-requirement one', (t) => {
  const tmp = tmpdir(t);
  const { root } = reset({ run: 'A', dir: path.join(tmp, 'ledger'), out: quiet });
  const env = { ...process.env, LEDGER_ROOT: root };
  delete env.NODE_TEST_CONTEXT;
  const files = fs.readdirSync(path.join(LAB, 'oracle')).filter((f) => f.endsWith('.test.mjs'));
  const oracle = () => files.filter((f) => spawnSync(process.execPath, ['--test', path.join(LAB, 'oracle', f)], { cwd: tmp, env, encoding: 'utf8' }).status !== 0);
  fs.writeFileSync(path.join(root, 'src', 'index.js'), REFERENCE);
  assert.deepEqual(oracle(), []);
  fs.writeFileSync(path.join(root, 'src', 'index.js'), WEAK);
  assert.deepEqual(oracle(), ['Lg3Sum9.refunds-net.test.mjs']);
  assert.deepEqual(expected('A').weakAc, ['Lg3Sum9.refunds-net.test.mjs']);
});
// What a build that follows TOR-03-Sm1Tb4f to the letter might do: add up the sizes of the amounts.
const WEAK = REFERENCE.replace("?? 0) + t.amountCents);", "?? 0) + Math.abs(t.amountCents));").replace('[category, -sum]', '[category, sum]');

test('evaluate A: a rehearsal that ends as the plan expects matches every outcome; the weak requirement is a finding, not a false merge', async (t) => {
  assert.notEqual(WEAK, REFERENCE);
  const p = rehearsal(t, 'A');
  const e = p.epics;
  const s = {};
  for (const x of Object.values(e)) { s[`${x.id}/plan`] = planScript(x); s[`${x.id}/build`] = build(x); s[`${x.id}/verify`] = wrapupScript(x); }
  s['Lg1Csv7/build'] = build(e.Lg1Csv7, [{ do: 'write', path: 'src/index.js', content: REFERENCE }]);
  s['Lg3Sum9/build'] = build(e.Lg3Sum9, [{ do: 'write', path: 'src/index.js', content: WEAK }]);
  s['Lg5Chr8/build'] = build(e.Lg5Chr8, [{ do: 'write', path: 'tests/manual/TOR-05-Ch3Lk2u.md', content: '# TOR-05-Ch3Lk2u\n\n1. Open chart.html in a browser.\n' }]);
  s['Lg4Fx2q/audit'] = { result: { total_cost_usd: 0.5, structured_output: { findings: [{ category: 'stand-in', severity: 'high', evidence: 'test/currency-conversion.test.js:1', explanation: 'the live fetch is replaced by a stub' }], recommend: 'park', summary: 'canned' } } };
  p.script(s);
  await p.go();

  const { result, file } = evaluate({ run: 'A', dir: p.dir, rehearsal: true });
  const text = render(result);
  assert.equal(result.pass, true, text);
  assert.deepEqual(Object.fromEntries(result.epics.map((x) => [x.id, x.outcome])), { Lg1Csv7: 'MERGED', Lg2Cat4: 'MERGED', Lg3Sum9: 'MERGED', Lg4Fx2q: 'PARKED', Lg6Cfg3: 'MERGED', Lg5Chr8: 'PARKED' });
  assert.deepEqual(result.metrics.unattendedCompletion, { matched: 6, of: 6 });
  assert.deepEqual(result.metrics.happyPathMerges, { merged: 4, of: 4 });
  assert.deepEqual(result.metrics.parkedCorrectly, { matched: 2, of: 2 });
  assert.deepEqual(result.metrics.falseMerges, []);
  assert.deepEqual(result.metrics.weakAcFindings, ['Lg3Sum9: Lg3Sum9.refunds-net.test.mjs']);
  assert.deepEqual(result.oracle.filter((o) => !o.ran).map((o) => o.epic), ['Lg4Fx2q', 'Lg5Chr8'], 'oracle tests of parked epics do not run');
  const chart = result.epics.find((x) => x.id === 'Lg5Chr8').tried[0].checks.find((c) => c.check === 'artifact');
  assert.match(chart.detail, /artifacts\/files\/chart\.html \(\d{3,} bytes\)/, 'the project settings\' humanCheck command drew the chart');
  assert.match(text, /WEAK {2}oracle Lg3Sum9\.refunds-net\.test\.mjs — the declared weak-requirement case/);
  assert.deepEqual(readJson(file).metrics, result.metrics);
  assert.equal(path.dirname(file), path.join(p.workspace, 'runs', result.run));

  // Without --rehearsal the same run is refused as evidence: a test double built it.
  const strict = evaluate({ run: 'A', dir: p.dir, out: path.join(p.tmp, 'strict.json') }).result;
  assert.equal(strict.pass, false);
  assert.deepEqual(strict.runChecks.filter((c) => !c.pass).map((c) => c.name), ['real sessions']);
});

test('evaluate A: a merge that loosened E1\'s test, an E4 that merged instead of parking and a broken dedupe are all reported', async (t) => {
  const p = rehearsal(t, 'A');
  const e = p.epics;
  const s = {};
  for (const x of Object.values(e)) { s[`${x.id}/plan`] = planScript(x); s[`${x.id}/build`] = build(x); s[`${x.id}/verify`] = wrapupScript(x); }
  // E1 merges an importer that never skips a duplicate: a false merge the oracle must catch.
  s['Lg1Csv7/build'] = build(e.Lg1Csv7, [{ do: 'write', path: 'src/index.js', content: REFERENCE.replace('if (seen.has(key(t))) { skipped += 1; continue; }', '') }]);
  // E2 edits E1's existing test and records a reason, so the driver lets it through.
  s['Lg2Cat4/build'] = build(e.Lg2Cat4, [{ do: 'write', path: 'test/csv-import.test.js', content: "import test from 'node:test';\ntest('loosened', () => {});\n" }, { do: 'write', path: '.autopilot/test-changes.jsonl', content: '{"path":"test/csv-import.test.js","reason":"descriptions are now normalised"}\n' }]);
  p.script(s);
  await p.go();

  const { result } = evaluate({ run: 'A', dir: p.dir, rehearsal: true });
  const text = render(result);
  assert.equal(result.pass, false, text);
  const by = Object.fromEntries(result.epics.map((x) => [x.id, x]));
  assert.deepEqual([by.Lg2Cat4.outcome, by.Lg2Cat4.matches], ['MERGED', false], text);
  assert.match(by.Lg2Cat4.tried[0].checks[0].detail, /test\/csv-import\.test\.js/);
  assert.deepEqual([by.Lg4Fx2q.outcome, by.Lg4Fx2q.matches], ['MERGED', false], 'E4 merged although the plan expects a park');
  assert.deepEqual(result.metrics.parkedCorrectly, { matched: 1, of: 2 });
  assert.ok(result.metrics.falseMerges.includes('Lg1Csv7: Lg1Csv7.import.test.mjs'), text);
  assert.match(text, /RESULT: differs from the expected outcomes/);
  if (process.env.LAB_SHOW) console.log(text);
});

test('evaluate C: a red base stops the run before any session, and that is the expected outcome', async (t) => {
  const p = rehearsal(t, 'C');
  p.script({});
  await p.go();
  assert.equal(fs.existsSync(process.env.FAKE_CLAUDE_LOG), false, 'no session was launched');
  const { result } = evaluate({ run: 'C', dir: p.dir, rehearsal: true });
  assert.equal(result.pass, true, render(result));
  assert.deepEqual([result.status, result.stoppedBecause], ['STOPPED', 'base red']);
  assert.deepEqual(result.epics.map((x) => x.outcome), IDS.map(() => 'NOT STARTED'));

  // The same run judged against run A's expectations differs on every epic.
  const asA = evaluate({ run: 'A', dir: p.dir, rehearsal: true, out: path.join(p.tmp, 'as-a.json') }).result;
  assert.equal(asA.pass, false);
  assert.deepEqual(asA.metrics.unattendedCompletion, { matched: 0, of: 6 });
});

test('evaluate: a directory with no run says what to do', (t) => {
  const tmp = tmpdir(t);
  reset({ run: 'A', dir: path.join(tmp, 'ledger'), out: quiet });
  assert.throws(() => evaluate({ run: 'A', dir: path.join(tmp, 'ledger') }), /holds no run: launch \/peak-workflow:autopilot/);
});

// ---- Scenario D: the `shelf` project ---------------------------------------------------------------

const SHELF_IDS = ['Sh1Add4', 'Sh2Pag6', 'Sh3Chr2', 'Sh4Cfg9'];
const SHELF_REF = path.join(LAB, 'reference-shelf', 'src');
const shelfFiles = (...names) => names.map((n) => ({ do: 'write', path: `src/${n}`, content: fs.readFileSync(path.join(SHELF_REF, n), 'utf8') }));
const ask = (question, options) => ({ do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, options: options.map((label) => ({ label })) }] } });

test('reset D: a separate four-epic project, valid, the same bytes every time, with two epics that park for a look', (t) => {
  const tmp = tmpdir(t);
  const a = reset({ run: 'D', dir: path.join(tmp, 'd1'), out: quiet });
  const b = reset({ run: 'D', dir: path.join(tmp, 'd2'), out: quiet });
  assert.equal(git(a.root, 'rev-parse', 'HEAD'), git(b.root, 'rev-parse', 'HEAD'));
  assert.deepEqual([git(a.root, 'branch', '--show-current'), git(a.root, 'status', '--porcelain'), a.baseGreen], ['develop', '', true]);
  const pre = preflight(a.root, defaultConfig(a.root));
  assert.deepEqual([pre.ok, pre.refuse], [true, []]);
  assert.deepEqual(pre.epics.map((e) => e.id), SHELF_IDS);
  assert.deepEqual(pre.epics.map((e) => e.eligibility), SHELF_IDS.map(() => 'eligible'), JSON.stringify(pre.epics.map((e) => e.reasons)));
  assert.deepEqual(pre.epics.filter((e) => e.humanCheck).map((e) => e.id), ['Sh2Pag6', 'Sh3Chr2']);
  assert.deepEqual(Object.fromEntries(pre.epics.map((e) => [e.id, e.deps])), { Sh1Add4: [], Sh2Pag6: ['Sh1Add4'], Sh3Chr2: ['Sh1Add4'], Sh4Cfg9: [] });
  assert.deepEqual(pre.epics.flatMap((e) => e.scopeFlags), [], 'no requirement reads as needing the network or big data');
  assert.deepEqual([...scenario('D').queue].sort(), [...SHELF_IDS].sort());
  assert.deepEqual(Object.keys(expected('D').epics).sort(), [...SHELF_IDS].sort());
  const files = git(a.root, 'ls-files').split('\n');
  assert.equal(files.some((f) => /oracle|reference|expected|scenarios|ledger/.test(f)), false, 'nothing of the lab or of the ledger project is in the seed');
  // The gap the "Fix now" path rests on: the ConOps covers a missing settings file, no requirement does.
  assert.match(fs.readFileSync(path.join(a.root, 'docs', 'product-vision-planning', 'concept-of-operations.md'), 'utf8'), /If the settings file is missing or correct the tool says the\s+settings are fine/);
  assert.doesNotMatch(fs.readFileSync(path.join(a.root, 'docs', 'requirements', '04-settings.feature.md'), 'utf8'), /missing|no settings file|does not exist/i);
});

test('oracle D: the reference passes every shelf oracle test; treating a missing settings file as an error fails only the declared gap', (t) => {
  const tmp = tmpdir(t);
  const { root } = reset({ run: 'D', dir: path.join(tmp, 'shelf'), out: quiet });
  fs.cpSync(SHELF_REF, path.join(root, 'src'), { recursive: true });
  const env = { ...process.env, SHELF_ROOT: root };
  delete env.NODE_TEST_CONTEXT;
  const dir = path.join(LAB, 'oracle-shelf');
  const oracle = () => fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).filter((f) => spawnSync(process.execPath, ['--test', path.join(dir, f)], { cwd: tmp, env, encoding: 'utf8' }).status !== 0);
  assert.deepEqual(oracle(), []);
  const config = path.join(root, 'src', 'commands', 'config.js');
  const strict = fs.readFileSync(config, 'utf8').replace(/if \(!fs\.existsSync\(file\)\) \{[^\n]+\n/, "if (!fs.existsSync(file)) return fail('not found. Create it or unset SHELFRC.');\n");
  assert.notEqual(strict, fs.readFileSync(config, 'utf8'));
  fs.writeFileSync(config, strict);
  assert.deepEqual(oracle(), ['Sh4Cfg9.missing-file.test.mjs']);
  assert.deepEqual(expected('D').weakAc, ['Sh4Cfg9.missing-file.test.mjs']);
});

test('evaluate D: the first launch merges E1, parks the two looks with their pages, and accepts E4 merged or parked at a verifier\'s question', async (t) => {
  const run1 = async (verifyE4) => {
    const p = rehearsal(t, 'D');
    const e = p.epics;
    const s = {};
    for (const x of Object.values(e)) { s[`${x.id}/plan`] = planScript(x); s[`${x.id}/build`] = build(x); s[`${x.id}/verify`] = wrapupScript(x); }
    s['Sh1Add4/build'] = build(e.Sh1Add4, shelfFiles('store.js', 'commands/add.js', 'commands/list.js', 'commands/finish.js'));
    s['Sh2Pag6/build'] = build(e.Sh2Pag6, [...shelfFiles('commands/page.js'), { do: 'write', path: 'tests/manual/TOR-02-Pg4Gl9v.md', content: '# TOR-02-Pg4Gl9v\n\n1. Open shelf.html in a browser.\n' }]);
    s['Sh3Chr2/build'] = build(e.Sh3Chr2, [...shelfFiles('commands/chart.js'), { do: 'write', path: 'tests/manual/TOR-03-Ch4Lk7z.md', content: '# TOR-03-Ch4Lk7z\n\n1. Open chart.html in a browser.\n' }]);
    s['Sh4Cfg9/build'] = build(e.Sh4Cfg9, shelfFiles('commands/config.js'));
    if (verifyE4) s['Sh4Cfg9/verify'] = verifyE4;
    p.script(s);
    await p.go();
    return evaluate({ run: 'D', dir: p.dir, rehearsal: true }).result;
  };

  const merged = await run1(null);
  assert.equal(merged.pass, true, render(merged));
  assert.deepEqual(Object.fromEntries(merged.epics.map((x) => [x.id, x.outcome])), { Sh1Add4: 'MERGED', Sh2Pag6: 'PARKED', Sh3Chr2: 'PARKED', Sh4Cfg9: 'MERGED' });
  assert.deepEqual(merged.metrics.parkedCorrectly, { matched: 2, of: 2 });
  assert.deepEqual(merged.metrics.falseMerges, []);
  const artifact = (id) => merged.epics.find((x) => x.id === id).tried[0].checks.find((c) => c.check === 'artifact').detail;
  assert.match(artifact('Sh2Pag6'), /artifacts\/files\/shelf\.html \(\d{3,} bytes\)/);
  assert.match(artifact('Sh3Chr2'), /artifacts\/files\/chart\.html \(\d{3,} bytes\)/);
  assert.deepEqual(merged.oracle.filter((o) => o.ran).map((o) => [o.file, o.pass]), [['Sh1Add4.list.test.mjs', true], ['Sh4Cfg9.config.test.mjs', true], ['Sh4Cfg9.missing-file.test.mjs', true]]);

  // The outcome that opens the "Fix now" path: the verifier asks a question of its own and E4 parks on it.
  const question = { actions: [ask('Code review: `shelf config` treats a missing settings file as an error, but ConOps S4 says a missing file is fine. No requirement covers it. How to proceed?', ['Fix now', 'Leave as is', 'Stop'])], result: { total_cost_usd: 0.9, result: 'Waiting for a decision.' } };
  const parked = await run1(question);
  assert.equal(parked.pass, true, render(parked));
  const e4 = parked.epics.find((x) => x.id === 'Sh4Cfg9');
  assert.equal(e4.outcome, 'PARKED');
  assert.match(e4.tried[0].checks[0].detail, /unmatched gate/);
});
