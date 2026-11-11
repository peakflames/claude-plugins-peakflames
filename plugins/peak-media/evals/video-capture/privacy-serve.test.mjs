// video-capture (WP17 fixes): D3 — a storyboard's `hide` export and `setup()` hook act before t0,
// so a hidden element is never in a frame (frame 0 included, and after a goto); D1 — `capture
// serve` serves a local folder on 127.0.0.1 for exploring and stops on SIGTERM.
// Captures are real time and short (640x360 @ 10 fps); run this file alone.
import { test, before } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { ROOT, run, tmpDir } from '../helpers/run.mjs';
import { CAPTURE } from './helpers/projects.mjs';
import { hideCss } from '../../skills/video-capture/scripts/capture.mjs';

const FIX = path.join(ROOT, 'evals', 'video-capture', 'fixtures', 'hide');
const W = 64, H = 36;

let tmp;
before(() => { tmp = tmpDir('pm-wp17-'); });

/** Per frame: how many pixels (of a 64x36 downscale) are clearly red and clearly blue. */
function colourCounts(mp4) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-map', '0:v:0', '-vf', `scale=${W}:${H}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr));
  const per = W * H * 3, out = [];
  for (let off = 0; off + per <= r.stdout.length; off += per) {
    let red = 0, blue = 0;
    for (let i = off; i < off + per; i += 3) {
      const [R, G, B] = [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]];
      if (R > 190 && G < 70 && B < 70) red++;
      if (B > 190 && R < 70 && G < 70) blue++;
    }
    out.push({ red, blue });
  }
  return out;
}

/** Write a one-beat project (storyboard source given) and capture it; returns the frames' colours. */
function take(name, storyboard) {
  const dir = path.join(tmp, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'script.md'), '## show\n\nThe page, with nothing private on it.\n\nOn screen: Nothing private here\n');
  writeFileSync(path.join(dir, 'storyboard.mjs'), `export const url = ${JSON.stringify(path.join(FIX, 'index.html'))};\n${storyboard}\n`);
  const out = path.join(dir, 'out', `${name}.mp4`);
  const r = run(CAPTURE, ['--storyboard', path.join(dir, 'storyboard.mjs'), '--script', path.join(dir, 'script.md'), '--out', out, '--viewport', '640x360', '--fps', '10'], { network: true });
  assert.equal(r.code, 0, r.stderr);
  return { frames: colourCounts(out), stderr: r.stderr, manifest: path.join(dir, 'out', `${name}.take.json`) };
}

test('WP17-D3: control — hiding the element at the top of the storyboard leaves it in frame 0 (the UAT leak)', () => {
  const { frames } = take('leak', `export default async ({ beat, page }) => {
  await page.addStyleTag({ content: '#secret { visibility: hidden !important; }' });
  await beat('show');
};`);
  assert.ok(frames.length >= 15, `${frames.length} frames`);
  assert.ok(frames[0].red > 50, `frame 0 shows the secret (red px: ${frames[0].red}) — the detector sees it`);
});

test('WP17-D3: export const hide keeps the element out of every frame, from frame 0 and after a goto', () => {
  const { frames, manifest } = take('hide', `export const hide = ['#secret'];
export default async ({ beat, goto }) => {
  await beat('show', async () => { await goto('page2.html', { settle: 600 }); });
};`);
  const leaked = frames.map((f, i) => ({ i, red: f.red })).filter((f) => f.red > 0);
  assert.deepEqual(leaked, [], 'no frame shows any red (the secret)');
  assert.ok(frames.some((f) => f.blue > 20), 'the goto reached page 2 (its blue bar is on screen)');
  const x = JSON.parse(readFileSync(manifest, 'utf8'))['x-take'];
  assert.deepEqual(x.hide, ['#secret'], 'x-take.hide records the selectors');
});

test('WP17-D3: export async function setup() runs before t0 — what it hides is never in a frame', () => {
  const { frames, manifest } = take('setup', `export async function setup({ page }) {
  await page.addStyleTag({ content: '#secret { display: none !important; }' });
}
export default async ({ beat }) => { await beat('show'); };`);
  assert.equal(frames.filter((f) => f.red > 0).length, 0, `no frame shows the secret (frame 0 red px: ${frames[0].red})`);
  const x = JSON.parse(readFileSync(manifest, 'utf8'))['x-take'];
  assert.equal(x.setup, true);
});

test('WP17-D3: a bad hide or setup export stops before a browser opens, in one line; hideCss covers children', () => {
  const dir = path.join(tmp, 'bad');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'script.md'), '## show\n\nOne beat.\n');
  for (const [src, re] of [["export const hide = 'footer';", /export const hide must be an array of CSS selectors/], ['export const setup = 3;', /export setup must be an async function/]]) {
    writeFileSync(path.join(dir, 'storyboard.mjs'), `${src}\nexport default async ({ beat }) => { await beat('show'); };\n`);
    const r = run(CAPTURE, ['--storyboard', path.join(dir, 'storyboard.mjs'), '--script', path.join(dir, 'script.md'), '--out', path.join(dir, 'x.mp4')]);
    assert.equal(r.code, 1, r.stderr);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.match(r.stderr, re);
    assert.doesNotMatch(r.stderr, /launching/, 'no browser');
  }
  assert.equal(hideCss(['#a', 'footer .k']), '#a, #a * { visibility: hidden !important; }\nfooter .k, footer .k * { visibility: hidden !important; }');
});

/** Start `capture serve …`; resolves {child, url, stderr()} once the URL line is printed. */
function startServe(args) {
  const child = spawn(process.execPath, [path.join(ROOT, CAPTURE), 'serve', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
  const url = new Promise((res, rej) => {
    let out = '';
    child.stdout.on('data', (d) => { out += d; if (out.includes('\n')) res(out.split('\n')[0]); });
    child.on('close', () => rej(new Error(`serve exited: ${err}`)));
  });
  return { child, url, exited, stderr: () => err };
}

test('WP17-D1: capture serve <dir> serves the folder on 127.0.0.1, prints the URL, and stops on SIGTERM with exit 0', async () => {
  const s = startServe([FIX]);
  try {
    const url = await s.url;
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/, 'loopback URL on stdout');
    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Page one/, '/ serves index.html');
    assert.equal((await fetch(url + 'page2.html')).status, 200);
    assert.equal((await fetch(url + '..%2F..%2F..%2Fpackage.json')).status, 404, 'nothing outside the folder');
    assert.match(s.stderr(), /stop with Ctrl-C or kill \d+/);
    s.child.kill('SIGTERM');
    const { code } = await s.exited;
    assert.equal(code, 0, s.stderr());
  } finally { s.child.kill('SIGKILL'); }
});

test('WP17-D1: capture serve <file.html> --port n prints that file\'s URL; a busy port or a missing folder is one line', async () => {
  const port = await new Promise((res) => { const sv = createServer().listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => res(p)); }); });
  const s = startServe([path.join(FIX, 'page2.html'), '--port', String(port)]);
  try {
    const url = await s.url;
    assert.equal(url, `http://127.0.0.1:${port}/page2.html`);
    assert.equal((await fetch(url)).status, 200);
    // the loopback listen goes through dns.lookup, which the no-network preload blocks
    const busy = run(CAPTURE, ['serve', FIX, '--port', String(port)], { network: true });
    assert.equal(busy.code, 1);
    assert.equal(busy.stderr.trim().split('\n').length, 1, busy.stderr);
    assert.match(busy.stderr, /port \d+ on 127\.0\.0\.1 is in use/);
    s.child.kill('SIGINT');
    assert.equal((await s.exited).code, 0);
  } finally { s.child.kill('SIGKILL'); }
  const missing = run(CAPTURE, ['serve', path.join(tmp, 'nope')]);
  assert.equal(missing.code, 1);
  assert.equal(missing.stderr.trim().split('\n').length, 1, missing.stderr);
  assert.match(missing.stderr, /no such folder/);
  const help = run(CAPTURE, ['serve', '--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--port/);
});
