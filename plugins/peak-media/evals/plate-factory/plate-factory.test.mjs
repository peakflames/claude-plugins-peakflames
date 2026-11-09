// plate-factory: transcript checker on synthetic sessions (AC-ORC-02..04, and the gate-order part of
// AC-ORC-01, which itself is the user's manual run), and retime-plates (AC-ORC-05, AC-BASE-13).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, baseline, ROOT } from '../helpers/run.mjs';
import { validateFile } from '../../lib/schemas.mjs';
import { loadTranscript, checkAll, checkGates, checkStoryboardFirst, checkSelfReview, checkRuntimesFirst } from './transcript.mjs';
import { fixtureFiles } from './fixtures/generate.mjs';

const HERE = path.join(ROOT, 'evals', 'plate-factory');
const CHECKER = 'evals/plate-factory/check-transcript.mjs';
const RETIME = 'skills/plate-factory/scripts/retime-plates.mjs';
const SPINE = 'skills/video-spine/scripts/spine.mjs';
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' };
const session = (name) => path.join(HERE, 'fixtures', name, 'session.jsonl');
const load = (name) => loadTranscript(session(name));
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const byId = (rs) => Object.fromEntries(rs.map((r) => [r.id, r]));

test('checker fixtures match generate.mjs (no hand edits, no real transcript)', () => {
  for (const [rel, content] of Object.entries(fixtureFiles())) {
    assert.equal(readFileSync(path.join(HERE, 'fixtures', rel), 'utf8'), content, `${rel} is stale — run node evals/plate-factory/fixtures/generate.mjs`);
  }
});

test('checker: the good run passes every rule; the CLI exits 0', () => {
  for (const r of checkAll(load('good'))) assert.ok(r.ok, `${r.id}: ${r.message}`);
  const cli = run(CHECKER, [session('good')]);
  assert.equal(cli.code, 0, cli.stdout + cli.stderr);
  assert.equal((cli.stdout.match(/^PASS {2}AC-ORC-0[1-4] /gm) ?? []).length, 4, cli.stdout);
});

test('checker: gate out of order fails the AC-ORC-01 gate check with its line, and nothing else', () => {
  const rs = byId(checkAll(load('bad-gate-order')));
  assert.equal(rs['AC-ORC-01'].ok, false);
  assert.match(rs['AC-ORC-01'].message, /gate 3 plates passed before gate 2 spine \(line \d+\)/);
  for (const id of ['AC-ORC-02', 'AC-ORC-03', 'AC-ORC-04']) assert.ok(rs[id].ok, `${id}: ${rs[id].message}`);
});

test('checker: gate lines are strict about names, results and the user being asked', () => {
  const ev = load('good');
  const mutate = (fn) => ev.map((e) => (e.kind === 'text' ? { ...e, text: fn(e.text) } : e));
  assert.match(checkGates(mutate((t) => t.replace('GATE 4 storyboard: APPROVED', 'GATE 4 storyboard: PASS'))).message, /gate 4 storyboard is a user gate/);
  assert.match(checkGates(mutate((t) => t.replace('GATE 6 build:', 'GATE 6 plates:'))).message, /gate 6 must be named 'build'/);
  assert.match(checkGates(mutate((t) => t.replace(/^GATE 7 .*$/m, ''))).message, /no passing gate line for gate\(s\) 7/);
  assert.match(checkGates(mutate((t) => t.replace('— out/final.mp4', '— done'))).message, /gate 9 export does not name out\/final\.mp4/);
  const noAsk = ev.filter((e) => !(e.kind === 'tool_use' && e.name === 'AskUserQuestion' && /Storyboard/.test(JSON.stringify(e.input))));
  noAsk.forEach((e, i) => { e.seq = i; });
  assert.match(checkGates(noAsk).message, /gate 4 storyboard APPROVED without an AskUserQuestion/);
  ev.forEach((e, i) => { e.seq = i; });
  // markdown dressing around a gate line is tolerated
  assert.ok(checkGates(mutate((t) => t.replace(/^(GATE 0 .*)$/m, '**$1**'))).ok);
});

test('AC-ORC-02: storyboard produced and approved before any plates/<id>/index.html is written (transcript check)', () => {
  const good = checkStoryboardFirst(load('good'));
  assert.ok(good.ok, good.message);
  assert.match(good.message, /storyboard produced \(line \d+\) and approved \(line \d+\) before the first plate write/);
  const bad = checkStoryboardFirst(load('bad-plate-before-approval'));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /plate written before the storyboard was approved .*Write plates\/p1-hook\/index\.html \(line \d+\)/);
  assert.ok(Number.isInteger(bad.line));
  // DEC-37: a render-plate call without --storyboard before approval also counts as writing a plate
  const ev = load('good');
  const at = ev.findIndex((e) => e.kind === 'text' && e.text.includes('GATE 4 storyboard: APPROVED'));
  const early = { ...ev[at - 1], kind: 'tool_use', name: 'Bash', input: { command: 'node /x/skills/video-plates/scripts/render-plate.mjs plates.json p1-hook' } };
  const ev2 = [...ev.slice(0, at), early, ...ev.slice(at)];
  ev2.forEach((e, i) => { e.seq = i; });
  assert.match(checkStoryboardFirst(ev2).message, /before the storyboard was approved .*render-plate/);
  // …but the --storyboard scaffold and a --help call do not
  const ev3 = [...ev.slice(0, at), { ...early, input: { command: 'node /x/render-plate.mjs plates.json --all --storyboard --rescaffold && node /x/render-plate.mjs --help' } }, ...ev.slice(at)];
  ev3.forEach((e, i) => { e.seq = i; });
  assert.ok(checkStoryboardFirst(ev3).ok);
  const cli = run(CHECKER, [session('bad-plate-before-approval')]);
  assert.equal(cli.code, 1);
  assert.match(cli.stdout, /^FAIL {2}AC-ORC-02 .*\(line \d+\)$/m);
});

test('AC-ORC-03: at most 3 self-review rounds per plate, then a separate reviewer Agent call (transcript check)', () => {
  const good = checkSelfReview(load('good'));
  assert.ok(good.ok, good.message);
  assert.match(good.message, /p1-hook×1, p2-table×2, p3-close×1 .*reviewer Agent at line \d+/);
  const four = checkSelfReview(load('bad-four-rounds'));
  assert.equal(four.ok, false);
  assert.match(four.message, /plate 'p2-table' has 4 self-review rounds \(max 3\): review\/p2-table-r4\.jpg \(line \d+\)/);
  const none = checkSelfReview(load('bad-no-reviewer'));
  assert.equal(none.ok, false);
  assert.match(none.message, /no separate reviewer Agent call/);
  for (const [name, id] of [['bad-four-rounds', 'AC-ORC-03'], ['bad-no-reviewer', 'AC-ORC-03']]) {
    const cli = run(CHECKER, [session(name)]);
    assert.equal(cli.code, 1);
    assert.match(cli.stdout, new RegExp(`^FAIL {2}${id} .*\\(line \\d+\\)$`, 'm'));
  }
  // the reviewer subagent's own Reads of sheets are not self-review rounds
  assert.ok(load('good').some((e) => e.src !== 'main' && e.kind === 'tool_use' && e.name === 'Read'), 'subagent transcript merged');
});

test('AC-ORC-04: runtimes.md is Read before the first plate is written (transcript check)', () => {
  const good = checkRuntimesFirst(load('good'));
  assert.ok(good.ok, good.message);
  const late = checkRuntimesFirst(load('bad-runtimes-late'));
  assert.equal(late.ok, false);
  assert.match(late.message, /first plate written before runtimes\.md was Read \(Read at line \d+\): .* \(line \d+\)/);
  const cli = run(CHECKER, [session('bad-runtimes-late')]);
  assert.equal(cli.code, 1);
  assert.match(cli.stdout, /^FAIL {2}AC-ORC-04 /m);
  // a subagent that writes a plate needs its own earlier Read
  const ev = load('good');
  const sub = { ...ev.at(-1), src: 'agent-x', sidechain: true, kind: 'tool_use', name: 'Write', input: { file_path: '/p/plates/p3-close/index.html' } };
  const ev2 = [...ev, sub];
  ev2.forEach((e, i) => { e.seq = i; });
  assert.match(checkRuntimesFirst(ev2).message, /subagent agent-x wrote a plate before runtimes\.md was Read/);
});

// ---- retime-plates ---------------------------------------------------------------------------

const scratchDirs = [];
const scratch = (prefix) => { const d = mkdtempSync(path.join(os.tmpdir(), prefix)); scratchDirs.push(d); return d; };
after(() => { for (const d of scratchDirs) rmSync(d, { recursive: true, force: true }); });

let spineDir; // an F1 spine from fake/tone (beats differ from the fixture plates.json's 20 s-era times)
before(() => {
  spineDir = scratch('pm-orc05-');
  copyFileSync(path.join(F1, 'brief.md'), path.join(spineDir, 'brief.md'));
  copyFileSync(path.join(F1, 'script.md'), path.join(spineDir, 'script.md'));
  const r = run(SPINE, ['--brief', path.join(spineDir, 'brief.md'), '--target-ms', '20000', '--tts-model', 'fake/tone', '--cache-dir', path.join(spineDir, 'cache')], { env: NO_KEY });
  assert.equal(r.code, 0, r.stderr + r.stdout);
});

/** A project folder with the given plate list next to the F1 spine. */
function project(mutate = (p) => p) {
  const dir = scratch('pm-orc05-p-');
  mkdirSync(path.join(dir, 'spine'));
  copyFileSync(path.join(spineDir, 'spine', 'manifest.json'), path.join(dir, 'spine', 'manifest.json'));
  const plan = readJson(path.join(F1, 'plates.json'));
  plan.brand = path.join(ROOT, 'brand-packs', 'default');
  writeFileSync(path.join(dir, 'plates.json'), JSON.stringify(mutate(plan), null, 2) + '\n');
  return path.join(dir, 'plates.json');
}

test('AC-ORC-05: retime-plates sets each plate to its spine beat, validates, and refuses anything but one plate per beat', async () => {
  const fixture = path.join(F1, 'plates.json');
  const before = readFileSync(fixture, 'utf8');
  const stale = readJson(fixture);
  const manifest = path.join(spineDir, 'spine', 'manifest.json');
  const beats = new Map(readJson(manifest).beats.map((b) => [b.id, b]));
  assert.ok(stale.plates.some((p) => p.startMs !== beats.get(p.beat).startMs || p.durationMs !== beats.get(p.beat).durationMs), 'fixture times are stale against the spine');

  // the F1 fixture itself, written elsewhere: times from the spine, paths rebased, fixture untouched
  const out = path.join(spineDir, 'plates.json');
  const r = run(RETIME, [fixture, '--spine', manifest, '-o', out]);
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /^PASS {2}retimed 3 plate\(s\) from manifest\.json \(3 changed\)/m);
  assert.equal(readFileSync(fixture, 'utf8'), before, 'fixture not modified');
  const got = readJson(out);
  for (const p of got.plates) {
    assert.equal(p.startMs, beats.get(p.beat).startMs, `${p.id} startMs`);
    assert.equal(p.durationMs, beats.get(p.beat).durationMs, `${p.id} durationMs`);
  }
  assert.equal(got.spine, 'spine/manifest.json');
  const v = await validateFile(out);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.deepEqual(v.warnings, [], 'brand path still resolves after the move');
  assert.equal(run(RETIME, [out, '--check']).code, 0, '--check passes once retimed');

  // in place, from plates.json's own "spine"; --check flags the stale copy first
  const inPlace = project();
  const chk = run(RETIME, [inPlace, '--check']);
  assert.equal(chk.code, 1);
  assert.match(chk.stdout, /^FAIL {2}3 of 3 plate\(s\) off their beat times/m);
  assert.equal(run(RETIME, [inPlace]).code, 0);
  assert.deepEqual(readJson(inPlace).plates.map((p) => [p.startMs, p.durationMs]), got.plates.map((p) => [p.startMs, p.durationMs]));
  assert.ok((await validateFile(inPlace)).ok);

  // not one plate per beat: one line naming the plate or beat, nothing written
  const cases = [
    ['missing beat', (p) => { p.plates = p.plates.filter((x) => x.beat !== 'close'); return p; }, /beat 'close' has no plate/],
    ['unknown beat', (p) => { p.plates[1].beat = 'table'; return p; }, /plate 'p2-table' names beat 'table', which is not in the spine/],
    ['two plates on one beat', (p) => { p.plates.push({ ...p.plates[1], id: 'p2b-table' }); return p; }, /beat 'compare' has 2 plates \(p2-table, p2b-table\)/],
  ];
  for (const [what, mutate, re] of cases) {
    const f = project(mutate);
    const was = readFileSync(f, 'utf8');
    const bad = run(RETIME, [f]);
    assert.equal(bad.code, 1, `${what}: exit 1`);
    const lines = bad.stderr.trim().split('\n');
    assert.equal(lines.length, 1, `${what}: one line: ${bad.stderr}`);
    assert.match(lines[0], re, what);
    assert.equal(readFileSync(f, 'utf8'), was, `${what}: nothing written`);
  }
});

test('AC-BASE-13: retime-plates --help/--version/bad input follow the baseline', (t) => {
  const tmp = scratch('pm-base13-');
  const notJson = path.join(tmp, 'plates.json');
  writeFileSync(notJson, '{ nope');
  const noSpine = project((p) => { p.spine = 'spine/beatgrid.json'; return p; }); // only manifest.json exists
  baseline(t, assert, RETIME, {
    flags: ['--out', '--spine', '--check', '--json'],
    badArgs: [[], ['--bogus'], [path.join(tmp, 'missing.json')], [notJson], [noSpine], [notJson, '--check', '--out', 'x.json'], [notJson, notJson]],
  });
  const r = run(RETIME, [noSpine]);
  assert.match(r.stderr, /spine not found: .*beatgrid\.json — the spine here is manifest\.json: pass --spine /, 'the error names the fix');
  assert.ok(!existsSync(path.join(tmp, 'x.json')));
});
