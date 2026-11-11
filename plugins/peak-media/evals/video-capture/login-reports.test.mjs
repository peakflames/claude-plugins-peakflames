// video-capture (WP14): capture signin, --storage-state, --headed, the after-take report and the
// take manifest's x-take fields. Pages are local (127.0.0.1). Run alone: captures are real time.
// No test opens a window: `signin` and `--headed` run Playwright's Chromium through a stub that
// adds --headless=new (and, for signin, a DevTools port the test uses to submit the fixture's
// form and close the tab, as a user would). No real password is ever typed.
// Set PEAK_MEDIA_EVIDENCE_DIR to keep the contact sheet and measurements (JPEG/JSON only).
import { test, before, after } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, chmodSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ROOT, run, tmpDir } from '../helpers/run.mjs';
import { CAPTURE } from './helpers/projects.mjs';
import { signinTarget, writeSession, parseDuration, report, errorLine, MAX_MANIFEST_PAGE_ERRORS } from '../../skills/video-capture/scripts/capture.mjs';
import { browserPath } from '../../lib/hf.mjs';
import { headedBrowserPath } from '../../lib/browser.mjs';
import { validateFile } from '../../lib/schemas.mjs';
import { contactSheet } from '../../lib/verify/contact-sheet.mjs';
import { startLoginServer } from './fixtures/login/server.mjs';

const FX = path.join(ROOT, 'evals', 'video-capture', 'fixtures');
const LOGIN = path.join(FX, 'login');
const ERRS = path.join(FX, 'page-errors');
const UI = path.join(ROOT, 'skills', 'video-capture', 'examples', 'ui-demo');

let tmp, evidence;
before(() => {
  tmp = tmpDir('pm-wp14-');
  evidence = process.env.PEAK_MEDIA_EVIDENCE_DIR ?? path.join(tmp, 'evidence');
  mkdirSync(evidence, { recursive: true });
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const keep = (name, data) => writeFileSync(path.join(evidence, name), JSON.stringify(data, null, 2) + '\n');
const lines = (s) => s.split('\n').filter((l) => l.trim());
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const freePort = () => new Promise((resolve) => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

/** A browser stand-in: records its launch, then runs `real` with `extra` args. */
function stub(name, real, extra = []) {
  const marker = path.join(tmp, `${name}-${randomBytes(4).toString('hex')}.launched`);
  const file = `${marker}.sh`;
  writeFileSync(file, `#!/bin/sh\ntouch '${marker}'\nexec '${real}' ${extra.map((a) => `'${a}'`).join(' ')} "$@"\n`);
  chmodSync(file, 0o755);
  return { file, launched: () => existsSync(marker) };
}
/** The render browser behind a launch spy, and Playwright's Chromium made windowless. */
const renderSpy = () => stub('render', browserPath());
const headedStub = (extra = []) => stub('headed', headedBrowserPath(), ['--headless=new', ...extra]);

/** Run capture asynchronously (signin waits on the test, which drives the browser meanwhile). */
function runAsync(args, env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, CAPTURE), ...args], { cwd: os.tmpdir(), env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })));
  return { child, done };
}

async function devtools(port, pathname, timeoutMs = 20_000) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}${pathname}`);
      if (r.ok) { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }
    } catch { /* not up yet */ }
    if (Date.now() - t0 > timeoutMs) throw new Error(`DevTools ${pathname} on ${port} not answering`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Evaluate `expression` in a page target over its DevTools WebSocket. */
function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true } }));
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) { ws.close(); resolve(d.result); } };
    ws.onerror = (e) => reject(new Error(`DevTools socket: ${e.message ?? e}`));
  });
}

async function pageTarget(port, test) {
  const t0 = Date.now();
  for (;;) {
    const list = await devtools(port, '/json/list');
    const p = list.find((t) => t.type === 'page' && test(t));
    if (p) return p;
    if (Date.now() - t0 > 20_000) throw new Error(`no page target matching in ${JSON.stringify(list.map((t) => [t.type, t.url, t.title]))}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Mean RGB of the top-left 64x64 px of each sampled frame (4 fps): red = the sign-in page. */
function cornerColours(mp4) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', 'fps=4,crop=64:64:0:0,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, String(r.stderr));
  const out = [];
  for (let i = 0; i + 2 < r.stdout.length; i += 3) out.push([r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]);
  return out;
}
const isRed = ([r, g, b]) => r > 150 && g < 110 && b < 110;

function sessionFile(token, file = path.join(tmp, `session-${randomBytes(3).toString('hex')}.json`)) {
  writeFileSync(file, JSON.stringify({ cookies: [{ name: 'session', value: token, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] }));
  chmodSync(file, 0o600);
  return file;
}

// ---- capture signin ----

test('WP14 signin: the target file, refusals, durations (no browser)', () => {
  const prev = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = path.join(tmp, 'data');
  try {
    const t = signinTarget('http://127.0.0.1:4173', undefined);
    assert.equal(t.file, path.join(tmp, 'data', 'auth', '127.0.0.1.json'), 'default: <dataDir>/auth/<host>.json');
    assert.equal(t.isDefault, true);
    // default folder 0700, file 0600 — even over an existing looser file
    writeSession(t, { cookies: [], origins: [] });
    assert.equal(statSync(path.dirname(t.file)).mode & 0o777, 0o700);
    assert.equal(statSync(t.file).mode & 0o777, 0o600);
    chmodSync(t.file, 0o644);
    writeSession(t, { cookies: [], origins: [] });
    assert.equal(statSync(t.file).mode & 0o777, 0o600);
    // --save inside the project's web2video/ folder or any git work tree is refused, naming the default
    const proj = path.join(tmp, 'proj');
    mkdirSync(path.join(proj, 'web2video'), { recursive: true });
    assert.throws(() => signinTarget('https://app.example.test/login', 'web2video/s.json', proj), (e) => e.code === 2 && /inside .*web2video.*auth\/app\.example\.test\.json/.test(e.message));
    assert.throws(() => signinTarget('https://app.example.test', path.join(ROOT, 's.json')), (e) => e.code === 2 && /git work tree .*leave out --save to use .*auth\/app\.example\.test\.json/.test(e.message));
    assert.equal(signinTarget('https://app.example.test', path.join(proj, 's.json'), proj).file, path.join(proj, 's.json'), 'outside both: allowed');
    assert.throws(() => signinTarget('ftp://x', undefined), /http\(s\) URL/);
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PLUGIN_DATA; else process.env.CLAUDE_PLUGIN_DATA = prev;
  }
  assert.equal(parseDuration('300s'), 300_000);
  assert.equal(parseDuration('5m'), 300_000);
  assert.equal(parseDuration('1500ms'), 1500);
  assert.equal(parseDuration('2'), 2000);
  assert.throws(() => parseDuration('soon'), /duration/);
});

test('WP14 signin: --help/--version, bad input and a missing headed browser are one line, no browser', () => {
  const help = run(CAPTURE, ['signin', '--help']);
  assert.equal(help.code, 0);
  for (const f of ['--save', '--timeout', '--help', '--version']) assert.ok(help.stdout.includes(f), `signin --help lists ${f}`);
  assert.match(run(CAPTURE, ['--help']).stdout, /capture signin <url>/, 'capture --help names the subcommand');
  assert.equal(run(CAPTURE, ['signin', '--version']).code, 0);
  const spy = headedStub();
  const one = (args, re, env = {}) => {
    const r = run(CAPTURE, ['signin', ...args], { env: { PEAK_MEDIA_HEADED_BROWSER_PATH: spy.file, ...env } });
    assert.notEqual(r.code, 0, args.join(' '));
    const ls = lines(r.stderr).filter((l) => !/^Run '.+ --help' for usage\.$/.test(l));
    assert.equal(ls.length, 1, `one line: ${r.stderr}`);
    assert.match(ls[0], re);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
    return r;
  };
  one([], /expected at least 1 argument/);
  one(['not-a-url'], /http\(s\) URL/);
  one(['http://127.0.0.1:1', '--timeout', 'later'], /--timeout expects a duration/);
  one(['http://127.0.0.1:1', '--save', path.join(ROOT, 'leak.json')], /git work tree/);
  assert.equal(spy.launched(), false, 'no browser for bad input');
  const r = one(['http://127.0.0.1:1'], /capture signin needs Playwright's Chromium .* — run .*setup\.mjs/, { PEAK_MEDIA_HEADED_BROWSER_PATH: path.join(tmp, 'no-chromium') });
  assert.equal(r.code, 3);
});

test('WP14 signin: the session is saved 0600 when the last tab closes; only the path is printed', async () => {
  const token = `tok-${randomBytes(8).toString('hex')}`;
  const server = await startLoginServer({ token });
  const port = await freePort();
  const save = path.join(tmp, 'signin', 'session.json'); // outside any git work tree (the OS temp dir)
  const browser = headedStub([`--remote-debugging-port=${port}`]);
  const { child, done } = runAsync(['signin', server.url, '--save', save, '--timeout', '60s'], { PEAK_MEDIA_HEADED_BROWSER_PATH: browser.file });
  try {
    // the "user": submit the sign-in form (no password typed), wait for the dashboard, close the tab
    const signinPage = await pageTarget(port, (t) => t.url.startsWith(server.url) && t.title === 'Sign in');
    await evaluate(signinPage.webSocketDebuggerUrl, 'document.querySelector("form").submit()');
    const dash = await pageTarget(port, (t) => t.url.startsWith(server.url) && t.title === 'Dashboard');
    assert.equal(existsSync(save), false, 'nothing is saved while the tab is open');
    await devtools(port, `/json/close/${dash.id}`); // the browser-side close, as the tab's ×
    const r = await done;
    assert.equal(r.code, 0, r.stderr);
    assert.ok(browser.launched(), 'Playwright\'s Chromium was launched');
    assert.equal(statSync(save).mode & 0o777, 0o600, 'the session file is 0600');
    const state = readJson(save);
    const c = state.cookies.find((x) => x.name === 'session');
    assert.ok(c && c.value === token && c.httpOnly, 'the HttpOnly session cookie is saved');
    assert.equal(lines(r.stdout).length, 1);
    assert.ok(r.stdout.includes(save), 'prints the saved path');
    assert.ok(!(r.stdout + r.stderr).includes(token), 'never prints the contents');
    keep('signin-simulated.json', { save: '<tmp>/signin/session.json', mode: '0600', cookies: state.cookies.map((x) => ({ name: x.name, httpOnly: x.httpOnly, value: '<redacted>' })), stdout: r.stdout.replaceAll(save, '<save>').trim() });
  } finally {
    child.kill();
    await server.close();
  }
});

test('WP14 signin: --timeout exits non-zero with nothing saved', async () => {
  const server = await startLoginServer({ token: 'x' });
  const save = path.join(tmp, 'signin-timeout', 'session.json');
  const browser = headedStub();
  try {
    const t0 = Date.now();
    const r = await runAsync(['signin', server.url, '--save', save, '--timeout', '4s'], { PEAK_MEDIA_HEADED_BROWSER_PATH: browser.file }).done;
    assert.notEqual(r.code, 0);
    assert.ok(Date.now() - t0 < 20_000, 'gave up at the timeout');
    assert.ok(browser.launched());
    assert.match(lines(r.stderr).at(-1), /^capture signin: not done within 4s — nothing saved/);
    assert.equal(existsSync(save), false, 'nothing saved');
    assert.equal(r.stdout, '');
  } finally { await server.close(); }
});

test('WP14 setup.mjs --check reports the headed browser like the render browser; --skip-browser skips both', () => {
  const missing = { PEAK_MEDIA_HEADED_BROWSER_PATH: path.join(tmp, 'no-chromium') };
  const r = run('scripts/setup.mjs', ['--check'], { env: missing });
  assert.equal(r.code, 3);
  assert.equal(lines(r.stderr).length, 1, r.stderr);
  assert.match(r.stderr, /^setup\.mjs: headed browser missing \(Playwright's Chromium, for capture signin\/--headed\) — run .*setup\.mjs/);
  assert.equal(run('scripts/setup.mjs', ['--check', '--skip-browser'], { env: missing }).code, 0);
  assert.match(run('scripts/setup.mjs', ['--help']).stdout, /--skip-browser +Don't fetch the render or the headed browser/);
  assert.equal(run('scripts/setup.mjs', ['--check']).code, 0, 'installed here by setup.mjs (DEC-49)');
});

// ---- --storage-state ----

test('AC-W2V-21: a missing --storage-state file stops the take before a browser opens, naming capture signin', () => {
  const broken = path.join(tmp, 'broken-session.json');
  writeFileSync(broken, '{"cookies": [');
  for (const file of ['/nonexistent.json', broken]) {
    const spy = renderSpy();
    const headed = headedStub();
    const r = run(CAPTURE, ['--storyboard', path.join(LOGIN, 'storyboard.mjs'), '--script', path.join(LOGIN, 'script.md'), '--url', 'http://127.0.0.1:9/', '--out', path.join(tmp, 'w21.mp4'), '--storage-state', file],
      { env: { HYPERFRAMES_BROWSER_PATH: spy.file, PEAK_MEDIA_HEADED_BROWSER_PATH: headed.file } });
    assert.notEqual(r.code, 0, `${file}: non-zero exit`);
    assert.equal(lines(r.stderr).length, 1, `${file}: one line — ${r.stderr}`);
    assert.match(r.stderr, /--storage-state .*capture signin/, `${file}: names capture signin`);
    assert.doesNotMatch(r.stderr, /launching/, 'no launch logged');
    assert.equal(spy.launched(), false, `${file}: no browser launched`);
    assert.equal(headed.launched(), false);
    assert.equal(existsSync(path.join(tmp, 'w21.mp4')), false);
  }
});

test('AC-W2V-22: a take with --storage-state starts signed in; the manifest says signedIn and holds no cookie', async () => {
  const token = `tok-${randomBytes(8).toString('hex')}`;
  const server = await startLoginServer({ token });
  try {
    const session = sessionFile(token);
    const args = (out, extra) => ['--storyboard', path.join(LOGIN, 'storyboard.mjs'), '--script', path.join(LOGIN, 'script.md'), '--url', server.url, '--out', out, '--json', ...extra];
    const out = path.join(tmp, 'w22.mp4');
    // async: the fixture server lives in this process and must keep answering during the take
    const r = await runAsync(args(out, ['--storage-state', session])).done;
    assert.equal(r.code, 0, r.stderr);
    const take = JSON.parse(r.stdout);
    const colours = cornerColours(out);
    assert.ok(colours.length >= 8, `sampled ${colours.length} stills`);
    assert.equal(colours.filter(isRed).length, 0, `no still shows the (red) sign-in page: ${JSON.stringify(colours)}`);
    const sheet = contactSheet(out, { out: path.join(evidence, 'AC-W2V-22-signed-in.jpg'), everyMs: 500 });
    const text = readFileSync(take.manifest, 'utf8');
    const doc = JSON.parse(text);
    assert.equal(doc['x-take'].signedIn, true);
    assert.ok(!text.includes(token), 'the cookie value is not in the manifest');
    assert.ok(!text.includes('"cookies"'), 'no storage state is copied in');
    const i = doc.command.indexOf('--storage-state');
    assert.equal(doc.command[i + 1], session, 'command[] keeps the flag and the path');
    assert.ok((await validateFile(take.manifest, 'spine')).ok);
    // control: the same take signed out shows the sign-in page (so "no red" means something)
    const ctl = path.join(tmp, 'w22-signed-out.mp4');
    const c = await runAsync(args(ctl, [])).done;
    assert.equal(c.code, 0, c.stderr);
    assert.ok(cornerColours(ctl).every(isRed), 'signed out, every still is the sign-in page');
    assert.equal(readJson(JSON.parse(c.stdout).manifest)['x-take'].signedIn, false);
    keep('AC-W2V-22.json', { stills: colours.length, redStills: 0, controlSignedOutAllRed: true, signedIn: true, cookieInManifest: false, sheet: path.basename(sheet.out), frames: sheet.frames.map((f) => f.label) });
  } finally { await server.close(); }
});

// ---- --headed ----

test('WP14 --headed: the take runs in Playwright\'s Chromium and records the same frame grid; missing → one line', () => {
  const render = renderSpy();
  const headed = headedStub(); // windowless here; the headed path is otherwise unchanged
  const out = path.join(tmp, 'headed.mp4');
  const r = run(CAPTURE, ['--storyboard', path.join(ERRS, 'storyboard.mjs'), '--script', path.join(ERRS, 'script.md'), '--out', out, '--headed', '--json', '--no-captions'],
    { network: true, env: { HYPERFRAMES_BROWSER_PATH: render.file, PEAK_MEDIA_HEADED_BROWSER_PATH: headed.file } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /launching headed browser/);
  assert.equal(headed.launched(), true, 'Playwright\'s Chromium ran the take');
  assert.equal(render.launched(), false, 'the render browser did not');
  const take = JSON.parse(r.stdout);
  assert.equal(take.headed, true);
  assert.ok(take.uniqueFrames > 3, `frames delivered (${take.uniqueFrames})`);
  assert.ok(readJson(take.manifest).command.includes('--headed'));
  const miss = run(CAPTURE, ['--storyboard', path.join(ERRS, 'storyboard.mjs'), '--script', path.join(ERRS, 'script.md'), '--out', out, '--headed'],
    { env: { HYPERFRAMES_BROWSER_PATH: render.file, PEAK_MEDIA_HEADED_BROWSER_PATH: path.join(tmp, 'none') } });
  assert.equal(miss.code, 3);
  assert.equal(lines(miss.stderr).length, 1, miss.stderr);
  assert.match(miss.stderr, /--headed needs Playwright's Chromium .* — run .*setup\.mjs/);
});

// ---- reports ----

test('AC-W2V-23: page errors — the report prints the first 5 and "… and 2 more"; x-take.pageErrors holds all 7 (25 → 20)', () => {
  assert.equal(errorLine(Object.assign(new TypeError('a\nb'))), 'TypeError: a', 'first line only');
  const seven = path.join(tmp, 'w23-seven.mp4');
  const r = run(CAPTURE, ['--storyboard', path.join(ERRS, 'storyboard.mjs'), '--script', path.join(ERRS, 'script.md'), '--url', path.join(ERRS, 'seven.html'), '--out', seven], { network: true });
  assert.equal(r.code, 0, r.stderr);
  const want = Array.from({ length: 7 }, (_, i) => `TypeError: Cannot read properties of undefined (reading 'item${i + 1}')`);
  const out = lines(r.stdout);
  assert.match(out[0], /^wrote \S+w23-seven\.mp4 \((\d+ kB|\d+\.\d MB), 1280x720 @ 30 fps, \d+\.\d s, preset web\)$/);
  assert.match(out[1], /^beats: boom \d\.\d\d–\d\.\d\d s$/);
  const at = out.indexOf('page errors during take: 7');
  assert.ok(at > 0, r.stdout);
  assert.deepEqual(out.slice(at + 1, at + 7), [...want.slice(0, 5).map((l) => `  ${l}`), '  … and 2 more']);
  const doc = readJson(path.join(tmp, 'w23-seven.take.json'));
  assert.deepEqual(doc['x-take'].pageErrors, want, 'the manifest keeps all 7 first lines');
  assert.equal(doc['x-take'].pageErrorCount, 7);

  const many = path.join(tmp, 'w23-many.mp4');
  const m = run(CAPTURE, ['--storyboard', path.join(ERRS, 'storyboard.mjs'), '--script', path.join(ERRS, 'script.md'), '--url', path.join(ERRS, 'many.html'), '--out', many, '--json'], { network: true });
  assert.equal(m.code, 0, m.stderr);
  const take = JSON.parse(m.stdout); // --json keeps printing the summary object, and only that
  assert.equal(take.pageErrors.length, 25);
  const md = readJson(take.manifest);
  assert.equal(md['x-take'].pageErrors.length, MAX_MANIFEST_PAGE_ERRORS, '25 errors record 20');
  assert.equal(md['x-take'].pageErrors[19], "TypeError: Cannot read properties of undefined (reading 'item20')");
  assert.equal(md['x-take'].pageErrorCount, 25);
  assert.match(report(take), /page errors during take: 25\n(  TypeError.*\n){5}  … and 20 more\n$/);
  keep('AC-W2V-23.json', { seven: { stdout: r.stdout.replaceAll(tmp, '<tmp>'), pageErrors: doc['x-take'].pageErrors }, many: { manifestPageErrors: md['x-take'].pageErrors.length, pageErrorCount: 25 } });
});

test('WP14 report: plates print "plate <id>"; no page-error lines when there are none', () => {
  const take = { out: path.join(os.tmpdir(), 'p', 'r1.mp4'), preset: null, plate: 'r1-feature', sizeBytes: 3_800_000, width: 1280, height: 720, fps: 30, videoMs: 19_600,
    beats: [{ id: 'add', startMs: 0, durationMs: 5100 }, { id: 'filter', startMs: 8400, durationMs: 5500 }], pageErrors: [] };
  assert.equal(report(take, path.join(os.tmpdir(), 'p')), 'wrote r1.mp4 (3.8 MB, 1280x720 @ 30 fps, 19.6 s, plate r1-feature)\nbeats: add 0.00–5.10 s · filter 8.40–13.9 s\n');
});

test('AC-W2V-24: a captions take of the ui-demo validates against the v1 spine schema and command[] re-runs it', async () => {
  const out = path.join(tmp, 'w24', 'ui-demo.mp4');
  const r = run(CAPTURE, ['--storyboard', path.join(UI, 'storyboard.mjs'), '--script', path.join(UI, 'script.md'), '--out', out], { network: true });
  assert.equal(r.code, 0, r.stderr);
  const mf = path.join(tmp, 'w24', 'ui-demo.take.json');
  assert.ok((await validateFile(mf, 'spine')).ok, 'validates against the v1 spine schema');
  const doc = readJson(mf);
  const x = doc['x-take'];
  assert.equal(x.preset, 'web');
  assert.equal(x.cursor, true);
  assert.equal(x.signedIn, false);
  assert.equal(x.sizeBytes, statSync(out).size);
  assert.deepEqual(x.pageErrors, []);
  for (const b of x.beats) for (const k of ['id', 'startMs', 'endMs', 'lateMs']) assert.ok(k in b, `x-take.beats[] has ${k}`);
  assert.deepEqual(doc.beats.map((b) => b.id), ['add', 'done', 'filter', 'clear'], 'beats[]: one real entry per beat');
  for (const b of doc.beats) assert.deepEqual(Object.keys(b).filter((k) => ['id', 'startMs', 'durationMs'].includes(k)).sort(), ['durationMs', 'id', 'startMs']);
  // re-run command[] from another directory
  const [bin, ...args] = doc.command;
  assert.equal(bin, 'node');
  const again = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: os.tmpdir() });
  assert.equal(again.status, 0, again.stderr);
  const re = readJson(mf);
  assert.deepEqual(re.command, doc.command);
  assert.equal(re['x-take'].preset, x.preset, 'same preset');
  assert.deepEqual(re.beats.map((b) => b.id), doc.beats.map((b) => b.id), 'same beat ids');
  // a --script take lasts as long as its actions really take (a beat ends at max(reading time, fn)),
  // so two real-time runs can round to adjacent frame counts: same count within one frame (see
  // wp/WP14/handoff.md — measured 292/292, 291/292, 292/292)
  assert.ok(Math.abs(re['x-take'].frames - x.frames) <= 1, `same frame count ±1 (${re['x-take'].frames} vs ${x.frames})`);
  assert.equal(re['x-take'].fps, x.fps);
  keep('AC-W2V-24.json', { frames: [x.frames, re['x-take'].frames], beats: doc.beats.map((b) => b.id), preset: x.preset, xTakeKeys: Object.keys(x) });
});
