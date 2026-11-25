// Autopilot auditor mechanics (autopilot-poc-plan.md §6.10): the input bundle, the check of what
// the auditor returned, and the driver's fixed park rule. The auditor session itself is launched
// by driver.mjs; nothing here calls a model.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCKFILE, THIN_REVIEW } from './lib.mjs';

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
    const calls = events.filter((e) => (e.hook === 'PostToolUse' || e.hook === 'PostToolUseFailure') || (e.hook === 'PreToolUse' && e.decision && e.decision !== 'pass' && e.decision !== 'allow')); // an allowed connector call shows as its result line
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
/**
 * `amendments.md`: each approved amendment of the epic's requirements, so a test change that follows the amended
 * requirement is read as the amendment it is, not as a weakening (#41 B12). Null when there is none.
 */
export function amendmentsText(pairs = []) {
  if (!pairs.length) return null;
  const now = (p) => (p.now?.length ? p.now.join(', ') : 'the requirement the status file now lists in its place');
  const lines = pairs.map((p) => {
    const at = [p.gate, p.by, p.date && String(p.date).slice(0, 10)].filter(Boolean).join(', ');
    return p.provisional
      ? `- This provisional run took a session's proposal to replace ${p.was} with ${now(p)}${at ? ` (${at})` : ''}; no person has approved it yet. A test change that follows ${now(p)} is the amendment, not a weakening; check it matches ${now(p)}, and report anything beyond it.`
      : `- The owner approved replacing ${p.was} with ${now(p)}${at ? ` (${at})` : ''}. A test change that follows ${now(p)} is the amendment, not a weakening; check it matches ${now(p)}, and report anything beyond it.`;
  });
  return `# Amended requirements

These requirements were replaced before or during this build. \`tors.md\` holds the requirement as it now stands.

${lines.join('\n')}
`;
}

export function buildBundle({ clone, pluginDir, bundleDir, epic, integration, base = null, steps = [], amendments = [] }) {
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
  const amended = amendmentsText(amendments);
  if (amended) files['amendments.md'] = amended;
  const meta = { epic: epic.id, label: epic.label, branch: epic.branch, integration, clone, delta, base: delta ? base : run('git', ['merge-base', integration, epic.branch], clone).out.trim(), tip, range, steps: steps.map((s) => s.name), digestCalls: digest.calls, anchors: epic.anchors, ...(amendments.length ? { amendments } : {}) };
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

/**
 * Checks an auditor result against audit/schema.json by hand (no dependency). With `anchors`, every one of them needs
 * its `checked` entry: a review that does not say what it read is no usable result.
 */
export function validateAudit(value, anchors = null) {
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
  if (anchors) {
    const checked = Array.isArray(value.checked) ? value.checked : null;
    if (!checked) problems.push('checked is not a list');
    else {
      checked.forEach((c, i) => {
        if (!c || typeof c !== 'object') { problems.push(`checked[${i}] is not an object`); return; }
        for (const k of ['tests', 'code']) if (!Array.isArray(c[k]) || c[k].some((x) => typeof x !== 'string')) problems.push(`checked[${i}].${k} is not a list of paths`);
      });
      // The ID inside whatever the reviewer wrote ("[TOR-01-Kq7Rm2x] Import rows", "TOR-01-Kq7Rm2x — …").
      const named = new Set(checked.map((c) => (String(c?.tor ?? '').match(/TOR-\d{2}-[A-Za-z0-9]{7}/) ?? [])[0]));
      for (const tor of anchors) if (!named.has(tor)) problems.push(`checked has no entry for ${tor}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/** A name as git quotes it (`\303\251`, `\"`, `\t`), back to its own characters. */
const unquote = (name) => (/\\/.test(name) ? Buffer.from(name.replace(/\\([0-7]{3})|\\(.)/g, (_, o, c) => (o ? String.fromCharCode(parseInt(o, 8)) : ({ t: '\t', n: '\n' }[c] ?? c))), 'latin1').toString('utf8') : name);
// Data a reviewer need not open one by one: fixtures, snapshots, vendored or built output.
const NOT_CODE = /(^|\/)(__snapshots__|fixtures?|testdata|vendor|node_modules|dist|build|coverage)\/|\.(snap|min\.js|map)$/i;
const IMAGE = /\.(png|jpe?g|gif|svg|ico|webp|bmp|tiff?|pdf|woff2?|ttf|otf|eot|mp[34]|mov|zip|gz)$/i;
/**
 * The code files a diff changes that a reviewer is expected to open: not deleted, not binary, not an image, not under
 * `docs/` (the spec, the requirements, the handoff, the plan), not a lockfile, not autopilot's own record.
 */
export function changedCodeFiles(diff) {
  const files = [];
  for (const block of String(diff ?? '').split(/^(?=diff --git )/m)) {
    const head = block.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/m);
    if (!head) continue;
    // git ends a name with a space in it with a tab on the `+++` line, and quotes one with unusual characters.
    const rel = unquote(((block.match(/^\+\+\+ "?b\/(.+?)"?\t?$/m) ?? [])[1] ?? head[2]).replace(/\t$/, ''));
    // Nothing to read: a mode change only, or a rename with the same content (no hunk, not binary).
    if (!/^@@ /m.test(block) && !/^(Binary files |GIT binary patch)/m.test(block)) continue;
    if (/^\+\+\+ \/dev\/null$/m.test(block) || /^deleted file mode/m.test(block)) continue;
    if (/^(Binary files |GIT binary patch)/m.test(block) || IMAGE.test(rel)) continue;
    if (/^(docs|\.autopilot)\//.test(rel) || LOCKFILE.test(rel) || NOT_CODE.test(rel)) continue;
    if (!files.includes(rel)) files.push(rel);
  }
  return files;
}

/**
 * What the reviewer opened, from its step's referee log: of the changed code files in its bundle's `diff.patch`, how
 * many it read (`Read` calls that finished), which it left unread, and how long it took (its result's `duration_ms`).
 */
export function reviewCoverage({ stepDir, clone }) {
  const diff = fs.existsSync(path.join(stepDir, 'bundle', 'diff.patch')) ? fs.readFileSync(path.join(stepDir, 'bundle', 'diff.patch'), 'utf8') : '';
  const files = changedCodeFiles(diff);
  const roots = [...new Set([clone, (() => { try { return fs.realpathSync(clone); } catch { return clone; } })()])];
  const opened = new Set();
  for (const e of readLines(path.join(stepDir, 'hooks.jsonl'))) {
    if (e.hook !== 'PostToolUse' || e.tool_name !== 'Read') continue;
    const input = typeof e.tool_input === 'string' ? (() => { try { return JSON.parse(e.tool_input); } catch { return {}; } })() : e.tool_input ?? {};
    const fp = input.file_path; if (typeof fp !== 'string') continue;
    for (const root of roots) {
      const rel = path.isAbsolute(fp) ? path.relative(root, fp) : path.normalize(fp);
      if (!rel.startsWith('..')) opened.add(rel.split(path.sep).join('/'));
    }
  }
  let ms = null;
  try { ms = JSON.parse(fs.readFileSync(path.join(stepDir, 'result.json'), 'utf8')).duration_ms ?? null; } catch { /* no result line */ }
  const unread = files.filter((f) => !opened.has(f));
  return { read: files.length - unread.length, of: files.length, unread, seconds: ms == null ? null : Math.round(ms / 1000) };
}

/**
 * Whether a review was thin, and why: it read fewer of the changed code files than `THIN_REVIEW` asks (half, at most
 * `cap`), or (on a whole-epic audit; a delta audit may leave untouched requirements alone) it named no test for an
 * anchor. Null when it was not thin.
 */
export function thinReview({ value, coverage, anchors = [], delta = false }) {
  const need = Math.min(Math.ceil(coverage.of * THIN_REVIEW.share), THIN_REVIEW.cap);
  const short = coverage.read < need;
  const untested = delta ? [] : anchors.filter((tor) => !(value.checked ?? []).some((c) => String(c?.tor ?? '').includes(tor) && (c.tests ?? []).length));
  return short || untested.length ? { need, short, untested } : null;
}

/**
 * The driver's rule (§6.10): a finding parks the epic only when it is `high` and its category is
 * in `parkOn`. The auditor's `recommend` is recorded and shown, and has no effect.
 */
export function judgeAudit(value, parkOn, prefix = 'F') {
  const findings = value.findings.map((f, i) => ({ id: `${prefix}${i + 1}`, ...f, parks: f.severity === 'high' && parkOn.includes(f.category) }));
  return { findings, parks: findings.filter((f) => f.parks), recommend: value.recommend, summary: value.summary };
}
