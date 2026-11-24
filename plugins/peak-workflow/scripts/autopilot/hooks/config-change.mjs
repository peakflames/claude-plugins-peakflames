#!/usr/bin/env node
// Autopilot referee: the ConfigChange hook. A session may not change settings while it runs,
// so it cannot unload its own referee. (Managed policy settings cannot be blocked by a hook.)
import fs from 'node:fs';
import path from 'node:path';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* block anyway */ }
if (process.env.AUTOPILOT_STATE) {
  const reason = 'autopilot: settings may not change during an unattended session';
  try { if (process.env.AUTOPILOT_STEP) fs.appendFileSync(path.join(process.env.AUTOPILOT_STEP, 'hooks.jsonl'), JSON.stringify({ t: new Date().toISOString(), hook: 'ConfigChange', decision: 'block', source: input.source ?? null, file_path: input.file_path ?? null }) + '\n'); } catch { /* still block */ }
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}
