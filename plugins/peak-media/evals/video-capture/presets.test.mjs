// video-capture (WP13): presets and output. --out is the MP4 deliverable with audio, encoded to
// --preset web|youtube|hifi; plates refuse --preset; probe-spec --preset checks the encode;
// check-take scores scene changes above the caption band, so captions and the cursor are not cuts.
// Pages are served on 127.0.0.1 — no internet; spines use fake/tone with no key.
// Captures are real time: run this file alone (`node --test <this file>` or ac-run --wp WP13).
//
// Set PEAK_MEDIA_EVIDENCE_DIR to keep the measurements and contact sheet (JPEG/JSON only);
// otherwise they are written to the temp dir and deleted.
import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, run, tmpDir } from '../helpers/run.mjs';
import { CAPTURE, SPINE, DECK, NO_KEY, makeF3Project, LOCAL_PAGE } from './helpers/projects.mjs';
import { toneOnsets } from './helpers/sync.mjs';
import { PRESETS, presetExpect } from '../../lib/presets.mjs';
import { probeSpec, x264Options } from '../../lib/verify/probe-spec.mjs';
import { contactSheet } from '../../lib/verify/contact-sheet.mjs';
import { browserPath } from '../../lib/hf.mjs';

const UI = path.join(ROOT, 'skills', 'video-capture', 'examples', 'ui-demo');
const UI_STORYBOARD = path.join(UI, 'storyboard.mjs');
const UI_SCRIPT = path.join(UI, 'script.md');
const CHECK_TAKE = 'skills/video-capture/scripts/check-take.mjs';
const LOOPBACK_ONLY = path.join(ROOT, 'evals', 'video-capture', 'helpers', 'loopback-only.mjs');
/** Hosts a TTS call would go to (OpenRouter is the only TTS provider). */
const TTS_HOSTS = /openrouter|api\.openai|texttospeech|elevenlabs/i;

const test = (name, fn) => nodeTest(name, { concurrency: false }, fn);

let tmp, evidence, cache;
before(() => {
  tmp = tmpDir('pm-capture-wp13-');
  cache = path.join(tmp, 'tts-cache');
  evidence = process.env.PEAK_MEDIA_EVIDENCE_DIR ?? path.join(tmp, 'evidence');
  mkdirSync(evidence, { recursive: true });
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const keep = (name, data) => writeFileSync(path.join(evidence, name), JSON.stringify(data, null, 2) + '\n');
const env = (extra = {}) => ({ ...process.env, ...NO_KEY, PEAK_MEDIA_TTS_CACHE: cache, PEAK_MEDIA_TTS_LEGACY_DIRS: '', ...extra });

/** Run capture (real time) under the loopback-only network guard, with --json --debug-requests. */
function capture(args, { ok = true, extraEnv = {} } = {}) {
  const r = spawnSync(process.execPath, ['--import', LOOPBACK_ONLY, path.join(ROOT, CAPTURE), ...args, '--json', '--debug-requests'], { encoding: 'utf8', cwd: ROOT, env: env(extraEnv), timeout: 240_000 });
  if (ok) assert.equal(r.status, 0, `capture ${args.join(' ')}: ${r.stderr}`);
  const take = r.status === 0 ? JSON.parse(r.stdout) : null;
  return { code: r.status, stderr: r.stderr, take, manifest: take && JSON.parse(readFileSync(take.manifest, 'utf8')) };
}

/** Every request the page made, from --debug-requests; and what the network guard caught. */
function network(stderr) {
  return {
    requests: [...stderr.matchAll(/^capture: request \S+ (\S+)/gm)].map((m) => m[1]),
    blocked: [...stderr.matchAll(/^NETWORK-ATTEMPT (\S+)/gm)].map((m) => m[1]),
  };
}
function assertNoTts(stderr, what) {
  const n = network(stderr);
  assert.ok(n.requests.length >= 1, `${what}: the request log is on`);
  for (const u of n.requests) assert.match(u, /^(http:\/\/127\.0\.0\.1:\d+\/|data:|about:)/, `${what}: only local page requests (${u})`);
  assert.deepEqual(n.blocked, [], `${what}: no connection beyond loopback`);
  assert.doesNotMatch(stderr, TTS_HOSTS, `${what}: no TTS host named anywhere`);
  return n;
}

const memo = (fn) => { let v; return () => (v ??= fn()); };

// ---- takes shared by the tests ----

/** The ui-demo once per preset (web is the default: no --preset flag). */
const uiPreset = Object.fromEntries(Object.keys(PRESETS).map((p) => [p, memo(() => {
  const out = path.join(tmp, `ui-${p}.mp4`);
  return { out, ...capture(['--storyboard', UI_STORYBOARD, '--script', UI_SCRIPT, '--out', out, ...(p === 'web' ? [] : ['--preset', p])]) };
})]));
const uiSilent = memo(() => {
  const out = path.join(tmp, 'ui-silent.mp4');
  return { out, ...capture(['--storyboard', UI_STORYBOARD, '--script', UI_SCRIPT, '--out', out, '--no-captions']) };
});

/** The example deck narrated on a fake/tone spine (950 ms lead, so the first slide settles), captions on. */
const deck = memo(() => {
  const dir = path.join(tmp, 'deck', 'spine');
  const r = run(SPINE, ['--brief', path.join(DECK, 'brief.md'), '--tts-model', 'fake/tone', '--out', dir, '--cache-dir', cache, '--lead-ms', '950'], { env: { ...NO_KEY, PEAK_MEDIA_TTS_CACHE: cache } });
  assert.equal(r.code, 0, r.stderr);
  const file = path.join(dir, 'manifest.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(doc.kind, 'narration');
  const out = path.join(tmp, 'deck-narrated.mp4');
  return { spine: { file, doc }, out, ...capture(['--storyboard', path.join(DECK, 'storyboard.mjs'), '--spine', file, '--out', out]) };
});

// ---------------------------------------------------------------------------------------------

test('AC-W2V-10: with no TTS key and a loopback-only network guard, the ui-demo captures in captions and silent mode with zero TTS requests', () => {
  for (const k of Object.keys(NO_KEY)) assert.equal(env()[k], '', `${k} is unset for the runs`);
  const report = {};
  for (const [mode, t] of [['captions', uiPreset.web()], ['silent', uiSilent()]]) {
    assert.equal(t.code, 0);
    assert.equal(t.take.mode, mode);
    assert.equal(t.take.preset, 'web', `${mode}: the default preset`);
    assert.ok(existsSync(t.out), `${mode}: --out written`);
    const n = assertNoTts(t.stderr, mode);
    assert.equal(t.take.audio.clips, 0, `${mode}: no narration, a silent AAC track`);
    report[mode] = { out: path.basename(t.out), requests: n.requests.length, distinctHosts: [...new Set(n.requests.map((u) => (/^https?:/.test(u) ? new URL(u).host : u.split(':')[0])))], blocked: n.blocked };
  }
  // control: the guard does catch a TTS call
  const ctl = spawnSync(process.execPath, ['--import', LOOPBACK_ONLY, '-e', "fetch('https://openrouter.ai/api/v1/audio/speech').catch(() => {})"], { encoding: 'utf8' });
  assert.match(ctl.stderr, /NETWORK-ATTEMPT https:\/\/openrouter\.ai/);
  keep('AC-W2V-10-network.json', { note: 'ui-demo under helpers/loopback-only.mjs with both TTS key variables empty; requests from --debug-requests', ...report, control: ctl.stderr.trim() });
});

test('AC-W2V-11: the deck narrated on a fake/tone spine — each clip starts in --out at its spine time (± one frame), and capture made no TTS request', () => {
  const d = deck();
  assert.equal(d.take.mode, 'narrated');
  assert.equal(d.take.out, d.out);
  assertNoTts(d.stderr, 'narrated deck');
  const fps = d.take.fps, frame = 1000 / fps;
  const off = d.spine.doc.audioOffsetMs ?? 0;
  const onsets = toneOnsets(d.out).filter((ms) => ms < d.take.videoMs - 50); // silencedetect also closes a silence at the end
  assert.equal(onsets.length, d.spine.doc.clips.length, `one onset per clip: ${onsets}`);
  const rows = d.spine.doc.clips.map((c, i) => {
    const beat = d.take.beats.find((b) => b.clipNs?.includes(c.n));
    return { n: c.n, beat: beat.id, spineStartMs: c.startMs, onsetMs: Number(onsets[i].toFixed(1)), errMs: Number((onsets[i] - c.startMs).toFixed(1)), beatPlannedMs: beat.plannedMs, beatStartMs: beat.startMs, lateMs: beat.lateMs };
  });
  for (const r of rows) {
    assert.ok(Math.abs(r.errMs) <= frame, `clip ${r.n}: onset ${r.onsetMs} ms vs spine ${r.spineStartMs} ms (±${frame.toFixed(1)} ms)`);
    assert.equal(r.beatPlannedMs, r.spineStartMs - off, `beat ${r.beat} is planned at its clip's start minus the audio offset (${off} ms)`);
  }
  keep('AC-W2V-11-onsets.json', { note: 'tone onsets (end of each ≥200 ms silence at -40 dB) in the --out MP4 vs the spine clip start; beat planned = clip start − audioOffsetMs', fps, audioOffsetMs: off, rows });
});

test('AC-W2V-12: the ui-demo captured once per preset passes probe-spec --preset for each', () => {
  const report = {};
  for (const p of Object.keys(PRESETS)) {
    const t = uiPreset[p]();
    const exp = presetExpect(p);
    assert.equal(t.take.preset, p);
    assert.equal(t.manifest['x-take'].preset, p, `${p}: x-take records the preset`);
    assert.deepEqual([t.take.width, t.take.height, t.take.fps], [exp.width, exp.height, exp.fps], `${p}: captured at the preset's size and fps`);
    const r = probeSpec(t.out, { preset: p, durationMs: t.take.videoMs });
    for (const c of r.checks) assert.ok(c.ok, `${p}: ${c.name} expected ${c.expected}, got ${c.actual}`);
    // and the CLI agrees
    const cli = run('lib/verify/probe-spec.mjs', ['--preset', p, t.out]);
    assert.equal(cli.code, 0, cli.stdout);
    report[p] = { checks: r.checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.name}: ${c.actual}`) };
  }
  // control: a web file is not a youtube file (size, rate control, GOP, B-frames, edit lists)
  const wrong = probeSpec(uiPreset.web().out, { preset: 'youtube' });
  const failed = wrong.checks.filter((c) => !c.ok).map((c) => c.name);
  assert.equal(wrong.ok, false);
  for (const n of ['width', '[youtube] encoder rate control (x264 SEI)', '[youtube] no edit lists']) assert.ok(failed.includes(n), `control flags ${n}: ${failed}`);
  assert.ok(failed.some((n) => /GOP length/.test(n)), 'control flags the GOP length');
  report.control = { file: 'ui-web.mp4 checked as youtube', failed };
  keep('AC-W2V-12-probe.json', report);
});

test('AC-W2V-13: --preset youtube --viewport 1280x720 --fps 25 records 1280x720@25 with youtube encoding; a plate with --preset is refused before a browser opens', () => {
  const out = path.join(tmp, 'ui-youtube-720p25.mp4');
  const t = capture(['--storyboard', UI_STORYBOARD, '--script', UI_SCRIPT, '--out', out, '--preset', 'youtube', '--viewport', '1280x720', '--fps', '25']);
  assert.deepEqual([t.take.width, t.take.height, t.take.fps, t.take.preset], [1280, 720, 25, 'youtube']);
  const r = probeSpec(out, { preset: 'youtube', width: 1280, height: 720, fps: 25, durationMs: t.take.videoMs });
  for (const c of r.checks) assert.ok(c.ok, `${c.name} expected ${c.expected}, got ${c.actual}`);
  const x = x264Options(out);
  assert.equal(x.bitrate, '8000', 'the youtube bitrate (25 fps is not above 30)');
  assert.equal(Number(x.keyint), 13, 'GOP of half of 25 fps (rounded)');
  // the plate refusal: one line, non-zero, before a browser is launched (a spy stands in for Chrome)
  const proj = makeF3Project(path.join(tmp, 'f3'), { url: LOCAL_PAGE });
  const marker = path.join(tmp, 'launched');
  const spy = path.join(tmp, 'chrome-spy.sh');
  writeFileSync(spy, `#!/bin/sh\ntouch '${marker}'\nexec '${browserPath()}' "$@"\n`);
  chmodSync(spy, 0o755);
  const plate = proj.plates.plates[0].id;
  const ref = run(CAPTURE, ['--plates', proj.platesFile, '--plate', plate, '--preset', 'web'], { env: { HYPERFRAMES_BROWSER_PATH: spy } });
  assert.notEqual(ref.code, 0);
  assert.equal(ref.code, 2, 'a usage error');
  const lines = ref.stderr.trim().split('\n').filter((l) => !/^Run '.+ --help' for usage\.$/.test(l));
  assert.equal(lines.length, 1, ref.stderr);
  assert.match(lines[0], /--preset is for standalone takes: plate '.+' keeps plates\.json's size and fps .*drop --preset/);
  assert.doesNotMatch(ref.stderr, /launching browser/);
  assert.equal(existsSync(marker), false, 'the browser was never executed');
  assert.ok(ref.ms < 5000, `refused in ${ref.ms} ms`);
  keep('AC-W2V-13-override.json', { take: { width: t.take.width, height: t.take.height, fps: t.take.fps, preset: t.take.preset }, x264: { rc: x.rc, bitrate: x.bitrate, vbv_maxrate: x.vbv_maxrate, keyint: x.keyint, bframes: x.bframes, open_gop: x.open_gop }, checks: r.checks.map((c) => `${c.ok ? 'ok' : 'FAIL'} ${c.name}: ${c.actual}`), plateRefusal: { code: ref.code, ms: ref.ms, stderr: lines[0] } });
});

test('AC-W2V-14: the narrated deck with captions on passes check-take --expect-cuts 2 — captions and the cursor are not cuts; both slide changes sit in >= 900 ms of silence', () => {
  const d = deck();
  assert.equal(d.take.captionTimings.length, d.spine.doc.beats.length, 'captions are on: one per beat');
  const r = run(CHECK_TAKE, [d.out, '--expect-cuts', '2', '--json']);
  assert.equal(r.code, 0, `check-take passes: ${r.stdout}${r.stderr}`);
  const res = JSON.parse(r.stdout);
  assert.equal(res.captionBand, 0.25, 'the default caption band');
  assert.equal(res.cuts.length, 2);
  const clips = d.spine.doc.clips;
  res.cuts.forEach((c, i) => {
    assert.ok(c.ok && c.silenceMs >= 900, `slide change at ${c.timecode} sits in ${c.silenceMs} ms of silence`);
    const [gapStart, gapEnd] = [clips[i].startMs + clips[i].durationMs, clips[i + 1].startMs];
    assert.ok(c.cutMs > gapStart && c.cutMs < gapEnd, `slide change ${i + 1} (${c.timecode}) is between clips ${i + 1} and ${i + 2}`);
  });
  // control: scoring the whole frame counts the captions coming up and down as picture changes over speech
  const whole = JSON.parse(run(CHECK_TAKE, [d.out, '--caption-band', '0', '--json']).stdout);
  assert.ok(whole.cuts.length > 2 && !whole.ok, `with --caption-band 0 the captions read as cuts (${whole.cuts.map((c) => c.timecode)})`);

  // the cursor: a captioned take of a still page whose only motion is the cursor gliding corner to
  // corner and the captions changing finds no scene change at the default threshold
  const page = path.join(tmp, 'still.html');
  writeFileSync(page, '<!doctype html><style>body{margin:0;background:#f4f1ea;font:24px system-ui}button{position:fixed;padding:12px 20px}#a{left:40px;top:40px}#b{right:40px;top:40px}#c{left:40px;top:430px}#d{right:40px;top:430px}</style><button id=a>A</button><button id=b>B</button><button id=c>C</button><button id=d>D</button>');
  const script = path.join(tmp, 'glide.md');
  writeFileSync(script, '## one\n\nThe cursor goes across.\n\n## two\n\nAnd down to the corner.\n\n## three\n\nThen back over the page.\n');
  const sb = path.join(tmp, 'glide.mjs');
  writeFileSync(sb, [
    'export default async ({ beat, point, wait }) => {',
    "  await beat('one', async () => { await point('#a'); await point('#b'); await wait(300); });",
    "  await beat('two', async () => { await point('#d'); await point('#c'); await wait(300); });",
    "  await beat('three', async () => { await point('#b'); await point('#a'); await wait(300); });",
    '};', ''].join('\n'));
  const glideOut = path.join(tmp, 'glide.mp4');
  const g = capture(['--storyboard', sb, '--script', script, '--url', page, '--out', glideOut]);
  assert.equal(g.take.cursorEngine, 'overlay');
  assert.equal(g.take.pointer.length, 6, 'six glides');
  const glide = run(CHECK_TAKE, [glideOut, '--expect-cuts', '0', '--json']);
  assert.equal(glide.code, 0, `a cursor glide is not a cut: ${glide.stdout}`);
  const at = [...res.cuts.map((c) => c.cutMs - 400), ...res.cuts.map((c) => c.cutMs + 1200), ...d.take.captionTimings.map((c) => c.startMs + 300)].sort((a, b) => a - b);
  contactSheet(d.out, { out: path.join(evidence, 'AC-W2V-14-deck-captions.jpg'), at, cols: 4, width: 640 });
  keep('AC-W2V-14-check-take.json', {
    deck: { captionBand: res.captionBand, cuts: res.cuts.map((c) => ({ timecode: c.timecode, silenceMs: c.silenceMs, ok: c.ok })), captions: d.take.captionTimings.map((c) => ({ text: c.text, startMs: c.startMs, durationMs: c.durationMs })) },
    wholeFrameControl: { cuts: whole.cuts.map((c) => ({ timecode: c.timecode, ok: c.ok })) },
    cursorGlide: { pointer: g.take.pointer, cuts: JSON.parse(glide.stdout).cuts.length },
  });
});
