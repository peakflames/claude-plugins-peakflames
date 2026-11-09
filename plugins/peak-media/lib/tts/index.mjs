// STUB — replaced by WP3a
// Minimal lib/tts API so WP3b's spine can run before WP3a lands. Only `fake/tone` synthesizes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { CliError, EXIT } from '../cli.mjs';

export const DEFAULT_MODEL = 'google/gemini-3.8-flash-lite-tts';
export const DEFAULT_VOICE = 'Achird';
const MODELS = ['fake/tone', 'google/gemini-3.8-flash-lite-tts', 'google/gemini-3.8-flash-tts', 'microsoft/mai-voice-2.1-flash', 'microsoft/mai-voice-2.1'];
const RATE = 48000;
const FAKE_WPM = 165;

export function cacheKey({ model, voice, style, text }) {
  return `${createHash('sha256').update(`${model}\0${voice}\0${style}\0${text}`).digest('hex')}.wav`;
}

export function checkTtsOptions({ model, voice, narrate, env = process.env }) {
  if (!MODELS.includes(model)) throw new CliError(`unknown --tts-model '${model}' (expected ${MODELS.join(', ')})`, EXIT.USAGE);
  if (!voice) throw new CliError('--voice must not be empty', EXIT.USAGE);
  if (narrate && model !== 'fake/tone' && !(env.PEAK_MEDIA_OPENROUTER_API_KEY || env.TTS_OPENROUTER_API_KEY)) {
    throw new CliError('narration needs PEAK_MEDIA_OPENROUTER_API_KEY (or legacy TTS_OPENROUTER_API_KEY) — export it, or drop --narrate to write a beat grid', EXIT.MISSING_PREREQ);
  }
  return { model, voice };
}

const countWords = (t) => t.replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

function toneWav(ms) {
  const n = Math.round((RATE * ms) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(0.3 * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE)), 44 + i * 2);
  return buf;
}

const wavMs = (file) => { const b = readFileSync(file); return Math.round((b.readUInt32LE(40) / (b.readUInt32LE(28))) * 1000); };

export async function synthesizeClips({ clips, model, voice, style = '', cacheDir, exportDir, debugRequests = false, fetchImpl, onCall }) {
  void debugRequests; void fetchImpl;
  if (model !== 'fake/tone') throw new CliError(`TTS stub only supports fake/tone (got ${model}) — WP3a's lib/tts is not merged yet`);
  mkdirSync(cacheDir, { recursive: true });
  if (exportDir) mkdirSync(exportDir, { recursive: true });
  const out = [];
  for (const c of clips) {
    const s = c.style ?? style;
    const file = cacheKey({ model, voice, style: s, text: c.text });
    const p = path.join(cacheDir, file);
    const words = countWords(c.text);
    const cached = existsSync(p);
    if (!cached) {
      onCall?.({ n: c.n, model, voice });
      writeFileSync(p, toneWav(Math.max(300, Math.round((words / FAKE_WPM) * 60000))));
    }
    if (exportDir) copyFileSync(p, path.join(exportDir, file));
    const durationMs = wavMs(p);
    out.push({ n: c.n, text: c.text, style: s, file, path: p, durationMs, words, wpm: Math.round((words / (durationMs / 60000)) * 10) / 10, cached });
  }
  return out;
}

export function wpmReport(results) {
  const sorted = results.map((r) => r.wpm).sort((a, b) => a - b);
  const medianWpm = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const rows = results.map((r) => `${String(r.n).padStart(3)}  ${String(r.words).padStart(5)}  ${(r.durationMs / 1000).toFixed(2).padStart(6)}  ${String(r.wpm).padStart(6)}`);
  const table = ['  n  words      s     wpm', ...rows].join('\n');
  const warnings = results.filter((r) => r.wpm < medianWpm * 0.6).map((r) => ({ n: r.n, wpm: r.wpm, medianWpm, message: `clip ${r.n} runs slow (${r.wpm} wpm vs median ${medianWpm})` }));
  return { table, warnings };
}
