#!/usr/bin/env node
// check-cuts — every cut (given, or detected as a scene change) must land inside a
// silent gap of at least --min-silence-ms (DEC-13: spine 400, assembly 300, recorder 900).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT } from '../cli.mjs';
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

export function checkCuts(file, { cuts, minSilenceMs = 300, noiseDb = -40, threshold = 0.02 } = {}) {
  const { intervals, hasAudio, durMs } = silences(file, { noiseDb });
  const at = cuts ?? sceneCuts(file, { threshold });
  const results = at.map((ms) => {
    const gap = intervals.find((g) => g.startMs <= ms + 1 && ms - 1 <= g.endMs);
    const len = gap ? gap.endMs - gap.startMs : 0;
    return { cutMs: ms, timecode: tc(ms), ok: !!gap && len >= minSilenceMs, silenceMs: Math.round(len), gap: gap && { startMs: Math.round(gap.startMs), endMs: Math.round(gap.endMs) } };
  });
  return { ok: results.every((r) => r.ok), file, hasAudio, durMs: Math.round(durMs), minSilenceMs, source: cuts ? 'given' : `scene>${threshold}`, cuts: results };
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
    'noise-db': { type: 'number', arg: 'dB', desc: 'Silence threshold', default: -40 },
    json: { type: 'boolean', desc: 'Print the result as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: ['check-cuts review.mp4 --min-silence-ms 300', 'check-cuts spine/narration.wav --cuts 6500,14000 --min-silence-ms 400'],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [file] }) => {
    if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file`);
    let cuts;
    if (values.cuts !== undefined) {
      cuts = values.cuts.split(',').filter(Boolean).map(Number);
      if (cuts.some((n) => !Number.isFinite(n) || n < 0)) throw new CliError(`--cuts expects comma-separated ms values, got '${values.cuts}'`, EXIT.USAGE);
    }
    requireFfmpeg();
    const r = checkCuts(file, { cuts, minSilenceMs: values['min-silence-ms'], noiseDb: values['noise-db'], threshold: values['scene-threshold'] });
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      if (!r.hasAudio) process.stdout.write('note  no audio stream: treated as silent\n');
      for (const c of r.cuts) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  cut at ${c.timecode} — ${c.gap ? `silence ${c.silenceMs} ms` : 'not in silence'}${c.ok ? '' : ` (need ≥ ${r.minSilenceMs} ms)`}\n`);
      process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.cuts.length} cut(s), ${r.cuts.filter((c) => !c.ok).length} failing — ${file}\n`);
    }
    return r.ok ? EXIT.OK : EXIT.FAIL;
  });
}
