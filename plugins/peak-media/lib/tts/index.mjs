// peak-media TTS layer — the API the spine (WP3b) and sample-voice build on.
//   checkTtsOptions  validate model/voice/key before any network (D2)
//   synthesizeClips  cache-first synthesis: plugin cache, then legacy caches, then OpenRouter or fake/tone
//   wpmReport        per-clip words/seconds/wpm table plus slow-clip warnings (D13)
import { mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { CliError, EXIT } from '../cli.mjs';
import { MODELS, GEMINI_VOICES, MAI_VOICES, DEFAULT_VOICES, canonicalVoice, familyOf } from './voices.mjs';
import { cacheKey as key, defaultCacheDir, legacyCacheDirs, lookup, store, adopt } from './cache.mjs';
import { countWords, fakeToneWav } from './fake.mjs';
import { synthesize, requireKey, KEY_ENV, LEGACY_KEY_ENV } from './openrouter.mjs';
import { pcmToWav, wavInfo } from './wav.mjs';

export const DEFAULT_MODEL = 'google/gemini-3.8-flash-lite-tts';
export const DEFAULT_VOICE = 'Achird';
export { MODELS, GEMINI_VOICES, MAI_VOICES, DEFAULT_VOICES, KEY_ENV, LEGACY_KEY_ENV, countWords, defaultCacheDir, legacyCacheDirs, wavInfo };

/** '<sha256 hex of model\0voice\0style\0text>.wav' — byte-compatible with the old recorder (D4). */
export function cacheKey({ model, voice, style = '', text }) {
  return key({ model, voice, style, text });
}

/** Slow-clip threshold: a clip below this fraction of the median wpm is flagged. */
export const SLOW_RATIO = 0.7;

/**
 * Validate TTS options before any network. Throws a one-line CliError:
 * unknown model / voice → exit 2; narrate with a real model and no key → exit 3.
 * Returns {model, voice (canonical), family, warnings[]}.
 */
export function checkTtsOptions({ model, voice, narrate = false, env = process.env } = {}) {
  const m = model ?? DEFAULT_MODEL;
  if (!MODELS[m]) {
    throw new CliError(`unknown --tts-model '${m}' — use one of ${Object.keys(MODELS).join(', ')}`, EXIT.USAGE);
  }
  const family = familyOf(m);
  const v = voice === undefined || voice === null || voice === '' ? DEFAULT_VOICES[family] : canonicalVoice(m, voice);
  if (!v) {
    const hint = family === 'mai'
      ? 'use an MAI short id such as en-GB-Emily or en-US-Harper'
      : 'use a Gemini voice such as Achird, Kore or Puck';
    throw new CliError(`unknown --voice '${voice}' for ${m} — ${hint} (see skills/video-spine/references/voices.md)`, EXIT.USAGE);
  }
  if (narrate && family !== 'fake') requireKey(env);
  const warnings = [];
  if (family === 'mai' && !MAI_VOICES.includes(v)) warnings.push(`voice '${v}' is not in the built-in MAI list; OpenRouter will reject it if Microsoft doesn't know it`);
  if (narrate && family === 'gemini') {
    warnings.push(`zero data retention is requested; Gemini's only ZDR endpoint needs "Allow Safety Retention" on your OpenRouter account — or use --tts-model microsoft/mai-voice-2.1-flash`);
  }
  return { model: m, voice: v, family, warnings };
}

/**
 * Synthesize (or reuse) every clip. Clips are [{n, text, style?}]; a clip's own style wins over `style`.
 * Returns [{n, text, style, file, path, durationMs, words, wpm, cached, source}] in input order, where
 * source is 'cache' | 'legacy' | 'synth'. onCall({n, model, voice, style, text}) fires once per synthesis.
 * Extra options: legacyDirs (default: env/legacy home dirs), env (default process.env).
 */
export async function synthesizeClips({
  clips, model = DEFAULT_MODEL, voice, style = '', cacheDir, exportDir, debugRequests = false,
  fetchImpl, onCall, legacyDirs, env = process.env,
}) {
  const opts = checkTtsOptions({ model, voice, env });
  const dir = cacheDir ?? defaultCacheDir(env);
  const legacy = legacyDirs ?? legacyCacheDirs(env);
  if (exportDir) mkdirSync(exportDir, { recursive: true });
  let apiKey = null;
  const out = [];
  for (const clip of clips) {
    const text = String(clip.text ?? '');
    if (!text.trim()) throw new CliError(`clip ${clip.n} has no text`, EXIT.USAGE);
    const st = clip.style ?? style ?? '';
    const file = cacheKey({ model: opts.model, voice: opts.voice, style: st, text });
    let p, source;
    const hit = lookup(file, dir, legacy);
    if (hit && !hit.legacy) { p = hit.path; source = 'cache'; }
    else if (hit) { p = adopt(dir, file, hit.path); source = 'legacy'; }
    else {
      onCall?.({ n: clip.n, model: opts.model, voice: opts.voice, style: st, text });
      let wav;
      if (opts.family === 'fake') wav = fakeToneWav({ text, n: clip.n, env });
      else {
        apiKey ??= requireKey(env);
        const { pcm, sampleRate } = await synthesize({ model: opts.model, voice: opts.voice, style: st, text, apiKey, fetchImpl: fetchImpl ?? globalThis.fetch, debug: debugRequests, env });
        wav = pcmToWav(pcm, { sampleRate, channels: 1, bits: 16 });
      }
      p = store(dir, file, wav);
      source = 'synth';
    }
    let info;
    try { info = wavInfo(readFileSync(p)); } catch (e) { throw new CliError(`cached clip ${p} is not a valid WAV (${e.message}) — delete it and re-run`); }
    if (exportDir) copyFileSync(p, path.join(exportDir, file));
    const words = countWords(text);
    out.push({
      n: clip.n, text, style: st, file, path: p, durationMs: info.durationMs, words,
      wpm: info.durationMs > 0 ? Math.round(words / (info.durationMs / 60000)) : 0,
      cached: source !== 'synth', source, sampleRate: info.sampleRate, channels: info.channels,
    });
  }
  return out;
}

/** "N/M cached" for a result list (D12). */
export const cacheSummary = (results) => `${results.filter((r) => r.cached).length}/${results.length} cached`;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * Per-clip table and slow-clip warnings. A clip slower than SLOW_RATIO × the median wpm
 * usually means a mood tag was read aloud instead of performed.
 * Returns {table, warnings:[{n, wpm, medianWpm, message}], medianWpm}.
 */
export function wpmReport(results, { label = 'clip' } = {}) {
  const med = median(results.filter((r) => r.words > 0).map((r) => r.wpm));
  const rows = [[label, 'words', 'sec', 'wpm', 'cached'], ...results.map((r) => [String(r.n), String(r.words), (r.durationMs / 1000).toFixed(2), String(r.wpm), r.cached ? 'yes' : 'no'])];
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ');
  const lines = [fmt(rows[0]), w.map((n) => '-'.repeat(n)).join('  '), ...rows.slice(1).map(fmt), `median ${med} wpm · ${cacheSummary(results)}`];
  const warnings = [];
  if (results.length >= 2) {
    for (const r of results) {
      if (r.words > 0 && r.wpm < med * SLOW_RATIO) {
        warnings.push({ n: r.n, wpm: r.wpm, medianWpm: med, message: `slow ${label} ${r.n}: ${r.wpm} wpm vs median ${med} — a mood tag may have been read aloud; check its text` });
      }
    }
  }
  return { table: lines.join('\n'), warnings, medianWpm: med };
}
