// Shared by the hidden oracle tests of the `shelf` project (scenario D). They are black-box: they
// run the project's CLI (`$SHELF_ROOT/bin/shelf.js`) in a throwaway directory and look only at
// what a user would see. They are never copied into a seeded project; `lab.mjs evaluate` points
// SHELF_ROOT at an export of the autopilot clone's integration line.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.env.SHELF_ROOT;
if (!ROOT) throw new Error('SHELF_ROOT is not set: run the oracle through `lab.mjs evaluate`');
const BIN = path.join(ROOT, 'bin', 'shelf.js');

/** A fresh working directory with `shelf(...args)`, `write`, `read`, `seed` and `shelfJson`. */
export function sandbox(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-oracle-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, HOME: dir, USERPROFILE: dir };
  for (const k of ['NODE_TEST_CONTEXT', 'SHELFRC', 'LOG_LEVEL']) delete env[k];
  return {
    dir,
    write: (name, text) => fs.writeFileSync(path.join(dir, name), text),
    read: (name) => fs.readFileSync(path.join(dir, name), 'utf8'),
    exists: (name) => fs.existsSync(path.join(dir, name)),
    shelfJson: () => JSON.parse(fs.readFileSync(path.join(dir, 'shelf.json'), 'utf8')),
    /** Writes shelf.json directly, as "a shelf.json holding these books". */
    seed: (rows) => fs.writeFileSync(path.join(dir, 'shelf.json'), JSON.stringify({ books: rows.map(([title, author, pages, finished = null]) => ({ title, author, pages, finished })) })),
    shelf: (args, extraEnv = {}) => {
      const r = spawnSync(process.execPath, [BIN, ...args], { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 30000 });
      return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
  };
}
export const oneLine = (text) => text.trim().split('\n').length === 1 && text.trim() !== '';
