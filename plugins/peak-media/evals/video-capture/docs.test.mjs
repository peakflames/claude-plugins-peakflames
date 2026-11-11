// video-capture docs (WP15): the Markdown an agent reads describes the beat() API as built and
// every flag capture.mjs accepts. No browser; safe to run alongside anything.
import { test } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT, run } from '../helpers/run.mjs';
import { CAPTURE } from './helpers/projects.mjs';

const SKILL = path.join(ROOT, 'skills', 'video-capture', 'SKILL.md');
const API = path.join(ROOT, 'skills', 'video-capture', 'references', 'storyboard-api.md');

function markdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const f = path.join(dir, name);
    if (statSync(f).isDirectory()) out.push(...markdown(f));
    else if (name.endsWith('.md')) out.push(f);
  }
  return out;
}

/** Long flags in the Options block of a --help text. */
const helpFlags = (text) => {
  const opts = text.slice(text.indexOf('\nOptions:'), text.indexOf('\nExamples:') > 0 ? text.indexOf('\nExamples:') : undefined);
  return [...new Set([...opts.matchAll(/^\s+(?:-\w, )?(--[a-z][a-z-]*)/gm)].map((m) => m[1]))];
};

test('AC-W2V-41: no removed storyboard API in Markdown under skills/ and docs/reference/', () => {
  // built from pieces so this file's own source never reads as a hit
  const re = new RegExp(['\\bsay', '\\(|wait', 'ForVoice'].join(''));
  const files = [...markdown(path.join(ROOT, 'skills')), ...markdown(path.join(ROOT, 'docs', 'reference'))];
  assert.ok(files.length > 10, `found the Markdown (${files.length} files)`);
  const hits = [];
  for (const f of files) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim()}`); });
  }
  assert.deepEqual(hits, [], `0 hits expected:\n${hits.join('\n')}`);
});

test('AC-W2V-41: every flag in capture --help (and capture signin --help, capture serve --help) is documented', () => {
  const docs = readFileSync(SKILL, 'utf8') + readFileSync(API, 'utf8');
  for (const args of [['--help'], ['signin', '--help'], ['serve', '--help']]) {
    const r = run(CAPTURE, args);
    assert.equal(r.code, 0, r.stderr);
    const flags = helpFlags(r.stdout);
    assert.ok(flags.length >= (args.length === 1 ? 20 : args[0] === 'serve' ? 2 : 3), `parsed the Options of capture ${args.join(' ')} (${flags.join(' ')})`);
    const missing = flags.filter((f) => !new RegExp(`${f}(?![a-z-])`).test(docs));
    assert.deepEqual(missing, [], `capture ${args.join(' ')}: flags not in SKILL.md or storyboard-api.md`);
  }
});
