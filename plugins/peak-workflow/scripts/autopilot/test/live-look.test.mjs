// Live look (autopilot-poc-plan.md §10 P3.5 "Before P4"): one real verify session — a real
// `/peak-workflow:wrapup-epic` on Opus — on an epic with an operator-observed requirement whose
// human-check gate the owner has already answered "Looks right". Plan, build and audit stay on
// fake-claude; the build it leaves is a real, working one, so the verifier has something to pass.
// It shows whether the owner's recorded look carries a real wrapup through to the merge: hook R8
// answers Step 2.0 with it, and nothing else in the skill stops to ask a person.
// This calls a model (about $1.50), so it runs only on request:
//   AUTOPILOT_LIVE=1 node --test plugins/peak-workflow/scripts/autopilot/test/live-look.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS } from '../driver.mjs';
import { DRIVER, FAKE, addEpic, buildActions, git, makeProject, planScript, readJson } from './helpers.mjs';

const LIVE = process.env.AUTOPILOT_LIVE === '1';
const opts = { skip: LIVE ? false : 'set AUTOPILOT_LIVE=1 to run a real verify session', timeout: 1800000 };
const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

const INDEX = `import { readFileSync } from 'node:fs';
import { chart } from './chart.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const NAME = 'ledger';
export const VERSION = pkg.version;

/**
 * Run the CLI. Returns the process exit code:
 * 0 success, 1 operational failure, 2 invalid invocation.
 */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  if (argv[0] === '--version') {
    io.stdout.write(\`\${NAME} v\${VERSION}\\n\`);
    return 0;
  }
  if (argv[0] === 'chart') return chart(io);
  io.stderr.write(\`Error: unknown command: \${argv[0] ?? '(none)'}. Try 'ledger --version'.\\n\`);
  return 2;
}
`;
const CHART = `/** The chart command: prints the word 'chart' and succeeds. */
export function chart(io) {
  io.stdout.write('chart\\n');
  return 0;
}
`;
const testFile = (tor) => `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/ledger.js', import.meta.url));

// ${tor}: Given the args 'chart', When the tool is run, Then stdout contains "chart" and the exit code is 0.
test('${tor} the tool prints chart when invoked with chart', () => {
  const r = spawnSync(process.execPath, [bin, 'chart'], { encoding: 'utf8' });
  assert.ok(r.stdout.includes('chart'));
  assert.equal(r.status, 0);
});
`;
const checklist = (tor) => `# Manual check — ${tor}

The tool shall print 'chart' when invoked with chart. This requirement is operator-observed: a
person runs the command and looks at the terminal.

1. **Given** a terminal in the project root.
2. **When** you run \`node bin/ledger.js chart\`.
3. **Then** you should see the single word \`chart\` printed, and \`echo $?\` should print \`0\`.
`;
const handoff = (e) => `# Epic ${e.id} (${e.slug}) — Spending chart: implemented

## What Was Built

The \`chart\` command (\`src/chart.js\`, routed from \`src/index.js\`): it prints \`chart\` and exits 0.

## TOR Coverage (self-assessment)

| TOR ID | Verdict | Evidence |
|---|---|---|
| ${e.tors[0]} | PASS (operator-observed pending) | \`test/chart.test.js\` (automated part), \`tests/manual/${e.tors[0]}.md\` (checklist) |

## Deferrals

Count: 0

None

## Quality Gates

- Tests: \`node --test\` — pass
- Run the tool: \`node bin/ledger.js --version\` → \`ledger v0.1.0\`

## Key Files

- \`src/chart.js\`, \`src/index.js\`, \`test/chart.test.js\`, \`tests/manual/${e.tors[0]}.md\`
`;

test('live look: a real wrapup on an operator-observed epic uses the owner\'s recorded look and reaches the merge', opts, async (t) => {
  // One binary for every role: the real `claude` for the verifier, fake-claude for the rest.
  const p = makeProject(t);
  const bin = path.join(p.tmp, 'claude-mixed');
  fs.writeFileSync(bin, ['#!/bin/sh', 'if [ "$AUTOPILOT_ROLE" = "verifier" ]; then exec claude "$@"; fi', `exec "${process.execPath}" "${FAKE}" "$@"`, ''].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(p.state, 'settings.json'), JSON.stringify({
    ...readJson(path.join(p.state, 'settings.json')), claudeBin: bin, humanCheck: { Lg5Chr8: 'node bin/ledger.js chart' },
    budgets: { verify: { wallMin: 25, turns: 150, usd: 5, model: 'opus' } }, timing: { pollMs: 2000, killGraceMs: 5000, infraRetryMs: 0 },
  }));
  const e = addEpic(p.project, { id: 'Lg5Chr8', slug: 'chart', name: 'Spending chart', nn: '05' });
  const feature = path.join(p.project, 'docs', 'requirements', '05-chart.feature.md');
  fs.writeFileSync(feature, fs.readFileSync(feature, 'utf8').replace(/^(Scenario: .*)$/m, '$1\n    # Verification: operator-observed'));
  git(p.project, 'commit', '-qam', 'docs: the chart is checked by a person');

  // Run 1 (no model): plan, a real working build, a clean audit; the driver parks for the look.
  p.scenario({
    [`${e.id}/plan`]: planScript(e),
    [`${e.id}/build`]: { actions: [
      ...buildActions(e, { commit: false }),
      { do: 'write', path: 'src/index.js', content: INDEX }, { do: 'write', path: 'src/chart.js', content: CHART },
      { do: 'write', path: 'test/chart.test.js', content: testFile(e.tors[0]) },
      { do: 'write', path: `tests/manual/${e.tors[0]}.md`, content: checklist(e.tors[0]) },
      { do: 'write', path: `docs/implementation-plan/session-handoffs/epic-${e.id}-implemented.md`, content: handoff(e) },
      { do: 'commit', message: `feat(epic-${e.id}): implement ${e.slug}` },
    ] },
  });
  await p.go({ queue: [e.id] });
  assert.equal(p.epic(e.id).reason, 'human check needed before verify');
  const gate = readJson(path.join(p.state, 'gates', `${e.id}-1.json`));
  assert.match(fs.readFileSync(path.join(p.state, gate.artifacts.find((a) => a.endsWith('run-output.txt'))), 'utf8'), /\n\nchart\n/);
  const tip = git(p.clone, 'rev-parse', e.branch);

  // The owner looks and decides.
  const note = 'ran it: the word chart, exit 0';
  const d = spawnSync(process.execPath, [DRIVER, 'decide', '--workspace', p.state, '--gate', `gates/${e.id}-1.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner', '--note', note], { encoding: 'utf8' });
  assert.equal(d.status, 0, d.stderr);
  assert.equal(JSON.parse(d.stdout).enters, 'VERIFY');
  // A real session commits as someone: the tests' git config is empty on purpose.
  git(p.clone, 'config', 'user.name', 'Autopilot Test'); git(p.clone, 'config', 'user.email', 'test@example.invalid');

  // Run 2: the verify session is real.
  await p.go({ queue: [e.id] });

  const ep = p.epic(e.id);
  const ses = ep.sessions.find((s) => s.name === 'verify-1');
  const hooks = lines(p.dir(e.id, 'verify-1', 'hooks.jsonl'));
  const asked = hooks.filter((h) => h.hook === 'PreToolUse' && h.tool_name === 'AskUserQuestion');
  const gates = fs.readdirSync(path.join(p.state, 'gates')).sort().map((f) => ({ f, ...readJson(path.join(p.state, 'gates', f)) }));
  t.diagnostic(`verify-1: ${ses?.outcome} (${ses?.why}), $${ses?.costUsd}, ${ses?.turns} turns, ${ses?.terminalReason}; epic ${ep.state} — ${ep.reason}`);
  for (const h of asked) t.diagnostic(`asked → ${h.rule} ${h.decision}: ${h.reason}`);
  for (const g of gates.slice(1)) t.diagnostic(`new gate ${g.f}: ${g.kind} — ${g.question}`);
  let result = null; try { result = readJson(p.dir(e.id, 'verify-1', 'result.json')); } catch { /* no result: reported by the assertions below */ }
  t.diagnostic(`final message: ${String(result?.result ?? '').slice(0, 1500)}`);
  for (const c of ep.checks ?? []) if (!c.pass) t.diagnostic(`${c.file} failed: ${c.failed.join(', ')}`);

  assert.deepEqual(ep.sessions.map((s) => s.name), ['verify-1'], 'the second run re-enters at VERIFY and runs nothing else');
  assert.ok(ses.costUsd > 0, 'a real session was paid for');
  assert.equal(readJson(p.dir(e.id, 'verify-1', 'step.json')).look.branchTip, tip);
  const look = asked.find((h) => h.decision === 'answer' && /the owner's recorded decision/.test(h.reason ?? ''));
  assert.ok(look, `the manual-verification question was not answered from the owner's look: ${JSON.stringify(asked.map((h) => [h.decision, h.reason]))}`);
  assert.equal(gates.length, 1, 'the session parked on a question the look should have covered');
  assert.equal(ep.state, 'MERGED', ep.reason);
  // The look reaches the record a person reads: the Complete handoff says who looked and what they saw.
  const done = git(p.clone, 'show', `develop:docs/implementation-plan/session-handoffs/epic-${e.id}-complete.md`);
  t.diagnostic(`handoff lines naming the look: ${done.split('\n').filter((l) => /Pat Owner|operator-observed|manual/i.test(l)).join(' ⏎ ').slice(0, 1200)}`);
  assert.match(done, /Pat Owner|operator-observed/);
});
