// Resolves runtime npm deps (DEC-10). setup.mjs installs them into
// ${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/deps/<lockhash>/node_modules; a dev
// checkout with `npm install` in the plugin root also works.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { PLUGIN_ROOT, CliError, EXIT, setupCommand } from './cli.mjs';

export function dataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.cache', 'peak-media');
}

export function lockHash() {
  const lock = path.join(PLUGIN_ROOT, 'package-lock.json');
  if (!existsSync(lock)) return 'nolock';
  return createHash('sha256').update(readFileSync(lock)).digest('hex').slice(0, 12);
}

export function depsDir() {
  return path.join(dataDir(), 'deps', lockHash());
}

const roots = () => [depsDir(), PLUGIN_ROOT];

/** Absolute path of a dependency entry (e.g. 'ajv/dist/2020'), or null. */
export function resolveDep(spec) {
  for (const root of roots()) {
    if (!existsSync(path.join(root, 'node_modules'))) continue;
    try {
      return createRequire(path.join(root, 'package.json')).resolve(spec);
    } catch { /* try next root */ }
  }
  return null;
}

export async function importDep(spec) {
  const p = resolveDep(spec);
  if (!p) {
    throw new CliError(`missing dependency '${spec.split('/')[0]}' — run ${setupCommand()}`, EXIT.MISSING_PREREQ);
  }
  return import(pathToFileURL(p).href);
}

/** Folder of an installed package (e.g. 'hyperframes'), or null. */
export function depRoot(name) {
  for (const root of roots()) {
    const p = path.join(root, 'node_modules', name);
    if (existsSync(path.join(p, 'package.json'))) return p;
  }
  return null;
}

export function pins() {
  return JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'lib', 'pins.json'), 'utf8'));
}
