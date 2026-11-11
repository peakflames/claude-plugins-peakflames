#!/usr/bin/env node
// contact-sheet — sample frames from a video into one labelled JPEG grid, so a
// reviewer (human or Claude) can read motion as stills. Timecodes are drawn as
// 7-segment digits with ffmpeg drawbox, so no font or drawtext build is needed.
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runCli, CliError, EXIT } from '../cli.mjs';
import { ffmpeg, probe, fpsOf, requireFfmpeg } from '../ffmpeg.mjs';

const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

/** drawbox filters that write `text` (digits, '.', ':', 's') at x,y with scale s. */
export function sevenSeg(text, x0, y0, s = 2) {
  const W = 10 * s, H = 18 * s, t = 2 * s, gap = 4 * s;
  const boxes = [];
  const box = (x, y, w, h) => boxes.push(`drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=white:t=fill`);
  let x = x0;
  for (const ch of text) {
    if (SEG[ch] !== undefined) {
      const half = Math.floor(H / 2);
      const seg = {
        a: [x + t, y0, W - 2 * t, t], d: [x + t, y0 + H - t, W - 2 * t, t], g: [x + t, y0 + half - Math.floor(t / 2), W - 2 * t, t],
        f: [x, y0 + t, t, half - t], b: [x + W - t, y0 + t, t, half - t], e: [x, y0 + half, t, half - t], c: [x + W - t, y0 + half, t, half - t],
      };
      for (const k of SEG[ch]) box(...seg[k]);
      x += W + gap;
    } else if (ch === '.') { box(x, y0 + H - t, t, t); x += t + gap; }
    else if (ch === ':') { box(x, y0 + Math.floor(H / 3), t, t); box(x, y0 + Math.floor((2 * H) / 3), t, t); x += t + gap; }
    else if (ch === 's') { x += gap; }
  }
  return { filters: boxes, width: x - x0, height: H };
}

export function label(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(2).padStart(5, '0');
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

/**
 * Sample times in ms. `durMs` is the VIDEO stream's length (not the container's, which can run
 * longer with the audio); the last sample is its last frame (durMs minus one frame), and an --at
 * time past it is clamped to it, so `--at 0s,999s` gives the first and last frames.
 */
export function sampleTimes(durMs, { everyMs, count, at, fps = 30 }) {
  const lastMs = Math.max(0, Math.floor(durMs - 1000 / fps));
  if (at) return [...new Set(at.map((t) => Math.min(Math.max(0, t), lastMs)))];
  if (count) return Array.from({ length: count }, (_, i) => Math.round(count === 1 ? 0 : (i * lastMs) / (count - 1)));
  const out = [];
  for (let t = 0; t <= lastMs + 0.5; t += everyMs) out.push(Math.round(t));
  if (lastMs - out.at(-1) > everyMs / 2) out.push(Math.round(lastMs));
  return out;
}

/** The video stream's length in ms: its own duration, else frames ÷ fps, else the container's. */
export function videoDurationMs(v, info, fps) {
  const own = Number(v.duration);
  if (Number.isFinite(own) && own > 0) return own * 1000;
  const n = Number(v.nb_frames);
  if (Number.isFinite(n) && n > 0) return (n * 1000) / fps;
  return Number(info.format.duration) * 1000;
}

/** Build the sheet; returns {out, frames:[{ms,label}], cols, rows}. */
export function contactSheet(video, { out, everyMs = 500, count, at, cols = 4, width = 480 } = {}) {
  const info = probe(video);
  const v = info.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new CliError(`${video} has no video stream`);
  const fps = fpsOf(v) || 30;
  const durMs = videoDurationMs(v, info, fps);
  const times = sampleTimes(durMs, { everyMs, count, at, fps });
  if (!times.length) throw new CliError('no frames to sample — check --at/--every against the video length');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-sheet-'));
  try {
    const s = Math.max(1, Math.round(width / 320));
    times.forEach((ms, i) => {
      const lab = label(ms);
      const seg = sevenSeg(lab, 8 + 4 * s, 8 + 4 * s, s);
      const bg = `drawbox=x=8:y=8:w=${seg.width + 8 * s}:h=${seg.height + 8 * s}:color=black@0.75:t=fill`;
      const vf = [`scale=${width}:-2`, bg, ...seg.filters].join(',');
      const png = path.join(tmp, `f_${String(i + 1).padStart(4, '0')}.png`);
      const ss = Math.max(0, (ms - 500 / fps) / 1000).toFixed(4); // half a frame early: picks the frame at ms
      ffmpeg(['-y', '-ss', ss, '-i', video, '-frames:v', '1', '-vf', vf, png], { what: `frame at ${lab}` });
      // fast input seek can land past the last frame; fall back to accurate output seek
      if (!existsSync(png)) ffmpeg(['-y', '-i', video, '-ss', ss, '-frames:v', '1', '-vf', vf, png], { what: `frame at ${lab}` });
      if (!existsSync(png)) throw new CliError(`could not extract a frame at ${lab}`);
    });
    const c = Math.min(cols, times.length);
    const rows = Math.ceil(times.length / c);
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    ffmpeg(['-y', '-framerate', '1', '-i', path.join(tmp, 'f_%04d.png'), '-vf', `tile=${c}x${rows}:padding=6:margin=6:color=0x202020`, '-frames:v', '1', '-q:v', '3', out], { what: 'tiling' });
    return { out, video, frames: times.map((ms) => ({ ms, label: label(ms) })), cols: c, rows };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function parseMs(v, flag) {
  const m = /^([\d.]+)(ms|s)?$/.exec(String(v).trim());
  if (!m) throw new CliError(`${flag} expects a time like 0.5s or 500ms, got '${v}'`, EXIT.USAGE);
  return m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000;
}

const spec = {
  name: 'contact-sheet',
  summary: 'sample frames from a video into a labelled JPEG grid',
  usage: 'contact-sheet [options] <video>',
  description: 'Each frame is stamped with its time (seconds, or m:ss.ss) in the top-left corner. Default: one frame every 0.5 s. Times are on the video stream, which can end before the audio: the last sample is its last frame.',
  options: {
    out: { type: 'string', short: 'o', arg: 'file.jpg', desc: 'Output JPEG (default: <video>.contact.jpg)' },
    every: { type: 'string', arg: 'time', desc: 'Sample interval, e.g. 0.5s or 250ms', default: '0.5s' },
    count: { type: 'number', arg: 'n', desc: 'Sample n evenly spaced frames instead' },
    at: { type: 'string', arg: 't,t,...', desc: 'Sample exactly these times (e.g. 0.5s,1.2s or ms values); a time past the last frame is clamped to it' },
    cols: { type: 'number', desc: 'Frames per row', default: 4 },
    width: { type: 'number', arg: 'px', desc: 'Width of each frame', default: 480 },
    json: { type: 'boolean', desc: 'Print the sampled times as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: ['contact-sheet out/final.mp4 --every 0.5s -o review/contact-final.jpg', 'contact-sheet renders/plates/p1.mp4 --count 8'],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [video] }) => {
    if (!existsSync(video)) throw new CliError(`cannot read ${video}: no such file`);
    const everyMs = parseMs(values.every, '--every');
    if (everyMs <= 0) throw new CliError('--every must be greater than 0', EXIT.USAGE);
    const at = values.at?.split(',').filter(Boolean).map((t) => parseMs(/m?s$/.test(t) ? t : `${t}ms`, '--at'));
    if (values.count !== undefined && !(values.count >= 1)) throw new CliError('--count must be at least 1', EXIT.USAGE);
    if (!(values.cols >= 1)) throw new CliError('--cols must be at least 1', EXIT.USAGE);
    if (!(values.width >= 64)) throw new CliError('--width must be at least 64', EXIT.USAGE);
    requireFfmpeg();
    const out = values.out ?? video.replace(/\.[^./]+$/, '') + '.contact.jpg';
    const r = contactSheet(video, { out, everyMs, count: values.count, at, cols: values.cols, width: values.width });
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else process.stdout.write(`${r.out} (${r.frames.length} frames, ${r.cols}×${r.rows}): ${r.frames.map((f) => f.label).join(' ')}\n`);
    return EXIT.OK;
  });
}
