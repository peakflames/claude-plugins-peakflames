// Shared by the resume-*.test.mjs files (split out of resume.test.mjs, one theme each): the driver CLI, gates and
// decisions, a run's next pass, and the scenario pieces more than one theme uses.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DRIVER, addEpic, buildActions, buildScript, git, planScript, readJson } from './helpers.mjs';

export const cli = (...args) => spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });
export const gate = (p, id, n = 1) => readJson(path.join(p.state, 'gates', `${id}-${n}.json`));
export function decide(p, id, answer, { n = 1, note } = {}) {
  const r = cli('decide', '--workspace', p.state, '--gate', `gates/${id}-${n}.json`, '--answer', answer, '--by', 'Pat Owner', ...(note ? ['--note', note] : []));
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.effect, 'resume'); // every decided gate resumes; there is no by-hand split
  return out;
}
/** Runs once more and returns that run's sessions only, as `<epic>/<step>` keys. */
export async function again(p, opts = {}) {
  const before = p.calls().length;
  const state = await p.go(opts);
  return { state, steps: p.steps().slice(before), calls: p.calls().slice(before) };
}
export const ask = (question, options) => ({ do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, header: 'Gate', multiSelect: false, options: options.map((label) => ({ label, description: '' })) }] } });
export const tools = (p, id, step) => fs.readFileSync(p.dir(id, step, 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).out);
export const finding = (category, severity = 'high') => ({ category, severity, evidence: 'test/rates.test.js:12', explanation: `the ${category} problem` });
export const audit = (findings) => ({ result: { total_cost_usd: 0.5, structured_output: { findings, recommend: findings.length ? 'park' : 'proceed', summary: 'canned' } } });
/** A build whose tests are red and the repair that turns them green: the fix round before the final check is spent. */
export const roundSpent = (e) => ({
  [`${e.id}/plan`]: planScript(e), [`${e.id}/build`]: buildScript(e, { testBody: " throw new Error('red'); " }), [`${e.id}/plan-fix`]: planScript(e),
  [`${e.id}/fix`]: { actions: [{ do: 'write', path: `test/${e.slug}.test.js`, content: `import test from 'node:test';\n${e.tors.map((x) => `test('${x} is met', () => {});`).join('\n')}\n` }, { do: 'commit', message: `fix(epic-${e.id}): green` }] },
});
export const merged = (p, tip) => spawnSync('git', ['merge-base', '--is-ancestor', tip, 'develop'], { cwd: p.clone }).status === 0;
/** A catch-up session as a real one runs it: merge develop (it stops on the clash), settle the file, commit the merge. */
export const settle = (file, content) => ({ actions: [{ do: 'exec', cmd: 'git merge --no-ff develop -m "Merge develop into the epic branch" || true' }, { do: 'write', path: file, content }, { do: 'commit', message: 'Merge develop into the epic branch' }] });
export const DEFERRAL = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];

/** An epic with one operator-observed requirement: preflight marks it human-check. */
export function addLookEpic(p, spec = { id: 'Lg5Chr8', slug: 'chart', name: 'Spending chart', nn: '05' }) {
  const e = addEpic(p.project, spec);
  const file = path.join(p.project, 'docs', 'requirements', `${spec.nn}-${spec.slug}.feature.md`);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^(Scenario: .*)$/m, '$1\n    # Verification: operator-observed'));
  git(p.project, 'commit', '-qam', 'docs: the chart is checked by a person');
  return e;
}
// As a real build leaves it: the operator-observed requirement is named only by its checklist, not by a test under test/.
export const buildWithManual = (e) => ({ actions: [...buildActions(e, { commit: false }), { do: 'write', path: `test/${e.slug}.test.js`, content: "import test from 'node:test';\ntest('the chart command exists', () => {});\n" }, { do: 'write', path: `tests/manual/${e.tors[0]}.md`, content: `# Manual check — ${e.tors[0]}\n\n1. Open chart.html\n` }, { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` }] });

// What the session is really given: `claude` keeps only the last `--append-system-prompt-file`.
export const appended = (call) => { const i = call.argv.lastIndexOf('--append-system-prompt-file'); return i < 0 ? '' : fs.readFileSync(call.argv[i + 1], 'utf8'); };

export function addScreenEpic(p) {
  const ui = addEpic(p.project, { id: 'Lg6Scr1', slug: 'dashboard', name: 'Dashboard', nn: '06' });
  fs.appendFileSync(path.join(p.project, 'docs', 'implementation-plan', 'phase-1-core', `epic-${ui.id}-${ui.slug}.md`), '\n## Screens\n\n- S-01 Home\n');
  const claude = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace('**Project type:** CLI tool', '**Project type:** Web app'));
  git(p.project, 'commit', '-qam', 'docs: the dashboard has a screen');
  const pictures = [{ do: 'exec', cmd: "mkdir -p .autopilot/look && printf 'PNG' > .autopilot/look/home.png" }, { do: 'exec', cmd: "printf '%s\\n' '- home.png — the home page — TOR-06-Lg6Scr1' > .autopilot/look/index.md" }];
  return { ui, build: { actions: [...buildActions(ui), ...pictures] } };
}
export const setAutoContinue = (p, n) => { const f = path.join(p.runDir(), 'config.json'); fs.writeFileSync(f, JSON.stringify({ ...readJson(f), autoContinue: n })); };
