// plate-factory: transcript checker on synthetic sessions (AC-ORC-02..04, and the gate-order part of
// AC-ORC-01, which itself is the user's manual run), and retime-plates (AC-ORC-05, AC-BASE-13).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, baseline, ROOT } from '../helpers/run.mjs';
import { validateFile } from '../../lib/schemas.mjs';
import { loadTranscript, checkAll, checkGates, checkStoryboardFirst, checkSelfReview, checkRuntimesFirst, plateWrites, expandLoops, gateLines, GATES } from './transcript.mjs';
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

test('checker: legitimate variants pass every rule (head-bold gate lines; an errored sheet run retried; a redirected render; a for-loop over plates)', () => {
  for (const name of ['good-bold-head', 'good-retried-round', 'good-loop']) {
    for (const r of checkAll(load(name))) assert.ok(r.ok, `${name} ${r.id}: ${r.message}`);
    assert.equal(run(CHECKER, [session(name)]).code, 0, name);
  }
  assert.ok(load('good-bold-head').some((e) => e.kind === 'text' && /^\*\*GATE 4 storyboard: APPROVED\*\* — /m.test(e.text)), 'fixture really bolds only the head');
  assert.match(checkSelfReview(load('good-retried-round')).message, /p2-table×3/);
  const redirected = plateWrites(load('good-retried-round')).find((w) => / > out 2>&1/.test(w.event.input.command ?? ''));
  assert.deepEqual(redirected.plates, ['p2-table'], 'a redirect target is not a plate id');
  // round 3: a `for id in …; do render-plate … $id; contact-sheet …/$id.mp4 …; done` loop counts per plate
  assert.match(checkSelfReview(load('good-loop')).message, /p1-hook×1, p2-table×2, p3-close×1/);
  const loop = load('good-loop').find((e) => e.kind === 'tool_use' && /for id in p2-table p3-close/.test(e.input.command ?? ''));
  assert.ok(loop, 'fixture has the loop');
  assert.deepEqual(plateWrites([loop]).map((w) => w.plates), [['p2-table', 'p3-close']], 'the loop renders both plates');
  assert.equal(expandLoops('for id in a b; do echo $id ${id}; done'), 'echo a a\necho b b');
  assert.equal(expandLoops('for f in *.jpg; do echo $f; done'), 'for f in *.jpg; do echo $f; done', 'globs are left alone');
});

test('skill docs: every stage ends with its literal gate line, and SKILL.md makes them output-style proof', () => {
  const stages = readFileSync(path.join(ROOT, 'skills', 'plate-factory', 'references', 'stages.md'), 'utf8');
  const ends = [...stages.matchAll(/^End the stage with: `(GATE (\d+) ([a-z-]+): (APPROVED|PASS) — [^`]+)`/gm)];
  assert.deepEqual(ends.map((m) => [Number(m[2]), m[3], m[4]]), GATES.map(([name, kind], n) => [n, name, kind === 'user' ? 'APPROVED' : 'PASS']), 'one closing gate line per stage, in order, matching the checker');
  for (const m of ends) assert.equal(gateLines([{ kind: 'text', src: 'main', sidechain: false, text: m[1].replace(/<[^>]*>/g, 'x'), seq: 0 }]).length, 1, `checker reads: ${m[1]}`);
  const skill = readFileSync(path.join(ROOT, 'skills', 'plate-factory', 'SKILL.md'), 'utf8');
  assert.match(skill, /Every stage ends with its gate line/);
  assert.match(skill, /whatever output style/);
  for (const n of [0, 1, 3, 4, 8]) assert.match(stages, new RegExp(`## Stage ${n} [\\s\\S]*?\\*\\*Show:\\*\\*[\\s\\S]*?End the stage with: \`GATE ${n} `), `stage ${n} shows what is approved`);
  // round 4 (run 2): no stage starts before the previous gate line; stage 7 re-checks GATE 6;
  // gate 1 keeps the user's wording, proposes cold-read changes, and checks runtime before TTS
  assert.match(skill, /A stage may not begin until the previous stage's gate line has been written/);
  assert.match(stages, /A stage may not begin until the\s+previous stage's gate line has been written/);
  assert.match(stages, /## Stage 7 [^\n]*\n\n0\. \*\*First confirm `GATE 6 build: PASS — …` was written\.\*\*/);
  assert.match(skill, /The user's wording wins/);
  const stage1 = stages.slice(stages.indexOf('## Stage 1 '), stages.indexOf('## Stage 2 '));
  assert.match(stage1, /Don't apply its findings yourself/);
  assert.match(stage1, /original line and the proposed\s+line/);
  assert.match(stage1, /words × 60 ÷ 127 \+ 0\.5 s per beat/);
  assert.ok(stage1.indexOf('Runtime check, before any TTS') < stage1.indexOf('AskUserQuestion'), 'runtime is checked before the gate-1 question');
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
  // bold around a gate line is tolerated; a quoted, bulleted, inline-code or fenced one is not the gate
  assert.ok(checkGates(mutate((t) => t.replace(/^(GATE 0 .*)$/m, '**$1**'))).ok);
  for (const wrap of ['> $1', '- $1', '`$1`', '```\n$1\n```']) {
    assert.match(checkGates(mutate((t) => t.replace(/^(GATE 0 .*)$/m, wrap))).message, /no passing gate line for gate\(s\) 0/, wrap);
  }
});

test('AC-ORC-02: storyboard produced and approved before any plates/<id>/index.html is written (transcript check)', () => {
  const good = checkStoryboardFirst(load('good'));
  assert.ok(good.ok, good.message);
  assert.match(good.message, /storyboard produced \(line \d+\) and approved \(line \d+\) before the first plate write/);
  const bad = checkStoryboardFirst(load('bad-plate-before-approval'));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /plate written before the storyboard was approved.*Write plates\/p1-hook\/index\.html \(line \d+\)/);
  assert.ok(Number.isInteger(bad.line));
  // DEC-37: a render-plate call without --storyboard before approval also counts as writing a plate
  const ev = load('good');
  const at = ev.findIndex((e) => e.kind === 'text' && e.text.includes('GATE 4 storyboard: APPROVED'));
  const early = { ...ev[at - 1], kind: 'tool_use', name: 'Bash', input: { command: 'node /x/skills/video-plates/scripts/render-plate.mjs plates.json p1-hook' } };
  const ev2 = [...ev.slice(0, at), early, ...ev.slice(at)];
  ev2.forEach((e, i) => { e.seq = i; });
  assert.match(checkStoryboardFirst(ev2).message, /before the storyboard was approved.*render-plate/);
  // …but a --help call does not, and neither does the --storyboard scaffold
  const ev3 = [...ev.slice(0, at), { ...early, input: { command: 'node /x/render-plate.mjs --help' } }, ...ev.slice(at)];
  ev3.forEach((e, i) => { e.seq = i; });
  assert.ok(checkStoryboardFirst(ev3).ok);
  assert.deepEqual(plateWrites([{ ...early, input: { command: 'node /x/render-plate.mjs plates.json --all --storyboard --rescaffold' } }]), []);
  // round 1: more writers, the latest gate-4 state, and only real gate lines
  const cases = [
    ['bad-bare-render', /before the storyboard was approved: Bash render-plate\.mjs" plates\.json p1-hook \(line \d+\)/],
    ['bad-python-write', /before the storyboard was approved: Bash .*python3 -c .*\(line \d+\)/],
    ['bad-storyboard-reopened', /plate written while the storyboard was reopened .*Edit plates\/p3-close\/index\.html \(line \d+\)/],
    ['bad-quoted-gate', /plate written before the storyboard was approved: Edit plates\/p1-hook\/index\.html \(line \d+\)/],
    ['bad-unasked-gate', /had no AskUserQuestion since the storyboard opened, so it doesn't count: Edit plates\/p1-hook\/index\.html/],
  ];
  for (const [name, re] of cases) {
    const r = byId(checkAll(load(name)));
    assert.equal(r['AC-ORC-02'].ok, false, name);
    assert.match(r['AC-ORC-02'].message, re, name);
    for (const id of ['AC-ORC-03']) assert.ok(r[id].ok, `${name} ${id}: ${r[id].message}`);
  }
  // shell reads of a plate are not writes; shell writes are
  const bash = (command) => plateWrites([{ ...early, input: { command } }]).length;
  for (const c of ['cat plates/p1/index.html', 'grep -c tl plates/p1/index.html 2>/dev/null', 'wc -l plates/p1/index.html > /tmp/n']) assert.equal(bash(c), 0, c);
  for (const c of ['cat > plates/p1/index.html <<EOF\n<html>\nEOF', 'echo x >> plates/p1/index.html', 'tee plates/p1/index.html < a', 'cp t.html plates/p1/index.html',
    "sed -i '' s/a/b/ plates/p1/index.html", 'node -e "require(\'fs\').writeFileSync(\'plates/p1/index.html\', \'\')"', 'FOO=1 ./render-plate.mjs plates.json p1']) assert.equal(bash(c), 1, c);
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
  assert.match(four.message, /plate 'p2-table' has 4 self-review rounds before the reviewer \(max 3\): contact-sheet run #4 \(line \d+\)/);
  // round 1: a re-used sheet name is still a round; a rendered plate with no round fails
  const reused = checkSelfReview(load('bad-sheet-reused'));
  assert.equal(reused.ok, false);
  assert.match(reused.message, /plate 'p2-table' has 4 self-review rounds before the reviewer/);
  const zero = checkSelfReview(load('bad-plate-no-rounds'));
  assert.equal(zero.ok, false);
  assert.match(zero.message, /plate 'p3-close' was rendered but has no self-review round .* \(line \d+\)/);
  // sheets made after the reviewer (fix confirmations) are not rounds
  assert.match(good.message, /p2-table×2/);
  const none = checkSelfReview(load('bad-no-reviewer'));
  assert.equal(none.ok, false);
  assert.match(none.message, /no separate reviewer Agent call/);
  for (const [name, id] of [['bad-four-rounds', 'AC-ORC-03'], ['bad-no-reviewer', 'AC-ORC-03'], ['bad-sheet-reused', 'AC-ORC-03'], ['bad-plate-no-rounds', 'AC-ORC-03']]) {
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
  assert.match(r.stdout, /^PASS {2}retimed 3 plate\(s\) from \S*spine\/manifest\.json \(3 changed\) → \S*plates\.json$/m);
  assert.ok(r.stdout.includes(`from ${manifest} `), 'the --spine path is reported as given');
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

  // round 1: a project folder works; plates out of beat order get a warning on stderr and exit 0
  const folder = project();
  const fr = run(RETIME, [path.dirname(folder)]);
  assert.equal(fr.code, 0, fr.stderr);
  assert.ok(fr.stdout.trim().endsWith(`→ ${folder}`), `folder mode names the plates.json: ${fr.stdout}`);
  assert.deepEqual(readJson(folder).plates.map((p) => p.startMs), got.plates.map((p) => p.startMs));
  const swapped = project((p) => { [p.plates[0], p.plates[2]] = [p.plates[2], p.plates[0]]; return p; });
  const sw = run(RETIME, [swapped]);
  assert.equal(sw.code, 0, sw.stderr);
  assert.match(sw.stderr, /^retime-plates: warning: plates are not in beat order \('p2-table' on beat 'compare' is listed after 'p3-close' on beat 'close'\)/);
  assert.equal(sw.stderr.trim().split('\n').length, 1);
  assert.equal(run(RETIME, [path.dirname(folder)]).stderr, '', 'beat order: no warning');
});

test('AC-BASE-13: retime-plates --help/--version/bad input follow the baseline', (t) => {
  const tmp = scratch('pm-base13-');
  const notJson = path.join(tmp, 'plates.json');
  writeFileSync(notJson, '{ nope');
  const noSpine = project((p) => { p.spine = 'spine/beatgrid.json'; return p; }); // only manifest.json exists
  const emptyDir = scratch('pm-base13-dir-');
  baseline(t, assert, RETIME, {
    flags: ['--out', '--spine', '--check', '--json'],
    badArgs: [[], ['--bogus'], [path.join(tmp, 'missing.json')], [notJson], [noSpine], [notJson, '--check', '--out', 'x.json'], [notJson, notJson], [emptyDir]],
  });
  const r = run(RETIME, [noSpine]);
  assert.match(r.stderr, /spine not found: .*beatgrid\.json — the spine here is manifest\.json: pass --spine /, 'the error names the fix');
  assert.ok(!existsSync(path.join(tmp, 'x.json')));
  assert.match(run(RETIME, [emptyDir]).stderr, /is a folder with no plates\.json — pass the plates\.json path/);
  // round 2: -o into a missing folder is one line, before anything is printed; --spine is reported as given
  const missingOut = path.join(tmp, 'nope', 'plates.json');
  const mo = run(RETIME, [noSpine, '--spine', path.join(path.dirname(noSpine), 'spine', 'manifest.json'), '-o', missingOut]);
  assert.equal(mo.code, 1);
  assert.equal(mo.stdout, '', 'nothing printed before the error');
  assert.equal(mo.stderr.trim(), `retime-plates: cannot write ${missingOut}: folder ${path.dirname(missingOut)} does not exist — create it first`);
  const ns = run(RETIME, [noSpine, '--spine', 'nope/manifest.json']);
  assert.equal(ns.stderr.trim(), 'retime-plates: spine not found: nope/manifest.json — run the spine first (video-spine)');
});
