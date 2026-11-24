// Spike PreToolUse hook: log every input, deny Bash `echo …` and `git push`, answer AskUserQuestion from SPIKE_ANSWERS.
import fs from 'node:fs';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const log = process.env.SPIKE_LOG;
const out = (o) => { if (log) fs.appendFileSync(log, JSON.stringify({ t: new Date().toISOString(), hook: 'pretool', input, output: o }) + '\n'); if (o) process.stdout.write(JSON.stringify(o)); process.exit(0); };
const deny = (reason, extra = {}) => out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `autopilot: ${reason}` }, ...extra });
const cmd = input.tool_input?.command ?? '';
if (input.tool_name === 'Bash' && /^\s*echo\b/.test(cmd)) deny('spike rule — echo is denied');
if (input.tool_name === 'Bash' && /\bgit\s+push\b/.test(cmd)) deny('R3 — git push is denied');
if (!process.env.SPIKE_ALLOW_BG && input.tool_input?.run_in_background === true) deny('R6 — background tasks are denied');
if (input.tool_name === 'AskUserQuestion' && process.env.SPIKE_ANSWERS) {
  const table = JSON.parse(process.env.SPIKE_ANSWERS); // [{match, answer}]
  const answers = {};
  for (const q of input.tool_input.questions ?? []) {
    const hit = table.find((r) => q.question.includes(r.match));
    if (!hit) deny('parked at human gate', { continue: false, stopReason: 'autopilot: parked at human gate' });
    answers[q.question] = hit.answer;
  }
  out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...input.tool_input, answers } } });
}
if (input.tool_name === 'ExitPlanMode' && process.env.SPIKE_PLAN_OUT) {
  fs.writeFileSync(process.env.SPIKE_PLAN_OUT, input.tool_input?.plan ?? JSON.stringify(input.tool_input));
  deny('plan captured', { continue: false, stopReason: 'autopilot: plan captured' });
}
out(null);
