import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/ledger.js', import.meta.url));

test('smoke: ledger --version prints the name and version', () => {
  const out = execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.match(out, /^ledger v\d+\.\d+\.\d+\n$/);
});
