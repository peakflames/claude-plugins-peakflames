// DEC-53 platform subset: the setup instructions every skill and the README give run on every OS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/run.mjs';

/** Every .md under dir. */
function markdown(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...markdown(p)); else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

test('AC-XP-05: no skill, skill reference or README names setup.sh or runs setup through bash; every setup line is node …/setup.mjs', () => {
  const docs = [...markdown(path.join(ROOT, 'skills')), path.join(ROOT, 'README.md')];
  assert.ok(docs.length > 10, `read ${docs.length} files`);
  const bad = [], good = [];
  for (const f of docs) {
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      const at = `${path.relative(ROOT, f)}:${i + 1}`;
      if (/setup\.sh\b|\bbash\b[^\n]*setup/.test(l)) bad.push(`${at}: ${l.trim()}`);
      if (/node "?[^"\s]*scripts\/setup\.mjs/.test(l)) good.push(at);
    });
  }
  assert.deepEqual(bad, [], 'setup.sh / bash setup lines');
  assert.ok(good.length >= 5, `setup lines run setup.mjs through node (${good.join(', ')})`);
  assert.ok(!existsSync(path.join(ROOT, 'scripts', 'setup.sh')), 'scripts/setup.sh is gone');
});
