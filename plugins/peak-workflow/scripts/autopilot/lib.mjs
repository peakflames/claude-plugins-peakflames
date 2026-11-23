// Shared by the driver and the referee hooks: one implementation of each parse and lint.

/** A status sidecar: `key: value` lines, plus indented `TOR: fingerprint` lines under `verified:`. */
export function parseSidecar(text) {
  const fields = {}; const verified = {}; const unverified = {};
  let block = null;
  for (const line of (text ?? '').split(/\r?\n/)) {
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (top) { fields[top[1]] = top[2].trim(); block = top[2].trim() === '' ? top[1] : null; continue; }
    const sub = line.match(/^\s+(TOR-\d{2}-[A-Za-z0-9]{7}):\s*(.+)$/);
    if (sub && block === 'verified') verified[sub[1]] = sub[2].trim();
    // `TOR: <date> <reason>`: a requirement recorded as not met, or (a prototype run) as not observed by anyone.
    if (sub && block === 'unverified') unverified[sub[1]] = sub[2].trim();
  }
  const requirements = (fields.requirements ?? '').match(/TOR-\d{2}-[A-Za-z0-9]{7}/g) ?? [];
  return { fields, verified, unverified, requirements };
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
    // The planner read the requirements against each other before planning (the driver's plan rules ask for this line).
    ['Requirements checked for contradictions', /Requirements checked for contradictions/i],
  ];
  for (const [name, re] of headings) if (!re.test(plan)) problems.push(`missing "${name}"`);
  const banned = [['git push', /\bgit\s+push\b/], ['sudo', /\bsudo\s+\S/], ['a container or VM command', /\b(docker|podman|colima|limactl|multipass|vagrant)\s+\S/]];
  for (const [name, re] of banned) if (re.test(plan)) problems.push(`contains ${name}`);
  return { pass: problems.length === 0, problems, anchors, checkedAt: new Date().toISOString() };
}

// ---- tests: which files under the project's test directories are tests -------------------------

/** The directories on the `**Test directories:**` line of a project's CLAUDE.md, each ending in `/`. */
export function parseTestDirs(text) {
  const m = String(text ?? '').match(/\*\*Test directories:\*\*\s*(.+)/);
  return m ? m[1].replace(/`/g, '').split(/[,\s]+/).filter(Boolean).map((d) => (d.endsWith('/') ? d : d + '/')) : [];
}
/** A project or package manifest under a test directory is not a test: adding a test dependency needs no recorded reason. */
export const MANIFEST = /\.(csproj|fsproj|vbproj|props|targets|sln)$|(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?)$/;
/**
 * A path whose own name, or a folder above it, says it is a test (`x.test.ts`, `x_test.go`,
 * `test_x.py`, `FooTests.cs`, `__tests__/`, `tests/`, `App.Tests/`).
 */
const TEST_FOLDER = /(^|\/)(__tests__|__snapshots__|tests?|specs?|e2e|cypress|[^/]*[._-]tests|[^/]*\.Tests?)\//i;
// Data files named for a specification (openapi-spec.yaml) are not tests; a snapshot beside its test is.
const TEST_FILE = /(^|\/)([^/]*[._-](test|spec|e2e|cy)s?\.(?!ya?ml$|json$|md$|txt$|toml$|xml$)[^/.]+|tests?\.[^/.]+|test_[^/]*\.py|conftest\.py|[^/]*\.feature|[^/]*\.snap)$/i;
const TEST_CLASS = /(^|\/)([^/]*Tests?\.(cs|fs|vb|java|kt|kts|scala|swift|php|groovy|dart|ts|tsx|js|jsx)|[^/]*Specs?\.(kt|kts|scala|groovy|ts|tsx|js|jsx)|Test[A-Z][^/]*\.(java|kt|cs)|[^/]*[a-z0-9]IT\.(java|kt))$/;
export const testNamed = (rel) => TEST_FOLDER.test(rel) || TEST_FILE.test(rel) || TEST_CLASS.test(rel);
/**
 * The listed test directories that hold at least one test-named file, given the files on the
 * integration line and in the epic's own work (its first tests count at once). In those, only test-named files are tests (seen live: `src/` listed because
 * tests sit beside the code, and every production file there was held to the rule for tests). A
 * listed directory with no such file keeps the plain rule: everything in it is a test.
 */
export const testNamedDirs = (files, dirs) => new Set(dirs.filter((d) => files.some((f) => f.startsWith(d) && testNamed(f))));
/** Whether `rel` (repo-relative, forward slashes) is a test: the one rule the referee and the driver share. */
export const isTestPath = (rel, dirs, named) => !MANIFEST.test(rel) && dirs.some((d) => rel.startsWith(d) && (!named.has(d) || testNamed(rel)));

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

/**
 * The owner's standing answer for small fixes the verifier recommends (`smallFixes` in the run's
 * config or the workspace's settings; `false` turns it off): how many per final check, and how big
 * the whole repair may be. Null when off.
 */
export const SMALL_FIXES = { perEpic: 2, files: 5, lines: 80 }; // seen live: a test race (4 files, 20 lines), a layout fix with its test (2 files, 48 lines)
/** Every problem the merge gate reports about a fix made on the standing answer starts with this. */
export const SMALL_FIX_PROBLEM = 'the fix made on the standing answer ';
/** A line that checks something or declares a test: a fix may change how a test waits, never how much it checks. */
export const TEST_CHECK_LINE = /\b(assert\w*|expect\w*|should\w*|verify\w*)\b|\[(Fact|Theory|Test|TestMethod|TestCase|InlineData)\b|^\s*(test|it|describe)\s*\(|\bdef test_|\bfunc Test/i;
/** A test that no longer runs: skipped, marked as expected to fail, or the one test of its file that runs. */
const TEST_OFF = /\b(it|test|describe|context|suite|bench)\.(skip|todo|only|fixme|failing)\b|\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(|@(Ignore|Disabled)\b|\[(Fact|Theory|Test|TestMethod)\b[^\]]*\bSkip\s*=|\bpytest\.mark\.(skip|skipif|xfail)\b|\bt\.skip\b|\bt\.Skip\(/;
/** A check that passes for nearly any value. */
const LOOSE_CHECK = /\.(toBeTruthy|toBeFalsy|toBeDefined)\(\s*\)|\.not\.(toThrow|toBeNull|toBeUndefined)\(\s*\)|\bassert\s+True\b|\bassertTrue\(\s*True\s*\)|\bassert\.ok\(\s*\)/;

/**
 * What a fix did to the tests it touched, from the changed lines of one test file's diff (`+…` and `-…`, no headers).
 * `lost`: it removes more checking lines than it adds. `off`: a test now skipped or the only one run. `loosened`: more
 * checks that pass for nearly anything than before. A heuristic, but it names what it saw, and a person decides.
 */
export function testWeakening(lines) {
  const ls = lines.filter((l) => /^[+-](?![+-])/.test(l));
  const checks = ls.filter((l) => TEST_CHECK_LINE.test(l.slice(1)));
  const count = (re, sign) => ls.filter((l) => l[0] === sign && re.test(l.slice(1))).length;
  return {
    lost: checks.filter((l) => l[0] === '-').length > checks.filter((l) => l[0] === '+').length,
    off: count(TEST_OFF, '+') > count(TEST_OFF, '-'),
    loosened: count(LOOSE_CHECK, '+') > count(LOOSE_CHECK, '-'),
  };
}

export function smallFixLimits(config) {
  const v = config?.smallFixes;
  if (v === false || v === 0) return null;
  const l = { ...SMALL_FIXES, ...(v && typeof v === 'object' ? v : {}) };
  return Number(l.perEpic) > 0 ? l : null;
}
/** The file in a verify step's directory that lists the questions the standing answer answered "Fix now". */
export const SMALL_FIX_FILE = 'small-fixes.json';

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
  // A full run asking the owner what a prototype run took (`reask`): the answer the prototype run gave makes it theirs and
  // the epic goes on from where it stood; any other answer goes back to the kind of session that asked.
  if (g.reask) return a === g.reask.took && g.reask.phase ? { phase: g.reask.phase, question: true } : STEP_PHASE[asked] ? { phase: STEP_PHASE[asked], question: true } : null;
  if (g.kind === 'resume') return a === ANSWERS.startOver ? { fresh: true } : a === ANSWERS.resume && g.phase ? { phase: g.phase } : null;
  if (g.kind === 'audit') return a === ANSWERS.startOver ? { fresh: true } : a === ANSWERS.auditNotReal ? { phase: 'VERIFY' } : a === ANSWERS.auditReal ? { phase: 'FIX_BUILD', fix: 'audit' } : null;
  if (g.kind === 'human-check') return a === ANSWERS.looksRight ? { phase: 'VERIFY', look: true } : a === ANSWERS.notRight ? { phase: 'FIX_BUILD', fix: 'look' } : null;
  if (g.kind === 'plan-lint') {
    const fix = asked === 'plan-fix';
    return a === ANSWERS.approvePlan ? { phase: fix ? 'FIX_BUILD' : 'BUILD', approve: true } : a === ANSWERS.replan ? { phase: fix ? 'FIX_BUILD' : 'PLAN' } : null;
  }
  // A question a session asked: the same kind of session again; hook R8 answers that one question once.
  return STEP_PHASE[asked] ? { phase: STEP_PHASE[asked], question: true } : null;
}

// ---- the standing answer for technical stops: what autopilot answers itself --------------------

export const gateLive = (g) => !g.decided?.used && !g.void && !g.superseded && !g.cleared;
/**
 * A stop that is nobody's decision and that running again can cure: an infra error, a step's own
 * time, turn or dollar cap, autopilot's own check on a finished build, an auditor that could not
 * run. Listed, not inferred. A gate the driver itself knows to be technical says so
 * (`technical: true`). The owner's own stop (the STOP file), a run limit (end time, run budget,
 * disk), a branch that no longer merges and anything else stay questions for the owner.
 */
const TECHNICAL_STOP = [
  /^infra error during /, /^budget: \S+ hit (wall clock|error_max_turns|error_max_budget_usd)\b/,
  /^CHECK_BUILD\b(?!.*deferral)/, /^interrupted: .*CHECK_BUILD/, /^auditor: .*(could not start|returned no usable result)/,
];
/** Why a gate was written: its `reason`, or (a gate from an earlier driver) the reason inside its question, or what its kind says. */
export const gateReason = (g) => g.reason ?? (String(g.question ?? '').match(/ stopped: ([\s\S]*)\. Continue it in the next run\?$/) ?? [])[1]
  ?? (g.kind === 'plan-lint' ? 'plan lint failed' : g.kind === 'audit' ? 'auditor: high findings' : '');
/** What the owner is offered once autopilot has used up its own answers for an epic. */
export const TRY_AGAIN = 'Try again';
export const LEAVE_IT = 'Leave it for now';
/**
 * The answer that takes a technical stop forward, whoever gives it; null when the gate is a
 * question only the owner answers. Pure: it reads the gate alone.
 *   resume gate, technical      → "Resume from where it stopped"
 *   plan-lint                   → "Re-plan"
 *   audit, findings treated as real (owner decision 2026-11-21), unless one says a paid service
 *   was never really called     → "Real — fix before verify"; "Start over" once the one repair is spent
 */
export function technicalAnswer(gate) {
  if (!gate || gate.decided || !gateLive(gate)) return null;
  const options = gate.options ?? [];
  if (gate.kind === 'resume') return gate.phase && options.includes(ANSWERS.resume) && (gate.technical === true || TECHNICAL_STOP.some((re) => re.test(gateReason(gate)))) ? ANSWERS.resume : null;
  if (gate.kind === 'plan-lint') return options.includes(ANSWERS.replan) ? ANSWERS.replan : null;
  if (gate.kind === 'audit') {
    const c = gate.categories;
    if (!Array.isArray(c) || !c.length || c.includes('never-ran-real') || !options.includes(ANSWERS.auditReal)) return null;
    return (gate.fixRounds ?? 0) < 1 ? ANSWERS.auditReal : ANSWERS.startOver;
  }
  return null;
}
// A question a prototype run answered (below) is not a technical stop: it has its own count.
const standingUsed = (gate, gates) => gates.filter((g) => g.epic === gate.epic && g.decided?.standing && !g.decided.prototype).length;
/**
 * The answer autopilot records for this gate without asking ("decide a technical stop yourself, up
 * to `n` times per epic": the owner's standing answer from launch), or null. One count per epic
 * for every kind of technical stop. Starting an epic over is never done without asking.
 */
export function standingAnswer(gate, gates, n) {
  const a = technicalAnswer(gate);
  if (!a || a === ANSWERS.startOver || !(Number(n) > 0)) return null;
  return standingUsed(gate, gates) < Number(n) ? a : null;
}
/**
 * A technical stop autopilot may not answer itself any more (the count is used up, there is no
 * standing answer, or the only way on is to start over): `{answer, stops}`, where `answer` is what
 * "Try again" records and `stops` counts this stop and the ones autopilot already answered. Null
 * for a gate autopilot answers, and for one that is the owner's own question.
 */
export function atLimit(gate, gates, n) {
  const answer = technicalAnswer(gate);
  return answer && !standingAnswer(gate, gates, n) ? { answer, stops: standingUsed(gate, gates) + 1 } : null;
}

// ---- a prototype run: the session's own recommendation is taken, and listed for the owner ------

/** How many questions per epic a prototype run answers with the session's own recommendation; one more goes to the owner. */
export const PROTOTYPE_LIMIT = 3;
/** Who a gate answered this way says decided it. */
export const PROTOTYPE_BY = 'autopilot (prototype run)';
/** What a verifier writes after the date on the `unverified:` line of a requirement nobody observed in a prototype run. */
export const NOT_OBSERVED = 'NOT OBSERVED';
/** The gates of one epic that a prototype run answered itself and that still stand. */
export const prototypeGates = (gates, epic) => gates.filter((g) => g.epic === epic && g.decided?.prototype && !g.void && !g.superseded && !g.cleared);
/** Of those, the ones a full run does not rely on and asks the owner about instead: a requirement amended, a requirement left for a later epic. */
export const prototypeReasked = (gates, epic) => prototypeGates(gates, epic).filter((g) => g.tor && ((g.kind === 'amendment' && /^\W*amend\b/i.test(g.decided.answer ?? '')) || (g.kind === 'deferral' && /^\W*defer\b/i.test(g.decided.answer ?? ''))));
/** The requirements of one epic whose deferral a prototype run took (the builder recommended it). */
export const prototypeDeferred = (gates, epic) => [...new Set(prototypeGates(gates, epic).filter((g) => g.kind === 'deferral' && /^\W*defer\b/i.test(g.decided.answer ?? '') && g.tor).map((g) => g.tor))];
/**
 * The requirements of one epic the owner themself answered "Defer" for: a deferral gate a person decided, that still
 * stands. Their decision holds in any run; one a prototype run took (`prototypeDeferred`) holds in a prototype run only.
 */
export const ownerDeferred = (gates, epic) => [...new Set(gates.filter((g) => g.epic === epic && g.kind === 'deferral' && g.tor && g.decided && !g.decided.prototype && !g.decided.standing && /^\W*defer\b/i.test(g.decided.answer ?? '') && !g.void && !g.superseded && !g.cleared).map((g) => g.tor))];
/** What a session's question recommends, in the skills' own wording ("Recommendation: Defer — …"): `Fix now`, `Defer`, `Stop`, or null. */
export function recommended(question) {
  const m = String(question ?? '').match(/\bRecommendation:\s*\**\s*(Fix now|Defer|Stop)\b/i);
  return m ? { 'fix now': 'Fix now', defer: 'Defer', stop: 'Stop' }[m[1].toLowerCase()] : null;
}
/**
 * The answer a prototype run gives to a question that parks a full run, or `{why}` when it goes
 * to the owner after all, or null when the kind is not one a prototype run answers. Pure.
 *   amendment → the "Amend TOR-…" option, when the session offers it (it never does for Safety)
 *   deferral  → what the session recommends, when that is "Fix now" or "Defer"
 * Only for one of the epic's own requirements, once per requirement, `PROTOTYPE_LIMIT` per epic.
 * `taken` is what was already answered this way for the epic: `[{kind, tor}]`.
 */
export function prototypeAnswer({ kind, question, labels, tor, anchors, taken }) {
  if (kind !== 'amendment' && kind !== 'deferral') return null;
  let answer = null;
  if (kind === 'amendment') answer = labels.find((l) => new RegExp(`^\\W*Amend\\s+${tor ?? 'TOR-\\S+'}\\b`, 'i').test(l)) ?? null;
  else {
    const rec = recommended(question);
    const fits = labels.filter((l) => (rec === 'Fix now' ? /^\W*fix now\b/i : rec === 'Defer' ? /^\W*defer\b/i : /^$/).test(l));
    answer = fits.length === 1 ? fits[0] : null;
  }
  if (!answer) return null; // no "Amend" on offer, "Stop" recommended, or no recommendation to read: the owner's, as in a full run
  if (!tor || !anchors.includes(tor)) return { why: 'the question does not name one of this epic\'s own requirements, so the prototype setting does not cover it' };
  if (taken.some((x) => x.tor === tor)) return { why: `the prototype setting covers one answer per requirement, and ${tor} already had one in this epic` };
  if (taken.length >= PROTOTYPE_LIMIT) return { why: `the prototype setting covers ${PROTOTYPE_LIMIT} answers per epic, and this is one more` };
  return { answer };
}
