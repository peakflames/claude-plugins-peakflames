// WP3a — Spine TTS evals. No test touches the network or the real home cache:
// OpenRouter is a fake transport, caches live in temp dirs via PEAK_MEDIA_TTS_CACHE /
// PEAK_MEDIA_TTS_LEGACY_DIRS (or the cacheDir / legacyDirs options).
import { test } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { run, fx, ROOT, baseline, tmpDir } from '../helpers/run.mjs';
import { makeFakeFetch, FAKE_OR_RATE } from './helpers/fake-openrouter.mjs';
import {
  DEFAULT_MODEL, DEFAULT_VOICE, cacheKey, checkTtsOptions, synthesizeClips, wpmReport, cacheSummary,
} from '../../lib/tts/index.mjs';
import { requestBody, redact } from '../../lib/tts/openrouter.mjs';
import { pcmToWav, wavInfo } from '../../lib/tts/wav.mjs';
import { probe } from '../../lib/ffmpeg.mjs';

const SV = 'skills/video-spine/scripts/sample-voice.mjs';
const F1 = JSON.parse(readFileSync(path.join(ROOT, 'docs', 'build', 'fixtures', 'F1', 'spine', 'manifest.json'), 'utf8'));
const tmp = (p) => tmpDir(`pm-tts-${p}-`);
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const KEY = 'sk-or-v1-TESTSECRET0123456789';
const f1Clips = () => F1.clips.map(({ n, text, style }) => ({ n, text, style }));

/** env for subprocesses: isolated caches, no key unless given. */
const isoEnv = (extra = {}) => {
  const d = tmp('env');
  return { PEAK_MEDIA_TTS_CACHE: path.join(d, 'cache'), PEAK_MEDIA_TTS_LEGACY_DIRS: '', PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '', ...extra };
};
const errLines = (r) => r.stderr.trim().split('\n').filter((l) => l && !/^Run '.+ --help' for usage\.$/.test(l));

test('AC-TTS-01: bad voice, missing key and missing ffmpeg fail fast, one line, no network', (t) => {
  // API the spine calls (WP3b): checked before any network.
  assert.throws(() => checkTtsOptions({ voice: 'Nope' }), (e) => e.code === 2 && /--voice 'Nope'/.test(e.message) && !e.message.includes('\n'));
  assert.throws(() => checkTtsOptions({ model: 'nope/model' }), (e) => e.code === 2 && /--tts-model/.test(e.message));
  assert.throws(() => checkTtsOptions({ narrate: true, env: {} }), (e) => e.code === 3 && /PEAK_MEDIA_OPENROUTER_API_KEY/.test(e.message));
  assert.doesNotThrow(() => checkTtsOptions({ narrate: true, env: { TTS_OPENROUTER_API_KEY: KEY } }), 'legacy key name is a fallback');
  assert.doesNotThrow(() => checkTtsOptions({ narrate: true, env: { PEAK_MEDIA_OPENROUTER_API_KEY: KEY } }));
  assert.doesNotThrow(() => checkTtsOptions({ model: 'fake/tone', narrate: true, env: {} }), 'fake/tone needs no key');
  assert.deepEqual(
    { model: checkTtsOptions({ voice: 'rasalgethi' }).model, voice: checkTtsOptions({ voice: 'rasalgethi' }).voice },
    { model: DEFAULT_MODEL, voice: DEFAULT_VOICE }, 'Gemini names are case-insensitive',
  );
  assert.equal(checkTtsOptions({ model: 'microsoft/mai-voice-2.1', voice: 'en-gb-emily' }).voice, 'en-GB-Emily');
  assert.equal(checkTtsOptions({ model: 'microsoft/mai-voice-2.1' }).voice, 'en-GB-Emily', 'MAI default voice');
  assert.throws(() => checkTtsOptions({ model: 'microsoft/mai-voice-2.1', voice: 'Achird' }), (e) => e.code === 2);

  // Entry point: sample-voice (spine.mjs is WP3b's and re-asserts this through the same API).
  const cases = [
    { name: '--voice Nope', args: ['--voices', 'Nope'], env: isoEnv({ PEAK_MEDIA_OPENROUTER_API_KEY: KEY }), want: /unknown --voice 'Nope'/ },
    { name: 'key unset', args: ['--voices', 'Achird'], env: isoEnv(), want: /PEAK_MEDIA_OPENROUTER_API_KEY/ },
    { name: 'ffmpeg missing', args: ['--tts-model', 'fake/tone'], env: isoEnv({ PEAK_MEDIA_FFMPEG: '/nonexistent/ffmpeg' }), want: /ffmpeg not found — install it/ },
  ];
  for (const c of cases) {
    const r = run(SV, c.args, { env: c.env });
    t.diagnostic(`${c.name}: exit ${r.code} in ${r.ms} ms — ${errLines(r).join(' | ')}`);
    assert.notEqual(r.code, 0, `${c.name}: non-zero exit`);
    assert.ok(r.ms < 2000, `${c.name}: under 2 s (${r.ms} ms)`);
    assert.equal(errLines(r).length, 1, `${c.name}: one line\n${r.stderr}`);
    assert.match(errLines(r)[0], c.want, `${c.name}: names the fix`);
    assert.doesNotMatch(r.stderr, /NETWORK-ATTEMPT/, `${c.name}: no network`);
    assert.doesNotMatch(r.stderr, /\n\s+at .+:\d+:\d+/, `${c.name}: no stack`);
  }
});

test('AC-TTS-02: cache key equals every legacy narration.json file name byte for byte', (t) => {
  const j = JSON.parse(readFileSync(fx('legacy-narration.json'), 'utf8'));
  assert.equal(j.clips.length, 9);
  for (const c of j.clips) {
    const k = cacheKey({ model: j.model, voice: j.voice, style: c.style, text: c.text });
    assert.equal(Buffer.compare(Buffer.from(k), Buffer.from(c.file)), 0, `clip ${c.n}: ${k} vs ${c.file}`);
  }
  t.diagnostic(`9/9 legacy clip keys match (model ${j.model}, voice ${j.voice})`);
  for (const c of F1.clips) assert.equal(cacheKey({ model: F1.model, voice: F1.voice, style: c.style, text: c.text }), c.file, `F1 clip ${c.n}`);
});

test('AC-TTS-03: a WAV seeded only in the legacy cache is reused with 0 synthesis calls', (t) => {
  const d = tmp('legacy');
  const legacy = path.join(d, 'record-website-interaction', 'tts');
  const own = path.join(d, 'peak-media', 'tts');
  mkdirSync(legacy, { recursive: true });
  const text = 'An archived clip from the old recorder, replayed without any synthesis.';
  const file = cacheKey({ model: 'fake/tone', voice: 'Achird', style: '', text });
  // A marker WAV (1234 ms of silence) that fake/tone would never produce, so reuse is provable.
  writeFileSync(path.join(legacy, file), pcmToWav(Buffer.alloc(Math.round(1.234 * 48000) * 2), { sampleRate: 48000 }));
  const before = sha(path.join(legacy, file));
  return (async () => {
    let calls = 0;
    const [r] = await synthesizeClips({ clips: [{ n: 1, text }], model: 'fake/tone', voice: 'Achird', cacheDir: own, legacyDirs: [path.join(d, 'web2video', 'tts'), legacy], onCall: () => calls++ });
    assert.equal(calls, 0, 'no synthesis');
    assert.equal(r.cached, true);
    assert.equal(r.source, 'legacy');
    assert.equal(r.durationMs, 1234, 'the seeded clip, not a fresh tone');
    assert.equal(sha(path.join(legacy, file)), before, 'legacy dir untouched');
    t.diagnostic(`lib: clip reused from ${path.basename(path.dirname(path.dirname(legacy)))}/…/tts, calls=${calls}, ${r.durationMs} ms`);

    // Entry point, legacy dir given through the env override.
    const env = isoEnv({ PEAK_MEDIA_TTS_LEGACY_DIRS: legacy });
    const out = path.join(tmp('legacy-out'), 'o');
    const s = run(SV, ['--tts-model', 'fake/tone', '--voices', 'Achird', '--style', '', '--text', text, '--out-dir', out], { env });
    assert.equal(s.code, 0, s.stderr);
    assert.match(s.stdout, /Achird .* 1\.23 s .* cached/);
    assert.match(s.stdout, /1\/1 cached/);
    t.diagnostic(`sample-voice: ${s.stdout.trim().split('\n').join(' | ')}`);
  })();
});

test('AC-TTS-04: F1 run twice → run 2 is N/N cached with 0 calls; exported clips reproduce the run', async (t) => {
  const d = tmp('repro');
  const cache = path.join(d, 'cache'), exp = path.join(d, 'export');
  const opts = { clips: f1Clips(), model: F1.model, voice: F1.voice, style: F1.style, legacyDirs: [] };
  let calls1 = 0, calls2 = 0, calls3 = 0;
  const r1 = await synthesizeClips({ ...opts, cacheDir: cache, onCall: () => calls1++ });
  const r2 = await synthesizeClips({ ...opts, cacheDir: cache, exportDir: exp, onCall: () => calls2++ });
  assert.equal(calls1, F1.clips.length, 'run 1 synthesizes each clip');
  assert.equal(calls2, 0, 'run 2 makes 0 calls');
  assert.equal(cacheSummary(r2), `${F1.clips.length}/${F1.clips.length} cached`);
  assert.match(wpmReport(r2).table, new RegExp(`${F1.clips.length}/${F1.clips.length} cached`));
  assert.deepEqual(r1.map((r) => r.file), F1.clips.map((c) => c.file), 'files match the F1 manifest');
  assert.deepEqual(readdirSync(exp).sort(), [...r1.map((r) => r.file)].sort(), 'every clip exported');

  const fresh = path.join(d, 'fresh');
  mkdirSync(fresh);
  for (const f of readdirSync(exp)) copyFileSync(path.join(exp, f), path.join(fresh, f));
  const r3 = await synthesizeClips({ ...opts, cacheDir: fresh, onCall: () => calls3++ });
  assert.equal(calls3, 0, 'exported clips need no synthesis');
  assert.deepEqual(r3.map((r) => [r.n, r.file, r.durationMs, r.wpm]), r1.map((r) => [r.n, r.file, r.durationMs, r.wpm]));
  assert.deepEqual(r3.map((r) => sha(r.path)), r1.map((r) => sha(r.path)), 'byte-identical clips');
  t.diagnostic(`run1 calls=${calls1}, run2 calls=${calls2} (${cacheSummary(r2)}), from export calls=${calls3} (${cacheSummary(r3)})`);
  t.diagnostic(`\n${wpmReport(r2).table}`);
});

test('AC-TTS-05: one fake clip slowed 2× → wpm table prints and the warning names that clip', async (t) => {
  const env = { PEAK_MEDIA_FAKE_SLOW: '2' };
  const res = await synthesizeClips({ clips: f1Clips(), model: 'fake/tone', voice: F1.voice, style: F1.style, cacheDir: path.join(tmp('slow'), 'c'), legacyDirs: [], env });
  const normal = await synthesizeClips({ clips: f1Clips(), model: 'fake/tone', voice: F1.voice, style: F1.style, cacheDir: path.join(tmp('norm'), 'c'), legacyDirs: [], env: {} });
  assert.ok(Math.abs(res[1].durationMs - 2 * normal[1].durationMs) <= 1, 'clip 2 is twice as long');
  const rep = wpmReport(res);
  for (const h of ['clip', 'words', 'sec', 'wpm']) assert.match(rep.table.split('\n')[0], new RegExp(h));
  assert.equal(rep.table.split('\n').filter((l) => /^\d+\s/.test(l)).length, res.length, 'one row per clip');
  assert.equal(rep.warnings.length, 1, 'exactly one warning');
  assert.equal(rep.warnings[0].n, 2);
  assert.match(rep.warnings[0].message, /\bclip 2\b/);
  assert.equal(wpmReport(normal).warnings.length, 0, 'no warning without the slowdown');
  t.diagnostic(`\n${rep.table}\n${rep.warnings.map((w) => `WARN ${w.message}`).join('\n')}`);
});

test('AC-TTS-06: sample-voice with 3 Gemini voices (fake transport) → 3 WAVs and 3 wpm lines', (t) => {
  const d = tmp('sv');
  const log = path.join(d, 'requests.jsonl');
  const out = path.join(d, 'samples');
  const style = 'Clear, friendly, unhurried explainer tone.';
  const env = { ...process.env, ...isoEnv({ PEAK_MEDIA_OPENROUTER_API_KEY: KEY, PEAK_MEDIA_FAKE_OR_LOG: log }) };
  const r = spawnSync(process.execPath, [
    '--import', path.join(ROOT, 'evals', 'helpers', 'no-network.mjs'),
    '--import', path.join(ROOT, 'evals', 'video-spine', 'helpers', 'fake-openrouter.mjs'),
    path.join(ROOT, SV), '--voices', 'Achird,kore,Puck', '--style', style, '--out-dir', out, '--debug-requests',
  ], { encoding: 'utf8', env, cwd: d });
  assert.equal(r.status, 0, r.stderr);
  const wavs = readdirSync(out).sort();
  assert.deepEqual(wavs, ['Achird.wav', 'Kore.wav', 'Puck.wav']);
  for (const w of wavs) {
    const a = probe(path.join(out, w)).streams[0];
    assert.equal(Number(a.sample_rate), FAKE_OR_RATE);
    assert.equal(a.channels, 1);
  }
  const lines = r.stdout.split('\n').filter((l) => /^\S+\s+\d+ words\s+[\d.]+ s\s+\d+ wpm/.test(l));
  assert.equal(lines.length, 3, r.stdout);
  for (const [i, v] of ['Achird', 'Kore', 'Puck'].entries()) assert.ok(lines[i].startsWith(v));
  const reqs = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(reqs.length, 3);
  for (const q of reqs) {
    assert.equal(q.url, 'https://openrouter.ai/api/v1/audio/speech');
    assert.deepEqual(q.body.provider, { zdr: true });
    assert.equal(q.body.model, DEFAULT_MODEL);
    assert.equal(q.body.response_format, 'pcm');
    assert.equal(q.body.instructions, style);
    assert.match(q.raw, /"zdr":true/);
  }
  assert.deepEqual(reqs.map((q) => q.body.voice), ['Achird', 'Kore', 'Puck']);
  assert.doesNotMatch(r.stderr, /NETWORK-ATTEMPT/);
  const dbg = r.stderr.split('\n').filter((l) => l.startsWith('[debug-requests]'));
  assert.equal(dbg.length, 6, 'request + response line per clip');
  assert.ok(dbg.some((l) => l.includes('"zdr":true')));
  assert.ok(!r.stderr.includes(KEY), 'key never printed');
  assert.match(r.stderr, /Bearer \*\*\*REDACTED\*\*\*/);
  t.diagnostic(`\n${r.stdout.trim()}\n${dbg[0]}`);
});

test('AC-TTS-08: a PCM response is cached as a valid WAV that ffprobe reads', async (t) => {
  const d = tmp('pcm');
  const calls = [];
  const fetchImpl = makeFakeFetch({ calls });
  const env = { PEAK_MEDIA_OPENROUTER_API_KEY: KEY };
  const text = 'Raw sixteen-bit PCM comes back and gets a proper header.';
  const [r] = await synthesizeClips({ clips: [{ n: 1, text }], cacheDir: path.join(d, 'c'), legacyDirs: [], fetchImpl, env });
  assert.equal(calls.length, 1);
  assert.equal(r.cached, false);
  assert.equal(path.basename(r.path), cacheKey({ model: DEFAULT_MODEL, voice: DEFAULT_VOICE, style: '', text }));
  const a = probe(r.path).streams.find((s) => s.codec_type === 'audio');
  assert.equal(a.codec_name, 'pcm_s16le');
  assert.equal(Number(a.sample_rate), 24000);
  assert.equal(a.channels, 1);
  assert.ok(Math.abs(Number(probe(r.path).format.duration) * 1000 - r.durationMs) <= 2, 'header duration agrees with ffprobe');
  t.diagnostic(`ffprobe: ${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch, ${r.durationMs} ms, ${statSync(r.path).size} bytes`);

  // An odd byte count (partial sample) still yields a valid WAV.
  const w = wavInfo(pcmToWav(Buffer.alloc(4801), { sampleRate: 24000 }));
  assert.equal(w.dataBytes, 4800);

  // MAI: model suffix on the voice, no instructions; every request has zdr.
  const mai = requestBody({ model: 'microsoft/mai-voice-2.1-flash', voice: 'en-GB-Emily', style: 'Calm.', text: 'Hi.' });
  assert.equal(mai.voice, 'en-GB-Emily:MAI-Voice-2.1-Flash');
  assert.equal(mai.instructions, undefined);
  assert.deepEqual(mai.provider, { zdr: true });
  assert.equal(requestBody({ model: 'microsoft/mai-voice-2.1', voice: 'en-US-Harper', text: 'Hi.' }).voice, 'en-US-Harper:MAI-Voice-2.1');

  // Error responses are one line and never echo the key.
  await assert.rejects(
    synthesizeClips({ clips: [{ n: 1, text: 'fails' }], cacheDir: path.join(d, 'c2'), legacyDirs: [], fetchImpl: makeFakeFetch({ status: 401 }), env }),
    (e) => /\(401\) — check PEAK_MEDIA_OPENROUTER_API_KEY/.test(e.message) && !e.message.includes(KEY) && !e.message.includes('\n'),
  );
  assert.equal(existsSync(path.join(d, 'c2', cacheKey({ model: DEFAULT_MODEL, voice: DEFAULT_VOICE, style: '', text: 'fails' }))), false, 'nothing cached on failure');
  assert.equal(redact(`Bearer ${KEY}`, KEY), 'Bearer ***REDACTED***');
});

test('AC-BASE-07: sample-voice baseline (help, version, bad input, no stack, no network)', (t) => {
  baseline(t, assert, SV, {
    flags: ['--voices', '--text', '--text-file', '--tts-model', '--style', '--out-dir', '--debug-requests', '--json'],
    badArgs: [['--nope'], ['--voices', 'Nope'], ['--tts-model', 'bogus/model'], ['--text-file', 'does-not-exist.txt'], ['extra-arg'], ['--text', '   '], ['--voices', ',']],
  });
});
