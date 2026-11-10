#!/usr/bin/env node
// check-transcript — check a /peak-media:plate-factory session transcript (AC-ORC-01..04).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT } from '../../lib/cli.mjs';
import { loadTranscript, checkAll } from './transcript.mjs';

const spec = {
  name: 'check-transcript',
  summary: 'check a plate-factory session transcript for the orchestrator gates (AC-ORC-01..04)',
  usage: 'check-transcript [options] <session.jsonl>',
  description: `
Reads a Claude Code session JSONL (~/.claude/projects/<project>/<session>.jsonl) and the subagent
transcripts in <session>/subagents/, then reports PASS/FAIL with the offending JSONL line for:
  AC-ORC-01  GATE 0–9 lines each pass, first passes in order (user gates asked with AskUserQuestion,
             a cold-read Agent before gate 1, gate 9 names out/final.mp4) — the transcript part only
  AC-ORC-02  no plate written while the storyboard is open (before the first approval, or after a
             storyboard re-run or a REJECTED gate 4 until it is approved again)
  AC-ORC-03  every rendered plate has 1–3 self-review rounds (contact-sheet runs on
             renders/plates/<id>.mp4) before the reviewer Agent naming review-rubric
  AC-ORC-04  runtimes.md Read before the first plate was written
Rules (gate lines, plate writes, rounds, the storyboard window): skills/plate-factory/references/
stages.md § "What the transcript check counts".
Exit 0 when all pass, 1 when any fails.`,
  options: {
    subagents: { type: 'string', arg: 'dir', desc: 'Subagent transcripts folder (default: <session>/subagents beside the JSONL)' },
    json: { type: 'boolean', desc: 'Print the results as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: ['check-transcript ~/.claude/projects/-Users-me-videos-orc-01/<session-id>.jsonl'],
};

async function main({ values, positionals }) {
  let events;
  try { events = loadTranscript(path.resolve(positionals[0]), { subagentsDir: values.subagents && path.resolve(values.subagents) }); } catch (e) { throw new CliError(e.message); }
  if (!events.length) throw new CliError(`${positionals[0]} has no assistant or tool events — is it a session JSONL?`);
  const results = checkAll(events);
  if (values.json) process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  else for (const r of results) process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.message}\n`);
  return results.every((r) => r.ok) ? EXIT.OK : EXIT.FAIL;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli(spec, main);
