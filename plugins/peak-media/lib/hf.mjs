// HyperFrames CLI wrapper (DEC-05). Version comes only from lib/pins.json via the
// installed package; update checks, auto-install, telemetry and skill installs are off.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CliError, EXIT, PLUGIN_ROOT } from './cli.mjs';
import { depRoot, pins } from './deps.mjs';

const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.sh');

export function hfEnv(extra = {}) {
  const env = {
    ...process.env,
    HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_NO_AUTO_INSTALL: '1',
    HYPERFRAMES_NO_TELEMETRY: '1',
    HYPERFRAMES_SKIP_SKILLS: '1',
    DO_NOT_TRACK: '1',
    ...extra,
  };
  // Cloud sessions ship a Playwright headless shell; `browser ensure` can hang there.
  if (!env.HYPERFRAMES_BROWSER_PATH && existsSync('/opt/pw-browsers')) {
    const shell = readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium_headless_shell-')).sort().at(-1);
    const p = shell && path.join('/opt/pw-browsers', shell, 'chrome-linux', 'headless_shell');
    if (p && existsSync(p)) env.HYPERFRAMES_BROWSER_PATH = p;
  }
  return env;
}

export function hfBin() {
  const root = depRoot('hyperframes');
  if (!root) throw new CliError(`HyperFrames not installed — run ${SETUP}`, EXIT.MISSING_PREREQ);
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (version !== pins().hyperframes) {
    throw new CliError(`HyperFrames ${version} found but ${pins().hyperframes} is pinned — run ${SETUP}`, EXIT.MISSING_PREREQ);
  }
  return path.join(root, 'bin', 'hyperframes.mjs');
}

/** Run a hyperframes subcommand. Returns {code, stdout, stderr}. */
export function hf(args, { cwd, env, timeoutMs = 20 * 60 * 1000, wrap } = {}) {
  const cmd = [process.execPath, hfBin(), ...args];
  const [bin, ...rest] = wrap ? [...wrap, ...cmd] : cmd;
  const r = spawnSync(bin, rest, { cwd, env: hfEnv(env), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Render a composition dir to an MP4. Throws a one-line CliError on failure. */
export function render(dir, out, { fps, quality = 'standard', wrap } = {}) {
  const args = ['render', dir, '-o', out, '--quiet', '--quality', quality, '--no-best-effort'];
  if (fps) args.push('--fps', String(fps));
  const r = hf(args, { wrap });
  if (r.code !== 0 || !existsSync(out)) {
    const msg = (r.stderr + r.stdout).trim().split('\n').filter((l) => /error|fail/i.test(l)).at(-1) ?? 'no output';
    throw new CliError(`render failed for ${dir}: ${msg.trim()}`);
  }
  return out;
}

export function browserPath() {
  if (process.env.HYPERFRAMES_BROWSER_PATH) return process.env.HYPERFRAMES_BROWSER_PATH;
  const r = hf(['browser', 'path'], { timeoutMs: 60_000 });
  const p = r.stdout.trim().split('\n').at(-1);
  return r.code === 0 && p && existsSync(p) ? p : null;
}

/** Path of the pinned, locally installed GSAP (DEC-09: fetched by setup, never shipped). */
export function gsapPath() {
  const root = depRoot('gsap');
  const p = root && path.join(root, 'dist', 'gsap.min.js');
  if (!p || !existsSync(p)) throw new CliError(`GSAP not installed — run ${SETUP}`, EXIT.MISSING_PREREQ);
  return p;
}
