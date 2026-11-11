// Oracle for E3 (monthly summary): what TOR-03-* state, on other data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { lineWith, sandbox } from './helpers.mjs';

const rows = [
  ['2026-09-30', -900, 'SAFEWAY #123', 'groceries'],
  ['2026-10-01', -1250, 'COFFEE SHOP', 'coffee'],
  ['2026-10-03', -4510, 'SAFEWAY #123', 'groceries'],
  ['2026-10-07', -2000, 'SAFEWAY #88', 'groceries'],
  ['2026-10-11', -6000, 'CITY POWER', 'utilities'],
  ['2026-10-31', -305, 'COFFEE CART', 'coffee'],
  ['2026-11-01', -700, 'SAFEWAY #123', 'groceries'],
  ['2025-10-03', -9999, 'SAFEWAY #123', 'groceries'],
];

test('one row per category with the month\'s total, in alphabetical order', (t) => {
  const s = sandbox(t);
  s.seed(rows);
  const r = s.ledger(['summary', '--month', '2026-10']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(lineWith(r.stdout, 'coffee'), /15\.55/);
  assert.match(lineWith(r.stdout, 'groceries'), /65\.10/);
  assert.match(lineWith(r.stdout, 'utilities'), /60\.00/);
  const order = ['coffee', 'groceries', 'utilities'].map((c) => r.stdout.toLowerCase().indexOf(c));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((i) => i >= 0));
  assert.equal(r.stdout.split('\n').filter((l) => /groceries/i.test(l)).length, 1);
});

test('other months and other years are left out', (t) => {
  const s = sandbox(t);
  s.seed(rows);
  const r = s.ledger(['summary', '--month', '2026-09']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(lineWith(r.stdout, 'groceries'), /9\.00/);
  assert.equal(lineWith(r.stdout, 'coffee'), '');
});

test('an empty month is said in words; a malformed month is exit code 2', (t) => {
  const s = sandbox(t);
  s.seed(rows);
  const empty = s.ledger(['summary', '--month', '2026-08']);
  assert.equal(empty.code, 0);
  assert.match(empty.stdout, /No transactions in 2026-08/);
  const bad = s.ledger(['summary', '--month', '10/2026']);
  assert.equal(bad.code, 2);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /YYYY-MM/);
});
