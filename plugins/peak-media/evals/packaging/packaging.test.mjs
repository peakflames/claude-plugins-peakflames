// WP9 packaging: AC-PKG-01, -03, -04, -06, -07, -08.
// AC-PKG-04 and -08 run setup.sh for real (a no-op when the runtime is already installed), then a
// no-key end-to-end video: in a clean Linux container they are the "setup, then F1 / F0" checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run, ROOT, pluginVersion, tmpDir } from '../helpers/run.mjs';

const REPO = path.resolve(ROOT, '..', '..');
const SKILLS = ['plate-factory', 'video-spine', 'video-plates', 'video-capture', 'video-assemble']; // DEC-21
const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' };
const F0 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F0');
const F1 = path.join(ROOT, 'docs', 'build', 'fixtures', 'F1');
const DEFAULT_PACK = path.join(ROOT, 'brand-packs', 'default');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const lines = (s) => s.trim().split('\n').filter(Boolean);

/** Every file under dir (skipping node_modules), as paths relative to ROOT. */
function files(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); } else out.push(path.relative(ROOT, p));
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

test('AC-PKG-06: every skill has at least one eval (node --test plugins/peak-media/evals)', () => {
  const skills = readdirSync(path.join(ROOT, 'skills')).filter((d) => existsSync(path.join(ROOT, 'skills', d, 'SKILL.md'))).sort();
  assert.deepEqual(skills, [...SKILLS].sort(), 'the five skills of DEC-21, and no others (no web2video)');
  for (const s of skills) {
    const name = /^name:\s*(\S+)/m.exec(readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8'));
    assert.equal(name?.[1], s, `skills/${s}/SKILL.md names itself ${s}`);
    const evals = files(path.join(ROOT, 'evals', s)).filter((f) => f.endsWith('.test.mjs'));
    const tests = evals.reduce((n, f) => n + (readFileSync(path.join(ROOT, f), 'utf8').match(/^test\(/gm) ?? []).length, 0);
    assert.ok(tests >= 1, `evals/${s}/ has at least one test (found ${tests} in ${evals.length} file(s))`);
  }
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
  const fontDirs = [...files(path.join(ROOT, 'brand-packs')), ...files(path.join(ROOT, 'evals', 'fixtures'))]
    .filter((f) => /\/fonts\/[^/]+\/[^/]+$/.test(f)).map((f) => path.dirname(f) + '/');
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

test('AC-PKG-04: setup.sh, then the F1 brief end to end with no key (fake/tone spine, default pack) — passes with no manual steps', () => {
  const setup = run('scripts/setup.sh', [], { network: true });
  assert.equal(setup.code, 0, `setup.sh: ${setup.stdout}${setup.stderr}`);
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

test('AC-PKG-08: setup + F0 in a headless environment — passes, or prints one line naming what is missing', () => {
  // what is missing: each prerequisite reports one line naming the fix, before any install
  const empty = tmpDir('pm-pkg08-data-');
  const noDeps = run('scripts/setup.sh', ['--check'], { env: { CLAUDE_PLUGIN_DATA: empty } });
  assert.equal(noDeps.code, 3, noDeps.stdout + noDeps.stderr);
  assert.equal(lines(noDeps.stdout + noDeps.stderr).length, 1, noDeps.stderr);
  assert.match(noDeps.stderr, /runtime deps not installed .* run .*scripts\/setup\.sh/);
  const noFfmpeg = run('scripts/setup.sh', ['--check'], { env: { PEAK_MEDIA_FFMPEG: path.join(empty, 'no-ffmpeg') } });
  assert.equal(noFfmpeg.code, 3);
  assert.deepEqual(lines(noFfmpeg.stdout + noFfmpeg.stderr), ['setup.sh: ffmpeg not found — install it (macOS: brew install ffmpeg · Debian/Ubuntu: sudo apt-get install ffmpeg)']);
  if (!existsSync(path.join(ROOT, 'node_modules'))) { // a dev checkout with its own node_modules can't lack deps
    const skel = run('docs/build/tools/skeleton.mjs', ['--fixture', F0, '--brand', DEFAULT_PACK, '--out', tmpDir('pm-pkg08-miss-')], { env: { ...NO_KEY, CLAUDE_PLUGIN_DATA: empty } });
    assert.notEqual(skel.code, 0);
    assert.equal(lines(skel.stderr).length, 1, skel.stderr);
    assert.match(skel.stderr, /dependency '.+'.* — run .*scripts\/setup\.sh/);
    assert.doesNotMatch(skel.stderr, /\n\s+at /);
  }

  // then setup for real: where it can't finish (no network, no browser build for this platform),
  // it must stop with one line naming what's missing; where it can, F0 (beat grid → motion plate →
  // composite) passes
  const setup = run('scripts/setup.sh', ['-q'], { network: true });
  if (setup.code !== 0) {
    assert.equal(lines(setup.stdout + setup.stderr).length, 1, `one line: ${setup.stdout}${setup.stderr}`);
    assert.match(setup.stderr, /^setup\.sh: .+ — /, 'names the problem and the fix');
    process.stdout.write(`# setup could not finish here; its one-line message: ${setup.stderr.trim()}\n`);
    return;
  }
  const out = tmpDir('pm-pkg08-');
  const skel = run('docs/build/tools/skeleton.mjs', ['--fixture', F0, '--brand', DEFAULT_PACK, '--out', out], { env: NO_KEY });
  assert.equal(skel.code, 0, skel.stdout + skel.stderr);
  const spec = run('lib/verify/probe-spec.mjs', [path.join(out, 'out', 'final.mp4'), '--size', '1280x720', '--duration-ms', '3000']);
  assert.equal(spec.code, 0, spec.stdout + spec.stderr);
  assert.equal(run('scripts/setup.sh', ['--version']).stdout.trim(), pluginVersion());
});
