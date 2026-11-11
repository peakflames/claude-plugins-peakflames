// Pre-flight checks: each failure is one actionable line (exit 3) before any work starts.
import { CliError, EXIT, setupCommand } from './cli.mjs';
import { requireFfmpeg } from './ffmpeg.mjs';
import { depRoot } from './deps.mjs';
import { hfBin, browserPath } from './hf.mjs';

const SETUP = setupCommand();

export function requireNode(min = 22) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < min) throw new CliError(`Node ${min}+ required (found ${process.versions.node}) — install it from https://nodejs.org`, EXIT.MISSING_PREREQ);
}

export function requireDeps(names) {
  for (const n of names) if (!depRoot(n)) throw new CliError(`runtime dependency '${n}' missing — run ${SETUP}`, EXIT.MISSING_PREREQ);
}

/** preflight({ffmpeg, deps:[...], hyperframes, browser}) — throws on the first missing piece. */
export function preflight({ ffmpeg = false, deps = [], hyperframes = false, browser = false } = {}) {
  requireNode();
  if (ffmpeg) requireFfmpeg();
  requireDeps(deps);
  if (hyperframes || browser) hfBin();
  if (browser && !browserPath()) throw new CliError(`render browser missing — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)`, EXIT.MISSING_PREREQ);
}
