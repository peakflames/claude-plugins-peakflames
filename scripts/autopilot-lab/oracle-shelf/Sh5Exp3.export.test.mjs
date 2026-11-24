// Oracle for E5 (CSV export): what the requirements promise.
import assert from 'node:assert/strict';
import test from 'node:test';
import { oneLine, sandbox } from './helpers.mjs';

test('export writes a header and one line per book in order, quoting what needs it', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474], ['Salt, Fat', 'S. Nosrat', 480, '2026-10-02'], ['Say "Yes"', 'A. Body', 90]]);
  const r = s.shelf(['export', '--out', 'list.csv']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(s.read('list.csv').trimEnd(), 'title,author,pages,finished\nEmma,Jane Austen,474,\n"Salt, Fat",S. Nosrat,480,2026-10-02\n"Say ""Yes""",A. Body,90,');
});

test('an existing file is left alone, with one error line naming it', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474]]);
  s.write('list.csv', 'mine\n');
  const r = s.shelf(['export', '--out', 'list.csv']);
  assert.equal(r.code, 1);
  assert.equal(s.read('list.csv'), 'mine\n');
  assert.ok(oneLine(r.stderr) && r.stderr.startsWith('Error: ') && r.stderr.includes('list.csv'), r.stderr);
});
