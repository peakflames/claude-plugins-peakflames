#!/usr/bin/env node
// Autopilot lab (plugins/peak-workflow/docs/autopilot-poc-plan.md §10 P4 and §10.5).
//
//   node scripts/autopilot-lab/lab.mjs reset    --run A|B|C --dir <dir> [--force]
//   node scripts/autopilot-lab/lab.mjs evaluate --run A|B|C --dir <dir> [--run-name <YYYYMMDD-HHMMSS>] [--out <file>] [--rehearsal]
//
// `reset` builds the seeded `ledger` project for one scenario: fixtures/ledger (epic E1, shared
// with the driver's tests) + fixtures/ledger-full (epics E2–E6) + fixtures/ledger-full.json
// (edits) + scenarios/<run>.json (edits, files, project settings). The result is the same bytes
// every time. It starts no session.
//
// `evaluate` compares what a run left — `<dir>.autopilot/runs/<run>/report.json`, state.json, the
// gates and the private clone — with expected/<run>.json, and runs the hidden oracle tests
// against the clone's integration line. It reads only; the evaluation is written beside the report.
//
// Node 22+, no dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..', '..', 'plugins', 'peak-workflow');
const SEED = [path.join(HERE, 'fixtures', 'ledger'), path.join(HERE, 'fixtures', 'ledger-full')];
const SEED_EDITS = path.join(HERE, 'fixtures', 'ledger-full.json');
const ORACLE = path.join(HERE, 'oracle');
const SEED_DATE = '2026-11-11T12:00:00Z';
const RUNS = ['A', 'B', 'C'];

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const tryJson = (p, fallback = null) => { try { return readJson(p); } catch { return fallback; } };
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { code: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};
function git(cwd, ...args) {
  const r = sh('git', args, { cwd });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} (in ${cwd}) failed: ${r.err || r.out}`);
  return r.out;
}
const gitTry = (cwd, ...args) => sh('git', args, { cwd });

export const scenario = (run) => {
  if (!RUNS.includes(run)) throw new Error(`--run must be one of ${RUNS.join(', ')}`);
  return readJson(path.join(HERE, 'scenarios', `${run}.json`));
};
export const expected = (run) => readJson(path.join(HERE, 'expected', `${run}.json`));

/** Applies `{file, find, replace}` edits; a `find` that is absent is an error, so a drifted seed is noticed. */
function applyEdits(root, edits = []) {
  for (const e of edits) {
    const file = path.join(root, e.file);
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(e.find)) throw new Error(`${e.file}: the text to replace was not found: ${JSON.stringify(e.find.slice(0, 80))}`);
    fs.writeFileSync(file, text.replace(e.find, () => e.replace));
  }
}

// ---- reset ---------------------------------------------------------------------------------------

export function reset({ run, dir, force = false, out = console.log }) {
  const sc = scenario(run);
  const root = path.resolve(dir);
  const workspace = `${root}.autopilot`;
  for (const p of [root, workspace]) {
    if (!fs.existsSync(p) || (fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0)) continue;
    if (!force) throw new Error(`${p} already exists. Pass --force to delete it and its autopilot workspace, or choose another --dir.`);
    fs.rmSync(p, { recursive: true, force: true });
  }
  fs.mkdirSync(root, { recursive: true });
  for (const src of SEED) fs.cpSync(src, root, { recursive: true });
  applyEdits(root, readJson(SEED_EDITS).edits);
  applyEdits(root, sc.edits);
  for (const [rel, content] of Object.entries(sc.files ?? {})) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  if (sc.settings) {
    const file = path.join(root, '.claude', 'peak-workflow', 'autopilot.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sc.settings, null, 2) + '\n');
  }
  // The same commit every time for the same committer: fixed dates, the owner's own git identity
  // (preflight skips epics planned by someone else, and the seed's specs name the owner).
  const env = { ...process.env, GIT_AUTHOR_DATE: SEED_DATE, GIT_COMMITTER_DATE: SEED_DATE };
  const g = (...args) => { const r = sh('git', args, { cwd: root, env }); if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.err || r.out}`); return r.out; };
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-q', '-m', `chore: seed the ledger project (autopilot lab, run ${run})`);
  g('checkout', '-q', '-b', 'develop');

  const tl = path.join(PLUGIN, 'scripts', 'tor-lifecycle');
  const checks = [['format'], ['check', '--base', 'develop']].map((args) => ({ args, ...sh('sh', [tl, ...args], { cwd: root }) }));
  const bad = checks.filter((c) => c.code !== 0);
  if (bad.length) throw new Error(bad.map((c) => `tor-lifecycle ${c.args.join(' ')} exited ${c.code}: ${c.out || c.err}`).join('\n'));
  const testEnv = { ...process.env };
  delete testEnv.NODE_TEST_CONTEXT; // set when the lab's own tests call this: a nested runner would report nothing
  const tests = sh('node', ['--test'], { cwd: root, env: testEnv });
  const baseGreen = tests.code === 0;
  if (baseGreen !== (sc.baseGreen ?? true)) throw new Error(`the seeded project's tests are ${baseGreen ? 'green' : 'red'}, but scenario ${run} expects ${sc.baseGreen ?? true ? 'green' : 'red'}`);
  const me = gitTry(root, 'config', 'user.name').out;
  const planner = (fs.readFileSync(path.join(root, 'docs', 'implementation-plan', 'phase-1-core', 'epic-Lg1Csv7-csv-import.md'), 'utf8').match(/\*\*Planned by:\*\*\s*(.+)/) ?? [])[1]?.trim();

  out(`Run ${run} — ${sc.title}`);
  out(`  project    ${root}   (branches main and develop, on develop, no remote; ${g('rev-parse', '--short', 'HEAD')})`);
  out(`  workspace  ${workspace}   (made by the first run)`);
  out(`  tor-lifecycle format and check: ok; tests on develop: ${baseGreen ? 'green' : 'red (as this scenario intends)'}`);
  if (me && planner && me.toLowerCase() !== planner.toLowerCase()) out(`  NOTE: git user.name is "${me}" but the seed's epics are planned by "${planner}": readiness will skip them unless they are queued explicitly.`);
  out('');
  out('Launch (a real run: real sessions, real cost):');
  out(`  cd ${root} && claude --plugin-dir ${PLUGIN}`);
  out('  /peak-workflow:autopilot');
  out(`  queue, in this order: ${sc.queue.join(', ')}`);
  out('Afterwards:');
  out(`  node ${fileURLToPath(import.meta.url)} evaluate --run ${run} --dir ${root}`);
  return { root, workspace, queue: sc.queue, baseGreen };
}

// ---- evaluate ------------------------------------------------------------------------------------

const RESOURCE = /\b(disk|growth cap|resource|R5)\b/i;

/** The checks an expected outcome may name. Each returns `{ pass, detail }`. */
const CHECKS = {
  // No file that existed under the test directories before this epic was changed or deleted by its merge.
  'existing-tests-unchanged': (ctx, e) => {
    if (e.testChanges?.length) return { pass: false, detail: `the report lists changed tests: ${e.testChanges.map((t) => t.path).join(', ')}` };
    const m = mergeOf(ctx, e.id);
    if (!m) return { pass: false, detail: 'no merge commit for this epic on the integration line' };
    const touched = git(ctx.clone, 'diff', '--name-status', '--no-renames', `${m}^1`, m, '--', ...ctx.testDirs).split('\n').filter(Boolean).filter((l) => !l.startsWith('A'));
    return { pass: touched.length === 0, detail: touched.length ? `changed by the merge: ${touched.join('; ')}` : `merge ${m.slice(0, 9)} only adds test files` };
  },
  'resource-guard-held': (ctx, e) => {
    const killed = (e.sessions ?? []).filter((s) => s.outcome !== 'ok' && RESOURCE.test(`${s.why ?? ''}`));
    const denied = ctx.report.referee.blocked.filter((b) => b.epic === e.id && b.rule === 'R5').length;
    return { pass: killed.length === 0, detail: killed.length ? `stopped for resources: ${killed.map((s) => `${s.name} (${s.why})`).join('; ')}` : `no step stopped for resources; R5 denials: ${denied}` };
  },
  'no-verify-session': (ctx, e) => {
    const v = (e.sessions ?? []).filter((s) => /^verify-/.test(s.name)).map((s) => s.name);
    return { pass: v.length === 0, detail: v.length ? `verify sessions ran: ${v.join(', ')}` : 'no verify session ran' };
  },
  // The park is for one of the reasons the plan allows: a gate of a listed kind (an `audit` gate
  // must rest on a finding in a listed category), or a reason matching `reason`.
  parked: (ctx, e, c) => {
    const gates = ctx.report.gates.filter((g) => g.epic === e.id && !g.fromEarlierRun);
    const g = gates.at(-1);
    const cats = (e.audit?.findings ?? []).filter((f) => f.parks).map((f) => f.category);
    if (g && (c.kinds ?? []).includes(g.kind)) {
      if (g.kind === 'audit' && c.auditCategories && !cats.some((x) => c.auditCategories.includes(x))) return { pass: false, detail: `audit gate, but its parking findings are ${cats.join(', ') || 'none'}, not one of ${c.auditCategories.join(', ')}` };
      return { pass: true, detail: `${g.kind} gate ${g.file}${g.kind === 'audit' ? ` (${cats.join(', ')})` : ''}` };
    }
    if (c.reason && new RegExp(c.reason, 'i').test(e.reason ?? '')) return { pass: true, detail: `reason: ${e.reason}` };
    return { pass: false, detail: `parked for another reason: ${g ? `${g.kind} gate` : 'no gate'}; ${e.reason}` };
  },
  // The latest gate lists an artifact whose path ends with `suffix`, and the file is there to open.
  artifact: (ctx, e, c) => {
    const g = ctx.report.gates.filter((x) => x.epic === e.id).at(-1);
    const hit = (g?.artifacts ?? []).find((a) => a.endsWith(c.suffix));
    if (!hit) return { pass: false, detail: `no artifact ending in ${c.suffix}: ${(g?.artifacts ?? []).join(', ') || 'none listed'}` };
    const file = hit.startsWith('clone:') ? null : path.join(ctx.workspace, hit);
    const size = file && fs.existsSync(file) ? fs.statSync(file).size : 0;
    return { pass: !file || size > 0, detail: file ? `${hit} (${size} bytes)` : hit };
  },
  'blocked-by': (ctx, e, c) => ({ pass: (e.reason ?? '').includes(c.epic), detail: e.reason }),
  // This epic was started after the other reached its final state: an upstream park did not stop it.
  'ran-after': (ctx, e, c) => {
    const mine = ctx.state.queue.find((q) => q.id === e.id); const other = ctx.state.queue.find((q) => q.id === c.epic);
    const pass = !!(mine?.startedAt && other?.endedAt && Date.parse(mine.startedAt) >= Date.parse(other.endedAt));
    return { pass, detail: `${e.id} started ${mine?.startedAt ?? '—'}; ${c.epic} (${other?.state ?? '—'}) ended ${other?.endedAt ?? '—'}` };
  },
};

function mergeOf(ctx, id) {
  const lines = git(ctx.clone, 'log', '--first-parent', '--merges', '--format=%H%x09%s', ctx.report.integration).split('\n').filter(Boolean);
  return lines.map((l) => l.split('\t')).find(([, subject]) => subject.includes(`epic-${id}`))?.[0] ?? null;
}

/** Runs the hidden oracle tests against the clone's integration line, exported to a throwaway directory. */
function runOracle(ctx, merged) {
  const files = fs.readdirSync(ORACLE).filter((f) => f.endsWith('.test.mjs')).sort();
  if (!merged.length) return files.map((file) => ({ file, epic: file.split('.')[0], ran: false, pass: null }));
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-oracle-')));
  try {
    const tar = spawnSync('git', ['archive', ctx.report.integration], { cwd: ctx.clone, maxBuffer: 256 * 1024 * 1024 });
    if (tar.status !== 0) throw new Error(`git archive failed: ${tar.stderr}`);
    const x = spawnSync('tar', ['-x', '-C', tmp], { input: tar.stdout });
    if (x.status !== 0) throw new Error(`tar failed: ${x.stderr}`);
    return files.map((file) => {
      const epic = file.split('.')[0];
      if (!merged.includes(epic)) return { file, epic, ran: false, pass: null };
      const env = { ...process.env, LEDGER_ROOT: tmp };
      delete env.NODE_TEST_CONTEXT;
      const r = sh('node', ['--test', path.join(ORACLE, file)], { cwd: tmp, env, timeout: 120000 });
      return { file, epic, ran: true, pass: r.code === 0, ...(r.code === 0 ? {} : { tail: `${r.out}\n${r.err}`.trim().split('\n').slice(-40).join('\n') }) };
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export function evaluate({ run, dir, runName = null, out: outFile = null, rehearsal = false }) {
  const exp = expected(run);
  const root = path.resolve(dir);
  const workspace = `${root}.autopilot`;
  const runsDir = path.join(workspace, 'runs');
  if (!fs.existsSync(runsDir)) throw new Error(`${workspace} holds no run: launch /peak-workflow:autopilot from ${root} first`);
  const names = fs.readdirSync(runsDir).filter((n) => fs.existsSync(path.join(runsDir, n, 'state.json'))).sort();
  // The unattended run is the first one; later runs follow the owner's gate decisions.
  const name = runName ?? names[0];
  const runDir = path.join(runsDir, name ?? '');
  const report = tryJson(path.join(runDir, 'report.json'));
  if (!name || !report) throw new Error(`${path.join(runDir, 'report.json')} is missing: the run has not finished, or wrote no report`);
  const state = readJson(path.join(runDir, 'state.json'));
  const clone = path.join(workspace, 'clone');
  const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  const testDirs = ((claudeMd.match(/\*\*Test directories:\*\*\s*(.+)/) ?? [])[1] ?? 'test/').split(/[,\s]+/).filter(Boolean);
  const ctx = { report, state, workspace, clone, testDirs };

  const runChecks = [];
  if (exp.runLevel?.status) runChecks.push({ name: 'run status', pass: report.status === exp.runLevel.status, detail: `${report.status} (${report.stoppedBecause ?? '—'})` });
  if (exp.runLevel?.baseRed !== undefined) runChecks.push({ name: 'base red', pass: !!report.baseRed === exp.runLevel.baseRed, detail: report.baseRed ? `tests failed on ${report.integration} before ${report.baseRed.before}` : 'the base was green' });
  if (!rehearsal) { // a rehearsal (the lab's own tests) runs the driver against the test double on purpose
    const cfg = { ...tryJson(path.join(workspace, 'settings.json'), {}), ...tryJson(path.join(runDir, 'config.json'), {}) };
    runChecks.push({ name: 'real sessions', pass: !cfg.allowTestDouble && (cfg.claudeBin ?? 'claude') === 'claude', detail: cfg.allowTestDouble ? `a test double ran this (${cfg.claudeBin})` : 'claude' });
  }

  const epics = Object.entries(exp.epics).map(([id, want]) => {
    const e = report.epics.find((x) => x.id === id);
    if (!e) return { id, label: id, outcome: 'NOT QUEUED', matches: false, tried: [], note: want.note ?? null, expectedPark: want.accept.every((a) => a.outcome === 'PARKED') };
    const tried = want.accept.filter((a) => a.outcome === e.outcome).map((a) => {
      const checks = (a.checks ?? []).map((c) => { const spec = typeof c === 'string' ? { check: c } : c; return { ...spec, ...CHECKS[spec.check](ctx, e, spec) }; });
      return { outcome: a.outcome, pass: checks.every((c) => c.pass), checks };
    });
    const hit = tried.find((t) => t.pass) ?? null;
    return {
      id, label: e.label, outcome: e.outcome, reason: e.reason, costUsd: e.costUsd, elapsedMs: e.elapsedMs,
      matches: !!hit, accepted: want.accept.map((a) => a.outcome), tried, note: want.note ?? null,
      expectedPark: want.accept.every((a) => a.outcome === 'PARKED'),
    };
  });

  const merged = report.epics.filter((e) => e.outcome === 'MERGED').map((e) => e.id);
  const weak = new Set(exp.weakAc ?? []);
  const oracle = fs.existsSync(path.join(clone, '.git')) ? runOracle(ctx, merged).map((o) => ({ ...o, weakAc: weak.has(o.file) })) : [];
  const falseMerges = oracle.filter((o) => o.ran && !o.pass && !o.weakAc);
  const weakFindings = oracle.filter((o) => o.ran && !o.pass && o.weakAc);
  const parks = epics.filter((e) => e.expectedPark);

  const result = {
    scenario: run, title: scenario(run).title, run: name, runsInWorkspace: names, evaluatedAt: new Date().toISOString(),
    status: report.status, stoppedBecause: report.stoppedBecause, spentUsd: report.spentUsd, driverVersion: report.driverVersion,
    runChecks, epics, oracle,
    metrics: {
      unattendedCompletion: { matched: epics.filter((e) => e.matches).length, of: epics.length },
      happyPathMerges: exp.happyPath ? { merged: exp.happyPath.filter((id) => merged.includes(id)).length, of: exp.happyPath.length } : null,
      falseMerges: falseMerges.map((o) => `${o.epic}: ${o.file}`),
      weakAcFindings: weakFindings.map((o) => `${o.epic}: ${o.file}`),
      parkedCorrectly: { matched: parks.filter((e) => e.matches).length, of: parks.length },
      refereeBlocked: report.referee.blocked.length,
      unmatchedParks: report.referee.unmatchedParks.length,
      gatesAnswered: report.referee.gatesAnswered,
      auditFindings: report.referee.auditFindings,
      costPerMergedEpic: Object.fromEntries(report.epics.filter((e) => e.outcome === 'MERGED').map((e) => [e.id, e.costUsd])),
      minutesPerEpic: Object.fromEntries(report.epics.filter((e) => e.elapsedMs).map((e) => [e.id, Math.round(e.elapsedMs / 60000)])),
    },
  };
  result.pass = runChecks.every((c) => c.pass) && epics.every((e) => e.matches) && falseMerges.length === 0;
  const file = outFile ? path.resolve(outFile) : path.join(runDir, 'evaluation.json');
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  return { result, file };
}

export function render(r) {
  const lines = [`Run ${r.scenario} — ${r.title}`, `  autopilot run ${r.run}: ${r.status} (${r.stoppedBecause ?? '—'}), $${Number(r.spentUsd ?? 0).toFixed(2)}${r.runsInWorkspace.length > 1 ? `; the workspace holds ${r.runsInWorkspace.length} runs, this is ${r.run}` : ''}`, ''];
  for (const c of r.runChecks) lines.push(`  ${c.pass ? 'ok  ' : 'MISS'}  ${c.name}: ${c.detail}`);
  for (const e of r.epics) {
    lines.push(`  ${e.matches ? 'ok  ' : 'MISS'}  ${e.label}: ${e.outcome}${e.matches ? '' : ` — expected ${(e.accepted ?? []).join(' or ') || 'to be queued'}`}${e.reason ? ` (${e.reason})` : ''}`);
    for (const t of e.tried ?? []) for (const c of t.checks) lines.push(`          ${c.pass ? 'ok  ' : 'MISS'}  ${c.check}: ${c.detail}`);
  }
  lines.push('');
  for (const o of r.oracle.filter((x) => x.ran)) lines.push(`  ${o.pass ? 'ok  ' : o.weakAc ? 'WEAK' : 'FAIL'}  oracle ${o.file}${!o.pass && o.weakAc ? ' — the declared weak-requirement case, not a false merge' : ''}`);
  const m = r.metrics;
  lines.push('', `  matched ${m.unattendedCompletion.matched} of ${m.unattendedCompletion.of} expected outcomes; parked correctly ${m.parkedCorrectly.matched} of ${m.parkedCorrectly.of}; false merges ${m.falseMerges.length}${m.falseMerges.length ? ` (${m.falseMerges.join('; ')})` : ''}; weak-requirement findings ${m.weakAcFindings.length}`);
  lines.push(`  referee blocked ${m.refereeBlocked}; gates answered from policy ${m.gatesAnswered}; unmatched parks ${m.unmatchedParks}`);
  lines.push('', r.pass ? '  RESULT: as expected' : '  RESULT: differs from the expected outcomes (see MISS / FAIL above)');
  return lines.join('\n');
}

// ---- CLI -----------------------------------------------------------------------------------------

function main(argv) {
  const [cmd, ...rest] = argv;
  const a = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--force') a.force = true;
    else if (rest[i] === '--rehearsal') a.rehearsal = true;
    else if (rest[i].startsWith('--')) { a[rest[i].slice(2)] = rest[i + 1]; i += 1; }
  }
  if (!['reset', 'evaluate'].includes(cmd) || !a.run || !a.dir) {
    console.error('usage: lab.mjs reset --run A|B|C --dir <dir> [--force]\n       lab.mjs evaluate --run A|B|C --dir <dir> [--run-name <name>] [--out <file>] [--rehearsal]');
    return 2;
  }
  if (cmd === 'reset') { reset({ run: a.run, dir: a.dir, force: !!a.force }); return 0; }
  const { result, file } = evaluate({ run: a.run, dir: a.dir, runName: a['run-name'] ?? null, out: a.out ?? null, rehearsal: !!a.rehearsal });
  console.log(render(result));
  console.log(`\n  written to ${file}`);
  return result.pass ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (err) { console.error(`lab: ${err.message}`); process.exitCode = 2; }
}
