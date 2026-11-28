// A slow suite the build ran through the recorder (record-suite.mjs) is handed to the final check, which then does
// not run it again on the same code. Seen live (Pilot Light, 2026-11-27): a 9-11 minute end-to-end suite ran 4-5 times
// per epic, twice of them in the final check on the code the build had just run it on.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evidenceDir, suitesRun } from '../driver.mjs';
import { E1, git, happy, makeProject, readJson } from './helpers.mjs';

const RECORD = path.join(import.meta.dirname, '..', 'record-suite.mjs');
const suite = `node "$AUTOPILOT_RECORD" node -e "console.log('e2e: 12 passed')"`;

test('the build records a slow suite after its last commit: the final check is given its output and told not to run it again', async (t) => {
  const p = makeProject(t);
  const scripts = happy(E1);
  scripts[`${E1.id}/build`].actions.push({ do: 'exec', cmd: suite });
  p.scenario(scripts);
  const state = await p.go();
  assert.equal(state.status, 'DONE');
  const [, build, , verify] = p.calls();
  assert.ok(fs.existsSync(build.env.AUTOPILOT_RECORD) && build.env.AUTOPILOT_EVIDENCE === evidenceDir(p.state, E1.id));
  assert.equal(verify.env.AUTOPILOT_RECORD, undefined, 'the final check reads the run; it records nothing');
  const run = readJson(path.join(evidenceDir(p.state, E1.id), fs.readdirSync(evidenceDir(p.state, E1.id)).find((f) => f.endsWith('.json'))));
  assert.equal(run.exit, 0); assert.equal(run.dirty, false); assert.equal(run.changedDuringRun, false);
  const rules = fs.readFileSync(p.dir(E1.id, 'verify-1', 'verify-rules.md'), 'utf8');
  assert.match(rules, /# Suites the build already ran on this code/);
  assert.match(rules, /do not run them again in full/);
  const copy = rules.match(/Output: `([^`]+)`/)[1];
  assert.ok(copy.startsWith(p.dir(E1.id, 'verify-1', 'scratch') + path.sep), 'copied into the final check\'s scratch folder');
  assert.match(fs.readFileSync(copy, 'utf8'), /e2e: 12 passed/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /verify is given the build's run of 1 slow suite/);
  assert.match(fs.readFileSync(p.dir(E1.id, 'build-1', 'build-rules.md'), 'utf8'), /node "\$AUTOPILOT_RECORD" <the suite's command>/);
});

test('a suite recorded before the build\'s last commit is not handed on: the final check runs it itself', async (t) => {
  const p = makeProject(t);
  const scripts = happy(E1);
  const actions = scripts[`${E1.id}/build`].actions;
  actions.splice(actions.length - 1, 0, { do: 'exec', cmd: suite }); // before the commit: the tree was not clean
  p.scenario(scripts);
  assert.equal((await p.go()).status, 'DONE');
  assert.equal(readJson(path.join(evidenceDir(p.state, E1.id), fs.readdirSync(evidenceDir(p.state, E1.id)).find((f) => f.endsWith('.json')))).dirty, true);
  assert.doesNotMatch(fs.readFileSync(p.dir(E1.id, 'verify-1', 'verify-rules.md'), 'utf8'), /Suites the build already ran/);
});

test('suitesRun: only a clean run on the branch tree as it is now, unchanged while it ran', (t) => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-suites-'));
  t.after(() => fs.rmSync(ws, { recursive: true, force: true }));
  const dir = evidenceDir(ws, 'Ep1');
  fs.mkdirSync(dir, { recursive: true });
  const put = (slug, over) => { fs.writeFileSync(path.join(dir, `${slug}.txt`), `${slug} output\n`); fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify({ command: `run ${slug}`, exit: 0, ms: 600000, at: 'x', tree: 'T1', dirty: false, changedDuringRun: false, output: `${slug}.txt`, ...over })); };
  put('good', {}); put('dirty', { dirty: true }); put('old', { tree: 'T0' }); put('moved', { changedDuringRun: true }); put('failed', { exit: 1 });
  const scratch = path.join(ws, 'scratch');
  const text = suitesRun(ws, 'Ep1', 'T1', scratch);
  assert.match(text, /`run good`: exit 0, 10 min/);
  assert.match(text, /`run failed`: exit 1/, 'a failing run is handed on too: the final check reruns only what failed');
  assert.doesNotMatch(text, /run dirty|run old|run moved/);
  assert.equal(fs.readFileSync(path.join(scratch, 'build-good.txt'), 'utf8'), 'good output\n');
  assert.equal(suitesRun(ws, 'Ep1', 'T9', scratch), null);
  assert.equal(suitesRun(ws, 'NoSuch', 'T1', scratch), null);
  assert.equal(suitesRun(ws, 'Ep1', null, scratch), null);
});

test('record-suite: passes the output and exit code through, keeps a word with spaces whole, and records the tree it ran on', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-record-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q'); fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'a');
  const ev = path.join(repo, '..', `${path.basename(repo)}-ev`);
  t.after(() => fs.rmSync(ev, { recursive: true, force: true }));
  const r = spawnSync(process.execPath, [RECORD, process.execPath, '-e', "console.log('two words'); process.exit(3)"], { cwd: repo, encoding: 'utf8', env: { ...process.env, AUTOPILOT_EVIDENCE: ev } });
  assert.equal(r.status, 3);
  assert.match(r.stdout, /two words/);
  const [json] = fs.readdirSync(ev).filter((f) => f.endsWith('.json'));
  const run = readJson(path.join(ev, json));
  assert.equal(run.exit, 3); assert.equal(run.dirty, false); assert.equal(run.changedDuringRun, false);
  assert.equal(run.tree, git(repo, 'rev-parse', 'HEAD^{tree}'));
  assert.match(fs.readFileSync(path.join(ev, run.output), 'utf8'), /two words/);
});
