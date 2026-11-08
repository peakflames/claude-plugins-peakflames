import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, fx, ROOT, baseline } from '../helpers/run.mjs';

const V = 'scripts/validate.mjs';
const B = path.join(ROOT, 'docs', 'build', 'fixtures');

test('AC-CON-01: F0, F1 and neutral fixtures validate against all three v1 schemas', () => {
  const files = [
    path.join(B, 'F0', 'spine', 'beatgrid.json'), path.join(B, 'F0', 'plates.json'),
    path.join(B, 'F1', 'spine', 'manifest.json'), path.join(B, 'F1', 'plates.json'),
    fx('neutral-brief', 'spine', 'manifest.json'), fx('neutral-brief', 'plates.json'),
    fx('brand-min'),
  ];
  for (const f of files) {
    const r = run(V, [f]);
    assert.equal(r.code, 0, `${f}\n${r.stdout}${r.stderr}`);
  }
  const kinds = JSON.parse(run(V, ['--json', ...files]).stdout).map((x) => x.kind);
  assert.deepEqual([...new Set(kinds)].sort(), ['brand', 'plates', 'spine']);
});

test('AC-CON-02: six bad fixtures each fail and name the field', () => {
  const cases = {
    'missing-schemaVersion.manifest.json': 'schemaVersion',
    'schemaVersion-2.plates.json': 'schemaVersion',
    'negative-duration.manifest.json': 'beats[1].durationMs',
    'unknown-kind.plates.json': 'plates[0].kind',
    'plate-without-beat.plates.json': 'plates[1].beat',
    'brand-missing-tokens': 'tokens',
  };
  assert.equal(Object.keys(cases).length, 6);
  for (const [f, field] of Object.entries(cases)) {
    const r = run(V, [fx('bad', f)]);
    assert.equal(r.code, 1, `${f} exits 1`);
    assert.match(r.stdout, new RegExp(`^\\s+${field.replace(/[[\].]/g, '\\$&')}: `, 'm'), `${f} names ${field}:\n${r.stdout}`);
  }
});

test('AC-CON-03: legacy narration.json maps to a valid manifest keeping every legacy field', () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'pm-con03-')), 'manifest.json');
  const legacyPath = fx('legacy-narration.json');
  const r = run(V, ['--from-legacy', legacyPath, '--out', out]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const legacy = JSON.parse(readFileSync(legacyPath, 'utf8'));
  const m = JSON.parse(readFileSync(out, 'utf8'));
  for (const k of Object.keys(legacy)) if (k !== 'clips') assert.deepEqual(m[k], legacy[k], `top-level ${k} kept`);
  assert.equal(m.clips.length, legacy.clips.length);
  legacy.clips.forEach((c, i) => { for (const [k, v] of Object.entries(c)) assert.deepEqual(m.clips[i][k], v, `clip ${c.n}.${k} kept`); });
  assert.equal(run(V, [out]).code, 0, 'written manifest re-validates');
});

test('AC-BASE-02: validate baseline (help, version, bad input, no stack, no network)', (t) => {
  baseline(t, assert, V, {
    flags: ['--schema', '--from-legacy', '--out', '--json', '--quiet'],
    badArgs: [[], ['--nope'], ['does-not-exist.json'], ['--schema', 'bogus', 'x.json'], ['--out', 'x.json', 'y.json']],
  });
});

test('validate: cross-reference checks (not AC-bound)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pm-xref-'));
  const m = JSON.parse(readFileSync(fx('neutral-brief', 'spine', 'manifest.json'), 'utf8'));
  const check = (name, doc, re) => {
    const p = path.join(dir, name);
    writeFileSync(p, JSON.stringify(doc));
    const r = run(V, [p]);
    assert.equal(r.code, 1, name);
    assert.match(r.stdout, re, name);
  };
  const overlap = structuredClone(m); overlap.beats[1].startMs = 100;
  check('overlap.manifest.json', overlap, /beats\[1\]\.startMs: overlaps/);
  const badClip = structuredClone(m); badClip.clips[0].beat = 'nope';
  check('badclip.manifest.json', badClip, /clips\[0\]\.beat: references unknown beat/);
  const grid = structuredClone(m); grid.kind = 'beatgrid'; grid.bpm = 100;
  check('clips-in-grid.beatgrid.json', grid, /clips: must NOT have more than 0 items/);
  const outside = structuredClone(m); outside.clips[0].startMs = 5900;
  check('outside.manifest.json', outside, /clips\[0\]\.startMs: clip 1 .* is outside beat/);
  const unlisted = structuredClone(m); unlisted.beats[0].clipNs = [];
  check('unlisted.manifest.json', unlisted, /clips\[0\]\.beat: beat 'intro' does not list clip 1/);
  const noSpine = JSON.parse(readFileSync(fx('neutral-brief', 'plates.json'), 'utf8')); noSpine.spine = 'nope.json';
  check('nospine.plates.json', noSpine, /spine: file not found: nope\.json/);
  mkdirSync(path.join(dir, 'spine'));
  writeFileSync(path.join(dir, 'spine', 'manifest.json'), JSON.stringify(m));
  const plates = JSON.parse(readFileSync(fx('neutral-brief', 'plates.json'), 'utf8'));
  plates.plates[2].beat = 'missing';
  check('plates.json', plates, /plates\[2\]\.beat: beat 'missing' is not in/);
  const shifted = structuredClone(plates); shifted.plates[2].beat = 'tip'; shifted.plates[1].durationMs = 9000;
  check('shifted.plates.json', shifted, /plates\[1\]\.startMs: plate 'p2-why' .* is outside beat|plates\[2\]\.startMs: overlaps/);
  const rec = structuredClone(plates); rec.plates[2].beat = 'tip'; rec.plates[0].kind = 'live';
  check('rec.plates.json', rec, /plates\[0\].live: is required/);
  const stray = structuredClone(plates); stray.plates[2].beat = 'tip'; stray.plates[1].live = { storyboard: 's.mjs', viewport: '1280x720' };
  check('stray.plates.json', stray, /plates\[1\]\.live: is only allowed on plates of kind "live"/);
  const emptyGrid = JSON.parse(readFileSync(path.join(B, 'F0', 'spine', 'beatgrid.json'), 'utf8')); delete emptyGrid.beats[0].onScreenText;
  check('empty.beatgrid.json', emptyGrid, /beats\[0\]\.onScreenText: is required/);
  const pack = path.join(dir, 'pack'); cpSync(fx('brand-min'), pack, { recursive: true });
  writeFileSync(path.join(pack, 'tokens.css'), ':root{--color-bg:#000}\n');
  const r = run(V, [pack]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /tokens: tokens\.css does not define --color-fg/);
  assert.match(r.stdout, /defines no --ease-\* property/);
});
