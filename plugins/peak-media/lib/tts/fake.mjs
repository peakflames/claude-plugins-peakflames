// fake/tone — offline TTS stand-in for tests and CI (DEC-03). A 440 Hz tone at
// 48 kHz mono s16le whose length follows the word count at FAKE_WPM. The tone is
// at full level from sample 0 (sync tests, D8).
//
// PEAK_MEDIA_FAKE_SLOW=<n>[,<n>…] makes those clip numbers PEAK_MEDIA_FAKE_SLOW_FACTOR
// (default 2) times longer, i.e. that many times slower (AC-TTS-05).
import { pcmToWav } from './wav.mjs';

export const FAKE_WPM = 165;
export const FAKE_RATE = 48000;
const MIN_MS = 300;

/** Words spoken in a clip: mood tags like <Warm> are performed, not read, so they don't count. */
export function countWords(text) {
  return String(text).replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

export function slowFactor(n, env = process.env) {
  const list = String(env.PEAK_MEDIA_FAKE_SLOW ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (n === undefined || !list.includes(String(n))) return 1;
  const f = Number(env.PEAK_MEDIA_FAKE_SLOW_FACTOR ?? 2);
  return Number.isFinite(f) && f > 0 ? f : 2;
}

export function fakeDurationMs(text, factor = 1) {
  return Math.max(MIN_MS, Math.round(((countWords(text) * 60000) / FAKE_WPM) * factor));
}

/** WAV buffer for a clip. */
export function fakeToneWav({ text, n, env = process.env }) {
  const ms = fakeDurationMs(text, slowFactor(n, env));
  const samples = Math.round((ms * FAKE_RATE) / 1000);
  const pcm = Buffer.alloc(samples * 2);
  const step = (2 * Math.PI * 440) / FAKE_RATE;
  for (let i = 0; i < samples; i++) pcm.writeInt16LE(Math.round(Math.sin(i * step) * 9830), i * 2);
  return pcmToWav(pcm, { sampleRate: FAKE_RATE, channels: 1, bits: 16 });
}
