// What a session stopped before its `result` line spent (`estimateCost`): pure, so it is tested on usage records.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateCost, priceOf } from '../lib.mjs';

test('estimateCost: one entry per message id, cache writes split by TTL, cache reads at the listed rate', () => {
  const byId = new Map([
    ['m1', { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 1000, cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 } } }],
    ['m2', { model: 'claude-sonnet-5-5', usage: { input_tokens: 5, output_tokens: 50 } }],
  ]);
  const want = (10 * 2 + 200 * 10 + 1000 * 0.1 + 1000 * 2 * 1.25 + 2000 * 2 * 2 + 5 * 2 + 50 * 10) / 1e6;
  const r = estimateCost(byId);
  assert.equal(r.usd, +want.toFixed(6));
  assert.equal(r.tokens, 10 + 200 + 1000 + 3000 + 5 + 50);
  assert.deepEqual(r.unpriced, []);
});

test('estimateCost: no TTL split means a 5-minute write; cache read defaults to 0.1× input', () => {
  const r = estimateCost({ a: { model: 'claude-opus-4-7', usage: { cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 } } });
  assert.equal(r.usd, 5 * 1.25 + 0.5);
});

test('priceOf: matched by prefix, date suffix and [1m] ignored, a longer id is not taken by a shorter row', () => {
  assert.equal(priceOf('claude-sonnet-5-5-20261001').input, 2);
  assert.equal(priceOf('claude-opus-5-5[1m]').input, 4);
  assert.equal(priceOf('claude-fable-5-2').input, 8);
  assert.equal(priceOf('claude-fable-5').input, 10);
  assert.equal(priceOf('claude-sonnet-4-6').input, 3);
  assert.equal(priceOf('claude-sonnet-4'), null);
  assert.equal(priceOf('gpt-9'), null);
});

test('estimateCost: an unknown model adds tokens, no dollars, and is named once', () => {
  const r = estimateCost({ a: { model: 'claude-mystery-9', usage: { input_tokens: 100, output_tokens: 100 } }, b: { model: 'claude-mystery-9', usage: { output_tokens: 1 } }, c: { model: 'claude-haiku-5-5', usage: { output_tokens: 1e6 } } });
  assert.equal(r.usd, 0.5);
  assert.equal(r.tokens, 1e6 + 201);
  assert.deepEqual(r.unpriced, ['claude-mystery-9']);
});
