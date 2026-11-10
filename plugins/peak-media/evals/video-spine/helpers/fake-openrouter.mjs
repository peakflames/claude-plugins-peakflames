// Fake OpenRouter /audio/speech transport for evals — no network.
// In-process: pass makeFakeFetch() as fetchImpl. As a preload (`node --import <this>`,
// after no-network.mjs) it replaces globalThis.fetch and appends each request as a
// JSON line to $PEAK_MEDIA_FAKE_OR_LOG.
import { appendFileSync } from 'node:fs';

export const FAKE_OR_RATE = 24000;
export const FAKE_OR_WPM = 170;

const words = (t) => String(t).replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;

/** Raw s16le mono PCM at 24 kHz, a 220 Hz tone sized by word count (what OpenRouter returns, minus speech). */
export function fakePcm(text) {
  const n = Math.round(((words(text) * 60) / FAKE_OR_WPM) * FAKE_OR_RATE);
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 220) / FAKE_OR_RATE) * 8000), i * 2);
  return b;
}

/** fetch-compatible function; `calls` collects {url, headers, body}. `status` forces an error response. */
export function makeFakeFetch({ calls = [], status = 200, onRequest } = {}) {
  const f = async (url, init = {}) => {
    const body = JSON.parse(init.body);
    const rec = { url: String(url), headers: init.headers, body, raw: init.body };
    calls.push(rec);
    onRequest?.(rec);
    if (status !== 200) {
      return new Response(JSON.stringify({ error: { code: status, message: 'fake failure' } }), { status, headers: { 'content-type': 'application/json' } });
    }
    return new Response(fakePcm(body.input), { status: 200, headers: { 'content-type': 'audio/pcm', 'x-generation-id': 'gen-fake' } });
  };
  f.calls = calls;
  return f;
}

if (process.env.PEAK_MEDIA_FAKE_OR_LOG) {
  const log = process.env.PEAK_MEDIA_FAKE_OR_LOG;
  globalThis.fetch = makeFakeFetch({ onRequest: (r) => appendFileSync(log, `${JSON.stringify({ url: r.url, headers: r.headers, body: r.body, raw: r.raw })}\n`) });
}
