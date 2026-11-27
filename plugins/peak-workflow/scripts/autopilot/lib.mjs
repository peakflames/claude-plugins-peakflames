// Shared by the driver and the referee hooks: one implementation of each parse and lint.
import os from 'node:os';
import path from 'node:path';

/**
 * A path as a Bash command (or a CLAUDE.md line) names it, as Windows names it. Claude Code runs commands in Git Bash
 * there, where a drive is `/c/…` and `/tmp` is the user's temp directory; Node and the file tools say `C:\…`. Elsewhere
 * the path is unchanged.
 */
export function fromBash(p, platform = process.platform) {
  const s = String(p);
  if (platform !== 'win32') return s;
  let m = s.match(/^\/([A-Za-z])(\/.*)?$/);
  if (m) return `${m[1].toUpperCase()}:${(m[2] ?? '/').replace(/\//g, '\\')}`;
  m = s.match(/^\/tmp(\/.*)?$/);
  if (m) return path.join(os.tmpdir(), m[1] ?? '');
  return s;
}

/** A status sidecar: `key: value` lines, plus indented `TOR: fingerprint` lines under `verified:`. */
export function parseSidecar(text) {
  const fields = {}; const verified = {}; const unverified = {};
  let block = null;
  for (const line of (text ?? '').split(/\r?\n/)) {
    const top = line.match(/^([a-z_]+):\s*(.*)$/);
    if (top) { fields[top[1]] = top[2].trim(); block = top[2].trim() === '' ? top[1] : null; continue; }
    const sub = line.match(/^\s+(TOR-\d{2}-[A-Za-z0-9]{7}):\s*(.+)$/);
    if (sub && block === 'verified') verified[sub[1]] = sub[2].trim();
    // `TOR: <date> <reason>`: a requirement recorded as not met, or (a provisional run) as not observed by anyone.
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
  verifyAsBuilt: 'Verify as built', reviewAgain: 'Review again',
};
/**
 * A thin independent review (#40 item 16): the reviewer read fewer than `share` of the changed code files, at most `cap`
 * needed (40 turns must reach it on a large epic), or checked no test for one of the requirements. Run once more, then asked.
 */
export const THIN_REVIEW = { share: 0.5, cap: 15 };
/** Lockfiles: changed with their dependency list, they are ordinary work; the reviewer need not read them. */
export const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|go\.sum|composer\.lock)$/;
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
export const TEST_CHECK_LINE = /\b(assert\w*|expect\w*|should\w*|verify\w*)\b|\bXCTAssert\w*|\bt\.(Error|Errorf|Fatal|Fatalf|Fail|FailNow)\(|#\[(tokio::)?test\]|\[(Fact|Theory|Test|TestMethod|TestCase|InlineData)\b|^\s*(test|it|describe)\s*\(|\bdef test_|\bfunc Test/i;
/** A test that no longer runs: skipped, marked as expected to fail, or the one test of its file that runs. */
const TEST_OFF = /\b(it|test|describe|context|suite|bench)\.(skip|todo|only|fixme|failing)\b|\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(|@(Ignore|Disabled)\b|\[(Fact|Theory|Test|TestMethod)\b[^\]]*\bSkip\s*=|^\s*\[([^\]]*[,\s])?Ignore\b|\bpytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.skip\(|\bself\.skipTest\(|@unittest\.(skip\w*|expectedFailure)\b|@skip\b|\bthis\.skip\(\s*\)|#\[ignore\b|\bt\.skip\b|\bt\.Skip\(/;
/** A literal, for a check that compares a value with itself. */
const LIT = String.raw`(true|false|True|False|null|None|nil|undefined|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")`;
/** A check that passes for any value: a bare truthiness check, or a tautology. */
const LOOSE_CHECKS = [
  /\.(toBeTruthy|toBeFalsy|toBeDefined)\(\s*\)|\.not\.(toThrow|toBeNull|toBeUndefined)\(\s*\)|\bassert\s+True\b|\bassertTrue\(\s*True\s*\)|\bassert\.ok\(\s*\)/,
  new RegExp(String.raw`\bexpect\(\s*${LIT}\s*\)\.(toBe|toEqual|toStrictEqual)\(\s*\1\s*\)`),
  new RegExp(String.raw`(\bassert(\.\w+|\w*)!?|\bXCTAssert\w*)\(\s*${LIT}\s*,\s*\3\s*[,)]`),
  /(\bassert(\.ok|True|_true)?!?|\bXCTAssertTrue)\(\s*(true|True|1)\s*[,)]/,
  new RegExp(String.raw`\bassert\s+${LIT}\s*==\s*\1\s*($|,|#)`),
];
const LOOSE_CHECK = { test: (s) => LOOSE_CHECKS.some((re) => re.test(s)) };
/** A bound nothing misses: an everyday check in a new test, loose only in place of a stricter one the fix removed. */
const RELAXED_CHECK = /\.toBeGreaterThan\(\s*(0|-1)\s*\)|\.toBeGreaterThanOrEqual\(\s*0\s*\)|\.toBeLessThan(OrEqual)?\(\s*(Infinity|Number\.(POSITIVE_INFINITY|MAX_SAFE_INTEGER|MAX_VALUE))\s*\)|\.toBeInstanceOf\(\s*Object\s*\)|\bassertIsNotNone\(|\bassertIn\([^,]*,\s*range\(|\bassert\s+[\w.]+\s+is\s+not\s+None\b/;
/** Structure that keeps a check from ever running: a dead branch. */
const DEAD_BRANCH = /\bif\s*\(\s*(false|0)\s*\)|\bif\s+(False|false|0)\s*[:{]/g;
/**
 * A catch that swallows a failure. It hides a check when it wraps lines the fix left alone (its `try` is in another
 * hunk, or not added at all) or a check in its own `try`; an empty catch around cleanup (`try { rmSync(tmp) } catch {}`) is not.
 */
const SWALLOW = /\bcatch\s*(\([^)]*\))?\s*\{\s*\}|\bexcept\b[^:\n]*:\s*pass\b/g;
/** A real diff header, which only comes before a file's first hunk. */
const DIFF_HEADER = /^(--- (a\/|\/dev\/null)|\+\+\+ (b\/|\/dev\/null))/;

/**
 * What a fix did to the tests it touched, from one test file's diff (`-U0`, headers allowed) or its bare changed lines.
 * `lost`: it removes more checking lines than it adds. `off`: a test now skipped or the only one run. `loosened`: more
 * checks that pass for nearly anything than before. `wrapped`: more structure that keeps a check from running or failing.
 * A changed expected value of the same kind (`toBe(3)` → `toBe(4)`) is none of these: the owner accepted that.
 * A heuristic, but it names what it saw, and a person decides.
 */
export function testWeakening(lines) {
  const hunked = lines.some((l) => l.startsWith('@@'));
  let body = !hunked; let hunk = 0; const ls = []; const hunkOf = [];
  for (const l of lines) {
    if (l.startsWith('diff --git ')) { body = !hunked; hunk++; }
    else if (l.startsWith('@@')) { body = true; hunk++; }
    else if (/^[+-]/.test(l) && body && (hunked || !DIFF_HEADER.test(l))) { ls.push(l); hunkOf.push(hunk); }
  }
  const checks = ls.filter((l) => TEST_CHECK_LINE.test(l.slice(1)));
  const count = (re, sign) => ls.filter((l) => l[0] === sign && re.test(l.slice(1))).length;
  const removed = checks.filter((l) => l[0] === '-').length;
  // Each hunk's lines of one sign, as text, so a construct may span lines.
  const texts = (sign) => [...new Set(hunkOf)].map((h) => ls.filter((l, i) => hunkOf[i] === h && l[0] === sign).map((l) => l.slice(1)).join('\n'));
  const hides = (t) => [...t.matchAll(SWALLOW)].filter((m) => {
    const before = t.slice(0, m.index); const at = before.lastIndexOf('try');
    return at < 0 || before.slice(at).split('\n').some((l) => TEST_CHECK_LINE.test(l));
  }).length;
  const wraps = (sign) => texts(sign).reduce((n, t) => n + [...t.matchAll(DEAD_BRANCH)].length + hides(t), 0);
  return {
    lost: removed > checks.filter((l) => l[0] === '+').length,
    off: count(TEST_OFF, '+') > count(TEST_OFF, '-'),
    loosened: count(LOOSE_CHECK, '+') > count(LOOSE_CHECK, '-') || (removed > 0 && count(RELAXED_CHECK, '+') > count(RELAXED_CHECK, '-')),
    wrapped: wraps('+') > wraps('-'),
  };
}
/**
 * Whether the merge gate judges `rel` as a test: what the referee calls a test, or any test-named file outside the
 * listed directories (`src/a.test.ts` with only `test/` listed). The referee keeps `isTestPath`.
 */
export const checkedAsTest = (rel, dirs, named) => isTestPath(rel, dirs, named) || (testNamed(rel) && !MANIFEST.test(rel) && !EXPECTED_DATA.test(rel));
// Outside the listed directories a data file is never a test (`config/test.json`, `specs/openapi.yaml`): only a fixtures folder makes it expected output.
const EXPECTED_DATA = /\.(json|ya?ml|txt|snap|html?|xml|csv|golden|out|expected)$/i;
const EXPECTED_FOLDER = /(^|\/)(fixtures?|golden|testdata|expected|__snapshots__)\//i;
const CONFIG_NAME = /(^|\/)(\.[^/]*|[tj]sconfig[^/]*)$/i;
/** A data file a test compares with (an expected output, a fixture, a snapshot): rewriting one can make a test pass unseen. */
export const isExpectedOutput = (rel, dirs, named) => EXPECTED_DATA.test(rel) && !CONFIG_NAME.test(rel) && !MANIFEST.test(rel) && (checkedAsTest(rel, dirs, named) || EXPECTED_FOLDER.test(rel));

export function smallFixLimits(config) {
  const v = config?.smallFixes;
  if (v === false || v === 0) return null;
  const l = { ...SMALL_FIXES, ...(v && typeof v === 'object' ? v : {}) };
  return Number(l.perEpic) > 0 ? l : null;
}
/**
 * The verifier's question about a defect it saw in this epic's own work that no requirement or gate covers (wrapup-epic
 * Step 1.4b): `Seen but not fixed yet: <what, where>. Recommendation: <Fix now | Leave as is> — <why>. How to proceed?`
 */
export const DEFECT_Q = /^\W*seen but not fixed yet\b\s*[:—–-]/i;
/** The answer that leaves such a defect for the owner to read about, listed in the report. */
export const LEAVE_AS_IS = 'Leave as is';
/** The file in a verify step's directory that lists the questions the standing answer answered "Fix now". */
export const SMALL_FIX_FILE = 'small-fixes.json';

const STEP_PHASE = { plan: 'PLAN', 'plan-fix': 'FIX_BUILD', build: 'BUILD', fix: 'FIX_BUILD', audit: 'AUDIT', verify: 'VERIFY', catchup: 'CATCH_UP' };
const stepKind = (session) => String(session ?? '').replace(/-\d+$/, '');

/**
 * Where a decided gate re-enters the epic (the Part 2 table). Returns `{phase}` plus what that
 * phase needs, `{fresh: true}` for a start from scratch, or null when the gate cannot be resumed.
 */
export function gateEntry(g) {
  const a = g.decided?.answer; const asked = stepKind(g.session);
  if (!a) return null;
  if (g.kind === 'preflight') return null; // the fix is in the project; it clears when preflight passes
  // A full run asking the owner what a provisional run took (`reask`): the answer the provisional run gave makes it theirs and
  // the epic goes on from where it stood; any other answer goes back to the kind of session that asked.
  if (g.reask) return a === g.reask.took && g.reask.phase ? { phase: g.reask.phase, question: true } : STEP_PHASE[asked] ? { phase: STEP_PHASE[asked], question: true } : null;
  if (g.kind === 'resume') return a === ANSWERS.startOver ? { fresh: true } : a === ANSWERS.resume && g.phase ? { phase: g.phase } : null;
  if (g.kind === 'audit') return a === ANSWERS.startOver ? { fresh: true } : a === ANSWERS.auditNotReal ? { phase: 'VERIFY' } : a === ANSWERS.auditReal ? { phase: 'FIX_BUILD', fix: 'audit' } : null;
  if (g.kind === 'thin-review') return a === ANSWERS.verifyAsBuilt ? { phase: 'VERIFY' } : a === ANSWERS.reviewAgain ? { phase: 'AUDIT' } : null;
  if (g.kind === 'human-check') return a === ANSWERS.looksRight ? { phase: 'VERIFY', look: true } : a === ANSWERS.notRight ? { phase: 'FIX_BUILD', fix: 'look' } : null;
  if (g.kind === 'plan-lint') {
    const fix = asked === 'plan-fix';
    return a === ANSWERS.approvePlan ? { phase: fix ? 'FIX_BUILD' : 'BUILD', approve: true } : a === ANSWERS.replan ? { phase: fix ? 'FIX_BUILD' : 'PLAN' } : null;
  }
  // A question a session asked: the same kind of session again; hook R8 answers that one question once.
  return STEP_PHASE[asked] ? { phase: STEP_PHASE[asked], question: true } : null;
}

// ---- the standing answer for technical stops: what autopilot answers itself --------------------

// `restarted`: a decided gate whose branch no longer fit; a newer gate (`restartGate` in driver.mjs) brings it up to date and carries this answer on.
export const gateLive = (g) => !g.decided?.used && !g.void && !g.superseded && !g.cleared && !g.restarted;
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
// A question a provisional run answered (below) is not a technical stop: it has its own count.
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
 * standing answer, or the only way on is to start over): `{answer, stops, standing, owner}`, where `answer` is what
 * "Try again" records and `stops` counts this stop and the epic's earlier technical stops, whoever answered them
 * (`technicalStops`). Null
 * for a gate autopilot answers, and for one that is the owner's own question.
 */
export function atLimit(gate, gates, n) {
  const answer = technicalAnswer(gate);
  if (!answer || standingAnswer(gate, gates, n)) return null;
  const { standing, owner } = technicalStops(gate, gates);
  return { answer, stops: standing + owner + 1, standing, owner };
}
/** Whether a gate was a technical stop, whatever became of it: the shape `technicalAnswer` judges, without its "still undecided" check. */
const wasTechnical = (g) => Boolean(technicalAnswer({ ...g, decided: null, void: false, superseded: false, cleared: false, restarted: false }));
/**
 * This epic's technical stops that were already answered, by who answered: `standing` (autopilot, on the owner's standing
 * answer; the count `standingAnswer` keeps) and `owner` (a "Try again", or the owner's own answer to such a gate). A
 * question a provisional run answered is in neither: it has its own count (`PROTOTYPE_LIMIT`).
 */
export function technicalStops(gate, gates) {
  const mine = gates.filter((g) => g.epic === gate.epic && g.decided && !g.decided.prototype) // the gate asked about is undecided, so never among them;
  return { standing: mine.filter((g) => g.decided.standing).length, owner: mine.filter((g) => !g.decided.standing && wasTechnical(g)).length };
}

// ---- a provisional run: the session's own recommendation is taken, and listed for the owner ------

/** How many questions per epic a provisional run answers with the session's own recommendation; one more goes to the owner. */
export const PROTOTYPE_LIMIT = 3;
/**
 * A provisional run: the AI decides now, the owner confirms later. Its `mode` was "prototype" before 3.1.0,
 * and runs' config.json, events and state from then still say so: both read as provisional. The fields that
 * mark what such a run decided (`decided.prototype`, `e.prototype`, the `prototype-answer` event) keep their
 * stored names.
 */
export const isProvisional = (mode) => mode === 'provisional' || mode === 'prototype';
/** Who a gate answered this way says decided it, and the `approved_by` of a change record nobody approved. */
export const PROVISIONAL_BY = 'autopilot (provisional run)';
/** The same, as written before 3.1.0: project files keep it, and it still means nobody approved. */
export const UNAPPROVED_BY = [PROVISIONAL_BY, 'autopilot (prototype run)'];
/** What a verifier writes after the date on the `unverified:` line of a requirement nobody observed in a provisional run. */
export const NOT_OBSERVED = 'NOT OBSERVED';
/** The gates of one epic that a provisional run answered itself and that still stand. */
export const prototypeGates = (gates, epic) => gates.filter((g) => g.epic === epic && g.decided?.prototype && !g.void && !g.superseded && !g.cleared);
/** Of those, the ones a full run does not rely on and asks the owner about instead: a requirement amended, a requirement left for a later epic. */
export const prototypeReasked = (gates, epic) => prototypeGates(gates, epic).filter((g) => g.tor && ((g.kind === 'amendment' && /^\W*amend\b/i.test(g.decided.answer ?? '')) || (g.kind === 'deferral' && /^\W*defer\b/i.test(g.decided.answer ?? ''))));
/** The requirements of one epic whose deferral a provisional run took (the builder recommended it). */
export const prototypeDeferred = (gates, epic) => [...new Set(prototypeGates(gates, epic).filter((g) => g.kind === 'deferral' && /^\W*defer\b/i.test(g.decided.answer ?? '') && g.tor).map((g) => g.tor))];
/**
 * The requirements of one epic the owner themself answered "Defer" for: a deferral gate a person decided, that still
 * stands. Their decision holds in any run; one a provisional run took (`prototypeDeferred`) holds in a provisional run only.
 */
export const ownerDeferred = (gates, epic) => [...new Set(gates.filter((g) => g.epic === epic && g.kind === 'deferral' && g.tor && g.decided && !g.decided.prototype && !g.decided.standing && /^\W*defer\b/i.test(g.decided.answer ?? '') && !g.void && !g.superseded && !g.cleared).map((g) => g.tor))];
/** What a session's question recommends, in the skills' own wording ("Recommendation: Defer — …"): `Fix now`, `Defer`, `Stop`, or null. */
export function recommended(question) {
  const m = String(question ?? '').match(/\bRecommendation:\s*\**\s*(Fix now|Defer|Stop)\b/i);
  return m ? { 'fix now': 'Fix now', defer: 'Defer', stop: 'Stop' }[m[1].toLowerCase()] : null;
}
/**
 * The failing tests a test run's last lines name, in the runner's own words: node's `✖`, TAP's `not ok`, pytest's
 * `FAILED`, jest's `✕` (and its `FAIL <file>`, a file rather than a test), go's `--- FAIL:`, Bun's `(fail)`, and
 * Playwright's numbered `1) [chromium] › file:line › title`. At most `max`, each once.
 * Summary lines are not tests: "✖ failing tests:", go's bare `FAIL` and `FAIL <package> <time>`, unittest's
 * `FAILED (failures=1)`, "✕ 2 tests failed", and a TAP `not ok` marked TODO or SKIP.
 */
export function failingTests(tail, max = 5) {
  const out = [];
  for (const raw of String(tail ?? '').split('\n')) {
    const l = raw.trim();
    if (!/^(✖|✕|×|not ok\b|FAILED\b|FAIL\b|--- FAIL:|\(fail\)\s|\d+\)\s+\[[^\]]+\]\s+›)/.test(l)) continue;
    if (/^✖\s*failing tests:?$/i.test(l) || /^FAIL$/.test(l) || /^FAIL\s+\S+\s+[\d.]+s$/.test(l) || /^FAILED\s*\(/.test(l) || /^[✖✕×]\s*\d+\s+(of\s+\d+\s+)?tests?\s+failed/i.test(l) || /^not ok\b.*#\s*(TODO|SKIP)\b/i.test(l)) continue;
    const name = l.replace(/^\d+\)\s+/, '').replace(/\s*[([]\d[\d.]*\s*m?s[)\]]\s*$/, '');
    if (!out.includes(name)) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** The two options a test that already fails on the base is asked with (wrapup-epic Step 1.4b), besides Stop. */
export const PRE_EXISTING = ['Accept as pre-existing', 'Fix on this branch'];
const sameText = (a, b) => String(a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
/**
 * The answer a provisional run gives to a question that parks a full run, or `{why}` when it goes
 * to the owner after all, or null when the kind is not one a provisional run answers. Pure.
 *   amendment    → the "Amend TOR-…" option, when the session offers it (it never does for Safety)
 *   deferral     → what the session recommends, when that is "Fix now" or "Defer"
 *   pre-existing → what the session recommends, when that is "Accept as pre-existing" or "Fix on this branch"
 * Only for one of the epic's own requirements (a pre-existing failure names none: once per question), once per
 * requirement, `PROTOTYPE_LIMIT` per epic. `taken` is what was already answered this way for the epic: `[{kind, tor, question}]`.
 */
export function prototypeAnswer({ kind, question, labels, tor, anchors, taken }) {
  if (kind === 'pre-existing') {
    const rec = PRE_EXISTING.find((l) => new RegExp(`\\bRecommendation:\\s*\\**\\s*${l}\\b`, 'i').test(String(question ?? '')));
    const answer = rec ? labels.find((l) => sameText(l, rec)) ?? null : null;
    if (!answer) return null; // "Stop" recommended, or no recommendation to read: the owner's
    if (taken.some((x) => x.kind === 'pre-existing' && sameText(x.question, question))) return { why: 'the provisional setting covers one answer per question, and this one already had one in this epic' };
    if (taken.length >= PROTOTYPE_LIMIT) return { why: `the provisional setting covers ${PROTOTYPE_LIMIT} answers per epic, and this is one more` };
    return { answer };
  }
  if (kind !== 'amendment' && kind !== 'deferral') return null;
  let answer = null;
  if (kind === 'amendment') answer = labels.find((l) => new RegExp(`^\\W*Amend\\s+${tor ?? 'TOR-\\S+'}\\b`, 'i').test(l)) ?? null;
  else {
    const rec = recommended(question);
    const fits = labels.filter((l) => (rec === 'Fix now' ? /^\W*fix now\b/i : rec === 'Defer' ? /^\W*defer\b/i : /^$/).test(l));
    answer = fits.length === 1 ? fits[0] : null;
  }
  if (!answer) return null; // no "Amend" on offer, "Stop" recommended, or no recommendation to read: the owner's, as in a full run
  if (!tor || !anchors.includes(tor)) return { why: 'the question does not name one of this epic\'s own requirements, so the provisional setting does not cover it' };
  if (taken.some((x) => x.tor === tor)) return { why: `the provisional setting covers one answer per requirement, and ${tor} already had one in this epic` };
  if (taken.length >= PROTOTYPE_LIMIT) return { why: `the provisional setting covers ${PROTOTYPE_LIMIT} answers per epic, and this is one more` };
  return { answer };
}

// ---- estimating what a stopped session spent ---------------------------------------------------------------------

/**
 * Per-million-token prices (USD) of the models a session can run, from the Claude API reference (cached 2026-11-03).
 * `cacheRead` is listed only where it is not 0.1× input. Longest prefix first: `claude-fable-5` must not take 5.1/5.2.
 */
export const PRICES = [
  ['claude-fable-5-2', { input: 8, output: 40, cacheRead: 0.2 }],
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25 }],
  ['claude-opus-4-8', { input: 5, output: 25 }],
  ['claude-opus-4-7', { input: 5, output: 25 }],
  ['claude-opus-4-6', { input: 5, output: 25 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.1 }],
  ['claude-sonnet-5', { input: 2, output: 10 }],
  ['claude-sonnet-4-6', { input: 3, output: 15 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5 }],
  ['claude-haiku-4-5', { input: 1, output: 5 }],
];

/** The price row for a model id; date suffixes and `[1m]` are ignored. A prefix must end at the id or at a `-`. */
export function priceOf(model) {
  const id = String(model ?? '').replace(/\[[^\]]*\]$/, '');
  for (const [prefix, p] of PRICES) if (id === prefix || id.startsWith(`${prefix}-`)) return p;
  return null;
}

/**
 * What a session that never wrote its `result` line spent, from the `usage` of its assistant messages.
 * `usageByMessage`: message id → { model, usage } (the last line seen for that id: usage only grows while it streams).
 * A model not in PRICES adds its tokens but no dollars, and is named in `unpriced`.
 */
export function estimateCost(usageByMessage) {
  let usd = 0; let tokens = 0; const unpriced = new Set();
  for (const { model, usage: u = {} } of usageByMessage instanceof Map ? usageByMessage.values() : Object.values(usageByMessage ?? {})) {
    const write = u.cache_creation_input_tokens ?? 0;
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const w5m = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, write - w1h);
    const input = u.input_tokens ?? 0; const read = u.cache_read_input_tokens ?? 0; const output = u.output_tokens ?? 0;
    tokens += input + read + w5m + w1h + output;
    const p = priceOf(model);
    if (!p) { unpriced.add(String(model ?? 'unknown')); continue; }
    usd += (input * p.input + read * (p.cacheRead ?? p.input * 0.1) + w5m * p.input * 1.25 + w1h * p.input * 2 + output * p.output) / 1e6;
  }
  return { usd: +usd.toFixed(6), tokens, unpriced: [...unpriced] };
}

// ---- Connectors (MCP tools; issue #43, owner decisions 2026-11-25) ------------------------------
// Sessions may use every connector the owner has set up: accounts for reading only, browser tools on the app's local pages.

/** The action words of a read: the first word of a connector tool's action must be one of them. */
// Not `fetch` (a fetch server is WebFetch again, which sessions are denied) nor `export` (it can write a file or a copy).
export const READ_WORDS = ['get', 'list', 'search', 'read', 'query', 'find', 'view', 'describe', 'guide', 'lookup', 'show', 'count'];
/** Words that make any action a change, wherever they stand (`get_or_create_label`). Unknown words fall on the deny side anyway. */
const CHANGE_WORDS = new Set(['create', 'update', 'upsert', 'delete', 'remove', 'send', 'trash', 'forward', 'reply', 'write', 'modify', 'set', 'add', 'edit', 'insert', 'replace', 'post', 'publish', 'upload', 'submit', 'apply', 'move', 'archive', 'mark', 'share', 'invite', 'approve', 'merge', 'assign', 'execute', 'run']);
const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** `mcp__<server>__<action>` → `{ server, action, label }`; `label` is how the owner knows it ("Gmail", "Google Calendar"). Null for any other tool. */
export function mcpTool(name) {
  const parts = String(name ?? '').split('__');
  if (parts[0] !== 'mcp' || parts.length < 3) return null;
  const server = parts[1]; const action = parts.slice(2).join('__');
  return { server, action, label: server.replace(/^claude_ai_/, '').replace(/_/g, ' ') };
}
/** A browser tool (Playwright MCP's are all `browser_…`): used on the app's own pages, not for reading an account. */
export const isBrowserAction = (action) => /^browser_/.test(String(action ?? ''));
/** A connector action that only reads, by its name. A first word that names the server is skipped (`slack_search_public`, `notion-search`). */
export function isReadAction(action, server = '') {
  const w = words(action);
  if (w.length > 1 && words(server).includes(w[0])) w.shift();
  return w.length > 0 && READ_WORDS.includes(w[0]) && !w.some((x) => CHANGE_WORDS.has(x));
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);
export const isLocalHost = (h) => LOCAL_HOSTS.has(h) || String(h).endsWith('.localhost') || /^127\.\d+\.\d+\.\d+$/.test(h);
/** A page address as a browser tool takes it (`localhost:3000` is http), parsed; null when it is not one. */
export function pageAddress(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^(about|data|javascript|blob|file|chrome|view-source):/i.test(s)) s = `http://${s}`;
  try { return new URL(s); } catch { return null; }
}
/** The page addresses a browser call's result names (`Page URL: …`), from its log line. */
export function pageUrls(h) {
  if (Array.isArray(h?.page_urls)) return h.page_urls;
  const text = typeof h?.tool_response === 'string' ? h.tool_response : JSON.stringify(h?.tool_response ?? '');
  return [...text.matchAll(/Page URL:\s*([^\s"\\]+)/g)].map((m) => m[1]);
}

/**
 * What one step's sessions did with connectors, from its referee log rows: `{ calls: [{tool, n}], denied: [{tool, reason}],
 * local: [hosts], offsite: [addresses] }`. An off-site page is one a browser call ended on that is not local (an OAuth
 * sign-in the app redirected to); it is kept without its query, which can hold a sign-in code.
 */
export function connectorUse(rows) {
  const calls = new Map(); const denied = []; const local = new Set(); const offsite = new Set();
  for (const h of rows ?? []) {
    const t = mcpTool(h?.tool_name);
    if (!t) continue;
    const tool = `${t.label} ${t.action}`;
    if (h.hook === 'PreToolUse' && h.decision === 'deny') denied.push({ tool, reason: h.reason ?? null });
    if (h.hook !== 'PostToolUse') continue;
    calls.set(tool, (calls.get(tool) ?? 0) + 1);
    if (!isBrowserAction(t.action)) continue;
    for (const raw of pageUrls(h)) {
      const u = pageAddress(raw);
      if (!u || u.protocol === 'about:' || u.protocol === 'file:') continue;
      if (isLocalHost(u.hostname)) local.add(u.hostname); else offsite.add(`${u.origin}${u.pathname}`);
    }
  }
  return { calls: [...calls].map(([tool, n]) => ({ tool, n })), denied, local: [...local], offsite: [...offsite] };
}
/** Several steps' use, added up. */
export function mergeConnectorUse(list) {
  const calls = new Map(); const out = { denied: [], local: new Set(), offsite: new Set() };
  for (const u of list) {
    for (const c of u.calls) calls.set(c.tool, (calls.get(c.tool) ?? 0) + c.n);
    out.denied.push(...u.denied); u.local.forEach((x) => out.local.add(x)); u.offsite.forEach((x) => out.offsite.add(x));
  }
  return { calls: [...calls].map(([tool, n]) => ({ tool, n })), denied: out.denied, local: [...out.local], offsite: [...out.offsite] };
}
/** One line for the report: "Gmail search_threads ×3; browser on localhost and accounts.google.com (sign-in)". Null when nothing was used. */
export function connectorLine(u) {
  if (!u || (!u.calls.length && !u.denied.length)) return null;
  const parts = u.calls.filter((c) => !/ browser_/.test(c.tool)).map((c) => `${c.tool} ×${c.n}`);
  const hosts = [...u.local, ...[...new Set(u.offsite.map((a) => { try { return new URL(a).hostname; } catch { return a; } }))].map((h) => `${h} (off-site)`)];
  if (u.calls.some((c) => / browser_/.test(c.tool))) parts.push(`browser${hosts.length ? ` on ${hosts.join(' and ')}` : ''}`);
  if (u.denied.length) parts.push(`${u.denied.length} refused`);
  return parts.join('; ');
}

/**
 * `claude mcp list` → `[{ name, source, status }]`. Its lines are `<name>: <address or command> - <mark> <status>`;
 * `source` is `claude.ai` (an account connector), `plugin` or `local`; `status` is `connected`, `needs-sign-in`,
 * `failed` or `not-configured`. "Connected" there is a health check, not proof a session can use it.
 */
export function parseMcpList(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^(.+?): (.*) - [^\w\s]+ (.+?)\s*$/); // the mark: ✔ ! ✗ or -
    if (!m) continue;
    let name = m[1].trim(); let source = 'local';
    if (/^claude\.ai /.test(name)) { source = 'claude.ai'; name = name.slice('claude.ai '.length); }
    else if (/^plugin:/.test(name)) { source = 'plugin'; name = name.split(':').slice(2).join(':') || name; }
    const s = m[3].toLowerCase();
    const status = /^connected/.test(s) ? 'connected' : /auth|sign/.test(s) ? 'needs-sign-in' : /not configured/.test(s) ? 'not-configured' : 'failed';
    out.push({ name, source, status });
  }
  return out;
}
