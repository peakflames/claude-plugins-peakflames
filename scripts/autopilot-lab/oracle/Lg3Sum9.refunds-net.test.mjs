// The declared weak-requirement case (plan §10.5, E3). TOR-03-Sm1Tb4f says "a row per category
// with its total" and is silent on refunds; the product vision says a refund reduces its
// category's spending. A build that follows the TOR to the letter may fail this — that is counted
// as a weak-requirement finding, not a false merge.
import assert from 'node:assert/strict';
import test from 'node:test';
import { lineWith, sandbox } from './helpers.mjs';

test('a refund reduces its category\'s total for the month', (t) => {
  const s = sandbox(t);
  s.seed([
    ['2026-10-03', -4510, 'SAFEWAY #123', 'groceries'],
    ['2026-10-07', -2000, 'SAFEWAY #88', 'groceries'],
    ['2026-10-09', 1000, 'SAFEWAY #123 REFUND', 'groceries'],
    ['2026-10-01', -1250, 'COFFEE SHOP', 'coffee'],
  ]);
  const r = s.ledger(['summary', '--month', '2026-10']);
  assert.equal(r.code, 0, r.stderr);
  const line = lineWith(r.stdout, 'groceries');
  assert.match(line, /55\.10/, `groceries should net to 55.10 (45.10 + 20.00 − 10.00): ${JSON.stringify(line)}`);
  assert.doesNotMatch(line, /75\.10|65\.10/);
  assert.match(lineWith(r.stdout, 'coffee'), /12\.50/);
});
