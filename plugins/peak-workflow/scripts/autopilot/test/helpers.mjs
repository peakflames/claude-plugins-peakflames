// Shared fixtures for the driver tests: a throwaway copy of the ledger seed, and fake-claude
// scripts that do what a real plan, build or wrapup session leaves behind.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_DIR, run } from '../driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DRIVER = path.resolve(HERE, '..', 'driver.mjs');
export const FAKE = path.resolve(HERE, '..', 'fake-claude.mjs');
export const SEED = path.resolve(PLUGIN_DIR, '..', '..', 'scripts', 'autopilot-lab', 'fixtures', 'ledger');
export const TL = `sh "${path.join(PLUGIN_DIR, 'scripts', 'tor-lifecycle')}"`;
export const E1 = { id: 'Lg1Csv7', slug: 'csv-import', branch: 'feature/epic-Lg1Csv7-csv-import', tors: ['TOR-01-Kq7Rm2x', 'TOR-01-Zb4Nw9T', 'TOR-01-Hd3Yc8L', 'TOR-01-Vp6Js1G', 'TOR-01-Xt5Fa0M'] };

// Hermetic git: no user or system config, a fixed identity, and no nested-test-runner context.
const gitHome = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-gitcfg-'));
fs.writeFileSync(path.join(gitHome, 'gitconfig'), '');
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: path.join(gitHome, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Autopilot Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Autopilot Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
});
process.on('exit', () => fs.rmSync(gitHome, { recursive: true, force: true }));

export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * A fresh repo from the ledger seed (main + develop, no remote) and a workspace beside it whose
 * settings.json names the test double. `p.state` is the workspace; `p.runDir()` the latest run.
 */
export function makeProject(t, { config = {} } = {}) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const project = path.join(tmp, 'ledger');
  const state = path.join(tmp, 'ledger.autopilot');
  fs.cpSync(SEED, project, { recursive: true });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'seed');
  git(project, 'checkout', '-q', '-b', 'develop');
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, 'settings.json'), JSON.stringify({
    project, claudeBin: FAKE, endBy: null, diskFloorGb: 0,
    timing: { pollMs: 100, killGraceMs: 300, infraRetryMs: 0 }, ...config,
  }));
  const p = { tmp, project, state, clone: path.join(state, 'clone'), log: path.join(tmp, 'fake.log'), scenarioFile: path.join(tmp, 'scenario.json') };
  process.env.FAKE_CLAUDE_LOG = p.log;
  process.env.FAKE_CLAUDE_SCENARIO = p.scenarioFile;
  p.scenario = (s) => fs.writeFileSync(p.scenarioFile, JSON.stringify(s));
  p.calls = () => (fs.existsSync(p.log) ? fs.readFileSync(p.log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  p.steps = () => p.calls().map((c) => c.key);
  p.runName = () => fs.readFileSync(path.join(state, 'current'), 'utf8').trim();
  p.runDir = () => path.join(state, 'runs', p.runName());
  p.rel = () => `runs/${p.runName()}`; // as gate files and the report name paths
  p.dir = (id, ...parts) => path.join(p.runDir(), 'epics', id, ...parts);
  p.epic = (id) => readJson(path.join(p.runDir(), 'state.json')).queue.find((q) => q.id === id);
  // A run directory laid out by hand, as the driver leaves it mid-run (for tests that launch no driver).
  p.mockRun = (name = '20261111-220500') => {
    const dir = path.join(state, 'runs', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ integration: 'develop', queue: [{ id: E1.id, name: 'CSV import' }] }));
    fs.writeFileSync(path.join(state, 'current'), `${name}\n`);
    return dir;
  };
  p.go = (opts = {}) => run({ workspace: state, allowTestDouble: true, ...opts });
  return p;
}

/** Adds one more epic (one requirement in its own feature file) to the project, committed on develop. */
export function addEpic(project, { id, slug, name, nn, deps = [] }) {
  const tor = `TOR-${nn}-${id}`;
  const plan = path.join(project, 'docs', 'implementation-plan');
  fs.appendFileSync(path.join(plan, 'phase-1-core', 'index.md'), `| ${id} | [${name}](epic-${id}-${slug}.md) | ${deps.join(', ') || '—'} |\n`);
  fs.writeFileSync(path.join(plan, 'phase-1-core', `epic-${id}-${slug}.md`), `# Epic ${id}: ${name}

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** ${deps.join(', ') || '—'}
**Planned by:** Autopilot Test
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

${name}.

## Requirements Anchors

| TOR ID | Feature File |
|--------|--------------|
| ${tor} | \`docs/requirements/${nn}-${slug}.feature.md\` |

## Key Components

- \`src/${slug}.js\` — (create)
`);
  fs.writeFileSync(path.join(plan, 'status', `epic-${id}.md`), `status: Not Started\nowner: —\nimplemented: —\ncompleted: —\nhandoff: —\nrequirements: ${tor}\n`);
  const reqs = path.join(project, 'docs', 'requirements');
  fs.writeFileSync(path.join(reqs, `${nn}-${slug}.feature.md`), `Feature: ${Number(nn)}.0 ${name}
    As a person tracking a household budget
    I want ${name.toLowerCase()}
    So that the ledger is useful


Scenario: [${tor}] The tool shall print '${slug}' when invoked with ${slug}
    Given the user passes the commandline args '${slug}'
    When the Tool is Run
    Then the standard output should contain the string "${slug}"
    And the exit code should be 0
`);
  fs.writeFileSync(path.join(reqs, `${nn}-${slug}.feature.tracing.json`), JSON.stringify({
    feature_id: nn, feature_file: `${nn}-${slug}.feature.md`, generator: 'test',
    requirements: [{ id: tor, traces_to: { vision: [{ section: '§3 — Goals', paraphrase: name }], conops: [], claude_md: [] } }],
  }, null, 2) + '\n');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', `docs: add epic ${id}`);
  return { id, slug, branch: `feature/epic-${id}-${slug}`, tors: [tor] };
}

// ---- fake-claude scripts -----------------------------------------------------------------------

export function planText(e, { omit = [] } = {}) {
  const parts = {
    branch: `1. **Create (or verify) feature branch** — \`${e.branch}\``,
    status: '2. **Update status to "In Progress"** — edit the sidecar',
    deferral: '**Deferral gate.** If a TOR cannot be fully met, stop and use `AskUserQuestion`. Plan approval does not pre-authorize any deferral.',
    amendment: '**Amendment gate.** The helper is `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"`. Stop implementation and use `AskUserQuestion`.',
    tors: e.tors.map((t, i) => `${i + 3}. Implement and test ${t}`).join('\n'),
    assess: '- **Implementer self-assessment** — each TOR Given/When/Then',
    reconcile: '- **Reconcile spec** — re-read the Requirements Anchors table',
    mark: '- **Mark as Implemented** — edit the sidecar',
    commit: `- **Commit** — \`feat(epic-${e.id}): …\`. Do not push.`,
  };
  return `# Plan — epic ${e.id}\n\n` + Object.entries(parts).filter(([k]) => !omit.includes(k)).map(([, v]) => v).join('\n\n') + '\n';
}

/** What a planning session leaves: the empty feature branch, and the plan the hook captured. */
export const planScript = (e, opts) => ({
  actions: [{ do: 'branch', name: e.branch }, { do: 'plan', text: planText(e, opts) }],
  result: { terminal_reason: 'hook_stopped', total_cost_usd: 0.4 },
});

const handoffImplemented = (count = 0) => `# Epic handoff\n\n## What Was Built\n\nThe thing.\n\n## Deferrals\n\nCount: ${count}\n\n${count ? '| TOR ID | Unmet |\n|---|---|\n| x | y |' : 'None'}\n\n## Key Files\n`;
const handoffComplete = (counts = [0, 0, 0, 0, 0, 0]) => `# Epic complete\n\n## Deferrals\n\nCount: ${counts[0]} (undisclosed: ${counts[1]}, waived: ${counts[2]}, fixed at wrapup: ${counts[3]}, amended: ${counts[4]}, pending: ${counts[5]})\n\nNone\n\n## Counts\n`;

/** The actions of a build session that does everything the plan's closing steps require. */
export function buildActions(e, { message = `feat(epic-${e.id}): implement ${e.slug}`, testBody = '', commit = true, deferrals = 0 } = {}) {
  const a = [
    { do: 'branch', name: e.branch },
    { do: 'write', path: `src/${e.slug}.js`, content: `export const name = '${e.slug}';\n` },
    { do: 'write', path: `test/${e.slug}.test.js`, content: `import test from 'node:test';\n${e.tors.map((t) => `test('${t} is met', () => {${testBody}});`).join('\n')}\n` },
    { do: 'sidecar', set: { status: 'Implemented', owner: 'Autopilot Test', implemented: '2026-11-11', handoff: `session-handoffs/epic-${e.id}-implemented.md` } },
    { do: 'write', path: `docs/implementation-plan/session-handoffs/epic-${e.id}-implemented.md`, content: handoffImplemented(deferrals) },
  ];
  if (commit) a.push({ do: 'commit', message });
  return a;
}
export const buildScript = (e, opts) => ({ actions: buildActions(e, opts), result: { total_cost_usd: 0.3 } });

/** The actions of a wrapup session that passes: verified lines, Complete, handoff, --no-ff merge, branch deleted. */
export function wrapupActions(e, { counts, extraOnBranch = [], afterMerge = [], waived = false } = {}) {
  return [
    { do: 'checkout', name: e.branch },
    { do: 'exec', cmd: `${TL} mark ${e.id} --pass ${e.tors.join(' ')}` },
    { do: 'sidecar', set: { status: 'Complete', completed: '2026-11-11', handoff: `session-handoffs/epic-${e.id}-complete.md`, ...(waived ? { waived: `${e.tors[0]} → Lg9Zzz9` } : {}) } },
    { do: 'write', path: `docs/implementation-plan/session-handoffs/epic-${e.id}-complete.md`, content: handoffComplete(counts) },
    { do: 'commit', message: `docs(epic-${e.id}): complete` },
    { do: 'write', path: 'docs/architecture.md', content: '# Architecture\n\nRefreshed.\n' },
    { do: 'commit', message: 'docs: refresh architecture' },
    ...extraOnBranch,
    { do: 'checkout', name: 'develop' },
    { do: 'merge', branch: e.branch, message: `Merge branch '${e.branch}' into develop` },
    { do: 'exec', cmd: `git branch -q -d ${e.branch}` },
    ...afterMerge,
  ];
}
export const wrapupScript = (e, opts) => ({ actions: wrapupActions(e, opts), result: { total_cost_usd: 1.3, result: 'Verdict: PASS' } });

/** Scripts for one epic that goes straight to MERGED. */
export const happy = (e) => ({ [`${e.id}/plan`]: planScript(e), [`${e.id}/build`]: buildScript(e), [`${e.id}/verify`]: wrapupScript(e) });

export async function waitFor(fn, { timeoutMs = 20000, everyMs = 25 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try { const v = fn(); if (v) return v; } catch { /* not there yet */ }
    if (Date.now() > until) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
export const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
