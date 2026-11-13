// Driver behaviour, one test per item in autopilot-poc-plan.md §10 P1, all against fake-claude.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR, defaultConfig, effortFor, loadConfig, lintPlan, scopeFlags, sessionSettings } from '../driver.mjs';
import { DRIVER, E1, FAKE, SEED, addEpic, alive, buildActions, buildScript, git, happy, makeProject, planScript, planText, readJson, waitFor, wrapupActions, wrapupScript } from './helpers.mjs';

const go = (p, opts = {}) => p.go(opts);

test('happy path: plan captured, build gets prompt.md with ${CLAUDE_PLUGIN_ROOT} resolved, epic MERGED', async (t) => {
  const p = makeProject(t);
  const before = git(p.project, 'rev-parse', 'develop');
  const scripts = happy(E1);
  scripts[`${E1.id}/build`].actions.unshift({ do: 'control_request', tool_name: 'Bash', input: { command: 'git push' } });
  p.scenario(scripts);

  const state = await go(p);

  assert.equal(state.status, 'DONE');
  assert.equal(state.stoppedBecause, 'queue done');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`, `${E1.id}/build-1`, `${E1.id}/audit-1`, `${E1.id}/verify-1`]);

  // Launcher: host mode and --plugin-dir on every session, in the private clone.
  for (const c of p.calls().filter((x) => x.kind !== 'audit')) {
    const has = (...seq) => c.argv.join('\u0001').includes(seq.join('\u0001'));
    assert.ok(has('-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio'), `${c.step}: host mode`);
    assert.ok(has('--plugin-dir', PLUGIN_DIR), `${c.step}: --plugin-dir`);
    assert.ok(has('--permission-mode', 'acceptEdits'), `${c.step}: acceptEdits`);
    assert.equal(c.cwd, p.clone);
    assert.equal(c.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1');
    assert.equal(c.env.AUTOPILOT_STATE, p.state);
    assert.equal(c.env.AUTOPILOT_RUN, p.runDir());
    assert.ok(c.env.AUTOPILOT_STEP.startsWith(path.join(p.runDir(), 'epics', E1.id) + path.sep));
  }
  const [plan, build, audit, verify] = p.calls();
  assert.equal(audit.env.AUTOPILOT_ROLE, 'auditor');
  assert.equal(plan.prompt, `/peak-workflow:start-epic ${E1.id}`);
  assert.equal(plan.env.AUTOPILOT_ROLE, 'planner');
  assert.equal(verify.prompt, `/peak-workflow:wrapup-epic ${E1.id}`);
  assert.equal(verify.env.AUTOPILOT_ROLE, 'verifier');
  assert.equal(verify.argv[verify.argv.indexOf('--model') + 1], 'opus');
  const eff = (c) => c.argv[c.argv.indexOf('--effort') + 1];
  assert.equal(eff(verify), 'medium'); assert.equal(eff(audit), 'medium'); assert.equal(eff(plan), 'high');

  // The build session's prompt is the captured plan in the clear-context handoff shape.
  const dir = p.dir(E1.id);
  assert.equal(readJson(path.join(dir, 'plan-1', 'plan-lint.json')).pass, true);
  const prompt = fs.readFileSync(path.join(dir, 'build-1', 'prompt.md'), 'utf8');
  assert.equal(build.prompt, prompt);
  assert.ok(prompt.startsWith('Implement the following plan:\n\n# Plan'));
  assert.ok(prompt.includes(`sh "${PLUGIN_DIR}/scripts/tor-lifecycle"`));
  assert.ok(!prompt.includes('${CLAUDE_PLUGIN_ROOT}'));
  assert.ok(fs.readFileSync(path.join(dir, 'plan-1', 'plan.md'), 'utf8').includes('${CLAUDE_PLUGIN_ROOT}'));
  assert.equal(build.argv[build.argv.indexOf('--append-system-prompt-file') + 1], path.join(dir, 'build-1', 'build-rules.md'));

  // The host approves nothing: a permission prompt that reaches it is denied and logged.
  const answer = readJson(path.join(dir, 'build-1', 'fake-control-response.json'));
  assert.equal(answer.response.response.behavior, 'deny');
  assert.equal(readJson(path.join(dir, 'build-1', 'control-requests.json'))[0].tool_name, 'Bash');

  // Checks and merge are recorded; the merge is a --no-ff merge on the clone's develop.
  assert.equal(readJson(path.join(dir, 'check-build-1.json')).pass, true);
  assert.equal(readJson(path.join(dir, 'check-verify-1.json')).pass, true);
  assert.equal(git(p.clone, 'rev-list', '--parents', '-n', '1', 'develop').split(' ').length, 3);
  assert.equal(git(p.clone, 'branch', '--list', E1.branch), '');
  assert.equal(git(p.clone, 'remote'), '');

  // The user's repository is never written.
  assert.equal(git(p.project, 'rev-parse', 'develop'), before);
  assert.equal(git(p.project, 'branch', '--list', 'feature/*'), '');
  assert.equal(git(p.project, 'status', '--porcelain'), '');

  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.equal(report.epics[0].outcome, 'MERGED');
  assert.equal(report.spentUsd, 2.01); // plan 0.40 + build 0.30 + audit 0.01 + verify 1.30
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')));
});

test('plan lint fail parks the epic and no build session starts', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['deferral', 'mark'] }) });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /plan lint failed: .*Mark as Implemented.*Deferral gate/);
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`]);
  const gate = readJson(path.join(p.state, 'gates', `${E1.id}-1.json`));
  assert.equal(gate.kind, 'plan-lint');
  assert.deepEqual(gate.artifacts, [`${p.rel()}/epics/${E1.id}/plan-1/plan.md`]);
  assert.equal(readJson(p.dir(E1.id, 'plan-1', 'plan-lint.json')).pass, false);
});

test('build over budget: uncommitted work becomes a WIP commit and the epic parks', async (t) => {
  const p = makeProject(t);
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: { actions: buildActions(E1, { commit: false }), result: { subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 15 } },
  });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /budget: build-1 hit error_max_budget_usd/);
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', E1.branch), 'wip(autopilot): uncommitted work at park');
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  assert.ok(git(p.clone, 'show', '--name-only', '--format=', E1.branch).includes(`src/${E1.slug}.js`));
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`, `${E1.id}/build-1`]);
});

test('check failure: exactly one repair session, then park', async (t) => {
  const p = makeProject(t);
  const failing = { testBody: " throw new Error('red'); " };
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: buildScript(E1, failing),
    [`${E1.id}/plan-fix`]: planScript(E1),
    [`${E1.id}/fix`]: { actions: [{ do: 'commit', message: `feat(epic-${E1.id}): try again` }] },
  });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /CHECK_BUILD still fails after the fix round \(tests-green\)/);
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'fix-1'].map((s) => `${E1.id}/${s}`));
  const dir = p.dir(E1.id);
  assert.deepEqual(readJson(path.join(dir, 'check-build-1.json')).checks.filter((c) => !c.pass).map((c) => c.name), ['tests-green']);
  assert.equal(readJson(path.join(dir, 'check-build-2.json')).pass, false);
  // The repair is one builder session: its prompt is the brief that names the failed check, and it has its own rules.
  const brief = path.join(dir, 'fix-brief.md');
  assert.match(fs.readFileSync(brief, 'utf8'), /\*\*tests-green\*\*/);
  const [, , fix] = p.calls();
  assert.match(fix.prompt, /^This is the one repair round for epic Lg1Csv7 \(csv-import\) — CSV import\. The epic is already built on branch `feature\/epic-Lg1Csv7-csv-import`/);
  assert.ok(fix.prompt.includes(fs.readFileSync(brief, 'utf8').trim()));
  assert.match(fix.prompt, /Commit on the branch[^\n]*`fix\(epic-Lg1Csv7\): /);
  assert.equal(fix.env?.AUTOPILOT_ROLE ?? 'builder', 'builder');
  const rules = fs.readFileSync(path.join(dir, 'fix-1', 'build-rules.md'), 'utf8');
  assert.match(rules, /# Autopilot repair rules/);
  assert.ok(fix.argv.includes(path.join(dir, 'fix-1', 'build-rules.md')));
  assert.equal(fix.argv[fix.argv.indexOf('--max-turns') + 1], '150');
});

test('verify FAIL, one fix round, verify PASS: MERGED', async (t) => {
  const p = makeProject(t);
  p.scenario({
    ...happy(E1),
    [`${E1.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL\nTOR-01-Hd3Yc8L: the description is trimmed (test/import.test.js:41)' } },
    [`${E1.id}/plan-fix`]: planScript(E1),
    [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = true;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): keep the description verbatim` }] }, // the subject the repair prompt asks for
  });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.equal(e.fixRounds, 1);
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'verify-1', 'fix-1', 'audit-2', 'verify-2'].map((s) => `${E1.id}/${s}`));
  assert.match(fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8'), /TOR-01-Hd3Yc8L: the description is trimmed/);
  assert.ok(git(p.clone, 'ls-tree', '-r', '--name-only', 'develop').includes('src/fix.js'));
});

test('verified but not merged: the epic parks with a resume gate and is never called FAILED, even after a fix round', async (t) => {
  const unmerged = { actions: wrapupActions(E1).slice(0, 5), result: { result: 'Epic passed verification, 4/4, and is marked Complete on its feature branch. It is not merged into develop yet.' } };
  const p = makeProject(t);
  p.scenario({
    ...happy(E1),
    [`${E1.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL\nTOR-01-Hd3Yc8L: the description is trimmed' } },
    [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = true;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): keep the description verbatim` }] },
    [`${E1.id}/verify-2`]: unmerged,
  });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED', e.reason);
  assert.match(e.reason, /verified every requirement and marked the epic Complete .* but did not merge it into develop/);
  const g = readJson(path.join(p.state, 'gates', e.gates.at(-1)));
  assert.deepEqual([g.kind, g.phase, g.options], ['resume', 'VERIFY', ['Resume from where it stopped', 'Start over']]);
  assert.match(g.why, /nothing failed/);
  assert.equal(git(p.clone, 'rev-parse', 'develop'), e.preVerify.developSha, 'develop is untouched');
});

test('safety caps are sized for the confirm screen, and a scenario\'s Then lines are read without their keywords', async () => {
  const { capSize, thenClauses, launchFacts, defaultConfig } = await import('../driver.mjs');
  assert.deepEqual([15, 30, 45, 60, 90, 121].map(capSize), ['XS', 'S', 'M', 'M', 'L', 'XL']);
  assert.deepEqual(thenClauses("Scenario: [TOR-01-AAAAAAA] x\n    # Verification: operator-observed\n    Given a file\n    And another\n    When the user opens it\n    Then the user should see one bar\n    And every label should be readable\n    But no label should overlap"), ['the user should see one bar', 'every label should be readable', 'no label should overlap']);
  assert.deepEqual(thenClauses('Scenario: nothing promised\n    Given a file'), []);
  const caps = launchFacts(SEED, path.join(os.tmpdir(), 'autopilot-no-such-workspace'), defaultConfig(SEED)).caps;
  assert.deepEqual(caps.map((c) => [c.session, c.size, c.minutes, c.usd]), [['plan', 'S', 30, 5], ['build', 'L', 90, 15], ['audit', 'XS', 15, 3], ['verify', 'M', 45, 10], ['fix', 'M', 60, 12]]);
});

test('bad merge (an extra commit on develop) is rolled back and the epic parks', async (t) => {
  const p = makeProject(t);
  const extra = [{ do: 'write', path: 'src/extra.js', content: '// straight onto develop\n' }, { do: 'commit', message: 'chore: extra commit on develop' }];
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: wrapupScript(E1, { afterMerge: extra }) });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /merge gate failed \(verdict\); develop rolled back/);
  assert.equal(git(p.clone, 'rev-parse', 'develop'), e.preVerify.developSha);
  assert.equal(git(p.clone, 'rev-parse', E1.branch), e.preVerify.branchTip);
  assert.equal(git(p.clone, 'branch', '--show-current'), 'develop');
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  // The rejected tip stays reachable for the morning review.
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', e.rejected[0]), 'chore: extra commit on develop');
  assert.match(readJson(p.dir(E1.id, 'check-verify-1.json')).checks[0].evidence[0], /advanced by 2 first-parent commits/);
});

test('merge gate: a commit added during verify may touch only docs/', async (t) => {
  const p = makeProject(t);
  const code = [{ do: 'write', path: 'src/sneaky.js', content: 'export const late = 1;\n' }, { do: 'commit', message: 'fix: change code at wrapup' }];
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: wrapupScript(E1, { extraOnBranch: code }) });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(readJson(p.dir(E1.id, 'check-verify-1.json')).checks[0].evidence[0], /outside docs\/: src\/sneaky\.js/);
  assert.equal(git(p.clone, 'rev-parse', 'develop'), e.preVerify.developSha);
});

test('merge gate: no waivers — the Deferrals Count line is parsed, and a waived: line fails', async (t) => {
  const p = makeProject(t);
  // "waived: 1" on the Count line; the clean line also contains the word, so only the numbers decide.
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: wrapupScript(E1, { counts: [1, 0, 1, 0, 0, 0], waived: true }) });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  const check = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'no-waivers');
  assert.equal(check.pass, false);
  assert.equal(check.evidence.waivedLineInSidecar, true);
  assert.match(check.evidence.countLine, /^Count: 1 \(undisclosed: 0, waived: 1,/);
  assert.equal(git(p.clone, 'rev-parse', 'develop'), e.preVerify.developSha);
});

test('dependents are BLOCKED after a park while independent epics still run', async (t) => {
  const p = makeProject(t);
  const b = addEpic(p.project, { id: 'Lg2Cat4', slug: 'categorize', name: 'Categorization rules', nn: '02', deps: [E1.id] });
  const c = addEpic(p.project, { id: 'Lg3Sum9', slug: 'summary', name: 'Monthly summary', nn: '03', deps: [b.id] });
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['commit'] }), ...happy(d) });

  const state = await go(p);

  assert.deepEqual(state.queue.map((q) => [q.id, q.state]), [[E1.id, 'PARKED'], [b.id, 'BLOCKED'], [c.id, 'BLOCKED'], [d.id, 'MERGED']]);
  assert.match(p.epic(b.id).reason, new RegExp(`dependency not merged: ${E1.id} \\(PARKED\\)`));
  assert.match(p.epic(c.id).reason, new RegExp(`dependency not merged: ${b.id} \\(BLOCKED\\)`));
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`, `${d.id}/plan-1`, `${d.id}/build-1`, `${d.id}/audit-1`, `${d.id}/verify-1`]);
  assert.equal(state.stoppedBecause, 'queue done');
});

test('base red stops the run before any session', async (t) => {
  const p = makeProject(t);
  fs.writeFileSync(path.join(p.project, 'test', 'red.test.js'), "import test from 'node:test';\ntest('red', () => { throw new Error('base is red'); });\n");
  git(p.project, 'add', '-A');
  git(p.project, 'commit', '-q', '-m', 'test: a failing test on develop');
  p.scenario(happy(E1));

  const state = await go(p);

  assert.equal(state.status, 'STOPPED');
  assert.equal(state.stoppedBecause, 'base red');
  assert.equal(p.epic(E1.id).state, 'QUEUED');
  assert.deepEqual(p.calls(), []);
  assert.equal(readJson(path.join(p.runDir(), 'report.json')).epics[0].outcome, 'NOT STARTED');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Fix the failing tests on `develop`/);
});

test('STOP mid-step kills the session, parks the epic and stops the run', async (t) => {
  const p = makeProject(t);
  const d = addEpic(p.project, { id: 'Lg6Cfg3', slug: 'config', name: 'Config validation', nn: '06' });
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'hang' }] }, ...happy(d) });

  const running = go(p);
  const pid = await waitFor(() => p.epic(E1.id).step?.name === 'build-1' && p.epic(E1.id).step.pid);
  await waitFor(() => fs.existsSync(path.join(p.clone, 'src', 'half.js')));
  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  const state = await running;

  assert.equal(state.status, 'STOPPED');
  assert.equal(state.stoppedBecause, 'STOP file');
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.match(p.epic(E1.id).reason, /stopped by the STOP file during build-1/);
  assert.equal(alive(pid), false);
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', E1.branch), 'wip(autopilot): uncommitted work at park');
  assert.equal(p.epic(d.id).state, 'QUEUED'); // nothing else starts after STOP
  assert.ok(fs.existsSync(path.join(p.runDir(), 'report.md')));
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')));
});

/** Starts the driver as its own process and SIGKILLs it once the verify session is running. */
async function killDriverMidVerify(p) {
  const child = spawn(process.execPath, [DRIVER, 'run', '--workspace', p.state, '--allow-test-double'], { stdio: 'ignore' });
  const exited = new Promise((r) => child.on('exit', r));
  const sessionPid = await waitFor(() => p.epic(E1.id).step?.name === 'verify-1' && p.epic(E1.id).step.pid);
  return { child, exited, sessionPid };
}

test('kill -9 of the driver mid-VERIFY, then --resume: leftovers killed, verify re-run once, MERGED', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify-1`]: { actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'docs/half-written.md', content: 'x\n' }, { do: 'hang' }] } });
  const { child, exited, sessionPid } = await killDriverMidVerify(p);
  await waitFor(() => fs.existsSync(path.join(p.clone, 'docs', 'half-written.md')));
  child.kill('SIGKILL');
  await exited;
  assert.equal(alive(sessionPid), true, 'the session outlives the driver (own process group)');
  assert.equal(p.epic(E1.id).state, 'VERIFY');

  await assert.rejects(go(p), /did not finish .*pass --resume/);
  const state = await go(p, { resume: true });

  assert.equal(alive(sessionPid), false);
  assert.equal(state.status, 'DONE');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.steps().slice(3), [`${E1.id}/verify-1`, `${E1.id}/verify-2`]);
  assert.ok(!git(p.clone, 'ls-tree', '-r', '--name-only', 'develop').includes('half-written.md'));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /stale lock taken over[\s\S]*killed leftover session verify-1[\s\S]*re-entering at VERIFY/);
});

test('kill -9 mid-VERIFY after the merge landed, then --resume: the merge gate decides, no second verify', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [...wrapupActions(E1), { do: 'hang' }] } });
  const { child, exited } = await killDriverMidVerify(p);
  await waitFor(() => git(p.clone, 'rev-parse', 'develop') !== p.epic(E1.id).preVerify.developSha && git(p.clone, 'branch', '--list', E1.branch) === '');
  child.kill('SIGKILL');
  await exited;

  await go(p, { resume: true });

  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.equal(readJson(p.dir(E1.id, 'check-verify-1.json')).pass, true);
});

test('stale lock is taken over with a log line; a live lock refuses', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  t.after(() => sleeper.kill('SIGKILL'));
  fs.writeFileSync(path.join(p.state, 'lock'), JSON.stringify({ pid: sleeper.pid, started: '2026-11-11T00:00:00Z' }));
  await assert.rejects(go(p), new RegExp(`already running here \\(pid ${sleeper.pid}`));
  assert.deepEqual(p.calls(), []);
  assert.equal(readJson(path.join(p.state, 'lock')).pid, sleeper.pid);

  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  fs.writeFileSync(path.join(p.state, 'lock'), JSON.stringify({ pid: dead, started: '2026-11-10T22:05:00Z' }));
  const state = await go(p);

  assert.equal(state.status, 'DONE');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`stale lock taken over \\(pid ${dead}, started 2026-11-10T22:05:00Z`));
  assert.ok(!fs.existsSync(path.join(p.state, 'lock')));
});

test('dry run prints the queue, commands, settings and policy, and invokes and writes nothing', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  const before = fs.readdirSync(p.state);
  const r = spawnSync(process.execPath, [DRIVER, 'run', '--state', p.state, '--dry-run'], { encoding: 'utf8' });

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1\. Lg1Csv7 \(csv-import\) — CSV import {3}deps: — {3}branch: feature\/epic-Lg1Csv7-csv-import {3}\[eligible\]/);
  assert.ok(r.stdout.includes(`$ ${FAKE} -p --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio --include-hook-events --plugin-dir ${PLUGIN_DIR} --settings '${p.state}/runs/<run>/epics/Lg1Csv7/plan-1/settings.json' --permission-mode acceptEdits`));
  assert.ok(r.stdout.includes('"text":"/peak-workflow:start-epic Lg1Csv7"'));
  assert.ok(r.stdout.includes('"text":"/peak-workflow:wrapup-epic Lg1Csv7"'));
  assert.match(r.stdout, /--max-turns 150 --max-budget-usd 10 --session-id '<uuid>' --model opus --effort medium/);
  assert.ok(r.stdout.includes('"Bash(git remote set-url *)"'));
  assert.match(r.stdout, /Gate policy:/);
  assert.deepEqual(p.calls(), []);
  assert.deepEqual(fs.readdirSync(p.state), before);
  assert.equal(git(p.project, 'status', '--porcelain'), '');

  // P1 exit: the ledger seed as checked in (not a repository of its own) prints its queue too.
  const seed = spawnSync(process.execPath, [DRIVER, 'run', '--project', SEED, '--state', path.join(p.tmp, 'none'), '--dry-run'], { encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  assert.match(seed.stdout, /1\. Lg1Csv7 \(csv-import\) — CSV import/);
  assert.ok(seed.stdout.includes('$ claude -p --input-format stream-json'));
  assert.ok(!fs.existsSync(path.join(p.tmp, 'none')));
});

test('scope flags are advisory word matches: they name the need, and bare "account" or "server" no longer trip them', () => {
  // Noisy before P3.5: the ledger's own vocabulary.
  assert.deepEqual(scopeFlags('Given a CSV export of the bank account\nThen the summary lists each account once'), []);
  assert.deepEqual(scopeFlags('Given the tool runs with no server and no network access needed'), []);
  assert.deepEqual(scopeFlags('Then each token of the description is matched case-insensitively'), []);
  // Still flagged.
  assert.deepEqual(scopeFlags('Given the rates server at https://rates.example.com is online'), ['network']);
  assert.deepEqual(scopeFlags('When the tool fetches live rates from the remote server'), ['network']);
  assert.deepEqual(scopeFlags('Given the user has set an API key and signs in with their user account'), ['keys or accounts']);
  assert.deepEqual(scopeFlags('Given a ledger of 2,000,000 transactions\nWhen the summary runs in a docker container on Windows for 3 hours'), ['containers or other machines', 'big data', 'long run', 'other platforms']);
});

test('owner decision: git remote writes are denied, the read-only listing is not', () => {
  const deny = sessionSettings().permissions.deny;
  for (const verb of ['add', 'set-url', 'rename', 'remove']) assert.ok(deny.includes(`Bash(git remote ${verb} *)`), verb);
  assert.ok(!deny.some((r) => /^Bash\(git remote \*?\)?$/.test(r) || r === 'Bash(git remote *)'));
  assert.ok(deny.includes('Bash(git push *)'));
});

test('plan lint keys on headings and anchors, and refuses push, sudo and container commands', () => {
  assert.deepEqual(lintPlan(planText(E1), E1.tors).problems, []);
  assert.deepEqual(lintPlan(planText(E1, { omit: ['amendment'] }), E1.tors).problems, ['missing "Amendment gate"']);
  // Seen in Run A: the plan kept every step but shortened three headings. That is still a complete plan.
  const short = planText(E1).replace('Create (or verify) feature branch', 'Feature branch').replace('Update status to "In Progress"', 'Status → In Progress').replace('Mark as Implemented', 'Mark Implemented');
  assert.doesNotMatch(short, /Create \(or verify\)|Update status to|Mark as Implemented/);
  assert.deepEqual(lintPlan(short, E1.tors).problems, []);
  // Run A again: "1. **Branch** — verify with `git show-ref … refs/heads/feature/epic-…`".
  assert.deepEqual(lintPlan(planText(E1).replace(/1\. \*\*Create \(or verify\) feature branch\*\* — `[^`]+`/, `1. **Branch** — verify with \`git show-ref --verify --quiet refs/heads/${E1.branch}\``), E1.tors).problems, []);
  assert.deepEqual(lintPlan(planText(E1, { omit: ['branch'] }), E1.tors).problems, ['missing "Create (or verify) feature branch"']);
  assert.deepEqual(lintPlan(planText(E1, { omit: ['status', 'mark'] }), E1.tors).problems, ['missing "Update status to "In Progress""', 'missing "Mark as Implemented"']);
  assert.deepEqual(lintPlan(planText(E1), [...E1.tors, 'TOR-09-Missing']).problems, ['does not name anchor TOR-09-Missing']);
  // Shorthand seen on a real 27-anchor plan: the prefix once, then bare suffixes. A suffix inside a longer word does not count.
  const shorthand = planText(E1).replaceAll(E1.tors[1], E1.tors[1].split('-').at(-1)).replaceAll(E1.tors[2], `x${E1.tors[2].split('-').at(-1)}`);
  assert.deepEqual(lintPlan(shorthand, E1.tors).problems, [`does not name anchor ${E1.tors[2]}`]);
  assert.deepEqual(lintPlan(planText(E1) + '\nThen run `git push origin develop` and `sudo make install` and `docker run x`.\n', E1.tors).problems, ['contains git push', 'contains sudo', 'contains a container or VM command']);
  assert.equal(lintPlan(planText(E1, { omit: ['commit'] }), E1.tors).pass, false);
});

// ---- driver and real hooks together (P2): the fake calls the hooks named in settings.json ------

const ask = (question, options) => ({ do: 'tool', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question, options: options.map((label) => ({ label })) }] } });

test('driver + real hooks: the hook answers Step 2.5, captures and lints the plan, and the epic merges', async (t) => {
  const p = makeProject(t);
  p.scenario({
    ...happy(E1),
    [`${E1.id}/plan`]: { actions: [
      ask(`Start Epic ${E1.id} (${E1.slug}) — CSV import? Phase 1 — Core`, ['Start it', 'Show me the ready epics instead', 'Stop']),
      { do: 'branch', name: E1.branch },
      { do: 'tool', tool_name: 'ExitPlanMode', tool_input: { plan: planText(E1) } },
      { do: 'write', path: 'src/never.js', content: 'the session ended at ExitPlanMode\n' },
    ] },
    [`${E1.id}/verify`]: { actions: [
      ask('Verdict PASS. Proceed to Phase 2 (complete and ship)?', ['Proceed', 'Stop']),
      ask('Epic X verdict: PASS. Proceed to Phase 2 (complete and ship)?', ['Proceed', 'Stop']),
      ask('Did you perform any manual verification beyond the automated gates I ran?', ['Yes — I performed manual verification', 'No — only automated gates were run']),
      { do: 'tool', tool_name: 'Bash', tool_input: { command: 'git push origin develop' } },
      ...wrapupActions(E1),
    ] },
  });

  await go(p);

  assert.equal(p.epic(E1.id).state, 'MERGED');
  const dir = p.dir(E1.id);
  const tools = (step) => fs.readFileSync(path.join(dir, step, 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).out);
  const [start, exit] = tools('plan-1');
  assert.equal(Object.values(start.hookSpecificOutput.updatedInput.answers)[0], 'Start it');
  assert.equal(exit.stopReason, 'autopilot: plan captured');
  assert.equal(fs.readFileSync(path.join(dir, 'plan-1', 'plan.md'), 'utf8'), planText(E1));
  assert.equal(readJson(path.join(dir, 'plan-1', 'result.json')).terminal_reason, 'hook_stopped');
  assert.ok(!fs.existsSync(path.join(p.clone, 'src', 'never.js')));
  const [proceed, proceedColon, manual, push] = tools('verify-1');
  assert.equal(Object.values(proceed.hookSpecificOutput.updatedInput.answers)[0], 'Proceed');
  assert.equal(Object.values(proceedColon.hookSpecificOutput.updatedInput.answers)[0], 'Proceed');
  assert.equal(Object.values(manual.hookSpecificOutput.updatedInput.answers)[0], 'No — only automated gates were run');
  assert.match(push.hookSpecificOutput.permissionDecisionReason, /^autopilot R3: git push/);
  assert.equal(p.epic(E1.id).sessions.find((s) => s.name === 'verify-1').denials, 1);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'verify-1', 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).decision), ['answer', 'answer', 'answer', 'deny']);
});

test('driver + real hooks: a deferral question in the build session parks the epic with the hook\'s gate file', async (t) => {
  const p = makeProject(t);
  const question = `${E1.tors[3]} cannot be fully met: amounts with three decimals. Recommendation: Fix now — small. How to proceed?`;
  p.scenario({
    [`${E1.id}/plan`]: planScript(E1),
    [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(question, ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"]), { do: 'write', path: 'src/never.js', content: 'x' }] },
  });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /parked at a human gate \(Lg1Csv7-1\.json\)/);
  const gate = readJson(path.join(p.state, 'gates', `${E1.id}-1.json`));
  assert.deepEqual([gate.kind, gate.session, gate.question, gate.tor], ['deferral', 'build-1', question, E1.tors[3]]);
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', E1.branch), 'wip(autopilot): uncommitted work at park');
  assert.ok(!git(p.clone, 'ls-tree', '-r', '--name-only', E1.branch).includes('src/never.js'));
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`, `${E1.id}/build-1`]);
});

test('effort defaults by model family (haiku/sonnet high, opus/fable medium) and is overridable per step', (t) => {
  assert.equal(effortFor({ model: 'sonnet' }), 'high');
  assert.equal(effortFor({ model: 'claude-haiku-5-5' }), 'high');
  assert.equal(effortFor({ model: 'opus' }), 'medium');
  assert.equal(effortFor({ model: 'claude-fable-5-2' }), 'medium');
  assert.equal(effortFor({ model: 'something-else' }), null);
  assert.equal(effortFor({ model: 'opus', effort: 'max' }), 'max');

  const p = makeProject(t);
  fs.mkdirSync(path.join(p.project, '.claude', 'peak-workflow'), { recursive: true });
  const file = path.join(p.project, '.claude', 'peak-workflow', 'autopilot.json');
  fs.writeFileSync(file, JSON.stringify({ budgets: { build: { effort: 'xhigh' }, verify: { model: 'sonnet' } } }));
  const cfg = loadConfig(p.state, { project: p.project });
  assert.equal(effortFor(cfg.budgets.build), 'xhigh');
  assert.equal(effortFor(cfg.budgets.verify), 'high', 'a model override moves the default with it');
  assert.equal(effortFor(cfg.budgets.audit), 'medium');

  fs.writeFileSync(file, JSON.stringify({ budgets: { build: { effort: 'huge' } } }));
  assert.throws(() => loadConfig(p.state, { project: p.project }), /budgets\.build\.effort must be one of/);
});
