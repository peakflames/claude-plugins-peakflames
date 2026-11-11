#!/usr/bin/env node
// setup.mjs — install peak-media's pinned runtime deps (HyperFrames, Playwright, GSAP, ajv) into the
// plugin data dir and make sure the render browser and the headed browser (Playwright's own
// Chromium, for capture signin/--headed, DEC-49) are present. Safe to re-run. Runs the same on
// macOS, Windows x64 and Linux x64 (DEC-53; it replaces setup.sh).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, accessSync, constants, realpathSync } from 'node:fs';
import path from 'node:path';
import { runCli, CliError, EXIT, PLUGIN_ROOT, isMain, setupCommand } from '../lib/cli.mjs';
import { requireNode } from '../lib/preflight.mjs';
import { depsDir, lockHash } from '../lib/deps.mjs';
import { FFMPEG_INSTALL, ffmpegBin, ffprobeBin, hasBinary } from '../lib/ffmpeg.mjs';
import { hfEnv, browserPath, browserCheck } from '../lib/hf.mjs';
import { browsersDir, headedBrowserOk, headedBrowserPath } from '../lib/browser.mjs';
import { runWatched, resolveBin, stepTimeoutMs } from '../lib/watchdog.mjs';

const NAME = 'setup.mjs';
const SETUP = setupCommand();
const INSTALL_TIMEOUT_MS = 30 * 60_000;

// render browser targets HyperFrames maps (DEC-53): Windows ARM and Linux arm64 have none
const SUPPORTED = new Set(['darwin/arm64', 'darwin/x64', 'win32/x64', 'linux/x64']);

/** One-line reason this OS/CPU can't run peak-media, or null when it can. A Chromium of one's own (HYPERFRAMES_BROWSER_PATH) lifts the limit. */
export function unsupportedPlatform({ platform = process.platform, arch = process.arch, env = process.env } = {}) {
  if (SUPPORTED.has(`${platform}/${arch}`) || env.HYPERFRAMES_BROWSER_PATH) return null;
  return `unsupported platform ${platform}/${arch} — peak-media runs on macOS, Windows x64 and Linux x64 (there is no render browser for ${platform}/${arch}; set HYPERFRAMES_BROWSER_PATH to a Chromium of your own to try anyway)`;
}

/** npm's JS entry point next to this node (run through process.execPath: npm.cmd would need a shell on Windows). */
export function npmCli(execPath = process.execPath, env = process.env) {
  const dir = path.dirname(execPath);
  const found = [
    env.npm_execpath,
    path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // macOS / Linux
  ].filter((p) => p && /npm-cli\.js$/.test(p)).find((p) => existsSync(p));
  if (found) return found;
  // POSIX: `npm` on PATH is a symlink to npm-cli.js
  const bin = resolveBin('npm', env);
  if (bin) { try { const real = realpathSync(bin); if (/npm-cli\.js$/.test(real)) return real; } catch { /* not a link */ } }
  return null;
}

const executable = (p) => { try { accessSync(p, process.platform === 'win32' ? constants.F_OK : constants.X_OK); return true; } catch { return false; } };

const spec = {
  name: NAME,
  summary: "install peak-media's pinned runtime dependencies (idempotent)",
  usage: `node ${NAME} [options]`,
  description: `
Installs the versions in lib/pins.json into \${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/deps/<lockhash>/
and runs 'hyperframes browser ensure' (the render browser). Also installs Playwright's own
Chromium for the pinned Playwright (the headed browser for 'capture signin' and 'capture --headed',
about 376 MB) into \${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/browsers/.
Needs network only when something is missing.
Prerequisites it checks: Node 22+, npm, ffmpeg and ffprobe.
Runs on macOS, Windows x64 and Linux x64.`,
  options: {
    check: { type: 'boolean', desc: 'Only report what is missing (exit 0 ready, 3 not ready); install nothing' },
    'skip-browser': { type: 'boolean', desc: "Don't fetch the render or the headed browser (e.g. HYPERFRAMES_BROWSER_PATH is set)" },
    'data-dir': { type: 'string', arg: 'dir', desc: 'Use <dir> instead of $CLAUDE_PLUGIN_DATA / ~/.cache/peak-media' },
    quiet: { type: 'boolean', short: 'q', desc: 'Print only errors and the final line' },
  },
  examples: [`node ${NAME}`, `node ${NAME} --check`],
};

const die = (msg, code = EXIT.FAIL) => { throw new CliError(msg, code); };

async function main({ values }) {
  const say = (s) => { if (!values.quiet) process.stdout.write(`${s}\n`); };
  if (values['data-dir'] !== undefined) {
    if (!values['data-dir']) throw new CliError(`--data-dir needs a folder argument`, EXIT.USAGE);
    process.env.CLAUDE_PLUGIN_DATA = path.resolve(values['data-dir']);
  }
  const skipBrowser = !!values['skip-browser'];

  // --- prerequisites -----------------------------------------------------------
  requireNode(22);
  const npm = npmCli();
  if (!npm) die('npm not found — it ships with Node; reinstall Node 22+', EXIT.MISSING_PREREQ);
  if (!hasBinary(ffmpegBin())) die(`ffmpeg not found — ${FFMPEG_INSTALL}`, EXIT.MISSING_PREREQ);
  if (!hasBinary(ffprobeBin())) die(`ffprobe not found — ${FFMPEG_INSTALL}`, EXIT.MISSING_PREREQ);
  const why = !skipBrowser && unsupportedPlatform({ env: hfEnv() });
  if (why) die(why, EXIT.MISSING_PREREQ);

  Object.assign(process.env, { HYPERFRAMES_NO_UPDATE_CHECK: '1', HYPERFRAMES_NO_AUTO_INSTALL: '1', HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_SKIP_SKILLS: '1', DO_NOT_TRACK: '1' });
  const DEPS = depsDir();
  const LOCK = lockHash();
  const MARK = path.join(DEPS, '.installed');
  const HF = path.join(DEPS, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
  const BROWSERS = browsersDir();
  const envBrowser = () => process.env.HYPERFRAMES_BROWSER_PATH;

  const depsOk = () => existsSync(MARK) && readFileSync(MARK, 'utf8').trim() === LOCK && existsSync(HF);
  const browserOk = () => {
    if (envBrowser() && executable(envBrowser())) return true;
    return existsSync(HF) && runWatched(process.execPath, [HF, 'browser', 'path'], { env: hfEnv(), timeoutMs: stepTimeoutMs(60_000) }).status === 0;
  };
  const headedOk = () => { try { return headedBrowserOk(); } catch { return false; } };
  // Start the browser once: a binary that is present but can't run (e.g. missing system libraries
  // on a slim Linux image) is reported in one line naming the libraries and the apt command.
  const browserStarts = () => {
    if (skipBrowser && !envBrowser()) return;
    let c;
    try { c = browserCheck(envBrowser() || browserPath()); } catch { c = { ok: false }; }
    if (!c.ok) die(c.message || `render browser cannot start — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)`, EXIT.MISSING_PREREQ);
  };
  const ffmpegVersion = () => (spawnSync(ffmpegBin(), ['-version'], { encoding: 'utf8', windowsHide: true }).stdout ?? '').split('\n')[0].split(' ').slice(0, 3).join(' ');
  /** Run node <args> in cwd with its output in log; die with msg on failure. */
  const install = (args, { cwd, env, log, msg }) => {
    const r = runWatched(process.execPath, args, { cwd, env, timeoutMs: stepTimeoutMs(INSTALL_TIMEOUT_MS) });
    writeFileSync(log, `${r.stdout ?? ''}${r.stderr ?? ''}${r.timedOut ? '\n(timed out)\n' : ''}`);
    if (r.status !== 0) die(`${msg} — see ${log}`, EXIT.FAIL);
  };

  if (values.check) {
    if (!depsOk()) die(`runtime deps not installed in ${DEPS} — run ${SETUP}`, EXIT.MISSING_PREREQ);
    if (!skipBrowser && !browserOk()) die(`render browser missing — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)`, EXIT.MISSING_PREREQ);
    browserStarts();
    if (!skipBrowser && !headedOk()) die(`headed browser missing (Playwright's Chromium, for capture signin/--headed) — run ${SETUP}`, EXIT.MISSING_PREREQ);
    process.stdout.write(`peak-media ready: deps ${DEPS}\n`);
    return EXIT.OK;
  }

  // --- deps ----------------------------------------------------------------------
  if (depsOk()) {
    say(`deps: up to date (${DEPS})`);
  } else {
    say(`deps: installing pinned versions into ${DEPS}`);
    try { mkdirSync(DEPS, { recursive: true }); } catch { die(`cannot create ${DEPS} — pass --data-dir <writable folder>`); }
    try { for (const f of ['package.json', 'package-lock.json']) copyFileSync(path.join(PLUGIN_ROOT, f), path.join(DEPS, f)); } catch { die(`cannot copy the lockfile into ${DEPS}`); }
    install([npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: DEPS, log: path.join(DEPS, 'npm-install.log'), msg: 'npm install failed (network or registry access?)' });
    writeFileSync(MARK, `${LOCK}\n`);
  }

  // --- browser -------------------------------------------------------------------
  if (skipBrowser) {
    say('browser: skipped');
  } else if (browserOk()) {
    say('browser: present');
  } else if (hfEnv().HYPERFRAMES_BROWSER_PATH && !envBrowser()) {
    // cloud sessions ship a Playwright headless shell (lib/hf.mjs hfEnv); 'browser ensure' can hang there
    say(`browser: using ${hfEnv().HYPERFRAMES_BROWSER_PATH} (export HYPERFRAMES_BROWSER_PATH to make it permanent)`);
  } else {
    say('browser: downloading the render browser');
    install([HF, 'browser', 'ensure'], { env: hfEnv(), log: path.join(DEPS, 'browser.log'), msg: 'browser download failed (or set HYPERFRAMES_BROWSER_PATH)' });
  }

  browserStarts();

  // --- headed browser (DEC-49) --------------------------------------------------------
  if (skipBrowser) {
    say('headed browser: skipped');
  } else if (headedOk()) {
    say('headed browser: present');
  } else {
    say(`headed browser: downloading Playwright's Chromium (about 376 MB) into ${BROWSERS}`);
    try { mkdirSync(BROWSERS, { recursive: true }); } catch { die(`cannot create ${BROWSERS} — pass --data-dir <writable folder>`); }
    const PW_CLI = path.join(DEPS, 'node_modules', 'playwright', 'cli.js');
    if (!existsSync(PW_CLI)) die(`Playwright CLI missing from ${DEPS} — delete ${MARK} and run ${SETUP} again`);
    const log = path.join(DEPS, 'headed-browser.log');
    install([PW_CLI, 'install', '--no-shell', 'chromium'], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS }, log, msg: 'headed browser download failed' });
    if (!headedOk()) die(`headed browser still missing after the download — see ${log}`);
  }
  // Linux: a fresh Chromium can still lack system libraries; name them and the apt command
  if (process.platform === 'linux' && !skipBrowser) {
    const c = browserCheck(headedBrowserPath(), { what: 'headed browser' });
    if (!c.ok) die(c.message, EXIT.MISSING_PREREQ);
  }

  process.stdout.write(`peak-media ready: deps ${DEPS} · ${ffmpegVersion()}\n`);
  return EXIT.OK;
}

if (isMain(import.meta.url)) await runCli(spec, main);
