// Oracle for E1 (add, list, finish).
import assert from 'node:assert/strict';
import test from 'node:test';
import { oneLine, sandbox } from './helpers.mjs';

test('add creates the list and stores the book as typed; a second book goes after it', (t) => {
  const s = sandbox(t);
  let r = s.shelf(['add', 'The Left Hand of Darkness', '--author', 'Ursula K. Le Guin', '--pages', '300']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Added The Left Hand of Darkness/);
  r = s.shelf(['add', 'Emma', '--author', 'Jane Austen', '--pages', '474']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(s.shelfJson().books, [
    { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', pages: 300, finished: null },
    { title: 'Emma', author: 'Jane Austen', pages: 474, finished: null },
  ]);
});

test('a title already on the list is refused in one line and nothing changes', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474]]);
  const before = s.read('shelf.json');
  const r = s.shelf(['add', 'Emma', '--author', 'J. Austen', '--pages', '480']);
  assert.equal(r.code, 1);
  assert.ok(oneLine(r.stderr), r.stderr);
  assert.match(r.stderr, /^Error: .*Emma/);
  assert.deepEqual(JSON.parse(s.read('shelf.json')), JSON.parse(before));
});

test('list numbers the books in the order added, with the date beside a finished one', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474], ['Piranesi', 'Susanna Clarke', 250, '2026-09-06'], ['Dune', 'Frank Herbert', 412]]);
  const r = s.shelf(['list']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, '1. Emma — Jane Austen\n2. Piranesi — Susanna Clarke (finished 2026-09-06)\n3. Dune — Frank Herbert\n');
});

test('finish records the date on the numbered book only; a number not on the list is one error line', (t) => {
  const s = sandbox(t);
  s.seed([['Emma', 'Jane Austen', 474], ['Dune', 'Frank Herbert', 412]]);
  let r = s.shelf(['finish', '1', '--on', '2026-10-02']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Finished Emma/);
  assert.deepEqual(s.shelfJson().books.map((b) => b.finished), ['2026-10-02', null]);
  const before = s.read('shelf.json');
  r = s.shelf(['finish', '9', '--on', '2026-10-03']);
  assert.equal(r.code, 1);
  assert.ok(oneLine(r.stderr), r.stderr);
  assert.match(r.stderr, /^Error: .*9/);
  assert.equal(s.read('shelf.json'), before);
});
