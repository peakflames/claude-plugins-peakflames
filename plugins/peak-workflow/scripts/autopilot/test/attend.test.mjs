// Autopilot, attended: what a session that stays with a run reads and asks the driver —
// `watch` (the lines it relays), `status` (what to do next) and `continue` (the standing answer
// for technical stops). All against fake-claude.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DRIVER, E1, alive, happy, makeProject, planScript, readJson, waitFor } from './helpers.mjs';

const driver = (...args) => { const r = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' }); return { ...r, lines: () => r.stdout.trim().split('\n'), json: () => JSON.parse(r.stdout) }; };
const NAME = `${E1.id} — CSV import`;

/** `driver.mjs watch` as a child process whose stdout lines are collected as they arrive. */
function startWatch(p, ...args) {
  const child = spawn(process.execPath, [DRIVER, 'watch', '--workspace', p.state, '--poll-ms', '40', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  const w = { child, text: '', lines: () => w.text.split('\n').filter(Boolean), done: new Promise((resolve) => child.on('close', resolve)) };
  child.stdout.on('data', (d) => { w.text += d; });
  return w;
}

test('watch on a finished run: one line on where it ended, then RUN ENDED, exit 0', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  await p.go();

  const r = driver('watch', '--workspace', p.state);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lines(), ['The last autopilot run has ended: 1 finished and merged. Spent $2.01 of $80.', 'RUN ENDED: everything queued was worked through. Spent $2.01.']);

  // --replay says the whole run again, from its first event; --once --after picks up where a caller left off.
  const replay = driver('watch', '--workspace', p.state, '--replay').lines();
  assert.deepEqual([replay[1], replay[2], replay.at(-2), replay.at(-1)], ['Autopilot started: 1 epic queued.', `Starting ${NAME}`, `Finished and merged: ${NAME} (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01.']);
  assert.equal(replay.filter((l) => /^RUN ENDED/.test(l)).length, 1);
  assert.deepEqual(driver('watch', '--workspace', p.state, '--once', '--after', '13').lines(), [`Finished and merged: ${NAME} (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01.']);

  // A run from before events existed is still read from its state; a workspace with no run says so.
  fs.rmSync(path.join(p.runDir(), 'events.jsonl'));
  assert.equal(driver('watch', '--workspace', p.state).lines().at(-1), 'RUN ENDED: everything queued was worked through. Spent $2.01.');
  fs.rmSync(path.join(p.state, 'runs'), { recursive: true }); fs.rmSync(path.join(p.state, 'current'));
  assert.deepEqual(driver('watch', '--workspace', p.state, '--grace-ms', '0').lines(), ['No autopilot run has started here yet.', 'RUN ENDED: no run to watch.']);
  assert.equal(spawnSync(process.execPath, [DRIVER, 'watch'], { encoding: 'utf8' }).status, 2, 'watch needs --workspace');
});

test('watch on a live run: step lines as they happen, a repeated refusal said once, the tests\' result, and the end', async (t) => {
  const p = makeProject(t);
  const push = { do: 'tool', tool_name: 'Bash', tool_input: { command: 'git push origin develop' } };
  const tests = (hook) => ({ do: 'write', path: '{{step}}/hooks.jsonl', append: true, content: `${JSON.stringify({ hook, tool_name: 'Bash', tool_input: { command: 'cd . && node --test' } })}\n` });
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, push, push, tests('PostToolUseFailure'), tests('PostToolUse'), { do: 'write', path: '{{state}}/mid-build', content: '' }, { do: 'hang' }] },
  });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => readJson(path.join(p.state, 'lock')).pid);
  const w = startWatch(p, '--replay');
  t.after(() => w.child.kill('SIGKILL'));

  await waitFor(() => fs.existsSync(path.join(p.state, 'mid-build')) && w.lines().some((l) => l === 'TESTS passed'));
  assert.ok(alive(w.child.pid), 'the watch stays while the run does');
  const mid = w.lines();
  assert.match(mid[0], /^Autopilot is (running|starting)/);
  assert.deepEqual(mid.slice(1, 4), ['Autopilot started: 1 epic queued.', `Starting ${NAME}`, `Planning ${NAME}`]);
  assert.match(mid[4], /^Plan finished in under a minute/);
  assert.equal(mid[5], `Building ${NAME}`);
  const refused = mid.filter((l) => /^REFUSED/.test(l));
  assert.equal(refused.length, 1, 'the same refusal twice is one line');
  assert.match(refused[0], /^REFUSED \(git rule\): /);
  assert.deepEqual(mid.filter((l) => /^TESTS/.test(l)), ['TESTS failed', 'TESTS passed']);

  // A second watch that joins mid-step starts from where the run is: no old lines, no old refusals.
  const late = startWatch(p);
  t.after(() => late.child.kill('SIGKILL'));
  await waitFor(() => late.lines().length >= 1);
  assert.match(late.lines()[0], new RegExp(`^Autopilot is running: now building ${NAME}, \\d+ min\\. Spent \\$0\\.40 of \\$80\\.$`));

  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  assert.equal(await w.done, 0);
  assert.equal(await late.done, 0);
  await waitFor(() => !alive(run.pid));
  const end = w.lines().slice(mid.length);
  assert.match(end[0], /^Build stopped, as you asked, after under a minute$/);
  assert.deepEqual(end.slice(1), [`Stopped: ${NAME} — you asked it to stop`, 'RUN ENDED: you asked it to stop. Spent $0.40.']);
  assert.deepEqual(late.lines().slice(1), end, 'the late watch says what happened after it joined, and nothing from before');
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')), 'the watch ends once the driver has let go');
});

test('watch --once: returns after the first thing said, with where to pick up; a third identical refusal is said again', async (t) => {
  const p = makeProject(t);
  const push = { do: 'tool', tool_name: 'Bash', tool_input: { command: 'git push origin develop' } };
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, push, push, push, { do: 'write', path: '{{state}}/mid-build', content: '' }, { do: 'hang' }] } });
  const run = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  t.after(() => { if (alive(run.pid)) run.kill('SIGKILL'); });
  await waitFor(() => fs.existsSync(path.join(p.state, 'mid-build')));

  // Nothing new since this watch joined: it waits, and gives up quietly at its time limit.
  const idle = driver('watch', '--workspace', p.state, '--once', '--once-min', '0.01', '--poll-ms', '40');
  assert.equal(idle.status, 0);
  assert.match(idle.lines()[0], /^Autopilot is running: now building/);
  assert.deepEqual(idle.lines().slice(1), ['(next: --after 5)']);
  // From an earlier point it says what it missed and returns at once.
  const caught = driver('watch', '--workspace', p.state, '--once', '--after', '3', '--poll-ms', '40');
  assert.match(caught.lines()[0], /^Plan finished/);
  assert.deepEqual(caught.lines().slice(1), [`Building ${NAME}`, '(next: --after 5)']);
  // The whole step, replayed: the refusal is said the first time and the third.
  const all = driver('watch', '--workspace', p.state, '--once', '--replay', '--poll-ms', '40').lines().filter((l) => /^REFUSED/.test(l));
  assert.equal(all.length, 2);
  assert.match(all[1], /^REFUSED 3 times \(git rule\): /);

  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  await waitFor(() => !alive(run.pid));
});
