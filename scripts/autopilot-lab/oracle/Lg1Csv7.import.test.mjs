// Oracle for E1 (CSV import): behaviour TOR-01-* imply beyond the examples the build saw.
import assert from 'node:assert/strict';
import test from 'node:test';
import { csv, sandbox } from './helpers.mjs';

test('importing the same file twice adds nothing the second time', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-12.50,COFFEE SHOP', '2026-10-02,2500.00,PAYROLL', '10/03/2026,-3.25,PARKING'));
  assert.equal(s.ledger(['import', 'bank.csv']).code, 0);
  const again = s.ledger(['import', 'bank.csv']);
  assert.equal(again.code, 0);
  assert.equal(s.ledgerJson().transactions.length, 3);
  assert.match(again.stdout, /Imported 0 transactions \(3 duplicates skipped\)/);
});

test('a duplicate is recognised across date styles and amount styles, but a different description is a different transaction', (t) => {
  const s = sandbox(t);
  s.write('a.csv', csv('2026-10-02,2500.00,PAYROLL', '2026-10-05,-30.00,PHARMACY'));
  s.write('b.csv', csv('10/2/2026,2500,PAYROLL', '2026-10-05,-30.00,pharmacy', '2026-10-05,-30.01,PHARMACY'));
  s.ledger(['import', 'a.csv']);
  assert.equal(s.ledger(['import', 'b.csv']).code, 0);
  const tx = s.ledgerJson().transactions;
  assert.equal(tx.length, 4, JSON.stringify(tx));
  assert.equal(tx.filter((x) => x.description === 'PAYROLL').length, 1);
});

test('amounts are exact integer cents', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-01,-0.07,FEE', '2026-10-02,1234.5,BONUS', '2026-10-03,-19.99,BOOK', '2026-10-04,0.29,INTEREST', '2026-10-05,-1005.10,RENT'));
  assert.equal(s.ledger(['import', 'bank.csv']).code, 0);
  const cents = s.ledgerJson().transactions.map((x) => x.amountCents);
  assert.deepEqual(cents, [-7, 123450, -1999, 29, -100510]);
  assert.ok(cents.every(Number.isInteger));
});

test('a quoted description is stored byte for byte, spaces and case included', (t) => {
  const s = sandbox(t);
  s.write('bank.csv', csv('2026-10-03,-45.10,"  SAFEWAY #123 "', '2026-10-04,-9.00,"  Mixed Case Café  "'));
  assert.equal(s.ledger(['import', 'bank.csv']).code, 0);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.description), ['  SAFEWAY #123 ', '  Mixed Case Café  ']);
  assert.deepEqual(s.ledgerJson().transactions.map((x) => x.date), ['2026-10-03', '2026-10-04']);
});
