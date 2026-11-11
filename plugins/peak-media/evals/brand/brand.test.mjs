// WP5 brand pack: the neutral default pack validates and licenses its fonts (AC-BRD-01), a rebrand
// is a re-render with only --brand changed (AC-BRD-02, still), and no music ships (AC-BRD-03).
// Also the WP2 F-9 re-check: an offline render with the default pack, so local web fonts are covered.
import { test, before } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, cpSync, rmSync, openSync, readSync, closeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, ROOT, fx, tmpDir } from '../helpers/run.mjs';

const SKEL = 'docs/build/tools/skeleton.mjs';
const DEFAULT = path.join(ROOT, 'brand-packs', 'default');
const ALT = fx('brand-alt');
const F0 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F0');
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
const EVIDENCE = path.join(ROOT, 'docs', 'build', 'evidence', 'WP5');
const NO_KEY = { TTS_OPENROUTER_API_KEY: '' };

const framemd5 = (mp4) => spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l && !l.startsWith('#')).join('\n');
const durationMs = (mp4) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4], { encoding: 'utf8' }).stdout) * 1000;
/** RGB of one pixel of the frame at `ms`. */
function pixel(mp4, ms, x, y) {
  // crop 2x2 (4:2:0 chroma can't crop to 1 px), convert to RGB, keep the top-left pixel
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(ms / 1000), '-i', mp4, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  assert.equal(r.stdout?.length, 12, `pixel read at ${ms} ms: ${r.stderr}`);
  return [...r.stdout.subarray(0, 3)];
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b, tol = 6) => a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const token = (pack, name) => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(readFileSync(path.join(pack, 'tokens.css'), 'utf8'))[1].trim();

/** All files in a folder, relative paths. */
function files(dir, base = dir) {
  return readdirSync(dir).flatMap((e) => {
    const p = path.join(dir, e);
    return statSync(p).isDirectory() ? files(p, base) : [path.relative(base, p)];
  });
}

// ---------- AC-BRD-01 ----------

test('AC-BRD-01: brand-packs/default validates and every font has a licence file', () => {
  const r = run('scripts/validate.mjs', [DEFAULT]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const brand = JSON.parse(readFileSync(path.join(DEFAULT, 'brand.json'), 'utf8'));
  assert.deepEqual(brand.fonts.map((f) => f.family).sort(), ['Inter', 'JetBrains Mono']);
  for (const f of brand.fonts) {
    const lic = readFileSync(path.join(DEFAULT, f.license), 'utf8');
    assert.match(lic, /SIL Open Font License,? Version 1\.1/, `${f.family}: licence is OFL 1.1`);
    for (const file of f.files) assert.match(file, /\.woff2$/, `${f.family}: ${file} is woff2`);
  }
  // every font file in the pack is declared and sits next to its licence
  const declared = new Set(brand.fonts.flatMap((f) => f.files));
  const fontFiles = files(DEFAULT).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f));
  assert.ok(fontFiles.length > 0);
  for (const f of fontFiles) {
    assert.ok(declared.has(f), `${f} is listed in brand.json fonts[]`);
    assert.ok(existsSync(path.join(DEFAULT, path.dirname(f), 'OFL.txt')), `${f} has an OFL.txt beside it`);
  }
  // tokens.css: @font-face sources are local files that exist; no remote URL anywhere in the pack
  const css = readFileSync(path.join(DEFAULT, 'tokens.css'), 'utf8');
  const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 2, '@font-face rules present');
  for (const u of urls) {
    assert.doesNotMatch(u, /^(https?:)?\/\//, `${u} is local`);
    assert.ok(declared.has(u), `${u} is a declared font file`);
  }
  for (const f of files(DEFAULT).filter((f) => /\.(css|html|svg|json|md)$/.test(f))) {
    assert.doesNotMatch(readFileSync(path.join(DEFAULT, f), 'utf8'), /(src|href)=["']https?:|url\(\s*['"]?https?:|@import/, `${f} references no remote resource`);
  }
  // the synthetic second pack is valid too and licenses its fonts the same way
  assert.equal(run('scripts/validate.mjs', [ALT]).code, 0, 'brand-alt validates');
});

test('default pack outro renders to 3 s (logo + name fade) with the plate scaffold layout', () => {
  const brand = JSON.parse(readFileSync(path.join(DEFAULT, 'brand.json'), 'utf8'));
  const out = tmpDir('pm-outro-');
  const dir = path.join(out, 'outro');
  mkdirSync(path.join(dir, 'vendor'), { recursive: true });
  cpSync(path.join(DEFAULT, brand.outro.composition), path.join(dir, 'index.html'));
  cpSync(DEFAULT, path.join(dir, 'brand'), { recursive: true });
  const gsap = spawnSync(process.execPath, ['--input-type=module', '-e', `import { gsapPath } from ${JSON.stringify(path.join(ROOT, 'lib', 'hf.mjs'))}; process.stdout.write(gsapPath());`], { encoding: 'utf8' });
  assert.equal(gsap.status, 0, gsap.stderr);
  cpSync(gsap.stdout, path.join(dir, 'vendor', 'gsap.min.js'));
  const mp4 = path.join(out, 'outro.mp4');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import { render } from ${JSON.stringify(path.join(ROOT, 'lib', 'hf.mjs'))}; render(${JSON.stringify(dir)}, ${JSON.stringify(mp4)}, { fps: 30 });`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(Math.abs(durationMs(mp4) - brand.outro.durationMs) <= 1000 / 30 + 1, `outro lasts ${durationMs(mp4)} ms`);
  const sheet = run('lib/verify/contact-sheet.mjs', [mp4, '--every', '0.5s', '-o', path.join(EVIDENCE, 'outro-default.jpg')]);
  assert.equal(sheet.code, 0, sheet.stderr);
  // mid-hold the logo's accent dot is visible on the bg; at t=0 the frame is bare bg
  const bg = hex(token(DEFAULT, '--color-bg'));
  assert.ok(near(pixel(mp4, 0, 640, 300), bg), 'frame 0 is bare background');
  assert.ok(!near(pixel(mp4, 1800, 640, 300), bg), 'logo visible during the hold');
});

// ---------- AC-BRD-02 ----------

/** A fixture holding only F1 plate 1 (p1-hook, verbatim) over a beat grid for its beat. */
function plateOneFixture() {
  const f1 = JSON.parse(readFileSync(path.join(F1, 'plates.json'), 'utf8'));
  const plate = f1.plates.find((p) => p.id === 'p1-hook');
  assert.equal(plate.kind, 'motion');
  const dir = tmpDir('pm-brd02-fx-');
  mkdirSync(path.join(dir, 'spine'));
  writeFileSync(path.join(dir, 'spine', 'beatgrid.json'), JSON.stringify({
    schemaVersion: 1, kind: 'beatgrid', targetMs: plate.durationMs, totalMs: plate.durationMs, bpm: 120, command: [], narrate: false,
    beats: [{ id: plate.beat, startMs: plate.startMs, durationMs: plate.durationMs, onScreenText: [plate.text].flat().join(' '), clipNs: [] }],
    clips: [],
  }, null, 2));
  writeFileSync(path.join(dir, 'plates.json'), JSON.stringify({ ...f1, spine: 'spine/beatgrid.json', brand: path.relative(dir, DEFAULT), plates: [plate] }, null, 2));
  return { dir, plate };
}

test('AC-BRD-02: F1 plate 1 rendered with the default and a synthetic pack differs in colours and fonts only (contact sheets in evidence/WP5)', () => {
  const { dir, plate } = plateOneFixture();
  const outs = {};
  // evidence files are written only when asked (PEAK_MEDIA_EVIDENCE=1), so a normal test run leaves the tree clean
  const sheetDir = process.env.PEAK_MEDIA_EVIDENCE ? EVIDENCE : tmpDir('pm-brd02-sheets-');
  for (const [name, pack] of [['default', DEFAULT], ['alt', ALT]]) {
    const out = tmpDir(`pm-brd02-${name}-`);
    const r = run(SKEL, ['--fixture', dir, '--brand', pack, '--out', out], { env: NO_KEY });
    assert.equal(r.code, 0, r.stderr);
    outs[name] = { out, pack, mp4: path.join(out, 'renders', 'plates', `${plate.id}.mp4`) };
    const sheet = run('lib/verify/contact-sheet.mjs', [outs[name].mp4, '--every', '0.5s', '-o', path.join(sheetDir, `AC-BRD-02-${name}.jpg`), '--json']);
    assert.equal(sheet.code, 0, sheet.stderr);
    writeFileSync(path.join(sheetDir, `AC-BRD-02-${name}.json`), sheet.stdout.replaceAll(ROOT + path.sep, '').replaceAll(os.tmpdir(), '$TMPDIR'));
  }
  const { default: a, alt: b } = outs;
  // nothing but --brand changed: the scaffolded composition is byte-identical
  assert.equal(readFileSync(path.join(a.out, 'plates', plate.id, 'index.html'), 'utf8'), readFileSync(path.join(b.out, 'plates', plate.id, 'index.html'), 'utf8'), 'same plate HTML');
  assert.equal(durationMs(a.mp4), durationMs(b.mp4), 'same duration');
  // the two packs differ only in colour values and font families/files
  const tokensA = readFileSync(path.join(a.pack, 'tokens.css'), 'utf8'), tokensB = readFileSync(path.join(b.pack, 'tokens.css'), 'utf8');
  const props = (css) => Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const pa = props(tokensA), pb = props(tokensB);
  assert.deepEqual(Object.keys(pa), Object.keys(pb), 'same token names');
  const changed = Object.keys(pa).filter((k) => pa[k] !== pb[k]);
  assert.ok(changed.length > 0);
  for (const k of changed) assert.match(k, /^--(color|font)-/, `${k} is a colour or font token`);
  for (const k of ['--color-bg', '--color-fg', '--color-accent', '--font-display']) assert.ok(changed.includes(k), `${k} differs`);
  for (const f of ['logo.svg', 'music-rules.md', 'outro/index.html']) assert.equal(readFileSync(path.join(a.pack, f), 'utf8'), readFileSync(path.join(b.pack, f), 'utf8'), `${f} is the same in both packs`);
  // rendered colours follow each pack's --color-bg
  for (const o of [a, b]) assert.ok(near(pixel(o.mp4, 3000, 4, 4), hex(token(o.pack, '--color-bg'))), `${path.basename(o.pack)} background = its --color-bg`);
  assert.notEqual(framemd5(a.mp4), framemd5(b.mp4));
});

// ---------- AC-BRD-03 ----------

const AUDIO_EXT = /\.(wav|wave|mp3|ogg|oga|opus|m4a|aac|flac|aiff?|aifc|wma|mid|midi|caf|amr|weba)$/i;
function audioMagic(file) {
  const fd = openSync(file, 'r');
  const b = Buffer.alloc(12);
  try { readSync(fd, b, 0, 12, 0); } finally { closeSync(fd); }
  const s = b.toString('latin1');
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WAVE') return 'wav';
  if (s.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && b[1] !== 0xff)) return 'mp3';
  if (s.startsWith('OggS')) return 'ogg';
  if (s.startsWith('fLaC')) return 'flac';
  if (s.startsWith('FORM') && /AIF[FC]/.test(s.slice(8, 12))) return 'aiff';
  if (s.slice(4, 8) === 'ftyp' && /M4A|M4B|M4P/.test(s.slice(8, 12))) return 'm4a';
  if (s.startsWith('MThd')) return 'midi';
  return null;
}

test('AC-BRD-03: the plugin tree ships no music or other audio files', () => {
  // What ships = tracked + untracked-but-not-ignored files (renders and caches are gitignored).
  const g = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '.'], { cwd: ROOT, encoding: 'utf8' });
  const list = g.status === 0 ? g.stdout.split('\0').filter(Boolean) : files(ROOT).filter((f) => !f.split(path.sep).includes('node_modules'));
  assert.ok(list.includes('brand-packs/default/brand.json'), 'the scan sees the default pack');
  const hits = [];
  for (const f of list) {
    const p = path.join(ROOT, f);
    if (!existsSync(p) || statSync(p).isDirectory()) continue;
    if (AUDIO_EXT.test(f)) hits.push(`${f} (extension)`);
    else if (statSync(p).size >= 12 && audioMagic(p)) hits.push(`${f} (${audioMagic(p)} header)`);
  }
  assert.deepEqual(hits, []);
  // and no pack declares an audio file
  for (const pack of [DEFAULT, ALT]) {
    const brand = JSON.parse(readFileSync(path.join(pack, 'brand.json'), 'utf8'));
    assert.equal(brand.outro.audio, undefined, `${path.basename(pack)}: no outro sting`);
    assert.equal(brand.music.credits, undefined, `${path.basename(pack)}: no music credits (no music)`);
    assert.match(readFileSync(path.join(pack, brand.music.rules), 'utf8'), /No music ships/);
  }
});

// ---------- WP2 F-9 re-check: AC-SKL-06 with the default pack ----------

function isolation() {
  if (process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec')) {
    const p = '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))';
    return ['/usr/bin/sandbox-exec', '-p', p];
  }
  if (process.platform === 'linux' && spawnSync('unshare', ['-rn', 'true']).status === 0) {
    return ['unshare', '-rn', 'sh', '-c', 'ip link set lo up 2>/dev/null; exec "$@"', 'sh'];
  }
  return null;
}

test('re-check WP2 F-9: F0 renders offline with brand-packs/default, identical to online, and the web fonts are really used', (t) => {
  const wrap = isolation();
  if (!wrap) { t.skip('no network isolation available on this host'); return; }
  const probe = spawnSync(wrap[0], [...wrap.slice(1), process.execPath, '-e', 'fetch("https://example.com").then(()=>process.exit(0),()=>process.exit(7))']);
  assert.equal(probe.status, 7, 'isolation really blocks outbound network');
  const online = tmpDir('pm-brd-on-');
  const r1 = run(SKEL, ['--fixture', F0, '--brand', DEFAULT, '--out', online], { env: NO_KEY });
  assert.equal(r1.code, 0, r1.stderr);
  const offline = tmpDir('pm-brd-off-');
  const r2 = spawnSync(wrap[0], [...wrap.slice(1), process.execPath, path.join(ROOT, SKEL), '--fixture', F0, '--brand', DEFAULT, '--out', offline], { encoding: 'utf8', env: { ...process.env, ...NO_KEY } });
  assert.equal(r2.status, 0, r2.stderr);
  const md5On = framemd5(path.join(online, 'renders', 'plates', 'p1.mp4'));
  assert.equal(framemd5(path.join(offline, 'renders', 'plates', 'p1.mp4')), md5On, 'offline render matches online render');
  // control: the same pack with its font files removed renders differently, so the woff2 files were used
  const nofonts = tmpDir('pm-brd-nofont-');
  cpSync(DEFAULT, nofonts, { recursive: true });
  const brand = JSON.parse(readFileSync(path.join(nofonts, 'brand.json'), 'utf8'));
  rmSync(path.join(nofonts, 'fonts'), { recursive: true, force: true });
  writeFileSync(path.join(nofonts, 'brand.json'), JSON.stringify({ ...brand, fonts: [] }, null, 2));
  const out3 = tmpDir('pm-brd-nofont-out-');
  const r3 = spawnSync(wrap[0], [...wrap.slice(1), process.execPath, path.join(ROOT, SKEL), '--fixture', F0, '--brand', nofonts, '--out', out3], { encoding: 'utf8', env: { ...process.env, ...NO_KEY } });
  assert.equal(r3.status, 0, r3.stderr);
  assert.notEqual(framemd5(path.join(out3, 'renders', 'plates', 'p1.mp4')), md5On, 'removing the woff2 files changes the render');
  writeFileSync(path.join(EVIDENCE, 'recheck-SKL-06-default.json'), JSON.stringify({
    fixture: 'docs/build/fixtures/F0', brand: 'brand-packs/default', isolation: wrap[0],
    offlineEqualsOnline: true, fontsRemovedDiffers: true, frames: md5On.split('\n').length,
  }, null, 2) + '\n');
});

before(() => { mkdirSync(EVIDENCE, { recursive: true }); });
