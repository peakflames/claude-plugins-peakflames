// The scope check on a build: lockfiles and CLAUDE.md. Against the fake `claude`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { E1, addEpic, buildActions, git, happy, makeProject, planScript, readJson, wrapupScript } from './helpers.mjs';
import { settlesUndecided } from '../driver.mjs';

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
  assert.deepEqual(scopeOf(p, E1.id).evidence, ['CLAUDE.md: changed in Project Overview; the first epic may change only Tech Stack, Local Environment, Verification & Quality Gates, and elsewhere only a value still to decide']);
});

/** The project with a value still to decide in its Security Baseline, where setup writes one. */
function undecided(p) {
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, claudeMd(p).replace('## Security Baseline\n', '## Security Baseline\n\n- **Secrets store:** TBD — set by the walking-skeleton epic\n'));
  git(p.project, 'commit', '-qam', 'docs: the secrets store is not decided yet');
}

test('values still to decide: the walking skeleton runs and may settle them in any section, and an independent epic runs too, in a full run and a provisional one (owner, 2026-11-25)', async (t) => {
  for (const mode of ['full', 'provisional']) {
    const p = makeProject(t, { config: { mode, attended: false } }); // the owner is away: a look does not stop the run
    const free = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
    undecided(p);
    const settled = claudeMd(p).replace('- **Secrets store:** TBD — set by the walking-skeleton epic', '- **Secrets store:** the `.env` file, never committed');
    p.scenario({ ...scenario(E1, { 'CLAUDE.md': settled }), ...happy(free) });
    await p.go({ queue: [E1.id, free.id] });
    assert.equal(scopeOf(p, E1.id).pass, true, `${mode}: ${JSON.stringify(scopeOf(p, E1.id).evidence)}`);
    assert.equal(p.epic(free.id).state, 'MERGED', `${mode}: the independent epic is not held back`);
    if (mode === 'full') {
      // A change to the instructions file is shown to the owner before it merges, as for any skeleton.
      assert.equal(p.epic(E1.id).state, 'PARKED', p.epic(E1.id).reason);
      const gate = readJson(path.join(p.state, 'gates', `${E1.id}-1.json`));
      assert.deepEqual([gate.kind, gate.claudeMd.sections], ['human-check', ['Security Baseline']]);
    } else {
      assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
      assert.deepEqual(p.epic(E1.id).unlooked.claudeMd.sections, ['Security Baseline'], 'kept and listed for the owner');
    }
  }
});

test('the walking skeleton may only settle a value there: another line in that section is still out of scope', async (t) => {
  const p = makeProject(t);
  undecided(p);
  const more = claudeMd(p).replace('- **Secrets store:** TBD — set by the walking-skeleton epic', '- **Secrets store:** the `.env` file\n- **Also:** anything goes');
  p.scenario(scenario(E1, { 'CLAUDE.md': more }));
  await p.go();
  assert.deepEqual(scopeOf(p, E1.id).evidence, ['CLAUDE.md: changed in Security Baseline; the first epic may change only Tech Stack, Local Environment, Verification & Quality Gates, and elsewhere only a value still to decide']);
});

test('settlesUndecided: each undecided line kept, replaced in place by one line, or dropped; anything else moved, doubled or added is not settling', () => {
  const tbd = '- **Store:** TBD — set by the walking-skeleton epic';
  const before = `## Security Baseline\nrule a\n${tbd}\nrule b\n**Not decided yet:** CI\n## Next\n`;
  const after = (body) => `## Security Baseline\n${body}\n## Next\n`;
  const ok = (body) => settlesUndecided(before, after(body), 'Security Baseline');
  assert.equal(ok('rule a\n- **Store:** the .env file\nrule b\n**Not decided yet:** CI'), true, 'one replaced in place');
  assert.equal(ok('rule a\nrule b'), true, 'both dropped');
  assert.equal(ok('rule a\n- **Store:** the .env file\nrule b\n- **CI:** GitHub Actions'), true, 'both replaced');
  for (const [body, why] of [
    ['rule b\n- **Store:** the .env file\nrule a\n**Not decided yet:** CI', 'reordered'],
    ['rule a\n- **Store:** the .env file\nrule b\nrule b\n**Not decided yet:** CI', 'a rule doubled'],
    ['rule a\n- **Store:** the .env file\n- **Also:** more\nrule b\n**Not decided yet:** CI', 'two lines for one'],
    ['rule a\n- **Store:** the .env file\n\nrule b\n**Not decided yet:** CI', 'a blank line added'],
    ['- **Store:** the .env file\nrule b\n**Not decided yet:** CI', 'a rule dropped'],
    [`rule a\n${tbd}\nrule b\n**Not decided yet:** CI`, 'nothing settled'],
  ]) assert.equal(ok(body), false, why);
});

test('a later epic may change only the Test directories line of CLAUDE.md', async (t) => {
  const p = makeProject(t, { config: { queue: ['Lg2Sum8'] } });
  const E2 = { id: 'Lg2Sum8', slug: 'summary', branch: 'feature/epic-Lg2Sum8-summary', tors: ['TOR-02-Lg2Sum8'] };
  addEpic(p.project, { id: E2.id, slug: E2.slug, name: 'Summary', nn: '02' });
  p.scenario({ [`${E2.id}/plan`]: planScript(E2), [`${E2.id}/build`]: buildWith(E2, { 'CLAUDE.md': claudeMd(p).replace('- **Tests:** `node --test`', '- **Setup:** `npm ci`\n- **Tests:** `node --test`') }), [`${E2.id}/verify`]: wrapupScript(E2) });
  await p.go();
  assert.deepEqual(scopeOf(p, E2.id).evidence, ['CLAUDE.md: changed beyond the Test directories line']);
});
