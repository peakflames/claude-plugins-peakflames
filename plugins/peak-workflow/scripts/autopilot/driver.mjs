#!/usr/bin/env node
// peak-workflow autopilot driver (PoC, P1). Node 22+, no dependencies.
//
//   node driver.mjs preflight --project <dir> [--json]
//   node driver.mjs run --project <dir> [--state <dir>] [--queue id,id] [--dry-run] [--resume]
//                       [--claude-bin <path>]
//   node driver.mjs stop --state <dir>
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

export const DRIVER_VERSION = '0.1.0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_DIR = path.resolve(HERE, '..', '..');

const TERMINAL = new Set(['MERGED', 'PARKED', 'FAILED', 'SKIPPED', 'BLOCKED']);
const KINDS = {
  plan: { prefix: 'plan', role: 'planner', state: 'PLAN' },
  build: { prefix: 'build', role: 'builder', state: 'BUILD' },
  verify: { prefix: 'verify', role: 'verifier', state: 'VERIFY' },
  planFix: { prefix: 'plan-fix', role: 'planner', state: 'FIX_PLAN' },
  fix: { prefix: 'fix', role: 'builder', state: 'FIX_BUILD' },
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
  return {
    claudeMd: text,
    testCommand: tests ? tests[1].trim() : null,
    testDirs: dirs ? dirs[1].replace(/`/g, '').split(/[,\s]+/).filter(Boolean).map((d) => (d.endsWith('/') ? d : d + '/')) : [],
    projectType: type ? type[1].trim() : null,
  };
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
    claudeBin: 'claude',
    budgets: {
      plan: { wallMin: 30, turns: 80, usd: 5, model: 'sonnet' },
      build: { wallMin: 90, turns: 200, usd: 15, model: 'sonnet' },
      verify: { wallMin: 45, turns: 150, usd: 10, model: 'opus' },
      planFix: { wallMin: 20, turns: 60, usd: 4, model: 'sonnet' },
      fix: { wallMin: 60, turns: 150, usd: 12, model: 'sonnet' },
      audit: { wallMin: 15, turns: 40, usd: 3, model: 'opus' },
      testRunMin: 10,
    },
    audit: { parkOn: ['stand-in', 'test-weakened', 'cannot-fail', 'never-ran-real'] },
    scope: { allow: [], lockfiles: [] },
    timing: { pollMs: 30000, killGraceMs: 30000, infraRetryMs: 300000 },
  };
}

export function loadConfig(stateDir, project, overrides = {}) {
  const file = path.join(stateDir, 'config.json');
  const saved = exists(file) ? readJson(file) : {};
  const root = path.resolve(project ?? saved.project ?? '');
  if (!project && !saved.project) throw new Error('no project: pass --project, or a --state directory that holds config.json');
  const cfg = merge(merge(defaultConfig(root), saved), overrides);
  cfg.project = root;
  return cfg;
}

// ---------------------------------------------------------------------------------------------
// Project reading and preflight
// ---------------------------------------------------------------------------------------------

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

function torLifecycle(pluginDir, root, ...args) {
  return sh('sh', [path.join(pluginDir, 'scripts', 'tor-lifecycle'), '--root', root, ...args], { cwd: root });
}

/** Reads every phase index, spec and sidecar under `root` (a checked-out working tree). */
export function readEpics(root) {
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
    const sidecar = parseSidecar(exists(sidecarPath) ? read(sidecarPath) : '');
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
 * Preflight: which epics may run unattended. Reads only files (and `tor-lifecycle`), so it is
 * safe on the user's repository and in a dry run.
 */
export function preflight(root, config, { pluginDir = PLUGIN_DIR } = {}) {
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

  const epics = readEpics(root).map((e) => {
    const reasons = []; let eligibility = 'eligible'; let humanCheck = false;
    const set = (level, why) => { reasons.push(why); if (eligibility !== 'skip' && eligibility !== 'complete') eligibility = level; };
    if (e.status === 'Complete') { eligibility = 'complete'; reasons.push('already Complete'); return { ...e, eligibility, humanCheck, reasons }; }
    if (e.status !== 'Not Started' && !explicit.has(e.id)) set('skip', `status is ${e.status}; resume it by hand or queue it explicitly`);
    if (!e.anchors.length) set('skip', 'no Requirements Anchors');
    if (embedded) set('skip', 'hardware project: never unattended');
    for (const who of [e.owner, e.plannedBy]) {
      if (me && who && who !== '—' && who.toLowerCase() !== me && !explicit.has(e.id)) { set('skip', `belongs to ${who}; queue it explicitly to take it`); break; }
    }
    for (const tor of e.anchors) {
      const r = reqs[tor]; const s = states[tor];
      if (!r || (s && s.live === false)) { set('park', `${tor} is superseded, retired or unknown: a requirements decision`); continue; }
      if (r.safety || s?.safety) set('skip', `${tor} is a Safety requirement (hardware-in-the-loop)`);
      else if (/operator-observed/.test(r.text)) { humanCheck = true; reasons.push(`${tor} is operator-observed: parks for a person before verify`); }
    }
    if (ui && e.hasScreens) { humanCheck = true; reasons.push('UI epic: parks for a human look before verify'); }
    if (tbd) set('park', 'CLAUDE.md still has values to decide (TBD / Not decided yet)');
    return { ...e, eligibility, humanCheck, reasons };
  });
  return { ok: refuse.length === 0, refuse, testCommand: config.testCommand ?? facts.testCommand, testDirs: config.testDirs?.length ? config.testDirs : facts.testDirs, epics };
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
    },
  };
}

/** The exact host-mode command for one step (SPIKE.md "Host mode"). Pure: used by the dry run too. */
export function sessionCommand(config, { kind, epicId, stateDir, stepDir, pluginDir = PLUGIN_DIR, sessionId, appendFiles = [] }) {
  const b = config.budgets[kind];
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
  for (const f of appendFiles) args.push('--append-system-prompt-file', f);
  const env = {
    AUTOPILOT_STATE: stateDir,
    AUTOPILOT_ROLE: KINDS[kind].role,
    AUTOPILOT_EPIC: epicId,
    AUTOPILOT_STEP: stepDir,
    AUTOPILOT_HOOKS: path.join(pluginDir, 'scripts', 'autopilot', 'hooks'),
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
    BASH_MAX_TIMEOUT_MS: '900000',
    BASH_DEFAULT_TIMEOUT_MS: '300000',
    CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '60000',
  };
  return { bin: config.claudeBin, args, env, cwd: path.join(stateDir, 'clone'), wallMin: b.wallMin };
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

/** `prompt.md` for a build session: Claude Code's clear-context handoff, minus the transcript pointer. */
export function buildPrompt(plan, pluginDir = PLUGIN_DIR) {
  return 'Implement the following plan:\n\n' + plan.replaceAll('${CLAUDE_PLUGIN_ROOT}', pluginDir);
}

/**
 * Plan lint (rule R9; SPIKE.md correction 7: headings, not full template text). P2's hook runs
 * the same function at ExitPlanMode; the driver always re-runs it on the captured `plan.md`.
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

// ---------------------------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------------------------

export function dryRun({ project, stateDir, config, pluginDir = PLUGIN_DIR, out = console.log }) {
  const pre = preflight(project, config, { pluginDir });
  const queue = buildQueue(pre, config);
  const integration = detectIntegration(project);
  const version = readJson(path.join(pluginDir, '.claude-plugin', 'plugin.json')).version;
  const p = (s = '') => out(s);
  p('Autopilot dry run — nothing is invoked and nothing is written');
  p(`Project:          ${project}`);
  p(`State directory:  ${stateDir}`);
  p(`Plugin:           ${pluginDir} (peak-workflow ${version}, driver ${DRIVER_VERSION})`);
  p(`Integration line: ${integration ?? 'develop (assumed: the project is not the root of a git repository with a develop, main or master branch)'} in ${path.join(stateDir, 'clone')} — never pushed`);
  p(`Test command:     ${pre.testCommand ?? '(none)'}    Test directories: ${pre.testDirs.join(' ') || '(none)'}`);
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

  p(); p('Workspace:');
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
      const stepDir = path.join(stateDir, 'epics', e.id, `${KINDS[kind].prefix}-1`);
      const c = sessionCommand(config, { kind, epicId: e.id, stateDir, stepDir, pluginDir, sessionId: '<uuid>', appendFiles: append.map((f) => path.join(stepDir, f)) });
      p(`  ${KINDS[kind].prefix}-1 — role ${KINDS[kind].role}, wall clock ${c.wallMin} min; ${note}`);
      p(`    cwd:   ${c.cwd}`);
      p(`    env:   ${Object.entries(c.env).map(([k, v]) => `${k}=${shellQuote(v)}`).join(' ')}`);
      p(`    $ ${[c.bin, ...c.args].map(shellQuote).join(' ')} > ${shellQuote(path.join(stepDir, 'stream.jsonl'))} 2> ${shellQuote(path.join(stepDir, 'stderr.log'))}`);
      p(`    stdin: ${userLine(prompt)}`);
      if (kind === 'build') {
        p(`  audit-1 — ${exists(path.join(pluginDir, 'scripts', 'autopilot', 'audit', 'prompt.md')) ? 'advisory auditor' : 'skipped: the auditor is not built yet (P3)'}`);
        if (e.humanCheck) p('  (this epic parks here for a person; no verify session runs)');
      }
    }
    p('  fix round (at most one): plan-fix-1 and fix-1 use the plan and build commands with');
    p(`    --append-system-prompt-file ${shellQuote(path.join(stateDir, 'epics', e.id, 'fix-brief.md'))} and the fix budgets`);
    p(`    (plan-fix: ${config.budgets.planFix.turns} turns, $${config.budgets.planFix.usd}, ${config.budgets.planFix.wallMin} min; fix: ${config.budgets.fix.turns} turns, $${config.budgets.fix.usd}, ${config.budgets.fix.wallMin} min)`);
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
  constructor({ stateDir, config, pluginDir, verbose }) {
    this.stateDir = stateDir; this.config = config; this.pluginDir = pluginDir; this.verbose = verbose;
    this.clone = path.join(stateDir, 'clone');
    this.stateFile = path.join(stateDir, 'state.json');
    this.stopReason = null;
    this.entry = {}; // epic id -> phase to re-enter after a crash
  }

  log(msg) {
    const line = `${new Date().toISOString()} ${msg}\n`;
    fs.appendFileSync(path.join(this.stateDir, 'autopilot.log'), line);
    if (this.verbose) process.stdout.write(line);
  }
  save() { writeJson(this.stateFile, this.state); }
  epicDir(e) { return path.join(this.stateDir, 'epics', e.id); }
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
      epic: e.id, epicName: m.name, session: e.lastStep ?? null, branch: m.branch, branchTip: this.branchTip(m.branch),
      resume: `open a new session in the fetched repo: /peak-workflow:start-epic ${e.id}`, decided: null, ...gate,
    });
    e.gates.push(name);
    return name;
  }

  // ---- terminal transitions --------------------------------------------------------------------

  finish(e, state, reason) {
    e.state = state; e.reason = reason; e.step = null; e.endedAt = new Date().toISOString();
    this.save();
    this.log(`${e.id}: ${state} — ${reason}`);
    return null;
  }
  park(e, reason) { try { this.wipCommit(e); } catch (err) { this.log(`${e.id}: could not commit uncommitted work: ${err.message}`); } return this.finish(e, 'PARKED', reason); }

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
    const { prompt, appendFiles = [] } = prepare(stepDir);
    writeJson(path.join(stepDir, 'settings.json'), sessionSettings());
    const cmd = sessionCommand(cfg, { kind, epicId: e.id, stateDir: this.stateDir, stepDir, pluginDir: this.pluginDir, sessionId, appendFiles });

    // The intended step is on disk before anything is launched (crash-safe resume, §9).
    e.state = k.state; e.lastStep = name;
    e.step = { name, kind, sessionId, pid: null, startedAt: new Date().toISOString() };
    this.save();
    this.log(`${e.id}: ${name} starting (${k.role}, ${cmd.wallMin} min, session ${sessionId})`);

    const startMb = this.cloneMb();
    const started = Date.now();
    const isScript = /\.(mjs|cjs|js)$/.test(cmd.bin);
    const child = spawn(isScript ? process.execPath : cmd.bin, isScript ? [cmd.bin, ...cmd.args] : cmd.args, {
      cwd: this.clone, env: childEnv(cmd.env), detached: true, stdio: ['pipe', 'pipe', 'pipe'],
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
      send(userLine(prompt));
      readline.createInterface({ input: child.stdout }).on('line', (line) => {
        stream.write(line + '\n');
        let d; try { d = JSON.parse(line); } catch { return; }
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

    if (s.outcome === 'stopped') { this.stopReason = 'STOP file'; undo(); return this.park(e, `stopped by the STOP file during ${s.name}`); }
    if (s.outcome === 'infra') { undo(); return this.park(e, `infra error during ${s.name}: ${s.why}`); }
    if (s.outcome === 'budget') { undo(); return this.park(e, `budget: ${s.name} hit ${s.why}`); }
    const newGates = this.gateFiles().filter((f) => !gatesBefore.has(f));
    if (newGates.length) { e.gates.push(...newGates.filter((g) => !e.gates.includes(g))); undo(); return this.park(e, `parked at a human gate (${newGates.join(', ')})`); }
    if (kind !== 'verify' && moved) { undo(); return this.park(e, `${s.name} moved ${this.state.integration}; only a verify session may merge`); }
    return s;
  }

  // ---- phases: each returns the next phase, or null when the epic reached a terminal state -----

  async doPlan(e, fix) {
    const m = this.meta(e);
    const brief = path.join(this.epicDir(e), 'fix-brief.md');
    const s = await this.step(e, fix ? 'planFix' : 'plan', () => ({ prompt: `/peak-workflow:start-epic ${e.id}`, appendFiles: fix ? [brief] : [] }));
    if (!s) return null;
    const planFile = path.join(s.stepDir, 'plan.md');
    if (!exists(planFile)) return this.park(e, `${s.name} ended without a captured plan`);
    const lint = lintPlan(read(planFile), m.anchors);
    writeJson(path.join(s.stepDir, 'plan-lint.json'), lint);
    if (!lint.pass) {
      this.writeGate(e, { kind: 'plan-lint', skillStep: 'start-epic Step 4 (plan approval)', question: 'The captured plan failed plan lint. Approve it by hand, or fix what it lacks.', options: [], why: lint.problems.join('; '), artifacts: [path.relative(this.stateDir, planFile)] });
      return this.park(e, `plan lint failed: ${lint.problems.join('; ')}`);
    }
    e.planStep = s.name;
    this.log(`${e.id}: plan approved by lint, not by a person (${s.name}/plan.md)`);
    return fix ? 'FIX_BUILD' : 'BUILD';
  }

  async doBuild(e, fix) {
    const brief = path.join(this.epicDir(e), 'fix-brief.md');
    const plan = read(path.join(this.epicDir(e), e.planStep, 'plan.md'));
    const s = await this.step(e, fix ? 'fix' : 'build', (stepDir) => {
      fs.writeFileSync(path.join(stepDir, 'prompt.md'), buildPrompt(plan, this.pluginDir));
      fs.writeFileSync(path.join(stepDir, 'build-rules.md'), BUILD_RULES + (fix ? '\n' + read(brief) : ''));
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
      add('branch-and-commit', ahead >= 1 && new RegExp(`^feat\\(epic-${e.id}\\):`).test(subject), { branch: b, tip, commitsAhead: ahead, tipSubject: subject });
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
    const untraced = m.anchors.filter((tor) => gitRun(this.clone, 'grep', '-l', '-F', tor, b, '--', ...dirs).code !== 0);
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
    return 'FIX_PLAN';
  }

  doAudit(e) {
    e.state = 'AUDIT'; this.save();
    // The auditor (bundle, prompt, schema) is P3. Until it exists the step is recorded as skipped.
    e.audit = { skipped: 'the auditor is not built yet (P3)' };
    const m = this.meta(e);
    if (m.humanCheck) {
      this.writeGate(e, { kind: 'human-check', skillStep: 'wrapup-epic Step 1.2 item 7', question: m.reasons.join('; '), options: ['Looks right', 'Not right — describe'], why: 'autopilot never self-approves a look', artifacts: [], resume: `open a new session in the fetched repo: /peak-workflow:wrapup-epic ${e.id}` });
      return this.park(e, 'human check needed before verify');
    }
    return 'VERIFY';
  }

  async doVerify(e) {
    const m = this.meta(e);
    e.preVerify = { developSha: this.integrationSha(), branchTip: this.branchTip(m.branch), branch: m.branch };
    this.save();
    const s = await this.step(e, 'verify', () => ({ prompt: `/peak-workflow:wrapup-epic ${e.id}` }));
    if (!s) return null;
    if (this.integrationSha() !== e.preVerify.developSha) return 'CHECK_VERIFY';
    // No merge and no gate: the verdict was FAIL (policy answers "Stop — epic FAILs").
    const verdict = (s.result?.result ?? '').trim() || '(the verify session gave no result text)';
    this.wipCommit(e);
    if (e.fixRounds >= 1) return this.finish(e, 'FAILED', `${s.name} FAIL after the fix round: ${verdict.split('\n')[0].slice(0, 200)}`);
    e.fixRounds = 1;
    this.writeFixBrief(e, 'The independent verifier returned FAIL. Its final report:', [verdict]);
    this.log(`${e.id}: ${s.name} verdict FAIL; starting the one fix round`);
    return 'FIX_PLAN';
  }

  /** CHECK_VERIFY, the merge gate (§6.5 and SPIKE.md "Owner decisions"). */
  checkVerify(e) {
    const m = this.meta(e); const dev = this.state.integration; const pre = e.preVerify;
    const checks = [];
    const add = (name, pass, evidence) => checks.push({ name, pass: !!pass, evidence });

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
        const stray = this.g('diff', '--name-only', `${pre.branchTip}..${p2}`).split('\n').filter((f) => f && !f.startsWith('docs/') && f !== m.sidecar);
        if (stray.length) problems.push(`commits added during verify touch files outside docs/: ${stray.join(', ')}`);
        if (gitOk(this.clone, 'merge-base', '--is-ancestor', pre.developSha, p2) && this.g('rev-parse', `${dev}^{tree}`) !== this.g('rev-parse', `${p2}^{tree}`)) problems.push('the merge commit itself changes files');
      }
    }
    add('verdict', problems.length === 0, problems.length ? problems : { merge: this.integrationSha(), parents });

    const sc = parseSidecar(gitShow(this.clone, dev, m.sidecar));
    const unverified = m.anchors.filter((t) => !sc.verified[t]);
    add('sidecar-on-integration', sc.fields.status === 'Complete' && /^\d{4}-\d{2}-\d{2}/.test(sc.fields.completed ?? '') && unverified.length === 0, { status: sc.fields.status ?? null, completed: sc.fields.completed ?? null, anchorsWithoutVerifiedLine: unverified });

    // No waivers: parse the Deferrals Count: line; the words always appear, so never grep for them.
    const handoff = gitShow(this.clone, dev, `${PLAN_DIR}/session-handoffs/epic-${e.id}-complete.md`);
    const section = handoff && /^## Deferrals\b/m.test(handoff) ? handoff.slice(handoff.search(/^## Deferrals\b/m)) : null;
    const countLine = section ? (section.match(/^Count:.*$/m) ?? [])[0] : null;
    const numbers = countLine ? countLine.match(/\d+/g) ?? [] : [];
    const waivedLine = 'waived' in sc.fields;
    add('no-waivers', !waivedLine && numbers.length > 0 && numbers.every((x) => Number(x) === 0), { waivedLineInSidecar: waivedLine, countLine: countLine ?? (handoff === null ? 'complete handoff missing' : 'no Deferrals Count: line') });

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
      if (stop) return this.park(e, `run stopped (${stop}) before ${phase}`);
      if (phase === 'PLAN') phase = await this.doPlan(e, false);
      else if (phase === 'BUILD') phase = await this.doBuild(e, false);
      else if (phase === 'FIX_PLAN') phase = await this.doPlan(e, true);
      else if (phase === 'FIX_BUILD') phase = await this.doBuild(e, true);
      else if (phase === 'CHECK_BUILD') phase = this.doCheckBuild(e);
      else if (phase === 'CHECK_BUILD_INTERRUPTED') phase = this.doCheckBuild(e, { interrupted: true });
      else if (phase === 'AUDIT') phase = this.doAudit(e);
      else if (phase === 'VERIFY') phase = await this.doVerify(e);
      else if (phase === 'CHECK_VERIFY') phase = this.doCheckVerify(e);
      else throw new Error(`unknown phase ${phase}`);
    }
    return null;
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
      if (e.state === 'PLAN' || e.state === 'FIX_PLAN') entry = again(e.state) ? e.state : null;
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
      if (resuming && !resume) throw new Error(`${this.stateFile} already exists: pass --resume to continue that run, or use a fresh --state directory`);
      if (!exists(path.join(this.stateDir, 'config.json'))) writeJson(path.join(this.stateDir, 'config.json'), cfg);

      if (!exists(this.clone)) {
        const integration = detectIntegration(cfg.project);
        if (!integration) throw new Error(`${cfg.project} is not the root of a git repository with a develop, main or master branch`);
        git(cfg.project, 'clone', '-q', '--no-hardlinks', '--branch', integration, cfg.project, this.clone);
        this.g('remote', 'remove', 'origin');
        this.log(`private clone made at ${this.clone} (${integration}, no origin)`);
      }
      const integration = detectIntegration(this.clone);

      if (resuming) {
        this.state = readJson(this.stateFile);
        this.state.status = 'running'; this.state.stoppedBecause = null;
        this.log(`resuming run ${this.state.run}`);
      } else {
        this.state = { run: new Date().toISOString(), driverVersion: DRIVER_VERSION, pluginDir: this.pluginDir, integration, startSha: null, spentUsd: 0, status: 'running', stoppedBecause: null, consecutiveInfra: 0, baseSkips: null, queue: [] };
      }

      // Preflight reads the integration line, so the clone must be on it.
      if (!resuming) { this.g('checkout', '-q', integration); this.state.startSha = this.integrationSha(); }
      else if (!this.state.queue.some((q) => !TERMINAL.has(q.state) && q.state !== 'QUEUED') && this.currentBranch() !== integration && !this.dirty()) this.g('checkout', '-q', integration);
      this.pre = preflight(this.clone, cfg, { pluginDir: this.pluginDir });
      this.pre.epics = this.pre.epics.map((p) => ({ ...p }));
      this.metaById = new Map(this.pre.epics.map((p) => [p.id, p]));
      if (!resuming) {
        this.state.queue = buildQueue(this.pre, cfg).map((m) => ({ id: m.id, name: m.name, label: m.label, state: 'QUEUED', reason: null, attempts: {}, fixRounds: 0, costUsd: 0, turns: 0, wallMs: 0, sessions: [], gates: [], checks: [], planStep: null, preVerify: null, step: null }));
        writeJson(path.join(this.stateDir, 'preflight.json'), this.pre);
      } else {
        // Epics already in the run keep the eligibility they started with; their sidecars have moved since.
        for (const q of this.state.queue) { const m = this.metaById.get(q.id); if (m && q.state !== 'QUEUED') { m.eligibility = 'eligible'; m.reasons = []; } }
      }
      this.save();
      this.log(`run ${this.state.run}: queue ${this.state.queue.map((q) => q.id).join(', ') || '(empty)'}; integration line ${integration}`);

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
            this.finish(e, 'PARKED', m.reasons.join('; ')); continue;
          }
          // Base red stops the whole run: every epic would build on it.
          if (this.currentBranch() !== integration) { if (this.dirty()) { this.stopReason = `clone is dirty on ${this.currentBranch()}`; break; } this.g('checkout', '-q', integration); }
          const t = this.runTests();
          if (!t.pass) { this.stopReason = 'base red'; this.state.baseRed = { before: e.id, exit: t.code, timedOut: t.timedOut, tail: t.tail }; this.log(`base red: \`${cfg.testCommand}\` fails on ${integration} (exit ${t.code}); stopping the run`); break; }
          this.state.baseSkips = t.skips;
          e.startedAt = new Date().toISOString();
        }
        await this.runEpic(e, entry ?? 'PLAN');
      }

      const left = this.state.queue.filter((q) => !TERMINAL.has(q.state)).length;
      this.state.stoppedBecause = this.stopReason ?? (left ? 'nothing runnable' : 'queue done');
      this.state.status = this.stopReason ? 'STOPPED' : 'DONE';
      this.state.endedAt = new Date().toISOString();
      this.save();
      this.writeReport();
      this.log(`run ended: ${this.state.stoppedBecause}; report at ${path.join(this.stateDir, 'report.md')}`);
      return this.state;
    } finally {
      this.releaseLock();
    }
  }

  // ---- report (data and a plain rendering; the full renderer is P3) ------------------------------

  writeReport() {
    const s = this.state;
    const epics = s.queue.map((q) => ({ id: q.id, label: q.label, outcome: TERMINAL.has(q.state) ? q.state : 'NOT STARTED', reason: q.reason, checks: q.checks, audit: q.audit ?? null, gates: q.gates, costUsd: q.costUsd, turns: q.turns, wallMs: q.wallMs, sessions: q.sessions, testChanges: q.testChanges ?? [], rejected: q.rejected ?? [], planApprovedBy: q.planStep ? 'lint, not a person' : null }));
    const report = { run: s.run, ended: s.endedAt, stoppedBecause: s.stoppedBecause, integration: s.integration, clone: this.clone, startSha: s.startSha, spentUsd: s.spentUsd, budgetUsd: this.config.runBudgetUsd, baseRed: s.baseRed ?? null, epics, referee: { blocked: [], testChanges: epics.flatMap((e) => e.testChanges.map((t) => ({ epic: e.id, ...t }))) } };
    writeJson(path.join(this.stateDir, 'report.json'), report);
    const parked = epics.filter((e) => e.outcome === 'PARKED');
    const merged = epics.filter((e) => e.outcome === 'MERGED');
    const next = [];
    if (s.baseRed) next.push(`Fix the failing tests on \`${s.integration}\` (\`${this.config.testCommand}\`), then run again.`);
    if (parked.length) next.push(`Decide ${parked.length} parked epic(s): ${parked.map((e) => e.id).join(', ')} (gate files in \`gates/\`).`);
    if (merged.length) next.push(`Review and bring in the merged work:\n   \`git fetch ${this.clone} ${s.integration}:autopilot/${s.integration} && git log ${s.integration}..autopilot/${s.integration}\``);
    const md = [
      `# Autopilot — ${s.run} → ${s.endedAt} (stopped: ${s.stoppedBecause})`,
      `Integration line: ${s.integration} in ${this.clone} (not pushed). Spent $${s.spentUsd.toFixed(2)} of $${this.config.runBudgetUsd}.`,
      '', '## Do this next', ...(next.length ? next.map((n, i) => `${i + 1}. ${n}`) : ['Nothing to do.']),
      '', '## Results', '| Epic | Outcome | Why | Evidence | Cost | Time |', '|---|---|---|---|---|---|',
      ...epics.map((e) => `| ${e.label} | ${e.outcome} | ${(e.reason ?? '—').replace(/\|/g, '\\|')} | ${e.checks.at(-1)?.file ?? e.gates.at(-1) ?? '—'} | $${e.costUsd.toFixed(2)} | ${Math.round(e.wallMs / 60000)} m |`),
      '', '## Notes', '- Every plan was approved by lint, not by a person.', '- Auditor: not built yet (P3); no audit ran.',
      ...report.referee.testChanges.map((t) => `- Existing test changed in ${t.epic}: ${t.path} — ${t.reason ?? 'NO REASON RECORDED'}`), '',
    ].join('\n');
    writeAtomic(path.join(this.stateDir, 'report.md'), md);
  }
}

/** Programmatic entry point (the CLI and the tests both use it). */
export async function run({ project, stateDir, queue, resume = false, claudeBin, pluginDir = PLUGIN_DIR, verbose = false, dryRun: dry = false, out }) {
  const root = project ? path.resolve(project) : null;
  const state = path.resolve(stateDir ?? `${root}.autopilot`);
  const overrides = {};
  if (queue) overrides.queue = queue;
  if (claudeBin) overrides.claudeBin = claudeBin;
  const config = loadConfig(state, root, overrides);
  if (dry) return dryRun({ project: config.project, stateDir: state, config, pluginDir, out });
  return new Run({ stateDir: state, config, pluginDir, verbose }).run({ resume });
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
    if (['dryRun', 'resume', 'json', 'verbose', 'help'].includes(key)) o[key] = true;
    else o[key] = argv[++i];
  }
  return o;
}

async function main(argv) {
  const o = parseArgs(argv);
  const cmd = o._[0];
  const usage = 'usage: driver.mjs preflight --project <dir> [--json]\n       driver.mjs run [--project <dir>] [--state <dir>] [--queue id,id] [--dry-run] [--resume] [--claude-bin <path>] [--verbose]\n       driver.mjs stop --state <dir>';
  if (o.help || !cmd) { console.log(usage); return 0; }
  if (cmd === 'preflight') {
    if (!o.project) throw new Error('preflight needs --project');
    const root = path.resolve(o.project);
    const pre = preflight(root, loadConfig(path.resolve(o.state ?? `${root}.autopilot`), root));
    if (o.json) console.log(JSON.stringify(pre, null, 2));
    else { pre.refuse.forEach((r) => console.log(`REFUSE: ${r}`)); pre.epics.forEach((e) => console.log(`${e.label}  [${e.eligibility}${e.humanCheck ? ', human check' : ''}]  deps: ${e.deps.join(', ') || '—'}  ${e.reasons.join('; ')}`)); }
    return pre.ok ? 0 : 1;
  }
  if (cmd === 'run') {
    if (!o.project && !o.state) throw new Error('run needs --project or --state');
    const result = await run({ project: o.project, stateDir: o.state, queue: o.queue ? o.queue.split(',').filter(Boolean) : undefined, resume: !!o.resume, claudeBin: o.claudeBin, verbose: !!o.verbose || process.stdout.isTTY, dryRun: !!o.dryRun });
    return o.dryRun ? (result.pre.ok ? 0 : 1) : 0;
  }
  if (cmd === 'stop') {
    if (!o.state) throw new Error('stop needs --state');
    const state = path.resolve(o.state);
    fs.writeFileSync(path.join(state, 'STOP'), `${new Date().toISOString()} stop requested\n`);
    console.log(`STOP written to ${state}; waiting for the driver to finish its report…`);
    const lock = path.join(state, 'lock');
    const holder = () => { try { return readJson(lock).pid; } catch { return null; } };
    for (let pid = holder(); pid && pidAlive(pid); pid = holder()) await sleep(1000);
    console.log(exists(path.join(state, 'report.md')) ? `Stopped. Report: ${path.join(state, 'report.md')}` : 'No driver is running. Remove the STOP file before the next run.');
    return 0;
  }
  throw new Error(`unknown command ${cmd}\n${usage}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(`autopilot: ${err.message}`); process.exitCode = 2; });
}
