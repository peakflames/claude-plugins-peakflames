// video-plates: guards for the approved plate layout (WP4 layout follow-up, verify-3 S-1).
// Each plate is scaffolded from its template (no render), then measured in the page itself:
// HyperFrames' pinned headless browser loads a copy of index.html with a probe that waits for the
// template's fit, seeks the registered GSAP timeline, and dumps rects and computed styles as JSON.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { run, ROOT, tmpDir } from '../helpers/run.mjs';
import { browserPath } from '../../lib/hf.mjs';

const SCRIPT = 'skills/video-plates/scripts/render-plate.mjs';
const BRAND = path.join(ROOT, 'brand-packs', 'default');
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1', 'plates.json');
const F2 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F2', 'plates.json');
const W = 1280, H = 720;

// Runs inside the page. `window.__probe(D)` is called once the template has registered its timeline.
const PROBE = `<script>
window.__timelines = {};
(function () {
  const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
  const rows = (e) => { const g = document.createRange(); g.selectNodeContents(e); return new Set([...g.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top))).size; };
  const read = () => ({
    block: document.getElementById('block') && rect(document.getElementById('block')),
    lines: [...document.querySelectorAll('.line')].map((e) => ({ text: e.textContent, px: parseFloat(getComputedStyle(e).fontSize), rows: rows(e), ...rect(e) })),
    content: document.getElementById('content') && rect(document.getElementById('content')),
    body: document.getElementById('body') && rect(document.getElementById('body')),
    footer: document.getElementById('footer') && rect(document.getElementById('footer')),
    items: [...document.querySelectorAll('.cell,.bullet')].map((e) => ({ text: e.textContent, px: parseFloat(getComputedStyle(e).fontSize), rows: rows(e), ...rect(e) })),
  });
  const wait = () => {
    const tl = window.__timelines.main;
    if (!tl) return setTimeout(wait, 20);
    const D = tl.duration();
    const groups = document.querySelector('.table') ? [...document.querySelectorAll('.row')].map((r) => [...r.querySelectorAll('.cell')]) : [...document.querySelectorAll('.bullet')].map((e) => [e]);
    tl.seek(0.6 * D + 1e-6, false);
    const last = (groups.at(-1) || []).map((e) => ({ opacity: parseFloat(getComputedStyle(e).opacity), x: gsap.getProperty(e, 'x') }));
    tl.seek(D, false);
    const pre = document.createElement('pre'); pre.id = 'OUT';
    pre.textContent = JSON.stringify({ D, lastAt60: last, end: read() });
    document.body.appendChild(pre);
  };
  document.fonts.ready.then(() => setTimeout(wait, 20));
})();
</script>`;

let chrome;
const projects = {};
before(() => {
  chrome = browserPath();
  assert.ok(chrome, 'HyperFrames browser installed (run scripts/setup.mjs)');
  // ADV: F2's spine with two edge-case slides (WP4 verify-3 N-2/N-3): a table whose last column
  // holds a 97-character URL next to a hyphenated word, and six bullets that fill the content box.
  const adv = JSON.parse(readFileSync(F2, 'utf8'));
  adv.spine = path.join(path.dirname(F2), adv.spine);
  adv.brand = BRAND;
  adv.plates[0].text = ['Where each tool lives', 'Tool | Name | Link', 'OpenSpec | peak-workflow | https://github.com/example-org/a-fairly-long-repository-name/blob/main/docs/specs/requirements.md', 'Spec kit | none | n/a'];
  adv.plates[1].text = ['Six bullets', 'Label: one fairly long bullet that goes on and on to fill the line width and more', 'Two', 'Three', 'Four', 'Five', 'Six'];
  const ADV = path.join(tmpDir('pm-layout-advsrc-'), 'plates.json');
  writeFileSync(ADV, JSON.stringify(adv));
  for (const [name, file] of [['F1', F1], ['F2', F2], ['ADV', ADV]]) {
    const out = tmpDir(`pm-layout-${name}-`);
    const r = run(SCRIPT, [file, '--all', '--brand', BRAND, '--out', out, '--scaffold-only']);
    assert.equal(r.code, 0, r.stderr);
    projects[name] = out;
  }
});

/** Measure one scaffolded plate in the headless browser (file:// only, no network). */
function measure(project, id) {
  const dir = path.join(projects[project], 'plates', id);
  const probe = path.join(dir, '_probe.html');
  const html = readFileSync(path.join(dir, 'index.html'), 'utf8');
  const gsapTag = '<script src="vendor/gsap.min.js"></script>';
  assert.ok(html.includes(gsapTag), `${id}: template loads local GSAP`);
  writeFileSync(probe, html.replace(gsapTag, gsapTag + PROBE));
  const r = spawnSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files', `--window-size=${W},${H}`,
    '--virtual-time-budget=10000', '--dump-dom', 'file://' + probe], { encoding: 'utf8', timeout: 60_000 });
  const m = /<pre id="OUT">([\s\S]*?)<\/pre>/.exec(r.stdout ?? '');
  assert.ok(m, `${id}: probe produced output (${(r.stderr ?? '').slice(0, 200)})`);
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

test('layout: motion close plate keeps display text >= 56 px and wraps its long line instead of shrinking', () => {
  const { end } = measure('F1', 'p3-close');
  assert.equal(end.lines.length, 2);
  for (const l of end.lines) assert.ok(l.px >= 56, `"${l.text}" is ${l.px} px (want >= 56 at 720p)`);
  const long = end.lines.at(-1);
  assert.ok(long.rows >= 2, `long accent line wraps (rows: ${long.rows})`);
  assert.ok(long.px > end.lines[0].px, `accent line is the emphasis (${long.px} px vs ${end.lines[0].px} px)`);
  for (const l of end.lines) assert.ok(l.l >= 0 && l.r <= W && l.t >= 0 && l.b <= H, `"${l.text}" inside the frame`);
});

test('layout: settled motion text block is centred in the frame within 2% both ways', () => {
  for (const id of ['p1-hook', 'p3-close']) {
    const { end } = measure('F1', id);
    // the visible block: its accent bar (left edge) to the widest line, top line to bottom line
    const l = end.block.l, r = Math.max(...end.lines.map((x) => x.r));
    const t = Math.min(...end.lines.map((x) => x.t)), b = Math.max(...end.lines.map((x) => x.b));
    const dx = Math.abs((l + r) / 2 - W / 2) / W, dy = Math.abs((t + b) / 2 - H / 2) / H;
    assert.ok(dx <= 0.02, `${id}: horizontal centre off by ${(dx * 100).toFixed(2)}% of the width`);
    assert.ok(dy <= 0.02, `${id}: vertical centre off by ${(dy * 100).toFixed(2)}% of the height`);
    assert.ok((b - t) >= H * 0.3, `${id}: block uses the frame (${Math.round(b - t)} px tall)`);
  }
});

test('layout: the last table row (and last bullet) has settled by 60% of the slide plate', () => {
  for (const [project, id] of [['F1', 'p2-table'], ['F2', 's5-peak']]) {
    const { D, lastAt60 } = measure(project, id);
    assert.ok(lastAt60.length > 0, `${id}: has rows/bullets`);
    for (const c of lastAt60) {
      assert.ok(c.opacity >= 0.999, `${id}: last group opacity ${c.opacity} at ${(0.6 * D).toFixed(2)} s`);
      assert.ok(Math.abs(c.x) < 0.5, `${id}: last group still moving (x ${c.x}) at ${(0.6 * D).toFixed(2)} s`);
    }
  }
});

test('layout: slide body stays inside the content box and nothing reaches the footer', () => {
  const ids = [['F1', 'p2-table'], ...['s1-unit', 's2-ids', 's3-verify', 's4-openspec', 's5-peak'].map((id) => ['F2', id])];
  for (const [project, id] of ids) {
    const { end } = measure(project, id);
    assert.ok(end.body.b <= end.content.b + 1, `${id}: body bottom ${end.body.b} past content bottom ${end.content.b}`);
    for (const it of end.items) {
      assert.ok(it.b <= end.footer.t, `${id}: "${it.text.slice(0, 30)}" bottom ${it.b} reaches the footer (${end.footer.t})`);
      assert.ok(it.r <= end.content.r + 1, `${id}: "${it.text.slice(0, 30)}" runs past the content box`);
      assert.ok(it.px >= 27, `${id}: "${it.text.slice(0, 30)}" is ${it.px} px (< 27 px floor)`);
    }
  }
});

test('layout: a long URL in a table cell does not split a neighbour\'s word, and the body ends inside the content box', () => {
  for (const id of ['s1-unit', 's2-ids']) {
    const { end } = measure('ADV', id);
    assert.ok(end.body.b <= end.content.b + 0.5, `${id}: body bottom ${end.body.b} past content bottom ${end.content.b}`);
    for (const it of end.items) assert.ok(it.px >= 27, `${id}: "${it.text.slice(0, 30)}" is ${it.px} px (< 27 px floor)`);
  }
  const cell = measure('ADV', 's1-unit').end.items.find((x) => x.text === 'peak-workflow');
  assert.equal(cell.rows, 1, `"peak-workflow" sits on one row (rows: ${cell.rows})`);
});
