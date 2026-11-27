#!/usr/bin/env node
// Autopilot referee: the PreToolUse hook (autopilot-poc-plan.md §6.7, rules R1–R11).
//
// Reads the hook input on stdin and prints either nothing (no opinion: the normal permission
// flow decides) or a decision. It denies, answers a gate from policy/gates.json, or ends the
// session; the one thing it allows outright is a connector call R11 accepts (the host would
// refuse it otherwise: it approves nothing).
// Every decision is appended to <step>/hooks.jsonl. An internal error denies (fail closed).
//
// Environment (set by driver.mjs): AUTOPILOT_STATE (the workspace: clone/, gates/, STOP),
// AUTOPILOT_RUN (this run's directory: state.json, config.json), AUTOPILOT_STEP, AUTOPILOT_ROLE
// (planner | builder | verifier | auditor), AUTOPILOT_EPIC, AUTOPILOT_SCRATCH (the session's scratch
// folder, <step>/scratch: the referee finds it from AUTOPILOT_STEP, the session by this name).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromBash, DEFECT_Q, LEAVE_AS_IS, SMALL_FIX_FILE, isTestPath, lintPlan, parseSidecar, parseTestDirs, smallFixLimits, testNamedDirs, NOT_OBSERVED, PROVISIONAL_BY, isProvisional, ownerDeferred, prototypeAnswer, prototypeDeferred, prototypeGates, recommended, mcpTool, isBrowserAction, isReadAction, isLocalHost, pageAddress } from '../lib.mjs';

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
    try { return path.join(fs.realpathSync.native(cur), ...tail); } catch { /* climb */ }
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(p);
    tail.unshift(path.basename(cur)); cur = up;
  }
}
// macOS and Windows file systems ignore case, so `~/.SSH` is `~/.ssh` there: compared folded, as the driver's `foldCase`.
const foldCase = (p) => (process.platform === 'darwin' || process.platform === 'win32' ? String(p).toLowerCase() : String(p));
const within = (p, root) => { const a = foldCase(p); const r = foldCase(root); return a === r || a.startsWith(r.endsWith(path.sep) ? r : r + path.sep); };
const WINDOWS = process.platform === 'win32';
/** A Bash system directory named as such (`/usr/bin`, `/dev/null`): on Windows it is Git's own, not a drive path. */
const systemNamed = (raw) => WINDOWS && SYSTEM_READ.some((d) => raw === d || raw.startsWith(d + '/'));

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
  const step = env.AUTOPILOT_STEP ? realDeep(env.AUTOPILOT_STEP) : null;
  const role = env.AUTOPILOT_ROLE ?? 'builder';
  return {
    input, env, state, clone, run, runDir, runName: path.basename(runDir), config, home,
    step, role,
    // Where this session keeps temporary files: the one folder of the workspace it may write. The auditor only reads and has none.
    scratch: step && role !== 'auditor' ? path.join(step, 'scratch') : null,
    epic: env.AUTOPILOT_EPIC ?? '',
    cwd: input.cwd ? realDeep(input.cwd) : clone,
    integration: run.integration ?? 'develop',
    // Strict (the project turned the sandbox on): reads are jailed too, and only the sandbox's own temp directory is writable.
    // Otherwise sessions read freely and write in the clone and the machine's temp directories.
    strict: run.sandbox === true,
    project: config.project ? realDeep(config.project) : null,
    temp: [`/tmp/claude-${uid}`, `/private/tmp/claude-${uid}`, ...(input.scratchpad_dir ? [realDeep(input.scratchpad_dir)] : []), ...(run.sandbox === true ? [] : [realDeep(os.tmpdir()), '/tmp', '/private/tmp'])]
      .map((t) => (WINDOWS && t.startsWith('/') ? realDeep(fromBash(t)) : t)),
  };
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

// ---- R2: path jail --------------------------------------------------------------------------

/** 'rw', 'ro' or a denial reason for one path. `bash` adds the system directories a command may name. */
function classify(ctx, raw, { bash = false } = {}) {
  if (bash && systemNamed(raw)) return 'ro';
  let p = raw.replace(/^~(?=\/|$)/, ctx.home).replace(/\$\{?HOME\}?/g, ctx.home);
  if (ctx.scratch) p = p.replace(/\$\{AUTOPILOT_SCRATCH\}|\$AUTOPILOT_SCRATCH\b/g, ctx.scratch);
  p = realDeep(path.resolve(ctx.cwd, fromBash(p)));
  if (ctx.scratch && within(p, ctx.scratch)) return 'rw';
  // A session the driver resumes (after a usage-limit wait, or to continue a build) remembers the scratch folder of the
  // step it began in; seen live (Pilot Light, 2026-11-23): build-2 wrote to build-1's and was refused. The earlier steps'
  // scratch folders of the same epic are the same kind of place: private, and in this run.
  if (ctx.scratch && ctx.epic && /^[\\/][^\\/]+[\\/]scratch([\\/]|$)/.test(p.startsWith(path.join(ctx.runDir, 'epics', ctx.epic)) ? p.slice(path.join(ctx.runDir, 'epics', ctx.epic).length) : '')) return 'rw';
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
  // The single files outside the clone that the project's CLAUDE.md tells sessions to use (a script in ~/.claude/scripts), listed by the driver at launch.
  if ((ctx.run.readFiles ?? []).includes(p)) return 'ro';
  if (within(p, path.join(ctx.home, '.claude', 'plans'))) return ctx.role === 'auditor' ? 'ro' : 'rw';
  if (within(p, PLUGIN_DIR)) return 'ro';
  const claude = path.join(ctx.home, '.claude');
  if (USER_READ.some((d) => within(p, path.join(claude, d)))) return 'ro';
  if (within(p, path.join(claude, 'projects')) && /[\\/]memory([\\/]|$)/.test(p.slice(claude.length))) return 'ro';
  // Where Claude Code saves a tool's output when it is too long to show: the session is told to read it there (seen live: a probe could not read its own test output).
  if (within(p, path.join(claude, 'projects')) && /[\\/]tool-results[\\/]/.test(p.slice(claude.length))) return 'ro';
  if (bash && (p === '/' || SYSTEM_READ.some((d) => within(p, d)))) return 'ro';
  if (ctx.strict || ctx.role === 'auditor') return `${raw} is outside the private clone`;
  // Not strict: a session may read anywhere on the machine except where credentials and Claude Code's own files live.
  if (within(p, claude) || foldCase(p) === foldCase(path.join(ctx.home, '.claude.json'))) return `${raw} is Claude Code's own data`;
  if (PRIVATE.some((d) => within(p, path.join(ctx.home, d)))) return `${raw} is where credentials live`;
  return 'ro';
}

/** Added to a refused write: where a session's temporary files go. */
const scratchHint = (ctx) => (ctx.scratch ? ` Write temporary files in ${ctx.scratch} (in a command: "$AUTOPILOT_SCRATCH")` : '');

function ruleR2Files(ctx) {
  const { tool_name: tool, tool_input: ti = {} } = ctx.input;
  const write = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool);
  if (!write && !['Read', 'Glob', 'Grep'].includes(tool)) return null;
  const target = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (target === undefined) return null; // Glob and Grep default to the session's cwd, the clone
  const c = classify(ctx, String(target));
  if (c !== 'rw' && c !== 'ro') return deny('R2', `path jail — ${c}.${write ? scratchHint(ctx) : ''}`);
  if (write && c === 'ro') return deny('R2', `path jail — ${target} is read-only for this session.${scratchHint(ctx)}`);
  if (write && within(realDeep(path.resolve(ctx.cwd, String(target))), path.join(ctx.clone, '.git'))) return deny('R2', 'path jail — .git/ is not edited by hand');
  return null;
}

// ---- Bash parsing (best effort; the sandbox is the real boundary for Bash) -------------------

function tokenize(segment) {
  const out = [];
  for (const m of segment.matchAll(/(?:[^\s"']+|"(?:[^"\\]|\\.)*"|'[^']*')+/g)) out.push(m[0].replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g, (_, a, b) => a ?? b ?? ''));
  return out;
}
/**
 * The command with the bodies of quoted heredocs taken out. A body behind `<<'EOF'` is text the shell hands to the
 * command unread (a Python script, a markdown file); it is not commands, and reading it as commands refused real
 * work: seen live (Pilot Light, 2026-11-23), a table cell `kind` in a doc was refused as the container tool, and
 * `'../support/control'` in a test import as a path in the workspace. A body for a shell (`bash <<'EOF'`, `eval`)
 * is run, so it stays; so does a body behind an unquoted delimiter, where the shell expands `$(...)`.
 */
export function withoutHeredocBodies(command) {
  const lines = String(command).split('\n'); const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const m = lines[i].match(/<<(-?)\s*(?:'([^']+)'|"([^"]+)")/);
    if (!m || /(^|[\s;&|(])(bash|sh|zsh|dash|ksh|fish|eval|source|\.|xargs|ssh)(\s|$)/.test(lines[i].slice(0, m.index))) continue;
    const delim = m[2] ?? m[3];
    const end = lines.findIndex((l, j) => j > i && (m[1] ? l.replace(/^\t+/, '') : l) === delim);
    if (end === -1) continue; // never closed: the rest stays visible
    out.push(lines[end]); i = end;
  }
  return out.join('\n');
}

/**
 * The command cut into simple commands at `&&`, `||`, `;`, `|`, a newline, `$(`, a backtick and brackets, except inside
 * single quotes: nothing there runs, and a `;` in a sed script or a `|` in a pattern made a command of half a script
 * (seen live, Pilot Light 2026-11-24: `'s#from "../support/samples";#…#'` read as the path `../support/samples`).
 * A backslash keeps the next character with its word, so `don\'t` opens no quote. Double quotes are still cut at, as
 * before: `$(…)` and a backtick run there.
 */
export function splitCommand(command) {
  const SEP = /&&|\|\||[;|\n]|\$\(|`|(?<![\w$])\(|\)/y;
  const out = []; let cur = ''; let i = 0; let dq = false;
  while (i < command.length) {
    const ch = command[i];
    if (ch === '\\') { cur += command.slice(i, i + 2); i += 2; continue; }
    if (!dq && ch === "'") { const k = command.indexOf("'", i + 1); if (k !== -1) { cur += command.slice(i, k + 1); i = k + 1; continue; } } // no closing quote: an ordinary character, so nothing after it is hidden
    if (ch === '"') dq = !dq;
    SEP.lastIndex = i; const m = SEP.exec(command);
    if (m) { out.push(cur); cur = ''; i += m[0].length; continue; }
    cur += ch; i++;
  }
  out.push(cur);
  return out;
}

function parseBash(command) {
  return splitCommand(command).map((s) => s.trim()).filter(Boolean).map((raw) => {
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
    // A Bash system path (/etc/hosts) is Git's own file on Windows, not C:\etc\hosts: it counts as one that exists.
    const real = (t) => { try { return systemNamed(t) || fs.existsSync(path.resolve(ctx?.cwd ?? '.', fromBash(t.replace(/^~(?=\/|$)/, ctx?.home ?? os.homedir())))); } catch { return false; } };
    return [...s.redirects, ...bashWriteTargets([{ ...s, redirects: [] }]).filter(real)].filter((t) => t && !t.includes('://') && !t.startsWith('/dev/') && !t.startsWith('&'));
  }
  const more = ['touch', 'mkdir', 'rmdir', 'ln', 'chmod', 'chown', 'rsync'].includes(s.cmd) ? (s.cmd === 'rsync' || s.cmd === 'ln' ? a.slice(-1) : a) : [];
  return [...bashWriteTargets([s]), ...more].filter((t) => t && !t.includes('://') && !t.startsWith('/dev/') && !t.startsWith('&'));
}

/**
 * The variables a command assigns, read the way the shell reads them: a `NAME=value` word at the start of a simple
 * command (alone, before a command, or after `export`/`local`/`declare`/`readonly`/`typeset`), outside quotes. The same
 * text inside quotes or as a later argument (`echo "scratch=$X"`, `--filename=…`, a line of `python3 -c "…"`) assigns
 * nothing. Best effort, like the rest of this parsing: a heredoc's body is read as commands.
 */
/**
 * A file below the scratch folder as an assignment's value: as a one-command prefix (`CONTROL="$AUTOPILOT_SCRATCH/control.json"
 * node a.js`, Pilot Light 2026-11-23) or on its own (`out="$AUTOPILOT_SCRATCH/step5-foo.txt"` in a loop, 2026-11-25). The
 * folder itself, a variable inside the value and a `..` still count as a copy. A name that holds such a file is read as
 * its value wherever the command uses it (`scratchNames`), so what it leads to is judged; a cut-down use is refused.
 */
const FILE_IN_SCRATCH = /^(["']?)\$(?:\{AUTOPILOT_SCRATCH\}|AUTOPILOT_SCRATCH)\/(?!.*\.\.)[\w.@%+=,\/-]+\1$/;

export function shellAssignments(command) {
  const out = []; const n = command.length; let i = 0; let atStart = true; let run = []; // `run`: the assignments just read, before the word that tells whether a command follows
  const SEP = /[\s;&|()\n`]/;
  const skipWord = (j) => {
    while (j < n && !SEP.test(command[j])) {
      if (command[j] === "'") { const k = command.indexOf("'", j + 1); j = k === -1 ? n : k + 1; }
      else if (command[j] === '"') { let k = j + 1; while (k < n && command[k] !== '"') k += command[k] === '\\' ? 2 : 1; j = k + 1; }
      else if (command[j] === '\\') j += 2;
      else j++;
    }
    return j;
  };
  while (i < n) {
    const ch = command[i];
    if (ch === '$' && command[i + 1] === '(') { atStart = true; run = []; i += 2; continue; }
    if (/[;&|(\n`]/.test(ch)) { atStart = true; run = []; i++; continue; }
    if (ch === ')') { i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    const m = atStart ? /^(?:(?:export|local|declare|readonly|typeset)(?:\s+-\w+)*\s+)?([A-Za-z_]\w*)=/.exec(command.slice(i)) : null;
    if (m) { const from = i + m[0].length; i = skipWord(from); const a = { name: m[1], value: command.slice(from, i), prefix: false }; out.push(a); run.push(a); continue; } // more may follow
    const end = skipWord(i);
    // A reserved word that opens a command list (`do`, `then`, `else`): what follows it on the line starts a command.
    if (run.length === 0 && /^(do|then|else|elif|if|while|until|!|\{)$/.test(command.slice(i, end))) { i = end; continue; }
    for (const a of run) a.prefix = true; // a command word follows: they set the environment of that one command and nothing after it
    run = [];
    i = end;
    atStart = false;
  }
  return out;
}

/**
 * The command with each name that holds a file below the scratch folder (`out="$AUTOPILOT_SCRATCH/a.txt"`, on its own)
 * read as that value where it is used (`$out`, `${out}`), so `"$out/../step.json"` is judged as the path it is. `cut` is
 * set when such a name is used cut down or indirectly (`${out%/*}`, `${!out}`), copied into another name, or given a second
 * value (an assignment, `read`, `for`, `printf -v`), which could lead anywhere.
 */
export function scratchNames(command) {
  const all = shellAssignments(command);
  const held = all.filter((a) => !a.prefix && FILE_IN_SCRATCH.test(a.value)); // a prefix's name ends with its one command
  // Given another value in the same command, the name could lead anywhere after it: that counts as a copy.
  let out = command; let cut = held.some((a) => all.filter((b) => b.name === a.name).length > 1);
  for (const a of held) {
    const use = `\\$(?:\\{[#!]?)?${a.name}(?!\\w)`;
    // Copied into another name (`b=$out`), whose uses would then go unjudged: a copy.
    if (all.some((b) => b !== a && new RegExp(use).test(b.value))) cut = true;
    // Given a value some other way (`read out`, `for out in`, `printf -v out`, `mapfile out`): it could then hold anything.
    if (new RegExp(`(?:\\bread\\b[^;&|\\n]*|\\bfor\\s+|\\bprintf\\s+-v\\s*|\\b(?:mapfile|readarray)\\b[^;&|\\n]*\\s)${a.name}(?!\\w)`).test(command)) cut = true;
    if (new RegExp(`\\$\\{[#!]?${a.name}(?!\\w)(?!\\})`).test(out) || new RegExp(`\\$\\{[#!]${a.name}\\}`).test(out)) cut = true;
    const value = a.value.replace(/^(["'])([\s\S]*)\1$/, '$2');
    out = out.replace(new RegExp(`\\$\\{${a.name}\\}|\\$${a.name}(?!\\w)`, 'g'), () => value);
  }
  return { command: out, cut };
}

function ruleR2Bash(base, segs, command) {
  if (/\$\{?AUTOPILOT_(STATE|RUN|STEP|HOOKS)\b/.test(command)) return deny('R2', 'path jail — a command may not name the autopilot workspace');
  // The scratch folder is inside the workspace: its name is used as it is, never cut down (`${AUTOPILOT_SCRATCH%/scratch}`) or copied into another name, which would lead back into the workspace unseen.
  // Seen live: 11 of 18 refusals were the name printed (`echo "scratch=$AUTOPILOT_SCRATCH"`), an option or quoted code; only a real assignment is a copy.
  // A name holding a file below the folder is no copy: it is read as its value below, so every path it makes is judged.
  const named = scratchNames(command);
  if (named.command !== command) { command = named.command; segs = parseBash(command); }
  if (named.cut || /\$\{[#!]?AUTOPILOT_SCRATCH[^}]/.test(command) || shellAssignments(command).some((a) => /\$\{?AUTOPILOT_SCRATCH\b/.test(a.value) && !FILE_IN_SCRATCH.test(a.value))) return deny('R2', 'path jail — use "$AUTOPILOT_SCRATCH" as it is: do not copy it into a variable (`S=…`) or cut it down; write "$AUTOPILOT_SCRATCH/<file>" wherever you need it');
  // The directory follows each `cd` through the command, so a later relative path (`cd tests/a/b && … ; cd ../../..`) is
  // judged from where the command then is, not from where it started (seen live: a way back to the clone root was refused).
  let ctx = base;
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
        if (s.cmd !== 'git') ctx = { ...ctx, cwd: realDeep(path.resolve(ctx.cwd, fromBash(t.replace(/^~(?=\/|$)/, ctx.home).replace(/\$\{?HOME\}?/g, ctx.home).replace(/\$\{AUTOPILOT_SCRATCH\}|\$AUTOPILOT_SCRATCH\b/g, ctx.scratch ?? '$AUTOPILOT_SCRATCH')))) };
        continue;
      }
      const p = t.replace(/^-{1,2}[A-Za-z][\w-]*=/, '').replace(/^\d*&?>>?/, '');
      if (!p || p.includes('://')) continue;
      // A drive path (C:\… or C:/…) is as absolute as /…: on Windows a command may name one.
      const absolute = /^(~|\$\{?HOME\}?|\$\{?AUTOPILOT_SCRATCH\}?)?\//.test(p) || (WINDOWS && /^[A-Za-z]:[\\/]/.test(p));
      const climbs = p.split(/[\\/]/).includes('..');
      if (!absolute && !climbs) continue;
      if (absolute && p.startsWith('/') && !systemNamed(p)) {
        // A token like '/foo/' in a regex is not a path: nothing can be read where the first component does not exist.
        const first = fromBash('/' + p.split('/')[1]);
        if (first !== '/' && !fs.existsSync(first)) continue;
      }
      const d = check(p, 'path in command'); if (d) return d;
    }
    // With no sandbox the referee is what keeps writes inside the clone: every path a command visibly writes must be writable.
    // Best effort — a script or an interpreter can still write where its own code says.
    if (!ctx.strict) {
      for (const tgt of visibleWrites(s, ctx)) {
        const c = classify(ctx, tgt, { bash: true });
        if (c !== 'rw') return deny('R2', `path jail — ${c === 'ro' ? `${tgt} is outside the private clone: a session writes only inside it` : c}.${scratchHint(ctx)}`);
      }
    }
    // A declared read-only directory is read by commands and never written: a redirect into it is refused here (the sandbox refuses the rest).
    for (const r of s.redirects) {
      const p = realDeep(path.resolve(ctx.cwd, fromBash(r.replace(/^~(?=\/|$)/, ctx.home).replace(/\$\{?HOME\}?/g, ctx.home))));
      if ((ctx.run.readOnly ?? []).some((d) => typeof d === 'string' && d && within(p, d)) || (ctx.run.readFiles ?? []).includes(p)) return deny('R2', `path jail — ${r} is read-only for this session`);
    }
  }
  return null;
}

// ---- R3: git ---------------------------------------------------------------------------------

function ruleR3(ctx, segs, command) {
  if (/\bgit\b[^|;&\n]*(?<!\bstash\s+)\bpush\b/.test(command)) return deny('R3', 'git push is denied; nothing leaves this machine');
  const protectedNames = new Set([ctx.integration, 'main', 'master', 'develop']);
  // Seen live, three times: `B=feature/epic-… && git merge $B --no-ff && git branch -d $B`. A name given one plain
  // value in this command stands for it, where the rule asks which branch is meant.
  const vars = new Map(); const twice = new Set();
  for (const [, k, v] of command.matchAll(/(?:^|[\s;&(])([A-Za-z_]\w*)=([\w./-]+)(?=[\s;&)]|$)/g)) { if (vars.has(k)) twice.add(k); vars.set(k, v); }
  const plain = (a) => { const m = String(a).match(/^"?\$\{?([A-Za-z_]\w*)\}?"?$/); return m && vars.has(m[1]) && !twice.has(m[1]) ? vars.get(m[1]) : a; };
  const epicBranch = new RegExp(`^feature/epic-${ctx.epic}-[\\w.-]+$`);
  let branch = null; // the branch the next git command acts on, tracked through checkouts in the same command
  for (const s of segs) {
    if (s.cmd !== 'git') continue;
    let i = 1; let dir = ctx.cwd;
    for (; i < s.argv.length && s.argv[i].startsWith('-'); i++) {
      const o = s.argv[i];
      if (o === '-C') { dir = path.resolve(dir, fromBash(s.argv[++i] ?? '.')); continue; }
      if (o === '-c') { if (/^(alias\.|core\.(hookspath|sshcommand|fsmonitor|editor|pager))/i.test(s.argv[++i] ?? '')) return deny('R3', 'git -c may not set aliases or commands'); continue; }
      if (/^--(git-dir|work-tree|exec-path)/.test(o)) return deny('R3', `git ${o.split('=')[0]} is denied`);
    }
    const sub = s.argv[i]; const args = s.argv.slice(i + 1);
    if (!sub) continue;
    const has = (...flags) => args.some((a) => flags.includes(a));
    const names = args.filter((a) => !a.startsWith('-'));
    if (branch === null) branch = git(dir, 'branch', '--show-current').out;

    if (sub === 'remote' && ['add', 'set-url', 'rename', 'remove', 'rm'].includes(names[0])) return deny('R3', `git remote ${names[0]} is denied; the clone has no remote on purpose (listing remotes is fine)`);
    // A worktree the session made in its scratch folder is removed with --force when it has files in it (seen live, three
    // times, Pilot Light 2026-11-23). That is the one forced command that can only touch the session's own scratch folder.
    const scratchWorktree = sub === 'worktree' && names[0] === 'remove' && names.length === 2 && ctx.scratch
      && classify(ctx, plain(names[1])) === 'rw' && /(^|[\\/])scratch([\\/]|$)/.test(realDeep(path.resolve(dir, fromBash(String(plain(names[1])).replace(/\$\{AUTOPILOT_SCRATCH\}|\$AUTOPILOT_SCRATCH\b/g, ctx.scratch)))));
    if (args.some((a) => /^--force/.test(a)) && !scratchWorktree) return deny('R3', 'git --force is denied');
    if (['branch', 'tag', 'switch', 'checkout'].includes(sub) && args.some((a) => /^-[a-zA-Z]*f/.test(a))) return deny('R3', `git ${sub} -f is denied`);
    if (sub === 'reset' && has('--hard')) return deny('R3', 'git reset --hard is denied');
    // A session's stash is kept by the driver after it ends (refs/autopilot/leftover/); dropping one loses it for good.
    if (sub === 'stash' && ['drop', 'clear'].includes(names[0])) return deny('R3', `git stash ${names[0]} is denied: a stash is kept; commit work in progress on the epic branch`);
    if (['update-ref', 'filter-branch', 'filter-repo', 'replace', 'symbolic-ref'].includes(sub) && names.length) return deny('R3', `git ${sub} is denied`);
    if (sub === 'fetch' && names.some((n) => n.includes(':'))) return deny('R3', 'git fetch with a refspec is denied');
    if (sub === 'tag' && args.some((a) => !/^(-l|--list|-n\d*|--sort=.*|--contains|--points-at)$/.test(a)) && names.length) return deny('R3', 'git tag is denied; releases are tagged by a person');
    if (sub === 'branch') {
      if (args.some((a) => /^-[a-zA-Z]*[DM]/.test(a))) return deny('R3', 'git branch -D / -M is denied');
      if (args.some((a) => /^(-[a-zA-Z]*d|--delete)$/.test(a))) {
        const ok = ctx.role !== 'builder' && names.length === 1 && epicBranch.test(plain(names[0]));
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
      const heads = args.filter((a, k) => !a.startsWith('-') && !/^(-m|--message|-F|--file|-s|--strategy|-X|--strategy-option)$/.test(args[k - 1] ?? '')).map(plain);
      const ok = ctx.role === 'verifier' && branch === ctx.integration && has('--no-ff') && heads.length === 1 && epicBranch.test(heads[0]);
      if (!ok) return deny('R3', ctx.role === 'verifier' ? `only \`git merge --no-ff feature/epic-${ctx.epic}-…\` into ${ctx.integration} is allowed: one branch, named in the command, with --no-ff` : `git merge into ${branch} is denied; only the verify session merges`);
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
    const r = spawnSync('du', ['-sk', ctx.clone], { encoding: 'utf8', windowsHide: true });
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
  return parseTestDirs(text);
}
function ruleR7(ctx, targets) {
  const dirs = testDirs(ctx);
  let reasons = null; let named = null;
  for (const raw of targets) {
    const rel = path.relative(ctx.clone, realDeep(path.resolve(ctx.cwd, fromBash(raw)))).split(path.sep).join('/');
    if (rel.startsWith('..') || rel === '.autopilot/test-changes.jsonl') continue;
    if (!dirs.some((d) => rel.startsWith(d))) continue;
    if (!git(ctx.clone, 'cat-file', '-e', `${ctx.integration}:${rel}`).ok) continue; // new in this epic: free to change
    named ??= testNamedDirs([...git(ctx.clone, 'ls-tree', '-r', '--name-only', ctx.integration, '--', ...dirs).out.split('\n'), ...git(ctx.clone, 'ls-files', '-co', '--exclude-standard', '--', ...dirs).out.split('\n')], dirs);
    if (!isTestPath(rel, dirs, named)) continue; // production code beside the tests, or a manifest
    if (reasons === null) {
      reasons = new Set();
      let text = ''; try { text = fs.readFileSync(path.join(ctx.clone, '.autopilot', 'test-changes.jsonl'), 'utf8'); } catch { /* none yet */ }
      for (const line of text.split('\n')) { try { const j = JSON.parse(line); if (j.path && String(j.reason ?? '').trim()) reasons.add(j.path); } catch { /* not a JSON line */ } }
    }
    if (!reasons.has(rel)) return deny('R7', `test integrity — ${rel} is an existing test on ${ctx.integration}. Before changing it, append {"path":"${rel}","reason":"<why this change is right>"} as one line to .autopilot/test-changes.jsonl, and commit that file with your work; a person reads every reason in the morning`);
  }
  return null;
}
function bashWriteTargets(segs) {
  const out = [];
  for (const s of segs) {
    out.push(...s.redirects);
    const a = s.argv.slice(1); const paths = a.filter((x) => x && !x.startsWith('-')); // `sed -i '' …` carries an empty word: it is not a path
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
/**
 * The option on offer that stands for a wanted answer. A session often shortens or pads a label
 * the skill gave it word for word ("No — only automated gates" for "No — only automated gates
 * were run"); seen live, that parked a finished epic. The same words win; otherwise the one
 * option that the wanted answer starts with, or that starts with it, at a word boundary and at
 * least two words long. Two options that fit, or none, is no match: autopilot never guesses.
 */
export function offeredLabel(labels, want) {
  const w = norm(want);
  const exact = labels.find((l) => norm(l) === w);
  if (exact !== undefined) return exact;
  const starts = (long, short) => short.split(' ').length >= 2 && long.startsWith(short) && /^\W/.test(long.slice(short.length));
  const near = labels.filter((l) => { const n = norm(l); return starts(w, n) || starts(n, w); });
  return near.length === 1 ? near[0] : undefined;
}
/** Whether a requirement sits under a `# Safety` banner in the clone's feature files (as the driver's `readRequirements` reads them). One that cannot be found counts as Safety. */
function isSafety(clone, tor) {
  try {
    const dir = path.join(clone, 'docs', 'requirements'); let found = false;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.feature.md'))) {
      let safety = false;
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
        if (/^#\s+\S/.test(line) && !/^#\s*-+\s*$/.test(line) && !/^#\s*Verification:/.test(line.trim())) safety = /^#\s+Safety\b/.test(line);
        if (/^Scenario:\s*\[/.test(line) && line.includes(`[${tor}]`)) { if (safety) return true; found = true; }
      }
    }
    return !found;
  } catch { return true; }
}
const rowMatches = (row, question) => (row.fragments ?? []).every((f) => norm(question).includes(norm(f))) && (!row.pattern || new RegExp(row.pattern).test(question));

function ruleR8(ctx) {
  const policy = readJson(path.join(PLUGIN_DIR, 'scripts', 'autopilot', 'policy', 'gates.json'), { answer: [], park: [] });
  const questions = ctx.input.tool_input?.questions ?? [];
  const answers = {}; const used = []; const notes = {}; let looked = null; let told = 0; const standing = []; let protoAgain = 0;
  // What the owner already answered for this step, in this run or an earlier one (the driver writes it to step.json
  // and tells the session before it starts).
  const earlier = ctx.step ? readJson(path.join(ctx.step, 'step.json'), {}).answers ?? [] : [];
  // A provisional run (the owner's choice at launch, the run's `mode`): a session's own recommendation is taken where
  // a full run would stop and ask, recorded as a gate that is already decided, and listed for the owner at the end.
  const proto = isProvisional(ctx.config.mode);
  const gatesNow = () => { const dir = path.join(ctx.state, 'gates'); return (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(dir, f), {})); };
  const protoTaken = proto ? prototypeGates(gatesNow(), ctx.epic) : [];
  const protoNow = [];
  let park = questions.length ? null : { kind: 'unmatched', question: '(AskUserQuestion with no questions)', options: [], why: 'nothing to match' };
  // Once per step: the questions the owner already answered for it, for a session that may be asking one of them in other words.
  const remindOnce = (q) => {
    const memo = ctx.step ? path.join(ctx.step, 'answers-reminded.json') : null;
    if (!earlier.length || !memo || fs.existsSync(memo)) return null;
    fs.writeFileSync(memo, JSON.stringify({ at: new Date().toISOString(), question: q.question }) + '\n');
    const list = earlier.map((a, i) => `(${i + 1}) asked "${a.question}" — the owner answered "${a.answer}"${a.note ? ` ("${a.note}")` : ''}`).join('; ');
    return { rule: 'R8', decision: 'remind', reason: `not put to the owner yet. They have already answered ${earlier.length} question(s) for this step: ${list}. If what you are asking is one of those in other words, do not ask it: act on their answer now. If it is a different decision, ask it again exactly as you just did and it goes to the owner` };
  };
  for (const q of questions) {
    const labels = (q.options ?? []).map((o) => (typeof o === 'string' ? o : o.label));
    const offered = (want) => offeredLabel(labels, want);
    const tor = (q.question.match(/TOR-\d{2}-[A-Za-z0-9]{7}/) ?? [])[0] ?? null;
    // A defect the final check saw in the epic's own work has its own fixed opening, whatever else its text says
    // ("looks wrong", " failed: "): no policy row reads it, so it is never parked as an amendment nor answered "Stop".
    const defect = ctx.role === 'verifier' && DEFECT_Q.test(q.question);
    const parkRow = defect ? null : policy.park.find((r) => rowMatches(r, q.question));
    const row = parkRow || defect ? null : policy.answer.find((r) => rowMatches(r, q.question));
    const kind = defect ? 'defect' : parkRow?.kind ?? row?.kind ?? 'unmatched';
    const base = { kind, skillStep: defect ? 'wrapup-epic Step 1.4b (seen but not fixed)' : (parkRow ?? row)?.skillStep ?? 'unknown', question: q.question, options: labels, tor };
    // A question with no requirement of its own is matched on its text, never on its (null) TOR.
    const byText = kind === 'unmatched' || kind === 'defect' || kind === 'pre-existing';

    // A person's recorded answer from `autopilot report` applies to that one gate kind (and TOR), once.
    // A question no policy row knows is matched on its recorded text. A void or superseded gate never answers.
    const dir = path.join(ctx.state, 'gates');
    const same = (g) => (byText ? norm(g.question ?? '') === norm(q.question) : (g.tor ?? null) === tor);
    // The owner's "Defer" answered a session that recommended deferring. A session that now recommends something else
    // (it found no later epic, it wants to stop) is asking a new question: theirs again.
    const stillFits = (answer) => kind !== 'deferral' || !/^\W*defer\b/i.test(answer ?? '') || [null, 'Defer'].includes(recommended(q.question));
    const decided = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => f.startsWith(`${ctx.epic}-`) && f.endsWith('.json')).map((f) => ({ f, g: readJson(path.join(dir, f), {}) }))
      .find(({ g }) => g.decided?.answer && !g.decided.used && !g.void && !g.superseded && g.kind === kind && same(g) && offered(g.decided.answer) && stillFits(g.decided.answer));
    if (decided) {
      answers[q.question] = offered(decided.g.decided.answer);
      used.push(decided); continue;
    }
    // The same question again after its recorded answer was spent (a later session of the step asks it verbatim):
    // the owner's answer still stands.
    const again = earlier.find((a) => (a.gateKind ?? 'unmatched') === kind && (byText ? norm(a.question ?? '') === norm(q.question) : (a.tor ?? null) === tor) && offered(a.answer) && stillFits(a.answer));
    if (again) { answers[q.question] = offered(again.answer); told += 1; continue; }
    // The owner's recorded look at a human-check gate (the driver puts it in step.json for the verify
    // session it resumes): wrapup's manual-verification question is answered with it, not the policy "No".
    const look = kind === 'manual-verification' && ctx.role === 'verifier' && ctx.step ? readJson(path.join(ctx.step, 'step.json'), {}).look : null;
    if (look && offered('Yes — I performed manual verification')) {
      answers[q.question] = offered('Yes — I performed manual verification');
      notes[q.question] = `Recorded by autopilot from the owner's decision, not typed in this session: ${look.by} looked at ${(look.artifacts ?? []).join(', ') || 'the build'} on ${look.date} (branch tip ${String(look.branchTip).slice(0, 9)}) and answered "Looks right"${look.note ? ` — "${look.note}"` : ''}. This is the description of the manual check; do not ask for another.`;
      looked = look; continue;
    }
    // The owner looked, and no option on offer says so: never let the policy "No" stand in for their look.
    if (look) { park = { ...base, why: 'the owner looked at this build, and none of the options offered says a manual check was done' }; break; }
    if (parkRow && proto) {
      // The same question again from a later session of the epic (the planner asked, now the builder does): the same answer, not a second one.
      // A session that now recommends something else (it tried the fix and wants to stop) is asking a new question: the owner's.
      // So is a different correction to a requirement already amended: only the proposal that was taken is taken again.
      const proposal = (text) => norm((String(text ?? '').match(/\bProposed:\s*([\s\S]*?)\s*How to proceed\?\s*$/) ?? [])[1] ?? String(text ?? ''));
      const before = protoTaken.find((g) => g.kind === kind && (g.tor ?? null) === tor && offered(g.decided.answer) && (kind === 'deferral' ? recommended(q.question) === g.recommendation : proposal(q.question) === proposal(g.question)));
      // A Safety requirement is never amended or deferred by anyone but the owner, whatever a session offers.
      if (!before && tor && anchors(ctx).includes(tor) && isSafety(ctx.clone, tor)) { park = { ...base, why: `${parkRow.why}; ${tor} is a Safety requirement, which a provisional run never decides` }; break; }
      if (before) { answers[q.question] = offered(before.decided.answer); protoAgain += 1; continue; }
      const p = prototypeAnswer({ kind, question: q.question, labels, tor, anchors: anchors(ctx), taken: [...protoTaken, ...protoNow].filter((x) => x.kind !== 'defect' && x.kind !== 'thin-review') });
      if (p?.answer) { answers[q.question] = p.answer; protoNow.push({ ...base, why: parkRow.why, answer: p.answer, ...(kind === 'deferral' ? { recommendation: recommended(q.question) } : {}) }); continue; }
      if (p?.why) { park = { ...base, why: `${parkRow.why}; ${p.why}` }; break; }
    }
    if (parkRow) { park = { ...base, why: parkRow.why }; break; }
    // A deferral that stands (the owner answered "Defer" at the build, or this provisional run took the builder's
    // recommendation): the final check meets the same unmet requirement, and when it too recommends deferring, the
    // same decision stands. It is not a new one, so it is not asked or counted again.
    if (ctx.role === 'verifier' && kind === 'tor-fail' && tor && recommended(q.question) === 'Defer') {
      const label = labels.filter((l) => /^\W*defer\b/i.test(l));
      if (label.length === 1 && anchors(ctx).includes(tor) && ownerDeferred(gatesNow(), ctx.epic).includes(tor)) { answers[q.question] = label[0]; told += 1; continue; }
      if (label.length === 1 && prototypeDeferred(protoTaken, ctx.epic).includes(tor)) { answers[q.question] = label[0]; protoAgain += 1; continue; }
    }
    if (proto && ctx.role === 'verifier' && kind === 'tor-fail' && tor) {
      // A requirement only a person can observe, in a run where nobody will: the verifier was told to record it as
      // not observed and not to ask. Reminded once; asked again, the question is answered as in a full run.
      const unobserved = ctx.step ? readJson(path.join(ctx.step, 'step.json'), {}).unobserved ?? [] : [];
      const memo = ctx.step ? path.join(ctx.step, `not-observed-reminded-${tor}.json`) : null;
      if (memo && unobserved.some((u) => u.tor === tor) && /is CANNOT VERIFY: /.test(q.question) && !fs.existsSync(memo)) {
        fs.writeFileSync(memo, JSON.stringify({ at: new Date().toISOString(), question: q.question }) + '\n');
        return { rule: 'R8', decision: 'remind', reason: `not put to the owner: this is a provisional run and nobody will observe ${tor}. Do not ask about it. Follow the file "Requirements nobody will observe in this run" you were given: no PASS for it, no Deferrals row, record it with \`tor-lifecycle mark\` as \`--fail ${tor} "${NOT_OBSERVED} — provisional run: <what a person must still do>"\`, list it under "Not proven for real", and judge the epic on its other requirements` };
      }
    }
    // The owner's standing answer for small fixes: the verifier itself recommends "Fix now", that option is on
    // offer, and fewer than the allowed number were answered this way in this final check. How big the fix may be
    // is judged afterwards, at the merge gate, from what was actually changed; a requirement is never part of it.
    const limits = ctx.role === 'verifier' && ctx.step ? smallFixLimits(ctx.config) : null;
    // A requirement the verifier judged FAIL or CANNOT VERIFY, for one of this epic's anchors: the standing answer
    // covers adding the test it lacks and nothing else (seen live: two epics in four rebuilt, each for one missing
    // test on code that worked). The merge gate holds the fix to test files; code that is wrong is still a Stop.
    // CANNOT VERIFY is a requirement nobody could judge (a look the owner has not given): that stays a Stop.
    const testOnly = kind === 'tor-fail';
    if (kind === 'defect') {
      // Fix now, recommended and within the count: the standing answer, as for any small fix. Anything else is the
      // owner's: a full run asks them; a provisional run leaves it as is, goes on, and lists it under "Decided for you".
      const rec = recommended(q.question);
      if (limits && rec === 'Fix now' && offered('Fix now') && readJson(path.join(ctx.step, SMALL_FIX_FILE), []).length + standing.length < limits.perEpic) {
        answers[q.question] = offered('Fix now'); standing.push({ at: new Date().toISOString(), question: q.question, tor: null, defect: true }); continue;
      }
      const reason = rec === 'Fix now' ? (limits ? `past the count of ${limits.perEpic} small fixes per final check` : 'there is no standing answer for small fixes') : rec === 'Stop' ? 'it recommends failing the epic' : 'it recommends leaving it';
      const why = `the final check saw this wrong in the epic's own work; ${reason}: yours to decide`;
      const leave = offered(LEAVE_AS_IS);
      // The same defect again (a final check run again after a rollback): the same answer, not a second record.
      if (proto && rec !== 'Stop' && leave && protoTaken.some((g) => g.kind === 'defect' && norm(g.question ?? '') === norm(q.question))) { answers[q.question] = leave; protoAgain += 1; continue; }
      if (proto && rec !== 'Stop' && leave) { answers[q.question] = leave; protoNow.push({ ...base, why, answer: leave }); continue; }
      // The owner already answered questions for this step, and a session that takes it up again may word a defect
      // differently: reminded once of what they answered, as for any question no policy row knows.
      const reminder = remindOnce(q);
      if (reminder) return reminder;
      park = { ...base, why }; break;
    }
    if (limits && (!testOnly || (tor && anchors(ctx).includes(tor) && /^\W*TOR-\S+ is FAIL: /.test(q.question))) && /\bRecommendation:\s*\**Fix now\b/i.test(q.question) && offered('Fix now')) {
      const file = path.join(ctx.step, SMALL_FIX_FILE);
      const made = readJson(file, []);
      if (made.length + standing.length < limits.perEpic) { answers[q.question] = offered('Fix now'); standing.push({ at: new Date().toISOString(), question: q.question, tor, ...(testOnly ? { testOnly: true } : {}) }); continue; }
      park = { ...base, why: `the standing answer for small fixes covers ${limits.perEpic} per final check, and this is one more` }; break;
    }
    if (!row) {
      // A question nobody pre-approved, in a step the owner has already answered questions about. Seen live: a session
      // that takes the step up again words the owner's question differently, and the owner is asked twice. Autopilot
      // does not judge whether two wordings are one question, and never picks an answer: it reminds the session once
      // of what was answered. A session that asks again is asking something else, and that goes to the owner.
      // The verifier asks the owner to do a check they already did and recorded (seen live: handed the owner's real
      // sign-in in their own words, the verifier asked them to sign in again). Refused once, with the record; a
      // verifier that cannot judge from it says so through the skill's CANNOT VERIFY question, which carries its
      // reason back to the owner. Asked a second time it is a different question, and it goes to the owner.
      const seen = ctx.role === 'verifier' && ctx.step && tor ? readJson(path.join(ctx.step, 'step.json'), {}).look : null;
      const lookMemo = ctx.step ? path.join(ctx.step, 'look-reminded.json') : null;
      const covers = seen && ((seen.observations ?? []).length ? seen.observations.some((o) => o.tor === tor && o.answer === 'yes') : true);
      if (covers && !fs.existsSync(lookMemo)) {
        fs.writeFileSync(lookMemo, JSON.stringify({ at: new Date().toISOString(), question: q.question }) + '\n');
        const lines = (seen.observations ?? []).filter((o) => o.tor === tor && o.answer === 'yes').map((o) => `"${o.clause}" — yes${o.how === 'live' ? ', seen for real' : ''}`).join('; ');
        return { rule: 'R8', decision: 'remind', reason: `not put to the owner: ${seen.by} already did this check for ${tor} on ${seen.date} and recorded what they saw${lines ? ` (${lines})` : ''}${seen.note ? `; their words: "${seen.note}"` : ''}. It is in the file "The operator's observation is already recorded" you were given. Do not ask them to do it again: record it as operator-observed in their words and judge the Then from it. If their record contradicts a Then or says a line was not checked, give CANNOT VERIFY and ask the skill's own question for that, with your reason` };
      }
      // After a deferral this run took, the skill asks which later epic builds the missing part. Nobody is there to
      // say, and autopilot never names one: the session is told once to use the epic it (or the builder) already named.
      const succMemo = ctx.step ? path.join(ctx.step, 'successor-reminded.json') : null;
      // Whose deferral: the owner's own for the requirement asked about (or, when the question names none, for any of this epic's), else this provisional run's.
      const ownDeferred = ownerDeferred(gatesNow(), ctx.epic).filter((t) => anchors(ctx).includes(t));
      const byOwner = tor ? ownDeferred.includes(tor) : ownDeferred.length > 0;
      if (succMemo && /which later epic creates the code/i.test(q.question) && (byOwner || prototypeDeferred(protoTaken, ctx.epic).length) && !fs.existsSync(succMemo)) {
        fs.writeFileSync(succMemo, JSON.stringify({ at: new Date().toISOString(), question: q.question }) + '\n');
        return { rule: 'R8', decision: 'remind', reason: `not put to the owner: ${byOwner ? 'they answered "Defer" to the recommendation that named the later epic, and are not asked to name it again' : 'this is a provisional run, and the deferral was taken on your own recommendation'}. The later epic is the one ${ctx.role === 'verifier' ? "the implementer's Deferrals row names as the successor" : 'your recommendation named'}: use it, run the skill's successor check with it and carry on. If no such epic's spec exists, Defer is not available: ask the first question again, recommending Fix now or Stop` };
      }
      const reminder = remindOnce(q);
      if (reminder) return reminder;
      park = { ...base, why: 'no policy row matches this question; autopilot never chooses an answer' }; break;
    }
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
  // Each answer taken on the provisional setting is a gate file like any other, already decided and already used:
  // the one record the driver's checks, the report and the closing screen read.
  const taken = protoNow.map(({ answer, ...g }) => {
    const at = new Date(); const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`; // the local day, as every gate date; `used.date` stays a UTC timestamp
    return { kind: g.kind, tor: g.tor, answer, gate: writeGate(ctx, { ...g, artifacts: [], decided: { answer, by: PROVISIONAL_BY, date, standing: true, prototype: true, used: { run: ctx.runName, session: path.basename(ctx.step ?? ''), date: at.toISOString() } } }) };
  });
  if (standing.length) { const file = path.join(ctx.step, SMALL_FIX_FILE); fs.writeFileSync(file, JSON.stringify([...readJson(file, []), ...standing], null, 2) + '\n'); }
  if (standing.length === Object.keys(answers).length) return { rule: 'R8', decision: 'answer', owner: standing.length, reason: `answered from the owner's standing answer for small fixes: ${Object.values(answers).join(' | ')}. Keep the fix small: it is checked at the merge against the owner's limits, never touches a requirement file and never removes a line from a test${standing.some((x) => x.testOnly) ? `. For ${standing.filter((x) => x.testOnly).map((x) => x.tor).join(' and ')} the fix is the missing test alone, in a test file: when that test passes against the code as built, the requirement is met; when it fails, the code is wrong, so ask the question again without "Fix now"` : ''}`, updatedInput: { ...ctx.input.tool_input, answers } };
  const owner = used.length + told + (looked ? 1 : 0) + standing.length;
  const byProto = taken.length + protoAgain; const all = Object.keys(answers).length;
  const source = [owner + byProto < all ? 'policy' : null, owner ? "the owner's recorded decision" : null, byProto ? "the owner's provisional setting for this run" : null].filter(Boolean).join(' and ');
  const annotations = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, { notes: v }]));
  // What the session is told with a provisional answer: nobody picked it just now, and what the option still asks of it.
  const how = !byProto ? '' : `. No person picked this just now: the owner chose a provisional run, which takes your own recommendation and shows it to them afterwards. Act on it as their decision and say in your report that autopilot answered it${Object.values(answers).some((a) => /^\W*leave as is\b/i.test(a)) ? '. Leave as is: do not fix it; list it in your final report under "Seen but not fixed", one line, and judge the epic on its requirements and gates' : ''}${Object.values(answers).some((a) => /^\W*amend\b/i.test(a)) ? '. Amend: write the change as the skill says, and say in its record that no person approved it: `approved_by = "autopilot (provisional run)"`, exactly that text and never a person\'s name' : ''}${Object.values(answers).some((a) => /^\W*defer\b/i.test(a)) ? ". Defer: do not ask which later epic builds the missing part; it is the one already named (in your recommendation, or in the implementer's Deferrals row). If no such epic's spec exists, Defer is not available: ask again, recommending Fix now or Stop" : ''}`;
  return { rule: 'R8', decision: 'answer', owner, ...(taken.length ? { prototype: taken } : {}), reason: `answered from ${source}: ${Object.values(answers).join(' | ')}${how}`, updatedInput: { ...ctx.input.tool_input, answers, ...(looked ? { annotations: { ...(ctx.input.tool_input.annotations ?? {}), ...annotations } } : {}) } };
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
  const gate = writeGate(ctx, { kind: 'plan-lint', skillStep: 'start-epic Step 4 (plan approval)', question: `The captured plan failed plan lint (${lint.problems.join('; ')}). Approve it as it is, or have it planned again?`, options: ['Approve this plan', 'Re-plan'], why: lint.problems.join('; '), artifacts: ctx.step ? [path.relative(ctx.state, path.join(ctx.step, 'plan.md')).split(path.sep).join('/')] : [] });
  return { rule: 'R9', decision: 'park', reason: `plan lint failed: ${lint.problems.join('; ')}`, gate, stop: 'autopilot: parked at human gate' };
}

// ---- R10: a catch-up session settles a clash, never a requirement --------------------------------

/**
 * A catch-up session (`catchup-N`, the driver's `doCatchUp`) merges the integration line into the epic's branch and
 * settles the clashing lines. A requirement is the owner's: it never writes under docs/requirements/, and asks instead.
 * The driver checks the result again after the session; this stops the write before it happens.
 */
function ruleR10(ctx, targets) {
  if (!/^catchup-\d+$/.test(path.basename(ctx.step ?? ''))) return null;
  for (const raw of targets) {
    const rel = path.relative(ctx.clone, realDeep(path.resolve(ctx.cwd, fromBash(String(raw))))).split(path.sep).join('/');
    if (rel === 'docs/requirements' || rel.startsWith('docs/requirements/')) return deny('R10', `a catch-up session never edits a requirement file (${rel}). Run \`git merge --abort\` and ask with AskUserQuestion: name the file and what each side wants`);
  }
  return null;
}

// ---- R11: connectors (MCP tools; #43, owner decisions 2026-11-25) --------------------------------
// Every connector the owner set up may be used, in Full and Provisional alike: an account for reading only, a browser
// on the app's own local pages (with the owner's saved sign-ins, so a "Sign in with …" the app redirects to completes).
// Never silence: silence sends the call to the host, which approves nothing.

const allow = (rule, reason) => ({ rule, decision: 'allow', reason });
/** A page a browser call may open: the app's (local) or a file in the clone or the session's scratch folder. */
function localPage(raw, ctx) {
  const u = pageAddress(raw);
  if (!u) return false;
  if (u.protocol === 'about:') return u.href === 'about:blank';
  if (u.protocol === 'file:') {
    let p; try { p = realDeep(fileURLToPath(u)); } catch { return false; }
    return within(p, ctx.clone) || (!!ctx.scratch && within(p, ctx.scratch));
  }
  return ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol) && isLocalHost(u.hostname);
}
/** The addresses a browser call would open: its `url`, and any address written into a script it runs on the page. */
function browserTargets(ti) {
  const out = [];
  if (ti.url !== undefined && ti.url !== null && ti.url !== '') out.push(String(ti.url));
  for (const k of ['function', 'code', 'script', 'expression']) {
    if (typeof ti[k] === 'string') out.push(...(ti[k].match(/\b(?:https?|wss?|file):\/\/[^\s'"`<>)\]]+/gi) ?? []));
  }
  return out;
}
/** A script that could take the page elsewhere, send data out or read the owner's cookies (seen in review: `location.href = '//evil.com'`). */
const LEAVING_SCRIPT = /location|\bopen\s*\(|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|import\s*\(|atob|href|\.src\b|\baction\b|submit|cookie|\beval\b|Function\s*\(|postMessage|navigator/i;
/** On a page that is not the app's (a sign-in it was sent to): finish it with a click, look, or leave. Nothing typed, no script. */
const OFFSITE_OK = new Set(['browser_click', 'browser_snapshot', 'browser_take_screenshot', 'browser_wait_for', 'browser_navigate', 'browser_navigate_back', 'browser_close', 'browser_tabs', 'browser_console_messages', 'browser_network_requests', 'browser_hover', 'browser_resize']);
/** The page the session's browser is on now: the last address a browser call's result named in this step's log. */
function currentPage(ctx) {
  if (!ctx.step) return null;
  let text = ''; try { text = fs.readFileSync(path.join(ctx.step, 'hooks.jsonl'), 'utf8'); } catch { return null; }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].includes('page_urls')) continue;
    let h; try { h = JSON.parse(lines[i]); } catch { continue; }
    if (Array.isArray(h.page_urls) && h.page_urls.length) return h.page_urls.at(-1);
  }
  return null;
}
/** A query whose text writes (SQL, GraphQL). */
const WRITING_QUERY = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|replace|upsert|mutation)\b/i;
/** Path arguments of a connector call go through the same jail as a file tool; a browser file it saves needs a writable place. */
function connectorPaths(ctx, t, ti) {
  const saves = /screenshot|pdf|save|download/.test(t.action);
  for (const k of ['path', 'paths', 'filename', 'file_path', 'filePath', 'directory', 'dir']) {
    for (const raw of [ti[k]].flat()) {
      if (typeof raw !== 'string' || !raw) continue;
      const c = classify(ctx, raw);
      if (c !== 'rw' && c !== 'ro') return deny('R2', `path jail — ${c}.${saves ? scratchHint(ctx) : ''}`);
      if (saves && k !== 'paths' && c === 'ro') return deny('R2', `path jail — ${raw} is read-only for this session.${scratchHint(ctx)}`);
    }
  }
  return null;
}
function ruleR11(ctx) {
  const tool = ctx.input.tool_name; const ti = ctx.input.tool_input ?? {};
  const t = mcpTool(tool);
  const jailed = connectorPaths(ctx, t, ti);
  if (jailed) return jailed;
  if (isBrowserAction(t.action)) {
    if (t.action === 'browser_run_code') return deny('R11', 'browser_run_code is denied: it reaches past the page (any site, the saved sign-ins). Use the page tools (navigate, click, type, evaluate) on your app\'s local pages');
    const away = browserTargets(ti).find((u) => !localPage(u, ctx));
    if (away) return deny('R11', `${t.action} to ${away} is denied: browser tools work on only your app's local pages; a sign-in page your app redirects to is fine`);
    const page = currentPage(ctx);
    if (page && !localPage(page, ctx) && !OFFSITE_OK.has(t.action) && !(t.action === 'browser_navigate' && ti.url)) {
      const host = pageAddress(page)?.hostname || page;
      return deny('R11', `${t.action} is denied: ${host} is not your app's page: there a session only clicks and looks (to finish a sign-in your app sent it to). Go back to your app's local page first`);
    }
    if (typeof (ti.function ?? ti.expression ?? ti.script) === 'string' && LEAVING_SCRIPT.test(ti.function ?? ti.expression ?? ti.script)) return deny('R11', `${t.action} is denied: a script on the page may not leave the page or send data out (location, open, fetch, cookies…). Use browser_navigate to one of your app's local pages, or click`);
    return allow('R11', `browser tool ${t.action} on the app's local pages`);
  }
  if (isReadAction(t.action, t.server) && !(/^query/i.test(t.action) && WRITING_QUERY.test(JSON.stringify(ti)))) return allow('R11', `a read through the ${t.label} connector`);
  return deny('R11', `${tool} is denied: connectors are read-only in autopilot (the owner's rule). Do not ask about it; list what it would have proven under "Not proven for real" in your report`);
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
  if (mcpTool(tool)) return ruleR11(ctx);

  let d = ruleR2Files(ctx);
  if (d) return d;
  if (tool === 'Bash') {
    const command = withoutHeredocBodies(String(ti.command ?? ''));
    const segs = parseBash(command);
    d = ruleR2Bash(ctx, segs, command) ?? ruleR3(ctx, segs, command) ?? ruleR4(segs) ?? ruleR10(ctx, bashWriteTargets(segs)) ?? ruleR7(ctx, bashWriteTargets(segs)) ?? ruleR5(ctx);
  } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    d = ruleR10(ctx, [String(ti.file_path ?? ti.notebook_path)]) ?? ruleR7(ctx, [String(ti.file_path ?? ti.notebook_path)]) ?? (tool === 'Write' ? ruleR5(ctx) : null);
  }
  return d;
}

/** The hook's stdout for a decision (null = print nothing). */
export function render(d) {
  if (!d) return null;
  const out = { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  if (d.decision === 'answer') Object.assign(out.hookSpecificOutput, { permissionDecision: 'allow', permissionDecisionReason: `autopilot ${d.rule}: ${d.reason}`, updatedInput: d.updatedInput });
  else if (d.decision === 'allow') Object.assign(out.hookSpecificOutput, { permissionDecision: 'allow', permissionDecisionReason: `autopilot ${d.rule}: ${d.reason}` });
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
      const scrub = (line) => (mcpTool(input.tool_name) ? line.replace(/([?&#](?:code|state|token|access_token|id_token|refresh_token|session|sig|signature|auth)=)[^&#\s"\\]+/gi, '$1…') : line); // a sign-in code in an address
      fs.appendFileSync(path.join(step, 'hooks.jsonl'), scrub(JSON.stringify({
        t: new Date().toISOString(), hook: 'PreToolUse', tool_name: input.tool_name, rule: d?.rule ?? null, decision: d?.decision ?? 'pass', reason: d?.reason ?? null, gate: d?.gate ?? undefined, prototype: d?.prototype ?? undefined,
        agent_id: input.agent_id, agent_type: input.agent_type, tool_use_id: input.tool_use_id, tool_input: brief && brief.length > 4000 ? brief.slice(0, 4000) + '…' : input.tool_input ?? null,
      })) + '\n');
    } catch { /* logging never changes a decision */ }
  }
  const out = render(d);
  if (out) process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
