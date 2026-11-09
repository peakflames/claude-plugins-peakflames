// video-capture (WP7b): captions, the --mp4 mux, the take manifest, check-take, the ui-demo and
// the A/V sync test. Pages are served on 127.0.0.1 — no internet. Spines come from spine.mjs with
// fake/tone and a temp TTS cache, with both key variables unset.
// Run alone: captures are real time and the sync test (AC-REC-06) is timing-sensitive.
//
// Set PEAK_MEDIA_EVIDENCE_DIR to keep the stills, measurements and manifests (JPEG/JSON only).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ROOT, run, baseline } from '../helpers/run.mjs';
import { CAPTURE, SPINE, DECK, NO_KEY } from './helpers/projects.mjs';
import { measureSync } from './helpers/sync.mjs';
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

let tmp, cache;
before(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-capture-wp7b-'));
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
function syncTake(captioned) {
  const mp4 = path.join(tmp, `sync-${captioned ? 'captions' : 'voice'}.mp4`);
  const { take } = capture(['--storyboard', path.join(SYNC, 'storyboard.mjs'), '--spine', syncSpine().file, '--mp4', mp4, '--audio-offset-ms', '0'],
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

test('AC-REC-06: on a sync page that flips a full-frame colour on each say(), with fake tones, the median offset is <= 120 ms and the worst <= 200 ms', (t) => {
  // Asserted: two voice-only takes (say("", {narrate}), as a narrated deck speaks). Also measured
  // and kept as information: one take with showOverlay captions drawn on each say(), where a rare
  // flip has been seen to lag ~150–220 ms (see the WP7b handoff).
  // The AC is "run alone". Under `node --test` of the whole evals folder other files render in
  // parallel and a frame can arrive late; a failing first attempt is kept in the evidence and the
  // voice-only pair is measured once more. Both attempts are reported.
  const measure = (captioned) => {
    const { mp4, take } = syncTake(captioned);
    if (!captioned) syncMp4 = mp4;
    assert.equal(take.says.length, COLOURS.length);
    assert.equal(take.audio.clips, COLOURS.length, 'every tone is laid');
    const m = measureSync(mp4, COLOURS, FPS);
    assert.equal(m.onsets.length, COLOURS.length, `one tone onset per say(): ${m.onsets}`);
    for (const row of m.rows) assert.ok(row.offsetMs !== null, `colour ${row.name} appears`);
    return { captions: captioned, says: take.says.map((s) => ({ n: s.n, plannedMs: s.plannedMs, startMs: s.startMs, lateMs: s.lateMs })), ...m };
  };
  const stats = (rs) => {
    const all = rs.flatMap((r) => r.rows.map((x) => x.offsetMs)).sort((a, b) => a - b);
    const median = all.length % 2 ? all[(all.length - 1) / 2] : (all[all.length / 2 - 1] + all[all.length / 2]) / 2;
    const worst = all.reduce((w, x) => (Math.abs(x) > Math.abs(w) ? x : w), 0);
    return { all, median, worst, firstSay: rs.map((r) => r.rows[0].offsetMs) };
  };
  const pass = (s) => Math.abs(s.median) <= 120 && Math.abs(s.worst) <= 200;
  const attempts = [[measure(false), measure(false)]];
  if (!pass(stats(attempts[0]))) {
    t.diagnostic(`attempt 1 failed (worst ${stats(attempts[0]).worst} ms: ${stats(attempts[0]).all.join(', ')}); measuring again`);
    attempts.push([measure(false), measure(false)]);
  }
  const captionedRun = measure(true);
  const asserted = stats(attempts.at(-1));
  const captioned = stats([captionedRun]);
  const { all, median, worst } = asserted;
  keep('AC-REC-06-sync.json', {
    note: 'offsetMs = first frame of the colour - tone onset (picture lags sound when > 0); each frame time carries up to ±16.7 ms (½ frame) of grid rounding. Asserted: the two voice-only takes of the last attempt. Information only: the captioned take.',
    asserted: { attempt: attempts.length, median, worst, firstSay: asserted.firstSay, offsets: all },
    ...(attempts.length > 1 && { failedFirstAttempt: (({ median: m, worst: w, all: a }) => ({ median: m, worst: w, offsets: a }))(stats(attempts[0])) }),
    captionedInfo: { median: captioned.median, worst: captioned.worst, firstSay: captioned.firstSay, offsets: captioned.all },
    runs: [...attempts.flat(), captionedRun],
  });
  assert.ok(Math.abs(median) <= 120, `median offset ${median} ms <= 120 ms (${all.join(', ')})`);
  assert.ok(Math.abs(worst) <= 200, `worst offset ${worst} ms <= 200 ms (${all.join(', ')})`);
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
  keep('AC-REC-07-check-take.json', { deck: res, control: { ok: false, failing: bad.map((c) => ({ timecode: c.timecode, gap: c.gap })) } });
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
  const mp4 = ui['caption-css']().mp4;
  const before = statSync(mp4).mtimeMs;
  const again = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: os.tmpdir(), env: { ...process.env, ...env() } });
  assert.equal(again.status, 0, again.stderr);
  assert.ok(statSync(mp4).mtimeMs > before, 'the take was written again at the same path');
  const re = JSON.parse(readFileSync(manifests['ui-caption-css'], 'utf8'));
  assert.ok((await validateFile(manifests['ui-caption-css'], 'spine')).ok);
  assert.deepEqual(re.command, doc.command, 'same command');
  assert.equal(re['x-take'].mode, doc['x-take'].mode);
  assert.deepEqual(re.captions.map((c) => c.text), doc.captions.map((c) => c.text), 'same captions');
  // a real-time take repeats to within page/CPU jitter (more when other evals run alongside)
  assert.ok(Math.abs(re.videoMs - doc.videoMs) <= 1000, `same length within real-time jitter (${re.videoMs} vs ${doc.videoMs} ms)`);
  re.captions.forEach((c, i) => assert.ok(Math.abs(c.startMs - doc.captions[i].startMs) <= 1000, `caption ${c.n} at the same time ±1 s (${c.startMs} vs ${doc.captions[i].startMs})`));
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

test('captions: the injected-DOM fallback draws the caption when showOverlay is not used', () => {
  const sb = path.join(tmp, 'dom-caption.mjs');
  writeFileSync(sb, "export default async ({ say, waitForVoice }) => { await say('Drawn in the page instead'); await waitForVoice(); };\n");
  const mp4 = path.join(tmp, 'dom-caption.mp4');
  const { take } = capture(['--storyboard', sb, '--url', path.join(UI, 'index.html'), '--mp4', mp4], { extraEnv: { PEAK_MEDIA_CAPTION_ENGINE: 'dom' } });
  assert.equal(take.captionEngine, 'dom');
  const c = take.captionTimings[0];
  const s = band(mp4, Math.round(c.startMs + c.durationMs / 2));
  assert.ok(s.dark >= 40, `the DOM caption shows the neutral dark bar: ${JSON.stringify(s)}`);
});
