#!/usr/bin/env node
// skeleton — WP2 walking skeleton (dev tool, not shipped as a skill entry point):
// beat-grid spine -> one motion plate per plates.json entry -> composite -> out/final.mp4.
// Proves the toolchain end to end; WP4/WP6 replace the plate and composite steps.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT, PLUGIN_ROOT, isMain } from '../../../lib/cli.mjs';
import { validateFile } from '../../../lib/schemas.mjs';
import { preflight } from '../../../lib/preflight.mjs';
import { render, gsapPath } from '../../../lib/hf.mjs';
import { ffmpeg } from '../../../lib/ffmpeg.mjs';

const TEMPLATE = path.join(PLUGIN_ROOT, 'skills', 'video-plates', 'templates', 'motion', 'index.html');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function scaffoldPlate({ plate, brandDir, dir, fps, width, height }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, 'vendor'), { recursive: true });
  cpSync(brandDir, path.join(dir, 'brand'), { recursive: true });
  cpSync(gsapPath(), path.join(dir, 'vendor', 'gsap.min.js'));
  const lines = [plate.text ?? plate.intent].flat().map((l) => `    <div class="line">${esc(l)}</div>`).join('\n');
  const html = readFileSync(TEMPLATE, 'utf8')
    .replaceAll('{{WIDTH}}', String(width)).replaceAll('{{HEIGHT}}', String(height)).replaceAll('{{FPS}}', String(fps))
    .replaceAll('{{DURATION_S}}', String(plate.durationMs / 1000)).replaceAll('{{LINES}}', lines);
  writeFileSync(path.join(dir, 'index.html'), html);
  return dir;
}

export async function skeleton({ fixture, brand, out, renderWrap }) {
  const platesFile = path.join(fixture, 'plates.json');
  const pv = await validateFile(platesFile, 'plates');
  if (!pv.ok) throw new CliError(`${platesFile}: ${pv.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
  const plates = JSON.parse(readFileSync(platesFile, 'utf8'));
  const spineFile = path.resolve(fixture, plates.spine);
  const sv = await validateFile(spineFile, 'spine');
  if (!sv.ok) throw new CliError(`${spineFile}: ${sv.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
  const spine = JSON.parse(readFileSync(spineFile, 'utf8'));
  const brandDir = path.resolve(brand ?? path.resolve(fixture, plates.brand));
  const bv = await validateFile(brandDir, 'brand');
  if (!bv.ok) throw new CliError(`brand pack ${brandDir}: ${bv.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
  for (const p of plates.plates) if (p.kind !== 'motion') throw new CliError(`skeleton renders motion plates only; ${p.id} is '${p.kind}'`);

  const { fps, width, height } = plates;
  const rendered = [];
  for (const p of [...plates.plates].sort((a, b) => a.startMs - b.startMs)) {
    const dir = scaffoldPlate({ plate: p, brandDir, dir: path.join(out, 'plates', p.id), fps, width, height });
    const mp4 = path.join(out, 'renders', 'plates', `${p.id}.mp4`);
    mkdirSync(path.dirname(mp4), { recursive: true });
    render(dir, mp4, { fps, wrap: renderWrap });
    rendered.push({ plate: p, mp4 });
  }
  // composite: plates in time order over black gaps, spine audio (or silence) underneath
  const final = path.join(out, 'out', 'final.mp4');
  mkdirSync(path.dirname(final), { recursive: true });
  const totalS = spine.totalMs / 1000;
  const args = ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${totalS}`];
  rendered.forEach((r) => args.push('-i', r.mp4));
  const audioIdx = rendered.length + 1;
  if (spine.kind === 'narration' && spine.audio) args.push('-i', path.resolve(path.dirname(spineFile), spine.audio));
  else args.push('-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`);
  let chain = '[0:v]setpts=PTS-STARTPTS[base0]';
  rendered.forEach((r, i) => {
    const t = r.plate.startMs / 1000;
    chain += `;[${i + 1}:v]setpts=PTS-STARTPTS+${t}/TB[p${i}];[base${i}][p${i}]overlay=eof_action=pass:enable='between(t,${t},${t + r.plate.durationMs / 1000 - 1e-6})'[base${i + 1}]`;
  });
  args.push('-filter_complex', chain, '-map', `[base${rendered.length}]`, '-map', `${audioIdx}:a`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-t', String(totalS), '-movflags', '+faststart', final);
  ffmpeg(args, { what: 'composite' });
  return { final, plates: rendered.map((r) => r.mp4) };
}

const spec = {
  name: 'skeleton',
  summary: 'WP2 walking skeleton: beat-grid spine -> motion plate(s) -> composite -> out/final.mp4',
  usage: 'skeleton --fixture <dir> --out <dir> [--brand <pack>]',
  options: {
    fixture: { type: 'string', arg: 'dir', desc: 'Fixture folder holding plates.json (e.g. docs/build/fixtures/F0)' },
    out: { type: 'string', arg: 'dir', desc: 'Working/output folder (gets plates/, renders/plates/, out/final.mp4)' },
    brand: { type: 'string', arg: 'dir', desc: 'Brand pack folder (overrides plates.json brand)' },
  },
  positionals: { max: 0 },
};

if (isMain(import.meta.url)) {
  await runCli(spec, async ({ values }) => {
    if (!values.fixture || !values.out) throw new CliError('--fixture and --out are required', EXIT.USAGE);
    if (!existsSync(path.join(values.fixture, 'plates.json'))) throw new CliError(`no plates.json in ${values.fixture}`);
    preflight({ ffmpeg: true, deps: ['gsap'], hyperframes: true });
    const r = await skeleton({ fixture: values.fixture, brand: values.brand, out: values.out });
    process.stdout.write(`${r.final}\n`);
  });
}
