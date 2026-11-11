// WP3b spine: brief + script.md -> spine/manifest.json | beatgrid.json (AC-SPN-01..03, AC-BASE-06).
// Only the documented lib/tts API is assumed (fake/tone provider), never the stub's internals.
import { test, before } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { run, baseline, ROOT, fx, tmpDir } from '../helpers/run.mjs';
import { validateFile } from '../../lib/schemas.mjs';
import { durationMs } from '../../lib/ffmpeg.mjs';
import { checkCuts } from '../../lib/verify/check-cuts.mjs';
import { parseScript, parseBrief, layoutBeatgrid, layoutNarration } from '../../skills/video-spine/scripts/spine.mjs';

const SPINE = 'skills/video-spine/scripts/spine.mjs';
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' }; // DEC-30: both unset = no key
const within = (ms, target, tol = 0.1) => Math.abs(ms - target) <= target * tol;

/** A fresh project folder holding F1's brief.md and script.md (fixtures stay untouched). */
function project(script) {
  const dir = tmpDir('pm-spine-');
  copyFileSync(path.join(F1, 'brief.md'), path.join(dir, 'brief.md'));
  if (script === undefined) copyFileSync(path.join(F1, 'script.md'), path.join(dir, 'script.md'));
  else if (script !== null) writeFileSync(path.join(dir, 'script.md'), script);
  return dir;
}
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

let narr; // F1 narrated with fake/tone, shared by AC-SPN-01 and AC-SPN-03
before(() => {
  const dir = project();
  // F1's brief targets 26 s for the real voice (~127 wpm); fake/tone reads at 165 wpm, so the AC runs at the original 20 s target.
  const r = run(SPINE, ['--brief', path.join(dir, 'brief.md'), '--target-ms', '20000', '--tts-model', 'fake/tone', '--cache-dir', path.join(dir, 'cache')], { env: NO_KEY });
  narr = { dir, r, manifest: path.join(dir, 'spine', 'manifest.json'), wav: path.join(dir, 'spine', 'narration.wav') };
});

test('AC-SPN-01: F1 brief → script → spine with fake/tone; manifest.totalMs within 20 s ±10% and validates', async () => {
  const { r } = narr;
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.doesNotMatch(r.stderr, /NETWORK-ATTEMPT/, 'fake provider makes no network calls');
  const v = await validateFile(narr.manifest);
  assert.ok(v.ok, JSON.stringify(v.errors));
  const m = readJson(narr.manifest);
  assert.equal(m.kind, 'narration');
  assert.equal(m.model, 'fake/tone');
  assert.equal(m.targetMs, 20000, 'target from --target-ms');
  assert.ok(within(m.totalMs, 20000), `totalMs ${m.totalMs} within 18000–22000`);
  assert.deepEqual(m.beats.map((b) => b.id), parseBrief(readFileSync(path.join(F1, 'brief.md'), 'utf8')).beats, 'one beat per brief beat, in order');
  assert.equal(m.clips.length, 3);
  assert.deepEqual(m.clips.map((c) => c.text), parseScript(readFileSync(path.join(F1, 'script.md'), 'utf8')).map((b) => b.text), 'clip text is the tagged script paragraph');
  assert.equal(m.audio, 'narration.wav');
  assert.ok(Math.abs(durationMs(narr.wav) - m.totalMs) <= 50, 'narration.wav lasts totalMs');
  for (const c of m.clips) assert.ok(r.stdout.includes(String(c.wpm)) || r.stdout.includes(String(Math.round(c.wpm))), `wpm table shows clip ${c.n}`);
  assert.match(r.stdout, /PASS {2}runtime/);
});

test('AC-SPN-02: F1 with the key unset → beatgrid.json validates, 0 OpenRouter calls, runtime within ±10%', async () => {
  const dir = project();
  const r = run(SPINE, ['--brief', path.join(dir, 'brief.md'), '--target-ms', '20000'], { env: NO_KEY });
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.doesNotMatch(r.stderr, /NETWORK-ATTEMPT/, 'network spy saw no calls');
  assert.match(r.stdout, /PEAK_MEDIA_OPENROUTER_API_KEY .*is not set/);
  const f = path.join(dir, 'spine', 'beatgrid.json');
  const v = await validateFile(f);
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.ok(!existsSync(path.join(dir, 'spine', 'manifest.json')), 'no narration manifest');
  const g = readJson(f);
  assert.equal(g.kind, 'beatgrid');
  assert.ok(within(g.totalMs, 20000), `totalMs ${g.totalMs}`);
  assert.deepEqual(g.beats.map((b) => b.onScreenText), parseScript(readFileSync(path.join(F1, 'script.md'), 'utf8')).map((b) => b.onScreenText), 'beats carry the script\'s on-screen text');
  // --no-narrate forces the beat grid even with a key present, still with no network
  const r2 = run(SPINE, ['--brief', path.join(dir, 'brief.md'), '--no-narrate'], { env: { ...NO_KEY, PEAK_MEDIA_OPENROUTER_API_KEY: 'sk-or-test-not-a-key' } });
  assert.equal(r2.code, 0, r2.stderr);
  assert.doesNotMatch(r2.stderr, /NETWORK-ATTEMPT/);
  assert.ok((await validateFile(f)).ok);
});

test('AC-SPN-03: F1 manifest gaps between beats are ≥ 400 ms and check-cuts passes at every beat boundary', () => {
  assert.equal(narr.r.code, 0, narr.r.stderr);
  const m = readJson(narr.manifest);
  for (let i = 1; i < m.clips.length; i++) {
    const prev = m.clips[i - 1], c = m.clips[i];
    const gap = c.startMs - (prev.startMs + prev.durationMs);
    assert.ok(gap >= 400, `gap between clip ${prev.n} and ${c.n} is ${gap} ms`);
    const b = m.beats.find((x) => x.id === c.beat);
    assert.ok(b.startMs > prev.startMs + prev.durationMs && b.startMs < c.startMs, `beat '${b.id}' starts inside the gap`);
  }
  const cuts = m.beats.slice(1).map((b) => b.startMs);
  const res = checkCuts(narr.wav, { cuts, minSilenceMs: 400 });
  assert.equal(res.cuts.length, m.beats.length - 1);
  assert.ok(res.ok, JSON.stringify(res.cuts));
});

test('AC-BASE-06: spine baseline (help lists every flag, version, one-line errors, no stack, no network)', (t) => {
  const ok = project();
  const twoParas = project('## hook\nOne.\n\nTwo.\n\n## compare\nThree.\n\n## close\nFour.\n');
  const wrongBeats = project('## intro\nOne.\n\n## close\nTwo.\n');
  const noScript = project(null);
  const b = (d) => path.join(d, 'brief.md');
  baseline(t, assert, SPINE, {
    flags: ['--brief', '--script', '--out', '--target-ms', '--narrate', '--no-narrate', '--tts-model', '--voice', '--style', '--lead-ms', '--tail-ms', '--max-hold-ms', '--bpm', '--audio-offset-ms', '--cache-dir', '--export-clips', '--debug-requests', '--budget', '--wpm'],
    badArgs: [['--bogus'], ['--brief', 'nope.md'], ['--brief', b(noScript)], ['--brief', b(ok), '--narrate', '--no-narrate'], ['--brief', b(ok), '--lead-ms', '50'],
      ['--brief', b(ok), '--bpm', 'x'], ['--brief', b(twoParas)], ['--brief', b(wrongBeats)], ['--brief', b(ok), '--tts-model', 'nope/model'], ['stray']],
  });
  // --narrate with a real model and no key: one line naming the env var, before any network
  const key = run(SPINE, ['--brief', b(ok), '--narrate'], { env: NO_KEY });
  assert.notEqual(key.code, 0);
  assert.equal(key.stderr.trim().split('\n').length, 1, key.stderr);
  assert.match(key.stderr, /PEAK_MEDIA_OPENROUTER_API_KEY/);
  assert.doesNotMatch(key.stderr, /NETWORK-ATTEMPT/);
  // a script far over budget: the files are written, the gate fails with one line
  const long = project(`## hook\n${'word '.repeat(80)}\n\n## compare\n${'word '.repeat(80)}\n\n## close\nend.\n`);
  const over = run(SPINE, ['--brief', b(long), '--tts-model', 'fake/tone', '--cache-dir', path.join(long, 'cache')], { env: NO_KEY });
  assert.equal(over.code, 1);
  assert.match(over.stderr.trim(), /^spine: runtime .* outside ±10% — resize script\.md/);
  assert.match(over.stdout.trim().split('\n').at(-1), /^GATE 2 spine: FAIL — spine\/manifest\.json \d+ ms is outside ±10% of the 26000 ms target$/, 'gate 2 FAIL line (WP9 round 5)');
  assert.equal(over.stderr.trim().split('\n').length, 1);
  assert.ok(existsSync(path.join(long, 'spine', 'manifest.json')));
  // --budget needs no synthesis and no network
  const bud = run(SPINE, ['--brief', b(ok), '--budget'], { env: NO_KEY });
  assert.equal(bud.code, 0, bud.stderr);
  assert.match(bud.stdout, /about \d+ words/);
});

test('spine: script.md parsing, layout rules and a second (neutral) brief (not AC-bound)', async () => {
  const s = parseScript('# T\n<!-- note -->\nignored\n## a\n<Warm> Hello\nthere.\n\nOn screen: Hi\nStyle: calm\n## b-2\nBye.\n');
  assert.deepEqual(s.map(({ id, text, onScreenText, style }) => ({ id, text, onScreenText, style })),
    [{ id: 'a', text: '<Warm> Hello there.', onScreenText: 'Hi', style: 'calm' }, { id: 'b-2', text: 'Bye.', onScreenText: undefined, style: undefined }]);
  assert.throws(() => parseScript('## Bad Id\nx\n'), /beat id/);
  assert.throws(() => parseScript('## a\n\nOn screen: x\n'), /no narration paragraph/);
  assert.throws(() => parseScript('just text'), /no beats/);
  assert.equal(parseBrief('- **Runtime:** 1.5 min').targetMs, 90000);
  // a short spine holds each beat up to maxHoldMs; never past the target
  const lay = layoutNarration([{ id: 'a' }, { id: 'b' }], [3000, 3000], { leadMs: 250, tailMs: 250, targetMs: 10000, maxHoldMs: 1000 });
  assert.deepEqual(lay.map((x) => [x.startMs, x.durationMs, x.clipStartMs]), [[0, 4500, 250], [4500, 4500, 4750]]);
  const grid = layoutBeatgrid([{ id: 'a', text: 'one two three four' }, { id: 'b', text: 'one' }], { targetMs: 9000, bpm: 120 });
  assert.equal(grid.at(-1).startMs + grid.at(-1).durationMs, 9000);
  assert.ok(grid.every((g) => g.durationMs % 500 === 0 && g.durationMs >= 2000));
  // neutral fixture: same tool, different brief and beats
  const dir = tmpDir('pm-spine-neutral-');
  copyFileSync(fx('neutral-brief', 'brief.md'), path.join(dir, 'brief.md'));
  writeFileSync(path.join(dir, 'script.md'), '## intro\nMorning is the best time to water.\n\n## why\nLess water evaporates, and the leaves dry before night.\n\n## tip\nWater the roots, early.\n');
  const r = run(SPINE, ['--brief', path.join(dir, 'brief.md'), '--no-narrate'], { env: NO_KEY });
  assert.equal(r.code, 0, r.stderr);
  const g = readJson(path.join(dir, 'spine', 'beatgrid.json'));
  assert.deepEqual(g.beats.map((x) => x.id), ['intro', 'why', 'tip']);
  assert.ok(g.beats.every((x) => x.onScreenText), 'first sentence used when no On screen line');
  assert.ok((await validateFile(path.join(dir, 'spine', 'beatgrid.json'))).ok);
});

test('spine prints the GATE 2 line itself when the runtime check passes (WP9 round 5)', () => {
  const dir = project();
  const r = run(SPINE, ['--brief', path.join(dir, 'brief.md'), '--target-ms', '20000', '--tts-model', 'fake/tone', '--cache-dir', path.join(dir, 'cache')], { env: NO_KEY });
  assert.equal(r.code, 0, r.stderr);
  const m = JSON.parse(readFileSync(path.join(dir, "spine", "manifest.json"), "utf8"));
  assert.equal(r.stdout.trim().split('\n').at(-1), `GATE 2 spine: PASS — spine/manifest.json ${m.totalMs} ms (target 20000 ±10%)`);
  const early = run(SPINE, ['--brief', path.join(dir, 'nope.md')], { env: NO_KEY });
  assert.notEqual(early.code, 0);
  assert.match(early.stdout.trim(), /^GATE 2 spine: FAIL — cannot read brief .*nope\.md/, 'an early failure prints the FAIL line too (verify-4 F4)');
  const g = run(SPINE, ['--brief', path.join(dir, 'brief.md'), '--target-ms', '20000', '--no-narrate'], { env: NO_KEY });
  assert.equal(g.code, 0, g.stderr);
  assert.match(g.stdout.trim().split('\n').at(-1), /^GATE 2 spine: PASS — spine\/beatgrid\.json \d+ ms \(target 20000 ±10%\)$/);
});
