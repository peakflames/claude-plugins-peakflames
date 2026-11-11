// video-capture (WP13): presets and output. --out is the MP4 deliverable with audio, encoded to
// --preset web|youtube|hifi; plates refuse --preset; probe-spec --preset checks the encode;
// check-take scores scene changes above the caption band, so captions and the cursor are not cuts.
// Pages are served on 127.0.0.1 — no internet; spines use fake/tone with no key.
// Captures are real time: run this file alone (`node --test <this file>` or ac-run --wp WP13).
//
// Set PEAK_MEDIA_EVIDENCE_DIR to keep the measurements and contact sheet (JPEG/JSON only);
// otherwise they are written to the temp dir and deleted.
import { test as nodeTest, before, after } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, run, tmpDir } from '../helpers/run.mjs';
import { CAPTURE, SPINE, DECK, NO_KEY, makeF3Project, LOCAL_PAGE } from './helpers/projects.mjs';
import { toneOnsets } from './helpers/sync.mjs';
import { PRESETS, presetExpect } from '../../lib/presets.mjs';
import { probeSpec, x264Options } from '../../lib/verify/probe-spec.mjs';
import { contactSheet } from '../../lib/verify/contact-sheet.mjs';
import { browserPath } from '../../lib/hf.mjs';
import { mergeTransitions } from '../../skills/video-capture/scripts/check-take.mjs';

const UI = path.join(ROOT, 'skills', 'video-capture', 'examples', 'ui-demo');
const UI_STORYBOARD = path.join(UI, 'storyboard.mjs');
const UI_SCRIPT = path.join(UI, 'script.md');
const CHECK_TAKE = 'skills/video-capture/scripts/check-take.mjs';
const LOOPBACK_ONLY = pathToFileURL(path.join(ROOT, 'evals', 'video-capture', 'helpers', 'loopback-only.mjs')).href;
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

/** The example deck's fake/tone spine (950 ms lead, so the first slide settles). */
const deckSpine = memo(() => {
  const dir = path.join(tmp, 'deck', 'spine');
  const r = run(SPINE, ['--brief', path.join(DECK, 'brief.md'), '--tts-model', 'fake/tone', '--out', dir, '--cache-dir', cache, '--lead-ms', '950'], { env: { ...NO_KEY, PEAK_MEDIA_TTS_CACHE: cache } });
  assert.equal(r.code, 0, r.stderr);
  const file = path.join(dir, 'manifest.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(doc.kind, 'narration');
  return { file, doc };
});
/** The deck narrated on that spine, captions on, per variant: web (default), youtube, youtube@60, hifi. */
const DECK_VARIANTS = { web: [], youtube: ['--preset', 'youtube'], 'youtube@60': ['--preset', 'youtube', '--fps', '60'], hifi: ['--preset', 'hifi'] };
const deckTakes = Object.fromEntries(Object.entries(DECK_VARIANTS).map(([name, extra]) => [name, memo(() => {
  const spine = deckSpine();
  const out = path.join(tmp, `deck-${name.replace('@', '-')}.mp4`);
  return { name, spine, out, ...capture(['--storyboard', path.join(DECK, 'storyboard.mjs'), '--spine', spine.file, '--out', out, ...extra]) };
})]));
const deck = deckTakes.web;

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

/** Max error allowed between a clip's sound onset in --out and its spine time, on every preset (WP13 fix round 1, M2). */
const ONSET_TOL_MS = 2;

test('AC-W2V-11: the deck narrated on a fake/tone spine — each clip starts in --out at its spine time (± one frame; within 2 ms on web, youtube and youtube@60), and capture made no TTS request', () => {
  const report = {};
  for (const name of ['web', 'youtube', 'youtube@60']) {
    const d = deckTakes[name]();
    assert.equal(d.take.mode, 'narrated');
    assert.equal(d.take.out, d.out);
    assertNoTts(d.stderr, `narrated deck (${name})`);
    const fps = d.take.fps, frame = 1000 / fps;
    const off = d.spine.doc.audioOffsetMs ?? 0;
    const onsets = toneOnsets(d.out).filter((ms) => ms < d.take.videoMs - 50); // silencedetect also closes a silence at the end
    assert.equal(onsets.length, d.spine.doc.clips.length, `${name}: one onset per clip: ${onsets}`);
    const rows = d.spine.doc.clips.map((c, i) => {
      const beat = d.take.beats.find((b) => b.clipNs?.includes(c.n));
      return { n: c.n, beat: beat.id, spineStartMs: c.startMs, onsetMs: Number(onsets[i].toFixed(1)), errMs: Number((onsets[i] - c.startMs).toFixed(1)), beatPlannedMs: beat.plannedMs, beatStartMs: beat.startMs, lateMs: beat.lateMs };
    });
    for (const r of rows) {
      assert.ok(Math.abs(r.errMs) <= frame, `${name} clip ${r.n}: onset ${r.onsetMs} ms vs spine ${r.spineStartMs} ms (±${frame.toFixed(1)} ms, one frame)`);
      assert.ok(Math.abs(r.errMs) <= ONSET_TOL_MS, `${name} clip ${r.n}: onset ${r.onsetMs} ms vs spine ${r.spineStartMs} ms (±${ONSET_TOL_MS} ms)`);
      assert.equal(r.beatPlannedMs, r.spineStartMs - off, `${name}: beat ${r.beat} is planned at its clip's start minus the audio offset (${off} ms)`);
    }
    report[name] = { preset: d.take.preset, fps, audioOffsetMs: off, rows };
  }
  keep('AC-W2V-11-onsets.json', { note: 'tone onsets (end of each ≥200 ms silence at -40 dB) in the --out MP4 vs the spine clip start; beat planned = clip start − audioOffsetMs. youtube writes no edit lists, so capture drops the AAC priming from the mix instead', toleranceMs: ONSET_TOL_MS, ...report });
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

test('AC-W2V-14: at 1080p too — the narrated deck with captions on passes check-take --expect-cuts 2 at --preset youtube and --preset hifi (and youtube@60)', () => {
  // WP13 verify-1 M1: before the fix the threshold was the same at any size and rate, and these
  // takes found 0 scene changes (slide changes scored 0.009–0.0195 against 0.02)
  const report = {};
  for (const name of ['youtube', 'hifi', 'youtube@60']) {
    const d = deckTakes[name]();
    assert.equal(d.take.captionTimings.length, d.spine.doc.beats.length, `${name}: captions are on`);
    const r = run(CHECK_TAKE, [d.out, '--expect-cuts', '2', '--json']);
    const res = JSON.parse(r.stdout);
    assert.equal(r.code, 0, `${name}: check-take --expect-cuts 2 passes: ${r.stdout}`);
    const clips = d.spine.doc.clips;
    res.cuts.forEach((c, i) => {
      assert.ok(c.ok && c.silenceMs >= 900, `${name}: slide change at ${c.timecode} sits in ${c.silenceMs} ms of silence`);
      assert.ok(c.cutMs > clips[i].startMs + clips[i].durationMs && c.cutMs < clips[i + 1].startMs, `${name}: slide change ${i + 1} (${c.timecode}) is between clips`);
    });
    assert.equal(res.scoredFps, 30, `${name}: scored at 30 fps`);
    assert.ok(Math.abs(res.effectiveThreshold - (0.02 * 1280 * 720) / (1920 * 1080)) < 1e-6, `${name}: threshold scaled to the frame area (${res.effectiveThreshold})`);
    // control: captions still don't count at 1080p (the whole frame finds more, over speech)
    const whole = JSON.parse(run(CHECK_TAKE, [d.out, '--caption-band', '0', '--json']).stdout);
    assert.ok(whole.cuts.length > 2 && !whole.ok, `${name}: with --caption-band 0 the captions read as cuts`);
    report[name] = { size: `${d.take.width}x${d.take.height}`, fps: d.take.fps, effectiveThreshold: res.effectiveThreshold, scoredFps: res.scoredFps, cuts: res.cuts.map((c) => ({ timecode: c.timecode, silenceMs: c.silenceMs, ok: c.ok, frames: c.frames ?? 1 })), wholeFrameCuts: whole.cuts.length };
  }
  keep('AC-W2V-14-1080p.json', { note: 'narrated deck, captions on, check-take --expect-cuts 2 per 1080p preset; threshold 0.02 at 1280x720, scaled by area, scored at <= 30 fps', ...report });
});

// ---- check-take's transition merge (WP13 verify-1 m1, m2): not ACs, no capture ----

const cut = (ms, ok = true) => ({ cutMs: ms, timecode: `${ms}`, ok, gap: ok ? { startMs: 0, endMs: 10_000 } : null, silenceMs: ok ? 10_000 : 0 });

test('check-take merge (m1): a group spans at most 150 ms from its first detection, so a chain splits and two cuts 200 ms apart stay two', () => {
  // a chain every 100 ms over 800 ms: before the fix it was one 9-frame "transition"
  const chain = mergeTransitions([0, 100, 200, 300, 400, 500, 600, 700, 800].map((ms) => cut(ms + 4000)));
  assert.ok(chain.length >= 4, `the chain splits into bounded groups (${chain.map((c) => `${c.cutMs}+${c.frames ?? 1}`)})`);
  for (const g of chain) assert.ok((g.endMs ?? g.cutMs) - (g.startMs ?? g.cutMs) < 150, 'no group spans 150 ms or more');
  // two hard cuts 200 ms apart: two scene changes
  assert.equal(mergeTransitions([cut(2000), cut(2200)]).length, 2);
  // a fade scoring on consecutive frames (33 ms apart) is still one transition
  const fade = mergeTransitions([cut(15167), cut(15200)]);
  assert.equal(fade.length, 1);
  assert.deepEqual([fade[0].startMs, fade[0].endMs, fade[0].frames], [15167, 15200, 2]);
});

test('check-take merge (m2): a failing merged transition is reported at the frame that fails', () => {
  const [g] = mergeTransitions([cut(2000), cut(2066, false), cut(2100)]);
  assert.equal(g.ok, false);
  assert.equal(g.cutMs, 2066, 'the failing frame, not the group\'s first');
  assert.equal(g.timecode, '2066');
  assert.deepEqual([g.startMs, g.endMs, g.frames], [2000, 2100, 3]);
});

test('check-take (m1, end to end): two hard cuts 200 ms apart in silence count as 2', () => {
  // red | blue at 2.0 s | green at 2.2 s, all in silence, then a tone from 4 s
  const f = path.join(tmp, 'two-cuts.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=1280x720:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=30:d=0.2', '-f', 'lavfi', '-i', 'color=c=green:s=1280x720:r=30:d=3.8',
    '-f', 'lavfi', '-i', "aevalsrc='if(lt(t,4),0,0.5*sin(2*PI*440*t))':s=48000:d=6",
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f]);
  assert.equal(r.status, 0, String(r.stderr));
  const res = JSON.parse(run(CHECK_TAKE, [f, '--json', '--caption-band', '0']).stdout);
  assert.deepEqual(res.cuts.map((c) => c.cutMs), [2000, 2200], `two scene changes (${res.cuts.map((c) => c.timecode)})`);
  assert.equal(run(CHECK_TAKE, [f, '--expect-cuts', '2']).code, 0);
});
