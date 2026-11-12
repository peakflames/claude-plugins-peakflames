// Morning report (autopilot-poc-plan.md §6.9, §10 P3): golden-file rendering from a fixture
// workspace (`fixtures/report/state/`: gates/, current, runs/<run>/). Regenerate after an intended change with:
//   UPDATE_GOLDEN=1 node --test plugins/peak-workflow/scripts/autopilot/test/report.test.mjs
process.env.TZ = 'UTC'; // the report prints local times; the golden file is written in UTC
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectReport, renderReport } from '../report.mjs';
import { DRIVER, readJson } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'report');
const STATE = path.join(FIXTURE, 'state'); // the workspace
const RUN = '20261112-220500';
const runDir = (ws = STATE) => path.join(ws, 'runs', RUN);
const scrub = (text, dir = STATE) => text.replaceAll(dir, '<workspace>');

function golden(name, actual) {
  const file = path.join(FIXTURE, name);
  if (process.env.UPDATE_GOLDEN === '1') fs.writeFileSync(file, actual);
  assert.equal(actual, fs.readFileSync(file, 'utf8'), `${name} differs from the golden file`);
}

test('report.md and report.json render from a fixture state.json exactly as the golden files', () => {
  const report = collectReport(runDir());
  golden('report.md', scrub(renderReport(report)));
  golden('report.json', scrub(JSON.stringify(report, null, 2) + '\n'));
});

test('report data: outcomes, evidence, referee counts and next steps come from files, not from prose', () => {
  const r = collectReport(runDir());
  assert.deepEqual(r.epics.map((e) => e.outcome), ['MERGED', 'PARKED', 'PARKED', 'FAILED', 'PARKED', 'BLOCKED', 'SKIPPED']);
  assert.equal(r.epics[1].evidence, 'runs/20261112-220500/epics/Lg4Fx2q/audit-1/audit.json F1, F2');
  assert.deepEqual(r.epics[1].audit.findings.filter((f) => f.parks).map((f) => f.category), ['stand-in', 'test-weakened']);
  assert.deepEqual(r.referee.blocked.map((b) => b.rule), ['R7', 'R7', 'R4']);
  assert.equal(r.referee.gatesAnswered, 4);
  assert.deepEqual(r.referee.auditFindings, { high: 2, medium: 2, low: 1 });
  assert.deepEqual(r.referee.unmatchedParks, ['gates/Lg6Bud2-1.json']);
  assert.equal(r.referee.setup.differs.length, 0);
  // §6.9 fields the evaluation script reads.
  for (const k of ['run', 'stoppedBecause', 'spentUsd', 'epics', 'referee']) assert.ok(k in r, k);
  for (const k of ['id', 'outcome', 'reason', 'checks', 'audit', 'gates', 'costUsd', 'turns', 'wallMs', 'sessions']) assert.ok(k in r.epics[0], k);
  assert.match(r.next[0], /Answer 2 waiting questions: `\/peak-workflow:autopilot report` \(Lg4Fx2q, Lg6Bud2\)/);
  assert.ok(r.next.some((n) => n.includes(`git fetch "${STATE}/clone" develop:autopilot/develop && git log develop..autopilot/develop`)));
});

test('a session that loaded a different plugin copy is flagged in the Referee section', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-report-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(STATE, tmp, { recursive: true });
  const file = path.join(runDir(tmp), 'epics', 'Lg1Csv7', 'verify-1', 'effective-setup.json');
  const setup = readJson(file);
  setup.init.plugins[0].version = '1.10.0'; setup.init.plugins[0].source = 'peak-workflow@synced';
  fs.writeFileSync(file, JSON.stringify(setup));
  assert.match(renderReport(collectReport(runDir(tmp))), /DIFFERS between sessions: .*Lg1Csv7\/verify-1: Claude Code 2\.1\.322, peak-workflow 1\.10\.0 \(peak-workflow@synced\)/);
});

test('decide records a person\'s answer in the §6.8 shape and re-renders the report; report re-renders on request', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-report-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(STATE, tmp, { recursive: true });
  const cli = (...args) => spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });

  let r = cli('report', '--workspace', tmp);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(runDir(tmp), 'report.md'), 'utf8'), /Answer 2 waiting questions/);

  // An answer that is not one of the gate's options is refused: the driver never invents one.
  r = cli('decide', '--workspace', tmp, '--gate', 'Lg6Bud2-1.json', '--answer', 'Quarterly', '--by', 'Pat Owner');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not one of this gate's options: "Monthly", "Weekly", "Both"/);
  assert.equal(readJson(path.join(tmp, 'gates', 'Lg6Bud2-1.json')).decided, null);

  r = cli('decide', '--state', tmp, '--gate', 'gates/Lg4Fx2q-1.json', '--answer', 'real — fix before verify', '--by', 'Pat Owner', '--note', 'F2 is right');
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.effect, out.enters], ['resume', 'FIX_BUILD']); // every decided gate resumes in the next run
  assert.match(out.resume, /start-epic Lg4Fx2q/); // the by-hand command stays as the fallback
  const decided = readJson(path.join(tmp, 'gates', 'Lg4Fx2q-1.json')).decided;
  assert.deepEqual(Object.keys(decided), ['answer', 'by', 'date', 'scope', 'note']);
  assert.equal(decided.answer, 'Real — fix before verify'); // the offered label, exactly
  assert.equal(decided.by, 'Pat Owner');
  assert.match(decided.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(decided.scope, 'next-run');
  const md = fs.readFileSync(path.join(runDir(tmp), 'report.md'), 'utf8');
  assert.match(md, /Answer 1 waiting question: `\/peak-workflow:autopilot report` \(Lg6Bud2\)/);
  assert.match(md, /decided "Real — fix before verify" by Pat Owner on \d{4}-\d{2}-\d{2} — resumes the epic in the next run at FIX_BUILD\n {2}Look at: .*\n {2}By hand instead: /);
  assert.match(md, /2 decided gates \(Lg4Fx2q, Lg5Chr8\) resume their epics on the branch this run left/);

  // A gate with no options has no answer to record.
  fs.writeFileSync(path.join(tmp, 'gates', 'Lg8Hw01-1.json'), JSON.stringify({ epic: 'Lg8Hw01', run: RUN, kind: 'preflight', question: 'CLAUDE.md still has values to decide', options: [], decided: null }));
  r = cli('decide', '--workspace', tmp, '--gate', 'Lg8Hw01-1.json', '--answer', 'ok', '--by', 'Pat Owner');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /has no answer to record: the fix is in the project, and the gate clears when preflight passes/);
});
