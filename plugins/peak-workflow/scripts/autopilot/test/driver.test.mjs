// Driver behaviour, one test per item in autopilot-poc-plan.md §10 P1, all against fake-claude.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR, defaultConfig, localDate, scratchRule, effortFor, eventLine, loadConfig, noteSubject, presenceRule, spendRule, unprovenLines, lintPlan, networkProblems, REGISTRIES, scopeFlags, sessionSettings } from '../driver.mjs';
import { estimateCost, failingTests } from '../lib.mjs';
import { DRIVER, E1, FAKE, SEED, addEpic, alive, killFakes, buildActions, buildScript, git, happy, makeProject, planScript, planText, quick, readJson, waitFor, wrapupActions, wrapupScript } from './helpers.mjs';

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
  // One file reaches the session: its rules and the scratch-folder rule, joined (`claude` keeps only the last such flag).
  assert.equal(build.argv[build.argv.indexOf('--append-system-prompt-file') + 1], path.join(dir, 'build-1', 'system-append.md'));
  assert.ok(fs.readFileSync(path.join(dir, 'build-1', 'system-append.md'), 'utf8').startsWith(fs.readFileSync(path.join(dir, 'build-1', 'build-rules.md'), 'utf8').trimEnd()));

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

test('a step\'s model changed while a run goes reaches the next step; the run\'s own keys are never read again; step.json names model and effort', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/plan`]: { ...planScript(E1), actions: [{ do: 'sleep', ms: 1500 }, ...planScript(E1).actions] } });
  const running = go(p);
  await waitFor(() => fs.existsSync(p.dir(E1.id, 'plan-1', 'step.json')));
  // The owner asks for Opus for the build while the plan runs, and something changes the run's mode by hand.
  const settings = path.join(p.state, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({ ...readJson(settings), budgets: { build: { model: 'opus' } } }));
  const cfgFile = path.join(p.runDir(), 'config.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ ...readJson(cfgFile), mode: 'provisional', realSpend: true }));
  await running;

  assert.deepEqual([readJson(p.dir(E1.id, 'plan-1', 'step.json')).model, readJson(p.dir(E1.id, 'plan-1', 'step.json')).effort], ['sonnet', 'high'], 'the running step keeps what it started with');
  const build = p.calls().find((c) => c.key === `${E1.id}/build-1`);
  assert.equal(build.argv[build.argv.indexOf('--model') + 1], 'opus');
  assert.equal(build.argv[build.argv.indexOf('--effort') + 1], 'medium', 'effort follows the new model when none is set');
  assert.deepEqual([readJson(p.dir(E1.id, 'build-1', 'step.json')).model, readJson(p.dir(E1.id, 'build-1', 'step.json')).effort], ['opus', 'medium']);
  const log = fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8');
  assert.equal((log.match(/settings changed: /g) ?? []).length, 1, 'logged once');
  assert.match(log, /settings changed: build model now opus \(was sonnet\); build effort now medium \(was high\)\n/);
  assert.match(log, new RegExp(`${E1.id}: build-1 starting \\(builder, opus, effort medium, `));
  const starts = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.type === 'step-start');
  assert.deepEqual(starts.map((e) => [e.step, e.model, e.effort]), [['plan-1', 'sonnet', 'high'], ['build-1', 'opus', 'medium'], ['audit-1', 'opus', 'medium'], ['verify-1', 'opus', 'medium']]);
  // The run's own keys stay as they were at launch: a run never switches mode or a money answer mid-way.
  const state = readJson(path.join(p.runDir(), 'state.json'));
  assert.deepEqual([state.mode, state.realSpend], ['full', null]);
  assert.doesNotMatch(log, /provisional/);
  assert.equal(p.epic(E1.id).state, 'MERGED');
});

test('events: a happy run writes one line per milestone, in order, and each reads as a plain sentence', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  await go(p);
  const events = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(events.map((e) => (e.type.startsWith('step-') ? `${e.type} ${e.step}` : e.type === 'check' ? `check ${e.name}` : e.type)), [
    'run-start', 'epic-start', 'step-start plan-1', 'step-end plan-1', 'step-start build-1', 'step-end build-1', 'check build',
    'step-start audit-1', 'step-end audit-1', 'audit', 'step-start verify-1', 'step-end verify-1', 'check verify', 'merged', 'run-end',
  ]);
  for (const e of events) assert.ok(!Number.isNaN(Date.parse(e.t)), 'every event is timed');
  const label = `${E1.id} (${E1.slug}) — CSV import`;
  assert.deepEqual(events.filter((e) => e.epic).map((e) => [e.epic, e.label]).at(0), [E1.id, label]);
  assert.deepEqual([events.at(-1).why, events.at(-1).spentUsd], ['queue done', 2.01]);
  const lines = events.map(eventLine).map(quick);
  assert.deepEqual(lines.filter((l) => !/finished in/.test(l)), [
    'Autopilot started: 1 epic queued.', `Starting ${E1.id} — CSV import`, `Planning ${E1.id} — CSV import`, `Building ${E1.id} — CSV import`,
    "Autopilot's checks on the build passed", `Reviewing ${E1.id} — CSV import`, 'The independent reviewer found nothing', `Verifying ${E1.id} — CSV import`,
    'Final checks after the merge passed', `Finished and merged: ${E1.id} — CSV import (under a minute, $2.01)`, 'RUN ENDED: everything queued was worked through. Spent $2.01.',
  ]);
  assert.match(lines[3], /^Plan finished in under a minute \(\$0\.40\)\. Next: the build$/);

  // The wording, for what a happy run never says. No phase names and no file paths reach the owner.
  const ev = (o) => eventLine({ label, epic: E1.id, ...o });
  assert.equal(ev({ type: 'step-end', kind: 'build', outcome: 'ok', minutes: 12.4, costUsd: 4.23 }), "Build finished in 12 min ($4.23). Next: autopilot's own checks, then an independent review");
  assert.equal(ev({ type: 'step-end', kind: 'build', outcome: 'budget', why: 'wall clock', minutes: 90, costUsd: 9 }), 'Build stopped at its time limit after 90 min ($9.00)');
  assert.equal(ev({ type: 'step-end', kind: 'verify', outcome: 'infra', why: 'exit 1, no result line', minutes: 2 }), 'Verification stopped on a technical error after 2 min');
  assert.equal(ev({ type: 'epic-start', resumedAt: 'CHECK_BUILD' }), `Continuing ${E1.id} — CSV import from where it stopped`);
  assert.equal(ev({ type: 'check', name: 'build', pass: false, failed: ['tests-green', 'clean-tree'] }), "Autopilot's checks on the build found a problem: the tests do not pass; files were left uncommitted");
  assert.equal(ev({ type: 'parked', kind: 'human-check', gate: 'gates/x-1.json', question: 'UI epic. Does what was built look right?', reason: 'human check needed before verify' }), `Waiting for you: ${E1.id} — CSV import — UI epic. Does what was built look right?`);
  assert.equal(ev({ type: 'parked', kind: 'resume', gate: 'gates/x-1.json', question: 'x stopped: budget: build-1 hit wall clock. Continue it in the next run?', reason: 'budget: build-1 hit wall clock' }), `Stopped: ${E1.id} — CSV import — a step reached its time limit`);
  assert.equal(ev({ type: 'failed', reason: 'verify-2 FAIL after the fix round: no' }), `Did not pass: ${E1.id} — CSV import — it did not pass its independent check, even after the one repair`);
  assert.equal(eventLine({ type: 'run-end', why: 'Lg1Csv7 parked (onPark: stop)', spentUsd: 4.2 }), 'RUN ENDED: an epic stopped. Spent $4.20.');
  for (const o of [{ type: 'parked', reason: 'CHECK_BUILD: the build left uncommitted work (failed: clean-tree)' }, { type: 'parked', reason: 'run stopped (end time) before VERIFY' }, { type: 'blocked', reason: 'dependency not merged: Lg1Csv7 (PARKED)' }]) assert.ok(!/[A-Z]{2,}_[A-Z]+|VERIFY|\.json|\//.test(ev(o)), ev(o));
  assert.equal(eventLine({ type: 'something-new' }), null);
  // A step taken up again is not a second go at it, and a step that stopped to ask did not finish.
  assert.equal(ev({ type: 'step-start', kind: 'verify', continuing: true }), `Picking ${E1.id} — CSV import back up where it stopped (verifying); nothing is started over`);
  assert.equal(ev({ type: 'step-end', kind: 'build', outcome: 'ok', asked: true, minutes: 1.5, costUsd: 1.17 }), 'Build stopped to ask you something after 2 min ($1.17)');
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
  assert.ok(fix.argv.includes(path.join(dir, 'fix-1', 'system-append.md')) && fs.readFileSync(path.join(dir, 'fix-1', 'system-append.md'), 'utf8').includes(rules.trimEnd()));
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
  assert.deepEqual([e.fixRounds, e.verifyFixRounds], [0, 1], 'the final check has a fix round of its own');
  assert.match(fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8'), /This is the one fix round after the final check\./);
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'verify-1', 'fix-1', 'audit-2', 'verify-2'].map((s) => `${E1.id}/${s}`));
  assert.match(fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8'), /TOR-01-Hd3Yc8L: the description is trimmed/);
  assert.ok(git(p.clone, 'ls-tree', '-r', '--name-only', 'develop').includes('src/fix.js'));
});

test('"Not proven for real": the build, repair and verify sessions are told the heading, in a full run and in a provisional one', async (t) => {
  for (const mode of ['full', 'provisional']) {
    const p = makeProject(t, { config: { mode } });
    p.scenario({
      ...happy(E1),
      [`${E1.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL\nTOR-01-Hd3Yc8L: the description is trimmed' } },
      [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = true;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): keep the description verbatim` }] },
    });
    await go(p);
    assert.equal(p.epic(E1.id).state, 'MERGED', mode);
    const appended = (step) => fs.readFileSync(p.dir(E1.id, step, 'system-append.md'), 'utf8').replace(/\s+/g, ' ');
    for (const step of ['build-1', 'fix-1']) {
      assert.match(appended(step), /a requirement you marked CANNOT VERIFY, a stand-in for a service, a check you left for the final check\) is also listed, one line each, under the heading "Not proven for real" in your handoff and in your final message, with what it was checked against instead/, `${mode} ${step}`);
      assert.match(appended(step), /Keep "CANNOT VERIFY" wherever the skill asks for it/, `${mode} ${step}`);
    }
    for (const step of ['verify-1', 'verify-2']) assert.match(appended(step), /The build's handoff may list things under the heading "Not proven for real"\. Each one you do not prove for real yourself goes, one line each, under the same heading in your final report/, `${mode} ${step}`);
  }
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
  const extra = [{ do: 'write', path: 'src/extra.js', content: '// straight onto develop\n' }, { do: 'commit', message: 'chore: extra commit on develop', unchecked: 'the referee refuses a commit on develop; this tests the merge check behind it' }];
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
  // It says which test fails, in the runner's own words (#42, for beta).
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /your project's own tests were already failing on `develop` before autopilot started \(`✖ red`\)\. Autopilot cannot repair this itself yet; it needs someone who maintains the code\./);
  const st = JSON.parse(spawnSync(process.execPath, [DRIVER, 'status', '--project', p.project, '--json'], { encoding: 'utf8' }).stdout);
  assert.match(st.why, /the last run stopped because these tests failed on develop: ✖ red$/);
});

test('failingTests: the failing tests in the runner\'s own words, never its summary lines', () => {
  const node = '✔ green (1ms)\n✖ red (0.5ms)\nℹ fail 1\n✖ failing tests:\n\n✖ red (0.5ms)';
  assert.deepEqual(failingTests(node), ['✖ red']);
  assert.deepEqual(failingTests('FAILED tests/test_x.py::test_sum - AssertionError\nFAILED (failures=1)'), ['FAILED tests/test_x.py::test_sum - AssertionError']);
  assert.deepEqual(failingTests('--- FAIL: TestSum (0.00s)\nFAIL\nFAIL\tgithub.com/a/b\t0.012s'), ['--- FAIL: TestSum']);
  assert.deepEqual(failingTests('FAIL src/x.test.js\n  ✕ adds (3 ms)\n✕ 2 tests failed\n✖ 1 of 3 tests failed'), ['FAIL src/x.test.js', '✕ adds']);
  assert.deepEqual(failingTests('not ok 1 - sums\nnot ok 2 - later # TODO\nnot ok 3 - skipped # SKIP no db'), ['not ok 1 - sums']);
  // Bun and Playwright (seen live on Pilot Light: a flaky e2e gate whose first failure was lost).
  assert.deepEqual(failingTests('(pass) ok [1.00ms]\n(fail) drawer > jumps [12.50ms]'), ['(fail) drawer > jumps']);
  assert.deepEqual(failingTests('  1 failed\n  1) [chromium] › tests/e2e/progress.spec.ts:48:3 › TOR-01-Ygv51rD progress\n  2 passed (9.0m)'), ['[chromium] › tests/e2e/progress.spec.ts:48:3 › TOR-01-Ygv51rD progress']);
  assert.deepEqual(failingTests(''), []);
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

test('STOP while the plan is still being made, nothing built: no question, the epic goes back to the queue and is planned next time, in a full run and a provisional one (Step 10)', async (t) => {
  for (const mode of ['full', 'provisional']) {
    const p = makeProject(t, { config: { mode } });
    p.scenario({ [`${E1.id}/plan`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'hang' }] } });
    const running = go(p);
    await waitFor(() => p.epic(E1.id)?.step?.name === 'plan-1' && p.epic(E1.id).step.pid);
    await waitFor(() => git(p.clone, 'branch', '--show-current') === E1.branch);
    fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
    const state = await running;
    assert.deepEqual([state.status, state.stoppedBecause, p.epic(E1.id).state], ['STOPPED', 'STOP file', 'QUEUED'], mode);
    assert.ok(!fs.existsSync(path.join(p.state, 'gates')) || fs.readdirSync(path.join(p.state, 'gates')).length === 0, `${mode}: no question`);
    assert.equal(git(p.clone, 'branch', '--list', E1.branch), '', `${mode}: the empty branch is gone`);
    assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), new RegExp(`${E1.id}: stopped by you during plan-1, before anything was built; no question is left, and it starts from the plan next time`));
    // The next run plans it from the start.
    p.scenario(happy(E1));
    const before = p.calls().length;
    await go(p);
    assert.deepEqual(p.steps().slice(before), ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((x) => `${E1.id}/${x}`), mode);
    assert.equal(p.epic(E1.id).state, 'MERGED', mode);
  }
  // Planned again on the owner's decided answer: that answer belongs to its question, which stays.
  const r = makeProject(t);
  r.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['mark'] }) });
  await go(r);
  assert.equal(readJson(path.join(r.state, 'gates', `${E1.id}-1.json`)).kind, 'plan-lint');
  assert.equal(spawnSync(process.execPath, [DRIVER, 'decide', '--workspace', r.state, '--gate', `gates/${E1.id}-1.json`, '--answer', 'Re-plan', '--by', 'Pat Owner'], { encoding: 'utf8' }).status, 0);
  r.scenario({ [`${E1.id}/plan`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'hang' }] } });
  const again = go(r);
  await waitFor(() => r.epic(E1.id)?.step?.name === 'plan-1' && r.epic(E1.id).step.pid);
  fs.writeFileSync(path.join(r.state, 'STOP'), 'stop\n');
  await again;
  assert.equal(r.epic(E1.id).state, 'PARKED', r.epic(E1.id).reason);
  assert.deepEqual([readJson(path.join(r.state, 'gates', `${E1.id}-2.json`)).kind, readJson(path.join(r.state, 'gates', `${E1.id}-2.json`)).phase], ['resume', 'PLAN']);
  // A plan session that committed on its branch has left work: the question stays.
  const q = makeProject(t);
  const earlier = 'stands for work an earlier session left on the branch; a planner may not write';
  q.scenario({ [`${E1.id}/plan`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'notes.md', content: 'x\n', unchecked: earlier }, { do: 'commit', message: 'wip', unchecked: earlier }, { do: 'hang' }] } });
  const running = go(q);
  await waitFor(() => q.epic(E1.id)?.step?.name === 'plan-1' && git(q.clone, 'log', '-1', '--format=%s') === 'wip');
  fs.writeFileSync(path.join(q.state, 'STOP'), 'stop\n');
  await running;
  assert.equal(q.epic(E1.id).state, 'PARKED');
  assert.deepEqual([readJson(path.join(q.state, 'gates', `${E1.id}-1.json`)).kind, readJson(path.join(q.state, 'gates', `${E1.id}-1.json`)).phase], ['resume', 'PLAN']);
});

/**
 * A build that streams assistant messages on `model`, then hangs until STOP. As in a real stream, an assistant line
 * carries a message's usage as it starts (output near zero); the CLI's transcript has msg_1's finished count, msg_2's
 * not at all, and a message of an earlier session (a resumed transcript holds it) that is not this session's.
 */
async function stoppedBuildWithUsage(t, model) {
  const p = makeProject(t);
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-config-'));
  const was = process.env.CLAUDE_CONFIG_DIR; process.env.CLAUDE_CONFIG_DIR = config;
  t.after(() => { if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = was; fs.rmSync(config, { recursive: true, force: true }); });
  const line = (id, usage) => ({ type: 'assistant', parent_tool_use_id: null, message: { id, model, role: 'assistant', usage } });
  const m1 = { input_tokens: 3, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 40000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 40000 } };
  const m1Final = { ...m1, output_tokens: 900 };
  const m2 = { input_tokens: 2, output_tokens: 5, cache_read_input_tokens: 40000, cache_creation_input_tokens: 1000, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 0 } };
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [
    { do: 'branch', name: E1.branch },
    { do: 'transcript', line: line('msg_old', { input_tokens: 1e6, output_tokens: 1e6 }) },
    { do: 'emit', line: line('msg_1', m1) }, { do: 'emit', line: line('msg_1', m1) }, { do: 'emit', line: line('msg_2', m2) },
    { do: 'transcript', line: line('msg_1', m1Final) },
    { do: 'write', path: 'src/half.js', content: '// half done\n' }, { do: 'hang' },
  ] } });
  const running = go(p);
  await waitFor(() => fs.existsSync(path.join(p.clone, 'src', 'half.js')));
  await waitFor(() => (fs.readFileSync(p.dir(E1.id, 'build-1', 'stream.jsonl'), 'utf8').match(/"type":"assistant"/g) ?? []).length === 3);
  fs.writeFileSync(path.join(p.state, 'STOP'), 'stop\n');
  const state = await running;
  return { p, state, usage: { msg_1: { model, usage: m1Final }, msg_2: { model, usage: m2 } } };
}

test('a session STOP kills before its result line is booked at the cost estimated from its messages', async (t) => {
  const { p, state, usage } = await stoppedBuildWithUsage(t, 'claude-sonnet-5-5');
  // Sonnet 5.5: $2 in, $10 out, $0.10 cache read per MTok; a 1-hour write 2× input, a 5-minute write 1.25×.
  const want = +(((3 * 2 + 900 * 10 + 40000 * 2 * 2) + (2 * 2 + 5 * 10 + 40000 * 0.1 + 1000 * 2 * 1.25)) / 1e6).toFixed(6);
  assert.equal(estimateCost(usage).usd, want);
  const e = p.epic(E1.id);
  const build = e.sessions.find((x) => x.name === 'build-1');
  assert.equal(build.outcome, 'stopped');
  assert.equal(build.costEstimated, true);
  assert.equal(build.costUsd, want);
  assert.equal(build.unpriced, undefined);
  const plan = e.sessions.find((x) => x.name === 'plan-1');
  assert.equal(plan.costEstimated, undefined); // a session with a result line is booked as before
  assert.equal(e.costUsd, +(plan.costUsd + build.costUsd).toFixed(4));
  assert.equal(state.spentUsd, e.costUsd);
  assert.equal(readJson(p.dir(E1.id, 'build-1', 'cost-estimate.json')).total_cost_usd, want); // what a resume of it subtracts
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /build-1 ended — stopped \(STOP file\), \$0\.\d+ \(estimated from 2 messages, 1 of them without their final output count: the session was stopped before it reported its cost\)/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /including \$0\.\d\d estimated for 1 session stopped before it reported its cost/);
});

test('a stopped session on a model with no known price: tokens recorded, no dollars, the model named', async (t) => {
  const { p, state } = await stoppedBuildWithUsage(t, 'claude-mystery-9');
  const e = p.epic(E1.id);
  const build = e.sessions.find((x) => x.name === 'build-1');
  assert.equal(build.costEstimated, true);
  assert.equal(build.costUsd, 0);
  assert.ok(build.tokens > 80000);
  assert.deepEqual(build.unpriced, ['claude-mystery-9']);
  assert.equal(state.spentUsd, e.sessions.find((x) => x.name === 'plan-1').costUsd);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /claude-mystery-9 could not be priced/);
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
  // macOS and Linux: the session is in its own process group and outlives the driver; resume kills it. Windows: Node
  // keeps a child that is not detached in a job that ends with the driver, so the session goes with it.
  const WIN = process.platform === 'win32';
  if (!WIN) assert.equal(alive(sessionPid), true, 'the session outlives the driver (own process group)');
  else await waitFor(() => !alive(sessionPid), { timeoutMs: 5000 });
  assert.equal(p.epic(E1.id).state, 'VERIFY');

  await assert.rejects(go(p), /did not finish .*pass --resume/);
  const state = await go(p, { resume: true });

  assert.equal(alive(sessionPid), false);
  assert.equal(state.status, 'DONE');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.steps().slice(3), [`${E1.id}/verify-1`, `${E1.id}/verify-2`]);
  assert.ok(!git(p.clone, 'ls-tree', '-r', '--name-only', 'develop').includes('half-written.md'));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), WIN ? /stale lock taken over[\s\S]*re-entering at VERIFY/ : /stale lock taken over[\s\S]*killed leftover session verify-1[\s\S]*re-entering at VERIFY/);
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
  // Quoted and joined as the driver prints it on this system (on Windows: backslashes, so every path is quoted).
  const q = (s) => (/^[A-Za-z0-9_\-.,/:=@%+]+$/.test(s) ? s : `'${s}'`);
  assert.ok(r.stdout.includes(`$ ${q(FAKE)} -p --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio --include-hook-events --plugin-dir ${q(PLUGIN_DIR)} --settings '${path.join(p.state, 'runs', '<run>', 'epics', 'Lg1Csv7', 'plan-1', 'settings.json')}' --permission-mode acceptEdits`));
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

test('sandbox: off by default; when a project turns it on, every session but the auditor gets local sockets, the package registries and the project\'s own hosts; nothing else opens', () => {
  // Off by default: the session runs commands as a terminal does. The deny list and the referee hooks stay.
  // The auditor too (issue #41 B1): a machine with no sandbox must still be able to audit. Its tools and the web deny stay.
  for (const kind of ['plan', 'build', 'fix', 'verify', 'probe', 'audit']) assert.deepEqual(sessionSettings({}, { kind }).sandbox, { enabled: false }, kind);
  for (const tool of ['WebFetch', 'WebSearch']) assert.ok(sessionSettings({}, { kind: 'audit' }).permissions.deny.includes(tool), tool);
  assert.ok(sessionSettings({}, { kind: 'build' }).hooks.PreToolUse && sessionSettings({}, { kind: 'build' }).permissions.deny.includes('Bash(git push *)'));
  // On: what follows.
  const base = sessionSettings({ sandbox: true }, { kind: 'build' }).sandbox;
  assert.deepEqual([base.enabled, base.allowUnsandboxedCommands, base.failIfUnavailable], [true, false, true]);
  assert.deepEqual(base.network, { allowedDomains: REGISTRIES, strictAllowlist: true, allowAllUnixSockets: true, allowLocalBinding: true });
  for (const host of ['api.nuget.org', 'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'crates.io', 'static.crates.io']) assert.ok(REGISTRIES.includes(host), host);
  assert.equal(networkProblems(REGISTRIES).length, 0);
  const cfg = { sandbox: true, network: ['pkgs.example.org', ' Registry.NPMJS.org ', 'pkgs.example.org'] };
  for (const kind of ['plan', 'build', 'fix', 'verify', 'probe']) assert.deepEqual(sessionSettings(cfg, { kind }).sandbox.network.allowedDomains, [...REGISTRIES, 'pkgs.example.org'], kind);
  // The auditor only reads a bundle: no hosts, no sockets.
  assert.deepEqual(sessionSettings(cfg, { kind: 'audit' }).sandbox.network, { allowedDomains: [], strictAllowlist: true });
  const open = sessionSettings(cfg, { kind: 'build' });
  for (const tool of ['WebFetch', 'WebSearch']) assert.ok(open.permissions.deny.includes(tool), tool);

  assert.deepEqual(networkProblems(['api.nuget.org', 'files.pythonhosted.org', 'static.crates.io', '*.pkg.example.org', '*.example.org']), []);
  for (const bad of ['https://api.nuget.org', 'api.nuget.org/v3', 'api.nuget.org:443', '*', '*.org', 'a.*.example.org', 'pkg*.example.org', '10.0.0.1', 'localhost', 'user@host.org', 'two words.org', '']) assert.equal(networkProblems([bad]).length, 1, bad);
  assert.deepEqual(networkProblems('api.nuget.org'), ['`network` must be a list of host names']);
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
  const tools = (step) => fs.readFileSync(path.join(dir, step, 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).out).filter(Boolean); // a call the referee had no opinion on has no output
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
  assert.deepEqual(fs.readFileSync(path.join(dir, 'verify-1', 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).decision).filter((d) => d !== 'pass'), ['answer', 'answer', 'answer', 'deny']);
});

test('the fake puts scripted work to the referee as the real CLI does: a refused action is skipped and listed, an allowed one is applied, `unchecked` needs its reason', async (t) => {
  const p = makeProject(t);
  const outside = path.join(os.homedir(), `autopilot-fake-${process.pid}-should-not-exist.txt`);
  t.after(() => fs.rmSync(outside, { force: true }));
  const s = happy(E1);
  s[`${E1.id}/build`].actions.splice(1, 0,
    { do: 'write', path: '{{state}}/settings.json', content: '{}', refused: true }, // the workspace
    { do: 'exec', cmd: `echo x > ${outside}`, refused: true }, // outside the clone
    { do: 'write', path: 'test/smoke.test.js', content: '// gutted\n', refused: true }, // an existing test, no reason
    { do: 'write', path: 'src/allowed.js', content: '// allowed\n' },
    { do: 'write', path: '{{step}}/by-the-test.txt', content: 'x', unchecked: 'written by this test, not by a tool call' });
  p.scenario(s);
  const settingsBefore = fs.readFileSync(path.join(p.state, 'settings.json'), 'utf8');
  await go(p);
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  const result = readJson(p.dir(E1.id, 'build-1', 'result.json'));
  assert.deepEqual(result.permission_denials.map((d) => [d.tool_name, d.tool_input.file_path ?? d.tool_input.command]), [
    ['Write', path.join(p.state, 'settings.json')], ['Bash', `echo x > ${outside}`], ['Write', path.join(p.clone, 'test', 'smoke.test.js')]]);
  assert.equal(fs.readFileSync(path.join(p.state, 'settings.json'), 'utf8'), settingsBefore);
  assert.equal(fs.existsSync(outside), false);
  assert.doesNotMatch(git(p.clone, 'show', 'develop:test/smoke.test.js'), /gutted/);
  assert.equal(git(p.clone, 'show', 'develop:src/allowed.js'), '// allowed');
  assert.equal(fs.readFileSync(p.dir(E1.id, 'build-1', 'by-the-test.txt'), 'utf8'), 'x');
  // The referee logged every call the script made, as it does for a real session.
  const logged = fs.readFileSync(p.dir(E1.id, 'build-1', 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(logged.filter((h) => h.decision === 'deny').map((h) => h.rule), ['R2', 'R2', 'R7']);
  assert.ok(logged.some((h) => h.tool_name === 'Bash' && /^git add -A && git commit -m /.test(h.tool_input.command) && h.decision === 'pass'));

  // `unchecked` without a reason is a broken script, not a silent bypass.
  const q = makeProject(t);
  q.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: [{ do: 'write', path: 'src/x.js', content: 'x', unchecked: true }] } });
  await go(q);
  assert.match(fs.readFileSync(q.dir(E1.id, 'build-1', 'stderr.log'), 'utf8'), /`unchecked` on a write action must be the reason/);

  // A refusal the script did not expect, or an expected one that did not come, ends the fake with the reason.
  for (const [action, re] of [[{ do: 'write', path: '{{state}}/STOP', content: '' }, /the referee refused a write action the script does not mark `refused: true`.*autopilot R2/s], [{ do: 'write', path: 'src/x.js', content: 'x', refused: true }, /the referee allowed a write action the script marks `refused`/]]) {
    const r = makeProject(t);
    r.scenario({ ...happy(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, action] } });
    await go(r);
    assert.match(fs.readFileSync(r.dir(E1.id, 'build-1', 'stderr.log'), 'utf8'), re);
    assert.notEqual(r.epic(E1.id).state, 'MERGED');
  }
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

test('every working session gets a scratch folder: made before launch, named in its environment and its rules, writable in the sandbox; the auditor gets none', async (t) => {
  const p = makeProject(t);
  const s = happy(E1);
  s[`${E1.id}/build`].actions.unshift({ do: 'write', path: '{{step}}/scratch/probe.json', content: '{}' }, { do: 'exec', cmd: 'echo x > "$AUTOPILOT_SCRATCH/out.txt"' });
  p.scenario(s);
  await p.go();
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  for (const step of ['plan-1', 'build-1', 'verify-1']) {
    const call = p.calls().find((c) => c.step === step);
    const scratch = p.dir(E1.id, step, 'scratch');
    assert.equal(call.env.AUTOPILOT_SCRATCH, scratch, step);
    assert.ok(fs.statSync(scratch).isDirectory(), step);
    const rules = fs.readFileSync(call.argv[call.argv.indexOf('--append-system-prompt-file') + 1], 'utf8');
    assert.ok(rules.includes(scratch) && rules.includes('$AUTOPILOT_SCRATCH'), `${step}: ${rules}`);
  }
  assert.deepEqual(fs.readdirSync(p.dir(E1.id, 'build-1', 'scratch')).sort(), ['out.txt', 'probe.json']);
  assert.deepEqual(readJson(p.dir(E1.id, 'build-1', 'result.json')).permission_denials, []);
  const audit = p.calls().find((c) => c.step === 'audit-1');
  assert.equal(audit.env.AUTOPILOT_SCRATCH, undefined);
  assert.equal(fs.existsSync(p.dir(E1.id, 'audit-1', 'scratch')), false);
  // With the sandbox on, the scratch folder is the one place outside the clone a command may write.
  assert.deepEqual(sessionSettings({ sandbox: true }, { kind: 'build', scratch: '/ws/step/scratch' }).sandbox.filesystem, { allowWrite: ['/ws/step/scratch'] });
  assert.equal(sessionSettings({ sandbox: true }, { kind: 'audit' }).sandbox.filesystem, undefined);
});

test('the owner is away: no session starts a step that waits for a person, and a step nobody came for is not tried again in that epic', async (t) => {
  const p = makeProject(t);
  // The build asks the owner to come and gives up; the verify session of the same epic is told.
  const hook = (hook, id, extra = {}) => ({ do: 'write', path: '{{step}}/hooks.jsonl', append: true, unchecked: 'stands for a line the hooks themselves log', content: `${JSON.stringify({ t: new Date().toISOString(), hook, tool_name: 'Bash', tool_use_id: id, tool_input: { command: 'python build.py mcp tools --oauth', description: 'Needs you: sign in to Okta in the browser window that opens' }, ...extra })}\n` });
  const scripts = happy(E1);
  scripts[`${E1.id}/build`].actions.unshift(hook('PreToolUse', 'n1', { decision: 'pass' }), hook('PostToolUseFailure', 'n1', { error: 'OAuth callback timed out after 300.0 seconds' }));
  p.scenario(scripts);
  const name = '20261113-130000';
  fs.mkdirSync(path.join(p.state, 'runs', name), { recursive: true });
  fs.writeFileSync(path.join(p.state, 'runs', name, 'config.json'), JSON.stringify({ project: p.project, queue: [E1.id], allowTestDouble: true, attended: false }));
  const state = await p.go({ run: name });
  assert.equal(state.attended, false);
  const build = fs.readFileSync(p.dir(E1.id, 'build-1', 'build-rules.md'), 'utf8'); const verify = fs.readFileSync(p.dir(E1.id, 'verify-1', 'verify-rules.md'), 'utf8');
  for (const text of [build, verify]) assert.match(text, /# The owner is away\n\nThe project's owner has said they will not be at the computer during this run\. Do not start a\ncommand that waits for a person/);
  assert.doesNotMatch(build, /Already tried in this epic/);
  assert.match(verify, /Already tried in this epic, and nobody came:\n\n- sign in to Okta in the browser window that opens \(`python build\.py mcp tools --oauth`\)\n\nDo not start that again\. List it in your final report under the heading "Not proven for real"/);
  assert.deepEqual(p.epic(E1.id).unanswered.map((u) => [u.step, u.description]), [['build-1', 'sign in to Okta in the browser window that opens']]);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /build-1 waited for the owner 1 time\(s\) and nobody came: sign in to Okta/);
  // Said or not, a step nobody came for is not tried twice; an owner who is there gets no "away" rule.
  assert.equal(presenceRule(true), ''); assert.equal(presenceRule(null), '');
  assert.match(presenceRule(true, [{ description: 'plug in the device', command: 'flash.sh' }]), /^\n# Steps that wait for the owner\n\nAlready tried in this epic, and nobody came:\n\n- plug in the device \(`flash\.sh`\)/);
});

test('real money: the owner\'s answer at launch reaches every build, repair and verify session; undecided, a session is told to ask', async (t) => {
  for (const [realSpend, want, never] of [[true, /has approved spending real money on calls to outside services/, /Never skip\s+it silently/], [false, /has said not to spend real money/, /Make that call/], [undefined, /is the project's owner's decision, not\s+yours\. If a test or a check needs such a call to prove a requirement, ask with `AskUserQuestion`/, /Make that call/]]) {
    const p = makeProject(t);
    p.scenario(happy(E1));
    const name = '20261113-120000';
    fs.mkdirSync(path.join(p.state, 'runs', name), { recursive: true });
    fs.writeFileSync(path.join(p.state, 'runs', name, 'config.json'), JSON.stringify({ project: p.project, queue: [E1.id], allowTestDouble: true, ...(realSpend === undefined ? {} : { realSpend }) }));
    const state = await p.go({ run: name });
    assert.equal(state.realSpend, realSpend ?? null);
    for (const file of [p.dir(E1.id, 'build-1', 'build-rules.md'), p.dir(E1.id, 'verify-1', 'verify-rules.md')]) {
      const text = fs.readFileSync(file, 'utf8');
      assert.match(text, /# Calls that cost real money/);
      assert.match(text, want, file); assert.doesNotMatch(text, never, file);
      // Only the final check asks a person to come; a build leaves that to it.
      if (/verify-rules/.test(file)) assert.match(text, /start its Bash `description` with `Needs you:`/);
      else { assert.match(text, /Do not start a command that waits for the project's owner/); assert.doesNotMatch(text, /Needs you:/); assert.match(text, /Before you change, move or delete a test file that already exists on the integration line,\s+append one line to `\.autopilot\/test-changes\.jsonl`/); }
      assert.doesNotMatch(text, /# The owner is away/, 'not said unless the owner said so');
    }
    const [, build, , verify] = p.calls();
    for (const [call, step, file] of [[build, 'build-1', 'build-rules.md'], [verify, 'verify-1', 'verify-rules.md']]) assert.ok(call.argv.includes(p.dir(E1.id, step, 'system-append.md')) && fs.readFileSync(p.dir(E1.id, step, 'system-append.md'), 'utf8').includes(fs.readFileSync(p.dir(E1.id, step, file), 'utf8').trimEnd()), step);
    assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), realSpend === true ? /Real money on outside services: you allowed it when a check needs it\./ : realSpend === false ? /Real money on outside services: you said not to spend any/ : /Real money on outside services: not decided at launch/);
    assert.equal(readJson(path.join(p.runDir(), 'config.json')).realSpend ?? null, realSpend ?? null);
  }
  assert.match(spendRule(true), /"Not proven for real"/);
  assert.match(spendRule(false), /"Not proven for real"/);
});

test('not proven for real: a reviewer finding that never parks and the verifier\'s own "not run" lines reach the owner at the merge, in status and in the report', async (t) => {
  const p = makeProject(t);
  const findings = [
    { category: 'never-ran-real', severity: 'medium', evidence: 'src/cost.js:10', explanation: 'The cost path is tested only against a fake written from the same guess; no real request was sent.' },
    { category: 'claim-without-evidence', severity: 'low', evidence: 'handoff', explanation: 'The handoff counts 113 tests; the last run shows 112.' },
  ];
  const verdict = '## Verdict: PASS\n\n- **Live gateway:** signed in, tools listed.\n- **Not run:** a real synthesis, to avoid spending the shared credit.\n\n**Not proven for real**\n- The cost lookup: checked against the fake only\n- None of the rest\n\n**What changed**\n- docs only\n';
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { result: { structured_output: { findings, recommend: 'proceed', summary: 'canned' } } }, [`${E1.id}/verify`]: { ...wrapupScript(E1), result: { total_cost_usd: 1.3, result: verdict } } });
  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', 'nothing here parks: a medium finding and a note in a PASS report');
  assert.deepEqual(e.unproven.map((u) => [u.source, u.text]), [
    ['reviewer', findings[0].explanation],
    ['verifier', 'a real synthesis, to avoid spending the shared credit.'],
    ['verifier', 'The cost lookup: checked against the fake only'],
  ]);
  const events = fs.readFileSync(path.join(p.runDir(), 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const merged = events.find((x) => x.type === 'merged');
  assert.equal(merged.unproven, 3);
  assert.equal(eventLine(merged), `Finished and merged: ${E1.id} — CSV import (under a minute, $2.01) — 3 things not proven for real`);
  const status = JSON.parse(spawnSync(process.execPath, [DRIVER, 'status', '--project', p.project, '--json', '--queue', E1.id], { encoding: 'utf8' }).stdout);
  assert.deepEqual(status.unproven.map((u) => [u.epic, u.source, u.text]), e.unproven.map((u) => [E1.id, u.source, u.text]));
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Not proven for real \(said by the reviewer or the verifier; nothing here stopped the epic\):\n- Reviewer F1: The cost path is tested only against a fake .*\n- Verifier: a real synthesis, to avoid spending the shared credit\.\n- Verifier: The cost lookup: checked against the fake only\n/);
  // The project remembers it too, without autopilot's files: the epic's status file on the integration line holds each
  // note, under the requirement it names or under the epic, and the project's own status reads it from there.
  const side = git(p.clone, 'show', `develop:docs/implementation-plan/status/epic-${E1.id}.md`);
  assert.match(side, new RegExp(`^unconfirmed-epic: \\d{4}-\\d{2}-\\d{2} the reviewer: The cost path is tested only against a fake .* \\| \\d{4}-\\d{2}-\\d{2} the final check: a real synthesis, .* \\| \\d{4}-\\d{2}-\\d{2} the final check: The cost lookup: checked against the fake only$`, 'm'));
  assert.match(git(p.clone, 'log', '-1', '--format=%s', 'develop'), new RegExp(`^docs\\(epic-${E1.id}\\): note what a person should still confirm$`));
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  assert.match(side, /^status: Complete$/m);
  // The wording the parser accepts, and what it leaves alone.
  assert.deepEqual(unprovenLines('All good.\n- Not run - the soak test\n### Not proven for real\n1. Windows paths\n\n## Next\n- Not this\n'), ['the soak test', 'Windows paths']);
  assert.deepEqual(unprovenLines('Verdict: PASS. Everything ran.'), []);
});

test('unprovenLines keeps a point\'s sub-points with it, and noteSubject files a note under the requirement it is about (Pilot Light GIbz5Hu, 2026-11-23)', () => {
  // The final check's own words: one point about a requirement, everything else nested under it. Seen live: each line was
  // written into the status file as a note of its own ("What it was checked against instead:" alone).
  const live = ['## Not proven for real',
    '- **TOR-06-SDvIvsm — the Run screen is readable on a phone.** Recorded as `unverified: NOT OBSERVED`, not as a pass.',
    '  - **What a person must still do:** follow `tests/manual/TOR-06-SDvIvsm.md` on a phone on the same network.',
    '  - **What it was checked against instead:**',
    '    - the checklist matches the requirement;',
    '    - the automated 320 px test (TOR-06-eiZECdC) passes;',
    '    - the 320 px screenshots below look readable.',
    "  - **Commands when you're back:** start the app with `HOST=0.0.0.0 bun run start -- samples/ledger`.",
    '', '## What the pictures show', '- **run.png:** the run'].join('\n');
  const lines = unprovenLines(live);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^TOR-06-SDvIvsm — the Run screen is readable on a phone\. Recorded as .* What a person must still do: follow .* What it was checked against instead: the checklist matches the requirement; the automated 320 px test \(TOR-06-eiZECdC\) passes; the 320 px screenshots below look readable\. Commands when you're back: start the app with/);
  assert.deepEqual(unprovenLines('### Not proven for real\n- First\n  - its detail\n- Second\n'), ['First its detail', 'Second']);

  // Filed by its subject: a note that opens with a requirement already listed as not observed is not filed again,
  // even when it mentions another requirement in passing; one with no subject goes under the epic.
  const anchors = ['TOR-06-SDvIvsm', 'TOR-06-eiZECdC', 'TOR-06-Rsi8KUv'];
  const listed = (t) => t === 'TOR-06-SDvIvsm';
  assert.deepEqual(noteSubject(lines[0], { anchors, listed }), { skip: true });
  assert.deepEqual(noteSubject('TOR-06-Rsi8KUv: checked against the fake clock only', { anchors, listed }), { about: 'TOR-06-Rsi8KUv' });
  assert.deepEqual(noteSubject('The cost lookup: checked against the fake only (see TOR-06-Rsi8KUv)', { anchors, listed }), { about: 'TOR-06-Rsi8KUv' }, 'no subject: the first requirement it names, as before');
  assert.deepEqual(noteSubject('Windows paths', { anchors, listed }), { about: 'epic' });
  assert.deepEqual(noteSubject('See TOR-06-SDvIvsm on a phone', { anchors, listed }), { skip: true }, 'names only listed requirements');
});

// ---- the run's own config.json (issue #41 B4) -----------------------------------------------------

test('a run config.json that cannot be read stops the launch and is left as it is', async (t) => {
  const p = makeProject(t);
  const file = path.join(p.state, 'runs', 'r1', 'config.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // As a session wrote it on Windows: single backslashes, which JSON does not allow.
  const bad = `{"project": "C:\\Users\\pat\\app", "queue": ["${E1.id}"], "autoContinue": 2}`;
  fs.writeFileSync(file, bad);
  await assert.rejects(p.go({ run: 'r1' }), /the run's config\.json cannot be read \(.*r1.config\.json\): .*forward slashes/s);
  // Naming the project on the command line does not turn an unreadable file into an empty one.
  await assert.rejects(p.go({ run: 'r1', project: p.project }), /cannot be read/);
  assert.equal(fs.readFileSync(file, 'utf8'), bad);
  assert.ok(!fs.existsSync(path.join(p.state, 'current')), 'no run was started');
});

test('a first launch names the project on the command line, runs on the confirmed queue and limits, and logs them', async (t) => {
  const p = makeProject(t);
  const settings = path.join(p.state, 'settings.json');
  const { project, ...rest } = readJson(settings); // a workspace before its first run: nothing names the project yet
  fs.writeFileSync(settings, JSON.stringify(rest));
  const file = path.join(p.state, 'runs', 'r1', 'config.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ queue: [E1.id], runBudgetUsd: 40, autoContinue: 2, endBy: null }));
  await assert.rejects(p.go({ run: 'r1' }), /no project/);
  assert.deepEqual(readJson(file), { queue: [E1.id], runBudgetUsd: 40, autoContinue: 2, endBy: null }, 'a refused launch writes nothing');

  p.scenario(happy(E1));
  await p.go({ run: 'r1', project });
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  const saved = readJson(file);
  assert.deepEqual([saved.project, saved.queue, saved.runBudgetUsd, saved.autoContinue, saved.endBy], [project, [E1.id], 40, 2, null]);
  const log = fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8');
  assert.match(log, new RegExp(`run r1: queue ${E1.id}; integration line develop`));
  assert.match(log, /run r1: limits: run budget \$40; end by no end time; technical stops continued 2 per epic; when an epic parks: continue/);
});

test('gate dates are the machine\'s local date: west of UTC near midnight, the day is still the one on the owner\'s clock (#40)', () => {
  const at = '2026-11-25T05:30:00Z'; // 21:30 the evening before in Los Angeles
  const local = (tz) => spawnSync(process.execPath, ['--input-type=module', '-e', `import { localDate } from ${JSON.stringify(new URL('../driver.mjs', import.meta.url).href)}; console.log(localDate(new Date('${at}')));`], { encoding: 'utf8', env: { ...process.env, TZ: tz } }).stdout.trim();
  assert.equal(local('America/Los_Angeles'), '2026-11-24');
  assert.equal(local('UTC'), '2026-11-25');
  assert.equal(local('Asia/Tokyo'), '2026-11-25');
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('the scratch rule shows the forms the referee allows: "$AUTOPILOT_SCRATCH/…" as it is or a variable holding a file below it, not a copy or a relative path (Pilot Light)', () => {
  const rule = scratchRule('/w/runs/r/epics/x/build-1/scratch');
  assert.match(rule.replace(/\s+/g, ' '), /In a command, use `"\$AUTOPILOT_SCRATCH\/out\.txt"` as it is \(the file tools take the folder above\)\. A variable may hold a file below it \(`out="\$AUTOPILOT_SCRATCH\/out\.txt"`\); copying the folder itself into another variable \(`S="\$AUTOPILOT_SCRATCH"`\), cutting it down, or a path relative to the current folder \(`\.\/out\.txt`\) is refused, or lands in the repository\./);
});

test('a test that ends mid-session leaves no fake claude behind: only the fakes working in its own folder are killed', async (t) => {
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-fakes-')));
  const mine = path.join(tmp, 'mine'); const other = path.join(tmp, 'other');
  fs.mkdirSync(mine); fs.mkdirSync(other);
  // Stand-ins for a fake session that hangs: a process whose command line names the fake, working in a folder.
  // The folder is named on the command line too: Windows tells a fake's folder only from there (killFakes).
  const start = (cwd) => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30)', FAKE, cwd], { cwd, stdio: 'ignore' });
  const a = start(mine); const b = start(other);
  // Killed before the folder goes: Windows will not remove a folder a running process works in, and a throwing
  // first hook would leave both running, holding this test file open for good.
  t.after(() => { for (const c of [a, b]) if (alive(c.pid)) c.kill('SIGKILL'); });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10 }));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(alive(a.pid) && alive(b.pid));
  assert.deepEqual(killFakes(mine), [a.pid]);
  await waitFor(() => !alive(a.pid));
  assert.equal(alive(b.pid), true, 'a fake in another folder is left alone');
});

test('connectors (#43): a session can load them (ToolSearch) and is told the rules; the auditor gets neither', async (t) => {
  const { sessionCommand, CONNECTOR_RULE } = await import('../driver.mjs');
  const cfg = defaultConfig(SEED);
  const ws = path.join(os.tmpdir(), 'autopilot-connector-ws');
  const step = path.join(ws, 'runs', 'r', 'epics', E1.id, 'build-1');
  const allowedOf = (args) => args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools'));
  assert.ok(allowedOf(sessionCommand(cfg, { kind: 'build', epicId: E1.id, workspace: ws, runDir: ws, stepDir: step, sessionId: 's' }).args).includes('ToolSearch'));
  const audit = sessionCommand(cfg, { kind: 'audit', epicId: E1.id, workspace: ws, runDir: ws, stepDir: step, sessionId: 's' }).args;
  assert.equal(audit[audit.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.ok(!audit.includes('ToolSearch'));
  const flat = CONNECTOR_RULE.replace(/\s+/g, ' ');
  for (const text of ['ToolSearch', 'read only', 'never send, change or delete', 'your app\'s local pages', 'sign-ins carry over', 'Do not ask the owner about it', '"Not proven for real"']) assert.ok(flat.includes(text), text);
  // Every working session gets it, and the auditor does not.
  const p = makeProject(t);
  p.scenario(happy(E1));
  await p.go();
  for (const call of p.calls()) {
    const file = call.argv[call.argv.indexOf('--append-system-prompt-file') + 1];
    const text = call.step.startsWith('audit') ? '' : fs.readFileSync(file, 'utf8');
    assert.equal(text.includes(CONNECTOR_RULE.trim()), !call.step.startsWith('audit'), call.step);
  }
});

test('connectors end to end (#43): a build reads Gmail and drives the app through a sign-in with no question and no park; a send is refused, listed as not proven, and the epic merges; the report says what was used', async (t) => {
  const p = makeProject(t);
  const s = happy(E1);
  const text = (t2) => [{ type: 'text', text: t2 }];
  s[`${E1.id}/build`].actions.unshift(
    { do: 'tool', tool_name: 'mcp__claude_ai_Gmail__search_threads', tool_input: { query: 'subject:receipt' }, tool_response: text('2 threads'), refused: false },
    { do: 'tool', tool_name: 'mcp__playwright__browser_navigate', tool_input: { url: 'http://localhost:3000' }, tool_response: text('### Page state\n- Page URL: https://accounts.google.com/o/oauth2/auth?code=secret\n'), refused: false },
    { do: 'tool', tool_name: 'mcp__playwright__browser_click', tool_input: { element: 'Continue', ref: 'e1' }, tool_response: text('- Page URL: http://localhost:3000/home'), refused: false },
    { do: 'tool', tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: { to: 'x@example.invalid' }, refused: true },
  );
  s[`${E1.id}/verify`] = { ...wrapupScript(E1), result: { result: '## Verdict: PASS\n\n**Not proven for real**\n- The receipt email: sending is refused in autopilot; checked against the template only\n' } };
  p.scenario(s);
  await p.go();

  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual(p.steps(), [`${E1.id}/plan-1`, `${E1.id}/build-1`, `${E1.id}/audit-1`, `${E1.id}/verify-1`], 'no question, no second build');
  assert.deepEqual(fs.existsSync(path.join(p.state, 'gates')) ? fs.readdirSync(path.join(p.state, 'gates')) : [], []);
  assert.deepEqual(readJson(p.dir(E1.id, 'build-1', 'result.json')).permission_denials.map((d) => d.tool_name), ['mcp__claude_ai_Gmail__send_message']);
  assert.ok(e.unproven.some((u) => /receipt email/.test(u.text)));
  const r = readJson(path.join(p.runDir(), 'report.json'));
  const use = r.epics[0].connectors;
  assert.deepEqual(use.calls, [{ tool: 'Gmail search_threads', n: 1 }, { tool: 'playwright browser_navigate', n: 1 }, { tool: 'playwright browser_click', n: 1 }]);
  assert.deepEqual(use.local, ['localhost']);
  assert.deepEqual(use.offsite, ['https://accounts.google.com/o/oauth2/auth'], 'kept without its query: it can hold a sign-in code');
  assert.deepEqual(use.denied.map((d) => d.tool), ['Gmail send_message']);
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.ok(md.includes('Connector use: Gmail search_threads ×1; browser on localhost and accounts.google.com (off-site); 1 refused'), md);
  assert.ok(!md.includes('code=secret'));
  assert.match(md, /R11: mcp__claude_ai_Gmail__send_message is denied: connectors are read-only/);
  const status = JSON.parse(spawnSync(process.execPath, [DRIVER, 'status', '--project', p.project, '--json'], { encoding: 'utf8' }).stdout);
  assert.deepEqual(status.connectors, [{ epic: E1.id, label: e.label, line: 'Gmail search_threads ×1; browser on localhost and accounts.google.com (off-site); 1 refused', offsite: ['https://accounts.google.com/o/oauth2/auth'], refused: ['Gmail send_message'] }]);
});
