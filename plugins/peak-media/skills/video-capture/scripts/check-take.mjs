#!/usr/bin/env node
// check-take — the recorder's cut check (web2video D9, DEC-13): every scene change in a captured
// take must sit inside a silence of the narration (≤ -40 dB, ≥ 900 ms, with --edge-ms clear on
// each side). Scene changes are detected with ffmpeg's scene score (threshold 0.02); the check
// itself is lib/verify/check-cuts.mjs. Run it on the --mp4 deliverable, which carries the audio.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runCli, CliError, EXIT, usageError } from '../../../lib/cli.mjs';
import { requireFfmpeg, probe } from '../../../lib/ffmpeg.mjs';
import { checkCuts, silences } from '../../../lib/verify/check-cuts.mjs';

/** Recorder defaults (DEC-13: the recorder checks against 900 ms silences). */
export const TAKE_DEFAULTS = { minSilenceMs: 900, threshold: 0.02, noiseDb: -40, edgeMs: 100 };

/** Check a take; returns check-cuts' result plus {silentTrack}. Throws CliError on unusable input. */
export function checkTake(file, opts = {}) {
  const o = { ...TAKE_DEFAULTS, ...opts };
  if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file — pass the take's --mp4 output`);
  if (statSync(file).isDirectory()) throw new CliError(`${file} is a folder — pass the take's --mp4 output`);
  const info = probe(file);
  if (!info.streams.some((s) => s.codec_type === 'video')) throw new CliError(`${file} has no video stream — pass the take's --mp4 output`);
  if (!info.streams.some((s) => s.codec_type === 'audio')) {
    throw new CliError(`${path.basename(file)} has no audio track, so there is nothing to check cuts against — run check-take on the --mp4 deliverable, not the picture-only --out`);
  }
  const r = checkCuts(file, { minSilenceMs: o.minSilenceMs, noiseDb: o.noiseDb, threshold: o.threshold, edgeMs: o.edgeMs });
  // one silence spanning the whole file means no narration (a silent or captions-only take)
  const s = silences(file, { noiseDb: o.noiseDb }).intervals;
  const silentTrack = s.length === 1 && s[0].startMs <= 1 && s[0].endMs >= r.durMs - 1;
  return { ...r, threshold: o.threshold, noiseDb: o.noiseDb, silentTrack };
}

export const spec = {
  name: 'check-take',
  summary: 'check that every scene change in a captured take lands in a silence of its narration',
  usage: 'check-take [options] <take.mp4>',
  description: `
Detects scene changes in the picture (ffmpeg scene score above --scene-threshold) and checks each
lies inside a silence of the audio (at or below --noise-db, lasting at least --min-silence-ms, with
--edge-ms clear on both sides). Defaults are the recorder's (web2video D9, DEC-13): 0.02, -40 dB,
900 ms, 100 ms. Pass the --mp4 deliverable from capture: the picture-only --out has no audio.
A silent or captions-only take has a silent track, so every change passes; the report says so.
Exit 0 if every scene change passes, 1 if any fails (its timecode is listed).`,
  options: {
    'min-silence-ms': { type: 'number', arg: 'ms', desc: 'Shortest silence a scene change may sit in', default: TAKE_DEFAULTS.minSilenceMs },
    'scene-threshold': { type: 'number', arg: '0..1', desc: 'Scene-change threshold (ffmpeg scene score)', default: TAKE_DEFAULTS.threshold },
    'noise-db': { type: 'number', arg: 'dB', desc: 'Silence threshold (negative, e.g. --noise-db -40)', default: TAKE_DEFAULTS.noiseDb },
    'edge-ms': { type: 'number', arg: 'ms', desc: 'Distance a scene change must keep from either edge of its silence', default: TAKE_DEFAULTS.edgeMs },
    json: { type: 'boolean', desc: 'Print the result as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: [
    'check-take take.mp4',
    'check-take take.mp4 --json',
    'check-take take.mp4 --min-silence-ms 600 --scene-threshold 0.05',
  ],
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [file] }) => {
    const th = values['scene-threshold'];
    if (!(th > 0 && th < 1)) throw usageError(`--scene-threshold must be between 0 and 1, got ${th}`);
    if (values['min-silence-ms'] < 0) throw usageError(`--min-silence-ms must be >= 0, got ${values['min-silence-ms']}`);
    if (values['edge-ms'] < 0) throw usageError(`--edge-ms must be >= 0, got ${values['edge-ms']}`);
    if (values['noise-db'] >= 0) throw usageError(`--noise-db must be negative (dBFS), got ${values['noise-db']}`);
    requireFfmpeg();
    const r = checkTake(path.resolve(file), { minSilenceMs: values['min-silence-ms'], threshold: th, noiseDb: values['noise-db'], edgeMs: values['edge-ms'] });
    if (values.json) { process.stdout.write(JSON.stringify(r, null, 2) + '\n'); return r.ok ? EXIT.OK : EXIT.FAIL; }
    if (!r.cuts.length) process.stdout.write('note  no scene changes found\n');
    if (r.silentTrack) process.stdout.write('note  the audio is silent for the whole take (silent or captions-only): every scene change passes\n');
    for (const c of r.cuts) {
      process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  scene change at ${c.timecode} — ${c.gap ? `silence ${c.silenceMs} ms` : 'over sound'}${c.ok ? '' : c.edge ? ` (within ${r.edgeMs} ms of the silence edge)` : c.gap ? ` (need ≥ ${r.minSilenceMs} ms)` : ' (move it into a pause between clips)'}\n`);
    }
    const bad = r.cuts.filter((c) => !c.ok).length;
    process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.cuts.length} scene change(s) at threshold ${th}, ${bad} not in a ≥ ${r.minSilenceMs} ms silence — ${file}\n`);
    return r.ok ? EXIT.OK : EXIT.FAIL;
  });
}
