// Autopilot auditor mechanics (autopilot-poc-plan.md §6.10): the input bundle, the check of what
// the auditor returned, and the driver's fixed park rule. The auditor session itself is launched
// by driver.mjs; nothing here calls a model.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const AUDIT_DIR = path.join(HERE, 'audit');
export const SCHEMA = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, 'schema.json'), 'utf8'));
export const CATEGORIES = SCHEMA.properties.findings.items.properties.category.enum;
export const SEVERITIES = SCHEMA.properties.findings.items.properties.severity.enum;

const PLAN_DIR = 'docs/implementation-plan';
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '', err: (r.stderr ?? '').trim() };
};
const show = (clone, ref, file) => { const r = run('git', ['show', `${ref}:${file}`], clone); return r.ok ? r.out : null; };
const clip = (v, max) => {
  const s = (typeof v === 'string' ? v : JSON.stringify(v ?? null)).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}… (${s.length} chars)` : s;
};
const readLines = (file) => {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
};

function callLine(tool, input) {
  const i = typeof input === 'string' ? (() => { try { return JSON.parse(input); } catch { return { raw: input }; } })() : input ?? {};
  if (tool === 'Bash') return clip(i.command ?? i.raw ?? '', 400);
  if (i.file_path || i.notebook_path) return clip(i.file_path ?? i.notebook_path, 200);
  if (tool === 'Grep' || tool === 'Glob') return clip(`${i.pattern ?? ''}${i.path ? ` in ${i.path}` : ''}`, 200);
  if (tool === 'Skill') return clip(`${i.skill ?? ''} ${i.args ?? ''}`, 200);
  if (tool === 'Agent' || tool === 'Task') return clip(i.description ?? i.prompt ?? '', 200);
  return clip(i, 200);
}
function resultLine(response) {
  if (response === null || response === undefined) return '';
  if (typeof response === 'object' && ('stdout' in response || 'stderr' in response)) {
    return clip([response.stdout, response.stderr && `stderr: ${response.stderr}`, response.interrupted && '(interrupted)'].filter(Boolean).join(' '), 600);
  }
  return clip(response, 600);
}

/**
 * `digest.md`: what the build sessions actually ran, one numbered line per tool call, from each
 * step's `hooks.jsonl` (the referee's log), plus the session's last message from `result.json`.
 * `steps` are `{name, dir}`; numbering runs across all of them so `D<n>` is unambiguous.
 */
export function buildDigest(steps) {
  const out = ['# Digest — what the build session ran', '', 'One line per tool call, in order. `→` is the truncated result; DENIED lines were refused by the referee.', ''];
  let n = 0;
  for (const { name, dir } of steps) {
    out.push(`## ${name}`, '');
    const events = readLines(path.join(dir, 'hooks.jsonl'));
    const calls = events.filter((e) => (e.hook === 'PostToolUse' || e.hook === 'PostToolUseFailure') || (e.hook === 'PreToolUse' && e.decision && e.decision !== 'pass'));
    if (!calls.length) out.push('(the referee log has no tool call for this session)', '');
    for (const e of calls) {
      n += 1;
      const who = e.agent_type ? ` (subagent ${e.agent_type})` : '';
      if (e.hook === 'PreToolUse') out.push(`D${n} ${e.decision === 'deny' ? 'DENIED' : e.decision.toUpperCase()} ${e.tool_name}${who}: ${callLine(e.tool_name, e.tool_input)} — ${e.rule}: ${clip(e.reason ?? '', 300)}`);
      else if (e.hook === 'PostToolUseFailure') out.push(`D${n} FAILED ${e.tool_name}${who}: ${callLine(e.tool_name, e.tool_input)} → ${clip(e.error ?? e.tool_response ?? '', 600)}`);
      else out.push(`D${n} ${e.tool_name}${who}: ${callLine(e.tool_name, e.tool_input)} → ${resultLine(e.tool_response)}`);
    }
    let last = null;
    try { last = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')).result; } catch { /* no result line */ }
    out.push('', `Last message of ${name}:`, '', last ? clip(last, 3000) : '(none recorded)', '');
  }
  return { text: out.join('\n'), calls: n };
}

/**
 * Writes the auditor's input bundle into `bundleDir`. `base` is the tip the last audit covered:
 * when given (and still an ancestor of the branch), `diff.patch` holds only the delta since then.
 */
export function buildBundle({ clone, pluginDir, bundleDir, epic, integration, base = null, steps = [] }) {
  fs.mkdirSync(bundleDir, { recursive: true });
  const tip = run('git', ['rev-parse', epic.branch], clone).out.trim();
  const delta = !!base && base !== tip && run('git', ['merge-base', '--is-ancestor', base, epic.branch], clone).ok;
  const range = delta ? `${base}..${epic.branch}` : `${integration}...${epic.branch}`;
  const diff = run('git', ['diff', range], clone);
  if (!diff.ok) throw new Error(`audit bundle: git diff ${range} failed: ${diff.err}`);

  const tors = epic.anchors.map((tor) => {
    const r = run('sh', [path.join(pluginDir, 'scripts', 'tor-lifecycle'), '--root', clone, 'text', tor], clone);
    return r.ok ? r.out.trimEnd() : `Scenario: [${tor}] (tor-lifecycle text could not print this requirement: ${r.err || 'not found'})`;
  });
  const digest = buildDigest(steps);
  const files = {
    'diff.patch': diff.out,
    'spec.md': show(clone, epic.branch, epic.spec) ?? '(the epic spec is missing on the branch)\n',
    'tors.md': `# Anchor requirements of ${epic.label}\n\n${tors.join('\n\n')}\n`,
    'handoff.md': show(clone, epic.branch, `${PLAN_DIR}/session-handoffs/epic-${epic.id}-implemented.md`) ?? '(the build left no handoff file on the branch)\n',
    'digest.md': digest.text,
    'test-changes.jsonl': show(clone, epic.branch, '.autopilot/test-changes.jsonl') ?? '',
  };
  const meta = { epic: epic.id, label: epic.label, branch: epic.branch, integration, clone, delta, base: delta ? base : run('git', ['merge-base', integration, epic.branch], clone).out.trim(), tip, range, steps: steps.map((s) => s.name), digestCalls: digest.calls, anchors: epic.anchors };
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(bundleDir, name), text);
  fs.writeFileSync(path.join(bundleDir, 'bundle.json'), JSON.stringify(meta, null, 2) + '\n');
  return meta;
}

/** The auditor's structured result out of a CLI result line, or null. */
export function auditOutput(result) {
  if (result?.structured_output && typeof result.structured_output === 'object') return result.structured_output;
  const text = typeof result?.result === 'string' ? result.result.trim() : '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Checks an auditor result against audit/schema.json by hand (no dependency). */
export function validateAudit(value) {
  const problems = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, problems: ['not a JSON object'] };
  if (!Array.isArray(value.findings)) problems.push('findings is not a list');
  else value.findings.forEach((f, i) => {
    if (!f || typeof f !== 'object') { problems.push(`findings[${i}] is not an object`); return; }
    if (!CATEGORIES.includes(f.category)) problems.push(`findings[${i}].category "${f.category}" is not a known category`);
    if (!SEVERITIES.includes(f.severity)) problems.push(`findings[${i}].severity "${f.severity}" is not high, medium or low`);
    for (const k of ['evidence', 'explanation']) if (typeof f[k] !== 'string' || !f[k].trim()) problems.push(`findings[${i}].${k} is empty`);
  });
  if (!['proceed', 'park'].includes(value.recommend)) problems.push('recommend is not "proceed" or "park"');
  if (typeof value.summary !== 'string') problems.push('summary is not text');
  return { ok: problems.length === 0, problems };
}

/**
 * The driver's rule (§6.10): a finding parks the epic only when it is `high` and its category is
 * in `parkOn`. The auditor's `recommend` is recorded and shown, and has no effect.
 */
export function judgeAudit(value, parkOn, prefix = 'F') {
  const findings = value.findings.map((f, i) => ({ id: `${prefix}${i + 1}`, ...f, parks: f.severity === 'high' && parkOn.includes(f.category) }));
  return { findings, parks: findings.filter((f) => f.parks), recommend: value.recommend, summary: value.summary };
}
