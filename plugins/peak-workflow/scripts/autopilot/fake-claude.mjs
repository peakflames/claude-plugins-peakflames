#!/usr/bin/env node
// Test double for `claude` in the autopilot driver's tests. It never calls a model.
//
// The driver launches it exactly as it launches Claude Code (`--claude-bin fake-claude.mjs`).
// It finds its script in the scenario file named by FAKE_CLAUDE_SCENARIO:
//
//   { "<epic>/<step>": script,      e.g. "Lg1Csv7/build-1"   (most specific)
//     "<epic>/<kind>": script,      e.g. "Lg1Csv7/build"
//     "*/<kind>":      script }     kinds: plan, build, verify, fix, audit
//
// An audit step with no script is a clean audit: `structured_output` with no findings. A scripted
// one sets `result.structured_output` to what the auditor would return. Either way an auditor first
// opens every changed code file of its bundle's diff.patch through the referee (PreToolUse, then the
// PostToolUse log the driver counts), and its result gets a `checked` entry per anchor in bundle.json
// unless it has its own. `reads: [paths]` (relative to the clone) opens only those; `reads: false` none.
//
//   script = { "actions": [ … ], "result": { …overrides… } | false, "exit": 0 }
//
// Actions run in order in the session's cwd (the private clone). Strings may use {{step}}
// (the step directory), {{state}} (the workspace), {{plugin}} and {{epic}}.
//
// The referee sees every action a real session would need a tool call for, as the real CLI's
// PreToolUse hook does: branch, checkout, rm, commit, merge and exec as the `Bash` command a session
// would run, write and sidecar as `Write` or `Edit` on the file. A refused action is skipped,
// recorded in permission_denials, and the script goes on, as a session does after a refusal;
// `continue: false` ends the session. Each call's outcome is a line in <step>/fake-tools.jsonl.
// A script says which of its actions it expects to be refused, with `refused: true`: a refusal
// it did not expect, or an expected one that did not come, ends the fake with an error (exit 70,
// the reason in stderr.log), so a test never passes on work that silently did not happen.
// `unchecked: "<why>"` on an action skips the referee. It is for what no tool call of the session
// produces: a file the hooks or the driver write, something the owner or the test does, a
// command's own side effect. The reason is required.
//   {do:"branch", name}                 create and check out, or check out if it exists
//   {do:"checkout", name}
//   {do:"write", path, content, append?}    {do:"rm", path}
//   {do:"sidecar", set:{key:value}}     edit this epic's status sidecar
//   {do:"commit", message}              git add -A && git commit
//   {do:"merge", branch, message?}      git merge --no-ff into the current branch
//   {do:"exec", cmd}                    any shell command
//   {do:"plan", text}                   what hook R9 does: write <step>/plan.md (never put to the referee)
//   {do:"gate", gate:{…}}               what hook R8 does on a park: write gates/<epic>-<n>.json (likewise)
//   {do:"control_request", tool_name, input?}   ask the host for permission; the answer is logged
//   {do:"tool", tool_name, tool_input, tool_response?}  a tool call that does nothing but ask the referee (an
//                                       AskUserQuestion, a call expected to be refused, a connector call). With
//                                       `refused` it is checked like any action; with `tool_response`, an allowed
//                                       call's PostToolUse log line carries it (a browser call's "Page URL:")
//
// `claude mcp list` (what readiness runs to name the owner's connectors) prints the scenario's
// `"mcp list": { out, exit }`, or that no server is set up.
//   {do:"sleep", ms}   {do:"hang"}   {do:"crash", code?}
//   {do:"emit", line}                   one raw stream line, as the CLI writes it (a rate_limit_event)
//   {do:"transcript", line}             one line of the session's own transcript, which the CLI keeps at
//                                       $CLAUDE_CONFIG_DIR/projects/<cwd slug>/<session id>.jsonl (only when that is set)
//
// `result: false` ends without a result line (a CLI crash). A result with
// `subtype: "error_max_budget_usd"` or `"error_max_turns"` is a budget stop.
// Every invocation is appended to FAKE_CLAUDE_LOG (JSON lines) when that is set.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { changedCodeFiles } from './audit.mjs';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
const hostMode = flag('--input-format') === 'stream-json';
const settings = flag('--settings');
const stepDir = settings ? path.dirname(settings) : process.cwd();
const step = path.basename(stepDir);
const kind = step.replace(/-\d+$/, '');
const epic = process.env.AUTOPILOT_EPIC ?? path.basename(path.dirname(stepDir));
const state = process.env.AUTOPILOT_STATE ?? path.resolve(stepDir, '..', '..', '..', '..', '..'); // the workspace
const runName = path.basename(process.env.AUTOPILOT_RUN ?? path.resolve(stepDir, '..', '..', '..'));
const plugin = flag('--plugin-dir') ?? '';
const sessionId = flag('--session-id') ?? 'fake-session';
const started = Date.now();

const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fill(v) {
  if (typeof v === 'string') return v.replaceAll('{{step}}', stepDir).replaceAll('{{state}}', state).replaceAll('{{plugin}}', plugin).replaceAll('{{epic}}', epic);
  if (Array.isArray(v)) return v.map(fill);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
  return v;
}

const denials = [];
let hookStopped = false;
let toolCalls = 0;
let lastUseId = null;
let lastReason = '';
const lines = readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const stdinClosed = new Promise((r) => process.stdin.on('end', r).on('close', r));

const q = (v) => `'${String(v).replaceAll("'", "'\\''")}'`;
const branchExists = (name) => { try { git('rev-parse', '--verify', '-q', `refs/heads/${name}`); return true; } catch { return false; } };

/**
 * Runs the session's real PreToolUse hook from settings.json, as Claude Code does before a tool
 * call. Returns true when the call may go ahead. A deny is recorded in permission_denials;
 * `continue: false` ends the session.
 */
function referee(tool_name, tool_input = {}, { quiet = false } = {}) {
  const hook = settings ? JSON.parse(fs.readFileSync(settings, 'utf8')).hooks?.PreToolUse?.[0]?.hooks?.[0]?.command : null;
  if (!hook) return true; // launched without the referee's settings: nothing to ask
  const r = spawnSync('sh', ['-c', hook], { encoding: 'utf8', windowsHide: true, input: JSON.stringify({ session_id: sessionId, cwd: process.cwd(), hook_event_name: 'PreToolUse', permission_mode: flag('--permission-mode'), tool_name, tool_input, tool_use_id: (lastUseId = `toolu_${toolCalls++}`) }) });
  let out = null; try { out = r.stdout ? JSON.parse(r.stdout) : null; } catch { /* not JSON: no decision, as Claude Code reads it */ }
  if (!quiet) fs.appendFileSync(path.join(stepDir, 'fake-tools.jsonl'), JSON.stringify({ tool_name, exit: r.status, out }) + '\n');
  const deny = out?.hookSpecificOutput?.permissionDecision === 'deny';
  if (deny) { denials.push({ tool_name, tool_input }); lastReason = out.hookSpecificOutput.permissionDecisionReason; }
  if (out?.continue === false) hookStopped = true;
  return !deny && !hookStopped;
}

/** After a tool call went ahead: the session's real PostToolUse hook (the referee's log), as Claude Code runs it. Only the auditor's, whose reads the driver counts. */
function logged(tool_name, tool_input = {}, tool_response = undefined) {
  if (kind !== 'audit' && tool_response === undefined) return;
  const hook = settings ? JSON.parse(fs.readFileSync(settings, 'utf8')).hooks?.PostToolUse?.[0]?.hooks?.[0]?.command : null;
  if (hook) spawnSync('sh', ['-c', hook], { encoding: 'utf8', windowsHide: true, input: JSON.stringify({ session_id: sessionId, cwd: process.cwd(), hook_event_name: 'PostToolUse', tool_name, tool_input, tool_response: tool_response ?? { type: 'text' }, tool_use_id: lastUseId }) }); // the id of the call the referee just allowed, as Claude Code pairs them
}

/** The tool call a real session would make for a scripted action, or null for an action that makes none. */
function toolCall(a) {
  switch (a.do) {
    case 'branch': return ['Bash', { command: `git checkout ${branchExists(a.name) ? '' : '-b '}${a.name}` }];
    case 'checkout': return ['Bash', { command: `git checkout ${a.name}` }];
    case 'write': return a.append && fs.existsSync(a.path)
      ? ['Edit', { file_path: path.resolve(a.path), old_string: '', new_string: a.content }]
      : ['Write', { file_path: path.resolve(a.path), content: a.content }];
    case 'rm': return ['Bash', { command: `rm -f ${q(a.path)}` }];
    case 'sidecar': return ['Edit', { file_path: path.resolve(`docs/implementation-plan/status/epic-${epic}.md`), old_string: '', new_string: JSON.stringify(a.set) }];
    case 'commit': return ['Bash', { command: `git add -A && git commit -m ${q(a.message)}` }];
    case 'merge': return ['Bash', { command: `git merge --no-ff ${a.branch} -m ${q(a.message ?? `Merge branch '${a.branch}'`)}` }];
    case 'exec': return ['Bash', { command: a.cmd }];
    default: return null;
  }
}

async function act(a) {
  // Every action that stands for a tool call is put to the referee first, as the real CLI does. A refused action is
  // skipped and the script goes on, as a session does after a refusal.
  if ('unchecked' in a && !(typeof a.unchecked === 'string' && a.unchecked.trim())) throw new Error(`fake-claude: \`unchecked\` on a ${a.do} action must be the reason, in words`);
  const call = a.unchecked ? null : toolCall(a);
  if (call) {
    const before = denials.length;
    const allowed = referee(...call);
    const denied = denials.length > before;
    if (denied !== !!a.refused) throw new Error(`fake-claude: the referee ${denied ? 'refused' : 'allowed'} a ${a.do} action the script ${a.refused ? 'marks \`refused\`' : 'does not mark \`refused: true\`'}: ${JSON.stringify(call[1]).slice(0, 300)}${denied ? ` — ${lastReason}` : ''}`);
    if (!allowed) return;
  }
  switch (a.do) {
    case 'branch':
      try { git('checkout', '-q', '-b', a.name); } catch { git('checkout', '-q', a.name); }
      break;
    case 'checkout': git('checkout', '-q', a.name); break;
    case 'write':
      fs.mkdirSync(path.dirname(path.resolve(a.path)), { recursive: true });
      (a.append ? fs.appendFileSync : fs.writeFileSync)(a.path, a.content);
      break;
    case 'rm': fs.rmSync(a.path, { force: true }); break;
    case 'sidecar': {
      const file = `docs/implementation-plan/status/epic-${epic}.md`;
      let text = fs.readFileSync(file, 'utf8');
      for (const [k, v] of Object.entries(a.set)) {
        const re = new RegExp(`^${k}:.*$`, 'm');
        text = re.test(text) ? text.replace(re, `${k}: ${v}`) : text.replace(/\n*$/, `\n${k}: ${v}\n`);
      }
      fs.writeFileSync(file, text);
      break;
    }
    case 'commit': git('add', '-A'); git('commit', '-q', '--allow-empty', '-m', a.message); break;
    case 'merge': git('merge', '-q', '--no-ff', a.branch, '-m', a.message ?? `Merge branch '${a.branch}'`); break;
    case 'exec': execSync(a.cmd, { stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true, ...(process.platform === 'win32' ? { shell: 'sh' } : {}) }); break;
    case 'plan': fs.writeFileSync(path.join(stepDir, 'plan.md'), a.text); break;
    case 'gate': {
      const dir = path.join(state, 'gates');
      fs.mkdirSync(dir, { recursive: true });
      const n = fs.readdirSync(dir).filter((f) => f.startsWith(`${epic}-`)).length + 1;
      fs.writeFileSync(path.join(dir, `${epic}-${n}.json`), JSON.stringify({ epic, run: runName, session: step, decided: null, ...a.gate }, null, 2));
      break;
    }
    case 'control_request': {
      emit({ type: 'control_request', request_id: 'req-1', request: { subtype: 'can_use_tool', tool_name: a.tool_name, input: a.input ?? {} } });
      const { value } = await lines.next();
      fs.writeFileSync(path.join(stepDir, 'fake-control-response.json'), value ?? 'null');
      break;
    }
    case 'tool': {
      const before = denials.length;
      const ok = referee(a.tool_name, a.tool_input ?? {});
      if ('refused' in a && (denials.length > before) !== !!a.refused) throw new Error(`fake-claude: the referee ${denials.length > before ? `refused a ${a.tool_name} call the script does not mark \`refused: true\` — ${lastReason}` : `allowed a ${a.tool_name} call the script marks \`refused\``}`);
      if (ok) logged(a.tool_name, a.tool_input ?? {}, a.tool_response);
      break;
    }
    case 'sleep': await sleep(a.ms); break;
    case 'hang': await new Promise(() => setInterval(() => {}, 1 << 30)); break;
    case 'crash': process.exit(a.code ?? 1); break;
    case 'emit': emit({ ...a.line, session_id: sessionId }); break;
    case 'transcript': {
      if (!process.env.CLAUDE_CONFIG_DIR) break;
      const dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', process.cwd().replace(/[^A-Za-z0-9]/g, '-'));
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, `${sessionId}.jsonl`), JSON.stringify({ ...a.line, sessionId }) + '\n');
      break;
    }
    default: throw new Error(`fake-claude: unknown action ${a.do}`);
  }
}

async function main() {
  if (argv[0] === 'mcp' && argv[1] === 'list') {
    let s = {}; try { s = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_SCENARIO, 'utf8'))['mcp list'] ?? {}; } catch { /* no scenario */ }
    process.stdout.write(`${s.out ?? 'No MCP servers configured. Use `claude mcp add` to add a server.'}\n`);
    process.exit(s.exit ?? 0);
  }
  let prompt = null;
  if (hostMode) {
    const { value } = await lines.next();
    try { prompt = JSON.parse(value).message.content[0].text; } catch { prompt = value ?? null; }
  } else prompt = argv[argv.indexOf('-p') + 1] ?? null;

  if (process.env.FAKE_CLAUDE_LOG) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(AUTOPILOT_|CLAUDE_CODE_|BASH_)/.test(k)));
    fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ key: `${epic}/${step}`, epic, step, kind, argv, cwd: process.cwd(), env, prompt, pid: process.pid }) + '\n');
  }
  const scenario = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_SCENARIO, 'utf8'));
  const script = fill(scenario[`${epic}/${step}`] ?? scenario[`${epic}/${kind}`] ?? scenario[`*/${kind}`]
    ?? (kind === 'audit' ? { result: { structured_output: { findings: [], recommend: 'proceed', summary: 'fake auditor: nothing found' } } } : undefined));
  if (!script) throw new Error(`fake-claude: the scenario has no script for ${epic}/${step}`);

  let version = 'unknown';
  try { version = JSON.parse(fs.readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { /* no plugin dir */ }
  if (flag('--output-format') !== 'json') emit({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), model: flag('--model'), permissionMode: flag('--permission-mode'), claude_code_version: 'fake', tools: ['Bash', 'Read', 'Edit', 'Write'], plugins: [{ name: 'peak-workflow', path: plugin, source: 'peak-workflow@inline', version }] });

  // An auditor opens the changed code (the driver counts it) and says, per anchor, what it checked.
  let bundle = null;
  if (kind === 'audit') {
    try { bundle = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'bundle.json'), 'utf8')); } catch { /* not in a bundle */ }
    const diff = fs.existsSync('diff.patch') ? fs.readFileSync('diff.patch', 'utf8') : '';
    const reads = script.reads === false ? [] : Array.isArray(script.reads) ? script.reads : changedCodeFiles(diff);
    for (const rel of reads) {
      const input = { file_path: path.join(bundle?.clone ?? process.cwd(), rel) };
      if (referee('Read', input, { quiet: true })) logged('Read', input);
    }
  }

  for (const a of script.actions ?? []) { await act(a); if (hookStopped) break; }
  const out = script.result?.structured_output;
  if (kind === 'audit' && out && typeof out === 'object' && !('checked' in out)) {
    out.checked = (bundle?.anchors ?? []).map((tor) => ({ tor, tests: [`test/(fake) ${tor}`], code: ['src/(fake)'], whenExercised: true, note: 'fake auditor' }));
  }

  if (script.result === false) process.exit(script.exit ?? 1);
  emit({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: sessionId, num_turns: 3, total_cost_usd: 0.01, duration_ms: Date.now() - started, stop_reason: 'end_turn', terminal_reason: 'completed', usage: {}, modelUsage: {}, ...script.result, permission_denials: denials, ...(hookStopped ? { terminal_reason: 'hook_stopped' } : {}) });
  if (hostMode) await stdinClosed; // the real CLI exits when the host closes stdin
  process.exit(script.exit ?? 0);
}

main().catch((err) => { process.stderr.write(`${err.stack ?? err}\n`); process.exit(70); });
