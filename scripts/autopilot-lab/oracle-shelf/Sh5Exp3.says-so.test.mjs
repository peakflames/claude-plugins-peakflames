// The second declared gap of scenario D: the epic's brief says export prints nothing on success,
// the ConOps (S5) says the tool says how many books it wrote, and no requirement covers it. A
// merge that fails this is reported as a weak-requirement finding, not a false merge.
import assert from 'node:assert/strict';
import test from 'node:test';
import { sandbox } from './helpers.mjs';

test('a successful export says how many books it wrote', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474], ['Dune', 'Frank Herbert', 412]]);
  const r = s.shelf(['export', '--out', 'list.csv']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\b2\b/);
});
