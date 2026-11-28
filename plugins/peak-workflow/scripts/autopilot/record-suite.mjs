#!/usr/bin/env node
// Runs one of the project's slow suites for a build or repair session and keeps the result for the final check.
//
//   node "$AUTOPILOT_RECORD" <command…>      e.g. node "$AUTOPILOT_RECORD" bun run test:e2e
//
// The output passes through unchanged and the exit code is the command's. Beside it, in $AUTOPILOT_EVIDENCE, it saves
// the output (<slug>.txt) and what it ran on (<slug>.json): the commit's tree, and whether the tree was clean. The
// driver hands a saved run to the final check only when that tree is the branch's tree when the check starts, so a
// full end-to-end suite (9-11 minutes on a Windows PC, seen run 4-5 times per epic) is not run again on the same code.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// One argument is a command line as it is; several are the words the session's shell already split, quoted again
// for `sh` so that `node -e "a b"` stays one word.
const words = process.argv.slice(2);
const shq = (w) => (/^[\w@%+=:,./-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`);
const command = (words.length === 1 ? words[0] : words.map(shq).join(' ')).trim();
if (!command) { console.error('usage: node "$AUTOPILOT_RECORD" <command>'); process.exit(2); }
const dir = process.env.AUTOPILOT_EVIDENCE;
const git = (...a) => { const r = spawnSync('git', a, { encoding: 'utf8', windowsHide: true }); return r.status === 0 ? r.stdout.trim() : null; };
const tree = git('rev-parse', 'HEAD^{tree}');
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
const slug = command.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'suite';
const started = Date.now();
let out = null;
if (dir) { fs.mkdirSync(dir, { recursive: true }); out = fs.createWriteStream(path.join(dir, `${slug}.txt`)); }
const child = spawn(command, { shell: process.platform === 'win32' ? 'sh' : true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
for (const [from, to] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) from.on('data', (d) => { to.write(d); out?.write(d); });
child.on('close', (code, signal) => {
  const exit = code ?? 1;
  const finish = () => {
    if (dir) {
      const after = git('rev-parse', 'HEAD^{tree}');
      fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify({
        command, exit, signal: signal ?? null, ms: Date.now() - started, at: new Date().toISOString(),
        commit, tree, dirty, changedDuringRun: after !== tree, output: `${slug}.txt`,
      }, null, 2) + '\n');
    } else console.error('record-suite: AUTOPILOT_EVIDENCE is not set; the result was not kept');
    process.exit(exit);
  };
  if (out) out.end(finish); else finish();
});
