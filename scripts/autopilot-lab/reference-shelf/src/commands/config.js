import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const summary = 'config   check the settings file';
const KINDS = { pageTitle: 'string', finishedLast: 'boolean' };
export function run(args, io) {
  const file = process.env.SHELFRC || path.join(os.homedir(), '.shelfrc');
  const fail = (what) => { io.stderr.write(`Error: ${file}: ${what}\n`); return 1; };
  if (!fs.existsSync(file)) { io.stdout.write('Settings OK (no settings file; the defaults apply)\n'); return 0; }
  let settings;
  try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fail('not valid JSON. Fix the file or delete it to use the defaults.'); }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return fail('not a JSON object. Fix the file or delete it to use the defaults.');
  for (const [key, value] of Object.entries(settings)) {
    if (!(key in KINDS)) return fail(`unknown key "${key}". Remove it; the keys are ${Object.keys(KINDS).join(' and ')}.`);
    if (typeof value !== KINDS[key]) return fail(`"${key}" must be a ${KINDS[key]}. Correct its value.`);
  }
  io.stdout.write('Settings OK\n');
  return 0;
}
