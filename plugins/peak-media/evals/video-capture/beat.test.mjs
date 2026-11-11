// video-capture (WP12): the beat(id, fn?) storyboard API — captions from script.md or the spine,
// the beat rules, beat timing, the visible cursor, navigation, animated scrolling, and the grep
// that none of the pre-beat() storyboard calls is left in code. Pages are served on 127.0.0.1 — no internet; the
// narrated deck uses a fake/tone spine with no key.
// Captures are real time: run this file alone (`node --test <this file>` or ac-run --wp WP12).
//
// Set PEAK_MEDIA_EVIDENCE_DIR to keep the contact sheets and measurements (JPEG/JSON only);
// otherwise they are written to the temp dir and deleted.
import { test as nodeTest, before, after } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, tmpDir } from '../helpers/run.mjs';
import { CAPTURE, DECK, NO_KEY, deckSpine } from './helpers/projects.mjs';
import { holdMs } from '../../skills/video-capture/scripts/capture.mjs';
import { parseScript } from '../../skills/video-spine/scripts/spine.mjs';
import { contactSheet } from '../../lib/verify/contact-sheet.mjs';
import { validateFile } from '../../lib/schemas.mjs';

const UI = path.join(ROOT, 'skills', 'video-capture', 'examples', 'ui-demo');
const UI_STORYBOARD = path.join(UI, 'storyboard.mjs');
const UI_SCRIPT = path.join(UI, 'script.md');
const FIX = path.join(ROOT, 'evals', 'video-capture', 'fixtures');
const TWO_PAGE = path.join(FIX, 'two-page');
const SCROLL = path.join(FIX, 'scroll');
const FPS = 30;

const test = (name, fn) => nodeTest(name, { concurrency: false }, fn);

let tmp, evidence;
before(() => {
  tmp = tmpDir('pm-capture-wp12-');
  evidence = process.env.PEAK_MEDIA_EVIDENCE_DIR ?? path.join(tmp, 'evidence');
  mkdirSync(evidence, { recursive: true });
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const keep = (name, data) => writeFileSync(path.join(evidence, name), JSON.stringify(data, null, 2) + '\n');
const env = () => ({ ...process.env, ...NO_KEY, PEAK_MEDIA_TTS_LEGACY_DIRS: '' });

/** Run capture (real time) with --json; returns {code, stderr, take, manifest}. */
function capture(args, { ok = true } = {}) {
  const r = spawnSync(process.execPath, [path.join(ROOT, CAPTURE), ...args, '--json'], { encoding: 'utf8', cwd: ROOT, env: env(), timeout: 180_000 });
  if (ok) assert.equal(r.status, 0, `capture ${args.join(' ')}: ${r.stderr}`);
  const take = r.status === 0 ? JSON.parse(r.stdout) : null;
  return { code: r.status, stderr: r.stderr, take, manifest: take && JSON.parse(readFileSync(take.manifest, 'utf8')) };
}

/** stderr without capture's progress lines: what the user reads as the error. */
const errorLines = (stderr) => stderr.trim().split('\n').filter((l) => l && !/^capture: (launching|t0 )/.test(l));

const memo = (fn) => { let v; return () => (v ??= fn()); };

/** RGB pixels of the frame at `ms`, optionally cropped (x, y, w, h in take pixels), scaled to w×h. */
function frameAt(file, ms, { crop = null, w = 128, h = 72 } = {}) {
  const vf = [crop && `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`, `scale=${w}:${h}:flags=area`].filter(Boolean).join(',');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', (ms / 1000).toFixed(3), '-i', file, '-frames:v', '1', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, `decode ${file} @${ms}`);
  return r.stdout;
}
const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

/** Dark pixels (the neutral caption bar) in rows 58..67 of a 128×72 frame: the caption band, clear of page content. */
function captionBand(file, ms) {
  const px = frameAt(file, ms);
  let dark = 0;
  for (let y = 58; y < 68; y++) for (let x = 0; x < 128; x++) if (lum(px, (y * 128 + x) * 3) < 90) dark++;
  return dark;
}

/** Near-black pixels in the 22×28 box below-right of (x, y): where the arrow cursor's body is when its tip is at (x, y). */
function arrowPixels(file, ms, { x, y }) {
  const px = frameAt(file, ms, { crop: { x, y, w: 22, h: 28 }, w: 22, h: 28 });
  let n = 0;
  for (let i = 0; i < px.length; i += 3) if (lum(px, i) < 40) n++;
  return n;
}

// ---- takes shared by the tests ----

const uiTake = {
  cursor: memo(() => capture(['--storyboard', UI_STORYBOARD, '--script', UI_SCRIPT, '--out', path.join(tmp, 'ui-cursor.mp4')])),
  'no-cursor': memo(() => capture(['--storyboard', UI_STORYBOARD, '--script', UI_SCRIPT, '--out', path.join(tmp, 'ui-no-cursor.mp4'), '--no-cursor'])),
};

// ---------------------------------------------------------------------------------------------

test('AC-W2V-01: each beat shows its own caption — script.md On screen: lines (ui-demo) and spine onScreenText (narrated deck)', () => {
  // ui-demo, captions mode: the caption of each beat is its On screen: line in script.md
  const uiScript = parseScript(readFileSync(UI_SCRIPT, 'utf8'));
  const ui = uiTake.cursor();
  assert.equal(ui.take.mode, 'captions');
  // narrated deck on a fake/tone spine: the caption of each beat is the spine beat's onScreenText
  const spine = deckSpine(path.join(tmp, 'deck'));
  const deckMp4 = path.join(tmp, 'deck-narrated.mp4');
  const deck = capture(['--storyboard', path.join(DECK, 'storyboard.mjs'), '--spine', spine.file, '--out', deckMp4]);
  assert.equal(deck.take.mode, 'narrated');
  const cases = [
    { name: 'ui-demo', mp4: path.join(tmp, 'ui-cursor.mp4'), run: ui, expected: uiScript.map((b) => [b.id, b.onScreenText]) },
    { name: 'deck', mp4: deckMp4, run: deck, expected: spine.manifest.beats.map((b) => [b.id, b.onScreenText]) },
  ];
  const report = {};
  for (const c of cases) {
    const caps = c.run.manifest.captions;
    assert.deepEqual(caps.map((x) => [x['x-beat'], x.text]), c.expected, `${c.name}: one caption per beat, its own text`);
    assert.deepEqual(c.run.manifest.beats.map((b) => b.id), c.expected.map(([id]) => id), `${c.name}: manifest beats[] holds every beat called`);
    // frame sample: the caption bar is on screen in the middle of each beat's caption
    const at = caps.map((x) => Math.round(x.startMs + x.durationMs / 2));
    const bands = at.map((ms) => ({ ms, dark: captionBand(c.mp4, ms) }));
    for (const b of bands) assert.ok(b.dark >= 40, `${c.name}: caption bar visible at ${b.ms} ms (${b.dark} dark px)`);
    report[c.name] = { captions: caps.map((x) => ({ beat: x['x-beat'], text: x.text, startMs: x.startMs, durationMs: x.durationMs })), bands };
  }
  const sp = deck.manifest.beats.find((b) => b.id === 'intro');
  assert.deepEqual(sp.clipNs, [spine.manifest.clips[0].n], 'deck: the narrated beat lists its clip');
  keep('AC-W2V-01-captions.json', report);
});

test('AC-W2V-02: beat(\'nope\') stops the take before any frame is encoded; the one-line error lists the valid ids', () => {
  const sb = path.join(tmp, 'nope.mjs');
  writeFileSync(sb, "export default async ({ beat }) => { await beat('nope'); };\n");
  const out = path.join(tmp, 'nope.mp4');
  const r = capture(['--storyboard', sb, '--script', UI_SCRIPT, '--url', path.join(UI, 'index.html'), '--out', out], { ok: false });
  assert.notEqual(r.code, 0);
  const lines = errorLines(r.stderr);
  assert.equal(lines.length, 1, r.stderr);
  assert.match(lines[0], /beat 'nope' is not in script\.md — valid: add, done, filter, clear/);
  assert.equal(existsSync(out), false, 'nothing was encoded');
  assert.equal(existsSync(path.join(tmp, 'nope.take.json')), false, 'no take manifest');
});

test('AC-W2V-03: out-of-order, repeated, nested and uncalled beats each stop the take with a one-line message naming the fix', () => {
  const cases = {
    'out of order': ["await beat('done');", /beat 'done' was called before 'add' — call the beats in script\.md order: add, done, filter, clear/],
    repeated: ["await beat('add'); await beat('add');", /beat 'add' was called twice — each beat runs once: give the second part its own beat/],
    nested: ["await beat('add', async () => { await beat('done'); });", /beat 'done' was called inside beat 'add' — beats can't nest: await beat\('add', …\) to the end, then call beat\('done'\)/],
    'never called': ["await beat('add'); await beat('done'); await beat('filter');", /beat 'clear' never called — .*add await beat\('clear', …\)/],
  };
  const seen = {};
  for (const [name, [body, msg]] of Object.entries(cases)) {
    const sb = path.join(tmp, `rule-${name.replace(/\s+/g, '-')}.mjs`);
    writeFileSync(sb, `export default async ({ beat }) => { ${body} };\n`);
    const out = path.join(tmp, `rule-${name.replace(/\s+/g, '-')}.mp4`);
    const r = capture(['--storyboard', sb, '--script', UI_SCRIPT, '--url', path.join(UI, 'index.html'), '--out', out], { ok: false });
    assert.notEqual(r.code, 0, `${name}: non-zero exit`);
    const lines = errorLines(r.stderr);
    assert.equal(lines.length, 1, `${name}: one line (${r.stderr})`);
    assert.match(lines[0], msg, `${name}: ${lines[0]}`);
    assert.equal(existsSync(out), false, `${name}: nothing written`);
    seen[name] = lines[0];
  }
  keep('AC-W2V-03-errors.json', seen);
});

test('AC-W2V-04: a beat lasts max(fn, hold) — a long fn lengthens it, a long hold outlasts a short fn — and the next beat starts after it', () => {
  const script = path.join(tmp, 'timing.md');
  const longText = 'This caption has fourteen words so its reading hold runs for well over four seconds.';
  writeFileSync(script, `## long-fn\n\nGo.\n\n## long-hold\n\n${longText}\n`);
  const sb = path.join(tmp, 'timing.mjs');
  writeFileSync(sb, [
    'export default async ({ beat, wait, elapsedMs }) => {',
    "  await beat('long-fn', async () => { await wait(2600); });",
    "  await beat('long-hold', async () => { await wait(300); });",
    '};', ''].join('\n'));
  const { take } = capture(['--storyboard', sb, '--script', script, '--url', path.join(UI, 'index.html'), '--out', path.join(tmp, 'timing.mp4'), '--no-cursor']);
  const [a, b] = take.beats;
  const holds = { 'long-fn': holdMs('Go.'), 'long-hold': holdMs(longText) };
  assert.equal(holds['long-fn'], 1500);
  assert.ok(holds['long-hold'] > 4000);
  assert.ok(a.durationMs >= Math.max(2600, holds['long-fn']), `long-fn spans ${a.durationMs} ms >= fn 2600 ms`);
  assert.ok(a.durationMs < 2600 + 400, `long-fn ends when fn ends (${a.durationMs} ms), not much later`);
  assert.ok(b.durationMs >= Math.max(300, holds['long-hold']) - 1, `long-hold spans ${b.durationMs} ms >= hold ${holds['long-hold']} ms`);
  assert.ok(b.startMs >= a.startMs + a.durationMs - 1, `long-hold starts (${b.startMs}) after long-fn ends (${a.startMs + a.durationMs})`);
  keep('AC-W2V-04-timing.json', { holds, fnMs: { 'long-fn': 2600, 'long-hold': 300 }, beats: take.beats });
});

test('AC-W2V-05: the arrow cursor is drawn at each click/type target and between them; --no-cursor draws none (contact sheets)', () => {
  const on = uiTake.cursor(), off = uiTake['no-cursor']();
  assert.equal(on.take.cursorEngine, 'overlay', 'the cursor is drawn with screencast.showOverlay');
  assert.equal(off.take.cursorEngine, null);
  assert.equal(on.manifest['x-take'].cursor, true);
  assert.equal(off.manifest['x-take'].cursor, false);
  const onMp4 = path.join(tmp, 'ui-cursor.mp4'), offMp4 = path.join(tmp, 'ui-no-cursor.mp4');
  // at each target, just after the cursor arrives (the click/type itself follows)
  const targets = on.take.pointer.map((p, i) => ({ ...p, ms: p.atMs + 150, offMs: off.take.pointer[i].atMs + 150 }));
  assert.deepEqual(on.take.pointer.map((p) => p.action), off.take.pointer.map((p) => p.action), 'the same helpers ran in both takes');
  const rows = targets.map((t) => ({ action: t.action, beat: t.beat, x: t.x, y: t.y, ms: t.ms, cursor: arrowPixels(onMp4, t.ms, t), noCursor: arrowPixels(offMp4, t.offMs, t) }));
  for (const r of rows) {
    assert.ok(r.cursor >= 40 && r.cursor - r.noCursor >= 30, `${r.action} @(${r.x},${r.y}) ${r.ms} ms: arrow drawn (${r.cursor} vs ${r.noCursor} dark px without --no-cursor)`);
  }
  // between targets the arrow stays on screen where it last stopped (it is not just a click pulse)
  const between = on.take.pointer.slice(0, -1).map((p, i) => {
    const next = on.take.pointer[i + 1];
    const ms = Math.round(next.atMs - 450 - 60); // before the next glide starts (glide 400 ms)
    return ms > p.atMs + 500 ? { from: p, ms, px: arrowPixels(onMp4, ms, p) } : null;
  }).filter(Boolean);
  assert.ok(between.length >= 3, `enough gaps between targets to sample (${between.length})`);
  for (const b of between) assert.ok(b.px >= 40, `arrow still at (${b.from.x},${b.from.y}) at ${b.ms} ms (${b.px} dark px)`);
  contactSheet(onMp4, { out: path.join(evidence, 'AC-W2V-05-cursor.jpg'), at: [...targets.map((t) => t.ms), ...between.map((b) => b.ms)].sort((a, b) => a - b), cols: 4, width: 640 });
  contactSheet(offMp4, { out: path.join(evidence, 'AC-W2V-05-no-cursor.jpg'), at: targets.map((t) => t.offMs), cols: 4, width: 640 });
  keep('AC-W2V-05-cursor.json', { note: 'near-black px in the 22x28 box below-right of each target (the arrow body); "between" = the cursor resting between helpers', targets: rows, between: between.map((b) => ({ x: b.from.x, y: b.from.y, ms: b.ms, px: b.px })) });
});

test('AC-W2V-06: after a hash-route change and a goto, one cursor and one caption are visible (contact sheets)', () => {
  const runs = {};
  for (const engine of ['overlay', 'dom']) {
    const mp4 = path.join(tmp, `two-page-${engine}.mp4`);
    const r = capture(['--storyboard', path.join(TWO_PAGE, 'storyboard.mjs'), '--script', path.join(TWO_PAGE, 'script.md'), '--out', mp4, '--caption-engine', engine]);
    assert.deepEqual(r.take.beats.map((b) => b.id), ['home', 'details', 'page-two']);
    assert.equal(r.take.captionEngine, engine);
    const p = r.take.pointer;
    assert.deepEqual(p.map((x) => x.action), ['point', 'click', 'point', 'point']);
    // after the hash-route click (#go) and after goto(page2.html): the cursor at its last target, one caption bar
    const shots = [
      { label: 'home', ms: p[0].atMs + 200, at: p[0] },
      { label: 'after hash route', ms: p[2].atMs + 200, at: p[2] },
      { label: 'after goto', ms: p[3].atMs + 300, at: p[3] },
    ];
    const rows = shots.map((s) => ({ ...s, at: { x: s.at.x, y: s.at.y }, arrow: arrowPixels(mp4, s.ms, s.at), caption: captionBand(mp4, s.ms) }));
    for (const s of rows) {
      assert.ok(s.arrow >= 40, `${engine} ${s.label}: the cursor is at (${s.at.x},${s.at.y}) (${s.arrow} px)`);
      assert.ok(s.caption >= 40, `${engine} ${s.label}: a caption is on screen (${s.caption} px)`);
    }
    // one caption per beat as shown, none left over from an earlier document
    assert.deepEqual(r.manifest.captions.map((c) => c['x-beat']), ['home', 'details', 'page-two']);
    contactSheet(mp4, { out: path.join(evidence, `AC-W2V-06-${engine}.jpg`), at: rows.map((s) => s.ms), cols: 3, width: 640 });
    runs[engine] = rows;
  }
  keep('AC-W2V-06-navigation.json', runs);
});

test('AC-W2V-07: scrollBy(container, {y: 1500, ms: 600}) at 30 fps shows at least 10 distinct frames over the scroll', () => {
  const mp4 = path.join(tmp, 'scroll.mp4');
  const { take } = capture(['--storyboard', path.join(SCROLL, 'storyboard.mjs'), '--script', path.join(SCROLL, 'script.md'), '--out', mp4, '--no-captions', '--fps', String(FPS)]);
  assert.equal(take.fps, FPS);
  const s = take.pointer.find((p) => p.action === 'scrollBy');
  assert.ok(s, 'scrollBy ran');
  // decode the 600 ms from the scroll's start (the list box only), and count frames that differ from the one before
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', (s.atMs / 1000).toFixed(3), '-t', '0.700', '-i', mp4, '-vf', 'crop=640:520:320:40,scale=64:52:flags=area,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
  assert.equal(r.status, 0);
  const size = 64 * 52;
  const frames = [];
  for (let off = 0; off + size <= r.stdout.length; off += size) frames.push(r.stdout.subarray(off, off + size));
  const diffs = frames.slice(1).map((f, i) => { let d = 0; for (let k = 0; k < size; k++) d += Math.abs(f[k] - frames[i][k]); return d / size; });
  const distinct = 1 + diffs.filter((d) => d > 0.5).length;
  keep('AC-W2V-07-scroll.json', { fps: FPS, scrollStartMs: s.atMs, framesDecoded: frames.length, meanAbsDiffs: diffs.map((d) => Number(d.toFixed(2))), distinct });
  assert.ok(distinct >= 10, `${distinct} distinct frames over the 600 ms scroll (>= 10)`);
  // and it scrolled all the way: the last frame differs from the first
  assert.ok(diffs.reduce((a, b) => a + b, 0) > 5, 'the list moved');
});

test('AC-W2V-08: none of the pre-beat() storyboard calls is left in code files under skills/, evals/ and docs/build/fixtures/', () => {
  const re = new RegExp(['\\bsa', 'y\\(|wait', 'ForVoice'].join(''));
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const f = path.join(dir, name);
      if (statSync(f).isDirectory()) walk(f);
      else if (/\.(mjs|js|html)$/.test(name)) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`); });
      }
    }
  };
  const dirs = ['skills', 'evals', path.join('docs', 'build', 'fixtures')].map((d) => path.join(ROOT, d));
  for (const d of dirs) { assert.ok(existsSync(d), d); walk(d); }
  assert.deepEqual(hits, [], `pre-beat() calls left in code:\n${hits.join('\n')}`);
  // control: the pattern does catch both spellings
  assert.ok(re.test(['await ', 'say', "('x')"].join('')) && re.test(['wait', 'ForVoice()'].join('')));
});

// (the take manifest stays v1-valid with real beats: checked here so a schema regression shows up next to the beat tests)
test('AC-W2V-01: the take manifest with per-beat entries validates against the v1 spine schema', async () => {
  const ui = uiTake.cursor();
  const v = await validateFile(ui.take.manifest, 'spine');
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.equal(ui.manifest['x-take'].says, undefined, 'x-take.says is gone');
  assert.deepEqual(ui.manifest['x-take'].beats.map((b) => b.id), ['add', 'done', 'filter', 'clear']);
});
