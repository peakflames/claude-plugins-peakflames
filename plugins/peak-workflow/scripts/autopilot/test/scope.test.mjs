// The scope check on a build: lockfiles and CLAUDE.md. Against the fake `claude`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { E1, addEpic, buildActions, happy, makeProject, planScript, readJson, wrapupScript } from './helpers.mjs';

const scopeOf = (p, id, n = 1) => readJson(p.dir(id, `check-build-${n}.json`)).checks.find((c) => c.name === 'scope');
/** A build that also writes the given files before its commit. */
const buildWith = (e, files) => ({ actions: [...buildActions(e, { commit: false }), ...Object.entries(files).map(([file, content]) => ({ do: 'write', path: file, content })), { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }], result: { total_cost_usd: 0.3 } });
const scenario = (e, files) => ({ ...happy(e), [`${e.id}/build`]: buildWith(e, files) });
const claudeMd = (p) => fs.readFileSync(path.join(p.project, 'CLAUDE.md'), 'utf8');

test('a lockfile that changes with the dependency list beside it is in scope', async (t) => {
  const p = makeProject(t);
  const pkg = JSON.parse(fs.readFileSync(path.join(p.project, 'package.json'), 'utf8'));
  p.scenario(scenario(E1, { 'package.json': `${JSON.stringify({ ...pkg, devDependencies: { left: '1.0.0' } }, null, 2)}\n`, 'package-lock.json': '{ "lockfileVersion": 3 }\n' }));
  await p.go();
  assert.equal(scopeOf(p, E1.id).pass, true);
  assert.equal(p.epic(E1.id).state, 'MERGED');
});

test('a lockfile that changes on its own is still out of scope', async (t) => {
  const p = makeProject(t);
  p.scenario(scenario(E1, { 'package-lock.json': '{ "lockfileVersion": 3 }\n' }));
  await p.go();
  assert.deepEqual(scopeOf(p, E1.id).evidence, ['package-lock.json: lockfile changed but no package.json changed with it, and it is not named in config']);
});

test('the first epic of the plan may change CLAUDE.md where it settles setup, run and tests; the owner is shown it at a look', async (t) => {
  const p = makeProject(t);
  p.scenario(scenario(E1, { 'CLAUDE.md': claudeMd(p).replace('- **Tests:** `node --test`', '- **Setup:** `npm ci`\n- **Tests:** `node --test`') }));
  await p.go();
  assert.equal(scopeOf(p, E1.id).pass, true);
  // Not a UI epic, yet it stops for the owner: a change to the instructions file is never merged unseen.
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const gate = readJson(path.join(p.state, 'gates', `${E1.id}-1.json`));
  assert.equal(gate.kind, 'human-check');
  assert.deepEqual(gate.claudeMd.sections, ['Local Environment']);
  assert.deepEqual(gate.claudeMd.lines, ['+- **Setup:** `npm ci`']);
  assert.match(gate.question, /changed the project's instructions file \(CLAUDE\.md\), in: Local Environment/);
});

test('the first epic may not change CLAUDE.md anywhere else', async (t) => {
  const p = makeProject(t);
  p.scenario(scenario(E1, { 'CLAUDE.md': claudeMd(p).replace('needs no\nbank password', 'needs any\nbank password') }));
  await p.go();
  assert.deepEqual(scopeOf(p, E1.id).evidence, ['CLAUDE.md: changed in Project Overview; the first epic may change only Tech Stack, Local Environment, Verification & Quality Gates']);
});

test('a later epic may change only the Test directories line of CLAUDE.md', async (t) => {
  const p = makeProject(t, { config: { queue: ['Lg2Sum8'] } });
  const E2 = { id: 'Lg2Sum8', slug: 'summary', branch: 'feature/epic-Lg2Sum8-summary', tors: ['TOR-02-Lg2Sum8'] };
  addEpic(p.project, { id: E2.id, slug: E2.slug, name: 'Summary', nn: '02' });
  p.scenario({ [`${E2.id}/plan`]: planScript(E2), [`${E2.id}/build`]: buildWith(E2, { 'CLAUDE.md': claudeMd(p).replace('- **Tests:** `node --test`', '- **Setup:** `npm ci`\n- **Tests:** `node --test`') }), [`${E2.id}/verify`]: wrapupScript(E2) });
  await p.go();
  assert.deepEqual(scopeOf(p, E2.id).evidence, ['CLAUDE.md: changed beyond the Test directories line']);
});
