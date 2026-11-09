// video-plates: render-plate entry point (AC-BASE-08), F1 renders (AC-PLT-01), lint/check (AC-PLT-04).
// The default brand pack is WP5's; these evals use the minimal test pack via --brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, cpSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, baseline, ROOT, fx } from '../helpers/run.mjs';

const SCRIPT = 'skills/video-plates/scripts/render-plate.mjs';
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
const F2 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F2');
const BRAND = fx('brand-min');
const tmp = (p) => mkdtempSync(path.join(os.tmpdir(), `pm-plt-${p}-`));

/** A plates.json with one live plate next to a copy of F1's spine. */
function liveFixture() {
  const dir = tmp('live');
  mkdirSync(path.join(dir, 'spine'));
  cpSync(path.join(F1, 'spine', 'manifest.json'), path.join(dir, 'spine', 'manifest.json'));
  const plan = JSON.parse(readFileSync(path.join(F1, 'plates.json'), 'utf8'));
  plan.brand = BRAND;
  plan.plates[0] = { ...plan.plates[0], kind: 'live', live: { storyboard: 'storyboard.mjs', viewport: '1280x720' } };
  writeFileSync(path.join(dir, 'plates.json'), JSON.stringify(plan, null, 2));
  return path.join(dir, 'plates.json');
}

test('AC-BASE-08: render-plate --help/--version/bad input follow the baseline', (t) => {
  const f1 = path.join(F1, 'plates.json');
  const flags = ['--all', '--brand', '--out', '--sheet', '--every', '--lint', '--storyboard', '--scaffold-only', '--rescaffold', '--quality', '--json'];
  baseline(t, assert, SCRIPT, {
    flags,
    badArgs: [
      [], // no plates.json
      ['/nonexistent/plates.json', '--all'],
      [f1, '--brand', BRAND], // no ids and no --all
      [f1, 'nope', '--brand', BRAND], // unknown plate id
      [f1, '--all', '--brand', '/nonexistent/pack'],
      [f1, '--all', '--brand', BRAND, '--quality', 'ultra'],
      [f1, '--all', '--brand', BRAND, '--every', 'soon'],
      [f1, '--bogus-flag'],
      [liveFixture(), 'p1-hook'], // live plate -> video-capture
    ],
  });
});

test('AC-BASE-08: a live plate named explicitly is refused with a pointer to video-capture', () => {
  const r = run(SCRIPT, [liveFixture(), 'p1-hook']);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /live.*video-capture/);
  assert.ok(r.ms < 5000, `fails fast (${r.ms} ms)`);
});

test('AC-BASE-08: --all skips live plates (they belong to video-capture)', () => {
  const out = tmp('skip');
  const r = run(SCRIPT, [liveFixture(), '--all', '--out', out, '--scaffold-only']);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /p1-hook/);
  assert.match(r.stdout, /p2-table/);
});

test('AC-PLT-01: every F1 plate renders alone to durationMs ±1 frame', () => {
  const out = tmp('f1');
  const r = run(SCRIPT, [path.join(F1, 'plates.json'), '--all', '--brand', BRAND, '--out', out, '--sheet', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const res = JSON.parse(r.stdout);
  const plan = JSON.parse(readFileSync(path.join(F1, 'plates.json'), 'utf8'));
  assert.equal(res.plates.length, plan.plates.length);
  for (const p of plan.plates) {
    const mp4 = path.join(out, 'renders', 'plates', `${p.id}.mp4`);
    assert.ok(existsSync(mp4), `${p.id}.mp4 exists`);
    const ps = run('lib/verify/probe-spec.mjs', [mp4, '--duration-ms', String(p.durationMs), '--fps', String(plan.fps), '--size', `${plan.width}x${plan.height}`, '--no-audio', '--json']);
    const checks = JSON.parse(ps.stdout).checks;
    for (const c of checks.filter((x) => /^(duration|fps|width|height)/.test(x.name))) assert.ok(c.ok, `${p.id} ${c.name}: ${c.actual} vs ${c.expected}`);
    assert.ok(existsSync(path.join(out, 'review', `contact-${p.id}.jpg`)), `contact sheet for ${p.id}`);
    const html = readFileSync(path.join(out, 'plates', p.id, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /(src|href)=["']https?:/, `${p.id} references no remote URL`);
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/, `${p.id} has no unfilled placeholder`);
  }
});

test('AC-PLT-01: a hand-authored index.html is kept; brand/ and vendor/ are refreshed', () => {
  const out = tmp('keep');
  const f1 = path.join(F1, 'plates.json');
  let r = run(SCRIPT, [f1, 'p3-close', '--brand', BRAND, '--out', out, '--scaffold-only']);
  assert.equal(r.code, 0, r.stderr);
  const html = path.join(out, 'plates', 'p3-close', 'index.html');
  writeFileSync(html, readFileSync(html, 'utf8').replace('<body>', '<body data-hand="1">'));
  writeFileSync(path.join(out, 'plates', 'p3-close', 'brand', 'tokens.css'), '/* stale */');
  r = run(SCRIPT, [f1, 'p3-close', '--brand', BRAND, '--out', out, '--scaffold-only']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /kept/);
  assert.match(readFileSync(html, 'utf8'), /data-hand="1"/);
  assert.equal(readFileSync(path.join(out, 'plates', 'p3-close', 'brand', 'tokens.css'), 'utf8'), readFileSync(path.join(BRAND, 'tokens.css'), 'utf8'));
  r = run(SCRIPT, [f1, 'p3-close', '--brand', BRAND, '--out', out, '--scaffold-only', '--rescaffold']);
  assert.doesNotMatch(readFileSync(html, 'utf8'), /data-hand/);
});

test('AC-PLT-04: every F1 and F2 plate passes hyperframes lint and check --strict', () => {
  for (const [name, dir] of [['F1', F1], ['F2', F2]]) {
    const out = tmp(`lint-${name}`);
    const r = run(SCRIPT, [path.join(dir, 'plates.json'), '--all', '--brand', BRAND, '--out', out, '--scaffold-only', '--lint']);
    assert.equal(r.code, 0, `${name}: ${r.stderr}`);
    const plan = JSON.parse(readFileSync(path.join(dir, 'plates.json'), 'utf8'));
    assert.equal(r.stdout.match(/lint\+check ok/g)?.length, plan.plates.length, `${name}: every plate checked`);
  }
});
