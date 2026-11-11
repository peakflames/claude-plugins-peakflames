// The headed browser (DEC-49): Playwright's own Chromium for the pinned Playwright, installed by
// setup.sh into <dataDir>/browsers. `capture signin` and `capture --headed` launch it; recording
// otherwise stays on the render browser (lib/hf.mjs browserPath()).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { dataDir, resolveDep } from './deps.mjs';

/** Where setup.sh installs Playwright's browsers (PLAYWRIGHT_BROWSERS_PATH). */
export const browsersDir = () => path.join(dataDir(), 'browsers');

/**
 * Path of the headed Chromium the pinned Playwright expects, whether or not it is installed; null
 * if Playwright itself isn't installed. PEAK_MEDIA_HEADED_BROWSER_PATH overrides it.
 * Asked of Playwright in a child process: its registry reads PLAYWRIGHT_BROWSERS_PATH at load.
 */
export function headedBrowserPath() {
  if (process.env.PEAK_MEDIA_HEADED_BROWSER_PATH) return process.env.PEAK_MEDIA_HEADED_BROWSER_PATH;
  const entry = resolveDep('playwright');
  if (!entry) return null;
  const r = spawnSync(process.execPath, ['-e', `process.stdout.write(require(${JSON.stringify(entry)}).chromium.executablePath())`], {
    encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir() }, timeout: 30_000,
  });
  const p = (r.stdout ?? '').trim();
  return r.status === 0 && p ? p : null;
}

/** True when the headed browser is on disk. */
export const headedBrowserOk = (p = headedBrowserPath()) => !!p && existsSync(p);
