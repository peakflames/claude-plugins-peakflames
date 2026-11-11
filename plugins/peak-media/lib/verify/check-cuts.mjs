#!/usr/bin/env node
// check-cuts — every cut (given, or detected as a scene change) must land inside a
// silent gap of at least --min-silence-ms (DEC-13: spine 400, assembly 300, recorder 900).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT, isMain } from '../cli.mjs';
import { ffmpeg, probe, tc, requireFfmpeg } from '../ffmpeg.mjs';

/** Silent intervals [{startMs,endMs}] at or below noiseDb. */
export function silences(file, { noiseDb = -40 } = {}) {
  const info = probe(file);
  const durMs = Number(info.format.duration) * 1000;
  if (!info.streams.some((s) => s.codec_type === 'audio')) return { durMs, hasAudio: false, intervals: [{ startMs: 0, endMs: durMs }] };
  const { stderr } = ffmpeg(['-i', file, '-map', '0:a:0', '-af', `silencedetect=noise=${noiseDb}dB:d=0.02`, '-f', 'null', '-'], { what: 'silence detection' });
  const intervals = [];
  let start = null;
  for (const line of stderr.split('\n')) {
    let m = /silence_start: (-?[\d.]+)/.exec(line);
    if (m) { start = Math.max(0, Number(m[1]) * 1000); continue; }
    m = /silence_end: ([\d.]+)/.exec(line);
    if (m && start !== null) { intervals.push({ startMs: start, endMs: Number(m[1]) * 1000 }); start = null; }
  }
  if (start !== null) intervals.push({ startMs: start, endMs: durMs });
  return { durMs, hasAudio: true, intervals };
}

/** Scene-change times in ms (ffmpeg scene score > threshold, 0..1). */
export function sceneCuts(file, { threshold = 0.02 } = {}) {
  const { stderr } = ffmpeg(['-i', file, '-map', '0:v:0', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { what: 'scene detection' });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Math.round(Number(m[1]) * 1000));
}

export function checkCuts(file, { cuts, minSilenceMs = 300, noiseDb = -40, threshold = 0.02, edgeMs = 100 } = {}) {
  const { intervals, hasAudio, durMs } = silences(file, { noiseDb });
  const at = cuts ?? sceneCuts(file, { threshold });
  const results = at.map((ms) => {
    const gap = intervals.find((g) => g.startMs <= ms + 1 && ms - 1 <= g.endMs);
    const len = gap ? gap.endMs - gap.startMs : 0;
    // a cut on the very edge of a silence clips the sound next to it: keep edgeMs clear on both sides
    // (file start/end count as clear)
    const clear = gap && (gap.startMs <= 1 || ms - gap.startMs >= edgeMs) && (gap.endMs >= durMs - 1 || gap.endMs - ms >= edgeMs);
    return { cutMs: ms, timecode: tc(ms), ok: !!gap && len >= minSilenceMs && !!clear, edge: !!gap && !clear, silenceMs: Math.round(len), gap: gap && { startMs: Math.round(gap.startMs), endMs: Math.round(gap.endMs) } };
  });
  return { ok: results.every((r) => r.ok), file, hasAudio, edgeMs, durMs: Math.round(durMs), minSilenceMs, source: cuts ? 'given' : `scene>${threshold}`, cuts: results };
}

const spec = {
  name: 'check-cuts',
  summary: 'check that every cut lands inside a silent gap',
  usage: 'check-cuts [options] <file>',
  description: 'Cuts come from --cuts (ms) or from scene detection. A cut passes when it sits inside a silence (audio at or below --noise-db) lasting at least --min-silence-ms. Exit 0 if all pass, 1 if any fails (failing timecodes are listed).',
  options: {
    'min-silence-ms': { type: 'number', arg: 'ms', desc: 'Minimum silent gap a cut must sit in', default: 300 },
    cuts: { type: 'string', arg: 'ms,ms,...', desc: 'Cut times in ms (skips scene detection)' },
    'scene-threshold': { type: 'number', arg: '0..1', desc: 'Scene-change threshold for detected cuts', default: 0.02 },
    'noise-db': { type: 'number', arg: 'dB', desc: 'Silence threshold (negative, e.g. --noise-db -50)', default: -40 },
    'edge-ms': { type: 'number', arg: 'ms', desc: 'Minimum distance from a cut to either edge of its silence', default: 100 },
    'expect-cuts': { type: 'number', arg: 'n', desc: 'Fail unless exactly n cuts are found' },
    json: { type: 'boolean', desc: 'Print the result as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: ['check-cuts review.mp4 --min-silence-ms 300', 'check-cuts spine/narration.wav --cuts 6500,14000 --min-silence-ms 400'],
};

if (isMain(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [file] }) => {
    if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file`);
    let cuts;
    if (values.cuts !== undefined) {
      cuts = values.cuts.split(',').filter(Boolean).map(Number);
      if (cuts.some((n) => !Number.isFinite(n) || n < 0)) throw new CliError(`--cuts expects comma-separated ms values, got '${values.cuts}'`, EXIT.USAGE);
    }
    const th = values['scene-threshold'];
    if (!(th > 0 && th < 1)) throw new CliError(`--scene-threshold must be between 0 and 1, got ${th}`, EXIT.USAGE);
    if (values['min-silence-ms'] < 0 || values['edge-ms'] < 0) throw new CliError('--min-silence-ms and --edge-ms must be >= 0', EXIT.USAGE);
    requireFfmpeg();
    if (cuts) {
      const durMs = Number(probe(file).format.duration) * 1000;
      const late = cuts.find((c) => c > durMs);
      if (late !== undefined) throw new CliError(`cut at ${late} ms is past the end of ${file} (${Math.round(durMs)} ms)`, EXIT.USAGE);
    }
    const r = checkCuts(file, { cuts, minSilenceMs: values['min-silence-ms'], noiseDb: values['noise-db'], threshold: th, edgeMs: values['edge-ms'] });
    if (values['expect-cuts'] !== undefined && r.cuts.length !== values['expect-cuts']) { r.ok = false; r.expectError = `expected ${values['expect-cuts']} cut(s), found ${r.cuts.length}`; }
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      if (!r.hasAudio) process.stdout.write('note  no audio stream: treated as silent\n');
      if (!r.cuts.length) process.stdout.write('note  no cuts found\n');
      if (r.expectError) process.stdout.write(`FAIL  ${r.expectError}\n`);
      for (const c of r.cuts) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  cut at ${c.timecode} — ${c.gap ? `silence ${c.silenceMs} ms` : 'not in silence'}${c.ok ? '' : c.edge ? ` (within ${r.edgeMs} ms of the silence edge)` : ` (need ≥ ${r.minSilenceMs} ms)`}\n`);
      process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.cuts.length} cut(s), ${r.cuts.filter((c) => !c.ok).length} failing — ${file}\n`);
    }
    return r.ok ? EXIT.OK : EXIT.FAIL;
  });
}
