// OpenRouter text-to-speech: POST https://openrouter.ai/api/v1/audio/speech
// Request (JSON): {model, input, voice, response_format:'pcm', instructions?, provider:{zdr:true}}.
// Response: raw s16le PCM bytes (Content-Type audio/pcm); errors are JSON {error:{code,message}}.
// Source: https://openrouter.ai/docs/api/api-reference/tts/create-speech and
// https://openrouter.ai/docs/features/multimodal/tts (checked 2026-11-08).
import { CliError, EXIT } from '../cli.mjs';
import { MODELS, apiVoice } from './voices.mjs';

export const ENDPOINT = 'https://openrouter.ai/api/v1/audio/speech';
// DEC-30: PEAK_MEDIA_OPENROUTER_API_KEY first, then the legacy TTS_OPENROUTER_API_KEY.
export const KEY_ENV = 'PEAK_MEDIA_OPENROUTER_API_KEY';
export const LEGACY_KEY_ENV = 'TTS_OPENROUTER_API_KEY';
const TIMEOUT_MS = 120000;

/** The JSON body for one clip. Every request opts out of retention (DEC-04). */
export function requestBody({ model, voice, style, text }) {
  const body = { model, input: text, voice: apiVoice(model, voice), response_format: 'pcm', provider: { zdr: true } };
  // `instructions` carries the style; only Gemini reads it (DEC-03).
  if (style && MODELS[model]?.family === 'gemini') body.instructions = style;
  return body;
}

export const redact = (s, key) => (key ? String(s).split(key).join('***REDACTED***') : String(s));

/** One debug line, key redacted. `debug` is true (stderr) or a function(line). */
function debugLog(debug, obj, key) {
  if (!debug) return;
  const line = `[debug-requests] ${redact(JSON.stringify(obj), key)}`;
  if (typeof debug === 'function') debug(line);
  else process.stderr.write(`${line}\n`);
}

function explain(status, msg, model) {
  if (status === 401) return `OpenRouter rejected the API key (401) — check ${KEY_ENV} at https://openrouter.ai/settings/keys`;
  if (status === 402) return `OpenRouter says the account is out of credit (402) — add credit or use --tts-model fake/tone`;
  if (status === 404 && MODELS[model]?.family === 'gemini') {
    return `no zero-data-retention endpoint for ${model} (404: ${msg}) — enable "Allow Safety Retention" in OpenRouter privacy settings, or use --tts-model microsoft/mai-voice-2.1-flash`;
  }
  return `OpenRouter TTS failed (${status}): ${msg}`;
}

/** Synthesize one clip; returns {pcm: Buffer, sampleRate}. */
export async function synthesize({ model, voice, style, text, apiKey, fetchImpl = globalThis.fetch, debug = false, env = process.env }) {
  const body = requestBody({ model, voice, style, text });
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  debugLog(debug, { request: { method: 'POST', url: ENDPOINT, headers, body } }, apiKey);
  let res;
  try {
    res = await fetchImpl(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new CliError(`OpenRouter request failed: ${redact(e?.cause?.message ?? e?.message ?? e, apiKey)}`);
  }
  const type = res.headers?.get?.('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  debugLog(debug, { response: { status: res.status, contentType: type, bytes: buf.length, generationId: res.headers?.get?.('x-generation-id') ?? null } }, apiKey);
  if (!res.ok || /json|text\//i.test(type)) {
    let msg = buf.toString('utf8').slice(0, 300);
    try { msg = JSON.parse(msg).error?.message ?? msg; } catch { /* not JSON */ }
    throw new CliError(redact(explain(res.status, msg.replace(/\s+/g, ' ').trim(), model), apiKey));
  }
  if (buf.length < 2) throw new CliError(`OpenRouter returned no audio for ${model}/${voice}`);
  const override = Number(env.PEAK_MEDIA_TTS_PCM_RATE);
  return { pcm: buf, sampleRate: Number.isFinite(override) && override > 0 ? override : MODELS[model].sampleRate };
}

export function requireKey(env = process.env) {
  const key = env[KEY_ENV] || env[LEGACY_KEY_ENV];
  if (!key) throw new CliError(`narration needs ${KEY_ENV} — export ${KEY_ENV}=<your OpenRouter key>, or drop --narrate (offline tests: --tts-model fake/tone)`, EXIT.MISSING_PREREQ);
  return key;
}
