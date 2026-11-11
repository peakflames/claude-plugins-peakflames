// DEC-53 end-to-end smoke test: the one real run on every OS in CI (macOS, Windows x64, Linux x64).
// Real binaries (HyperFrames, the render browser, Playwright, ffmpeg), no API key, and no network
// after setup: setup.mjs --check → render one plate → capture the example deck → assemble →
// check-take. The project is the example deck's narration on a fake/tone spine (beats intro, why,
// how), one live plate per slide of the deck page. The HyperFrames step renders a motion plate for
// `intro` from its own plate list (a motion entrance would itself be a scene change for check-take).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { run, ROOT, tmpDir } from '../helpers/run.mjs';

const DECK = path.join(ROOT, 'skills', 'video-capture', 'examples', 'deck');
const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' };
const lines = (s) => s.trim().split('\n').filter(Boolean);
const posix = (p) => p.split(path.sep).join('/');

test('AC-PKG-04: on any supported OS, setup.mjs --check then the smoke run (render a plate, capture the deck, assemble, check-take) passes end to end', { timeout: 20 * 60_000 }, () => {
  const dir = tmpDir('pm-smoke-');
  const step = (name, script, args, opts = {}) => {
    const t0 = Date.now();
    const r = run(script, args, { cwd: dir, ...opts, env: { ...NO_KEY, ...opts.env } });
    assert.equal(r.code, 0, `${name} (exit ${r.code}): ${r.stdout}${r.stderr}`);
    process.stdout.write(`# smoke ${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
    return r;
  };

  // 1. the runtime is installed (CI runs setup.mjs first; this never touches the network)
  const check = step('setup --check', 'scripts/setup.mjs', ['--check']);
  assert.match(lines(check.stdout).at(-1), /^peak-media ready: /);

  // the spine: the deck's narration, offline
  step('spine', 'skills/video-spine/scripts/spine.mjs', ['--brief', path.join(DECK, 'brief.md'), '--tts-model', 'fake/tone', '--out', path.join(dir, 'spine'), '--cache-dir', path.join(dir, 'tts-cache')]);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'spine', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.beats.map((b) => b.id), ['intro', 'why', 'how']);
  const beat = Object.fromEntries(manifest.beats.map((b) => [b.id, b]));

  // a storyboard per live plate: setup() shows the plate's slide before t0, so nothing moves inside the plate
  const storyboard = (id, n) => {
    const f = path.join(dir, `sb-${id}.mjs`);
    writeFileSync(f, `export async function setup({ page }) { await page.evaluate(() => window.deckGo(${n})); }\n`
      + `export default async function storyboard({ beat }) { await beat(${JSON.stringify(id)}); }\n`);
    return path.basename(f);
  };
  const live = (id, n) => ({
    id: `l-${id}`, beat: id, kind: 'live', startMs: beat[id].startMs, durationMs: beat[id].durationMs, intent: `deck slide ${n + 1}`, assets: [],
    live: { url: posix(path.join(DECK, 'index.html')), storyboard: storyboard(id, n), viewport: '1280x720' },
  });
  const head = { schemaVersion: 1, spine: 'spine/manifest.json', brand: posix(path.join(ROOT, 'brand-packs', 'default')), fps: 30, width: 1280, height: 720 };
  const platesFile = path.join(dir, 'plates.json');
  writeFileSync(platesFile, JSON.stringify({ ...head, plates: [live('intro', 0), live('why', 1), live('how', 2)] }, null, 2));
  const motionFile = path.join(dir, 'plates-motion.json');
  writeFileSync(motionFile, JSON.stringify({ ...head, plates: [
    { id: 'p-intro', beat: 'intro', kind: 'motion', startMs: beat.intro.startMs, durationMs: beat.intro.durationMs, intent: 'The habit', assets: [], text: ['Water in the morning.', 'One small habit.'] },
  ] }, null, 2));

  // 2. render one plate (HyperFrames + the render browser), linted and checked by render-plate
  step('render-plate', 'skills/video-plates/scripts/render-plate.mjs', [motionFile, 'p-intro', '--lint']);
  const plate = path.join(dir, 'renders', 'plates', 'p-intro.mp4');
  step('probe-spec plate', 'lib/verify/probe-spec.mjs', [plate, '--size', '1280x720', '--fps', '30', '--no-audio']);

  // 3. capture the deck page as three live plates (Playwright + the render browser, served on 127.0.0.1)
  for (const id of ['l-intro', 'l-why', 'l-how']) {
    // the loopback listen goes through dns.lookup, which the no-network preload blocks: run without
    // it and check the request log instead — the page asks for nothing beyond 127.0.0.1
    const r = step(`capture ${id}`, 'skills/video-capture/scripts/capture.mjs', ['--plates', platesFile, '--plate', id, '--debug-requests'], { network: true });
    const reqs = [...r.stderr.matchAll(/^capture: request \S+ (\S+)/gm)].map((m) => m[1]);
    assert.ok(reqs.length >= 1, 'the request log is on');
    for (const u of reqs) assert.match(u, /^(http:\/\/127\.0\.0\.1:\d+\/|data:|about:)/, `only local page requests (${u})`);
    assert.ok(existsSync(path.join(dir, 'renders', 'plates', `${id}.mp4`)), `${id} is captured`);
  }

  // 4. assemble: plates on the spine, every plate cut in silence, the brand outro, out/final.mp4 to spec
  const asm = JSON.parse(step('assemble', 'skills/video-assemble/scripts/assemble.mjs', [dir, '--json']).stdout);
  assert.equal(asm.cuts.length, 2, JSON.stringify(asm.cuts));
  assert.ok(asm.cuts.every((c) => c.ok), `every plate cut in silence: ${JSON.stringify(asm.cuts)}`);
  const final = path.join(dir, 'out', 'final.mp4');
  step('probe-spec', 'lib/verify/probe-spec.mjs', [final, '--size', '1280x720', '--fps', '30', '--duration-ms', String(manifest.totalMs + 3000)]);

  // 5. check-take on the review cut: the two slide changes are the only scene changes, each inside a
  // narration silence as long as assemble's (DEC-13: 300 ms; the fake/tone spine's gaps are ~700 ms)
  const ct = JSON.parse(step('check-take', 'skills/video-capture/scripts/check-take.mjs', [path.join(dir, 'review', 'review.mp4'), '--expect-cuts', '2', '--min-silence-ms', '300', '--json']).stdout);
  assert.equal(ct.ok, true);

  // CI keeps the video (PEAK_MEDIA_SMOKE_OUT): uploaded as an artifact and linked from the PR
  const keep = process.env.PEAK_MEDIA_SMOKE_OUT;
  if (keep) {
    mkdirSync(keep, { recursive: true });
    const tag = `${process.platform}-${process.arch}`;
    copyFileSync(final, path.join(keep, `peak-media-smoke-${tag}.mp4`));
  }
  process.stdout.write(`# smoke: ${process.platform}/${process.arch}, ${manifest.totalMs} ms spine, plate cuts at ${asm.cuts.map((c) => c.timecode).join(', ')} in silence\n`);
});
