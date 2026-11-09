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
import { hasAudio, loudness, levelStem, silentStem, mixStems, duckStem, duckWindows, speechWindows, DUCK } from './audio.mjs';

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
 * remuxAudio({video, out, music?, sfx?, narration?, narrationLufs, musicLufs, duckDb, sfxLufs, sfxDb, duck, fadeMs})
 * Returns the levels report.
 */
export const DEFAULTS = { narrationLufs: -16, musicLufs: -28, duckDb: 6, sfxLufs: -20, sfxDb: 0, fadeMs: 1000 };
export function remuxAudio({ video, out, music, sfx, narration, narrationLufs = DEFAULTS.narrationLufs, musicLufs = DEFAULTS.musicLufs, duckDb = DEFAULTS.duckDb,
  sfxLufs = DEFAULTS.sfxLufs, sfxDb = DEFAULTS.sfxDb, duck = true, fadeMs = DEFAULTS.fadeMs }) {
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
    // the bed sits at musicLufs under the voice, so between lines it is duckDb louder
    const duckBy = duck ? duckDb : 0;
    const windows = music && Number.isFinite(nar.lufs) ? duckWindows(speechWindows(stem('narration'), durationMs)) : [];
    const mus = music && levelStem(music, stem('music-bed'), { durationMs, lufs: musicLufs + duckBy, fadeInMs: 300, fadeOutMs: fadeMs });
    if (music) duckStem(stem('music-bed'), stem('music'), windows, duckBy);
    const fx = sfx && levelStem(sfx, stem('sfx'), { durationMs, lufs: sfxLufs + sfxDb });
    mixStems({ narration: stem('narration'), music: music && stem('music'), sfx: sfx && stem('sfx'), out: stem('mix') });

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
      report.music = { source: music, underVoiceTargetLufs: musicLufs, duckDb: duckBy, bedLufs: round1(mus.lufs), gainDb: mus.gainDb, duckWindows: windows };
      // measured: music vs narration loudness inside each spoken window (≥ 400 ms for ebur128)
      const inner = windows.map((w) => ({ startMs: w.startMs + DUCK.attackMs, endMs: w.endMs })).filter((w) => w.endMs - w.startMs >= 400);
      const per = inner.map((w) => ({ ...w, voiceLufs: loudness(stem('narration'), w).lufs, musicLufs: loudness(stem('music'), w).lufs }))
        .filter((w) => Number.isFinite(w.voiceLufs) && Number.isFinite(w.musicLufs));
      if (per.length) {
        const mean = (k) => per.reduce((a, w) => a + w[k], 0) / per.length;
        report.music.underVoiceLufs = round1(mean('musicLufs'));
        report.music.belowVoiceDb = round1(mean('voiceLufs') - mean('musicLufs'));
      }
    }
    if (fx) report.sfx = { source: sfx, targetLufs: sfxLufs + sfxDb, gainDb: fx.gainDb, lufs: round1(fx.lufs), truePeakDb: round1(fx.truePeakDb) };
    const m = loudness(out);
    report.mix = { lufs: round1(m.lufs), truePeakDb: round1(m.truePeakDb) };
    return report;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Usage checks shared with assemble: LUFS targets negative, duck and fade non-negative. */
export function checkLevels(values) {
  for (const k of ['narration-lufs', 'music-lufs', 'sfx-lufs']) {
    if (values[k] !== undefined && values[k] >= 0) throw new CliError(`--${k} must be negative (e.g. -16)`, EXIT.USAGE);
  }
  if (values['duck-db'] !== undefined && !(values['duck-db'] >= 0)) throw new CliError('--duck-db must be >= 0', EXIT.USAGE);
}

export const spec = {
  name: 'remux-audio',
  summary: 'lay music/SFX stems under the narration of a rendered MP4 (video copied, never re-encoded)',
  usage: 'remux-audio <video.mp4> --out <file.mp4> [--music <file>] [--sfx <file>] [options]',
  description: `
The input's audio is the narration (or pass --narration), levelled to --narration-lufs.
The music bed sits at --music-lufs under the voice and rises by --duck-db between lines
(the duck starts 150 ms before each spoken line and releases over 350 ms). Each SFX hit is
levelled to about --sfx-lufs, plus --sfx-db. A true-peak limiter (-1.5 dBFS) guards the mix.
Stems are timeline-aligned from 0 and trimmed or padded to the video length. The video
stream is copied: its md5 (-map 0:v -c copy -f md5) is unchanged.
Run each pass (music, then music + SFX) from the narration-only review MP4.`,
  options: {
    out: { type: 'string', short: 'o', arg: 'file.mp4', desc: 'Output MP4 (must differ from the input)' },
    music: { type: 'string', arg: 'file', desc: 'Music bed stem (any audio file ffmpeg reads)' },
    sfx: { type: 'string', arg: 'file', desc: 'SFX stem, already placed on the timeline' },
    narration: { type: 'string', arg: 'file', desc: 'Narration source (default: the input video\'s audio)' },
    'narration-lufs': { type: 'number', arg: 'LUFS', desc: 'Narration loudness', default: DEFAULTS.narrationLufs },
    'music-lufs': { type: 'number', arg: 'LUFS', desc: 'Music loudness under the narration (after ducking)', default: DEFAULTS.musicLufs },
    'duck-db': { type: 'number', arg: 'dB', desc: 'How much quieter the music is under the voice than between lines', default: DEFAULTS.duckDb },
    'sfx-lufs': { type: 'number', arg: 'LUFS', desc: 'Loudness of each SFX hit (gated, so silence between hits does not count)', default: DEFAULTS.sfxLufs },
    'sfx-db': { type: 'number', arg: 'dB', desc: 'Extra gain on the SFX stem after --sfx-lufs', default: DEFAULTS.sfxDb },
    'no-duck': { type: 'boolean', desc: 'Do not duck the music under the narration (same as --duck-db 0)' },
    'fade-ms': { type: 'number', arg: 'ms', desc: 'Music fade-out at the end', default: DEFAULTS.fadeMs },
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
    checkLevels(values);
    requireFfmpeg();
    const r = remuxAudio({ video, out: values.out, music: values.music, sfx: values.sfx, narration: values.narration,
      narrationLufs: values['narration-lufs'], musicLufs: values['music-lufs'], duckDb: values['duck-db'], sfxLufs: values['sfx-lufs'], sfxDb: values['sfx-db'],
      duck: !values['no-duck'], fadeMs: values['fade-ms'] });
    if (values.levels) { mkdirSync(path.dirname(path.resolve(values.levels)), { recursive: true }); writeFileSync(values.levels, JSON.stringify(r, null, 2) + '\n'); }
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      process.stdout.write(`narration ${r.narration.lufs} LUFS (gain ${r.narration.gainDb} dB)\n`);
      if (r.music) process.stdout.write(`music     ${r.music.underVoiceLufs ?? r.music.bedLufs} LUFS under the voice${r.music.belowVoiceDb != null ? ` (${r.music.belowVoiceDb} dB below it)` : ''}, +${r.music.duckDb} dB between lines\n`);
      if (r.sfx) process.stdout.write(`sfx       ${r.sfx.lufs} LUFS (gain ${r.sfx.gainDb} dB)\n`);
      process.stdout.write(`mix       ${r.mix.lufs} LUFS, true peak ${r.mix.truePeakDb} dBFS\nvideo     copied (md5 ${r.videoMd5})\n${r.out}\n`);
    }
    return EXIT.OK;
  });
}
