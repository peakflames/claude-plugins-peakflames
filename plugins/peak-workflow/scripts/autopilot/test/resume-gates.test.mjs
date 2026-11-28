// Resume from a decided gate (autopilot-poc-plan.md §10 P3.5 Part 2), all against fake-claude:
// one test per row of the gate-kind table. Each parks an epic in one run, records the owner's
// answer through `driver.mjs decide`, and checks that the next run re-enters at the named phase on
// the branch the first run left, without running an earlier session again.
// This file: a question a session asked, an approved amendment, a thin review, audit, human-check, plan-lint. Shared helpers: resume-helpers.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ANSWERS, continueRun, gateFacts, loadConfig, ownerName, preflight, status } from '../driver.mjs';
import { technicalAnswer } from '../lib.mjs';
import { pictureLines } from '../attend.mjs';
import { AUDIT_DIR } from '../audit.mjs';
import { E1, TL, addEpic, buildActions, buildScript, git, happy, makeProject, planScript, readJson, wrapupActions, wrapupScript } from './helpers.mjs';
import { cli, gate, decide, again, ask, tools, finding, audit, roundSpent, merged, settle, DEFERRAL, addLookEpic, buildWithManual } from './resume-helpers.mjs';

// ---- a question a session asked ----------------------------------------------------------------

test('question gate (deferral, asked in build): the next run resumes the build session that asked, with the owner\'s answer, and R8 answers that question once', async (t) => {
  const p = makeProject(t);
  const q = `${E1.tors[3]} cannot be fully met: amounts with three decimals. How to proceed?`;
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, DEFERRAL)] } });
  await p.go();
  const run1 = p.runName();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const g = gate(p, E1.id);
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.deepEqual([g.kind, g.session, g.run, g.branch, g.branchTip, g.base], ['deferral', 'build-1', run1, E1.branch, tip, git(p.clone, 'rev-parse', 'develop')], 'the gate is sealed after the WIP commit');
  assert.equal(git(p.clone, 'log', '-1', '--format=%s', E1.branch), 'wip(autopilot): uncommitted work at park');

  const d = decide(p, E1.id, 'Fix now');
  assert.equal(d.enters, 'BUILD');
  assert.equal(gateFacts(p.state, 'develop').get(E1.id).state, 'resume');
  const pre = JSON.parse(cli('preflight', '--project', p.project, '--allow-test-double', '--json').stdout);
  assert.match(pre.epics[0].reasons.join(' '), /resumes at BUILD on feature\/epic-Lg1Csv7-csv-import: you answered "Fix now"/);
  assert.deepEqual(pre.launch.decidedGates.map((x) => [x.epic, x.state, x.enters]), [[E1.id, 'resume', 'BUILD']]);

  p.scenario({ [`${E1.id}/build`]: { actions: [ask(q, DEFERRAL), ...buildActions(E1)] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`), 'no plan session: the first run\'s plan is used');
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.deepEqual([e.resumed.phase, e.resumed.gate, e.resumed.branchTip, e.resumed.fromRun], ['BUILD', `gates/${E1.id}-1.json`, tip, run1]);
  // The session that asked is taken up again with what it knows: its transcript, a new id, and one message with the answer.
  const asked = readJson(path.join(p.state, 'runs', run1, 'epics', E1.id, 'build-1', 'step.json')).sessionId;
  const [build] = r.calls;
  assert.deepEqual(build.argv.slice(build.argv.indexOf('--resume'), build.argv.indexOf('--resume') + 3), ['--resume', asked, '--fork-session']);
  assert.notEqual(build.argv[build.argv.indexOf('--session-id') + 1], asked);
  assert.equal(build.prompt, fs.readFileSync(p.dir(E1.id, 'build-1', 'resume-prompt.md'), 'utf8'));
  assert.match(build.prompt, /^You were stopped while the project's owner was asked your question\. They have answered\./);
  assert.ok(build.prompt.includes(`**Asked:** "${q}"`) && build.prompt.includes('**The owner\'s answer:** "Fix now" — Pat Owner'), build.prompt);
  assert.match(build.prompt, /Continue from exactly where you stopped\. Do not start the step over/);
  assert.deepEqual(readJson(p.dir(E1.id, 'build-1', 'step.json')).resumeOf, { sessionId: asked, step: 'build-1', run: run1 });
  assert.ok(!r.calls[1].argv.includes('--resume') && !r.calls[2].argv.includes('--resume'), 'only the session that asked is resumed');
  assert.equal(Object.values(tools(p, E1.id, 'build-1')[0].hookSpecificOutput.updatedInput.answers)[0], 'Fix now');
  assert.deepEqual([gate(p, E1.id).decided.used.run, gate(p, E1.id).decided.used.session], [p.runName(), 'build-1']);
  assert.ok(merged(p, tip), 'the branch the first run left is what merged');
  assert.deepEqual(readJson(path.join(p.state, 'epics.json')), {}, 'a merged epic carries nothing forward');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Resumed at BUILD on `feature\/epic-Lg1Csv7-csv-import` .*Pat Owner answered "Fix now" on `gates\/Lg1Csv7-1\.json`/);
});

test('amendment gate, "Amend": the build changes the requirement in the owner\'s name, and the checks follow the amended anchors instead of failing the build for it', async (t) => {
  const p = makeProject(t);
  const old = E1.tors[0]; const fresh = 'TOR-01-Am3nd3d';
  const q = `${old} — The tool shall import every row looks wrong: its Then cannot be met. Proposed: same title / Then: "rows after the header are imported". How to proceed?`;
  const AMEND = [`Amend ${old} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];
  p.scenario({ [`${E1.id}/plan`]: planScript(E1), [`${E1.id}/build`]: { actions: [{ do: 'branch', name: E1.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, AMEND)] } });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind, gate(p, E1.id).tor], ['PARKED', 'amendment', old]);
  assert.match(gate(p, E1.id).why, /a requirement changes only with the owner's approval/);
  assert.equal(decide(p, E1.id, AMEND[0]).enters, 'BUILD');

  // As seen live: the old requirement is retired and a new one takes its place, in the requirement files, the
  // sidecar and the tests; the session's last commit is a `test(…)` one on top of the build's `feat(…)`.
  const E1a = { ...E1, tors: [fresh, ...E1.tors.slice(1)] };
  // The change record `tor-lifecycle check` asks for when a requirement goes away, written before the swap.
  const head = ['id = "CR-Am3nd3d"', 'date = 2026-11-13', 'kind = "supersede"', 'title = "Rows after the header"', 'reason = "The old Then cannot be met."', 'approved_via = "epic-branch"', 'approved_by = "Pat Owner"', 'refs = ["epic Lg1Csv7"]', 'keywords = ["header row"]', '', '[[changes]]', `tor = "${old}"`];
  const record = { do: 'exec', cmd: `mkdir -p docs/requirements/changes && f=$(basename "$(grep -l "${old}" docs/requirements/*.feature.md)") && fp=$(${TL} fingerprint | awk '$1=="${old}"{print $2}') && { printf '%s\\n' ${head.map((l) => `'${l}'`).join(' ')} "feature_file = \\"$f\\"" "fingerprint = \\"$fp\\"" 'successors = ["${fresh}"]' "text = '''"; ${TL} text ${old}; printf '%s\\n' "'''"; } > docs/requirements/changes/2026-11-13-Am3nd3d.toml` };
  const swap = { do: 'exec', cmd: `grep -rl "${old}" docs/requirements/*.feature.* docs/implementation-plan | xargs sed -i.bak "s/${old}/${fresh}/g" && find docs -name "*.bak" -delete` };
  p.scenario({
    [`${E1.id}/build`]: { actions: [ask(q, AMEND), { do: 'branch', name: E1.branch }, record, swap, ...buildActions(E1a).slice(1), { do: 'write', path: 'test/extra.test.js', content: `// ${fresh}\n` }, { do: 'commit', message: `test(epic-${E1.id}): cite only the live requirement ${fresh}` }] },
    [`${E1.id}/verify`]: wrapupScript(E1a),
  });
  const r = await again(p);
  const checks = Object.fromEntries(readJson(p.dir(E1.id, 'check-build-1.json')).checks.map((c) => [c.name, c]));
  assert.deepEqual(['branch-and-commit', 'traceability', 'scope'].map((n) => checks[n].pass), [true, true, true], JSON.stringify([checks['branch-and-commit'], checks.traceability, checks.scope]));
  assert.match(checks.traceability.evidence, new RegExp(`after the owner's approved amendment of ${old}`));
  assert.match(checks.scope.evidence, new RegExp(`requirement files changed under the owner's approved amendment of ${old}`));
  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((x) => `${E1.id}/${x}`), 'no repair round');
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.epic(E1.id).amended, [old]);
});

// ---- an approved amendment reaches every later step (#41 B12, B16) -------------------------------

/**
 * Run 1: the build asks to amend `e`'s first requirement and parks; the owner answers "Amend". Returns what run 2's build
 * does as a real one did: the change record, then the swap to `fresh` (its Then reworded by `then`), in the requirement
 * files, the sidecar and the tests.
 */
async function ownerAmends(p, e, fresh, { then = null, build = null } = {}) {
  const old = e.tors[0];
  const q = `${old} — The tool shall do it looks wrong: its Then cannot be met. Proposed: same title / Then: "reworded". How to proceed?`;
  const AMEND = [`Amend ${old} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];
  p.scenario({ [`${e.id}/plan`]: planScript(e), [`${e.id}/build`]: { actions: [{ do: 'branch', name: e.branch }, { do: 'write', path: 'src/half.js', content: '// half\n' }, ask(q, AMEND)] } });
  await p.go({ queue: [e.id] });
  assert.equal(gate(p, e.id).kind, 'amendment');
  decide(p, e.id, AMEND[0]);
  const ea = { ...e, tors: [fresh, ...e.tors.slice(1)] };
  const head = ['id = "CR-Am3nd3d"', 'date = 2026-11-13', 'kind = "supersede"', 'title = "Reworded"', 'reason = "The old Then cannot be met."', 'approved_via = "epic-branch"', 'approved_by = "Pat Owner"', `refs = ["epic ${e.id}"]`, 'keywords = ["reworded"]', '', '[[changes]]', `tor = "${old}"`];
  const record = { do: 'exec', cmd: `mkdir -p docs/requirements/changes && f=$(basename "$(grep -l "${old}" docs/requirements/*.feature.md)") && fp=$(${TL} fingerprint | awk '$1=="${old}"{print $2}') && { printf '%s\\n' ${head.map((l) => `'${l}'`).join(' ')} "feature_file = \\"$f\\"" "fingerprint = \\"$fp\\"" 'successors = ["${fresh}"]' "text = '''"; ${TL} text ${old}; printf '%s\\n' "'''"; } > docs/requirements/changes/2026-11-13-Am3nd3d.toml` };
  const swap = { do: 'exec', cmd: `grep -rl "${old}" docs/requirements/*.feature.* docs/implementation-plan | xargs sed -i.bak -e "s/${old}/${fresh}/g"${then ? ` -e 's/${then[0]}/${then[1]}/'` : ''} && find docs -name "*.bak" -delete` };
  const built = build ? build(ea) : buildActions(ea).slice(1);
  return { old, q, AMEND, ea, actions: [ask(q, AMEND), { do: 'branch', name: e.branch }, record, swap, ...built] };
}

test('the reviewer judges the amended requirement and is told the owner approved the amendment (#41 B12)', async (t) => {
  const p = makeProject(t);
  const fresh = 'TOR-01-Am3nd3d';
  const { old, ea, actions } = await ownerAmends(p, E1, fresh);
  // A reviewer that read tors.md says what it checked against the requirement as it now stands.
  const checked = ea.tors.map((tor) => ({ tor, tests: [`test/${E1.slug}.test.js`], code: [`src/${E1.slug}.js`], whenExercised: true, note: 'read' }));
  p.scenario({ [`${E1.id}/build`]: { actions }, [`${E1.id}/audit`]: { result: { total_cost_usd: 0.5, structured_output: { findings: [], recommend: 'proceed', summary: 'clean', checked } } }, [`${E1.id}/verify`]: wrapupScript(ea) });
  await again(p);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  const bundle = p.dir(E1.id, 'audit-1', 'bundle');
  const tors = fs.readFileSync(path.join(bundle, 'tors.md'), 'utf8');
  assert.ok(tors.includes(`[${fresh}]`) && !tors.includes(`[${old}]`), tors);
  const amendments = fs.readFileSync(path.join(bundle, 'amendments.md'), 'utf8');
  assert.match(amendments, new RegExp(`The owner approved replacing ${old} with ${fresh} \\(gates/${E1.id}-1\\.json, Pat Owner, \\d{4}-\\d{2}-\\d{2}\\)`));
  assert.match(amendments, /not a weakening/);
  assert.deepEqual(readJson(path.join(bundle, 'bundle.json')).anchors, [...E1.tors.slice(1), fresh]); // the replacement where the old one was dropped: last
  assert.equal(readJson(p.dir(E1.id, 'audit-1', 'audit.json')).decision, 'proceed');
  assert.match(fs.readFileSync(path.join(AUDIT_DIR, 'prompt.md'), 'utf8'), /`amendments\.md`/);
});

test('the repair session is told the owner approved the amendment, and to keep it (#41 B12)', async (t) => {
  const p = makeProject(t);
  const fresh = 'TOR-01-Am3nd3d';
  const { old, ea, actions } = await ownerAmends(p, E1, fresh, { build: (x) => buildActions(x, { testBody: " throw new Error('red'); " }).slice(1) });
  p.scenario({
    [`${E1.id}/build`]: { actions },
    [`${E1.id}/fix`]: { actions: [{ do: 'write', path: `test/${E1.slug}.test.js`, content: `import test from 'node:test';\n${ea.tors.map((x) => `test('${x} is met', () => {});`).join('\n')}\n` }, { do: 'commit', message: `fix(epic-${E1.id}): green` }] },
    [`${E1.id}/verify`]: wrapupScript(ea),
  });
  const r = await again(p);
  assert.deepEqual(r.steps, ['build-1', 'fix-1', 'audit-1', 'verify-1'].map((x) => `${E1.id}/${x}`));
  assert.equal(p.epic(E1.id).state, 'MERGED', p.epic(E1.id).reason);
  const rules = fs.readFileSync(p.dir(E1.id, 'fix-1', 'build-rules.md'), 'utf8');
  assert.match(rules, new RegExp(`The owner approved amending ${old} → ${fresh}; keep it as amended`));
  assert.ok(!/provisional run/.test(rules), 'an owner amendment is not a provisional one');
});

test('the look gate names the amended requirement and its Then lines, not the one it replaced (#41 B16)', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  const fresh = 'TOR-05-Am3nd3d';
  const manual = (x) => [...buildActions(x, { commit: false }).slice(1), { do: 'write', path: `test/${x.slug}.test.js`, content: "import test from 'node:test';\ntest('the chart command exists', () => {});\n" }, { do: 'write', path: `tests/manual/${x.tors[0]}.md`, content: `# Manual check — ${x.tors[0]}\n\n1. Open chart.html\n` }, { do: 'commit', message: `feat(epic-${x.id}): implement ${x.slug}` }];
  const { old, ea, actions } = await ownerAmends(p, e5, fresh, { then: ['the standard output should contain the string "chart"', 'a bar is drawn for each category'], build: manual });
  p.scenario({ [`${e5.id}/build`]: { actions } });
  await again(p, { queue: [e5.id] });
  const e = p.epic(e5.id);
  assert.equal(e.reason, 'human check needed before verify');
  const g = gate(p, e5.id, 2);
  assert.equal(g.kind, 'human-check');
  assert.equal(g.question, `${fresh} needs a person to check it. Does what was built look right?`);
  assert.deepEqual(g.checks.map((c) => [c.tor, c.clause]), [[fresh, 'a bar is drawn for each category'], [fresh, 'the exit code should be 0']]);
  assert.deepEqual(g.live, [{ tor: fresh, checklist: `tests/manual/${fresh}.md` }]);
  assert.ok(g.artifacts.includes(`clone:tests/manual/${fresh}.md`), JSON.stringify(g.artifacts));
  assert.ok(!JSON.stringify([g.question, g.checks, g.live, g.why]).includes(old), 'the replaced requirement is not quoted');
  // The verifier is handed the owner's look as covering the requirement the owner was shown.
  decide(p, e5.id, ANSWERS.looksRight, { n: 2, note: 'one bar per category' });
  p.scenario({ [`${e5.id}/verify`]: wrapupScript(ea) });
  await again(p, { queue: [e5.id] });
  const look = fs.readFileSync(p.dir(e5.id, 'verify-1', 'owner-look.md'), 'utf8');
  assert.match(look, new RegExp(`Operator-observed requirements it covers:\\*\\* ${fresh}\\n`));
  assert.equal(p.epic(e5.id).state, 'MERGED', p.epic(e5.id).reason);
});

test('requirement files a session changes without the owner\'s approval are still out of scope', async (t) => {
  const p = makeProject(t);
  const scripts = happy(E1);
  scripts[`${E1.id}/build`].actions.splice(-1, 0, { do: 'exec', cmd: 'for f in docs/requirements/*.feature.md; do echo "" >> "$f"; done' });
  p.scenario(scripts);
  await p.go();
  const scope = readJson(p.dir(E1.id, 'check-build-1.json')).checks.find((c) => c.name === 'scope');
  assert.equal(scope.pass, false);
  assert.match(scope.evidence.join(' '), /requirements are frozen during a run/);
});

test('unmatched question (asked in plan): replayable — the next run plans again and R8 matches the recorded question text', async (t) => {
  const p = makeProject(t);
  const q = 'The spec names both a monthly and a weekly budget period. Which should this epic build?';
  p.scenario({ [`${E1.id}/plan`]: { actions: [ask(q, ['Monthly', 'Weekly'])] } });
  await p.go();
  assert.deepEqual([gate(p, E1.id).kind, gate(p, E1.id).session], ['unmatched', 'plan-1']);
  assert.equal(decide(p, E1.id, 'Weekly').enters, 'PLAN');

  p.scenario({ ...happy(E1), [`${E1.id}/plan`]: { actions: [ask(q.replace('  ', ' '), ['Monthly', 'Weekly']), ask('Which colour should the bars be?', ['Red', 'Blue']), ask('Which colour should the bars be?', ['Red', 'Blue']), ...planScript(E1).actions] } });
  const r = await again(p);

  // The recorded question is answered once with the owner's answer; a different unmatched question still parks.
  // Before it reaches the owner, the session is reminded once of what they already answered; asked again, it parks.
  const [first, second, third] = tools(p, E1.id, 'plan-1');
  assert.equal(Object.values(first.hookSpecificOutput.updatedInput.answers)[0], 'Weekly');
  assert.deepEqual([second.hookSpecificOutput.permissionDecision, second.continue, second.stopReason], ['deny', undefined, undefined]);
  assert.match(second.hookSpecificOutput.permissionDecisionReason, /not put to the owner yet\. They have already answered 1 question\(s\) for this step: \(1\) asked "The spec names both .*" — the owner answered "Weekly"\. If what you are asking is one of those in other words, do not ask it: act on their answer now\. If it is a different decision, ask it again/);
  assert.equal(third.stopReason, 'autopilot: parked at human gate');
  assert.deepEqual(r.steps, [`${E1.id}/plan-1`]);
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.deepEqual([gate(p, E1.id).decided.used.session, gate(p, E1.id, 2).kind, gate(p, E1.id, 2).question], ['plan-1', 'unmatched', 'Which colour should the bars be?']);
});

// ---- a thin review (#40 item 16) ----------------------------------------------------------------

const thin = { reads: false, result: { total_cost_usd: 0.5, structured_output: { findings: [], recommend: 'proceed', summary: 'looked fine' } } };

test('a review thin twice in a full run parks on a `thin-review` question; "Verify as built" goes on to VERIFY and that review counts', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: thin });
  await p.go();

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.equal(e.reason, 'auditor: audit-2 was a thin review (read 0 of 2 changed code files)');
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'audit-2'].map((s) => `${E1.id}/${s}`));
  const g = gate(p, E1.id);
  assert.equal(g.kind, 'thin-review');
  assert.equal(g.session, 'audit-2');
  assert.deepEqual(g.options, [ANSWERS.verifyAsBuilt, ANSWERS.reviewAgain]);
  assert.deepEqual([g.read, g.of, g.unread], [0, 2, [`src/${E1.slug}.js`, `test/${E1.slug}.test.js`]]);
  assert.match(g.question, /^The independent review of .*CSV import read 0 of 2 changed code files in \d+ s: the reviewer barely looked, twice\. Verify it as built, or review again\?$/);
  assert.equal(technicalAnswer(g), null, 'the owner\'s question: no standing answer covers it');
  assert.equal(decide(p, E1.id, ANSWERS.verifyAsBuilt).enters, 'VERIFY');

  const r = await again(p);

  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  const after = p.epic(E1.id);
  assert.equal(after.state, 'MERGED');
  assert.deepEqual(after.audits.map((a) => [a.step, a.thin, a.accepted ?? null]), [['audit-1', true, null], ['audit-2', true, 'Pat Owner']]);
});

test('"Review again" on a thin review audits the whole epic afresh, not the changes since it', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: thin });
  await p.go();
  assert.equal(decide(p, E1.id, ANSWERS.reviewAgain).enters, 'AUDIT');

  p.scenario({ [`${E1.id}/verify`]: wrapupScript(E1) }); // the default auditor: it reads everything
  const r = await again(p);

  assert.deepEqual(r.steps, ['audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.equal(p.epic(E1.id).state, 'MERGED');
  const b = readJson(p.dir(E1.id, 'audit-1', 'bundle', 'bundle.json'));
  assert.equal(b.delta, false);
  assert.deepEqual(b.steps, ['build-1'], 'the build the thin reviews read is read again');
  assert.equal(readJson(p.dir(E1.id, 'audit-1', 'audit.json')).decision, 'proceed');
});

// ---- audit -------------------------------------------------------------------------------------

test('audit gate, "Not real — verify as built": the next run goes straight to VERIFY on the same tip; the audit is not re-run', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in')]) });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.deepEqual(gate(p, E1.id).options, [ANSWERS.auditReal, ANSWERS.auditNotReal]);
  assert.equal(decide(p, E1.id, ANSWERS.auditNotReal).enters, 'VERIFY');

  const r = await again(p);

  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.equal(e.preVerify.branchTip, tip);
  assert.deepEqual(e.auditOverruled, { gate: `gates/${E1.id}-1.json`, by: 'Pat Owner' });
  assert.deepEqual([gate(p, E1.id).decided.used.run, gate(p, E1.id).decided.used.phase], [p.runName(), 'VERIFY']);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Verified as built: Pat Owner judged the auditor's findings not real/);
});

test('audit gate, "Real — fix before verify": the fix round runs with the parking findings as the brief, then a delta audit and verify', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: audit([finding('stand-in'), finding('scope', 'low')]) });
  await p.go();
  const run1 = p.runName(); const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.equal(decide(p, E1.id, ANSWERS.auditReal, { note: 'the live path must be exercised' }).enters, 'FIX_BUILD');

  p.scenario({ [`${E1.id}/plan-fix`]: planScript(E1), [`${E1.id}/fix`]: { actions: [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/live.js', content: 'export const live = true;\n' }, { do: 'commit', message: `feat(epic-${E1.id}): exercise the live path` }] }, [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['fix-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.fixRounds], ['MERGED', 1]);
  const brief = fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8');
  assert.match(brief, /confirmed they are real/);
  assert.match(brief, /\*\*F1 stand-in\*\* — the stand-in problem/);
  assert.ok(!brief.includes('scope'), 'only the findings that parked');
  assert.match(brief, /The owner's note: the live path must be exercised/);
  assert.ok(r.calls[0].prompt.includes(fs.readFileSync(p.dir(E1.id, 'fix-brief.md'), 'utf8').trim()), 'the one repair session is given the brief as its prompt');
  // The audit after the fix covers only the delta since the first run's audit, and only the fix session.
  const a = readJson(p.dir(E1.id, 'audit-1', 'audit.json'));
  assert.deepEqual([a.delta, a.base], [true, tip]);
  assert.deepEqual(readJson(p.dir(E1.id, 'audit-1', 'bundle', 'bundle.json')).steps, ['fix-1']);
  assert.ok(fs.existsSync(path.join(p.state, 'runs', run1, 'epics', E1.id, 'audit-1', 'audit.json')));
});

test('audit gate, "Real" from a person when the one fix round is already used: one more repair runs, then the checks (Pilot Light, 2026-11-24)', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...roundSpent(E1), [`${E1.id}/audit`]: audit([finding('cannot-fail')]) });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).fixRounds, readJson(path.join(p.state, 'epics.json'))[E1.id].fixRounds], ['PARKED', 1, 1]);
  decide(p, E1.id, ANSWERS.auditReal);

  const r = await again(p);

  assert.ok(r.steps.some((x) => x.startsWith(`${E1.id}/fix`)), `a repair session ran: ${r.steps}`);
  assert.notEqual(p.epic(E1.id).state, 'FAILED', p.epic(E1.id).reason);
  assert.doesNotMatch(String(p.epic(E1.id).reason ?? ''), /one fix round is already used/);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'autopilot.log'), 'utf8'), /Pat Owner asked on gates\/\w+-1\.json for another, so one more runs/);
});

test('audit gate, "Real" that no person gave (a standing answer) when the one fix round is already used: FAILED without a session', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...roundSpent(E1), [`${E1.id}/audit`]: audit([finding('cannot-fail')]) });
  await p.go();
  const g = path.join(p.state, 'gates', `${E1.id}-1.json`);
  const rec = readJson(g);
  fs.writeFileSync(g, JSON.stringify({ ...rec, decided: { answer: ANSWERS.auditReal, by: 'Pat Owner', date: '2026-11-24', scope: 'next-run', standing: true } }, null, 2));

  const r = await again(p);

  assert.deepEqual(r.steps, []);
  assert.equal(p.epic(E1.id).state, 'FAILED');
  assert.match(p.epic(E1.id).reason, /one fix round is already used/);
});

test('unattended, a verifier that repairs code on its own and merges is rolled back, whatever it reports', async (t) => {
  const p = makeProject(t);
  const inline = [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/usage.js', content: 'export const usage = 1;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): usage text` }];
  // Unattended: a verifier that changes code on its own and merges is rolled back, whatever it reports.
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [...inline, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await p.go();
  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.match(p.epic(E1.id).reason, /merge gate/);
  const failed = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.filter((c) => !c.pass).map((c) => c.name);
  assert.deepEqual(failed, ['verdict', 'no-waivers']);
  assert.equal(merged(p, git(p.clone, 'rev-parse', E1.branch)), false, 'the merge was rolled back');
  // Nothing checked that change for a weaker test or a changed requirement, so only a new final check can take it on (issue #35).
  const g = gate(p, E1.id);
  assert.deepEqual([g.phase, g.technical, g.approvesFix ?? false, g.verifiedTip ?? null], ['VERIFY', true, false, null]);
  assert.match(g.question, /it changed files outside docs\/ \(src\/usage\.js\) that nobody allowed/);
});

test('owner-approved "Fix now" in verify: the inline repair merges and the report names it', async (t) => {
  const p = makeProject(t, { config: { smallFixes: false } }) /* the standing answer off: every fix is asked */;
  const q = 'Code-review finding in Epic Lg1Csv7: the usage text omits a command. Recommendation: Fix now. How to proceed?';
  const options = ['Fix now (Recommended)', 'Leave as is', 'Stop — epic FAILs'];
  p.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, options)] } });
  await p.go();
  assert.deepEqual([p.epic(E1.id).state, gate(p, E1.id).kind], ['PARKED', 'unmatched']);
  assert.equal(decide(p, E1.id, 'Fix now (Recommended)').enters, 'VERIFY');

  const inline = [{ do: 'checkout', name: E1.branch }, { do: 'write', path: 'src/usage.js', content: 'export const usage = 1;\n' }, { do: 'commit', message: `fix(epic-${E1.id}): usage text` }];
  p.scenario({ [`${E1.id}/verify`]: { actions: [ask(q, options), ...inline, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  const r = await again(p);
  assert.deepEqual(r.steps, [`${E1.id}/verify-1`]);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED', e.reason);
  assert.deepEqual([e.fixedAtWrapup.count, e.fixedAtWrapup.files, e.fixedAtWrapup.approvedBy], [1, ['src/usage.js'], `gates/${E1.id}-1.json`]);
  const verdict = readJson(p.dir(E1.id, 'check-verify-1.json')).checks.find((c) => c.name === 'verdict');
  assert.deepEqual(verdict.evidence.fixedDuringWrapup, ['src/usage.js']);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Fixed during verification, on your "Fix now" \(`gates\/Lg1Csv7-1\.json`\): src\/usage\.js\. The verifier checked its own fix/);

  // The owner's "Fix now" still covers its fix when only the merge is checked again (tests red once merged, then green).
  const p3 = makeProject(t, { config: { smallFixes: false, testCommand: 'test ! -e ledger.json' } });
  p3.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, options)] } });
  await p3.go();
  decide(p3, E1.id, 'Fix now (Recommended)');
  p3.scenario({ [`${E1.id}/verify`]: { actions: [ask(q, options), { do: 'exec', cmd: 'touch ledger.json' }, ...inline, ...wrapupActions(E1, { counts: [1, 0, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await again(p3);
  const g3 = gate(p3, E1.id, 2);
  assert.deepEqual([p3.epic(E1.id).state, g3.phase, g3.approvesFix], ['PARKED', 'CHECK_VERIFY', true]);
  fs.rmSync(path.join(p3.clone, 'ledger.json'));
  decide(p3, E1.id, ANSWERS.resume, { n: 2 });
  p3.scenario({});
  assert.deepEqual((await again(p3)).steps, []);
  assert.equal(p3.epic(E1.id).state, 'MERGED', p3.epic(E1.id).reason);

  // The same approval does not cover a waiver or an undisclosed deferral.
  const p2 = makeProject(t, { config: { smallFixes: false } });
  p2.scenario({ ...happy(E1), [`${E1.id}/verify`]: { actions: [ask(q, options)] } });
  await p2.go();
  decide(p2, E1.id, 'Fix now (Recommended)');
  p2.scenario({ [`${E1.id}/verify`]: { actions: [ask(q, options), ...inline, ...wrapupActions(E1, { counts: [2, 1, 0, 1, 0, 0] })], result: { result: 'Verdict: PASS' } } });
  await again(p2);
  assert.equal(p2.epic(E1.id).state, 'PARKED');
  assert.deepEqual(readJson(p2.dir(E1.id, 'check-verify-1.json')).checks.filter((c) => !c.pass).map((c) => c.name), ['no-waivers']);
});

// ---- human-check -------------------------------------------------------------------------------

test('human-check gate carries an artifact; "Looks right" goes to VERIFY and R8 answers the manual-verification question with the owner\'s look', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { Lg5Chr8: "echo '<svg/>' > chart.html && echo chart written" } } });
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });

  assert.equal(p.epic(e5.id).state, 'PARKED');
  assert.equal(p.epic(e5.id).reason, 'human check needed before verify');
  assert.deepEqual(p.steps(), [`${e5.id}/plan-1`, `${e5.id}/build-1`, `${e5.id}/audit-1`], 'no verify session before the look');
  const g = gate(p, e5.id);
  const dir = `${p.rel()}/epics/${e5.id}/artifacts`;
  assert.deepEqual([g.kind, g.options], ['human-check', [ANSWERS.looksRight, ANSWERS.notRight]]);
  // The owner reads plain words; the driver's own reason stays in `why`.
  assert.equal(g.question, `${e5.tors[0]} needs a person to check it. Does what was built look right?`);
  assert.match(g.why, /operator-observed: parks for a person before verify/);
  assert.deepEqual(g.artifacts, [`clone:tests/manual/${e5.tors[0]}.md`, `${dir}/run-output.txt`, `${dir}/files/chart.html`]);
  assert.ok(!(g.artifactNotes ?? []).some((n) => /did not start cleanly/.test(n)), 'a run command that worked is not flagged');
  assert.match(fs.readFileSync(path.join(p.state, dir, 'run-output.txt'), 'utf8'), /^\$ echo '<svg\/>' > chart\.html && echo chart written\n\(exit 0, on feature\/epic-Lg5Chr8-chart at [0-9a-f]{40}\)\n\nchart written/);
  assert.equal(fs.readFileSync(path.join(p.state, dir, 'files', 'chart.html'), 'utf8'), '<svg/>\n');
  assert.equal(git(p.clone, 'status', '--porcelain'), '', 'the clone is left as committed');
  const tip = git(p.clone, 'rev-parse', e5.branch);
  assert.equal(decide(p, e5.id, ANSWERS.looksRight, { note: 'one bar per category, labels readable' }).enters, 'VERIFY');

  const manual = 'Did you perform any manual verification beyond the automated gates I ran?';
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(manual, ['Yes — I performed manual verification', 'No — only automated gates were run']), ...wrapupActions(e5)], result: { result: 'Verdict: PASS' } } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED');
  const [answer] = tools(p, e5.id, 'verify-1');
  assert.deepEqual(answer.hookSpecificOutput.updatedInput.answers, { [manual]: 'Yes — I performed manual verification' });
  assert.match(answer.hookSpecificOutput.updatedInput.annotations[manual].notes, /Pat Owner looked at clone:tests\/manual\/.* and answered "Looks right" — "one bar per category, labels readable"/);
  assert.match(answer.hookSpecificOutput.permissionDecisionReason, /answered from the owner's recorded decision/);
  assert.equal(readJson(p.dir(e5.id, 'verify-1', 'step.json')).look.branchTip, tip);
  // The verifier is handed the owner's observation up front, so wrapup Step 1.2 item 7 does not ask for it.
  const lookFile = r.calls[0].argv[r.calls[0].argv.indexOf('--append-system-prompt-file') + 1];
  // One file, holding the look and the rules: `claude` keeps only the last such flag, so two files would lose the look.
  assert.equal(r.calls[0].argv.filter((a) => a === '--append-system-prompt-file').length, 1);
  assert.equal(lookFile, p.dir(e5.id, 'verify-1', 'system-append.md'));
  assert.ok(fs.readFileSync(lookFile, 'utf8').includes(fs.readFileSync(p.dir(e5.id, 'verify-1', 'owner-look.md'), 'utf8').trimEnd()) && /# Autopilot session rules/.test(fs.readFileSync(lookFile, 'utf8')));
  const lookText = fs.readFileSync(lookFile, 'utf8');
  assert.match(lookText, /Pat Owner, \d{4}-\d{2}-\d{2}/);
  assert.ok(lookText.includes(`branch tip ${tip}`) && lookText.includes('"one bar per category, labels readable"') && lookText.includes(e5.tors[0]), lookText);
  assert.match(lookText, /do not use\s+`AskUserQuestion`/);
  assert.ok(merged(p, tip));
});

test('an epic with screens: the build must leave pictures for the look; the gate carries them, the verifier looks too, and none of it is committed', async (t) => {
  const p = makeProject(t);
  const ui = addEpic(p.project, { id: 'Lg6Scr1', slug: 'dashboard', name: 'Dashboard', nn: '06' });
  fs.appendFileSync(path.join(p.project, 'docs', 'implementation-plan', 'phase-1-core', `epic-${ui.id}-${ui.slug}.md`), '\n## Screens\n\n- S-01 Home\n');
  const claude = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace('**Project type:** CLI tool', '**Project type:** Web app'));
  git(p.project, 'commit', '-qam', 'docs: the dashboard has a screen');
  const png = (name) => ({ do: 'exec', cmd: `mkdir -p .autopilot/look && printf 'PNG' > .autopilot/look/${name}` });
  const index = { do: 'exec', cmd: "printf '%s\\n' '- home.png — the home page, signed in, with three figures — TOR-06-Lg6Scr1' '- home-narrow.png — the home page at 320 px wide — TOR-06-Lg6Scr1' > .autopilot/look/index.md" };

  // The build takes no pictures: its checks send it back, and the one repair round takes them.
  p.scenario({
    [`${ui.id}/plan`]: planScript(ui), [`${ui.id}/build`]: buildScript(ui),
    [`${ui.id}/fix`]: { actions: [{ do: 'checkout', name: ui.branch }, png('home.png'), png('home-narrow.png'), index, { do: 'commit', message: `fix(epic-${ui.id}): pictures for the look` }] },
  });
  await p.go({ queue: [ui.id] });
  assert.match(fs.readFileSync(p.dir(ui.id, 'build-1', 'build-rules.md'), 'utf8'), /# Pictures for the owner's look\n\nThis epic changes screens\./);
  const first = readJson(p.dir(ui.id, 'check-build-1.json')).checks.find((c) => c.name === 'look-pictures');
  assert.equal(first.pass, false);
  assert.match(first.evidence, /no pictures in \.autopilot\/look\/: take a screenshot of every screen and state the requirements name/);
  assert.match(fs.readFileSync(p.dir(ui.id, 'fix-brief.md'), 'utf8'), /\*\*look-pictures\*\*/);
  assert.equal(readJson(p.dir(ui.id, 'check-build-2.json')).checks.find((c) => c.name === 'look-pictures').pass, true);

  // Parked for the look, with the pictures on the gate by full path and with the build's captions.
  assert.deepEqual([p.epic(ui.id).state, p.epic(ui.id).reason], ['PARKED', 'human check needed before verify']);
  const g = gate(p, ui.id);
  assert.deepEqual(g.artifacts.slice(0, 2), [`look/${ui.id}/home-narrow.png`, `look/${ui.id}/home.png`]); // then the project's run command output, as before
  assert.deepEqual(g.pictures, [{ path: path.join(p.state, 'look', ui.id, 'home-narrow.png'), shows: 'the home page at 320 px wide — TOR-06-Lg6Scr1' }, { path: path.join(p.state, 'look', ui.id, 'home.png'), shows: 'the home page, signed in, with three figures — TOR-06-Lg6Scr1' }]);
  assert.deepEqual(g.open.slice(0, 2), g.pictures.map((x) => x.path));
  assert.equal(g.question, 'This epic changed screens; pictures of them are ready. Does what was built look right?');
  assert.match(g.why, /UI epic: parks for a human look before verify/);
  // Git never saw them: nothing to commit, nothing on the branch.
  assert.equal(git(p.clone, 'status', '--porcelain'), '');
  assert.equal(git(p.clone, 'ls-tree', '-r', '--name-only', ui.branch, '--', '.autopilot/look'), '');

  // The verifier is given the same pictures in the clone and told to say what it sees; its words are kept.
  assert.equal(decide(p, ui.id, ANSWERS.looksRight, { note: 'looked at both pictures: three figures, readable at 320 px' }).enters, 'VERIFY');
  fs.rmSync(path.join(p.clone, '.autopilot', 'look'), { recursive: true, force: true }); // as after another epic's build
  const report = 'Verdict: PASS\n\n## What the pictures show\n\n- `home.png`: a signed-in page with three figures and a Sign out button. Matches TOR-06-Lg6Scr1.\n- home-narrow.png: the same page in one column, nothing cut off. Matches.\n\n## Next\n\n- nothing';
  p.scenario({ [`${ui.id}/verify`]: { actions: [{ do: 'exec', cmd: 'test -f .autopilot/look/home.png && test -f .autopilot/look/index.md' }, ...wrapupActions(ui)], result: { result: report } } });
  await again(p, { queue: [ui.id] });
  assert.match(fs.readFileSync(p.dir(ui.id, 'verify-1', 'verify-rules.md'), 'utf8'), /# The pictures of what was built[\s\S]*under the heading "What the pictures show", write one line per picture/);
  assert.equal(p.epic(ui.id).state, 'MERGED');
  assert.deepEqual(p.epic(ui.id).seen, ['home.png: a signed-in page with three figures and a Sign out button. Matches TOR-06-Lg6Scr1.', 'home-narrow.png: the same page in one column, nothing cut off. Matches.']);
  assert.equal(git(p.clone, 'ls-tree', '-r', '--name-only', 'develop', '--', '.autopilot/look'), '', 'the pictures are not in the merged code');
  const status = JSON.parse(cli('status', '--project', p.project, '--json').stdout);
  assert.deepEqual(status.seen.map((x) => [x.epic, x.lines.length]), [[ui.id, 2]]);
});

test('preflight says what an epic with screens does: parks with "look": "before", is listed afterwards with "after" or in a provisional run; an operator-observed one parks in every case (#41 B3)', (t) => {
  const p = makeProject(t);
  const ui = addEpic(p.project, { id: 'Lg6Scr1', slug: 'dashboard', name: 'Dashboard', nn: '06' });
  const seen = addLookEpic(p);
  for (const e of [ui, seen]) fs.appendFileSync(path.join(p.project, 'docs', 'implementation-plan', 'phase-1-core', `epic-${e.id}-${e.slug}.md`), '\n## Screens\n\n- S-01 Home\n');
  const claude = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace('**Project type:** CLI tool', '**Project type:** Web app'));
  git(p.project, 'commit', '-qam', 'docs: two epics have screens');
  const facts = (overrides) => {
    const pre = preflight(p.project, loadConfig(p.state, { project: p.project, overrides }));
    return Object.fromEntries([ui, seen].map((e) => { const x = pre.epics.find((y) => y.id === e.id); return [e.id, { humanCheck: x.humanCheck, ui: x.reasons.filter((r) => /UI epic/.test(r)), observed: x.reasons.some((r) => /operator-observed: parks for a person/.test(r)) }]; }));
  };
  const before = facts({});
  assert.deepEqual(before[ui.id], { humanCheck: true, ui: ['UI epic: parks for a human look before verify'], observed: false });
  const after = facts({ look: 'after' });
  assert.deepEqual(after[ui.id], { humanCheck: false, ui: ['UI epic: screens listed for you to see after the run ("look": "after"); no stop'], observed: false });
  const prov = facts({ mode: 'provisional' });
  assert.deepEqual(prov[ui.id], { humanCheck: false, ui: ['UI epic: not stopped for a look (provisional run); listed at the end'], observed: false });
  // A requirement a person must observe keeps its parking reason whatever the setting.
  for (const f of [before, after, prov]) assert.deepEqual([f[seen.id].humanCheck, f[seen.id].observed], [true, true]);
});

test('`decide` and `continue` with no `git config user.name`: the newest commit a person made names the owner, never an autopilot name; with none, the refusal names --by', (t) => {
  const p = makeProject(t); // every commit so far is by "Autopilot Test", and no user.name is set
  const run = '20261125-090000';
  fs.mkdirSync(path.join(p.state, 'runs', run), { recursive: true });
  fs.writeFileSync(path.join(p.state, 'runs', run, 'config.json'), JSON.stringify({ project: p.project, queue: [E1.id], autoContinue: 2 }));
  fs.writeFileSync(path.join(p.state, 'current'), `${run}\n`);
  fs.mkdirSync(path.join(p.state, 'gates'), { recursive: true });
  const gateFile = (n) => { fs.writeFileSync(path.join(p.state, 'gates', `${E1.id}-${n}.json`), JSON.stringify({ epic: E1.id, run, kind: 'plan-lint', question: 'The plan misses a part. Plan again?', options: [ANSWERS.replan], decided: null })); return `${E1.id}-${n}.json`; };
  const commitAs = (name, file) => { fs.writeFileSync(path.join(p.project, file), `${name}\n`); git(p.project, 'add', file); git(p.project, '-c', `user.name=${name}`, 'commit', '-qm', `by ${name}`, '--author', `${name} <x@example.invalid>`); };
  assert.equal(git(p.project, 'config', '--default', '', 'user.name'), '');

  // Only autopilot's names in the history: refused, and the message names --by.
  let r = cli('decide', '--workspace', p.state, '--gate', gateFile(1), '--answer', ANSWERS.replan);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no name to record: .*pass --by "<your name>"/);
  assert.throws(() => continueRun(p.state), /no name to record: .*--by/);

  // A person's commit, then a provisional run's: the person's name is recorded.
  commitAs('Pat Owner', 'pat.txt');
  commitAs('autopilot (provisional run)', 'prov.txt');
  assert.equal(ownerName(p.project), 'Pat Owner');
  r = cli('decide', '--workspace', p.state, '--gate', gateFile(1), '--answer', ANSWERS.replan);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readJson(path.join(p.state, 'gates', `${E1.id}-1.json`)).decided.by, 'Pat Owner');
  gateFile(2);
  const c = continueRun(p.state);
  assert.equal(c.continued.length, 1, JSON.stringify(c));
  assert.equal(readJson(path.join(p.state, 'gates', `${E1.id}-2.json`)).decided.by, 'Pat Owner');

  // With an email configured, the newest commit by that email wins over a teammate's newer one.
  git(p.project, 'config', 'user.email', 'pat@example.invalid');
  fs.writeFileSync(path.join(p.project, 'pat2.txt'), 'x\n'); git(p.project, 'add', 'pat2.txt'); git(p.project, 'commit', '-qm', 'pat', '--author', 'Pat Owner <pat@example.invalid>');
  commitAs('Kim Teammate', 'kim.txt');
  assert.equal(ownerName(p.project), 'Pat Owner');
  // `git config user.name` wins when it is set; --by wins over both.
  git(p.project, 'config', 'user.name', 'Sam Lead');
  assert.equal(ownerName(p.project), 'Sam Lead');
  assert.equal(JSON.parse(cli('decide', '--workspace', p.state, '--gate', gateFile(3), '--answer', ANSWERS.replan, '--by', 'Jo').stdout).gate, `${E1.id}-3.json`);
  assert.equal(readJson(path.join(p.state, 'gates', `${E1.id}-3.json`)).decided.by, 'Jo');
});

test('an epic without screens is told nothing about pictures and is not checked for them', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));
  await p.go();
  assert.doesNotMatch(fs.readFileSync(p.dir(E1.id, 'build-1', 'build-rules.md'), 'utf8'), /Pictures for the owner's look/);
  assert.doesNotMatch(fs.readFileSync(p.dir(E1.id, 'verify-1', 'verify-rules.md'), 'utf8'), /The pictures of what was built/);
  assert.equal(readJson(p.dir(E1.id, 'check-build-1.json')).checks.some((c) => c.name === 'look-pictures'), false);
  assert.deepEqual(pictureLines('## What the pictures show\n- a.png: fine\n\n## Other\n- not this'), ['a.png: fine']);
});

test('a look that does not settle the requirement goes back to the owner with the verifier\'s reason; no repair session, no fix round used', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const tip = git(p.clone, 'rev-parse', e5.branch);

  // The real wrapup asks this when it cannot judge; policy answers "Stop — epic FAILs" and nothing merges.
  const cannot = `${e5.tors[0]} is CANNOT VERIFY: the recorded observation says nothing about the bar heights. Recommendation: Stop — the missing observation has to be recorded. How to proceed?`;
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(cannot, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'])], result: { result: '## Verdict: FAIL' } } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, [`${e5.id}/verify-1`], 'no repair session: no code is wrong');
  const e = p.epic(e5.id);
  assert.deepEqual([e.state, e.fixRounds ?? 0, e.look], ['PARKED', 0, null]);
  assert.equal(e.reason, `the owner's recorded look did not settle ${e5.tors[0]}`);
  const g2 = gate(p, e5.id, 2);
  assert.deepEqual([g2.kind, g2.options, g2.decided, g2.branchTip], ['human-check', [ANSWERS.looksRight, ANSWERS.notRight], null, tip]);
  assert.equal(g2.question, `The verifier could not judge ${e5.tors[0]} from what you recorded. the recorded observation says nothing about the bar heights. Look again with that in mind: does what was built look right?`);
  assert.deepEqual(g2.artifacts, gate(p, e5.id, 1).artifacts, 'the same things to look at');

  // The owner looks again and says what was missing: verify runs on the same tip and merges.
  assert.equal(decide(p, e5.id, ANSWERS.looksRight, { n: 2, note: 'the tallest bar is the largest total; the half-size one is half as tall' }).enters, 'VERIFY');
  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const last = await again(p, { queue: [e5.id] });
  assert.deepEqual(last.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED');
  assert.match(fs.readFileSync(last.calls[0].argv[last.calls[0].argv.indexOf('--append-system-prompt-file') + 1], 'utf8'), /the half-size one is half as tall/);
});

test('the look as a form: the gate lists the requirement\'s Then lines, the file to open and the checklist; a yes to every line is a complete "Looks right"', async (t) => {
  const p = makeProject(t, { config: { humanCheck: { Lg5Chr8: "echo '<svg/>' > chart.html" } } });
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  const g = gate(p, e5.id);
  assert.ok(g.checks.length >= 2, JSON.stringify(g.checks));
  assert.deepEqual(g.checks.map((c) => [c.n, c.tor]), g.checks.map((_, i) => [i + 1, e5.tors[0]]));
  assert.ok(g.checks.every((c) => c.clause && !/^(Then|And|But)\b/.test(c.clause)), 'the lines are the requirement\'s own, without the keyword');
  assert.deepEqual(g.open, [path.join(p.state, `${p.rel()}/epics/${e5.id}/artifacts/files/chart.html`)], 'a full path a person can open');
  assert.deepEqual(g.checklists.map((c) => c.path), [`tests/manual/${e5.tors[0]}.md`]);
  assert.match(g.checklists[0].text, /Manual check/);

  const dec = (answer, obs, note) => cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-1.json`, '--answer', answer, '--by', 'Pat Owner', '--observations', JSON.stringify(obs), ...(note ? ['--note', note] : []));
  const all = (v) => g.checks.map((c) => ({ n: c.n, answer: v }));
  assert.match(dec(ANSWERS.looksRight, all('yes').slice(1)).stderr, /line 1 .* needs a yes or a no/);
  assert.match(dec(ANSWERS.looksRight, [{ n: 1, answer: "couldn't tell" }, ...all('yes').slice(1)]).stderr, /"could not tell" is not an answer to record/);
  assert.match(dec(ANSWERS.looksRight, [{ n: 1, answer: 'no' }, ...all('yes').slice(1)]).stderr, /a "no" on a line means the answer is "Not right — describe"/);
  assert.match(dec(ANSWERS.notRight, all('yes')).stderr, /every line was answered yes/);
  assert.match(dec(ANSWERS.notRight, [{ n: 1, answer: 'no' }, ...all('yes').slice(1)]).stderr, /a "no" needs --note/);
  assert.equal(gate(p, e5.id).decided, null, 'nothing was recorded by a refused answer');

  const ok = dec(ANSWERS.looksRight, all('yes'));
  assert.equal(ok.status, 0, ok.stderr);
  const d = gate(p, e5.id).decided;
  assert.deepEqual(d.observations.map((o) => [o.n, o.answer, o.clause]), g.checks.map((c) => [c.n, 'yes', c.clause]));
  assert.ok(d.note.startsWith('Confirmed line by line by the owner. Yes: ') && g.checks.every((c) => d.note.includes(c.clause)), d.note);

  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const r = await again(p, { queue: [e5.id] });
  assert.equal(p.epic(e5.id).state, 'MERGED');
  const look = fs.readFileSync(r.calls[0].argv[r.calls[0].argv.indexOf('--append-system-prompt-file') + 1], 'utf8');
  assert.match(look, /What they confirmed, one Then at a time/);
  for (const c of g.checks) assert.ok(look.includes(`"${c.clause}" — yes, I saw this`), c.clause);
  assert.match(look, /"Looks right" is the owner's answer to the whole requirement/);
  assert.match(look, /Give CANNOT VERIFY only where the record contradicts a Then or says it was not checked/);
});

test('after the verifier asks for more, the earlier look is kept: only the lines not yet confirmed are asked, and the new words are added to the old', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  decide(p, e5.id, ANSWERS.looksRight, { note: 'six bars, labels readable' });
  const cannot = `${e5.tors[0]} is CANNOT VERIFY: the record says the heights were not checked. Recommendation: Stop. How to proceed?`;
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(cannot, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'])], result: { result: '## Verdict: FAIL' } } });
  await again(p, { queue: [e5.id] });

  const g2 = gate(p, e5.id, 2);
  assert.deepEqual([g2.earlier.note, g2.earlier.by], ['six bars, labels readable', 'Pat Owner']);
  assert.deepEqual(g2.asks, [`${e5.tors[0]}: the record says the heights were not checked.`]);
  assert.deepEqual(g2.checks.map((c) => c.clause), gate(p, e5.id, 1).checks.map((c) => c.clause), 'a free-text look confirmed no line, so every line is asked once');
  const r = cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-2.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner', '--observations', JSON.stringify(g2.checks.map((c) => ({ n: c.n, answer: 'yes' }))));
  assert.equal(r.status, 0, r.stderr);
  const d = gate(p, e5.id, 2).decided;
  assert.ok(d.note.startsWith('six bars, labels readable Added after the verifier asked: Confirmed line by line by the owner.'), d.note);
  assert.equal(d.observations.length, g2.checks.length);

  // A second time round, the lines already confirmed are not asked again.
  p.scenario({ [`${e5.id}/verify`]: { actions: [ask(cannot, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'])], result: { result: '## Verdict: FAIL' } } });
  await again(p, { queue: [e5.id] });
  const g3 = gate(p, e5.id, 3);
  assert.deepEqual(g3.checks, [], 'every line has the owner\'s yes already');
  assert.equal(g3.earlier.observations.length, g2.checks.length);
  assert.match(cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-3.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner').stderr, /needs --note/);
});

test('human-check gate, "Not right — describe": the fix round gets the owner\'s note, and the changed build parks for a new look', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildWithManual(e5) });
  await p.go({ queue: [e5.id] });
  // No humanCheck command: the artifact is the project's **Run:** command from CLAUDE.md, placeholders dropped.
  assert.match(fs.readFileSync(path.join(p.state, gate(p, e5.id).artifacts[1]), 'utf8'), /^\$ node bin\/ledger\.js\n/);
  assert.equal(decide(p, e5.id, ANSWERS.notRight, { note: 'the bars overlap' }).enters, 'FIX_BUILD');

  p.scenario({ [`${e5.id}/plan-fix`]: planScript(e5), [`${e5.id}/fix`]: { actions: [{ do: 'checkout', name: e5.branch }, { do: 'write', path: 'src/bars.js', content: 'export const gap = 4;\n' }, { do: 'commit', message: `feat(epic-${e5.id}): space the bars` }] } });
  const r = await again(p, { queue: [e5.id] });

  assert.deepEqual(r.steps, ['fix-1', 'audit-1'].map((s) => `${e5.id}/${s}`));
  assert.match(fs.readFileSync(p.dir(e5.id, 'fix-brief.md'), 'utf8'), /Pat Owner\) looked at what was built and answered "Not right — describe":\n[\s\S]*> the bars overlap/);
  assert.deepEqual([p.epic(e5.id).state, p.epic(e5.id).fixRounds], ['PARKED', 1]);
  const g2 = gate(p, e5.id, 2);
  assert.deepEqual([g2.kind, g2.decided, g2.branchTip], ['human-check', null, git(p.clone, 'rev-parse', e5.branch)]);

  // The second look passes: verify, merge.
  // A look without the owner's words is refused: the note is the evidence.
  const bare = cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-2.json`, '--answer', ANSWERS.looksRight, '--by', 'Pat Owner');
  assert.notEqual(bare.status, 0);
  assert.match(bare.stderr, /a human-check answer needs --note: what you did to check and what you saw/);
  assert.equal(gate(p, e5.id, 2).decided, null);
  assert.match(cli('decide', '--workspace', p.state, '--gate', `gates/${e5.id}-2.json`, '--answer', ANSWERS.notRight, '--by', 'Pat Owner', '--note', '  ').stderr, /needs --note: what you looked at and what is wrong/);
  decide(p, e5.id, ANSWERS.looksRight, { n: 2, note: 'opened chart.html: the bars no longer overlap' });
  p.scenario({ [`${e5.id}/verify`]: wrapupScript(e5) });
  const last = await again(p, { queue: [e5.id] });
  assert.deepEqual(last.steps, [`${e5.id}/verify-1`]);
  assert.equal(p.epic(e5.id).state, 'MERGED');
});

test('human-check gate with nothing to look at says so plainly', async (t) => {
  const p = makeProject(t);
  const e5 = addLookEpic(p);
  const md = path.join(p.project, 'CLAUDE.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace(/^- \*\*Run:\*\*.*\n/m, ''));
  git(p.project, 'commit', '-qam', 'docs: no run command');
  p.scenario({ [`${e5.id}/plan`]: planScript(e5), [`${e5.id}/build`]: buildScript(e5) });
  await p.go({ queue: [e5.id] });

  const g = gate(p, e5.id);
  assert.deepEqual(g.artifacts, []);
  assert.match(g.why, /could not produce anything to look at: the build wrote no tests\/manual\/<TOR>\.md file for this epic; CLAUDE\.md has no \*\*Run:\*\* command/);
  assert.match(p.epic(e5.id).reason, /nothing could be produced to look at/);
});

// ---- plan-lint ---------------------------------------------------------------------------------

test('plan-lint gate has options; "Approve this plan" builds the captured plan, recorded as approved by the owner', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['reconcile'] }) });
  await p.go();
  const run1 = p.runName();
  const g = gate(p, E1.id);
  assert.deepEqual([g.kind, g.options, g.artifacts], ['plan-lint', [ANSWERS.approvePlan, ANSWERS.replan], [`runs/${run1}/epics/${E1.id}/plan-1/plan.md`]]);
  assert.equal(decide(p, E1.id, ANSWERS.approvePlan).enters, 'BUILD');

  p.scenario({ [`${E1.id}/build`]: buildScript(E1), [`${E1.id}/verify`]: wrapupScript(E1) });
  const r = await again(p);

  assert.deepEqual(r.steps, ['build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const e = p.epic(E1.id);
  assert.deepEqual([e.state, e.planApprovedBy, e.plan], ['MERGED', 'Pat Owner', g.artifacts[0]]);
  assert.ok(r.calls[0].prompt.startsWith('Implement the following plan:\n\n# Plan'));
  assert.ok(!r.calls[0].prompt.includes('Reconcile spec'), 'the plan as captured, lint failure and all');
  const md = fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8');
  assert.match(md, /Plans were approved by lint, not by a person — except Lg1Csv7 \(approved by Pat Owner\)\./);
  assert.match(md, /plan-1\/plan\.md` — approved by Pat Owner\./);
});

test('plan-lint gate, "Re-plan": the next run plans again on the same branch', async (t) => {
  const p = makeProject(t);
  p.scenario({ [`${E1.id}/plan`]: planScript(E1, { omit: ['mark'] }) });
  await p.go();
  const tip = git(p.clone, 'rev-parse', E1.branch);
  assert.equal(decide(p, E1.id, ANSWERS.replan).enters, 'PLAN');

  p.scenario(happy(E1));
  const r = await again(p);

  assert.deepEqual(r.steps, ['plan-1', 'build-1', 'audit-1', 'verify-1'].map((s) => `${E1.id}/${s}`));
  assert.deepEqual([p.epic(E1.id).state, p.epic(E1.id).planApprovedBy], ['MERGED', 'lint']);
  assert.equal(git(p.clone, 'for-each-ref', 'refs/autopilot/superseded/'), '', 'the same branch, not a fresh one');
  assert.ok(merged(p, tip));
});
