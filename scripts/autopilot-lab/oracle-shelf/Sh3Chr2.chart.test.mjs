// Oracle for E3 (pages chart), automated parts only. E3 is expected to park for a person, so this
// runs only once the owner has looked and a later run has merged it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { sandbox } from './helpers.mjs';

test('one bar and one label per month with a finished book, in a page that loads nothing', (t) => {
  const s = sandbox(t);
  s.seed([
    ['Emma', 'Jane Austen', 474, '2026-07-30'],
    ['Piranesi', 'Susanna Clarke', 250, '2026-09-06'],
    ['Dune', 'Frank Herbert', 412, '2026-09-21'],
    ['Middlemarch', 'George Eliot', 880],
    ['Persuasion', 'Jane Austen', 249, '2026-10-02'],
  ]);
  const r = s.shelf(['chart', '--out', 'pages.html']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Wrote pages\.html/);
  const html = s.read('pages.html');
  assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
  assert.equal((html.match(/<rect\b[^>]*class="[^"]*\bbar\b[^"]*"/g) ?? []).length, 3);
  const texts = (html.match(/<text\b[^>]*>[\s\S]*?<\/text>/g) ?? []).map((x) => x.replace(/<[^>]+>/g, ' '));
  for (const [month, pages] of [['2026-07', '474'], ['2026-09', '662'], ['2026-10', '249']]) assert.ok(texts.some((x) => x.includes(month) && x.includes(pages)), `no label for ${month} ${pages}`);
  assert.doesNotMatch(html, /880/);
  assert.doesNotMatch(html, /<script/i);
  assert.ok(!html.replace(/xmlns="[^"]*"/g, '').includes('://'));
});
