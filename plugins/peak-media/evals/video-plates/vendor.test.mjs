// Vendored HyperFrames references (DEC-07): AC-VND-01 (map <-> tree), AC-VND-02 (no telemetry, licence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/run.mjs';

const VENDOR = path.join(ROOT, 'vendor', 'hyperframes');
const MAP = path.join(ROOT, 'skills', 'video-plates', 'references', 'vendored-map.md');
const walk = (d) => readdirSync(d).flatMap((e) => {
  const p = path.join(d, e);
  return statSync(p).isDirectory() ? [p, ...walk(p)] : [p];
});

export function mapPaths(md = readFileSync(MAP, 'utf8')) {
  return [...new Set([...md.matchAll(/`(vendor\/hyperframes\/[^`\s]+)`/g)].map((m) => m[1].replace(/\/$/, '')))];
}

test('AC-VND-01: every path listed in vendored-map.md exists', () => {
  const paths = mapPaths();
  assert.ok(paths.length >= 20, `map lists ${paths.length} paths`);
  const missing = paths.filter((p) => !existsSync(path.join(ROOT, p)));
  assert.deepEqual(missing, []);
});

test('AC-VND-01: every vendor folder is referenced by vendored-map.md (no orphans)', () => {
  const paths = mapPaths();
  const dirs = walk(VENDOR).filter((p) => statSync(p).isDirectory()).map((p) => path.relative(ROOT, p).split(path.sep).join('/'));
  assert.ok(dirs.length >= 6);
  const orphans = dirs.filter((d) => !paths.some((p) => p === d || p.startsWith(`${d}/`)));
  assert.deepEqual(orphans, []);
  for (const s of ['hyperframes', 'hyperframes-cli', 'slideshow', 'motion-doctrine', 'cut-the-curve', 'seam-craft']) {
    assert.ok(dirs.includes(`vendor/hyperframes/${s}`), `${s} vendored`);
  }
});

test('AC-VND-01: the map tells the agent to Read runtimes.md before the first plate', () => {
  const md = readFileSync(MAP, 'utf8');
  assert.match(md, /Read `vendor\/hyperframes\/hyperframes\/references\/runtimes\.md`/);
  const skill = readFileSync(path.join(ROOT, 'skills', 'video-plates', 'SKILL.md'), 'utf8');
  assert.match(skill, /runtimes\.md/);
});

test('AC-VND-02: no `hyperframes events` telemetry line anywhere in the vendor tree; LICENSE is present', () => {
  const hits = walk(VENDOR).filter((p) => statSync(p).isFile() && /hyperframes events/.test(readFileSync(p, 'latin1')));
  assert.deepEqual(hits.map((p) => path.relative(ROOT, p)), []);
  const lic = path.join(VENDOR, 'LICENSE');
  assert.ok(existsSync(lic), 'vendor/hyperframes/LICENSE exists');
  assert.match(readFileSync(lic, 'utf8'), /Apache License\s+Version 2\.0/);
  assert.ok(existsSync(path.join(VENDOR, 'CREDITS.md')), 'CREDITS.md exists');
});

test('AC-VND-02: vendored skills are references, not registered skills (no SKILL.md under vendor/)', () => {
  const skills = walk(VENDOR).filter((p) => path.basename(p) === 'SKILL.md');
  assert.deepEqual(skills.map((p) => path.relative(ROOT, p)), []);
  const refs = walk(VENDOR).filter((p) => path.basename(p) === 'SKILL.reference.md');
  assert.equal(refs.length, 6);
});
