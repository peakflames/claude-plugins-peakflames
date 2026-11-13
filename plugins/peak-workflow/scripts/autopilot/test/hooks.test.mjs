// Referee hooks (autopilot-poc-plan.md §10 P2): fixture hook input is piped to each hook's stdin
// and the stdout JSON and exit code are asserted. No model is called.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR } from '../driver.mjs';
import { E1, git, makeProject, planText, readJson } from './helpers.mjs';

const HOOKS = path.join(PLUGIN_DIR, 'scripts', 'autopilot', 'hooks');
const UID = process.getuid();
const Q_START = `Start Epic ${E1.id} (${E1.slug}) — CSV import? Phase 1 — Core, planned by Todd Schavey on 2026-11-11`;
const START_OPTS = ['Start it', 'Show me the ready epics instead', 'Stop'];

/** A workspace as the driver leaves it mid-run: private clone, a run with state.json, one step directory. */
function referee(t, { role = 'builder', branch = E1.branch, config = {} } = {}) {
  const p = makeProject(t, { config });
  git(p.project, 'clone', '-q', '--no-hardlinks', '--branch', 'develop', p.project, p.clone);
  git(p.clone, 'remote', 'remove', 'origin');
  if (branch !== 'develop') git(p.clone, 'checkout', '-q', '-b', branch);
  const runDir = p.mockRun();
  const step = path.join(runDir, 'epics', E1.id, `${role === 'planner' ? 'plan' : role === 'verifier' ? 'verify' : 'build'}-1`);
  fs.mkdirSync(step, { recursive: true });
  const env = { ...process.env, AUTOPILOT_STATE: p.state, AUTOPILOT_RUN: runDir, AUTOPILOT_STEP: step, AUTOPILOT_ROLE: role, AUTOPILOT_EPIC: E1.id };
  const run = (hook, input, extraEnv = {}) => {
    const r = spawnSync(process.execPath, [path.join(HOOKS, hook)], { input: typeof input === 'string' ? input : JSON.stringify({ session_id: 's', cwd: p.clone, permission_mode: 'acceptEdits', ...input }), encoding: 'utf8', env: { ...env, ...extraEnv } });
    return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr };
  };
  const pre = (tool_name, tool_input, extraEnv) => run('pretool.mjs', { hook_event_name: 'PreToolUse', tool_name, tool_input }, extraEnv);
  const bash = (command, extraEnv) => pre('Bash', { command }, extraEnv);
  const ask = (question, options, extraEnv) => pre('AskUserQuestion', { questions: [{ question, header: 'Gate', multiSelect: false, options: options.map((label) => ({ label, description: '' })) }] }, extraEnv);
  const hooksLog = () => fs.readFileSync(path.join(step, 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { ...p, runDir, step, run, pre, bash, ask, hooksLog, gate: (n) => readJson(path.join(p.state, 'gates', `${E1.id}-${n}.json`)) };
}

const passes = (r, msg) => { assert.equal(r.code, 0, msg); assert.equal(r.out, null, `${msg}: expected no opinion, got ${JSON.stringify(r.out)}`); };
function denied(r, rule, re, msg) {
  assert.equal(r.code, 0, msg);
  assert.equal(r.out?.hookSpecificOutput?.permissionDecision, 'deny', `${msg}: expected a deny`);
  const reason = r.out.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.startsWith(`autopilot ${rule}:`), `${msg}: ${reason}`);
  if (re) assert.match(reason, re, msg);
  return r.out;
}
const answered = (r, question, label) => {
  assert.equal(r.out?.hookSpecificOutput?.permissionDecision, 'allow', JSON.stringify(r.out));
  assert.deepEqual(r.out.hookSpecificOutput.updatedInput.answers, { [question]: label });
  assert.equal(r.out.hookSpecificOutput.updatedInput.questions[0].question, question);
  assert.equal(r.out.continue, undefined);
};
const parked = (r) => { denied(r, 'R8', /parked at human gate/); assert.equal(r.out.continue, false); assert.equal(r.out.stopReason, 'autopilot: parked at human gate'); };

test('R1 kill switch: with STOP present every tool call is denied and the session ends', (t) => {
  const h = referee(t);
  passes(h.bash('ls'), 'before STOP');
  fs.writeFileSync(path.join(h.state, 'STOP'), '');
  const out = denied(h.bash('ls'), 'R1', /STOP file/);
  assert.equal(out.continue, false);
  assert.match(out.stopReason, /STOP/);
  denied(h.pre('Read', { file_path: path.join(h.clone, 'README.md') }), 'R1');
});

test('R2 path jail: file tools stay in the clone; state, home and system files are denied', (t) => {
  const h = referee(t);
  passes(h.pre('Read', { file_path: path.join(h.clone, 'README.md') }), 'read in clone');
  passes(h.pre('Read', { file_path: 'src/index.js' }), 'relative read');
  passes(h.pre('Write', { file_path: path.join(h.clone, 'src', 'new.js'), content: 'x' }), 'write in clone');
  passes(h.pre('Grep', { pattern: 'x' }), 'grep with no path');
  denied(h.pre('Read', { file_path: '/etc/hosts' }), 'R2', /outside the private clone/);
  denied(h.pre('Read', { file_path: path.join(h.runDir, 'state.json') }), 'R2', /autopilot workspace/);
  denied(h.pre('Write', { file_path: path.join(h.state, 'settings.json'), content: '{}' }), 'R2', /autopilot workspace/);
  denied(h.pre('Edit', { file_path: path.join(h.state, 'gates', 'x.json'), old_string: 'a', new_string: 'b' }), 'R2');
  denied(h.pre('Read', { file_path: path.join(h.project, 'README.md') }), 'R2', /outside the private clone/);
  denied(h.pre('Glob', { pattern: '**/*', path: os.homedir() }), 'R2');
  denied(h.pre('Read', { file_path: path.join(os.homedir(), '.claude', 'projects', 'x', 'transcript.jsonl') }), 'R2');
  denied(h.pre('Read', { file_path: path.join(os.homedir(), '.claude', 'settings.json') }), 'R2');
  denied(h.pre('Edit', { file_path: path.join(h.clone, '.git', 'config'), old_string: 'a', new_string: 'b' }), 'R2', /\.git/);
  // Inherited setup is readable, never writable; plan mode's plan file and the sandbox temp dir are writable.
  passes(h.pre('Read', { file_path: path.join(PLUGIN_DIR, 'skills', 'start-epic', 'SKILL.md') }), 'read plugin');
  denied(h.pre('Write', { file_path: path.join(PLUGIN_DIR, 'skills', 'start-epic', 'SKILL.md'), content: 'x' }), 'R2', /read-only/);
  passes(h.pre('Read', { file_path: path.join(os.homedir(), '.claude', 'projects', 'x', 'memory', 'MEMORY.md') }), 'read memory');
  passes(h.pre('Write', { file_path: path.join(os.homedir(), '.claude', 'plans', 'a-plan.md'), content: 'x' }), 'write plan file');
  passes(h.pre('Write', { file_path: `/tmp/claude-${UID}/scratch.txt`, content: 'x' }), 'write sandbox temp');
});

test('R2 path jail: a symlink out of the clone is resolved and denied', (t) => {
  const h = referee(t);
  const outside = path.join(h.tmp, 'outside');
  fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret.txt'), 's');
  fs.symlinkSync(outside, path.join(h.clone, 'link'));
  denied(h.pre('Read', { file_path: path.join(h.clone, 'link', 'secret.txt') }), 'R2', /outside the private clone/);
  denied(h.pre('Write', { file_path: 'link/new.txt', content: 'x' }), 'R2');
  denied(h.bash('cat link/../../outside/secret.txt'), 'R2');
});

test('R2 path jail: Bash absolute paths, cd targets and git -C are checked (best effort)', (t) => {
  const h = referee(t);
  passes(h.bash('node --test && ls -la src'), 'plain command');
  passes(h.bash('ls /usr/bin | head -3 && cat /dev/null'), 'system paths');
  passes(h.bash("grep -E '/foo/' src/index.js"), 'a regex is not a path');
  passes(h.bash(`cd ${h.clone}/src && ls`), 'cd inside clone');
  passes(h.bash(`cd /tmp/claude-${UID} && ls`), 'cd to sandbox temp');
  passes(h.bash('curl -s https://example.com/x'), 'a URL is not a path');
  denied(h.bash('cd /tmp && ls'), 'R2', /cd target/);
  denied(h.bash('git -C ../x commit -m y'), 'R2', /git target/);
  denied(h.bash('cat ../settings.json'), 'R2', /autopilot workspace/);
  denied(h.bash(`cat ${h.runDir}/config.json`), 'R2');
  denied(h.bash('ls ~/Documents'), 'R2');
  denied(h.bash('cat "$HOME/.ssh/id_rsa"'), 'R2');
  denied(h.bash('ls "$AUTOPILOT_STATE/gates"'), 'R2', /may not name/);
  denied(h.bash('cat "$AUTOPILOT_RUN/state.json"'), 'R2', /may not name/);
  denied(h.bash(`echo hi > ${h.project}/x.txt`), 'R2');
});

test('R2 declared read-only directories: Read, Grep and Bash may read them, nothing writes them, and an undeclared directory stays denied', (t) => {
  const h = referee(t);
  const cache = path.join(h.tmp, 'cache'); const other = path.join(h.tmp, 'other');
  for (const d of [cache, other]) { fs.mkdirSync(path.join(d, 'pkg'), { recursive: true }); fs.writeFileSync(path.join(d, 'pkg', 'lib.txt'), 'x'); }
  denied(h.pre('Read', { file_path: path.join(cache, 'pkg', 'lib.txt') }), 'R2', /outside the private clone/); // not declared yet
  const stateFile = path.join(h.runDir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ ...readJson(stateFile), readOnly: [cache] }));
  passes(h.pre('Read', { file_path: path.join(cache, 'pkg', 'lib.txt') }), 'read');
  passes(h.pre('Grep', { pattern: 'x', path: cache }), 'grep');
  passes(h.pre('Glob', { pattern: '**/*', path: cache }), 'glob');
  passes(h.bash(`ls ${cache}/pkg && cat ${cache}/pkg/lib.txt`), 'bash read');
  denied(h.pre('Write', { file_path: path.join(cache, 'pkg', 'new.txt'), content: 'x' }), 'R2', /read-only/);
  denied(h.pre('Edit', { file_path: path.join(cache, 'pkg', 'lib.txt'), old_string: 'x', new_string: 'y' }), 'R2', /read-only/);
  denied(h.bash(`echo hi > ${cache}/pkg/new.txt`), 'R2', /read-only/);
  denied(h.pre('Read', { file_path: path.join(other, 'pkg', 'lib.txt') }), 'R2', /outside the private clone/);
  denied(h.bash(`cat ${other}/pkg/lib.txt`), 'R2');
  // A link inside a declared directory that leads out of it is resolved first.
  fs.symlinkSync(other, path.join(cache, 'link'));
  denied(h.pre('Read', { file_path: path.join(cache, 'link', 'pkg', 'lib.txt') }), 'R2', /outside the private clone/);
});

test('R2 auditor: reads the bundle and the clone, and nothing else is allowed', (t) => {
  const h = referee(t, { role: 'auditor' });
  fs.mkdirSync(path.join(h.step, 'bundle'));
  passes(h.pre('Read', { file_path: path.join(h.step, 'bundle', 'diff.patch') }), 'bundle');
  passes(h.pre('Grep', { pattern: 'x', path: h.clone }), 'clone');
  denied(h.pre('Read', { file_path: path.join(h.runDir, 'state.json') }), 'R2');
  denied(h.pre('Read', { file_path: path.join(h.runDir, 'epics', E1.id, 'build-1', 'hooks.jsonl') }), 'R2'); // another step of the same run
  denied(h.pre('Write', { file_path: path.join(h.clone, 'x.txt'), content: 'x' }), 'R2', /only reads/);
  denied(h.bash('ls'), 'R2', /only reads/);
});

test('R3 git: push, remote writes, force, hard reset, branch -D, release line and tags are denied', (t) => {
  const h = referee(t);
  for (const c of ['git push', 'git push origin develop', 'cd src && git push -u origin HEAD', 'sh -c "git push"', 'git -c alias.p=push p']) denied(h.bash(c), 'R3', null, c);
  for (const verb of ['add origin https://example.com/x.git', 'set-url origin x', 'rename origin up', 'remove origin']) denied(h.bash(`git remote ${verb}`), 'R3', /git remote/, verb);
  // Owner decision: the read-only listing both skills' Freshness Guard runs is allowed, alone or in a compound command.
  passes(h.bash('git remote'), 'bare git remote');
  passes(h.bash('git remote -v'), 'git remote -v');
  passes(h.bash('git remote | grep -q origin && git status'), 'compound with the listing');
  denied(h.bash('git reset --hard HEAD~1'), 'R3', /reset --hard/);
  passes(h.bash('git reset HEAD src/index.js'), 'soft reset');
  denied(h.bash('git commit --amend --force'), 'R3', /--force/);
  denied(h.bash('git branch -D feature/x'), 'R3');
  denied(h.bash('git checkout main'), 'R3', /release line/);
  denied(h.bash('git switch main'), 'R3');
  denied(h.bash('git tag v1.0.0'), 'R3', /tag/);
  passes(h.bash('git tag'), 'listing tags');
  denied(h.bash('git rebase develop'), 'R3', /rebase/);
  denied(h.bash('git --git-dir=/x/.git status'), 'R3');
  passes(h.bash('git status && git diff --stat && git log --oneline -5'), 'read-only git');
});

test('R3 git: a builder commits on the epic branch only; nobody but the verifier merges', (t) => {
  const h = referee(t);
  passes(h.bash(`git add src/a.js && git commit -m "feat(epic-${E1.id}): x"`), 'commit on the epic branch');
  denied(h.bash('git checkout develop && git commit -m x'), 'R3', /commit on develop/);
  denied(h.bash(`git checkout develop && git merge --no-ff ${E1.branch}`), 'R3', /only the verify session merges/);
  denied(h.bash(`git branch -d ${E1.branch}`), 'R3');
  git(h.clone, 'checkout', '-q', 'develop');
  denied(h.bash('git commit -m "straight onto develop"'), 'R3', /commit on develop/);
  denied(h.bash('git cherry-pick abc123'), 'R3');
  passes(h.bash(`git checkout ${E1.branch} && git commit -m "feat: y"`), 'checkout then commit');
  assert.doesNotMatch(JSON.stringify(h.bash('git commit -m "straight onto develop"')), /merge --abort/, 'the conflict advice is for the verifier only');
  const v = referee(t, { role: 'verifier', branch: 'develop' });
  denied(v.bash('git add docs/architecture.md && git commit -q --no-edit'), 'R3', /commit on develop is denied.*merge --abort.*merge develop into it and resolve the conflict there.*--no-ff/);

  const planner = referee(t, { role: 'planner' });
  passes(planner.bash(`git checkout -b ${E1.branch}`), 'planner creates the branch');
  denied(planner.bash('git commit -m x'), 'R3', /planning session/);
});

test('R3 git: the verifier may merge --no-ff this epic\'s branch into develop and delete it, nothing else', (t) => {
  const h = referee(t, { role: 'verifier' });
  passes(h.bash('git add docs && git commit -m "docs(epic): complete"'), 'verifier commits on the branch');
  git(h.clone, 'checkout', '-q', 'develop');
  passes(h.bash(`git merge --no-ff ${E1.branch} -m "Merge branch '${E1.branch}' into develop"`), 'the wrapup merge');
  passes(h.bash(`git checkout develop && git merge --no-ff ${E1.branch}`), 'checkout then merge');
  passes(h.bash(`git branch -d ${E1.branch}`), 'delete the merged branch');
  denied(h.bash(`git merge ${E1.branch}`), 'R3', /--no-ff/);
  denied(h.bash('git merge --no-ff feature/epic-Lg2Cat4-categorize'), 'R3');
  denied(h.bash(`git merge --no-ff ${E1.branch} hotfix/x`), 'R3');
  denied(h.bash('git branch -d feature/epic-Lg2Cat4-categorize'), 'R3');
  denied(h.bash('git commit -m "on develop"'), 'R3');
});

test('R4 containers, VMs, sudo, gh and global installs are denied; project installs are not', (t) => {
  const h = referee(t);
  for (const c of ['docker run --rm alpine', 'podman ps', 'colima start', 'limactl list', 'multipass launch', 'vagrant up', 'qemu-system-x86_64 -m 1', 'minikube start', 'kind create cluster',
    'sudo ls', 'brew install jq', 'gh issue comment 3 --body hi', 'npm install -g typescript', 'npm i --global x', 'yarn global add x', 'pip install --user requests', 'nvm install 20',
    'cd src && docker build .', 'FOO=1 docker ps', 'env docker ps', 'npm publish', 'cargo install ripgrep']) denied(h.bash(c), 'R4', null, c);
  for (const c of ['npm install left-pad', 'npm test', 'pip install -r requirements.txt', 'node --test', 'echo "docker is not installed"', 'grep -r docker docs']) passes(h.bash(c), c);
});

test('R5 disk floor and growth cap deny Bash and Write', (t) => {
  const h = referee(t, { config: { diskFloorGb: 1e9 } });
  denied(h.bash('node --test'), 'R5', /under the 1000000000 GB floor/);
  denied(h.pre('Write', { file_path: path.join(h.clone, 'big.bin'), content: 'x' }), 'R5');
  passes(h.pre('Read', { file_path: path.join(h.clone, 'README.md') }), 'reads are not gated on disk');

  const g = referee(t, { config: { diskFloorGb: 0, growthCapMb: 1 } });
  passes(g.bash('ls'), 'no step.json: nothing to compare');
  fs.writeFileSync(path.join(g.step, 'step.json'), JSON.stringify({ startMb: 0 }));
  fs.writeFileSync(path.join(g.clone, 'big.bin'), Buffer.alloc(3 * 1024 * 1024));
  denied(g.bash('ls'), 'R5', /over the 1 MB cap/);
});

test('R6 background tasks are denied for Bash and Agent', (t) => {
  const h = referee(t);
  denied(h.pre('Bash', { command: 'npm run dev', run_in_background: true }), 'R6', /background/);
  denied(h.pre('Agent', { description: 'x', prompt: 'y', run_in_background: true }), 'R6');
  passes(h.pre('Agent', { description: 'x', prompt: 'y' }), 'foreground agent');
});

test('R7 test integrity: an existing test changes only after a reason is recorded', (t) => {
  const h = referee(t);
  const file = path.join(h.clone, 'test', 'smoke.test.js');
  denied(h.pre('Edit', { file_path: file, old_string: 'a', new_string: 'b' }), 'R7', /append \{"path":"test\/smoke\.test\.js","reason"/);
  denied(h.pre('Write', { file_path: 'test/smoke.test.js', content: '' }), 'R7');
  for (const c of ['rm test/smoke.test.js', 'git rm test/smoke.test.js', 'mv test/smoke.test.js test/old.js', "sed -i '' 's/a/b/' test/smoke.test.js", 'echo "" > test/smoke.test.js', 'git checkout develop -- test/smoke.test.js']) denied(h.bash(c), 'R7', null, c);
  // Reading and running tests, new tests, and the reasons file itself are free.
  passes(h.bash('node --test test/smoke.test.js > out.txt 2>&1'), 'running a test');
  passes(h.bash('cat test/smoke.test.js'), 'reading a test');
  passes(h.pre('Write', { file_path: 'test/import.test.js', content: 'x' }), 'a new test');
  passes(h.pre('Edit', { file_path: 'src/index.js', old_string: 'a', new_string: 'b' }), 'source');
  passes(h.pre('Write', { file_path: '.autopilot/test-changes.jsonl', content: 'x' }), 'the reasons file');
  fs.mkdirSync(path.join(h.clone, '.autopilot'));
  fs.writeFileSync(path.join(h.clone, '.autopilot', 'test-changes.jsonl'), '{"path":"test/smoke.test.js","reason":""}\n');
  denied(h.pre('Edit', { file_path: file, old_string: 'a', new_string: 'b' }), 'R7', null, 'an empty reason is no reason');
  fs.writeFileSync(path.join(h.clone, '.autopilot', 'test-changes.jsonl'), '{"path":"test/smoke.test.js","reason":"the version string moved to package.json"}\n');
  passes(h.pre('Edit', { file_path: file, old_string: 'a', new_string: 'b' }), 'with a reason');
  passes(h.bash('rm test/smoke.test.js'), 'with a reason (Bash)');
});

test('R8 start-epic Step 2.5: a question that ends "Start it?" without the words "Start Epic" is answered when it names the queued epic', (t) => {
  const h = referee(t, { role: 'planner', branch: 'develop' });
  const q = `Epic ${E1.id} (${E1.slug}) — CSV import. Phase 2 Extras; planned by Todd Schavey 2026-11-11; no owner yet. Start it?`;
  answered(h.ask(q, START_OPTS), q, 'Start it');
  parked(h.ask('Epic Lg2Cat4 (categorize) — Categorization rules. Start it?', START_OPTS)); // not the queued epic
  assert.match(h.gate(1).why, /does not name the queued epic/);
});

test('R8 start-epic Step 2.5: answered "Start it" by fragment plus the queued epic ID, keyed by the question as asked', (t) => {
  const h = referee(t, { role: 'planner', branch: 'develop' });
  answered(h.ask(Q_START, START_OPTS), Q_START, 'Start it');
  assert.equal(fs.existsSync(path.join(h.state, 'gates')), false);
  parked(h.ask('Start Epic Lg2Cat4 (categorize) — Categorization rules?', START_OPTS)); // not the queued epic
  assert.match(h.gate(1).why, /does not name the queued epic/);
  assert.equal(h.gate(1).kind, 'start-epic-confirm');
  parked(h.ask(Q_START, ['Begin', 'Stop'])); // the pre-approved answer is not offered
  assert.match(h.gate(2).why, /not among the options offered/);
  const builder = referee(t);
  parked(builder.ask(Q_START, START_OPTS)); // only a planning session is asked this
});

test('R8 wrapup-epic: each pre-approved question gets its one answer', (t) => {
  const h = referee(t, { role: 'verifier' });
  const cases = [
    [`${E1.tors[2]} is FAIL: the description is trimmed. Recommendation: Stop — the builder should fix it. How to proceed?`, ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'], 'Stop — epic FAILs'],
    [`${E1.tors[0]} is CANNOT VERIFY: no test exercises the When. Recommendation: Fix now — small. How to proceed?`, ['Fix now', 'Defer — depends on a later epic', 'Stop — epic FAILs'], 'Stop — epic FAILs'],
    ['Tests failed: node --test: 2 failing. Recommendation: Fix now — one assertion. How to proceed?', ['Fix now', 'Stop — epic FAILs'], 'Stop — epic FAILs'],
    ['Verdict PASS. Proceed to Phase 2 (complete and ship)?', ['Proceed', 'Stop'], 'Proceed'],
    // Run A: the verifier put the epic and the counts into the question; it is still Step 1.5.
    ['Epic Lg3Sum9 (monthly summary) verdict is PASS: 5/5 requirements pass and all 20 tests pass. Proceed to Phase 2 (complete and ship)?', ['Proceed', 'Stop'], 'Proceed'],
    ['Did you perform any manual verification beyond the automated gates I ran?', ['Yes — I performed manual verification', 'No — only automated gates were run'], 'No — only automated gates were run'],
    ['Ship mode — solo (merge locally to the base branch) or team (push the branch and open a pull request)?', ['Team — push and open PR', 'Solo — local merge only'], 'Solo — local merge only'],
  ];
  for (const [q, opts, want] of cases) answered(h.ask(q, opts), q, want);
  // A label typed with a plain hyphen still matches, and the answer is the label as offered.
  const q = 'Verdict PASS. Proceed to Phase 2 (complete and ship)?';
  answered(h.ask(cases[2][0], ['Fix now', 'Stop - epic FAILs']), cases[2][0], 'Stop - epic FAILs');
  assert.equal(fs.existsSync(path.join(h.state, 'gates')), false);
  // A TOR that is not one of this epic's anchors is not this policy's to answer.
  parked(h.ask('TOR-09-Zzzzzz9 is FAIL: x. Recommendation: Stop. How to proceed?', ['Fix now', 'Stop — epic FAILs']));
  const planner = referee(t, { role: 'planner', branch: 'develop' });
  parked(planner.ask(q, ['Proceed', 'Stop']));
});

test('R8 parks every owner decision and every unmatched question, with a gate file', (t) => {
  const h = referee(t);
  const deferral = `${E1.tors[1]} cannot be fully met: the CSV has no year. Recommendation: Defer — depends on a later epic. How to proceed?`;
  const r = h.ask(deferral, ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"]);
  parked(r);
  const g = h.gate(1);
  assert.deepEqual({ epic: g.epic, epicName: g.epicName, kind: g.kind, session: g.session, question: g.question, tor: g.tor, branch: g.branch, decided: g.decided },
    { epic: E1.id, epicName: 'CSV import', kind: 'deferral', session: 'build-1', question: deferral, tor: E1.tors[1], branch: E1.branch, decided: null });
  assert.deepEqual(g.options, ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"]);
  assert.match(g.why, /owner decision/);
  assert.equal(g.branchTip, git(h.clone, 'rev-parse', 'HEAD'));
  const parks = [
    [`${E1.tors[0]} — The tool shall import every row looks wrong: banks export a BOM. Proposed: skip the BOM. How to proceed?`, [`Amend ${E1.tors[0]} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"], 'amendment'],
    [`How should ${E1.tors[0]} change?`, ['Amend requirement (owner-approved)', 'Record as pending', 'Back'], 'amendment-how'],
    [`${E1.tors[0]} was superseded in CR-1 (2026-11-01) by TOR-01-Aaaaaa1 — x. Update this epic's anchors?`, ['Replace with successor (recommended)', 'Drop (superseded in CR-1)', 'Stop'], 'anchor-superseded'],
    ['Which directories hold tests? (space-separated, E2E last)', ['test/', 'Other'], 'test-directories'],
    ['Which colour should the chart bars be?', ['Blue', 'Green'], 'unmatched'],
  ];
  parks.forEach(([q, opts, kind], i) => { parked(h.ask(q, opts)); assert.equal(h.gate(i + 2).kind, kind, q); });
  // One unmatched question parks the whole call, even beside a matched one.
  const v = referee(t, { role: 'verifier' });
  parked(v.pre('AskUserQuestion', { questions: [{ question: 'Verdict PASS. Proceed to Phase 2 (complete and ship)?', options: [{ label: 'Proceed' }, { label: 'Stop' }] }, { question: 'Anything else?', options: [{ label: 'Yes' }, { label: 'No' }] }] }));
});

test('R8 a gate a person decided is answered with their answer, once, for that kind and TOR only', (t) => {
  const h = referee(t);
  const q = `${E1.tors[1]} cannot be fully met: the CSV has no year. Recommendation: Fix now — small. How to proceed?`;
  const opts = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];
  parked(h.ask(q, opts));
  const file = path.join(h.state, 'gates', `${E1.id}-1.json`);
  fs.writeFileSync(file, JSON.stringify({ ...readJson(file), decided: { answer: 'Fix now', by: 'Todd', date: '2026-11-12', scope: 'next-run' } }));
  parked(h.ask(q.replace(E1.tors[1], E1.tors[2]), opts)); // another TOR: not covered
  answered(h.ask(q, opts), q, 'Fix now');
  assert.deepEqual([readJson(file).decided.used.run, readJson(file).decided.used.session], [path.basename(h.runDir), 'build-1']);
  parked(h.ask(q, opts)); // and only once
});

test('R8 decided gates: an unmatched question is matched on its recorded text; a void or superseded gate never answers', (t) => {
  const h = referee(t);
  const q = 'The spec names both a monthly and a weekly budget period. Which should this epic build?';
  parked(h.ask(q, ['Monthly', 'Weekly']));
  const file = path.join(h.state, 'gates', `${E1.id}-1.json`);
  const decided = { ...readJson(file), decided: { answer: 'Weekly', by: 'Pat', date: '2026-11-12', scope: 'next-run' } };
  assert.equal(decided.kind, 'unmatched');

  fs.writeFileSync(file, JSON.stringify({ ...decided, void: { why: 'the branch moved' } }));
  parked(h.ask(q, ['Monthly', 'Weekly']));
  fs.rmSync(path.join(h.state, 'gates', `${E1.id}-2.json`));
  fs.writeFileSync(file, JSON.stringify({ ...decided, superseded: { run: 'x' } }));
  parked(h.ask(q, ['Monthly', 'Weekly']));
  fs.rmSync(path.join(h.state, 'gates', `${E1.id}-2.json`));

  fs.writeFileSync(file, JSON.stringify(decided));
  parked(h.ask('Which colour should the bars be?', ['Monthly', 'Weekly'])); // another unmatched question: not covered
  answered(h.ask(`  ${q.toUpperCase()}`, ['Monthly', 'Weekly']), `  ${q.toUpperCase()}`, 'Weekly'); // same text, spacing and case aside
  assert.equal(readJson(file).decided.used.session, 'build-1');
  parked(h.ask(q, ['Monthly', 'Weekly'])); // once
});

test('R8 human-check: the verify session the driver resumes answers the manual-verification question with the owner\'s recorded look', (t) => {
  const v = referee(t, { role: 'verifier' });
  const q = 'Did you perform any manual verification beyond the automated gates I ran?';
  const opts = ['Yes — I performed manual verification', 'No — only automated gates were run'];
  answered(v.ask(q, opts), q, 'No — only automated gates were run'); // no look recorded: the policy answer, which is true
  fs.writeFileSync(path.join(v.step, 'step.json'), JSON.stringify({ look: { gate: 'gates/x-1.json', by: 'Pat Owner', date: '2026-11-12', note: 'labels readable', branchTip: 'abcdef0123456789', artifacts: ['clone:tests/manual/TOR-05-Vw8Kp2d.md'] } }));
  const r = v.ask(q, opts);
  assert.deepEqual(r.out.hookSpecificOutput.updatedInput.answers, { [q]: 'Yes — I performed manual verification' });
  assert.match(r.out.hookSpecificOutput.updatedInput.annotations[q].notes, /^Recorded by autopilot from the owner's decision, not typed in this session: Pat Owner looked at clone:tests\/manual\/TOR-05-Vw8Kp2d\.md on 2026-11-12 \(branch tip abcdef012\) and answered "Looks right" — "labels readable"\./);
  assert.match(r.out.hookSpecificOutput.permissionDecisionReason, /the owner's recorded decision/);
  parked(v.ask(q, ['Maybe', 'Skip'])); // neither the look's "Yes" nor the policy's "No" is offered
});

test('workspace layout: the jail covers everything but clone/, in this run and every other; hooks read the current run', (t) => {
  const h = referee(t, { config: { diskFloorGb: 0 } });
  const older = path.join(h.state, 'runs', '20261110-220500');
  fs.mkdirSync(path.join(older, 'epics', E1.id, 'build-1'), { recursive: true });
  fs.writeFileSync(path.join(older, 'report.md'), 'an earlier run');
  for (const f of [path.join(older, 'report.md'), path.join(older, 'epics', E1.id, 'build-1', 'stream.jsonl'), path.join(h.runDir, 'autopilot.log'), path.join(h.step, 'plan.md'), path.join(h.state, 'current'), path.join(h.state, 'lock'), path.join(h.state, 'gates', `${E1.id}-1.json`)]) {
    denied(h.pre('Read', { file_path: f }), 'R2', /autopilot workspace/, f);
    denied(h.pre('Write', { file_path: f, content: 'x' }), 'R2', /autopilot workspace/, f);
    denied(h.bash(`cat ${f}`), 'R2', undefined, f);
  }
  denied(h.pre('Glob', { pattern: '**/*.json', path: path.join(h.state, 'runs') }), 'R2');
  denied(h.bash('ls ../runs ../gates'), 'R2');
  passes(h.pre('Read', { file_path: path.join(h.state, 'clone', 'README.md') }), 'the clone is the one way in');

  // The run is found from AUTOPILOT_RUN, or from the workspace's `current` file without it.
  fs.writeFileSync(path.join(h.runDir, 'state.json'), JSON.stringify({ integration: 'develop', queue: [{ id: E1.id, name: 'CSV import (from state.json)' }] }));
  parked(h.ask('Which colour?', ['Red', 'Blue'], { AUTOPILOT_RUN: '' }));
  assert.deepEqual([h.gate(1).epicName, h.gate(1).run], ['CSV import (from state.json)', path.basename(h.runDir)]);
});

test('R9 planner: ExitPlanMode saves and lints the plan, then ends the session', (t) => {
  const h = referee(t, { role: 'planner' });
  passes(h.pre('EnterPlanMode', {}), 'planner may plan');
  const plan = planText(E1);
  const r = h.pre('ExitPlanMode', { plan });
  denied(r, 'R9', /plan captured and approved by lint, not by a person/);
  assert.equal(r.out.continue, false);
  assert.equal(r.out.stopReason, 'autopilot: plan captured');
  assert.equal(fs.readFileSync(path.join(h.step, 'plan.md'), 'utf8'), plan);
  assert.equal(readJson(path.join(h.step, 'plan-lint.json')).pass, true);
  assert.equal(fs.existsSync(path.join(h.state, 'gates')), false);
});

test('R9 planner: a plan missing a TOR ID or a closing step parks with the plan attached', (t) => {
  const h = referee(t, { role: 'planner' });
  const r = h.pre('ExitPlanMode', { plan: planText({ ...E1, tors: E1.tors.slice(1) }, { omit: ['reconcile'] }) });
  denied(r, 'R9', new RegExp(`plan lint failed: does not name anchor ${E1.tors[0]}; missing "Reconcile spec"`));
  assert.equal(r.out.stopReason, 'autopilot: parked at human gate');
  assert.equal(h.gate(1).kind, 'plan-lint');
  assert.deepEqual(h.gate(1).options, ['Approve this plan', 'Re-plan']); // decidable: the next run builds it or plans again
  assert.deepEqual(h.gate(1).artifacts, [`runs/${path.basename(h.runDir)}/epics/${E1.id}/plan-1/plan.md`]);
  assert.equal(readJson(path.join(h.step, 'plan-lint.json')).pass, false);
  denied(h.pre('ExitPlanMode', {}), 'R9', /no plan text/);
});

test('R9 builder and verifier may not enter or exit plan mode', (t) => {
  for (const role of ['builder', 'verifier']) {
    const h = referee(t, { role });
    for (const tool of ['EnterPlanMode', 'ExitPlanMode']) {
      const r = h.pre(tool, { plan: planText(E1) });
      denied(r, 'R9', /already-approved plan/);
      assert.equal(r.out.continue, undefined, 'the session carries on');
    }
    assert.equal(fs.existsSync(path.join(h.step, 'plan.md')), false);
  }
});

test('pretool logs every decision to hooks.jsonl, has no opinion outside autopilot, and fails closed', (t) => {
  const h = referee(t);
  h.bash('ls');
  h.pre('Bash', { command: 'git push' }, {});
  const log = h.hooksLog();
  assert.deepEqual(log.map((l) => [l.tool_name, l.rule, l.decision]), [['Bash', null, 'pass'], ['Bash', 'R3', 'deny']]);
  assert.equal(log[1].tool_input.command, 'git push');
  passes(h.bash('git push', { AUTOPILOT_STATE: '' }), 'not an autopilot session');
  denied(h.run('pretool.mjs', 'not json'), 'R0', /failing closed/);
});

test('stop hook: refuses to end with background work running, then lets a second identical stop through', (t) => {
  const h = referee(t, { role: 'verifier' });
  const tasks = [{ id: 'bg1', type: 'shell', status: 'running', description: 'npm run dev', command: 'npm run dev' }];
  const first = h.run('stop.mjs', { hook_event_name: 'Stop', stop_hook_active: false, background_tasks: tasks, last_assistant_message: 'done' });
  assert.equal(first.out.decision, 'block');
  assert.match(first.out.reason, /wait for npm run dev or stop it; autopilot does not end with work running/);
  assert.equal(fs.readFileSync(path.join(h.step, 'last-message.txt'), 'utf8'), 'done');
  assert.equal(h.run('stop.mjs', { hook_event_name: 'Stop', stop_hook_active: true, background_tasks: tasks }).out, null);
  assert.deepEqual(h.hooksLog().map((l) => l.decision), ['block', 'allow-with-work-running']);
  assert.equal(h.run('stop.mjs', { hook_event_name: 'Stop', stop_hook_active: false, background_tasks: [] }).out, null);
});

test('stop hook, builder: blocks once until the sidecar is Implemented or a gate was written', (t) => {
  const h = referee(t);
  const stop = () => h.run('stop.mjs', { hook_event_name: 'Stop', stop_hook_active: false, background_tasks: [] });
  const first = stop();
  assert.equal(first.out.decision, 'block');
  assert.match(first.out.reason, /finish the plan's closing steps/);
  assert.equal(stop().out, null, 'a second stop is always allowed');

  const done = referee(t);
  const sidecar = path.join(done.clone, 'docs', 'implementation-plan', 'status', `epic-${E1.id}.md`);
  fs.writeFileSync(sidecar, fs.readFileSync(sidecar, 'utf8').replace('status: Not Started', 'status: Implemented'));
  assert.equal(done.run('stop.mjs', { hook_event_name: 'Stop', background_tasks: [] }).out, null);

  const gated = referee(t);
  gated.ask('Which colour?', ['Blue', 'Green']);
  assert.equal(gated.run('stop.mjs', { hook_event_name: 'Stop', background_tasks: [] }).out, null);
  const planner = referee(t, { role: 'planner' });
  assert.equal(planner.run('stop.mjs', { hook_event_name: 'Stop', background_tasks: [] }).out, null);
});

test('log hook appends one line per event; the config-change hook blocks settings changes', (t) => {
  const h = referee(t);
  const r = h.run('log.mjs', { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't1', agent_id: 'a1', agent_type: 'general-purpose', tool_input: { command: 'ls' }, tool_response: { stdout: 'x'.repeat(5000) } });
  assert.equal(r.code, 0); assert.equal(r.out, null);
  h.run('log.mjs', { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'false' }, error: 'exit 1' });
  const log = h.hooksLog();
  assert.deepEqual(log.map((l) => l.hook), ['PostToolUse', 'PostToolUseFailure']);
  assert.equal(log[0].agent_id, 'a1');
  assert.ok(log[0].tool_response.length < 2100);
  assert.equal(log[1].error, 'exit 1');
  assert.equal(h.run('log.mjs', 'not json').code, 0);
  const c = h.run('config-change.mjs', { hook_event_name: 'ConfigChange', source: 'project_settings', file_path: '.claude/settings.json' });
  assert.equal(c.out.decision, 'block');
  assert.equal(h.hooksLog().at(-1).hook, 'ConfigChange');
});
