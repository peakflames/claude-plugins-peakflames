#!/usr/bin/env node
// sample-voice — read one paragraph with 2–3 voices, write one WAV per voice and
// print words / seconds / wpm for each (D15). Uses the shared TTS cache, so a
// re-run is free. Compare the WAVs by ear on the same line and style.
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runCli, CliError, EXIT } from '../../../lib/cli.mjs';
import { requireFfmpeg, probe } from '../../../lib/ffmpeg.mjs';
import { checkTtsOptions, synthesizeClips, cacheSummary, wpmReport, DEFAULT_MODEL } from '../../../lib/tts/index.mjs';

export const DEFAULT_TEXT = 'Here is a short paragraph for comparing narrators. It has a question, a list of three things, and a closing line. Which voice sounds most like the video you have in mind?';

export const spec = {
  name: 'sample-voice',
  summary: 'read one paragraph with several voices and report wpm for each',
  usage: 'sample-voice [--voices A,B,C] [--text "..." | --text-file f] [options]',
  description: `
Writes <out-dir>/<voice>.wav for each voice and prints one line per voice: words,
seconds, wpm, sample rate, and whether the clip came from the cache. Needs
TTS_OPENROUTER_API_KEY unless --tts-model fake/tone. Clips are cached in
~/.cache/peak-media/tts/ (PEAK_MEDIA_TTS_CACHE overrides).`,
  options: {
    voices: { type: 'string', arg: 'list', default: 'Achird,Kore,Puck', desc: 'Comma-separated voices (Gemini names, or MAI short ids)' },
    text: { type: 'string', arg: 'paragraph', desc: 'Paragraph to read (default: a neutral sample paragraph)' },
    'text-file': { type: 'string', arg: 'file', desc: 'Read the paragraph from a file instead' },
    'tts-model': { type: 'string', arg: 'model', default: DEFAULT_MODEL, desc: 'TTS model (see references/voices.md; fake/tone for offline tests)' },
    style: { type: 'string', arg: 'text', desc: 'Delivery style, sent as instructions (Gemini only)' },
    'out-dir': { type: 'string', arg: 'dir', default: 'voice-samples', desc: 'Where the WAVs go' },
    'debug-requests': { type: 'boolean', desc: 'Log each OpenRouter request/response to stderr (key redacted)' },
    json: { type: 'boolean', desc: 'Print the results as JSON instead of lines' },
  },
  positionals: { max: 0 },
  examples: [
    'sample-voice --voices Achird,Kore,Puck --style "Clear, friendly explainer tone."',
    'sample-voice --tts-model microsoft/mai-voice-2.1-flash --voices en-GB-Emily,en-US-Harper',
  ],
};

/** Resolve and validate inputs (no network). */
export function plan(values, env = process.env) {
  if (values.text !== undefined && values['text-file']) throw new CliError('pass --text or --text-file, not both', EXIT.USAGE);
  let text = values.text ?? DEFAULT_TEXT;
  if (values['text-file']) {
    if (!existsSync(values['text-file'])) throw new CliError(`--text-file not found: ${values['text-file']}`, EXIT.USAGE);
    text = readFileSync(values['text-file'], 'utf8');
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) throw new CliError('the paragraph is empty — pass --text "..."', EXIT.USAGE);
  const names = String(values.voices).split(',').map((s) => s.trim()).filter(Boolean);
  if (!names.length) throw new CliError('--voices is empty — e.g. --voices Achird,Kore,Puck', EXIT.USAGE);
  const voices = [];
  let warnings = [];
  for (const v of names) {
    const o = checkTtsOptions({ model: values['tts-model'], voice: v, narrate: true, env });
    if (!voices.includes(o.voice)) voices.push(o.voice);
    warnings = [...new Set([...warnings, ...o.warnings])];
  }
  return { model: values['tts-model'], text, voices, style: values.style ?? '', outDir: path.resolve(values['out-dir']), warnings };
}

/** Synthesize the paragraph per voice; returns [{voice, file(out path), cachePath, durationMs, words, wpm, cached, sampleRate, channels}]. */
export async function sampleVoices({ model, text, voices, style, outDir, debugRequests = false, fetchImpl, onCall, env = process.env }) {
  mkdirSync(outDir, { recursive: true });
  const out = [];
  for (const voice of voices) {
    const [r] = await synthesizeClips({ clips: [{ n: 1, text }], model, voice, style, debugRequests, fetchImpl, onCall, env });
    const dest = path.join(outDir, `${voice}.wav`);
    copyFileSync(r.path, dest);
    out.push({ voice, file: dest, cachePath: r.path, durationMs: r.durationMs, words: r.words, wpm: r.wpm, cached: r.cached, sampleRate: r.sampleRate, channels: r.channels });
  }
  return out;
}

const shown = (f) => { const rel = path.relative(process.cwd(), f); return rel && !rel.startsWith('..') ? rel : f; };

export async function main({ values }, { fetchImpl, env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const p = plan(values, env);
  requireFfmpeg();
  for (const w of p.warnings) stderr.write(`sample-voice: note: ${w}\n`);
  const results = await sampleVoices({ ...p, debugRequests: values['debug-requests'] ?? false, fetchImpl, env });
  // ffprobe confirms each WAV is readable and reports what the provider really sent (AC-TTS-07 records the rate).
  for (const r of results) {
    const a = probe(r.file).streams.find((s) => s.codec_type === 'audio');
    r.probe = { sampleRate: Number(a?.sample_rate), channels: a?.channels, codec: a?.codec_name };
  }
  if (values.json) {
    stdout.write(`${JSON.stringify({ model: p.model, style: p.style, text: p.text, results }, null, 2)}\n`);
    return EXIT.OK;
  }
  const w = Math.max(...results.map((r) => r.voice.length));
  for (const r of results) {
    const ch = r.probe.channels === 1 ? 'mono' : `${r.probe.channels} ch`;
    stdout.write(`${r.voice.padEnd(w)}  ${String(r.words).padStart(3)} words  ${(r.durationMs / 1000).toFixed(2).padStart(6)} s  ${String(r.wpm).padStart(3)} wpm  ${r.probe.sampleRate} Hz ${ch}  ${r.cached ? 'cached' : 'synthesized'}  ${shown(r.file)}\n`);
  }
  const rep = wpmReport(results.map((r) => ({ ...r, n: r.voice })), { label: 'voice' });
  stdout.write(`${p.model} · median ${rep.medianWpm} wpm · ${cacheSummary(results)}\n`);
  return EXIT.OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli(spec, main);
}
