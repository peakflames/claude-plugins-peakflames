// Spike host: drives `claude -p --input-format stream-json --permission-prompt-tool stdio`.
// usage: node host.mjs <prompt-file> <stream-out> -- <claude args…>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
const [promptFile, streamOut, , ...args] = process.argv.slice(2);
const out = fs.createWriteStream(streamOut);
const child = spawn('claude', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio', ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: fs.readFileSync(promptFile, 'utf8') }] } });
readline.createInterface({ input: child.stdout }).on('line', (line) => {
  out.write(line + '\n');
  let d; try { d = JSON.parse(line); } catch { return; }
  if (d.type === 'control_request') {
    const r = d.request;
    console.log('CONTROL_REQUEST', r.subtype, r.tool_name ?? '', JSON.stringify(r.input ?? r).slice(0, 200));
    const policy = process.env.HOST_POLICY ?? 'deny';
    const response = r.subtype === 'can_use_tool'
      ? (policy === 'allow' ? { behavior: 'allow', updatedInput: r.input } : { behavior: 'deny', message: 'autopilot: the host approves nothing; this request was not covered by a rule' })
      : {};
    send({ type: 'control_response', response: { subtype: 'success', request_id: d.request_id, response } });
  }
  if (d.type === 'result') child.stdin.end();
});
child.on('exit', (code) => { console.log('exit', code); process.exit(code ?? 1); });
