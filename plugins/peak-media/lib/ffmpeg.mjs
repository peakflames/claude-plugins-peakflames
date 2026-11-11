// ffmpeg / ffprobe access. PEAK_MEDIA_FFMPEG / PEAK_MEDIA_FFPROBE override the
// binaries (tests point them at a missing path to simulate "not installed").
import { spawnSync } from 'node:child_process';
import { CliError, EXIT } from './cli.mjs';
import { runWatched, stepTimeoutMs, fmtDuration } from './watchdog.mjs';

// Watchdog defaults (PEAK_MEDIA_STEP_TIMEOUT_S overrides): far above any real encode or probe here.
const FFMPEG_TIMEOUT_MS = 30 * 60_000;
const FFPROBE_TIMEOUT_MS = 2 * 60_000;
const timedOut = (what, ms) => new CliError(`${what} timed out after ${fmtDuration(ms)} with no exit — stopped it; if the input is very long, raise PEAK_MEDIA_STEP_TIMEOUT_S`);

export const ffmpegBin = () => process.env.PEAK_MEDIA_FFMPEG || 'ffmpeg';
export const ffprobeBin = () => process.env.PEAK_MEDIA_FFPROBE || 'ffprobe';

/** How to install ffmpeg, one line for every supported OS (DEC-52). setup.mjs prints it too. */
export const FFMPEG_INSTALL = 'install it (macOS: brew install ffmpeg · Windows: winget install Gyan.FFmpeg · Linux: sudo apt-get install ffmpeg)';
const INSTALL_HINT = `${FFMPEG_INSTALL} or set PEAK_MEDIA_FFMPEG/PEAK_MEDIA_FFPROBE`;

export function hasBinary(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

/** Throws a one-line CliError if ffmpeg or ffprobe is missing. */
export function requireFfmpeg() {
  for (const [name, bin] of [['ffmpeg', ffmpegBin()], ['ffprobe', ffprobeBin()]]) {
    if (!hasBinary(bin)) throw new CliError(`${name} not found — ${INSTALL_HINT}`, EXIT.MISSING_PREREQ);
  }
}

function lastLine(s) {
  return (s || '').trim().split('\n').filter(Boolean).at(-1) ?? '';
}

/** Run ffmpeg with args; returns {stdout, stderr}. Throws CliError on failure. */
export function ffmpeg(args, { what = 'ffmpeg', input } = {}) {
  const ms = stepTimeoutMs(FFMPEG_TIMEOUT_MS);
  const r = runWatched(ffmpegBin(), ['-hide_banner', '-nostdin', ...args], { input, timeoutMs: ms });
  if (r.timedOut) throw timedOut(what, ms);
  if (r.error) throw new CliError(`ffmpeg not found — ${INSTALL_HINT}`, EXIT.MISSING_PREREQ);
  if (r.status !== 0) throw new CliError(`${what} failed: ${lastLine(r.stderr)}`);
  return { stdout: r.stdout, stderr: r.stderr };
}

/** ffprobe -show_streams -show_format as JSON. */
export function probe(file) {
  const ms = stepTimeoutMs(FFPROBE_TIMEOUT_MS);
  const r = runWatched(ffprobeBin(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeoutMs: ms });
  if (r.timedOut) throw timedOut(`ffprobe of ${file}`, ms);
  if (r.error) throw new CliError(`ffprobe not found — ${INSTALL_HINT}`, EXIT.MISSING_PREREQ);
  if (r.status !== 0) throw new CliError(`cannot read ${file} as media: ${lastLine(r.stderr) || 'ffprobe failed'}`);
  return JSON.parse(r.stdout);
}

/** Media duration in ms (format duration). */
export function durationMs(file) {
  return Math.round(Number(probe(file).format.duration) * 1000);
}

/** Frame rate of the first video stream as a number. */
export function fpsOf(stream) {
  const [n, d] = String(stream.avg_frame_rate || stream.r_frame_rate).split('/').map(Number);
  return d ? n / d : n;
}

/** Seconds -> "m:ss.mmm" for messages. */
export function tc(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
}
