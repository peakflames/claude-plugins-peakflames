// The AUDIT step (autopilot-poc-plan.md §6.10, §10 P3), against fake-claude: the bundle, the plain
// `-p` launch, the driver's park rule, the delta re-audit after a fix round. No model is called;
// live-audit.test.mjs runs the real auditor on the same canned builds.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { run } from '../driver.mjs';
import { CATEGORIES, auditOutput, buildDigest, changedCodeFiles, judgeAudit, reviewCoverage, thinReview, validateAudit } from '../audit.mjs';
import { cannedBuild } from './audit-canned.mjs';
import { E1, git, happy, makeProject, planScript, readJson } from './helpers.mjs';

const go = (p) => p.go();
const finding = (category, severity, extra = {}) => ({ category, severity, evidence: 'test/x.test.js:3', explanation: `a ${severity} ${category} finding for TOR-01-Hd3Yc8L`, ...extra });
const auditScript = (findings, recommend = 'proceed') => ({ result: { total_cost_usd: 0.5, structured_output: { findings, recommend, summary: 'canned' } } });
const dir = (p, ...parts) => p.dir(E1.id, ...parts);

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
  assert.deepEqual(gate.artifacts, [`${p.rel()}/epics/${E1.id}/audit-1/audit.json`, `${p.rel()}/epics/${E1.id}/audit-1/bundle/diff.patch`]);
  assert.equal(gate.branchTip, git(p.clone, 'rev-parse', E1.branch)); // the build is kept on its branch
  const report = readJson(path.join(p.runDir(), 'report.json'));
  assert.equal(report.epics[0].evidence, `${p.rel()}/epics/${E1.id}/audit-1/audit.json F1`);
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /\| F1 \| high \| test-weakened \| yes \|/);
});

test('the auditor is launched as plain `claude -p`, read-only, in its bundle; the bundle holds the six inputs', async (t) => {
  const p = makeProject(t);
  p.scenario(happy(E1));

  await go(p);

  const call = p.calls().find((c) => c.kind === 'audit');
  const arg = (name) => call.argv[call.argv.indexOf(name) + 1];
  assert.ok(!call.argv.includes('--input-format') && !call.argv.includes('--permission-prompt-tool'), 'not host mode');
  assert.equal(call.argv[0], '-p');
  // The prompt, then the changed code files by name: the first try is told what to open, not only the second (Pilot Light, 2026-11-25: two first reviews of two read 10 of 21 and 4 of 9).
  const base = fs.readFileSync(new URL('../audit/prompt.md', import.meta.url), 'utf8');
  assert.ok(call.prompt.startsWith(base));
  assert.equal(call.prompt.slice(base.length), `\n## The files to open\n\n\`diff.patch\` changes 2 code files. Open each one in the clone before you report: the driver counts the files you open, and a review that opens fewer than 1 of them is not counted and is run again.\n\n- \`src/${E1.slug}.js\`\n- \`test/${E1.slug}.test.js\`\n`);
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
  assert.equal(readJson(path.join(p.runDir(), 'report.json')).epics[0].audit.runs[0].file, `${p.rel()}/epics/${E1.id}/audit-1/audit.json`);
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
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Auditor audit-1 \(the whole epic diff\): recommends park/);
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
    { do: 'tool', tool_name: 'Read', tool_input: { file_path: '{{state}}/settings.json' } },
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
    const step = path.join(c.mockRun(), 'epics', E1.id, 'audit-1');
    const meta = c.bundle(step);
    assert.equal(meta.digestCalls, variant === 'widened' ? 18 : 13);
    const diff = fs.readFileSync(path.join(step, 'bundle', 'diff.patch'), 'utf8');
    assert.equal(diff.includes('b/test/money.test.js'), variant === 'widened', variant);
    assert.equal(/near\(toCents\('1\.15'\), 115\)/.test(diff), variant === 'widened');
    assert.equal(fs.readFileSync(path.join(step, 'bundle', 'test-changes.jsonl'), 'utf8').includes('test/money.test.js'), variant === 'widened');
  }
});

// ---- a thin review (#40 item 16): what the reviewer opened is counted, and too little is not passed -----------

test('validateAudit with the anchors: a result without a `checked` entry for every anchor is no usable result', () => {
  const tors = ['TOR-01-Kq7Rm2x', 'TOR-01-Zb4Nw9T'];
  const entry = (tor) => ({ tor, tests: ['test/a.test.js'], code: ['src/a.js'], whenExercised: true, note: '' });
  const base = { findings: [], recommend: 'proceed', summary: '' };
  assert.equal(validateAudit({ ...base, checked: tors.map(entry) }, tors).ok, true);
  assert.deepEqual(validateAudit({ ...base, checked: [entry(tors[0])] }, tors).problems, [`checked has no entry for ${tors[1]}`]);
  assert.deepEqual(validateAudit(base, tors).problems, ['checked is not a list']);
  assert.deepEqual(validateAudit({ ...base, checked: [{ ...entry(tors[0]), tests: 'a' }, entry(tors[1])] }, tors).problems, ['checked[0].tests is not a list of paths']);
  assert.equal(validateAudit(base).ok, true, 'a caller without the anchors checks the shape only, as before');
  assert.ok(SCHEMA_REQUIRED().includes('checked'));
});
const SCHEMA_REQUIRED = () => readJson(new URL('../audit/schema.json', import.meta.url)).required;

test('reviewCoverage: the changed code files the reviewer read, from its referee log; docs, lockfiles, images and deletions do not count', (t) => {
  const p = makeProject(t);
  const step = path.join(p.tmp, 'audit-1'); fs.mkdirSync(path.join(step, 'bundle'), { recursive: true });
  const file = (rel, extra = '') => `diff --git a/${rel} b/${rel}\n${extra}--- a/${rel}\n+++ b/${rel}\n@@ -1 +1 @@\n-a\n+b\n`;
  fs.writeFileSync(path.join(step, 'bundle', 'diff.patch'), [
    file('src/a.js'), file('src/b.js'), file('test/a.test.js'), file('docs/implementation-plan/session-handoffs/epic-X-implemented.md'), file('docs/architecture.md'),
    file('package-lock.json'), file('web/logo.png'), 'diff --git a/bin/tool b/bin/tool\nBinary files a/bin/tool and b/bin/tool differ\n',
    'diff --git a/src/old.js b/src/old.js\ndeleted file mode 100644\n--- a/src/old.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-a\n',
  ].join(''));
  assert.deepEqual(changedCodeFiles(fs.readFileSync(path.join(step, 'bundle', 'diff.patch'), 'utf8')), ['src/a.js', 'src/b.js', 'test/a.test.js']);
  const read = (fp, hook = 'PostToolUse', tool = 'Read') => JSON.stringify({ hook, tool_name: tool, tool_input: { file_path: fp } });
  fs.writeFileSync(path.join(step, 'hooks.jsonl'), [
    read(path.join(p.clone, 'src/a.js')), read(path.join(p.clone, 'src/a.js')), read(path.join(p.clone, 'test/a.test.js')),
    read(path.join(p.clone, 'src/b.js'), 'PreToolUse'), read(path.join(p.clone, 'src/b.js'), 'PostToolUseFailure'), read(path.join(p.clone, 'src/b.js'), 'PostToolUse', 'Grep'),
    read(path.join(step, 'bundle', 'diff.patch')),
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(step, 'result.json'), JSON.stringify({ duration_ms: 49400 }));
  assert.deepEqual(reviewCoverage({ stepDir: step, clone: p.clone }), { read: 2, of: 3, unread: ['src/b.js'], seconds: 49 });
});

test('thinReview: under half the changed code files read (at most 15 needed), or an anchor with no test named, is thin', () => {
  const tors = ['TOR-01-Kq7Rm2x', 'TOR-01-Zb4Nw9T'];
  const value = { checked: tors.map((tor) => ({ tor, tests: ['test/a.test.js'] })) };
  const cov = (read, of) => ({ read, of, unread: [], seconds: 40 });
  assert.equal(thinReview({ value, coverage: cov(2, 4), anchors: tors }), null);
  assert.deepEqual(thinReview({ value, coverage: cov(1, 4), anchors: tors }), { need: 2, short: true, untested: [] });
  assert.equal(thinReview({ value, coverage: cov(15, 60), anchors: tors }), null, 'the cap keeps a large epic reachable in 40 turns');
  assert.equal(thinReview({ value, coverage: cov(14, 60), anchors: tors }).need, 15);
  assert.equal(thinReview({ value, coverage: cov(0, 0), anchors: tors }), null, 'nothing to read');
  const untested = { checked: [{ tor: tors[0], tests: ['t'] }, { tor: tors[1], tests: [] }] };
  assert.deepEqual(thinReview({ value: untested, coverage: cov(4, 4), anchors: tors }), { need: 2, short: false, untested: [tors[1]] });
  assert.equal(thinReview({ value: untested, coverage: cov(4, 4), anchors: tors, delta: true }), null, 'a delta audit may leave a requirement it did not touch');
});

test('an auditor that leaves out an anchor in `checked` parks the epic: no usable result', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { result: { structured_output: { checked: [], findings: [], recommend: 'proceed', summary: 's' } } } });
  await go(p);
  const e = p.epic(E1.id);
  assert.equal(e.state, 'PARKED');
  assert.match(e.reason, new RegExp(`^auditor: audit-1 returned no usable result \\(checked has no entry for ${E1.tors[0]};`));
});

test('a careful review records what it read; a thin first try is run once more, told what it left unread, and a careful second goes on', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit-1`]: { reads: false, ...auditScript([]) } });

  await go(p);

  const e = p.epic(E1.id);
  assert.equal(e.state, 'MERGED');
  assert.deepEqual(p.steps(), ['plan-1', 'build-1', 'audit-1', 'audit-2', 'verify-1'].map((s) => `${E1.id}/${s}`));
  const first = readJson(dir(p, 'audit-1', 'audit.json'));
  assert.equal(first.decision, 'thin');
  assert.deepEqual([first.coverage.read, first.coverage.of, first.coverage.unread], [0, 2, [`src/${E1.slug}.js`, `test/${E1.slug}.test.js`]]);
  const second = readJson(dir(p, 'audit-2', 'audit.json'));
  assert.deepEqual([second.decision, second.coverage.read, second.coverage.of], ['proceed', 2, 2]);
  assert.equal(second.checked.length, E1.tors.length);
  assert.deepEqual(e.audits.map((a) => [a.step, !!a.thin, a.coverage.read]), [['audit-1', true, 0], ['audit-2', false, 2]]);
  assert.equal(readJson(dir(p, 'audit-2', 'bundle', 'bundle.json')).delta, false, 'the second try reads the same whole epic');
  const prompt = p.calls().find((c) => c.step === 'audit-2').prompt;
  assert.match(prompt, /## Your first try was too thin/);
  assert.ok(prompt.includes(`\`src/${E1.slug}.js\``));
  assert.ok(!p.calls().find((c) => c.step === 'audit-1').prompt.includes('too thin'));
  assert.match(p.calls().find((c) => c.step === 'audit-1').prompt, /## The files to open/);
  assert.match(prompt, /## The files to open[\s\S]*## Your first try was too thin/);
  assert.ok(!fs.existsSync(path.join(p.state, 'gates')) || !fs.readdirSync(path.join(p.state, 'gates')).length, 'no question for the owner');
  assert.match(fs.readFileSync(path.join(p.runDir(), 'report.md'), 'utf8'), /Auditor audit-1 .*It read 0 of 2 changed code files in \d+ s: a thin review, not counted as the audit\./);
});

test('a thin review that also has a parking finding goes to the owner as findings, not as a thin review', async (t) => {
  const p = makeProject(t);
  p.scenario({ ...happy(E1), [`${E1.id}/audit`]: { reads: false, ...auditScript([finding('stand-in', 'high')]) } });
  await go(p);
  assert.equal(p.epic(E1.id).reason, 'auditor: F1 stand-in (audit-1)');
  assert.deepEqual(p.steps().slice(-1), [`${E1.id}/audit-1`]);
});

test('changedCodeFiles on a real git diff: a name with a space or accents, a mode-only change, a pure rename, fixtures and snapshots', (t) => {
  const p = makeProject(t);
  const r = path.join(p.tmp, 'repo'); fs.mkdirSync(r);
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(r, rel)), { recursive: true }); fs.writeFileSync(path.join(r, rel), text); };
  git(r, 'init', '-q'); git(r, 'config', 'user.email', 't@e.st'); git(r, 'config', 'user.name', 'T');
  w('run.sh', 'echo\n'); w('old.js', 'export const a = 1;\n'); git(r, 'add', '-A'); git(r, 'commit', '-qm', 'base');
  fs.chmodSync(path.join(r, 'run.sh'), 0o755);
  git(r, 'mv', 'old.js', 'new.js');
  w('src/my file.js', 'x\n'); w('src/café.js', 'x\n'); w('test/fixtures/rows.json', '[]\n'); w('test/__snapshots__/a.snap', 'x\n'); w('src/real.js', 'x\n');
  git(r, 'add', '-A'); git(r, 'commit', '-qm', 'change');
  assert.deepEqual(changedCodeFiles(git(r, 'diff', 'HEAD~1', 'HEAD') + '\n').sort(), ['src/café.js', 'src/my file.js', 'src/real.js']);
});

test('the reviewer\'s requirement IDs are read out of whatever it wrote around them', () => {
  const tor = 'TOR-01-Kq7Rm2x';
  const value = { findings: [], recommend: 'proceed', summary: '', checked: [{ tor: `[${tor}] Import every row`, tests: ['test/a.test.js'], code: [], whenExercised: true, note: '' }] };
  assert.equal(validateAudit(value, [tor]).ok, true);
  assert.equal(thinReview({ value, coverage: { read: 1, of: 1, unread: [], seconds: 1 }, anchors: [tor] }), null);
});
