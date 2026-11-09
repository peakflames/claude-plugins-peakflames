#!/usr/bin/env node
// assemble — composite every rendered plate onto the spine at its startMs, lay the spine
// narration (or silence for a beat grid) under it at -16 LUFS, check that every plate cut
// lands in silence, optionally remux music/SFX stems (video copied), append the brand
// outro and export out/final.mp4 to the delivery spec.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, readdirSync, statSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runCli, CliError, EXIT } from '../../../lib/cli.mjs';
import { validateFile } from '../../../lib/schemas.mjs';
import { ffmpeg, probe, fpsOf, requireFfmpeg } from '../../../lib/ffmpeg.mjs';
import { preflight } from '../../../lib/preflight.mjs';
import { render, gsapPath } from '../../../lib/hf.mjs';
import { probeSpec } from '../../../lib/verify/probe-spec.mjs';
import { checkCuts } from '../../../lib/verify/check-cuts.mjs';
import { levelStem, silentStem } from './audio.mjs';
import { remuxAudio, videoMs } from './remux-audio.mjs';

export const EXPORTS = { source: null, '1080p60': { width: 1920, height: 1080, fps: 60 } };
const NARRATION_LUFS = -16;
const X264 = (crf) => ['-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', String(crf)];
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000'];
const rel = (from, p) => path.relative(from, p) || '.';
const fail = (file, v) => new CliError(`${file}: ${v.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
const frames = (ms, fps) => Math.round((ms * fps) / 1000);

/** Load and validate plates.json, its spine and its brand pack. */
export async function loadProject(input, { brand } = {}) {
  const platesFile = existsSync(input) && statSync(input).isDirectory() ? path.join(input, 'plates.json') : input;
  if (!existsSync(platesFile)) throw new CliError(`no plates.json at ${input} — pass the video project folder or its plates.json`);
  if (!platesFile.endsWith('.json')) throw new CliError(`${input} is not a plates.json — pass the video project folder or its plates.json`);
  const project = path.dirname(path.resolve(platesFile));
  const pv = await validateFile(platesFile, 'plates');
  if (!pv.ok) throw fail(platesFile, pv);
  const plates = JSON.parse(readFileSync(platesFile, 'utf8'));
  const spineFile = path.resolve(project, plates.spine);
  const sv = await validateFile(spineFile, 'spine');
  if (!sv.ok) throw fail(spineFile, sv);
  const spine = JSON.parse(readFileSync(spineFile, 'utf8'));
  let brandDir = path.resolve(brand ?? path.resolve(project, plates.brand));
  if (brandDir.endsWith('.json')) brandDir = path.dirname(brandDir);
  if (!existsSync(brandDir)) throw new CliError(`brand pack not found: ${brandDir} — pass --brand <pack folder>`);
  const bv = await validateFile(brandDir, 'brand');
  if (!bv.ok) throw fail(path.join(brandDir, 'brand.json'), bv);
  const brandDoc = JSON.parse(readFileSync(path.join(brandDir, 'brand.json'), 'utf8'));
  const sorted = [...plates.plates].sort((a, b) => a.startMs - b.startMs);
  const last = sorted.at(-1);
  if (last.startMs + last.durationMs > spine.totalMs) {
    throw new CliError(`plate '${last.id}' ends at ${last.startMs + last.durationMs} ms, past the spine's totalMs ${spine.totalMs}`);
  }
  return { project, platesFile, plates, sorted, spineFile, spine, brandDir, brand: brandDoc };
}

/** Each plate's render must exist, match the plate size and last durationMs ±1 frame. */
export function checkRenders({ sorted, plates }, rendersDir) {
  const { fps, width, height } = plates;
  return sorted.map((p) => {
    const mp4 = path.join(rendersDir, `${p.id}.mp4`);
    const how = p.kind === 'live' ? 'video-capture' : 'video-plates render-plate';
    if (!existsSync(mp4)) throw new CliError(`plate '${p.id}': no render at ${mp4} — render it with ${how}`);
    const v = probe(mp4).streams.find((s) => s.codec_type === 'video');
    if (!v) throw new CliError(`plate '${p.id}': ${mp4} has no video stream — re-render it with ${how}`);
    if (v.width !== width || v.height !== height) throw new CliError(`plate '${p.id}': render is ${v.width}x${v.height}, plates.json says ${width}x${height} — re-render it`);
    const ms = videoMs(mp4);
    if (Math.abs(ms - p.durationMs) > 1000 / fps + 0.5) throw new CliError(`plate '${p.id}': render lasts ${ms} ms, planned ${p.durationMs} ms (±1 frame) — re-render it`);
    return { plate: p, mp4, ms, srcFps: fpsOf(v) };
  });
}

/** Picture timeline: plates at their start frames, black between them, exactly totalMs. */
function compositeVideoGraph(renders, { fps, width, height, totalMs }) {
  const total = frames(totalMs, fps);
  const norm = `fps=${fps},setsar=1,format=yuv420p`;
  const segs = [];
  const chain = [];
  let at = 0, g = 0;
  const gap = (n) => { chain.push(`color=c=black:s=${width}x${height}:r=${fps},${norm},trim=end_frame=${n},setpts=PTS-STARTPTS[g${g}]`); segs.push(`[g${g++}]`); };
  renders.forEach((r, i) => {
    const s = Math.min(frames(r.plate.startMs, fps), total);
    const e = Math.min(frames(r.plate.startMs + r.plate.durationMs, fps), total);
    if (s > at) gap(s - at);
    const n = e - Math.max(s, at);
    if (n <= 0) return;
    chain.push(`[${i}:v]setpts=PTS-STARTPTS,${norm},tpad=stop_mode=clone:stop=${n},trim=end_frame=${n},setpts=PTS-STARTPTS[s${i}]`);
    segs.push(`[s${i}]`);
    at = Math.max(s, at) + n;
  });
  if (total > at) gap(total - at);
  chain.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0[v]`);
  return { graph: chain.join(';'), totalFrames: total };
}

function filesUnder(dir) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d).sort()) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else out.push(p); } };
  walk(dir);
  return out;
}

/**
 * The brand outro as an MP4: a supplied file, a cached render keyed on the pack's bytes
 * and the fps, or a fresh HyperFrames render (GSAP is staged into the outro folder if the
 * composition loads vendor/gsap.min.js and the pack doesn't ship it, per DEC-09).
 */
export function outroRender({ brandDir, brand, fps, cacheDir, outro, rerender = false, renderWrap }) {
  if (outro) {
    if (!existsSync(outro)) throw new CliError(`--outro ${outro}: no such file`);
    return { mp4: path.resolve(outro), source: 'given' };
  }
  const comp = path.resolve(brandDir, brand.outro.composition);
  const compDir = statSync(comp).isDirectory() ? comp : path.dirname(comp);
  const h = createHash('sha256').update(`fps=${fps}\0`);
  for (const f of filesUnder(brandDir)) h.update(path.relative(brandDir, f)).update('\0').update(readFileSync(f)).update('\0');
  const key = h.digest('hex').slice(0, 16);
  const mp4 = path.join(cacheDir, `outro-${key}.mp4`);
  if (existsSync(mp4) && !rerender) return { mp4, source: 'cache', key };
  preflight({ ffmpeg: true, hyperframes: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-outro-'));
  try {
    const stage = path.join(tmp, 'brand');
    cpSync(brandDir, stage, { recursive: true });
    const stagedComp = path.join(stage, path.relative(brandDir, compDir));
    const html = path.join(stagedComp, 'index.html');
    if (existsSync(html) && /vendor\/gsap(\.min)?\.js/.test(readFileSync(html, 'utf8')) && !existsSync(path.join(stagedComp, 'vendor', 'gsap.min.js'))) {
      mkdirSync(path.join(stagedComp, 'vendor'), { recursive: true });
      cpSync(gsapPath(), path.join(stagedComp, 'vendor', 'gsap.min.js'));
    }
    mkdirSync(cacheDir, { recursive: true });
    const part = path.join(tmp, 'outro.mp4');
    render(stagedComp, part, { fps, wrap: renderWrap });
    cpSync(part, mp4);
    return { mp4, source: 'render', key };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Plate boundaries strictly inside the spine (every start and end), deduplicated. */
export function plateCuts(sorted, totalMs) {
  const set = new Set();
  for (const p of sorted) for (const t of [p.startMs, p.startMs + p.durationMs]) if (t > 0 && t < totalMs) set.add(t);
  return [...set].sort((a, b) => a - b);
}

export async function assemble({ input, brand, renders, out, music, sfx, musicLufs = -28, sfxDb = 0, exportPreset = 'source', minSilenceMs = 300, outro, rerenderOutro = false, renderWrap, log = () => {} }) {
  if (!(exportPreset in EXPORTS)) throw new CliError(`--export must be one of ${Object.keys(EXPORTS).join(', ')}`, EXIT.USAGE);
  for (const [flag, f] of [['--music', music], ['--sfx', sfx]]) if (f && !existsSync(f)) throw new CliError(`${flag} ${f}: no such file`);
  const P = await loadProject(input, { brand });
  const { project, plates, sorted, spine, spineFile, brandDir } = P;
  const { fps, width, height } = plates;
  const outDir = path.resolve(out ?? project);
  const rendersDir = path.resolve(renders ?? path.join(project, 'renders', 'plates'));
  const rs = checkRenders(P, rendersDir);
  let narration = null;
  if (spine.kind === 'narration') {
    if (!spine.audio) throw new CliError(`${spineFile}: no 'audio' — re-run the spine to write spine/narration.wav`);
    narration = path.resolve(path.dirname(spineFile), spine.audio);
    if (!existsSync(narration)) throw new CliError(`narration audio not found: ${narration} — re-run the spine`);
  }

  const reviewDir = path.join(outDir, 'review');
  const finalDir = path.join(outDir, 'out');
  mkdirSync(reviewDir, { recursive: true });
  mkdirSync(finalDir, { recursive: true });
  const review = path.join(reviewDir, 'review.mp4');
  const final = path.join(finalDir, 'final.mp4');
  const report = { project, plates: rs.map((r) => ({ id: r.plate.id, startMs: r.plate.startMs, durationMs: r.plate.durationMs, render: r.mp4, renderMs: r.ms })) };
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-assemble-'));
  try {
    // 1. spine audio at -16 LUFS (beat grid: silence), exactly the spine length
    const narStem = path.join(tmp, 'narration.wav');
    const totalMs = spine.totalMs;
    if (narration) {
      const lv = levelStem(narration, narStem, { durationMs: totalMs, lufs: NARRATION_LUFS, offsetMs: spine.audioOffsetMs ?? 0 });
      report.narration = { source: narration, targetLufs: NARRATION_LUFS, gainDb: lv.gainDb, lufs: lv.lufs, truePeakDb: lv.truePeakDb };
    } else {
      silentStem(narStem, totalMs);
      report.narration = { source: null, note: 'beat grid: silent AAC track' };
    }
    log(`narration ${narration ? `${report.narration.lufs} LUFS` : 'none (beat grid, silent track)'}`);

    // 2. review MP4: plates on the spine
    const { graph, totalFrames } = compositeVideoGraph(rs, { fps, width, height, totalMs });
    const args = ['-y'];
    rs.forEach((r) => args.push('-i', r.mp4));
    args.push('-i', narStem, '-filter_complex', graph, '-map', '[v]', '-map', `${rs.length}:a`, ...X264(16), '-r', String(fps), '-frames:v', String(totalFrames),
      ...AAC, '-t', (totalFrames / fps).toFixed(6), '-metadata', 'comment=peak-media assemble: review (narration only)', '-movflags', '+faststart', review);
    ffmpeg(args, { what: 'composite' });
    log(`review    ${rel(outDir, review)} (${rs.length} plates, ${totalFrames} frames)`);

    // 3. sync check: every plate cut must sit in a silent gap
    const cuts = plateCuts(sorted, totalMs);
    const cc = checkCuts(review, { cuts, minSilenceMs, edgeMs: 100 });
    report.cuts = cc.cuts.map((c) => ({ ...c, plates: sorted.filter((p) => p.startMs === c.cutMs || p.startMs + p.durationMs === c.cutMs).map((p) => p.id) }));
    report.cutsOk = cc.ok;
    const bad = report.cuts.filter((c) => !c.ok);
    if (bad.length) {
      writeFileSync(path.join(reviewDir, 'assemble.json'), JSON.stringify(report, null, 2) + '\n');
      const what = bad.map((c) => `${c.timecode} (${c.plates.join('|')}: ${c.gap ? `silence ${c.silenceMs} ms${c.edge ? ', too close to its edge' : ''}` : 'over sound'})`).join(', ');
      throw new CliError(`cut not in a ≥${minSilenceMs} ms silence at ${what} — re-time the spine beat or move the plate boundary; review left at ${review}`);
    }
    log(`cuts      ${cuts.length} plate cut(s) in silence (≥${minSilenceMs} ms)`);

    // 4. optional music / SFX stems: remux, picture copied
    let picture = review;
    if (music || sfx) {
      const mixed = path.join(reviewDir, 'review-mix.mp4');
      report.mix = remuxAudio({ video: review, out: mixed, music, sfx, musicLufs, sfxDb });
      writeFileSync(path.join(reviewDir, 'levels.json'), JSON.stringify(report.mix, null, 2) + '\n');
      picture = mixed;
      log(`mix       ${rel(outDir, mixed)} (${report.mix.mix.lufs} LUFS${report.mix.music?.duckDb != null ? `, music ducked ${report.mix.music.duckDb} dB` : ''})`);
    }

    // 5. brand outro (cached render) appended, then export
    const o = outroRender({ brandDir, brand: P.brand, fps, cacheDir: path.join(outDir, 'renders'), outro, rerender: rerenderOutro, renderWrap });
    const outroMs = P.brand.outro.durationMs;
    report.outro = { ...o, durationMs: outroMs, renderMs: videoMs(o.mp4) };
    log(`outro     ${o.source === 'render' ? 'rendered' : o.source === 'cache' ? 'cached' : 'given'} ${rel(outDir, o.mp4)}`);
    const ex = EXPORTS[exportPreset] ?? { width, height, fps };
    const oFrames = frames(outroMs, fps);
    const fit = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
    const oAudio = P.brand.outro.audio ? path.resolve(brandDir, P.brand.outro.audio) : null;
    const fargs = ['-y', '-i', picture, '-i', o.mp4];
    if (oAudio) fargs.push('-i', oAudio); else fargs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    const totalS = (totalFrames / fps).toFixed(6), outroS = (oFrames / fps).toFixed(6);
    const fg = [
      `[0:v]setpts=PTS-STARTPTS,trim=end_frame=${totalFrames},setpts=PTS-STARTPTS[a]`,
      `[1:v]setpts=PTS-STARTPTS,fps=${fps},${fit(width, height)},format=yuv420p,tpad=stop_mode=clone:stop=${oFrames},trim=end_frame=${oFrames},setpts=PTS-STARTPTS[b]`,
      `[a][b]concat=n=2:v=1:a=0[cat]`,
      exportPreset === 'source' ? '[cat]null[v]' : `[cat]${fit(ex.width, ex.height)},fps=${ex.fps}[v]`,
      `[0:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${totalS},atrim=end=${totalS},asetpts=PTS-STARTPTS[aa]`,
      `[2:a]aresample=48000,aformat=channel_layouts=stereo,apad=whole_dur=${outroS},atrim=end=${outroS},asetpts=PTS-STARTPTS[ab]`,
      `[aa][ab]concat=n=2:v=0:a=1[aout]`,
    ];
    const finalFrames = Math.round(((totalFrames + oFrames) / fps) * ex.fps);
    fargs.push('-filter_complex', fg.join(';'), '-map', '[v]', '-map', '[aout]', ...X264(16), '-r', String(ex.fps), '-frames:v', String(finalFrames),
      ...AAC, '-metadata', 'comment=peak-media assemble: final', '-movflags', '+faststart', path.join(tmp, 'final.mp4'));
    ffmpeg(fargs, { what: 'export' });
    renameOrCopy(path.join(tmp, 'final.mp4'), final);

    const expectedMs = totalMs + outroMs;
    const ps = probeSpec(final, { width: ex.width, height: ex.height, fps: ex.fps, durationMs: expectedMs, toleranceFrames: 1 });
    report.final = { file: final, export: exportPreset, expectedMs, ...ex, spec: ps.checks, ok: ps.ok };
    writeFileSync(path.join(reviewDir, 'assemble.json'), JSON.stringify(report, null, 2) + '\n');
    if (!ps.ok) throw new CliError(`${final} fails the delivery spec: ${ps.checks.filter((c) => !c.ok).map((c) => `${c.name} ${c.actual} (expected ${c.expected})`).join('; ')}`);
    log(`final     ${rel(outDir, final)} ${ex.width}x${ex.height}@${ex.fps}, ${expectedMs} ms (spine ${totalMs} + outro ${outroMs}) — spec PASS`);
    return report;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function renameOrCopy(from, to) {
  try { renameSync(from, to); } catch { cpSync(from, to); }
}

export const spec = {
  name: 'assemble',
  summary: 'composite rendered plates onto the spine, check cuts, add stems and the brand outro, export out/final.mp4',
  usage: 'assemble <project-folder|plates.json> [options]',
  description: `
Reads plates.json, its spine (manifest.json or beatgrid.json) and its brand pack, and the
renders in renders/plates/<id>.mp4. Writes review/review.mp4 (plates on the spine with the
narration at -16 LUFS, or a silent track for a beat grid), fails with the timecode if a plate
cut is not inside a silent gap, remuxes --music/--sfx stems with remux-audio (picture
copied) into review/review-mix.mp4, renders the brand outro once (cached in renders/), and
writes out/final.mp4 = spine + outro, checked with probe-spec. Report: review/assemble.json.`,
  options: {
    brand: { type: 'string', arg: 'dir', desc: 'Brand pack folder (overrides plates.json brand)' },
    renders: { type: 'string', arg: 'dir', desc: 'Folder of plate renders <id>.mp4 (default: <project>/renders/plates)' },
    out: { type: 'string', arg: 'dir', desc: 'Where review/, out/ and the outro cache go (default: the project folder)' },
    music: { type: 'string', arg: 'file', desc: 'Music bed stem, ducked under the narration' },
    sfx: { type: 'string', arg: 'file', desc: 'SFX stem, already placed on the timeline' },
    'music-lufs': { type: 'number', arg: 'LUFS', desc: 'Music bed loudness before ducking', default: -28 },
    'sfx-db': { type: 'number', arg: 'dB', desc: 'Gain applied to the SFX stem', default: 0 },
    export: { type: 'string', arg: 'preset', desc: `Final export: ${Object.keys(EXPORTS).join(' | ')} (source = plates.json size and fps)`, default: 'source', choices: Object.keys(EXPORTS) },
    'min-silence-ms': { type: 'number', arg: 'ms', desc: 'Silent gap every plate cut must sit in (DEC-13)', default: 300 },
    outro: { type: 'string', arg: 'file.mp4', desc: 'Use this pre-rendered outro instead of rendering the brand outro' },
    'rerender-outro': { type: 'boolean', desc: 'Render the brand outro even if a cached render exists' },
    json: { type: 'boolean', desc: 'Print the assembly report as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: [
    'assemble my-video/',
    'assemble my-video/ --music my-video/audio/music.wav --sfx my-video/audio/sfx.wav --export 1080p60',
  ],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, async ({ values, positionals: [input] }) => {
    if (!existsSync(input)) throw new CliError(`cannot read ${input}: no such file or folder`);
    if (!(values['min-silence-ms'] >= 0)) throw new CliError('--min-silence-ms must be >= 0', EXIT.USAGE);
    if (values['music-lufs'] >= 0) throw new CliError('--music-lufs must be negative (e.g. -28)', EXIT.USAGE);
    requireFfmpeg();
    const r = await assemble({ input, brand: values.brand, renders: values.renders, out: values.out, music: values.music, sfx: values.sfx,
      musicLufs: values['music-lufs'], sfxDb: values['sfx-db'], exportPreset: values.export, minSilenceMs: values['min-silence-ms'],
      outro: values.outro, rerenderOutro: values['rerender-outro'], log: values.json ? () => {} : (l) => process.stdout.write(`${l}\n`) });
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else process.stdout.write(`${r.final.file}\n`);
    return EXIT.OK;
  });
}
