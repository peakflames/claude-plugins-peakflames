// Oracle for E5 (spending chart), automated parts only. E5 is expected to park for a person, so
// this runs only once the owner has looked and a later run has merged it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { sandbox } from './helpers.mjs';

test('one bar and one label per category of the month, in a page that loads nothing', (t) => {
  const s = sandbox(t);
  s.seed([
    ['2026-10-01', -1250, 'COFFEE SHOP', 'coffee'],
    ['2026-10-03', -4510, 'SAFEWAY #123', 'groceries'],
    ['2026-10-11', -6000, 'CITY POWER', 'utilities'],
    ['2026-10-15', -800, 'BUS FARE', 'transport'],
    ['2026-09-15', -800, 'OLD THING', 'history'],
  ]);
  const r = s.ledger(['chart', '--month', '2026-10', '--out', 'october.html']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Wrote october\.html/);
  const html = s.read('october.html');
  assert.equal((html.match(/<svg\b/g) ?? []).length, 1);
  assert.equal((html.match(/<rect\b[^>]*class="[^"]*\bbar\b[^"]*"/g) ?? []).length, 4);
  for (const [name, total] of [['coffee', '12.50'], ['groceries', '45.10'], ['utilities', '60.00'], ['transport', '8.00']]) {
    assert.ok((html.match(/<text\b[^>]*>[^<]*<\/text>/g) ?? []).some((x) => x.includes(name) && x.includes(total)), `no label for ${name} ${total}`);
  }
  assert.doesNotMatch(html, /history/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html.replaceAll('http://www.w3.org/2000/svg', ''), /https?:\/\//);
});
