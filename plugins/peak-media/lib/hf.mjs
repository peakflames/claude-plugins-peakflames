// HyperFrames CLI wrapper (DEC-05). Version comes only from lib/pins.json via the
// installed package; update checks, auto-install, telemetry and skill installs are off.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CliError, EXIT, PLUGIN_ROOT } from './cli.mjs';
import { depRoot, pins } from './deps.mjs';
import { runWatched, stepTimeoutMs, fmtDuration } from './watchdog.mjs';

// Watchdog defaults (PEAK_MEDIA_STEP_TIMEOUT_S overrides): a plate renders in seconds to minutes.
const RENDER_TIMEOUT_MS = 30 * 60_000;
const HF_TIMEOUT_MS = 10 * 60_000;

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
export function hf(args, { cwd, env, timeoutMs = HF_TIMEOUT_MS, wrap } = {}) {
  const cmd = [process.execPath, hfBin(), ...args];
  const [bin, ...rest] = wrap ? [...wrap, ...cmd] : cmd;
  const ms = stepTimeoutMs(timeoutMs);
  const r = runWatched(bin, rest, { cwd, env: hfEnv(env), timeoutMs: ms });
  if (r.timedOut) {
    throw new CliError(`hyperframes ${args[0]} timed out after ${fmtDuration(ms)} with no exit — stopped it; the render browser may have crashed: run ${SETUP} --check, or raise PEAK_MEDIA_STEP_TIMEOUT_S`);
  }
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Render a composition dir to an MP4. Throws a one-line CliError on failure. */
export function render(dir, out, { fps, quality = 'standard', wrap } = {}) {
  const args = ['render', dir, '-o', out, '--quiet', '--quality', quality, '--no-best-effort'];
  if (fps) args.push('--fps', String(fps));
  const r = hf(args, { wrap, timeoutMs: RENDER_TIMEOUT_MS });
  if (r.code !== 0 || !existsSync(out)) {
    const lines = (r.stderr + r.stdout).trim().split('\n');
    // a browser that can't start is the usual cause: its check names the fix, so it goes first
    const b = browserPath();
    const chk = b ? browserCheck(b) : { ok: false, message: `render browser missing — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)` };
    const msg = !chk.ok ? chk.message
      : lines.find((l) => /disk space/i.test(l)) ?? lines.filter((l) => /error|fail|✗/i.test(l)).at(-1) ?? lines.filter((l) => l.trim()).at(-1) ?? 'no output from HyperFrames';
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

// Shared libraries chrome-headless-shell needs that a slim Linux image may lack → Debian/Ubuntu package.
const LIB_PACKAGES = {
  'libnss3.so': 'libnss3', 'libnssutil3.so': 'libnss3', 'libsmime3.so': 'libnss3',
  'libnspr4.so': 'libnspr4', 'libplc4.so': 'libnspr4', 'libplds4.so': 'libnspr4',
  'libatk-1.0.so.0': 'libatk1.0-0', 'libatk-bridge-2.0.so.0': 'libatk-bridge2.0-0', 'libatspi.so.0': 'libatspi2.0-0',
  'libXcomposite.so.1': 'libxcomposite1', 'libXdamage.so.1': 'libxdamage1', 'libXfixes.so.3': 'libxfixes3',
  'libXrandr.so.2': 'libxrandr2', 'libXext.so.6': 'libxext6', 'libX11.so.6': 'libx11-6', 'libxcb.so.1': 'libxcb1',
  'libgbm.so.1': 'libgbm1', 'libxkbcommon.so.0': 'libxkbcommon0', 'libasound.so.2': 'libasound2', 'libcups.so.2': 'libcups2',
  'libdrm.so.2': 'libdrm2', 'libpango-1.0.so.0': 'libpango-1.0-0', 'libcairo.so.2': 'libcairo2', 'libdbus-1.so.3': 'libdbus-1-3',
  'libexpat.so.1': 'libexpat1', 'libglib-2.0.so.0': 'libglib2.0-0', 'libgio-2.0.so.0': 'libglib2.0-0', 'libgobject-2.0.so.0': 'libglib2.0-0',
};

/**
 * Start the render browser once (headless, about:blank). Returns {ok} or {ok:false, message} where
 * message is one line naming the fix: on Linux, the missing shared libraries and the apt command.
 */
export function browserCheck(bin) {
  if (!bin || !existsSync(bin)) return { ok: false, message: `render browser not found at ${bin} — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)` };
  const r = runWatched(bin, ['--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', 'about:blank'], { timeoutMs: stepTimeoutMs(60_000) });
  if (r.timedOut) return { ok: false, message: `render browser didn't answer within ${fmtDuration(stepTimeoutMs(60_000))} (${bin}) — run ${SETUP} to fetch the render browser, or point HYPERFRAMES_BROWSER_PATH at a working Chromium` };
  if (r.status === 0 && /<html/i.test(r.stdout ?? '')) return { ok: true };
  if (process.platform === 'linux') {
    const ldd = spawnSync('ldd', [bin], { encoding: 'utf8' });
    const libs = [...new Set([...(ldd.stdout ?? '').matchAll(/^\s*(\S+) => not found/gm)].map((m) => m[1]))].sort();
    if (libs.length) {
      const pkgs = [...new Set(libs.map((l) => LIB_PACKAGES[l]).filter(Boolean))].sort();
      const fix = pkgs.length ? `install them (Debian/Ubuntu: sudo apt-get install ${pkgs.join(' ')})` : 'install the packages that provide them';
      return { ok: false, message: `render browser can't start — missing system libraries: ${libs.join(' ')} — ${fix}` };
    }
  }
  const why = `${r.error?.message ?? ''}\n${r.stderr ?? ''}`.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? `exit ${r.status}`;
  return { ok: false, message: `render browser can't start (${bin}): ${why.slice(0, 300)} — run ${SETUP} to fetch the render browser, or point HYPERFRAMES_BROWSER_PATH at a working Chromium` };
}
