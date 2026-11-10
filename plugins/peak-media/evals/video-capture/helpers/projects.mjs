// Projects for the video-capture evals, built from real merged tools: spines come from
// video-spine's spine.mjs with --tts-model fake/tone and a temp TTS cache (no key, no network).
//   deckSpine(dir)         -> the example deck's brief/script narrated into <dir>/spine/manifest.json
//   makeF3Project(dir, o)  -> F3's 3 live plates on a real 3-clip spine (beats -> plate windows);
//                             o.url overrides every plate's live.url (the evals pass a local page)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run } from '../../helpers/run.mjs';

export const CAPTURE = 'skills/video-capture/scripts/capture.mjs';
export const SPINE = 'skills/video-spine/scripts/spine.mjs';
export const DECK = path.join(ROOT, 'skills', 'video-capture', 'examples', 'deck');
export const F3 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F3');
export const LOCAL_PAGE = path.join(ROOT, 'evals', 'video-capture', 'fixtures', 'live-page', 'index.html');
export const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' };

function spine(brief, out, cache, extra = []) {
  const r = run(SPINE, ['--brief', brief, '--tts-model', 'fake/tone', '--out', out, '--cache-dir', cache, ...extra], { env: { ...NO_KEY, PEAK_MEDIA_TTS_CACHE: cache } });
  if (r.code !== 0) throw new Error(`spine failed (${r.code}): ${r.stderr}${r.stdout}`);
  return JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
}

export function deckSpine(dir) {
  const out = path.join(dir, 'spine');
  const manifest = spine(path.join(DECK, 'brief.md'), out, path.join(dir, 'tts-cache'));
  return { file: path.join(out, 'manifest.json'), manifest };
}

export function makeF3Project(dir, { url } = {}) {
  mkdirSync(dir, { recursive: true });
  const f3Spine = JSON.parse(readFileSync(path.join(F3, 'spine', 'manifest.json'), 'utf8'));
  const f3Plates = JSON.parse(readFileSync(path.join(F3, 'plates.json'), 'utf8'));
  // brief + script with F3's beats and clip texts, so spine.mjs builds the real 3-clip spine
  writeFileSync(path.join(dir, 'brief.md'), `# F3 — live capture\n\n- **Runtime:** ${f3Spine.targetMs / 1000} s\n\n## Beats\n\n${f3Spine.beats.map((b, i) => `${i + 1}. **${b.id}** (live)`).join('\n')}\n`);
  writeFileSync(path.join(dir, 'script.md'), f3Spine.clips.map((c) => `## ${c.beat}\n\n${c.text}\n`).join('\n'));
  const manifest = spine(path.join(dir, 'brief.md'), path.join(dir, 'spine'), path.join(dir, 'tts-cache'), ['--max-hold-ms', '3000']);
  const byBeat = Object.fromEntries(manifest.beats.map((b) => [b.id, b]));
  const plates = {
    ...f3Plates,
    spine: 'spine/manifest.json',
    brand: path.join(ROOT, 'brand-packs', 'default'),
    plates: f3Plates.plates.map((p) => ({
      ...p,
      startMs: byBeat[p.beat].startMs,
      durationMs: byBeat[p.beat].durationMs,
      live: { ...p.live, storyboard: path.join(F3, p.live.storyboard), ...(url ? { url } : {}) },
    })),
  };
  writeFileSync(path.join(dir, 'plates.json'), JSON.stringify(plates, null, 2));
  return { dir, platesFile: path.join(dir, 'plates.json'), plates, manifest };
}
