import fs from 'node:fs';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
if (process.env.SPIKE_LOG) fs.appendFileSync(process.env.SPIKE_LOG, JSON.stringify({ t: new Date().toISOString(), hook: input.hook_event_name, input }) + '\n');
