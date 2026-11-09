// Audio helpers shared by assemble and remux-audio: loudness measurement (EBU R128),
// gain to a LUFS target, and the stem mix (narration + ducked music + SFX).
// Every intermediate is 48 kHz stereo float WAV so nothing clips between steps.
import { ffmpeg, probe } from '../../../lib/ffmpeg.mjs';
import { CliError } from '../../../lib/cli.mjs';

export const RATE = 48000;
export const TP_LIMIT_DB = -1; // true-peak ceiling for every stem and the mix
const FMT = `aresample=${RATE},aformat=sample_fmts=fltp:sample_rates=${RATE}:channel_layouts=stereo`;
const WAV = ['-c:a', 'pcm_f32le', '-ar', String(RATE), '-ac', '2'];
const dbToLin = (db) => 10 ** (db / 20);
const sec = (ms) => (ms / 1000).toFixed(6);

/** True when the file has an audio stream. */
export function hasAudio(file) {
  return probe(file).streams.some((s) => s.codec_type === 'audio');
}

/**
 * EBU R128 integrated loudness and true peak of the first audio stream (optionally a
 * window). Returns {lufs, truePeakDb}; lufs is -Infinity for silence (at or below the -70 LUFS gate).
 */
export function loudness(file, { startMs, endMs } = {}) {
  const trim = startMs !== undefined ? `atrim=start=${sec(startMs)}${endMs !== undefined ? `:end=${sec(endMs)}` : ''},` : '';
  const { stderr } = ffmpeg(['-i', file, '-map', '0:a:0', '-af', `${trim}${FMT},ebur128=peak=true`, '-f', 'null', '-'], { what: `loudness of ${file}` });
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = re.exec(summary); return m ? (/inf/i.test(m[1]) ? -Infinity : Number(m[1])) : NaN; };
  const lufs = num(/I:\s*(-?inf|-?[\d.]+)\s*LUFS/i);
  const truePeakDb = num(/Peak:\s*(-?inf|-?[\d.]+)\s*dBFS/i);
  if (Number.isNaN(lufs)) throw new CliError(`could not measure the loudness of ${file}`);
  // ebur128 reports its -70 LUFS absolute gate for silence
  return { lufs: lufs <= -70 ? -Infinity : lufs, truePeakDb };
}

/** Mean RMS level (dBFS) of a window, from ffmpeg volumedetect. -Infinity when silent. */
export function rmsDb(file, startMs, endMs) {
  const { stderr } = ffmpeg(['-i', file, '-map', '0:a:0', '-af', `atrim=start=${sec(startMs)}:end=${sec(endMs)},volumedetect`, '-f', 'null', '-'], { what: 'level measurement' });
  const m = /mean_volume:\s*(-?inf|-?[\d.]+)\s*dB/.exec(stderr);
  return !m || /inf/.test(m[1]) ? -Infinity : Number(m[1]);
}

/** Speech intervals [{startMs,endMs}]: the complement of silences ≥ 200 ms at ≤ -40 dB. */
export function speechWindows(file, durMs) {
  const { stderr } = ffmpeg(['-i', file, '-map', '0:a:0', '-af', 'silencedetect=noise=-40dB:d=0.2', '-f', 'null', '-'], { what: 'speech detection' });
  const sil = [];
  let start = null;
  for (const line of stderr.split('\n')) {
    let m = /silence_start: (-?[\d.]+)/.exec(line);
    if (m) { start = Math.max(0, Number(m[1]) * 1000); continue; }
    m = /silence_end: ([\d.]+)/.exec(line);
    if (m && start !== null) { sil.push([start, Number(m[1]) * 1000]); start = null; }
  }
  if (start !== null) sil.push([start, durMs]);
  const out = [];
  let t = 0;
  for (const [a, b] of sil) { if (a - t > 50) out.push({ startMs: Math.round(t), endMs: Math.round(a) }); t = b; }
  if (durMs - t > 50) out.push({ startMs: Math.round(t), endMs: Math.round(durMs) });
  return out;
}

/**
 * Write `src` (first audio stream) as a 48 kHz stereo float WAV exactly durationMs long,
 * shifted by offsetMs, with gain so its integrated loudness is `lufs` (null = no gain).
 * A limiter holds true peak under TP_LIMIT_DB only if the gain would push it over.
 * Returns {gainDb, lufs, truePeakDb} measured on the written file.
 */
export function levelStem(src, out, { durationMs, lufs = null, gainDb = 0, offsetMs = 0, fadeInMs = 0, fadeOutMs = 0 } = {}) {
  let gain = gainDb;
  let limit = false;
  if (lufs !== null) {
    const m = loudness(src);
    if (Number.isFinite(m.lufs)) {
      gain = lufs - m.lufs;
      limit = m.truePeakDb + gain > TP_LIMIT_DB;
    } else gain = 0; // silence stays silence
  }
  const f = [];
  if (offsetMs > 0) f.push(`adelay=delays=${Math.round(offsetMs)}:all=1`);
  if (offsetMs < 0) f.push(`atrim=start=${sec(-offsetMs)}`, 'asetpts=PTS-STARTPTS');
  f.push(FMT, `volume=${gain.toFixed(3)}dB`);
  if (limit) f.push(`alimiter=limit=${dbToLin(TP_LIMIT_DB - 0.5).toFixed(4)}:level=false:latency=true:attack=5:release=80`);
  f.push(`apad=whole_dur=${sec(durationMs)}`, `atrim=end=${sec(durationMs)}`);
  if (fadeInMs > 0) f.push(`afade=t=in:st=0:d=${sec(fadeInMs)}`);
  if (fadeOutMs > 0) f.push(`afade=t=out:st=${sec(Math.max(0, durationMs - fadeOutMs))}:d=${sec(fadeOutMs)}`);
  ffmpeg(['-y', '-i', src, '-map', '0:a:0', '-af', f.join(','), ...WAV, out], { what: `levelling ${src}` });
  return { gainDb: Number(gain.toFixed(2)), ...loudness(out) };
}

/** durationMs of digital silence as a stem WAV. */
export function silentStem(out, durationMs) {
  ffmpeg(['-y', '-f', 'lavfi', '-i', `anullsrc=r=${RATE}:cl=stereo`, '-t', sec(durationMs), ...WAV, out], { what: 'silent stem' });
  return out;
}

// Sidechain ducking: music drops by about 14 dB (measured on F1) while the narration key is above about
// -32 dBFS, and recovers over 400 ms in the gaps.
export const DUCK = { threshold: 0.025, ratio: 5, attack: 20, release: 400, knee: 2.5 };

/**
 * Mix levelled stems (all same length, 48 kHz stereo float WAVs): narration on top, music
 * ducked by the narration (sidechain), SFX as-is. A true-peak limiter guards the sum.
 */
export function mixStems({ narration, music, sfx, out, duck = true }) {
  const inputs = [narration, music, sfx].filter(Boolean);
  const args = ['-y'];
  inputs.forEach((f) => args.push('-i', f));
  let i = 1;
  const chain = [];
  const parts = [];
  if (music && duck) {
    chain.push(`[0:a]asplit=2[nar][key]`, `[${i}:a][key]sidechaincompress=threshold=${DUCK.threshold}:ratio=${DUCK.ratio}:attack=${DUCK.attack}:release=${DUCK.release}:knee=${DUCK.knee}[mus]`);
    parts.push('[nar]', '[mus]'); i++;
  } else {
    parts.push('[0:a]');
    if (music) { parts.push(`[${i}:a]`); i++; }
  }
  if (sfx) { parts.push(`[${i}:a]`); i++; }
  chain.push(`${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=first:dropout_transition=0,alimiter=limit=${dbToLin(TP_LIMIT_DB - 0.5).toFixed(4)}:level=false:latency=true:attack=5:release=80[mix]`);
  args.push('-filter_complex', chain.join(';'), '-map', '[mix]', ...WAV, out);
  ffmpeg(args, { what: 'stem mix' });
  return out;
}

/** The ducked music alone (for level reports): same sidechain as mixStems. */
export function duckedMusic({ narration, music, out }) {
  ffmpeg(['-y', '-i', narration, '-i', music, '-filter_complex',
    `[1:a][0:a]sidechaincompress=threshold=${DUCK.threshold}:ratio=${DUCK.ratio}:attack=${DUCK.attack}:release=${DUCK.release}:knee=${DUCK.knee}[mus]`,
    '-map', '[mus]', ...WAV, out], { what: 'ducked music' });
  return out;
}
