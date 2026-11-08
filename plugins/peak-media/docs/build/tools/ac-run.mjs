#!/usr/bin/env node
// ac-run — acceptance register runner and traceability check (orchestration §5, §7).
//   ac-run --wp WP2     run that WP's script ACs (node:test, tests named "AC-XXX-NN: …")
//                       and print a markdown table for the milestone commit
//   ac-run --trace      deterministic checks: orphan ACs, unknown ACs in briefs,
//                       PASS without evidence, verifier == builder (independence guard)
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT, PLUGIN_ROOT } from '../../../lib/cli.mjs';

const DEFAULT_ROOT = path.join(PLUGIN_ROOT, 'docs', 'build');
const DEFAULT_EVALS = path.join(PLUGIN_ROOT, 'evals');
const AC_RE = /AC-[A-Z]+-\d+/g;

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Parse acceptance.md -> {acs:[{id,source,wp,gwt,method,status,evidence}], wps:[{wp,status,report}]} */
export function parseRegister(root) {
  const file = path.join(root, 'acceptance.md');
  if (!existsSync(file)) throw new CliError(`no acceptance.md in ${root}`);
  const acs = [], wps = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^\|\s*AC-[A-Z]+-\d+\s*\|/.test(line)) {
      const c = splitRow(line);
      if (c.length !== 7) throw new CliError(`acceptance.md: malformed row for ${c[0]} (expected 7 columns, got ${c.length} — escape '|' inside cells as '\\|')`);
      const [id, source, wp, gwt, method, status, evidence] = c;
      acs.push({ id, source, wp, gwt, method, status, evidence });
    } else if (/^\|\s*WP\w+\s*\|/.test(line)) {
      const [wp, status, report] = splitRow(line);
      wps.push({ wp, status, report });
    }
  }
  return { acs, wps };
}

export function briefs(root) {
  const dir = path.join(root, 'wp');
  if (!existsSync(dir)) return {};
  const out = {};
  for (const wp of readdirSync(dir)) {
    const f = path.join(dir, wp, 'brief.md');
    if (existsSync(f)) out[wp] = [...new Set(readFileSync(f, 'utf8').match(AC_RE) ?? [])];
  }
  return out;
}

const idLine = (file, key) => {
  if (!existsSync(file)) return null;
  const m = new RegExp(`^${key}:\\s*(\\S.*?)\\s*$`, 'm').exec(readFileSync(file, 'utf8'));
  return m ? m[1] : null;
};
// Compare agent ids loosely: case, whitespace and a trailing "(…)" note don't make two ids different.
const normId = (s) => s.toLowerCase().replace(/\(.*\)\s*$/, '').replace(/\s+/g, ' ').trim();

/** Independence guard: each verify-N.md must name a verifier-id different from the handoff's builder-id. */
export function independence(root, wp) {
  const dir = path.join(root, 'wp', wp);
  if (!existsSync(dir)) return [];
  const builder = idLine(path.join(dir, 'handoff.md'), 'builder-id');
  const errs = [];
  for (const f of readdirSync(dir).filter((x) => /^verify-\d+\.md$/.test(x))) {
    const v = idLine(path.join(dir, f), 'verifier-id');
    if (!v) errs.push(`${wp}/${f}: no 'verifier-id:' line — report rejected`);
    else if (!builder) errs.push(`${wp}/${f}: handoff.md has no 'builder-id:' line — can't prove independence`);
    else if (normId(v) === normId(builder)) errs.push(`${wp}/${f}: verifier-id equals the builder-id (${v}) — report rejected`);
  }
  return errs;
}

export function trace(root) {
  const { acs, wps } = parseRegister(root);
  const br = briefs(root);
  const errs = [];
  const ids = new Set();
  for (const a of acs) {
    if (ids.has(a.id)) errs.push(`${a.id}: duplicate ID in acceptance.md`);
    ids.add(a.id);
    if (!a.wp || !br[a.wp]) errs.push(`${a.id}: orphan — owner '${a.wp || '(none)'}' has no wp/<WP>/brief.md`);
    else if (!br[a.wp].includes(a.id)) errs.push(`${a.id}: orphan — not listed in wp/${a.wp}/brief.md`);
    if (/^PASS$/i.test(a.status)) {
      const ev = a.evidence.replace(/`/g, '').split(/[,;]\s*/).filter((e) => e && e !== '—');
      if (!ev.length) errs.push(`${a.id}: PASS with no evidence`);
      for (const e of ev) {
        const p = path.resolve(root, e);
        if (path.relative(root, p).startsWith('..')) errs.push(`${a.id}: evidence must live under the build folder: ${e}`);
        else if (!existsSync(p) || !statSync(p).isFile()) errs.push(`${a.id}: PASS but evidence file missing: ${e}`);
      }
    }
  }
  for (const [wp, list] of Object.entries(br)) for (const id of list) if (!ids.has(id)) errs.push(`wp/${wp}/brief.md lists unknown ${id}`);
  for (const w of wps) errs.push(...independence(root, w.wp));
  for (const w of wps) if (w.status === 'verified' && !(w.report && existsSync(path.resolve(root, w.report)))) errs.push(`${w.wp}: marked verified but report '${w.report}' not found`);
  return { ok: errs.length === 0, errors: errs, counts: { acs: acs.length, briefs: Object.keys(br).length } };
}

/** Run the script ACs of a WP through node:test; returns Map id -> 'pass'|'fail'. */
export function runTests(ids, evals) {
  const res = new Map(ids.map((id) => [id, 'no-test']));
  if (!ids.length) return res;
  const pattern = `^(${ids.join('|')}):`;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, evals], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  for (const line of (r.stdout ?? '').split('\n')) {
    const m = /^(ok|not ok) \d+ - (AC-[A-Z]+-\d+):/.exec(line.trimStart());
    if (m) {
      const prev = res.get(m[2]);
      if (prev === undefined) continue;
      const skipped = /# SKIP/i.test(line);
      res.set(m[2], prev === 'fail' || m[1] !== 'ok' ? 'fail' : skipped ? 'skip' : 'pass');
    }
  }
  return res;
}

const spec = {
  name: 'ac-run',
  summary: 'run a WP\'s acceptance checks and/or the traceability check',
  usage: 'ac-run (--wp <WP> | --trace) [options]',
  description: `
--wp runs every 'script' AC owned by the WP as node:test tests whose names start with the AC ID,
and prints a markdown table (paste it into the milestone commit). still/manual ACs show the
register status. Exit 1 if any script AC fails or has no test, or the independence guard trips.
--trace checks the register against the briefs and evidence. Exit 1 on any problem.`,
  options: {
    wp: { type: 'string', arg: 'WP', desc: 'Work package to run, e.g. WP2' },
    trace: { type: 'boolean', desc: 'Run the traceability check' },
    root: { type: 'string', arg: 'dir', desc: 'Build-state folder (default: plugins/peak-media/docs/build)' },
    evals: { type: 'string', arg: 'dir', desc: 'Evals folder (default: plugins/peak-media/evals)' },
    'no-run': { type: 'boolean', desc: 'With --wp: list the table without running tests' },
  },
  positionals: { max: 0 },
  examples: ['ac-run --wp WP2', 'ac-run --trace'],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, ({ values }) => {
    if (!values.wp && !values.trace) throw new CliError('pass --wp <WP> or --trace', EXIT.USAGE);
    const root = path.resolve(values.root ?? DEFAULT_ROOT);
    const evals = path.resolve(values.evals ?? DEFAULT_EVALS);
    if (!existsSync(root)) throw new CliError(`build folder not found: ${root}`);
    let ok = true;
    if (values.trace) {
      const t = trace(root);
      for (const e of t.errors) process.stdout.write(`FAIL  ${e}\n`);
      process.stdout.write(`${t.ok ? 'PASS' : 'FAIL'}  trace: ${t.counts.acs} ACs, ${t.counts.briefs} briefs, ${t.errors.length} problem(s)\n`);
      ok &&= t.ok;
    }
    if (values.wp) {
      const { acs } = parseRegister(root);
      const mine = acs.filter((a) => a.wp === values.wp);
      if (!mine.length) throw new CliError(`no ACs owned by ${values.wp} in acceptance.md`);
      const scripts = mine.filter((a) => /^script/.test(a.method)).map((a) => a.id);
      if (!existsSync(evals)) throw new CliError(`evals folder not found: ${evals}`);
      const res = values['no-run'] ? new Map() : runTests(scripts, evals);
      const guard = independence(root, values.wp);
      const rows = mine.map((a) => {
        const run = /^script/.test(a.method) ? (res.get(a.id) ?? 'not-run') : '—';
        if (run !== 'pass' && run !== '—') ok = false;
        return `| ${a.id} | ${a.method} | ${run} | ${a.status} | ${a.evidence} |`;
      });
      process.stdout.write(`| AC | method | run | register | evidence |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
      for (const g of guard) process.stdout.write(`FAIL  ${g}\n`);
      if (guard.length) ok = false;
    }
    return ok ? EXIT.OK : EXIT.FAIL;
  });
}
