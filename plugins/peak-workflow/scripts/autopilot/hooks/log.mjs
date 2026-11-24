#!/usr/bin/env node
// Autopilot referee: append-only log of what a session did (PostToolUse, PostToolUseFailure,
// SessionStart). One JSON line per event in <step>/hooks.jsonl; it feeds the auditor's digest.
// Never prints a decision and never fails the tool call.
import fs from 'node:fs';
import path from 'node:path';

const clip = (v, max) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? null); return s.length > max ? s.slice(0, max) + `… (${s.length} chars)` : v ?? null; };
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const step = process.env.AUTOPILOT_STEP;
  if (step) {
    fs.appendFileSync(path.join(step, 'hooks.jsonl'), JSON.stringify({
      t: new Date().toISOString(), hook: input.hook_event_name, tool_name: input.tool_name, tool_use_id: input.tool_use_id,
      agent_id: input.agent_id, agent_type: input.agent_type, session_id: input.session_id, source: input.source,
      tool_input: clip(input.tool_input, 4000), tool_response: clip(input.tool_response, 2000), error: clip(input.error, 2000),
    }) + '\n');
  }
} catch { /* a log line is never worth a failed tool call */ }
