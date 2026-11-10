// Generated media for the video-assemble evals: an F1 project (plates.json + spine manifest
// from docs/build/fixtures/F1, a tone narration.wav that matches the manifest's clip windows,
// and three synthetic plate renders), plus synthetic music and SFX stems. Everything is made
// with ffmpeg lavfi sources in a temp dir — no media is committed or downloaded.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../helpers/run.mjs';

export const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
export const BRAND_DEFAULT = path.join(ROOT, 'brand-packs', 'default'); // the shipping pack F1 names

export function ff(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
  return r;
}

/** Speech-like tone (AM-modulated 220 Hz) inside each [startMs,endMs] window, silence elsewhere. */
export function toneWav(out, windows, totalMs, { rate = 24000 } = {}) {
  const on = windows.map(([a, b]) => `between(t,${a / 1000},${b / 1000})`).join('+');
  const expr = `if(${on},0.3*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*4*t)),0)`;
  ff(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${rate}:c=mono:d=${totalMs / 1000}`, '-c:a', 'pcm_s16le', out]);
  return out;
}

/** A plate render: testsrc2 pattern tinted per plate, H.264 High yuv420p, picture only. */
export function plateMp4(out, { durationMs, hue = 0, width = 1280, height = 720, fps = 30 }) {
  mkdirSync(path.dirname(out), { recursive: true });
  ff(['-f', 'lavfi', '-i', `testsrc2=s=${width}x${height}:r=${fps}:d=${durationMs / 1000}`, '-vf', `hue=h=${hue}`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20', out]);
  return out;
}

/**
 * Lay out an F1 video project in `dir`: plates.json (brand -> `brand`), spine/manifest.json,
 * spine/narration.wav (tones in each clip window unless `windows` is given), renders/plates/*.mp4.
 * `spine: 'beatgrid'` writes a beat-grid spine instead (no narration).
 */
export function makeF1Project(dir, { brand = BRAND_DEFAULT, windows, spine = 'narration', renders = true } = {}) {
  mkdirSync(path.join(dir, 'spine'), { recursive: true });
  const plates = JSON.parse(readFileSync(path.join(F1, 'plates.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(F1, 'spine', 'manifest.json'), 'utf8'));
  plates.brand = brand;
  if (spine === 'beatgrid') {
    plates.spine = 'spine/beatgrid.json';
    const grid = { schemaVersion: 1, kind: 'beatgrid', targetMs: manifest.targetMs, totalMs: manifest.totalMs, bpm: 120,
      beats: manifest.beats.map((b) => ({ id: b.id, startMs: b.startMs, durationMs: b.durationMs, clipNs: [], onScreenText: b.id })), clips: [] };
    writeFileSync(path.join(dir, 'spine', 'beatgrid.json'), JSON.stringify(grid, null, 2));
  } else {
    writeFileSync(path.join(dir, 'spine', 'manifest.json'), JSON.stringify(manifest, null, 2));
    toneWav(path.join(dir, 'spine', manifest.audio), windows ?? manifest.clips.map((c) => [c.startMs, c.startMs + c.durationMs]), manifest.totalMs);
  }
  writeFileSync(path.join(dir, 'plates.json'), JSON.stringify(plates, null, 2));
  if (renders) plates.plates.forEach((p, i) => plateMp4(path.join(dir, 'renders', 'plates', `${p.id}.mp4`), { durationMs: p.durationMs, hue: i * 120, fps: plates.fps, width: plates.width, height: plates.height }));
  return { dir, plates, manifest };
}

/** Synthetic music bed: an A-minor pad with a 2 Hz pulse, stereo 48 kHz, `seconds` long. */
export function musicWav(out, seconds = 22) {
  const expr = '0.18*(sin(2*PI*110*t)+0.7*sin(2*PI*130.81*t)+0.6*sin(2*PI*164.81*t)+0.4*sin(2*PI*220*t))*(0.55+0.45*pow(abs(sin(PI*2*t)),3))';
  ff(['-f', 'lavfi', '-i', `aevalsrc='${expr}|${expr.replace('110*t', '110.4*t')}':s=48000:d=${seconds}`, '-c:a', 'pcm_s16le', out]);
  return out;
}

/** Synthetic SFX stem: a noise whoosh into each cut time plus a low thud on it. */
export function sfxWav(out, hitsMs, seconds = 20) {
  const parts = hitsMs.map((ms) => {
    const t = ms / 1000;
    return `if(between(t,${t - 0.35},${t}),0.35*(random(0)*2-1)*pow((t-${t - 0.35})/0.35,2),0)+if(between(t,${t},${t + 0.25}),0.6*sin(2*PI*70*(t-${t}))*exp(-14*(t-${t})),0)`;
  });
  ff(['-f', 'lavfi', '-i', `aevalsrc='${parts.join('+')}':s=48000:c=stereo:d=${seconds}`, '-c:a', 'pcm_s16le', out]);
  return out;
}

