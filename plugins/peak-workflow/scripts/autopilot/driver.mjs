#!/usr/bin/env node
// peak-workflow autopilot driver (PoC). Node 22+, no dependencies.
//
//   node driver.mjs preflight --project <dir> [--workspace <dir>] [--json]
//   node driver.mjs run [--project <dir>] [--workspace <dir>] [--run <name>] [--queue id,id]
//                       [--dry-run] [--resume] [--claude-bin <path>] [--allow-test-double]
//   node driver.mjs stop --workspace <dir>
//   node driver.mjs report --workspace <dir> [--run <name>]   re-render report.md and report.json
//   node driver.mjs decide --workspace <dir> --gate <file> --answer <text> [--note <text>]
//
// The workspace (`<project>.autopilot` by default) is one per project and long-lived: the private
// clone, every gate and the owner's settings.json live there; each run gets `runs/<timestamp>/`.
// `--state` is accepted as an alias of `--workspace`.
//
// Design: plugins/peak-workflow/docs/autopilot-poc-plan.md §6 and §9; SPIKE.md wins where they
// differ. The driver is a plain script: it launches one headless Claude Code session per step,
// and judges every step from files and git, never from what a session says about itself.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { AUDIT_DIR, SCHEMA, auditOutput, buildBundle, judgeAudit, validateAudit } from './audit.mjs';
import { ANSWERS, gateEntry, lintPlan, parseSidecar } from './lib.mjs';
import { writeReport } from './report.mjs';

export { ANSWERS, gateEntry, lintPlan, parseSidecar };

export const DRIVER_VERSION = '0.3.0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_DIR = path.resolve(HERE, '..', '..');

const TERMINAL = new Set(['MERGED', 'PARKED', 'FAILED', 'SKIPPED', 'BLOCKED']);
const KINDS = {
  plan: { prefix: 'plan', role: 'planner', state: 'PLAN' },
  build: { prefix: 'build', role: 'builder', state: 'BUILD' },
  verify: { prefix: 'verify', role: 'verifier', state: 'VERIFY' },
  fix: { prefix: 'fix', role: 'builder', state: 'FIX_BUILD' },
  audit: { prefix: 'audit', role: 'auditor', state: 'AUDIT' },
};
const PLAN_DIR = 'docs/implementation-plan';

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
const writeJson = (file, value) => writeAtomic(file, JSON.stringify(value, null, 2) + '\n');

/** The environment for every child: ours, minus what would change a nested `node --test`. */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status ?? (r.signal ? 128 : 1), out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim(), timedOut: r.error?.code === 'ETIMEDOUT' };
}
const gitRun = (cwd, ...args) => sh('git', args, { cwd });
function git(cwd, ...args) {
  const r = gitRun(cwd, ...args);
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed (${r.code}): ${r.err || r.out}`);
  return r.out;
}
const gitOk = (cwd, ...args) => gitRun(cwd, ...args).code === 0;
const gitShow = (cwd, ref, file) => {
  const r = gitRun(cwd, 'show', `${ref}:${file}`);
  return r.code === 0 ? r.out : null;
};

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
function killGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; } catch { return false; }
}

const shellQuote = (s) => (/^[A-Za-z0-9_\-.,/:=@%+]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`);
}

function merge(base, over) {
  if (over === undefined) return base;
  if (!base || !over || typeof base !== 'object' || typeof over !== 'object' || Array.isArray(base) || Array.isArray(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

function nextEndBy(now = new Date()) {
  const d = new Date(now);
  d.setHours(6, 30, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** Reads the test command and the test directories from the project's CLAUDE.md. */
export function readProjectFacts(root) {
  const file = path.join(root, 'CLAUDE.md');
  const text = exists(file) ? read(file) : '';
  const tests = text.match(/\*\*Tests:\*\*\s*`([^`]+)`/);
  const dirs = text.match(/\*\*Test directories:\*\*\s*(.+)/);
  const type = text.match(/\*\*Project type:\*\*\s*(.+)/);
  const runCmd = text.match(/\*\*Run:\*\*\s*`([^`]+)`/);
  return {
    claudeMd: text,
    runCommand: runCmd ? runCmd[1].replace(/\s*<[^>]+>/g, '').trim() || null : null, // `<command>` placeholders dropped
    testCommand: tests ? tests[1].trim() : null,
    testDirs: dirs ? dirs[1].replace(/`/g, '').split(/[,\s]+/).filter(Boolean).map((d) => (d.endsWith('/') ? d : d + '/')) : [],
    projectType: type ? type[1].trim() : null,
  };
}

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
/** Default effort by model family: haiku and sonnet run high, opus and fable run medium. */
export const DEFAULT_EFFORT = [[/haiku|sonnet/i, 'high'], [/opus|fable/i, 'medium']];
/** A step's `--effort`: its own `effort` setting, else its model's family default, else null (the flag is left off). */
export function effortFor(budget) {
  if (budget.effort) return budget.effort;
  return DEFAULT_EFFORT.find(([re]) => re.test(budget.model ?? ''))?.[1] ?? null;
}

export function defaultConfig(project) {
  const facts = readProjectFacts(project);
  return {
    project,
    queue: null, // null = every eligible epic, in phase/index order
    explicit: [], // epics the user queued on purpose although preflight would skip them
    testCommand: facts.testCommand,
    testDirs: facts.testDirs,
    endBy: nextEndBy(),
    runBudgetUsd: 80,
    diskFloorGb: 15,
    growthCapMb: 1024,
    onPark: 'stop', // 'stop': the first epic that parks or fails ends the run; 'continue': independent epics still run
    claudeBin: 'claude',
    allowTestDouble: false, // run-level: never inherited from settings.json by accident (a rehearsal's fake binary)
    budgets: {
      plan: { wallMin: 30, turns: 80, usd: 5, model: 'sonnet' },
      build: { wallMin: 90, turns: 200, usd: 15, model: 'sonnet' },
      verify: { wallMin: 45, turns: 150, usd: 10, model: 'opus' },
      fix: { wallMin: 60, turns: 150, usd: 12, model: 'sonnet' },
      audit: { wallMin: 15, turns: 40, usd: 3, model: 'opus' },
      testRunMin: 10,
    },
    audit: { parkOn: ['stand-in', 'test-weakened', 'cannot-fail', 'never-ran-real'] },
    scope: { allow: [], lockfiles: [] },
    timing: { pollMs: 30000, killGraceMs: 30000, infraRetryMs: 300000 },
  };
}

// ---- the workspace: <project>.autopilot/{settings.json, lock, STOP, clone/, gates/, runs/<run>/, current}

const tryParse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const tryJson = (p, fallback = null) => { try { return readJson(p); } catch { return fallback; } };
export const runDirOf = (workspace, name) => path.join(workspace, 'runs', name);
export function listRuns(workspace) {
  const dir = path.join(workspace, 'runs');
  return exists(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).sort() : [];
}
/** The latest run's name, from the `current` file (a plain file, not a symlink: it survives every filesystem). */
export function currentRun(workspace) {
  let name = null;
  try { name = read(path.join(workspace, 'current')).trim(); } catch { /* no run yet */ }
  return name && exists(runDirOf(workspace, name)) ? name : listRuns(workspace).at(-1) ?? null;
}
/** A run directory name that is not taken: local `YYYYMMDD-HHMMSS`, then `-2`, `-3`, … within one second. */
export function newRunName(workspace, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const base = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  let name = base;
  for (let n = 2; exists(runDirOf(workspace, name)); n++) name = `${base}-${n}`;
  return name;
}

/** The project's own autopilot settings, kept with the project (committed or not): `<project>/.claude/peak-workflow/autopilot.json`. */
export const projectSettingsFile = (project) => path.join(project, '.claude', 'peak-workflow', 'autopilot.json');
function projectSettings(project) {
  const file = projectSettingsFile(project);
  if (!exists(file)) return {};
  let j; try { j = readJson(file); } catch (err) { throw new Error(`${file} is not valid JSON: ${err.message}`); }
  // A project file sets policy and limits; it never names the run, the project path or a session binary.
  for (const k of [...RUN_KEYS, 'claudeBin']) delete j[k];
  return j;
}

/**
 * The effective config of a run: defaults, then the project's `.claude/peak-workflow/autopilot.json` (policy that
 * belongs to the project, such as `onPark`), then the workspace's `settings.json` (budgets, scope,
 * audit, claudeBin, …), then the run's own `config.json` (queue, explicit, end time, run budget,
 * allowTestDouble), then command-line overrides.
 */
export function loadConfig(workspace, { project, run: runName, overrides = {} } = {}) {
  const settings = tryJson(path.join(workspace, 'settings.json'), {});
  const runCfg = runName ? tryJson(path.join(runDirOf(workspace, runName), 'config.json'), {}) : {};
  const given = project ?? runCfg.project ?? settings.project;
  if (!given) throw new Error('no project: pass --project, or a --workspace whose settings.json names it');
  const root = path.resolve(given);
  const cfg = merge(merge(merge(merge(defaultConfig(root), projectSettings(root)), settings), runCfg), overrides);
  cfg.project = root;
  if (!['stop', 'continue'].includes(cfg.onPark)) throw new Error(`onPark must be "stop" or "continue", not ${JSON.stringify(cfg.onPark)} (${projectSettingsFile(root)})`);
  for (const [kind, b] of Object.entries(cfg.budgets)) {
    if (b && typeof b === 'object' && b.effort !== undefined && !EFFORT_LEVELS.includes(b.effort)) throw new Error(`budgets.${kind}.effort must be one of ${EFFORT_LEVELS.join(', ')}, not ${JSON.stringify(b.effort)}`);
    if (b && typeof b === 'object' && b.model && b.effort === undefined) { const e = effortFor(b); if (e) b.effort = e; } // resolved here so preflight and the dry run show it
  }
  return cfg;
}
/** The keys that belong to one run; everything else is a workspace setting. */
const RUN_KEYS = ['project', 'queue', 'explicit', 'endBy', 'runBudgetUsd', 'allowTestDouble'];
const TEST_DOUBLE = (bin) => `claudeBin is ${bin}, not the real \`claude\`: a test double runs only when the run's config.json says "allowTestDouble": true (or --allow-test-double)`;

// ---------------------------------------------------------------------------------------------
// Project reading and preflight
// ---------------------------------------------------------------------------------------------

function torLifecycle(pluginDir, root, ...args) {
  return sh('sh', [path.join(pluginDir, 'scripts', 'tor-lifecycle'), '--root', root, ...args], { cwd: root });
}

/**
 * Reads every phase index, spec and sidecar under `root` (a checked-out working tree).
 * `sidecarText(relPath)` overrides where a sidecar is read from: the clone's integration line,
 * when autopilot has merged epics the project has not fetched yet.
 */
export function readEpics(root, { sidecarText = null } = {}) {
  const planDir = path.join(root, PLAN_DIR);
  if (!exists(planDir)) return [];
  const rows = [];
  const phases = fs.readdirSync(planDir).filter((d) => /^phase-/.test(d) && exists(path.join(planDir, d, 'index.md'))).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const phase of phases) {
    for (const line of read(path.join(planDir, phase, 'index.md')).split(/\r?\n/)) {
      const m = line.match(/^\|\s*([A-Za-z0-9]{7})\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|\s*$/);
      if (m) rows.push({ id: m[1], name: m[2], specFile: m[3], depsCell: m[4], phase });
    }
  }
  const ids = new Set(rows.map((r) => r.id));
  return rows.map((r) => {
    const slug = (path.basename(r.specFile).match(/^epic-[A-Za-z0-9]{7}-(.+)\.md$/) ?? [])[1] ?? r.id;
    const specPath = path.join(planDir, r.phase, r.specFile);
    const spec = exists(specPath) ? read(specPath) : '';
    const sidecarPath = path.join(planDir, 'status', `epic-${r.id}.md`);
    const sidecarRel = path.posix.join(PLAN_DIR, 'status', `epic-${r.id}.md`);
    const sidecar = parseSidecar(sidecarText?.(sidecarRel) ?? (exists(sidecarPath) ? read(sidecarPath) : ''));
    return {
      id: r.id, name: r.name, slug, phase: r.phase,
      label: `${r.id} (${slug}) — ${r.name}`,
      spec: path.posix.join(PLAN_DIR, r.phase, r.specFile),
      sidecar: path.posix.join(PLAN_DIR, 'status', `epic-${r.id}.md`),
      branch: `feature/epic-${r.id}-${slug}`,
      deps: (r.depsCell.match(/[A-Za-z0-9]{7}/g) ?? []).filter((d) => ids.has(d) && d !== r.id),
      status: sidecar.fields.status ?? 'missing',
      owner: sidecar.fields.owner ?? '—',
      plannedBy: (spec.match(/\*\*Planned by:\*\*\s*(.+)/) ?? [])[1]?.trim() ?? '—',
      anchors: sidecar.requirements,
      hasScreens: /^## Screens\b/m.test(spec),
    };
  });
}

/** The Scenario block of each requirement, keyed by TOR ID, with whether it sits under `# Safety`. */
function readRequirements(root) {
  const dir = path.join(root, 'docs', 'requirements');
  const out = {};
  if (!exists(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.feature.md'))) {
    let safety = false; let cur = null;
    for (const line of read(path.join(dir, f)).split(/\r?\n/)) {
      if (/^#\s+\S/.test(line) && !/^#\s*-+\s*$/.test(line) && !/^#\s*Verification:/.test(line.trim())) safety = /^#\s+Safety\b/.test(line);
      const sc = line.match(/^Scenario:\s*\[(TOR-\d{2}-[A-Za-z0-9]{7})\]/);
      if (sc) { cur = sc[1]; out[cur] = { text: '', safety }; }
      if (cur) out[cur].text += line + '\n';
    }
  }
  return out;
}

/**
 * AC scope and cost review, the deterministic half (guardrail G12): words in a requirement's
 * Scenario that suggest it needs something an unattended run does not have or should not spend.
 * The skill writes the judgement; this only points. Advisory, and kept to words that name the
 * need itself: bare `server` and `account` matched too much (a "bank account", a "local server").
 */
const SCOPE_FLAGS = [
  ['network', /(https?:\/\/|\b(url|download|upload|online|internet|endpoint|webhook|e-?mail|smtp|remote (server|api|service)|rest api|live (rate|price|data))\b)/i],
  ['keys or accounts', /\b(api key|access token|credentials?|password|secret key|sign[- ]?in|log[- ]?in|oauth|user account|account (id|key|name))\b/i],
  ['containers or other machines', /\b(docker|container|kubernetes|virtual machine|\bvm\b|ssh|remote host)\b/i],
  ['big data', /\b(\d[\d,.]*\s*(gb|tb|mb|million|billion)|\d{1,3}(,\d{3}){2,}|[1-9]\d{5,}\s+(rows|records|files|lines|entries|transactions))\b/i],
  ['long run', /\b(\d+\s*(hours?|hrs?|days?)|\d{2,}\s*minutes|overnight|soak|endurance)\b/i],
  ['other platforms', /\b(windows|linux|ubuntu|ios|android|safari|firefox|chrome|edge|raspberry)\b/i],
];
export const scopeFlags = (text) => SCOPE_FLAGS.filter(([, re]) => re.test(text)).map(([name]) => name);

// ---- gates across runs (plan P3.5 Part 2) ------------------------------------------------------

/** Every gate file of the workspace, oldest first: `{file, …gate}`. */
export function readGates(workspace) {
  const dir = path.join(workspace, 'gates');
  return (exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : [])
    .map((f) => ({ file: `gates/${f}`, ...tryJson(path.join(dir, f), {}) })).filter((g) => g.epic);
}
/** A gate that still matters: not used, not void, not superseded by a fresh start, not a cleared preflight note. */
export const gateLive = (g) => !g.decided?.used && !g.void && !g.superseded && !g.cleared;

/**
 * Per epic, what its latest live gate means for the next run. A decision is valid only while the
 * branch tip in the clone still equals the gate's `branchTip` and that branch still merges cleanly
 * into the integration line (owner decision 2026-11-11; it replaced the strict "base has not
 * moved" rule, which voided a decision whenever another epic merged or the owner committed).
 */
export function gateFacts(workspace, integration, { integrationTip = null } = {}) {
  const clone = path.join(workspace, 'clone');
  const facts = new Map();
  const live = readGates(workspace).filter((g) => gateLive(g) && g.kind !== 'preflight');
  for (const id of new Set(live.map((g) => g.epic))) {
    const g = live.filter((x) => x.epic === id).at(-1);
    const f = { gate: g.file, kind: g.kind, branch: g.branch ?? null, answer: g.decided?.answer ?? null, by: g.decided?.by ?? null };
    if (!g.decided?.answer) { facts.set(id, { ...f, state: (g.options ?? []).length ? 'waiting' : 'none' }); continue; }
    const entry = gateEntry(g);
    if (!entry) { facts.set(id, { ...f, state: 'none' }); continue; }
    if (entry.fresh) { facts.set(id, { ...f, state: 'fresh', entry }); continue; }
    let why = null;
    if (!integration || !exists(clone)) why = 'the private clone is gone';
    else {
      const tip = gitRun(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${g.branch}`).out || null;
      // `integrationTip`: where the integration line will be once the run has fast-forwarded it (readiness, before the sync).
      const dev = integrationTip ?? (gitRun(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${integration}`).out || null);
      if (!g.branchTip) { // parked before the session made a branch (a question in the planning session): nothing to merge
        if (tip) why = `a branch ${g.branch} has appeared since the gate was written`;
      } else if (!tip) why = `the branch ${g.branch} no longer exists in the clone`;
      else if (tip !== g.branchTip) why = `the branch ${g.branch} moved since the gate was written (${String(g.branchTip).slice(0, 9)} → ${tip.slice(0, 9)})`;
      else if (!gitOk(clone, 'cat-file', '-e', `${dev}^{commit}`)) f.checkedAtRunStart = true; // the project's new commits are not in the clone yet
      else {
        // A trial merge, in memory: nothing in the clone changes. The integration line may have moved (another
        // epic merged, the owner committed); the decision stands as long as the parked branch still merges cleanly.
        const trial = gitRun(clone, 'merge-tree', '--write-tree', '--name-only', '--no-messages', dev, tip);
        if (trial.code === 1) why = `the branch ${g.branch} no longer merges cleanly into ${integration} (conflicts in ${trial.out.split('\n').slice(1).filter(Boolean).join(', ') || 'its files'})`;
        else if (trial.code !== 0) why = `the trial merge of ${g.branch} into ${integration} could not run (${trial.err.split('\n')[0] || `git merge-tree exited ${trial.code}`})`;
        else f.behind = Number(gitRun(clone, 'rev-list', '--count', `${tip}..${dev}`).out || 0); // commits on the integration line the branch has not seen
      }
    }
    facts.set(id, why ? { ...f, state: 'void', why } : { ...f, state: 'resume', entry, enters: entry.phase });
  }
  return facts;
}

// ---- sync with the project (plan P3.5 Part 3) --------------------------------------------------

/**
 * How the project's integration tip (P) relates to the clone's (C). Read-only: nothing is fetched.
 * `same` | `project-ahead` (the run fast-forwards the clone) | `clone-ahead` (autopilot merged
 * epics the owner has not fetched; the run builds on them) | `diverged` (the run is refused).
 */
export function syncFacts(project, workspace, integration) {
  const clone = path.join(workspace, 'clone');
  if (!integration || !exists(clone)) return { state: 'no-clone', projectTip: null, cloneTip: null, waiting: [] };
  const P = gitRun(project, 'rev-parse', '--verify', '--quiet', `refs/heads/${integration}`).out || null;
  const C = gitRun(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${integration}`).out || null;
  const facts = { projectTip: P, cloneTip: C, waiting: [] };
  if (!P || !C) return { state: 'diverged', ...facts, why: `${integration} is missing in ${P ? 'the clone' : 'the project'}` };
  if (P === C) return { state: 'same', ...facts };
  const has = (repo, sha) => gitOk(repo, 'cat-file', '-e', `${sha}^{commit}`);
  if (has(project, C) && gitOk(project, 'merge-base', '--is-ancestor', C, P)) return { state: 'project-ahead', ...facts };
  if (has(clone, P) && gitOk(clone, 'merge-base', '--is-ancestor', P, C)) {
    const waiting = gitRun(clone, 'log', '--first-parent', '--format=%h %s', `${P}..${C}`).out.split('\n').filter(Boolean);
    return { state: 'clone-ahead', ...facts, waiting };
  }
  return { state: 'diverged', ...facts };
}
const fetchCommand = (clone, integration) => `git fetch "${clone}" ${integration}:autopilot/${integration}`;
const divergedText = (s, project, clone, integration) => `the project and the autopilot clone have diverged on ${integration}: the project is at ${String(s.projectTip).slice(0, 12)} (${project}), the clone at ${String(s.cloneTip).slice(0, 12)} (${clone}). Bring them together first — in the project: \`${fetchCommand(clone, integration)}\`, then merge \`autopilot/${integration}\` into ${integration} (to keep both sides), or decide which side wins — and run autopilot again`;

/**
 * Preflight: which epics may run unattended. Reads only files (and `tor-lifecycle`), so it is
 * safe on the user's repository and in a dry run.
 */
export function preflight(root, config, { pluginDir = PLUGIN_DIR, gates = new Map(), sidecarText = null } = {}) {
  const facts = readProjectFacts(root);
  const refuse = [];
  const fmt = torLifecycle(pluginDir, root, 'format');
  if (fmt.code !== 0) refuse.push(`format guard: ${fmt.out.split('\n')[0] || fmt.err || `tor-lifecycle format exited ${fmt.code}`}`);
  if (!facts.testDirs.length) refuse.push('CLAUDE.md has no **Test directories:** line');
  if (!(config.testCommand ?? facts.testCommand)) refuse.push('CLAUDE.md has no **Tests:** command');

  const tbd = /TBD — set by the walking-skeleton epic|\*\*Not decided yet:\*\*/.test(facts.claudeMd);
  const embedded = /embedded/i.test(facts.projectType ?? '');
  const ui = /web app|desktop app|hybrid/i.test(facts.projectType ?? '');
  const me = sh('git', ['config', 'user.name'], { cwd: root }).out.toLowerCase();
  const reqs = readRequirements(root);
  const states = {};
  const st = torLifecycle(pluginDir, root, 'states', '--json');
  try { for (const r of JSON.parse(st.out).requirements ?? []) states[r.tor] = r; } catch { /* reported per anchor below */ }
  const explicit = new Set(config.explicit ?? []);

  const epics = readEpics(root, { sidecarText }).map((epic) => {
    let e = epic;
    const reasons = []; let eligibility = 'eligible'; let humanCheck = false;
    const set = (level, why) => { reasons.push(why); if (eligibility !== 'skip' && eligibility !== 'complete') eligibility = level; };
    if (e.status === 'Complete') { eligibility = 'complete'; reasons.push(sidecarText && !/^status:\s*Complete/m.test(exists(path.join(root, e.sidecar)) ? read(path.join(root, e.sidecar)) : '') ? 'already Complete in the autopilot clone (merged there, not fetched into the project yet)' : 'already Complete'); return { ...e, eligibility, humanCheck, reasons }; }
    // The owner's decision on a parked gate (P3.5 Part 2): a valid one makes the epic eligible whatever its sidecar says.
    const gate = gates.get(e.id) ?? null;
    if (gate) e = { ...e, gate };
    if (gate?.state === 'waiting') set('skip', `waiting for your decision on ${gate.gate} (${gate.kind}): /peak-workflow:autopilot report`);
    else if (gate?.state === 'resume') reasons.push(`resumes at ${gate.enters} on ${gate.branch}: you answered "${gate.answer}" on ${gate.gate}${gate.checkedAtRunStart ? ' (whether the branch still merges cleanly is checked when the run starts)' : ''}`);
    else if (gate?.state === 'fresh') reasons.push(`starts over: you answered "${gate.answer}" on ${gate.gate}`);
    else if (gate?.state === 'void') reasons.push(`your decision on ${gate.gate} is void (${gate.why}): the epic is planned again from scratch`);
    if (e.status !== 'Not Started' && !explicit.has(e.id) && !['resume', 'fresh', 'void'].includes(gate?.state)) set('skip', `status is ${e.status}; resume it by hand or queue it explicitly`);
    if (!e.anchors.length) set('skip', 'no Requirements Anchors');
    if (embedded) set('skip', 'hardware project: never unattended');
    for (const who of [e.owner, e.plannedBy]) {
      if (me && who && who !== '—' && who.toLowerCase() !== me && !explicit.has(e.id) && !['resume', 'fresh', 'void'].includes(gate?.state)) { set('skip', `belongs to ${who}; queue it explicitly to take it`); break; }
    }
    for (const tor of e.anchors) {
      const r = reqs[tor]; const s = states[tor];
      if (!r || (s && s.live === false)) { set('park', `${tor} is superseded, retired or unknown: a requirements decision`); continue; }
      if (r.safety || s?.safety) set('skip', `${tor} is a Safety requirement (hardware-in-the-loop)`);
      else if (/operator-observed/.test(r.text)) { humanCheck = true; reasons.push(`${tor} is operator-observed: parks for a person before verify`); }
    }
    if (ui && e.hasScreens) { humanCheck = true; reasons.push('UI epic: parks for a human look before verify'); }
    e = { ...e, scopeFlags: e.anchors.map((tor) => ({ tor, flags: scopeFlags(reqs[tor]?.text ?? '') })).filter((x) => x.flags.length) };
    if (tbd) set('park', 'CLAUDE.md still has values to decide (TBD / Not decided yet)');
    return { ...e, eligibility, humanCheck, reasons };
  });
  return { ok: refuse.length === 0, refuse, testCommand: config.testCommand ?? facts.testCommand, testDirs: config.testDirs?.length ? config.testDirs : facts.testDirs, epics };
}

/** What a verify session is told when the owner has already looked at this exact branch tip. */
export function ownerLook(look, meta, caughtUp = null) {
  const observed = meta.reasons.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]);
  return `# The operator's observation is already recorded

Before this session started, the project's owner looked at what was built and recorded what they saw. That record is the operator's
observation for this epic. It was made by a person; it is not your inference and you must not add to it.

- **Who and when:** ${look.by}, ${look.date}
- **What they looked at:** ${(look.artifacts ?? []).join(', ') || 'the build'} — branch tip ${look.branchTip}, ${caughtUp && caughtUp.from === look.branchTip ? `this epic's own work. Since then autopilot merged the integration line into the branch (other epics' merged work only), so the tip you are verifying is ${caughtUp.to}` : 'the commit you are verifying'}
- **Their answer:** "Looks right"
- **Their words:** ${look.note ? `"${look.note}"` : '(none beyond the answer)'}
${observed.length ? `- **Operator-observed requirements it covers:** ${observed.join(', ')}\n` : ''}
In Step 1.2 item 7, do not ask the person to perform the check again and do not use
\`AskUserQuestion\` for it. Do everything else the step says yourself (the checklist mirrors the
Gherkin, the automated parts run, the implementation is inspected), then judge the recorded
observation against the Then and record the evidence as
\`operator-observed: <their words> (recorded by ${look.by} on ${look.date}, before this session)\`.
If the record does not let you judge a Then, do not guess: give that requirement CANNOT VERIFY.

This changes item 7 only. Ask every other question the skill tells you to ask, with
\`AskUserQuestion\` and in the skill's own words (Step 1.5, Step 2.0, the ship mode, any failure):
they are answered for you. Never skip one or choose its answer yourself.
`;
}

/** The run queue: `config.queue`, or every epic that is not Complete, in phase/index order. */
export function buildQueue(pre, config) {
  const byId = new Map(pre.epics.map((e) => [e.id, e]));
  const ids = config.queue ?? pre.epics.filter((e) => e.eligibility !== 'complete').map((e) => e.id);
  return ids.map((id) => {
    const e = byId.get(id);
    if (!e) throw new Error(`queued epic ${id} is not in any phase index`);
    return e;
  });
}

/** The integration line of the repository rooted exactly at `root` (never a parent repository's). */
function detectIntegration(root) {
  const top = gitRun(root, 'rev-parse', '--show-toplevel');
  if (top.code !== 0 || fs.realpathSync(top.out) !== fs.realpathSync(root)) return null;
  for (const b of ['develop', 'main', 'master']) if (gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) return b;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Session command, settings, prompts
// ---------------------------------------------------------------------------------------------

/** The referee layer written as each session's `settings.json` (plan §6.7, SPIKE.md S11). */
export function sessionSettings() {
  const hook = (file, extra = {}) => ({ type: 'command', command: `node "$AUTOPILOT_HOOKS/${file}"`, ...extra });
  return {
    permissions: {
      deny: [
        'Bash(git push *)', 'Bash(git remote add *)', 'Bash(git remote set-url *)', 'Bash(git remote rename *)',
        'Bash(git remote remove *)', 'Bash(docker *)', 'Bash(podman *)', 'Bash(colima *)', 'Bash(lima *)',
        'Bash(limactl *)', 'Bash(multipass *)', 'Bash(vagrant *)', 'Bash(qemu* *)', 'Bash(sudo *)', 'Bash(gh *)',
        'Bash(npm publish *)', 'WebFetch', 'WebSearch',
      ],
    },
    sandbox: {
      enabled: true, allowUnsandboxedCommands: false, failIfUnavailable: true,
      network: { allowedDomains: [], strictAllowlist: true },
    },
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [hook('pretool.mjs', { timeout: 30 })] }],
      PostToolUse: [{ matcher: '*', hooks: [hook('log.mjs')] }],
      PostToolUseFailure: [{ matcher: '*', hooks: [hook('log.mjs')] }],
      Stop: [{ hooks: [hook('stop.mjs')] }],
      SessionStart: [{ hooks: [hook('log.mjs')] }],
      ConfigChange: [{ hooks: [hook('config-change.mjs')] }],
    },
  };
}

/**
 * The exact command for one step: host mode for plan, build and verify (SPIKE.md "Host mode"),
 * plain `-p` for the auditor (plan §6.6 "Audit"). Pure: used by the dry run too.
 */
export function sessionCommand(config, { kind, epicId, workspace, runDir, stepDir, pluginDir = PLUGIN_DIR, sessionId, appendFiles = [], prompt, schema }) {
  const b = config.budgets[kind];
  const effort = effortFor(b);
  const clone = path.join(workspace, 'clone');
  const env = {
    AUTOPILOT_STATE: workspace, // the workspace: hooks jail on it and find clone/ and gates/ there
    AUTOPILOT_RUN: runDir, // this run: state.json, config.json and the step directories
    AUTOPILOT_ROLE: KINDS[kind].role,
    AUTOPILOT_EPIC: epicId,
    AUTOPILOT_STEP: stepDir,
    AUTOPILOT_HOOKS: path.join(pluginDir, 'scripts', 'autopilot', 'hooks'),
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
    BASH_MAX_TIMEOUT_MS: '900000',
    BASH_DEFAULT_TIMEOUT_MS: '300000',
    CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '60000',
  };
  if (kind === 'audit') {
    // The auditor needs no gate tools, so it stays on plain `-p` (SPIKE.md correction 1): read-only
    // tools, the bundle as its working directory, the clone readable through --add-dir.
    const args = [
      '-p', prompt ?? read(path.join(AUDIT_DIR, 'prompt.md')),
      '--settings', path.join(stepDir, 'settings.json'),
      '--tools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk',
      '--add-dir', clone,
      '--output-format', 'json', '--json-schema', schema ?? JSON.stringify(SCHEMA),
      '--max-turns', String(b.turns), '--max-budget-usd', String(b.usd),
      '--session-id', sessionId, '--model', b.model, '--no-session-persistence',
    ];
    if (effort) args.push('--effort', effort);
    return { bin: config.claudeBin, args, env, cwd: path.join(stepDir, 'bundle'), wallMin: b.wallMin, host: false };
  }
  const args = [
    '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--permission-prompt-tool', 'stdio', '--include-hook-events',
    '--plugin-dir', pluginDir,
    '--settings', path.join(stepDir, 'settings.json'),
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Skill', 'Agent', 'TaskCreate', 'TaskUpdate',
    '--disallowedTools', 'WebFetch', 'WebSearch',
    '--max-turns', String(b.turns), '--max-budget-usd', String(b.usd),
    '--session-id', sessionId, '--model', b.model,
  ];
  if (effort) args.push('--effort', effort);
  for (const f of appendFiles) args.push('--append-system-prompt-file', f);
  return { bin: config.claudeBin, args, env, cwd: clone, wallMin: b.wallMin, host: true };
}

const userLine = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });

export const BUILD_RULES = `# Autopilot build rules

You are implementing an already-approved plan, unattended. The plan in your prompt is the complete
execution script for this session.

- Execute every item in order. Do not add, skip, or reorder items.
- Do not enter plan mode. The plan is approved; \`EnterPlanMode\` and \`ExitPlanMode\` are denied.
- Where the plan says to ask the user, ask with \`AskUserQuestion\` exactly as the plan words it.
  Never answer such a question yourself and never work around it.
`;

export const FIX_RULES = `# Autopilot repair rules

You are repairing an already-built epic, unattended. The list in your prompt is the whole job.

- Do not enter plan mode: \`EnterPlanMode\` and \`ExitPlanMode\` are denied. Do not run \`/peak-workflow:start-epic\`.
- Do not change the epic's status, and do not merge or push.
- Where you must ask, ask with \`AskUserQuestion\`. Never answer such a question yourself and never work around it.
`;

/**
 * `prompt.md` for the repair session. A repair is one builder session, not a plan and a build:
 * what to fix is already spelled out (by the driver's checks, the auditor and the owner, the
 * owner's look, or the verifier), and in real runs a planning session given that brief made the
 * fix on the spot and then could not commit it. Every check that follows a build follows this.
 */
export function fixPrompt(meta, brief) {
  return `This is the one repair round for epic ${meta.label}. The epic is already built on branch \`${meta.branch}\`; you are repairing it, unattended.

${brief.trim()}

Do this, in order:

1. Check out \`${meta.branch}\` (it exists; never create another branch) and read the requirement text of every TOR named above in \`docs/requirements/\`.
2. Make exactly the fixes listed, in the code and in the tests. Nothing else: no refactoring, no new features, no other epic's files, no file under \`docs/requirements/\`.
3. Keep every test that names a TOR ID naming it, and make each test you touch able to fail: it must assert what the requirement's Then says.
4. Run the project's test command from \`CLAUDE.md\` and the other quality gates listed there. Everything must pass.
5. Update \`${PLAN_DIR}/session-handoffs/epic-${meta.id}-implemented.md\` wherever the repair changes what it says (what was built, spec deviations, TOR coverage). Keep its \`## Deferrals\` section and \`Count:\` line truthful. Leave the status sidecar as it is (\`status: Implemented\`).
6. Commit on the branch, staging files by path: \`fix(epic-${meta.id}): <what was repaired>\`. Do not push and do not merge.

If a listed fix cannot be made as asked, or making it would leave a requirement unmet, stop and ask with \`AskUserQuestion\` — say which fix, why, and offer the options a person would need. Do not work around it.
`;
}

/** `prompt.md` for a build session: Claude Code's clear-context handoff, minus the transcript pointer. */
export function buildPrompt(plan, pluginDir = PLUGIN_DIR) {
  return 'Implement the following plan:\n\n' + plan.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginDir);
}

// ---------------------------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------------------------

export function dryRun({ project, workspace, config, pluginDir = PLUGIN_DIR, out = console.log }) {
  const stateDir = workspace; const runDir = runDirOf(workspace, '<run>');
  const integration = detectIntegration(project);
  // The same view readiness has: the tip the run will fast-forward to, or the clone's sidecars when it is ahead.
  const sync = syncFacts(project, workspace, integration);
  const pre = preflight(project, config, {
    pluginDir, gates: gateFacts(workspace, integration, { integrationTip: sync.state === 'project-ahead' ? sync.projectTip : null }),
    sidecarText: sync.state === 'clone-ahead' ? (rel) => gitShow(path.join(workspace, 'clone'), integration, rel) : null,
  });
  const queue = buildQueue(pre, config);
  const version = readJson(path.join(pluginDir, '.claude-plugin', 'plugin.json')).version;
  const p = (s = '') => out(s);
  p('Autopilot dry run — nothing is invoked and nothing is written');
  p(`Project:          ${project}`);
  p(`Workspace:        ${stateDir} (this run: ${runDir})`);
  p(`Plugin:           ${pluginDir} (peak-workflow ${version}, driver ${DRIVER_VERSION})`);
  p(`Integration line: ${integration ?? 'develop (assumed: the project is not the root of a git repository with a develop, main or master branch)'} in ${path.join(stateDir, 'clone')} — never pushed`);
  p(`Sessions:         ${config.claudeBin === 'claude' ? 'claude (real Claude Code sessions)' : `${config.claudeBin} — A TEST DOUBLE, not Claude Code: a rehearsal`}`);
  if (sync.state !== 'same' && sync.state !== 'no-clone') p(`Project and clone: ${sync.state}${sync.state === 'diverged' ? ' — A REAL RUN IS REFUSED until they are brought together' : ''}`);
  p(`Test command:     ${pre.testCommand ?? '(none)'}    Test directories: ${pre.testDirs.join(' ') || '(none)'}`);
  p(`When an epic parks: ${config.onPark === 'stop' ? 'the run stops (onPark: stop)' : 'independent epics still run (onPark: continue)'} — set in ${projectSettingsFile(project)}`);
  p(`Run limits:       $${config.runBudgetUsd}, end by ${config.endBy ?? '(no end time)'}, disk floor ${config.diskFloorGb} GB, growth cap ${config.growthCapMb} MB`);
  if (!pre.ok) { p(); p('PREFLIGHT REFUSES THIS RUN:'); pre.refuse.forEach((r) => p(`  - ${r}`)); }

  p(); p('Queue (run in this order; an epic starts only when its dependencies are Complete or MERGED):');
  queue.forEach((e, i) => {
    const tag = e.eligibility === 'eligible' ? (e.humanCheck ? 'eligible, parks before verify' : 'eligible') : e.eligibility;
    p(`  ${i + 1}. ${e.label}   deps: ${e.deps.join(', ') || '—'}   branch: ${e.branch}   [${tag}]`);
    e.reasons.forEach((r) => p(`       ${r}`));
  });
  if (!queue.length) p('  (empty)');
  const rest = pre.epics.filter((e) => !queue.includes(e));
  if (rest.length) { p(); p('Not queued:'); rest.forEach((e) => p(`  - ${e.label}   [${e.eligibility}] ${e.reasons.join('; ')}`)); }

  p(); p(exists(path.join(stateDir, 'clone')) ? 'Private clone (exists; reused):' : 'Private clone:');
  p(`  $ git clone --no-hardlinks --branch ${integration ?? 'develop'} ${shellQuote(project)} ${shellQuote(path.join(stateDir, 'clone'))}`);
  p(`  $ git -C ${shellQuote(path.join(stateDir, 'clone'))} remote remove origin`);

  for (const e of queue.filter((q) => q.eligibility === 'eligible')) {
    p(); p(`Commands for ${e.label}:`);
    const steps = [
      ['plan', `/peak-workflow:start-epic ${e.id}`, [], 'ends when the hook captures the plan at ExitPlanMode; the driver lints plan.md'],
      ['build', '<build-1/prompt.md: "Implement the following plan:" + plan-1/plan.md, ${CLAUDE_PLUGIN_ROOT} resolved>', ['build-rules.md'], 'then CHECK_BUILD (driver checks, §6.5)'],
      ['verify', `/peak-workflow:wrapup-epic ${e.id}`, [], 'then CHECK_VERIFY, the merge gate; a failed gate is rolled back'],
    ];
    for (const [kind, prompt, append, note] of steps) {
      const stepDir = path.join(runDir, 'epics', e.id, `${KINDS[kind].prefix}-1`);
      const c = sessionCommand(config, { kind, epicId: e.id, workspace, runDir, stepDir, pluginDir, sessionId: '<uuid>', appendFiles: append.map((f) => path.join(stepDir, f)) });
      p(`  ${KINDS[kind].prefix}-1 — role ${KINDS[kind].role}, wall clock ${c.wallMin} min; ${note}`);
      p(`    cwd:   ${c.cwd}`);
      p(`    env:   ${Object.entries(c.env).map(([k, v]) => `${k}=${shellQuote(v)}`).join(' ')}`);
      p(`    $ ${[c.bin, ...c.args].map(shellQuote).join(' ')} > ${shellQuote(path.join(stepDir, 'stream.jsonl'))} 2> ${shellQuote(path.join(stepDir, 'stderr.log'))}`);
      p(`    stdin: ${userLine(prompt)}`);
      if (kind === 'build') {
        const auditDir = path.join(runDir, 'epics', e.id, 'audit-1');
        const a = sessionCommand(config, { kind: 'audit', epicId: e.id, workspace, runDir, stepDir: auditDir, pluginDir, sessionId: '<uuid>', prompt: '<audit/prompt.md>', schema: '<audit/schema.json>' });
        p(`  audit-1 — role auditor (advisory, read-only), wall clock ${a.wallMin} min; the driver parks only on a high finding in: ${config.audit.parkOn.join(', ')}`);
        p(`    cwd:   ${a.cwd}   (the bundle: diff.patch, spec.md, tors.md, handoff.md, digest.md, test-changes.jsonl)`);
        p(`    env:   ${Object.entries(a.env).map(([k, v]) => `${k}=${shellQuote(v)}`).join(' ')}`);
        p(`    $ ${[a.bin, ...a.args].map(shellQuote).join(' ')} < /dev/null > ${shellQuote(path.join(auditDir, 'stream.jsonl'))} 2> ${shellQuote(path.join(auditDir, 'stderr.log'))}`);
        if (e.humanCheck) p('  (this epic parks here for a person; no verify session runs)');
      }
    }
    p('  repair round (at most one): fix-1 is one builder session whose prompt is the list of fixes');
    p(`    (${shellQuote(path.join(runDir, 'epics', e.id, 'fix-brief.md'))}); it uses the build command with the fix budget`);
    p(`    (${config.budgets.fix.turns} turns, $${config.budgets.fix.usd}, ${config.budgets.fix.wallMin} min). No planning session: what to fix is already spelled out`);
    p('    after it the auditor runs again on the changes since its last audit only');
  }

  p(); p('Settings JSON (written as each step\'s settings.json):');
  p(JSON.stringify(sessionSettings(), null, 2));
  p(); p('Gate policy:');
  const policy = path.join(pluginDir, 'scripts', 'autopilot', 'policy', 'gates.json');
  p(exists(policy) ? read(policy) : '  policy/gates.json is not built yet (P2). Until then every AskUserQuestion parks.');
  return { pre, queue };
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

class Run {
  constructor({ workspace, runName, config, pluginDir, verbose }) {
    this.stateDir = workspace; // the workspace: lock, STOP, clone/, gates/ (shared by every run)
    this.config = config; this.pluginDir = pluginDir; this.verbose = verbose;
    this.clone = path.join(workspace, 'clone');
    this.runName = runName; this.runDir = runDirOf(workspace, runName);
    this.stateFile = path.join(this.runDir, 'state.json');
    this.stopReason = null;
    this.entry = {}; // epic id -> phase to re-enter after a crash
    this.early = []; // log lines from before the run directory exists
  }

  log(msg) {
    const line = `${new Date().toISOString()} ${msg}\n`;
    if (this.verbose) process.stdout.write(line);
    if (!exists(this.runDir)) { this.early.push(line); return; }
    fs.appendFileSync(path.join(this.runDir, 'autopilot.log'), this.early.splice(0).join('') + line);
  }
  save() { writeJson(this.stateFile, this.state); }
  epicDir(e) { return path.join(this.runDir, 'epics', e.id); }
  /** A path as gate files and the report name it: relative to the workspace. */
  rel(p) { return path.relative(this.stateDir, p).split(path.sep).join('/'); }
  meta(e) { return this.metaById.get(e.id); }

  // ---- lock, STOP, run-level stops -----------------------------------------------------------

  acquireLock() {
    const file = path.join(this.stateDir, 'lock');
    if (exists(file)) {
      let held = {};
      try { held = readJson(file); } catch { /* unreadable = stale */ }
      if (held.pid && held.pid !== process.pid && pidAlive(held.pid)) throw new Error(`autopilot is already running here (pid ${held.pid}, started ${held.started})`);
      this.log(`stale lock taken over (pid ${held.pid ?? 'unknown'}, started ${held.started ?? 'unknown'} — not running)`);
    }
    writeJson(file, { pid: process.pid, started: new Date().toISOString() });
  }
  releaseLock() {
    const file = path.join(this.stateDir, 'lock');
    try { if (readJson(file).pid === process.pid) fs.rmSync(file); } catch { /* already gone */ }
  }
  stopRequested() { return exists(path.join(this.stateDir, 'STOP')); }
  freeGb() { const s = fs.statfsSync(this.stateDir); return (s.bavail * s.bsize) / 1024 ** 3; }
  cloneMb() { const r = sh('du', ['-sk', this.clone]); return r.code === 0 ? parseInt(r.out, 10) / 1024 : 0; }

  /** Checked before every epic and between steps. Returns a reason to stop the run, or null. */
  runStop() {
    if (this.stopReason) return this.stopReason;
    let why = null;
    if (this.stopRequested()) why = 'STOP file';
    else {
      let pid = null;
      try { pid = readJson(path.join(this.stateDir, 'lock')).pid; } catch { /* lost */ }
      if (pid !== process.pid) why = 'lock lost';
      else if (this.config.endBy && Date.now() >= Date.parse(this.config.endBy)) why = 'end time';
      else if (this.state.spentUsd >= this.config.runBudgetUsd) why = 'run budget';
      else if (this.freeGb() < this.config.diskFloorGb) why = 'disk floor';
    }
    if (why) this.stopReason = why;
    return why;
  }

  // ---- git in the private clone ----------------------------------------------------------------

  g(...args) { return git(this.clone, ...args); }
  integrationSha() { return this.g('rev-parse', this.state.integration); }
  branchTip(branch) { const r = gitRun(this.clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`); return r.code === 0 ? r.out : null; }
  currentBranch() { return gitRun(this.clone, 'branch', '--show-current').out; }
  dirty() { return this.g('status', '--porcelain') !== ''; }

  /** Commits whatever a parked session left uncommitted on the epic branch. One of three driver git writes. */
  wipCommit(e) {
    if (this.currentBranch() !== this.meta(e).branch || !this.dirty()) return false;
    this.g('add', '-A');
    this.g('commit', '--no-verify', '-q', '-m', 'wip(autopilot): uncommitted work at park');
    this.log(`${e.id}: committed uncommitted work on ${this.meta(e).branch} as wip(autopilot)`);
    return true;
  }

  /** Puts the integration line back at `sha`; a discarded tip stays reachable under refs/autopilot/rejected/. */
  resetIntegration(e, sha) {
    const dev = this.state.integration;
    const cur = this.integrationSha();
    if (gitOk(this.clone, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD')) gitRun(this.clone, 'merge', '--abort');
    if (cur !== sha) {
      const ref = `refs/autopilot/rejected/${e.id}-${Date.now()}`;
      this.g('update-ref', ref, cur);
      e.rejected = [...(e.rejected ?? []), ref];
      this.log(`${e.id}: ${dev} rolled back ${cur.slice(0, 9)} → ${sha.slice(0, 9)}; the rejected commit is kept at ${ref}`);
    }
    this.g('checkout', '-q', '-f', dev);
    this.g('reset', '-q', '--hard', sha);
    this.g('clean', '-fdq'); // untracked leftovers of the undone session; ignored files (dependencies) stay
  }

  /** Merge-gate rollback: integration line back to its pre-verify SHA, epic branch back to its recorded tip. */
  rollback(e) {
    const pre = e.preVerify;
    this.resetIntegration(e, pre.developSha);
    if (this.branchTip(pre.branch) !== pre.branchTip) this.g('branch', '-f', pre.branch, pre.branchTip);
  }

  runTests() {
    const started = Date.now();
    const r = sh(this.config.testCommand, [], { cwd: this.clone, shell: true, timeout: this.config.budgets.testRunMin * 60000, killSignal: 'SIGKILL' });
    const text = `${r.out}\n${r.err}`;
    const skips = (text.match(/^(?:#|ℹ)\s*skipped\s+(\d+)/m) ?? [])[1];
    return { pass: r.code === 0 && !r.timedOut, code: r.code, timedOut: r.timedOut, skips: skips === undefined ? null : Number(skips), ms: Date.now() - started, tail: text.trim().split('\n').slice(-15).join('\n') };
  }

  health(base) {
    const fmt = torLifecycle(this.pluginDir, this.clone, 'format');
    const chk = torLifecycle(this.pluginDir, this.clone, 'check', '--base', base, '--json');
    let blocking = null; let findings = [];
    try { findings = JSON.parse(chk.out).findings ?? []; blocking = findings.filter((f) => f.blocking); } catch { /* exit 2 or 3: reported below */ }
    const pass = fmt.code === 0 && blocking !== null && blocking.length === 0;
    return { pass, evidence: { formatExit: fmt.code, checkExit: chk.code, findings: findings.length, blocking: blocking ?? `unreadable output: ${(chk.err || chk.out).slice(0, 300)}` } };
  }

  // ---- gates ---------------------------------------------------------------------------------

  gateFiles() { const d = path.join(this.stateDir, 'gates'); return exists(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort() : []; }
  writeGate(e, gate) {
    const m = this.meta(e);
    const n = this.gateFiles().filter((f) => f.startsWith(`${e.id}-`)).length + 1;
    const name = `${e.id}-${n}.json`;
    writeJson(path.join(this.stateDir, 'gates', name), {
      epic: e.id, epicName: m.name, run: this.runName, session: e.lastStep ?? null, branch: m.branch, branchTip: this.branchTip(m.branch), base: this.integrationSha(),
      resume: `open a new session in the fetched repo: /peak-workflow:start-epic ${e.id}`, decided: null, ...gate,
    });
    e.gates.push(name);
    return name;
  }

  gatePath(file) { return path.join(this.stateDir, 'gates', path.basename(file)); }
  /** Rewrites one gate file. The driver never writes `decided` itself (only `decideGate` does); it records what became of the gate. */
  markGate(file, patch) {
    const g = tryJson(this.gatePath(file));
    if (!g) return;
    writeJson(this.gatePath(file), typeof patch === 'function' ? patch(g) : { ...g, ...patch });
  }
  /** At park, every gate this run wrote for the epic gets the branch as it now is (after the WIP commit) and the base. */
  sealGates(e) {
    const m = this.meta(e); const tip = this.branchTip(m.branch);
    for (const name of e.gates) this.markGate(name, (g) => (g.decided ? g : { ...g, branch: m.branch, branchTip: tip, base: this.integrationSha() }));
  }

  // ---- what an epic carries from one run to the next (workspace `epics.json`) -----------------

  records() { return tryJson(path.join(this.stateDir, 'epics.json'), {}); }
  record(e) {
    const all = this.records();
    if (e.state === 'MERGED') delete all[e.id];
    else {
      const brief = path.join(this.epicDir(e), 'fix-brief.md');
      all[e.id] = { run: this.runName, state: e.state, reason: e.reason, branch: this.meta(e).branch, fixRounds: e.fixRounds, plan: e.plan ?? null, planApprovedBy: e.planApprovedBy ?? null, buildSteps: e.buildSteps ?? [], audits: e.audits ?? [], fixBrief: exists(brief) ? read(brief) : null };
    }
    writeJson(path.join(this.stateDir, 'epics.json'), all);
  }
  forget(e) { const all = this.records(); if (all[e.id]) { delete all[e.id]; writeJson(path.join(this.stateDir, 'epics.json'), all); } }

  // ---- terminal transitions --------------------------------------------------------------------

  finish(e, state, reason) {
    e.state = state; e.reason = reason; e.step = null; e.endedAt = new Date().toISOString();
    this.save();
    if (['PARKED', 'FAILED', 'MERGED'].includes(state) && this.metaById?.has(e.id)) {
      try {
        if (state !== 'MERGED') this.sealGates(e);
        // A resumed gate is spent once its epic ends again, whether or not the session re-asked the question.
        if (e.resumed) this.markGate(e.resumed.gate, (g) => (g.decided && !g.decided.used ? { ...g, decided: { ...g.decided, used: { run: this.runName, phase: e.resumed.phase, date: new Date().toISOString(), note: 'the question was not asked again' } } } : g));
        if (e.sessions.length || e.resumed || state === 'MERGED') this.record(e);
      } catch (err) { this.log(`${e.id}: could not record the epic for the next run: ${err.message}`); }
    }
    this.log(`${e.id}: ${state} — ${reason}`);
    return null;
  }
  park(e, reason) { try { this.wipCommit(e); } catch (err) { this.log(`${e.id}: could not commit uncommitted work: ${err.message}`); } return this.finish(e, 'PARKED', reason); }
  /**
   * A park that is nobody's question (budget, infra, STOP, an auditor outage) gets a `resume` gate,
   * so the next run continues at `phase` instead of rebuilding the epic.
   */
  parkResumable(e, reason, phase) {
    this.writeGate(e, {
      kind: 'resume', skillStep: 'autopilot driver', phase,
      question: `${this.meta(e).label} stopped: ${reason}. Continue it in the next run?`,
      options: [ANSWERS.resume, ANSWERS.startOver],
      why: `nothing was decided for you: the run stopped the epic before ${phase}. "${ANSWERS.resume}" re-enters at ${phase} on the same branch; "${ANSWERS.startOver}" plans it again from scratch`,
      artifacts: e.lastStep ? [this.rel(path.join(this.epicDir(e), e.lastStep))] : [],
    });
    return this.park(e, reason);
  }

  // ---- one session -----------------------------------------------------------------------------

  /**
   * Launches one host-mode session in its own process group and waits for it.
   * Resolves with how it ended; never throws for a session failure.
   */
  async launch(e, kind, prepare) {
    const cfg = this.config; const k = KINDS[kind];
    const n = (e.attempts[kind] = (e.attempts[kind] ?? 0) + 1);
    const name = `${k.prefix}-${n}`;
    const stepDir = path.join(this.epicDir(e), name);
    fs.mkdirSync(stepDir, { recursive: true });
    const sessionId = randomUUID();
    const { prompt, appendFiles = [] } = prepare(stepDir) ?? {};
    writeJson(path.join(stepDir, 'settings.json'), sessionSettings());
    const cmd = sessionCommand(cfg, { kind, epicId: e.id, workspace: this.stateDir, runDir: this.runDir, stepDir, pluginDir: this.pluginDir, sessionId, appendFiles });

    // The intended step is on disk before anything is launched (crash-safe resume, §9).
    e.state = k.state; e.lastStep = name;
    e.step = { name, kind, sessionId, pid: null, startedAt: new Date().toISOString() };
    this.save();
    this.log(`${e.id}: ${name} starting (${k.role}, ${cmd.wallMin} min, session ${sessionId})`);

    const startMb = this.cloneMb();
    const started = Date.now();
    // Read by hook R5 (startMb) and hook R8 (`look`: the owner's recorded look, for wrapup's manual-verification question).
    writeJson(path.join(stepDir, 'step.json'), { name, kind, role: k.role, epic: e.id, sessionId, startedAt: e.step.startedAt, startMb, ...(kind === 'verify' && e.look ? { look: e.look } : {}) });
    const isScript = /\.(mjs|cjs|js)$/.test(cmd.bin);
    const child = spawn(isScript ? process.execPath : cmd.bin, isScript ? [cmd.bin, ...cmd.args] : cmd.args, {
      cwd: cmd.cwd, env: childEnv(cmd.env), detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stream = fs.createWriteStream(path.join(stepDir, 'stream.jsonl'));
    const stderr = fs.createWriteStream(path.join(stepDir, 'stderr.log'));
    child.stderr.pipe(stderr);
    child.stdin.on('error', () => {});
    const send = (o) => { if (child.stdin.writable) child.stdin.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\n'); };

    const s = { name, stepDir, kind, result: null, init: null, controlRequests: [], killed: null, exitCode: null, signal: null, spawnError: null };
    let graceTimer = null;
    const kill = (why) => {
      if (s.killed) return;
      s.killed = why;
      this.log(`${e.id}: ${name} killed — ${why}`);
      killGroup(child.pid, 'SIGTERM');
      graceTimer = setTimeout(() => killGroup(child.pid, 'SIGKILL'), cfg.timing.killGraceMs);
    };

    const done = new Promise((resolve) => {
      child.on('error', (err) => { s.spawnError = err.message; resolve(); });
      child.on('close', (code, signal) => { s.exitCode = code; s.signal = signal; resolve(); });
    });
    if (child.pid) {
      e.step.pid = child.pid; this.save();
      if (cmd.host) send(userLine(prompt)); else child.stdin.end(); // plain -p: the prompt is an argument (stdin as `< /dev/null`)
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        stream.write(line + '\n');
        let d; try { d = JSON.parse(line); } catch { return; }
        if (Array.isArray(d)) { s.init = d.find((x) => x?.type === 'system' && x.subtype === 'init') ?? s.init; d = d.find((x) => x?.type === 'result') ?? {}; }
        if (d.type === 'system' && d.subtype === 'init') s.init = d;
        if (d.type === 'control_request') {
          // The host approves nothing (SPIKE.md): hooks and acceptEdits decide; anything that reaches us is denied and logged.
          const r = d.request ?? {};
          s.controlRequests.push({ subtype: r.subtype, tool_name: r.tool_name ?? null, input: r.input ?? null });
          this.log(`${e.id}: ${name} control_request ${r.subtype} ${r.tool_name ?? ''} — denied`);
          send({ type: 'control_response', response: { subtype: 'success', request_id: d.request_id, response: r.subtype === 'can_use_tool' ? { behavior: 'deny', message: 'autopilot: the host approves nothing; this request was not covered by a rule' } : {} } });
        }
        if (d.type === 'result') { s.result = d; child.stdin.end(); }
      });
    }
    const wall = setTimeout(() => kill('wall clock'), cmd.wallMin * 60000);
    const poll = setInterval(() => {
      if (this.stopRequested()) kill('STOP file');
      else if (this.freeGb() < cfg.diskFloorGb) kill('disk floor');
      else if (this.cloneMb() - startMb > cfg.growthCapMb) kill('growth cap');
    }, cfg.timing.pollMs);
    await done;
    clearTimeout(wall); clearInterval(poll); clearTimeout(graceTimer);
    if (child.pid && killGroup(child.pid, 0)) { killGroup(child.pid, 'SIGKILL'); this.log(`${e.id}: ${name} left processes behind; killed`); }
    await new Promise((r) => stream.end(r));
    stderr.end();

    s.wallMs = Date.now() - started;
    if (s.result) writeJson(path.join(stepDir, 'result.json'), s.result);
    writeJson(path.join(stepDir, 'effective-setup.json'), { command: [cmd.bin, ...cmd.args], env: cmd.env, settings: path.join(stepDir, 'settings.json'), init: s.init });
    if (s.controlRequests.length) writeJson(path.join(stepDir, 'control-requests.json'), s.controlRequests);

    const sub = s.result?.subtype;
    if (s.killed === 'STOP file') s.outcome = 'stopped';
    else if (s.killed) s.outcome = 'budget';
    else if (sub === 'error_max_turns' || sub === 'error_max_budget_usd') s.outcome = 'budget';
    else if (s.exitCode === 0 && sub === 'success') s.outcome = 'ok';
    else s.outcome = 'infra';
    s.why = s.killed ?? (s.outcome === 'ok' ? 'success' : sub ?? s.spawnError ?? `exit ${s.exitCode ?? s.signal}, no result line`);

    const cost = s.result?.total_cost_usd ?? 0;
    this.state.spentUsd = +(this.state.spentUsd + cost).toFixed(4);
    e.costUsd = +(e.costUsd + cost).toFixed(4); e.turns += s.result?.num_turns ?? 0; e.wallMs += s.wallMs;
    e.sessions.push({ name, sessionId, outcome: s.outcome, why: s.why, costUsd: cost, turns: s.result?.num_turns ?? 0, wallMs: s.wallMs, terminalReason: s.result?.terminal_reason ?? null, denials: s.result?.permission_denials?.length ?? 0 });
    e.step = null;
    this.save();
    this.log(`${e.id}: ${name} ended — ${s.outcome} (${s.why}), $${cost}, ${Math.round(s.wallMs / 1000)} s`);
    return s;
  }

  /**
   * A step: launch, retry once on an infra error, and apply the rules every session shares.
   * Returns the session when it ended `ok` with no new gate; otherwise the epic is already
   * parked (or the run is stopping) and this returns null.
   */
  async step(e, kind, prepare) {
    const gatesBefore = new Set(this.gateFiles());
    const devBefore = this.integrationSha();
    let s;
    for (;;) {
      s = await this.launch(e, kind, prepare);
      if (s.outcome !== 'infra') { this.state.consecutiveInfra = 0; break; }
      this.state.consecutiveInfra = (this.state.consecutiveInfra ?? 0) + 1;
      if (this.state.consecutiveInfra >= 2) { this.stopReason = 'infra'; break; }
      this.log(`${e.id}: infra error (${s.why}); retrying once in ${Math.round(this.config.timing.infraRetryMs / 1000)} s`);
      for (let waited = 0; waited < this.config.timing.infraRetryMs && !this.stopRequested(); waited += 1000) await sleep(Math.min(1000, this.config.timing.infraRetryMs - waited));
      if (this.stopRequested()) { s.outcome = 'stopped'; s.why = 'STOP file'; break; }
    }
    this.save();
    const moved = this.integrationSha() !== devBefore;
    const undo = () => { if (kind === 'verify') this.rollback(e); else if (moved) this.resetIntegration(e, devBefore); };

    // Re-entry after a park that is nobody's question: a parked build is judged from its WIP commit; any other step is run again once.
    const again = { plan: 'PLAN', build: 'CHECK_BUILD', fix: 'CHECK_BUILD', audit: 'AUDIT', verify: 'VERIFY' }[kind];
    if (s.outcome === 'stopped') { this.stopReason = 'STOP file'; undo(); return this.parkResumable(e, `stopped by the STOP file during ${s.name}`, again); }
    if (s.outcome === 'infra') { undo(); return this.parkResumable(e, `infra error during ${s.name}: ${s.why}`, again); }
    if (s.outcome === 'budget') { undo(); return this.parkResumable(e, `budget: ${s.name} hit ${s.why}`, again); }
    const newGates = this.gateFiles().filter((f) => !gatesBefore.has(f));
    if (newGates.length) { e.gates.push(...newGates.filter((g) => !e.gates.includes(g))); undo(); return this.park(e, `parked at a human gate (${newGates.join(', ')})`); }
    if (kind !== 'verify' && moved) { undo(); return this.park(e, `${s.name} moved ${this.state.integration}; only a verify session may merge`); }
    return s;
  }

  // ---- phases: each returns the next phase, or null when the epic reached a terminal state -----

  async doPlan(e) {
    const m = this.meta(e);
    const s = await this.step(e, 'plan', () => ({ prompt: `/peak-workflow:start-epic ${e.id}` }));
    if (!s) return null;
    const planFile = path.join(s.stepDir, 'plan.md');
    if (!exists(planFile)) return this.park(e, `${s.name} ended without a captured plan`);
    const lint = lintPlan(read(planFile), m.anchors);
    writeJson(path.join(s.stepDir, 'plan-lint.json'), lint);
    if (!lint.pass) {
      this.writeGate(e, { kind: 'plan-lint', skillStep: 'start-epic Step 4 (plan approval)', question: `The captured plan failed plan lint (${lint.problems.join('; ')}). Approve it as it is, or have it planned again?`, options: [ANSWERS.approvePlan, ANSWERS.replan], why: lint.problems.join('; '), artifacts: [this.rel(planFile)] });
      return this.park(e, `plan lint failed: ${lint.problems.join('; ')}`);
    }
    e.planStep = s.name; e.plan = this.rel(planFile); e.planApprovedBy = 'lint';
    this.log(`${e.id}: plan approved by lint, not by a person (${s.name}/plan.md)`);
    return 'BUILD';
  }

  async doBuild(e, fix) {
    const brief = path.join(this.epicDir(e), 'fix-brief.md');
    const s = await this.step(e, fix ? 'fix' : 'build', (stepDir) => {
      (e.buildSteps = e.buildSteps ?? []).push({ name: path.basename(stepDir), dir: this.rel(stepDir) }); // what the next audit reads, in this run or a later one
      fs.writeFileSync(path.join(stepDir, 'prompt.md'), fix ? fixPrompt(this.meta(e), read(brief)) : buildPrompt(read(path.join(this.stateDir, e.plan)), this.pluginDir));
      fs.writeFileSync(path.join(stepDir, 'build-rules.md'), fix ? FIX_RULES : BUILD_RULES);
      return { prompt: read(path.join(stepDir, 'prompt.md')), appendFiles: [path.join(stepDir, 'build-rules.md')] };
    });
    return s ? 'CHECK_BUILD' : null;
  }

  /** CHECK_BUILD (§6.5): every check is a file or a command. */
  checkBuild(e) {
    const m = this.meta(e); const dev = this.state.integration; const b = m.branch;
    const checks = []; let parkOnly = null;
    const add = (name, pass, evidence) => { checks.push({ name, pass: !!pass, evidence }); return !!pass; };

    const tip = this.branchTip(b);
    if (!add('branch-and-commit', false, null)) checks.pop();
    if (!tip) add('branch-and-commit', false, `branch ${b} does not exist`);
    else {
      const ahead = Number(this.g('rev-list', '--count', `${dev}..${b}`));
      const subject = this.g('log', '-1', '--format=%s', b);
      // The repair prompt asks for `fix(epic-<id>): …`, so after a fix round that subject is as good as the build's `feat`.
      add('branch-and-commit', ahead >= 1 && new RegExp(`^(feat${e.fixRounds >= 1 ? '|fix' : ''})\\(epic-${e.id}\\):`).test(subject), { branch: b, tip, commitsAhead: ahead, tipSubject: subject });
    }
    if (!tip) return { pass: false, checks, parkOnly };

    if (this.currentBranch() !== b && !this.dirty()) this.g('checkout', '-q', b);
    const status = this.g('status', '--porcelain');
    if (!add('clean-tree', status === '' && this.currentBranch() === b, status === '' ? `on ${this.currentBranch()}` : status.split('\n').slice(0, 20))) parkOnly = 'the build left uncommitted work';

    const sc = parseSidecar(gitShow(this.clone, b, m.sidecar));
    const handoffRel = `session-handoffs/epic-${e.id}-implemented.md`;
    add('sidecar', sc.fields.status === 'Implemented' && /^\d{4}-\d{2}-\d{2}/.test(sc.fields.implemented ?? '') && sc.fields.handoff === handoffRel, sc.fields);

    const handoff = gitShow(this.clone, b, `${PLAN_DIR}/${handoffRel}`);
    const count = handoff && /^## Deferrals\b/m.test(handoff) ? (handoff.slice(handoff.search(/^## Deferrals\b/m)).match(/^Count:\s*(\d+)/m) ?? [])[1] : undefined;
    if (!add('handoff', count === '0', handoff === null ? 'handoff file missing on the branch' : count === undefined ? 'no "## Deferrals" section with a Count: line' : `Deferrals Count: ${count}`) && Number(count) > 0) parkOnly = parkOnly ?? `the handoff records ${count} deferral(s): a human decision`;

    const dirs = this.pre.testDirs;
    // An operator-observed requirement is traced by its checklist under tests/manual/ (or tests/hil/),
    // whether or not those are on the Test directories line (wrapup-epic Step 1.2 item 2).
    const observed = new Set(m.reasons.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]));
    const untraced = m.anchors.filter((tor) => gitRun(this.clone, 'grep', '-l', '-F', tor, b, '--', ...dirs, ...(observed.has(tor) ? ['tests/manual', 'tests/hil'] : [])).code !== 0);
    add('traceability', untraced.length === 0, untraced.length ? { missingFromTests: untraced, testDirs: dirs } : `${m.anchors.length} anchors found under ${dirs.join(' ')}`);

    if (status === '' && this.currentBranch() === b) {
      const t = this.runTests();
      const base = this.state.baseSkips;
      add('tests-green', t.pass && (t.skips === null || base == null || t.skips <= base), { exit: t.code, timedOut: t.timedOut, skips: t.skips, baseSkips: base ?? null, tail: t.pass ? undefined : t.tail });
    } else add('tests-green', false, 'not run: the working tree is not a clean checkout of the branch');

    const h = this.health(dev);
    add('requirements-health', h.pass, h.evidence);

    const changed = this.g('diff', '--name-only', `${dev}...${b}`).split('\n').filter(Boolean);
    const lockfiles = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Gemfile\.lock|go\.sum|composer\.lock)$/;
    const allow = (this.config.scope.allow ?? []).map(globToRegExp);
    const out = [];
    for (const f of changed) {
      const otherEpic = f.match(/(?:^|\/)epic-([A-Za-z0-9]{7})[-.]/);
      if (f.startsWith(`${PLAN_DIR}/`) && otherEpic && otherEpic[1] !== e.id) out.push(`${f}: another epic's file`);
      else if (f.startsWith('docs/requirements/')) out.push(`${f}: requirements are frozen during a run`);
      else if (f.startsWith('.claude/')) out.push(`${f}: .claude/ is off limits`);
      else if (f === 'CLAUDE.md') {
        const lines = this.g('diff', '-U0', `${dev}...${b}`, '--', 'CLAUDE.md').split('\n').filter((l) => /^[+-](?![+-])/.test(l));
        if (lines.some((l) => !l.includes('**Test directories:**'))) out.push('CLAUDE.md: changed beyond the Test directories line');
      } else if (lockfiles.test(f) && !(this.config.scope.lockfiles ?? []).includes(f)) out.push(`${f}: lockfile not named in config`);
      else if (allow.length && !allow.some((re) => re.test(f))) out.push(`${f}: outside the allowed paths`);
      else if (Number(gitRun(this.clone, 'cat-file', '-s', `${b}:${f}`).out || 0) > 5 * 1024 * 1024) out.push(`${f}: larger than 5 MB`);
    }
    add('scope', out.length === 0, out.length ? out : `${changed.length} changed paths in scope`);

    const reasons = new Map();
    for (const line of (gitShow(this.clone, b, '.autopilot/test-changes.jsonl') ?? '').split('\n')) {
      try { const j = JSON.parse(line); if (j.path) reasons.set(j.path, j.reason ?? ''); } catch { /* not a JSON line */ }
    }
    const touched = this.g('diff', '--name-status', '--no-renames', `${dev}...${b}`).split('\n').filter(Boolean)
      .map((l) => l.split('\t')).filter(([st, f]) => st !== 'A' && dirs.some((d) => f.startsWith(d))).map(([, f]) => f);
    const unexplained = touched.filter((f) => !reasons.has(f));
    add('test-integrity', unexplained.length === 0, { existingTestsChanged: touched.map((f) => ({ path: f, reason: reasons.get(f) ?? null })) });
    e.testChanges = touched.map((f) => ({ path: f, reason: reasons.get(f) ?? null }));

    return { pass: checks.every((c) => c.pass), checks, parkOnly };
  }

  writeFixBrief(e, title, lines) {
    const m = this.meta(e);
    fs.writeFileSync(path.join(this.epicDir(e), 'fix-brief.md'),
      `# Autopilot fix brief — ${m.label}\n\nThis is the one fix round for this epic. ${title}\nFix exactly these and nothing else; the same checks run again afterwards.\n\n${lines.join('\n')}\n`);
  }

  doCheckBuild(e, { interrupted = false } = {}) {
    e.state = 'CHECK_BUILD'; this.save();
    const n = (e.attempts.checkBuild = (e.attempts.checkBuild ?? 0) + 1);
    const r = this.checkBuild(e);
    writeJson(path.join(this.epicDir(e), `check-build-${n}.json`), r);
    e.checks.push({ file: `check-build-${n}.json`, pass: r.pass, failed: r.checks.filter((c) => !c.pass).map((c) => c.name) });
    if (r.pass) return 'AUDIT';
    const failed = r.checks.filter((c) => !c.pass);
    const names = failed.map((c) => c.name).join(', ');
    if (interrupted) return this.park(e, `interrupted: the driver was restarted mid-build and CHECK_BUILD does not pass (${names})`);
    if (r.parkOnly) return this.park(e, `CHECK_BUILD: ${r.parkOnly} (failed: ${names})`);
    if (e.fixRounds >= 1) return this.park(e, `CHECK_BUILD still fails after the fix round (${names})`);
    e.fixRounds = 1;
    this.writeFixBrief(e, 'The driver\'s done-ness checks failed after the build session:', failed.map((c) => `- **${c.name}** — ${typeof c.evidence === 'string' ? c.evidence : JSON.stringify(c.evidence)}`));
    this.log(`${e.id}: CHECK_BUILD failed (${names}); starting the one fix round`);
    return 'FIX_BUILD';
  }

  /**
   * AUDIT (§6.10): a fresh read-only session reads the bundle and reports findings. The driver
   * decides from `config.audit.parkOn`; the auditor's `recommend` is recorded and has no effect.
   * After a fix round only the changes since the last audited tip are audited.
   */
  async doAudit(e) {
    e.state = 'AUDIT'; this.save();
    const m = this.meta(e);
    e.audits = e.audits ?? [];
    const last = e.audits.at(-1);
    const audited = new Set(e.audits.flatMap((a) => a.dirs ?? []));
    const steps = (e.buildSteps ?? []).filter((x) => !audited.has(x.dir)); // may be sessions of an earlier run
    let bundle = null; let s;
    try {
      s = await this.step(e, 'audit', (stepDir) => {
        bundle = buildBundle({
          clone: this.clone, pluginDir: this.pluginDir, bundleDir: path.join(stepDir, 'bundle'), epic: m, integration: this.state.integration,
          base: last?.tip ?? null, steps: steps.map((x) => ({ name: x.name, dir: path.join(this.stateDir, x.dir) })),
        });
      });
    } catch (err) {
      return this.parkResumable(e, `auditor: the audit could not start (${err.message}); not verified without an audit`, 'AUDIT');
    }
    if (!s) return null;

    const value = auditOutput(s.result);
    const valid = validateAudit(value);
    if (!valid.ok) {
      writeJson(path.join(s.stepDir, 'audit.json'), { unusable: valid.problems, raw: s.result?.structured_output ?? s.result?.result ?? null });
      // Fail closed (owner decision): nothing is verified without an audit. The `resume` gate lets the next run audit again.
      return this.parkResumable(e, `auditor: ${s.name} returned no usable result (${valid.problems.join('; ')}); not verified without an audit`, 'AUDIT');
    }
    const judged = judgeAudit(value, this.config.audit.parkOn);
    const file = `${s.name}/audit.json`;
    writeJson(path.join(this.epicDir(e), file), { step: s.name, epic: e.id, branch: m.branch, delta: bundle.delta, base: bundle.base, tip: bundle.tip, parkOn: this.config.audit.parkOn, decision: judged.parks.length ? 'park' : 'proceed', recommend: judged.recommend, summary: judged.summary, findings: judged.findings });
    e.audits.push({ step: s.name, file, delta: bundle.delta, base: bundle.base, tip: bundle.tip, steps: bundle.steps, dirs: steps.map((x) => x.dir), findings: judged.findings.length, parks: judged.parks.map((f) => f.id), recommend: judged.recommend });
    e.audit = { step: s.name, file, findings: judged.findings.length, parks: judged.parks.length, recommend: judged.recommend };
    this.save();
    this.log(`${e.id}: ${s.name} — ${judged.findings.length} finding(s), ${judged.parks.length} that park; the auditor recommends ${judged.recommend} (no effect)`);

    if (judged.parks.length) {
      const list = judged.parks.map((f) => `${f.id} ${f.category}`).join(', ');
      this.writeGate(e, {
        kind: 'audit', skillStep: 'autopilot AUDIT (before wrapup-epic)', session: s.name,
        question: `The auditor reported ${judged.parks.length} high finding(s) on ${m.label}: ${judged.parks.map((f) => `${f.id} ${f.category} — ${f.explanation}`).join(' | ')}. Are they real?`,
        options: [ANSWERS.auditReal, ANSWERS.auditNotReal],
        why: `a high finding in a park category (${this.config.audit.parkOn.join(', ')}); the auditor only advises, so a person judges it`,
        artifacts: [this.rel(path.join(this.epicDir(e), file)), this.rel(path.join(s.stepDir, 'bundle', 'diff.patch'))],
        resume: `open a new session in the fetched repo: /peak-workflow:start-epic ${e.id} to fix it, or /peak-workflow:wrapup-epic ${e.id} to verify it as built`,
      });
      return this.park(e, `auditor: ${list} (${s.name})`);
    }
    return this.humanCheck(e) ? null : 'VERIFY';
  }

  /**
   * Human-check epics (operator-observed, UI) park before VERIFY with something to look at
   * (guardrail G2). The look is the owner's; the driver only produces the artifact. Returns true
   * when the epic parked.
   */
  humanCheck(e) {
    const m = this.meta(e);
    if (!m.humanCheck) return false;
    const tip = this.branchTip(m.branch);
    if (e.look?.branchTip === tip) return false; // the owner already looked at exactly this tip
    e.look = null;
    const made = this.produceArtifacts(e);
    this.writeGate(e, {
      kind: 'human-check', skillStep: 'wrapup-epic Step 1.2 item 7',
      question: `${m.reasons.filter((r) => /operator-observed|UI epic/.test(r)).join('; ') || 'this epic needs a person to look'}. Does what was built look right?`,
      options: [ANSWERS.looksRight, ANSWERS.notRight],
      why: `autopilot never self-approves a look${made.artifacts.length ? '' : ` — and it could not produce anything to look at: ${made.notes.join('; ')}`}`,
      artifacts: made.artifacts, artifactNotes: made.notes,
      resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
    });
    this.park(e, made.artifacts.length ? 'human check needed before verify' : 'human check needed before verify (nothing could be produced to look at)');
    return true;
  }

  /**
   * What a person can look at for a human-check gate: the manual test files the build wrote, and
   * the output of the project's run command (`settings.json` `humanCheck["<epic>"]` or
   * `humanCheck["*"]`, else the **Run:** line of CLAUDE.md) with any file it leaves behind.
   */
  produceArtifacts(e) {
    const m = this.meta(e); const b = m.branch; const artifacts = []; const notes = [];
    const manual = this.g('ls-tree', '-r', '--name-only', b, '--', 'tests/manual').split('\n').filter((f) => m.anchors.some((tor) => f.includes(tor)));
    for (const f of manual) artifacts.push(`clone:${f}`);
    if (!manual.length) notes.push('the build wrote no tests/manual/<TOR>.md file for this epic');
    const cmd = this.config.humanCheck?.[e.id] ?? this.config.humanCheck?.['*'] ?? readProjectFacts(this.clone).runCommand;
    if (!cmd) { notes.push('CLAUDE.md has no **Run:** command and settings.json names no humanCheck command'); return { artifacts, notes }; }
    if (this.currentBranch() !== b) { if (this.dirty()) { notes.push('the clone has uncommitted changes, so the run command was not run'); return { artifacts, notes }; } this.g('checkout', '-q', b); }
    const dir = path.join(this.epicDir(e), 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    const r = sh(cmd, [], { cwd: this.clone, shell: true, timeout: Math.min(this.config.budgets.testRunMin, 2) * 60000, killSignal: 'SIGKILL' });
    fs.writeFileSync(path.join(dir, 'run-output.txt'), `$ ${cmd}\n(exit ${r.code}${r.timedOut ? ', killed at the time limit' : ''}, on ${b} at ${this.branchTip(b)})\n\n${r.out}\n${r.err ? `\n--- stderr ---\n${r.err}\n` : ''}`);
    artifacts.push(this.rel(path.join(dir, 'run-output.txt')));
    // Files the command left in the clone (a built page, a chart) are kept as artifacts; the clone goes back to the commit.
    for (const line of this.g('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean)) {
      const f = line.slice(3);
      const src = path.join(this.clone, f);
      if (!exists(src) || !fs.statSync(src).isFile() || fs.statSync(src).size > 20 * 1024 * 1024) continue;
      const dest = path.join(dir, 'files', f);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      artifacts.push(this.rel(dest));
    }
    this.g('checkout', '-q', '-f', b); this.g('clean', '-fdq');
    return { artifacts, notes };
  }

  /**
   * Before VERIFY, a branch that is behind the integration line is brought up to date with it (the
   * owner's decision after scenario D). A branch that waited for a person was cut before other
   * epics merged; wrapup-epic refreshes the shared docs on the branch, and from an old copy of
   * them that refresh conflicts at the merge. Caught up first, it is written on top of what the
   * earlier epics left, and the verifier checks the code as it will land. Returns a reason when
   * the two do not merge cleanly: a person resolves that.
   */
  catchUp(e) {
    const m = this.meta(e); const dev = this.state.integration; const b = m.branch;
    if (!this.branchTip(b) || gitOk(this.clone, 'merge-base', '--is-ancestor', dev, b)) return null;
    if (this.currentBranch() !== b) { if (this.dirty()) return `the clone has uncommitted changes, so ${b} could not be brought up to date with ${dev}`; this.g('checkout', '-q', b); }
    const from = this.branchTip(b);
    const r = gitRun(this.clone, 'merge', '--no-ff', '--no-edit', '-m', `Merge ${dev} into ${b} (autopilot: catch up before verify)`, dev);
    if (r.code !== 0) {
      const files = gitRun(this.clone, 'diff', '--name-only', '--diff-filter=U').out.split('\n').filter(Boolean);
      gitRun(this.clone, 'merge', '--abort');
      return `${b} does not merge cleanly with ${dev} (${files.join(', ') || r.err.split('\n')[0]}): merge ${dev} into the branch by hand, then resume`;
    }
    e.caughtUp = { from, to: this.branchTip(b), integration: this.integrationSha() };
    this.log(`${e.id}: ${b} brought up to date with ${dev} before verify (${from.slice(0, 9)} → ${e.caughtUp.to.slice(0, 9)})`);
    return null;
  }

  async doVerify(e) {
    const m = this.meta(e);
    const stuck = this.catchUp(e);
    if (stuck) return this.parkResumable(e, stuck, 'VERIFY');
    e.preVerify = { developSha: this.integrationSha(), branchTip: this.branchTip(m.branch), branch: m.branch };
    this.save();
    const s = await this.step(e, 'verify', (stepDir) => {
      if (!e.look) return { prompt: `/peak-workflow:wrapup-epic ${e.id}` };
      // The owner already looked (a decided human-check gate). The verifier gets their recorded
      // observation up front, so wrapup Step 1.2 item 7 records it instead of asking a person who is
      // not there. Seen live: without this the session asks "What do you see?" and parks.
      const file = path.join(stepDir, 'owner-look.md');
      fs.writeFileSync(file, ownerLook(e.look, m, e.caughtUp));
      return { prompt: `/peak-workflow:wrapup-epic ${e.id}`, appendFiles: [file] };
    });
    if (!s) return null;
    if (this.integrationSha() !== e.preVerify.developSha) return 'CHECK_VERIFY';
    // No merge and no gate: the verdict was FAIL (policy answers "Stop — epic FAILs").
    const verdict = (s.result?.result ?? '').trim() || '(the verify session gave no result text)';
    this.wipCommit(e);
    // The verifier could not judge an operator-observed requirement from the owner's recorded look
    // (seen live: the note covered the labels and said nothing of the bar heights). No code is
    // wrong, so this is not a repair: the missing observation is the owner's to give. Ask again,
    // with the verifier's reason, and leave the fix round unused.
    const unsettled = e.look ? this.unsettledLook(e, s) : [];
    if (unsettled.length) {
      const look = e.look; e.look = null;
      this.writeGate(e, {
        kind: 'human-check', skillStep: 'wrapup-epic Step 1.2 item 7',
        question: `The verifier could not judge ${unsettled.map((u) => u.tor).join(', ')} from what you recorded. ${unsettled.map((u) => u.reason).join(' ')} Look again with that in mind: does what was built look right?`,
        options: [ANSWERS.looksRight, ANSWERS.notRight],
        why: `your recorded look ("${look.note ?? look.gate}") did not settle every part of the requirement; autopilot never fills in an observation`,
        artifacts: look.artifacts ?? [], verifierReport: this.rel(path.join(s.stepDir, 'result.json')),
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
      });
      return this.park(e, `the owner's recorded look did not settle ${unsettled.map((u) => u.tor).join(', ')}`);
    }
    // Verified but not merged (seen live: the merge into the integration line hit a conflict, the
    // verifier settled it on the branch and stopped). Nothing failed and nothing needs repair: the
    // branch says Complete with every anchor verified. Park it for the owner; never call it FAIL.
    const sc = parseSidecar(gitShow(this.clone, m.branch, m.sidecar));
    if (sc.fields.status === 'Complete' && m.anchors.length > 0 && m.anchors.every((t) => sc.verified[t])) {
      const reason = `${s.name} verified every requirement and marked the epic Complete on ${m.branch}, but did not merge it into ${this.state.integration}`;
      this.writeGate(e, {
        kind: 'resume', skillStep: 'wrapup-epic Step 5', phase: 'VERIFY',
        question: `${m.label}: ${reason}. Continue it in the next run?`,
        options: [ANSWERS.resume, ANSWERS.startOver],
        why: `nothing failed: the verifier's report is attached. "${ANSWERS.resume}" runs the verify step again on the same branch; or merge it by hand: git merge --no-ff ${m.branch}`,
        artifacts: [this.rel(path.join(s.stepDir, 'result.json'))],
        resume: `in the fetched repo: git checkout ${this.state.integration} && git merge --no-ff ${m.branch}`,
      });
      return this.park(e, reason);
    }
    if (e.fixRounds >= 1) return this.finish(e, 'FAILED', `${s.name} FAIL after the fix round: ${verdict.split('\n')[0].slice(0, 200)}`);
    e.fixRounds = 1;
    this.writeFixBrief(e, 'The independent verifier returned FAIL. Its final report:', [verdict]);
    this.log(`${e.id}: ${s.name} verdict FAIL; starting the one fix round`);
    return 'FIX_BUILD';
  }

  /** Operator-observed anchors the verify session reported CANNOT VERIFY, with its reason (from the question policy answered). */
  unsettledLook(e, s) {
    const m = this.meta(e);
    const observed = new Set(m.reasons.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]));
    const out = [];
    const file = path.join(s.stepDir, 'hooks.jsonl');
    for (const line of exists(file) ? read(file).split('\n').filter(Boolean) : []) {
      let h; try { h = JSON.parse(line); } catch { continue; }
      if (h.hook !== 'PreToolUse' || h.tool_name !== 'AskUserQuestion') continue;
      const input = typeof h.tool_input === 'string' ? tryParse(h.tool_input) : h.tool_input;
      for (const q of input?.questions ?? []) {
        const hit = String(q.question ?? '').match(/^\W*(TOR-\d{2}-[A-Za-z0-9]{7}) is CANNOT VERIFY:\s*([\s\S]*?)(?:\s*Recommendation:|\s*How to proceed\?|$)/);
        if (hit && observed.has(hit[1]) && !out.some((u) => u.tor === hit[1])) out.push({ tor: hit[1], reason: hit[2].trim().replace(/\s+/g, ' ').slice(0, 900) });
      }
    }
    return out;
  }

  /** CHECK_VERIFY, the merge gate (§6.5 and SPIKE.md "Owner decisions"). */
  checkVerify(e) {
    const m = this.meta(e); const dev = this.state.integration; const pre = e.preVerify;
    const checks = [];
    const add = (name, pass, evidence) => checks.push({ name, pass: !!pass, evidence });
    // The verifier may repair what it found only when the owner said so: this verify session was
    // resumed from a gate the owner answered "Fix now" (as wrapup-epic allows with a person
    // present). Unattended, policy answers "Stop — epic FAILs" and a separate session repairs.
    const ownerFix = e.resumed?.phase === 'VERIFY' && /^fix now\b/i.test(e.resumed.answer ?? '') ? e.resumed.gate : null;
    const fixedFiles = [];

    const firstParent = this.g('rev-list', '--first-parent', `${pre.developSha}..${dev}`).split('\n').filter(Boolean);
    const parents = firstParent.length === 1 ? this.g('rev-list', '--parents', '-n', '1', dev).split(' ').slice(1) : [];
    const problems = [];
    if (firstParent.length !== 1) problems.push(`${dev} advanced by ${firstParent.length} first-parent commits, not exactly one merge`);
    else if (parents.length !== 2) problems.push(`the new commit on ${dev} has ${parents.length} parent(s); it is not a --no-ff merge`);
    else {
      const [p1, p2] = parents;
      if (p1 !== pre.developSha) problems.push('the merge\'s first parent is not the pre-verify integration tip');
      if (!gitOk(this.clone, 'merge-base', '--is-ancestor', pre.branchTip, p2)) problems.push('the merge\'s second parent does not descend from the pre-verify branch tip');
      else {
        // A branch that waited for the owner is behind the integration line, and the verifier merges
        // that line into it first (seen live). A file that arrives exactly as the integration line
        // has it is another epic's merged work, not something this verify session wrote.
        const blob = (rev, f) => { const r = gitRun(this.clone, 'rev-parse', '-q', '--verify', `${rev}:${f}`); return r.code === 0 ? r.out : ''; };
        const stray = this.g('diff', '--name-only', `${pre.branchTip}..${p2}`).split('\n').filter((f) => f && !f.startsWith('docs/') && f !== m.sidecar && blob(p2, f) !== blob(pre.developSha, f));
        if (stray.length && ownerFix) fixedFiles.push(...stray);
        else if (stray.length) problems.push(`commits added during verify touch files outside docs/: ${stray.join(', ')}`);
        if (gitOk(this.clone, 'merge-base', '--is-ancestor', pre.developSha, p2) && this.g('rev-parse', `${dev}^{tree}`) !== this.g('rev-parse', `${p2}^{tree}`)) problems.push('the merge commit itself changes files');
      }
    }
    add('verdict', problems.length === 0, problems.length ? problems : { merge: this.integrationSha(), parents, ...(fixedFiles.length ? { fixedDuringWrapup: fixedFiles, approvedBy: ownerFix } : {}) });

    const sc = parseSidecar(gitShow(this.clone, dev, m.sidecar));
    const unverified = m.anchors.filter((t) => !sc.verified[t]);
    add('sidecar-on-integration', sc.fields.status === 'Complete' && /^\d{4}-\d{2}-\d{2}/.test(sc.fields.completed ?? '') && unverified.length === 0, { status: sc.fields.status ?? null, completed: sc.fields.completed ?? null, anchorsWithoutVerifiedLine: unverified });

    // No waivers: parse the Deferrals Count: line; the words always appear, so never grep for them.
    const handoff = gitShow(this.clone, dev, `${PLAN_DIR}/session-handoffs/epic-${e.id}-complete.md`);
    const section = handoff && /^## Deferrals\b/m.test(handoff) ? handoff.slice(handoff.search(/^## Deferrals\b/m)) : null;
    const countLine = section ? (section.match(/^Count:.*$/m) ?? [])[0] : null;
    const numbers = countLine ? countLine.match(/\d+/g) ?? [] : [];
    const waivedLine = 'waived' in sc.fields;
    // "fixed at wrapup" may be above zero only for an owner-approved Fix now; every other count stays zero.
    const fixed = Number((countLine?.match(/fixed at wrapup:\s*(\d+)/i) ?? [])[1] ?? 0);
    const others = countLine ? [...countLine.matchAll(/([a-z][a-z ]*):\s*(\d+)/gi)].filter(([, k]) => !/^fixed at wrapup$/i.test(k.trim()) && !/^count$/i.test(k.trim())).map(([, , n]) => Number(n)) : [];
    const total = Number(numbers[0] ?? NaN);
    const countsOk = numbers.length > 0 && others.every((n) => n === 0) && (ownerFix ? total === fixed : numbers.every((x) => Number(x) === 0));
    add('no-waivers', !waivedLine && countsOk, { waivedLineInSidecar: waivedLine, countLine: countLine ?? (handoff === null ? 'complete handoff missing' : 'no Deferrals Count: line'), ...(ownerFix ? { fixedAtWrapupApprovedBy: ownerFix } : {}) });
    if (fixed > 0 || fixedFiles.length) e.fixedAtWrapup = { count: fixed, files: fixedFiles, approvedBy: ownerFix };

    if (this.currentBranch() !== dev && !this.dirty()) this.g('checkout', '-q', dev);
    if (this.currentBranch() === dev && !this.dirty()) {
      const t = this.runTests();
      add('tests-green-on-integration', t.pass, { exit: t.code, timedOut: t.timedOut, skips: t.skips, tail: t.pass ? undefined : t.tail });
      if (t.pass && t.skips !== null) this.state.baseSkips = t.skips;
    } else add('tests-green-on-integration', false, `not run: the clone is not a clean checkout of ${dev}`);

    const h = this.health(dev);
    add('requirements-health', h.pass, h.evidence);
    return { pass: checks.every((c) => c.pass), checks };
  }

  doCheckVerify(e) {
    e.state = 'CHECK_VERIFY'; this.save();
    const n = (e.attempts.checkVerify = (e.attempts.checkVerify ?? 0) + 1);
    const r = this.checkVerify(e);
    writeJson(path.join(this.epicDir(e), `check-verify-${n}.json`), r);
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.name);
    e.checks.push({ file: `check-verify-${n}.json`, pass: r.pass, failed });
    if (!r.pass) {
      this.rollback(e);
      return this.finish(e, 'PARKED', `merge gate failed (${failed.join(', ')}); ${this.state.integration} rolled back`);
    }
    gitRun(this.clone, 'config', '--remove-section', `branch.${e.preVerify.branch}`); // stale entry left by the sandboxed `git branch -d`
    return this.finish(e, 'MERGED', 'verify PASS, merge gate green');
  }

  async runEpic(e, entry = 'PLAN') {
    let phase = entry;
    while (phase) {
      const stop = this.runStop();
      if (stop) return this.parkResumable(e, `run stopped (${stop}) before ${phase}`, phase === 'CHECK_BUILD_INTERRUPTED' ? 'CHECK_BUILD' : phase);
      if (phase === 'PLAN') phase = await this.doPlan(e);
      else if (phase === 'BUILD') phase = await this.doBuild(e, false);
      else if (phase === 'FIX_PLAN' || phase === 'FIX_BUILD') phase = await this.doBuild(e, true); // FIX_PLAN: a state saved by an earlier driver, when a repair was two sessions
      else if (phase === 'CHECK_BUILD') phase = this.doCheckBuild(e);
      else if (phase === 'CHECK_BUILD_INTERRUPTED') phase = this.doCheckBuild(e, { interrupted: true });
      else if (phase === 'AUDIT') phase = await this.doAudit(e);
      else if (phase === 'VERIFY') phase = await this.doVerify(e);
      else if (phase === 'CHECK_VERIFY') phase = this.doCheckVerify(e);
      else throw new Error(`unknown phase ${phase}`);
    }
    return null;
  }

  /**
   * `onPark: "stop"` (the default): an epic that parked or failed ends the run. Which epics are
   * independent of it is the planner's judgement, so nothing more is built until the owner has looked.
   */
  stopOnPark(e) {
    if (this.config.onPark !== 'stop' || this.stopReason || !['PARKED', 'FAILED'].includes(e.state)) return;
    this.stopReason = `${e.id} ${e.state === 'PARKED' ? 'parked' : 'failed'} (onPark: stop)`;
    this.state.stoppedOnPark = { epic: e.id, state: e.state, settingsFile: projectSettingsFile(this.config.project) };
    this.log(`${e.id} ${e.state}: stopping the run (onPark is "stop"; set "onPark": "continue" in ${projectSettingsFile(this.config.project)} to keep building independent epics)`);
  }

  // ---- sync with the project at run start (P3.5 Part 3) ---------------------------------------

  /**
   * Brings the project's integration line into the clone before preflight: a one-off URL fetch (the
   * clone still has no remote), then fast-forward, build on top, or refuse. One of the driver's
   * few git writes in the clone, and only ever a fast-forward.
   */
  syncWithProject(integration) {
    const project = this.config.project;
    if (this.dirty()) throw new Error(`the private clone has uncommitted changes on ${this.currentBranch()}; a run does not start on a dirty clone`);
    const f = gitRun(this.clone, 'fetch', '-q', '--no-tags', project, integration);
    if (f.code !== 0) throw new Error(`could not fetch ${integration} from ${project}: ${f.err}`);
    const s = syncFacts(project, this.stateDir, integration);
    if (s.state === 'diverged') throw new Error(divergedText(s, project, this.clone, integration));
    if (s.state === 'project-ahead') {
      if (this.currentBranch() !== integration) this.g('checkout', '-q', integration);
      this.g('merge', '-q', '--ff-only', s.projectTip);
      this.log(`sync: ${integration} fast-forwarded ${s.cloneTip.slice(0, 9)} → ${s.projectTip.slice(0, 9)} from the project`);
    } else if (s.state === 'clone-ahead') this.log(`sync: the clone is ${s.waiting.length} commit(s) ahead of the project on ${integration} (merged work not fetched yet); building on top`);
    else this.log(`sync: ${integration} is the same in the project and the clone (${String(s.cloneTip).slice(0, 9)})`);
    return s;
  }

  // ---- entering an epic: from scratch, or from the owner's decision on its gate (P3.5 Part 2) ----

  /** Other live gates of this epic stop counting once it is entered again. */
  supersedeGates(e, keep) {
    const now = { run: this.runName, date: new Date().toISOString() };
    for (const g of readGates(this.stateDir).filter((x) => x.epic === e.id && gateLive(x) && x.file !== keep)) this.markGate(g.file, g.kind === 'preflight' ? { cleared: now } : { superseded: now });
  }
  /** A branch left by an earlier attempt is set aside, never deleted: the fresh plan gets a fresh branch. */
  supersedeBranch(e) {
    const b = this.meta(e).branch; const tip = this.branchTip(b);
    if (!tip) return;
    if (this.currentBranch() === b) this.g('checkout', '-q', '-f', this.state.integration);
    const ref = `refs/autopilot/superseded/${e.id}-${Date.now()}`;
    this.g('update-ref', ref, tip);
    this.g('branch', '-q', '-D', b);
    gitRun(this.clone, 'config', '--remove-section', `branch.${b}`);
    e.superseded = [...(e.superseded ?? []), ref];
    this.log(`${e.id}: the earlier branch ${b} (${tip.slice(0, 9)}) is kept at ${ref}; the epic starts on a fresh branch`);
  }

  /**
   * The phase an epic starts at in this run: `PLAN` from scratch, or the phase the owner's decided
   * gate names (the Part 2 table), on the branch the earlier run left. Returns null when the epic
   * already reached a terminal state here.
   */
  enter(e) {
    const m = this.meta(e); const f = this.gates.get(e.id);
    const now = () => new Date().toISOString();
    if (f?.state === 'resume') {
      const g = readJson(this.gatePath(f.gate)); const rec = this.records()[e.id] ?? {};
      const entry = f.entry; let phase = entry.phase;
      Object.assign(e, { fixRounds: rec.fixRounds ?? 0, plan: rec.plan ?? null, planApprovedBy: rec.planApprovedBy ?? null, buildSteps: rec.buildSteps ?? [], audits: rec.audits ?? [] });
      if (rec.fixBrief) fs.writeFileSync(path.join(this.epicDir(e), 'fix-brief.md'), rec.fixBrief);
      e.resumed = { gate: f.gate, kind: f.kind, answer: f.answer, by: f.by, phase, branch: g.branch, branchTip: g.branchTip, fromRun: g.run ?? null };
      this.supersedeGates(e, f.gate);
      const used = (extra = {}) => this.markGate(f.gate, (x) => ({ ...x, decided: { ...x.decided, used: { run: this.runName, phase, date: now(), ...extra } } }));
      if (entry.approve) { e.plan = g.artifacts?.[0] ?? null; e.planApprovedBy = g.decided.by; e.planStep = g.session ?? null; }
      if (entry.look) e.look = { gate: f.gate, by: g.decided.by, date: g.decided.date, note: g.decided.note ?? null, branchTip: g.branchTip, artifacts: g.artifacts ?? [] };
      if (entry.fix) {
        if (e.fixRounds >= 1) { used(); return this.finish(e, 'FAILED', `you answered "${f.answer}" on ${f.gate}, but this epic's one fix round is already used; ${g.resume ?? 'continue it by hand'}`); }
        e.fixRounds = 1;
        if (entry.fix === 'audit') {
          const audit = tryJson(path.join(this.stateDir, g.artifacts?.[0] ?? '-'), {});
          const parks = (audit.findings ?? []).filter((x) => x.parks);
          this.writeFixBrief(e, `The auditor reported these high findings and the owner (${g.decided.by}) confirmed they are real:`, [...parks.map((x) => `- **${x.id} ${x.category}** — ${x.explanation} (evidence: ${x.evidence})`), ...(g.decided.note ? ['', `The owner's note: ${g.decided.note}`] : [])]);
        } else {
          this.writeFixBrief(e, `The owner (${g.decided.by}) looked at what was built and answered "${f.answer}":`, [g.decided.note ? `> ${g.decided.note}` : '(no note was recorded: re-read the requirement and what the gate showed)', '', `They looked at: ${(g.artifacts ?? []).join(', ') || '(nothing could be produced)'}`]);
        }
      }
      // Phases that run a captured plan need it; without one the epic is planned again.
      if (phase === 'BUILD' && !(e.plan && exists(path.join(this.stateDir, e.plan)))) { phase = 'PLAN'; e.resumed.phase = phase; }
      if (f.kind === 'audit' && phase === 'VERIFY') e.auditOverruled = { gate: f.gate, by: g.decided.by };
      if (!entry.question) used(); // a question gate is marked used by hook R8 when it answers
      e.resumed.behind = f.behind ?? 0;
      this.log(`${e.id}: resuming at ${phase} on ${g.branch} (${String(g.branchTip).slice(0, 9)}${f.behind ? `, ${f.behind} commit(s) behind ${this.state.integration}; it merges cleanly` : ''}): ${g.decided.by} answered "${f.answer}" on ${f.gate}`);
      return phase;
    }
    if (f?.state === 'void') {
      this.markGate(f.gate, { void: { run: this.runName, date: now(), why: f.why } });
      e.voided = { gate: f.gate, answer: f.answer, why: f.why };
      this.log(`${e.id}: the decision on ${f.gate} ("${f.answer}") is void — ${f.why}; planning the epic again from scratch`);
    } else if (f?.state === 'fresh') {
      this.markGate(f.gate, (x) => ({ ...x, decided: { ...x.decided, used: { run: this.runName, phase: 'PLAN', date: now() } } }));
      e.resumed = { gate: f.gate, kind: f.kind, answer: f.answer, by: f.by, phase: 'PLAN', fresh: true };
      this.log(`${e.id}: starting over: ${f.by} answered "${f.answer}" on ${f.gate}`);
    }
    this.supersedeGates(e, null);
    this.supersedeBranch(e);
    this.forget(e);
    return 'PLAN';
  }

  // ---- crash resume (§9): an in-flight step is never re-trusted ---------------------------------

  recover() {
    for (const e of this.state.queue) {
      if (TERMINAL.has(e.state) || e.state === 'QUEUED') continue;
      const st = e.step;
      if (st?.pid && pidAlive(st.pid)) {
        const cmdline = sh('ps', ['-p', String(st.pid), '-o', 'command=']).out;
        if (cmdline.includes(st.sessionId)) { killGroup(st.pid, 'SIGKILL'); this.log(`${e.id}: killed leftover session ${st.name} (pid ${st.pid})`); }
      }
      e.resumes = e.resumes ?? {};
      const again = (key) => { e.resumes[key] = (e.resumes[key] ?? 0) + 1; return e.resumes[key] <= 1; };
      let entry;
      if (e.state === 'PLAN') entry = again(e.state) ? e.state : null;
      else if (e.state === 'FIX_PLAN') entry = again(e.state) ? 'FIX_BUILD' : null;
      else if (e.state === 'BUILD' || e.state === 'FIX_BUILD') entry = 'CHECK_BUILD_INTERRUPTED';
      else if (e.state === 'CHECK_BUILD' || e.state === 'AUDIT' || e.state === 'CHECK_VERIFY') entry = e.state;
      else if (e.state === 'VERIFY') {
        if (e.preVerify && this.integrationSha() !== e.preVerify.developSha) entry = 'CHECK_VERIFY';
        else if (again('VERIFY')) { if (e.preVerify) this.rollback(e); entry = 'VERIFY'; }
        else entry = null;
      }
      this.log(`${e.id}: driver restarted while ${e.state}${st ? ` (${st.name})` : ''}; ${entry ? `re-entering at ${entry}` : 'already re-run once — parking'}`);
      e.step = null;
      if (entry) this.entry[e.id] = entry;
      else this.park(e, `interrupted twice during ${e.state}`);
    }
    this.save();
  }

  // ---- the run loop ------------------------------------------------------------------------------

  /** The next epic to run, after marking every epic whose dependencies can no longer be met as BLOCKED. */
  next() {
    const byId = new Map(this.state.queue.map((q) => [q.id, q]));
    const depState = (d) => {
      const q = byId.get(d);
      if (q) return q.state === 'MERGED' ? 'met' : TERMINAL.has(q.state) ? 'dead' : 'pending';
      return this.pre.epics.find((p) => p.id === d)?.eligibility === 'complete' ? 'met' : 'dead';
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const e of this.state.queue.filter((q) => q.state === 'QUEUED')) {
        const dead = this.meta(e).deps.filter((d) => depState(d) === 'dead');
        if (dead.length) { this.finish(e, 'BLOCKED', `dependency not merged: ${dead.map((d) => `${d} (${byId.get(d)?.state ?? 'not queued and not Complete'})`).join(', ')}`); changed = true; }
      }
    }
    const resumed = this.state.queue.find((q) => this.entry[q.id]);
    if (resumed) return resumed;
    const ready = this.state.queue.find((q) => q.state === 'QUEUED' && this.meta(q).deps.every((d) => depState(d) === 'met'));
    if (!ready) for (const e of this.state.queue.filter((q) => q.state === 'QUEUED')) this.finish(e, 'BLOCKED', 'dependency cycle in the queue');
    return ready ?? null;
  }

  async run({ resume }) {
    const cfg = this.config;
    fs.mkdirSync(this.stateDir, { recursive: true });
    this.acquireLock();
    try {
      const resuming = exists(this.stateFile);
      if (resume && !resuming) throw new Error(`${this.stateFile} does not exist: there is no run to resume`);
      if (resuming && !resume) throw new Error(`${this.stateFile} already exists: pass --resume to continue that run`);
      if (!resuming) {
        const last = currentRun(this.stateDir);
        const unfinished = last && last !== this.runName && tryJson(path.join(runDirOf(this.stateDir, last), 'state.json'))?.status === 'running';
        if (unfinished) throw new Error(`run ${last} did not finish (the driver was killed): pass --resume to continue that run first`);
      }
      if (cfg.claudeBin !== 'claude' && !cfg.allowTestDouble) throw new Error(TEST_DOUBLE(cfg.claudeBin));

      if (!exists(this.clone)) {
        const integration = detectIntegration(cfg.project);
        if (!integration) throw new Error(`${cfg.project} is not the root of a git repository with a develop, main or master branch`);
        git(cfg.project, 'clone', '-q', '--no-hardlinks', '--branch', integration, cfg.project, this.clone);
        this.g('remote', 'remove', 'origin');
        this.log(`private clone made at ${this.clone} (${integration}, no origin)`);
      }
      const integration = detectIntegration(this.clone);
      const sync = resuming ? null : this.syncWithProject(integration); // refuses a diverged project before anything is written

      // From here the run exists on disk: its directory, its config, and the workspace's pointer to it.
      fs.mkdirSync(this.runDir, { recursive: true });
      const cfgFile = path.join(this.runDir, 'config.json');
      const saved = tryJson(cfgFile, {});
      writeJson(cfgFile, { ...Object.fromEntries(RUN_KEYS.filter((k) => cfg[k] !== undefined).map((k) => [k, cfg[k]])), ...saved, project: cfg.project });
      if (!exists(path.join(this.stateDir, 'settings.json'))) writeJson(path.join(this.stateDir, 'settings.json'), { project: cfg.project });
      writeAtomic(path.join(this.stateDir, 'current'), `${this.runName}\n`);

      if (resuming) {
        this.state = readJson(this.stateFile);
        this.state.status = 'running'; this.state.stoppedBecause = null;
        this.log(`resuming run ${this.runName}`);
      } else {
        this.state = { run: new Date().toISOString(), name: this.runName, driverVersion: DRIVER_VERSION, pluginDir: this.pluginDir, integration, startSha: null, spentUsd: 0, runBudgetUsd: cfg.runBudgetUsd, testCommand: cfg.testCommand, status: 'running', stoppedBecause: null, consecutiveInfra: 0, baseSkips: null, sync, queue: [] };
      }

      // Preflight reads the integration line, so the clone must be on it.
      if (!resuming) {
        if (this.currentBranch() !== integration) { if (this.dirty()) throw new Error(`the private clone has uncommitted changes on ${this.currentBranch()}; a run does not start on a dirty clone`); this.g('checkout', '-q', integration); }
        this.state.startSha = this.integrationSha();
      } else if (!this.state.queue.some((q) => !TERMINAL.has(q.state) && q.state !== 'QUEUED') && this.currentBranch() !== integration && !this.dirty()) this.g('checkout', '-q', integration);
      // Gate decisions are judged once, at run start: valid ones resume, void ones are planned again.
      if (!resuming) this.state.gateFacts = Object.fromEntries(gateFacts(this.stateDir, integration));
      this.gates = new Map(Object.entries(this.state.gateFacts ?? {}));
      this.pre = preflight(this.clone, cfg, { pluginDir: this.pluginDir, gates: this.gates });
      this.pre.epics = this.pre.epics.map((p) => ({ ...p }));
      this.metaById = new Map(this.pre.epics.map((p) => [p.id, p]));
      if (!resuming) {
        this.state.queue = buildQueue(this.pre, cfg).map((m) => ({ id: m.id, name: m.name, label: m.label, state: 'QUEUED', reason: null, attempts: {}, fixRounds: 0, costUsd: 0, turns: 0, wallMs: 0, sessions: [], gates: [], checks: [], planStep: null, preVerify: null, step: null }));
        writeJson(path.join(this.runDir, 'preflight.json'), this.pre);
        this.state.testCommand = this.pre.testCommand;
      } else {
        // Epics already in the run keep the eligibility they started with; their sidecars have moved since.
        for (const q of this.state.queue) { const m = this.metaById.get(q.id); if (m && q.state !== 'QUEUED') { m.eligibility = 'eligible'; m.reasons = []; } }
      }
      this.save();
      this.log(`run ${this.runName}: queue ${this.state.queue.map((q) => q.id).join(', ') || '(empty)'}; integration line ${integration}`);

      if (!this.pre.ok) this.stopReason = `preflight: ${this.pre.refuse.join('; ')}`;
      if (resuming && !this.stopReason) this.recover();

      while (!this.stopReason) {
        if (this.runStop()) break;
        const e = this.next();
        if (!e) break;
        const m = this.meta(e);
        const entry = this.entry[e.id]; delete this.entry[e.id];
        fs.mkdirSync(this.epicDir(e), { recursive: true });
        if (!entry) {
          writeJson(path.join(this.epicDir(e), 'preflight.json'), m);
          if (m.eligibility === 'skip' || m.eligibility === 'complete') { this.finish(e, 'SKIPPED', m.reasons.join('; ')); continue; }
          if (m.eligibility === 'park') {
            this.writeGate(e, { kind: 'preflight', skillStep: 'start-epic Steps 1–2', question: m.reasons.join('; '), options: [], why: 'a decision only the owner can make; no session was started', artifacts: [] });
            this.finish(e, 'PARKED', m.reasons.join('; ')); this.stopOnPark(e); continue;
          }
          // Base red stops the whole run: every epic would build on it.
          if (this.currentBranch() !== integration) { if (this.dirty()) { this.stopReason = `clone is dirty on ${this.currentBranch()}`; break; } this.g('checkout', '-q', integration); }
          const t = this.runTests();
          if (!t.pass) { this.stopReason = 'base red'; this.state.baseRed = { before: e.id, exit: t.code, timedOut: t.timedOut, tail: t.tail }; this.log(`base red: \`${cfg.testCommand}\` fails on ${integration} (exit ${t.code}); stopping the run`); break; }
          this.state.baseSkips = t.skips;
          e.startedAt = new Date().toISOString();
        }
        const phase = entry ?? this.enter(e);
        this.save();
        if (phase) await this.runEpic(e, phase);
        this.stopOnPark(e);
      }

      const left = this.state.queue.filter((q) => !TERMINAL.has(q.state)).length;
      this.state.stoppedBecause = this.stopReason ?? (left ? 'nothing runnable' : 'queue done');
      this.state.status = this.stopReason ? 'STOPPED' : 'DONE';
      this.state.endedAt = new Date().toISOString();
      this.save();
      if (this.stopReason === 'STOP file') fs.rmSync(path.join(this.stateDir, 'STOP'), { force: true }); // honoured; the workspace outlives the run
      writeReport(this.runDir);
      this.log(`run ended: ${this.state.stoppedBecause}; report at ${path.join(this.runDir, 'report.md')}`);
      return this.state;
    } finally {
      // A run refused before its directory existed still leaves its lines (a stale lock taken over) in the latest run's log.
      const last = currentRun(this.stateDir);
      if (this.early.length && !exists(this.runDir) && last) fs.appendFileSync(path.join(runDirOf(this.stateDir, last), 'autopilot.log'), this.early.splice(0).join(''));
      this.releaseLock();
    }
  }
}

/** What the skill needs to know before it offers a launch: read-only facts about the project and its workspace. */
export function launchFacts(project, workspace, config) {
  const refuse = []; const warn = [];
  const integration = detectIntegration(project);
  if (!integration) refuse.push(`${project} is not the root of a git repository with a develop, main or master branch`);
  const dirty = integration ? gitRun(project, 'status', '--porcelain').out.split('\n').filter(Boolean).length : 0;
  if (dirty) warn.push(`${dirty} uncommitted change(s) in the project are not part of the run: autopilot clones committed work on ${integration}`);
  let freeGb = null;
  try { const f = fs.statfsSync(exists(workspace) ? workspace : path.dirname(workspace)); freeGb = +((f.bavail * f.bsize) / 1024 ** 3).toFixed(1); } catch { /* unknown */ }
  if (freeGb !== null && freeGb < config.diskFloorGb) refuse.push(`free disk is ${freeGb} GB, under the ${config.diskFloorGb} GB floor`);
  const script = /\.(mjs|cjs|js)$/.test(config.claudeBin);
  const bin = sh(script ? process.execPath : config.claudeBin, ['--version'], { timeout: 20000 });
  if (bin.code !== 0 && !script) refuse.push(`\`${config.claudeBin} --version\` failed: Claude Code is not on PATH`);
  if (config.claudeBin !== 'claude') (config.allowTestDouble ? warn : refuse).push(config.allowTestDouble ? `claudeBin is ${config.claudeBin}, not the real \`claude\`: this run is a rehearsal against a test double` : TEST_DOUBLE(config.claudeBin));
  if (config.endBy && Date.parse(config.endBy) <= Date.now()) { warn.push(`the saved end time ${config.endBy} is in the past; using the next 06:30 instead`); config.endBy = nextEndBy(); }

  const lock = tryJson(path.join(workspace, 'lock'));
  const running = lock?.pid && pidAlive(lock.pid) ? lock.pid : null;
  const current = currentRun(workspace);
  const runs = listRuns(workspace).map((name) => {
    const dir = runDirOf(workspace, name);
    const st = tryJson(path.join(dir, 'state.json'));
    return { run: name, runDir: dir, started: !!st, startedAt: st?.run ?? null, status: running && name === current ? 'running' : st ? (st.status === 'running' ? 'interrupted' : st.status) : 'not started', pid: running && name === current ? running : null, stoppedBecause: st?.stoppedBecause ?? null };
  });
  const lastRun = runs.filter((r) => r.started).at(-1) ?? null;
  if (running) refuse.push(`autopilot is already running for this project (pid ${running}, ${workspace})`);
  else if (lastRun?.status === 'interrupted') refuse.push(`run ${lastRun.run} did not finish (the driver was killed): continue it with \`driver.mjs run --workspace "${workspace}" --resume\``);
  if (exists(path.join(workspace, 'STOP')) && !running) warn.push(`a STOP file is left in ${workspace}; remove it or the next run stops at once`);

  const clone = path.join(workspace, 'clone');
  const sync = syncFacts(project, workspace, integration);
  const gates = readGates(workspace).filter(gateLive);
  const facts = gateFacts(workspace, integration, { integrationTip: sync.state === 'project-ahead' ? sync.projectTip : null });
  const brief = (g) => ({ file: g.file, epic: g.epic, kind: g.kind, run: g.run ?? null, question: g.question ?? null, answer: g.decided?.answer ?? null, ...(facts.get(g.epic)?.gate === g.file ? { state: facts.get(g.epic).state, enters: facts.get(g.epic).enters ?? null, why: facts.get(g.epic).why ?? null } : {}) });
  const openGates = gates.filter((g) => !g.decided && (g.options ?? []).length).map(brief);
  const decidedGates = gates.filter((g) => g.decided?.answer).map(brief);
  const voidGates = decidedGates.filter((g) => g.state === 'void');
  if (voidGates.length) warn.push(`${voidGates.length} decision(s) can no longer be used (${voidGates.map((g) => `${g.epic}: ${g.why}`).join('; ')}); those epics are planned again from scratch`);
  if (openGates.length) warn.push(`${openGates.length} gate(s) wait for your decision (${[...new Set(openGates.map((g) => g.epic))].join(', ')}); decide them with /peak-workflow:autopilot report`);

  if (sync.state === 'diverged') refuse.push(divergedText(sync, project, clone, integration));
  if (sync.state === 'clone-ahead') warn.push(`autopilot has merged work the project has not fetched yet; the run builds on top of it. Waiting in the clone: ${sync.waiting.join('; ')}. Bring it in with: ${fetchCommand(clone, integration)}`);
  if (sync.state === 'project-ahead') warn.push(`${integration} moved in the project since the last run; the run fast-forwards the clone to it first; a decision on a parked branch still holds if that branch merges cleanly into the new tip`);
  if (process.platform === 'darwin') warn.push('a laptop with the lid closed on battery may still sleep, even under caffeinate: leave it on power');
  const run = newRunName(workspace);
  return {
    ok: refuse.length === 0, refuse, warn, integration, freeGb, workspace, clone, run, runDir: runDirOf(workspace, run), settingsFileExists: exists(path.join(workspace, 'settings.json')),
    projectSettingsFile: projectSettingsFile(project), projectSettingsFileExists: exists(projectSettingsFile(project)),
    runs, lastRun, openGates, decidedGates, sync, endByLocal: config.endBy ? new Date(config.endBy).toString() : null, config,
  };
}

/** Records a person's answer in a gate file (§6.8). The driver never chooses the answer; it only writes what it is given. */
export function decideGate(workspace, gateName, answer, { by, note } = {}) {
  const file = path.join(workspace, 'gates', path.basename(gateName));
  if (!exists(file)) throw new Error(`no gate file ${file}`);
  const gate = readJson(file);
  if (gate.decided?.used) throw new Error(`${path.basename(file)} was already decided and used (${gate.decided.used.date})`);
  if (gate.void || gate.superseded || gate.cleared) throw new Error(`${path.basename(file)} no longer applies: the epic was entered again since (${gate.void ? `void: ${gate.void.why}` : gate.superseded ? 'superseded' : 'cleared'})`);
  const options = gate.options ?? [];
  if (!options.length) throw new Error(`${path.basename(file)} (${gate.kind}) has no answer to record: ${gate.kind === 'preflight' ? 'the fix is in the project, and the gate clears when preflight passes' : gate.resume ?? 'continue by hand'}`);
  const label = options.find((o) => o.trim().toLowerCase() === String(answer).trim().toLowerCase());
  if (options.length && !label) throw new Error(`"${answer}" is not one of this gate's options: ${options.map((o) => `"${o}"`).join(', ')}`);
  if (!String(answer ?? '').trim()) throw new Error('an answer is required');
  // A look is evidence: the verify session records the owner's words as the operator's observation,
  // and a fix round is briefed from them. An answer alone says nothing about what was checked.
  if (gate.kind === 'human-check' && !String(note ?? '').trim()) throw new Error(`a human-check answer needs --note: ${label === ANSWERS.notRight ? 'what you looked at and what is wrong' : 'what you did to check and what you saw'}, in your own words`);
  const run = gate.run && exists(runDirOf(workspace, gate.run)) ? gate.run : currentRun(workspace);
  const project = tryJson(path.join(workspace, 'settings.json'))?.project ?? (run ? tryJson(path.join(runDirOf(workspace, run), 'config.json'))?.project : null) ?? null;
  const who = by ?? (project ? sh('git', ['config', 'user.name'], { cwd: project }).out : '') ?? '';
  if (!who) throw new Error('no name to record: set git config user.name, or pass --by');
  gate.decided = { answer: label ?? String(answer).trim(), by: who, date: today(), scope: 'next-run', ...(String(note ?? '').trim() ? { note: String(note).trim() } : {}) };
  writeJson(file, gate);
  if (run && exists(path.join(runDirOf(workspace, run), 'state.json'))) writeReport(runDirOf(workspace, run));
  // Every decided gate resumes its epic in the next run; the by-hand command stays as the fallback.
  const entry = gateEntry(gate);
  return {
    gate: path.basename(file), epic: gate.epic, kind: gate.kind, decided: gate.decided, effect: 'resume',
    enters: entry?.fresh ? 'PLAN (from scratch, on a fresh branch)' : entry?.phase ?? null,
    validWhile: entry?.fresh ? null : `${gate.branch} stays at ${String(gate.branchTip).slice(0, 9)} and still merges cleanly into the integration line; otherwise the decision is void and the epic is planned again`,
    resume: gate.resume ?? null,
  };
}

/** Programmatic entry point (the CLI and the tests both use it). `stateDir` is an alias of `workspace`. */
export async function run({ project, workspace, stateDir, run: runName, queue, explicit, resume = false, claudeBin, allowTestDouble, pluginDir = PLUGIN_DIR, verbose = false, dryRun: dry = false, out }) {
  const root = project ? path.resolve(project) : null;
  if (!root && !(workspace ?? stateDir)) throw new Error('run needs a project or a workspace');
  const ws = path.resolve(workspace ?? stateDir ?? `${root}.autopilot`);
  const overrides = {};
  if (queue) overrides.queue = queue;
  if (explicit) overrides.explicit = explicit;
  if (claudeBin) overrides.claudeBin = claudeBin;
  if (allowTestDouble) overrides.allowTestDouble = true;
  const name = resume ? runName ?? currentRun(ws) : runName ?? newRunName(ws);
  if (!name) throw new Error(`${ws} holds no run to resume`);
  const config = loadConfig(ws, { project: root, run: name, overrides });
  if (dry) return dryRun({ project: config.project, workspace: ws, config, pluginDir, out });
  return new Run({ workspace: ws, runName: name, config, pluginDir, verbose }).run({ resume });
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['dryRun', 'resume', 'json', 'verbose', 'help', 'allowTestDouble'].includes(key)) o[key] = true;
    else o[key] = argv[++i];
  }
  return o;
}

async function main(argv) {
  const o = parseArgs(argv);
  const cmd = o._[0];
  const usage = 'usage: driver.mjs preflight --project <dir> [--workspace <dir>] [--allow-test-double] [--json]\n       driver.mjs run [--project <dir>] [--workspace <dir>] [--run <name>] [--queue id,id] [--explicit id,id] [--dry-run] [--resume] [--claude-bin <path>] [--allow-test-double] [--verbose]\n       driver.mjs stop --workspace <dir>\n       driver.mjs report --workspace <dir> [--run <name>]\n       driver.mjs decide --workspace <dir> --gate <file> --answer <text> [--note <text>] [--by <name>]\n       (--state is an alias of --workspace; the default workspace is <project>.autopilot)';
  if (o.help || !cmd) { console.log(usage); return 0; }
  const wsArg = o.workspace ?? o.state;
  if (cmd === 'preflight') {
    if (!o.project) throw new Error('preflight needs --project');
    const root = path.resolve(o.project);
    const ws = path.resolve(wsArg ?? `${root}.autopilot`);
    const config = loadConfig(ws, { project: root, overrides: o.allowTestDouble ? { allowTestDouble: true } : {} });
    const integration = detectIntegration(root);
    const sync = syncFacts(root, ws, integration);
    // What the run will see: the fast-forwarded tip when the project is ahead; the clone's sidecars when the clone is.
    const clone = path.join(ws, 'clone');
    const pre = preflight(root, config, {
      gates: gateFacts(ws, integration, { integrationTip: sync.state === 'project-ahead' ? sync.projectTip : null }),
      sidecarText: sync.state === 'clone-ahead' ? (rel) => gitShow(clone, integration, rel) : null,
    });
    pre.launch = launchFacts(root, ws, config);
    if (o.json) console.log(JSON.stringify(pre, null, 2));
    else { pre.refuse.forEach((r) => console.log(`REFUSE: ${r}`)); pre.epics.forEach((e) => console.log(`${e.label}  [${e.eligibility}${e.humanCheck ? ', human check' : ''}]  deps: ${e.deps.join(', ') || '—'}  ${e.reasons.join('; ')}`)); }
    return pre.ok ? 0 : 1;
  }
  if (cmd === 'run') {
    if (!o.project && !wsArg) throw new Error('run needs --project or --workspace');
    const result = await run({ project: o.project, workspace: wsArg, run: o.run, queue: o.queue ? o.queue.split(',').filter(Boolean) : undefined, explicit: o.explicit ? o.explicit.split(',').filter(Boolean) : undefined, resume: !!o.resume, claudeBin: o.claudeBin, allowTestDouble: !!o.allowTestDouble, verbose: !!o.verbose || process.stdout.isTTY, dryRun: !!o.dryRun });
    return o.dryRun ? (result.pre.ok ? 0 : 1) : 0;
  }
  if (!wsArg && ['stop', 'report', 'decide'].includes(cmd)) throw new Error(`${cmd} needs --workspace`);
  const ws = path.resolve(wsArg ?? '.');
  if (cmd === 'stop') {
    fs.writeFileSync(path.join(ws, 'STOP'), `${new Date().toISOString()} stop requested\n`);
    console.log(`STOP written to ${ws}; waiting for the driver to finish its report…`);
    const lock = path.join(ws, 'lock');
    const holder = () => { try { return readJson(lock).pid; } catch { return null; } };
    const wasRunning = !!holder();
    for (let pid = holder(); pid && pidAlive(pid); pid = holder()) await sleep(1000);
    const report = currentRun(ws) ? path.join(runDirOf(ws, currentRun(ws)), 'report.md') : null;
    fs.rmSync(path.join(ws, 'STOP'), { force: true }); // honoured (or nothing to stop): the next run must not stop at once
    console.log(wasRunning && report && exists(report) ? `Stopped. Report: ${report}` : 'No driver is running.');
    return 0;
  }
  if (cmd === 'report') {
    const name = o.run ?? currentRun(ws);
    if (!name) throw new Error(`${ws} holds no run to report`);
    const r = writeReport(runDirOf(ws, name));
    console.log(`${path.join(runDirOf(ws, name), 'report.md')} (${r.epics.length} epic(s); ${r.stoppedBecause ?? 'still running'})`);
    return 0;
  }
  if (cmd === 'decide') {
    if (!o.gate || o.answer === undefined) throw new Error('decide needs --workspace, --gate and --answer');
    console.log(JSON.stringify(decideGate(ws, o.gate, o.answer, { by: o.by, note: o.note }), null, 2));
    return 0;
  }
  throw new Error(`unknown command ${cmd}\n${usage}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`autopilot: ${err.message}`); process.exitCode = 2; });
}
