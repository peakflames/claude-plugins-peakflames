// Oracle for E2 (categorization rules), including the planted trap: matching must tolerate case
// and spacing WITHOUT the stored description being normalised (TOR-01-Vp6Js1G, TOR-02-Ci4Ws7d).
import assert from 'node:assert/strict';
import test from 'node:test';
import { csv, sandbox } from './helpers.mjs';

test('the first matching rule wins, whatever the order of the transactions', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-45.10,SAFEWAY FUEL STATION', '2026-10-02,-20.00,SAFEWAY #88', '2026-10-03,-9.00,SHELL FUEL'));
  s.write('rules.txt', 'groceries: /SAFEWAY/\nfuel: /FUEL/\n');
  s.ledger(['import', 'bank.csv']);
  assert.equal(s.ledger(['categorize']).code, 0);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.category), ['groceries', 'groceries', 'fuel']);
});

test('matching ignores letter case and extra spaces; unmatched transactions are uncategorized', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-45.10,"  SafeWay    #123 "', '2026-10-02,-12.50,coffee shop', '2026-10-03,-31.40,PHARMACY'));
  s.write('rules.txt', 'groceries: /SAFEWAY #123/\ncoffee: /Coffee  Shop/\n');
  s.ledger(['import', 'bank.csv']);
  assert.equal(s.ledger(['categorize']).code, 0);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.category), ['groceries', 'coffee', 'uncategorized']);
});

test('the stored description is still exactly what the bank wrote, after import and after categorize', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-03,-45.10,"  SAFEWAY #123 "', '2026-10-07,-20.00,"  safeway   #88 "'));
  s.write('rules.txt', 'groceries: /SAFEWAY/\n');
  s.ledger(['import', 'bank.csv']);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.description), ['  SAFEWAY #123 ', '  safeway   #88 ']);
  assert.equal(s.ledger(['categorize']).code, 0);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.description), ['  SAFEWAY #123 ', '  safeway   #88 ']);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.category), ['groceries', 'groceries']);
});

test('categorize leaves dates and amounts alone, and importing again still skips duplicates', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-12.50,COFFEE SHOP', '2026-10-02,2500.00,PAYROLL'));
  s.write('rules.txt', 'coffee: /COFFEE/\n');
  s.ledger(['import', 'bank.csv']);
  s.ledger(['categorize']);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => [x.date, x.amountCents]), [['2026-10-01', -1250], ['2026-10-02', 250000]]);
  assert.equal(s.ledger(['import', 'bank.csv']).code, 0);
  assert.equal(s.ledgerJson().transactions.length, 2);
});

test('without rules.txt nothing is categorized and the exit code is 1', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-12.50,COFFEE SHOP'));
  s.ledger(['import', 'bank.csv']);
  const r = s.ledger(['categorize']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /rules\.txt/);
  assert.equal('category' in s.ledgerJson().transactions[0], false);
});
