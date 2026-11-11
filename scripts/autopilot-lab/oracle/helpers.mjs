// Shared by the hidden oracle tests. They are black-box: they run the project's CLI
// (`$LEDGER_ROOT/bin/ledger.js`) in a throwaway directory and look only at what a user would see.
// They are never copied into a seeded project; `lab.mjs evaluate` points LEDGER_ROOT at an export
// of the autopilot clone's integration line.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.env.LEDGER_ROOT;
if (!ROOT) throw new Error('LEDGER_ROOT is not set: run the oracle through `lab.mjs evaluate`');
const BIN = path.join(ROOT, 'bin', 'ledger.js');

/** A fresh working directory with `ledger(...args)`, `write`, `read`, and `ledgerJson`. */
export function sandbox(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-oracle-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, HOME: dir, USERPROFILE: dir };
  for (const k of ['NODE_TEST_CONTEXT', 'LEDGERRC', 'LEDGER_RATES_URL', 'LOG_LEVEL']) delete env[k];
  const s = {
    dir,
    write: (name, text) => fs.writeFileSync(path.join(dir, name), text),
    read: (name) => fs.readFileSync(path.join(dir, name), 'utf8'),
    exists: (name) => fs.existsSync(path.join(dir, name)),
    ledgerJson: () => JSON.parse(fs.readFileSync(path.join(dir, 'ledger.json'), 'utf8')),
    /** Writes ledger.json directly, as "a categorized ledger.json holding these transactions". */
    seed: (rows) => fs.writeFileSync(path.join(dir, 'ledger.json'), JSON.stringify({ transactions: rows.map(([date, amountCents, description, category]) => ({ date, amountCents, description, ...(category ? { category } : {}) })) })),
    ledger: (args, extraEnv = {}) => {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000 });
      return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
  };
  return s;
}
export const csv = (...rows) => ['date,amount,description', ...rows].join('\n') + '\n';
/** The output line that names `word`, or '' when there is none. */
export const lineWith = (text, word) => text.split('\n').find((l) => l.toLowerCase().includes(word.toLowerCase())) ?? '';
