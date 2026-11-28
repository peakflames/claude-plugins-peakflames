#!/usr/bin/env node
// peak-workflow autopilot driver (PoC). Node 22+, no dependencies.
//
//   node driver.mjs preflight --project <dir> [--workspace <dir>] [--json]
//   node driver.mjs run [--project <dir>] [--workspace <dir>] [--run <name>] [--queue id,id]
//                       [--dry-run] [--resume] [--claude-bin <path>] [--allow-test-double]
//   node driver.mjs stop --workspace <dir>
//   node driver.mjs report --workspace <dir> [--run <name>]   re-render report.md and report.json
//   node driver.mjs decide --workspace <dir> --gate <file> --answer <text> [--note <text>]
//   node driver.mjs watch --workspace <dir> [--run <name>] [--heartbeat-min 10] [--once [--after <n>]] [--replay]
//   node driver.mjs status --project <dir> [--workspace <dir>] [--queue id,id] [--json]   where things stand, and what comes next
//   node driver.mjs continue --workspace <dir> [--json]   apply the owner's standing answer to technical stops
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
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { UNPROVEN_CATEGORIES, activity, atLimitAsk, chainOf, driverPid, eventLine, friction, leftLines, openCommand, saysLeft, plainReason, shortLabel, pictureLines, snapshotLine, unansweredNeeds, unprovenLines, watch } from './attend.mjs';
import { AUDIT_DIR, SCHEMA, auditOutput, buildBundle, changedCodeFiles, judgeAudit, reviewCoverage, thinReview, validateAudit } from './audit.mjs';
import { fromBash, THIN_REVIEW, ANSWERS, LEAVE_IT, LOCKFILE, NO_VERDICT, SMALL_FIX_FILE, SMALL_FIX_PROBLEM, PROVISIONAL_BY, UNAPPROVED_BY, TEST_CHECK_LINE, isProvisional, TRY_AGAIN, atLimit, checkedAsTest, estimateCost, failingTests, gateEntry, gateLive, gateReason, isExpectedOutput, isTestPath, lintPlan, parseSidecar, parseTestDirs, postpones, ownerDeferred, prototypeDeferred, prototypeReasked, smallFixLimits, standingAnswer, stuckAfterFix, technicalAnswer, testNamedDirs, testWeakening, connectorLine, mergeConnectorUse, parseMcpList } from './lib.mjs';
import { epicConnectorUse, writeReport } from './report.mjs';

export { ANSWERS, atLimit, eventLine, gateEntry, gateLive, gateReason, lintPlan, parseSidecar, standingAnswer, unprovenLines, watch };

export const DRIVER_VERSION = '0.6.0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_DIR = path.resolve(HERE, '..', '..');

const TERMINAL = new Set(['MERGED', 'PARKED', 'FAILED', 'SKIPPED', 'BLOCKED']);
const KINDS = {
  plan: { prefix: 'plan', role: 'planner', state: 'PLAN' },
  build: { prefix: 'build', role: 'builder', state: 'BUILD' },
  verify: { prefix: 'verify', role: 'verifier', state: 'VERIFY' },
  fix: { prefix: 'fix', role: 'builder', state: 'FIX_BUILD' },
  audit: { prefix: 'audit', role: 'auditor', state: 'AUDIT' },
  catchup: { prefix: 'catchup', role: 'builder', state: 'CATCH_UP' }, // brings a branch that no longer merges cleanly up to date (`doCatchUp`)
  probe: { prefix: 'probe', role: 'verifier', state: null }, // readiness's sandbox probe: no epic, no state
};
const PLAN_DIR = 'docs/implementation-plan';

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** `YYYY-MM-DD` on the machine's own clock: a gate answered at 21:30 in Los Angeles is dated that day, not UTC's next one (#40). Full timestamps stay UTC. */
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDate();

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
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...opts });
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
// Windows has no process groups: a detached child there gets no console, and every console program it starts opens a
// window of its own (hundreds in one suite run). Sessions share the driver's console instead, and are stopped as a tree.
const WINDOWS = process.platform === 'win32';
const SESSION_SPAWN = { detached: !WINDOWS, windowsHide: true };
// A project command (its tests, build, setup) is run as on macOS: by sh, which on Windows is Git Bash (Claude Code needs it
// there too). `shell: true` would mean cmd.exe: no `;`, `>&2` or `$VAR`, and a missing command exits 1, not 127.
const PROJECT_SHELL = WINDOWS ? "sh" : true;
function killGroup(pid, signal) {
  if (WINDOWS) {
    if (signal === 0) return pidAlive(pid);
    return spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' }).status === 0;
  }
  try { process.kill(-pid, signal); return true; } catch { return false; }
}

/**
 * Processes still working out of a directory: their working directory or their program is inside
 * it. Left out: this process and its relatives, anything a `driver.mjs` command started (a status
 * or a watch reading the clone), and git itself (the owner fetching from the clone). Read-only.
 */
export function strayProcesses(dir) {
  let root; try { root = fs.realpathSync.native(dir); } catch { return []; }
  const fold = (p) => (WINDOWS ? p.toLowerCase() : p);
  const inside = (p) => !!p && (fold(p) === fold(root) || fold(p).startsWith(fold(root) + path.sep));
  const procs = new Map(processTable().map((p) => [p.pid, p]));
  const mine = (p) => { for (let x = p, hops = 0; x && hops < 64; x = procs.get(x.ppid), hops++) if (x.pid === process.pid || /(^|[\s/\\])driver\.mjs("?)(\s|$)/.test(x.command)) return true; return false; };
  // macOS and Linux: a process working in the folder (lsof). Windows cannot tell another process's working folder, so
  // there it is one whose program or command line names the folder: a server started by a relative path is not seen.
  const cwds = new Map();
  const named = (p) => { const c = fold(p.command).replace(/\//g, '\\'); return c.includes(fold(root) + '\\') || c.includes(fold(root) + '"') || c.endsWith(fold(root)); };
  if (!WINDOWS) {
    let pid = null;
    const uid = typeof process.getuid === 'function' ? ['-u', String(process.getuid())] : [];
    for (const line of sh('lsof', ['-a', '-d', 'cwd', '-Fpn', ...uid]).out.split('\n')) {
      if (line[0] === 'p') pid = Number(line.slice(1)); else if (line[0] === 'n' && pid) cwds.set(pid, line.slice(1));
    }
  }
  const out = [];
  for (const p of procs.values()) {
    const argv0 = p.exe || p.command.split(/\s+/)[0];
    if (!(inside(cwds.get(p.pid)) || inside(argv0) || (WINDOWS && named(p)))) continue;
    if (mine(p) || /^git(-|\.exe$|$)/i.test(path.basename(argv0))) continue;
    out.push({ pid: p.pid, ppid: p.ppid, command: p.command });
  }
  return out;
}

/**
 * Every process: its id, its parent's, its command line and (Windows only) its program. Read-only. macOS and Linux read
 * ps; Windows has none that lists command lines (Git Bash's ps takes no -o), so there it is one CIM query.
 */
export function processTable() {
  if (WINDOWS) {
    const r = sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress']);
    let rows; try { rows = JSON.parse(r.out || '[]'); } catch { return []; }
    return (Array.isArray(rows) ? rows : [rows]).filter((x) => x && x.ProcessId)
      .map((x) => ({ pid: x.ProcessId, ppid: x.ParentProcessId, command: x.CommandLine ?? x.ExecutablePath ?? '', exe: x.ExecutablePath ?? '' }));
  }
  const out = [];
  for (const line of sh('ps', ['-axo', 'pid=,ppid=,command=']).out.split('\n')) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3], exe: '' });
  }
  return out;
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

/** The dependency list each lockfile belongs to: a lockfile that changes together with it is ordinary work. */
export const MANIFEST_OF = { 'package-lock.json': 'package.json', 'npm-shrinkwrap.json': 'package.json', 'yarn.lock': 'package.json', 'pnpm-lock.yaml': 'package.json', 'bun.lock': 'package.json', 'bun.lockb': 'package.json', 'Cargo.lock': 'Cargo.toml', 'poetry.lock': 'pyproject.toml', 'uv.lock': 'pyproject.toml', 'Pipfile.lock': 'Pipfile', 'Gemfile.lock': 'Gemfile', 'go.sum': 'go.mod', 'composer.lock': 'composer.json' };
/** A file that declares dependencies: a change to it (or to a lockfile, `LOCKFILE`) is what `setup` installs from. */
export const MANIFEST_FILE = new RegExp(`(^|/)(${[...new Set(Object.values(MANIFEST_OF))].map((m) => m.replaceAll('.', '\\.')).join('|')}|requirements[^/]*\\.txt)$`);
/** The CLAUDE.md sections the first epic of a plan may change: where setup, run and test commands live. */
export const SKELETON_SECTIONS = ['Tech Stack', 'Local Environment', 'Verification & Quality Gates'];
/** A CLAUDE.md line that holds a value still to decide: a `TBD` the walking skeleton sets, or a `**Not decided yet:**` line that lists something. */
export const UNDECIDED_LINE = (line) => /TBD — set by the walking-skeleton epic/.test(line)
  || (/\*\*Not decided yet:\*\*/.test(line) && !/^((none|nothing|n\/a)(\s*[-–—:]\s.*)?|[-–—])?$/i.test(line.replace(/^[\s\S]*?\*\*Not decided yet:\*\*/, '').trim().replace(/\.$/, '')));
/** The note preflight adds to an epic that runs while CLAUDE.md has values to decide; it is information, never a reason not to run. */
export const UNDECIDED_NOTE = /^CLAUDE\.md still has values to decide /;
/**
 * Whether the change to one CLAUDE.md section only settles values still to decide: every other line stays as it was,
 * in its place, and each line that held a value still to decide (`UNDECIDED_LINE`) is kept, replaced in place by one
 * line, or dropped. At least one is settled. A reordered, duplicated or dropped line of anything else is not settling.
 */
export function settlesUndecided(before, after, section) {
  const part = (text) => { const out = []; let name = '(top of file)'; for (const line of String(text).split('\n')) { const h = line.match(/^## +(.+?)\s*$/); if (h) { name = h[1]; continue; } if (name === section) out.push(line); } return out; };
  const a = part(before); const b = part(after);
  let j = 0; let settled = 0;
  for (let i = 0; i < a.length; i++) {
    if (!UNDECIDED_LINE(a[i])) { if (b[j] !== a[i]) return false; j++; continue; }
    if (b[j] === a[i]) { j++; continue; } // left as it was
    settled++;
    if (j < b.length && b[j] !== a[i + 1]) j++; // replaced by one line; otherwise dropped
  }
  return settled > 0 && j === b.length;
}
/** The `## ` sections whose text differs between two versions of a markdown file ("(top of file)" for what precedes the first). */
export function changedSections(before, after) {
  const split = (text) => { const m = new Map(); let name = '(top of file)'; for (const line of String(text).split('\n')) { const h = line.match(/^## +(.+?)\s*$/); if (h) name = h[1]; m.set(name, `${m.get(name) ?? ''}${h ? '' : `${line}\n`}`); } return m; };
  const a = split(before); const b = split(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => (a.get(k) ?? null) !== (b.get(k) ?? null));
}

/** Reads the test command and the test directories from the project's CLAUDE.md. */
export function readProjectFacts(root) {
  const file = path.join(root, 'CLAUDE.md');
  const text = exists(file) ? read(file) : '';
  const tests = text.match(/\*\*Tests:\*\*\s*`([^`]+)`/);
  const type = text.match(/\*\*Project type:\*\*\s*(.+)/);
  const runCmd = text.match(/\*\*Run:\*\*\s*`([^`]+)`/);
  return {
    claudeMd: text,
    runCommand: runCmd ? runCmd[1].replace(/\s*<[^>]+>/g, '').trim() || null : null, // `<command>` placeholders dropped
    testCommand: tests ? tests[1].trim() : null,
    testDirs: parseTestDirs(text),
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
    runBudgetUsd: 250, // the whole chain of runs; the project's autopilot.json may set its own (`configure --run-budget`)
    realSpend: null, // run-level, the owner's answer at launch: true = sessions may spend real money on an outside service when a check needs it; false = never; null = not decided, a session asks
    mode: 'full', // run-level, the owner's answer at launch: 'full' = every doubt stops and asks; 'provisional' = the run keeps building: it takes a session's own recommendation (an amendment, a deferral), skips the owner's looks, and lists every one of those at the end. Failing tests, scope, push, budget and Safety stop either way
    attended: null, // run-level, the owner's answer at launch: true = at the computer while it runs; false = away, so no session starts anything that waits for a person; null = not asked
    autoContinue: 0, // run-level: how many technical stops per epic the owner's standing answer continues without asking (0 = always ask)
    diskFloorGb: 15,
    growthCapMb: 1024,
    look: 'before', // 'before': an epic with screens parks for the owner's look before the final check; 'after': it does not, the verifier judges the pictures and the screens are listed for the owner afterwards. A requirement a person must observe always parks
    onPark: null, // 'stop': the first epic that parks or fails ends the run; 'continue': independent epics still run. null = it follows the owner's launch answer (`attended`): away → 'continue', here or not asked → 'stop'. `loadConfig` resolves it
    setup: null, // one shell command that rebuilds, in the clone, what git does not carry (a venv, node_modules); run with network
    readOnly: [], // directories outside the clone that sessions may read and never write: a dependency cache (~/.nuget/packages, ~/.cargo/registry)
    copy: [], // git-ignored files copied from the project into the clone at each run (a .env): what cannot be rebuilt
    sandbox: false, // false: sessions run unsandboxed (build tools work as they do in a terminal) and the referee keeps writes in the clone; true: Claude Code's sandbox, with `readOnly` and `network`
    network: [], // more host names sessions may reach from inside the sandbox, on top of REGISTRIES (a private package registry)
    claudeBin: 'claude',
    allowTestDouble: false, // run-level: never inherited from settings.json by accident (a rehearsal's fake binary)
    budgets: {
      plan: { wallMin: 30, turns: 80, usd: 5, model: 'sonnet' },
      build: { wallMin: 90, turns: 200, usd: 15, model: 'sonnet' },
      verify: { wallMin: 45, turns: 150, usd: 10, model: 'opus' },
      fix: { wallMin: 60, turns: 150, usd: 12, model: 'sonnet' },
      audit: { wallMin: 15, turns: 40, usd: 3, model: 'opus' },
      probe: { wallMin: 15, turns: 10, usd: 0.5, model: 'haiku' }, // `prepare --probe`: one cheap session that runs the test command in the sandbox
      testRunMin: 10,
      setupMin: 20,
    },
    audit: { parkOn: ['stand-in', 'test-weakened', 'cannot-fail', 'never-ran-real'] },
    scope: { allow: [], lockfiles: [] },
    timing: { pollMs: 30000, sizeEveryMs: 30000, killGraceMs: 30000, infraRetryMs: 300000, ...LIMIT_TIMING }, // sizeEveryMs: `du` is slow on a big tree, so the clone is measured at most this often while a session runs
  };
}

// ---- the workspace: <project>.autopilot/{settings.json, lock, STOP, clone/, gates/, runs/<run>/, current}

const tryParse = (text) => { try { return JSON.parse(text); } catch { return null; } };
const tryJson = (p, fallback = null) => { try { return readJson(p); } catch { return fallback; } };
export const runDirOf = (workspace, name) => path.join(workspace, 'runs', name);
/**
 * A run's own config.json: `{}` when there is none, and an error when there is one that cannot be
 * read. Seen live: a hand-written file that did not parse (a Windows path with single backslashes)
 * was taken for empty, the run started on defaults, and the defaults were saved over what the
 * owner had confirmed.
 */
export function runConfig(workspace, name) {
  const file = path.join(runDirOf(workspace, name), 'config.json');
  if (!exists(file)) return {};
  try { const cfg = readJson(file); if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return cfg; throw new Error('it is not a JSON object'); } catch (err) {
    throw new Error(`the run's config.json cannot be read (${file}): ${err.message}. Nothing was started and the file was left as it is. Write it again as valid JSON; in a path use forward slashes (C:/Users/…), never single backslashes`);
  }
}
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
  // Two limits are the project's to set as its default: the run budget and the standing answer for small fixes.
  for (const k of [...RUN_KEYS.filter((x) => !['runBudgetUsd', 'smallFixes'].includes(x)), 'claudeBin']) delete j[k];
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
  const runCfg = runName ? runConfig(workspace, runName) : {};
  const given = project ?? runCfg.project ?? settings.project;
  if (!given) throw new Error('no project: pass --project, or a --workspace whose settings.json names it');
  const root = path.resolve(given);
  const cfg = merge(merge(merge(merge(defaultConfig(root), projectSettings(root)), settings), runCfg), overrides);
  cfg.project = root;
  if (!['before', 'after'].includes(cfg.look)) throw new Error(`look must be "before" or "after", not ${JSON.stringify(cfg.look)} (${projectSettingsFile(root)})`);
  // An explicit `onPark` wins. Otherwise a park while the owner is away must not idle the night (issue 41, I2):
  // the epics that do not depend on the parked one keep building, and its dependents are BLOCKED by `next()`.
  if (cfg.mode === 'prototype') cfg.mode = 'provisional'; // its name before 3.1.0: a run from then relaunches as provisional
  if (!MODES.includes(cfg.mode)) throw new Error(`mode must be "full" or "provisional", not ${JSON.stringify(cfg.mode)} (the run's config.json)`);
  // A provisional run keeps going past an epic that stops, whether or not the owner is there: that is what it is for.
  cfg.onParkFrom = cfg.onPark != null ? 'project' : cfg.mode === 'provisional' ? 'provisional' : cfg.attended === false ? 'attended' : 'default';
  cfg.onPark ??= cfg.mode === 'provisional' || cfg.attended === false ? 'continue' : 'stop';
  if (!['stop', 'continue'].includes(cfg.onPark)) throw new Error(`onPark must be "stop" or "continue", not ${JSON.stringify(cfg.onPark)} (${projectSettingsFile(root)})`);
  for (const [kind, b] of Object.entries(cfg.budgets)) {
    if (b && typeof b === 'object' && b.effort !== undefined && !EFFORT_LEVELS.includes(b.effort)) throw new Error(`budgets.${kind}.effort must be one of ${EFFORT_LEVELS.join(', ')}, not ${JSON.stringify(b.effort)}`);
    if (b && typeof b === 'object' && b.model && b.effort === undefined) { const e = effortFor(b); if (e) b.effort = e; } // resolved here so preflight and the dry run show it
  }
  return cfg;
}
/** The keys that belong to one run; everything else is a workspace setting. */
const RUN_KEYS = ['project', 'queue', 'explicit', 'endBy', 'runBudgetUsd', 'allowTestDouble', 'autoContinue', 'continues', 'realSpend', 'attended', 'smallFixes', 'mode'];
/** How careful a run is (`mode`): see `defaultConfig`. */
export const MODES = ['full', 'provisional'];
const MODE_LINE = { full: 'full: it stops and asks whenever a requirement, a deferral or a look needs the owner', provisional: 'provisional: the AI decides now, you confirm later. It keeps building, takes a session\'s own recommendation, skips the owner\'s looks, and lists every one of those at the end' };
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
      // plan-project marks a walking skeleton: the plan's first epic, or the first of a brownfield change of stack.
      skeleton: /^\*\*Walking skeleton:\*\*\s*yes\b/im.test(spec),
      // A removal epic: the Change Records whose retired behavior it takes out of the code.
      retires: (sidecar.fields.retires ?? '').match(/CR-[A-Za-z0-9]{7}/g) ?? [],
    };
  });
}

/**
 * The walking-skeleton epics of a plan: its first epic when that has no dependencies (greenfield), and every epic
 * whose spec says `**Walking skeleton:** yes` (plan-project, a brownfield change of stack). Each may write the stack
 * it settles into CLAUDE.md's skeleton sections; the owner is shown the change before the final check.
 */
export function isSkeleton(epics) {
  return epics.filter((x, i) => (i === 0 && !x.deps.length) || x.skeleton);
}

/** The requirements the given Change Records retired or superseded (each record's `[[changes]] tor = "…"` lines). */
export function retiredTors(root, records) {
  const dir = path.join(root, 'docs', 'requirements', 'changes');
  if (!exists(dir)) return [];
  const names = fs.readdirSync(dir);
  const out = [];
  for (const cr of records) {
    const suffix = String(cr).replace(/^CR-/, '');
    for (const f of names.filter((n) => n.endsWith(`-${suffix}.toml`))) for (const x of read(path.join(dir, f)).matchAll(/^tor\s*=\s*"(TOR-\d{2}-[A-Za-z0-9]{7})"/gm)) out.push(x[1]);
  }
  return [...new Set(out)];
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
        if (tip) { why = `a branch ${g.branch} has appeared since the gate was written`; f.voidKind = 'gone'; }
      } else if (!tip) why = `the branch ${g.branch} no longer exists in the clone`;
      else if (tip !== g.branchTip) { why = `the branch ${g.branch} moved since the gate was written (${String(g.branchTip).slice(0, 9)} → ${tip.slice(0, 9)})`; Object.assign(f, { voidKind: 'moved', tip }); }
      else if (!gitOk(clone, 'cat-file', '-e', `${dev}^{commit}`)) f.checkedAtRunStart = true; // the project's new commits are not in the clone yet
      else {
        // A trial merge, in memory: nothing in the clone changes. The integration line may have moved (another
        // epic merged, the owner committed); the decision stands as long as the parked branch still merges cleanly.
        // A gate that brings the branch up to date first (`catchUpGate`) expects it not to: that is its job.
        const trial = gitRun(clone, 'merge-tree', '--write-tree', '--name-only', '--no-messages', dev, tip);
        if (trial.code !== 0 && bringsUpToDate(g)) f.mergeIn = true;
        else if (trial.code === 1) { const files = trial.out.split('\n').slice(1).filter(Boolean); why = `the branch ${g.branch} no longer merges cleanly into ${integration} (conflicts in ${files.join(', ') || 'its files'})`; Object.assign(f, { voidKind: 'conflict', files }); }
        else if (trial.code !== 0) { why = `the trial merge of ${g.branch} into ${integration} could not run (${trial.err.split('\n')[0] || `git merge-tree exited ${trial.code}`})`; Object.assign(f, { voidKind: 'conflict', files: [] }); }
        else f.behind = Number(gitRun(clone, 'rev-list', '--count', `${tip}..${dev}`).out || 0); // commits on the integration line the branch has not seen
      }
    }
    // What a void decision becomes (`restartGate`): conflict → brought up to date, moved → checked again, gone → asked.
    if (why && !f.voidKind) f.voidKind = 'gone';
    facts.set(id, why ? { ...f, state: 'void', why } : { ...f, state: 'resume', entry, enters: resumePhase(workspace, g, entry.phase) });
  }
  return facts;
}

/** A gate whose "Resume" first brings the branch up to date with the integration line: the conflict gate, or a stop or question of its catch-up session. */
const bringsUpToDate = (g) => !!g.mergeIn || g.phase === 'CATCH_UP' || stepKindOf(g.session) === 'catchup';

/**
 * The one question a void decision becomes (handoff Step 3, owner decisions 2026-11-24). A void decision is never
 * acted on silently, and an epic is never started over without a "Start over" answer:
 *   conflict  technical. "Resume" brings the branch up to date (`doCatchUp`), then goes on with the old answer (`then`)
 *   moved     technical. "Resume" runs autopilot's checks, the review and the final check on the branch as it now is
 *   gone      "Start over" / "Leave it for now". A provisional run answers "Start over" itself and lists it
 * `old` is the gate whose decision is void, `{file, …gate}` (null for a conflict found mid-run, which re-enters at
 * `phase`). Returns the gate's own fields; the caller adds where it stands (epic, branch, tip, run).
 */
export function restartGate(kind, { label, old = null, files = [], why = '', branch = '', integration = 'develop', phase = null } = {}) {
  const was = old?.decided?.answer ?? null;
  const theirs = !(old?.decided?.standing || old?.decided?.asked); // a person gave that answer
  const base = { kind: 'resume', skillStep: 'autopilot driver', restart: kind, artifacts: old ? [old.file] : [] };
  if (kind === 'conflict') {
    const entry = old ? gateEntry(old) : null;
    // A final check's kept work is merged again by its own step: brought up to date instead, the final check runs again.
    const then = entry?.phase && entry.phase !== 'CHECK_VERIFY' ? old.file : null;
    const both = files.length ? files.join(', ') : 'the same files';
    return {
      ...base, phase: then ? entry.phase : phase ?? 'VERIFY', mergeIn: true, ...(then ? { then } : {}), technical: true, conflicts: files,
      reason: `${branch} does not merge cleanly with ${integration} (${both}): other finished work merged since changed the same lines`,
      question: `${label}: other finished work merged since, and its branch no longer fits on top of it (both changed ${both}). Bring it up to date and go on${then ? ` with ${theirs ? 'your answer' : 'the answer'} "${was}"` : ''}?`,
      options: [ANSWERS.resume, ANSWERS.startOver],
      why: `a short session merges the other work into this epic's branch and settles the clashing lines; the final check and the merge check then judge everything. "${ANSWERS.startOver}" plans the epic again from scratch`,
    };
  }
  if (kind === 'moved') {
    return {
      ...base, phase: 'CHECK_BUILD', technical: true, reason: why,
      question: `${label}: its branch was changed after ${theirs ? 'you answered' : 'autopilot answered'} "${was}" (new commits on it). Check it again from where its branch is now?`,
      options: [ANSWERS.resume, ANSWERS.startOver],
      why: `the answer was about the branch as it was, so it does not carry. "${ANSWERS.resume}" runs autopilot's checks, the independent review and the final check on the branch as it now is; nothing is planned or built again, and a look at its screens is asked again. "${ANSWERS.startOver}" plans the epic again from scratch`,
    };
  }
  const what = /clone is gone/.test(why) ? 'the private copy autopilot works in is gone' : /has appeared/.test(why) ? 'a branch appeared that autopilot did not make' : 'its branch is gone';
  return {
    ...base, reason: why,
    question: `${label}: there is nothing left to continue it from: ${what}. Start it over from scratch?`,
    options: [ANSWERS.startOver, LEAVE_IT],
    why: `${was ? `the answer "${was}" was about work that is no longer there. ` : ''}"${ANSWERS.startOver}" plans and builds the epic again from scratch, which costs the most; "${LEAVE_IT}" keeps it waiting`,
  };
}

/**
 * Where a `resume` gate that names CHECK_BUILD really re-enters. A build that was cut short (STOP,
 * a budget, the wall clock, an infra error) left a part-built branch: checking it fails every check
 * and spends the one repair round on it. So when the branch tip is the driver's `wip(autopilot)`
 * commit, or the sidecar on the branch is not `Implemented`, and the last build session did not
 * end by itself, the epic re-enters the build (or the repair) and a session continues the work.
 * Judged from files and git only, so a gate written by an earlier driver follows the same rule.
 */
export function resumePhase(workspace, g, phase) {
  if (phase !== 'CHECK_BUILD' || g.kind !== 'resume' || !g.branch || !g.epic) return phase;
  const clone = path.join(workspace, 'clone'); const ref = `refs/heads/${g.branch}`;
  const subject = gitRun(clone, 'log', '-1', '--format=%s', ref);
  if (subject.code !== 0) return phase;
  const sidecar = parseSidecar(gitShow(clone, ref, path.posix.join(PLAN_DIR, 'status', `epic-${g.epic}.md`)));
  if (!subject.out.startsWith('wip(autopilot)') && sidecar.fields.status === 'Implemented') return phase;
  const rec = tryJson(path.join(workspace, 'epics.json'), {})?.[g.epic] ?? {};
  const last = (rec.buildSteps ?? []).at(-1);
  const result = last ? tryJson(path.join(workspace, last.dir, 'result.json')) : null;
  // `hook_stopped` is the referee ending the session (the STOP file): a success line, and still not the session's own end.
  // An error result (the usage limit, an API error) is a success line too, and the session was cut off all the same.
  if (result?.subtype === 'success' && !result.is_error && result.terminal_reason !== 'hook_stopped') return phase;
  return /^fix-/.test(last?.name ?? '') && rec.fixBrief ? 'FIX_BUILD' : 'BUILD';
}

/**
 * Where a "not proven" note is filed: under the requirement it is about, under the epic, or not at all (`skip`) when
 * it is about a requirement already listed in its own right (a look nobody gave, a deferral). A note that opens with
 * a requirement is about that one, whatever else it mentions in passing (seen live: a note about a phone check that
 * cited an automated test was filed under the test).
 */
export function noteSubject(text, { anchors, listed }) {
  const named = (String(text).match(/TOR-\d{2}-[A-Za-z0-9]{7}/g) ?? []).filter((t) => anchors.includes(t));
  const subject = (String(text).match(/^\W*(TOR-\d{2}-[A-Za-z0-9]{7})/) ?? [])[1];
  if (subject && anchors.includes(subject)) return listed(subject) ? { skip: true } : { about: subject };
  if (named.length && named.every(listed)) return { skip: true };
  return { about: named.find((t) => !listed(t)) ?? 'epic' };
}

// ---- the owner's usage limit ---------------------------------------------------------------------

/**
 * Waiting out the owner's Claude usage limit: a margin after the reset; a retry interval when no
 * reset time was given; the longest wait (a weekly limit is not waited out); waits per step.
 */
export const LIMIT_TIMING = { limitMarginMs: 120000, limitRetryMs: 600000, limitWaitMaxMs: 6 * 3600000, limitWaitsMax: 3 };
const LIMIT_WORDS = { five_hour: '5-hour', seven_day: 'weekly', seven_day_opus: 'weekly Opus', seven_day_sonnet: 'weekly Sonnet' };
/** A clock time the owner reads, with the day when it is not today. */
export function clockTime(ms, now = Date.now()) {
  const d = new Date(ms); const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date(now).toDateString() ? time : `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${time}`;
}
/**
 * The owner's usage limit, from what a session sent: an error result naming it (`usage_limit_reached`,
 * or a 429 refusal) and the CLI's last `rate_limit_event`. Null for anything else: an overloaded
 * service is a technical error, not the owner's limit.
 */
export function usageLimit(result, info) {
  const refused = info?.status === 'rejected';
  if (!(result?.is_error && (result.api_error === 'usage_limit_reached' || result.api_error_status === 429 || refused))) return null;
  const kind = (refused && info.rateLimitType) || null;
  const resetsAt = (refused && (info.resetsAt ?? info.unifiedWindows?.[info.rateLimitType]?.resetsAt)) || null;
  return { kind, words: LIMIT_WORDS[kind] ?? '', resetsAt };
}
/** `{wait: true, until}` (epoch ms), or `{stop: why}` when waiting is not worth it. */
export function limitDecision({ resetsAt, now = Date.now(), endBy = null, waits = 0, timing }) {
  const t = { ...LIMIT_TIMING, ...timing };
  if (waits >= t.limitWaitsMax) return { stop: `it was reached again ${waits} times after waiting` };
  const reset = resetsAt ? Math.max(resetsAt * 1000, now) : now + t.limitRetryMs;
  const until = reset + t.limitMarginMs;
  if (until - now > t.limitWaitMaxMs) return { stop: `it resets ${clockTime(reset, now)}, too long to wait` };
  if (endBy && until > Date.parse(endBy)) return { stop: `it resets ${clockTime(reset, now)}, after the run's end time` };
  return { wait: true, until };
}
/** What a session stopped by the usage limit is told when it is resumed after the reset. */
export function limitResumeMessage({ branch }) {
  return [
    'Your usage limit was reached in the middle of this step, and autopilot waited until it reset. It has reset now.',
    `Carry on with the step from where you stopped. Run \`git status\` on \`${branch}\` first: anything you had not committed is still there.`,
    'Do not start the step over.',
  ].join('\n');
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
/**
 * The epics Complete on the clone's integration line and not in the project: finished work the owner
 * has not brought in yet. Read-only; the status dashboard names them, since it reads only the project.
 */
export function waitingEpics(project, workspace, integration) {
  const clone = path.join(workspace, 'clone');
  if (!integration || !exists(clone)) return [];
  const here = new Map(readEpics(project).map((e) => [e.id, e.status]));
  return readEpics(project, { sidecarText: (rel) => gitShow(clone, integration, rel) })
    .filter((e) => e.status === 'Complete' && here.get(e.id) !== 'Complete').map((e) => ({ id: e.id, label: e.label }));
}
/** `sync` as `status` reports it. No fetch is offered while a driver runs: it is still writing the clone. */
function syncReport(project, workspace, integration, { running = false } = {}) {
  const s = syncFacts(project, workspace, integration);
  const clone = path.join(workspace, 'clone');
  return {
    state: s.state, waiting: s.waiting ?? [],
    epics: ['clone-ahead', 'diverged'].includes(s.state) ? waitingEpics(project, workspace, integration) : [],
    fetch: !running && integration && s.state === 'clone-ahead' ? [`${fetchCommand(clone, integration)} && git log ${integration}..autopilot/${integration}`, `git merge --ff-only autopilot/${integration}`] : [],
  };
}
// ---- the clone's environment: what git does not carry ------------------------------------------

const noSlash = (p) => String(p).replace(/\/+$/, '');
/** Files and directories that exist in `root` and git ignores: exactly what a clone of it will not have. */
export function ignoredPaths(root) {
  const r = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], { cwd: root, encoding: 'utf8', env: childEnv(), maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return r.status === 0 ? (r.stdout ?? '').split('\0').filter(Boolean).sort() : [];
}
/** Why a `copy` list cannot be used. An entry must be a git-ignored path inside the project: anything else could end up in a commit. */
export function copyProblems(project, copy) {
  if (copy === undefined || copy === null) return [];
  if (!Array.isArray(copy)) return ['`copy` must be a list of paths'];
  const out = [];
  for (const entry of copy) {
    const rel = typeof entry === 'string' ? path.posix.normalize(noSlash(entry.trim())) : '';
    if (!rel || rel === '.' || path.isAbsolute(rel) || rel.startsWith('..') || rel === '.git' || rel.startsWith('.git/')) { out.push(`copy: ${JSON.stringify(entry)} is not a path inside the project`); continue; }
    if (!exists(path.join(project, rel))) { out.push(`copy: ${rel} does not exist in the project`); continue; }
    if (!gitOk(project, 'check-ignore', '-q', rel)) out.push(`copy: ${rel} is not ignored by git, so a session's commit would include it; add it to .gitignore first`);
  }
  return out;
}
/**
 * What the clone will lack, and what is declared about it. Read-only. Each ignored path of the
 * project is `copied` (listed in `copy`), `present` (it exists in the clone now: setup or the tests
 * rebuilt it) or `absent` (nothing carries it over).
 */
export function envFacts(project, workspace, config) {
  const clone = path.join(workspace, 'clone');
  const copy = (Array.isArray(config.copy) ? config.copy : []).filter((c) => typeof c === 'string').map((c) => path.posix.normalize(noSlash(c.trim())));
  const all = ignoredPaths(project);
  const ignored = all.slice(0, 200).map((p) => {
    const rel = noSlash(p);
    const copied = copy.some((c) => rel === c || rel.startsWith(`${c}/`) || c.startsWith(`${rel}/`));
    return { path: p, dir: p.endsWith('/'), status: copied ? 'copied' : exists(path.join(clone, rel)) ? 'present' : 'absent' };
  });
  const named = namedReads(project, workspace);
  return { setup: config.setup ?? null, copy, readOnly: Array.isArray(config.readOnly) ? config.readOnly : [], readFiles: named.files, readRefused: named.refused, sandbox: config.sandbox === true, network: cleanNetwork(config.network), registries: REGISTRIES, problems: [...copyProblems(project, config.copy), ...readOnlyProblems(config.readOnly, { project, workspace }), ...networkProblems(config.network)], ignored, ignoredTotal: all.length, cloneExists: exists(clone), prepared: tryJson(path.join(workspace, 'prepare.json')) };
}
/** `~`-expanded, absolute, symlinks resolved where the path exists. */
const expandHome = (p) => { const x = path.resolve(fromBash(String(p).trim().replace(/^~(?=\/|$)/, os.homedir()))); try { return fs.realpathSync.native(x); } catch { return x; } };
const insideOrSame = (p, root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
/** Where a session must never read, whatever a project lists: credentials, and Claude Code's own files. */
const NEVER_READ = ['.ssh', '.aws', '.gnupg', '.azure', '.kube', '.docker', '.netrc', '.npmrc', '.pypirc', '.git-credentials', '.config', '.claude', 'Library'];
/**
 * Why a `readOnly` list cannot be used. An entry is a directory outside the clone that sessions may
 * read: it must be absolute (or start with `~/`), exist, and be narrow — not `/`, not the home
 * directory or anything above it, not a credentials directory, not the project or the workspace.
 */
export function readOnlyProblems(list, { project = null, workspace = null } = {}) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) return ['`readOnly` must be a list of directories'];
  const home = expandHome('~');
  const out = [];
  for (const entry of list) {
    const raw = typeof entry === 'string' ? entry.trim() : '';
    if (!raw || !(raw.startsWith('~/') || path.isAbsolute(raw))) { out.push(`readOnly: ${JSON.stringify(entry)} must be an absolute path or start with ~/`); continue; }
    const p = expandHome(raw);
    if (!exists(p) || !fs.statSync(p).isDirectory()) { out.push(`readOnly: ${raw} is not an existing directory`); continue; }
    if (insideOrSame(home, p)) { out.push(`readOnly: ${raw} is the home directory or above it; name the one directory sessions need`); continue; }
    if (NEVER_READ.some((d) => insideOrSame(p, path.join(home, d)))) { out.push(`readOnly: ${raw} is where credentials or private settings live; it is never readable by a session`); continue; }
    if (insideOrSame(p, home) && path.relative(home, p).split(path.sep).length < 2 && !path.basename(p).startsWith('.')) { out.push(`readOnly: ${raw} is a whole folder of your home directory; name the dependency directory inside it`); continue; }
    for (const [name, dir] of [['the project', project], ['the autopilot workspace', workspace]]) if (dir && (insideOrSame(p, expandHome(dir)) || insideOrSame(expandHome(dir), p))) out.push(`readOnly: ${raw} overlaps ${name}`);
  }
  return out;
}
/** The folders of ~/.claude where a file a project's CLAUDE.md names may be read: the owner's own scripts. Everything else there (sign-in data, settings, history, transcripts, whatever a later Claude Code adds) stays closed. */
const CLAUDE_NAMED = ['scripts', 'bin', 'tools'];
/** macOS and Windows file systems ignore case: `~/.SSH` is `~/.ssh`. */
const foldCase = (p) => (process.platform === 'darwin' || process.platform === 'win32' ? p.toLowerCase() : p);
/**
 * The files outside the project that its CLAUDE.md names in backticks or in a fenced block, by an
 * absolute path or one that starts with `~/`. A project that tells its sessions to use such a file
 * (seen live: `node ~/.claude/scripts/tethered.mjs` to start a dev server) must be able to read it.
 * One existing file at a time, never a directory. Never where credentials live, never a hidden
 * file or a file below a hidden folder (`~/.zsh_history`, `~/.gitconfig`, a `.env`), and in
 * ~/.claude only below the owner's script folders (`CLAUDE_NAMED`).
 * CLAUDE.md is a file sessions edit and merge, so this list can grow without the owner typing
 * it: it is shown at every launch, and the rules here are what holds if nobody reads that.
 * Returns `{ files, refused: [{ path, why }] }`; a path that is not a file on this machine is left out.
 */
export function claudeMdReads(text, { project = null, workspace = null } = {}) {
  const home = expandHome('~'); const claude = path.join(home, '.claude');
  const files = []; const refused = []; const seen = new Set();
  for (const m of String(text ?? '').matchAll(/```[\s\S]*?```|`[^`\n]+`/g)) {
    // A quoted path is one word, spaces and all (`node "C:\Users\Pat Lee\tools\x.mjs"`); the rest splits on spaces and shell punctuation.
    const inner = m[0].replace(/^`+|`+$/g, '');
    const quoted = [...inner.matchAll(/"([^"]+)"|'([^']+)'/g)].map((x) => x[1] ?? x[2]);
    // So is a span that is one path and nothing else (`C:\Users\Pat Lee\tools\lint.sh`): kept only if it is a file.
    for (const word of [inner.trim(), ...quoted, ...inner.replace(/"[^"]*"|'[^']*'/g, ' ').split(/[\s"'=<>|;&(),]+/)]) {
      const raw = word.replace(/^\$\{?HOME\}?(?=[\\/])/, '~').replace(/^~\\/, '~/').replace(/[.:]+$/, '');
      if (!(raw.startsWith('~/') || path.isAbsolute(raw)) || /[*?{}$]/.test(raw)) continue;
      const p = expandHome(raw);
      if (seen.has(p)) continue;
      seen.add(p);
      let file = false; try { file = fs.statSync(p).isFile(); } catch { /* not on this machine */ }
      if (!file) continue;
      if ([project, workspace].some((dir) => dir && insideOrSame(p, expandHome(dir)))) continue; // the clone carries the project; the workspace is never a session's
      const q = foldCase(p);
      const inClaude = insideOrSame(q, foldCase(claude));
      const parts = inClaude ? path.relative(foldCase(claude), q).split(path.sep) : [];
      const below = insideOrSame(q, foldCase(home)) ? path.relative(foldCase(home), q).split(path.sep) : q.split(path.sep);
      if (inClaude) { if (parts.length >= 2 && CLAUDE_NAMED.includes(parts[0]) && !parts.slice(1).some((x) => x.startsWith('.'))) files.push(p); else refused.push({ path: raw, why: `in ~/.claude only a file below ${CLAUDE_NAMED.join('/, ')}/ may be named; the rest is Claude Code's own sign-in data, settings, history or transcripts` }); }
      else if (NEVER_READ.some((d) => insideOrSame(q, foldCase(path.join(home, d))))) refused.push({ path: raw, why: 'it is where credentials or private settings live' });
      else if (below.some((x) => x.startsWith('.'))) refused.push({ path: raw, why: 'it is a hidden file or in a hidden folder, where credentials and private settings are kept' });
      else files.push(p);
    }
  }
  return { files, refused };
}
/** `claudeMdReads` for a project as it is now. */
export const namedReads = (project, workspace) => claudeMdReads(readProjectFacts(project).claudeMd, { project, workspace });
/** The `readOnly` list as the referee uses it: resolved absolute paths. */
export const resolveReadOnly = (list) => (Array.isArray(list) ? list : []).filter((e) => typeof e === 'string' && e.trim()).map(expandHome);

/**
 * Why a `network` list cannot be used. An entry is one host name a sandboxed session may reach (a
 * package registry): no scheme, no path, no port, no address, and a wildcard only as a whole first
 * label with at least two labels after it (`*.pkg.example.org`, never `*.org` or `*`).
 */
export function networkProblems(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) return ['`network` must be a list of host names'];
  const out = [];
  for (const entry of list) {
    const h = typeof entry === 'string' ? entry.trim().toLowerCase() : '';
    const say = (why) => out.push(`network: ${JSON.stringify(entry)} ${why}`);
    if (!h) say('is not a host name');
    else if (/:\/\//.test(h)) say('names a scheme; give the host name only (registry.npmjs.org)');
    else if (/[/?#@:\s]/.test(h)) say('is not a bare host name: no path, port or address');
    else if (/^[\d.]+$/.test(h)) say('is an address; name the host');
    else if (h.includes('*') && !/^\*\.[^*]+$/.test(h)) say('uses a wildcard somewhere other than as its whole first label');
    else if (h.startsWith('*.') && h.split('.').length < 3) say('is a wildcard over a whole top-level domain; name the host (*.example.org at the widest)');
    else if (!/^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(h)) say('is not a host name');
  }
  return out;
}
/**
 * The public package registries every session may reach, whatever the project's stack: a build
 * that adds a dependency must be able to fetch it, and working this list out per project was one
 * more thing to get wrong. A project's `network` entries are added to it.
 */
export const REGISTRIES = [
  'api.nuget.org', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'crates.io', 'static.crates.io', 'index.crates.io',
  'proxy.golang.org', 'sum.golang.org', 'repo.maven.apache.org', 'repo1.maven.org', 'plugins.gradle.org', 'rubygems.org',
];
/** Every host a session may reach: the registries, then the project's own. */
export const sessionNetwork = (config = {}) => cleanNetwork([...REGISTRIES, ...(Array.isArray(config.network) ? config.network : [])]);
const cleanNetwork = (list) => [...new Set((Array.isArray(list) ? list : []).filter((h) => typeof h === 'string' && h.trim()).map((h) => h.trim().toLowerCase()))];

/** A shell's "command not found" (127) or "cannot execute" (126): the command never ran, which is not a failing test. */
export const couldNotRun = (code) => code === 127 || code === 126;
/** Seconds the machine slept during a command: wall-clock time it took less monotonic time (which stops while asleep). */
export const sleptSec = (wallMs, monoMs) => Math.max(0, Math.round((wallMs - monoMs) / 1000));

export const BUDGET_STEPS = ['plan', 'build', 'audit', 'verify', 'fix'];
const BUDGET_KEYS = {
  model: (v) => (/^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/.test(v) ? v : 'is not a model name (sonnet, opus, haiku, or a full model ID)'),
  effort: (v) => (EFFORT_LEVELS.includes(v) ? v : `must be one of ${EFFORT_LEVELS.join(', ')}`),
  wallMin: (v) => (/^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 480 ? Number(v) : 'must be whole minutes from 5 to 480'),
  usd: (v) => (/^\d+(\.\d+)?$/.test(v) && Number(v) >= 0.5 && Number(v) <= 200 ? Number(v) : 'must be dollars from 0.5 to 200'),
};
/**
 * `<step>.<key>=<value>` settings as `configure --budget` takes them: a step's model, effort, or
 * its wall-clock and dollar caps. An empty value removes the entry (back to the default).
 * Returns `[{step, key, value}]`, value `undefined` for a removal; throws on anything else.
 */
export function parseBudgets(specs) {
  const bad = []; const out = [];
  for (const spec of specs.map((x) => String(x).trim()).filter(Boolean)) {
    const m = spec.match(/^([A-Za-z]+)\.([A-Za-z]+)=(.*)$/);
    if (!m) { bad.push(`budget: "${spec}" is not <step>.<key>=<value> (build.model=opus)`); continue; }
    const [, step, key, raw] = m; const value = raw.trim();
    if (!BUDGET_STEPS.includes(step)) { bad.push(`budget: "${step}" is not a step (${BUDGET_STEPS.join(', ')})`); continue; }
    if (!BUDGET_KEYS[key]) { bad.push(`budget: "${key}" is not a setting (${Object.keys(BUDGET_KEYS).join(', ')})`); continue; }
    if (value === '') { out.push({ step, key, value: undefined }); continue; }
    const v = BUDGET_KEYS[key](value);
    if (typeof v === 'string' && v !== value) bad.push(`budget: ${step}.${key} ${v}, not "${value}"`); else out.push({ step, key, value: v });
  }
  if (bad.length) throw new Error(bad.join('; '));
  return out;
}

/** Writes `setup`, `copy`, `readOnly`, `network`, per-step `budgets` and the look's run command (`humanCheck`) into the project's own autopilot settings file, keeping its other keys. The one project file autopilot writes, and only on the owner's say. */
export function configureProject(project, { setup, copy, readOnly, network, budgets, look, runBudget, humanCheck, workspace = `${project}.autopilot` } = {}) {
  const file = projectSettingsFile(project);
  let j = {}; let lookChanged = false;
  if (exists(file)) { try { j = readJson(file); } catch (err) { throw new Error(`${file} is not valid JSON: ${err.message}`); } }
  if (setup !== undefined) { if (String(setup).trim()) j.setup = String(setup).trim(); else delete j.setup; }
  // The command that starts the app for a person's look: `<cmd>` for every epic, `<epic id>=<cmd>` for one. Empty removes it.
  if (humanCheck !== undefined) {
    const v = String(humanCheck).trim();
    const one = v.match(/^([A-Za-z0-9]{7})=(.*)$/s);
    const key = one ? one[1] : '*'; const cmd = (one ? one[2] : v).trim();
    const map = j.humanCheck && typeof j.humanCheck === 'object' ? j.humanCheck : {};
    if (cmd) map[key] = cmd; else delete map[key];
    if (Object.keys(map).length) j.humanCheck = map; else delete j.humanCheck;
  }
  if (runBudget !== undefined) {
    const v = String(runBudget).trim();
    if (v && !(Number(v) > 0)) throw new Error(`run budget is a dollar amount above 0, not ${JSON.stringify(runBudget)}`);
    if (v) j.runBudgetUsd = Number(v); else delete j.runBudgetUsd; // empty: back to the default
  }
  if (look !== undefined) {
    const v = String(look).trim();
    if (v && !['before', 'after'].includes(v)) throw new Error(`look is "before" or "after", not ${JSON.stringify(look)}`);
    if (v === 'after') j.look = 'after'; else delete j.look; // "before" is the default: no entry
    lookChanged = true;
  }
  if (copy !== undefined) {
    const list = [...new Set(copy.map((c) => path.posix.normalize(noSlash(String(c).trim()))).filter((c) => c && c !== '.'))];
    const bad = copyProblems(project, list);
    if (bad.length) throw new Error(bad.join('; '));
    if (list.length) j.copy = list; else delete j.copy;
  }
  if (readOnly !== undefined) {
    const list = [...new Set(readOnly.map((c) => String(c).trim()).filter(Boolean))];
    const bad = readOnlyProblems(list, { project, workspace: `${project}.autopilot` });
    if (bad.length) throw new Error(bad.join('; '));
    if (list.length) j.readOnly = list; else delete j.readOnly;
  }
  if (network !== undefined) {
    const bad = networkProblems(network.map((h) => String(h).trim()).filter(Boolean));
    if (bad.length) throw new Error(bad.join('; '));
    const list = cleanNetwork(network);
    if (list.length) j.network = list; else delete j.network;
  }
  const shadowed = [];
  if (budgets !== undefined) {
    const over = tryJson(path.join(workspace, 'settings.json'), {})?.budgets ?? {};
    for (const { step, key, value } of parseBudgets(budgets)) {
      j.budgets = j.budgets && typeof j.budgets === 'object' ? j.budgets : {};
      const b = (j.budgets[step] = j.budgets[step] && typeof j.budgets[step] === 'object' ? j.budgets[step] : {});
      if (value === undefined) delete b[key]; else b[key] = value;
      if (!Object.keys(b).length) delete j.budgets[step];
      // The workspace's settings.json is read after the project's file, so a value there still wins.
      if (value !== undefined && over[step]?.[key] !== undefined && over[step][key] !== value) shadowed.push(`budgets.${step}.${key} is ${JSON.stringify(over[step][key])} in ${path.join(workspace, 'settings.json')}, which wins over the ${JSON.stringify(value)} saved here until that line is removed`);
    }
    if (j.budgets && !Object.keys(j.budgets).length) delete j.budgets;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, j);
  // Turning "look": "after" on answers a look at screens that is already waiting (never while a run is going: the next status or report does it).
  let answered = [];
  if (lookChanged && j.look === 'after' && exists(path.join(workspace, 'gates')) && !driverPid(workspace)) answered = ensureResumeGates(workspace);
  return { file, settings: j, shadowed, ...(answered.length ? { answered } : {}) };
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
  // No Python 3.11: one line, not the guard's whole install hint (seen live: shown twice beside the skill's own).
  if (fmt.code === 3) refuse.push('format guard: needs Python 3.11 or newer, and none was found — install a current Python (https://www.python.org/downloads/), then try again');
  else if (fmt.code !== 0) refuse.push(`format guard: ${(fmt.out || fmt.err).split('\n').find((l) => l.trim()) || `tor-lifecycle format exited ${fmt.code}`}`);
  if (!facts.testDirs.length) refuse.push('CLAUDE.md has no **Test directories:** line');
  if (!(config.testCommand ?? facts.testCommand)) refuse.push('CLAUDE.md has no **Tests:** command');

  // A "Not decided yet" line that names nothing ("none", "n/a", a dash, empty) is the all-clear, not a value to decide;
  // so is one of those words followed by a dash or colon and a reason ("none — all decided and shipped"). Values still to decide park nothing (owner, 2026-11-25): the walking skeleton (the plan's first epic, with no
  // dependencies) is the epic that settles them, and the others go on; each is told so (`reasons`).
  const tbd = facts.claudeMd.split('\n').some(UNDECIDED_LINE);
  const embedded = /embedded/i.test(facts.projectType ?? '');
  const ui = /web app|desktop app|hybrid/i.test(facts.projectType ?? '');
  const me = sh('git', ['config', 'user.name'], { cwd: root }).out.toLowerCase();
  const reqs = readRequirements(root);
  const states = {};
  const st = torLifecycle(pluginDir, root, 'states', '--json');
  try { for (const r of JSON.parse(st.out).requirements ?? []) states[r.tor] = r; } catch { /* reported per anchor below */ }
  const explicit = new Set(config.explicit ?? []);

  const read0 = readEpics(root, { sidecarText });
  // As the scope check reads it: the plan's first epic, with no dependencies — or, once that is done, a later one
  // plan-project marked `**Walking skeleton:** yes` (a brownfield change of stack).
  const skeleton = isSkeleton(read0);
  const skeletonId = skeleton.find((x) => x.status !== 'Complete')?.id ?? skeleton[0]?.id ?? null;
  const skeletonLeft = skeleton.some((x) => x.status !== 'Complete'); // a Complete one left them: no epic will settle them now
  const epics = read0.map((epic) => {
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
    else if (gate?.state === 'void') reasons.push(`your decision on ${gate.gate} can no longer be used as given (${gate.why}): autopilot asks how to go on`);
    if (e.status !== 'Not Started' && !explicit.has(e.id) && !['resume', 'fresh', 'void'].includes(gate?.state)) set('skip', `status is ${e.status}: someone is part-way through it; queue it explicitly to have autopilot take it over`);
    // A removal epic (plan-project 3C) may have no requirement of its own: its done-when is mechanical. The build
    // check and the merge gate run `tor-lifecycle sweep` on what its records retired; the verifier runs the Removal gate.
    if (!e.anchors.length && !e.retires.length) set('skip', 'no Requirements Anchors');
    else if (!e.anchors.length && !retiredTors(root, e.retires).length) set('skip', `a removal epic whose record (${e.retires.join(', ')}) names no retired requirement`);
    else if (e.retires.length) reasons.push(`a removal epic (retires ${e.retires.join(', ')}): done when nothing cites the retired requirements and their code is gone${e.anchors.length ? ', and its guard requirements pass' : ''}`);
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
    // Screens alone park for the owner's look unless the project looks afterwards or the run is provisional (#41 B3).
    // A requirement a person must observe keeps its own reason above in every case.
    const observedHere = e.anchors.some((tor) => /operator-observed/.test(reqs[tor]?.text ?? ''));
    if (ui && e.hasScreens) {
      if (!observedHere && isProvisional(config.mode)) reasons.push('UI epic: not stopped for a look (provisional run); listed at the end');
      else if (!observedHere && config.look === 'after') reasons.push('UI epic: screens listed for you to see after the run ("look": "after"); no stop');
      else { humanCheck = true; reasons.push('UI epic: parks for a human look before verify'); }
    }
    e = { ...e, scopeFlags: e.anchors.map((tor) => ({ tor, flags: scopeFlags(reqs[tor]?.text ?? '') })).filter((x) => x.flags.length) };
    // What a person is asked to confirm at the look: each Then / And line of an operator-observed requirement, in its own words.
    e = { ...e, observed: e.anchors.filter((tor) => /operator-observed/.test(reqs[tor]?.text ?? '')).map((tor) => ({ tor, clauses: thenClauses(reqs[tor].text) })) };
    // Said only of an epic that runs: a park or a skip has its own reason.
    if (tbd && eligibility === 'eligible') reasons.push(e.id === skeletonId ? 'CLAUDE.md still has values to decide (TBD / Not decided yet): this epic, the walking skeleton, settles them; any that costs money or depends on your accounts is asked'
      : `CLAUDE.md still has values to decide (TBD / Not decided yet): ${skeletonLeft ? 'the walking skeleton settles them' : 'no epic in the plan is left to settle them, so a person must'}; this epic runs meanwhile and may not change them`);
    return { ...e, eligibility, humanCheck, reasons };
  });
  return { ok: refuse.length === 0, refuse, testCommand: config.testCommand ?? facts.testCommand, testDirs: config.testDirs?.length ? config.testDirs : facts.testDirs, epics };
}

/** The Then line of a scenario and the And / But lines after it, without the keyword: what the requirement promises. */
export function thenClauses(text) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim());
  const at = lines.findIndex((l) => /^Then\b/.test(l));
  if (at < 0) return [];
  return lines.slice(at).filter((l) => /^(Then|And|But)\b/.test(l)).map((l) => l.replace(/^(Then|And|But)\s+/, ''));
}

/** Safety caps as sizes: a cap is a ceiling a session is stopped at, not what it usually takes. */
export function capSize(minutes) { return minutes <= 15 ? 'XS' : minutes <= 30 ? 'S' : minutes <= 60 ? 'M' : minutes <= 120 ? 'L' : 'XL'; }

/** What a verify session is told when the owner has already looked at this exact branch tip. */
export function ownerLook(look, meta, caughtUp = null) {
  const observed = meta.reasons.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]);
  return `# The operator's observation is already recorded

Before this session started, the project's owner looked at what was built and recorded what they saw. That record is the operator's
observation for this epic. It was made by a person; it is not your inference and you must not add to it.

- **Who and when:** ${look.by}, ${look.date}
- **What they looked at:** ${(look.artifacts ?? []).join(', ') || 'the build'} — branch tip ${look.branchTip}, ${caughtUp && caughtUp.from === look.branchTip ? `this epic's own work. Since then autopilot merged the integration line into the branch (other epics' merged work only), so the tip you are verifying is ${caughtUp.to}` : look.kept ? `the build before its repair. Since then a repair changed only ${look.kept.files.join(', ') || 'nothing'}, no file a screen is built from, so the owner was not asked to look again: their look stands for the screens, and the tip you are verifying is ${look.kept.to}` : 'the commit you are verifying'}
- **Their answer:** "Looks right"${look.observations?.length ? `\n- **What they confirmed, one Then at a time** (each is the owner's own yes to that line, shown to them in the requirement's words):\n${look.observations.map((o) => `  - ${o.tor}: "${o.clause}" — ${o.answer === 'yes' ? `yes, I saw this${o.how === 'live' ? ' (for real, on the running build: not in a picture)' : ''}` : o.answer}${o.note ? ` (${o.note})` : ''}`).join('\n')}` : ''}
- **Their words:** ${look.note ? `"${look.note}"` : '(none beyond the answer)'}
${observed.length ? `- **Operator-observed requirements it covers:** ${observed.join(', ')}\n` : ''}
"Looks right" is the owner's answer to the whole requirement: they were shown its Then lines and
were asked whether what was built meets them. Their words add detail; they do not have to repeat
every line. Treat a Then as observed unless their words contradict it or say they did not check it.

In Step 1.2 item 7, do not ask the person to perform the check again and do not use
\`AskUserQuestion\` for it. Do everything else the step says yourself (the checklist mirrors the
Gherkin, the automated parts run, the implementation is inspected), then judge the recorded
observation against the Then and record the evidence as
\`operator-observed: <their words> (recorded by ${look.by} on ${look.date}, before this session)\`.
Give CANNOT VERIFY only where the record contradicts a Then or says it was not checked; never
because their words leave a line unmentioned. Never add an observation of your own.

This changes item 7 only. Ask every other question the skill tells you to ask, with
\`AskUserQuestion\` and in the skill's own words (Step 1.5, Step 2.0, the ship mode, any failure):
they are answered for you. Never skip one or choose its answer yourself.
`;
}

/**
 * What a verify session is told in a provisional run about requirements only a person can observe:
 * nobody will, so they are recorded as not observed (an `unverified:` line), never as verified.
 * `unobserved` is `[{tor, clauses}]`.
 */
export function notObserved(unobserved) {
  return `# Requirements nobody will observe in this run

The project's owner started this run as a provisional run: it does not stop for a person to look.
The requirements below are operator-observed. Nobody has observed them, and nobody will during
this session:

${unobserved.map((u) => `- **${u.tor}** — what a person must still see:\n${u.clauses.map((c) => `  - ${c}`).join('\n') || '  - (its Then lines)'}`).join('\n')}

For these requirements, and only these:

- Do not ask anyone to perform the check and do not use \`AskUserQuestion\` about them: not for
  Step 1.2 item 7, not the Step 1.4b question, not "can you do this now?". Nobody is there.
- Do every part of Step 1.2 that needs no person: the checklist mirrors the Gherkin, the
  automated parts run, the implementation is inspected. Something wrong there is a FAIL like any
  other, handled as the skill says.
- When those parts are in order the requirement is **not observed**. That is not a PASS: never
  record a PASS for it and never write an observation of your own. It is not a deferral either:
  write no Deferrals row for it, leave the Deferrals \`Count:\` as it is, write no \`waived:\`
  line, and judge the epic's verdict on its other requirements and gates.
- In Step 2.2 record it in the same \`tor-lifecycle mark\` call as the others, as
  \`--fail <TOR> "NOT OBSERVED — provisional run: <what a person must still do, in one line>"\`.
  That writes its \`unverified:\` line, so nothing reads it as verified.
- In your final report list it under the heading "Not proven for real", with what a person
  must still do and the checklist file that says how.

Every other requirement is verified as the skill says, and every other question the skill tells
you to ask is still asked, in the skill's own words.
`;
}

/** The \`## Deferrals\` section of a handoff, up to the next heading; null when there is none. */
export function deferralsSection(handoff) {
  if (!handoff || !/^## Deferrals\b/m.test(handoff)) return null;
  const from = handoff.slice(handoff.search(/^## Deferrals\b/m));
  const next = from.slice(3).search(/^## /m);
  return next < 0 ? from : from.slice(0, next + 3);
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
  if (top.code !== 0 || fs.realpathSync.native(top.out) !== fs.realpathSync.native(root)) return null;
  for (const b of ['develop', 'main', 'master']) if (gitOk(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`)) return b;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Session command, settings, prompts
// ---------------------------------------------------------------------------------------------

/** The referee layer written as each session's `settings.json` (plan §6.7, SPIKE.md S11). */
export function sessionSettings(config = {}, { kind = null, scratch = null } = {}) {
  // The auditor reads a bundle and needs nothing from outside. Every other session may reach the package registries and the
  // project's named hosts, and may use local sockets and ports: build tools talk to their own worker processes that way
  // (MSBuild and `dotnet test` over named pipes, test servers on localhost), and without it they cannot run at all (seen live).
  const open = kind !== 'audit';
  const allowedDomains = open ? sessionNetwork(config) : [];
  // Off by default (owner decision, 2026-11-13): the sandbox stopped real toolchains in ways no project setting could
  // predict (MSBuild's named pipes, caches in the home directory). The referee hooks and the deny list still apply.
  // The auditor follows the same setting (seen live: forced into a sandbox on a machine that has none, every audit
  // ended in seconds and the run with it). It has Read, Grep and Glob only, and the referee keeps it to the bundle and the clone.
  const sandboxed = config.sandbox === true;
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
    sandbox: sandboxed ? {
      enabled: true, allowUnsandboxedCommands: false, failIfUnavailable: true,
      network: { allowedDomains, strictAllowlist: true, ...(open ? { allowAllUnixSockets: true, allowLocalBinding: true } : {}) },
      // The session's scratch folder is outside the clone: the one other place a sandboxed command may write.
      ...(open && scratch ? { filesystem: { allowWrite: [scratch] } } : {}),
    } : { enabled: false },
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

/** A session's scratch folder: in its step directory, so outside the clone. Nothing in it can be committed or left in the clone for the next run to trip on. */
export const scratchDir = (stepDir) => path.join(stepDir, 'scratch');
/**
 * What every working session is told about temporary files. Seen live: a session refused `/tmp`
 * left its scratch files in the clone, and the next launch stopped on a dirty clone.
 */
export const scratchRule = (dir) => `# Temporary files

Put every file you need only while you work (a probe script, captured command output, a
downloaded sample) in this folder:

\`${dir}\`

In a shell command it is \`"$AUTOPILOT_SCRATCH"\`. It is outside the repository, so nothing there is
committed, and nothing there is part of what you deliver. Do not put such files in the
repository: an untracked file left there fails the clean-tree check. Other places outside the
repository, \`/tmp\` included, may be refused.

In a command, use \`"$AUTOPILOT_SCRATCH/out.txt"\` as it is (the file tools take the folder above). A variable may hold a file
below it (\`out="$AUTOPILOT_SCRATCH/out.txt"\`); copying the folder itself into another variable (\`S="$AUTOPILOT_SCRATCH"\`),
cutting it down, or a path relative to the current folder (\`./out.txt\`) is refused, or lands in the repository.
`;

/**
 * What every working session is told about the owner's connectors (#43, owner decisions 2026-11-25). Seen live: with
 * no connector reachable, a session asked the owner four times for something no answer could grant (~$8 of relaunches).
 * The referee (R11) enforces it; this says it, so the session does not ask.
 */
export const CONNECTOR_RULE = `# Connectors (the owner's accounts and browser)

The owner's connectors are available to you: their accounts (Gmail, Drive and the like) and a
browser. They are not loaded at the start: find one with \`ToolSearch\` (for example
"gmail search" or "browser navigate") before you call it.

- **Accounts are read only.** Get, list, search and read; never send, change or delete anything
  through a connector. Such a call is refused.
- **Browser tools work on your app's local pages.** Open only pages your app serves (localhost,
  127.0.0.1, or a file in the repository), and click, type and fill freely there. The owner's
  sign-ins carry over, so a "Sign in with …" page your app redirects to completes with a
  click. On such a page you may only click and look, then go back to your app; typing, scripts
  and opening any other site are refused. \`browser_run_code\` is refused; a script on the page
  may not leave it or send data out.
- A connector that needs a sign-in, or a check that needs a connector to send, change or delete
  something, is not something the owner can grant during a run. Do not ask the owner about it:
  list what it would have proven under the heading "Not proven for real" in your final report,
  with what you checked instead.
- A read through a connector is not a paid call; the rule on calls that cost real money is unchanged.
`;

const lookReasons = (reasons) => (reasons ?? []).filter((r) => /operator-observed|UI epic/.test(r));
/** The look gate's question in the owner's words: "This epic changed screens; pictures of them are ready." and "<TOR> needs a person to check it." */
export function lookAsk(reasons, pictures) {
  const rs = lookReasons(reasons);
  const tors = rs.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]);
  return [rs.some((r) => /UI epic/.test(r)) ? `This epic changed screens; ${pictures ? 'pictures of them are ready' : 'no pictures of them could be made'}.` : null,
    tors.length ? `${tors.join(', ')} ${tors.length > 1 ? 'need' : 'needs'} a person to check ${tors.length > 1 ? 'them' : 'it'}.` : null].filter(Boolean).join(' ');
}

/** In plain words, what a thin review did: for its gate's question and the provisional list. */
export function thinWords(label, coverage, thin) {
  const secs = coverage.seconds == null ? '' : ` in ${coverage.seconds} s`;
  const untested = thin.untested?.length ? `, and checked no test for ${thin.untested.join(', ')}` : '';
  return `The independent review of ${label} read ${coverage.read} of ${coverage.of} changed code files${secs}${untested}: the reviewer barely looked, twice.`;
}
/** Appended to the second try's prompt after a thin first try. */
/**
 * Every review is told, by name, the changed code files to open, and that too few opened is run again. Seen live
 * (Pilot Light, 2026-11-25): with only the prompt's general rule, two first reviews of two read 10 of 21 and 4 of 9.
 */
export function filesToOpenLine(files) {
  if (!files.length) return '';
  const shown = files.slice(0, 40);
  const need = Math.min(Math.ceil(files.length * THIN_REVIEW.share), THIN_REVIEW.cap);
  return `\n## The files to open\n\n\`diff.patch\` changes ${files.length} code file${files.length === 1 ? '' : 's'}. Open each one in the clone before you report: the driver counts the files you open, and a review that opens fewer than ${need} of them is not counted and is run again.\n\n${shown.map((f) => `- \`${f}\``).join('\n')}${files.length > shown.length ? `\n- and ${files.length - shown.length} more, in \`diff.patch\`` : ''}\n`;
}

export function thinAgainLine({ coverage, thin }) {
  const unread = coverage.unread.slice(0, 15);
  return `\n## Your first try was too thin\n\nA review of this bundle read ${coverage.read} of ${coverage.of} changed code files${thin.untested.length ? ` and named no test for ${thin.untested.join(', ')}` : ''}. Open at least ${thin.need}, and for every anchor its test. Not opened: ${unread.map((f) => `\`${f}\``).join(', ')}${coverage.unread.length > unread.length ? `, and ${coverage.unread.length - unread.length} more` : ''}.`;
}

/**
 * The exact command for one step: host mode for plan, build and verify (SPIKE.md "Host mode"),
 * plain `-p` for the auditor (plan §6.6 "Audit"). Pure: used by the dry run too.
 */
/**
 * The final usage of a session's messages, from the transcripts the CLI keeps (`projects/<cwd slug>/<id>.jsonl`, and its
 * subagents' under `<id>/subagents/`). The stream's assistant lines carry a message's usage as it starts, so their
 * `output_tokens` are near zero; the transcript has the finished count. Found by session id, whatever the slug. Read-only.
 */
export function transcriptUsage(configDir, sessionId) {
  const usage = new Map();
  const root = path.join(configDir, 'projects');
  let slugs = []; try { slugs = fs.readdirSync(root); } catch { return usage; }
  for (const slug of slugs) {
    const main = path.join(root, slug, `${sessionId}.jsonl`);
    if (!exists(main)) continue;
    const subs = path.join(root, slug, sessionId, 'subagents');
    let more = []; try { more = fs.readdirSync(subs).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(subs, f)); } catch { /* none */ }
    for (const file of [main, ...more]) {
      let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        let d; try { d = JSON.parse(line); } catch { continue; }
        if (d?.type === 'assistant' && d.message?.id && d.message.usage) usage.set(d.message.id, { model: d.message.model, usage: d.message.usage });
      }
    }
    break;
  }
  return usage;
}

export function sessionCommand(config, { kind, epicId, workspace, runDir, stepDir, pluginDir = PLUGIN_DIR, sessionId, appendFiles = [], prompt, schema, resume = null }) {
  const b = config.budgets[kind] ?? (kind === 'catchup' ? config.budgets.fix : undefined); // a catch-up session: a repair's limits unless set
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
  if (kind !== 'audit') env.AUTOPILOT_SCRATCH = scratchDir(stepDir); // where the session keeps temporary files; the auditor only reads
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
    // ToolSearch: the owner's connectors are deferred tools, loaded through it (#43); the referee's R11 rules each call.
    '--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Skill', 'Agent', 'TaskCreate', 'TaskUpdate', 'ToolSearch',
    '--disallowedTools', 'WebFetch', 'WebSearch',
    '--max-turns', String(b.turns), '--max-budget-usd', String(b.usd),
    '--session-id', sessionId, '--model', b.model,
  ];
  if (effort) args.push('--effort', effort);
  // A session stopped at its own question is taken up again with what it knows, under a new id (the old transcript stays as it was).
  if (resume) args.push('--resume', resume, '--fork-session');
  // `claude` keeps only the last `--append-system-prompt-file` (proven live: of two files, the session saw the second
  // only, so a verifier given the owner's look and then its rules never read the look). Several files go in as one.
  if (appendFiles.length > 1) {
    const all = path.join(path.dirname(appendFiles.at(-1)), 'system-append.md');
    fs.writeFileSync(all, appendFiles.map((f) => read(f).trimEnd()).join('\n\n') + '\n');
    args.push('--append-system-prompt-file', all);
  } else for (const f of appendFiles) args.push('--append-system-prompt-file', f);
  return { bin: config.claudeBin, args, env, cwd: clone, wallMin: b.wallMin, host: true };
}

const userLine = (text) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });

/**
 * Appended to the planning session. Seen live: a requirement that could not be met as written was
 * found by the build, an hour and several dollars in; the owner's amendment answer then waited
 * for a second run. Read against each other before any plan exists, the same question costs a
 * few minutes. One check per epic, at planning; the plan lint looks for the line.
 */
export const PLAN_RULES = `# Autopilot planning rule: check the requirements first

Before you write the plan, read the full text of every requirement this epic anchors
(\`docs/requirements/\`) and check two things:

1. **Can each one be met as written?** A Then that names a screen, a field, a limit or a
   behaviour the project's own documents rule out, or that nothing in this project could do,
   cannot be met by building harder.
2. **Do any two contradict each other?** Compare this epic's requirements with each other, and
   with the requirements of finished epics whose code this epic changes. Two Thens that cannot
   both be true are a contradiction.

If you find one, stop before planning and ask the owner now, with the skill's own Amendment
gate question (\`AskUserQuestion\`, in the skill's wording, naming the requirement and what is
wrong with it). Do not plan around it and do not pick a reading yourself.

If you find none, say so in the plan, on a line of its own, exactly in this form:

\`Requirements checked for contradictions: none found (<n> requirements read).\`

The plan is not accepted without that line.
`;

export const BUILD_RULES = `# Autopilot build rules

You are implementing an already-approved plan, unattended. The plan in your prompt is the complete
execution script for this session.

- Execute every item in order. Do not add, skip, or reorder items.
- Do not enter plan mode. The plan is approved; \`EnterPlanMode\` and \`ExitPlanMode\` are denied.
- Where the plan says to ask the user, ask with \`AskUserQuestion\` exactly as the plan words it.
  Never answer such a question yourself and never work around it.
- Before you change, move or delete a test file that already exists on the integration line,
  append one line to \`.autopilot/test-changes.jsonl\`: \`{"path":"<the file>","reason":"<why this
  change is right>"}\`. Without it the change is refused. New test files need no line. A person
  reads every reason.
- Commit everything you leave behind. \`.autopilot/test-changes.jsonl\` is part of your work:
  stage it with your final commit. \`git status\` must be clean when you finish.
- Do not start a command that waits for the project's owner (a sign-in in a browser, a device
  to plug in). A build does the part that needs no person; the final check is where a person is
  asked to come, once. Say in your handoff what you left for it and the exact command.
- Anything you did not exercise against the real thing (a requirement you marked CANNOT VERIFY,
  a stand-in for a service, a check you left for the final check) is also listed, one line each,
  under the heading "Not proven for real" in your handoff and in your final message, with what it
  was checked against instead. Keep "CANNOT VERIFY" wherever the skill asks for it.
`;

export const FIX_RULES = `# Autopilot repair rules

You are repairing an already-built epic, unattended. The list in your prompt is the whole job.

- Do not enter plan mode: \`EnterPlanMode\` and \`ExitPlanMode\` are denied. Do not run \`/peak-workflow:start-epic\`.
- Do not change the epic's status, and do not merge or push.
- Where you must ask, ask with \`AskUserQuestion\`. Never answer such a question yourself and never work around it.
- Commit everything you leave behind, \`.autopilot/test-changes.jsonl\` included. \`git status\` must be clean when you finish.
- Do not start a command that waits for the project's owner (a sign-in in a browser, a device
  to plug in). A repair does the part that needs no person; the final check is where a person is
  asked to come, once. Say in your handoff what you left for it and the exact command.
- Anything you did not exercise against the real thing (a requirement you marked CANNOT VERIFY,
  a stand-in for a service, a check you left for the final check) is also listed, one line each,
  under the heading "Not proven for real" in your handoff and in your final message, with what it
  was checked against instead. Keep "CANNOT VERIFY" wherever the skill asks for it.
`;

export const CATCHUP_RULES = `# Autopilot catch-up rules

You are bringing one epic's branch up to date with the other finished work, unattended. The steps
in your prompt are the whole job.

- Do not enter plan mode: \`EnterPlanMode\` and \`ExitPlanMode\` are denied. Do not run a skill.
- Merge only the integration line into this branch, with \`git merge\`. Do not merge this branch into
  the integration line, and do not rebase, reset or push.
- Settle each clash so both sides hold: keep what the integration line added and what this epic
  added. Change no file that did not clash: no new work, no tidying, nothing renamed.
- Never edit a requirement file (\`docs/requirements/\`). If one clashes, or the two sides cannot both
  hold, run \`git merge --abort\` and ask with \`AskUserQuestion\`, naming the files and what each side wants.
- Never weaken, skip or delete a test to make the merge pass. If a test fails after the merge, say so
  in your last message: the final check judges it.
- Commit the merge. \`git status\` must be clean when you finish.
`;
/** The catch-up session's prompt: which line, which files clash, how to check. */
export function catchUpPrompt({ branch, integration, files, testCommand }) {
  return [`Bring the branch \`${branch}\` up to date with \`${integration}\`. Other epics merged into \`${integration}\` since this branch was made, and both sides changed ${files.length ? files.map((x) => `\`${x}\``).join(', ') : 'the same lines'}.`, '',
    `1. You are on \`${branch}\`. Run \`git merge --no-ff ${integration}\`; it stops on the clash.`,
    '2. In each clashing file, keep both sides\' work: what the other epics added and what this epic added.',
    `3. Run the tests${testCommand ? `: \`${testCommand}\`` : ''}.`,
    '4. Commit the merge (`git commit --no-edit`) and finish with a clean `git status`.'].join('\n');
}

/**
 * What a session is told about steps only a person can do, from the owner's answer at launch (the
 * run's `attended`) and from what earlier sessions of this epic already waited for in vain. Seen
 * live: with the owner away, a build and then a verify each opened a browser sign-in and each
 * waited five minutes; that was a third of the run and two calls to the owner's phone.
 */
/**
 * Told to a build or repair session when a requirement of this epic was amended. A provisional run took it on a
 * session's own recommendation: the change record is the session's to write, and it must say no person approved it
 * (before, only the planner knew, so the build wrote a person's name and the check sent it into the one repair round;
 * Pilot Light, 2026-11-23). The owner approved it: the repair keeps it, instead of restoring the old requirement
 * (#41 B12). `items` are `amendedPairs` entries, or TOR IDs a provisional run took.
 */
export function amendmentRule(items) {
  const list = (items ?? []).map((x) => (typeof x === 'string' ? { was: x, provisional: true } : x));
  const tors = list.filter((x) => x.provisional).map((x) => x.was);
  const owner = list.filter((x) => !x.provisional);
  let out = '';
  if (tors.length) out += `\n# Requirements amended in this run\n\nThis is a provisional run. ${tors.length === 1 ? 'The requirement' : 'The requirements'} ${tors.join(', ')} ${tors.length === 1 ? 'was' : 'were'} amended on a session's own recommendation, and no person has approved ${tors.length === 1 ? 'it' : 'them'}. The change record you write under \`docs/requirements/changes/\` must say \`approved_by = "${PROVISIONAL_BY}"\`, exactly, and never a person's name. The owner confirms it afterward.\n`;
  if (owner.length) out += `\n# Requirements the owner amended\n\n${owner.map((x) => (x.now?.length ? `The owner approved amending ${x.was} → ${x.now.join(', ')}; keep it as amended.` : `The owner approved amending ${x.was}${x.gate ? ` (${x.gate})` : ''}; make the amendment as approved and keep it.`)).join('\n')}\nBuild and test against the requirement as amended. Do not restore the requirement it replaced, in the requirement files or in the tests: a test that follows the amendment is not a weakening.\n`;
  return out;
}

export function presenceRule(attended, unanswered = []) {
  const tried = unanswered.length ? `\nAlready tried in this epic, and nobody came:\n\n${unanswered.map((u) => `- ${u.description}${u.command ? ` (\`${u.command}\`)` : ''}`).join('\n')}\n\nDo not start ${unanswered.length === 1 ? 'that' : 'any of those'} again. List ${unanswered.length === 1 ? 'it' : 'each'} in your final report under the heading "Not proven for real", with the command the\nowner can run by hand.\n` : '';
  if (attended === false) return `\n# The owner is away\n\nThe project's owner has said they will not be at the computer during this run. Do not start a\ncommand that waits for a person (a sign-in in a browser, a device to plug in): nobody will come.\nDo everything that needs no person. In your final report list, under the heading "Not proven for\nreal", each thing that needed them, what it was checked against instead, and the exact command\nthey can run by hand when they are back.\n${tried}`;
  return tried ? `\n# Steps that wait for the owner\n${tried}` : '';
}

/** Where a session leaves pictures for the owner's look, inside the clone. Git is told to ignore it: never committed, never merged. */
export const LOOK_DIR = '.autopilot/look';
const PICTURE = /\.(png|jpe?g|gif|webp)$/i;
/** The pictures in a look folder, with what its `index.md` says each one shows: `[{ file, shows }]`. */
export function lookPictures(dir) {
  let names = []; try { names = fs.readdirSync(dir).filter((f) => PICTURE.test(f)).sort(); } catch { /* no folder */ }
  let index = ''; try { index = fs.readFileSync(path.join(dir, 'index.md'), 'utf8'); } catch { /* no index */ }
  const lines = index.split('\n');
  return names.map((file) => ({ file, shows: (lines.find((l) => l.includes(file)) ?? '').replace(/^\s*[-*]\s*/, '').replace(file, '').replace(/^[`\s—–:-]+/, '').trim() }));
}
/**
 * What the build of an epic with screens is told: leave pictures of what was built where
 * autopilot collects them. Seen live: a build drove a real browser, kept two screenshots in a
 * temp folder, and the owner was asked "does it look right?" with nothing to look at. The folder
 * is tool-neutral: any browser tooling the project has can write there.
 */
export const LOOK_RULE = `
# Pictures for the owner's look

This epic changes screens. Before it is verified, the project's owner is shown what you built,
and they judge it from pictures, not from code or test results. Leave those pictures in
\`${LOOK_DIR}/\` (git ignores that folder: do not add or commit it):

- A screenshot of every screen and every state the requirements name: each page, signed in and
  signed out, empty and with data, each error page, light and dark when both are required, and
  the narrowest width required. Take them from the running app, with the browser tooling this
  project already has (its end-to-end tests, or a browser command-line tool).
- \`index.md\`, one line per picture: \`- <file name> — what it shows — the requirement(s) it is
  evidence for\`. Plain words: the owner reads this line as the picture's caption.

Take them from the finished build, as the last thing before your final commit. A build of this
epic with no pictures and no index is not done, and is sent back.
`;
/** What the verifier of an epic with screens is told: look at the pictures yourself and say what you see. */
export const LOOK_VERIFY_RULE = `
# The pictures of what was built

The build left screenshots of this epic's screens in \`${LOOK_DIR}/\`, with \`index.md\` saying what
each one shows. The owner has been shown the same pictures. Open every one of them yourself (the
Read tool shows an image) before you give a verdict: the tests passing does not tell you what
the screen looks like.

In your final report, under the heading "What the pictures show", write one line per picture:
what you actually see in it, and whether that matches the requirement its index line names. A
picture that is blank, cut off, unreadable, or shows something other than its index line says
does not count as evidence: say so plainly and judge that requirement accordingly. If a screen
or state a requirement names has no picture, say which.
`;

/**
 * What every session is told about spending real money on an outside service (a paid API called
 * with the keys in the copy). It is the owner's decision, given at launch as the run's `realSpend`:
 * `true` spend when a check needs it, `false` never, anything else not decided — then the session
 * asks. Seen live: a verifier skipped the one real call "to avoid spending the shared credit",
 * nobody was asked, and the epic merged proven only against a stand-in.
 */
export function spendRule(realSpend) {
  const head = '\n# Calls that cost real money\n\n';
  if (realSpend === true) return `${head}The project's owner has approved spending real money on calls to outside services (with the keys
in this copy) when a test or a check needs one to prove a requirement. Make that call. Do not skip
it to save money, and do not put a stand-in in its place. Keep it to the smallest call that proves
the point, once. In your final report say what you called and roughly what it cost; if a real call
could not be made (no key, the service refused), say that under the heading "Not proven for real".
`;
  if (realSpend === false) return `${head}The project's owner has said not to spend real money on calls to outside services in this run. Do
not make one. In your final report list, under the heading "Not proven for real", each thing a
real call would have proven and what it was checked against instead.
`;
  return `${head}Whether to spend real money on a call to an outside service is the project's owner's decision, not
yours. If a test or a check needs such a call to prove a requirement, ask with \`AskUserQuestion\`:
say what would be called, why a stand-in does not prove it, and roughly what it costs. Never skip
it silently, and never decide it yourself.
`;
}

/** Appended to every verify session: the one operational rule a verifier needs from autopilot. It says nothing about what to verify or how to judge it. */
export const verifyRules = (limits) => `# Autopilot session rules

- When a command you run waits for the project's owner (a sign-in in a browser, a device to
  plug in), start its Bash \`description\` with \`Needs you:\` and say in a few words what they must
  do. They are told at once. Give them time: a timeout of at least five minutes.
- Answers to your \`AskUserQuestion\` questions come from autopilot's standing rules or the
  owner's recorded decisions. Report each one that way ("autopilot answered Stop"); "you chose"
  is for a choice a person made in this session.
- Stop anything you start (a server, a watcher) before you finish. Whatever is still running
  when the session ends is stopped for you.
- Whatever you see that is wrong and you leave as it is (wrong text in a picture, a console error,
  a check that fails and is not this epic's) goes in your final report under the heading "Seen but
  not fixed", one line each, or "none". A defect only noticed in passing reaches nobody.
- A defect in this epic's own work that no requirement or gate covers is asked first, never only
  listed: \`AskUserQuestion\` with a question that starts with the exact words "Seen but not fixed
  yet: " (what, where; then "Recommendation: Fix now" or "Recommendation: Leave as is", with why;
  then "How to proceed?") and the options "Fix now", "Leave as is", "Stop — epic FAILs".
  ${limits ? `Recommend Fix now only for a small fix: at most ${limits.files} files and ${limits.lines} changed lines, with its test, and no requirement file. Up to ${limits.perEpic} such fixes per final check are made on the owner's standing answer; anything bigger, recommend Leave as is` : 'The owner has no standing answer for small fixes: every such question goes to them'}.
  A defect that is not this epic's (the machine, an earlier epic, test data) is not asked: list it
  under "Seen but not fixed" with where it comes from. The one exception is the next rule.
- A failing gate or test this epic's change does not touch is never only listed, even when an
  earlier epic broke it: run just those
  tests on the base in a scratch worktree, and when they fail the same way there, ask the question
  wrapup-epic Step 1.4b gives for it ("… fail the same way on <base>: …", options "Accept as
  pre-existing", "Fix on this branch", "Stop — epic FAILs").
- The build's handoff may list things under the heading "Not proven for real". Each one you do not
  prove for real yourself goes, one line each, under the same heading in your final report, with
  what it was checked against instead.
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
2. Make exactly the fixes listed, in the code and in the tests. Nothing else: no refactoring, no new features, no other epic's files, no file under \`docs/requirements/\` (a requirement the owner approved amending stays as amended).
3. Keep every test that names a TOR ID naming it, and make each test you touch able to fail: it must assert what the requirement's Then says.
4. Run the project's test command from \`CLAUDE.md\` and the other quality gates listed there. Everything must pass.
5. Update \`${PLAN_DIR}/session-handoffs/epic-${meta.id}-implemented.md\` wherever the repair changes what it says (what was built, spec deviations, TOR coverage). Keep its \`## Deferrals\` section and \`Count:\` line truthful. Leave the status sidecar as it is (\`status: Implemented\`).
6. Commit on the branch, staging files by path: \`fix(epic-${meta.id}): <what was repaired>\`. Do not push and do not merge.

If a listed fix cannot be made as asked, or making it would leave a requirement unmet, stop and ask with \`AskUserQuestion\` — say which fix, why, and offer the options a person would need. Do not work around it.
`;
}

/** A file a screen is built from: markup, styles, components, images. A change to one needs a new look. */
const SCREEN_FILE = /\.(html?|css|s[ac]ss|less|[jt]sx|vue|svelte|razor|cshtml|xaml|svg|png|jpe?g|gif|webp|ico)$/i;

// ---- the owner's answers, handed to the session that takes a step up again ---------------------

const stepKindOf = (session) => String(session ?? '').replace(/-\d+$/, '');
/**
 * Every question of this epic that a session asked and the owner answered, oldest first, each with
 * the kind of session that asked (`plan`, `build`, `fix`, `verify`). A session that takes that step
 * up again is told them before it does anything: seen live, a fresh session words the same
 * question differently, the recorded answer matches nothing, and the owner is asked again.
 * Answers already used stay on the list (the next session did not hear them); a start from
 * scratch retires them. An answer that puts the question off ("Not now") is told only to the
 * session resuming from that gate (`keep`): later sessions ask again.
 */
export function ownerAnswers(workspace, epicId, { keep = null } = {}) {
  return readGates(workspace).filter((g) => g.epic === epicId && g.decided?.answer && !g.decided.prototype && !g.void && !g.superseded && !g.cleared && gateEntry(g)?.question && (g.file === keep || !postpones(g.decided.answer)))
    .map((g) => ({ gate: g.file, kind: stepKindOf(g.session), gateKind: g.kind ?? 'unmatched', tor: g.tor ?? null, question: g.question ?? '', options: g.options ?? [], answer: g.decided.answer, by: g.decided.by ?? null, date: g.decided.date ?? null, ...(g.decided.note ? { note: g.decided.note } : {}) }));
}
const answerList = (answers) => answers.map((a, i) => `${i + 1}. **Asked:** "${a.question}"\n   **Options offered:** ${a.options.map((o) => `"${o}"`).join(', ') || '(none)'}\n   **The owner's answer:** "${a.answer}" — ${a.by ?? 'the owner'}, ${a.date ?? 'earlier'}${a.note ? `\n   **Their words:** "${a.note}"` : ''}`).join('\n');
const ANSWER_RULES = `Act on each answer when you reach the point it concerns: do what the chosen option says, as if the
owner had just picked it here. Do not ask the same thing again in any wording, and do not ask for
confirmation. If the answer needs something only a person can do (a sign-in in a browser, a look
at a screen), the owner chose it knowing that: start it, give them time, and carry on. Start the
Bash \`description\` of the command that waits for them with \`Needs you:\` and say in a few words
what they must do: they are told at once.

Use \`AskUserQuestion\` only for a decision that is really a different one. Every other question
the skill tells you to ask is still asked, in the skill's own words.`;
/** Appended to the system prompt of a new session that takes up a step the owner has answered questions about. */
export function ownerAnswersText(answers) {
  return `# Questions the owner has already answered

Before this session started, an earlier session doing this same step asked the project's owner the
question${answers.length === 1 ? '' : 's'} below, and the owner answered. Each answer is a person's decision, recorded by
autopilot. It is not yours to change, and not yours to ask for again.

${answerList(answers)}

${ANSWER_RULES}
`;
}
/** The one message a stopped session is resumed with: the owner's answer, and what may have changed while it waited. */
export function resumeMessage(answers, { branch }) {
  return `You were stopped while the project's owner was asked your question. They have answered.

${answerList(answers)}

Continue from exactly where you stopped. Do not start the step over, and do not repeat work you
have finished: what you read, ran and concluded earlier in this session still stands.

Two things may have changed while you waited:

- The working copy${branch ? ` (branch \`${branch}\`)` : ''} may have been put back to how it was when you started. Before you rely on a
  file you changed or a commit you made earlier in this session, check it is still there
  (\`git status\`, \`git log -3\`) and redo only what is missing. A commit named
  \`wip(autopilot): uncommitted work at park\` is your own uncommitted work, kept for you.
- Anything you left running (a server, a watcher) has been stopped. Start it again if you need it.

${ANSWER_RULES}
`;
}

/** `prompt.md` for a build session: Claude Code's clear-context handoff, minus the transcript pointer. */
export function buildPrompt(plan, pluginDir = PLUGIN_DIR, { continuing = false } = {}) {
  return (continuing ? CONTINUE_LEAD : '') + 'Implement the following plan:\n\n' + plan.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginDir);
}

/** What a session is told first when it takes over a build or a repair that was cut short. */
export const CONTINUE_LEAD = `An earlier session started this work and was stopped before it finished. Nothing is wrong with what
it did: it ran out of time or the run was stopped. Its work is on the branch, and whatever it had
not committed is there as a commit named \`wip(autopilot): uncommitted work at park\`.

Before you change anything: read everything below, then find out what is already done — \`git log\`
on the branch, the files, the tests, the status sidecar. Continue from the first item that is not
done. Do not redo an item that is finished, and do not start over. Treat a half-written file as
unfinished: read it, finish it, and run the tests before you rely on it. "Execute every item in
order" applies to the items that are left. Close out exactly as written below; your last commit
is the normal one, on top of the \`wip(autopilot)\` commit.

`;

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
  p(`How careful:      ${MODE_LINE[config.mode]}`);
  p(`When an epic parks: ${config.onParkFrom === 'project' ? `${config.onPark === 'stop' ? 'the run stops (onPark: stop)' : 'independent epics still run (onPark: continue)'} — set by the project` : config.onParkFrom === 'provisional' ? 'independent epics still run (a provisional run)' : config.onParkFrom === 'attended' ? 'independent epics still run (the owner is away)' : 'follows the owner\'s answer at launch: away, independent epics still run; here, the run stops'}`);
  p(`Clone environment: setup ${config.setup ? `\`${config.setup}\`` : '(none)'}; copied from the project: ${(config.copy ?? []).join(' ') || '(nothing)'}; readable outside the clone: ${(config.readOnly ?? []).join(' ') || '(nothing)'}; files CLAUDE.md names outside the project: ${namedReads(project, workspace).files.join(' ') || '(none)'}`);
  p(config.sandbox === true
    ? `Sandbox:          on — sessions write only in the clone, may use local sockets and ports, and reach ${REGISTRIES.length} package registries${cleanNetwork(config.network).length ? ` plus ${cleanNetwork(config.network).join(', ')}` : ''}; nothing else. The auditor has no network (WebFetch and WebSearch are always denied)`
    : 'Sandbox:          off — sessions run commands as a terminal does, with open network; the referee keeps file writes inside the clone and the temp directories (best effort for scripts) and still denies push, containers and sudo. The auditor only reads (WebFetch and WebSearch are always denied)');
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
      p(`    also appended: scratch-rule.md (temporary files go in ${scratchDir(stepDir)}); a real run joins a step's appended files into system-append.md`);
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

  p(); p('Settings JSON (written as each step\'s settings.json; the auditor\'s has an empty allowedDomains):');
  p(JSON.stringify(sessionSettings(config, { scratch: '<step directory>/scratch' }), null, 2));
  p(); p('Gate policy:');
  const policy = path.join(pluginDir, 'scripts', 'autopilot', 'policy', 'gates.json');
  p(exists(policy) ? read(policy) : '  policy/gates.json is not built yet (P2). Until then every AskUserQuestion parks.');
  return { pre, queue };
}

/**
 * One host-mode session outside any epic (the probe): launched as `launch` launches a step, the
 * host approving nothing, killed at its wall clock. Resolves with how it ended; never throws.
 */
async function hostSession(cmd, prompt, { stepDir, killGraceMs = 30000 }) {
  const isScript = /\.(mjs|cjs|js)$/.test(cmd.bin);
  const started = Date.now();
  const s = { result: null, killed: null, exitCode: null, signal: null, spawnError: null };
  const child = spawn(isScript ? process.execPath : cmd.bin, isScript ? [cmd.bin, ...cmd.args] : cmd.args, { cwd: cmd.cwd, env: childEnv(cmd.env), ...SESSION_SPAWN, stdio: ['pipe', 'pipe', 'pipe'] });
  const stream = fs.createWriteStream(path.join(stepDir, 'stream.jsonl'));
  child.stderr.pipe(fs.createWriteStream(path.join(stepDir, 'stderr.log')));
  child.stdin.on('error', () => {});
  const send = (o) => { if (child.stdin.writable) child.stdin.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\n'); };
  const done = new Promise((resolve) => {
    child.on('error', (err) => { s.spawnError = err.message; resolve(); });
    child.on('close', (code, signal) => { s.exitCode = code; s.signal = signal; resolve(); });
  });
  let grace = null;
  const wall = setTimeout(() => { s.killed = 'wall clock'; killGroup(child.pid, 'SIGTERM'); grace = setTimeout(() => killGroup(child.pid, 'SIGKILL'), killGraceMs); }, cmd.wallMin * 60000);
  if (child.pid) {
    send(userLine(prompt));
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      stream.write(line + '\n');
      const d = tryParse(line);
      if (d?.type === 'control_request') send({ type: 'control_response', response: { subtype: 'success', request_id: d.request_id, response: d.request?.subtype === 'can_use_tool' ? { behavior: 'deny', message: 'autopilot: the host approves nothing; this request was not covered by a rule' } : {} } });
      if (d?.type === 'result') { s.result = d; child.stdin.end(); }
    });
  }
  await done;
  clearTimeout(wall); clearTimeout(grace);
  if (child.pid && killGroup(child.pid, 0)) killGroup(child.pid, 'SIGKILL');
  await new Promise((r) => stream.end(r));
  s.wallMs = Date.now() - started;
  if (s.result) writeJson(path.join(stepDir, 'result.json'), s.result);
  return s;
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

class Run {
  constructor({ workspace, runName, config, pluginDir, verbose, loadArgs = null }) {
    this.stateDir = workspace; // the workspace: lock, STOP, clone/, gates/ (shared by every run)
    this.config = config; this.pluginDir = pluginDir; this.verbose = verbose;
    this.loadArgs = loadArgs; // how `config` was loaded: read again before each step for the steps' budgets (`refreshBudgets`)
    this.clone = path.join(workspace, 'clone');
    this.runName = runName; this.runDir = runDirOf(workspace, runName);
    this.stateFile = path.join(this.runDir, 'state.json');
    this.stopReason = null;
    this.entry = {}; // epic id -> phase to re-enter after a crash
    this.early = []; // log lines from before the run directory exists
    this.leftoversAtStart = []; // files set aside before the run's state exists
  }

  log(msg) {
    const line = `${new Date().toISOString()} ${msg}\n`;
    if (this.verbose) process.stdout.write(line);
    if (!exists(this.runDir)) { this.early.push(line); return; }
    fs.appendFileSync(path.join(this.runDir, 'autopilot.log'), this.early.splice(0).join('') + line);
  }
  /**
   * One line in `runs/<run>/events.jsonl` per milestone, beside the log line that already marks it:
   * what `driver.mjs watch` reads to tell an attending session what happened. Never a decision
   * point, and never worth a failed run.
   */
  event(type, e = null, data = {}) {
    try {
      if (!exists(this.runDir)) return;
      fs.appendFileSync(path.join(this.runDir, 'events.jsonl'), JSON.stringify({ t: new Date().toISOString(), type, ...(e ? { epic: e.id, label: e.label ?? this.metaById?.get(e.id)?.label ?? e.id } : {}), ...data }) + '\n');
    } catch { /* best effort */ }
  }
  save() { writeJson(this.stateFile, this.state); }
  epicDir(e) { return path.join(this.runDir, 'epics', e.id); }
  /** A path as gate files and the report name it: relative to the workspace. */
  rel(p) { return path.relative(this.stateDir, p).split(path.sep).join('/'); }
  meta(e) { return this.metaById.get(e.id); }
  /** The listed test directories where only test-named files are tests, judged from the tree at `rev` (see `testNamedDirs` in lib.mjs). */
  testNamedDirs(revs, dirs) { return testNamedDirs(revs.flatMap((rev) => gitRun(this.clone, 'ls-tree', '-r', '--name-only', rev, '--', ...dirs).out.split('\n')), dirs); }
  /**
   * The requirements the owner approved amending for this epic: their answer "Amend …" at an
   * amendment gate. Seen live: the owner approved one, the build amended it on the epic's branch
   * (the old requirement retired, a new one in its place), and the driver's own checks then failed
   * the build for changing requirement files and for not testing the retired one.
   */
  approvedAmendments(e) { return [...new Set([...this.ownerAmendments(e), ...this.takenAmendments(e)])]; }
  amendGates(e) { return readGates(this.stateDir).filter((g) => g.epic === e.id && /^amendment/.test(g.kind ?? '') && /^amend\b/i.test(g.decided?.answer ?? '') && !g.void && !g.superseded && !g.cleared && g.tor); }
  /** The amendments a person approved. */
  ownerAmendments(e) { return this.amendGates(e).filter((g) => !g.decided.prototype).map((g) => g.tor); }
  /**
   * The amendments a provisional run took on a session's proposal and no person has approved since. They stand in a
   * provisional run only: a full run does not honour one (the owner's decision), so the question is asked again and
   * parks, and a build that changes requirement files without that answer is out of scope.
   */
  takenAmendments(e) { const owner = this.ownerAmendments(e); return this.config.mode === 'provisional' ? this.amendGates(e).filter((g) => g.decided.prototype && !owner.includes(g.tor)).map((g) => g.tor) : []; }
  /**
   * Writes, on the epic's branch, the record that the owner kept a correction a provisional run took (`tor-lifecycle
   * keep`), and commits it. When nothing waits to be kept (the record never named "autopilot (provisional run)" as its approver), nothing is written
   * and the log says so: the project then still lists the correction as not approved, which is the safe side.
   */
  keepCorrection(e, g) {
    const stuck = this.ensureOnBranch(e, 'owner\'s approval');
    const by = g.decided.by ?? 'the owner';
    const r = stuck ? { code: 1, err: stuck, out: '' } : torLifecycle(this.pluginDir, this.clone, 'keep', g.tor, '--by', by, '--via', 'epic-branch');
    if (r.code === 0 && this.dirty()) {
      this.g('add', '-A', 'docs/requirements/changes');
      this.g('commit', '--no-verify', '-q', '-m', `docs(epic-${e.id}): ${by} keeps the correction to ${g.tor}`);
      this.markGate(g.file, (x) => ({ ...x, reask: { ...x.reask, kept: r.out.split('\n').filter(Boolean) } }));
      this.log(`${e.id}: ${by} kept the correction to ${g.tor}; recorded in the project (${r.out.split('\n').filter(Boolean).join(', ')})`);
    } else this.log(`${e.id}: ${by} kept the correction to ${g.tor}, but no record of it could be written in the project (${(r.err || r.out || 'nothing waited to be kept').split('\n')[0]}); the project's status may still list it as not approved`);
  }
  /** The deferrals a provisional run took for this epic. As with amendments, only a provisional run honours them: in a full run the owner is asked. */
  takenDeferrals(e) { return this.config.mode === 'provisional' ? prototypeDeferred(readGates(this.stateDir), e.id) : []; }
  /** The deferrals the owner themself answered "Defer" to, for one of this epic's own requirements: theirs in any run. */
  ownerDeferrals(e, sc) { const anchors = sc ? this.anchorsFor(e, sc) : this.meta(e).anchors; return ownerDeferred(readGates(this.stateDir), e.id).filter((t) => anchors.includes(t)); }
  /** The deferrals that stand for this epic where `sc` (its status file) was read: `owner` (theirs, in any run) and `all` (with what this provisional run took). */
  standingDeferrals(e, sc) { const owner = this.ownerDeferrals(e, sc); return { owner, all: [...new Set([...owner, ...this.takenDeferrals(e)])] }; }
  /** Evidence for deferrals that passed a check: whose each one is. */
  static deferredBy(tors, owner) { const [o, p] = [tors.filter((t) => owner.includes(t)), tors.filter((t) => !owner.includes(t))]; return { ...(o.length ? { deferredWithTheOwnersApproval: o } : {}), ...(p.length ? { deferredInThisPrototypeRun: p } : {}) }; }
  /**
   * The epic's anchors as they stand where `sc` (a parsed status sidecar) was read. They are the
   * launch check's, except after an approved amendment: an amended requirement the sidecar no
   * longer lists is dropped, and one the sidecar lists in its place is added.
   */
  anchorsFor(e, sc) {
    const anchors = this.meta(e).anchors; const amended = this.approvedAmendments(e);
    if (!amended.length) return anchors;
    return [...anchors.filter((t) => !amended.includes(t) || sc.requirements.includes(t)), ...sc.requirements.filter((t) => !anchors.includes(t))];
  }

  /**
   * The approved amendments of this epic, each as `{ was, now, by, date, gate, provisional }`: the requirement replaced
   * and what replaced it, read from the change record on the epic branch (its `successors`). Before any record names
   * one (the build has not written it yet), the requirements the branch's status file lists in its place stand in.
   * Read with git on the branch, so it holds wherever the clone is checked out.
   */
  amendedPairs(e) {
    const approved = this.approvedAmendments(e);
    if (!approved.length) return [];
    const m = this.meta(e); const b = m.branch; const on = !!this.branchTip(b);
    const records = on ? gitRun(this.clone, 'ls-tree', '-r', '--name-only', b, '--', 'docs/requirements/changes').out.split('\n').filter((f) => f.endsWith('.toml')).map((f) => gitShow(this.clone, b, f) ?? '') : [];
    const sidecar = on ? gitShow(this.clone, b, m.sidecar) : null;
    const gained = sidecar ? this.anchorsFor(e, parseSidecar(sidecar)).filter((t) => !m.anchors.includes(t)) : [];
    const gates = this.amendGates(e); const owner = this.ownerAmendments(e);
    return approved.map((was) => {
      let now = null;
      for (const text of records) {
        for (const block of text.split(/^\[\[changes\]\]\s*$/m).slice(1)) {
          if (!new RegExp(`^tor\\s*=\\s*"${was}"`, 'm').test(block)) continue;
          const ids = (block.match(/^successors\s*=\s*\[([^\]]*)\]/m)?.[1] ?? '').match(/TOR-\d{2}-[A-Za-z0-9]{7}/g);
          if (ids?.length) now = ids;
        }
      }
      const provisional = !owner.includes(was); // a person's answer wins over a provisional one for the same requirement
      const g = gates.filter((x) => x.tor === was && !!x.decided?.prototype === provisional).at(-1);
      return { was, now: now ?? gained, by: g?.decided?.by ?? null, date: g?.decided?.date ?? null, gate: g?.file ?? null, provisional };
    });
  }

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
  dirty() { return this.porcelain().length > 0; }
  /** `git status --porcelain` lines, and `git clean -fdq`: on the integration line both leave alone what another branch ignores. */
  porcelain() { return gitRun(this.clone, ...this.branchIgnores(), 'status', '--porcelain').out.split('\n').filter(Boolean); }
  clean() { this.g(...this.branchIgnores(), 'clean', '-fdq'); }
  /**
   * On the integration line, git options that add what the other local branches ignore to its own ignore list. A new
   * project's first epic adds the .gitignore that covers its build output and dependencies: until it merges, the
   * integration line sees those files as untracked, and setting them aside stored 22,386 of them. They stay where they
   * are, as files the integration line will ignore once the work lands. Elsewhere, or with no branch ignoring anything: [].
   */
  branchIgnores() {
    const dev = this.state?.integration ?? detectIntegration(this.clone);
    if (!dev || this.currentBranch() !== dev) return [];
    const heads = gitRun(this.clone, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/heads/').out.split('\n').filter(Boolean).map((l) => l.split(' ')).filter(([name]) => name !== dev);
    const key = heads.map((h) => h.join(' ')).join('\n');
    if (this.ignoreCache?.key === key) return this.ignoreCache.args;
    const lists = heads.map(([, sha]) => gitRun(this.clone, 'show', `${sha}:.gitignore`)).filter((r) => r.code === 0 && r.out.trim()).map((r) => r.out);
    let args = [];
    if (lists.length) {
      // core.excludesFile replaces the user's own global ignore file: it is read and kept first.
      const own = gitRun(this.clone, 'config', '--path', 'core.excludesFile').out.trim() || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'git', 'ignore');
      let mine = ''; try { mine = fs.readFileSync(own, 'utf8'); } catch { /* none */ }
      const file = path.join(this.stateDir, 'branch-ignores');
      fs.mkdirSync(this.stateDir, { recursive: true });
      fs.writeFileSync(file, [mine, ...lists].map((x) => `${x.trimEnd()}\n`).join(''));
      args = ['-c', `core.excludesFile=${file}`];
    }
    this.ignoreCache = { key, args };
    return args;
  }

  /** Commits whatever a parked session left uncommitted on the epic branch. One of the driver's few git writes. */
  wipCommit(e) {
    if (this.currentBranch() !== this.meta(e).branch) return false;
    // A catch-up session stopped mid-merge: a half-settled merge is not work to keep. The branch stays where it was.
    if (gitOk(this.clone, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')) { gitRun(this.clone, 'merge', '--abort'); this.log(`${e.id}: an unfinished merge on ${this.meta(e).branch} was undone at park`); }
    if (!this.dirty()) return false;
    this.g('add', '-A');
    this.g('commit', '--no-verify', '-q', '-m', 'wip(autopilot): uncommitted work at park');
    this.log(`${e.id}: committed uncommitted work on ${this.meta(e).branch} as wip(autopilot)`);
    return true;
  }

  /**
   * Puts the clone on the epic's branch before a session starts, when that branch exists: a session works where it is
   * started, and a resumed one is not told to switch. Uncommitted work comes along, as with any checkout (the clone is
   * clean when an epic starts, so it is this epic's); only when git refuses to carry it is it set aside.
   * Returns null, or the reason the branch could not be checked out. Never throws.
   */
  ensureOnBranch(e, kind) {
    const b = this.meta(e).branch;
    const from = this.currentBranch();
    if (!b || !this.branchTip(b) || from === b) return null;
    let r = gitRun(this.clone, 'checkout', '-q', b);
    if (r.code !== 0 && this.dirty()) {
      if (!this.setAside(`before ${e.id}'s ${kind} session started`)) return `the clone has uncommitted changes on ${from || 'no branch'} that could not be set aside, so ${b} could not be checked out`;
      r = gitRun(this.clone, 'checkout', '-q', b);
    }
    if (r.code !== 0 || this.currentBranch() !== b) return `${b} could not be checked out: ${r.err || `the clone is still on ${this.currentBranch() || 'no branch'}`}`;
    this.log(`${e.id}: checked out ${b} for its ${kind} session (the clone was on ${from || 'no branch'})`);
    return null;
  }

  /**
   * Sets aside whatever is uncommitted in the clone, untracked files included, so that it neither blocks a run nor is
   * lost: one commit under refs/autopilot/leftover/ holds it (a stash commit, kept out of the stash list). Ignored
   * files (dependencies) stay where they are. Returns whether the clone is clean afterwards.
   */
  setAside(why) {
    if (!this.dirty()) return true;
    const ignores = this.branchIgnores();
    const names = (...args) => gitRun(this.clone, ...args).out.split('\n').filter(Boolean);
    const files = [...new Set([...names('diff', '--name-only', 'HEAD'), ...names(...ignores, 'ls-files', '--others', '--exclude-standard')])].sort();
    const branch = this.currentBranch() || 'detached';
    const ref = `refs/autopilot/leftover/${branch}-${Date.now()}`;
    const top = () => gitRun(this.clone, 'rev-parse', '--verify', '--quiet', 'refs/stash').out;
    const before = top(); // a stash a session made itself is never taken for ours
    const stashed = gitRun(this.clone, ...ignores, 'stash', 'push', '-q', '--include-untracked', '-m', `autopilot: set aside ${why}`);
    const sha = stashed.code === 0 ? top() : '';
    if (!sha || sha === before) { this.log(`could not set aside ${files.length} file(s) left uncommitted on ${branch}: ${stashed.err || 'git stash kept nothing'}`); return false; }
    const kept = gitRun(this.clone, 'update-ref', ref, sha);
    if (kept.code !== 0) { this.log(`set aside ${files.length} file(s) left uncommitted on ${branch}, but could not name them ${ref} (${kept.err}); they are kept in the clone's stash list instead`); return !this.dirty(); }
    gitRun(this.clone, 'stash', 'drop', '-q');
    // The names are kept for the first 50 only: the ref holds them all, and state.json stays small.
    const left = { branch, ref, files: files.slice(0, 50), ...(files.length > 50 ? { count: files.length } : {}), why, date: new Date().toISOString() };
    if (this.state) this.state.leftovers = [...(this.state.leftovers ?? []), left]; else this.leftoversAtStart.push(left);
    this.log(`set aside ${files.length} file(s) left uncommitted on ${branch} (${left.files.join(', ')}${files.length > 50 ? ` and ${files.length - 50} more` : ''}); nothing is lost: they are kept at ${ref} (${why})`);
    return !this.dirty();
  }

  /** The clone's stash list, newest first, as commit SHAs. */
  stashList() { return gitRun(this.clone, 'stash', 'list', '--format=%H').out.split('\n').filter(Boolean); }
  /**
   * A session may run `git stash` (to check the base, say). One that never restores what it stashed hides that work
   * from the next session, and a later `git stash drop` would lose it. Each stash the session added (above `before`,
   * the top of the list when it started) is moved to refs/autopilot/leftover/, out of the stash list, and listed.
   */
  keepSessionStashes(e, before, name) {
    const list = this.stashList();
    const at = before ? list.indexOf(before) : -1;
    const added = at < 0 ? list : list.slice(0, at);
    const branch = this.currentBranch() || 'detached';
    for (const [n, sha] of added.entries()) {
      const ref = `refs/autopilot/leftover/${branch}-stash-${Date.now()}-${n + 1}`;
      const kept = gitRun(this.clone, 'update-ref', ref, sha);
      if (kept.code !== 0) { this.log(`${e.id}: ${name} left work in the clone's stash; it could not be named ${ref} (${kept.err}), so it stays in the stash list`); return; }
      if (this.stashList()[0] === sha) gitRun(this.clone, 'stash', 'drop', '-q');
      const names = (...args) => gitRun(this.clone, ...args).out.split('\n').filter(Boolean);
      const files = [...new Set([...names('diff', '--name-only', `${sha}^1`, sha), ...names('ls-tree', '-r', '--name-only', `${sha}^3`)])].sort();
      const left = { branch, ref, files: files.slice(0, 50), ...(files.length > 50 ? { count: files.length } : {}), stash: true, why: `${e.id}'s ${name} put work in a stash and did not restore it`, date: new Date().toISOString() };
      this.state.leftovers = [...(this.state.leftovers ?? []), left];
      this.log(`${e.id}: a session put work in a stash (${files.length} file(s)${files.length ? `: ${left.files.join(', ')}` : ''}) and did not restore it; nothing is lost: kept at ${ref}`);
    }
  }

  /** The content of this epic's gate files, by name: what a session finds before it starts. */
  gateSnapshot(e) { return new Map(this.gateFiles().filter((f) => f.startsWith(`${e.id}-`)).map((f) => [f, read(this.gatePath(f))])); }
  /**
   * Autopilot's own record of a question is written by the referee and by `decide`, never by a session. The referee
   * makes two writes during a session: it marks an existing decided gate `decided.used`, and it writes a new gate with
   * no answer (or, in a provisional run, one answered by PROVISIONAL_BY). Anything else to this epic's gates is put
   * back: a changed or removed file gets its old content, a new one is moved to gates/.tampered/. Returns where each
   * such record now is, relative to the workspace, or [].
   */
  undoGateTampering(e, before) {
    const bad = [];
    const parse = (t) => { try { return JSON.parse(t); } catch { return null; } };
    const plain = (g) => { const { used, ...rest } = g.decided ?? {}; return JSON.stringify({ ...g, decided: g.decided ? rest : g.decided }); };
    for (const [f, was] of before) {
      const p = this.gatePath(f);
      const now = exists(p) ? read(p) : null;
      if (now === was) continue;
      const a = parse(was); const b = now === null ? null : parse(now);
      // The referee spent the owner's answer: `used` added, nothing else changed.
      if (a && b && a.decided && !a.decided.used && b.decided?.used && plain(b) === plain(a)) continue;
      fs.writeFileSync(p, was);
      bad.push(`gates/${f}`);
    }
    const provisional = this.config.mode === 'provisional';
    for (const f of this.gateFiles().filter((x) => x.startsWith(`${e.id}-`) && !before.has(x))) {
      const g = parse(read(this.gatePath(f)));
      if (g && (g.decided === null || (provisional && g.decided?.by === PROVISIONAL_BY && g.decided.prototype))) continue;
      const dir = path.join(this.stateDir, 'gates', '.tampered');
      fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(this.gatePath(f), path.join(dir, `${this.runName}-${f}`));
      bad.push(`gates/.tampered/${this.runName}-${f}`);
    }
    if (bad.length) this.log(`${e.id}: a session changed autopilot's own record of a question (${bad.join(', ')}); it was put back`);
    return bad;
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
    this.clean(); // untracked leftovers of the undone session; ignored files (dependencies) stay
  }

  /**
   * Merge-gate rollback: integration line back to its pre-verify SHA, epic branch back to its recorded tip.
   * `keep`: when the integration tip is a merge whose second parent builds on that tip, the final check's own
   * work (verified lines, Complete, handoff, any fix) is pinned at refs/autopilot/verified/<id>, so a re-check
   * can merge it again without a new final check (issue #35). Returns that commit, or null.
   */
  rollback(e, { keep = false } = {}) {
    const pre = e.preVerify; let kept = null;
    if (keep && this.integrationSha() !== pre.developSha) { // nothing was merged: there is no work of the final check's to keep
      const p2 = gitRun(this.clone, 'rev-parse', '--verify', '--quiet', `${this.state.integration}^2`).out || null;
      if (p2 && gitOk(this.clone, 'merge-base', '--is-ancestor', pre.branchTip, p2)) { kept = p2; this.g('update-ref', verifiedRef(e.id), p2); e.verifiedKept = verifiedRef(e.id); }
    }
    this.resetIntegration(e, pre.developSha);
    if (this.branchTip(pre.branch) !== pre.branchTip) this.g('branch', '-f', pre.branch, pre.branchTip);
    if (kept) this.log(`${e.id}: the final check's work (${kept.slice(0, 9)}) is kept at ${verifiedRef(e.id)}`);
    return kept;
  }

  /**
   * The declared test directories, when none of them holds a committed file on the checked-out
   * line: the project has no tests yet (a new project before its first epic), so a failing test
   * command there says nothing about the code. Null once any test file is committed.
   */
  noTestsYet() {
    const declared = this.config.testDirs?.length ? this.config.testDirs : this.pre?.testDirs?.length ? this.pre.testDirs : readProjectFacts(this.clone).testDirs;
    const dirs = (declared ?? []).map((d) => `${String(d).replace(/\/+$/, '')}/`);
    if (!dirs.length) return null;
    return gitRun(this.clone, 'ls-files', '--', ...dirs).out.trim() ? null : dirs;
  }

  /**
   * The project's test command, run in the clone. `sleptSec`: how long the machine slept while it ran (#41 B10). The
   * monotonic clock does not advance while macOS sleeps and the wall clock does: the difference is time asleep.
   */
  runTests() {
    const started = Date.now(); const mono = performance.now();
    const r = sh(this.config.testCommand, [], { cwd: this.clone, shell: PROJECT_SHELL, timeout: this.config.budgets.testRunMin * 60000, killSignal: 'SIGKILL' });
    const ms = Date.now() - started;
    const text = `${r.out}\n${r.err}`;
    const skips = (text.match(/^(?:#|ℹ)\s*skipped\s+(\d+)/m) ?? [])[1];
    return { pass: r.code === 0 && !r.timedOut, code: r.code, timedOut: r.timedOut, couldNotRun: couldNotRun(r.code), skips: skips === undefined ? null : Number(skips), ms, sleptSec: sleptSec(ms, performance.now() - mono), tail: text.trim().split('\n').slice(-15).join('\n') };
  }

  /**
   * The base check (#41 B6, B10): a red result is run once more before it ends the run, so one flaky test or a check the
   * machine slept through does not cost the night. A command that could not run is not retried: nothing would change.
   */
  baseCheck(e, integration) {
    const first = this.runTests();
    if (first.pass || first.couldNotRun) return { t: first, tries: [first] };
    this.log(`base check: \`${this.config.testCommand}\` failed on ${integration} (exit ${first.code}${first.timedOut ? ', timed out' : ''}${first.sleptSec >= 30 ? `; the machine slept ${Math.max(1, Math.round(first.sleptSec / 60))} min during it` : ''}); running it once more before calling the base red`);
    const t = this.runTests();
    const tries = [first, t].map((x) => ({ pass: x.pass, exit: x.code, timedOut: x.timedOut, ms: x.ms, sleptSec: x.sleptSec }));
    if (t.pass) {
      this.state.baseRetried = [...(this.state.baseRetried ?? []), { before: e.id, tries, tail: first.tail }];
      this.log(`base check passed when run again on ${integration}: a flaky test, or one the machine slept through; going on with ${e.id}`);
      this.event('base-retried', e, { tries });
    } else this.log(`base check failed again on ${integration} (exit ${t.code}${t.timedOut ? ', timed out' : ''})`);
    return { t, tries };
  }

  /** One quality-gate command, run like the tests: in the clone, in a plain shell. Whatever it leaves that git would commit is listed and removed. */
  runGate(command) {
    const started = Date.now();
    const r = sh(command, [], { cwd: this.clone, shell: PROJECT_SHELL, timeout: this.config.budgets.testRunMin * 60000, killSignal: 'SIGKILL' });
    const left = this.porcelain();
    if (left.length) { this.g('reset', '-q', '--hard'); this.clean(); }
    const pass = r.code === 0 && !r.timedOut;
    return { command, pass, code: r.code, timedOut: r.timedOut, couldNotRun: couldNotRun(r.code), ms: Date.now() - started, leftovers: left, ...(pass ? {} : { failing: failingTests(`${r.out}\n${r.err}`), tail: `${r.out}\n${r.err}`.trim().split('\n').slice(-15).join('\n') }) };
  }

  /**
   * A gate that fails is run once more (#40 item 6): one that passes the second time is `flaky` (it may stop an epic now
   * and then), not failed. A command that could not run is not tried again.
   */
  gateTwice(command) {
    const first = this.runGate(command);
    if (first.pass || first.couldNotRun) return { ...first, tries: 1 };
    const second = this.runGate(command);
    return { ...second, tries: 2, ...(second.pass ? { flaky: true, first: { code: first.code, timedOut: first.timedOut, ms: first.ms, failing: first.failing, tail: first.tail } } : {}) };
  }

  // ---- the clone's environment ---------------------------------------------------------------

  /** Makes the private clone if there is none. Returns whether it was made. */
  ensureClone() {
    if (exists(this.clone)) return false;
    const integration = detectIntegration(this.config.project);
    if (!integration) throw new Error(`${this.config.project} is not the root of a git repository with a develop, main or master branch`);
    git(this.config.project, 'clone', '-q', '--no-hardlinks', '--branch', integration, this.config.project, this.clone);
    this.g('remote', 'remove', 'origin');
    this.log(`private clone made at ${this.clone} (${integration}, no origin)`);
    return true;
  }

  /**
   * Gives the clone what git does not carry: the owner's `copy` files (ignored, so never
   * committed) and then the `setup` command (run like the tests: in the clone, outside the
   * sandbox, with network). Run at the start of a run and again whenever the integration line moved.
   */
  prepareEnv() {
    const cfg = this.config;
    const out = { pass: true, step: null, copied: [], problems: [], setup: { ran: false, command: cfg.setup ?? null } };
    out.problems = copyProblems(cfg.project, cfg.copy);
    if (out.problems.length) return { ...out, pass: false, step: 'copy' };
    for (const entry of cfg.copy ?? []) {
      const rel = path.posix.normalize(noSlash(entry.trim()));
      const dst = path.join(this.clone, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.cpSync(path.join(cfg.project, rel), dst, { recursive: true, force: true, verbatimSymlinks: true });
      out.copied.push(rel);
    }
    if (out.copied.length) this.log(`environment: copied ${out.copied.join(', ')} from the project`);
    if (cfg.setup) {
      const started = Date.now();
      const r = sh(cfg.setup, [], { cwd: this.clone, shell: PROJECT_SHELL, timeout: (cfg.budgets.setupMin ?? 20) * 60000, killSignal: 'SIGKILL' });
      out.setup = { ran: true, command: cfg.setup, pass: r.code === 0 && !r.timedOut, code: r.code, timedOut: r.timedOut, couldNotRun: couldNotRun(r.code), ms: Date.now() - started, tail: `${r.out}\n${r.err}`.trim().split('\n').slice(-15).join('\n') };
      this.log(`environment: setup \`${cfg.setup}\` ${out.setup.pass ? 'passed' : `failed (exit ${r.code}${r.timedOut ? ', timed out' : ''})`} in ${Math.round(out.setup.ms / 1000)}s`);
      if (!out.setup.pass) return { ...out, pass: false, step: 'setup' };
    }
    this.envSha = gitRun(this.clone, 'rev-parse', 'HEAD').out;
    return out;
  }

  /**
   * `setup` again on the epic branch when the epic changed a manifest or a lockfile since setup last ran: a new
   * project's first epic creates package.json, which a guarded setup (`if [ -f package.json ]`) skipped on the
   * integration line. The driver's checks and every session after the build then run with what the epic declares.
   * Returns why it failed, or null.
   */
  envForBranch(e) {
    if (!this.config.setup) return null;
    const b = this.meta(e).branch; const tip = this.branchTip(b);
    if (!tip || tip === this.envSha) return null;
    const known = this.envSha && gitOk(this.clone, 'cat-file', '-e', `${this.envSha}^{commit}`);
    // The tree setup last ran on against the tip itself: that tree may be another epic's branch, not an ancestor.
    const changed = gitRun(this.clone, 'diff', '--name-only', known ? this.envSha : this.integrationSha(), tip).out.split('\n').filter((f) => f && (MANIFEST_FILE.test(f) || LOCKFILE.test(f)));
    if (!changed.length) return null;
    if (this.currentBranch() !== b) { if (this.dirty()) return null; this.g('checkout', '-q', b); } // a dirty clone fails the checks on its own
    this.log(`${e.id}: ${b} changed ${changed.join(', ')}: running setup on it`);
    const env = this.prepareEnv();
    // What setup rewrote or left (a lockfile it updated, an egg-info folder) is not the build's: the branch stays as committed.
    const left = this.porcelain();
    if (left.length) { this.g('reset', '-q', '--hard'); this.clean(); this.log(`${e.id}: setup changed ${left.length} file(s) on ${b} (${left.slice(0, 10).map((l) => l.replace(/^[ A-Z?!]{1,2} /, '')).join(', ')}${left.length > 10 ? ', …' : ''}); put back as committed`); }
    if (env.pass) return null;
    if (env.step === 'copy') return `setup failed on ${b}: ${env.problems.join('; ')}`;
    const f = env.setup;
    return `setup failed on ${b} (exit ${f.code}${f.timedOut ? ', timed out' : ''}): ${String(f.tail ?? '').trim().split('\n').at(-1) || 'no output'} — the setup command \`${f.command}\` ran after the epic changed ${changed.join(', ')}`;
  }

  /**
   * Readiness's proof (`driver.mjs prepare`): the clone is made or brought up to date, given its
   * environment, and the project's test command is run in it, in the shell the run will use.
   * Writes only inside the workspace. Whatever setup or the tests leave that git would commit is
   * reported and removed, so the run starts on a clean clone.
   */
  async prepare({ probe = false, gates = [] } = {}) {
    fs.mkdirSync(this.stateDir, { recursive: true });
    this.acquireLock();
    try {
      const made = this.ensureClone();
      const integration = detectIntegration(this.clone);
      const sync = this.syncWithProject(integration);
      if (this.currentBranch() !== integration) this.g('checkout', '-q', integration);
      const env = this.prepareEnv();
      const noTests = env.pass && this.config.testCommand ? this.noTestsYet() : null;
      const tests = env.pass ? { command: this.config.testCommand ?? null, ...(noTests ? { pass: true, skipped: `no test files under ${noTests.join(' ')} on ${integration} yet` } : this.config.testCommand ? this.runTests() : { pass: false, code: null, tail: 'CLAUDE.md has no **Tests:** command' }) } : null;
      const leftovers = this.porcelain();
      if (leftovers.length) { this.g('reset', '-q', '--hard'); this.clean(); }
      const base = env.pass && !!tests?.pass && !leftovers.length;
      // The project's other quality gates (build, lint, type check), tried in the same plain shell once the tests pass.
      // A gate that fails here is a warning, not a refusal: the verifier runs them, and some need what the copy lacks.
      const gateResults = base ? gates.map((g) => String(g).trim()).filter(Boolean).map((command) => this.gateTwice(command)) : [];
      // The probe is worth its few cents only once the plain shell passes: it answers the one question left, the sandbox.
      const probed = probe ? (noTests ? { ran: false, skipped: 'the project has no tests yet for the probe to run' } : base ? await this.probe(integration) : { ran: false, skipped: 'the proof failed before the probe' }) : null;
      const result = {
        ok: base && !(probed?.ran && !probed.pass), at: new Date().toISOString(), clone: this.clone, cloneMade: made, integration, tip: gitRun(this.clone, 'rev-parse', 'HEAD').out, sync: sync.state,
        failed: !env.pass ? env.step : !tests.pass ? 'tests' : leftovers.length ? 'leftovers' : probed?.ran && !probed.pass ? 'probe' : null,
        copied: env.copied, problems: env.problems, setup: env.setup, tests, leftovers, ...(this.leftoversAtStart.length ? { setAside: this.leftoversAtStart } : {}), ...(gates.length ? { gates: gateResults, gatesFailed: gateResults.filter((g) => !g.pass).map((g) => g.command), gatesFlaky: gateResults.filter((g) => g.flaky).map((g) => g.command) } : {}), ...(probed ? { probe: probed } : {}),
        // The latest probe that ran, with what it ran against, kept across later proofs: readiness says whether it still stands.
        lastProbe: probed?.ran ? { at: new Date().toISOString(), pass: probed.pass, exit: probed.exit, against: { testCommand: this.config.testCommand ?? null, setup: this.config.setup ?? null, readOnly: this.config.readOnly ?? [], network: cleanNetwork(this.config.network) } } : tryJson(path.join(this.stateDir, 'prepare.json'))?.lastProbe ?? null,
      };
      writeJson(path.join(this.stateDir, 'prepare.json'), result);
      return result;
    } finally { this.releaseLock(); }
  }

  /**
   * The sandbox probe (`prepare --probe`): one cheap real session, launched exactly as a build is
   * (same settings, same referee, same sandbox and network allow-list), told to run the test
   * command once. The plain-shell proof cannot say whether `dotnet`, `cargo` or `npm` work inside
   * the sandbox; this can, before an epic is spent finding out. Judged from a file the command
   * itself writes, not from what the session says. Costs money, so the skill asks first.
   */
  async probe(integration) {
    const cfg = this.config;
    if (cfg.claudeBin !== 'claude' && !cfg.allowTestDouble) return { ran: false, skipped: `sessions would use a test double (${path.basename(cfg.claudeBin)}), which has no sandbox to probe` };
    const dir = path.join(this.stateDir, 'probe'); const stepDir = path.join(dir, 'probe-1');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(stepDir, { recursive: true });
    const sessionId = randomUUID(); const marker = '.autopilot-probe-exit';
    writeJson(path.join(dir, 'state.json'), { name: 'probe', integration, readOnly: resolveReadOnly(cfg.readOnly), readFiles: namedReads(cfg.project, this.stateDir).files, sandbox: cfg.sandbox === true, queue: [] }); // what the referee reads
    fs.mkdirSync(scratchDir(stepDir), { recursive: true });
    writeJson(path.join(stepDir, 'settings.json'), sessionSettings(cfg, { kind: 'probe', scratch: scratchDir(stepDir) }));
    writeJson(path.join(stepDir, 'step.json'), { name: 'probe-1', kind: 'probe', role: KINDS.probe.role, epic: 'probe', sessionId, startedAt: new Date().toISOString(), startMb: this.cloneMb() });
    const command = `${cfg.testCommand}; echo $? > ${marker}`;
    const ms = Math.min(cfg.budgets.testRunMin * 60000, 900000);
    const prompt = `This is a readiness probe, not a task. Do exactly this and nothing else:\n\n1. With the Bash tool, from the current directory, run this one command exactly as written, with a timeout of ${ms} ms:\n\n   ${command}\n\n2. Whatever happens, do not run it again, do not change it, do not fix anything and do not edit any file.\n3. Reply with the command's exit code and the last 15 lines of its output, or the exact refusal you were given. Then stop.\n`;
    fs.writeFileSync(path.join(stepDir, 'prompt.md'), prompt);
    const cmd = sessionCommand(cfg, { kind: 'probe', epicId: 'probe', workspace: this.stateDir, runDir: dir, stepDir, pluginDir: this.pluginDir, sessionId });
    fs.rmSync(path.join(this.clone, marker), { force: true });
    const s = await hostSession(cmd, prompt, { stepDir, killGraceMs: cfg.timing.killGraceMs });
    const file = path.join(this.clone, marker);
    const exit = exists(file) && /^\d+$/.test(read(file).trim()) ? Number(read(file).trim()) : null;
    if (this.porcelain().length) { this.g('reset', '-q', '--hard'); this.clean(); } // the marker, and whatever the tests wrote
    const hooks = (exists(path.join(stepDir, 'hooks.jsonl')) ? read(path.join(stepDir, 'hooks.jsonl')).split('\n') : []).map(tryParse).filter(Boolean);
    const denials = hooks.filter((h) => h.hook === 'PreToolUse' && h.decision === 'deny').map((h) => `${h.rule}: ${h.reason}`);
    const ran = hooks.filter((h) => h.tool_name === 'Bash' && /^PostToolUse/.test(h.hook ?? '')).at(-1);
    const text = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
    const tail = [text(ran?.error), text(ran?.tool_response), text(s.result?.result), s.spawnError ?? '', s.killed ? `killed: ${s.killed}` : ''].filter(Boolean).join('\n').trim().split('\n').slice(-25).join('\n');
    return {
      ran: true, pass: exit === 0, exit, command: cfg.testCommand, model: cfg.budgets.probe.model, sandbox: cfg.sandbox === true, network: sessionNetwork(cfg), costUsd: s.result?.total_cost_usd ?? 0, wallMs: s.wallMs,
      why: exit === 0 ? null : exit === null ? 'the command did not run to its end in a session (no exit code was written)' : `the command exited ${exit} in a session, although it passed in a plain shell`,
      denials, tail, dir: this.rel(stepDir),
    };
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
      all[e.id] = { run: this.runName, state: e.state, reason: e.reason, branch: this.meta(e).branch, fixRounds: e.fixRounds, verifyFixRounds: e.verifyFixRounds ?? 0, plan: e.plan ?? null, planApprovedBy: e.planApprovedBy ?? null, buildSteps: e.buildSteps ?? [], audits: e.audits ?? [], unproven: e.unproven ?? [], fixBrief: exists(brief) ? read(brief) : null,
        // A provisional run: what it answered for the owner, and what went on without their look, for the run that finishes the epic.
        ...(e.prototype?.length ? { prototype: e.prototype } : {}), ...(e.unobserved?.length ? { unobserved: e.unobserved } : {}), ...(e.unlooked?.prototype ? { unlooked: e.unlooked } : {}), ...(e.skippedLook ? { skippedLook: true } : {}), ...(e.amended?.length ? { amended: e.amended } : {}), ...(e.amendedUnseen?.length ? { amendedUnseen: e.amendedUnseen } : {}), ...(e.catchUpAfter ? { catchUpAfter: e.catchUpAfter } : {}), ...(e.catchUpThen ? { catchUpThen: e.catchUpThen } : {}) };
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
        if (e.resumed) this.markGate(e.resumed.gate, (g) => (g.decided && !g.decided.used ? { ...g, decided: { ...g.decided, used: { run: this.runName, phase: e.resumed.phase, date: new Date().toISOString(), note: (e.answers ?? []).some((a) => a.gate === e.resumed.gate) ? 'the session was told this answer before it started and did not ask again' : 'the question was not asked again' } } } : g));
        if (e.sessions.length || e.resumed || state === 'MERGED') this.record(e);
      } catch (err) { this.log(`${e.id}: could not record the epic for the next run: ${err.message}`); }
    }
    this.log(`${e.id}: ${state} — ${reason}`);
    const type = { MERGED: 'merged', PARKED: 'parked', FAILED: 'failed', BLOCKED: 'blocked' }[state];
    if (type === 'parked') {
      // The question the owner will be asked, when this run wrote one for the epic.
      const name = (e.gates ?? []).at(-1); const g = name ? tryJson(this.gatePath(name)) : null;
      this.event(type, e, { reason, ...(g && !g.decided ? { gate: `gates/${name}`, kind: g.kind ?? null, question: (g.options ?? []).length ? g.question ?? null : null } : {}) });
    } else if (type) this.event(type, e, { reason, ...(type === 'merged' ? { minutes: Math.round((e.wallMs ?? 0) / 60000), costUsd: e.costUsd ?? 0, ...((e.unproven ?? []).some((u) => u.kind !== 'left') ? { unproven: e.unproven.filter((u) => u.kind !== 'left').length } : {}), ...((e.unproven ?? []).some((u) => u.kind === 'left') ? { left: e.unproven.filter((u) => u.kind === 'left').length } : {}), ...((e.deferred ?? []).length ? { deferred: e.deferred.length } : {}) } : {}) });
    return null;
  }
  park(e, reason) {
    try {
      // Off the epic's branch (a session left the clone on the integration line), nothing is committed there: what is
      // uncommitted is set aside instead, so the next session neither finds it nor builds on it.
      if (!this.wipCommit(e) && this.currentBranch() !== this.meta(e).branch && this.dirty()) this.setAside(`when ${e.id} parked off its branch`);
    } catch (err) { this.log(`${e.id}: could not keep uncommitted work: ${err.message}`); }
    return this.finish(e, 'PARKED', reason);
  }
  /**
   * The owner's STOP while the epic was still being planned, with nothing built: its branch is missing or has no
   * commit beyond the integration line, and the clone holds nothing uncommitted. A question would offer two answers
   * that do the same thing, so the epic goes back to the queue with none, and it is planned from the start next
   * time. An empty branch is removed so that plan starts as a first one does. False (ask, as before) otherwise,
   * and for an epic entered on a decided gate.
   */
  requeueUnbuilt(e, during) {
    // Entered on a decided gate: that answer and its record belong to the question, which stays.
    if (e.resumed) return false;
    const branch = this.meta(e).branch; const tip = this.branchTip(branch);
    if (this.dirty() || (tip && this.g('rev-list', '--count', `${this.state.integration}..${branch}`) !== '0')) return false;
    if (tip) {
      if (this.currentBranch() === branch) this.g('checkout', '-q', this.state.integration);
      this.g('branch', '-D', branch);
    }
    e.state = 'QUEUED'; e.step = null; e.reason = null;
    this.save();
    this.log(`${e.id}: stopped by you during ${during}, before anything was built; no question is left, and it starts from the plan next time`);
    return true;
  }
  /**
   * A park that is nobody's question (budget, infra, STOP, an auditor outage) gets a `resume` gate,
   * so the next run continues at `phase` instead of rebuilding the epic.
   */
  parkResumable(e, reason, phase, { technical = false, extra = {} } = {}) {
    this.writeGate(e, {
      kind: 'resume', skillStep: 'autopilot driver', phase, reason, ...(technical ? { technical: true } : {}), ...extra,
      question: `${this.meta(e).label} stopped: ${reason}. Continue it in the next run?`,
      options: [ANSWERS.resume, ANSWERS.startOver],
      why: `nothing was decided for you: the run stopped the epic before ${phase}. "${ANSWERS.resume}" re-enters at ${phase} on the same branch${phase === 'CHECK_BUILD' ? ' (or, when the build session was cut short, a new session continues the build from what is committed there)' : ''}; "${ANSWERS.startOver}" plans it again from scratch`,
      artifacts: e.lastStep ? [this.rel(path.join(this.epicDir(e), e.lastStep))] : [],
    });
    return this.park(e, reason);
  }

  /**
   * Stops every process a session left running out of the clone. Returns what it stopped, as `pid command` lines.
   * AUTOPILOT_SKIP_SWEEP: the test suite's fakes leave nothing behind, and the process scan is slow on Windows; it is
   * honoured only in a run against a test double, so a real run always sweeps.
   */
  async sweep(e, name) {
    if (process.env.AUTOPILOT_SKIP_SWEEP === '1' && this.config.allowTestDouble) return [];
    let left = [];
    try {
      left = strayProcesses(this.clone);
      if (!left.length) return [];
      for (const p of left) { try { process.kill(p.pid, 'SIGTERM'); } catch { /* already gone */ } }
      for (let waited = 0; waited < this.config.timing.killGraceMs && left.some((p) => pidAlive(p.pid)); waited += 100) await sleep(100);
      for (const p of left.filter((x) => pidAlive(x.pid))) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* already gone */ } }
      this.log(`${e.id}: ${name} left ${left.length} process(es) running in the clone; stopped: ${left.map((p) => `${p.pid} ${p.command.slice(0, 120)}`).join(' | ')}`);
    } catch (err) { this.log(`${e.id}: could not check for processes ${name} left behind: ${err.message}`); }
    return left.map((p) => `${p.pid} ${p.command.slice(0, 200)}`);
  }

  /** Adds to what this epic leaves not proven for real (a reviewer's finding, a verifier's own "not run"), once each. */
  unproven(e, items) {
    e.unproven = e.unproven ?? [];
    for (const it of items) if (it.text && !e.unproven.some((x) => x.source === it.source && x.text === it.text)) e.unproven.push(it);
  }

  // ---- one session -----------------------------------------------------------------------------

  /**
   * Launches one host-mode session in its own process group and waits for it.
   * Resolves with how it ended; never throws for a session failure.
   */
  /**
   * A step's model, effort and caps as the settings say now: the owner may change them while a run goes (seen live: Opus
   * asked for the build one minute in). Only `budgets` is taken; what belongs to the run (its mode, the money answer,
   * whether the owner is there, the end time, the queue, the run budget) is never read again. A running session is
   * untouched, and a settings file that does not load keeps the values the run has.
   */
  refreshBudgets() {
    if (!this.loadArgs) return;
    let fresh;
    try { fresh = loadConfig(this.stateDir, this.loadArgs).budgets; } catch (err) { this.log(`settings not read again (the run keeps its step limits): ${err.message}`); return; }
    const old = this.config.budgets;
    const changes = [];
    for (const step of new Set([...Object.keys(old ?? {}), ...Object.keys(fresh ?? {})])) {
      const a = old?.[step]; const b = fresh?.[step];
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const key of ['model', 'effort', 'wallMin', 'usd', 'turns']) if (a[key] !== b[key]) changes.push(`${step} ${key} now ${b[key] ?? 'default'} (was ${a[key] ?? 'default'})`);
      } else if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) changes.push(`${step} now ${JSON.stringify(b ?? null)} (was ${JSON.stringify(a ?? null)})`);
    }
    if (!changes.length) return;
    this.config = { ...this.config, budgets: fresh };
    this.log(`settings changed: ${changes.join('; ')}`);
    this.event('settings-changed', null, { changes });
  }

  async launch(e, kind, prepare, { noResume = false, afterLimit = null } = {}) {
    this.refreshBudgets();
    const cfg = this.config; const k = KINDS[kind];
    const n = (e.attempts[kind] = (e.attempts[kind] ?? 0) + 1);
    const name = `${k.prefix}-${n}`;
    const stepDir = path.join(this.epicDir(e), name);
    fs.mkdirSync(stepDir, { recursive: true });
    const sessionId = randomUUID();
    const prepared = prepare(stepDir) ?? {};
    let prompt = prepared.prompt; const appendFiles = [...(prepared.appendFiles ?? [])];
    // The owner's answers to questions an earlier session of this step asked. The session that was stopped at its
    // question is resumed with them (it keeps what it had worked out); any other session is told them up front.
    const answers = (e.answers ?? []).filter((a) => a.kind === kind);
    const owners = e.resumeSession?.kind === kind ? e.resumeSession : null;
    if (owners) e.resumeSession = null; // one attempt: a second session of this step starts fresh
    // A session the usage limit cut off is resumed once it has reset: it keeps what it had worked out.
    const from = afterLimit && !noResume ? { sessionId: afterLimit.sessionId, step: afterLimit.name, run: this.runName, limit: true } : owners;
    let resume = null; let costBefore = 0;
    if (from?.limit) {
      resume = from.sessionId;
      costBefore = afterLimit.result?.total_cost_usd ?? 0;
      prompt = limitResumeMessage({ branch: this.meta(e).branch });
      fs.writeFileSync(path.join(stepDir, 'resume-prompt.md'), prompt);
    } else if (answers.length && from && !noResume) {
      resume = from.sessionId;
      // A resumed session's result line counts the session it continues as well (seen live: its per-model totals were
      // the two sessions' added up), and that session's cost is already in the books.
      // A session stopped at its question before it reported its cost was booked at an estimate (cost-estimate.json).
      const fromDir = path.join(runDirOf(this.stateDir, from.run), 'epics', e.id, from.step);
      costBefore = (tryJson(path.join(fromDir, 'result.json')) ?? tryJson(path.join(fromDir, 'cost-estimate.json')))?.total_cost_usd ?? 0;
      prompt = resumeMessage(answers, { branch: this.meta(e).branch });
      fs.writeFileSync(path.join(stepDir, 'resume-prompt.md'), prompt);
    } else if (answers.length) {
      const file = path.join(stepDir, 'owner-answers.md');
      fs.writeFileSync(file, ownerAnswersText(answers));
      appendFiles.push(file);
    }
    const scratch = kind === 'audit' ? null : scratchDir(stepDir);
    if (scratch) {
      fs.mkdirSync(scratch, { recursive: true });
      fs.writeFileSync(path.join(stepDir, 'scratch-rule.md'), scratchRule(scratch));
      appendFiles.push(path.join(stepDir, 'scratch-rule.md'));
      fs.writeFileSync(path.join(stepDir, 'connector-rule.md'), CONNECTOR_RULE);
      appendFiles.push(path.join(stepDir, 'connector-rule.md'));
    }
    writeJson(path.join(stepDir, 'settings.json'), sessionSettings(cfg, { kind, scratch }));
    this.ignoreLook();
    const cmd = sessionCommand(cfg, { kind, epicId: e.id, workspace: this.stateDir, runDir: this.runDir, stepDir, pluginDir: this.pluginDir, sessionId, appendFiles, resume, ...(kind === 'audit' && prompt ? { prompt } : {}) });

    // The intended step is on disk before anything is launched (crash-safe resume, §9).
    e.state = k.state; e.lastStep = name;
    e.step = { name, kind, sessionId, pid: null, startedAt: new Date().toISOString() };
    this.save();
    const used = cfg.budgets[kind] ?? (kind === 'catchup' ? cfg.budgets.fix : {});
    this.log(`${e.id}: ${name} starting (${k.role}, ${used.model ?? 'default model'}${effortFor(used) ? `, effort ${effortFor(used)}` : ''}, ${cmd.wallMin} min, session ${sessionId}${resume ? `, resuming session ${resume} (${from.step} of run ${from.run}) ${from.limit ? 'after the usage limit reset' : "with the owner's answer"}` : answers.length ? `, told ${answers.length} answer(s) the owner already gave` : ''})`);
    this.event('step-start', e, { step: name, kind, capMin: cmd.wallMin, model: used.model ?? null, effort: effortFor(used), ...((e.continuing && (kind === 'build' || kind === 'fix')) || resume ? { continuing: true } : {}) });

    const startMb = this.cloneMb();
    const started = Date.now();
    // Read by hook R5 (startMb) and hook R8 (`look`: the owner's recorded look, for wrapup's manual-verification question;
    // `answers`: what the owner already answered for this step, so a reworded question is not put to them twice).
    writeJson(path.join(stepDir, 'step.json'), { name, kind, role: k.role, epic: e.id, sessionId, startedAt: e.step.startedAt, startMb, model: used.model ?? null, effort: effortFor(used), ...(kind === 'verify' && e.look ? { look: e.look } : {}), ...(kind === 'verify' && !e.look && e.unobserved?.length ? { unobserved: e.unobserved } : {}), ...(answers.length ? { answers } : {}), ...(resume ? { resumeOf: { sessionId: resume, step: from.step, run: from.run } } : {}) });
    const isScript = /\.(mjs|cjs|js)$/.test(cmd.bin);
    const child = spawn(isScript ? process.execPath : cmd.bin, isScript ? [cmd.bin, ...cmd.args] : cmd.args, {
      cwd: cmd.cwd, env: childEnv(cmd.env), ...SESSION_SPAWN, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stream = fs.createWriteStream(path.join(stepDir, 'stream.jsonl'));
    const stderr = fs.createWriteStream(path.join(stepDir, 'stderr.log'));
    child.stderr.pipe(stderr);
    child.stdin.on('error', () => {});
    const send = (o) => { if (child.stdin.writable) child.stdin.write((typeof o === 'string' ? o : JSON.stringify(o)) + '\n'); };

    const s = { name, sessionId, stepDir, kind, result: null, rateLimit: null, init: null, controlRequests: [], usage: new Map(), killed: null, exitCode: null, signal: null, spawnError: null, resumed: !!resume };
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
        if (Array.isArray(d)) { s.init = d.find((x) => x?.type === 'system' && x.subtype === 'init') ?? s.init; s.rateLimit = d.findLast((x) => x?.type === 'rate_limit_event')?.rate_limit_info ?? s.rateLimit; d = d.find((x) => x?.type === 'result') ?? {}; }
        if (d.type === 'rate_limit_event') s.rateLimit = d.rate_limit_info ?? null;
        // Kept per message id (the last line wins: usage grows while a message streams), subagents' too: they are billed.
        // Used only when the session never writes its result line (stopped, killed, crashed), to estimate what it spent.
        if (d.type === 'assistant' && d.message?.id && d.message.usage) s.usage.set(d.message.id, { model: d.message.model, usage: d.message.usage });
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
    let sizedAt = Date.now();
    const poll = setInterval(() => {
      if (this.stopRequested()) kill('STOP file');
      else if (this.freeGb() < cfg.diskFloorGb) kill('disk floor');
      else if (Date.now() - sizedAt >= (cfg.timing.sizeEveryMs ?? 30000)) { sizedAt = Date.now(); if (this.cloneMb() - startMb > cfg.growthCapMb) kill('growth cap'); }
    }, cfg.timing.pollMs);
    await done;
    clearTimeout(wall); clearInterval(poll); clearTimeout(graceTimer);
    if (child.pid && killGroup(child.pid, 0)) { killGroup(child.pid, 'SIGKILL'); this.log(`${e.id}: ${name} left processes behind; killed`); }
    // What detached itself from the session (a server started with nohup or its own daemon mode) outlives the group
    // kill. Seen live: a gateway kept its port after the run ended. Anything still working out of the clone is stopped.
    s.strays = await this.sweep(e, name);
    await new Promise((r) => stream.end(r));
    stderr.end();

    s.wallMs = Date.now() - started;
    if (s.result) writeJson(path.join(stepDir, 'result.json'), s.result);
    writeJson(path.join(stepDir, 'effective-setup.json'), { command: [cmd.bin, ...cmd.args], env: cmd.env, settings: path.join(stepDir, 'settings.json'), init: s.init });
    if (s.controlRequests.length) writeJson(path.join(stepDir, 'control-requests.json'), s.controlRequests);

    const sub = s.result?.subtype;
    if (s.killed === 'STOP file') s.outcome = 'stopped';
    // The referee ends a session at its next tool call once STOP exists (rule R1); that arrives as a success line, often before the poll here sees the file.
    else if (!s.killed && kind !== 'plan' && s.result?.terminal_reason === 'hook_stopped' && this.stopRequested()) { s.outcome = 'stopped'; s.stoppedBy = 'STOP file'; }
    else if (s.killed) s.outcome = 'budget';
    else if (sub === 'error_max_turns' || sub === 'error_max_budget_usd') s.outcome = 'budget';
    // The owner's usage limit: an error result that still says `success`. Waited out by `step`, never an infra error.
    else if ((s.limit = usageLimit(s.result, s.rateLimit))) s.outcome = 'limit';
    else if (s.exitCode === 0 && sub === 'success') s.outcome = 'ok';
    else s.outcome = 'infra';
    if (s.limit) {
      s.limit.reached = `your ${s.limit.words ? `${s.limit.words} ` : ''}usage limit was reached`;
      s.limit.why = s.limit.resetsAt ? `${s.limit.reached}; it resets ${clockTime(s.limit.resetsAt * 1000)}` : `${s.limit.reached} (no reset time was given)`;
    }
    const apiError = s.result?.is_error && s.result.api_error ? `${s.result.api_error}${s.result.api_error_status ? ` (${s.result.api_error_status})` : ''}` : null;
    s.why = s.killed ?? s.stoppedBy ?? (s.outcome === 'ok' ? 'success' : s.outcome === 'limit' ? s.limit.why : apiError ?? sub ?? s.spawnError ?? `exit ${s.exitCode ?? s.signal}, no result line`);

    const reported = s.result?.total_cost_usd ?? 0;
    // No result line: the session was stopped before it reported its cost. What its messages used is priced instead.
    // The stream says which messages were this session's; the CLI's transcript has their finished usage (a resumed
    // session's transcript also holds the session it continues, which is why only the stream's ids are taken).
    let est = null;
    if (!s.result && s.usage.size) {
      const final = transcriptUsage(childEnv(cmd.env).CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), sessionId);
      const usage = new Map([...s.usage].map(([id, u]) => [id, final.get(id) ?? u]));
      est = { ...estimateCost(usage), final: [...s.usage.keys()].filter((id) => final.has(id)).length };
      writeJson(path.join(stepDir, 'cost-estimate.json'), { total_cost_usd: est.usd, estimated: true, messages: usage.size, fromTranscript: est.final, tokens: est.tokens, unpriced: est.unpriced });
    }
    const cost = est ? est.usd : resume && reported >= costBefore ? +(reported - costBefore).toFixed(6) : reported;
    this.state.spentUsd = +(this.state.spentUsd + cost).toFixed(4);
    e.costUsd = +(e.costUsd + cost).toFixed(4); e.turns += s.result?.num_turns ?? 0; e.wallMs += s.wallMs;
    e.sessions.push({ name, sessionId, outcome: s.outcome, why: s.why, costUsd: cost, turns: s.result?.num_turns ?? 0, wallMs: s.wallMs, terminalReason: s.result?.terminal_reason ?? null, denials: s.result?.permission_denials?.length ?? 0, ...(est ? { costEstimated: true, tokens: est.tokens, ...(est.unpriced.length ? { unpriced: est.unpriced } : {}) } : {}), ...(resume ? { resumed: from.sessionId, ...(!est && cost !== reported ? { reportedCostUsd: reported } : {}) } : {}) });
    // What this session asked the owner to come for and never got: later sessions of this epic are told not to try it again.
    const gaveUp = unansweredNeeds(path.join(stepDir, 'hooks.jsonl'));
    if (gaveUp.length) { e.unanswered = [...(e.unanswered ?? []), ...gaveUp.map((u) => ({ ...u, step: name }))]; this.log(`${e.id}: ${name} waited for the owner ${gaveUp.length} time(s) and nobody came: ${gaveUp.map((u) => u.description).join('; ')}`); }
    e.step = null;
    this.save();
    this.log(`${e.id}: ${name} ended — ${s.outcome} (${s.why}), $${cost}${est ? ` (estimated from ${s.usage.size} messages${est.final < s.usage.size ? `, ${s.usage.size - est.final} of them without their final output count` : ''}: the session was stopped before it reported its cost${est.unpriced.length ? `; no price known for ${est.unpriced.join(', ')}` : ''})` : ''}, ${Math.round(s.wallMs / 1000)} s`);
    // A session the referee ended at its own question (not a captured plan, not the STOP file) did not finish: it asked.
    const asked = s.outcome === 'ok' && kind !== 'plan' && s.result?.terminal_reason === 'hook_stopped';
    this.event('step-end', e, { step: name, kind, outcome: s.outcome, why: s.why, minutes: +(s.wallMs / 60000).toFixed(1), costUsd: cost, ...(asked ? { asked: true } : {}), ...(est ? { estimated: true } : {}) });
    return s;
  }

  /**
   * Waits until the owner's usage limit has reset (`until`, epoch ms), saying so in the log, the events and
   * the state `status` reads. False when the STOP file ends the wait.
   */
  async waitForLimit(e, s, until) {
    const resets = s.limit.resetsAt ? new Date(s.limit.resetsAt * 1000).toISOString() : null;
    this.state.limitWait = { epic: e.id, step: s.name, until: new Date(until).toISOString(), resets, limit: s.limit.kind };
    this.save();
    this.log(`${e.id}: ${s.name}: ${s.limit.why}; waiting until ${new Date(until).toISOString()} (${clockTime(until)}), then carrying on with the same session`);
    this.event('limit-wait', e, { step: s.name, until: new Date(until).toISOString(), resets, limit: s.limit.kind, words: s.limit.words });
    while (Date.now() < until && !this.stopRequested()) await sleep(Math.max(0, Math.min(1000, until - Date.now())));
    this.state.limitWait = null;
    this.save();
    if (this.stopRequested()) return false;
    this.log(`${e.id}: the usage limit has reset; resuming ${s.name}'s session`);
    this.event('limit-resume', e, { step: s.name });
    return true;
  }

  /**
   * A step: launch, retry once on an infra error, and apply the rules every session shares.
   * Returns the session when it ended `ok` with no new gate; otherwise the epic is already
   * parked (or the run is stopping) and this returns null.
   */
  async step(e, kind, prepare) {
    const gatesBefore = new Set(this.gateFiles());
    const gateRecords = this.gateSnapshot(e);
    const stashBefore = this.stashList()[0] ?? null;
    const devBefore = this.integrationSha();
    const again = { plan: 'PLAN', build: 'CHECK_BUILD', fix: 'CHECK_BUILD', audit: 'AUDIT', verify: 'VERIFY', catchup: 'CATCH_UP' }[kind];
    let s; let afterLimit = null; let limitWaits = 0;
    for (;;) {
      // No session is started anywhere but on the epic's branch, once it exists.
      const off = this.ensureOnBranch(e, kind);
      if (off && s) { s.outcome = 'infra'; s.why = off; break; } // on a retry: parked below, after what the first try did is undone
      // Nothing ran, so nothing is judged: a build or a repair that never started is started, not checked.
      if (off) return this.parkResumable(e, `no ${kind} session was started: ${off}`, { build: 'BUILD', fix: 'FIX_BUILD' }[kind] ?? again, { technical: true });
      // What the epic declares is installed before a session that runs its code (a build installs its own).
      const unset = !s && ['audit', 'verify', 'fix'].includes(kind) ? this.envForBranch(e) : null;
      if (unset) return this.parkResumable(e, unset, { fix: 'FIX_BUILD' }[kind] ?? again, { technical: true });
      s = await this.launch(e, kind, prepare, afterLimit ? { afterLimit } : {});
      afterLimit = null;
      // A stopped session that cannot be resumed (its transcript is gone) is not an infra error: a new session takes the step, told the same answers.
      if (s.resumed && s.outcome === 'infra') {
        this.log(`${e.id}: ${s.name} could not resume the earlier session (${s.why}); starting a new session for this step`);
        s = await this.launch(e, kind, prepare, { noResume: true });
      }
      if (s.outcome === 'limit') {
        const d = limitDecision({ resetsAt: s.limit.resetsAt, endBy: this.config.endBy, waits: limitWaits, timing: this.config.timing });
        if (d.stop) { s.why = `${s.limit.reached}; ${d.stop}`; break; }
        limitWaits += 1;
        if (!(await this.waitForLimit(e, s, d.until))) { s.outcome = 'stopped'; s.why = 'STOP file'; break; }
        afterLimit = s;
        continue;
      }
      if (s.outcome !== 'infra') { this.state.consecutiveInfra = 0; break; }
      this.state.consecutiveInfra = (this.state.consecutiveInfra ?? 0) + 1;
      if (this.state.consecutiveInfra >= 2) { this.stopReason = 'infra'; break; }
      this.log(`${e.id}: infra error (${s.why}); retrying once in ${Math.round(this.config.timing.infraRetryMs / 1000)} s`);
      for (let waited = 0; waited < this.config.timing.infraRetryMs && !this.stopRequested(); waited += 1000) await sleep(Math.min(1000, this.config.timing.infraRetryMs - waited));
      if (this.stopRequested()) { s.outcome = 'stopped'; s.why = 'STOP file'; break; }
    }
    try { this.keepSessionStashes(e, stashBefore, s.name ?? `${kind} session`); } catch (err) { this.log(`${e.id}: could not check the stash list after ${s.name}: ${err.message}`); }
    const tampered = this.undoGateTampering(e, gateRecords);
    // Questions this session asked that a provisional run answered itself (hook R8): recorded, never a park.
    const took = this.gateFiles().filter((f) => !gatesBefore.has(f) && tryJson(this.gatePath(f))?.decided?.prototype);
    if (took.length) this.tookForOwner(e, took);
    this.save();
    const moved = this.integrationSha() !== devBefore;
    const undo = () => { if (kind === 'verify') this.rollback(e); else if (moved) this.resetIntegration(e, devBefore); };
    // A faked record could pass for the owner's answer: the step is undone, and it is the owner's question, never a technical stop.
    if (tampered.length) {
      if (s.outcome === 'stopped') this.stopReason = 'STOP file';
      undo();
      return this.parkResumable(e, `A session changed autopilot's own record of a question (${tampered.join(', ')}); it was put back`, again, { extra: { tampered } });
    }

    // Re-entry after a park that is nobody's question: a parked build is judged from its WIP commit; any other step is run again once.
    if (s.outcome === 'stopped') { this.stopReason = 'STOP file'; undo(); return again === 'PLAN' && this.requeueUnbuilt(e, s.name) ? null : this.parkResumable(e, `stopped by the STOP file during ${s.name}`, again); }
    if (s.outcome === 'infra') { undo(); return this.parkResumable(e, `infra error during ${s.name}: ${s.why}`, again); }
    // Not worth waiting for (a weekly limit, past the end time): nothing else can run either, so the run stops too. Not a
    // technical stop: running again before the reset cannot cure it, so the standing answer does not relaunch it.
    if (s.outcome === 'limit') { this.stopReason = `usage limit: ${s.why}`; undo(); return this.parkResumable(e, `usage limit during ${s.name}: ${s.why}`, again); }
    if (s.outcome === 'budget') { undo(); return this.parkResumable(e, `budget: ${s.name} hit ${s.why}`, again); }
    const newGates = this.gateFiles().filter((f) => !gatesBefore.has(f) && !took.includes(f));
    if (newGates.length) { e.gates.push(...newGates.filter((g) => !e.gates.includes(g))); undo(); return this.park(e, `parked at a human gate (${newGates.join(', ')})`); }
    if (kind !== 'verify' && moved) { undo(); return this.park(e, `${s.name} moved ${this.state.integration}; only a verify session may merge`); }
    return s;
  }

  /**
   * A provisional run answered these questions with the session's own recommendation (gate files hook R8
   * wrote, already decided). Kept on the epic with what the owner needs to review each one afterwards:
   * for an amendment, the requirement as it read on the integration line and what was proposed.
   */
  tookForOwner(e, files) {
    for (const f of files) {
      const g = tryJson(this.gatePath(f)); if (!g || e.gates.includes(f)) continue;
      e.gates.push(f);
      const was = g.kind === 'amendment' && g.tor ? this.requirementText(g.tor) : null;
      const proposed = g.kind === 'amendment' ? (String(g.question ?? '').match(/\bProposed:\s*([\s\S]*?)\s*How to proceed\?\s*$/) ?? [])[1] ?? null : null;
      e.prototype = [...(e.prototype ?? []), { gate: `gates/${f}`, kind: g.kind, tor: g.tor ?? null, answer: g.decided.answer, question: g.question ?? null, session: g.session ?? null, ...(was ? { was } : {}), ...(proposed ? { proposed } : {}) }];
      this.log(`${e.id}: provisional run: answered "${g.decided.answer}" for the owner (${g.kind}${g.tor ? `, ${g.tor}` : ''}; ${f}); it is listed for them at the end`);
      this.event('prototype-answer', e, { kind: g.kind, tor: g.tor ?? null, answer: g.decided.answer });
    }
  }
  /**
   * A deferral merged: the later epic's status file now lists the requirement, but what the driver knows of that
   * epic was read at run start. Every epic not started yet is read again, so its checks hold it to the requirement too.
   */
  handDeferred(e) {
    const reqs = readRequirements(this.clone);
    for (const q of this.state.queue.filter((x) => x.state === 'QUEUED')) {
      const m = this.metaById.get(q.id); if (!m) continue;
      const now = parseSidecar(gitShow(this.clone, this.state.integration, m.sidecar)).requirements;
      const gained = now.filter((t) => !m.anchors.includes(t) && e.deferred.includes(t));
      if (!gained.length) continue;
      m.anchors = [...m.anchors, ...gained];
      for (const tor of gained.filter((t) => /operator-observed/.test(reqs[t]?.text ?? ''))) { m.humanCheck = true; m.reasons = [...m.reasons, `${tor} is operator-observed: parks for a person before verify`]; m.observed = [...(m.observed ?? []), { tor, clauses: thenClauses(reqs[tor].text) }]; }
      this.log(`${q.id}: now also anchors ${gained.join(', ')}, deferred to it by ${e.id}`);
    }
  }
  /**
   * The epic's launch-check facts for a look, after an approved amendment: the operator-observed requirements, their
   * Then lines and the reasons are those of the requirements as they stand on the branch (#41 B16), so the owner is
   * never asked to confirm a requirement they already replaced. Without an amendment, the launch check's own.
   */
  lookMeta(e) {
    const m = this.meta(e);
    if (!this.approvedAmendments(e).length) return m;
    const sidecar = gitShow(this.clone, m.branch, m.sidecar);
    if (!sidecar) return m;
    const anchors = this.anchorsFor(e, parseSidecar(sidecar));
    const text = Object.fromEntries(anchors.map((t) => [t, this.requirementText(t, m.branch) ?? '']));
    const observed = anchors.filter((t) => /operator-observed/.test(text[t])).map((tor) => ({ tor, clauses: thenClauses(text[tor]) }));
    const reasons = [...(m.reasons ?? []).filter((r) => !/ is operator-observed: /.test(r)), ...observed.map((o) => `${o.tor} is operator-observed: parks for a person before verify`)];
    // The look stays when the launch check asked for it for a reason other than an observed requirement (screens).
    return { ...m, anchors, observed, reasons, humanCheck: observed.length > 0 || reasons.some((r) => /UI epic/.test(r)) || (!!m.humanCheck && !(m.observed ?? []).length) };
  }
  /** A requirement's Scenario block as `ref` (the integration line by default) has it, or null. */
  requirementText(tor, ref = this.state.integration) {
    const r = gitRun(this.clone, 'grep', '-h', '-A', '30', '-F', `[${tor}]`, ref, '--', 'docs/requirements');
    if (r.code !== 0) return null;
    const lines = r.out.split('\n'); const out = [];
    for (const [i, l] of lines.entries()) { if (i > 0 && (!l.trim() || /^Scenario:|^--$/.test(l.trim()))) break; out.push(l.trim()); }
    return out.join('\n') || null;
  }

  // ---- phases: each returns the next phase, or null when the epic reached a terminal state -----

  async doPlan(e) {
    const m = this.meta(e);
    const s = await this.step(e, 'plan', (stepDir) => {
      const rules = path.join(stepDir, 'plan-rules.md');
      fs.writeFileSync(rules, PLAN_RULES);
      return { prompt: `/peak-workflow:start-epic ${e.id}`, appendFiles: [rules] };
    });
    if (!s) return null;
    const planFile = path.join(s.stepDir, 'plan.md');
    if (!exists(planFile)) return this.park(e, `${s.name} ended without a captured plan`);
    const lint = lintPlan(read(planFile), m.anchors);
    writeJson(path.join(s.stepDir, 'plan-lint.json'), lint);
    if (!lint.pass) {
      this.writeGate(e, { kind: 'plan-lint', skillStep: 'start-epic Step 4 (plan approval)', reason: `plan lint failed: ${lint.problems.join('; ')}`, question: `The captured plan failed plan lint (${lint.problems.join('; ')}). Approve it as it is, or have it planned again?`, options: [ANSWERS.approvePlan, ANSWERS.replan], why: lint.problems.join('; '), artifacts: [this.rel(planFile)] });
      return this.park(e, `plan lint failed: ${lint.problems.join('; ')}`);
    }
    e.planStep = s.name; e.plan = this.rel(planFile); e.planApprovedBy = 'lint';
    this.log(`${e.id}: plan approved by lint, not by a person (${s.name}/plan.md)`);
    return 'BUILD';
  }

  async doBuild(e, fix) {
    // A session builds on the code as it will land: a branch behind the integration line is brought up to date first,
    // and one that no longer merges cleanly is parked before a session is spent on it.
    const caught = e.caughtUp ?? null;
    const stuck = this.catchUp(e, fix ? 'the repair' : 'the build');
    if (stuck) return stuck.conflicts ? this.parkCatchUp(e, stuck.why, stuck.conflicts, fix ? 'FIX_BUILD' : 'BUILD') : this.parkResumable(e, stuck.why, fix ? 'FIX_BUILD' : 'BUILD');
    if ((e.caughtUp ?? null) !== caught) { e.resumeSession = null; this.save(); } // the branch now holds other epics' work: a session that remembers the old branch is not resumed
    const brief = path.join(this.epicDir(e), 'fix-brief.md');
    const continuing = !!e.continuing; // set by `enter` when this session takes over one that was cut short
    const s = await this.step(e, fix ? 'fix' : 'build', (stepDir) => {
      (e.buildSteps = e.buildSteps ?? []).push({ name: path.basename(stepDir), dir: this.rel(stepDir), ...(continuing ? { continues: e.continuing } : {}) }); // what the next audit reads, in this run or a later one
      fs.writeFileSync(path.join(stepDir, 'prompt.md'), fix ? (continuing ? CONTINUE_LEAD : '') + fixPrompt(this.meta(e), read(brief)) : buildPrompt(read(path.join(this.stateDir, e.plan)), this.pluginDir, { continuing }));
      if (!fix && !continuing && !(e.answers ?? []).length) fs.rmSync(path.join(this.clone, LOOK_DIR), { recursive: true, force: true }); // a build from the top: no other epic's pictures, no stale ones
      fs.writeFileSync(path.join(stepDir, 'build-rules.md'), (fix ? FIX_RULES : BUILD_RULES) + spendRule(this.config.realSpend) + presenceRule(this.config.attended, e.unanswered) + amendmentRule(this.amendedPairs(e)) + (this.hasScreens(e) ? LOOK_RULE : ''));
      return { prompt: read(path.join(stepDir, 'prompt.md')), appendFiles: [path.join(stepDir, 'build-rules.md')] };
    });
    if (s) e.continuing = null; // it ended by itself: what follows is judged like any build
    return s ? 'CHECK_BUILD' : null;
  }

  /** An epic whose screens the owner is shown: the launch check's "UI epic". */
  hasScreens(e) { return (this.meta(e).reasons ?? []).some((r) => /UI epic/.test(r)); }
  /** Where an epic's pictures are kept between sessions and runs, outside the clone. */
  lookStore(e) { return path.join(this.stateDir, 'look', e.id); }
  /**
   * Git in the clone ignores the look folder (the clone's own exclude file, nothing committed):
   * pictures are never in `git status`, never committed by a session, never merged.
   */
  ignoreLook() {
    const file = path.join(this.clone, '.git', 'info', 'exclude');
    let text = ''; try { text = fs.readFileSync(file, 'utf8'); } catch { /* none yet */ }
    if (!text.split('\n').includes(`${LOOK_DIR}/`)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${LOOK_DIR}/\n`); }
  }
  /** Copies the pictures a build left in the clone to the epic's store, replacing what was there. Returns them. */
  collectLook(e) {
    const from = path.join(this.clone, LOOK_DIR); const to = this.lookStore(e);
    if (!exists(from)) return lookPictures(to);
    fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) { const src = path.join(from, f); if (fs.statSync(src).isFile() && fs.statSync(src).size <= 20 * 1024 * 1024) fs.copyFileSync(src, path.join(to, f)); }
    return lookPictures(to);
  }
  /** Puts an epic's stored pictures back in the clone for a session that must see them (another epic may have been built since). */
  restoreLook(e) {
    const from = this.lookStore(e); const to = path.join(this.clone, LOOK_DIR);
    fs.rmSync(to, { recursive: true, force: true });
    if (!exists(from)) return [];
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
    return lookPictures(to);
  }

  /** CHECK_BUILD (§6.5): every check is a file or a command. */
  /**
   * A removal epic's mechanical part of done (wrapup-epic's Removal gate, "No citations left"): no test or source in the
   * checked-out tree still cites a requirement its Change Records retired. The verifier checks the rest (code gone).
   */
  removalCheck(retires) {
    const tors = retiredTors(this.clone, retires);
    if (!tors.length) return { pass: false, evidence: `no retired requirement found in ${retires.join(', ')} (docs/requirements/changes/)` };
    const r = torLifecycle(this.pluginDir, this.clone, 'sweep', ...tors);
    if (r.code !== 0 && r.code !== 1) return { pass: false, evidence: `tor-lifecycle sweep exited ${r.code}: ${(r.err || r.out).split('\n')[0]}` };
    // The referee's own record of why a test changed (`.autopilot/`) names the requirement on purpose: not a citation.
    const hits = r.out.split('\n').filter((l) => l.trim() && !/\t\.autopilot\//.test(l));
    if (!hits.length) return { pass: true, evidence: `${tors.length} retired requirement(s) cited nowhere: ${tors.join(', ')}` };
    return { pass: false, evidence: { stillCited: [...new Set(hits.map((l) => l.split('\t')[0]))], sweep: hits.slice(0, 30) } };
  }

  checkBuild(e) {
    const m = this.meta(e); const dev = this.state.integration; const b = m.branch;
    const checks = []; let parkOnly = null;
    const add = (name, pass, evidence) => { checks.push({ name, pass: !!pass, evidence }); return !!pass; };

    const tip = this.branchTip(b);
    if (!add('branch-and-commit', false, null)) checks.pop();
    if (!tip) add('branch-and-commit', false, `branch ${b} does not exist`);
    else {
      const ahead = Number(this.g('rev-list', '--count', `${dev}..${b}`));
      // The session's own last commit: the driver's commits on top of it (uncommitted work kept at a park, the referee's record) do not count.
      const subjects = this.g('log', '--format=%s', `${dev}..${b}`).split('\n').filter((x) => x && !/^(wip|chore)\(autopilot\)/.test(x));
      const subject = subjects[0] ?? '';
      // The build's own commit is `feat(epic-<id>): …` (after a fix round `fix(…)` is as good). A session may commit
      // again on top of it (seen live: `test(epic-<id>): …` after an amendment): any commit of this epic may be the last.
      const built = subjects.some((x) => new RegExp(`^(feat${e.fixRounds >= 1 || e.verifyFixRounds >= 1 ? '|fix' : ''})\\(epic-${e.id}\\):`).test(x));
      add('branch-and-commit', ahead >= 1 && built && new RegExp(`^[a-z]+\\(epic-${e.id}\\):`).test(subject), { branch: b, tip, commitsAhead: ahead, tipSubject: subject });
    }
    if (!tip) return { pass: false, checks, parkOnly };

    if (this.currentBranch() !== b && !this.dirty()) this.g('checkout', '-q', b);
    // The referee has sessions record why they changed an existing test in `.autopilot/test-changes.jsonl`. A session
    // that commits its work file by file leaves that record behind (seen live: a finished build parked on it). The
    // record is autopilot's own, so the driver commits it; anything else left uncommitted is still the session's failure.
    const left = this.g('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean);
    if (this.currentBranch() === b && left.length && left.every((l) => l.slice(3).startsWith('.autopilot/'))) {
      this.g('add', '--', '.autopilot');
      this.g('commit', '--no-verify', '-q', '-m', 'chore(autopilot): record why existing tests changed');
      this.log(`${e.id}: committed the referee's record (.autopilot/) that the build session left uncommitted`);
    }
    const status = this.g('status', '--porcelain');
    if (!add('clean-tree', status === '' && this.currentBranch() === b, status === '' ? `on ${this.currentBranch()}` : status.split('\n').slice(0, 20))) parkOnly = 'the build left uncommitted work';

    const sc = parseSidecar(gitShow(this.clone, b, m.sidecar));
    const handoffRel = `session-handoffs/epic-${e.id}-implemented.md`;
    add('sidecar', sc.fields.status === 'Implemented' && /^\d{4}-\d{2}-\d{2}/.test(sc.fields.implemented ?? '') && sc.fields.handoff === handoffRel, sc.fields);

    const handoff = gitShow(this.clone, b, `${PLAN_DIR}/${handoffRel}`);
    const count = handoff && /^## Deferrals\b/m.test(handoff) ? (handoff.slice(handoff.search(/^## Deferrals\b/m)).match(/^Count:\s*(\d+)/m) ?? [])[1] : undefined;
    // A provisional run took the builder's recommendation to defer (a decided gate per requirement): that many rows, each
    // naming one of those requirements, are the owner's setting at work. One more is a deferral nobody agreed to.
    const { owner: ownerDefer, all: deferred } = this.standingDeferrals(e, sc);
    const section = deferralsSection(handoff) ?? '';
    const rows = [...new Set(section.match(/TOR-\d{2}-[A-Za-z0-9]{7}/g) ?? [])];
    const deferOk = Number(count) > 0 && Number(count) <= deferred.length && rows.length === Number(count) && rows.every((t) => deferred.includes(t));
    if (!add('handoff', count === '0' || deferOk, handoff === null ? 'handoff file missing on the branch' : count === undefined ? 'no "## Deferrals" section with a Count: line' : `Deferrals Count: ${count}${deferOk ? ` (${rows.join(', ')}: ${[rows.filter((t) => ownerDefer.includes(t)), rows.filter((t) => !ownerDefer.includes(t))].map((x, i) => (x.length ? `${rows.length === x.length ? '' : `${x.join(', ')} `}${i ? "deferred on the builder's recommendation in this provisional run" : "deferred with the owner's approval"}` : null)).filter(Boolean).join('; ')})` : deferred.length ? `; a deferral stands only for ${deferred.join(', ')}, and the rows name ${rows.join(', ') || 'no requirement'}` : ''}`) && Number(count) > 0) parkOnly = parkOnly ?? `the handoff records ${count} deferral(s): a human decision`;
    // The later epics those rows hand the unmet part to: the skill adds the requirement to each one's spec and status file.
    const successors = deferOk ? this.pre.epics.map((x) => x.id).filter((id) => id !== e.id && new RegExp(`(?<![A-Za-z0-9])${id}(?![A-Za-z0-9])`).test(section)) : [];

    const dirs = this.pre.testDirs;
    // An operator-observed requirement is traced by its checklist under tests/manual/ (or tests/hil/),
    // whether or not those are on the Test directories line (wrapup-epic Step 1.2 item 2).
    const observed = new Set(this.lookMeta(e).reasons.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]));
    const amended = this.approvedAmendments(e); const anchors = this.anchorsFor(e, sc);
    const untraced = anchors.filter((tor) => gitRun(this.clone, 'grep', '-l', '-F', tor, b, '--', ...dirs, ...(observed.has(tor) ? ['tests/manual', 'tests/hil'] : [])).code !== 0);
    add('traceability', untraced.length === 0, untraced.length ? { missingFromTests: untraced, testDirs: dirs } : `${anchors.length} anchors found under ${dirs.join(' ')}${amended.length ? ` (after the owner's approved amendment of ${amended.join(', ')})` : ''}`);

    if (status === '' && this.currentBranch() === b) {
      const t = this.runTests();
      const base = this.state.baseSkips;
      // A deferred requirement keeps its test, skipped with the reason `Deferred: <TOR>` (start-epic's rule): those skips, and no others, are allowed.
      const deferSkips = deferOk ? rows.reduce((n, tor) => n + gitRun(this.clone, 'grep', '-h', '-F', `Deferred: ${tor}`, b, '--', ...dirs).out.split('\n').filter((l) => l.trim() && !/^\s*(\/\/|#|\*|\/\*|--)/.test(l)).length, 0) : 0; // the marker in a skip reason, not in a comment beside it
      add('tests-green', t.pass && (t.skips === null || base == null || t.skips <= base + deferSkips), { exit: t.code, timedOut: t.timedOut, skips: t.skips, baseSkips: base ?? null, ...(deferSkips ? { skipsAllowedForDeferrals: deferSkips } : {}), tail: t.pass ? undefined : t.tail });
      if (m.retires?.length) { const r = this.removalCheck(m.retires); add('removal', r.pass, r.evidence); }
    } else add('tests-green', false, 'not run: the working tree is not a clean checkout of the branch');

    const h = this.health(dev);
    add('requirements-health', h.pass, h.evidence);

    const changed = this.g('diff', '--name-only', `${dev}...${b}`).split('\n').filter(Boolean);
    const lockfiles = LOCKFILE;
    const allow = (this.config.scope.allow ?? []).map(globToRegExp);
    const out = [];
    let claudeMd = null;
    for (const f of changed) {
      const otherEpic = f.match(/(?:^|\/)epic-([A-Za-z0-9]{7})[-.]/);
      if (f.startsWith(`${PLAN_DIR}/`) && otherEpic && otherEpic[1] !== e.id) { if (!(successors.includes(otherEpic[1]) && /\/(status|phase-[^/]+)\/epic-[^/]+$/.test(f))) out.push(`${f}: another epic's file`); }
      else if (f.startsWith('docs/requirements/')) { if (!amended.length) out.push(`${f}: requirements are frozen during a run`); } // an amendment the owner approved is theirs, not the session's
      else if (f.startsWith('.claude/')) out.push(`${f}: .claude/ is off limits`);
      else if (f === 'CLAUDE.md') {
        // Every added or removed line after the diff's file header (a changed list item reads `+- …`, so the header is cut by position, not by its look).
        const diff = this.g('diff', '-U0', `${dev}...${b}`, '--', 'CLAUDE.md').split('\n');
        const lines = diff.slice(Math.max(0, diff.findIndex((l) => l.startsWith('@@')))).filter((l) => /^[+-]/.test(l));
        const beyond = lines.filter((l) => !l.includes('**Test directories:**'));
        // The first epic of the plan (the walking skeleton) is the one that settles how the project is set up, run
        // and tested, so it may write that down. The owner is shown the change before anything merges (`humanCheck`).
        if (beyond.length && isSkeleton(this.pre.epics).some((x) => x.id === e.id)) {
          const before = gitRun(this.clone, 'show', `${dev}:CLAUDE.md`).out; const after = gitRun(this.clone, 'show', `${b}:CLAUDE.md`).out;
          const sections = changedSections(before, after);
          // Elsewhere it may only settle a value still to decide (a `TBD` in the Security Baseline, a "Not decided yet" line).
          const outside = sections.filter((x) => !SKELETON_SECTIONS.includes(x) && !settlesUndecided(before, after, x));
          if (outside.length) out.push(`CLAUDE.md: changed in ${outside.join(', ')}; a walking skeleton may change only ${SKELETON_SECTIONS.join(', ')}, and elsewhere only a value still to decide`);
          else claudeMd = { sections, lines: beyond.slice(0, 40), ...(beyond.length > 40 ? { more: beyond.length - 40 } : {}) };
        } else if (beyond.length) out.push('CLAUDE.md: changed beyond the Test directories line (only a walking skeleton may change more: the plan\'s first epic, or one whose spec says **Walking skeleton:** yes)');
      } else if (lockfiles.test(f) && !(this.config.scope.lockfiles ?? []).includes(f) && !changed.some((c) => path.posix.basename(c) === MANIFEST_OF[path.posix.basename(f)])) out.push(`${f}: lockfile changed but no ${MANIFEST_OF[path.posix.basename(f)]} changed with it, and it is not named in config`);
      else if (allow.length && !allow.some((re) => re.test(f))) out.push(`${f}: outside the allowed paths`);
      else if (Number(gitRun(this.clone, 'cat-file', '-s', `${b}:${f}`).out || 0) > 5 * 1024 * 1024) out.push(`${f}: larger than 5 MB`);
    }
    if (out.length === 0 && claudeMd) { if (JSON.stringify(e.claudeMd ?? null) !== JSON.stringify(claudeMd)) this.log(`${e.id}: the build changed CLAUDE.md in ${claudeMd.sections.join(', ')}; the owner is shown it before the final check`); e.claudeMd = claudeMd; } else delete e.claudeMd;
    // Whose amendment it is: the owner's own answer, or one a provisional run took on the session's proposal (nobody approved that one).
    const taken = this.takenAmendments(e);
    const whose = amended.length && amended.every((t) => taken.includes(t)) ? 'the amendment this provisional run took, not yet seen by the owner, of' : "the owner's approved amendment of";
    add('scope', out.length === 0, out.length ? out : `${changed.length} changed paths in scope${amended.length && changed.some((f) => f.startsWith('docs/requirements/')) ? `; requirement files changed under ${whose} ${amended.join(', ')}` : ''}`);
    // An amendment nobody approved says so in the project too, not only in autopilot's own files: its change record
    // names no person. That is what lets the project's status list it for the owner afterwards.
    if (amended.some((t) => taken.includes(t)) && changed.some((f) => f.startsWith('docs/requirements/'))) {
      const honest = changed.filter((f) => f.startsWith('docs/requirements/changes/')).some((f) => UNAPPROVED_BY.some((by) => new RegExp(`^approved_by\\s*=\\s*"${by.replace(/[()]/g, '\\$&')}"\\s*$`, 'im').test(gitShow(this.clone, b, f))));
      add('amendment-record', honest, honest ? 'the change record says no person approved the amendment (approved_by = "autopilot (provisional run)")' : `a provisional run took the amendment of ${amended.filter((t) => taken.includes(t)).join(', ')}: its change record under docs/requirements/changes/ must say approved_by = "autopilot (provisional run)", not a person's name`);
    }
    if (amended.length && changed.some((f) => f.startsWith('docs/requirements/')) && !e.amended) { e.amended = amended; if (amended.some((t) => taken.includes(t))) e.amendedUnseen = amended.filter((t) => taken.includes(t)); this.log(`${e.id}: the build changed requirement files under ${whose} ${amended.join(', ')}`); }

    if (this.hasScreens(e)) {
      const pictures = this.collectLook(e); const captioned = pictures.filter((p) => p.shows);
      e.pictures = pictures.length;
      add('look-pictures', pictures.length >= 1 && captioned.length === pictures.length,
        pictures.length === 0 ? `no pictures in ${LOOK_DIR}/: take a screenshot of every screen and state the requirements name, from the running app, and write ${LOOK_DIR}/index.md with one line per picture (file name — what it shows — the requirement it is evidence for). Do not commit that folder`
          : captioned.length < pictures.length ? { pictures: pictures.length, missingFromIndex: pictures.filter((p) => !p.shows).map((p) => p.file), fix: `${LOOK_DIR}/index.md needs one line per picture: file name — what it shows — the requirement it is evidence for` }
            : `${pictures.length} picture(s) with captions in ${this.rel(this.lookStore(e))}`);
    }

    const reasons = new Map();
    for (const line of (gitShow(this.clone, b, '.autopilot/test-changes.jsonl') ?? '').split('\n')) {
      try { const j = JSON.parse(line); if (j.path && String(j.reason ?? '').trim()) reasons.set(j.path, j.reason); } catch { /* not a JSON line */ }
    }
    const named = this.testNamedDirs([dev, b], dirs);
    const touched = this.g('diff', '--name-status', '--no-renames', `${dev}...${b}`).split('\n').filter(Boolean)
      .map((l) => l.split('\t')).filter(([st, f]) => st !== 'A' && isTestPath(f, dirs, named)).map(([, f]) => f);
    const unexplained = touched.filter((f) => !reasons.has(f));
    add('test-integrity', unexplained.length === 0, { existingTestsChanged: touched.map((f) => ({ path: f, reason: reasons.get(f) ?? null })) });
    e.testChanges = touched.map((f) => ({ path: f, reason: reasons.get(f) ?? null }));

    return { pass: checks.every((c) => c.pass), checks, parkOnly };
  }

  /** `round` says which repair this is: the build's checks and the final check each get one (`fixRounds`, `verifyFixRounds`). */
  writeFixBrief(e, title, lines, round = 'the one fix round before the final check') {
    const m = this.meta(e);
    fs.writeFileSync(path.join(this.epicDir(e), 'fix-brief.md'),
      `# Autopilot fix brief — ${m.label}\n\nThis is ${round}. ${title}\nFix exactly these and nothing else; the same checks run again afterwards.\n\n${lines.join('\n')}\n`);
  }

  doCheckBuild(e, { interrupted = false } = {}) {
    e.state = 'CHECK_BUILD'; this.save();
    const unset = this.envForBranch(e);
    if (unset) return this.parkResumable(e, unset, 'CHECK_BUILD', { technical: true });
    const n = (e.attempts.checkBuild = (e.attempts.checkBuild ?? 0) + 1);
    const r = this.checkBuild(e);
    writeJson(path.join(this.epicDir(e), `check-build-${n}.json`), r);
    e.checks.push({ file: `check-build-${n}.json`, pass: r.pass, failed: r.checks.filter((c) => !c.pass).map((c) => c.name) });
    this.event('check', e, { name: 'build', pass: r.pass, failed: e.checks.at(-1).failed });
    if (r.pass) return 'AUDIT';
    const failed = r.checks.filter((c) => !c.pass);
    const names = failed.map((c) => c.name).join(', ');
    if (interrupted) return this.park(e, `interrupted: the driver was restarted mid-build and CHECK_BUILD does not pass (${names})`);
    if (r.parkOnly) return /deferral/.test(r.parkOnly) ? this.park(e, `CHECK_BUILD: ${r.parkOnly} (failed: ${names})`) : this.parkResumable(e, `CHECK_BUILD: ${r.parkOnly} (failed: ${names})`, 'CHECK_BUILD');
    if (e.fixRounds >= 1) return this.park(e, `CHECK_BUILD still fails after the fix round (${names})`);
    e.fixRounds = 1;
    this.writeFixBrief(e, 'The driver\'s done-ness checks failed after the build session:', failed.map((c) => `- **${c.name}** — ${typeof c.evidence === 'string' ? c.evidence : JSON.stringify(c.evidence)}`));
    this.log(`${e.id}: CHECK_BUILD failed (${names}); starting the one fix round`);
    this.event('fix-round', e, { why: 'checks' });
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
    // A thin review nobody accepted covers nothing: the next audit reads the same work again, whole.
    const counted = e.audits.filter((a) => !a.thin || a.accepted);
    const last = counted.at(-1);
    const audited = new Set(counted.flatMap((a) => a.dirs ?? []));
    const steps = (e.buildSteps ?? []).filter((x) => !audited.has(x.dir)); // may be sessions of an earlier run
    let before = null; // a first try that was thin: the second is told what it left unread
    // The requirements as they stand on the branch: after an approved amendment, the one that replaced the old (#41 B12).
    const sidecar = gitShow(this.clone, m.branch, m.sidecar);
    const anchors = sidecar ? this.anchorsFor(e, parseSidecar(sidecar)) : m.anchors;
    for (;;) {
      let bundle = null; let s;
      try {
        s = await this.step(e, 'audit', (stepDir) => {
          bundle = buildBundle({
            clone: this.clone, pluginDir: this.pluginDir, bundleDir: path.join(stepDir, 'bundle'), epic: { ...m, anchors }, integration: this.state.integration,
            base: last?.tip ?? null, steps: steps.map((x) => ({ name: x.name, dir: path.join(this.stateDir, x.dir) })), amendments: this.amendedPairs(e),
          });
          const files = changedCodeFiles(read(path.join(stepDir, 'bundle', 'diff.patch')));
          return { prompt: `${read(path.join(AUDIT_DIR, 'prompt.md'))}${filesToOpenLine(files)}${before ? `\n${thinAgainLine(before)}\n` : ''}` };
        });
      } catch (err) {
        return this.parkResumable(e, `auditor: the audit could not start (${err.message}); not verified without an audit`, 'AUDIT');
      }
      if (!s) return null;

      const value = auditOutput(s.result);
      const valid = validateAudit(value, anchors);
      if (!valid.ok) {
        writeJson(path.join(s.stepDir, 'audit.json'), { unusable: valid.problems, raw: s.result?.structured_output ?? s.result?.result ?? null });
        // Fail closed (owner decision): nothing is verified without an audit. The `resume` gate lets the next run audit again.
        return this.parkResumable(e, `auditor: ${s.name} returned no usable result (${valid.problems.join('; ')}); not verified without an audit`, 'AUDIT');
      }
      const judged = judgeAudit(value, this.config.audit.parkOn);
      const coverage = reviewCoverage({ stepDir: s.stepDir, clone: this.clone });
      // A finding that parks goes to the owner however much was read; only a review that would pass is held to its coverage.
      // A requirement left for a later epic, or one a person confirms by looking, has no test to name.
      const noTest = new Set([...this.standingDeferrals(e).all, ...(this.lookMeta(e).observed ?? []).map((o) => o.tor)]);
      const thin = judged.parks.length ? null : thinReview({ value, coverage, anchors: anchors.filter((t) => !noTest.has(t)), delta: bundle.delta });
      const file = `${s.name}/audit.json`;
      writeJson(path.join(this.epicDir(e), file), { step: s.name, epic: e.id, branch: m.branch, delta: bundle.delta, base: bundle.base, tip: bundle.tip, parkOn: this.config.audit.parkOn, decision: judged.parks.length ? 'park' : thin ? 'thin' : 'proceed', recommend: judged.recommend, summary: judged.summary, coverage, ...(thin ? { thin } : {}), checked: value.checked, findings: judged.findings });
      e.audits.push({ step: s.name, file, delta: bundle.delta, base: bundle.base, tip: bundle.tip, steps: bundle.steps, dirs: steps.map((x) => x.dir), findings: judged.findings.length, parks: judged.parks.map((f) => f.id), recommend: judged.recommend, coverage: { read: coverage.read, of: coverage.of, seconds: coverage.seconds }, ...(thin ? { thin: true } : {}) });
      e.audit = { step: s.name, file, findings: judged.findings.length, parks: judged.parks.length, recommend: judged.recommend };
      this.save();
      this.log(`${e.id}: ${s.name} — ${judged.findings.length} finding(s), ${judged.parks.length} that park; the auditor recommends ${judged.recommend} (no effect); read ${coverage.read} of ${coverage.of} changed code file(s)${coverage.seconds == null ? '' : ` in ${coverage.seconds} s`}${thin ? ' — a thin review' : ''}`);
      this.event('audit', e, { step: s.name, findings: judged.findings.length, parks: judged.parks.length, read: coverage.read, of: coverage.of, ...(thin ? { thin: true } : {}) });
      // A finding that the work never ran for real is told to the owner whether or not it parks: seen live, a medium
      // one ("the cost path is tested only against a fake built on the same guess") reached them as "none serious".
      this.unproven(e, judged.findings.filter((f) => UNPROVEN_CATEGORIES.includes(f.category)).map((f) => ({ source: 'reviewer', step: s.name, id: f.id, severity: f.severity, text: String(f.explanation ?? '').replace(/\s+/g, ' ').trim() })));

      if (judged.parks.length) {
        const list = judged.parks.map((f) => `${f.id} ${f.category}`).join(', ');
        this.writeGate(e, {
          kind: 'audit', skillStep: 'autopilot AUDIT (before wrapup-epic)', session: s.name, reason: `auditor: ${list} (${s.name})`,
          // What the standing answer reads (`technicalAnswer`): the findings' categories, and whether the one repair is still there.
          categories: [...new Set(judged.parks.map((f) => f.category))], fixRounds: e.fixRounds ?? 0,
          question: `The auditor reported ${judged.parks.length} high finding(s) on ${m.label}: ${judged.parks.map((f) => `${f.id} ${f.category} — ${f.explanation}`).join(' | ')}. Are they real?`,
          options: [ANSWERS.auditReal, ANSWERS.auditNotReal],
          why: `a high finding in a park category (${this.config.audit.parkOn.join(', ')}); the auditor only advises, so a person judges it`,
          artifacts: [this.rel(path.join(this.epicDir(e), file)), this.rel(path.join(s.stepDir, 'bundle', 'diff.patch'))],
          resume: `open a new session in the fetched repo: /peak-workflow:start-epic ${e.id} to fix it, or /peak-workflow:wrapup-epic ${e.id} to verify it as built`,
        });
        return this.park(e, `auditor: ${list} (${s.name})`);
      }
      if (!thin) return this.humanCheck(e) ? null : 'VERIFY';
      if (!before) {
        // A thin review passes nothing on its first try: the reviewer runs once more, told what it left unread (#40 item 16).
        before = { coverage, thin };
        this.event('thin-review', e, { step: s.name, read: coverage.read, of: coverage.of, again: true });
        continue;
      }
      // Still thin: a full run asks the owner; a provisional run goes on and lists it under "Decided for you".
      const words = thinWords(m.label, coverage, thin);
      const gate = {
        kind: 'thin-review', skillStep: 'autopilot AUDIT (before wrapup-epic)', session: s.name, reason: `auditor: ${s.name} was a thin review (read ${coverage.read} of ${coverage.of} changed code files)`,
        read: coverage.read, of: coverage.of, seconds: coverage.seconds, unread: coverage.unread.slice(0, 10), untested: thin.untested,
        question: `${words} Verify it as built, or review again?`,
        options: [ANSWERS.verifyAsBuilt, ANSWERS.reviewAgain],
        why: `the independent review was run twice and both times read too little to vouch for the work (it needs ${thin.need} of ${coverage.of} changed code files and a test named for each requirement); passing it as it is is a person's call`,
        artifacts: [this.rel(path.join(this.epicDir(e), file)), this.rel(path.join(s.stepDir, 'bundle', 'diff.patch'))],
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id} to verify it as built`,
      };
      if (this.config.mode === 'provisional') {
        const date = today();
        const name = this.writeGate(e, { ...gate, decided: { answer: ANSWERS.verifyAsBuilt, by: PROVISIONAL_BY, date, standing: true, prototype: true, run: this.runName, used: { run: this.runName, phase: 'VERIFY', date: new Date().toISOString() } } });
        e.gates = e.gates.filter((x) => x !== name); // `tookForOwner` lists a gate it has not seen on the epic yet
        this.tookForOwner(e, [name]);
        e.audits.at(-1).accepted = PROVISIONAL_BY;
        this.save();
        return this.humanCheck(e) ? null : 'VERIFY';
      }
      this.writeGate(e, gate);
      return this.park(e, `auditor: ${s.name} was a thin review (read ${coverage.read} of ${coverage.of} changed code files)`);
    }
  }

  /**
   * Human-check epics (operator-observed, UI) park before VERIFY with something to look at
   * (guardrail G2). The look is the owner's; the driver only produces the artifact. Returns true
   * when the epic parked.
   */
  humanCheck(e) {
    const m = this.lookMeta(e);
    // An epic with screens comes here even when the launch check said it will not stop (`look: "after"`, a provisional
    // run): its pictures are kept below for the owner to review afterwards.
    if (!m.humanCheck && !e.claudeMd && !(m.reasons ?? []).some((r) => /UI epic/.test(r))) return false;
    // The owner chose to look afterwards ("look": "after"): an epic that parks only because it has screens goes on
    // to the final check, where the verifier judges the pictures. What a person must observe is still theirs alone.
    if (this.config.look === 'after' && !(m.observed ?? []).length && !e.claudeMd) {
      e.unlooked = { pictures: lookPictures(this.lookStore(e)).map((p) => path.join(this.lookStore(e), p.file)) };
      this.log(`${e.id}: not parked for a look ("look": "after"); ${e.unlooked.pictures.length} picture(s) kept for the owner to review afterwards`);
      this.save();
      return false;
    }
    const tip = this.branchTip(m.branch);
    const stands = this.standingLook(e, tip); // the owner already looked at exactly this tip, or at these screens before a repair that changed none
    if (stands) { if (stands.kept && e.look?.kept?.to !== tip) this.log(`${e.id}: the repair changed no screen file (${stands.kept.files.join(', ') || 'no files'}); ${stands.by}'s look at ${String(stands.branchTip).slice(0, 9)} is kept`); e.look = stands; delete e.unobserved; this.save(); return false; }
    e.look = null;
    // A provisional run does not stop for a look. Screens and a changed CLAUDE.md are kept for the owner to review
    // afterwards; what only a person can observe goes to the final check as not observed, and is never recorded as verified.
    if (this.config.mode === 'provisional') {
      const observed = (m.observed ?? []).map((o) => ({ tor: o.tor, clauses: o.clauses }));
      e.skippedLook = true; // carried to a later run: a full run that takes this epic up at the final check asks for the look first
      if (observed.length) e.unobserved = observed; else delete e.unobserved;
      if (this.hasScreens(e) || e.claudeMd) e.unlooked = { pictures: lookPictures(this.lookStore(e)).map((p) => path.join(this.lookStore(e), p.file)), prototype: true, ...(e.claudeMd ? { claudeMd: e.claudeMd } : {}) };
      const what = [observed.length ? `${observed.map((o) => o.tor).join(', ')} will be recorded as not observed` : null, this.hasScreens(e) ? `${e.unlooked.pictures.length} picture(s) kept` : null, e.claudeMd ? `the CLAUDE.md change (${e.claudeMd.sections.join(', ')}) kept` : null].filter(Boolean).join('; ');
      this.log(`${e.id}: not parked for a look (provisional run); ${what}; all of it is listed for the owner at the end`);
      this.event('prototype-skip', e, { unobserved: observed.map((o) => o.tor), pictures: e.unlooked?.pictures.length ?? 0, claudeMd: !!e.claudeMd });
      this.save();
      return false;
    }
    const made = this.produceArtifacts(e);
    this.writeGate(e, {
      kind: 'human-check', skillStep: 'wrapup-epic Step 1.2 item 7',
      // The owner's words; the driver's own reasons ("UI epic: parks for a human look before verify") go in `why`.
      question: `${lookAsk(m.reasons, made.pictures > 0) || (e.claudeMd ? 'This epic changed how the project is set up, run or tested.' : 'This epic needs a person to look.')}${e.claudeMd ? ` It changed the project's instructions file (CLAUDE.md), in: ${e.claudeMd.sections.join(', ')}; every later session follows that file.` : ''} Does what was built look right?`,
      ...(e.claudeMd ? { claudeMd: e.claudeMd } : {}),
      options: [ANSWERS.looksRight, ANSWERS.notRight],
      why: `autopilot never self-approves a look${made.artifacts.length ? '' : ` — and it could not produce anything to look at: ${made.notes.join('; ')}`}${lookReasons(m.reasons).length ? ` (${lookReasons(m.reasons).join('; ')})` : ''}`,
      artifacts: made.artifacts, artifactNotes: made.notes, ...this.lookAids(e, made.artifacts),
      resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
    });
    this.park(e, made.artifacts.length ? 'human check needed before verify' : 'human check needed before verify (nothing could be produced to look at)');
    return true;
  }

  /**
   * The owner's "Looks right" that still holds for `tip`: given on that very tip, or (an epic with
   * screens) given before commits that touch no file a screen is built from (seen live: a repair
   * added a database column and the owner was sent back to the same eighteen screens). Read from
   * this run's `e.look`, else from the epic's latest look gate. Null when a new look is needed.
   */
  standingLook(e, tip) {
    const g = readGates(this.stateDir).filter((x) => x.epic === e.id && x.kind === 'human-check' && !x.void && !x.superseded).at(-1);
    const look = e.look ?? (g?.decided?.answer === ANSWERS.looksRight && g.branchTip ? { gate: g.file, by: g.decided.by, date: g.decided.date, note: g.decided.note ?? null, observations: g.decided.observations ?? [], branchTip: g.branchTip, artifacts: g.artifacts ?? [] } : null);
    if (!look?.branchTip || !tip) return null;
    if (look.branchTip === tip || look.kept?.to === tip) return look;
    if (!this.hasScreens(e) || !gitOk(this.clone, 'merge-base', '--is-ancestor', look.branchTip, tip)) return null;
    // This epic's own commits since the look: the integration line merged in (catch-up) is other epics' work.
    const files = [...new Set(this.g('log', '--first-parent', '--no-merges', '--name-only', '--format=', `${look.branchTip}..${tip}`).split('\n').filter(Boolean))];
    return files.some((f) => SCREEN_FILE.test(f)) ? null : { ...look, kept: { from: look.branchTip, to: tip, files } };
  }

  /**
   * What makes a look easy for someone who is not a developer: the files to open, by full path;
   * the build's checklist, as text; and the requirement's own Then lines to confirm one at a time
   * (`checks`). `skip` leaves out the lines an earlier look already confirmed.
   */
  lookAids(e, artifacts, skip = []) {
    const m = this.lookMeta(e);
    const done = new Set(skip.filter((o) => o.answer === 'yes').map((o) => `${o.tor}\n${o.clause}`));
    const checks = (m.observed ?? []).flatMap((o) => o.clauses.map((clause) => ({ tor: o.tor, clause }))).filter((c) => !done.has(`${c.tor}\n${c.clause}`)).map((c, i) => ({ n: i + 1, ...c }));
    const open = artifacts.filter((a) => !a.startsWith('clone:') && (/\/artifacts\/files\//.test(a) || a.startsWith('look/'))).map((a) => path.join(this.stateDir, a));
    // Each picture with its caption from the build's index, for whoever shows them to the owner.
    const pictures = lookPictures(this.lookStore(e)).map((p) => ({ path: path.join(this.lookStore(e), p.file), shows: p.shows }));
    const checklists = artifacts.filter((a) => a.startsWith('clone:')).map((a) => ({ path: a.slice(6), text: gitShow(this.clone, m.branch, a.slice(6)) ?? '' })).filter((c) => c.text);
    // An operator-observed requirement is seen for real (the checklist says how), never judged from a picture:
    // seen live, the verifier refused a yes given from pictures taken with a stand-in, and the owner was asked twice.
    const live = [...new Set(checks.map((c) => c.tor))].map((tor) => ({ tor, checklist: checklists.find((c) => c.path.includes(tor))?.path ?? null }));
    return { checks, open, checklists, pictures, ...(live.length ? { live } : {}) };
  }

  /**
   * What a person can look at for a human-check gate: the manual test files the build wrote, and
   * the output of the project's run command (`settings.json` `humanCheck["<epic>"]` or
   * `humanCheck["*"]`, else the **Run:** line of CLAUDE.md) with any file it leaves behind.
   */
  produceArtifacts(e) {
    const m = this.lookMeta(e); const b = m.branch; const artifacts = []; const notes = [];
    const manual = this.g('ls-tree', '-r', '--name-only', b, '--', 'tests/manual').split('\n').filter((f) => m.anchors.some((tor) => f.includes(tor)));
    for (const f of manual) artifacts.push(`clone:${f}`);
    // The pictures the build left for this look, kept outside the clone.
    const pictures = this.hasScreens(e) ? lookPictures(this.lookStore(e)) : [];
    for (const p of pictures) artifacts.push(this.rel(path.join(this.lookStore(e), p.file)));
    if (this.hasScreens(e) && !pictures.length) notes.push(`the build left no pictures in ${LOOK_DIR}/`);
    if (!manual.length && !pictures.length) notes.push('the build wrote no tests/manual/<TOR>.md file for this epic');
    const cmd = this.config.humanCheck?.[e.id] ?? this.config.humanCheck?.['*'] ?? readProjectFacts(this.clone).runCommand;
    if (!cmd) { notes.push('CLAUDE.md has no **Run:** command and settings.json names no humanCheck command'); return { artifacts, notes }; }
    if (this.currentBranch() !== b) { if (this.dirty()) { notes.push('the clone has uncommitted changes, so the run command was not run'); return { artifacts, notes }; } this.g('checkout', '-q', b); }
    const dir = path.join(this.epicDir(e), 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    const r = sh(cmd, [], { cwd: this.clone, shell: PROJECT_SHELL, timeout: Math.min(this.config.budgets.testRunMin, 2) * 60000, killSignal: 'SIGKILL' });
    fs.writeFileSync(path.join(dir, 'run-output.txt'), `$ ${cmd}\n(exit ${r.code}${r.timedOut ? ', killed at the time limit' : ''}, on ${b} at ${this.branchTip(b)})\n\n${r.out}\n${r.err ? `\n--- stderr ---\n${r.err}\n` : ''}`);
    artifacts.push(this.rel(path.join(dir, 'run-output.txt')));
    // A run command that fails to start shows nothing of the requirement (seen live: `bun run dev` with no project folder).
    if ((r.code !== 0 && !r.timedOut) || /exited with code [1-9]|\berror:/i.test(`${r.out}
${r.err}`)) notes.push(`the run command (${cmd}) did not start cleanly${r.timedOut ? '' : ` (exit ${r.code})`}, so its output may show nothing of this requirement: with the owner's word, set the command that starts the app for a person with \`driver.mjs configure --project <project> --human-check "<command>"\``);
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
    this.g('checkout', '-q', '-f', b); this.clean();
    return { artifacts, notes, pictures: pictures.length };
  }

  /**
   * Before VERIFY, a branch that is behind the integration line is brought up to date with it (the
   * owner's decision after scenario D). A branch that waited for a person was cut before other
   * epics merged; wrapup-epic refreshes the shared docs on the branch, and from an old copy of
   * them that refresh conflicts at the merge. Caught up first, it is written on top of what the
   * earlier epics left, and the verifier checks the code as it will land. Returns a reason when
   * the two do not merge cleanly, `{why, conflicts}` comes back and the conflict gate is written. Also before a build or repair session
   * on an existing branch (`when`): seen live, a build resumed 13 commits behind changed the same
   * files the other epics had, and only this check before verify found it, after the build.
   */
  catchUp(e, when = 'verify') {
    const m = this.meta(e); const dev = this.state.integration; const b = m.branch;
    if (!this.branchTip(b) || gitOk(this.clone, 'merge-base', '--is-ancestor', dev, b)) return null;
    if (this.currentBranch() !== b) { if (this.dirty()) return { why: `the clone has uncommitted changes, so ${b} could not be brought up to date with ${dev}`, conflicts: null }; this.g('checkout', '-q', b); }
    const from = this.branchTip(b);
    const r = gitRun(this.clone, 'merge', '--no-ff', '--no-edit', '-m', `Merge ${dev} into ${b} (autopilot: catch up before ${when})`, dev);
    if (r.code !== 0) {
      const files = gitRun(this.clone, 'diff', '--name-only', '--diff-filter=U').out.split('\n').filter(Boolean);
      gitRun(this.clone, 'merge', '--abort');
      // A clash is settled by a catch-up session on the conflict gate (`parkCatchUp`, `doCatchUp`), never by starting over.
      return { why: `${b} does not merge cleanly with ${dev} (${files.join(', ') || r.err.split('\n')[0]}): other finished work merged since changed the same lines`, conflicts: files };
    }
    e.caughtUp = { from, to: this.branchTip(b), integration: this.integrationSha() };
    this.log(`${e.id}: ${b} brought up to date with ${dev} before ${when} (${from.slice(0, 9)} → ${e.caughtUp.to.slice(0, 9)})`);
    return null;
  }

  async doVerify(e) {
    const m = this.meta(e);
    // A provisional run skipped this epic's look, and this run is a full one that re-enters here: the look is asked now, as a full run does.
    if (this.config.mode !== 'provisional' && e.skippedLook && !e.look) { delete e.unobserved; delete e.unlooked; if (this.humanCheck(e)) return null; }
    const before = e.caughtUp ?? null;
    const stuck = this.catchUp(e);
    if (stuck) return stuck.conflicts ? this.parkCatchUp(e, stuck.why, stuck.conflicts, 'VERIFY') : this.parkResumable(e, stuck.why, 'VERIFY');
    if ((e.caughtUp ?? null) !== before) e.resumeSession = null; // the branch now holds other epics' work: a session that remembers the old branch is not resumed
    e.preVerify = { developSha: this.integrationSha(), branchTip: this.branchTip(m.branch), branch: m.branch };
    this.save();
    const s = await this.step(e, 'verify', (stepDir) => {
      const rules = path.join(stepDir, 'verify-rules.md');
      const pictures = this.hasScreens(e) ? this.restoreLook(e) : [];
      fs.writeFileSync(rules, verifyRules(smallFixLimits(this.config)) + spendRule(this.config.realSpend) + presenceRule(this.config.attended, e.unanswered) + (pictures.length ? LOOK_VERIFY_RULE : ''));
      if (!e.look && e.unobserved?.length) {
        // A provisional run: nobody looked and nobody will. The verifier is told up front, so it neither asks nor records a PASS.
        const file = path.join(stepDir, 'not-observed.md');
        fs.writeFileSync(file, notObserved(e.unobserved));
        return { prompt: `/peak-workflow:wrapup-epic ${e.id}`, appendFiles: [file, rules] };
      }
      if (!e.look) return { prompt: `/peak-workflow:wrapup-epic ${e.id}`, appendFiles: [rules] };
      // The owner already looked (a decided human-check gate). The verifier gets their recorded
      // observation up front, so wrapup Step 1.2 item 7 records it instead of asking a person who is
      // not there. Seen live: without this the session asks "What do you see?" and parks.
      const file = path.join(stepDir, 'owner-look.md');
      fs.writeFileSync(file, ownerLook(e.look, this.lookMeta(e), e.caughtUp));
      return { prompt: `/peak-workflow:wrapup-epic ${e.id}`, appendFiles: [file, rules] };
    });
    if (!s) return null;
    this.unproven(e, unprovenLines(s.result?.result).map((text) => ({ source: 'verifier', step: s.name, text })));
    // What a final check saw wrong and left: a later final check that says its own list replaces the earlier ones (seen live: a second check repeated the first's lines).
    if (saysLeft(s.result?.result)) e.unproven = (e.unproven ?? []).filter((u) => u.kind !== 'left');
    this.unproven(e, leftLines(s.result?.result).map((text) => ({ source: 'verifier', kind: 'left', step: s.name, text })));
    // What the verifier says it saw in the pictures, in its own words, for the closing screen.
    if (this.hasScreens(e)) { e.seen = pictureLines(s.result?.result); if (e.seen.length) this.log(`${e.id}: the verifier described ${e.seen.length} picture(s)`); }
    this.save();
    if (this.integrationSha() !== e.preVerify.developSha) return 'CHECK_VERIFY';
    // No merge and no gate: the verdict was FAIL (policy answers "Stop — epic FAILs").
    const verdict = (s.result?.result ?? '').trim() || '(the verify session gave no result text)';
    const untouched = this.branchTip(m.branch) === e.preVerify.branchTip;
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
        why: `your recorded look ("${look.note ?? look.gate}") did not settle every part of the requirement; autopilot never fills in an observation. What you already recorded is kept: only what is missing is asked`,
        artifacts: look.artifacts ?? [], verifierReport: this.rel(path.join(s.stepDir, 'result.json')),
        ...this.lookAids(e, look.artifacts ?? [], look.observations ?? []),
        earlier: { note: look.note ?? null, observations: look.observations ?? [], by: look.by, date: look.date, gate: look.gate },
        asks: unsettled.map((u) => `${u.tor}: ${u.reason}`),
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
      });
      return this.park(e, `the owner's recorded look did not settle ${unsettled.map((u) => u.tor).join(', ')}`);
    }
    // Verified but not merged (seen live: the merge into the integration line hit a conflict, the
    // verifier settled it on the branch and stopped). Nothing failed and nothing needs repair: the
    // branch says Complete with every anchor verified. Park it for the owner; never call it FAIL.
    const sc = parseSidecar(gitShow(this.clone, m.branch, m.sidecar));
    if (sc.fields.status === 'Complete' && m.anchors.length > 0 && this.anchorsFor(e, sc).every((t) => sc.verified[t])) {
      const reason = `${s.name} verified every requirement and marked the epic Complete on ${m.branch}, but did not merge it into ${this.state.integration}`;
      this.writeGate(e, {
        kind: 'resume', skillStep: 'wrapup-epic Step 5', phase: 'VERIFY', reason, technical: true,
        question: `${m.label}: ${reason}. Continue it in the next run?`,
        options: [ANSWERS.resume, ANSWERS.startOver],
        why: `nothing failed: the verifier's report is attached. "${ANSWERS.resume}" runs the final check again on the same branch, which then merges it; nothing is rebuilt`,
        artifacts: [this.rel(path.join(s.stepDir, 'result.json'))],
        resume: `in the fetched repo: git checkout ${this.state.integration} && git merge --no-ff ${m.branch}`,
      });
      return this.park(e, reason);
    }
    // Ended without judging anything (seen live: the owner put a sign-in off, the session stopped as
    // told). Nothing failed and no code is wrong: the check is run again later, not repaired now.
    if (untouched && NO_VERDICT.test(verdict) && !/\bverdict\W{0,4}\s*FAIL\b/i.test(verdict)) {
      const reason = `${s.name} ended without a verdict: nothing was recorded or committed`;
      this.writeGate(e, {
        kind: 'resume', skillStep: 'wrapup-epic', phase: 'VERIFY', reason, technical: true,
        question: `${m.label}: the final check ended without a verdict ("${verdict.split('\n')[0].slice(0, 200)}"). Run it again in the next run?`,
        options: [ANSWERS.resume, ANSWERS.startOver],
        why: `nothing failed and nothing is repaired. "${ANSWERS.resume}" runs the final check again on the same branch; nothing is rebuilt${e.look ? ' and your recorded look still stands' : ''}. A check you put off is asked again then. "${ANSWERS.startOver}" plans the epic again from scratch`,
        artifacts: [this.rel(path.join(s.stepDir, 'result.json'))],
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
      });
      return this.park(e, reason);
    }
    // The final check has a repair of its own: one the build's checks spent is not taken from it (seen live: a
    // false alarm in the build check used the round, and the next missing test meant building the epic again).
    if ((e.verifyFixRounds ?? 0) >= 1) {
      // Still not met after its repair: the owner is asked, and the branch and the verifier's report are kept.
      const reason = `${s.name} FAIL after the fix round: ${verdict.split('\n')[0].slice(0, 200)}`;
      this.writeFixBrief(e, 'The independent verifier returned FAIL again, after the repair that followed its first report. Its final report:', [verdict], 'a further repair, which the owner asked for after the final check');
      this.writeGate(e, verifyFailGate(m.label, reason, { artifacts: [this.rel(path.join(s.stepDir, 'result.json'))] }));
      return this.park(e, reason);
    }
    e.verifyFixRounds = 1;
    this.writeFixBrief(e, 'The independent verifier returned FAIL. Its final report:', [verdict], 'the one fix round after the final check');
    this.log(`${e.id}: ${s.name} verdict FAIL; starting the final check's one fix round`);
    this.event('fix-round', e, { why: 'verify' });
    return 'FIX_BUILD';
  }

  /** Operator-observed anchors the verify session reported CANNOT VERIFY, with its reason (from the question policy answered). */
  unsettledLook(e, s) {
    const m = this.meta(e);
    const observed = new Set(this.lookMeta(e).reasons.filter((r) => /operator-observed/.test(r)).map((r) => r.split(' ')[0]));
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
    // present). Unattended, policy answers "Stop — epic FAILs" and a separate session repairs,
    // unless the fix is the standing answer's: a small fix, or the test a requirement lacks.
    // A re-check of the kept work (issue #35) is held to the same rules: its gate's answer approves the fix as a final check's would.
    const recheck = e.resumed?.phase === 'CHECK_VERIFY';
    const ownerFix = (e.resumed?.phase === 'VERIFY' || recheck) && (/^fix now\b/i.test(e.resumed.answer ?? '') || e.resumed.approvesFix) ? e.resumed.gate : null;
    // The verify step whose small fixes are judged: this run's, or (a re-check, no session) the one the gate names.
    const stepDir = e.lastStep ? path.join(this.epicDir(e), e.lastStep) : recheck && e.resumed.verifyStep ? path.join(this.stateDir, e.resumed.verifyStep) : null;
    // Or on the owner's standing answer for small fixes: the referee answered "Fix now" to what the verifier
    // recommended (listed in the step's directory), and the repair is held to the limits here.
    const limits = smallFixLimits(this.config);
    const standing = !ownerFix && limits && stepDir ? tryJson(path.join(stepDir, SMALL_FIX_FILE), []) ?? [] : [];
    const approval = ownerFix ?? (standing.length ? 'the standing answer for small fixes' : null);
    // The gate's own question ("allow that fix?") was never put to the owner: autopilot answered it on the standing answer for
    // technical stops, or they said "Try again". The fix may be product code and any size, but it still may not change a
    // requirement or make a test check less, and it forgives an undisclosed deferral only as a small fix does.
    const autoFix = ownerFix && e.resumed.unasked ? ownerFix : null;
    const asked = autoFix && limits && stepDir ? tryJson(path.join(stepDir, SMALL_FIX_FILE), []) ?? [] : standing;
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
        // A rename is a delete plus an add, so a test moved out of the test directories is judged where it was.
        // A file the epic made and the session deleted is the session's too: the integration line never had it.
        const base = this.g('merge-base', pre.branchTip, pre.developSha);
        const deleted = (f) => !blob(p2, f) && blob(pre.branchTip, f) && !blob(base, f);
        const own = this.g('diff', '--name-only', '--no-renames', `${pre.branchTip}..${p2}`).split('\n').filter((f) => f && (blob(p2, f) !== blob(pre.developSha, f) || deleted(f)));
        const stray = own.filter((f) => !f.startsWith('docs/') && f !== m.sidecar);
        // Held even when the fix touches nothing else (`stray` leaves docs/ out).
        if (autoFix && !stray.length) { const r = own.filter((f) => f.startsWith('docs/requirements/')); if (r.length) problems.push(`${SMALL_FIX_PROBLEM}changes a requirement file (${r.join(', ')})`); }
        if (stray.length && approval) fixedFiles.push(...stray);
        else if (stray.length) problems.push(`commits added during verify touch files outside docs/: ${stray.join(', ')}`);
        if (stray.length && (standing.length || autoFix)) {
          // The standing answer is for small fixes only: a bigger one is the owner's to approve.
          const stat = this.g('diff', '--numstat', '--no-renames', `${pre.branchTip}..${p2}`, '--', ...stray).split('\n').filter(Boolean).map((l) => l.split('\t'));
          const lines = stat.reduce((n, [a, d]) => n + (Number(a) || 0) + (Number(d) || 0), 0);
          // A test may be changed (seen live: a race fixed by waiting before a click), never made to check less:
          // it may not lose more checking lines (assertions, test declarations) than it gains.
          const testDirs = (this.pre?.testDirs?.length ? this.pre.testDirs : this.config.testDirs ?? []).map((dir) => `${String(dir).replace(/\/+$/, '')}/`);
          const named = this.testNamedDirs([pre.developSha, p2], testDirs);
          // Judged as a test: what the referee calls one, and any test-named file outside the listed directories.
          const weak = stat.map(([, , f]) => f).filter((f) => checkedAsTest(f, testDirs, named)).map((f) => ({ f, gone: !blob(p2, f), ...testWeakening(this.g('diff', '-U0', '--no-renames', `${pre.branchTip}..${p2}`, '--', f).split('\n')) }));
          const tests = weak.filter((w) => w.lost && !w.gone).map((w) => w.f); const gone = weak.filter((w) => w.lost && w.gone).map((w) => w.f);
          // An expected output, fixture or snapshot the test compares with: a new one is fine, a rewritten one may hide a failure.
          const expected = stat.map(([, , f]) => f).filter((f) => isExpectedOutput(f, testDirs, named) && blob(pre.branchTip, f));
          const reqs = own.filter((f) => f.startsWith('docs/requirements/'));
          // A fix was "add the test this requirement lacks": anything that is not a test is product code changed by
          // the session that then judges it. With an ordinary small fix beside it the two cannot be told apart, so
          // the owner is asked then too. The referee's own record of a changed test is neither.
          const notTests = standing.some((x) => x.testOnly) ? stray.filter((f) => !f.startsWith('.autopilot/') && !isTestPath(f, testDirs, named)) : [];
          if (notTests.length) problems.push(`${SMALL_FIX_PROBLEM}changes a file that is not a test (${notTests.join(', ')}), where only a missing test was to be added`);
          if (standing.length && stray.length > limits.files) problems.push(`${SMALL_FIX_PROBLEM}changes ${stray.length} files (the limit is ${limits.files}): ${stray.join(', ')}`);
          if (standing.length && lines > limits.lines) problems.push(`${SMALL_FIX_PROBLEM}changes ${lines} lines (the limit is ${limits.lines})`);
          if (tests.length) problems.push(`${SMALL_FIX_PROBLEM}removes checks from a test (${tests.join(', ')})`);
          if (gone.length) problems.push(`${SMALL_FIX_PROBLEM}deletes a test (${gone.join(', ')})`);
          const off = weak.filter((w) => w.off).map((w) => w.f); const loose = weak.filter((w) => w.loosened).map((w) => w.f); const wrapped = weak.filter((w) => w.wrapped).map((w) => w.f);
          if (off.length) problems.push(`${SMALL_FIX_PROBLEM}skips a test, or leaves only one running (${off.join(', ')})`);
          if (loose.length) problems.push(`${SMALL_FIX_PROBLEM}makes a check pass for nearly any value (${loose.join(', ')})`);
          if (wrapped.length) problems.push(`${SMALL_FIX_PROBLEM}puts a check where it never runs (${wrapped.join(', ')})`);
          if (expected.length) problems.push(`${SMALL_FIX_PROBLEM}rewrites an expected result a test compares with (${expected.join(', ')})`);
          if (reqs.length) problems.push(`${SMALL_FIX_PROBLEM}changes a requirement file (${reqs.join(', ')})`);
        }
        if (gitOk(this.clone, 'merge-base', '--is-ancestor', pre.developSha, p2) && this.g('rev-parse', `${dev}^{tree}`) !== this.g('rev-parse', `${p2}^{tree}`)) problems.push('the merge commit itself changes files');
      }
    }
    add('verdict', problems.length === 0, problems.length ? problems : { merge: this.integrationSha(), parents, ...(fixedFiles.length ? { fixedDuringWrapup: fixedFiles, approvedBy: approval } : {}) });

    const sc = parseSidecar(gitShow(this.clone, dev, m.sidecar));
    // A provisional run merges two kinds of requirement without a `verified:` line, and only with the record that says why:
    // one nobody observed (told to the verifier, and an `unverified:` line that says so), and one whose deferral was
    // taken on the builder's recommendation (a decided gate, and the sidecar's `waived:` line naming it).
    const told = new Set((e.unobserved ?? []).map((u) => u.tor));
    const { owner: ownerDefer, all: deferred } = this.standingDeferrals(e, sc);
    const waivedTors = (sc.fields.waived ?? '').split(',').map((x) => (x.match(/TOR-\d{2}-[A-Za-z0-9]{7}/) ?? [])[0]).filter(Boolean);
    const notObservedOk = (t) => told.has(t) && /\bnot observed\b/i.test(sc.unverified[t] ?? '');
    const deferredOk = (t) => deferred.includes(t) && waivedTors.includes(t);
    const anchorsNow = this.anchorsFor(e, sc);
    const unverified = anchorsNow.filter((t) => !sc.verified[t] && !notObservedOk(t) && !deferredOk(t));
    const unobservedNow = anchorsNow.filter((t) => !sc.verified[t] && notObservedOk(t));
    // Nobody looked, so a `verified:` line for such a requirement is a record of something that did not happen.
    const falselyVerified = anchorsNow.filter((t) => told.has(t) && sc.verified[t]);
    add('sidecar-on-integration', sc.fields.status === 'Complete' && /^\d{4}-\d{2}-\d{2}/.test(sc.fields.completed ?? '') && unverified.length === 0 && falselyVerified.length === 0, { status: sc.fields.status ?? null, completed: sc.fields.completed ?? null, anchorsWithoutVerifiedLine: unverified, ...(falselyVerified.length ? { verifiedThoughNobodyObserved: falselyVerified } : {}), ...(unobservedNow.length ? { notObservedInThisPrototypeRun: unobservedNow } : {}), ...(waivedTors.length ? { waived: waivedTors } : {}) });
    // What the status file really says, for the closing screen: observed after all (a `verified:` line) is no longer listed.
    if (e.unobserved) e.unobserved = e.unobserved.map((u) => ({ ...u, recorded: sc.unverified[u.tor] ?? null }));

    // No waivers: parse the Deferrals Count: line; the words always appear, so never grep for them.
    const handoff = gitShow(this.clone, dev, `${PLAN_DIR}/session-handoffs/epic-${e.id}-complete.md`);
    const section = handoff && /^## Deferrals\b/m.test(handoff) ? handoff.slice(handoff.search(/^## Deferrals\b/m)) : null;
    const countLine = section ? (section.match(/^Count:.*$/m) ?? [])[0] : null;
    const numbers = countLine ? countLine.match(/\d+/g) ?? [] : [];
    // A waiver is a deferral agreed at the final check. Only the ones this provisional run took are allowed, and only
    // when the handoff counts exactly those.
    const waivedCount = Number((countLine?.match(/waived:\s*(\d+)/i) ?? [])[1] ?? 0);
    const standingWaived = waivedTors.length > 0 && waivedTors.every((t) => deferred.includes(t)) && waivedCount === waivedTors.length ? waivedCount : 0;
    const waivedLine = 'waived' in sc.fields && !standingWaived;
    // "fixed at wrapup" may be above zero only for an owner-approved Fix now; every other count stays zero.
    const fixed = Number((countLine?.match(/fixed at wrapup:\s*(\d+)/i) ?? [])[1] ?? 0);
    // An undisclosed deferral keeps its mark for good, fixed or not (wrapup-epic Step 1.4b): it is forgiven only as
    // far as fixes cover it — the owner's own "Fix now", or tests added on the standing answer.
    const undisclosed = Number((countLine?.match(/undisclosed:\s*(\d+)/i) ?? [])[1] ?? 0);
    const forgiven = ownerFix && !autoFix ? fixed : Math.min(fixed, asked.filter((x) => x.testOnly).length);
    const others = countLine ? [...countLine.matchAll(/([a-z][a-z ]*):\s*(\d+)/gi)].filter(([, k]) => !/^(fixed at wrapup|undisclosed)$/i.test(k.trim()) && !/^count$/i.test(k.trim()) && !(standingWaived && /^waived$/i.test(k.trim()))).map(([, , n]) => Number(n)) : [];
    const total = Number(numbers[0] ?? NaN) - standingWaived; // the rows that are not deferrals that stand (the owner's, or this provisional run's)
    const countsOk = numbers.length > 0 && others.every((n) => n === 0) && (approval ? total === fixed && undisclosed <= forgiven && ((ownerFix && !autoFix) || fixed <= asked.length) : standingWaived ? total === 0 && fixed === 0 && undisclosed === 0 : numbers.every((x) => Number(x) === 0));
    add('no-waivers', !waivedLine && countsOk, { waivedLineInSidecar: 'waived' in sc.fields, countLine: countLine ?? (handoff === null ? 'complete handoff missing' : 'no Deferrals Count: line'), ...(ownerFix ? { fixedAtWrapupApprovedBy: ownerFix } : {}), ...(standingWaived ? Run.deferredBy(waivedTors, ownerDefer) : {}) });
    if (standingWaived) e.deferred = waivedTors;
    if (fixed > 0 || fixedFiles.length) e.fixedAtWrapup = { count: fixed, files: fixedFiles, approvedBy: approval, ...(autoFix ? { auto: { question: tryJson(this.gatePath(autoFix))?.question ?? null } } : {}), ...(standing.length && !ownerFix ? { standing: standing.map((x) => ({ question: x.question, tor: x.tor ?? null, ...(x.testOnly ? { testOnly: true } : {}) })) } : {}) };

    if (this.currentBranch() !== dev && !this.dirty()) this.g('checkout', '-q', dev);
    if (this.currentBranch() === dev && !this.dirty()) {
      const t = this.runTests();
      add('tests-green-on-integration', t.pass, { exit: t.code, timedOut: t.timedOut, skips: t.skips, tail: t.pass ? undefined : t.tail });
      if (m.retires?.length) { const r = this.removalCheck(m.retires); add('removal-on-integration', r.pass, r.evidence); }
      if (t.pass && t.skips !== null) this.state.baseSkips = t.skips;
    } else add('tests-green-on-integration', false, `not run: the clone is not a clean checkout of ${dev}`);

    const h = this.health(dev);
    add('requirements-health', h.pass, h.evidence);
    return { pass: checks.every((c) => c.pass), checks, ...(ownerFix ? { fixApprovedBy: ownerFix } : {}) };
  }

  doCheckVerify(e) {
    e.state = 'CHECK_VERIFY'; this.save();
    const n = (e.attempts.checkVerify = (e.attempts.checkVerify ?? 0) + 1);
    const r = this.checkVerify(e);
    writeJson(path.join(this.epicDir(e), `check-verify-${n}.json`), r);
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.name);
    e.checks.push({ file: `check-verify-${n}.json`, pass: r.pass, failed });
    this.event('check', e, { name: 'verify', pass: r.pass, failed });
    if (!r.pass) {
      // The merge is undone and the final check's work is kept; every failure asks (issue #35): check the merge
      // again, or run the final check again where its work cannot stand as it is.
      const verifiedTip = this.rollback(e, { keep: true });
      const reason = `merge gate failed (${failed.join(', ')}); ${this.state.integration} rolled back`;
      const verifyStep = e.lastStep ? this.rel(path.join(this.epicDir(e), e.lastStep)) : e.resumed?.verifyStep ?? null;
      const gate = mergeCheckGate(this.meta(e).label, r, smallFixLimits(this.config), { verifiedTip });
      // The fix this final check made on the owner's answer stays allowed when only the merge is checked again.
      if (gate.phase === 'CHECK_VERIFY' && r.fixApprovedBy) gate.approvesFix = true;
      this.writeGate(e, { ...gate, skillStep: 'autopilot driver', reason, artifacts: [this.rel(path.join(this.epicDir(e), `check-verify-${n}.json`))], resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
        ...(gate.phase === 'CHECK_VERIFY' ? { verifiedTip, verifyStep } : {}) });
      return this.finish(e, 'PARKED', reason);
    }
    gitRun(this.clone, 'config', '--remove-section', `branch.${e.preVerify.branch}`); // stale entry left by the sandboxed `git branch -d`
    if (e.deferred?.length) this.handDeferred(e);
    this.noteUnconfirmed(e);
    return this.finish(e, 'MERGED', 'verify PASS, merge gate green');
  }

  /**
   * What the reviewer and the final check said is not proven for real stopped nothing, and until now lived only in
   * this run's files. After the merge each note is written into the epic's status file on the integration line
   * (`tor-lifecycle mark --unconfirmed`, under the requirement it names, else under the epic) and committed, so the
   * project's own status lists it for whoever opens it later. Never fails the epic: a note that cannot be written is logged.
   */
  noteUnconfirmed(e) {
    // Also what a provisional run (or `look: "after"`) merged without the owner's look: the screens, and a changed CLAUDE.md.
    const items = [...(e.unproven ?? []),
      ...(e.unlooked?.pictures?.length ? [{ source: 'autopilot', text: `its screens were merged without a person's look (${e.unlooked.pictures.length} picture(s) were taken; the final check judged them). Open the app and look at each screen this epic built or changed` }] : []),
      ...(e.unlooked?.claudeMd ? [{ source: 'autopilot', text: `it changed the project's instructions file (CLAUDE.md), in ${e.unlooked.claudeMd.sections.join(', ')}, and nobody read the change; every later session follows that file` }] : [])];
    if (!items.length) return;
    try {
      const dev = this.state.integration; const m = this.meta(e);
      if (this.currentBranch() !== dev || this.dirty()) { this.log(`${e.id}: ${items.length} "not proven" note(s) were not written into the project (the clone is ${this.dirty() ? 'not clean' : `on ${this.currentBranch() || 'no branch'}`}); they are in this run's report`); return; }
      const sc = parseSidecar(gitShow(this.clone, dev, m.sidecar));
      const all = this.anchorsFor(e, sc);
      const listed = (t) => (e.unobserved ?? []).some((u) => u.tor === t) || (e.deferred ?? []).includes(t); // those two are listed in their own right
      const who = { reviewer: 'the reviewer', verifier: 'the final check', autopilot: 'autopilot' };
      let wrote = 0;
      for (const u of items) {
        const where = noteSubject(u.text, { anchors: all, listed });
        if (where.skip) continue; // about a look nobody gave or a deferral: already on the list as that
        const about = where.about;
        const r = torLifecycle(this.pluginDir, this.clone, 'mark', e.id, '--unconfirmed', about, `${who[u.source] ?? 'the final check'}: ${String(u.text).replace(/\s+/g, ' ').trim()}`);
        if (r.code === 0) wrote += 1; else this.log(`${e.id}: a "not proven" note could not be written into the project (${(r.err || r.out).split('\n')[0]})`);
      }
      if (!wrote || !this.dirty()) return;
      this.g('add', m.sidecar);
      this.g('commit', '--no-verify', '-q', '-m', `docs(epic-${e.id}): note what a person should still confirm`);
      this.log(`${e.id}: ${wrote} "not proven" note(s) written into ${m.sidecar} on ${dev}, for the project's status to list`);
    } catch (err) { this.log(`${e.id}: the "not proven" notes were not written into the project (${err.message}); they are in this run's report`); }
  }

  /** Parks on the conflict gate (`restartGate`): a technical stop that "Resume" settles with a catch-up session. `then`: the gate whose answer it carries on. */
  parkCatchUp(e, reason, files, phase, then = null) {
    const m = this.meta(e); const old = then ? tryJson(this.gatePath(then)) : null;
    this.writeGate(e, { ...restartGate('conflict', { label: m.label, old: old ? { file: then, ...old } : null, files, branch: m.branch, integration: this.state.integration, phase }), reason });
    return this.park(e, reason);
  }

  /**
   * Brings a branch that no longer merges cleanly up to date with the integration line, before the epic goes on (the
   * conflict gate, handoff Step 3). A clean merge needs no session. Otherwise one catch-up session merges and settles
   * the clashing lines, and the driver judges what it left: the integration line merged in, no conflict markers, a
   * clean tree, no file changed that did not clash, no requirement file of its own making, no test weakened. Anything
   * else is undone (kept under refs/autopilot/rejected/) and the same question parks again: a technical stop, so the
   * standing answer's count stops it looping. It does not use the epic's one fix round. True to go on, null on a park.
   */
  async doCatchUp(e) {
    const m = this.meta(e); const dev = this.state.integration; const b = m.branch;
    const via = e.mergeIn; const after = e.catchUpAfter;
    e.mergeIn = null;
    const caught = e.caughtUp ?? null;
    const stuck = this.catchUp(e, 'it goes on');
    e.catchUpThen = via?.then ?? null; // carried into the next run if this stops before it is done
    const done = () => { if ((e.caughtUp ?? null) !== caught) e.resumeSession = null; Object.assign(e, { catchUpAfter: null, catchUpFrom: null, catchUpThen: null, catchUpConflicts: null }); this.save(); return true; };
    if (!stuck) return done(); // already up to date, or it merged cleanly after all (the other side changed again)
    // A park here is not a repair: the epic's fix round stays as it was before the gate was entered.
    const parked = () => { e.fixRounds = via?.fixRounds ?? e.fixRounds; e.catchUpFrom = null; this.record(e); this.save(); return null; };
    if (!stuck.conflicts) { this.parkResumable(e, stuck.why, 'CATCH_UP'); return parked(); }
    const from = this.branchTip(b);
    Object.assign(e, { catchUpFrom: from, catchUpConflicts: stuck.conflicts }); this.save();
    const s = await this.step(e, 'catchup', (stepDir) => {
      const rules = path.join(stepDir, 'catchup-rules.md');
      fs.writeFileSync(rules, CATCHUP_RULES + presenceRule(this.config.attended, e.unanswered));
      return { prompt: catchUpPrompt({ branch: b, integration: dev, files: stuck.conflicts, testCommand: this.state.testCommand }), appendFiles: [rules] };
    });
    if (!s) return parked();
    const problems = this.catchUpProblems(e, { from, files: stuck.conflicts });
    if (problems.length) {
      if (gitOk(this.clone, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')) gitRun(this.clone, 'merge', '--abort');
      const tip = this.branchTip(b);
      if (tip && tip !== from) { const ref = `refs/autopilot/rejected/${e.id}-catchup-${Date.now()}`; this.g('update-ref', ref, tip); e.catchUpRejected = [...(e.catchUpRejected ?? []), ref]; }
      if (this.currentBranch() !== b) this.g('checkout', '-q', '-f', b);
      this.g('reset', '-q', '--hard', from); this.clean();
      const why = `${s.name} did not bring it up to date: ${problems.join('; ')}`;
      this.log(`${e.id}: ${why}; its work is undone (kept at ${(e.catchUpRejected ?? []).at(-1) ?? 'nothing to keep'}) and ${b} is back at ${from.slice(0, 9)}`);
      this.parkCatchUp(e, why, stuck.conflicts, after ?? 'VERIFY', via?.then ?? null);
      return parked();
    }
    e.caughtUp = { from, to: this.branchTip(b), integration: this.integrationSha(), session: s.name };
    this.log(`${e.id}: ${s.name} brought ${b} up to date with ${dev} (${from.slice(0, 9)} → ${e.caughtUp.to.slice(0, 9)}); the epic goes on at ${after}`);
    return done();
  }

  /** What a catch-up session left that the epic must not go on with. Empty when the branch is up to date and only the clash was settled. */
  catchUpProblems(e, { from, files }) {
    const b = this.meta(e).branch; const dev = this.state.integration; const tip = this.branchTip(b);
    const out = [];
    if (gitOk(this.clone, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')) out.push('the merge was left unfinished');
    else if (this.dirty()) out.push('it left uncommitted changes');
    if (!tip || !gitOk(this.clone, 'merge-base', '--is-ancestor', dev, b)) { out.push(`${dev} is not merged into the branch`); return out; }
    const names = (...args) => gitRun(this.clone, 'diff', '--name-only', ...args).out.split('\n').filter(Boolean);
    const changed = names(from, tip);
    const marked = changed.length ? gitRun(this.clone, 'grep', '-l', '-E', '^(<{7}|>{7})( |$)', tip, '--', ...changed).out.split('\n').filter(Boolean).map((l) => l.replace(`${tip}:`, '')) : [];
    if (marked.length) out.push(`conflict markers are left in ${marked.join(', ')}`);
    // Every file that did not clash must be what git's own merge of the two sides makes of it: nothing dropped from either
    // side (a `merge -s ours` or `-X ours` names no file, so only this sees it), nothing added. Only the clash is the session's.
    const auto = gitRun(this.clone, 'merge-tree', '--write-tree', '--no-messages', dev, from).out.split('\n')[0];
    const differs = /^[0-9a-f]{40,64}$/.test(auto) ? names(auto, tip).filter((x) => !files.includes(x) && x !== '.autopilot/test-changes.jsonl') : null;
    if (!differs) out.push('git could not make its own merge of the two sides to compare with');
    else if (differs.length) out.push(`${differs.join(', ')} ${differs.length === 1 ? 'is' : 'are'} not what the merge of the two sides makes ${differs.length === 1 ? 'it' : 'them'}: only the clashing lines may be settled by hand`);
    // A requirement is the owner's: a clash in one is asked, never settled here.
    const reqs = files.filter((x) => x.startsWith('docs/requirements/'));
    if (reqs.length) out.push(`the requirement file ${reqs.join(', ')} clashed: a requirement is never settled by a catch-up`);
    const dirs = (this.pre?.testDirs ?? []).map((d) => `${String(d).replace(/\/+$/, '')}/`);
    // Everything under a listed directory, as before, and a test-named file anywhere else.
    for (const x of files.filter((y) => checkedAsTest(y, dirs, new Set()))) {
      const weak = [from, dev].map((side) => testWeakening(gitRun(this.clone, 'diff', '-U0', side, tip, '--', x).out.split('\n'))).find((w) => w.lost || w.off || w.loosened || w.wrapped);
      if (weak) out.push(`it weakened the test ${x}`);
    }
    return out;
  }

  async runEpic(e, entry = 'PLAN') {
    let phase = entry;
    // The conflict gate's "Resume": the branch is brought up to date before the epic goes on where the answer says.
    if (e.mergeIn && phase) {
      const stop = this.runStop();
      e.catchUpAfter = phase; this.save();
      if (stop) return this.parkResumable(e, `run stopped (${stop}) before the branch was brought up to date`, 'CATCH_UP');
      if (!(await this.doCatchUp(e))) return null;
    }
    while (phase) {
      const stop = this.runStop();
      if (stop && phase === 'RECHECK') return this.parkRecheck(e, `run stopped (${stop}) before the final check's kept work was merged again`);
      if (stop === 'STOP file' && phase === 'PLAN' && this.requeueUnbuilt(e, 'the wait before its plan')) return null;
      if (stop) return this.parkResumable(e, `run stopped (${stop}) before ${phase}`, phase === 'CHECK_BUILD_INTERRUPTED' ? 'CHECK_BUILD' : phase);
      if (phase === 'PLAN') phase = await this.doPlan(e);
      else if (phase === 'BUILD') phase = await this.doBuild(e, false);
      else if (phase === 'FIX_PLAN' || phase === 'FIX_BUILD') phase = await this.doBuild(e, true); // FIX_PLAN: a state saved by an earlier driver, when a repair was two sessions
      else if (phase === 'CHECK_BUILD') phase = this.doCheckBuild(e);
      else if (phase === 'CHECK_BUILD_INTERRUPTED') phase = this.doCheckBuild(e, { interrupted: true });
      else if (phase === 'AUDIT') phase = await this.doAudit(e);
      else if (phase === 'VERIFY') phase = await this.doVerify(e);
      else if (phase === 'CHECK_VERIFY') phase = this.doCheckVerify(e);
      else if (phase === 'RECHECK') phase = this.remergeVerified(e, readJson(this.gatePath(e.recheck.gate)));
      else throw new Error(`unknown phase ${phase}`);
    }
    return null;
  }

  /**
   * `onPark: "stop"` (the owner is there, or the project says so): an epic that parked or failed ends the
   * run. Which epics are independent of it is the planner's judgement, so nothing more is built until the
   * owner has looked. With the owner away it is "continue" unless the project set it (`loadConfig`).
   */
  stopOnPark(e) {
    if (this.config.onPark !== 'stop' || this.stopReason || !['PARKED', 'FAILED'].includes(e.state)) return;
    this.stopReason = `${e.id} ${e.state === 'PARKED' ? 'parked' : 'failed'} (onPark: stop)`;
    this.state.stoppedOnPark = { epic: e.id, state: e.state, from: this.config.onParkFrom ?? 'default' };
    this.log(`${e.id} ${e.state}: stopping the run (${this.config.onParkFrom === 'project' ? 'the project\'s settings say onPark "stop"' : 'the owner did not say they would be away, so they are there to answer'})`);
  }

  // ---- sync with the project at run start (P3.5 Part 3) ---------------------------------------

  /**
   * Brings the project's integration line into the clone before preflight: a one-off URL fetch (the
   * clone still has no remote), then fast-forward, build on top, or refuse. One of the driver's
   * few git writes in the clone, and only ever a fast-forward.
   */
  syncWithProject(integration) {
    const project = this.config.project;
    if (!this.setAside('before the run started')) throw new Error(`the private clone has uncommitted changes on ${this.currentBranch()} that could not be set aside; a run does not start on a dirty clone`);
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

  /** Live gates of an epic already Complete (finished by hand since it parked) stop counting: nothing is asked or resumed for it. */
  retireCompleteGates() {
    const done = new Set(this.pre.epics.filter((p) => p.eligibility === 'complete').map((p) => p.id));
    const stale = readGates(this.stateDir).filter((g) => gateLive(g) && done.has(g.epic));
    if (!stale.length) return;
    for (const g of stale) { this.markGate(g.file, { cleared: { why: CLEARED_COMPLETE, run: this.runName, date: new Date().toISOString() } }); this.gates.delete(g.epic); delete this.state.gateFacts?.[g.epic]; }
    this.log(`gates: ${stale.length} gate(s) no longer count, their epic is Complete (${[...new Set(stale.map((g) => g.epic))].join(', ')})`);
  }
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
   * A re-check of a failed merge check (issue #35): the final check's kept work (`g.verifiedTip`) is merged
   * again, --no-ff, onto the integration line as it now is, and CHECK_VERIFY judges that merge. No session runs.
   * Work that is gone, no longer builds on the branch, or no longer merges parks with a gate to run the final
   * check again: nothing is merged that the checks have not judged, and nothing is started over unasked.
   */
  /** A stop before a re-check: the same question again, so the kept work is still merged and checked next time. */
  parkRecheck(e, reason) {
    const g = readJson(this.gatePath(e.recheck.gate));
    const keep = ['kind', 'skillStep', 'phase', 'technical', 'approvesFix', 'options', 'question', 'why', 'artifacts', 'resume', 'verifiedTip', 'verifyStep'];
    this.writeGate(e, { ...Object.fromEntries(keep.filter((k) => k in g).map((k) => [k, g[k]])), reason });
    return this.finish(e, 'PARKED', reason);
  }

  remergeVerified(e, g) {
    const m = this.meta(e); const dev = this.state.integration; const tip = g.verifiedTip ?? null;
    const toVerify = (why) => {
      const reason = `the final check's kept work could not be merged again: ${why}`;
      this.writeGate(e, {
        kind: 'resume', skillStep: 'autopilot driver', phase: 'VERIFY', technical: true, reason,
        question: `${m.label}: the final check passed earlier, but its work could not be merged again (${why}). Run the final check again?`,
        options: [ANSWERS.resume, ANSWERS.startOver],
        why: `nothing is merged that was not checked. "${ANSWERS.resume}" runs the final check again on the same branch; nothing is rebuilt. "${ANSWERS.startOver}" plans the epic again from scratch`,
        artifacts: g.artifacts ?? [], resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}`,
      });
      return this.finish(e, 'PARKED', reason);
    };
    if (!tip || !gitOk(this.clone, 'cat-file', '-e', `${tip}^{commit}`)) return toVerify('it is no longer in the private clone');
    if (!gitOk(this.clone, 'merge-base', '--is-ancestor', g.branchTip, tip)) return toVerify(`it does not build on ${m.branch} as the branch now is`);
    if (gitOk(this.clone, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD')) gitRun(this.clone, 'merge', '--abort');
    this.g('checkout', '-q', '-f', dev);
    this.clean();
    // Saved first: a driver killed from here re-enters CHECK_VERIFY (`recover`), which judges or undoes whatever is on the line.
    e.preVerify = { developSha: this.integrationSha(), branchTip: g.branchTip, branch: m.branch };
    e.state = 'CHECK_VERIFY'; this.save();
    const r = gitRun(this.clone, 'merge', '--no-ff', '-q', '-m', `Merge branch '${m.branch}' into ${dev}`, tip);
    if (r.code !== 0) {
      if (gitOk(this.clone, 'rev-parse', '--verify', '--quiet', 'MERGE_HEAD')) gitRun(this.clone, 'merge', '--abort');
      this.g('reset', '-q', '--hard', e.preVerify.developSha);
      this.clean();
      e.preVerify = null;
      return toVerify(`it conflicts with ${dev} as it now is`);
    }
    this.log(`${e.id}: the final check's kept work (${tip.slice(0, 9)}) merged again onto ${dev} (${e.preVerify.developSha.slice(0, 9)}); checking that merge, no final check is run`);
    return this.doCheckVerify(e);
  }

  /**
   * The phase an epic starts at in this run: `PLAN` from scratch, or the phase the owner's decided
   * gate names (the Part 2 table), on the branch the earlier run left. Returns null when the epic
   * already reached a terminal state here.
   */
  enter(e) {
    const m = this.meta(e); let f = this.gates.get(e.id);
    const now = () => new Date().toISOString();
    if (f?.state === 'resume') {
      let g = { file: f.gate, ...readJson(this.gatePath(f.gate)) }; const rec = this.records()[e.id] ?? {};
      if (bringsUpToDate(g)) {
        // The conflict gate (`restartGate`), or a catch-up session that stopped (a question, a budget, STOP): the branch
        // is brought up to date first (`runEpic` → `doCatchUp`), then the epic goes on with the answer it carries
        // (`then`), entered exactly as that answer would have been; without one, at the phase it was brought up to date for.
        this.markGate(f.gate, (x) => ({ ...x, decided: { ...x.decided, used: { run: this.runName, phase: 'CATCH_UP', date: now() } } }));
        const thenFile = g.mergeIn ? g.then ?? null : rec.catchUpThen ?? null;
        e.mergeIn = { gate: f.gate, then: thenFile, fixRounds: rec.fixRounds ?? 0 };
        const old = thenFile ? tryJson(this.gatePath(thenFile)) : null;
        const carried = old?.decided?.answer && !old.void && !old.superseded && !old.cleared ? gateEntry(old) : null;
        if (!(carried && !carried.fresh) && !g.mergeIn) f = { ...f, entry: { phase: rec.catchUpAfter ?? 'VERIFY' } };
        if (carried && !carried.fresh) { f = { ...f, gate: thenFile, kind: old.kind, answer: old.decided.answer, by: old.decided.by, entry: carried }; g = { file: thenFile, ...old }; this.markGate(thenFile, (x) => { const { restarted, ...rest } = x; return { ...rest, carried: { by: e.mergeIn.gate, run: this.runName, date: now() }, decided: { ...x.decided, used: undefined } }; }); }
      }
      const entry = f.entry; let phase = entry.phase;
      // A build that was cut short is continued, not checked (see `resumePhase`).
      const to = resumePhase(this.stateDir, g, phase);
      const fixBrief = rec.fixBrief ?? null;
      if (to !== phase && (to === 'BUILD' ? rec.plan && exists(path.join(this.stateDir, rec.plan)) : fixBrief)) { phase = to; e.continuing = (rec.buildSteps ?? []).at(-1)?.name ?? 'an earlier session'; }
      Object.assign(e, { fixRounds: rec.fixRounds ?? 0, verifyFixRounds: rec.verifyFixRounds ?? 0, plan: rec.plan ?? null, planApprovedBy: rec.planApprovedBy ?? null, buildSteps: rec.buildSteps ?? [], audits: rec.audits ?? [], unproven: (rec.unproven ?? []).filter((u) => u.source !== 'verifier') }); // a verifier's "not run" is of that verify session; the next one says its own
      if (rec.fixBrief) fs.writeFileSync(path.join(this.epicDir(e), 'fix-brief.md'), rec.fixBrief);
      if (rec.prototype?.length) e.prototype = rec.prototype;
      if (rec.skippedLook) e.skippedLook = true;
      // A requirement the build amended stays amended on the branch: the run that finishes the epic says so too, and whose amendment it is.
      const stillAmended = (rec.amended ?? []).filter((t) => this.approvedAmendments(e).includes(t));
      if (stillAmended.length) { e.amended = stillAmended; const unseen = stillAmended.filter((t) => this.takenAmendments(e).includes(t)); if (unseen.length) e.amendedUnseen = unseen; }
      // A full run does not rely on what a provisional run took for this epic: before any session, the owner is asked
      // each of those questions as the session asked it. Their answer is a gate like any other; the provisional run's
      // no longer stands, in this run or a later one.
      if (this.config.mode !== 'provisional') {
        const all = readGates(this.stateDir);
        const took = prototypeReasked(all, e.id);
        const open = all.filter((x) => x.epic === e.id && x.reask && !x.decided && !x.void && !x.superseded && !x.cleared);
        if (took.length || open.length) {
          const order = { verify: 0, fix: 1, build: 2, plan: 3 }; // the earliest session's question last: its answer is where the epic re-enters
          for (const x of [...took].sort((a, b) => (order[stepKindOf(a.session)] ?? 0) - (order[stepKindOf(b.session)] ?? 0))) {
            this.markGate(x.file, { superseded: { run: this.runName, date: now(), why: 'a full run asks the owner' } });
            this.writeGate(e, { kind: x.kind, skillStep: x.skillStep ?? 'unknown', session: x.session ?? null, question: x.question, options: x.options ?? [], tor: x.tor, ...(x.recommendation ? { recommendation: x.recommendation } : {}), artifacts: [],
              why: `a provisional run answered "${x.decided.answer}" to this for you on ${String(x.decided.date).slice(0, 10)}, on the session's own recommendation; a full run asks you. "${x.decided.answer}" keeps what was built on it; any other answer sends the epic back to be ${stepKindOf(x.session) === 'plan' ? 'planned' : 'built'} again with your answer`,
              reask: { of: x.file, took: x.decided.answer, phase } });
          }
          const tors = [...new Set([...took, ...open].map((x) => x.tor))].join(', ');
          this.log(`${e.id}: a provisional run took an answer for ${tors}; a full run asks the owner before it goes on (no session started)`);
          this.finish(e, 'PARKED', `a provisional run took an answer for ${tors}: a full run asks the owner before it goes on`);
          return null;
        }
        // The owner kept a correction the provisional run took: the project's own record of it still says nobody approved
        // it, so the record that says they did is written on the epic's branch before the epic goes on.
        for (const x of all.filter((x) => x.epic === e.id && x.reask && x.kind === 'amendment' && x.decided?.answer === x.reask.took && !x.decided.used && !x.reask.kept && !x.void && !x.superseded && !x.cleared)) this.keepCorrection(e, x);
        // Their answers are in: one that is not what the provisional run took sends the epic back to the session that asked.
        const answered = all.filter((x) => x.epic === e.id && x.reask && x.decided?.answer && !x.decided.used && !x.void && !x.superseded && !x.cleared && x.decided.answer !== x.reask.took);
        if (answered.length) phase = answered.some((x) => stepKindOf(x.session) === 'plan') ? 'PLAN' : 'BUILD';
      }
      // Still a provisional run: an epic that re-enters at the final check is still not looked at. In a full run the verifier is not told so, and what it asks about the look goes to the owner.
      if (this.config.mode === 'provisional') Object.assign(e, { ...(rec.unobserved ? { unobserved: rec.unobserved.map(({ recorded, ...u }) => u) } : {}), ...(rec.unlooked ? { unlooked: rec.unlooked } : {}) });
      if (/^verify-\d+ FAIL after the fix round: /.test(g.reason ?? '')) {
        e.verifyFixRounds = 1; // a record from before the final check had a round of its own
        // A gate written for an epic an earlier driver left FAILED: its brief is from the round already spent.
        const report = g.briefFrom ? tryJson(path.join(this.stateDir, g.briefFrom, 'result.json'))?.result : null;
        if (report) this.writeFixBrief(e, 'The independent verifier returned FAIL again, after the repair that followed its first report. Its final report:', [report], 'a further repair, which the owner asked for after the final check');
      }
      e.resumed = { gate: f.gate, kind: f.kind, answer: f.answer, by: f.by, phase, branch: g.branch, branchTip: g.branchTip, fromRun: g.run ?? null, ...(g.approvesFix ? { approvesFix: true } : {}), ...(phase === 'CHECK_VERIFY' ? { verifiedTip: g.verifiedTip ?? null, verifyStep: g.verifyStep ?? null } : {}), ...(g.decided.standing ? { standing: true } : {}), ...(g.decided.standing || g.decided.asked ? { unasked: g.decided.standing ? 'standing' : g.decided.asked } : {}) }; // `unasked`: the gate's own question was never put to the owner (autopilot answered it, or they said "Try again")
      this.supersedeGates(e, f.gate);
      const used = (extra = {}) => this.markGate(f.gate, (x) => ({ ...x, decided: { ...x.decided, used: { run: this.runName, phase, date: now(), ...extra } } }));
      if (entry.approve) { e.plan = g.artifacts?.[0] ?? null; e.planApprovedBy = g.decided.by; e.planStep = g.session ?? null; }
      if (g.lookAfter) e.unlooked = { pictures: lookPictures(this.lookStore(e)).map((p) => path.join(this.lookStore(e), p.file)) };
      if (entry.look) e.look = { gate: f.gate, by: g.decided.by, date: g.decided.date, note: g.decided.note ?? null, observations: g.decided.observations ?? [], branchTip: g.branchTip, artifacts: g.artifacts ?? [] };
      if (entry.fix) {
        // The one repair is autopilot's own limit, for an answer nobody gave (a standing answer, a retry it asked for). A person who
        // answers "Real" after it is spent has asked for another: seen live (Pilot Light, 2026-11-24), that answer failed the epic and
        // cost a launch. Each further repair takes a person's answer, so it cannot loop.
        if (e.fixRounds >= 1 && e.resumed.unasked) { used(); return this.finish(e, 'FAILED', `the answer on ${f.gate} was not given by a person, and this epic's one fix round is already used, so it cannot be repaired again: it can only be started over`); }
        if (e.fixRounds >= 1) this.log(`${e.id}: the one fix round was used; ${f.by} asked on ${f.gate} for another, so one more runs`);
        e.fixRounds = 1;
        this.event('fix-round', e, { why: e.resumed.unasked ? 'standing' : 'owner' });
        if (entry.fix === 'checks') {
          // The checks that failed after the repair, from the last build check the gate's run wrote.
          const dir = path.join(runDirOf(this.stateDir, g.run ?? this.runName), 'epics', e.id);
          const last = exists(dir) ? fs.readdirSync(dir).filter((n) => /^check-build-\d+\.json$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])).at(-1) : null;
          const failed = (last ? tryJson(path.join(dir, last), {}).checks ?? [] : []).filter((c) => !c.pass);
          this.writeFixBrief(e, `The driver's done-ness checks still failed after the repair, and the owner (${g.decided.by}) asked for one more:`, [...(failed.length ? failed.map((c) => `- **${c.name}** — ${typeof c.evidence === 'string' ? c.evidence : JSON.stringify(c.evidence)}`) : ['(the failing checks could not be read: run the checks named in the gate\'s reason)']), ...(g.decided.note ? ['', `The owner's note: ${g.decided.note}`] : [])], 'one more repair, which the owner asked for');
        } else if (entry.fix === 'audit') {
          const audit = tryJson(path.join(this.stateDir, g.artifacts?.[0] ?? '-'), {});
          const parks = (audit.findings ?? []).filter((x) => x.parks);
          this.writeFixBrief(e, e.resumed.unasked ? `The auditor reported these high findings. They are treated as real ${g.decided.standing ? 'on the owner\'s standing answer' : 'because the owner asked autopilot to try again'}; nobody judged them:` : `The auditor reported these high findings and the owner (${g.decided.by}) confirmed they are real:`, [...parks.map((x) => `- **${x.id} ${x.category}** — ${x.explanation} (evidence: ${x.evidence})`), ...(g.decided.note ? ['', `The owner's note: ${g.decided.note}`] : [])]);
        } else {
          this.writeFixBrief(e, `The owner (${g.decided.by}) looked at what was built and answered "${f.answer}":`, [g.decided.note ? `> ${g.decided.note}` : '(no note was recorded: re-read the requirement and what the gate showed)', '', `They looked at: ${(g.artifacts ?? []).join(', ') || '(nothing could be produced)'}`]);
        }
      }
      // Phases that run a captured plan need it; without one the epic is planned again.
      if (phase === 'BUILD' && !(e.plan && exists(path.join(this.stateDir, e.plan)))) { phase = 'PLAN'; e.resumed.phase = phase; }
      // What the owner answered for this epic's sessions so far: every session of that step in this run is told.
      e.answers = ownerAnswers(this.stateDir, e.id, { keep: f.gate });
      // The owner's look on this very build still stands when verify is entered from another gate
      // (a question, a run that ended without a verdict): the verifier is handed it, not asked again.
      if (phase === 'VERIFY' && !e.look) e.look = this.standingLook(e, g.branchTip);
      if (entry.question && g.session && g.run) {
        // The session that asked is resumed with the answer, when it can be: same step, its record still on disk.
        const prev = tryJson(path.join(runDirOf(this.stateDir, g.run), 'epics', e.id, g.session, 'step.json'));
        if (prev?.sessionId && prev.kind && KINDS[prev.kind]?.state === phase) e.resumeSession = { kind: prev.kind, sessionId: prev.sessionId, step: g.session, run: g.run };
      }
      if (f.kind === 'audit' && phase === 'VERIFY') e.auditOverruled = { gate: f.gate, by: g.decided.by };
      // "Verify as built" after a thin review: that review now counts as the audit of this work; "Review again" leaves it uncounted.
      if (f.kind === 'thin-review' && phase === 'VERIFY') { const t = (e.audits ?? []).filter((a) => a.thin && !a.accepted).at(-1); if (t) t.accepted = g.decided.by; }
      if (!entry.question) used(); // a question gate is marked used by hook R8 when it answers
      e.resumed.behind = f.behind ?? 0;
      this.log(`${e.id}: resuming at ${phase} on ${g.branch} (${String(g.branchTip).slice(0, 9)}${f.behind ? `, ${f.behind} commit(s) behind ${this.state.integration}; it merges cleanly` : ''}): ${g.decided.by} answered "${f.answer}" on ${f.gate}${e.continuing ? ` — ${e.continuing} was cut short, so a session continues it instead of checking a part-built branch` : ''}`);
      // The kept work is merged and checked in one step (RECHECK), so no stop falls between a merge and its check.
      if (phase === 'CHECK_VERIFY') { e.recheck = { gate: f.gate }; this.save(); return 'RECHECK'; }
      return phase;
    }
    if (f?.state === 'void') {
      // Found when the run starts (status between runs writes the same question): one question (`restartGate`), never a
      // silent start over. Only a provisional run starts an epic with nothing left to continue from over itself, and lists it.
      const old = { file: f.gate, ...readJson(this.gatePath(f.gate)) };
      const name = this.writeGate(e, { ...restartGate(f.voidKind, { label: m.label, old, files: f.files ?? [], why: f.why, branch: m.branch, integration: this.state.integration }) });
      const mark = { run: this.runName, date: now(), why: f.why, by: `gates/${name}` };
      this.markGate(f.gate, f.voidKind === 'conflict' ? { restarted: mark } : { void: mark });
      e.voided = { gate: f.gate, answer: f.answer, why: f.why, asked: `gates/${name}` };
      if (f.voidKind !== 'gone' || this.config.mode !== 'provisional') {
        this.log(`${e.id}: the decision on ${f.gate} ("${f.answer}") can no longer be used as given — ${f.why}; asking how to go on (gates/${name}); no session started`);
        return this.finish(e, 'PARKED', readJson(this.gatePath(name)).reason);
      }
      const decided = { answer: ANSWERS.startOver, by: PROVISIONAL_BY, date: today(), scope: 'next-run', standing: true, prototype: true, run: this.runName, used: { run: this.runName, phase: 'PLAN', date: now() } };
      this.markGate(name, (x) => ({ ...x, decided }));
      e.voided.startedOver = true;
      e.resumed = { gate: `gates/${name}`, kind: 'resume', answer: ANSWERS.startOver, by: PROVISIONAL_BY, phase: 'PLAN', fresh: true };
      this.log(`${e.id}: nothing is left to continue from (${f.why}); a provisional run starts it over from scratch and lists that for the owner (gates/${name})`);
    } else if (f?.state === 'fresh') {
      this.markGate(f.gate, (x) => ({ ...x, decided: { ...x.decided, used: { run: this.runName, phase: 'PLAN', date: now() } } }));
      e.resumed = { gate: f.gate, kind: f.kind, answer: f.answer, by: f.by, phase: 'PLAN', fresh: true };
      this.log(`${e.id}: starting over: ${f.by} answered "${f.answer}" on ${f.gate}`);
    }
    // An amendment the owner approved is a decision about the requirement, not about the attempt: it outlives a
    // start from scratch (seen live: approved, the epic failed and was rebuilt, and the owner was asked again).
    const amendment = (x) => /^amendment/.test(x.kind ?? '') && /^amend\b/i.test(x.decided?.answer ?? '') && !x.void && !x.superseded && !x.cleared;
    for (const g of readGates(this.stateDir).filter((x) => x.epic === e.id && amendment(x) && !x.decided.used)) this.markGate(g.file, (x) => ({ ...x, decided: { ...x.decided, used: { run: this.runName, phase: 'PLAN', date: now(), carried: true } } }));
    // From scratch in a full run: nothing is built on what a provisional run took, and nothing takes it up again.
    if (this.config.mode !== 'provisional') for (const x of prototypeReasked(readGates(this.stateDir), e.id)) { this.markGate(x.file, { superseded: { run: this.runName, date: now(), why: 'a full run starts the epic again and asks the owner' } }); this.log(`${e.id}: the answer a provisional run took for ${x.tor} ("${x.decided.answer}") does not stand in a full run; if the question comes up, the owner is asked`); }
    this.supersedeGates(e, null);
    // From scratch: every other answer given about the earlier attempt is not handed to the new one.
    for (const g of readGates(this.stateDir).filter((x) => x.epic === e.id && (x.decided?.used || x.restarted) && !x.superseded && !x.void && gateEntry(x)?.question && !amendment(x))) this.markGate(g.file, { superseded: { run: this.runName, date: now() } });
    // The planner meets the same requirement first, the builder writes the change: both are told.
    const carried = ownerAnswers(this.stateDir, e.id).filter((a) => /^amendment/.test(a.gateKind) && /^amend\b/i.test(a.answer));
    e.answers = carried.flatMap((a) => ['plan', 'build'].map((kind) => ({ ...a, kind })));
    if (carried.length) this.log(`${e.id}: the owner's approved amendment of ${carried.map((a) => a.tor).filter(Boolean).join(', ') || 'a requirement'} is carried into the new attempt`);
    e.resumeSession = null;
    this.supersedeBranch(e);
    this.forget(e);
    return 'PLAN';
  }

  /**
   * A provisional run, at its start: an epic of this run whose question says nothing is left to continue from
   * (`restartGate` "gone", written between runs) is started over on "Start over", in the run's name, listed under
   * "Decided for you" (owner decision 2026-11-24). A full run leaves it to the owner.
   */
  startOverGone() {
    const queue = this.config.queue;
    const done = completeEpics(this.config.project, this.stateDir); // its gates are cleared next, never started over
    const live = readGates(this.stateDir).filter((g) => gateLive(g) && g.kind !== 'preflight' && !done.has(g.epic));
    for (const id of new Set(live.map((g) => g.epic))) {
      const g = live.filter((x) => x.epic === id).at(-1);
      if (g.restart !== 'gone' || g.decided || (queue && !queue.includes(id))) continue;
      this.markGate(g.file, (x) => ({ ...x, decided: { answer: ANSWERS.startOver, by: PROVISIONAL_BY, date: today(), scope: 'next-run', standing: true, prototype: true, run: this.runName } }));
      this.log(`${id}: nothing is left to continue from (${g.reason}); a provisional run starts it over from scratch and lists that for the owner (${g.file})`);
    }
  }

  // ---- crash resume (§9): an in-flight step is never re-trusted ---------------------------------

  recover() {
    for (const e of this.state.queue) {
      if (TERMINAL.has(e.state) || e.state === 'QUEUED') continue;
      const st = e.step;
      if (st?.pid && pidAlive(st.pid)) {
        const cmdline = processTable().find((p) => p.pid === st.pid)?.command ?? '';
        if (cmdline.includes(st.sessionId)) { killGroup(st.pid, 'SIGKILL'); this.log(`${e.id}: killed leftover session ${st.name} (pid ${st.pid})`); }
      }
      e.resumes = e.resumes ?? {};
      const again = (key) => { e.resumes[key] = (e.resumes[key] ?? 0) + 1; return e.resumes[key] <= 1; };
      let entry;
      if (e.state === 'PLAN') entry = again(e.state) ? e.state : null;
      else if (e.state === 'FIX_PLAN') entry = again(e.state) ? 'FIX_BUILD' : null;
      else if (e.state === 'BUILD' || e.state === 'FIX_BUILD') entry = 'CHECK_BUILD_INTERRUPTED';
      else if (e.state === 'CHECK_BUILD' || e.state === 'AUDIT' || e.state === 'CHECK_VERIFY') entry = e.state;
      else if (e.state === 'CATCH_UP') {
        // What the catch-up session did is not trusted: the branch goes back to where it was and is brought up to date again.
        const b = this.meta(e).branch;
        if (gitOk(this.clone, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')) gitRun(this.clone, 'merge', '--abort');
        if (e.catchUpFrom && this.branchTip(b) && this.branchTip(b) !== e.catchUpFrom) { if (this.currentBranch() !== b) this.g('checkout', '-q', '-f', b); this.g('reset', '-q', '--hard', e.catchUpFrom); this.clean(); }
        if (again('CATCH_UP')) { e.mergeIn = { gate: null, then: e.catchUpThen ?? null, fixRounds: e.fixRounds }; entry = e.catchUpAfter ?? 'VERIFY'; }
        else { e.step = null; this.parkCatchUp(e, `interrupted twice while bringing ${b} up to date`, e.catchUpConflicts ?? [], e.catchUpAfter ?? 'VERIFY', e.catchUpThen ?? null); continue; }
      }
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

      this.ensureClone();
      const integration = detectIntegration(this.clone);
      const sync = resuming ? null : this.syncWithProject(integration); // refuses a diverged project before anything is written

      // From here the run exists on disk: its directory, its config, and the workspace's pointer to it.
      fs.mkdirSync(this.runDir, { recursive: true });
      const cfgFile = path.join(this.runDir, 'config.json');
      const saved = runConfig(this.stateDir, this.runName); // what the owner confirmed is kept; a key it lacks is filled in
      writeJson(cfgFile, { ...Object.fromEntries(RUN_KEYS.filter((k) => cfg[k] !== undefined).map((k) => [k, cfg[k]])), ...saved, project: cfg.project });
      if (!exists(path.join(this.stateDir, 'settings.json'))) writeJson(path.join(this.stateDir, 'settings.json'), { project: cfg.project });
      writeAtomic(path.join(this.stateDir, 'current'), `${this.runName}\n`);

      if (resuming) {
        this.state = readJson(this.stateFile);
        this.state.status = 'running'; this.state.stoppedBecause = null;
        this.log(`resuming run ${this.runName}`);
      } else {
        this.state = { realSpend: typeof cfg.realSpend === 'boolean' ? cfg.realSpend : null, attended: typeof cfg.attended === 'boolean' ? cfg.attended : null, mode: cfg.mode, run: new Date().toISOString(), name: this.runName, driverVersion: DRIVER_VERSION, pluginDir: this.pluginDir, integration, startSha: null, spentUsd: 0, runBudgetUsd: cfg.runBudgetUsd, testCommand: cfg.testCommand, status: 'running', stoppedBecause: null, consecutiveInfra: 0, baseSkips: null, sync, queue: [] };
      }
      if (this.leftoversAtStart.length) this.state.leftovers = [...(this.state.leftovers ?? []), ...this.leftoversAtStart.splice(0)];

      // Preflight reads the integration line, so the clone must be on it.
      if (!resuming) {
        if (this.currentBranch() !== integration) { if (!this.setAside('before the run started')) throw new Error(`the private clone has uncommitted changes on ${this.currentBranch()} that could not be set aside; a run does not start on a dirty clone`); this.g('checkout', '-q', integration); }
        this.state.startSha = this.integrationSha();
      } else if (!this.state.queue.some((q) => !TERMINAL.has(q.state) && q.state !== 'QUEUED') && this.currentBranch() !== integration && !this.dirty()) this.g('checkout', '-q', integration);
      // Gate decisions are judged once, at run start: valid ones resume, void ones are planned again.
      if (!resuming && this.config.mode === 'provisional') this.startOverGone();
      if (!resuming) this.state.gateFacts = Object.fromEntries(gateFacts(this.stateDir, integration));
      this.gates = new Map(Object.entries(this.state.gateFacts ?? {}));
      this.pre = preflight(this.clone, cfg, { pluginDir: this.pluginDir, gates: this.gates });
      this.pre.epics = this.pre.epics.map((p) => ({ ...p }));
      this.metaById = new Map(this.pre.epics.map((p) => [p.id, p]));
      if (!resuming) this.retireCompleteGates();
      if (!resuming) {
        this.state.queue = buildQueue(this.pre, cfg).map((m) => ({ id: m.id, name: m.name, label: m.label, state: 'QUEUED', reason: null, attempts: {}, fixRounds: 0, verifyFixRounds: 0, costUsd: 0, turns: 0, wallMs: 0, sessions: [], gates: [], checks: [], planStep: null, preVerify: null, step: null }));
        writeJson(path.join(this.runDir, 'preflight.json'), this.pre);
        this.state.testCommand = this.pre.testCommand;
      } else {
        // Epics already in the run keep the eligibility they started with; their sidecars have moved since.
        // What the look needs is kept: a resumed epic with screens still keeps its pictures (provisional, "look": "after").
        for (const q of this.state.queue) { const m = this.metaById.get(q.id); if (m && q.state !== 'QUEUED') { m.eligibility = 'eligible'; m.reasons = lookReasons(m.reasons); } }
      }
      // What sessions may read outside the clone, resolved once per launch: the referee reads it from state.json.
      const badRead = readOnlyProblems(cfg.readOnly, { project: cfg.project, workspace: this.stateDir });
      if (badRead.length) throw new Error(badRead.join('; '));
      this.state.readOnly = resolveReadOnly(cfg.readOnly);
      const named = namedReads(cfg.project, this.stateDir);
      this.state.readFiles = named.files;
      const badNet = networkProblems(cfg.network);
      if (badNet.length) throw new Error(badNet.join('; '));
      this.state.network = sessionNetwork(cfg);
      if (typeof cfg.sandbox !== 'boolean') throw new Error(`sandbox must be true or false, not ${JSON.stringify(cfg.sandbox)}`);
      this.state.sandbox = cfg.sandbox; // the referee reads it: off means reads are open and the referee alone jails writes
      this.save();
      this.log(cfg.sandbox ? `sandbox on: sessions may reach ${this.state.network.join(', ')}; local sockets and ports are open` : 'sandbox off: sessions run commands unsandboxed with open network; the referee keeps writes inside the clone');
      if (this.state.readOnly.length) this.log(`sessions may read (never write): ${this.state.readOnly.join(', ')}`);
      if (named.files.length) this.log(`sessions may read (never write) the files CLAUDE.md names outside the project: ${named.files.join(', ')}`);
      for (const r of named.refused) this.log(`CLAUDE.md names ${r.path}; sessions may not read it: ${r.why}`);
      this.log(`run ${this.runName}: queue ${this.state.queue.map((q) => q.id).join(', ') || '(empty)'}; integration line ${integration}`);
      // The limits this run really has, for whoever launched it to hold against what the owner confirmed.
      const limits = { runBudgetUsd: cfg.runBudgetUsd ?? null, endBy: cfg.endBy ?? null, autoContinue: cfg.autoContinue ?? 0, onPark: cfg.onPark, onParkFrom: cfg.onParkFrom ?? 'default' };
      const parkWhy = { project: 'set by the project', provisional: 'a provisional run keeps going', attended: 'you said you would be away', default: 'you did not say you would be away' }[limits.onParkFrom];
      // A run that continues others has what is left of their shared budget: said as such, so it never reads as a different budget from `status`.
      const chain = chainOf(this.stateDir, this.runName);
      if (chain.runs.length > 1) Object.assign(limits, { chainBudgetUsd: chain.runBudgetUsd, chainSpentBeforeUsd: +chain.spentBefore.toFixed(2) });
      const budgetWords = limits.runBudgetUsd == null ? 'none' : limits.chainBudgetUsd != null ? `$${Number(limits.runBudgetUsd).toFixed(2)} left of $${limits.chainBudgetUsd} (the ${chain.runs.length - 1} earlier run${chain.runs.length > 2 ? 's' : ''} of this chain spent $${limits.chainSpentBeforeUsd.toFixed(2)})` : `$${limits.runBudgetUsd}`;
      this.log(`run ${this.runName}: limits: run budget ${budgetWords}; end by ${limits.endBy ?? 'no end time'}; technical stops continued ${limits.autoContinue} per epic; when an epic parks: ${limits.onPark} (${parkWhy}); mode ${MODE_LINE[cfg.mode]}`);
      this.event('run-start', null, { run: this.runName, queue: this.state.queue.map((q) => q.label ?? q.id), mode: cfg.mode, ...limits, ...(resuming ? { resuming: true } : {}) });

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
          // Every epic starts on a clean clone: what an earlier epic's sessions left is not built into this one.
          if (!this.setAside(`before ${e.id} started`)) { this.stopReason = `clone is dirty on ${this.currentBranch()}`; break; }
          if (this.currentBranch() !== integration) this.g('checkout', '-q', integration);
          // What git does not carry (dependencies, local files): once per run, and again after every merge.
          if ((cfg.setup || (cfg.copy ?? []).length) && this.envSha !== this.integrationSha()) {
            const env = this.prepareEnv();
            if (!env.pass) { this.stopReason = 'setup failed'; this.state.setupFailed = { before: e.id, step: env.step, problems: env.problems, command: env.setup.command, exit: env.setup.code ?? null, timedOut: env.setup.timedOut ?? false, couldNotRun: env.setup.couldNotRun ?? false, tail: env.setup.tail ?? null }; this.log(`setup failed (${env.step}) on ${integration}; stopping the run`); break; }
          }
          // A project with no tests yet has no base to be red: the first epic's own checks run the tests.
          const noTests = this.noTestsYet();
          if (noTests) { this.state.baseEmpty = { before: e.id, testDirs: noTests }; this.log(`no test files under ${noTests.join(' ')} on ${integration} yet: the base test run is skipped; ${e.id}'s own checks run the tests`); }
          const { t, tries } = noTests ? { t: { pass: true, skips: null } } : this.baseCheck(e, integration);
          if (!t.pass) { this.stopReason = 'base red'; this.state.baseRed = { before: e.id, exit: t.code, timedOut: t.timedOut, couldNotRun: t.couldNotRun, ms: t.ms, sleptSec: t.sleptSec, tries, tail: t.tail }; this.log(`base red: \`${cfg.testCommand}\` fails on ${integration} (exit ${t.code}); stopping the run`); break; }
          this.state.baseSkips = t.skips;
          e.startedAt = new Date().toISOString();
        }
        const phase = entry ?? this.enter(e);
        this.save();
        if (phase) this.event('epic-start', e, entry || (e.resumed && !e.resumed.fresh) ? { resumedAt: phase } : {});
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
      this.event('run-end', null, { why: this.state.stoppedBecause, status: this.state.status, spentUsd: this.state.spentUsd });
      return this.state;
    } finally {
      // A run refused before its directory existed still leaves its lines (a stale lock taken over) in the latest run's log.
      const last = currentRun(this.stateDir);
      if (this.early.length && !exists(this.runDir) && last) fs.appendFileSync(path.join(runDirOf(this.stateDir, last), 'autopilot.log'), this.early.splice(0).join(''));
      this.releaseLock();
    }
  }
}

/**
 * The launch's warning about sleep (#41 B10): a machine that sleeps mid-run fails a check by timeout. macOS runs the
 * driver under caffeinate, which a closed lid on battery still overrides; Windows has no such wrapper here, so the owner
 * sets the power plan. Null where nothing is known to help.
 */
export function sleepWarning(platform = process.platform) {
  if (platform === 'darwin') return 'a laptop with the lid closed on battery may still sleep, even under caffeinate: leave it on power';
  if (platform === 'win32') return 'Windows may put the computer to sleep mid-run, and a check it sleeps through fails: set the power plan to never sleep while plugged in, and leave it plugged in';
  return null;
}
/** Windows is new for autopilot: its testers are told so at launch, and what to send when a run breaks. */
export function windowsWarning(platform = process.platform) {
  return platform === 'win32' ? "Windows is new for autopilot and not yet proven. If a run breaks, send the run's report and its hooks.jsonl to the maintainer (issue #41)" : null;
}

/** What the skill needs to know before it offers a launch: read-only facts about the project and its workspace. */
export function launchFacts(project, workspace, config, { epics = null } = {}) {
  const refuse = []; const warn = [];
  const integration = detectIntegration(project);
  if (!integration) refuse.push(`${project} is not the root of a git repository with a develop, main or master branch`);
  // Every untracked file listed one by one, so autopilot's own settings file (which `configure` writes and the owner may
  // not have committed yet) is not counted as the owner's uncommitted change.
  const own = path.relative(project, projectSettingsFile(project)).split(path.sep).join('/');
  const dirty = integration ? gitRun(project, 'status', '--porcelain', '--untracked-files=all').out.split('\n').filter(Boolean).filter((l) => l.replace(/^\S{1,2}\s+/, '').replace(/^"|"$/g, '') !== own).length : 0; // not by column: `sh` trims the first line's leading space (" M")
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
  const done = completeEpics(project, workspace);
  const gates = readGates(workspace).filter((g) => gateLive(g) && !done.has(g.epic));
  const facts = gateFacts(workspace, integration, { integrationTip: sync.state === 'project-ahead' ? sync.projectTip : null });
  const brief = (g) => ({ file: g.file, epic: g.epic, kind: g.kind, run: g.run ?? null, question: g.question ?? null, answer: g.decided?.answer ?? null, ...(facts.get(g.epic)?.gate === g.file ? { state: facts.get(g.epic).state, enters: facts.get(g.epic).enters ?? null, why: facts.get(g.epic).why ?? null } : {}) });
  const openGates = gates.filter((g) => !g.decided && (g.options ?? []).length).map(brief);
  const decidedGates = gates.filter((g) => g.decided?.answer).map(brief);
  const voidGates = decidedGates.filter((g) => g.state === 'void');
  if (voidGates.length) warn.push(`${voidGates.length} decision(s) can no longer be used as given (${voidGates.map((g) => `${g.epic}: ${g.why}`).join('; ')}); autopilot asks how to go on with those epics`);
  if (openGates.length) warn.push(`${openGates.length} gate(s) wait for your decision (${[...new Set(openGates.map((g) => g.epic))].join(', ')}); decide them with /peak-workflow:autopilot report`);

  const env = integration ? envFacts(project, workspace, config) : null;
  for (const p of env?.problems ?? []) refuse.push(p);
  if (sync.state === 'diverged') refuse.push(divergedText(sync, project, clone, integration));
  if (sync.state === 'clone-ahead') warn.push(`autopilot has merged work the project has not fetched yet; the run builds on top of it. Waiting in the clone: ${sync.waiting.join('; ')}. Bring it in with: ${fetchCommand(clone, integration)}`);
  if (sync.state === 'project-ahead') warn.push(`${integration} moved in the project since the last run; the run fast-forwards the clone to it first; a decision on a parked branch still holds if that branch merges cleanly into the new tip`);
  const sleepy = sleepWarning();
  if (sleepy) warn.push(sleepy);
  const windows = windowsWarning();
  if (windows) warn.push(windows);
  // What the owner confirmed last time, minus what has finished since: offered beside the full queue, never chosen for them.
  const confirmed = lastRun ? tryJson(path.join(lastRun.runDir, 'config.json'))?.queue : null;
  const byId = new Map((epics ?? []).map((e) => [e.id, e]));
  const left = Array.isArray(confirmed) && epics ? confirmed.filter((id) => byId.has(id) && byId.get(id).eligibility !== 'complete') : [];
  const lastQueue = left.length ? { run: lastRun.run, ids: left, labels: left.map((id) => byId.get(id).label), finishedSince: confirmed.filter((id) => byId.get(id)?.eligibility === 'complete') } : null;
  const wsBudgets = tryJson(path.join(workspace, 'settings.json'), {})?.budgets;
  const connectors = connectorFacts(project, config, warn);
  const run = newRunName(workspace);
  return {
    ok: refuse.length === 0, refuse, warn, integration, freeGb, workspace, clone, run, runDir: runDirOf(workspace, run), settingsFileExists: exists(path.join(workspace, 'settings.json')),
    projectSettingsFile: projectSettingsFile(project), projectSettingsFileExists: exists(projectSettingsFile(project)),
    runs, lastRun, lastQueue, openGates, decidedGates, sync, env, connectors,
    // Per-step settings in the workspace's settings.json win over the project's file: named so the confirm screen can say so.
    workspaceBudgets: wsBudgets && typeof wsBudgets === 'object' ? Object.fromEntries(BUDGET_STEPS.filter((k) => wsBudgets[k] && typeof wsBudgets[k] === 'object').map((k) => [k, wsBudgets[k]])) : {}, endByLocal: config.endBy ? new Date(config.endBy).toString() : null,
    // `onPark` is null here unless the project set it: before launch nobody has said whether they will be there, and it follows that answer.
    config: { ...config, onPark: config.onParkFrom === 'default' ? null : config.onPark },
    // The per-session safety caps, sized for the confirm screen: ceilings, never estimates.
    caps: ['plan', 'build', 'audit', 'verify', 'fix'].filter((k) => config.budgets[k]).map((k) => ({ session: k, size: capSize(config.budgets[k].wallMin), minutes: config.budgets[k].wallMin, usd: config.budgets[k].usd, model: config.budgets[k].model ?? null, effort: config.budgets[k].effort ?? null })),
  };
}

/**
 * The owner's connectors, for the launch screen (#43): `{ list: [{name, source, status}], connected, needsSignIn, failed }`
 * from `claude mcp list` (about 2 s, no model). Its "Connected" is a health check, not proof a session can use one. Null,
 * with one warning, when it cannot be listed; sessions can still use them. AUTOPILOT_SKIP_MCP_LIST: a test that names
 * the real `claude` never lists the owner's real connectors.
 */
function connectorFacts(project, config, warn) {
  if (config.claudeBin === 'claude' && process.env.AUTOPILOT_SKIP_MCP_LIST === '1') return null;
  const script = /\.(mjs|cjs|js)$/.test(config.claudeBin);
  const r = sh(script ? process.execPath : config.claudeBin, [...(script ? [config.claudeBin] : []), 'mcp', 'list'], { cwd: exists(project) ? project : undefined, timeout: 30000 });
  if (r.code !== 0 || r.timedOut) {
    warn.push(`could not list your connectors (\`claude mcp list\` ${r.timedOut ? 'took over 30 s' : `exited ${r.code}`}); sessions can still use them, but this screen cannot name them`);
    return null;
  }
  const list = parseMcpList(`${r.out}\n${r.err}`).filter((c) => c.status !== 'not-configured');
  const n = (st) => list.filter((c) => c.status === st).length;
  return { list, connected: n('connected'), needsSignIn: n('needs-sign-in'), failed: n('failed') };
}

/**
 * An epic that parked with nothing to answer is a dead end: the next run skips it and the owner has no question to
 * decide. For every such epic on record (parked, its branch still there, no live gate) this writes the `resume` gate
 * an up-to-date driver would have written, so the report can ask "continue it?" like any other park.
 */
export function ensureResumeGates(workspace, { write = true } = {}) {
  const missing = missingResumeGates(workspace);
  if (write) for (const m of missing) {
    // The question the new gate replaces stops counting: the owner answers one thing, not two.
    // A void decision (`restartGate`): marked void, or, when the branch only needs bringing up to date, kept to be carried on.
    if (m.replaces) { const f = path.join(workspace, m.replaces); const mark = { date: new Date().toISOString(), by: `gates/${m.name}`, why: m.why ?? m.gate.reason }; writeJson(f, { ...readJson(f), [m.restart === 'conflict' ? 'restarted' : m.restart ? 'void' : 'superseded']: mark }); }
    writeJson(path.join(workspace, 'gates', m.name), m.gate);
  }
  return missing.map((m) => m.name);
}
/**
 * The question for a final check that still returns FAIL after its own repair. Before, the epic
 * was FAILED with nothing to answer and was planned and built again (issue #41 B5).
 */
export function verifyFailGate(label, reason, { artifacts = [] } = {}) {
  return {
    kind: 'resume', skillStep: 'wrapup-epic', phase: 'FIX_BUILD', reason, technical: true, options: [ANSWERS.resume, ANSWERS.startOver], artifacts,
    question: `${label}: the final check still finds a requirement not met, after one repair ("${reason.replace(/^\S+ FAIL after the fix round: /, '')}"). Repair it once more?`,
    why: `what was built is kept. "${ANSWERS.resume}" runs one more repair from the final check's report, then the checks and the final check again; nothing is planned or built again. "${ANSWERS.startOver}" plans the epic again from scratch`,
  };
}

/** Where a failed merge check keeps the final check's work (issue #35). */
export const verifiedRef = (id) => `refs/autopilot/verified/${id}`;

/**
 * The gate for a failed merge check (`check` is the check-verify record; issue #35). Every failure asks, and the
 * final check's work is kept. Where that work can stand as it is (the tests or the requirements check failed only
 * once it was merged, the merge itself was malformed, or a fix it made is the owner's to allow), "Resume" merges
 * the kept work again and checks it (`phase: CHECK_VERIFY`), with no new final check. Where it cannot (it changed
 * a requirement, made a test check less, left a requirement without its verified line, or counted a deferral), or
 * when no work was kept (`verifiedTip` null), "Resume" runs the final check again (`phase: VERIFY`). Either is a
 * technical stop the standing answer may take; a fix of the owner's to allow is `approvesFix`, as before.
 */
export function mergeCheckGate(label, check, limits, { verifiedTip = null } = {}) {
  const failed = (check?.checks ?? []).filter((c) => !c.pass);
  const names = new Set(failed.map((c) => c.name));
  const v = failed.find((c) => c.name === 'verdict');
  const problems = v ? (Array.isArray(v.evidence) ? v.evidence : [v.evidence ?? 'the merge was not the one autopilot expects']).map(String) : [];
  const fixP = problems.filter((p) => p.startsWith(SMALL_FIX_PROBLEM));
  const head = label ? `${label}: ` : '';
  const options = [ANSWERS.resume, ANSWERS.startOver];
  const startOver = `"${ANSWERS.startOver}" plans the epic again from scratch`;
  // What needs a new final check, in the owner's words.
  const redo = [];
  if (problems.some((p) => /changes a requirement file/.test(p))) redo.push('it changed a requirement file, which the final check may not do');
  if (fixP.some((p) => /removes checks from a test|deletes a test|skips a test|pass for nearly any value|where it never runs|rewrites an expected result/.test(p))) redo.push('a fix it made makes a test check less');
  if (names.has('sidecar-on-integration')) redo.push('the epic\'s status file does not record every requirement as verified');
  if (names.has('no-waivers')) redo.push('its handoff counts a deferral or a waiver that is not allowed');
  // What a re-check of the kept work can settle.
  const code = (fixP.map((p) => p.match(/changes a file that is not a test \(([^)]*)\)/)).find(Boolean) ?? [])[1];
  const n = (re) => Number((fixP.map((p) => p.match(re)).find(Boolean) ?? [])[1] ?? 0);
  const files = n(/changes (\d+) files/); const lines = n(/changes (\d+) lines/);
  const over = limits ? [...(files > limits.files ? [`${files} files (your limit is ${limits.files})`] : []), ...(lines > limits.lines ? [`${lines} changed lines (your limit is ${limits.lines})`] : [])] : [];
  const stray = (problems.map((p) => p.match(/^commits added during verify touch files outside docs\/: (.*)$/)).find(Boolean) ?? [])[1];
  const recheck = []; let approvesFix = false;
  if (code) { approvesFix = true; recheck.push(`to meet a requirement it changed the product itself (${code}), where your standing answer covers only adding a missing test`); }
  if (over.length) { approvesFix = true; recheck.push(`the fix it made was bigger than your standing answer for small fixes allows: ${over.join(', ')}`); }
  // Nobody allowed it, so nothing checked it for a changed requirement or a weaker test: only a final check can.
  if (stray) redo.push(`it changed files outside docs/ (${stray}) that nobody allowed`);
  if (fixP.length && !code && !over.length && !redo.length) recheck.push('an earlier autopilot held back the small fix it made under a rule that has since been loosened');
  const shape = problems.filter((p) => !p.startsWith(SMALL_FIX_PROBLEM) && !/^commits added during verify/.test(p));
  if (shape.length) recheck.push(`its merge was not the one merge autopilot expects (${shape.join('; ')})`);
  if (names.has('tests-green-on-integration')) recheck.push('the tests failed once its work was merged');
  if (names.has('requirements-health')) recheck.push('the requirements check failed once its work was merged');
  if (!redo.length && !recheck.length) recheck.push('autopilot\'s checks on its merge did not pass');
  if (redo.length || !verifiedTip) {
    const what = [...redo, ...(redo.length ? [] : recheck)];
    return { kind: 'resume', phase: 'VERIFY', technical: true, options,
      question: `${head}the final check passed, but ${what.join('; and ')}. It was not merged. Run the final check again?`,
      why: `the final check's work cannot be merged as it is, so it is checked again. "${ANSWERS.resume}" runs the final check again on the same branch; nothing is rebuilt. ${startOver}` };
  }
  return { kind: 'resume', phase: 'CHECK_VERIFY', technical: true, ...(approvesFix ? { approvesFix: true } : {}), options,
    question: `${head}the final check passed, but ${recheck.join('; and ')}. The merge was undone and its work is kept. ${approvesFix ? 'Allow that change for this epic and check the merge again?' : 'Check the merge again?'}`,
    why: `nothing is rebuilt and no final check is run again. "${ANSWERS.resume}" merges the kept work again${approvesFix ? ', allowing the change in your name,' : ''} and runs autopilot's checks on that merge; a failure asks again. ${startOver}` };
}

/**
 * A verifier's open question that asks the owner to redo a check their look on this very build
 * already covers, asked under a driver whose referee did not yet refuse that (the asking step has
 * no `look-reminded.json`). Seen live: the owner had signed in for real and was asked again.
 */
function redoneCheck(workspace, gates, id) {
  const live = gates.filter((g) => g.epic === id && gateLive(g) && g.kind !== 'preflight');
  const [q] = live;
  if (live.length !== 1 || q.decided || q.kind !== 'unmatched' || !/^verify-\d+$/.test(q.session ?? '') || !q.tor || !q.run) return null;
  if (exists(path.join(runDirOf(workspace, q.run), 'epics', id, q.session, 'look-reminded.json'))) return null;
  const look = gates.filter((g) => g.epic === id && g.kind === 'human-check' && !g.void && !g.superseded).at(-1);
  if (look?.decided?.answer !== ANSWERS.looksRight || !look.branchTip || look.branchTip !== q.branchTip) return null;
  const obs = look.decided.observations ?? [];
  return obs.length && !obs.some((o) => o.tor === q.tor && o.answer === 'yes') ? null : q;
}
/** The gates `ensureResumeGates` would write, as `[{name, gate}]`. Reads only. */
function missingResumeGates(workspace) {
  const clone = path.join(workspace, 'clone'); const made = [];
  const records = tryJson(path.join(workspace, 'epics.json'), {}) ?? {};
  const project = lastProject(workspace);
  const done = completeEpics(project, workspace); // a Complete epic gets no new question
  let lookAfter = false; try { lookAfter = !!project && projectSettings(project).look === 'after'; } catch { /* an unreadable settings file is reported at launch */ }
  const gates = readGates(workspace);
  // A decision that can no longer be used as given becomes one question (`restartGate`), never a silent start over.
  // Without the clone nothing can be judged here: the run that recreates it finds the void decision itself (`enter`).
  const integrationNow = exists(clone) ? detectIntegration(clone) : null;
  for (const [id, f] of integrationNow ? gateFacts(workspace, integrationNow) : []) {
    if (f.state !== 'void' || done.has(id)) continue;
    const old = gates.find((g) => g.file === f.gate);
    const tipNow = integrationNow && old.branch ? gitRun(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${old.branch}`).out || null : null;
    made.push({ name: `${id}-${gates.filter((g) => g.epic === id).length + 1}.json`, replaces: old.file, restart: f.voidKind, why: f.why, gate: {
      epic: id, epicName: old.epicName ?? id, run: old.run ?? null, session: null, branch: old.branch ?? null, branchTip: tipNow, base: integrationNow ? gitRun(clone, 'rev-parse', integrationNow).out || null : null,
      resume: old.resume ?? null, decided: null,
      ...restartGate(f.voidKind, { label: labelOf(workspace, id), old, files: f.files ?? [], why: f.why, branch: old.branch, integration: integrationNow ?? 'the integration line' }),
    } });
  }
  for (const [id, rec] of Object.entries(records)) {
    if (!['PARKED', 'FAILED'].includes(rec.state) || !rec.branch || done.has(id)) continue;
    if (made.some((x) => x.gate.epic === id)) continue;
    const redo = rec.state === 'PARKED' ? redoneCheck(workspace, gates, id) : null;
    // The project says "look": "after", and this epic waits only for a look at its screens (asked before the setting,
    // or by a driver that started before it): the owner's setting is the answer. A line a person must observe still waits.
    const liveNow = gates.filter((g) => g.epic === id && gateLive(g) && g.kind !== 'preflight');
    const look = !redo && lookAfter && rec.state === 'PARKED' && liveNow.length === 1 && liveNow[0].kind === 'human-check' && !liveNow[0].decided && !(liveNow[0].checks ?? []).length ? liveNow[0] : null;
    if (look) {
      const tipNow = gitRun(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${rec.branch}`).out;
      if (tipNow && tipNow === look.branchTip) made.push({ name: `${id}-${gates.filter((g) => g.epic === id).length + 1}.json`, replaces: look.file, gate: {
        epic: id, epicName: look.epicName ?? id, run: rec.run ?? null, session: look.session ?? null, branch: rec.branch, branchTip: tipNow, base: look.base ?? null, resume: look.resume ?? null,
        kind: 'resume', skillStep: 'autopilot driver', phase: 'VERIFY', lookAfter: true, reason: 'the project is set to "look": "after": its screens are reviewed after the final check, not before',
        question: `${look.epicName ?? id}: go on to the final check without a look at the screens first?`, options: [ANSWERS.resume, ANSWERS.startOver],
        why: 'answered by the project setting "look": "after"; the pictures are listed for review once it has merged',
        artifacts: look.artifacts ?? [], decided: { answer: ANSWERS.resume, by: '"look": "after" (project setting)', date: today(), scope: 'next-run' },
      } });
      continue;
    }
    if (!redo && gates.some((g) => g.epic === id && gateLive(g) && g.kind !== 'preflight')) continue;
    const reason = String(rec.reason ?? '');
    // An earlier driver called a verify that recorded no verdicts a FAIL (seen live: the owner had put a sign-in off).
    const verify = rec.state === 'FAILED' && (reason.match(/^(verify-\d+) FAIL after the fix round: /) ?? [])[1];
    const m = rec.state === 'PARKED' && reason.match(/^(CHECK_BUILD)\b|^interrupted: .*(CHECK_BUILD)/);
    // A failed merge check an earlier driver parked with nothing to answer (issue #35): the gate this driver writes,
    // with the final check's work taken from the undone merge it kept under refs/autopilot/rejected/.
    const mergeFailed = rec.state === 'PARKED' && /^merge gate failed \(/.test(reason);
    const tip = gitRun(clone, 'rev-parse', '--verify', '--quiet', `refs/heads/${rec.branch}`).out;
    const integration = detectIntegration(clone);
    if (!(m || redo || mergeFailed || (verify && (NO_VERDICT.test(reason) || rec.fixBrief))) || !tip || !integration) continue;
    const st = tryJson(path.join(runDirOf(workspace, rec.run ?? ''), 'state.json'), {});
    const q = (st.queue ?? []).find((x) => x.id === id) ?? {};
    const n = gates.filter((g) => g.epic === id).length + 1;
    const last = (rec.buildSteps ?? []).at(-1);
    if (mergeFailed) {
      const epicDir = path.join(runDirOf(workspace, rec.run ?? ''), 'epics', id);
      const checkFile = exists(epicDir) ? fs.readdirSync(epicDir).filter((f) => /^check-verify-\d+\.json$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1) : null;
      // No record of the checks: the names in the reason say what failed.
      const check = (checkFile && tryJson(path.join(epicDir, checkFile))) || { checks: ((reason.match(/^merge gate failed \(([^)]*)\)/) ?? [])[1] ?? '').split(/,\s*/).filter(Boolean).map((name) => ({ name, pass: false })) };
      // Only the latest undone merge is the merge check's own: an older one is another session's, undone for another reason.
      const lastRejected = (q.rejected ?? []).at(-1);
      const p2 = lastRejected ? gitRun(clone, 'rev-parse', '--verify', '--quiet', `${lastRejected}^2`).out : '';
      const verifiedTip = p2 && gitOk(clone, 'merge-base', '--is-ancestor', tip, p2) ? p2 : null;
      const gate = mergeCheckGate(q.label ?? id, check, smallFixLimits({ smallFixes: tryJson(path.join(workspace, 'settings.json'), {})?.smallFixes }), { verifiedTip });
      const verifyStep = /^verify-\d+$/.test(q.lastStep ?? '') ? `runs/${rec.run}/epics/${id}/${q.lastStep}` : null;
      made.push({ name: `${id}-${n}.json`, gate: {
        epic: id, epicName: q.name ?? id, run: rec.run ?? null, session: null, branch: rec.branch, branchTip: tip, base: gitRun(clone, 'rev-parse', integration).out,
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${id}`, decided: null, skillStep: 'autopilot driver', reason,
        ...gate, artifacts: checkFile ? [`runs/${rec.run}/epics/${id}/${checkFile}`] : [], ...(gate.phase === 'CHECK_VERIFY' ? { verifiedTip, verifyStep } : {}),
      } });
      continue;
    }
    if (redo) {
      made.push({ name: `${id}-${n}.json`, replaces: redo.file, gate: {
        epic: id, epicName: q.name ?? id, run: rec.run ?? null, session: redo.session, branch: rec.branch, branchTip: tip, base: gitRun(clone, 'rev-parse', integration).out,
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${id}`, decided: null,
        kind: 'resume', skillStep: 'autopilot driver', phase: 'VERIFY', technical: true, reason: `${redo.session} asked for a check of ${redo.tor} that you had already done and recorded`,
        question: `${q.label ?? id}: the final check asked you to do a check for ${redo.tor} again that you had already done and recorded. Autopilot now refuses that question. Run the final check again in the next run?`,
        options: [ANSWERS.resume, ANSWERS.startOver],
        why: `you are not asked to do the check again: the verifier is held to what you recorded. "${ANSWERS.resume}" runs the final check again on the same branch; nothing is rebuilt and your recorded look still stands. "${ANSWERS.startOver}" plans the epic again from scratch`,
        artifacts: [redo.file],
      } });
      continue;
    }
    if (verify && !NO_VERDICT.test(reason)) {
      // An earlier driver ended a real FAIL after the repair with nothing to answer: the same question as now.
      const dir = `runs/${rec.run}/epics/${id}/${verify}`;
      made.push({ name: `${id}-${n}.json`, gate: {
        epic: id, epicName: q.name ?? id, run: rec.run ?? null, session: verify, branch: rec.branch, branchTip: tip, base: gitRun(clone, 'rev-parse', integration).out,
        resume: `open a new session in the fetched repo: /peak-workflow:start-epic ${id}`, decided: null,
        ...verifyFailGate(q.label ?? id, reason, { artifacts: exists(path.join(workspace, dir)) ? [dir] : [] }), briefFrom: dir,
      } });
      continue;
    }
    if (verify) {
      const dir = `runs/${rec.run}/epics/${id}/${verify}`;
      made.push({ name: `${id}-${n}.json`, gate: {
        epic: id, epicName: q.name ?? id, run: rec.run ?? null, session: verify, branch: rec.branch, branchTip: tip, base: gitRun(clone, 'rev-parse', integration).out,
        resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${id}`, decided: null,
        kind: 'resume', skillStep: 'autopilot driver', phase: 'VERIFY', technical: true, reason: `${verify} ended without a verdict: nothing was recorded or committed`,
        question: `${q.label ?? id}: the final check ended without a verdict, and an earlier autopilot called that a FAIL. Run the final check again in the next run?`,
        options: [ANSWERS.resume, ANSWERS.startOver],
        why: `nothing failed and nothing is repaired. "${ANSWERS.resume}" runs the final check again on the same branch; nothing is rebuilt, and a look you recorded on this build still stands. A check you put off is asked again then. "${ANSWERS.startOver}" plans the epic again from scratch`,
        artifacts: exists(path.join(workspace, dir)) ? [dir] : [],
      } });
      continue;
    }
    made.push({ name: `${id}-${n}.json`, gate: {
      epic: id, epicName: q.name ?? id, run: rec.run ?? null, session: last?.name ?? null, branch: rec.branch, branchTip: tip, base: gitRun(clone, 'rev-parse', integration).out,
      resume: `open a new session in the fetched repo: /peak-workflow:start-epic ${id}`, decided: null,
      kind: 'resume', skillStep: 'autopilot driver', phase: 'CHECK_BUILD', reason: rec.reason,
      question: `${q.label ?? id} stopped: ${rec.reason}. Continue it in the next run?`,
      options: [ANSWERS.resume, ANSWERS.startOver],
      why: stuckAfterFix(rec.reason)
        ? `nothing was decided for you: the build was repaired once and autopilot's own checks still fail, so running them again would fail the same way. "${ANSWERS.resume}" runs one more repair, told which checks fail; "${ANSWERS.startOver}" plans it again from scratch`
        : `nothing was decided for you: the build finished and autopilot's own checks stopped it. "${ANSWERS.resume}" runs those checks again on the same branch, with the current driver; "${ANSWERS.startOver}" plans it again from scratch`,
      artifacts: last ? [last.dir] : [],
    } });
  }
  return made;
}

// ---- the standing answer for technical stops ---------------------------------------------------

/**
 * Whether autopilot answers this gate itself, on the owner's standing answer from launch. The rule
 * is `standingAnswer` in lib.mjs (which gates, which answer, one count of `n` per epic).
 */
export const standingCovers = (gate, gates, n) => !!standingAnswer(gate, gates, n);
/** What autopilot did when it answered a technical stop itself, in the owner's words: for the `continue` line and the closing screen. */
function standingDid(gate, answer) {
  if (gate.mergeIn) return 'brought it up to date with the other finished work';
  if (gate.restart === 'moved') return 'checked it again from where its branch is now';
  if (answer === ANSWERS.replan) return 'had it planned again';
  if (answer === ANSWERS.auditReal) return 'had what the reviewer found repaired';
  if (gate.phase === 'CHECK_VERIFY') return gate.approvesFix ? 'allowed the final check\'s fix and checked its merge again' : 'checked the final check\'s merge again';
  if (gate.approvesFix) return 'let the final check make its own fix and ran it again';
  if (gate.phase === 'FIX_BUILD' && /FAIL after the fix round/.test(gate.reason ?? '')) return 'had it repaired once more';
  if (gate.phase === 'VERIFY') return 'ran the final check again';
  return 'continued it from where it stopped';
}
/** What a provisional run did when it answered a session's question itself, in the owner's words. */
export function prototypeDid(gate) {
  const a = gate.decided?.answer ?? ''; const tor = gate.tor ?? 'a requirement';
  if (gate.restart === 'gone') return 'started it over from scratch: its branch was gone';
  if (gate.kind === 'amendment') return `took the proposed correction to ${tor}`;
  if (gate.kind === 'thin-review') return `went on after a thin review: read ${gate.read ?? '?'} of ${gate.of ?? '?'} changed files`;
  if (/^\W*defer\b/i.test(a)) return `deferred ${tor} to a later epic, as the builder recommended`;
  if (gate.kind === 'pre-existing') {
    const m = String(gate.question ?? '').match(/failed on (.+?), which this epic did not change, and they fail the same way on ([^:]+):/);
    const [tests, base] = m ? [m[1], m[2].trim()] : ['a failing check', 'the base'];
    return /^\W*fix\b/i.test(a) ? `had ${tests}, already failing on ${base}, fixed on the epic's branch` : `accepted ${tests} as already failing on ${base}`;
  }
  if (gate.kind === 'defect') return `left a defect as is: ${String(gate.question ?? '').replace(/^\W*Seen but not fixed yet:\s*/, '').replace(/\s*Recommendation:[\s\S]*$/, '').replace(/[\s.]+$/, '') || 'what the final check saw'}`;
  if (/^\W*fix now\b/i.test(a)) return `had ${tor} fixed in the same build, as the builder recommended`;
  return `answered "${a}" about ${tor}`;
}
/** What re-checks one requirement of a finished epic with a person there: the command for the owner (or whoever helps them) to run in the project. */
export const reverifyCommand = (epicId, tor) => `/peak-workflow:wrapup-epic ${epicId} reverify ${tor}`;
/**
 * The epics whose status file says Complete: in the project, or on the clone's integration line (merged by autopilot,
 * not fetched yet). A gate of such an epic no longer counts: it was finished, by hand or by a run (#46 item 6).
 */
export function completeEpics(root, workspace) {
  const done = new Set();
  // Read from each repository's integration line, never its working tree: a status file made Complete on a branch not
  // merged yet (team mode, a pull request open) is not finished, and a run on the clone would build the epic again.
  const fromLine = (repo) => {
    const integration = repo && exists(repo) ? detectIntegration(repo) : null;
    if (integration) for (const e of readEpics(repo, { sidecarText: (rel) => gitShow(repo, integration, rel) ?? '' })) if (e.status === 'Complete') done.add(e.id);
  };
  try { fromLine(root); } catch { /* an unreadable plan is reported at launch */ }
  try { fromLine(path.join(workspace, 'clone')); } catch { /* the clone is judged at run start */ }
  return done;
}
const CLEARED_COMPLETE = 'the epic is Complete';
/** The project the workspace's latest run was confirmed for. */
const lastProject = (workspace) => { const last = currentRun(workspace); return last ? tryJson(path.join(runDirOf(workspace, last), 'config.json'))?.project ?? null : null; };

/** Per epic, its latest live gate when that gate still needs an answer (the one `gateFacts` would call `waiting`). `done`: Complete epics, left out. */
function openGates(gates, done = new Set()) {
  const live = gates.filter((g) => gateLive(g) && g.kind !== 'preflight' && !done.has(g.epic));
  return [...new Set(live.map((g) => g.epic))].map((id) => live.filter((g) => g.epic === id).at(-1)).filter((g) => !g.decided?.answer && (g.options ?? []).length);
}
/** An epic's label as the latest run that queued it named it. */
function labelOf(workspace, id) {
  for (const name of listRuns(workspace).reverse()) {
    const q = (tryJson(path.join(runDirOf(workspace, name), 'state.json'))?.queue ?? []).find((x) => x.id === id);
    if (q?.label) return q.label;
  }
  return id;
}
const standingLimit = (workspace, run) => Number((run ? tryJson(path.join(runDirOf(workspace, run), 'config.json')) : null)?.autoContinue ?? 0) || 0;

/**
 * `driver.mjs continue`: records autopilot's own answer (`standingAnswer`) on every gate the standing
 * answer covers, in the owner's name and marked `standing`, and returns what it did. It never
 * touches a gate that is the owner's to answer, and never runs while a driver does.
 */
export function continueRun(workspace, { by } = {}) {
  const ws = path.resolve(workspace);
  const pid = driverPid(ws);
  if (pid) throw new Error(`autopilot is running here (pid ${pid}): a stop is continued after the run has ended`);
  ensureResumeGates(ws);
  const n = standingLimit(ws, currentRun(ws));
  const continued = []; const left = []; const retired = [];
  // A gate of an epic since finished (by hand, or merged) is never decided: it stops counting, and is listed.
  const done = completeEpics(lastProject(ws), ws);
  for (const g of readGates(ws).filter((x) => gateLive(x) && done.has(x.epic))) {
    const f = path.join(ws, g.file);
    writeJson(f, { ...readJson(f), cleared: { why: CLEARED_COMPLETE, date: new Date().toISOString() } });
    retired.push({ gate: g.file, epic: g.epic, label: labelOf(ws, g.epic), kind: g.kind, why: CLEARED_COMPLETE });
  }
  for (const g of openGates(readGates(ws), done)) {
    const gates = readGates(ws);
    const had = gates.filter((x) => x.epic === g.epic && x.decided?.standing && !x.decided.prototype).length;
    const answer = standingAnswer(g, gates, n);
    if (!answer) {
      const kind = technicalAnswer(g);
      left.push({ gate: g.file, epic: g.epic, label: labelOf(ws, g.epic), kind: g.kind, why: n <= 0 ? 'no standing answer was given for this run' : !kind ? (g.kind === 'resume' ? `not a technical stop: ${plainReason(gateReason(g))}` : `a question only the owner answers (${g.kind})`) : had >= n ? `this epic was already continued ${had} time(s); the standing answer covers ${n}` : 'the only way on is to start the epic over, which is asked first' });
      continue;
    }
    const d = decideGate(ws, g.file, answer, { by, standing: true });
    continued.push({ gate: g.file, epic: g.epic, label: labelOf(ws, g.epic), why: plainReason(gateReason(g)), answer, did: standingDid(g, answer), enters: d.enters, standingAnswers: had + 1, of: n });
  }
  return { autoContinue: n, continued, left, ...(retired.length ? { retired } : {}) };
}

// ---- where things stand: the one answer an attending session asks for --------------------------

/** The runs one attended session chained together: each relaunch's `config.json` names the run it `continues`. Oldest first. */
function runChain(workspace, run) {
  const chain = [];
  for (let name = run; name && !chain.includes(name) && chain.length < 50; name = tryJson(path.join(runDirOf(workspace, name), 'config.json'))?.continues ?? null) {
    if (!exists(runDirOf(workspace, name))) break;
    chain.unshift(name);
  }
  return chain;
}

/**
 * `driver.mjs status`: where the project's autopilot is, and what an attending session does next.
 * Reads only. `next` is decided here, never by a prompt:
 *   attend     a driver is running                    decide    a gate needs the owner
 *   continue   only standing-answer gates are open    readiness there is work that can run
 *   fetch      nothing left to run, and the clone holds merged work the project has not fetched
 *   nothing    otherwise
 * `queue` narrows "work that can run" to the epics the owner confirmed in this session.
 * `relaunch` is set when a decided gate waits to be used: the next run's name and the exact
 * `config.json` that continues the last one (same queue, what is left of its budget).
 */
export function status(project, workspace = null, { queue = null, pluginDir = PLUGIN_DIR } = {}) {
  const root = path.resolve(project); const ws = path.resolve(workspace ?? `${root}.autopilot`);
  const pid = driverPid(ws);
  const run = currentRun(ws); const runDir = run ? runDirOf(ws, run) : null;
  const stateOf = (name) => tryJson(path.join(runDirOf(ws, name), 'state.json'));
  const cfgOf = (name) => tryJson(path.join(runDirOf(ws, name), 'config.json'), {}) ?? {};
  const state = run ? stateOf(run) : null; const lastCfg = run ? cfgOf(run) : {};
  if (lastCfg.mode === 'prototype') lastCfg.mode = 'provisional'; // its name before 3.1.0
  const chain = runChain(ws, run);
  const spentUsd = +chain.reduce((sum, name) => sum + (stateOf(name)?.spentUsd ?? 0), 0).toFixed(2);
  // The budget the owner set when the chain began; raised mid-chain when they have since set a higher one for the project.
  const firstBudget = (chain.length ? cfgOf(chain[0]).runBudgetUsd ?? stateOf(chain[0])?.runBudgetUsd : null) ?? null;
  let projectBudget = null; try { projectBudget = projectSettings(root).runBudgetUsd ?? null; } catch { /* reported at launch */ }
  const runBudgetUsd = firstBudget == null ? null : Math.max(firstBudget, Number(projectBudget) || 0);
  const n = standingLimit(ws, run);
  // Inside the step in flight: the command the session has open, and whether it is waiting for the owner.
  const active = pid ? (state?.queue ?? []).find((q) => q.step) : null;
  const inFlight = active ? openCommand(path.join(runDir, 'epics', active.id, active.step.name, 'hooks.jsonl')) : null;
  const epics = (state?.queue ?? []).map((q) => ({ id: q.id, label: q.label ?? q.id, state: q.state, step: q.step?.name ?? null, minutes: Math.round((q.wallMs ?? 0) / 60000) + (q.step?.startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(q.step.startedAt)) / 60000)) : 0), costUsd: q.costUsd ?? 0 }));
  const merged = new Map(chain.flatMap((name) => (stateOf(name)?.queue ?? []).filter((q) => q.state === 'MERGED').map((q) => [q.id, q.label ?? q.id])));
  // What the merged work leaves not proven for real: the reviewer's findings of that kind and the verifier's own "not run" lines.
  const seen = chain.flatMap((name) => (stateOf(name)?.queue ?? []).filter((q) => q.state === 'MERGED' && (q.seen ?? []).length).map((q) => ({ epic: q.id, label: q.label ?? q.id, lines: q.seen })));
  const unprovenAll = chain.flatMap((name) => (stateOf(name)?.queue ?? []).filter((q) => q.state === 'MERGED').flatMap((q) => (q.unproven ?? []).map((u) => ({ epic: q.id, label: q.label ?? q.id, source: u.source, kind: u.kind ?? null, text: u.text }))));
  // What the final check saw wrong and left: a known defect, not something unproven, so it has its own list.
  const left = unprovenAll.filter((u) => u.kind === 'left').map(({ kind, source, ...u }) => u);
  const unproven = unprovenAll.filter((u) => u.kind !== 'left').map(({ kind, ...u }) => u);

  // Small fixes the final check made on the owner's standing answer, for the closing screen: what was asked and what changed.
  // `auto`: a fix autopilot itself allowed on the standing answer for technical stops (product code, or over the small-fix size). Only the verifier judged it.
  const fixes = chain.flatMap((name) => (stateOf(name)?.queue ?? []).filter((q) => q.state === 'MERGED' && (q.fixedAtWrapup?.standing || q.fixedAtWrapup?.auto)).map((q) => ({ epic: q.id, label: q.label ?? q.id, files: q.fixedAtWrapup.files, asked: q.fixedAtWrapup.standing ? q.fixedAtWrapup.standing.map((x) => x.question) : [q.fixedAtWrapup.auto.question].filter(Boolean), ...(q.fixedAtWrapup.auto ? { auto: true } : {}) })));

  // Screens merged without the owner's look ("look": "after"), with where the pictures are, for the closing screen.
  const unlooked = chain.flatMap((name) => (stateOf(name)?.queue ?? []).filter((q) => q.state === 'MERGED' && q.unlooked).map((q) => ({ epic: q.id, label: q.label ?? q.id, pictures: q.unlooked.pictures ?? [], ...(q.unlooked.prototype ? { prototype: true } : {}), ...(q.unlooked.claudeMd ? { claudeMd: q.unlooked.claudeMd } : {}) })));
  // Requirements merged in a provisional run that only a person can observe and nobody did: recorded as not verified, with how to check each later.
  const unobserved = chain.flatMap((name) => (stateOf(name)?.queue ?? []).filter((q) => q.state === 'MERGED').flatMap((q) => (q.unobserved ?? []).map((u) => ({ epic: q.id, label: q.label ?? q.id, tor: u.tor, clauses: u.clauses ?? [], check: reverifyCommand(q.id, u.tor) }))));
  // What a provisional run answered with a session's own recommendation, each with what the owner needs to review it.
  const tookOf = new Map(chain.flatMap((name) => (stateOf(name)?.queue ?? []).flatMap((q) => (q.prototype ?? []).map((x) => [x.gate, x]))));

  // What sessions did with the owner's connectors (#43), per epic over the chain: one line each, the off-site pages a
  // browser call ended on and the refused calls, for the closing screen. Only epics that used one.
  const useOf = new Map();
  for (const name of chain) for (const q of stateOf(name)?.queue ?? []) {
    const u = epicConnectorUse(path.join(runDirOf(ws, name), 'epics', q.id), (q.sessions ?? []).map((x) => x.name));
    if (u.calls.length || u.denied.length) useOf.set(q.id, { label: q.label ?? q.id, uses: [...(useOf.get(q.id)?.uses ?? []), u] });
  }
  const connectors = [...useOf].map(([epic, { label, uses }]) => { const u = mergeConnectorUse(uses); return { epic, label, line: connectorLine(u), offsite: u.offsite, refused: u.denied.map((d) => d.tool) }; });

  // Gates as they are, plus the ones `report` or `continue` would write for a dead-end park (reported, not written).
  const toWrite = pid ? [] : missingResumeGates(ws);
  const gates = [...readGates(ws).filter((g) => !toWrite.some((m) => m.replaces === g.file)), ...toWrite.map((m) => ({ file: `gates/${m.name}`, ...m.gate }))];
  const done = completeEpics(root, ws); // a gate of an epic finished since (by hand, or merged) waits for nothing
  const open = openGates(gates, done); // while a driver runs these are the questions already asked; they can be answered now and are used by the next run
  // A technical stop autopilot may not answer itself any more is put to the owner as one plain question, in place of the gate's own.
  const brief = (g) => { const lim = atLimitAsk(g, gates, n, labelOf(ws, g.epic)); return { file: g.file, epic: g.epic, label: labelOf(ws, g.epic), kind: g.kind, question: lim?.question ?? g.question ?? null, ...(lim ? { options: lim.options, atLimit: { stops: lim.stops } } : {}), ...(g.kind === 'resume' || technicalAnswer(g) ? { why: plainReason(gateReason(g)) } : {}), ...(g.live?.length ? { live: g.live.map((l) => l.tor) } : {}) }; };
  const covered = open.filter((g) => standingCovers(g, gates, n));
  const waiting = open.filter((g) => !covered.includes(g));
  // What autopilot decided in the owner's name in this chain of runs, for the closing screen.
  const decidedForYou = gates.filter((g) => g.decided?.standing && !g.cleared && chain.includes(g.decided.run ?? g.run)).map((g) => (g.decided.prototype
    ? { gate: g.file, epic: g.epic, label: labelOf(ws, g.epic), prototype: true, kind: g.kind, tor: g.tor ?? null, answer: g.decided.answer, did: prototypeDid(g), question: g.question ?? null, ...(tookOf.get(g.file)?.was ? { was: tookOf.get(g.file).was } : {}), ...(tookOf.get(g.file)?.proposed ? { proposed: tookOf.get(g.file).proposed } : {}), ...(g.void || g.superseded ? { dropped: true } : {}) }
    : { gate: g.file, epic: g.epic, label: labelOf(ws, g.epic), did: standingDid(g, g.decided.answer), why: plainReason(gateReason(g)) }));

  const out = {
    next: 'nothing', why: null, project: root, workspace: ws, run, runDir, running: pid ? { pid } : null, integration: state?.integration ?? null,
    epics, spentUsd, runBudgetUsd, endBy: lastCfg.endBy ?? null, autoContinueLimit: n, realSpend: typeof lastCfg.realSpend === 'boolean' ? lastCfg.realSpend : null, attended: typeof lastCfg.attended === 'boolean' ? lastCfg.attended : null, mode: MODES.includes(lastCfg.mode) ? lastCfg.mode : null,
    inFlight: inFlight ? { description: inFlight.description, minutes: inFlight.minutes, needsYou: inFlight.needsYou } : null,
    waiting: waiting.map(brief), autoContinue: covered.map(brief), decidedForYou, merged: [...merged.values()], unproven, left, seen, connectors, unlooked, unobserved, look: (() => { try { return projectSettings(root).look === 'after' ? 'after' : 'before'; } catch { return 'before'; } })(), fixes, smallFixes: smallFixLimits({ smallFixes: lastCfg.smallFixes ?? tryJson(path.join(ws, 'settings.json'), {})?.smallFixes }), friction: friction(ws, chain), sync: null, refuse: [], relaunch: null, say: [],
  };
  const say = () => {
    const word = { MERGED: 'finished and merged', PARKED: 'stopped, waiting', FAILED: 'did not pass', BLOCKED: 'not started', SKIPPED: 'skipped', QUEUED: pid ? 'waiting its turn' : 'not started' };
    out.say = [
      snapshotLine(state, { running: !!pid, spentUsd, runBudgetUsd }),
      epics.length ? epics.map((e) => `${shortLabel(e.label)}: ${word[e.state] ?? (pid ? `in progress (${e.minutes} min so far)` : 'interrupted')}`).join('; ') : 'No epic has been queued yet.',
      out.waiting.length ? `${out.waiting.length} question(s) wait for you.` : out.autoContinue.length ? 'It stopped for a technical reason and can continue.' : inFlight?.needsYou ? `It is waiting for you at this computer: ${inFlight.description || 'a step needs you'} (${inFlight.minutes} min so far).` : pid ? `Nothing needs you right now${activity(state) ? `: it is ${activity(state)}` : ''}${inFlight && inFlight.minutes >= 1 ? ` (one command running ${inFlight.minutes} min${inFlight.description ? `: "${inFlight.description}"` : ''})` : ''}.` : 'Nothing needs you right now.',
    ];
    return out;
  };
  if (pid) {
    try { const integration = state?.integration ?? detectIntegration(root); out.sync = syncReport(root, ws, integration, { running: true }); } catch { /* the dashboard goes without it */ }
    out.next = 'attend'; out.why = 'a driver is running'; return say();
  }

  // Not running: what could run next, read as readiness reads it.
  let pre = null; let launch = null;
  try {
    // Read as the last run was confirmed: the epics the owner queued on purpose, and a rehearsal's stand-in.
    const config = loadConfig(ws, { project: root, overrides: { explicit: lastCfg.explicit ?? [], ...(lastCfg.allowTestDouble ? { allowTestDouble: true } : {}) } });
    const integration = detectIntegration(root);
    const sync = syncFacts(root, ws, integration);
    const clone = path.join(ws, 'clone');
    pre = preflight(root, config, {
      pluginDir, gates: gateFacts(ws, integration, { integrationTip: sync.state === 'project-ahead' ? sync.projectTip : null }),
      sidecarText: sync.state === 'clone-ahead' ? (rel) => gitShow(clone, integration, rel) : null,
    });
    launch = launchFacts(root, ws, config, { epics: pre.epics });
    out.integration = integration;
    out.sync = syncReport(root, ws, integration);
    out.refuse = [...pre.refuse, ...launch.refuse];
    for (const e of pre.epics) if (e.eligibility === 'complete' && e.reasons.some((r) => /not fetched into the project yet/.test(r))) merged.set(e.id, e.label);
    out.merged = [...merged.values()];
  } catch (err) { out.refuse = [err.message]; }

  const interrupted = launch?.lastRun?.status === 'interrupted';
  const held = new Set(open.map((g) => g.epic));
  const runnable = (pre?.epics ?? []).filter((e) => e.eligibility === 'eligible' && !held.has(e.id) && (!queue || queue.includes(e.id)));
  // Skipped only because it is paused or someone else's: readiness may offer it to be queued explicitly. Never once a queue is confirmed.
  const askable = queue ? [] : (pre?.epics ?? []).filter((e) => e.eligibility === 'skip' && !held.has(e.id) && e.reasons.filter((r) => !UNDECIDED_NOTE.test(r)).length > 0 && e.reasons.filter((r) => !UNDECIDED_NOTE.test(r)).every((r) => /queue it explicitly/.test(r)));

  // A decided gate waits to be used: the run that continues the last one, exactly as the owner confirmed it.
  if (pre && launch && state && !interrupted && !out.refuse.length) {
    const byId = new Map(pre.epics.map((e) => [e.id, e]));
    // The order the owner confirmed: this run's, or (a run that started without one) the nearest earlier run's in the chain.
    const confirmed = runChain(ws, run).reverse().map(cfgOf).find((c) => Array.isArray(c.queue))?.queue;
    const before = confirmed ?? (state.queue ?? []).map((q) => q.id);
    const ids = before.filter((id) => byId.get(id)?.eligibility === 'eligible' && !held.has(id));
    const left = runBudgetUsd == null ? null : +(runBudgetUsd - spentUsd).toFixed(2);
    // A run that stopped at its budget waits only while nothing is left: once the owner raises the budget
    // (`configure --run-budget`), the chain goes on with what the raise left.
    const limit = state.stoppedBecause === 'end time' ? 'end time' : left !== null && left <= 0 ? 'run budget' : null;
    if (ids.some((id) => ['resume', 'fresh'].includes(byId.get(id).gate?.state)) && !limit) {
      // Launch questions this chain never put to the owner (seen live: a chain started before the question existed ran
      // on with `attended` unset). Asked once: the answer goes into the config and every later relaunch carries it.
      const ask = [...(typeof lastCfg.realSpend !== 'boolean' && (launch.env?.copy ?? []).length ? ['realSpend'] : []), ...(typeof lastCfg.attended !== 'boolean' ? ['attended'] : []), ...(!MODES.includes(lastCfg.mode) ? ['mode'] : [])];
      out.relaunch = {
        run: launch.run, runDir: launch.runDir, ask,
        config: { project: root, queue: ids, explicit: (lastCfg.explicit ?? []).filter((id) => ids.includes(id)), endBy: lastCfg.endBy && Date.parse(lastCfg.endBy) > Date.now() ? lastCfg.endBy : null, runBudgetUsd: left ?? launch.config.runBudgetUsd, autoContinue: n, continues: run, ...(typeof lastCfg.realSpend === 'boolean' ? { realSpend: lastCfg.realSpend } : {}), ...(typeof lastCfg.attended === 'boolean' ? { attended: lastCfg.attended } : {}), ...(MODES.includes(lastCfg.mode) ? { mode: lastCfg.mode } : {}), ...(lastCfg.smallFixes !== undefined ? { smallFixes: lastCfg.smallFixes } : {}), ...(lastCfg.allowTestDouble ? { allowTestDouble: true } : {}) },
      };
    }
  }

  // What could run now, whatever \`next\` says: an epic no waiting question holds (a look put off with "Not now"
  // must not hide independent work, Pilot Light 2026-11-24).
  out.ready = [...runnable, ...askable].map((e) => e.label);
  if (interrupted) { out.next = 'readiness'; out.why = 'the last run did not finish'; }
  else if (waiting.length) { out.next = 'decide'; out.why = `${waiting.length} gate(s) need the owner${out.ready.length ? `; meanwhile ${out.ready.length} epic(s) can run (\`ready\`)` : ''}`; }
  else if (covered.length) { out.next = 'continue'; out.why = `${covered.length} technical stop(s) the standing answer covers`; }
  else if (runnable.length) { out.next = 'readiness'; out.why = out.relaunch ? 'a decided gate waits to be used' : `${runnable.length} epic(s) can run`; }
  else if (askable.length) { out.next = 'readiness'; out.why = `${askable.length} epic(s) can be queued explicitly`; }
  else if (out.sync?.state === 'clone-ahead') { out.next = 'fetch'; out.why = 'merged work waits in the clone'; }
  else out.why = out.refuse.length ? 'nothing can run' : 'nothing is left to run';
  // The last run stopped because the project's tests already failed: which ones, in the runner's words.
  const red = state?.stoppedBecause === 'base red' && state.baseRed && !state.baseRed.couldNotRun ? failingTests(state.baseRed.tail) : [];
  if (red.length) out.why += `; the last run stopped because these tests failed on ${state.integration ?? 'the integration line'}: ${red.join('; ')}`;
  return say();
}

/** Records a person's answer in a gate file (§6.8). The driver never chooses the answer; it only writes what it is given. */
export function decideGate(workspace, gateName, answer, { by, note, observations, standing = false } = {}) {
  const file = path.join(workspace, 'gates', path.basename(gateName));
  if (!exists(file)) throw new Error(`no gate file ${file}`);
  const gate = readJson(file);
  if (gate.decided?.used) throw new Error(`${path.basename(file)} was already decided and used (${gate.decided.used.date})`);
  if (gate.void || gate.superseded || gate.cleared) throw new Error(`${path.basename(file)} no longer applies: the epic was entered again since (${gate.void ? `void: ${gate.void.why}` : gate.superseded ? 'superseded' : 'cleared'})`);
  // The at-limit question for a technical stop (`atLimitAsk`): "Try again" is the owner's, and records the answer that
  // takes this stop forward; autopilot picks which. "Leave it for now" decides nothing.
  let asked = null;
  const said = String(answer ?? '').trim().toLowerCase();
  if (!standing && said === LEAVE_IT.toLowerCase() && (technicalAnswer(gate) || (gate.options ?? []).includes(LEAVE_IT))) return { gate: path.basename(file), epic: gate.epic, kind: gate.kind, decided: null, effect: 'none', enters: null };
  if (!standing && technicalAnswer(gate) && said === TRY_AGAIN.toLowerCase()) { asked = TRY_AGAIN; answer = technicalAnswer(gate); }
  const options = asked ? [answer] : gate.options ?? [];
  if (!options.length) throw new Error(`${path.basename(file)} (${gate.kind}) has no answer to record: ${gate.kind === 'preflight' ? 'the fix is in the project, and the gate clears when preflight passes' : 'it offers no options, so nothing is decided here'}`);
  const label = options.find((o) => o.trim().toLowerCase() === String(answer).trim().toLowerCase());
  if (options.length && !label) throw new Error(`"${answer}" is not one of this gate's options: ${options.map((o) => `"${o}"`).join(', ')}`);
  if (!String(answer ?? '').trim()) throw new Error('an answer is required');
  // A look is evidence: the verify session records the owner's words as the operator's observation,
  // and a fix round is briefed from them. An answer alone says nothing about what was checked.
  // The look as a short form: one yes or no per Then line of the requirement (`gate.checks`). The
  // answers are the owner's, each to a line they were shown, so together they are a complete record
  // and no free text is needed for "Looks right". A "no" is "Not right" and needs their words.
  let obs = null;
  if (gate.kind === 'human-check' && observations !== undefined) {
    const given = typeof observations === 'string' ? JSON.parse(observations) : observations;
    const checks = gate.checks ?? [];
    if (!checks.length) throw new Error(`${path.basename(file)} lists no lines to confirm: answer it with --note`);
    obs = checks.map((c) => {
      const a = (given ?? []).find((x) => Number(x.n) === c.n);
      const v = String(a?.answer ?? '').trim().toLowerCase();
      if (v !== 'yes' && v !== 'no') throw new Error(`line ${c.n} ("${c.clause}") needs a yes or a no; "could not tell" is not an answer to record — look again, or decide later`);
      const how = String(a.how ?? '').trim().toLowerCase();
      if (how && how !== 'live' && how !== 'pictures') throw new Error(`line ${c.n}: how it was seen is "live" or "pictures", not "${a.how}"`);
      if (v === 'yes' && how === 'pictures' && (gate.live ?? []).some((l) => l.tor === c.tor)) throw new Error(`line ${c.n} ("${c.clause}") was seen only in pictures: that is not the owner's observation of ${c.tor}, which must be seen for real — check it for real, or decide later`);
      return { n: c.n, tor: c.tor, clause: c.clause, answer: v, ...(how ? { how } : {}), ...(String(a.note ?? '').trim() ? { note: String(a.note).trim() } : {}) };
    });
    const anyNo = obs.some((o) => o.answer === 'no');
    if (anyNo && label !== ANSWERS.notRight) throw new Error(`a "no" on a line means the answer is "${ANSWERS.notRight}", not "${label}"`);
    if (!anyNo && label !== ANSWERS.looksRight) throw new Error(`every line was answered yes, so the answer is "${ANSWERS.looksRight}"; to answer "${label}", say no to the line that is wrong`);
    if (anyNo && !String(note ?? '').trim() && !obs.some((o) => o.answer === 'no' && o.note)) throw new Error('a "no" needs --note: what is wrong, and what it should look like instead, in your own words');
  }
  if (gate.kind === 'human-check' && !obs && !String(note ?? '').trim()) throw new Error(`a human-check answer needs --note: ${label === ANSWERS.notRight ? 'what you looked at and what is wrong' : 'what you did to check and what you saw'}, in your own words${(gate.checks ?? []).length ? ' (or --observations: a yes or no for each line the gate lists)' : ''}`);
  if (obs) {
    const lines = obs.map((o) => `${o.answer === 'yes' ? 'Yes' : 'No'}: ${o.clause}${o.note ? ` — ${o.note}` : ''}`);
    note = [`Confirmed line by line by the owner. ${lines.join(' ')}`, String(note ?? '').trim()].filter(Boolean).join(' ');
  }
  // A second look after the verifier asked for more: what was recorded before is kept and added to.
  if (gate.kind === 'human-check' && gate.earlier) {
    if (gate.earlier.note) note = `${gate.earlier.note} Added after the verifier asked: ${String(note).trim()}`;
    obs = [...(gate.earlier.observations ?? []).filter((o) => o.answer === 'yes'), ...(obs ?? [])];
  }
  const run = gate.run && exists(runDirOf(workspace, gate.run)) ? gate.run : currentRun(workspace);
  const project = tryJson(path.join(workspace, 'settings.json'))?.project ?? (run ? tryJson(path.join(runDirOf(workspace, run), 'config.json'))?.project : null) ?? null;
  const who = by || ownerName(project);
  if (!who) throw new Error('no name to record: this project has no git config user.name and no commit by a person; pass --by "<your name>"');
  gate.decided = { answer: label ?? String(answer).trim(), by: who, date: today(), scope: 'next-run', ...(String(note ?? '').trim() ? { note: String(note).trim() } : {}), ...(obs?.length ? { observations: obs } : {}), ...(standing ? { standing: true } : {}), ...(asked ? { asked } : {}) }; // `asked`: what the owner was offered when it was not the gate's own option. `standing`: the owner's answer given once at launch, applied by `continue`
  writeJson(file, gate);
  if (run && exists(path.join(runDirOf(workspace, run), 'state.json'))) writeReport(runDirOf(workspace, run));
  // Every decided gate resumes its epic in the next run; the gate's `resume` command stays in the file as a record.
  const entry = gateEntry(gate);
  return {
    gate: path.basename(file), epic: gate.epic, kind: gate.kind, decided: gate.decided, effect: 'resume',
    enters: entry?.fresh ? 'PLAN (from scratch, on a fresh branch)' : entry?.phase ? resumePhase(workspace, gate, entry.phase) : null,
    validWhile: entry?.fresh ? null : `${gate.branch} stays at ${String(gate.branchTip).slice(0, 9)}${bringsUpToDate(gate) ? '' : ' and still merges cleanly into the integration line'}; otherwise autopilot asks how to go on`,
    resume: gate.resume ?? null,
  };
}

/**
 * Who answers a gate when no `--by` is given: the project's `git config user.name`, else the author of the newest commit
 * that a person made (seen live: a repository with no user.name whose commits carried a name set elsewhere). Never an
 * autopilot name: the answer may become the approver of a correction in the project's change record. '' when none.
 */
export function ownerName(project) {
  if (!project || !exists(project)) return '';
  const set = sh('git', ['config', 'user.name'], { cwd: project }).out.trim();
  const robot = (n) => !n || /autopilot/i.test(n) || UNAPPROVED_BY.includes(n);
  if (set && !robot(set)) return set;
  // The owner's own commits first, when an email is configured: in a shared repository the newest commit may be a teammate's.
  const email = sh('git', ['config', 'user.email'], { cwd: project }).out.trim().toLowerCase();
  const authors = sh('git', ['log', '-n', '500', '--format=%ae%x09%an'], { cwd: project }).out.split('\n').map((l) => { const [e, ...n] = l.split('\t'); return { email: e.trim().toLowerCase(), name: n.join('\t').trim() }; }).filter((a) => !robot(a.name));
  return (email ? authors.find((a) => a.email === email) : null)?.name ?? authors[0]?.name ?? '';
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
  return new Run({ workspace: ws, runName: name, config, pluginDir, verbose, loadArgs: { project: root, run: name, overrides } }).run({ resume });
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { _: [], all: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['dryRun', 'resume', 'json', 'verbose', 'help', 'allowTestDouble', 'probe', 'once', 'replay'].includes(key)) o[key] = true;
    else { o[key] = argv[++i]; (o.all[key] = o.all[key] ?? []).push(o[key]); } // `all`: every value of a flag given more than once (--gate, --budget)
  }
  return o;
}

async function main(argv) {
  const o = parseArgs(argv);
  const cmd = o._[0];
  const usage = 'usage: driver.mjs preflight --project <dir> [--workspace <dir>] [--allow-test-double] [--json]\n       driver.mjs prepare --project <dir> [--workspace <dir>] [--gate <command>]… [--probe] [--allow-test-double]\n       driver.mjs configure --project <dir> [--setup <command>] [--copy path,path] [--read-only dir,dir] [--network host,host] [--budget <step>.<key>=<value>]…\n       driver.mjs run [--project <dir>] [--workspace <dir>] [--run <name>] [--queue id,id] [--explicit id,id] [--dry-run] [--resume] [--claude-bin <path>] [--allow-test-double] [--verbose]\n       driver.mjs stop --workspace <dir>\n       driver.mjs report --workspace <dir> [--run <name>]\n       driver.mjs decide --workspace <dir> --gate <file> --answer <text> [--note <text>] [--by <name>]\n       driver.mjs watch --workspace <dir> [--run <name>] [--heartbeat-min <n>] [--once [--after <n>]] [--replay]\n       driver.mjs status --project <dir> [--workspace <dir>] [--queue id,id] [--json]\n       driver.mjs continue --workspace <dir> [--json]\n       (--state is an alias of --workspace; the default workspace is <project>.autopilot)';
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
    pre.launch = launchFacts(root, ws, config, { epics: pre.epics });
    if (o.json) console.log(JSON.stringify(pre, null, 2));
    else { pre.refuse.forEach((r) => console.log(`REFUSE: ${r}`)); pre.epics.forEach((e) => console.log(`${e.label}  [${e.eligibility}${e.humanCheck ? ', human check' : ''}]  deps: ${e.deps.join(', ') || '—'}  ${e.reasons.join('; ')}`)); }
    return pre.ok ? 0 : 1;
  }
  if (cmd === 'prepare') {
    if (!o.project) throw new Error('prepare needs --project');
    const root = path.resolve(o.project);
    const ws = path.resolve(wsArg ?? `${root}.autopilot`);
    const config = loadConfig(ws, { project: root, overrides: o.allowTestDouble ? { allowTestDouble: true } : {} });
    const result = await new Run({ workspace: ws, runName: '(prepare)', config, pluginDir: PLUGIN_DIR, verbose: false }).prepare({ probe: !!o.probe, gates: o.all.gate ?? [] });
    result.env = envFacts(root, ws, config);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (cmd === 'configure') {
    if (!o.project) throw new Error('configure needs --project');
    const list = (v) => (v === undefined ? undefined : String(v).split(','));
    if ([o.setup, o.copy, o.readOnly, o.network, o.budget, o.look, o.runBudget, o.humanCheck].every((v) => v === undefined)) throw new Error('configure needs --setup, --copy, --read-only, --network, --budget, --run-budget, --look or --human-check (an empty value removes the entry)');
    const root = path.resolve(o.project);
    console.log(JSON.stringify(configureProject(root, { setup: o.setup, look: o.look, runBudget: o.runBudget, humanCheck: o.humanCheck, copy: list(o.copy), readOnly: list(o.readOnly), network: list(o.network), budgets: o.all.budget?.flatMap((b) => b.split(',')), workspace: path.resolve(wsArg ?? `${root}.autopilot`) }), null, 2));
    return 0;
  }
  if (cmd === 'run') {
    if (!o.project && !wsArg) throw new Error('run needs --project or --workspace');
    const result = await run({ project: o.project, workspace: wsArg, run: o.run, queue: o.queue ? o.queue.split(',').filter(Boolean) : undefined, explicit: o.explicit ? o.explicit.split(',').filter(Boolean) : undefined, resume: !!o.resume, claudeBin: o.claudeBin, allowTestDouble: !!o.allowTestDouble, verbose: !!o.verbose || process.stdout.isTTY, dryRun: !!o.dryRun });
    return o.dryRun ? (result.pre.ok ? 0 : 1) : 0;
  }
  if (cmd === 'status') {
    if (!o.project) throw new Error('status needs --project');
    const s = status(o.project, wsArg ?? null, { queue: o.queue ? o.queue.split(',').filter(Boolean) : null });
    console.log(o.json ? JSON.stringify(s, null, 2) : [...s.say, `next: ${s.next} (${s.why})`].join('\n'));
    return 0;
  }
  if (!wsArg && ['stop', 'report', 'decide', 'watch', 'continue'].includes(cmd)) throw new Error(`${cmd} needs --workspace`);
  const ws = path.resolve(wsArg ?? '.');
  if (cmd === 'continue') {
    const r = continueRun(ws, { by: o.by });
    console.log(o.json ? JSON.stringify(r, null, 2) : [...r.continued.map((c) => `decided for the owner, ${c.label}: ${c.why}, so autopilot ${c.did} (${c.standingAnswers} of ${c.of})`), ...r.left.map((l) => `left for the owner ${l.label}: ${l.why}`), ...(r.retired ?? []).map((x) => `no longer counts, ${x.label}: ${x.why} (${x.gate})`)].join('\n') || 'nothing to continue');
    return r.continued.length ? 0 : 1;
  }
  if (cmd === 'watch') {
    const num = (v, d) => (v === undefined || Number.isNaN(Number(v)) ? d : Number(v));
    await watch({ workspace: ws, run: o.run ?? null, heartbeatMin: num(o.heartbeatMin, 10), once: !!o.once, onceMin: num(o.onceMin, 10), longMin: num(o.longMin, 3), routine: !!o.verbose, replay: !!o.replay, after: o.after === undefined ? null : num(o.after, 0), pollMs: num(o.pollMs, 2000), graceMs: num(o.graceMs, 15000) });
    return 0;
  }
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
    if (!tryJson(path.join(ws, 'lock'))?.pid || !pidAlive(tryJson(path.join(ws, 'lock')).pid)) ensureResumeGates(ws); // never while a run is going
    const r = writeReport(runDirOf(ws, name));
    console.log(`${path.join(runDirOf(ws, name), 'report.md')} (${r.epics.length} epic(s); ${r.stoppedBecause ?? 'still running'})`);
    return 0;
  }
  if (cmd === 'decide') {
    if (!o.gate || o.answer === undefined) throw new Error('decide needs --workspace, --gate and --answer');
    console.log(JSON.stringify(decideGate(ws, o.gate, o.answer, { by: o.by, note: o.note, observations: o.observations }), null, 2));
    return 0;
  }
  throw new Error(`unknown command ${cmd}\n${usage}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`autopilot: ${err.message}`); process.exitCode = 2; });
}
