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
  // A plan with many anchors lists them in shorthand ("TOR-03-Vaata1w, nt9zDad, …; TOR-01-Ji4u6Ta"): the
  // seven-character suffix is the identity (random, never reused), so it counts when it stands as its own token.
  const named = (tor) => plan.includes(tor) || new RegExp(`(?<![A-Za-z0-9])${tor.split('-').at(-1)}(?![A-Za-z0-9])`).test(plan);
  for (const tor of anchors) if (!named(tor)) problems.push(`does not name anchor ${tor}`);
  const headings = [
    // The model keeps every template step but often shortens its heading ("Feature branch",
    // "Status → In Progress", "Mark Implemented"), so these match the step, not the exact words.
    ['Create (or verify) feature branch', /feature branch|\bbranch\b[^\n]{0,160}feature\/epic-/i],
    ['Update status to "In Progress"', /status\b[^\n]{0,40}In Progress/i],
    ['Implementer self-assessment', /Implementer self-assessment/i],
    ['Reconcile spec', /Reconcile spec/i],
    ['Mark as Implemented', /Mark (as )?Implemented|status\b[^\n]{0,40}\bImplemented\b/i],
    ['Commit', /^[\s>#*\-\d.)]*\**Commit\b/m],
    ['Deferral gate', /Deferral gate/i],
    ['Amendment gate', /Amendment gate/i],
  ];
  for (const [name, re] of headings) if (!re.test(plan)) problems.push(`missing "${name}"`);
  const banned = [['git push', /\bgit\s+push\b/], ['sudo', /\bsudo\s+\S/], ['a container or VM command', /\b(docker|podman|colima|limactl|multipass|vagrant)\s+\S/]];
  for (const [name, re] of banned) if (re.test(plan)) problems.push(`contains ${name}`);
  return { pass: problems.length === 0, problems, anchors, checkedAt: new Date().toISOString() };
}

// ---- gates: the owner's answers and where each re-enters an epic (plan P3.5 Part 2) -----------

export const ANSWERS = {
  auditReal: 'Real — fix before verify', auditNotReal: 'Not real — verify as built',
  looksRight: 'Looks right', notRight: 'Not right — describe',
  approvePlan: 'Approve this plan', replan: 'Re-plan',
  resume: 'Resume from where it stopped', startOver: 'Start over',
};
/**
 * An answer that puts a decision off ("Not now — end the session", "Decide later"). It answers the
 * session that asked, once; it is not a decision, so no later session is told it (seen live: a
 * verify session told an old "Not now" ended again with no verdicts after the owner had done the check).
 */
export const postpones = (answer) => /^\W*(not now|not yet|not today|later\b|decide later|ask (me )?(again )?later|skip (it |this )?for now|another time|end the session)/i.test(String(answer ?? ''));
/** A verify session's last words when it ended without judging anything (the owner put a check off, or it could not start). */
export const NO_VERDICT = /\b(without|no)\s+(recording\s+)?(any\s+)?verdicts?\b|\bno\s+verdicts?\s+(was|were)\s+recorded\b/i;

const STEP_PHASE = { plan: 'PLAN', 'plan-fix': 'FIX_BUILD', build: 'BUILD', fix: 'FIX_BUILD', audit: 'AUDIT', verify: 'VERIFY' };
const stepKind = (session) => String(session ?? '').replace(/-\d+$/, '');

/**
 * Where a decided gate re-enters the epic (the Part 2 table). Returns `{phase}` plus what that
 * phase needs, `{fresh: true}` for a start from scratch, or null when the gate cannot be resumed.
 */
export function gateEntry(g) {
  const a = g.decided?.answer; const asked = stepKind(g.session);
  if (!a) return null;
  if (g.kind === 'preflight') return null; // the fix is in the project; it clears when preflight passes
  if (g.kind === 'resume') return a === ANSWERS.startOver ? { fresh: true } : a === ANSWERS.resume && g.phase ? { phase: g.phase } : null;
  if (g.kind === 'audit') return a === ANSWERS.auditNotReal ? { phase: 'VERIFY' } : a === ANSWERS.auditReal ? { phase: 'FIX_BUILD', fix: 'audit' } : null;
  if (g.kind === 'human-check') return a === ANSWERS.looksRight ? { phase: 'VERIFY', look: true } : a === ANSWERS.notRight ? { phase: 'FIX_BUILD', fix: 'look' } : null;
  if (g.kind === 'plan-lint') {
    const fix = asked === 'plan-fix';
    return a === ANSWERS.approvePlan ? { phase: fix ? 'FIX_BUILD' : 'BUILD', approve: true } : a === ANSWERS.replan ? { phase: fix ? 'FIX_BUILD' : 'PLAN' } : null;
  }
  // A question a session asked: the same kind of session again; hook R8 answers that one question once.
  return STEP_PHASE[asked] ? { phase: STEP_PHASE[asked], question: true } : null;
}
