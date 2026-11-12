// Oracle for E4 (settings check): what the requirements promise.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { oneLine, sandbox } from './helpers.mjs';

const check = (t, content) => {
  const s = sandbox(t);
  s.write('settings.json', content);
  return s.shelf(['config'], { SHELFRC: path.join(s.dir, 'settings.json') });
};

test('a correct settings file is confirmed', (t) => {
  const r = check(t, '{"finishedLast": false, "pageTitle": "Books"}');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Settings OK/);
});

for (const [name, content, word] of [
  ['a file that is not valid JSON', '{"pageTitle": ', 'settings.json'],
  ['a key the tool does not know', '{"pageTitle": "Books", "font": "serif"}', 'font'],
  ['a value of the wrong kind', '{"pageTitle": 7}', 'pageTitle'],
]) {
  test(`${name} is reported in one line on the standard error`, (t) => {
    const r = check(t, content);
    assert.equal(r.code, 1);
    assert.equal(r.stdout, '');
    assert.ok(oneLine(r.stderr), r.stderr);
    assert.ok(r.stderr.startsWith('Error: ') && r.stderr.includes(word), r.stderr);
  });
}
