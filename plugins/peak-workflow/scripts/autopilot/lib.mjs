// Shared by the driver and the referee hooks: one implementation of each parse and lint.

/** A status sidecar: `key: value` lines, plus indented `TOR: fingerprint` lines under `verified:`. */
export function parseSidecar(text) {
  const fields = {}; const verified = {};
  let block = null;
  for (const line of (text ?? '').split(/\r?\n/)) {
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (top) { fields[top[1]] = top[2].trim(); block = top[2].trim() === '' ? top[1] : null; continue; }
    const sub = line.match(/^\s+(TOR-\d{2}-[A-Za-z0-9]{7}):\s*(.+)$/);
    if (sub && block === 'verified') verified[sub[1]] = sub[2].trim();
  }
  const requirements = (fields.requirements ?? '').match(/TOR-\d{2}-[A-Za-z0-9]{7}/g) ?? [];
  return { fields, verified, requirements };
}

/**
 * Plan lint (rule R9; SPIKE.md correction 7: headings, not full template text). The hook runs it
 * at ExitPlanMode; the driver always re-runs it on the captured `plan.md`.
 */
export function lintPlan(plan, anchors) {
  const problems = [];
  for (const tor of anchors) if (!plan.includes(tor)) problems.push(`does not name anchor ${tor}`);
  const headings = [
    ['Create (or verify) feature branch', /Create \(or verify\) feature branch/i],
    ['Update status to "In Progress"', /Update status to ["“]In Progress["”]/i],
    ['Implementer self-assessment', /Implementer self-assessment/i],
    ['Reconcile spec', /Reconcile spec/i],
    ['Mark as Implemented', /Mark as Implemented/i],
    ['Commit', /^[\s>#*\-\d.)]*\**Commit\b/m],
    ['Deferral gate', /Deferral gate/i],
    ['Amendment gate', /Amendment gate/i],
  ];
  for (const [name, re] of headings) if (!re.test(plan)) problems.push(`missing "${name}"`);
  const banned = [['git push', /\bgit\s+push\b/], ['sudo', /\bsudo\s+\S/], ['a container or VM command', /\b(docker|podman|colima|limactl|multipass|vagrant)\s+\S/]];
  for (const [name, re] of banned) if (re.test(plan)) problems.push(`contains ${name}`);
  return { pass: problems.length === 0, problems, anchors, checkedAt: new Date().toISOString() };
}
