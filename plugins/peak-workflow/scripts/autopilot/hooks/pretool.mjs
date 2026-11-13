#!/usr/bin/env node
// Autopilot referee: the PreToolUse hook (autopilot-poc-plan.md §6.7, rules R1–R9).
//
// Reads the hook input on stdin and prints either nothing (no opinion: the normal permission
// flow decides) or a decision. It only ever denies, answers a gate from policy/gates.json, or
// ends the session; it never allows a tool call that would otherwise be asked about.
// Every decision is appended to <step>/hooks.jsonl. An internal error denies (fail closed).
//
// Environment (set by driver.mjs): AUTOPILOT_STATE (the workspace: clone/, gates/, STOP),
// AUTOPILOT_RUN (this run's directory: state.json, config.json), AUTOPILOT_STEP, AUTOPILOT_ROLE
// (planner | builder | verifier | auditor), AUTOPILOT_EPIC.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintPlan, parseSidecar } from '../lib.mjs';

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SYSTEM_READ = ['/usr', '/bin', '/sbin', '/opt', '/dev', '/etc', '/Library', '/System', '/Applications', '/lib', '/lib64', '/proc', '/sys', '/nix', '/snap', '/private/etc'];
const USER_READ = ['plugins', 'skills', 'agents', 'commands', 'rules', 'output-styles', 'CLAUDE.md'];
const PRIVATE = ['.ssh', '.aws', '.gnupg', '.azure', '.kube', '.docker', '.netrc', '.npmrc', '.pypirc', '.git-credentials', '.config/gh', '.config/gcloud', 'Library/Keychains'];
const WRAPPERS = new Set(['command', 'exec', 'env', 'time', 'nohup', 'xargs', 'nice', 'caffeinate', 'builtin', 'then', 'do', 'else', '!', '{', '(']);
const CONTAINERS = /^(docker|docker-compose|podman|colima|lima|limactl|nerdctl|multipass|vagrant|qemu.*|VBoxManage|VirtualBox|virtualbox|kind|minikube|brew|sudo|doas|gh)$/;

const readJson = (p, fallback = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const norm = (s) => String(s).normalize('NFKC').replace(/[‐-―−-]+/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

/** Resolves symlinks in the longest existing prefix, so a link out of the clone is seen for what it is. */
function realDeep(p) {
  let cur = path.resolve(p); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...tail); } catch { /* climb */ }
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(p);
    tail.unshift(path.basename(cur)); cur = up;
  }
}
const within = (p, root) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

function context(input, env) {
  const state = realDeep(env.AUTOPILOT_STATE);
  // The current run: named by the driver, else the workspace's `current` pointer.
  let current = ''; try { current = fs.readFileSync(path.join(state, 'current'), 'utf8').trim(); } catch { /* no run yet */ }
  const runDir = env.AUTOPILOT_RUN ? realDeep(env.AUTOPILOT_RUN) : path.join(state, 'runs', current || '-');
  const run = readJson(path.join(runDir, 'state.json'), {});
  const config = { ...readJson(path.join(state, 'settings.json'), {}), ...readJson(path.join(runDir, 'config.json'), {}) };
  const home = realDeep(os.homedir());
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const clone = path.join(state, 'clone');
  return {
    input, env, state, clone, run, runDir, runName: path.basename(runDir), config, home,
    step: env.AUTOPILOT_STEP ? realDeep(env.AUTOPILOT_STEP) : null,
    role: env.AUTOPILOT_ROLE ?? 'builder',
    epic: env.AUTOPILOT_EPIC ?? '',
    cwd: input.cwd ? realDeep(input.cwd) : clone,
    integration: run.integration ?? 'develop',
    // Strict (the project turned the sandbox on): reads are jailed too, and only the sandbox's own temp directory is writable.
    // Otherwise sessions read freely and write in the clone and the machine's temp directories.
    strict: run.sandbox === true,
    project: config.project ? realDeep(config.project) : null,
    temp: [`/tmp/claude-${uid}`, `/private/tmp/claude-${uid}`, ...(input.scratchpad_dir ? [realDeep(input.scratchpad_dir)] : []), ...(run.sandbox === true ? [] : [realDeep(os.tmpdir()), '/tmp', '/private/tmp'])],
  };
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

// ---- R2: path jail --------------------------------------------------------------------------

/** 'rw', 'ro' or a denial reason for one path. `bash` adds the system directories a command may name. */
function classify(ctx, raw, { bash = false } = {}) {
  let p = raw.replace(/^~(?=\/|$)/, ctx.home).replace(/\$\{?HOME\}?/g, ctx.home);
  p = realDeep(path.resolve(ctx.cwd, p));
  if (ctx.role === 'auditor') {
    if (ctx.step && within(p, path.join(ctx.step, 'bundle'))) return 'ro';
    if (within(p, ctx.clone)) return 'ro';
  } else if (within(p, ctx.clone)) return 'rw';
  // The workspace and the owner's project come before the temp directories: either may live under one.
  if (within(p, ctx.state)) return `${raw} is inside the autopilot workspace`;
  if (!ctx.strict && ctx.role !== 'auditor' && ctx.project && within(p, ctx.project)) return 'ro'; // the owner's project: read it, never write it
  if (ctx.temp.some((t) => within(p, t))) return ctx.role === 'auditor' ? 'ro' : 'rw';
  // The project's declared read-only directories (a dependency cache outside the clone), resolved by the driver at launch.
  if ((ctx.run.readOnly ?? []).some((d) => typeof d === 'string' && d && within(p, d))) return 'ro';
  if (within(p, path.join(ctx.home, '.claude', 'plans'))) return ctx.role === 'auditor' ? 'ro' : 'rw';
  if (within(p, PLUGIN_DIR)) return 'ro';
  const claude = path.join(ctx.home, '.claude');
  if (USER_READ.some((d) => within(p, path.join(claude, d)))) return 'ro';
  if (within(p, path.join(claude, 'projects')) && /\/memory(\/|$)/.test(p.slice(claude.length))) return 'ro';
  // Where Claude Code saves a tool's output when it is too long to show: the session is told to read it there (seen live: a probe could not read its own test output).
  if (within(p, path.join(claude, 'projects')) && /\/tool-results\//.test(p.slice(claude.length))) return 'ro';
  if (bash && (p === '/' || SYSTEM_READ.some((d) => within(p, d)))) return 'ro';
  if (ctx.strict || ctx.role === 'auditor') return `${raw} is outside the private clone`;
  // Not strict: a session may read anywhere on the machine except where credentials and Claude Code's own files live.
  if (within(p, claude) || p === path.join(ctx.home, '.claude.json')) return `${raw} is Claude Code's own data`;
  if (PRIVATE.some((d) => within(p, path.join(ctx.home, d)))) return `${raw} is where credentials live`;
  return 'ro';
}

function ruleR2Files(ctx) {
  const { tool_name: tool, tool_input: ti = {} } = ctx.input;
  const write = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool);
  if (!write && !['Read', 'Glob', 'Grep'].includes(tool)) return null;
  const target = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (target === undefined) return null; // Glob and Grep default to the session's cwd, the clone
  const c = classify(ctx, String(target));
  if (c !== 'rw' && c !== 'ro') return deny('R2', `path jail — ${c}`);
  if (write && c === 'ro') return deny('R2', `path jail — ${target} is read-only for this session`);
  if (write && within(realDeep(path.resolve(ctx.cwd, String(target))), path.join(ctx.clone, '.git'))) return deny('R2', 'path jail — .git/ is not edited by hand');
  return null;
}

// ---- Bash parsing (best effort; the sandbox is the real boundary for Bash) -------------------

function tokenize(segment) {
  const out = [];
  for (const m of segment.matchAll(/(?:[^\s"']+|"(?:[^"\\]|\\.)*"|'[^']*')+/g)) out.push(m[0].replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g, (_, a, b) => a ?? b ?? ''));
  return out;
}
function parseBash(command) {
  return command.split(/&&|\|\||[;|\n]|\$\(|`|(?<![\w$])\(|\)/).map((s) => s.trim()).filter(Boolean).map((raw) => {
    const all = tokenize(raw);
    let i = 0;
    while (i < all.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(all[i]) || WRAPPERS.has(all[i]) || (i > 0 && all[i - 1] === 'env' && all[i].startsWith('-')))) i++;
    const argv = all.slice(i);
    const redirects = [];
    for (let j = 0; j < all.length; j++) {
      const m = all[j].match(/^\d*&?>>?(.*)$/);
      if (m) redirects.push(m[1] || all[j + 1] || '');
    }
    return { raw, all, argv, cmd: argv[0] ? path.basename(argv[0]) : '', redirects: redirects.filter((r) => r && !r.startsWith('&')) };
  });
}

/** The paths one command segment visibly writes: redirects and the arguments of commands that create, change or delete files. */
function visibleWrites(s, ctx = null) {
  const a = s.argv.slice(1).filter((x) => !x.startsWith('-'));
  // An in-place editor's arguments are its script and the files it edits. It edits only files that exist, and a script
  // (`/pattern/d`, `s/a/b/`) is not one: seen live, `sed -i '' -e '/global using X/d' file` was refused for its script.
  if (['sed', 'gsed', 'perl', 'ruby'].includes(s.cmd)) {
    const real = (t) => { try { return fs.existsSync(path.resolve(ctx?.cwd ?? '.', t.replace(/^~(?=\/|$)/, ctx?.home ?? os.homedir()))); } catch { return false; } };
    return [...s.redirects, ...bashWriteTargets([{ ...s, redirects: [] }]).filter(real)].filter((t) => t && !t.includes('://') && !t.startsWith('/dev/') && !t.startsWith('&'));
  }
  const more = ['touch', 'mkdir', 'rmdir', 'ln', 'chmod', 'chown', 'rsync'].includes(s.cmd) ? (s.cmd === 'rsync' || s.cmd === 'ln' ? a.slice(-1) : a) : [];
  return [...bashWriteTargets([s]), ...more].filter((t) => t && !t.includes('://') && !t.startsWith('/dev/') && !t.startsWith('&'));
}

function ruleR2Bash(ctx, segs, command) {
  if (/\$\{?AUTOPILOT_(STATE|RUN|STEP|HOOKS)\b/.test(command)) return deny('R2', 'path jail — a command may not name the autopilot workspace');
  for (const s of segs) {
    const check = (raw, why) => {
      const c = classify(ctx, raw, { bash: true });
      return c === 'rw' || c === 'ro' ? null : deny('R2', `path jail — ${why}: ${c}`);
    };
    for (let i = 0; i < s.argv.length; i++) {
      const t = s.argv[i];
      const dirArg = (['cd', 'pushd'].includes(s.cmd) && i === 1 && !t.startsWith('-')) || (s.cmd === 'git' && s.argv[i - 1] === '-C');
      if (dirArg) {
        // Where a command goes, its relative writes follow: only the clone and the temp directories.
        const c = classify(ctx, t, { bash: true });
        // Going somewhere readable only to look (cd into a package cache, then ls and grep) is fine; going there in a command that also writes is not.
        const looking = c === 'ro' && !ctx.strict && s.cmd !== 'git' && !segs.some((x) => visibleWrites(x, ctx).length);
        if (c !== 'rw' && !looking) return deny('R2', `path jail — ${s.cmd} target: ${c === 'ro' ? `${t} is outside the private clone` : c}`);
        continue;
      }
      const p = t.replace(/^-{1,2}[A-Za-z][\w-]*=/, '').replace(/^\d*&?>>?/, '');
      if (!p || p.includes('://')) continue;
      const absolute = /^(~|\$\{?HOME\}?)?\//.test(p);
      const climbs = p.split('/').includes('..');
      if (!absolute && !climbs) continue;
      if (absolute && p.startsWith('/')) {
        // A token like '/foo/' in a regex is not a path: nothing can be read where the first component does not exist.
        const first = '/' + p.split('/')[1];
        if (first !== '/' && !fs.existsSync(first)) continue;
      }
      const d = check(p, 'path in command'); if (d) return d;
    }
    // With no sandbox the referee is what keeps writes inside the clone: every path a command visibly writes must be writable.
    // Best effort — a script or an interpreter can still write where its own code says.
    if (!ctx.strict) {
      for (const tgt of visibleWrites(s, ctx)) {
        const c = classify(ctx, tgt, { bash: true });
        if (c !== 'rw') return deny('R2', `path jail — ${c === 'ro' ? `${tgt} is outside the private clone: a session writes only inside it` : c}`);
      }
    }
    // A declared read-only directory is read by commands and never written: a redirect into it is refused here (the sandbox refuses the rest).
    for (const r of s.redirects) {
      const p = realDeep(path.resolve(ctx.cwd, r.replace(/^~(?=\/|$)/, ctx.home).replace(/\$\{?HOME\}?/g, ctx.home)));
      if ((ctx.run.readOnly ?? []).some((d) => typeof d === 'string' && d && within(p, d))) return deny('R2', `path jail — ${r} is read-only for this session`);
    }
  }
  return null;
}

// ---- R3: git ---------------------------------------------------------------------------------

function ruleR3(ctx, segs, command) {
  if (/\bgit\b[^|;&\n]*\bpush\b/.test(command)) return deny('R3', 'git push is denied; nothing leaves this machine');
  const protectedNames = new Set([ctx.integration, 'main', 'master', 'develop']);
  const epicBranch = new RegExp(`^feature/epic-${ctx.epic}-[\\w.-]+$`);
  let branch = null; // the branch the next git command acts on, tracked through checkouts in the same command
  for (const s of segs) {
    if (s.cmd !== 'git') continue;
    let i = 1; let dir = ctx.cwd;
    for (; i < s.argv.length && s.argv[i].startsWith('-'); i++) {
      const o = s.argv[i];
      if (o === '-C') { dir = path.resolve(dir, s.argv[++i] ?? '.'); continue; }
      if (o === '-c') { if (/^(alias\.|core\.(hookspath|sshcommand|fsmonitor|editor|pager))/i.test(s.argv[++i] ?? '')) return deny('R3', 'git -c may not set aliases or commands'); continue; }
      if (/^--(git-dir|work-tree|exec-path)/.test(o)) return deny('R3', `git ${o.split('=')[0]} is denied`);
    }
    const sub = s.argv[i]; const args = s.argv.slice(i + 1);
    if (!sub) continue;
    const has = (...flags) => args.some((a) => flags.includes(a));
    const names = args.filter((a) => !a.startsWith('-'));
    if (branch === null) branch = git(dir, 'branch', '--show-current').out;

    if (sub === 'remote' && ['add', 'set-url', 'rename', 'remove', 'rm'].includes(names[0])) return deny('R3', `git remote ${names[0]} is denied; the clone has no remote on purpose (listing remotes is fine)`);
    if (args.some((a) => /^--force/.test(a))) return deny('R3', 'git --force is denied');
    if (['branch', 'tag', 'switch', 'checkout'].includes(sub) && args.some((a) => /^-[a-zA-Z]*f/.test(a))) return deny('R3', `git ${sub} -f is denied`);
    if (sub === 'reset' && has('--hard')) return deny('R3', 'git reset --hard is denied');
    if (['update-ref', 'filter-branch', 'filter-repo', 'replace', 'symbolic-ref'].includes(sub) && names.length) return deny('R3', `git ${sub} is denied`);
    if (sub === 'fetch' && names.some((n) => n.includes(':'))) return deny('R3', 'git fetch with a refspec is denied');
    if (sub === 'tag' && args.some((a) => !/^(-l|--list|-n\d*|--sort=.*|--contains|--points-at)$/.test(a)) && names.length) return deny('R3', 'git tag is denied; releases are tagged by a person');
    if (sub === 'branch') {
      if (args.some((a) => /^-[a-zA-Z]*[DM]/.test(a))) return deny('R3', 'git branch -D / -M is denied');
      if (args.some((a) => /^(-[a-zA-Z]*d|--delete)$/.test(a))) {
        const ok = ctx.role !== 'builder' && names.length === 1 && epicBranch.test(names[0]);
        if (!ok) return deny('R3', `git branch -d is allowed only for this epic's branch, and not in a build session`);
      }
    }
    if (sub === 'checkout' || sub === 'switch') {
      if (args.some((a) => /^-[a-zA-Z]*[BC]$/.test(a)) && names.some((n) => protectedNames.has(n))) return deny('R3', `git ${sub} -B on ${ctx.integration} or the release line is denied`);
      if (names.some((n) => (n === 'main' || n === 'master') && n !== ctx.integration) && !args.includes('--')) return deny('R3', `git ${sub} ${names.find((n) => n === 'main' || n === 'master')} is denied; the release line is not touched`);
      const flagAt = args.findIndex((a) => /^(-b|-c|--create|--orphan)$/.test(a));
      const target = flagAt >= 0 ? args[flagAt + 1] : !args.includes('--') && names.length === 1 ? names[0] : null;
      if (target) branch = target;
      continue;
    }
    const onProtected = protectedNames.has(branch);
    if (sub === 'rebase' && (onProtected || names.some((n) => protectedNames.has(n)))) return deny('R3', `git rebase on or onto ${ctx.integration} or the release line is denied`);
    const writes = ['commit', 'cherry-pick', 'revert', 'am', 'pull'].includes(sub);
    const merge = sub === 'merge' && !has('--abort', '--quit', '--continue');
    if (ctx.role === 'planner' && (writes || merge)) return deny('R3', `git ${sub} is denied in a planning session; it only plans`);
    // Seen live: a verifier's merge into the integration line stopped on a conflict, it resolved
    // the files there and this denial left it guessing. Say where a conflict is resolved.
    const conflictHint = ctx.role === 'verifier' && sub === 'commit' && branch === ctx.integration ? ` If a merge into ${branch} stopped on a conflict: run \`git merge --abort\`, check out the epic branch, merge ${branch} into it and resolve the conflict there, then merge the epic branch into ${branch} again with --no-ff.` : '';
    if (writes && onProtected) return deny('R3', `git ${sub} on ${branch} is denied; work is committed on the epic branch.${conflictHint}`);
    if (merge && onProtected) {
      const heads = args.filter((a, k) => !a.startsWith('-') && !/^(-m|--message|-F|--file|-s|--strategy|-X|--strategy-option)$/.test(args[k - 1] ?? ''));
      const ok = ctx.role === 'verifier' && branch === ctx.integration && has('--no-ff') && heads.length === 1 && epicBranch.test(heads[0]);
      if (!ok) return deny('R3', ctx.role === 'verifier' ? `only \`git merge --no-ff feature/epic-${ctx.epic}-…\` into ${ctx.integration} is allowed` : `git merge into ${branch} is denied; only the verify session merges`);
    }
  }
  return null;
}

// ---- R4: containers, VMs, global installs ------------------------------------------------------

function ruleR4(segs) {
  for (const s of segs) {
    const rest = s.argv.slice(1);
    if (CONTAINERS.test(s.cmd)) return deny('R4', `${s.cmd} is denied (containers, VMs, system package managers, sudo and gh are off limits unattended)`);
    if (['nvm', 'asdf', 'volta', 'fnm', 'pyenv', 'rbenv', 'rustup'].includes(s.cmd) && rest.some((a) => /^(install|use|global|default|toolchain)$/.test(a))) return deny('R4', `${s.cmd} ${rest[0]} is denied; the toolchain is fixed for the run`);
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(s.cmd) && (rest.some((a) => a === '-g' || a === '--global') || rest[0] === 'global' || (rest[0] === 'link' && rest.length === 1))) return deny('R4', `global ${s.cmd} installs are denied`);
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(s.cmd) && rest[0] === 'publish') return deny('R4', `${s.cmd} publish is denied`);
    if (/^pip[\d.]*$/.test(s.cmd) && rest.includes('install') && rest.includes('--user')) return deny('R4', 'pip install --user is denied');
    if (s.cmd === 'pipx' || (s.cmd === 'cargo' && rest[0] === 'install') || (s.cmd === 'go' && rest[0] === 'install') || (s.cmd === 'gem' && rest[0] === 'install')) return deny('R4', `${s.cmd} ${rest[0] ?? ''} installs outside the project and is denied`);
  }
  return null;
}

// ---- R5: disk floor and growth cap -------------------------------------------------------------

function ruleR5(ctx) {
  const floor = ctx.config.diskFloorGb ?? 15; const cap = ctx.config.growthCapMb ?? 1024;
  const s = fs.statfsSync(ctx.clone);
  const freeGb = (s.bavail * s.bsize) / 1024 ** 3;
  if (freeGb < floor) return deny('R5', `free disk is ${freeGb.toFixed(1)} GB, under the ${floor} GB floor`);
  if (!ctx.step) return null;
  const start = readJson(path.join(ctx.step, 'step.json'))?.startMb;
  if (typeof start !== 'number') return null;
  const cacheFile = path.join(ctx.step, 'du.json');
  let cache = readJson(cacheFile);
  if (!cache || Date.now() - cache.at > 30000) { // du is slow on a big tree: measure at most every 30 s
    const r = spawnSync('du', ['-sk', ctx.clone], { encoding: 'utf8' });
    cache = { at: Date.now(), mb: parseInt(r.stdout, 10) / 1024 };
    try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch { /* next call measures again */ }
  }
  if (cache.mb - start > cap) return deny('R5', `the clone grew ${Math.round(cache.mb - start)} MB this step, over the ${cap} MB cap`);
  return null;
}

// ---- R7: test integrity ------------------------------------------------------------------------

function testDirs(ctx) {
  if (ctx.config.testDirs?.length) return ctx.config.testDirs;
  let text = ''; try { text = fs.readFileSync(path.join(ctx.clone, 'CLAUDE.md'), 'utf8'); } catch { /* none */ }
  const m = text.match(/\*\*Test directories:\*\*\s*(.+)/);
  return m ? m[1].replace(/`/g, '').split(/[,\s]+/).filter(Boolean).map((d) => (d.endsWith('/') ? d : d + '/')) : [];
}
function ruleR7(ctx, targets) {
  const dirs = testDirs(ctx);
  let reasons = null;
  for (const raw of targets) {
    const rel = path.relative(ctx.clone, realDeep(path.resolve(ctx.cwd, raw))).split(path.sep).join('/');
    if (rel.startsWith('..') || rel === '.autopilot/test-changes.jsonl') continue;
    if (!dirs.some((d) => rel.startsWith(d))) continue;
    if (!git(ctx.clone, 'cat-file', '-e', `${ctx.integration}:${rel}`).ok) continue; // new in this epic: free to change
    if (reasons === null) {
      reasons = new Set();
      let text = ''; try { text = fs.readFileSync(path.join(ctx.clone, '.autopilot', 'test-changes.jsonl'), 'utf8'); } catch { /* none yet */ }
      for (const line of text.split('\n')) { try { const j = JSON.parse(line); if (j.path && String(j.reason ?? '').trim()) reasons.add(j.path); } catch { /* not a JSON line */ } }
    }
    if (!reasons.has(rel)) return deny('R7', `test integrity — ${rel} is an existing test on ${ctx.integration}. Before changing it, append {"path":"${rel}","reason":"<why this change is right>"} as one line to .autopilot/test-changes.jsonl; a person reads every reason in the morning`);
  }
  return null;
}
function bashWriteTargets(segs) {
  const out = [];
  for (const s of segs) {
    out.push(...s.redirects);
    const a = s.argv.slice(1); const paths = a.filter((x) => !x.startsWith('-'));
    if (['rm', 'mv', 'tee', 'truncate', 'unlink', 'shred'].includes(s.cmd)) out.push(...paths);
    else if (s.cmd === 'cp' || s.cmd === 'install') out.push(...paths.slice(-1));
    else if ((s.cmd === 'sed' || s.cmd === 'gsed' || s.cmd === 'perl' || s.cmd === 'ruby') && a.some((x) => /^-[a-zA-Z]*i/.test(x) || x.startsWith('--in-place'))) out.push(...paths);
    else if (s.cmd === 'git' && ['rm', 'mv', 'checkout', 'restore', 'apply', 'stash'].includes(paths[0])) out.push(...paths.slice(1));
  }
  return out;
}

// ---- R8: gate policy ---------------------------------------------------------------------------

function writeGate(ctx, gate) {
  const dir = path.join(ctx.state, 'gates');
  fs.mkdirSync(dir, { recursive: true });
  const n = fs.readdirSync(dir).filter((f) => f.startsWith(`${ctx.epic}-`) && f.endsWith('.json')).length + 1;
  const branch = git(ctx.clone, 'branch', '--show-current').out;
  const name = `${ctx.epic}-${n}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify({
    epic: ctx.epic, epicName: ctx.run.queue?.find((q) => q.id === ctx.epic)?.name ?? null, run: ctx.runName, session: ctx.step ? path.basename(ctx.step) : null,
    branch, branchTip: git(ctx.clone, 'rev-parse', 'HEAD').out,
    resume: `open a new session in the fetched repo: /peak-workflow:${ctx.role === 'verifier' ? 'wrapup-epic' : 'start-epic'} ${ctx.epic}`,
    decided: null, ...gate,
  }, null, 2) + '\n');
  return name;
}
const anchors = (ctx) => {
  let text = ''; try { text = fs.readFileSync(path.join(ctx.clone, 'docs', 'implementation-plan', 'status', `epic-${ctx.epic}.md`), 'utf8'); } catch { /* no sidecar */ }
  return parseSidecar(text).requirements;
};
const rowMatches = (row, question) => (row.fragments ?? []).every((f) => norm(question).includes(norm(f))) && (!row.pattern || new RegExp(row.pattern).test(question));

function ruleR8(ctx) {
  const policy = readJson(path.join(PLUGIN_DIR, 'scripts', 'autopilot', 'policy', 'gates.json'), { answer: [], park: [] });
  const questions = ctx.input.tool_input?.questions ?? [];
  const answers = {}; const used = []; const notes = {}; let looked = null;
  let park = questions.length ? null : { kind: 'unmatched', question: '(AskUserQuestion with no questions)', options: [], why: 'nothing to match' };
  for (const q of questions) {
    const labels = (q.options ?? []).map((o) => (typeof o === 'string' ? o : o.label));
    const offered = (want) => labels.find((l) => norm(l) === norm(want));
    const tor = (q.question.match(/TOR-\d{2}-[A-Za-z0-9]{7}/) ?? [])[0] ?? null;
    const parkRow = policy.park.find((r) => rowMatches(r, q.question));
    const row = parkRow ? null : policy.answer.find((r) => rowMatches(r, q.question));
    const kind = parkRow?.kind ?? row?.kind ?? 'unmatched';
    const base = { kind, skillStep: (parkRow ?? row)?.skillStep ?? 'unknown', question: q.question, options: labels, tor };

    // A person's recorded answer from `autopilot report` applies to that one gate kind (and TOR), once.
    // A question no policy row knows is matched on its recorded text. A void or superseded gate never answers.
    const dir = path.join(ctx.state, 'gates');
    const same = (g) => (kind === 'unmatched' ? norm(g.question ?? '') === norm(q.question) : (g.tor ?? null) === tor);
    const decided = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.startsWith(`${ctx.epic}-`) && f.endsWith('.json')).map((f) => ({ f, g: readJson(path.join(dir, f), {}) }))
      .find(({ g }) => g.decided?.answer && !g.decided.used && !g.void && !g.superseded && g.kind === kind && same(g) && offered(g.decided.answer));
    if (decided) {
      answers[q.question] = offered(decided.g.decided.answer);
      used.push(decided); continue;
    }
    // The owner's recorded look at a human-check gate (the driver puts it in step.json for the verify
    // session it resumes): wrapup's manual-verification question is answered with it, not the policy "No".
    const look = kind === 'manual-verification' && ctx.role === 'verifier' && ctx.step ? readJson(path.join(ctx.step, 'step.json'), {}).look : null;
    if (look && offered('Yes — I performed manual verification')) {
      answers[q.question] = offered('Yes — I performed manual verification');
      notes[q.question] = `Recorded by autopilot from the owner's decision, not typed in this session: ${look.by} looked at ${(look.artifacts ?? []).join(', ') || 'the build'} on ${look.date} (branch tip ${String(look.branchTip).slice(0, 9)}) and answered "Looks right"${look.note ? ` — "${look.note}"` : ''}. This is the description of the manual check; do not ask for another.`;
      looked = look; continue;
    }
    if (parkRow) { park = { ...base, why: parkRow.why }; break; }
    if (!row) { park = { ...base, why: 'no policy row matches this question; autopilot never chooses an answer' }; break; }
    if (row.roles && !row.roles.includes(ctx.role)) { park = { ...base, why: `policy answers this only in a ${row.roles.join(' or ')} session, not a ${ctx.role} one` }; break; }
    if (row.requires === 'epicId' && !new RegExp(`\\b${ctx.epic}\\b`).test(q.question)) { park = { ...base, why: `the question does not name the queued epic ${ctx.epic}` }; break; }
    if (row.requires === 'anchorTor' && !(tor && anchors(ctx).includes(tor))) { park = { ...base, why: `the question does not name one of epic ${ctx.epic}'s anchor requirements` }; break; }
    const label = offered(row.answer);
    if (!label) { park = { ...base, why: `the pre-approved answer "${row.answer}" is not among the options offered` }; break; }
    answers[q.question] = label; // keyed by the question text exactly as asked
  }
  if (park) {
    const gate = writeGate(ctx, { ...park, artifacts: [] });
    return { rule: 'R8', decision: 'park', reason: `parked at human gate (${park.kind}): ${park.why}`, gate, stop: 'autopilot: parked at human gate' };
  }
  for (const { f, g } of used) {
    const done = { ...g, decided: { ...g.decided, used: { run: ctx.runName, session: path.basename(ctx.step ?? ''), date: new Date().toISOString() } } };
    fs.writeFileSync(path.join(ctx.state, 'gates', f), JSON.stringify(done, null, 2) + '\n');
  }
  const owner = used.length + (looked ? 1 : 0);
  const source = owner === 0 ? 'policy' : owner === Object.keys(answers).length ? "the owner's recorded decision" : "policy and the owner's recorded decision";
  const annotations = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, { notes: v }]));
  return { rule: 'R8', decision: 'answer', owner, reason: `answered from ${source}: ${Object.values(answers).join(' | ')}`, updatedInput: { ...ctx.input.tool_input, answers, ...(looked ? { annotations: { ...(ctx.input.tool_input.annotations ?? {}), ...annotations } } : {}) } };
}

// ---- R9: plan capture and lint -----------------------------------------------------------------

function ruleR9(ctx) {
  const tool = ctx.input.tool_name;
  if (ctx.role !== 'planner') return deny('R9', `${tool} is denied: this session runs an already-approved plan`);
  if (tool === 'EnterPlanMode') return null;
  const plan = ctx.input.tool_input?.plan ?? '';
  if (ctx.step) fs.writeFileSync(path.join(ctx.step, 'plan.md'), plan);
  const lint = plan.trim() ? lintPlan(plan, anchors(ctx)) : { pass: false, problems: ['ExitPlanMode carried no plan text'], anchors: anchors(ctx), checkedAt: new Date().toISOString() };
  if (ctx.step) fs.writeFileSync(path.join(ctx.step, 'plan-lint.json'), JSON.stringify(lint, null, 2) + '\n');
  if (lint.pass) return { rule: 'R9', decision: 'capture', reason: 'plan captured and approved by lint, not by a person', stop: 'autopilot: plan captured' };
  const gate = writeGate(ctx, { kind: 'plan-lint', skillStep: 'start-epic Step 4 (plan approval)', question: `The captured plan failed plan lint (${lint.problems.join('; ')}). Approve it as it is, or have it planned again?`, options: ['Approve this plan', 'Re-plan'], why: lint.problems.join('; '), artifacts: ctx.step ? [path.relative(ctx.state, path.join(ctx.step, 'plan.md'))] : [] });
  return { rule: 'R9', decision: 'park', reason: `plan lint failed: ${lint.problems.join('; ')}`, gate, stop: 'autopilot: parked at human gate' };
}

// ---- the decision ------------------------------------------------------------------------------

const deny = (rule, reason, extra = {}) => ({ rule, decision: 'deny', reason, ...extra });

export function decide(input, env = process.env) {
  if (!env.AUTOPILOT_STATE) return null; // not an autopilot session: no opinion
  const ctx = context(input, env);
  const tool = input.tool_name; const ti = input.tool_input ?? {};

  if (fs.existsSync(path.join(ctx.state, 'STOP'))) return deny('R1', 'kill switch — the STOP file is present', { stop: 'autopilot: stopped by the STOP file' });
  if (ti.run_in_background === true) return deny('R6', 'background tasks are denied; autopilot never ends with work running. Run it in the foreground');
  if (tool === 'AskUserQuestion') return ruleR8(ctx);
  if (tool === 'EnterPlanMode' || tool === 'ExitPlanMode') return ruleR9(ctx);
  // StructuredOutput is how `--json-schema` returns the auditor's findings; it touches no file.
  if (ctx.role === 'auditor' && tool === 'StructuredOutput') return null;
  if (ctx.role === 'auditor' && !['Read', 'Glob', 'Grep'].includes(tool)) return deny('R2', `${tool} is denied: the auditor only reads`);

  let d = ruleR2Files(ctx);
  if (d) return d;
  if (tool === 'Bash') {
    const command = String(ti.command ?? '');
    const segs = parseBash(command);
    d = ruleR2Bash(ctx, segs, command) ?? ruleR3(ctx, segs, command) ?? ruleR4(segs) ?? ruleR7(ctx, bashWriteTargets(segs)) ?? ruleR5(ctx);
  } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    d = ruleR7(ctx, [String(ti.file_path ?? ti.notebook_path)]) ?? (tool === 'Write' ? ruleR5(ctx) : null);
  }
  return d;
}

/** The hook's stdout for a decision (null = print nothing). */
export function render(d) {
  if (!d) return null;
  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  if (d.decision === 'answer') Object.assign(out.hookSpecificOutput, { permissionDecision: 'allow', permissionDecisionReason: `autopilot ${d.rule}: ${d.reason}`, updatedInput: d.updatedInput });
  else Object.assign(out.hookSpecificOutput, { permissionDecision: 'deny', permissionDecisionReason: `autopilot ${d.rule}: ${d.reason}` });
  if (d.stop) Object.assign(out, { continue: false, stopReason: d.stop });
  return out;
}

function main() {
  let input = {}; let d;
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
    d = decide(input);
  } catch (err) {
    d = deny('R0', `referee error, failing closed: ${err.message}`);
  }
  const step = process.env.AUTOPILOT_STEP;
  if (step) {
    const brief = JSON.stringify(input.tool_input ?? null);
    try {
      fs.appendFileSync(path.join(step, 'hooks.jsonl'), JSON.stringify({
        t: new Date().toISOString(), hook: 'PreToolUse', tool_name: input.tool_name, rule: d?.rule ?? null, decision: d?.decision ?? 'pass', reason: d?.reason ?? null, gate: d?.gate ?? undefined,
        agent_id: input.agent_id, agent_type: input.agent_type, tool_use_id: input.tool_use_id, tool_input: brief && brief.length > 4000 ? brief.slice(0, 4000) + '…' : input.tool_input ?? null,
      }) + '\n');
    } catch { /* logging never changes a decision */ }
  }
  const out = render(d);
  if (out) process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
