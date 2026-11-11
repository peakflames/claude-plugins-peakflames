// WP9 packaging: AC-PKG-01, -03, -04, -06, -07, -08. WP16: AC-W2V-40 (six skills, DEC-45).
// AC-PKG-04 and -08 run setup.mjs for real (a no-op when the runtime is already installed). DEC-53
// (supersedes DEC-41): macOS, Windows x64 and Linux x64. -04 is setup then the no-key F1 video (the
// full F1 eval stays macOS-only; evals/smoke is the end-to-end run on Windows and Linux); -08 is
// setup + F0 with a prerequisite missing (ffmpeg, the render browser, the narration key), each
// reported in one line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, copyFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { run, ROOT, pluginVersion, tmpDir } from '../helpers/run.mjs';
import { depsDir as depsRoot } from '../../lib/deps.mjs';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(ROOT, '..', '..');
// DEC-45 (supersedes DEC-21's five in part): the five engine skills plus the web2video front door
const SKILLS = ['plate-factory', 'video-spine', 'video-plates', 'video-capture', 'video-assemble', 'web2video'];
const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' };
const F0 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F0');
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
const DEFAULT_PACK = path.join(ROOT, 'brand-packs', 'default');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const lines = (s) => s.trim().split('\n').filter(Boolean);

const posix = (p) => p.split(path.sep).join('/');
/** Every file under dir (skipping node_modules), as /-separated paths relative to ROOT. */
function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); } else out.push(posix(path.relative(ROOT, p)));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

test('AC-PKG-01: plugin.json version = the top CHANGELOG entry, and marketplace.json lists peak-media', () => {
  const plugin = readJson(path.join(ROOT, '.claude-plugin', 'plugin.json'));
  const top = /^## \[(\d+\.\d+\.\d+)\]/m.exec(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
  assert.ok(top, 'CHANGELOG.md has a "## [x.y.z]" entry');
  assert.equal(plugin.version, top[1], 'plugin.json version matches the top CHANGELOG entry');
  const mp = readJson(path.join(REPO, '.claude-plugin', 'marketplace.json'));
  const entries = mp.plugins.filter((p) => p.name === plugin.name);
  assert.equal(entries.length, 1, `marketplace.json lists ${plugin.name} once`);
  assert.equal(entries[0].source, './plugins/peak-media');
  assert.equal(path.resolve(REPO, entries[0].source), ROOT, 'the entry points at this plugin folder');
  assert.ok(entries[0].description?.length > 20, 'the entry has a description');
});

test('AC-PKG-03: the runtime tree carries no house-brand name (D17), and the examples carry no brand assets', () => {
  const BRAND_NAME = new RegExp(['peak', 'flames'].join(''), 'i'); // spelled in parts so this file doesn't match itself
  const runtime = ['skills', 'lib', 'schemas', 'brand-packs', 'vendor', 'scripts', 'evals'];
  const all = runtime.flatMap((d) => files(path.join(ROOT, d)));
  assert.ok(all.length > 100, `walked the runtime tree (${all.length} files)`);
  const hits = all.filter((f) => BRAND_NAME.test(f) || BRAND_NAME.test(readFileSync(path.join(ROOT, f), 'latin1')));
  assert.deepEqual(hits, [], 'case-insensitive brand-name hits (D17)');
  const examples = all.filter((f) => /^skills\/[^/]+\/examples\//.test(f));
  assert.ok(examples.length > 0, 'the skills have examples');
  const assets = examples.filter((f) => /\.(svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|wav|m4a|ogg|mp4|mov|webm)$/i.test(f) || /logo|brand|outro/i.test(path.basename(f)));
  assert.deepEqual(assets, [], 'examples carry no logos, fonts, images or audio');
});

const skillDirs = () => readdirSync(path.join(ROOT, 'skills')).filter((d) => existsSync(path.join(ROOT, 'skills', d, 'SKILL.md'))).sort();
/** Count of top-level test( calls under evals/<skill>/. */
function evalTests(s) {
  const evals = files(path.join(ROOT, 'evals', s)).filter((f) => f.endsWith('.test.mjs'));
  return { files: evals.length, tests: evals.reduce((n, f) => n + (readFileSync(path.join(ROOT, f), 'utf8').match(/^test\(/gm) ?? []).length, 0) };
}
const frontmatter = (s) => /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8'))?.[1];

test('AC-PKG-06: every skill has at least one eval (node --test "plugins/peak-media/evals/**/*.test.mjs")', () => {
  const skills = skillDirs();
  assert.ok(skills.length >= 5, `found the skills: ${skills}`);
  for (const s of skills) {
    const { files: n, tests } = evalTests(s);
    assert.ok(tests >= 1, `evals/${s}/ has at least one test (found ${tests} in ${n} file(s))`);
  }
});

test('AC-W2V-40: exactly six skills (web2video included), each named for its folder, with a Triggers line and an eval', () => {
  const skills = skillDirs();
  assert.deepEqual(skills, [...SKILLS].sort(), 'the six skills of DEC-45 (DEC-21\'s five plus web2video), and no others');
  for (const s of skills) {
    const front = frontmatter(s);
    assert.ok(front, `skills/${s}/SKILL.md has frontmatter`);
    assert.equal(/^name:\s*(\S+)/m.exec(front)?.[1], s, `skills/${s}/SKILL.md names itself ${s}`);
    const { files: n, tests } = evalTests(s);
    assert.ok(tests >= 1, `evals/${s}/ holds a test( (found ${tests} in ${n} file(s))`);
  }
  // web2video: a block description (like the other skills) whose last part is the Triggers on: line
  const block = /^description: \|\n((?: {2}.*\n?)+)/m.exec(frontmatter('web2video'));
  assert.ok(block, 'web2video has a block description (description: |)');
  const desc = block[1].split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
  const at = desc.indexOf('Triggers on:');
  assert.ok(at > 40, `the description says what the skill does before "Triggers on:": ${desc}`);
  assert.match(desc.slice(at), /^Triggers on:(?:\s*"[^"]+",?)+\.?$/, 'the description ends with the Triggers on: line (quoted phrases only)');
});

test('AC-PKG-07: VENDORED.md gives source, commit, date, licence and local changes for every vendor folder; GSAP and fonts are listed', () => {
  const doc = readFileSync(path.join(ROOT, 'VENDORED.md'), 'utf8');
  const sections = doc.split(/^## /m).slice(1).map((s) => ({ head: s.split('\n')[0], body: s }));
  const field = (body, name) => new RegExp(`^\\|\\s*${name}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, 'm').exec(body)?.[1];
  const vendors = readdirSync(path.join(ROOT, 'vendor')).filter((d) => statSync(path.join(ROOT, 'vendor', d)).isDirectory());
  assert.ok(vendors.length > 0);
  for (const v of vendors) {
    const sec = sections.find((s) => field(s.body, 'Destination')?.includes(`\`vendor/${v}/\``));
    assert.ok(sec, `a VENDORED.md section has Destination vendor/${v}/`);
    assert.match(field(sec.body, 'Source') ?? '', /^https:\/\//, `vendor/${v}: Source is a URL`);
    assert.match(field(sec.body, 'Commit') ?? '', /`[0-9a-f]{40}`/, `vendor/${v}: Commit is a full sha`);
    assert.match(field(sec.body, 'Date') ?? '', /\d{4}-\d{2}-\d{2}/, `vendor/${v}: Date`);
    const lic = field(sec.body, 'Licence') ?? '';
    assert.match(lic, /\S/, `vendor/${v}: Licence`);
    assert.ok(existsSync(path.join(ROOT, 'vendor', v, 'LICENSE')), `vendor/${v}/LICENSE is present`);
    const changes = /^### Local changes\n([\s\S]*?)(?=^### |(?![\s\S]))/m.exec(sec.body);
    assert.ok(changes && (changes[1].match(/^- /gm) ?? []).length >= 3, `vendor/${v}: a list of local changes`);
  }
  // fetched / bundled rows: | Name | Kind | ... |
  const rows = doc.split('\n').filter((l) => l.startsWith('|')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  const gsap = rows.find((r) => r[0] === 'GSAP' && r[1] === 'Fetched' && /npm/.test(r[2]));
  assert.ok(gsap, 'GSAP is listed as Fetched');
  assert.match(gsap.join(' '), /npm `gsap`/);
  assert.match(gsap.join(' '), /[Ll]icen[cs]e/);
  const fontDirs = [...files(path.join(ROOT, 'brand-packs')), ...files(path.join(ROOT, 'evals', 'fixtures'))].map(posix)
    .filter((f) => /\/fonts\/[^/]+\/[^/]+$/.test(f)).map((f) => path.posix.dirname(f) + '/');
  const uniq = [...new Set(fontDirs)];
  assert.ok(uniq.length >= 2, `found font folders: ${uniq}`);
  for (const d of uniq) {
    const r = rows.find((x) => x[1] === 'Bundled' && x[2] === `\`${d}\``);
    assert.ok(r, `${d} is listed as Bundled`);
    assert.equal(r.length, 9, `${d}: family, kind, destination, source, version, date, sha256, licence, local changes`);
    const [, , , source, version, date, sha, licence, local] = r;
    assert.match(source, /npm `@fontsource\//, `${d}: source`);
    assert.match(version, /^\d+\.\d+\.\d+$/, `${d}: version`);
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/, `${d}: date`);
    assert.match(sha, /^`[0-9a-f]{64}`$/, `${d}: package sha256`);
    assert.match(licence, /OFL/, `${d}: licence`);
    assert.match(local, /\S/, `${d}: local changes`);
    assert.ok(existsSync(path.join(ROOT, d, 'OFL.txt')), `${d}OFL.txt is present`);
  }
});

test('packaging: docs/ ships nothing heavier than Markdown, scripts, JSON, logs and JPEG — no audio or video anywhere (not AC-bound)', () => {
  const docs = files(path.join(ROOT, 'docs')).filter((f) => !f.split('/').includes('run')); // fixtures/**/run/ is gitignored scratch
  const odd = docs.filter((f) => !/\.(md|mjs|json|log|jpe?g)$/i.test(f));
  assert.deepEqual(odd, [], 'docs/ holds only .md .mjs .json .log .jpg');
  const media = files(ROOT).filter((f) => !f.split('/').includes('run') && /\.(mp4|mov|webm|mkv|wav|mp3|m4a|aac|ogg|flac)$/i.test(f));
  assert.deepEqual(media, [], 'no audio or video files in the plugin');
});

const POSIX_ONLY = process.platform === 'win32' && 'POSIX shell fake; the full suite is macOS-only (DEC-53)';
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const until = async (cond, ms, what) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) assert.fail(what); await new Promise((r) => setTimeout(r, 100)); } };
// a Node step whose own child never exits; the child's pid goes to pidFile (runs the same on every OS)
const sleeperStep = (pidFile) => `import { spawn } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\n`
  + `const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\n`
  + `writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));\nsetInterval(() => {}, 1000);\n`;

test('watchdog: a hung ffprobe step is stopped, its process group killed, and the run fails in one line (WP9 verify-1 F1; not AC-bound)', { skip: POSIX_ONLY }, () => {
  const dir = tmpDir('pm-watchdog-');
  const pidFile = path.join(dir, 'sleeper.pid');
  // fake ffmpeg/ffprobe: answers -version, otherwise starts a sleeper child and waits on it forever-ish
  const fake = path.join(dir, 'fake-ff');
  writeFileSync(fake, `#!/bin/sh\ncase "$1" in -version) echo "ffmpeg version fake"; exit 0;; esac\nsleep 120 & echo $! > '${pidFile}'\nwait\n`);
  chmodSync(fake, 0o755);
  const r = run('lib/verify/probe-spec.mjs', [path.join(F0, 'plates.json')], { env: { PEAK_MEDIA_FFMPEG: fake, PEAK_MEDIA_FFPROBE: fake, PEAK_MEDIA_STEP_TIMEOUT_S: '2' } });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  assert.ok(r.ms < 15_000, `stopped promptly (${r.ms} ms)`);
  assert.equal(lines(r.stderr).length, 1, r.stderr);
  assert.match(r.stderr, /ffprobe of .* timed out after 2 s with no exit — stopped it/);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  assert.ok(!alive(pid), `the step's own child (sleep, pid ${pid}) was killed with its group`);
});

test('watchdog: a hung HyperFrames step and a hung eval step are stopped with their trees, in one line (WP9 verify-1 F1; not AC-bound)', async () => {
  const dir = tmpDir('pm-watchdog-');
  // hyperframes: hf() under the same watchdog (the wrap runs a Node sleeper with a child in place of the CLI)
  const pidFile = path.join(dir, 'sleeper.pid');
  const step = path.join(dir, 'hang-hf.mjs');
  writeFileSync(step, sleeperStep(pidFile));
  const { hf } = await import('../../lib/hf.mjs');
  process.env.PEAK_MEDIA_STEP_TIMEOUT_S = '2';
  try {
    const t0 = Date.now();
    assert.throws(() => hf(['render', dir], { wrap: [process.execPath, step, '--'] }), /hyperframes render timed out after 2 s with no exit — stopped it; .*setup\.mjs"? --check/);
    assert.ok(Date.now() - t0 < 15_000);
  } finally { delete process.env.PEAK_MEDIA_STEP_TIMEOUT_S; }
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await until(() => !alive(pid), 10_000, `the step's own child (pid ${pid}) was killed with its tree`);

  // the eval helper's own per-step watchdog: a script that never exits fails its step in one line
  const hang = path.join(dir, 'hang.mjs');
  writeFileSync(hang, 'setInterval(() => {}, 1000);\n');
  const h = run(path.relative(ROOT, hang), [], { timeoutMs: 1500 });
  assert.equal(h.timedOut, true);
  assert.equal(h.code, null);
  assert.match(h.stderr, /eval step timed out after 1\.5 s: /);
});

test('watchdog: Ctrl-C (SIGINT) or SIGTERM to node stops the running step\'s whole tree and leaves no temp folder (WP9 verify-2 N1; not AC-bound)', async () => {
  const { spawn } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const dir = tmpDir('pm-interrupt-');
    const tmp = path.join(dir, 'tmp');
    mkdirSync(tmp);
    // a node process blocked in a watched step whose own child sleeps
    const pidFile = path.join(dir, 'pid');
    const step = path.join(dir, 'hang.mjs');
    writeFileSync(step, sleeperStep(pidFile));
    const script = path.join(dir, 'step.mjs');
    writeFileSync(script, `import { runWatched } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'lib', 'watchdog.mjs')).href)};\n`
      + `runWatched(process.execPath, [${JSON.stringify(step)}], { timeoutMs: 600000 });\n`);
    const child = spawn(process.execPath, [script], { env: { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp }, stdio: 'ignore', windowsHide: true });
    const exited = new Promise((res) => child.on('exit', (c, s) => res({ c, s })));
    await until(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim(), 15_000, `${sig}: the step started`);
    const sleeper = Number(readFileSync(pidFile, 'utf8'));
    assert.equal(readdirSync(tmp).filter((x) => x.startsWith('pm-run-')).length, 1, 'the step has its temp folder while it runs');
    child.kill(sig);
    const { s } = await exited;
    // the 130/143 shell exit codes are POSIX signals; on win32 kill() ends the process outright
    if (process.platform !== 'win32') assert.equal(s, sig, `node ended by ${sig} (shell exit code ${code})`);
    await until(() => !alive(sleeper), 10_000, `${sig}: the step's child ${sleeper} is gone`);
    await until(() => readdirSync(tmp).filter((x) => x.startsWith('pm-run-')).length === 0, 10_000, `${sig}: no pm-run-* temp folder left`);
  }
});

test('watchdog: "not found" only when the binary does not exist, not from a real binary\'s exit 127 (WP9 verify-2 N2; not AC-bound)', async () => {
  const { runWatched } = await import('../../lib/watchdog.mjs');
  const dir = tmpDir('pm-enoent-');
  const bin = path.join(dir, 'exits127.mjs');
  writeFileSync(bin, 'process.stderr.write("No such file or directory: input.mp4\\n");\nprocess.exit(127);\n');
  const real = runWatched(process.execPath, [bin], { timeoutMs: 10_000 });
  assert.equal(real.status, 127);
  assert.equal(real.error, undefined, 'a real binary exiting 127 is not "not found"');
  assert.equal(runWatched(path.join(dir, 'nope'), [], { timeoutMs: 10_000 }).error?.code, 'ENOENT');
  assert.equal(runWatched('pm-no-such-binary-xyz', [], { timeoutMs: 10_000 }).error?.code, 'ENOENT');
});

const SUPPORTED = ['darwin/arm64', 'darwin/x64', 'win32/x64', 'linux/x64'];
const F1_MACOS_ONLY = process.platform !== 'darwin' && 'the full F1 eval is macOS-only (DEC-53); evals/smoke covers Windows and Linux';

test('AC-PKG-04: on a supported OS with the prerequisites, setup.mjs then the F1 neutral eval (no key: fake/tone spine, default pack) passes with no manual steps', { skip: F1_MACOS_ONLY }, () => {
  assert.ok(SUPPORTED.includes(`${process.platform}/${process.arch}`), `${process.platform}/${process.arch} is supported (DEC-53)`);
  const setup = run('scripts/setup.mjs', [], { network: true });
  assert.equal(setup.code, 0, `setup.mjs: ${setup.stdout}${setup.stderr}`);
  assert.match(lines(setup.stdout).at(-1), /^peak-media ready: /);

  const dir = tmpDir('pm-pkg04-');
  for (const f of ['brief.md', 'script.md']) copyFileSync(path.join(F1, f), path.join(dir, f));
  const plates = readJson(path.join(F1, 'plates.json'));
  plates.brand = DEFAULT_PACK;
  writeFileSync(path.join(dir, 'plates.json'), JSON.stringify(plates, null, 2));
  const step = (name, script, args) => {
    const r = run(script, args, { env: NO_KEY, cwd: dir });
    assert.equal(r.code, 0, `${name}: ${r.stdout}${r.stderr}`);
    return r;
  };
  step('spine', 'skills/video-spine/scripts/spine.mjs', ['--brief', path.join(dir, 'brief.md'), '--tts-model', 'fake/tone', '--target-ms', '20000', '--cache-dir', path.join(dir, 'tts-cache')]);
  const manifest = readJson(path.join(dir, 'spine', 'manifest.json'));
  step('retime-plates', 'skills/plate-factory/scripts/retime-plates.mjs', [path.join(dir, 'plates.json')]);
  step('render-plate', 'skills/video-plates/scripts/render-plate.mjs', [path.join(dir, 'plates.json'), '--all']);
  const asm = JSON.parse(step('assemble', 'skills/video-assemble/scripts/assemble.mjs', [dir, '--json']).stdout);
  assert.ok(asm.cuts.length === manifest.beats.length - 1 && asm.cuts.every((c) => c.ok), `every plate cut in silence: ${JSON.stringify(asm.cuts)}`);
  const final = path.join(dir, 'out', 'final.mp4');
  const spec = run('lib/verify/probe-spec.mjs', [final, '--size', '1280x720', '--fps', '30', '--duration-ms', String(manifest.totalMs + 3000)]);
  assert.equal(spec.code, 0, spec.stdout + spec.stderr);
  process.stdout.write(`# F1: spine ${manifest.totalMs} ms (${manifest.beats.length} beats) + outro 3000 ms → ${path.relative(dir, final)}; ${lines(spec.stdout).at(-1)}\n`);
});

test('AC-PKG-08: setup + F0 with a prerequisite missing (ffmpeg, browser, key) prints the one-line message for what is missing', () => {
  const setup = run('scripts/setup.mjs', ['-q'], { network: true });
  assert.equal(setup.code, 0, setup.stdout + setup.stderr);
  const one = (r, re, what) => {
    assert.notEqual(r.code, 0, `${what}: non-zero exit`);
    // one line naming what's missing; a plate-factory gate script may also print its GATE … FAIL line
    assert.equal(lines(r.stderr).length, 1, `${what}: one line — ${r.stderr}`);
    assert.ok(lines(r.stdout).every((l) => /^GATE \d+ [a-z]+: FAIL — /.test(l)), `${what}: nothing else on stdout — ${r.stdout}`);
    assert.match(r.stderr, re, what);
    assert.doesNotMatch(r.stderr, /\n\s+at /, `${what}: no stack trace`);
  };
  const empty = tmpDir('pm-pkg08-data-');
  const f0 = (env) => run('docs/build/tools/skeleton.mjs', ['--fixture', F0, '--brand', DEFAULT_PACK, '--out', tmpDir('pm-pkg08-')], { env: { ...NO_KEY, ...env } });

  // ffmpeg
  const noFf = { PEAK_MEDIA_FFMPEG: path.join(empty, 'no-ffmpeg') };
  one(run('scripts/setup.mjs', ['--check'], { env: noFf }), /^setup\.mjs: ffmpeg not found — install it \(macOS: brew install ffmpeg · Windows: winget install Gyan\.FFmpeg · Linux: sudo apt-get install ffmpeg\)/, 'setup --check without ffmpeg');
  one(f0(noFf), /ffmpeg not found — install it \(macOS: brew install ffmpeg · Windows: winget install Gyan\.FFmpeg/, 'F0 without ffmpeg');
  // the runtime deps (before setup has run)
  one(run('scripts/setup.mjs', ['--check'], { env: { CLAUDE_PLUGIN_DATA: empty } }), /runtime deps not installed .* run .*scripts[\\/]setup\.mjs/, 'setup --check without deps');
  if (!existsSync(path.join(ROOT, 'node_modules'))) one(f0({ CLAUDE_PLUGIN_DATA: empty }), /dependency '.+'.* — run .*scripts[\\/]setup\.mjs/, 'F0 without deps');
  // the render browser (pointed at a path that isn't there: portable to every OS)
  const badBrowser = { HYPERFRAMES_BROWSER_PATH: path.join(empty, 'no-chrome') };
  one(run('scripts/setup.mjs', ['--check'], { env: badBrowser }), /^setup\.mjs: render browser not found at .* — run .*setup\.mjs/, 'setup --check with a missing browser');
  one(f0(badBrowser), /render failed for .*: render browser not found at .* — run .*setup\.mjs/, 'F0 with a missing browser');
  // POSIX: a browser that is present but can't start
  if (process.platform !== 'win32' && existsSync('/usr/bin/false')) {
    one(run('scripts/setup.mjs', ['--check'], { env: { HYPERFRAMES_BROWSER_PATH: '/usr/bin/false' } }), /^setup\.mjs: render browser can't start .* — run .*setup\.mjs.* to fetch the render browser/, 'setup --check with a broken browser');
  }
  // the narration key (F0 itself needs none: a beat grid; asking for narration without a key fails up front)
  const dir = tmpDir('pm-pkg08-key-');
  for (const f of ['brief.md', 'script.md']) copyFileSync(path.join(F1, f), path.join(dir, f));
  const t0 = Date.now();
  one(run('skills/video-spine/scripts/spine.mjs', ['--brief', path.join(dir, 'brief.md'), '--narrate'], { env: NO_KEY }), /PEAK_MEDIA_OPENROUTER_API_KEY/, 'narration without a key');
  assert.ok(Date.now() - t0 < 5000, 'the key check fails fast, before any synthesis');

  // and with nothing missing, F0 passes
  const ok = run('docs/build/tools/skeleton.mjs', ['--fixture', F0, '--brand', DEFAULT_PACK, '--out', tmpDir('pm-pkg08-ok-')], { env: NO_KEY });
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.equal(run('scripts/setup.mjs', ['--version']).stdout.trim(), pluginVersion());
});
