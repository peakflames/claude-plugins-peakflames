// A removal epic (plan-project 3C) with no requirement of its own: autopilot runs it, and its done-when is mechanical
// (no test or source still cites what its Change Record retired). Against the fake `claude`. (Pilot Light, 2026-11-27)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR, loadConfig, preflight, retiredTors } from '../driver.mjs';
import { git, makeProject, planScript, readJson } from './helpers.mjs';

const RM = { id: 'Rm0Prt4', slug: 'remove-port-option', branch: 'feature/epic-Rm0Prt4-remove-port-option', tors: [] };
const CR = 'CR-Rm0Old1';
const OLD = 'TOR-01-Old0001';

/** A retire record for one requirement whose code is still there, a test citing it, and the removal epic that takes it out. */
function addRemoval(project) {
  const changes = path.join(project, 'docs', 'requirements', 'changes');
  fs.mkdirSync(changes, { recursive: true });
  fs.writeFileSync(path.join(changes, `2026-11-27-${CR.slice(3)}.toml`), `id = "${CR}"
date = 2026-11-27
kind = "retire"
title = "The --port option is withdrawn"
reason = """
The app picks its own port."""
approved_via = "docs-branch"
approved_by = "Autopilot Test"
refs = []
keywords = ["--port"]
removal = "code"

[[changes]]
tor = "${OLD}"
feature_file = "01-import.feature.md"
fingerprint = "000000000000"
traced_to = ["vision §6"]
text = """
Scenario: [${OLD}] The tool shall listen on the port given by --port
    Given a free port
    When the tool is started with --port
    Then it should listen on that port"""
`);
  fs.writeFileSync(path.join(project, 'test', 'old-port.test.js'), `import test from 'node:test';\ntest('${OLD} listens on --port', () => {});\n`);
  const plan = path.join(project, 'docs', 'implementation-plan');
  fs.appendFileSync(path.join(plan, 'phase-1-core', 'index.md'), `| ${RM.id} | [Remove the --port option](epic-${RM.id}-${RM.slug}.md) | — |\n`);
  fs.writeFileSync(path.join(plan, 'phase-1-core', `epic-${RM.id}-${RM.slug}.md`), `# Epic ${RM.id}: Remove the --port option

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** —
**Planned by:** Autopilot Test
**Planned:** 2026-11-27
**Plan branch:** docs/ledger-baseline

---

## Description

Take the retired --port option out of the code.

## Requirements Anchors

None — a removal epic; see Removal.

## Removal

**Retires:** ${CR} — The --port option is withdrawn (2026-11-27)
**Retired requirements:** ${OLD}
**Code to remove:** test/old-port.test.js
**Done when:** \`tor-lifecycle sweep ${OLD}\` reports nothing and the code above is gone.

## Key Components

- \`test/old-port.test.js\` — (delete)
`);
  fs.writeFileSync(path.join(plan, 'status', `epic-${RM.id}.md`), `status: Not Started\nowner: —\nimplemented: —\ncompleted: —\nhandoff: —\nrequirements:\nretires: ${CR}\n`);
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'docs: a removal epic for the --port option');
}

const handoff = (kind) => kind === 'implemented'
  ? '# Epic handoff\n\n## What Was Built\n\nRemoved --port.\n\n## Deferrals\n\nCount: 0\n\nNone\n\n## Key Files\n'
  : '# Epic complete\n\n## Deferrals\n\nCount: 0 (undisclosed: 0, waived: 0, fixed at wrapup: 0, amended: 0, pending: 0)\n\nNone\n\n## Counts\n';
const build = (removes) => ({
  actions: [
    { do: 'branch', name: RM.branch },
    ...(removes ? [{ do: 'rm', path: 'test/old-port.test.js' }] : [{ do: 'write', path: 'src/port.js', content: '// the option is gone\n' }]),
    { do: 'sidecar', set: { status: 'Implemented', owner: 'Autopilot Test', implemented: '2026-11-27', handoff: `session-handoffs/epic-${RM.id}-implemented.md` } },
    { do: 'write', path: `docs/implementation-plan/session-handoffs/epic-${RM.id}-implemented.md`, content: handoff('implemented') },
    { do: 'commit', message: `feat(epic-${RM.id}): remove the --port option` },
  ],
  result: { total_cost_usd: 0.3 },
});
const verify = {
  actions: [
    { do: 'checkout', name: RM.branch },
    { do: 'sidecar', set: { status: 'Complete', completed: '2026-11-27', handoff: `session-handoffs/epic-${RM.id}-complete.md` } },
    { do: 'write', path: `docs/implementation-plan/session-handoffs/epic-${RM.id}-complete.md`, content: handoff('complete') },
    { do: 'commit', message: `docs(epic-${RM.id}): complete` },
    { do: 'checkout', name: 'develop' },
    { do: 'merge', branch: RM.branch, message: `Merge branch '${RM.branch}' into develop` },
    { do: 'exec', cmd: `git branch -q -d ${RM.branch}` },
  ],
  result: { total_cost_usd: 1.3, result: 'Verdict: PASS' },
};

test('preflight: a removal epic with no requirement of its own is eligible, with its done-when as the reason; one whose record names nothing is skipped', (t) => {
  const p = makeProject(t);
  addRemoval(p.project);
  assert.deepEqual(retiredTors(p.project, [CR]), [OLD]);
  const pre = preflight(p.project, loadConfig(p.state, { project: p.project }), { pluginDir: PLUGIN_DIR });
  const e = pre.epics.find((x) => x.id === RM.id);
  assert.equal(e.eligibility, 'eligible', e.reasons.join('; '));
  assert.deepEqual(e.retires, [CR]);
  assert.match(e.reasons.join('; '), /a removal epic \(retires CR-Rm0Old1\): done when nothing cites the retired requirements and their code is gone/);

  const sidecar = path.join(p.project, 'docs', 'implementation-plan', 'status', `epic-${RM.id}.md`);
  fs.writeFileSync(sidecar, fs.readFileSync(sidecar, 'utf8').replace(CR, 'CR-Nope000'));
  const pre2 = preflight(p.project, loadConfig(p.state, { project: p.project }), { pluginDir: PLUGIN_DIR });
  assert.equal(pre2.epics.find((x) => x.id === RM.id).eligibility, 'skip');
  assert.match(pre2.epics.find((x) => x.id === RM.id).reasons.join('; '), /names no retired requirement/);
});

test('a removal epic runs: a build that leaves a test citing the retired requirement fails the removal check and is repaired once; it then merges', async (t) => {
  const p = makeProject(t, { config: { queue: [RM.id] } });
  addRemoval(p.project);
  p.scenario({
    [`${RM.id}/plan`]: planScript(RM),
    [`${RM.id}/build`]: build(false),
    // Deleting an existing test is the referee's R7: the session records why, for a person to read.
    [`${RM.id}/fix`]: { actions: [
      { do: 'write', path: '.autopilot/test-changes.jsonl', append: true, content: `${JSON.stringify({ path: 'test/old-port.test.js', reason: `it only proved ${OLD}, which ${CR} retired` })}\n` },
      { do: 'rm', path: 'test/old-port.test.js' },
      { do: 'commit', message: `fix(epic-${RM.id}): delete the test of the retired --port option` },
    ] },
    [`${RM.id}/verify`]: verify,
  });
  await p.go();
  const all1 = readJson(p.dir(RM.id, 'check-build-1.json')).checks;
  const errOf = (s) => { const f = p.dir(RM.id, s, 'stderr.log'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').slice(0, 1500) : null; };
  const why = JSON.stringify({ state: p.epic(RM.id).state, reason: p.epic(RM.id).reason, fixErr: errOf('fix-1'), steps: p.steps() });
  const first = all1.find((c) => c.name === 'removal');
  assert.ok(fs.existsSync(p.dir(RM.id, 'check-build-2.json')), why);
  assert.equal(first.pass, false);
  assert.deepEqual(first.evidence.stillCited, [OLD]);
  const second = readJson(p.dir(RM.id, 'check-build-2.json')).checks.find((c) => c.name === 'removal');
  assert.equal(second.pass, true, JSON.stringify(second.evidence));
  assert.equal(p.epic(RM.id).state, 'MERGED', p.epic(RM.id).reason);
  assert.ok(!fs.existsSync(path.join(p.clone, 'test', 'old-port.test.js')));
});
