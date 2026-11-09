// video-capture (WP7b): captions, the --mp4 mux, the take manifest, check-take, the ui-demo and
// the A/V sync test. Pages are served on 127.0.0.1 — no internet. Spines come from spine.mjs with
// fake/tone and a temp TTS cache, with both key variables unset.
// Run alone (AC-REC-06): captures are real time and the sync test is timing-sensitive. Under
// `node --test plugins/peak-media/evals` the files run in parallel child processes, so before()
// waits (helpers/alone.mjs) until every other eval file has finished; the tests in this file then
// run one after another (node:test runs a file's top-level tests serially; concurrency: false is
// set explicitly below). ac-run --wp WP7b gets the same isolation. This must stay the only file
// that uses the run-alone gate.
//
// Set PEAK_MEDIA_EVIDENCE_DIR to keep the stills, measurements and manifests (JPEG/JSON only).
import { test as nodeTest, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ROOT, run, baseline, tmpDir } from '../helpers/run.mjs';
import { CAPTURE, SPINE, DECK, NO_KEY } from './helpers/projects.mjs';
import { measureSync } from './helpers/sync.mjs';
import { waitUntilAlone, siblings } from './helpers/alone.mjs';
import { COLOURS } from './fixtures/sync/storyboard.mjs';
import { CAPTIONS } from '../../skills/video-capture/examples/ui-demo/storyboard.mjs';
import { spec as checkTakeSpec } from '../../skills/video-capture/scripts/check-take.mjs';
import { probeSpec } from '../../lib/verify/probe-spec.mjs';
import { contactSheet } from '../../lib/verify/contact-sheet.mjs';
import { validateFile } from '../../lib/schemas.mjs';
import { loudness } from '../../skills/video-assemble/scripts/audio.mjs';

const CHECK_TAKE = 'skills/video-capture/scripts/check-take.mjs';
const UI = path.join(ROOT, 'skills', 'video-capture', 'examples', 'ui-demo');
const UI_STORYBOARD = path.join(UI, 'storyboard.mjs');
const UI_ALT_CSS = path.join(UI, 'captions-alt.css');
const SYNC = path.join(ROOT, 'evals', 'video-capture', 'fixtures', 'sync');
const LOOPBACK_ONLY = path.join(ROOT, 'evals', 'video-capture', 'helpers', 'loopback-only.mjs');
const EVIDENCE = process.env.PEAK_MEDIA_EVIDENCE_DIR;
const FPS = 30;
const FRAME_MS = 1000 / FPS;

const test = (name, fn) => nodeTest(name, { concurrency: false }, fn);

let tmp, cache, alone;
before(async () => {
  alone = await waitUntilAlone();
  if (!alone.alone) process.stderr.write(`warning: other eval files still running after ${alone.waitedMs} ms; timing tests run anyway\n`);
  tmp = tmpDir('pm-capture-wp7b-');
  cache = path.join(tmp, 'tts-cache');
  if (EVIDENCE) mkdirSync(EVIDENCE, { recursive: true });
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const keep = (name, data) => { if (EVIDENCE) writeFileSync(path.join(EVIDENCE, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'); };
const env = () => ({ ...NO_KEY, PEAK_MEDIA_TTS_CACHE: cache, PEAK_MEDIA_TTS_LEGACY_DIRS: '' });

/** A real spine from spine.mjs (fake/tone, temp cache, no key). */
function buildSpine(brief, name, extra = []) {
  const out = path.join(tmp, name);
  const r = run(SPINE, ['--brief', brief, '--tts-model', 'fake/tone', '--out', out, '--cache-dir', cache, ...extra], { env: env() });
  assert.equal(r.code, 0, `spine ${name}: ${r.stderr}${r.stdout}`);
  return { file: path.join(out, 'manifest.json'), doc: JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')) };
}

/** Run capture (real time). opts.preload = 'loopback' runs it under the loopback-only network guard. */
function capture(args, { preload = null, extraEnv = {} } = {}) {
  const pre = preload === 'loopback' ? ['--import', LOOPBACK_ONLY] : [];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [...pre, path.join(ROOT, CAPTURE), ...args, '--json', '--debug-requests'], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...env(), ...extraEnv } });
  const res = { code: r.status, stdout: r.stdout, stderr: r.stderr, ms: Date.now() - t0 };
  assert.equal(res.code, 0, `capture ${args.join(' ')}: ${res.stderr}`);
  assertLocalOnly(res.stderr);
  return { ...res, take: JSON.parse(res.stdout) };
}

function assertLocalOnly(stderr) {
  const reqs = [...stderr.matchAll(/^capture: request \S+ (\S+)/gm)].map((m) => m[1]);
  assert.ok(reqs.length >= 1, 'the request log is on');
  for (const u of reqs) assert.match(u, /^(http:\/\/127\.0\.0\.1:\d+\/|data:|about:)/, `only local page requests (${u})`);
  assert.doesNotMatch(stderr, /request failed/, 'no failed requests');
}

const memo = (fn) => { let v; return () => (v ??= fn()); };

// ---- the takes (each captured once, shared by the tests below) ----

/** The narrated example deck: a spine whose 1150 ms lead-in fits the deck loop's pause. */
const deck = memo(() => {
  const spine = buildSpine(path.join(DECK, 'brief.md'), 'deck-spine', ['--lead-ms', '950']);
  const mp4 = path.join(tmp, 'deck.mp4');
  const { take } = capture(['--storyboard', path.join(DECK, 'storyboard.mjs'), '--spine', spine.file, '--mp4', mp4]);
  return { spine, mp4, take };
});

/** The ui-demo in its three caption variants. The default runs keyless under the network guard (AC-REC-10). */
const ui = {
  default: memo(() => {
    const mp4 = path.join(tmp, 'ui-default.mp4');
    const r = capture(['--storyboard', UI_STORYBOARD, '--mp4', mp4], { preload: 'loopback' });
    return { mp4, ...r };
  }),
  'no-captions': memo(() => {
    const mp4 = path.join(tmp, 'ui-no-captions.mp4');
    return { mp4, ...capture(['--storyboard', UI_STORYBOARD, '--mp4', mp4, '--no-captions']) };
  }),
  'caption-css': memo(() => {
    const mp4 = path.join(tmp, 'ui-caption-css.mp4');
    return { mp4, ...capture(['--storyboard', UI_STORYBOARD, '--mp4', mp4, '--caption-css', UI_ALT_CSS, '--manifest', path.join(tmp, 'ui-css-take.json')]) };
  }),
};

const syncSpine = memo(() => buildSpine(path.join(SYNC, 'brief.md'), 'sync-spine'));
/** A sync take: voice-only (--no-captions: no overlay at all) or captioned (the default overlay engine). */
function syncTake(captioned, i = 1) {
  const mp4 = path.join(tmp, `sync-${captioned ? 'captions' : 'voice'}-${i}.mp4`);
  const { take } = capture(['--storyboard', path.join(SYNC, 'storyboard.mjs'), '--spine', syncSpine().file, '--mp4', mp4, '--audio-offset-ms', '0', ...(captioned ? [] : ['--no-captions'])],
    { extraEnv: { PEAK_MEDIA_SYNC_CAPTIONS: captioned ? '1' : '0' } });
  return { mp4, take };
}
let syncMp4; // kept for AC-REC-07's negative control

// ---- pixels ----

/** RGB pixels of the frame at `ms`, scaled to 128x72. */
function frameAt(file, ms) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', (ms / 1000).toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=128:72:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, `decode ${file} @${ms}`);
  return r.stdout;
}
/** Pixel classes in the caption band (rows 52..70 of 72: the bottom quarter, where the app draws nothing). */
function band(file, ms) {
  const px = frameAt(file, ms);
  let dark = 0, amber = 0, other = 0;
  for (let y = 52; y < 71; y++) {
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 3;
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      if (r > 200 && g > 160 && b < 130) amber++;
      else if (0.2126 * r + 0.7152 * g + 0.0722 * b < 110) dark++;
      else if (Math.abs(r - 238) + Math.abs(g - 240) + Math.abs(b - 242) > 30) other++;
    }
  }
  return { dark, amber, other };
}
/** Times inside each say() window: the middle of the caption (or of the say() hold when none shows). */
const sayMids = (take) => take.says.map((s) => {
  const c = take.captionTimings.find((x) => x.n === s.n);
  return Math.round(c ? c.startMs + c.durationMs / 2 : s.startMs + s.durationMs / 2);
});

// ---------------------------------------------------------------------------------------------

test('AC-BASE-10: check-take --help lists every flag, --version = plugin.json, bad input is one actionable line, no network', () => {
  const noAudio = path.join(tmp, 'picture-only.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1', '-pix_fmt', 'yuv420p', noAudio]);
  assert.equal(r.status, 0);
  const notMedia = path.join(tmp, 'notes.txt');
  writeFileSync(notMedia, 'not a video\n');
  const flags = Object.keys(checkTakeSpec.options).map((f) => `--${f}`);
  baseline(null, assert, CHECK_TAKE, {
    flags,
    badArgs: [
      [],                                              // no take
      ['--bogus', noAudio],                            // unknown flag
      [path.join(tmp, 'missing.mp4')],                 // no such file
      [tmp],                                           // a folder
      [notMedia],                                      // not media
      [noAudio],                                       // the picture-only --out (no audio track)
      ['--scene-threshold', '2', noAudio],             // threshold outside 0..1
      ['--min-silence-ms', '-5', noAudio],             // negative silence
      ['--noise-db', '6', noAudio],                    // positive dB
      ['--min-silence-ms', 'long', noAudio],           // not a number
      [noAudio, noAudio],                              // two takes
      ['--expect-cuts', '-1', noAudio],                // negative count
      ['--expect-cuts', '1.5', noAudio],               // not a whole number
    ],
  });
  const missing = run(CHECK_TAKE, [path.join(tmp, 'missing.mp4')]);
  assert.match(missing.stderr, /no such file — pass the take's --mp4 output/);
  const pic = run(CHECK_TAKE, [noAudio]);
  assert.match(pic.stderr, /has no audio track.*run check-take on the --mp4 deliverable/);
});

test('AC-REC-05: the --mp4 deliverable passes probe-spec (H.264 High, yuv420p, AAC 48 kHz, faststart), narrated at -16 LUFS, otherwise silent AAC', () => {
  const results = {};
  const narrated = deck();
  const captionsOnly = ui.default();
  for (const [name, { mp4, take }] of Object.entries({ 'deck (spine-timed, narrated)': narrated, 'ui-demo (captions only)': captionsOnly })) {
    const r = probeSpec(mp4, { width: 1280, height: 720, fps: FPS, durationMs: take.videoMs, toleranceFrames: 1 });
    results[name] = r.checks;
    for (const c of r.checks) assert.ok(c.ok, `${name}: ${c.name} expected ${c.expected}, got ${c.actual}`);
    // D7: duration within 1 s of videoMs (probe-spec checks ±1 frame, which is tighter)
    assert.equal(take.mp4, mp4);
  }
  const lufs = loudness(narrated.mp4).lufs;
  assert.ok(Math.abs(lufs - -16) <= 1, `narration is levelled to -16 LUFS (got ${lufs})`);
  assert.equal(narrated.take.audio.clips, narrated.spine.doc.clips.length, 'every spine clip is laid');
  assert.equal(loudness(captionsOnly.mp4).lufs, -Infinity, 'a captions-only take has a silent AAC track');
  assert.equal(captionsOnly.take.audio.clips, 0);
  keep('AC-REC-05-probe.json', { results, narratedLufs: lufs, captionsOnlyLufs: null });
});

test('AC-REC-06: on a sync page that flips a full-frame colour on each say(), with fake tones, the median offset is <= 120 ms and the worst <= 200 ms', () => {
  // Both modes are asserted, two takes each (12 flips per mode): voice-only (--no-captions, as a
  // narrated deck speaks) and captioned (each line drawn with the default showOverlay engine).
  // No retry: the file runs alone (see the header), so one measurement is the result.
  const measure = (captioned, i) => {
    const { mp4, take } = syncTake(captioned, i);
    if (!captioned) syncMp4 = mp4;
    assert.equal(take.says.length, COLOURS.length);
    assert.equal(take.audio.clips, COLOURS.length, 'every tone is laid');
    assert.equal(take.captionEngine, captioned ? 'overlay' : null);
    const m = measureSync(mp4, COLOURS, FPS);
    assert.equal(m.onsets.length, COLOURS.length, `one tone onset per say(): ${m.onsets}`);
    for (const row of m.rows) assert.ok(row.offsetMs !== null, `colour ${row.name} appears`);
    return { captions: captioned, says: take.says.map((s) => ({ n: s.n, plannedMs: s.plannedMs, startMs: s.startMs, lateMs: s.lateMs })), ...m };
  };
  const stats = (rs) => {
    const all = rs.flatMap((r) => r.rows.map((x) => x.offsetMs)).sort((a, b) => a - b);
    const median = all.length % 2 ? all[(all.length - 1) / 2] : (all[all.length / 2 - 1] + all[all.length / 2]) / 2;
    const worst = all.reduce((w, x) => (Math.abs(x) > Math.abs(w) ? x : w), 0);
    return { median, worst, firstSay: rs.map((r) => r.rows[0].offsetMs), offsets: all };
  };
  const runs = [measure(false, 1), measure(true, 1), measure(false, 2), measure(true, 2)]; // interleaved
  const modes = { voiceOnly: stats(runs.filter((r) => !r.captions)), captioned: stats(runs.filter((r) => r.captions)) };
  // re-check after the takes: a sibling that started during them would have shared the CPU
  const siblingsAfterTakes = siblings().length;
  keep('AC-REC-06-sync.json', {
    note: 'offsetMs = first frame of the colour - tone onset (picture lags sound when > 0); each frame time carries up to ±16.7 ms (½ frame) of grid rounding. Both modes asserted; no retry.',
    ranAlone: { ...alone, siblingsAfterTakes, aloneThroughout: alone.alone && siblingsAfterTakes === 0 }, ...modes, runs,
  });
  if (siblingsAfterTakes) process.stderr.write(`warning: ${siblingsAfterTakes} other eval file(s) were running when the sync takes ended\n`);
  for (const [mode, s] of Object.entries(modes)) {
    assert.ok(Math.abs(s.median) <= 120, `${mode}: median offset ${s.median} ms <= 120 ms (${s.offsets.join(', ')})`);
    assert.ok(Math.abs(s.worst) <= 200, `${mode}: worst offset ${s.worst} ms <= 200 ms (${s.offsets.join(', ')})`);
  }
});


test('AC-REC-07: on the narrated example deck, every scene change (threshold 0.02) lands inside silence (-40 dB, >= 900 ms)', () => {
  const { mp4, spine } = deck();
  const r = run(CHECK_TAKE, [mp4, '--json']);
  assert.equal(r.code, 0, `check-take passes: ${r.stdout}${r.stderr}`);
  const res = JSON.parse(r.stdout);
  assert.equal(res.source, 'scene>0.02');
  assert.equal(res.minSilenceMs, 900);
  assert.equal(res.silentTrack, false, 'the deck take carries narration');
  // each slide change is detected inside the gap between two clips (a fade split by a late frame
  // can score twice; both detections must still sit in the silence)
  const clips = spine.doc.clips;
  for (let i = 1; i < clips.length; i++) {
    const [gapStart, gapEnd] = [clips[i - 1].startMs + clips[i - 1].durationMs, clips[i].startMs];
    assert.ok(res.cuts.some((c) => c.cutMs > gapStart && c.cutMs < gapEnd), `slide change ${i} detected between clips ${i} and ${i + 1} (${res.cuts.map((c) => c.timecode)})`);
  }
  for (const c of res.cuts) assert.ok(c.ok && c.silenceMs >= 900, `scene change at ${c.timecode} sits in ${c.silenceMs} ms of silence`);
  // control: the sync take flips the picture on every tone onset, so check-take must fail it
  const ctl = run(CHECK_TAKE, [syncMp4 ?? syncTake(false).mp4, '--json']);
  assert.equal(ctl.code, 1, 'a take that changes picture over speech fails');
  const bad = JSON.parse(ctl.stdout).cuts.filter((c) => !c.ok);
  assert.ok(bad.length >= COLOURS.length - 1, `the flips over sound are reported (${bad.map((c) => c.timecode)})`);
  // --expect-cuts: the deck has exactly as many detected changes as reported, not one more
  assert.equal(run(CHECK_TAKE, [mp4, '--expect-cuts', String(res.cuts.length)]).code, 0);
  const more = run(CHECK_TAKE, [mp4, '--expect-cuts', String(res.cuts.length + 1)]);
  assert.equal(more.code, 1);
  assert.match(more.stdout, /FAIL {2}expected \d+ scene change\(s\), found \d+/);
  // guard: a narrated take with NO detected change (e.g. slow fades) must not pass silently
  const flat = path.join(tmp, 'narrated-no-change.mp4');
  const g = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x336699:s=320x240:r=30:d=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-af', 'volume=enable=between(t\\,1.5\\,2.6):volume=0',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', flat]);
  assert.equal(g.status, 0, String(g.stderr));
  const none = run(CHECK_TAKE, [flat]);
  assert.equal(none.code, 1, `zero scene changes on a narrated take fails: ${none.stdout}`);
  assert.equal(none.stdout.trim().split('\n').length, 1, 'one line');
  assert.match(none.stdout, /^FAIL {2}no scene changes found on a narrated take .*lower --scene-threshold, or pass --expect-cuts 0/);
  assert.equal(run(CHECK_TAKE, [flat, '--expect-cuts', '0']).code, 0, '--expect-cuts 0 accepts it');
  keep('AC-REC-07-check-take.json', { deck: res, control: { ok: false, failing: bad.map((c) => ({ timecode: c.timecode, gap: c.gap })) }, noChangeGuard: none.stdout.trim() });
});

test('AC-REC-08: ui-demo stills inside each say() window show the caption; --no-captions shows none; --caption-css changes the style', () => {
  const takes = Object.fromEntries(Object.entries(ui).map(([k, f]) => [k, f()]));
  const stats = {};
  for (const [variant, { mp4, take }] of Object.entries(takes)) {
    assert.equal(take.says.length, CAPTIONS.length);
    const at = sayMids(take);
    stats[variant] = at.map((ms) => ({ ms, ...band(mp4, ms) }));
    if (EVIDENCE) contactSheet(mp4, { out: path.join(EVIDENCE, `AC-REC-08-${variant}.jpg`), at, cols: 3, width: 640 });
  }
  // default: a caption per say(), the text as written, a dark bar in the caption band
  assert.deepEqual(takes.default.take.captionTimings.map((c) => c.text), CAPTIONS);
  assert.equal(takes.default.take.captionEngine, 'overlay', 'captions are drawn with screencast.showOverlay');
  for (const s of stats.default) assert.ok(s.dark >= 40 && s.amber === 0, `default caption bar at ${s.ms} ms: ${JSON.stringify(s)}`);
  // --no-captions: nothing in the caption band
  assert.equal(takes['no-captions'].take.captionTimings.length, 0);
  for (const s of stats['no-captions']) assert.ok(s.dark === 0 && s.amber === 0 && s.other === 0, `no caption at ${s.ms} ms: ${JSON.stringify(s)}`);
  // --caption-css: the alternative amber card instead of the dark bar
  for (const s of stats['caption-css']) assert.ok(s.amber >= 100 && s.amber > s.dark, `restyled caption at ${s.ms} ms: ${JSON.stringify(s)}`);
  // captions hold for reading time from their say(): about 3 words/s, at least 1.5 s. The overlay is
  // drawn off the storyboard's critical path, so it may appear a little after say() (more under load);
  // it still comes down at say() + reading time.
  for (const c of takes.default.take.captionTimings) {
    const s = takes.default.take.says.find((x) => x.n === c.n);
    const words = c.text.split(/\s+/).filter((w) => /\w/.test(w)).length;
    assert.equal(s.durationMs, Math.max(1500, Math.round((words / 3) * 1000)), `say ${c.n} holds reading time for ${words} words`);
    assert.ok(c.startMs - s.startMs >= 0 && c.startMs - s.startMs <= 250, `caption ${c.n} appears within 250 ms of its say() (${c.startMs - s.startMs} ms)`);
    assert.ok(Math.abs(c.startMs + c.durationMs - (s.startMs + s.durationMs)) <= FRAME_MS, `caption ${c.n} comes down at say() + reading time`);
  }
  keep('AC-REC-08-bands.json', { note: 'pixel classes in the bottom-quarter caption band (128x72 scale) at the middle of each say() window', stats });
});

test('AC-REC-09: the take manifest validates against the v1 spine schema and command[] reproduces the take', async () => {
  const d = deck();
  const manifests = {
    deck: path.join(tmp, 'deck.take.json'),
    'ui-default': path.join(tmp, 'ui-default.take.json'),
    'ui-no-captions': path.join(tmp, 'ui-no-captions.take.json'),
    'ui-caption-css': path.join(tmp, 'ui-css-take.json'),
  };
  ui.default(); ui['no-captions'](); ui['caption-css']();
  const docs = {};
  for (const [k, f] of Object.entries(manifests)) {
    assert.ok(existsSync(f), `${k}: manifest written at ${f}`);
    const v = await validateFile(f, 'spine');
    assert.ok(v.ok, `${k}: ${JSON.stringify(v.errors)}`);
    docs[k] = JSON.parse(readFileSync(f, 'utf8'));
  }
  // narrated: the spine's clips as laid, with the spine's model/voice/style
  const n = docs.deck;
  assert.equal(n.kind, 'narration');
  assert.equal(n.narrate, true);
  assert.equal(path.resolve(tmp, n.spine), d.spine.file, 'spine points at the manifest the take was timed to');
  assert.deepEqual(n.clips.map((c) => [c.n, c.text, c.file, c.startMs]), d.spine.doc.clips.map((c) => [c.n, c.text, c.file, c.startMs]), 'clips laid at their spine times');
  assert.equal(n.model, 'fake/tone');
  assert.equal(n.videoMs, d.take.videoMs);
  assert.ok(n.wallMs >= n.videoMs - 100, 'wallMs is the wall-clock take length');
  // non-narrated: "narrate": false plus caption timings
  for (const k of ['ui-default', 'ui-no-captions', 'ui-caption-css']) {
    assert.equal(docs[k].narrate, false, `${k}: narrate false`);
    assert.equal(docs[k].clips.length, 0);
  }
  assert.deepEqual(docs['ui-default'].captions.map((c) => c.text), CAPTIONS);
  for (const c of docs['ui-default'].captions) assert.ok(c.startMs >= 0 && c.durationMs >= 1250, `caption ${c.n} timing as shown: ${c.startMs} +${c.durationMs} ms`);
  assert.deepEqual(docs['ui-no-captions'].captions, []);
  // command[] reproduces the take: run it again, from another directory
  const doc = docs['ui-caption-css'];
  const [bin, ...args] = doc.command;
  assert.equal(bin, 'node');
  assert.equal(args[0], path.join(ROOT, CAPTURE), 'command[1] is the capture entry point');
  const mp4 = ui['caption-css']().mp4;
  // not circular: command[] must carry every flag of the invocation that made the take (as spawned
  // by capture() above), with paths absolute
  const given = [['--storyboard', UI_STORYBOARD], ['--mp4', mp4], ['--caption-css', UI_ALT_CSS], ['--manifest', manifests['ui-caption-css']], ['--json'], ['--debug-requests']];
  for (const [flag, value] of given) {
    const i = args.indexOf(flag);
    assert.ok(i > 0, `command[] has ${flag}`);
    if (value !== undefined) assert.equal(args[i + 1], value, `command[] keeps ${flag} ${value}`);
  }
  assert.equal(args.filter((a) => a.startsWith('--')).length, given.length, `command[] adds no flag that wasn't given: ${args.join(' ')}`);
  const before = statSync(mp4).mtimeMs;
  const again = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: os.tmpdir(), env: { ...process.env, ...env() } });
  assert.equal(again.status, 0, again.stderr);
  assert.ok(statSync(mp4).mtimeMs > before, 'the take was written again at the same path');
  const re = JSON.parse(readFileSync(manifests['ui-caption-css'], 'utf8'));
  assert.ok((await validateFile(manifests['ui-caption-css'], 'spine')).ok);
  assert.deepEqual(re.command, doc.command, 'same command');
  assert.equal(re['x-take'].mode, doc['x-take'].mode);
  assert.deepEqual(re.captions.map((c) => c.text), doc.captions.map((c) => c.text), 'same captions');
  // a real-time take (run alone) repeats to within page jitter
  assert.ok(Math.abs(re.videoMs - doc.videoMs) <= 150, `same length ±150 ms (${re.videoMs} vs ${doc.videoMs} ms)`);
  re.captions.forEach((c, i) => assert.ok(Math.abs(c.startMs - doc.captions[i].startMs) <= 150, `caption ${c.n} at the same time ±150 ms (${c.startMs} vs ${doc.captions[i].startMs})`));
  // and it looks the same: the re-run still draws the --caption-css amber card
  const mid = re.captions[0].startMs + re.captions[0].durationMs / 2;
  assert.ok(band(mp4, Math.round(mid)).amber >= 100, 'the re-run take carries the restyled caption');
  keep('AC-REC-09-deck.take.json', n);
  keep('AC-REC-09-ui-default.take.json', docs['ui-default']);
  keep('AC-REC-09-reproduce.json', { command: doc.command, first: { videoMs: doc.videoMs, captions: doc.captions }, second: { videoMs: re.videoMs, captions: re.captions } });
});

test('AC-REC-10: with no key, the captions-only example passes with 0 OpenRouter calls', () => {
  const { take, stderr, mp4 } = ui.default();
  for (const k of Object.keys(NO_KEY)) assert.equal(env()[k], '', `${k} is unset for the run`);
  assert.doesNotMatch(stderr, /NETWORK-ATTEMPT/, 'no network attempt beyond loopback');
  assert.doesNotMatch(stderr, /openrouter/i, '0 OpenRouter calls');
  assert.equal(take.mode, 'captions');
  assert.ok(probeSpec(mp4, { width: 1280, height: 720 }).ok, 'the MP4 passes the delivery spec');
  const r = run(CHECK_TAKE, [mp4]);
  assert.equal(r.code, 0, `check-take passes the captions-only take: ${r.stdout}`);
  assert.match(r.stdout, /audio is silent for the whole take/);
  // control: the guard does catch an OpenRouter call
  const ctl = spawnSync(process.execPath, ['--import', LOOPBACK_ONLY, '-e', "fetch('https://openrouter.ai/api/v1/audio/speech').catch(() => {})"], { encoding: 'utf8' });
  assert.match(ctl.stderr, /NETWORK-ATTEMPT https:\/\/openrouter\.ai/);
});

// ---- not ACs: WP7a's open nits (warm-up is measured by AC-REC-06's first say(); the watchdog here) ----

test('watchdog: a hanging storyboard is aborted at --max-ms with one line and the process exits', () => {
  const sb = path.join(tmp, 'hang.mjs');
  writeFileSync(sb, "export default async ({ say }) => { await say('waiting forever'); await new Promise((r) => setTimeout(r, 600000)); };\n");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, CAPTURE), '--storyboard', sb, '--url', path.join(UI, 'index.html'), '--out', path.join(tmp, 'hang.webm'), '--max-ms', '2500'], { encoding: 'utf8', env: { ...process.env, ...env() }, timeout: 60000 });
  const ms = Date.now() - t0;
  assert.equal(r.status, 1, r.stderr);
  const lines = r.stderr.trim().split('\n').filter((l) => !/^capture: (launching|t0 )/.test(l));
  assert.equal(lines.length, 1, r.stderr);
  assert.match(lines[0], /aborted at --max-ms 2500 ms/);
  assert.ok(ms < 20000, `exits promptly (${ms} ms)`);
  assert.equal(existsSync(path.join(tmp, 'hang.webm')), false, 'nothing is written');
});

test('watchdog: a spine-timed take that overruns its window by more than 2 s is aborted', () => {
  const sb = path.join(tmp, 'overrun.mjs');
  writeFileSync(sb, "export default async ({ wait }) => { await wait(120000); };\n");
  const spine = syncSpine();
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, CAPTURE), '--storyboard', sb, '--url', path.join(SYNC, 'index.html'), '--spine', spine.file, '--out', path.join(tmp, 'overrun.webm')], { encoding: 'utf8', env: { ...process.env, ...env() }, timeout: 90000 });
  const ms = Date.now() - t0;
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /more than 2000 ms past the spine's \d+ ms — aborted/);
  assert.ok(ms < spine.doc.totalMs + 2000 + 15000, `aborted near window + 2 s (${ms} ms for a ${spine.doc.totalMs} ms spine)`);
});

test('captions: --caption-engine dom draws the caption in the page instead of showOverlay', () => {
  const sb = path.join(tmp, 'dom-caption.mjs');
  writeFileSync(sb, "export default async ({ say, waitForVoice }) => { await say('Drawn in the page instead'); await waitForVoice(); };\n");
  const mp4 = path.join(tmp, 'dom-caption.mp4');
  const { take } = capture(['--storyboard', sb, '--url', path.join(UI, 'index.html'), '--mp4', mp4, '--caption-engine', 'dom']);
  assert.equal(take.captionEngine, 'dom');
  const c = take.captionTimings[0];
  const s = band(mp4, Math.round(c.startMs + c.durationMs / 2));
  assert.ok(s.dark >= 40, `the DOM caption shows the neutral dark bar: ${JSON.stringify(s)}`);
});
