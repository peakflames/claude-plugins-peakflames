// WP6 assembly: AC-ASM-01..05, AC-BASE-11/12. F1 plates and narration are generated per run
// (helpers/fixtures.mjs); the brand outro (brand-packs/default) is rendered through HyperFrames and cached.
// Set PEAK_MEDIA_EVIDENCE_DIR to also write the AC-ASM-05 contact sheet there.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../helpers/run.mjs';
import { makeF1Project, musicWav, sfxWav } from './helpers/fixtures.mjs';

const ASSEMBLE = 'skills/video-assemble/scripts/assemble.mjs';
const REMUX = 'skills/video-assemble/scripts/remux-audio.mjs';
const SPINE_MS = 20000, OUTRO_MS = 3000;
let tmp, proj, music, sfx, first;

const md5v = (f) => spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-'], { encoding: 'utf8' }).stdout.trim();
const lufs = (f) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', f, '-map', '0:a:0', '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /I:\s*(-?inf|-?[\d.]+)\s*LUFS/.exec(r.stderr.slice(r.stderr.lastIndexOf('Summary:')));
  return m[1].includes('inf') ? -Infinity : Number(m[1]);
};
/** A frame scaled to 32x18 RGB, as bytes. */
const thumb = (f, ms) => spawnSync('ffmpeg', ['-v', 'error', '-ss', (ms / 1000).toFixed(3), '-i', f, '-frames:v', '1', '-vf', 'scale=32:18:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout;
const diff = (a, b) => { assert.equal(a.length, b.length); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const assembleJson = (args, opts) => { const r = run(ASSEMBLE, [...args, '--json'], opts); assert.equal(r.code, 0, r.stderr); return JSON.parse(r.stdout); };

before(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-asm-'));
  proj = makeF1Project(path.join(tmp, 'f1')).dir;
  music = musicWav(path.join(tmp, 'music.wav'));
  sfx = sfxWav(path.join(tmp, 'sfx.wav'), [6500, 14000]);
  first = assembleJson([proj]);
});

test('AC-ASM-01: F1 plates assembled on the spine — every plate cut lands in a ≥300 ms silent gap', () => {
  assert.deepEqual(first.cuts.map((c) => c.cutMs), [6500, 14000], 'both F1 plate boundaries are checked');
  assert.ok(first.cuts.every((c) => c.ok), JSON.stringify(first.cuts));
  const review = path.join(proj, 'review', 'review.mp4');
  const cc = run('lib/verify/check-cuts.mjs', [review, '--cuts', '6500,14000', '--min-silence-ms', '300', '--expect-cuts', '2']);
  assert.equal(cc.code, 0, cc.stdout + cc.stderr);
  // the composite really cuts there: each plate's own frames sit at its startMs .. end
  for (const p of first.plates) {
    for (const off of [0, p.durationMs - 34]) {
      assert.ok(diff(thumb(review, p.startMs + off), thumb(p.render, off)) < 4, `${p.id} frame at +${off} ms is at ${p.startMs + off} ms`);
    }
  }

  // negative: narration that runs over the 6.5 s cut fails assembly with the timecode
  const bad = makeF1Project(path.join(tmp, 'bad'), { windows: [[200, 6700], [6800, 13500], [14200, 19500]] }).dir;
  mkdirSync(path.join(bad, 'out'), { recursive: true });
  writeFileSync(path.join(bad, 'out', 'final.mp4'), 'stale final from an earlier run');
  const r = run(ASSEMBLE, [bad, '--outro', first.outro.mp4]);
  assert.equal(r.code, 1, r.stdout + r.stderr);
  const lines = r.stderr.trim().split('\n');
  assert.equal(lines.length, 1, r.stderr);
  assert.match(lines[0], /0:06\.500/);
  assert.doesNotMatch(lines[0], /0:14\.000/, 'only the failing cut is named');
  assert.ok(!existsSync(path.join(bad, 'out', 'final.mp4')), 'no final.mp4 (not even a stale one) after a failed sync check');
});

test('AC-ASM-02: music + SFX stems remuxed onto the review MP4 — video stream md5 unchanged', () => {
  const review = path.join(proj, 'review', 'review.mp4');
  const before = md5v(review);
  const out = path.join(tmp, 'remux', 'review-mix.mp4');
  const r = run(REMUX, [review, '--music', music, '--sfx', sfx, '-o', out, '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(before, /^MD5=[0-9a-f]{32}$/);
  assert.equal(md5v(out), before, 'video stream md5 (-map 0:v -c copy -f md5) unchanged');
  const lv = JSON.parse(r.stdout);
  assert.ok(Math.abs(lv.narration.lufs - -16) <= 0.5, `narration ${lv.narration.lufs} LUFS`);
  assert.ok(lv.music.belowVoiceDb >= 9 && lv.music.belowVoiceDb <= 15, `music ${lv.music.belowVoiceDb} dB under the voice`);
  assert.ok(lv.mix.truePeakDb <= -1, `mix true peak ${lv.mix.truePeakDb} dBFS`);
  // music pass, then SFX pass: each pass re-runs from the narration-only review; the picture never changes
  const pass1 = path.join(tmp, 'remux', 'pass1-music.mp4');
  assert.equal(run(REMUX, [review, '--music', music, '-o', pass1]).code, 0);
  assert.equal(md5v(pass1), before);
  const again = run(REMUX, [pass1, '--sfx', sfx, '-o', path.join(tmp, 'remux', 'x.mp4')]);
  assert.equal(again.code, 1, 'a mixed file is refused as the narration source');
  assert.match(again.stderr, /already carries a music\/SFX mix/);
  // the same through assemble --music --sfx (delegates to remux-audio)
  const out2 = path.join(tmp, 'with-music');
  const rep = assembleJson([proj, '--music', music, '--sfx', sfx, '--out', out2, '--outro', first.outro.mp4]);
  assert.equal(md5v(path.join(out2, 'review', 'review-mix.mp4')), md5v(path.join(out2, 'review', 'review.mp4')));
  assert.ok(rep.mix.music.belowVoiceDb >= 9 && rep.mix.music.belowVoiceDb <= 15);
  assert.ok(rep.final.ok);
});

// Supports the AC-ASM-06 listening gate: with the default levels the music and SFX are audible.
test('default levels: music sits 9–15 dB under the voice, rises between lines, SFX hits are audible', () => {
  const review = path.join(proj, 'review', 'review.mp4');
  const mixed = path.join(tmp, 'levels', 'music-only.mp4');
  assert.equal(run(REMUX, [review, '--music', music, '-o', mixed]).code, 0);
  // recover the music from the mix: mix minus the (unchanged, already −16 LUFS) narration
  const est = path.join(tmp, 'levels', 'music-est.wav');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mixed, '-i', review, '-filter_complex', '[1:a]volume=-1[n];[0:a][n]amix=inputs=2:normalize=0[m]', '-map', '[m]', est]);
  const win = (f, a, b) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', f, '-map', '0:a:0', '-af', `atrim=start=${a}:end=${b},ebur128`, '-f', 'null', '-'], { encoding: 'utf8' });
    return Number(/I:\s*(-?[\d.]+)\s*LUFS/.exec(r.stderr.slice(r.stderr.lastIndexOf('Summary:')))[1]);
  };
  for (const [a, b] of [[1, 5.5], [7.5, 13], [15, 19]]) { // inside the F1 clip windows
    const below = win(review, a, b) - win(est, a, b);
    assert.ok(below >= 9 && below <= 15, `music ${below.toFixed(1)} dB under the voice at ${a}–${b} s`);
  }
  const gap = win(est, 6.0, 6.7); // the 700 ms pause between clips 1 and 2 (release, then attack)
  assert.ok(gap > win(est, 1, 5.5) + 2, `music rises between lines (${gap} LUFS)`);
  // SFX: each hit is levelled to about −20 LUFS
  const r = run(REMUX, [review, '--sfx', sfx, '-o', path.join(tmp, 'levels', 'sfx.mp4'), '--json']);
  const lv = JSON.parse(r.stdout);
  assert.ok(Math.abs(lv.sfx.lufs - -20) <= 1, `sfx hits ${lv.sfx.lufs} LUFS`);
});

test('AC-ASM-03: out/final.mp4 passes probe-spec and lasts spine + outro ±1 frame', () => {
  const final = path.join(proj, 'out', 'final.mp4');
  const r = run('lib/verify/probe-spec.mjs', [final, '--size', '1280x720', '--fps', '30', '--duration-ms', String(SPINE_MS + OUTRO_MS)]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  // --export 1080p60: scaled, outro rendered at 60 fps, 30 fps plates frame-duplicated (with a note)
  const hd = path.join(tmp, 'hd');
  const h = assembleJson([proj, '--export', '1080p60', '--out', hd]);
  assert.match(h.note, /duplicates frames to 60 fps/);
  assert.equal(h.outro.source, 'render');
  const ofps = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', h.outro.mp4], { encoding: 'utf8' }).stdout.trim();
  assert.equal(ofps, '60/1', 'outro rendered at the export fps');
  assert.equal(first.note, undefined, 'no note for a source export');
  const r2 = run('lib/verify/probe-spec.mjs', [path.join(hd, 'out', 'final.mp4'), '--size', '1920x1080', '--fps', '60', '--duration-ms', String(SPINE_MS + OUTRO_MS)]);
  assert.equal(r2.code, 0, r2.stdout + r2.stderr);
  // second run in the same project reuses the cached outro render
  const again = assembleJson([proj]);
  assert.equal(first.outro.source, 'render');
  assert.equal(again.outro.source, 'cache');
  assert.equal(again.outro.mp4, first.outro.mp4);
});

test('AC-ASM-04: no music supplied — assembly succeeds with narration only (and a beat grid gets a silent track)', () => {
  assert.ok(first.final.ok);
  assert.equal(first.mix, undefined, 'no stem pass without --music/--sfx');
  assert.ok(!existsSync(path.join(proj, 'review', 'review-mix.mp4')));
  const final = path.join(proj, 'out', 'final.mp4');
  const review = path.join(proj, 'review', 'review.mp4');
  assert.ok(Math.abs(lufs(review) - -16) <= 0.5, `review narration ${lufs(review)} LUFS`);
  assert.ok(Number.isFinite(lufs(final)), 'final carries the narration');
  const grid = makeF1Project(path.join(tmp, 'grid'), { spine: 'beatgrid' }).dir;
  const g = assembleJson([grid, '--outro', first.outro.mp4]);
  assert.ok(g.final.ok, 'beat-grid final meets the spec (AAC track present)');
  assert.ok(lufs(path.join(grid, 'out', 'final.mp4')) <= -70, 'silent track (ebur128 floor)');
});

test('AC-ASM-05: the final contact sheet ends on the brand outro', () => {
  const final = path.join(proj, 'out', 'final.mp4');
  const sheet = path.join(tmp, 'AC-ASM-05-final-contact.jpg');
  const r = run('lib/verify/contact-sheet.mjs', [final, '--every', '1s', '--cols', '6', '--width', '320', '-o', sheet, '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(sheet));
  const outro = first.outro.mp4;
  const brandPack = JSON.parse(readFileSync(path.join(proj, 'plates.json'), 'utf8')).brand;
  assert.ok(brandPack.endsWith(path.join('brand-packs', 'default')), `F1 uses the shipping default pack (${brandPack})`);
  // logo and name are on screen at 21 s (the default outro holds 0.8–2.4 s, then fades out)
  const t = thumb(final, 21000);
  const busy = [...Array(t.length / 3).keys()].filter((i) => Math.abs(t[i * 3] - t[0]) + Math.abs(t[i * 3 + 1] - t[1]) + Math.abs(t[i * 3 + 2] - t[2]) > 60).length;
  assert.ok(busy >= 3, `outro content visible at 21 s (${busy} non-background thumb pixels)`);
  for (const ms of [21000, 22000, 22900]) assert.ok(diff(thumb(final, ms), thumb(outro, ms - SPINE_MS)) < 6, `final at ${ms} ms shows the outro`);
  assert.ok(diff(thumb(final, 19000), thumb(outro, 2000)) > 30, 'the last plate is not the outro');
  const ev = process.env.PEAK_MEDIA_EVIDENCE_DIR;
  if (ev) {
    mkdirSync(ev, { recursive: true });
    copyFileSync(sheet, path.join(ev, 'AC-ASM-05-final-contact.jpg'));
    writeFileSync(path.join(ev, 'AC-ASM-05-final-contact.json'), JSON.stringify({ final: 'out/final.mp4 (F1, brand-packs/default)', spineMs: SPINE_MS, outroMs: OUTRO_MS, frames: JSON.parse(r.stdout).frames }, null, 2) + '\n');
    writeFileSync(path.join(ev, 'AC-ASM-assemble-report.json'), JSON.stringify(JSON.parse(readFileSync(path.join(proj, 'review', 'assemble.json'), 'utf8')), (k, v) => (typeof v === 'string' ? v.replace(tmp, '<tmp>') : v), 2) + '\n');
  }
});

test('AC-BASE-11: assemble --help lists every flag, --version = plugin.json, bad input is one line with no stack', async () => {
  const { baseline } = await import('../helpers/run.mjs');
  const { spec } = await import('../../skills/video-assemble/scripts/assemble.mjs');
  const flags = Object.keys(spec.options).map((k) => `--${k}`);
  baseline(null, assert, ASSEMBLE, {
    flags,
    badArgs: [[], ['/no/such/project'], [proj, '--export', '4k'], [proj, '--bogus'], [proj, '--min-silence-ms', 'x'], [path.join(tmp, 'music.wav')],
      [proj, '--music', '/no/such.wav'], [proj, '--renders', path.join(tmp, 'empty-renders')]],
  });
});

test('AC-BASE-12: remux-audio --help lists every flag, --version = plugin.json, bad input is one line with no stack', async () => {
  const { baseline } = await import('../helpers/run.mjs');
  const { spec } = await import('../../skills/video-assemble/scripts/remux-audio.mjs');
  const review = path.join(proj, 'review', 'review.mp4');
  baseline(null, assert, REMUX, {
    flags: Object.keys(spec.options).map((k) => `--${k}`),
    badArgs: [[], [review], [review, '-o', path.join(tmp, 'o.mp4')], ['/no/such.mp4', '--music', music, '-o', path.join(tmp, 'o.mp4')],
      [review, '--music', '/no/such.wav', '-o', path.join(tmp, 'o.mp4')], [review, '--music', music, '-o', review],
      [music, '--music', music, '-o', path.join(tmp, 'o.mp4')], [review, '--music', review.replace('.mp4', '.nope'), '-o', 'x.mp4'], [review, '--fade-ms', '-5', '--music', music, '-o', path.join(tmp, 'o.mp4')]],
  });
});
