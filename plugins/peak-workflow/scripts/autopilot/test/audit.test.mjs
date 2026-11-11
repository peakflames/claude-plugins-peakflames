// The AUDIT step (autopilot-poc-plan.md §6.10, §10 P3), against fake-claude: the bundle, the plain
// `-p` launch, the driver's park rule, the delta re-audit after a fix round. No model is called;
// live-audit.test.mjs runs the real auditor on the same canned builds.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { run } from '../driver.mjs';
import { CATEGORIES, auditOutput, buildDigest, judgeAudit, validateAudit } from '../audit.mjs';
import { cannedBuild } from './audit-canned.mjs';
import { E1, git, happy, makeProject, planScript, readJson } from './helpers.mjs';

const go = (p) => run({ stateDir: p.state });
const finding = (category, severity, extra = {}) => ({ category, severity, evidence: 'test/x.test.js:3', explanation: `a ${severity} ${category} finding for TOR-01-Hd3Yc8L`, ...extra });
const auditScript = (findings, recommend = 'proceed') => ({ result: { total_cost_usd: 0.5, structured_output: { findings, recommend, summary: 'canned' } } });
const dir = (p, ...parts) => path.join(p.state, 'epics', E1.id, ...parts);

test('a high finding in a park category parks the epic before verify, with a gate and the evidence', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: auditScript([finding('test-weakened', 'high'), finding('scope', 'low')]) });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.equal(e.reason, 'auditor: F1 test-weakened (audit-1)');
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1'].map((s) => `${E1.id}/${s}`)); // no verify session was paid for
  const audit = readJson(dir(p, 'audit-1', 'audit.json'));
  assert.equal(audit.decision, 'park');
  assert.deepEqual(audit.findings.map((f) => [f.id, f.parks]), [['F1', true], ['F2', false]]);
  const gate = readJson(path.join(p.state, 'gates', `${E1.id}-1.json`));
  assert.equal(gate.kind, 'audit');
  assert.equal(gate.session, 'audit-1');
  assert.deepEqual(gate.options, ['Real — fix before verify', 'Not real — verify as built']);
  assert.deepEqual(gate.artifacts, [`epics/${E1.id}/audit-1/audit.json`, `epics/${E1.id}/audit-1/bundle/diff.patch`]);
  assert.equal(gate.branchTip, git(p.clone, 'rev-parse', E1.branch)); // the build is kept on its branch
  const report = readJson(path.join(p.state, 'report.json'));
  assert.equal(report.epics[0].evidence, `epics/${E1.id}/audit-1/audit.json F1`);
  assert.match(fs.readFileSync(path.join(p.state, 'report.md'), 'utf8'), /\| F1 \| high \| test-weakened \| yes \|/);
});

test('the auditor is launched as plain `claude -p`, read-only, in its bundle; the bundle holds the six inputs', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));

  await go(p);

  const call = p.calls().find((c) => c.kind === 'audit');
  const arg = (name) => call.argv[call.argv.indexOf(name) + 1];
  assert.ok(!call.argv.includes('--input-format') && !call.argv.includes('--permission-prompt-tool'), 'not host mode');
  assert.equal(call.argv[0], '-p');
  assert.equal(call.prompt, fs.readFileSync(new URL('../audit/prompt.md', import.meta.url), 'utf8'));
  assert.equal(arg('--tools'), 'Read,Grep,Glob');
  assert.equal(arg('--permission-mode'), 'dontAsk');
  assert.equal(arg('--add-dir'), p.clone);
  assert.equal(arg('--output-format'), 'json');
  assert.deepEqual(JSON.parse(arg('--json-schema')), readJson(new URL('../audit/schema.json', import.meta.url)));
  assert.equal(arg('--model'), 'opus');
  assert.equal(arg('--max-turns'), '40');
  assert.ok(call.argv.includes('--no-session-persistence'));
  assert.equal(arg('--settings'), dir(p, 'audit-1', 'settings.json'));
  assert.equal(call.cwd, dir(p, 'audit-1', 'bundle'));
  assert.equal(call.env.AUTOPILOT_ROLE, 'auditor');
  assert.equal(call.env.AUTOPILOT_STEP, dir(p, 'audit-1'));

  const b = (f) => fs.readFileSync(dir(p, 'audit-1', 'bundle', f), 'utf8');
  assert.deepEqual(fs.readdirSync(dir(p, 'audit-1', 'bundle')).sort(), ['bundle.json', 'diff.patch', 'digest.md', 'handoff.md', 'spec.md', 'test-changes.jsonl', 'tors.md']);
  const meta = JSON.parse(b('bundle.json'));
  assert.equal(meta.delta, false);
  assert.equal(meta.range, `develop...${E1.branch}`);
  assert.deepEqual(meta.steps, ['build-1']);
  assert.match(b('diff.patch'), new RegExp(`\\+\\+\\+ b/src/${E1.slug}\\.js`));
  assert.match(b('spec.md'), /^# Epic Lg1Csv7: CSV import/);
  for (const tor of E1.tors) assert.ok(b('tors.md').includes(`Scenario: [${tor}]`), tor);
  assert.match(b('tors.md'), /Then the 'amountCents' values/); // the Given/When/Then, verbatim
  assert.match(b('handoff.md'), /## Deferrals/);
  assert.match(b('digest.md'), /## build-1/);

  // A clean audit proceeds to verify; the audit is in the state and the report.
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.deepEqual(p.epic(E1.id).audits.map((a) => [a.step, a.delta, a.findings]), [['audit-1', false, 0]]);
  assert.equal(readJson(path.join(p.state, 'report.json')).epics[0].audit.runs[0].file, `epics/${E1.id}/audit-1/audit.json`);
});

test('the driver decides, not the auditor: `recommend: park`, medium findings and a high finding outside parkOn all proceed', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: auditScript([finding('test-weakened', 'medium'), finding('scope', 'high'), finding('weak-requirement', 'high'), finding('claim-without-evidence', 'high')], 'park') });

  await go(p);

  assert.equal(p.epic(E1.id).state, 'MERGED');
  const audit = readJson(dir(p, 'audit-1', 'audit.json'));
  assert.equal(audit.recommend, 'park');
  assert.equal(audit.decision, 'proceed');
  assert.ok(audit.findings.every((f) => !f.parks));
  assert.ok(!fs.existsSync(path.join(p.state, 'gates')));
  assert.match(fs.readFileSync(path.join(p.state, 'report.md'), 'utf8'), /Auditor audit-1 \(the whole epic diff\): recommends park/);
});

test('config.audit.parkOn is the rule: a category added there parks, one removed does not', async (t) => {
  const p = makeProject(t, { config: { audit: { parkOn: ['scope'] } } });
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: auditScript([finding('stand-in', 'high'), finding('scope', 'high')], 'proceed') });

  await go(p);

  assert.equal(p.epic(E1.id).state, 'PARKED');
  assert.equal(p.epic(E1.id).reason, 'auditor: F2 scope (audit-1)');
});

test('after a fix round the auditor sees only the delta since the tip it last audited', async (t) => {
  const p = makeProject(t);
  p.scenario({
    ...happy(E1),
    [`${E1.id}/verify-1`]: { actions: [], result: { result: 'Verdict: FAIL\nTOR-01-Hd3Yc8L: the description is trimmed' } },
    [`${E1.id}/plan-fix`]: planScript(E1),
    [`${E1.id}/fix`]: { actions: [{ do: 'write', path: 'src/fix.js', content: 'export const fixed = true;\n' }, { do: 'commit', message: `feat(epic-${E1.id}): keep the description verbatim` }] },
  });

  await go(p);

  assert.equal(p.epic(E1.id).state, 'MERGED');
  const [first, second] = ['audit-1', 'audit-2'].map((s) => readJson(dir(p, s, 'bundle', 'bundle.json')));
  assert.equal(first.delta, false);
  assert.equal(second.delta, true);
  assert.equal(second.base, first.tip);
  assert.equal(second.range, `${first.tip}..${E1.branch}`);
  assert.deepEqual(second.steps, ['fix-1']);
  const delta = fs.readFileSync(dir(p, 'audit-2', 'bundle', 'diff.patch'), 'utf8');
  assert.match(delta, /\+\+\+ b\/src\/fix\.js/);
  assert.ok(!delta.includes(`src/${E1.slug}.js`), 'the first build is not audited again');
  assert.match(fs.readFileSync(dir(p, 'audit-2', 'bundle', 'digest.md'), 'utf8'), /## fix-1/);
  assert.deepEqual(p.epic(E1.id).audits.map((a) => a.delta), [false, true]);
});

test('an auditor that returns nothing usable parks the epic: no verify without an audit', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { result: { structured_output: { findings: [{ category: 'vibes', severity: 'huge', evidence: '', explanation: 'x' }], recommend: 'maybe' } } } });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, /^auditor: audit-1 returned no usable result \(.*"vibes" is not a known category.*recommend is not/);
  assert.deepEqual(p.steps().slice(-1), [`${E1.id}/audit-1`]);
});

test('the auditor session is read-only under the real referee hook, and may return its structured result', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { actions: [
    { do: 'tool', tool_name: 'Read', tool_input: { file_path: '{{step}}/bundle/diff.patch' } },
    { do: 'tool', tool_name: 'Grep', tool_input: { pattern: 'TOR-', path: '{{state}}/clone/test' } },
    { do: 'tool', tool_name: 'StructuredOutput', tool_input: { findings: [], recommend: 'proceed', summary: '' } },
    { do: 'tool', tool_name: 'Read', tool_input: { file_path: '{{state}}/state.json' } },
    { do: 'tool', tool_name: 'Write', tool_input: { file_path: '{{state}}/clone/src/x.js', content: 'x' } },
    { do: 'tool', tool_name: 'Bash', tool_input: { command: 'git commit -am x' } },
  ], ...auditScript([]) } });

  await go(p);

  const tools = fs.readFileSync(dir(p, 'audit-1', 'fake-tools.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(tools.map((x) => [x.tool_name, x.out?.hookSpecificOutput?.permissionDecision ?? 'pass']), [['Read', 'pass'], ['Grep', 'pass'], ['StructuredOutput', 'pass'], ['Read', 'deny'], ['Write', 'deny'], ['Bash', 'deny']]);
  assert.equal(p.epic(E1.id).state, 'MERGED');
  assert.equal(p.epic(E1.id).sessions.find((s) => s.name === 'audit-1').denials, 3);
});

test('digest: one numbered line per tool call across sessions, with denials and truncated results', (t) => {
  const p = makeProject(t);
  const mk = (name, lines, result) => {
    const d = path.join(p.tmp, name); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'hooks.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    if (result) fs.writeFileSync(path.join(d, 'result.json'), JSON.stringify({ result }));
    return { name, dir: d };
  };
  const steps = [
    mk('build-1', [
      { hook: 'SessionStart' },
      { hook: 'PreToolUse', tool_name: 'Bash', decision: 'pass', rule: null },
      { hook: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'node --test' }, tool_response: { stdout: 'x'.repeat(900), stderr: '' } },
      { hook: 'PreToolUse', tool_name: 'Bash', decision: 'deny', rule: 'R4', reason: 'docker is denied', tool_input: { command: 'docker ps' } },
      { hook: 'PostToolUseFailure', tool_name: 'Read', tool_input: { file_path: '/clone/missing.js' }, error: 'File does not exist' },
    ], 'All done.'),
    mk('fix-1', [{ hook: 'PostToolUse', tool_name: 'Edit', agent_type: 'general-purpose', tool_input: { file_path: '/clone/src/a.js' }, tool_response: {} }]),
  ];
  const { text, calls } = buildDigest(steps);
  assert.equal(calls, 4);
  assert.match(text, /^D1 Bash: node --test → x{600}… \(900 chars\)$/m);
  assert.match(text, /^D2 DENIED Bash: docker ps — R4: docker is denied$/m);
  assert.match(text, /^D3 FAILED Read: \/clone\/missing\.js → File does not exist$/m);
  assert.match(text, /^D4 Edit \(subagent general-purpose\): \/clone\/src\/a\.js → /m);
  assert.match(text, /Last message of build-1:\n\nAll done\./);
  assert.match(text, /Last message of fix-1:\n\n\(none recorded\)/);
});

test('audit result handling: structured_output or JSON in the text; the schema is enforced by hand', () => {
  const ok = { findings: [finding('cannot-fail', 'high')], recommend: 'park', summary: 's' };
  assert.deepEqual(auditOutput({ structured_output: ok }), ok);
  assert.deepEqual(auditOutput({ result: `Here it is:\n\`\`\`json\n${JSON.stringify(ok)}\n\`\`\`` }), ok);
  assert.equal(auditOutput({ result: 'no findings to report' }), null);
  assert.equal(validateAudit(ok).ok, true);
  assert.equal(validateAudit({ findings: [], recommend: 'proceed', summary: '' }).ok, true);
  assert.equal(validateAudit(null).ok, false);
  assert.equal(validateAudit({ findings: 'none', recommend: 'proceed', summary: '' }).ok, false);
  assert.deepEqual(CATEGORIES, ['stand-in', 'test-weakened', 'cannot-fail', 'never-ran-real', 'claim-without-evidence', 'scope', 'weak-requirement']);
  const j = judgeAudit({ ...ok, recommend: 'proceed' }, ['cannot-fail']);
  assert.deepEqual(j.parks.map((f) => f.id), ['F1']); // parks whatever the auditor recommends
});

test('the canned builds are what they claim: both pass their tests; only `widened` changes an existing test', (t) => {
  for (const variant of ['clean', 'widened']) {
    const c = cannedBuild(t, variant);
    const tests = spawnSync(process.execPath, ['--test'], { cwd: c.clone, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(tests.status, 0, `${variant}: ${tests.stdout}`);
    const step = path.join(c.state, 'epics', E1.id, 'audit-1');
    const meta = c.bundle(step);
    assert.equal(meta.digestCalls, variant === 'widened' ? 18 : 13);
    const diff = fs.readFileSync(path.join(step, 'bundle', 'diff.patch'), 'utf8');
    assert.equal(diff.includes('b/test/money.test.js'), variant === 'widened', variant);
    assert.equal(/near\(toCents\('1\.15'\), 115\)/.test(diff), variant === 'widened');
    assert.equal(fs.readFileSync(path.join(step, 'bundle', 'test-changes.jsonl'), 'utf8').includes('test/money.test.js'), variant === 'widened');
  }
});
