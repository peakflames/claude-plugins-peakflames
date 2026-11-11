// DEC-52 platform subset: scripts/setup.mjs (it replaces setup.sh) on every OS. No network: every
// run here is --check, --help, --version or a refusal, so nothing is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { run, pluginVersion, tmpDir, ROOT } from '../helpers/run.mjs';
import { unsupportedPlatform, npmCli } from '../../scripts/setup.mjs';

const SETUP = 'scripts/setup.mjs';
const lines = (s) => s.trim().split('\n').filter(Boolean);

test('setup.mjs: --help lists every flag, --version prints plugin.json, a bad flag is a usage error (exit 2)', () => {
  const help = run(SETUP, ['--help']);
  assert.equal(help.code, 0);
  for (const f of ['--check', '--skip-browser', '--data-dir', '--quiet', '--help', '--version']) assert.ok(help.stdout.includes(f), `--help lists ${f}`);
  assert.match(help.stdout, /Windows x64 and Linux x64/);
  const ver = run(SETUP, ['--version']);
  assert.deepEqual([ver.code, ver.stdout.trim()], [0, pluginVersion()]);
  for (const bad of [['--bogus'], ['--data-dir'], ['extra']]) {
    const r = run(SETUP, bad);
    assert.equal(r.code, 2, `${bad}: ${r.stderr}`);
    assert.match(lines(r.stderr)[0], /^setup\.mjs: /);
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
  }
});

test('setup.mjs --check: exit 3 with one line when something is missing, never installing anything', () => {
  const empty = tmpDir('pm-setup-empty-');
  const noFf = run(SETUP, ['--check'], { env: { PEAK_MEDIA_FFMPEG: path.join(empty, 'no-ffmpeg') } });
  assert.equal(noFf.code, 3);
  assert.equal(lines(noFf.stderr).length, 1, noFf.stderr);
  assert.match(noFf.stderr, /^setup\.mjs: ffmpeg not found — install it \(macOS: brew install ffmpeg · Windows: winget install Gyan\.FFmpeg · Linux: sudo apt-get install ffmpeg\)$/m);
  const noProbe = run(SETUP, ['--check'], { env: { PEAK_MEDIA_FFPROBE: path.join(empty, 'no-ffprobe') } });
  assert.equal(noProbe.code, 3);
  assert.match(noProbe.stderr, /^setup\.mjs: ffprobe not found — install it/);
  const noDeps = run(SETUP, ['--check', '--data-dir', empty]);
  assert.equal(noDeps.code, 3);
  assert.equal(lines(noDeps.stderr).length, 1, noDeps.stderr);
  assert.match(noDeps.stderr, /runtime deps not installed in .* — run node ".*scripts[\\/]setup\.mjs"$/m);
  const r = run(SETUP, ['--check', '--data-dir', empty], { env: { CLAUDE_PLUGIN_DATA: path.join(empty, 'other') } });
  assert.match(r.stderr, new RegExp(`deps not installed in ${path.join(empty, 'deps').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`), '--data-dir wins over CLAUDE_PLUGIN_DATA');
});

test('setup.mjs: on Windows ARM and Linux arm64 it stops with one "unsupported platform" line unless HYPERFRAMES_BROWSER_PATH is set', () => {
  for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['linux', 'x64']]) {
    assert.equal(unsupportedPlatform({ platform, arch, env: {} }), null, `${platform}/${arch} is supported`);
  }
  for (const [platform, arch] of [['win32', 'arm64'], ['linux', 'arm64']]) {
    const why = unsupportedPlatform({ platform, arch, env: {} });
    assert.match(why, new RegExp(`^unsupported platform ${platform}/${arch} — peak-media runs on macOS, Windows x64 and Linux x64`));
    assert.doesNotMatch(why, /\n/, 'one line');
    assert.equal(unsupportedPlatform({ platform, arch, env: { HYPERFRAMES_BROWSER_PATH: '/x/chrome' } }), null, 'a Chromium of your own lifts it');
  }
});

test('setup.mjs: finds npm\'s JS entry point next to this node, so npm runs without a shell (npm.cmd) on Windows', () => {
  const cli = npmCli();
  assert.ok(cli, 'npm-cli.js found');
  assert.match(cli, /npm-cli\.js$/);
  assert.equal(npmCli(path.join(tmpDir('pm-npm-'), 'node'), { PATH: '' }), null, 'none found: null');
  assert.ok(path.isAbsolute(cli) && ROOT);
});
