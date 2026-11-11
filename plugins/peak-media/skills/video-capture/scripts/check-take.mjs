#!/usr/bin/env node
// check-take — the recorder's cut check (web2video D9, DEC-13): every scene change in a captured
// take must sit inside a silence of the narration (≤ -40 dB, ≥ 900 ms, with --edge-ms clear on
// each side). Scene changes are detected with ffmpeg's scene score (threshold 0.02) on the picture
// above the caption band (DEC-50: a caption coming up with its clip, or the cursor, is not a cut);
// the silence check itself is lib/verify/check-cuts.mjs. Run it on the take's --out MP4.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runCli, CliError, EXIT, usageError, isMain } from '../../../lib/cli.mjs';
import { requireFfmpeg, probe, ffmpeg, fpsOf } from '../../../lib/ffmpeg.mjs';
import { checkCuts, silences } from '../../../lib/verify/check-cuts.mjs';

/** Recorder defaults (DEC-13: the recorder checks against 900 ms silences; DEC-50: the bottom 25 % is the caption band). */
export const TAKE_DEFAULTS = { minSilenceMs: 900, threshold: 0.02, noiseDb: -40, edgeMs: 100, captionBand: 0.25, mergeMs: 150 };

/**
 * The scene threshold is defined for the reference take, 1280x720 at 30 fps (the web preset).
 * Pages are laid out in CSS px at deviceScaleFactor 1, so the same slide change covers a smaller
 * share of a larger frame, and ffmpeg's scene score is a per-pixel average: the threshold scales
 * with the frame area. Frames above 30 fps are sampled at 30 fps first, so a fade isn't spread
 * over twice the frames (WP13 verify-1 M1).
 */
export const REFERENCE = { width: 1280, height: 720, fps: 30 };

/** The threshold applied to a take of `width`x`height`: `threshold` × reference area / frame area. */
export const effectiveThreshold = (threshold, { width, height }) => threshold * Math.min(1, (REFERENCE.width * REFERENCE.height) / (width * height));

/**
 * Scene-change times in ms, scored on the picture with the bottom `captionBand` of the frame cut
 * away (0 = the whole frame), at no more than 30 fps, against the area-scaled threshold. The cursor
 * is a small arrow: its glide moves too few pixels to score near the threshold, so it never reads
 * as a cut.
 */
export function sceneChanges(file, { threshold = TAKE_DEFAULTS.threshold, captionBand = TAKE_DEFAULTS.captionBand, width = REFERENCE.width, height = REFERENCE.height, fps = REFERENCE.fps } = {}) {
  const f = [];
  if (fps > REFERENCE.fps + 0.01) f.push(`fps=${REFERENCE.fps}`);
  if (captionBand > 0) f.push(`crop=iw:trunc(ih*${(1 - captionBand).toFixed(4)}/2)*2:0:0`);
  const th = effectiveThreshold(threshold, { width, height });
  f.push(`select='gt(scene,${th.toFixed(6)})'`, 'showinfo');
  const { stderr } = ffmpeg(['-i', file, '-map', '0:v:0', '-vf', f.join(','), '-f', 'null', '-'], { what: 'scene detection' });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Math.round(Number(m[1]) * 1000));
}

/**
 * One transition can score on two or three frames in a row (a 200 ms fade split by a frame that
 * landed late). Detections less than `mergeMs` after the first detection of a group are one scene
 * change, so a group never spans more than `mergeMs` and two cuts 200 ms apart stay two. A group
 * passes only if every frame of it sits in the silence; it is reported at its first failing frame
 * (else its first frame), with `startMs`/`endMs` and `frames` when it spans more than one.
 */
export function mergeTransitions(cuts, mergeMs = TAKE_DEFAULTS.mergeMs) {
  const groups = [];
  for (const c of cuts) {
    const g = groups.at(-1);
    if (g && c.cutMs - g[0].cutMs < mergeMs) g.push(c); else groups.push([c]);
  }
  return groups.map((g) => {
    const shown = g.find((c) => !c.ok) ?? g[0];
    return { ...shown, ok: g.every((c) => c.ok), ...(g.length > 1 && { startMs: g[0].cutMs, endMs: g.at(-1).cutMs, frames: g.length }) };
  });
}

/** Check a take; returns check-cuts' result plus {silentTrack, captionBand}. Throws CliError on unusable input. */
export function checkTake(file, opts = {}) {
  const o = { ...TAKE_DEFAULTS, ...opts };
  if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file — pass the take's --out MP4`);
  if (statSync(file).isDirectory()) throw new CliError(`${file} is a folder — pass the take's --out MP4`);
  const info = probe(file);
  if (!info.streams.some((s) => s.codec_type === 'video')) throw new CliError(`${file} has no video stream — pass the take's --out MP4`);
  if (!info.streams.some((s) => s.codec_type === 'audio')) {
    throw new CliError(`${path.basename(file)} has no audio track, so there is nothing to check cuts against — run check-take on a take's --out MP4 (a live plate's MP4 is picture only)`);
  }
  const v = info.streams.find((s) => s.codec_type === 'video');
  const frame = { width: v.width, height: v.height, fps: fpsOf(v) };
  const raw = checkCuts(file, { cuts: sceneChanges(file, { threshold: o.threshold, captionBand: o.captionBand, ...frame }), minSilenceMs: o.minSilenceMs, noiseDb: o.noiseDb, edgeMs: o.edgeMs });
  const r = { ...raw, cuts: mergeTransitions(raw.cuts, o.mergeMs), source: `scene>${o.threshold}` };
  r.ok = r.cuts.every((c) => c.ok);
  // one silence spanning the whole file means no narration (a silent or captions-only take)
  const s = silences(file, { noiseDb: o.noiseDb }).intervals;
  const silentTrack = s.length === 1 && s[0].startMs <= 1 && s[0].endMs >= r.durMs - 1;
  const out = { ...r, threshold: o.threshold, effectiveThreshold: Number(effectiveThreshold(o.threshold, frame).toFixed(6)), scoredFps: Math.min(frame.fps, REFERENCE.fps), noiseDb: o.noiseDb, captionBand: o.captionBand, silentTrack };
  if (o.expectCuts !== undefined && r.cuts.length !== o.expectCuts) {
    out.ok = false;
    out.error = `expected ${o.expectCuts} scene change(s), found ${r.cuts.length} at threshold ${o.threshold}`;
  } else if (o.expectCuts === undefined && !silentTrack && r.cuts.length === 0) {
    // on a narrated take, no change at all is almost always a missed detection: a fade of
    // ~300 ms or more spreads the change so no single frame scores above the threshold
    out.ok = false;
    out.error = `no scene changes found on a narrated take at threshold ${o.threshold} — gradual fades score below it: lower --scene-threshold, or pass --expect-cuts 0 if the take really has none`;
  }
  return out;
}

export const spec = {
  name: 'check-take',
  summary: 'check that every scene change in a captured take lands in a silence of its narration',
  usage: 'check-take [options] <take.mp4>',
  description: `
Detects scene changes in the picture (ffmpeg scene score above --scene-threshold) and checks each
lies inside a silence of the audio (at or below --noise-db, lasting at least --min-silence-ms, with
--edge-ms clear on both sides). Defaults: 0.02, -40 dB,
900 ms, 100 ms. Pass the take's --out MP4 from capture: it carries the audio.
Captions and the cursor are not cuts: the scene score is taken on the picture above the
caption band (the bottom 25 % of the frame by default; --caption-band 0 scores the whole frame),
and a cursor glide moves too few pixels to reach the threshold. --scene-threshold is set for a
1280x720 take: a larger frame is scored against threshold × 1280·720 / (width·height), because
page content is laid out in CSS px and covers less of a bigger frame, and a take above 30 fps is
sampled at 30 fps first (the JSON reports effectiveThreshold and scoredFps). Detections within
150 ms of a transition's first detection are that one transition (a short fade can score on
consecutive frames); it passes only if all of it is in the silence, it counts once for
--expect-cuts, and a failing one is reported at the frame that fails.
A silent or captions-only take has a silent track, so every change passes; the report says so.
A narrated take with no scene change at all fails: gradual fades (about 300 ms or longer) score
under the threshold, so lower --scene-threshold, or pass --expect-cuts 0 if it really has none.
Exit 0 if every scene change passes, 1 if any fails (its timecode is listed).`,
  options: {
    'min-silence-ms': { type: 'number', arg: 'ms', desc: 'Shortest silence a scene change may sit in', default: TAKE_DEFAULTS.minSilenceMs },
    'scene-threshold': { type: 'number', arg: '0..1', desc: 'Scene-change threshold (ffmpeg scene score)', default: TAKE_DEFAULTS.threshold },
    'noise-db': { type: 'number', arg: 'dB', desc: 'Silence threshold (negative, e.g. --noise-db -40)', default: TAKE_DEFAULTS.noiseDb },
    'edge-ms': { type: 'number', arg: 'ms', desc: 'Distance a scene change must keep from either edge of its silence', default: TAKE_DEFAULTS.edgeMs },
    'caption-band': { type: 'number', arg: 'fraction', desc: 'Bottom fraction of the frame left out of scene detection (where captions are drawn); 0 scores the whole frame', default: TAKE_DEFAULTS.captionBand },
    'expect-cuts': { type: 'number', arg: 'n', desc: 'Fail unless exactly n scene changes are found (--expect-cuts 0 accepts a narrated take with none)' },
    json: { type: 'boolean', desc: 'Print the result as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: [
    'check-take take.mp4',
    'check-take take.mp4 --expect-cuts 2 --json',
    'check-take take.mp4 --min-silence-ms 600 --scene-threshold 0.05',
    'check-take take.mp4 --caption-band 0.3',
  ],
};

if (isMain(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [file] }) => {
    const th = values['scene-threshold'];
    if (!(th > 0 && th < 1)) throw usageError(`--scene-threshold must be between 0 and 1, got ${th}`);
    if (values['min-silence-ms'] < 0) throw usageError(`--min-silence-ms must be >= 0, got ${values['min-silence-ms']}`);
    if (values['edge-ms'] < 0) throw usageError(`--edge-ms must be >= 0, got ${values['edge-ms']}`);
    if (values['noise-db'] >= 0) throw usageError(`--noise-db must be negative (dBFS), got ${values['noise-db']}`);
    const band = values['caption-band'];
    if (!(band >= 0 && band < 0.9)) throw usageError(`--caption-band must be a fraction from 0 to under 0.9 (e.g. 0.25), got ${band}`);
    const expect = values['expect-cuts'];
    if (expect !== undefined && !(Number.isInteger(expect) && expect >= 0)) throw usageError(`--expect-cuts must be a whole number >= 0, got ${expect}`);
    requireFfmpeg();
    const r = checkTake(path.resolve(file), { minSilenceMs: values['min-silence-ms'], threshold: th, noiseDb: values['noise-db'], edgeMs: values['edge-ms'], captionBand: band, expectCuts: expect });
    if (values.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return r.ok ? EXIT.OK : EXIT.FAIL; }
    if (r.error && !r.cuts.length) { process.stdout.write(`FAIL  ${r.error} — ${file}\n`); return EXIT.FAIL; }
    if (!r.cuts.length) process.stdout.write('note  no scene changes found\n');
    if (r.silentTrack) process.stdout.write('note  the audio is silent for the whole take (silent or captions-only): every scene change passes\n');
    if (r.error) process.stdout.write(`FAIL  ${r.error}\n`);
    for (const c of r.cuts) {
      process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  scene change at ${c.timecode}${c.frames ? ` (a transition over ${c.frames} frames)` : ''} —${c.gap ? `silence ${c.silenceMs} ms` : 'over sound'}${c.ok ? '' : c.edge ? ` (within ${r.edgeMs} ms of the silence edge)` : c.gap ? ` (need ≥ ${r.minSilenceMs} ms)` : ' (move it into a pause between clips)'}\n`);
    }
    const bad = r.cuts.filter((c) => !c.ok).length;
    const summary = `${r.cuts.length} scene change(s) at threshold ${th}${band > 0 ? ` above the bottom ${Math.round(band * 100)} % caption band` : ''}, ${bad} not in a ≥ ${r.minSilenceMs} ms silence`;
    // the last line carries the reason when the take fails on the count, not only on a cut
    process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.error ? `${r.error}; ` : ''}${summary} — ${file}\n`);
    return r.ok ? EXIT.OK : EXIT.FAIL;
  });
}
