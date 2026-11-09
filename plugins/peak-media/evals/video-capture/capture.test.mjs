// video-capture (WP7a): the capture entry point, pre-flight, the deck example in three modes,
// and F3's live plates captured to their planned durations. Pages are served locally — no internet.
// Run alone: captures are real time and timing-sensitive.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { ROOT, run, baseline, tmpDir } from '../helpers/run.mjs';
import { CAPTURE, DECK, LOCAL_PAGE, deckSpine, makeF3Project } from './helpers/projects.mjs';
import { spec, framesFor, FrameGrid } from '../../skills/video-capture/scripts/capture.mjs';
import { browserPath } from '../../lib/hf.mjs';
import { validateFile } from '../../lib/schemas.mjs';
import { loadProject, checkRenders } from '../../skills/video-assemble/scripts/assemble.mjs';

const REC01_FLAGS = ['--storyboard', '--out', '--mp4', '--viewport', '--no-captions', '--caption-css', '--url', '--debug-requests', '--audio-offset-ms', '--spine'];
const NARRATION_FLAGS = ['--narrate', '--tts-model', '--voice', '--style', '--export-clips'];
const STORYBOARD = path.join(DECK, 'storyboard.mjs');

let tmp, spineFile, spineDoc;
before(() => {
  tmp = tmpDir('pm-capture-eval-');
  ({ file: spineFile, manifest: spineDoc } = deckSpine(tmp));
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

/**
 * Captures serve the page on 127.0.0.1 (a loopback listen the no-network preload would refuse),
 * so they run with the preload off and prove "no internet" from the browser's own request log
 * (--debug-requests): every request the page made went to loopback, none failed.
 */
function assertLocalOnly(stderr, what) {
  const reqs = [...stderr.matchAll(/^capture: request \S+ (\S+)/gm)].map((m) => m[1]);
  assert.ok(reqs.length >= 1, `${what}: the request log is on`);
  for (const u of reqs) assert.match(u, /^(http:\/\/127\.0\.0\.1:\d+\/|data:|about:)/, `${what}: only local requests (${u})`);
  assert.doesNotMatch(stderr, /request failed/, `${what}: no failed requests`);
}

const json = (r) => { try { return JSON.parse(r.stdout); } catch { assert.fail(`no JSON on stdout (exit ${r.code}): ${r.stderr}`); } };
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
function videoFrames(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate,width,height', '-of', 'json', file], { encoding: 'utf8' });
  const s = JSON.parse(r.stdout).streams[0];
  const [a, b] = s.r_frame_rate.split('/').map(Number);
  return { frames: Number(s.nb_read_frames), fps: a / b, width: s.width, height: s.height };
}

/** A browser stand-in that records being launched, then runs the real pinned Chrome. */
function launchSpy() {
  const marker = path.join(tmp, `launched-${Math.random().toString(16).slice(2)}`);
  const real = browserPath();
  const stub = path.join(tmp, `chrome-spy-${path.basename(marker)}.sh`);
  writeFileSync(stub, `#!/bin/sh\ntouch '${marker}'\nexec '${real}' "$@"\n`);
  chmodSync(stub, 0o755);
  return { env: { HYPERFRAMES_BROWSER_PATH: stub }, launched: () => existsSync(marker) };
}

test('AC-BASE-09: capture --help lists every flag, --version = plugin.json, bad input is one actionable line, no network', (t) => {
  const flags = Object.keys(spec.options).map((k) => `--${k}`);
  const out = path.join(tmp, 'x.mp4');
  baseline(t, assert, CAPTURE, {
    flags,
    badArgs: [
      [],                                                           // nothing to capture
      ['--bogus'],                                                  // unknown flag
      ['--storyboard', path.join(tmp, 'missing.mjs'), '--out', out], // missing storyboard
      ['--storyboard', STORYBOARD, '--out', path.join(tmp, 'x.avi')], // unsupported container
      ['--storyboard', STORYBOARD, '--out', out, '--viewport', 'big'], // bad viewport
      ['--storyboard', STORYBOARD, '--out', out, '--audio-offset-ms', 'soon'], // not a number
      ['--storyboard', STORYBOARD, '--out', out, '--spine', path.join(tmp, 'nope.json')], // missing spine
      ['--plate', 'r1-feature'],                                    // --plate without --plates
    ],
  });
});

test('AC-REC-01: --help lists the recorder flags and no narration flags; each flag parses', () => {
  const help = run(CAPTURE, ['--help']);
  assert.equal(help.code, 0);
  for (const f of REC01_FLAGS) assert.match(help.stdout, new RegExp(`--${f.slice(2)}\\b`), `--help lists ${f}`);
  for (const f of NARRATION_FLAGS) assert.doesNotMatch(help.stdout, new RegExp(`${f}\\b`), `--help has no narration flag ${f}`);
  for (const f of NARRATION_FLAGS) {
    const r = run(CAPTURE, ['--storyboard', STORYBOARD, '--out', path.join(tmp, 'n.mp4'), f, ...(f === '--narrate' ? [] : ['x'])]);
    assert.notEqual(r.code, 0, `${f} is rejected`);
    assert.match(r.stderr, /Unknown option/, `${f} is unknown to capture`);
  }

  // the declared option table parses every flag (node:util parseArgs, as runCli does)
  const options = Object.fromEntries(Object.entries(spec.options).map(([k, o]) => [k, { type: o.type === 'number' ? 'string' : o.type }]));
  const css = path.join(tmp, 'cap.css');
  writeFileSync(css, '.pm-caption { color: yellow; }');
  const sample = { storyboard: STORYBOARD, out: path.join(tmp, 'a.webm'), mp4: path.join(tmp, 'a.mp4'), viewport: '960x540', 'caption-css': css,
    url: path.join(DECK, 'index.html'), 'audio-offset-ms': '-50', spine: spineFile };
  const argv = REC01_FLAGS.flatMap((f) => (spec.options[f.slice(2)].type === 'boolean' ? [f] : [`${f}=${sample[f.slice(2)]}`]));
  const { values } = parseArgs({ args: argv, options, strict: true });
  for (const f of REC01_FLAGS) assert.ok(values[f.slice(2)] !== undefined, `${f} parsed`);

  // and the real CLI accepts each one: with ffmpeg made unavailable the run gets past parsing and
  // flag validation, then stops at pre-flight (proving no flag was rejected) before any browser
  for (const f of REC01_FLAGS) {
    const k = f.slice(2);
    const args = ['--storyboard', STORYBOARD, '--out', path.join(tmp, 'b.mp4'), ...(k === 'storyboard' || k === 'out' ? [] : spec.options[k].type === 'boolean' ? [f] : [f, sample[k]])];
    const r = run(CAPTURE, args, { env: { PEAK_MEDIA_FFMPEG: path.join(tmp, 'no-ffmpeg') } });
    assert.equal(r.code, 3, `${f}: reaches pre-flight (${r.stderr})`);
    assert.match(r.stderr, /ffmpeg not found/, `${f}: stopped by the simulated missing ffmpeg, not by the flag`);
  }
});

test('AC-REC-02: missing Chromium, missing ffmpeg or a bad --spine exit non-zero in < 2 s with no browser launch', () => {
  const base = ['--storyboard', STORYBOARD, '--out', path.join(tmp, 'c.mp4')];
  const badSpine = path.join(tmp, 'bad-manifest.json');
  writeFileSync(badSpine, JSON.stringify({ ...spineDoc, schemaVersion: 2 }));
  const notJson = path.join(tmp, 'broken-manifest.json');
  writeFileSync(notJson, '{ "schemaVersion": 1,');
  const cases = [
    { name: 'missing Chromium', args: base, env: { HYPERFRAMES_BROWSER_PATH: path.join(tmp, 'no-such-chrome') }, msg: /Chromium not found/ },
    { name: 'missing ffmpeg', args: base, env: { PEAK_MEDIA_FFMPEG: path.join(tmp, 'no-ffmpeg') }, msg: /ffmpeg not found/ },
    { name: 'missing ffprobe', args: base, env: { PEAK_MEDIA_FFPROBE: path.join(tmp, 'no-ffprobe') }, msg: /ffprobe not found/ },
    { name: 'spine fails the schema', args: [...base, '--spine', badSpine], msg: /not a valid spine manifest: schemaVersion/ },
    { name: 'spine is not JSON', args: [...base, '--spine', notJson], msg: /not a valid spine manifest/ },
    { name: 'spine file missing', args: [...base, '--spine', path.join(tmp, 'nope', 'manifest.json')], msg: /no such file/ },
  ];
  for (const c of cases) {
    const spy = launchSpy();
    const r = run(CAPTURE, c.args, { env: { ...spy.env, ...c.env } });
    assert.notEqual(r.code, 0, `${c.name}: non-zero exit`);
    assert.ok(r.ms < 2000, `${c.name}: failed in ${r.ms} ms (< 2000)`);
    assert.match(r.stderr, c.msg, `${c.name}: ${r.stderr}`);
    assert.equal(r.stderr.trim().split('\n').length, 1, `${c.name}: one-line error`);
    assert.doesNotMatch(r.stderr, /launching browser/, `${c.name}: no launch logged`);
    assert.equal(spy.launched(), false, `${c.name}: the browser was never executed`);
  }
  // control: the same spy does record a launch when nothing is wrong (so "not launched" means something)
  const spy = launchSpy();
  const tiny = path.join(tmp, 'tiny.mjs');
  writeFileSync(tiny, "export default async ({ page, wait }) => { await page.setContent('<h1>ok</h1>'); await wait(200); };\n");
  const ok = run(CAPTURE, ['--storyboard', tiny, '--out', path.join(tmp, 'tiny.mp4')], { env: spy.env });
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(spy.launched(), true, 'control run launches the browser through the spy');
});

test('AC-REC-03: the example deck storyboard (original loop) runs unmodified in silent, captions and spine-timed modes', () => {
  const src = readFileSync(STORYBOARD, 'utf8');
  for (const step of ['waitForVoice()', 'wait(250)', 'deckGo', 'wait(900)', "say('', { narrate: paragraph })"]) assert.ok(src.includes(step), `storyboard keeps the original loop: ${step}`);
  const before = sha(STORYBOARD);
  const modes = {
    silent: ['--no-captions'],
    captions: [],
    spine: ['--spine', spineFile],
  };
  const takes = {};
  for (const [mode, extra] of Object.entries(modes)) {
    const out = path.join(tmp, `deck-${mode}.mp4`);
    const r = run(CAPTURE, ['--storyboard', STORYBOARD, '--out', out, '--json', '--debug-requests', ...extra], { network: true });
    assert.equal(r.code, 0, `${mode}: ${r.stderr}`);
    assertLocalOnly(r.stderr, mode);
    const take = json(r);
    takes[mode] = take;
    assert.equal(take.mode, mode);
    assert.equal(take.says.length, 3, `${mode}: one say() per slide`);
    const v = videoFrames(out);
    assert.equal(v.frames, take.frames, `${mode}: the file holds every frame of the take`);
    assert.equal(v.fps, 30);
    assert.deepEqual([v.width, v.height], [1280, 720]);
    assert.ok(take.uniqueFrames >= 3, `${mode}: the picture changes (${take.uniqueFrames} distinct frames)`);
  }
  assert.equal(sha(STORYBOARD), before, 'the storyboard file is unmodified');
  // silent: no captions; captions: every say() shows one, held for reading time
  assert.ok(takes.silent.says.every((s) => s.caption === false));
  assert.ok(takes.captions.says.every((s) => s.caption === true && s.durationMs >= 1500));
  // spine-timed: say() plays to the spine's clips, waitForVoice waits for each clip, the take is the spine's length
  const sp = takes.spine;
  assert.deepEqual(sp.says.map((s) => s.clip), spineDoc.clips.map((c) => c.n));
  sp.says.forEach((s, i) => {
    const c = spineDoc.clips[i];
    assert.equal(s.durationMs, c.durationMs, `say #${s.n} holds for clip ${c.n}`);
    assert.ok(s.startMs >= c.startMs - 5, `say #${s.n} never starts before its clip (${s.startMs} vs ${c.startMs})`);
  });
  for (let i = 1; i < sp.says.length; i++) {
    const prevEnd = spineDoc.clips[i - 1].startMs + spineDoc.clips[i - 1].durationMs;
    assert.ok(sp.says[i].startMs >= prevEnd + 1150 - 30, `waitForVoice held slide ${i + 1} until clip ${i} ended (+250 +900 ms)`);
  }
  assert.ok(Math.abs(sp.videoMs - spineDoc.totalMs) <= 1000 / 30, `spine take lasts the spine: ${sp.videoMs} vs ${spineDoc.totalMs}`);
});

test('AC-REC-04: F3 live plates on a 3-clip spine capture to their planned durations ±1 frame', async () => {
  const proj = makeF3Project(path.join(tmp, 'f3'), { url: LOCAL_PAGE });
  assert.equal(proj.manifest.clips.length, 3, 'a real 3-clip spine');
  const pv = await validateFile(proj.platesFile, 'plates');
  assert.ok(pv.ok, JSON.stringify(pv.errors));
  for (const p of proj.plates.plates) {
    const r = run(CAPTURE, ['--plates', proj.platesFile, '--plate', p.id, '--json', '--debug-requests'], { network: true });
    assert.equal(r.code, 0, `${p.id}: ${r.stderr}`);
    assertLocalOnly(r.stderr, p.id);
    const take = json(r);
    assert.equal(take.mode, 'spine');
    assert.equal(take.says.length, 1, `${p.id}: its beat's clip`);
    const out = path.join(proj.dir, 'renders', 'plates', `${p.id}.mp4`);
    assert.equal(take.out, out);
    const v = videoFrames(out);
    const ms = (v.frames / v.fps) * 1000;
    assert.ok(Math.abs(ms - p.durationMs) <= 1000 / proj.plates.fps + 0.5, `${p.id}: ${ms.toFixed(1)} ms vs planned ${p.durationMs} ms (±1 frame)`);
    assert.equal(v.frames, framesFor(p.durationMs, proj.plates.fps));
    assert.ok(take.uniqueFrames > 1, `${p.id}: the page moved`);
  }
  // the assembly stage accepts the captured plates as-is (size and duration checks)
  const plan = await loadProject(proj.platesFile);
  const renders = checkRenders(plan, path.join(proj.dir, 'renders', 'plates'));
  assert.equal(renders.length, 3);
});

test('AC-REC-04: the frame grid places frames by their own timestamps (t0 = first onFrame) and fills to an exact count', () => {
  const dir = mkdtempSync(path.join(tmp, 'grid-'));
  const g = new FrameGrid(dir, 30);
  const t0 = 1_700_000_000_000.25;
  g.onFrame({ data: Buffer.from('a'), timestamp: t0 });
  g.onFrame({ data: Buffer.from('b'), timestamp: t0 + 100 });   // slot 3
  g.onFrame({ data: Buffer.from('c'), timestamp: t0 + 1000 });  // slot 30
  assert.equal(g.t0, t0);
  const { pattern, unique } = g.finish(framesFor(2000, 30));
  assert.equal(unique, 3);
  const at = (k) => readFileSync(pattern.replace('%07d', String(k).padStart(7, '0')), 'utf8');
  assert.deepEqual([at(0), at(2), at(3), at(29), at(30), at(59)], ['a', 'a', 'b', 'b', 'c', 'c']);
  assert.equal(existsSync(pattern.replace('%07d', String(60).padStart(7, '0'))), false, 'exactly 60 frames for 2000 ms at 30 fps');
});
