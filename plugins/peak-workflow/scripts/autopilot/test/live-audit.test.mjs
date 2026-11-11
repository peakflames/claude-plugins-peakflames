// Live auditor (autopilot-poc-plan.md §10 P3): the real auditor session on two canned builds, one
// that widens a tolerance in an existing test and one that is clean. The high finding must appear
// only on the first. These call a model (Opus, a few tens of cents each), so they run only on request:
//   AUTOPILOT_LIVE=1 node --test plugins/peak-workflow/scripts/autopilot/test/live-audit.test.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { defaultConfig, run, sessionCommand, sessionSettings } from '../driver.mjs';
import { auditOutput, judgeAudit, validateAudit } from '../audit.mjs';
import { cannedBuild } from './audit-canned.mjs';
import { E1, FAKE, happy, makeProject, readJson } from './helpers.mjs';

const LIVE = process.env.AUTOPILOT_LIVE === '1';
const opts = { skip: LIVE ? false : 'set AUTOPILOT_LIVE=1 to run the real auditor', timeout: 900000 };

/** Builds the bundle and launches the auditor exactly as the driver's AUDIT step does. */
async function audit(t, variant) {
  const c = cannedBuild(t, variant);
  const runDir = c.mockRun();
  const stepDir = path.join(runDir, 'epics', E1.id, 'audit-1');
  c.bundle(stepDir);
  fs.writeFileSync(path.join(stepDir, 'settings.json'), JSON.stringify(sessionSettings()));
  const config = { ...defaultConfig(c.project), claudeBin: 'claude' };
  const cmd = sessionCommand(config, { kind: 'audit', epicId: E1.id, workspace: c.state, runDir, stepDir, sessionId: randomUUID() });
  const env = { ...process.env, ...cmd.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(cmd.bin, cmd.args, { cwd: cmd.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; }); child.stderr.on('data', (d) => { stderr += d; });
  const code = await new Promise((r) => child.on('close', r));
  let parsed = null; try { parsed = JSON.parse(stdout); } catch { /* reported below */ }
  const result = Array.isArray(parsed) ? parsed.find((x) => x?.type === 'result') : parsed;
  assert.ok(result, `no result (exit ${code}): ${stderr.slice(0, 600)} ${stdout.slice(0, 600)}`);
  assert.equal(result.subtype, 'success', JSON.stringify(result).slice(0, 800));
  const value = auditOutput(result);
  assert.deepEqual(validateAudit(value), { ok: true, problems: [] }, JSON.stringify(result).slice(0, 1200));
  const judged = judgeAudit(value, config.audit.parkOn);
  const hooksFile = path.join(stepDir, 'hooks.jsonl');
  const hooks = fs.existsSync(hooksFile) ? fs.readFileSync(hooksFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  t.diagnostic(`${variant}: $${result.total_cost_usd?.toFixed(3)}, ${result.num_turns} turns; recommends ${judged.recommend}; ${judged.findings.map((f) => `${f.id} ${f.severity} ${f.category}${f.parks ? ' (parks)' : ''} [${f.evidence}]`).join('; ') || 'no findings'}`);
  t.diagnostic(`${variant}: tools ${[...new Set(hooks.filter((h) => h.hook === 'PreToolUse').map((h) => `${h.tool_name}:${h.decision}`))].join(' ')}; summary: ${judged.summary}`);
  return { judged, result, hooks };
}

test('live auditor: a widened tolerance in an existing test is a high test-weakened finding; the clean build has none', opts, async (t) => {
  const [widened, clean] = await Promise.all([audit(t, 'widened'), audit(t, 'clean')]);

  const weakened = widened.judged.findings.filter((f) => f.category === 'test-weakened' && f.severity === 'high');
  assert.ok(weakened.length >= 1, `expected a high test-weakened finding: ${JSON.stringify(widened.judged.findings)}`);
  assert.ok(weakened.some((f) => /money|toCents|tolerance|cent/i.test(`${f.evidence} ${f.explanation}`)), `the finding is about the loosened cents test: ${JSON.stringify(weakened)}`);
  assert.ok(widened.judged.parks.length >= 1, 'the driver would park this epic');

  assert.deepEqual(clean.judged.findings.filter((f) => f.category === 'test-weakened' && f.severity === 'high'), []);
  assert.deepEqual(clean.judged.parks, [], `the clean build must not park: ${JSON.stringify(clean.judged.findings)}`);

  // Read-only in practice: nothing but reads (and the structured result) got past the referee.
  for (const r of [widened, clean]) {
    const used = r.hooks.filter((h) => h.hook === 'PreToolUse' && h.decision === 'pass').map((h) => h.tool_name);
    assert.ok(used.every((n) => ['Read', 'Grep', 'Glob', 'StructuredOutput'].includes(n)), `unexpected tools: ${used.join(' ')}`);
  }
});

test('live auditor through the driver: the AUDIT step launches real `claude -p`, reads its result and judges it', opts, async (t) => {
  // Plan, build and verify stay on the fake; only the auditor session is real.
  const p = makeProject(t);
  const bin = path.join(p.tmp, 'claude-mixed');
  const wrapper = ['#!/bin/sh', 'if [ "$AUTOPILOT_ROLE" = "auditor" ]; then exec claude "$@"; fi', `exec "${process.execPath}" "${FAKE}" "$@"`, ''].join('\n');
  fs.writeFileSync(bin, wrapper, { mode: 0o755 });
  fs.writeFileSync(path.join(p.state, 'settings.json'), JSON.stringify({ ...readJson(path.join(p.state, 'settings.json')), claudeBin: bin }));
  p.scenario(happy(E1));

  await p.go(); // the wrapper is a test double for every role but the auditor

  const e = p.epic(E1.id);
  const session = e.sessions.find((s) => s.name === 'audit-1');
  t.diagnostic(`audit-1: ${session?.outcome} (${session?.why}), $${session?.costUsd}, ${session?.turns} turns; epic ${e.state} — ${e.reason}`);
  assert.equal(session?.outcome, 'ok', `the driver could not read the real auditor's result: ${session?.why}`);
  assert.ok(session.costUsd > 0, 'a real session was paid for');
  const audit = readJson(p.dir(E1.id, 'audit-1', 'audit.json'));
  t.diagnostic(`decision ${audit.decision}, recommend ${audit.recommend}: ${audit.findings.map((f) => `${f.id} ${f.severity} ${f.category}`).join('; ') || 'no findings'}`);
  assert.ok(Array.isArray(audit.findings) && ['park', 'proceed'].includes(audit.decision));
  assert.ok(!/no usable result|could not start|infra/.test(e.reason ?? ''), e.reason);
  assert.equal(e.state, audit.decision === 'park' ? 'PARKED' : 'MERGED');
  const lines = fs.readFileSync(p.dir(E1.id, 'audit-1', 'stream.jsonl'), 'utf8').trim().split('\n').length;
  t.diagnostic(`real --output-format json printed ${lines} line(s)`);
});
