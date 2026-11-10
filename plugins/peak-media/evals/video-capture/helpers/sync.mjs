// A/V sync measurement for AC-REC-06 (web2video D8). The picture side is the first frame showing
// each new full-frame colour; the sound side is each tone onset (fake/tone clips are at full level
// from sample 0, so the end of the silence before a tone is its first sample).
import { spawnSync } from 'node:child_process';

/** Mean RGB of the top half of every frame of the first video stream (clear of a bottom caption). */
export function frameColours(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-vf', 'crop=iw:ih/2:0:0,scale=4:4:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`frame decode failed: ${r.stderr}`);
  const per = 4 * 4 * 3;
  const out = [];
  for (let off = 0; off + per <= r.stdout.length; off += per) {
    const sum = [0, 0, 0];
    for (let i = 0; i < per; i += 3) for (let c = 0; c < 3; c++) sum[c] += r.stdout[off + i + c];
    out.push(sum.map((s) => s / 16));
  }
  return out;
}

/** Tone onsets in ms: the end of every silence (≤ -40 dB, ≥ 200 ms) that is followed by sound. */
export function toneOnsets(file) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-map', '0:a:0', '-af', 'silencedetect=noise=-40dB:d=0.2', '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`silencedetect failed: ${r.stderr}`);
  return [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Pair each colour's first frame with its tone onset. colours: [{name, rgb}] in say() order.
 * Returns {fps, rows:[{name, flipFrame, flipMs, onsetMs, offsetMs}], medianMs, worstMs}.
 * offsetMs > 0 means the picture lags the sound. A frame time is quantized to the frame grid, so
 * each offset carries up to ±½ frame of rounding (WP7a verify-1, nit 2).
 */
export function measureSync(file, colours, fps) {
  const frames = frameColours(file);
  const endMs = (frames.length * 1000) / fps;
  const onsets = toneOnsets(file).filter((ms) => ms < endMs - 50); // silencedetect also closes a silence at end of file
  const rows = [];
  let from = 0;
  colours.forEach((c, i) => {
    let k = -1;
    for (let j = from; j < frames.length; j++) if (dist(frames[j], c.rgb) < 60) { k = j; break; }
    const flipMs = k >= 0 ? (k * 1000) / fps : null;
    const onsetMs = onsets[i] ?? null;
    rows.push({ name: c.name, flipFrame: k, flipMs: flipMs === null ? null : Number(flipMs.toFixed(1)), onsetMs: onsetMs === null ? null : Number(onsetMs.toFixed(1)), offsetMs: flipMs === null || onsetMs === null ? null : Number((flipMs - onsetMs).toFixed(1)) });
    if (k >= 0) from = k;
  });
  const offs = rows.map((r) => r.offsetMs).filter((x) => x !== null).sort((a, b) => a - b);
  const mid = offs.length ? (offs.length % 2 ? offs[(offs.length - 1) / 2] : (offs[offs.length / 2 - 1] + offs[offs.length / 2]) / 2) : null;
  const worst = offs.length ? offs.reduce((w, x) => (Math.abs(x) > Math.abs(w) ? x : w), 0) : null;
  return { fps, onsets: onsets.map((x) => Number(x.toFixed(1))), rows, medianMs: mid, worstMs: worst };
}
