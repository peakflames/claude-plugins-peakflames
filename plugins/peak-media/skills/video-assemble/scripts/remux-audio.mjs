#!/usr/bin/env node
// remux-audio — lay music and/or SFX stems under the narration of a rendered MP4 without
// touching the picture: the video stream is copied (never re-encoded), narration is held
// at -16 LUFS, and music is ducked under the voice with a sidechain compressor.
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runCli, CliError, EXIT } from '../../../lib/cli.mjs';
import { ffmpeg, ffmpegBin, probe, fpsOf, requireFfmpeg } from '../../../lib/ffmpeg.mjs';
import { hasAudio, loudness, levelStem, silentStem, mixStems, duckedMusic, rmsDb, speechWindows } from './audio.mjs';

export const MIX_TAG = 'peak-media remux-audio';
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : n === -Infinity ? '-inf' : null);

/** md5 of the encoded video packets (`-map 0:v -c copy -f md5`). Unchanged by a remux. */
export function videoStreamMd5(file) {
  const r = spawnSync(ffmpegBin(), ['-v', 'error', '-nostdin', '-i', file, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-'], { encoding: 'utf8' });
  if (r.status !== 0) throw new CliError(`cannot read the video stream of ${file}`);
  return r.stdout.trim().replace(/^MD5=/, '');
}

/** Duration of the first video stream in ms (frames / fps when known). */
export function videoMs(file) {
  const info = probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new CliError(`${file} has no video stream`);
  const n = Number(v.nb_frames), fps = fpsOf(v);
  if (Number.isFinite(n) && n > 0 && fps) return Math.round((n / fps) * 1000);
  return Math.round(Number(v.duration ?? info.format.duration) * 1000);
}

const isMixed = (file) => String(probe(file).format.tags?.comment ?? '').startsWith(MIX_TAG);

/**
 * remuxAudio({video, out, music?, sfx?, narration?, narrationLufs, musicLufs, sfxDb, duck, fadeMs})
 * Returns the levels report.
 */
export function remuxAudio({ video, out, music, sfx, narration, narrationLufs = -16, musicLufs = -28, sfxDb = 0, duck = true, fadeMs = 1000 }) {
  if (!music && !sfx) throw new CliError('nothing to mix — pass --music and/or --sfx', EXIT.USAGE);
  for (const [flag, f] of [['video', video], ['--music', music], ['--sfx', sfx], ['--narration', narration]]) {
    if (f && !existsSync(f)) throw new CliError(`${flag === 'video' ? '' : `${flag} `}${f}: no such file`);
  }
  if (path.resolve(out) === path.resolve(video)) throw new CliError('--out must differ from the input video (the input keeps the narration-only mix)', EXIT.USAGE);
  for (const [flag, f] of [['--music', music], ['--sfx', sfx]]) if (f && !hasAudio(f)) throw new CliError(`${flag} ${f} has no audio stream`);
  const durationMs = videoMs(video);
  const narSrc = narration ?? video;
  if (!narration && isMixed(video)) {
    throw new CliError(`${video} already carries a music/SFX mix — remux from the narration-only review MP4, or pass --narration <file>`);
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-remux-'));
  try {
    const stem = (n) => path.join(tmp, `${n}.wav`);
    const nar = hasAudio(narSrc)
      ? levelStem(narSrc, stem('narration'), { durationMs, lufs: narrationLufs })
      : (silentStem(stem('narration'), durationMs), { gainDb: 0, lufs: -Infinity, truePeakDb: -Infinity });
    const mus = music && levelStem(music, stem('music'), { durationMs, lufs: musicLufs, fadeInMs: 300, fadeOutMs: fadeMs });
    const fx = sfx && levelStem(sfx, stem('sfx'), { durationMs, gainDb: sfxDb });
    mixStems({ narration: stem('narration'), music: music && stem('music'), sfx: sfx && stem('sfx'), out: stem('mix'), duck });

    const what = [music && 'music', sfx && 'sfx'].filter(Boolean).join('+');
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    ffmpeg(['-y', '-i', video, '-i', stem('mix'), '-map', '0:v:0', '-c:v', 'copy', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-metadata', `comment=${MIX_TAG}: narration+${what}`, '-movflags', '+faststart', out], { what: 'remux' });

    const before = videoStreamMd5(video), after = videoStreamMd5(out);
    if (before !== after) throw new CliError(`video stream changed during remux (md5 ${before} → ${after}) — please report this`);

    const report = {
      video, out, durationMs, videoMd5: after,
      narration: { source: narSrc, targetLufs: narrationLufs, gainDb: nar.gainDb, lufs: round1(nar.lufs), truePeakDb: round1(nar.truePeakDb) },
    };
    if (mus) {
      report.music = { source: music, targetLufs: musicLufs, gainDb: mus.gainDb, lufs: round1(mus.lufs), ducked: duck };
      const windows = Number.isFinite(nar.lufs) ? speechWindows(stem('narration'), durationMs) : [];
      if (duck && windows.length) {
        duckedMusic({ narration: stem('narration'), music: stem('music'), out: stem('ducked') });
        const gaps = [];
        let t = 0;
        for (const w of windows) { if (w.startMs - t > 300) gaps.push({ startMs: t, endMs: w.startMs }); t = w.endMs; }
        if (durationMs - t > 300) gaps.push({ startMs: t, endMs: durationMs });
        // skip the fade-in/out so the gap level is the bed's real level
        const inner = gaps.map((g) => ({ startMs: Math.max(g.startMs, 400), endMs: Math.min(g.endMs, durationMs - fadeMs - 100) })).filter((g) => g.endMs - g.startMs > 150);
        // measure speech windows after the compressor's attack has settled
        const settled = windows.map((w) => ({ startMs: w.startMs + 200, endMs: w.endMs })).filter((w) => w.endMs - w.startMs > 150);
        const avg = (ws) => { const v = ws.map((w) => rmsDb(stem('ducked'), w.startMs, w.endMs)).filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        const under = avg(settled), clear = avg(inner);
        report.music.underVoiceRmsDb = round1(under);
        report.music.inGapsRmsDb = round1(clear);
        report.music.duckDb = under !== null && clear !== null ? round1(clear - under) : null;
        report.music.speechWindows = windows;
      }
    }
    if (fx) report.sfx = { source: sfx, gainDb: fx.gainDb, lufs: round1(fx.lufs), truePeakDb: round1(fx.truePeakDb) };
    const m = loudness(out);
    report.mix = { lufs: round1(m.lufs), truePeakDb: round1(m.truePeakDb) };
    return report;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export const spec = {
  name: 'remux-audio',
  summary: 'lay music/SFX stems under the narration of a rendered MP4 (video copied, never re-encoded)',
  usage: 'remux-audio <video.mp4> --out <file.mp4> [--music <file>] [--sfx <file>] [options]',
  description: `
The input's audio is the narration (or pass --narration). It is levelled to --narration-lufs,
the music bed to --music-lufs and ducked under the voice by a sidechain compressor, and the
SFX stem is added at --sfx-db. Stems are timeline-aligned from 0 and trimmed or padded to the
video length. The video stream is copied: its md5 (-map 0:v -c copy -f md5) is unchanged.
Run each pass (music, then music + SFX) from the narration-only review MP4.`,
  options: {
    out: { type: 'string', short: 'o', arg: 'file.mp4', desc: 'Output MP4 (must differ from the input)' },
    music: { type: 'string', arg: 'file', desc: 'Music bed stem (any audio file ffmpeg reads)' },
    sfx: { type: 'string', arg: 'file', desc: 'SFX stem, already placed on the timeline' },
    narration: { type: 'string', arg: 'file', desc: 'Narration source (default: the input video\'s audio)' },
    'narration-lufs': { type: 'number', arg: 'LUFS', desc: 'Narration loudness', default: -16 },
    'music-lufs': { type: 'number', arg: 'LUFS', desc: 'Music bed loudness before ducking', default: -28 },
    'sfx-db': { type: 'number', arg: 'dB', desc: 'Gain applied to the SFX stem', default: 0 },
    'no-duck': { type: 'boolean', desc: 'Do not duck the music under the narration' },
    'fade-ms': { type: 'number', arg: 'ms', desc: 'Music fade-out at the end', default: 1000 },
    levels: { type: 'string', arg: 'file.json', desc: 'Also write the levels report (LUFS, true peak, ducking) here' },
    json: { type: 'boolean', desc: 'Print the levels report as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: [
    'remux-audio review/review.mp4 --music audio/music.wav -o review/review-music.mp4',
    'remux-audio review/review.mp4 --music audio/music.wav --sfx audio/sfx.wav -o review/review-mix.mp4 --levels review/levels.json',
  ],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [video] }) => {
    if (!values.out) throw new CliError('--out <file.mp4> is required', EXIT.USAGE);
    if (!values.music && !values.sfx) throw new CliError('nothing to mix — pass --music and/or --sfx', EXIT.USAGE);
    if (!existsSync(video)) throw new CliError(`cannot read ${video}: no such file`);
    if (!(values['fade-ms'] >= 0)) throw new CliError('--fade-ms must be >= 0', EXIT.USAGE);
    if (values['narration-lufs'] >= 0 || values['music-lufs'] >= 0) throw new CliError('--narration-lufs and --music-lufs must be negative (e.g. -16)', EXIT.USAGE);
    requireFfmpeg();
    const r = remuxAudio({ video, out: values.out, music: values.music, sfx: values.sfx, narration: values.narration,
      narrationLufs: values['narration-lufs'], musicLufs: values['music-lufs'], sfxDb: values['sfx-db'], duck: !values['no-duck'], fadeMs: values['fade-ms'] });
    if (values.levels) { mkdirSync(path.dirname(path.resolve(values.levels)), { recursive: true }); writeFileSync(values.levels, JSON.stringify(r, null, 2) + '\n'); }
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      process.stdout.write(`narration ${r.narration.lufs} LUFS (gain ${r.narration.gainDb} dB)\n`);
      if (r.music) process.stdout.write(`music     ${r.music.lufs} LUFS before ducking${r.music.duckDb != null ? `, ducked ${r.music.duckDb} dB under voice` : ''}\n`);
      if (r.sfx) process.stdout.write(`sfx       ${r.sfx.lufs} LUFS (gain ${r.sfx.gainDb} dB)\n`);
      process.stdout.write(`mix       ${r.mix.lufs} LUFS, true peak ${r.mix.truePeakDb} dBFS\nvideo     copied (md5 ${r.videoMd5})\n${r.out}\n`);
    }
    return EXIT.OK;
  });
}
