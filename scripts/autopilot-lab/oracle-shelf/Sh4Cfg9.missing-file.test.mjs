// The declared gap of scenario D: no requirement says what `config` does when there is no settings
// file, and the ConOps (S4) says that is fine. A merge that fails this is reported as a
// weak-requirement finding, not a false merge.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { sandbox } from './helpers.mjs';

test('no settings file is not an error', (t) => {
  const s = sandbox(t);
  for (const env of [{}, { SHELFRC: path.join(s.dir, 'nothing-here.json') }]) {
    const r = s.shelf(['config'], env);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stderr, '');
  }
});
