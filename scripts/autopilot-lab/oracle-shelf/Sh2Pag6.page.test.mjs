// Oracle for E2 (reading page), automated parts only. E2 is expected to park for a person, so this
// runs only once the owner has looked and a later run has merged it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { sandbox } from './helpers.mjs';

test('the page names every book and author, shows a title as typed, and loads nothing', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474], ['Piranesi', 'Susanna Clarke', 250, '2026-09-06'], ['Salt & Pepper <2nd ed.>', 'A. Cook', 90]]);
  const r = s.shelf(['page', '--out', 'list.html']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Wrote list\.html/);
  const html = s.read('list.html');
  for (const word of ['Emma', 'Jane Austen', 'Piranesi', 'Susanna Clarke', 'A. Cook', 'Salt &amp; Pepper &lt;2nd ed.&gt;']) assert.ok(html.includes(word), `missing: ${word}`);
  assert.ok(!html.includes('<2nd ed.>'));
  assert.doesNotMatch(html, /<script/i);
  assert.ok(!html.includes('://'));
});
