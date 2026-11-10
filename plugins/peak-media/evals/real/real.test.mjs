// WP10 real video: the private brand pack validates and its outro reproduces the reference outro
// scene it was built from (AC-REAL-03). Both live outside this repo (DEC-16); their paths are in
// docs/build/wp/WP10/real-pack.json (env PEAK_MEDIA_REAL_PACK / PEAK_MEDIA_REAL_REF override), so the
// runtime tree names no house brand (D17). No pack: skipped; no reference: the comparison is skipped.
// Nothing from the pack is written to the repo: only logs, JSON and a contact-sheet JPEG in evidence/WP10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, ROOT, tmpDir } from '../helpers/run.mjs';

const CFG_FILE = path.join(ROOT, 'docs', 'build', 'wp', 'WP10', 'real-pack.json');
const CFG = existsSync(CFG_FILE) ? JSON.parse(readFileSync(CFG_FILE, 'utf8')) : { reference: {} };
const home = (p) => (p ? p.replace(/^~(?=$|\/)/, os.homedir()) : '');
const PACK = home(process.env.PEAK_MEDIA_REAL_PACK ?? CFG.pack);
const TEASER = home(process.env.PEAK_MEDIA_REAL_REF ?? CFG.reference.composition);
const EVIDENCE = path.join(ROOT, 'docs', 'build', 'evidence', 'WP10');
// the reference scene's window in its composition; it cross-fades over the scene before it for CROSSFADE s
const { startS: S6_START = 22, durationS: S6_DUR = 4, crossfadeS: CROSSFADE = 0.8 } = CFG.reference;
const durationMs = (mp4) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }).stdout) * 1000;
const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }); assert.equal(r.status, 0, r.stderr); return r; };

test('AC-REAL-03: the real brand pack validates and its outro reproduces the reference outro (#s6)', { skip: (!PACK || !existsSync(path.join(PACK, "brand.json"))) && `no real brand pack at ${PACK || CFG_FILE}` }, async (t) => {
  mkdirSync(EVIDENCE, { recursive: true });
  const log = [];
  // 1. the plugin's validator
  const v = run('scripts/validate.mjs', [PACK]);
  log.push(`$ validate ${PACK}`, v.stdout.trim());
  assert.equal(v.code, 0, v.stdout + v.stderr);
  const brand = JSON.parse(readFileSync(path.join(PACK, 'brand.json'), 'utf8'));
  for (const f of brand.fonts) assert.match(readFileSync(path.join(PACK, f.license), 'utf8'), /SIL Open Font License/, `${f.family} licence`);
  // 2. music (DEC-39): each x-tracks file exists and music-rules lists it with the approved levels
  const rules = readFileSync(path.join(PACK, brand.music.rules), 'utf8');
  assert.ok(brand['x-tracks']?.length, 'brand.json lists x-tracks');
  for (const tr of brand['x-tracks']) {
    assert.ok(existsSync(path.join(PACK, tr.file)), `${tr.file} exists`);
    assert.ok(tr.title && tr.credit, `${tr.file} has a title and credit`);
    assert.ok(rules.includes(tr.title) && rules.includes(tr.file), `music-rules.md lists ${tr.title}`);
  }
  assert.ok(rules.includes('--music-lufs -28 --duck-db 6'), 'music-rules.md gives the approved levels');
  // 3. SFX (DEC-40): every manifest entry carries source, licence, duration and peak offset
  const sfx = JSON.parse(readFileSync(path.join(PACK, brand['x-sfx']), 'utf8'));
  for (const s of sfx.files) for (const k of ['file', 'source', 'licence', 'durationMs', 'peakOffsetMs']) assert.ok(s[k] != null, `sfx ${s.file}: ${k}`);
  log.push(`x-tracks: ${brand['x-tracks'].map((x) => x.title).join(', ')}; sfx entries: ${sfx.files.length}`);
  // 4. the outro, rendered exactly as assemble does
  const { outroRender } = await import(path.join(ROOT, 'skills', 'video-assemble', 'scripts', 'assemble.mjs'));
  const work = tmpDir('pm-real03-');
  const o = outroRender({ brandDir: PACK, brand, fps: 30, cacheDir: path.join(work, 'cache'), rerender: true });
  const ms = durationMs(o.mp4);
  log.push(`outro rendered: ${ms} ms (brand.json durationMs ${brand.outro.durationMs})`);
  assert.ok(Math.abs(ms - brand.outro.durationMs) <= 1000 / 30 + 1, `outro lasts ${ms} ms`);
  // 5. against the original #s6, when its source is here
  if (!TEASER || !existsSync(path.join(TEASER, "index.html"))) { t.diagnostic(`no reference composition at ${TEASER}: #s6 comparison skipped`); writeFileSync(path.join(EVIDENCE, 'AC-REAL-03.log'), log.join('\n') + '\n'); return; }
  const { render } = await import(path.join(ROOT, 'lib', 'hf.mjs'));
  const src = path.join(work, 'teaser');
  cpSync(TEASER, src, { recursive: true, filter: (s) => !/node_modules/.test(s) });
  render(src, path.join(work, 'teaser.mp4'), { fps: 30 });
  ff(['-ss', String(S6_START), '-i', path.join(work, 'teaser.mp4'), '-t', String(S6_DUR), '-an', '-c:v', 'libx264', '-crf', '16', path.join(work, 's6.mp4')]);
  // SSIM after the cross-fade (the standalone outro has no #s5 to fade over)
  const ssimLog = path.join(work, 'ssim.log');
  ff(['-i', o.mp4, '-i', path.join(work, 's6.mp4'), '-filter_complex', `[1:v]scale=1280:720:flags=lanczos,trim=start=${CROSSFADE},setpts=PTS-STARTPTS[s];[0:v]trim=start=${CROSSFADE},setpts=PTS-STARTPTS[p];[p][s]ssim=stats_file=${ssimLog}`, '-f', 'null', '-']);
  const vals = readFileSync(ssimLog, 'utf8').trim().split('\n').map((l) => Number(/All:([\d.]+)/.exec(l)[1]));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length, min = Math.min(...vals);
  log.push(`SSIM pack outro vs #s6 (scaled to 1280x720), ${CROSSFADE}-${S6_DUR} s, ${vals.length} frames: mean ${mean.toFixed(4)}, min ${min.toFixed(4)}`);
  // still: left #s6 original, right the pack outro, time-stamped
  ff(['-i', path.join(work, 's6.mp4'), '-i', o.mp4, '-filter_complex', '[0:v]scale=1280:720[a];[a][1:v]hstack', '-c:v', 'libx264', '-crf', '18', path.join(work, 'side.mp4')]);
  const sheet = run('lib/verify/contact-sheet.mjs', [path.join(work, 'side.mp4'), '--at', '0s,0.4s,0.8s,1.2s,1.6s,2s,2.5s,3s,3.4s,3.9s', '--cols', '2', '--width', '960', '-o', path.join(EVIDENCE, 'AC-REAL-03-hstack.jpg')]);
  assert.equal(sheet.code, 0, sheet.stderr);
  writeFileSync(path.join(EVIDENCE, 'AC-REAL-03.json'), JSON.stringify({ ac: 'AC-REAL-03', pack: brand.name, outroMs: ms, ssim: { from: CROSSFADE, to: S6_DUR, frames: vals.length, mean, min }, sheet: 'AC-REAL-03-hstack.jpg (each tile: left = #s6 original, right = pack outro)' }, null, 2) + '\n');
  writeFileSync(path.join(EVIDENCE, 'AC-REAL-03.log'), log.join('\n') + '\n');
  assert.ok(mean >= 0.98 && min >= 0.95, `outro matches the reference: SSIM mean ${mean.toFixed(4)}, min ${min.toFixed(4)}`);
});
