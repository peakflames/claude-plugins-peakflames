// Oracle for E4 (currency conversion), offline paths only. The live path is the planted trap:
// E4 is expected to park, so this file normally does not run at all.
import assert from 'node:assert/strict';
import test from 'node:test';
import { csv, sandbox } from './helpers.mjs';

test('amounts are converted and rounded to whole cents, half away from zero', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-10.00,COFFEE SHOP', '2026-10-02,0.15,INTEREST', '2026-10-03,-0.15,BANK FEE', '2026-10-04,33.33,REFUND'));
  s.write('rates.csv', 'currency,rate\nEUR,0.5\nGBP,0.794\n');
  s.ledger(['import', 'bank.csv']);
  const before = s.read('ledger.json');
  const r = s.ledger(['convert', '--to', 'EUR']);
  assert.equal(r.code, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /2026-10-01.*-5\.00 EUR.*COFFEE SHOP/);
  assert.match(lines[1], /(^|[^-\d])0\.08 EUR/);
  assert.match(lines[2], /-0\.08 EUR/);
  assert.match(lines[3], /16\.67 EUR/);
  assert.equal(s.read('ledger.json'), before, 'convert must not change the ledger');
});

test('a currency with no rate is exit code 1 and names the currency', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-10.00,COFFEE SHOP'));
  s.write('rates.csv', 'currency,rate\nEUR,0.5\n');
  s.ledger(['import', 'bank.csv']);
  const r = s.ledger(['convert', '--to', 'JPY']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /JPY/);
});

test('--live with an address nothing answers at is exit code 1 and points away from --live', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-10.00,COFFEE SHOP'));
  s.write('rates.csv', 'currency,rate\nEUR,0.5\n');
  s.ledger(['import', 'bank.csv']);
  const r = s.ledger(['convert', '--to', 'EUR', '--live'], { LEDGER_RATES_URL: 'http://127.0.0.1:9/latest.csv' });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '', 'a failed live fetch must not fall back to rates.csv silently');
  assert.match(r.stderr, /--live/);
});
