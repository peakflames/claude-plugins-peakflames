#!/usr/bin/env node
// Test double for `claude` in the autopilot driver's tests. It never calls a model.
//
// The driver launches it exactly as it launches Claude Code (`--claude-bin fake-claude.mjs`).
// It finds its script in the scenario file named by FAKE_CLAUDE_SCENARIO:
//
//   { "<epic>/<step>": script,      e.g. "Lg1Csv7/build-1"   (most specific)
//     "<epic>/<kind>": script,      e.g. "Lg1Csv7/build"
//     "*/<kind>":      script }     kinds: plan, build, verify, plan-fix, fix
//
//   script = { "actions": [ … ], "result": { …overrides… } | false, "exit": 0 }
//
// Actions run in order in the session's cwd (the private clone). Strings may use {{step}}
// (the step directory), {{state}}, {{plugin}} and {{epic}}.
//   {do:"branch", name}                 create and check out, or check out if it exists
//   {do:"checkout", name}
//   {do:"write", path, content, append?}    {do:"rm", path}
//   {do:"sidecar", set:{key:value}}     edit this epic's status sidecar
//   {do:"commit", message}              git add -A && git commit
//   {do:"merge", branch, message?}      git merge --no-ff into the current branch
//   {do:"exec", cmd}                    any shell command
//   {do:"plan", text}                   what hook R9 does: write <step>/plan.md
//   {do:"gate", gate:{…}}               what hook R8 does on a park: write gates/<epic>-<n>.json
//   {do:"control_request", tool_name, input?}   ask the host for permission; the answer is logged
//   {do:"tool", tool_name, tool_input}  run the session's real PreToolUse hook from settings.json, as
//                                       Claude Code would before a tool call. A deny is recorded in
//                                       permission_denials; `continue: false` ends the session
//                                       (terminal_reason hook_stopped). Outputs go to <step>/fake-tools.jsonl
//   {do:"sleep", ms}   {do:"hang"}   {do:"crash", code?}
//
// `result: false` ends without a result line (a CLI crash). A result with
// `subtype: "error_max_budget_usd"` or `"error_max_turns"` is a budget stop.
// Every invocation is appended to FAKE_CLAUDE_LOG (JSON lines) when that is set.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
const hostMode = flag('--input-format') === 'stream-json';
const settings = flag('--settings');
const stepDir = settings ? path.dirname(settings) : process.cwd();
const step = path.basename(stepDir);
const kind = step.replace(/-\d+$/, '');
const epic = process.env.AUTOPILOT_EPIC ?? path.basename(path.dirname(stepDir));
const state = process.env.AUTOPILOT_STATE ?? path.resolve(stepDir, '..', '..', '..');
const plugin = flag('--plugin-dir') ?? '';
const sessionId = flag('--session-id') ?? 'fake-session';
const started = Date.now();

const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fill(v) {
  if (typeof v === 'string') return v.replaceAll('{{step}}', stepDir).replaceAll('{{state}}', state).replaceAll('{{plugin}}', plugin).replaceAll('{{epic}}', epic);
  if (Array.isArray(v)) return v.map(fill);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
  return v;
}

const denials = [];
let hookStopped = false;
const lines = readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const stdinClosed = new Promise((r) => process.stdin.on('end', r).on('close', r));

async function act(a) {
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
    case 'exec': execSync(a.cmd, { stdio: ['ignore', 'ignore', 'inherit'] }); break;
    case 'plan': fs.writeFileSync(path.join(stepDir, 'plan.md'), a.text); break;
    case 'gate': {
      const dir = path.join(state, 'gates');
      fs.mkdirSync(dir, { recursive: true });
      const n = fs.readdirSync(dir).filter((f) => f.startsWith(`${epic}-`)).length + 1;
      fs.writeFileSync(path.join(dir, `${epic}-${n}.json`), JSON.stringify({ epic, session: step, decided: null, ...a.gate }, null, 2));
      break;
    }
    case 'control_request': {
      emit({ type: 'control_request', request_id: 'req-1', request: { subtype: 'can_use_tool', tool_name: a.tool_name, input: a.input ?? {} } });
      const { value } = await lines.next();
      fs.writeFileSync(path.join(stepDir, 'fake-control-response.json'), value ?? 'null');
      break;
    }
    case 'tool': {
      const hook = JSON.parse(fs.readFileSync(settings, 'utf8')).hooks.PreToolUse[0].hooks[0].command;
      const r = spawnSync('sh', ['-c', hook], { encoding: 'utf8', input: JSON.stringify({ session_id: sessionId, cwd: process.cwd(), hook_event_name: 'PreToolUse', permission_mode: flag('--permission-mode'), tool_name: a.tool_name, tool_input: a.tool_input ?? {}, tool_use_id: `toolu_${denials.length}` }) });
      const out = r.stdout ? JSON.parse(r.stdout) : null;
      fs.appendFileSync(path.join(stepDir, 'fake-tools.jsonl'), JSON.stringify({ tool_name: a.tool_name, exit: r.status, out }) + '\n');
      if (out?.hookSpecificOutput?.permissionDecision === 'deny') denials.push({ tool_name: a.tool_name, tool_input: a.tool_input ?? {} });
      if (out?.continue === false) hookStopped = true;
      break;
    }
    case 'sleep': await sleep(a.ms); break;
    case 'hang': await new Promise(() => setInterval(() => {}, 1 << 30)); break;
    case 'crash': process.exit(a.code ?? 1); break;
    default: throw new Error(`fake-claude: unknown action ${a.do}`);
  }
}

async function main() {
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
  const script = fill(scenario[`${epic}/${step}`] ?? scenario[`${epic}/${kind}`] ?? scenario[`*/${kind}`]);
  if (!script) throw new Error(`fake-claude: the scenario has no script for ${epic}/${step}`);

  let version = 'unknown';
  try { version = JSON.parse(fs.readFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { /* no plugin dir */ }
  emit({ type: 'system', subtype: 'init', session_id: sessionId, cwd: process.cwd(), model: flag('--model'), permissionMode: flag('--permission-mode'), claude_code_version: 'fake', tools: ['Bash', 'Read', 'Edit', 'Write'], plugins: [{ name: 'peak-workflow', path: plugin, source: 'peak-workflow@inline', version }] });

  for (const a of script.actions ?? []) { await act(a); if (hookStopped) break; }

  if (script.result === false) process.exit(script.exit ?? 1);
  emit({ type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: sessionId, num_turns: 3, total_cost_usd: 0.01, duration_ms: Date.now() - started, stop_reason: 'end_turn', terminal_reason: 'completed', usage: {}, modelUsage: {}, ...script.result, permission_denials: denials, ...(hookStopped ? { terminal_reason: 'hook_stopped' } : {}) });
  if (hostMode) await stdinClosed; // the real CLI exits when the host closes stdin
  process.exit(script.exit ?? 0);
}

main().catch((err) => { process.stderr.write(`${err.stack ?? err}\n`); process.exit(70); });
