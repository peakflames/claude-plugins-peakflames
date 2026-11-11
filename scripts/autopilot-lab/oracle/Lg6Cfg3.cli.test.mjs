// Oracle for E6 (help and settings).
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { sandbox } from './helpers.mjs';

test('--help goes to stdout with exit 0; no arguments is usage on stderr with exit 2; --version still works', (t) => {
  const s = sandbox(t);
  const help = s.ledger(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^Usage: ledger/);
  assert.match(help.stdout, /^ {2}config\b/m);
  assert.match(help.stdout, /--version/);
  assert.equal(help.stderr, '');
  const none = s.ledger([]);
  assert.equal(none.code, 2);
  assert.equal(none.stdout, '');
  assert.match(none.stderr, /Usage: ledger/);
  const v = s.ledger(['--version']);
  assert.equal(v.code, 0);
  assert.match(v.stdout, /^ledger v\d+\.\d+\.\d+\n$/);
});

test('config: a valid file is confirmed', (t) => {
  const s = sandbox(t);
  s.write('ok.ledgerrc', '{"currency": "GBP"}');
  const ok = s.ledger(['config'], { LEDGERRC: path.join(s.dir, 'ok.ledgerrc') });
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stdout, /Settings OK/);
});

test('config: invalid JSON and an unknown key are each one error line, exit 1', (t) => {
  const s = sandbox(t);
  s.write('broken.ledgerrc', '{"currency": ');
  const broken = s.ledger(['config'], { LEDGERRC: path.join(s.dir, 'broken.ledgerrc') });
  assert.equal(broken.code, 1);
  assert.equal(broken.stdout, '');
  assert.equal(broken.stderr.trim().split('\n').length, 1, broken.stderr);
  assert.match(broken.stderr, /^Error: .*broken\.ledgerrc/);
  s.write('extra.ledgerrc', '{"currency": "EUR", "theme": "dark"}');
  const extra = s.ledger(['config'], { LEDGERRC: path.join(s.dir, 'extra.ledgerrc') });
  assert.equal(extra.code, 1);
  assert.equal(extra.stderr.trim().split('\n').length, 1, extra.stderr);
  assert.match(extra.stderr, /^Error: .*theme/);
});
