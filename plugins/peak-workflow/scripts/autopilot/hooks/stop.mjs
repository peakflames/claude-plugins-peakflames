#!/usr/bin/env node
// Autopilot referee: the Stop hook (autopilot-poc-plan.md §6.7).
//
// - Refuses to end while background tasks are running. If the same tasks are still there on
//   the next stop, it lets the session end and logs it; the driver then fails the step.
// - Builder only: blocks once when the epic's sidecar is not Implemented and no gate was
//   written, so the plan's closing steps are not silently skipped. A second stop always passes.
// - Records the last assistant message in <step>/last-message.txt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSidecar } from '../lib.mjs';

const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };

export function decide(input, env = process.env) {
  const step = env.AUTOPILOT_STEP; const state = env.AUTOPILOT_STATE;
  if (!state || !step) return { out: null, log: { decision: 'pass', reason: 'not an autopilot session' } };
  const memoFile = path.join(step, 'stop-state.json');
  const memo = readJson(memoFile, {});
  const save = (m) => { try { fs.writeFileSync(memoFile, JSON.stringify(m)); } catch { /* best effort */ } };
  if (typeof input.last_assistant_message === 'string') { try { fs.writeFileSync(path.join(step, 'last-message.txt'), input.last_assistant_message); } catch { /* best effort */ } }

  const tasks = (input.background_tasks ?? []).filter((t) => !t.status || /running|pending|in_progress/i.test(t.status));
  if (tasks.length) {
    const ids = tasks.map((t) => t.id ?? t.description ?? '?').sort().join(',');
    if (input.stop_hook_active && memo.tasks === ids) return { out: null, log: { decision: 'allow-with-work-running', reason: `background tasks unchanged after a block: ${ids}` } };
    save({ ...memo, tasks: ids });
    const names = tasks.map((t) => t.description ?? t.command ?? t.id).join('; ');
    return { out: { decision: 'block', reason: `wait for ${names} or stop it; autopilot does not end with work running` }, log: { decision: 'block', reason: `background tasks: ${ids}` } };
  }

  if (env.AUTOPILOT_ROLE === 'builder' && !memo.nudged && fs.existsSync(path.join(state, 'clone'))) {
    const epic = env.AUTOPILOT_EPIC; const name = path.basename(step);
    const sidecar = parseSidecar(readText(path.join(state, 'clone', 'docs', 'implementation-plan', 'status', `epic-${epic}.md`)));
    const gates = path.join(state, 'gates');
    const run = env.AUTOPILOT_RUN ? path.basename(env.AUTOPILOT_RUN) : null; // gates/ holds every run's gates
    const gated = fs.existsSync(gates) && fs.readdirSync(gates).some((f) => { if (!f.startsWith(`${epic}-`)) return false; const g = readJson(path.join(gates, f), {}); return g.session === name && (!run || !g.run || g.run === run); });
    if (sidecar.fields.status !== 'Implemented' && !gated) {
      save({ ...memo, nudged: true });
      return { out: { decision: 'block', reason: 'finish the plan\'s closing steps (self-assessment, handoff, Mark as Implemented, Commit) or stop at a gate' }, log: { decision: 'block', reason: `sidecar status is ${sidecar.fields.status ?? 'missing'}, no gate written` } };
    }
  }
  return { out: null, log: { decision: 'pass', reason: null } };
}
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = {}; let r;
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); r = decide(input); } catch (err) { r = { out: null, log: { decision: 'pass', reason: `stop hook error: ${err.message}` } }; }
  try { if (process.env.AUTOPILOT_STEP) fs.appendFileSync(path.join(process.env.AUTOPILOT_STEP, 'hooks.jsonl'), JSON.stringify({ t: new Date().toISOString(), hook: 'Stop', ...r.log, stop_hook_active: input.stop_hook_active ?? false }) + '\n'); } catch { /* best effort */ }
  if (r.out) process.stdout.write(JSON.stringify(r.out));
}
