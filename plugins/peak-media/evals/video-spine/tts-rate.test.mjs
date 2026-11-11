// WP3a verify-1 S1: the PCM sample rate comes from the response when it declares one.
import { test } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { synthesize } from '../../lib/tts/openrouter.mjs';

const fakeFetch = (type) => async () => new Response(new Uint8Array(4800), { status: 200, headers: { 'content-type': type } });
const base = { model: 'google/gemini-3.8-flash-lite-tts', voice: 'Achird', style: '', text: 'hi', apiKey: 'k', env: {} };

test('openrouter: sample rate read from the response content-type, table as fallback (not AC-bound)', async () => {
  assert.equal((await synthesize({ ...base, fetchImpl: fakeFetch('audio/pcm;rate=16000;channels=1') })).sampleRate, 16000);
  assert.equal((await synthesize({ ...base, fetchImpl: fakeFetch('audio/pcm') })).sampleRate, 24000);
  assert.equal((await synthesize({ ...base, env: { PEAK_MEDIA_TTS_PCM_RATE: '22050' }, fetchImpl: fakeFetch('audio/pcm;rate=16000') })).sampleRate, 22050);
});
