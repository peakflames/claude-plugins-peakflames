// Referee hooks (autopilot-poc-plan.md §10 P2): fixture hook input is piped to each hook's stdin
// and the stdout JSON and exit code are asserted. No model is called.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PLUGIN_DIR } from '../driver.mjs';
import { offeredLabel } from '../hooks/pretool.mjs';
import { isTestPath, standingAnswer, testNamed, testNamedDirs } from '../lib.mjs';
import { E1, git, makeProject, planText, readJson } from './helpers.mjs';

const HOOKS = path.join(PLUGIN_DIR, 'scripts', 'autopilot', 'hooks');
const UID = process.getuid();
const Q_START = `Start Epic ${E1.id} (${E1.slug}) — CSV import? Phase 1 — Core, planned by Todd Schavey on 2026-11-11`;
const START_OPTS = ['Start it', 'Show me the ready epics instead', 'Stop'];

/** A workspace as the driver leaves it mid-run: private clone, a run with state.json, one step directory. */
function referee(t, { role = 'builder', branch = E1.branch, config = {}, sandbox = false, seed = null } = {}) {
  const p = makeProject(t, { config });
  if (seed) { seed(p.project); git(p.project, 'add', '-A'); git(p.project, 'commit', '-q', '-m', 'test: seed'); }
  git(p.project, 'clone', '-q', '--no-hardlinks', '--branch', 'develop', p.project, p.clone);
  git(p.clone, 'remote', 'remove', 'origin');
  if (branch !== 'develop') git(p.clone, 'checkout', '-q', '-b', branch);
  const runDir = p.mockRun();
  if (sandbox) fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({ ...readJson(path.join(runDir, 'state.json')), sandbox: true })); // strict: the read jail too
  const step = path.join(runDir, 'epics', E1.id, `${role === 'planner' ? 'plan' : role === 'verifier' ? 'verify' : 'build'}-1`);
  const scratch = path.join(step, 'scratch');
  fs.mkdirSync(scratch, { recursive: true });
  const env = { ...process.env, AUTOPILOT_STATE: p.state, AUTOPILOT_RUN: runDir, AUTOPILOT_STEP: step, AUTOPILOT_ROLE: role, AUTOPILOT_EPIC: E1.id, AUTOPILOT_SCRATCH: scratch };
  const run = (hook, input, extraEnv = {}) => {
    const r = spawnSync(process.execPath, [path.join(HOOKS, hook)], { input: typeof input === 'string' ? input : JSON.stringify({ session_id: 's', cwd: p.clone, permission_mode: 'acceptEdits', ...input }), encoding: 'utf8', env: { ...env, ...extraEnv } });
    return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null, stderr: r.stderr };
  };
  const pre = (tool_name, tool_input, extraEnv) => run('pretool.mjs', { hook_event_name: 'PreToolUse', tool_name, tool_input }, extraEnv);
  const bash = (command, extraEnv) => pre('Bash', { command }, extraEnv);
  const ask = (question, options, extraEnv) => pre('AskUserQuestion', { questions: [{ question, header: 'Gate', multiSelect: false, options: options.map((label) => ({ label, description: '' })) }] }, extraEnv);
  const hooksLog = () => fs.readFileSync(path.join(step, 'hooks.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { ...p, runDir, step, scratch, run, pre, bash, ask, hooksLog, gate: (n) => readJson(path.join(p.state, 'gates', `${E1.id}-${n}.json`)) };
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

test('sandbox on — R2 path jail: file tools stay in the clone; state, home and system files are denied', (t) => {
  const h = referee(t, { sandbox: true });
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
  passes(h.pre('Read', { file_path: path.join(os.homedir(), '.claude', 'projects', 'x', 'abc', 'tool-results', 'b1.txt') }), 'read a saved tool output');
  passes(h.pre('Write', { file_path: path.join(os.homedir(), '.claude', 'plans', 'a-plan.md'), content: 'x' }), 'write plan file');
  passes(h.pre('Write', { file_path: `/tmp/claude-${UID}/scratch.txt`, content: 'x' }), 'write sandbox temp');
});

test('R2 scratch folder: a session writes temporary files in its step\'s scratch folder, with the sandbox on or off; the rest of the workspace stays closed', (t) => {
  for (const sandbox of [false, true]) {
    const h = referee(t, { sandbox });
    passes(h.pre('Write', { file_path: path.join(h.scratch, 'chk.json'), content: '{}' }), `write, sandbox ${sandbox}`);
    passes(h.pre('Read', { file_path: path.join(h.scratch, 'chk.json') }), 'read');
    passes(h.bash('node --test > "$AUTOPILOT_SCRATCH/out.txt" 2>&1'), 'redirect by name');
    passes(h.bash(`mkdir -p ${h.scratch}/probe && cp src/index.js ${h.scratch}/probe/`), 'absolute path');
    passes(h.bash('cd "$AUTOPILOT_SCRATCH" && ls'), 'cd');
    // Nothing else in the workspace opens with it, by name or by climbing out.
    denied(h.pre('Write', { file_path: path.join(h.step, 'hooks.jsonl'), content: 'x' }), 'R2', /autopilot workspace/);
    denied(h.pre('Read', { file_path: path.join(h.step, 'step.json') }), 'R2', /autopilot workspace/);
    denied(h.bash('cat "$AUTOPILOT_SCRATCH/../step.json"'), 'R2', /autopilot workspace/);
    denied(h.bash('echo x > "${AUTOPILOT_SCRATCH}/../../../../state.json"'), 'R2', /autopilot workspace/);
    denied(h.bash('cat "${AUTOPILOT_SCRATCH%/scratch}/step.json"'), 'R2', /as it is/);
    denied(h.bash('S=$AUTOPILOT_SCRATCH; cat $S/../step.json'), 'R2', /as it is/);
    denied(h.bash('D="${AUTOPILOT_SCRATCH}/.." && ls $D'), 'R2', /as it is/);
    // A link out of the scratch folder is judged by where it leads.
    fs.symlinkSync(h.state, path.join(h.scratch, 'ws'));
    denied(h.pre('Write', { file_path: path.join(h.scratch, 'ws', 'STOP'), content: '' }), 'R2', /autopilot workspace/);
  }
  // A refused write says where temporary files go.
  const h = referee(t, { sandbox: true });
  denied(h.pre('Write', { file_path: '/tmp/chk.json', content: '{}' }), 'R2', /Write temporary files in .*scratch.*\$AUTOPILOT_SCRATCH/);
  denied(h.bash('echo x > ~/chk.json'), 'R2');
  const off = referee(t);
  denied(off.bash('echo x > ~/chk.json'), 'R2', /Write temporary files in .*scratch/);
  denied(off.pre('Write', { file_path: path.join(os.homedir(), 'chk.json'), content: '{}' }), 'R2', /Write temporary files in .*scratch/);
  // The auditor only reads: it has no scratch folder.
  const a = referee(t, { role: 'auditor' });
  denied(a.pre('Write', { file_path: path.join(a.scratch, 'x.txt'), content: 'x' }), 'R2');
  denied(a.pre('Read', { file_path: path.join(a.scratch, 'x.txt') }), 'R2');
});

test('R2 scratch folder: printing its name, an option or quoted code is not a copy; a real assignment still is (Pilot Light, 2026-11-22/23)', (t) => {
  const h = referee(t);
  // Refused live, and nothing was copied: the final check's first command, an option, a line of Python.
  passes(h.bash('git remote; echo "scratch=$AUTOPILOT_SCRATCH"'), 'echo text');
  passes(h.bash('git status --short && git branch --show-current && echo "SCRATCH=$AUTOPILOT_SCRATCH"'), 'echo text after other commands');
  passes(h.bash("echo 'AUTOPILOT_SCRATCH=' \"$AUTOPILOT_SCRATCH\""), 'single-quoted text');
  passes(h.bash('node tools/shot.js --filename="$AUTOPILOT_SCRATCH/s01-320.png"'), 'an option');
  passes(h.bash(`python3 -I -c "import json;d=json.load(open('$AUTOPILOT_SCRATCH/states.json'));print(d)"`), 'quoted code');
  // Copies into a variable, which a later command could cut down: still refused, at the start of any command.
  for (const c of [
    'S="$AUTOPILOT_SCRATCH" && cat "$S/run-head.ts"',
    'F="$AUTOPILOT_SCRATCH/fresh" && mkdir -p "$F"',
    'export S=$AUTOPILOT_SCRATCH',
    'OUT="$AUTOPILOT_SCRATCH" node tools/shot.js',
    'ls; (CONTROL="${AUTOPILOT_SCRATCH}/control.json" node a.js)',
    'x=$(S=$AUTOPILOT_SCRATCH; echo $S)',
  ]) denied(h.bash(c), 'R2', /as it is: do not copy it into a variable/, c);
});

test('Bash: the body of a quoted heredoc is text, not commands; a body for a shell is still read (Pilot Light, 2026-11-23)', (t) => {
  const h = referee(t);
  const hd = (head, body, delim = 'EOF', tail = '') => `${head}\n${body}\n${delim}${tail}`;
  // Refused live: a table cell `kind` read as the container tool, a test import read as a path in the workspace.
  passes(h.bash(hd("python3 - <<'EOF'", "s='''| `kind` | e.g. audit |\n| `gh` | sudo docker |'''\nopen('docs/x.md','w').write(s)")), 'markdown in a Python heredoc');
  passes(h.bash(hd("python3 - <<'EOF'", "s=s.replace('a','import { c } from \"../support/control\";')")), 'a relative path in a string');
  passes(h.bash(hd("cat > docs/n.md <<'EOF'", 'run `docker ps` and `sudo ls`', 'EOF', '\ngit status')), 'cat to a file');
  passes(h.bash(hd('cat <<-"EOT"', '\tgh issue', '\tEOT')), 'a double-quoted, indented delimiter');
  // Still read: a command before or after the body, a shell that runs the body, an unquoted body, a redirect on the header, a body never closed.
  denied(h.bash(hd("python3 - <<'EOF'", 'print(1)', 'EOF', '\ndocker ps')), 'R4', null, 'command after the body');
  denied(h.bash(hd("docker ps && python3 - <<'EOF'", 'print(1)')), 'R4', null, 'command before the body');
  denied(h.bash(hd("bash <<'EOF'", 'sudo ls')), 'R4', null, 'body run by a shell');
  denied(h.bash(hd("sh <<'EOF'", 'docker ps')), 'R4', null, 'body run by sh');
  denied(h.bash(hd('python3 - <<EOF', '$(docker ps)')), 'R4', null, 'unquoted body expands');
  denied(h.bash(hd("cat > ../outside.md <<'EOF'", 'x')), 'R2', null, 'redirect target on the header line');
  denied(h.bash("python3 - <<'EOF'\nx\n; docker ps"), 'R4', null, 'never closed');
});

test('R2 files CLAUDE.md names: a listed file outside the clone is read and run, never written; its neighbours stay closed', (t) => {
  for (const sandbox of [false, true]) {
    const h = referee(t, { sandbox });
    const home = path.join(h.tmp, 'home'); const HOME = { HOME: home, TMPDIR: path.join(h.tmp, 'tmp') }; // the fake home must not count as a temp directory
    fs.mkdirSync(path.join(home, '.claude', 'scripts'), { recursive: true });
    const tether = path.join(home, '.claude', 'scripts', 'tethered.mjs'); const other = path.join(home, '.claude', 'scripts', 'other.mjs');
    for (const f of [tether, other, path.join(home, '.claude', 'settings.json')]) fs.writeFileSync(f, 'x');
    denied(h.pre('Read', { file_path: tether }, HOME), 'R2', undefined, `not listed yet, sandbox ${sandbox}`);
    denied(h.bash('node ~/.claude/scripts/tethered.mjs start', HOME), 'R2');
    const stateFile = path.join(h.runDir, 'state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ ...readJson(stateFile), readFiles: [tether] }));
    passes(h.pre('Read', { file_path: tether }, HOME), 'read');
    passes(h.bash('node ~/.claude/scripts/tethered.mjs start -- npm run dev', HOME), 'run');
    denied(h.pre('Edit', { file_path: tether, old_string: 'x', new_string: 'y' }, HOME), 'R2', /read-only/);
    denied(h.bash('echo x > ~/.claude/scripts/tethered.mjs', HOME), 'R2');
    denied(h.pre('Read', { file_path: other }, HOME), 'R2');
    denied(h.pre('Read', { file_path: path.join(home, '.claude', 'settings.json') }, HOME), 'R2');
    denied(h.bash('ls ~/.claude/scripts', HOME), 'R2');
  }
});

test('sandbox on — R2 path jail: a symlink out of the clone is resolved and denied', (t) => {
  const h = referee(t, { sandbox: true });
  const outside = path.join(h.tmp, 'outside');
  fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret.txt'), 's');
  fs.symlinkSync(outside, path.join(h.clone, 'link'));
  denied(h.pre('Read', { file_path: path.join(h.clone, 'link', 'secret.txt') }), 'R2', /outside the private clone/);
  denied(h.pre('Write', { file_path: 'link/new.txt', content: 'x' }), 'R2');
  denied(h.bash('cat link/../../outside/secret.txt'), 'R2');
});

test('sandbox on — R2 path jail: Bash absolute paths, cd targets and git -C are checked (best effort)', (t) => {
  const h = referee(t, { sandbox: true });
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
  const h = referee(t, { sandbox: true });
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

test('R2 with the sandbox off (the default): a session reads anywhere but private places, and writes only in the clone and the temp directories', (t) => {
  const h = referee(t);
  const home = os.homedir();
  // Reads: the machine is open — system files, the home directory, a dependency cache, the owner's project.
  passes(h.pre('Read', { file_path: '/etc/hosts' }), 'system file');
  passes(h.pre('Glob', { pattern: '*', path: home }), 'home');
  passes(h.pre('Read', { file_path: path.join(home, '.nuget', 'packages', 'x', 'lib.xml') }), 'dependency cache, undeclared');
  passes(h.pre('Read', { file_path: path.join(h.project, 'README.md') }), 'the project');
  passes(h.bash('ls ~/.nuget/packages/ | head; cat /etc/hosts; ls ~/Documents'), 'bash reads');
  // …except credentials, Claude Code's own data and the autopilot workspace.
  denied(h.pre('Read', { file_path: path.join(home, '.ssh', 'id_rsa') }), 'R2', /credentials/);
  denied(h.bash('cat "$HOME/.aws/credentials"'), 'R2', /credentials/);
  denied(h.pre('Read', { file_path: path.join(home, '.claude', 'settings.json') }), 'R2', /Claude Code's own data/);
  denied(h.pre('Read', { file_path: path.join(home, '.claude.json') }), 'R2', /Claude Code's own data/);
  denied(h.pre('Read', { file_path: path.join(home, '.claude', 'projects', 'x', 'transcript.jsonl') }), 'R2');
  passes(h.pre('Read', { file_path: path.join(home, '.claude', 'projects', 'x', 'memory', 'MEMORY.md') }), 'memory stays readable');
  passes(h.pre('Read', { file_path: path.join(home, '.claude', 'projects', 'x', 'abc', 'tool-results', 'b1.txt') }), 'a long tool output saved by Claude Code');
  passes(h.bash(`tail -15 ${home}/.claude/projects/x/abc/tool-results/b1.txt`), 'and by Bash');
  denied(h.pre('Read', { file_path: path.join(h.runDir, 'state.json') }), 'R2', /autopilot workspace/);
  denied(h.bash(`cat ${h.runDir}/config.json`), 'R2', /autopilot workspace/);
  // Writes: the clone and temp.
  passes(h.pre('Write', { file_path: path.join(h.clone, 'src', 'new.js'), content: 'x' }), 'clone');
  passes(h.pre('Write', { file_path: path.join(os.tmpdir(), 'scratch.txt'), content: 'x' }), 'temp');
  passes(h.bash('mkdir -p out && echo hi > out/a.txt && rm -rf out && cp src/index.js /tmp/x.js 2>/dev/null'), 'writes in the clone and /tmp');
  passes(h.bash('cd /tmp && ls'), 'cd to temp');
  denied(h.pre('Write', { file_path: path.join(home, 'notes.txt'), content: 'x' }), 'R2', /read-only for this session/);
  denied(h.pre('Edit', { file_path: path.join(h.project, 'README.md'), old_string: 'a', new_string: 'b' }), 'R2', /read-only for this session/);
  denied(h.pre('Write', { file_path: path.join(h.state, 'settings.json'), content: '{}' }), 'R2', /autopilot workspace/);
  denied(h.pre('Edit', { file_path: path.join(h.clone, '.git', 'config'), old_string: 'a', new_string: 'b' }), 'R2', /\.git/);
  // Bash: what a command visibly writes must be writable; where it goes, its writes follow.
  denied(h.bash('echo hi > ~/notes.txt'), 'R2', /writes only inside it/);
  denied(h.bash(`echo hi > ${h.project}/x.txt`), 'R2', /writes only inside it/);
  denied(h.bash('rm -rf ~/Documents/old'), 'R2', /writes only inside it/);
  denied(h.bash('cp src/index.js ~/Desktop/'), 'R2', /writes only inside it/);
  denied(h.bash('mkdir -p ~/scratch && touch ~/scratch/a'), 'R2', /writes only inside it/);
  denied(h.bash('sed -i "" s/a/b/ /etc/hosts'), 'R2', /writes only inside it/);
  passes(h.bash("f=src/index.js && sed -i '' -e 's/public sealed class A(HttpClient http)/x/' -e '/global using MsLogging/d' $f"), 'a sed script is not a path (seen live)');
  passes(h.bash("sed -i '' -e '/^import/d' src/index.js && perl -pi -e 's/a/b/' src/index.js"), 'in-place edits inside the clone');
  denied(h.bash(`sed -i '' -e '/x/d' ${h.project}/README.md`), 'R2', /writes only inside it/);
  denied(h.bash('cd ~/Documents && rm -rf old'), 'R2', /cd target/);
  passes(h.bash("cd ~/.nuget/packages/x/lib && ls; f=$(ls */X.xml | tail -1); grep -o 'T:X[^\"]*' $f | head 2>/dev/null"), 'cd somewhere readable only to look (seen live)');
  denied(h.bash('cd ~/Documents && echo hi > note.txt'), 'R2', /cd target/);
  // The directory follows each cd: a relative path is judged from where the command then is.
  passes(h.bash(`cd ${h.clone}/src && cat > New.js <<'EOF'\nexport const a = 1;\nEOF\ncd .. && node --test`), 'cd down, write, cd back up (seen live)');
  passes(h.bash('cd src && ls ../README.md && cd .. && ls'), 'relative climbs that stay in the clone');
  denied(h.bash('cd src && cd ../.. && ls'), 'R2', /cd target|autopilot workspace/);
  denied(h.bash('cd /tmp && echo x > ../etc/hosts'), 'R2');
  denied(h.bash('cd ~/.ssh && ls'), 'R2', /credentials/);
  denied(h.bash(`git -C ${h.project} commit -m y`), 'R2', /git target/);
  denied(h.bash('ls "$AUTOPILOT_STATE/gates"'), 'R2', /may not name/);
  // A link out of the clone is still seen for what it is.
  fs.symlinkSync(home, path.join(h.clone, 'link'));
  denied(h.pre('Write', { file_path: 'link/new.txt', content: 'x' }), 'R2', /read-only/);
  denied(h.bash('echo x > link/new.txt'), 'R2', /writes only inside it/);
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
  // `git stash push` keeps work on this machine: it is not a push. A push after it in the same command still is.
  passes(h.bash('git stash push -m wip'), 'git stash push');
  denied(h.bash('git stash push -m wip && git push'), 'R3', /git push is denied/);
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
  // Seen live, twice: the branch held in a variable set in the same command.
  passes(h.bash(`B=${E1.branch} && git checkout -q develop && git merge $B --no-ff -q -m "epic: merge $B"`), 'the branch in a variable');
  passes(h.bash(`B=${E1.branch}; git merge --no-ff "\${B}"`), 'braces and quotes');
  passes(h.bash(`B=${E1.branch} && git checkout -q develop && git merge $B --no-ff -m "epic: merge $B" && git branch -d $B && git log --oneline -3`), 'merge and delete, as a verifier writes it');
  denied(h.bash('B=feature/epic-Lg2Cat4-categorize && git branch -d $B'), 'R3', /only for this epic's branch/);
  denied(h.bash('B=feature/epic-Lg2Cat4-categorize && git merge --no-ff $B'), 'R3', /one branch, named in the command, with --no-ff/, 'another epic, variable or not');
  denied(h.bash(`B=${E1.branch}; B=main; git merge --no-ff $B`), 'R3', null, 'a name set twice stands for nothing');
  denied(h.bash('git merge --no-ff $B'), 'R3', null, 'a name set nowhere');
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

test('which files are tests: by name where tests sit beside the code, the whole directory where none is test-named', () => {
  for (const f of ['src/a.test.ts', 'src/a.spec.tsx', 'pkg/a_test.go', 'tests/unit/helper.py', 'app/test_a.py', 'src/__tests__/a.js', 'App.Tests/Foo.cs', 'src/FooTests.cs', 'e2e/login.ts', 'features/a.feature',
    'app/tests.py', 'test.js', 'src/FooTest.php', 'src/TestFoo.java', 'src/FooIT.java', 'src/login.cy.ts', 'src/FooTests.ts', 'src/foo.test.js.snap', 'spec/a_spec.rb', 'src/FooSpec.kt', 'my_tests/a.py']) assert.ok(testNamed(f), f);
  for (const f of ['src/App.tsx', 'src/api/smartsheet.ts', 'packages/core/summarizeRoadmap.ts', 'src/latest.ts', 'src/contest.py', 'src/Attests.md',
    'src/PodSpec.java', 'src/CustomerSpec.cs', 'docs/openapi-spec.yaml', 'src/ab-test/variant.ts', 'src/Testing.java', 'src/protest.js', 'src/AUDIT.java']) assert.ok(!testNamed(f), f);
  const dirs = ['src/', 'test/', 'Checks/'];
  const named = testNamedDirs(['src/App.tsx', 'src/App.test.tsx', 'test/smoke.js', 'test/helpers.js', 'Checks/Ledger.cs', 'Checks/Checks.csproj'], dirs);
  assert.deepEqual([...named], ['src/', 'test/']);
  assert.equal(isTestPath('src/App.tsx', dirs, named), false, 'production code beside the tests');
  assert.equal(isTestPath('src/App.test.tsx', dirs, named), true);
  assert.equal(isTestPath('test/helpers.js', dirs, named), true, 'everything under a directory named for tests');
  assert.equal(isTestPath('Checks/Ledger.cs', dirs, named), true, 'no test-named file there: the whole directory counts');
  assert.equal(isTestPath('Checks/Checks.csproj', dirs, named), false, 'a manifest');
  assert.equal(isTestPath('lib/a.test.js', dirs, named), false, 'outside the listed directories');
});

test('R7 test integrity: where tests sit beside the code, only the tests need a reason (issue #41 B2)', (t) => {
  const h = referee(t, { seed: (project) => {
    const md = path.join(project, 'CLAUDE.md');
    fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('**Test directories:** test/', '**Test directories:** test/, src/'));
    fs.writeFileSync(path.join(project, 'src', 'index.test.js'), "import test from 'node:test';\ntest('passes', () => {});\n");
    fs.writeFileSync(path.join(project, 'test', 'package.json'), '{"type":"module"}\n');
  } });
  passes(h.pre('Edit', { file_path: path.join(h.clone, 'src', 'index.js'), old_string: 'a', new_string: 'b' }), 'production code in a listed directory');
  passes(h.bash('rm src/index.js'), 'production code in a listed directory (Bash)');
  denied(h.pre('Edit', { file_path: 'src/index.test.js', old_string: 'a', new_string: 'b' }), 'R7', /src\/index\.test\.js is an existing test/);
  denied(h.pre('Edit', { file_path: 'test/smoke.test.js', old_string: 'a', new_string: 'b' }), 'R7');
  passes(h.pre('Write', { file_path: 'test/package.json', content: '{}' }), 'a manifest under a test directory');
});

test('R7 test integrity: the epic that brings the first test beside the code is held to the same rule at once', (t) => {
  const h = referee(t, { seed: (project) => {
    const md = path.join(project, 'CLAUDE.md');
    fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('**Test directories:** test/', '**Test directories:** src/'));
  } });
  // Nothing under src/ is test-named yet: the whole directory counts, as before.
  denied(h.pre('Edit', { file_path: 'src/index.js', old_string: 'a', new_string: 'b' }), 'R7');
  fs.writeFileSync(path.join(h.clone, 'src', 'index.test.js'), "import test from 'node:test';\ntest('passes', () => {});\n");
  passes(h.pre('Edit', { file_path: 'src/index.js', old_string: 'a', new_string: 'b' }), 'once the epic has a test there, production code is production code');
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
  // Seen live: the empty word of macOS `sed -i ''` was read as a path, the test directory itself, and a reason was asked for a directory.
  passes(h.bash("cd test && sed -i '' 's/a/b/' smoke.test.js"), "sed -i '' on a file with a reason");
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
    [`${E1.tors[0]} is CANNOT VERIFY: no test exercises the When. Recommendation: Fix now — small. How to proceed?`, ['Fix now', 'Defer — depends on a later epic', 'Stop — epic FAILs'], 'Stop — epic FAILs'], // a requirement nobody could judge is never settled by the verifier's own test
    // A failing gate the verifier recommends fixing is fixed on the owner's standing answer for small fixes.
    ['Tests failed: node --test: 2 failing. Recommendation: Fix now — one assertion. How to proceed?', ['Fix now', 'Stop — epic FAILs'], 'Fix now'],
    ['Lint failed: 1 error. Recommendation: Stop — it needs a design change. How to proceed?', ['Fix now', 'Stop — epic FAILs'], 'Stop — epic FAILs'],
    ['Verdict PASS. Proceed to Phase 2 (complete and ship)?', ['Proceed', 'Stop'], 'Proceed'],
    // Run A: the verifier put the epic and the counts into the question; it is still Step 1.5.
    ['Epic Lg3Sum9 (monthly summary) verdict is PASS: 5/5 requirements pass and all 20 tests pass. Proceed to Phase 2 (complete and ship)?', ['Proceed', 'Stop'], 'Proceed'],
    ['Did you perform any manual verification beyond the automated gates I ran?', ['Yes — I performed manual verification', 'No — only automated gates were run'], 'No — only automated gates were run'],
    ['Ship mode — solo (merge locally to the base branch) or team (push the branch and open a pull request)?', ['Team — push and open PR', 'Solo — local merge only'], 'Solo — local merge only'],
    // The test a requirement lacks is added on the same standing answer (issue #41 B5); where the code is wrong (the first line) it stops.
    [E1.tors[1] + ' is FAIL: no test mirrors the Then; the code looks right. Recommendation: Fix now — one small test. How to proceed?', ['Fix now', 'Defer — depends on a later epic', 'Stop — epic FAILs'], 'Fix now'],
  ];
  for (const [q, opts, want] of cases) answered(h.ask(q, opts), q, want);
  // The fix for a requirement is marked as a test and nothing else; the merge gate holds it to that.
  assert.deepEqual(readJson(path.join(h.step, 'small-fixes.json')).map((x) => [x.tor, x.testOnly ?? false]), [[null, false], [E1.tors[1], true]]);
  parked(referee(t, { role: 'verifier' }).ask('TOR-09-Zzzzzz9 is FAIL: no test. Recommendation: Fix now. How to proceed?', ['Fix now', 'Stop — epic FAILs'])); // not this epic's requirement
  // A label typed with a plain hyphen still matches, and the answer is the label as offered.
  const q = 'Verdict PASS. Proceed to Phase 2 (complete and ship)?';
  answered(h.ask(cases[3][0], ['Fix now', 'Stop - epic FAILs']), cases[3][0], 'Stop - epic FAILs');
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

test('R8 a pre-approved answer still applies when the session shortened or padded the option; two options that fit is no match', (t) => {
  const v = referee(t, { role: 'verifier' });
  const q = 'Did you perform any manual verification of Epic X beyond the automated gates I ran?';
  // Seen live: the skill's option "No — only automated gates were run" was offered as "No — only automated gates", and a passing epic parked.
  answered(v.ask(q, ['No — only automated gates', 'Yes — I verified by hand']), q, 'No — only automated gates');
  answered(v.ask(q, ['Yes — I did', 'No — only automated gates were run by you']), q, 'No — only automated gates were run by you');
  assert.equal(offeredLabel(['Proceed with care', 'Proceed with caution'], 'Proceed'), undefined, 'one word is not enough to go on');
  assert.equal(offeredLabel(['No — only automated gates', 'No — only automated gates were'], 'No — only automated gates were run'), undefined, 'two options fit: no guess');
  assert.equal(offeredLabel(['Start it', 'Start it later'], 'Start it'), 'Start it', 'the same words win');
  assert.equal(offeredLabel(['No — only automated gatesmen'], 'No — only automated gates'), undefined, 'a word boundary, not a letter');
  parked(v.ask(q, ['No', 'Yes']));
  // The owner looked: an option that says so is used even reworded, and without one the policy "No" never stands in.
  fs.writeFileSync(path.join(v.step, 'step.json'), JSON.stringify({ look: { gate: 'gates/x-1.json', by: 'Pat Owner', date: '2026-11-12', branchTip: 'abcdef0123456789', artifacts: [] } }));
  parked(v.ask(q, ['No — only automated gates', 'Yes — I verified by hand']));
  assert.match(v.gate(2).why, /the owner looked at this build, and none of the options offered says a manual check was done/);
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

// ---- R8 in a prototype run (the run's `mode`) --------------------------------------------------

test('R8 prototype: takes "Amend" when offered and the recommended "Fix now" or "Defer", as a gate already decided; "Stop", no recommendation, no "Amend" and another epic\'s requirement park', (t) => {
  const h = referee(t, { config: { mode: 'prototype' } });
  const DEF = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];
  const defer = `${E1.tors[1]} cannot be fully met: the CSV has no year. Recommendation: Defer — the year comes with the export epic. How to proceed?`;
  const r = h.ask(defer, DEF);
  answered(r, defer, DEF[1]);
  assert.match(r.out.hookSpecificOutput.permissionDecisionReason, /^autopilot R8: answered from the owner's prototype setting for this run: Defer — depends on a later epic\. No person picked this just now.*do not ask which later epic/);
  const g = h.gate(1);
  assert.deepEqual([g.kind, g.tor, g.recommendation, g.question, g.session], ['deferral', E1.tors[1], 'Defer', defer, 'build-1']);
  assert.deepEqual([g.decided.answer, g.decided.by, g.decided.standing, g.decided.prototype, g.decided.used.session], [DEF[1], 'autopilot (prototype run)', true, true, 'build-1']);
  assert.deepEqual(h.hooksLog().at(-1).prototype, [{ kind: 'deferral', tor: E1.tors[1], answer: DEF[1], gate: `${E1.id}-1.json` }]);
  // Asked again by a later session: the same answer, and no second record.
  answered(h.ask(defer, DEF), defer, DEF[1]);
  assert.ok(!fs.existsSync(path.join(h.state, 'gates', `${E1.id}-2.json`)));
  // The skill's follow-up has no answer anyone can give: reminded once, then it is the owner's.
  const which = 'Which later epic creates the code this Then clause depends on?';
  denied(h.ask(which, ['Lg7Exp5 — Export', 'Another epic']), 'R8', /not put to the owner: this is a prototype run.*the one your recommendation named/);
  parked(h.ask(which, ['Lg7Exp5 — Export', 'Another epic']));

  const fix = `${E1.tors[2]} cannot be fully met: three decimals. Recommendation: **Fix now** — small. How to proceed?`;
  answered(h.ask(fix, DEF), fix, 'Fix now');
  // The fix did not work and the session now recommends stopping: that is a new question, and the owner's.
  const gaveUp = h.ask(fix.replace('**Fix now** — small', 'Stop — the fix is beyond this session'), DEF);
  parked(gaveUp);
  const amend = `${E1.tors[0]} — The tool shall import every row looks wrong: banks export a BOM. Proposed: skip the BOM. How to proceed?`;
  const AM = [`Amend ${E1.tors[0]} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];
  answered(h.ask(amend, AM), amend, AM[0]);
  assert.deepEqual([3, 5].map((n) => [h.gate(n).kind, h.gate(n).decided.prototype]), [['deferral', true], ['amendment', true]]);

  const parks = [
    [`${E1.tors[3]} cannot be fully met: x. Recommendation: Stop — beyond this session. How to proceed?`, DEF, /deferral is an owner decision; plan approval does not pre-authorize any deferral$/],
    [`${E1.tors[3]} cannot be fully met: x. How to proceed?`, DEF, /does not pre-authorize any deferral$/],
    [`${E1.tors[3]} — title looks wrong: y. Proposed: z. How to proceed?`, ['Implement as written', "Stop — I'll take it from here"], /only with the owner's approval$/], // Safety: no Amend on offer
    ['TOR-09-Zzzzzz9 cannot be fully met: x. Recommendation: Fix now — y. How to proceed?', DEF, /does not name one of this epic's own requirements/],
    [`How should ${E1.tors[3]} change?`, ['Amend requirement (owner-approved)', 'Record as pending', 'Back'], /only with the owner's approval$/],
  ];
  for (const [q, opts, why] of parks) { const out = h.ask(q, opts); parked(out); assert.match(out.out.hookSpecificOutput.permissionDecisionReason, why, q); }
  // Three were taken for this epic: a fourth, however well recommended, is the owner's.
  const fourth = h.ask(`${E1.tors[3]} cannot be fully met: x. Recommendation: Fix now — y. How to proceed?`, DEF);
  parked(fourth);
  assert.match(fourth.out.hookSpecificOutput.permissionDecisionReason, /covers 3 answers per epic/);
});

test('R8 prototype is the run\'s setting: without it the same questions park, and a prototype answer does not use up the standing answer for technical stops', (t) => {
  const h = referee(t);
  const defer = `${E1.tors[1]} cannot be fully met: the CSV has no year. Recommendation: Defer — a later epic. How to proceed?`;
  parked(h.ask(defer, ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"]));
  assert.equal(h.gate(1).decided, null);
  const gates = [{ epic: 'A', decided: { answer: 'x', standing: true, prototype: true } }, { epic: 'A', kind: 'plan-lint', options: ['Approve this plan', 'Re-plan'] }];
  assert.equal(standingAnswer(gates[1], gates, 1), 'Re-plan');
});

test('R8 prototype, final check: a deferral this run took is given the same answer; a requirement nobody will observe is not put to the owner', (t) => {
  const h = referee(t, { role: 'verifier', config: { mode: 'prototype' } });
  const OPTS = ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'];
  const q = (tor, rec = 'Defer — the row names Lg7Exp5') => `${tor} is FAIL: the export is not there. Recommendation: ${rec}. How to proceed?`;
  // Nothing was taken for this requirement: policy answers as in a full run.
  answered(h.ask(q(E1.tors[1]), OPTS), q(E1.tors[1]), 'Stop — epic FAILs');
  fs.mkdirSync(path.join(h.state, 'gates'), { recursive: true });
  fs.writeFileSync(path.join(h.state, 'gates', `${E1.id}-1.json`), JSON.stringify({ epic: E1.id, kind: 'deferral', tor: E1.tors[1], options: OPTS, decided: { answer: 'Defer — depends on a later epic', standing: true, prototype: true, used: {} } }));
  answered(h.ask(q(E1.tors[1]), OPTS), q(E1.tors[1]), 'Defer — depends on a later epic');
  answered(h.ask(q(E1.tors[1], 'Stop — the code is wrong'), OPTS), q(E1.tors[1], 'Stop — the code is wrong'), 'Stop — epic FAILs');
  assert.ok(!fs.existsSync(path.join(h.state, 'gates', `${E1.id}-2.json`)), 'no new record');

  fs.writeFileSync(path.join(h.step, 'step.json'), JSON.stringify({ unobserved: [{ tor: E1.tors[2], clauses: ['the user should see one bar'] }] }));
  const cv = `${E1.tors[2]} is CANNOT VERIFY: nobody looked at the chart. Recommendation: Stop — a person must look. How to proceed?`;
  denied(h.ask(cv, OPTS), 'R8', /not put to the owner: this is a prototype run and nobody will observe .*NOT OBSERVED — prototype run/);
  answered(h.ask(cv, OPTS), cv, 'Stop — epic FAILs');
});

test('R8 prototype: a Safety requirement is never amended or deferred, whatever the session offers; a different correction to an amended requirement is the owner\'s', (t) => {
  const safe = E1.tors[4]; // the last requirement of the seed, put under a Safety banner
  const h = referee(t, { config: { mode: 'prototype' }, seed: (project) => {
    const file = path.join(project, 'docs', 'requirements', fs.readdirSync(path.join(project, 'docs', 'requirements')).find((f) => f.startsWith('01-') && f.endsWith('.feature.md')));
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('# Duplicate Handling', '# Safety'));
  } });
  const DEF = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];
  const d = h.ask(`${safe} cannot be fully met: x. Recommendation: Defer — a later epic. How to proceed?`, DEF);
  parked(d);
  assert.match(d.out.hookSpecificOutput.permissionDecisionReason, /is a Safety requirement, which a prototype run never decides/);
  parked(h.ask(`${safe} — title looks wrong: y. Proposed: z. How to proceed?`, [`Amend ${safe} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"]));
  assert.deepEqual([h.gate(1).decided, h.gate(2).decided], [null, null]);

  const tor = E1.tors[0]; const AM = [`Amend ${tor} (owner approval)`, 'Implement as written', "Stop — I'll take it from here"];
  const a = `${tor} — title looks wrong: banks export a BOM. Proposed: skip the BOM. How to proceed?`;
  answered(h.ask(a, AM), a, AM[0]);
  answered(h.ask(a.replace('banks export a BOM', 'the files start with a BOM'), AM), a.replace('banks export a BOM', 'the files start with a BOM'), AM[0]); // the same proposal, reworded reason
  const other = h.ask(a.replace('skip the BOM', 'reject files with a BOM'), AM);
  parked(other);
  assert.match(other.out.hookSpecificOutput.permissionDecisionReason, /one answer per requirement/);
});

test('R8 the owner\'s own "Defer": answers the same question and the final check\'s; a session that now recommends something else is asking them again', (t) => {
  const DEF = ['Fix now', 'Defer — depends on a later epic', "Stop — I'll take it from here"];
  const q = (rec) => `${E1.tors[1]} cannot be fully met: the CSV has no year. Recommendation: ${rec}. How to proceed?`;
  const decideDefer = (h) => { const file = path.join(h.state, 'gates', `${E1.id}-1.json`); fs.writeFileSync(file, JSON.stringify({ ...readJson(file), decided: { answer: DEF[1], by: 'Pat', date: '2026-11-23', scope: 'next-run' } })); };

  // The builder found no later epic and now recommends stopping: not answered "Defer" for them.
  const h = referee(t);
  parked(h.ask(q('Defer — the year comes with the export epic'), DEF));
  decideDefer(h);
  parked(h.ask(q('Stop — no later epic builds the year'), DEF));
  assert.equal(readJson(path.join(h.state, 'gates', `${E1.id}-1.json`)).decided.used, undefined, 'their answer was not spent on a different question');
  answered(h.ask(q('Defer — the year comes with the export epic'), DEF), q('Defer — the year comes with the export epic'), DEF[1]);

  // The final check meets the same unmet requirement in a full run: their "Defer" stands for it, and for no other requirement.
  const v = referee(t, { role: 'verifier' });
  const OPTS = ['Fix now', 'Defer — depends on a later epic', 'The requirement may be wrong, not the code', 'Stop — epic FAILs'];
  const vq = (tor, rec = 'Defer — the row names Lg7Exp5') => `${tor} is FAIL: the year is not there. Recommendation: ${rec}. How to proceed?`;
  fs.mkdirSync(path.join(v.state, 'gates'), { recursive: true });
  fs.writeFileSync(path.join(v.state, 'gates', `${E1.id}-1.json`), JSON.stringify({ epic: E1.id, kind: 'deferral', tor: E1.tors[1], options: DEF, session: 'build-1', decided: { answer: DEF[1], by: 'Pat', date: '2026-11-23', used: { run: 'x' } } }));
  answered(v.ask(vq(E1.tors[1]), OPTS), vq(E1.tors[1]), OPTS[1]);
  answered(v.ask(vq(E1.tors[2]), OPTS), vq(E1.tors[2]), 'Stop — epic FAILs');
  answered(v.ask(vq(E1.tors[1], 'Stop — the builder should fix it'), OPTS), vq(E1.tors[1], 'Stop — the builder should fix it'), 'Stop — epic FAILs');
});
