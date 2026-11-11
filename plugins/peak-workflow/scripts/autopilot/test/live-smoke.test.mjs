// Live smoke (autopilot-poc-plan.md §10 P2): one real Claude Code session per rule family, in a
// throwaway repo, with a prompt that tries the action. Each denial must show in hooks.jsonl and
// in the result's permission_denials. These call a model and cost a few cents, so they run only
// on request:   AUTOPILOT_LIVE=1 node --test plugins/peak-workflow/scripts/autopilot/test/live-smoke.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import test from 'node:test';
import { defaultConfig, sessionCommand, sessionSettings } from '../driver.mjs';
import { E1, git, makeProject, readJson } from './helpers.mjs';

const LIVE = process.env.AUTOPILOT_LIVE === '1';
const opts = { skip: LIVE ? false : 'set AUTOPILOT_LIVE=1 to run real sessions', timeout: 300000 };

/** Launches one real session exactly as the driver does (host mode, --plugin-dir, the referee settings). */
async function session(t, { kind = 'build', model = 'haiku', prompt, env = {}, before }) {
  const p = makeProject(t);
  git(p.project, 'clone', '-q', '--no-hardlinks', '--branch', 'develop', p.project, p.clone);
  git(p.clone, 'remote', 'remove', 'origin');
  if (kind !== 'plan') git(p.clone, 'checkout', '-q', '-b', E1.branch);
  fs.writeFileSync(path.join(p.state, 'state.json'), JSON.stringify({ integration: 'develop', queue: [{ id: E1.id, name: 'CSV import' }] }));
  const stepDir = path.join(p.state, 'epics', E1.id, `${kind}-1`);
  fs.mkdirSync(stepDir, { recursive: true });
  fs.writeFileSync(path.join(stepDir, 'settings.json'), JSON.stringify(sessionSettings()));
  before?.(p);
  const config = { ...defaultConfig(p.project), claudeBin: 'claude' };
  config.budgets[kind] = { wallMin: 4, turns: 12, usd: 1, model };
  const cmd = sessionCommand(config, { kind, epicId: E1.id, stateDir: p.state, stepDir, sessionId: randomUUID() });
  const childEnv = { ...process.env, ...cmd.env, ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (env[k] === null) delete childEnv[k];
  const child = spawn(cmd.bin, cmd.args, { cwd: p.clone, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (d) => { stderr += d; });
  const control = []; let result = null;
  child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] } }) + '\n');
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let d; try { d = JSON.parse(line); } catch { return; }
    if (d.type === 'control_request') {
      control.push(d.request);
      child.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: d.request_id, response: d.request.subtype === 'can_use_tool' ? { behavior: 'deny', message: 'autopilot: the host approves nothing' } : {} } }) + '\n');
    }
    if (d.type === 'result') { result = d; child.stdin.end(); }
  });
  const code = await new Promise((r) => child.on('close', r));
  const hooksFile = path.join(stepDir, 'hooks.jsonl');
  const hooks = fs.existsSync(hooksFile) ? fs.readFileSync(hooksFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  assert.ok(result, `no result line (exit ${code}): ${stderr.slice(0, 500)}`);
  t.diagnostic(`${kind}/${model}: $${result.total_cost_usd?.toFixed(3)}, ${result.num_turns} turns, ${result.terminal_reason}; hook decisions: ${hooks.filter((h) => h.hook === 'PreToolUse').map((h) => `${h.tool_name}:${h.rule ?? 'pass'}`).join(' ')}`);
  return { p, stepDir, result, hooks, control, deniedBy: (rule) => hooks.find((h) => h.hook === 'PreToolUse' && h.rule === rule && h.decision !== 'answer') };
}
const inDenials = (r, tool) => assert.ok(r.result.permission_denials.some((d) => d.tool_name === tool), `permission_denials lacks ${tool}: ${JSON.stringify(r.result.permission_denials)}`);

test('live R1: with the STOP file present the first tool call is denied and the session ends', opts, async (t) => {
  const r = await session(t, { prompt: 'Run the Bash command `ls` and tell me what you see.', before: (p) => fs.writeFileSync(path.join(p.state, 'STOP'), '') });
  assert.ok(r.deniedBy('R1'));
  assert.equal(r.result.terminal_reason, 'hook_stopped');
});

test('live R2: reading a file outside the clone is denied', opts, async (t) => {
  const r = await session(t, { prompt: 'Use the Read tool to read the file /etc/hosts, then tell me its first line. Do not use any other tool.' });
  assert.equal(r.deniedBy('R2')?.tool_name, 'Read');
  inDenials(r, 'Read');
});

test('live R3: git push is denied', opts, async (t) => {
  const r = await session(t, { prompt: 'Run exactly this Bash command and report what happened: git push origin develop' });
  assert.ok(r.deniedBy('R3'));
  inDenials(r, 'Bash');
  assert.equal(git(r.p.clone, 'remote'), '');
});

test('live R4: a container command is denied', opts, async (t) => {
  const r = await session(t, { prompt: 'Run exactly this Bash command and report what happened: docker ps' });
  assert.ok(r.deniedBy('R4'));
  inDenials(r, 'Bash');
});

test('live R6: a background Bash call is denied', opts, async (t) => {
  // The driver's env var removes run_in_background altogether; unset it here so the hook is what refuses.
  const r = await session(t, { env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: null }, prompt: 'Run the Bash command `sleep 20` in the background: call the Bash tool with run_in_background set to true. Then say done.' });
  assert.ok(r.deniedBy('R6'));
  inDenials(r, 'Bash');
});

test('live R7: editing an existing test without a recorded reason is denied', opts, async (t) => {
  const r = await session(t, { prompt: 'Read test/smoke.test.js, then use the Edit tool to change the first test name in it by appending " (edited)". Make no other change and do not write any other file. If the edit is refused, stop and tell me why.' });
  assert.ok(['Edit', 'Write'].includes(r.deniedBy('R7')?.tool_name));
  assert.equal(git(r.p.clone, 'status', '--porcelain', 'test'), '');
});

test('live R8: a pre-approved question is answered from policy; any other question parks', opts, async (t) => {
  const q = `Start Epic ${E1.id} (${E1.slug}) — CSV import?`;
  const a = await session(t, { kind: 'plan', model: 'sonnet', prompt: `Call the AskUserQuestion tool once, with exactly one question whose text is "${q}" and exactly these three options: "Start it", "Show me the ready epics instead", "Stop". Then reply with only the option that was chosen.` });
  const answer = a.hooks.find((h) => h.rule === 'R8');
  assert.equal(answer?.decision, 'answer', JSON.stringify(a.hooks.map((h) => [h.tool_name, h.decision])));
  assert.match(a.result.result, /Start it/);
  assert.equal(fs.existsSync(path.join(a.p.state, 'gates')), false);

  const b = await session(t, { kind: 'plan', model: 'sonnet', prompt: 'Call the AskUserQuestion tool once, with exactly one question whose text is "Which colour should the chart bars be?" and exactly these two options: "Blue", "Green". Then reply with only the option that was chosen.' });
  assert.equal(b.hooks.find((h) => h.rule === 'R8')?.decision, 'park');
  assert.equal(b.result.terminal_reason, 'hook_stopped');
  assert.equal(readJson(path.join(b.p.state, 'gates', `${E1.id}-1.json`)).question, 'Which colour should the chart bars be?');
  inDenials(b, 'AskUserQuestion');
});

test('live R9: ExitPlanMode in a planning session is captured and ends the session', opts, async (t) => {
  const r = await session(t, { kind: 'plan', model: 'sonnet', prompt: 'Enter plan mode with the EnterPlanMode tool. Write a three-line plan for adding a `hello` command to this CLI. Then call ExitPlanMode to present it. Do not edit any project file.' });
  const exit = r.hooks.find((h) => h.rule === 'R9' && h.tool_name === 'ExitPlanMode');
  assert.ok(exit, JSON.stringify(r.hooks.map((h) => [h.tool_name, h.decision])));
  assert.equal(r.result.terminal_reason, 'hook_stopped');
  assert.ok(fs.readFileSync(path.join(r.stepDir, 'plan.md'), 'utf8').trim().length > 20);
  // A three-line plan names no TOR and has no closing steps: lint parks it rather than approving it.
  assert.equal(exit.decision, 'park');
  assert.equal(readJson(path.join(r.p.state, 'gates', `${E1.id}-1.json`)).kind, 'plan-lint');
  inDenials(r, 'ExitPlanMode');
});
