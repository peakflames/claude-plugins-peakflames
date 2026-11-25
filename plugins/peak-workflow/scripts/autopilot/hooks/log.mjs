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
    // A browser call's addresses can carry a sign-in code: it never reaches the log (nor the auditor's digest made from it).
    const scrub = (line) => (/^mcp__/.test(input.tool_name ?? '') ? line.replace(/([?&#](?:code|state|token|access_token|id_token|refresh_token|session|sig|signature|auth)=)[^&#\s"\\]+/gi, '$1…') : line);
    fs.appendFileSync(path.join(step, 'hooks.jsonl'), scrub(JSON.stringify({
      t: new Date().toISOString(), hook: input.hook_event_name, tool_name: input.tool_name, tool_use_id: input.tool_use_id,
      agent_id: input.agent_id, agent_type: input.agent_type, session_id: input.session_id, source: input.source,
      tool_input: clip(input.tool_input, 4000), tool_response: clip(input.tool_response, 2000), error: clip(input.error, 2000),
      // A browser call's page addresses, from the whole result: the clipped one can lose them (the report lists off-site pages).
      ...(/^mcp__.+__browser_/.test(input.tool_name ?? '') ? { page_urls: [...JSON.stringify(input.tool_response ?? '').matchAll(/Page URL:\s*([^\s"\\]+)/g)].map((m) => m[1].replace(/[?#].*$/, '')) } : {}),
    })) + '\n');
  }
} catch { /* a log line is never worth a failed tool call */ }
