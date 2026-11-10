// WP2 walking skeleton: F0 beat grid -> 1 motion plate -> composite (AC-SKL-01/02/05/06/07).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { run, ROOT, fx, tmpDir } from '../helpers/run.mjs';

const SKEL = 'docs/build/tools/skeleton.mjs';
const F0 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F0');
const BRAND = fx('brand-min'); // default pack lands in WP5
const NO_KEY = { TTS_OPENROUTER_API_KEY: '' };
let out;

before(() => {
  out = tmpDir('pm-skl-');
  const r = run(SKEL, ['--fixture', F0, '--brand', BRAND, '--out', out], { env: NO_KEY });
  assert.equal(r.code, 0, r.stderr);
});

const framemd5 = (mp4) => spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l && !l.startsWith('#')).join('\n');

test('AC-SKL-01: F0 with no TTS key -> out/final.mp4 lasting 3.0 s ±1 frame', () => {
  const final = path.join(out, 'out', 'final.mp4');
  assert.ok(existsSync(final));
  const r = run('lib/verify/probe-spec.mjs', [final, '--duration-ms', '3000', '--fps', '30', '--json']);
  const d = JSON.parse(r.stdout).checks.find((c) => c.name.startsWith('duration'));
  assert.ok(d.ok, `duration ${d.actual}`);
});

test('AC-SKL-02: final.mp4 meets the delivery spec (H.264 High, yuv420p, AAC 48 kHz, faststart, 1280x720)', () => {
  const r = run('lib/verify/probe-spec.mjs', [path.join(out, 'out', 'final.mp4'), '--size', '1280x720']);
  assert.equal(r.code, 0, r.stdout + r.stderr);
});

test('AC-SKL-05: rendering the F0 plate twice gives identical per-frame md5', () => {
  const out2 = tmpDir('pm-skl2-');
  const r = run(SKEL, ['--fixture', F0, '--brand', BRAND, '--out', out2], { env: NO_KEY });
  assert.equal(r.code, 0, r.stderr);
  const a = framemd5(path.join(out, 'renders', 'plates', 'p1.mp4'));
  const b = framemd5(path.join(out2, 'renders', 'plates', 'p1.mp4'));
  assert.equal(a.split('\n').length, 90, '90 frames');
  assert.equal(a, b);
});

// macOS: sandbox-exec denies all outbound network except loopback (the renderer talks to its own
// browser over localhost). Linux: an unprivileged network namespace with only loopback up.
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

test('AC-SKL-06: with outbound network blocked, the F0 plate still renders (fonts and GSAP are local)', (t) => {
  const wrap = isolation();
  if (!wrap) { t.skip('no network isolation available on this host'); return; }
  const probe = spawnSync(wrap[0], [...wrap.slice(1), process.execPath, '-e', 'fetch("https://example.com").then(()=>process.exit(0),()=>process.exit(7))']);
  assert.equal(probe.status, 7, 'isolation really blocks outbound network');
  const out3 = tmpDir('pm-skl3-');
  const r = spawnSync(wrap[0], [...wrap.slice(1), process.execPath, path.join(ROOT, SKEL), '--fixture', F0, '--brand', BRAND, '--out', out3], { encoding: 'utf8', env: { ...process.env, ...NO_KEY } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(framemd5(path.join(out3, 'renders', 'plates', 'p1.mp4')), framemd5(path.join(out, 'renders', 'plates', 'p1.mp4')), 'offline render matches online render');
  const html = readFileSync(path.join(out3, 'plates', 'p1', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(src|href)=["']https?:/, 'composition references no remote URL');
});

test('AC-SKL-07: HyperFrames/Playwright versions appear only in lib/pins.json (+ package.json/lockfile mirrors)', () => {
  const pins = JSON.parse(readFileSync(path.join(ROOT, 'lib', 'pins.json'), 'utf8'));
  const allowed = new Set(['lib/pins.json', 'package.json', 'package-lock.json', 'VENDORED.md']);
  const skipDirs = new Set(['node_modules', 'docs', '.git']);
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      const rel = path.relative(ROOT, p);
      if (statSync(p).isDirectory()) { if (!skipDirs.has(e)) walk(p); continue; }
      if (allowed.has(rel) || !/\.(m?js|json|md|sh|html|css|ya?ml)$/.test(e)) continue;
      const s = readFileSync(p, 'utf8');
      for (const [k, v] of [['hyperframes', pins.hyperframes], ['playwright', pins.playwright]]) {
        if (new RegExp(`${k}[@" :=v]*${v.replace(/\./g, '\\.')}`, 'i').test(s) || s.includes(`${k}@`)) hits.push(`${rel}: ${k} ${v}`);
      }
    }
  };
  walk(ROOT);
  assert.deepEqual(hits, []);
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const k of ['hyperframes', 'playwright', 'gsap', 'ajv']) assert.equal(pkg.dependencies[k], pins[k], `package.json ${k} mirrors pins.json`);
  const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  for (const k of ['hyperframes', 'playwright', 'gsap', 'ajv']) assert.equal(lock.packages[`node_modules/${k}`].version, pins[k], `lockfile ${k} matches pins.json`);
});
