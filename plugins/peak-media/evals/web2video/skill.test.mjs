// WP16 web2video: AC-W2V-36 (script half), AC-W2V-38, plus SKILL.md command and fixture checks.
// web2video owns no engine: these tests run the commands SKILL.md tells Claude to run, as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { ROOT, tmpDir } from '../helpers/run.mjs';

const SKILL_DIR = path.join(ROOT, 'skills', 'web2video');
const SKILL = readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
const REFS = readdirSync(path.join(SKILL_DIR, 'references')).filter((f) => f.endsWith('.md'));
const DOCS = [['SKILL.md', SKILL], ...REFS.map((f) => [`references/${f}`, readFileSync(path.join(SKILL_DIR, 'references', f), 'utf8')])];
const NO_KEY = { PEAK_MEDIA_OPENROUTER_API_KEY: '', TTS_OPENROUTER_API_KEY: '' };
const NO_NET = path.join(ROOT, 'evals', 'helpers', 'no-network.mjs');
const UI_DEMO = path.join(ROOT, 'skills', 'video-capture', 'examples', 'ui-demo');
const lines = (s) => s.trim().split('\n').filter(Boolean);

/** The one line of SKILL.md (a fenced or inline command) that runs `script` and matches `extra`. */
function commandLine(script, extra = /./) {
  const hits = SKILL.split('\n').map((l) => l.trim().replace(/^`|`\.?$/g, ''))
    .filter((l) => l.startsWith(`node "\${CLAUDE_PLUGIN_ROOT}/${script}"`) && extra.test(l));
  assert.equal(hits.length, 1, `SKILL.md has one command running ${script} matching ${extra}: ${hits}`);
  return hits[0];
}

/** Run a SKILL.md command line in bash, as Claude would, with the plugin root set and the network
 *  blocked. Both browser paths point at a stub that leaves a marker if anything launches it. */
function runAsSkill(line, { cwd, env = {} }) {
  const marker = path.join(cwd, '..', `browser-launched-${path.basename(cwd)}`);
  const stub = path.join(cwd, '..', 'browser-stub.sh');
  writeFileSync(stub, `#!/bin/sh\necho "$@" >> '${marker}'\nexit 1\n`);
  chmodSync(stub, 0o755);
  const r = spawnSync('bash', ['-c', line], {
    cwd, encoding: 'utf8', timeout: 60_000,
    env: {
      ...process.env, ...env, CLAUDE_PLUGIN_ROOT: ROOT, TMPDIR: path.join(cwd, '..'),
      NODE_OPTIONS: `--import ${NO_NET}`, PEAK_MEDIA_TTS_CACHE: path.join(cwd, '..', 'tts-cache'),
      HYPERFRAMES_BROWSER_PATH: stub, PEAK_MEDIA_HEADED_BROWSER_PATH: stub,
    },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, browserLaunched: existsSync(marker) };
}

test('AC-W2V-36: narrated with no key — the first commands the skill runs give one line naming PEAK_MEDIA_OPENROUTER_API_KEY, exit non-zero, launch no browser; SKILL.md stops there and offers captions', () => {
  // 1. Order: the key check (sample-voice) comes before every command that opens a browser or writes the project.
  const first = (needle) => { const i = SKILL.indexOf(needle); return i < 0 ? Infinity : i; };
  const keyCheck = first('skills/video-spine/scripts/sample-voice.mjs');
  assert.ok(keyCheck < Infinity, 'SKILL.md runs sample-voice');
  for (const later of ['playwright-cli', 'curl ', 'skills/video-spine/scripts/spine.mjs', 'skills/video-capture/scripts/capture.mjs', 'storyboard.mjs`:', 'lib/verify/probe-spec.mjs', 'scripts/capture.mjs" signin']) {
    assert.ok(keyCheck < first(later), `sample-voice comes before ${later}`);
  }

  // 2. The instruction around it: stop, name the variable, offer captions, open no browser.
  const para = SKILL.slice(SKILL.lastIndexOf('\n\n', SKILL.indexOf('Narrated: check the key')), SKILL.indexOf('3. **Reach the page'));
  assert.ok(para.length > 100, 'found the key-check paragraph');
  assert.match(para, /check the key now, before anything else runs/);
  assert.match(para, /\*\*stop\*\*/);
  assert.match(para, /PEAK_MEDIA_OPENROUTER_API_KEY/);
  assert.match(para, /offer to continue in captions mode/);
  assert.match(para, /Open no browser/);

  // 3. Run the narrated path's commands in the skill's order, as written, with both keys unset.
  const work = tmpDir('pm-w2v36-');
  const cwd = path.join(work, 'project');
  spawnSync('mkdir', ['-p', cwd]);
  for (const f of ['brief.md', 'script.md']) copyFileSync(path.join(UI_DEMO, f), path.join(cwd, f));

  const sv = runAsSkill(commandLine('skills/video-spine/scripts/sample-voice.mjs'), { cwd, env: NO_KEY });
  assert.notEqual(sv.code, 0, `sample-voice exits non-zero: ${sv.stdout}${sv.stderr}`);
  assert.equal(lines(sv.stderr).length, 1, `one line: ${sv.stderr}`);
  assert.match(sv.stderr, /PEAK_MEDIA_OPENROUTER_API_KEY/);
  assert.doesNotMatch(sv.stderr, /\n\s+at /, 'no stack trace');
  assert.equal(sv.stdout, '', 'nothing on stdout');
  assert.doesNotMatch(sv.stderr, /NETWORK-ATTEMPT/, 'no network call');
  assert.equal(sv.browserLaunched, false, 'no browser launched');
  assert.ok(!existsSync(path.join(work, 'web2video-voice')), 'no voice samples written');

  // spine --budget is offline and needs no key; it must not launch a browser either
  const budget = runAsSkill(commandLine('skills/video-spine/scripts/spine.mjs', /--budget/).replace('<wpm>', '165'), { cwd, env: NO_KEY });
  assert.equal(budget.code, 0, budget.stderr);
  assert.match(budget.stdout, /^budget /m);
  assert.doesNotMatch(budget.stderr, /NETWORK-ATTEMPT/);
  assert.equal(budget.browserLaunched, false);

  // and the spine step itself (after the gate) refuses rather than falling back to a beat grid
  const spine = runAsSkill(commandLine('skills/video-spine/scripts/spine.mjs', /--narrate/), { cwd, env: NO_KEY });
  assert.notEqual(spine.code, 0);
  assert.equal(lines(spine.stderr).length, 1, spine.stderr);
  assert.match(spine.stderr, /PEAK_MEDIA_OPENROUTER_API_KEY/);
  assert.equal(spine.browserLaunched, false);
  assert.ok(!existsSync(path.join(cwd, 'spine')), 'no spine written');
});

/** Every file under dir (skipping node_modules), relative to ROOT. */
function files(dir) {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p); } else out.push(path.relative(ROOT, p)); } };
  if (existsSync(dir)) walk(dir);
  return out;
}

test('AC-W2V-38: no brand or organization name in the plugin runtime tree, web2video included (author metadata excluded)', () => {
  // the name AC-PKG-03 checks, spelled in parts so this file doesn't match itself
  const BRAND = new RegExp(['peak', 'flames'].join(''), 'i');
  // AC-PKG-03's runtime tree; docs/ and .claude-plugin/ (author and repository fields) are excluded
  const all = ['skills', 'lib', 'schemas', 'brand-packs', 'vendor', 'scripts', 'evals'].flatMap((d) => files(path.join(ROOT, d)));
  for (const f of ['skills/web2video/SKILL.md', 'skills/web2video/references/presets.md', 'skills/web2video/references/login.md',
    'skills/web2video/references/handoff.md', 'evals/web2video/uat/cases.md', 'evals/web2video/uat/fixtures/login-demo/server.mjs',
    'evals/web2video/uat/fixtures/rough-app/index.html']) assert.ok(all.includes(f), `walked ${f}`);
  const hits = all.filter((f) => BRAND.test(f) || BRAND.test(readFileSync(path.join(ROOT, f), 'latin1')));
  assert.deepEqual(hits, [], 'case-insensitive brand-name hits');
});

test('web2video docs: every command runs a plugin script as node "${CLAUDE_PLUGIN_ROOT}/…" with flags that script accepts (not AC-bound)', () => {
  let n = 0;
  for (const [name, doc] of DOCS) {
    for (const m of doc.matchAll(/(?:^|[\s`(])node\s+(\S+)/gm)) {
      assert.match(m[1], /^"\$\{CLAUDE_PLUGIN_ROOT\}\//, `${name}: node runs "\${CLAUDE_PLUGIN_ROOT}/…", not ${m[1]}`);
    }
    for (const m of doc.matchAll(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"([^\n`]*)/g)) {
      n++;
      const script = path.join(ROOT, m[1]);
      assert.ok(existsSync(script), `${name}: ${m[1]} exists`);
      const sub = /^\s*(signin|serve)\b/.exec(m[2])?.slice(1, 2) ?? [];
      const help = spawnSync(process.execPath, [script, ...sub, '--help'], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: `--import ${NO_NET}` } });
      assert.equal(help.status, 0, `${m[1]} ${sub} --help`);
      for (const f of m[2].match(/(?<=\s)--[a-z][a-z-]*/g) ?? []) assert.ok(help.stdout.includes(f), `${name}: ${m[1]} ${sub.join(' ')} accepts ${f}`);
    }
    for (const m of doc.matchAll(/bash "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/g)) assert.ok(existsSync(path.join(ROOT, m[1])), `${name}: ${m[1]} exists`);
    for (const m of doc.matchAll(/`references\/([a-z-]+\.md)`/g)) assert.ok(REFS.includes(m[1]), `${name}: references/${m[1]} exists`);
  }
  assert.ok(n >= 8, `checked ${n} commands`);
  assert.equal((SKILL.match(/AskUserQuestion/g) ?? []).length >= 1, true);
  assert.match(SKILL, /^name: web2video$/m);
});

test('UAT fixtures: cases.md lists AC-UAT-01..12 once each with a fixture; login-demo signs in by cookie; rough-app has its three traps (not AC-bound)', async () => {
  const cases = readFileSync(path.join(ROOT, 'evals', 'web2video', 'uat', 'cases.md'), 'utf8');
  const rows = cases.split('\n').filter((l) => /^\| AC-UAT-\d\d \|/.test(l));
  assert.deepEqual(rows.map((r) => r.slice(2, 11)), Array.from({ length: 12 }, (_, i) => `AC-UAT-${String(i + 1).padStart(2, '0')}`));
  for (const r of rows) assert.match(r.split('|')[2], /To-do app|3-slide deck|Login demo|Rough app/, `fixture named: ${r.slice(0, 40)}`);

  const html = readFileSync(path.join(ROOT, 'evals', 'web2video', 'uat', 'fixtures', 'rough-app', 'index.html'), 'utf8');
  assert.match(html, /id="rows"/);
  assert.match(html, /position: sticky/);
  assert.match(html, /i <= 200/);
  assert.match(html, /id="break"/);
  assert.match(html, /API key: sk-demo-0000-FLAG-ME/);

  // login-demo on its fixed port; skip if something else holds 4173
  const busy = await new Promise((res) => { const s = net.connect(4173, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
  if (busy) return;
  const srv = spawn(process.execPath, [path.join(ROOT, 'evals', 'web2video', 'uat', 'fixtures', 'login-demo', 'server.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((res) => srv.stdout.once('data', res));
    const out = await (await fetch('http://127.0.0.1:4173/')).text();
    assert.match(out, /<h1>Sign in<\/h1>/);
    assert.match(out, /type=password/);
    const login = await fetch('http://127.0.0.1:4173/login', { method: 'POST', redirect: 'manual' });
    assert.equal(login.status, 303);
    assert.match(login.headers.get('set-cookie'), /^session=demo; Path=\/; HttpOnly/);
    const dash = await (await fetch('http://127.0.0.1:4173/', { headers: { cookie: 'session=demo' } })).text();
    assert.match(dash, /data-testid=dash>Dashboard/);
    assert.match(dash, /id=report/);
  } finally { srv.kill(); }
});

/** The text of workflow step n of SKILL.md (from "n. **" to the next step). */
const step = (n) => SKILL.slice(SKILL.indexOf(`\n${n}. **`), n < 10 ? SKILL.indexOf(`\n${n + 1}. **`) : undefined);

test('WP17 UAT fixes in SKILL.md: serve for local folders (D1), silent keeps the cursor (D2), privacy stills (D4), sizing margin and no silent changes (D6), re-record rebuilds the command (D7), edits shown before capture (D8) (not AC-bound)', () => {
  // D1: one exact command for a local folder, and how to stop it
  const s4 = step(4);
  assert.match(s4, /blocks `file:\/\/`/);
  assert.equal(commandLine('skills/video-capture/scripts/capture.mjs', /\bserve <folder>$/).length > 0, true);
  assert.match(s4, /run_in_background/);
  assert.match(s4, /kill <pid>/);
  assert.match(s4, /don't\s+start any other server/);
  // D2: silent = --no-captions only
  assert.match(step(2), /mean `--no-captions` only: the cursor stays/);
  assert.match(step(2), /`--no-cursor` only when the user\s+explicitly asks/);
  // D3: hide before t0, pointed at from steps 5 and 9
  assert.match(step(5), /export const hide = \['<selector>', …\]/);
  assert.match(step(9), /\*\*hide\*\* it \(`export const hide/);
  // D4: first and last frames in every sheet, read full size
  assert.equal(commandLine('lib/verify/contact-sheet.mjs', /-o review\/<slug>\.jpg/).includes('--at 0s,<t1>s,<t2>s,…,<videoMs>ms'), true);
  assert.match(commandLine('lib/verify/contact-sheet.mjs', /-ends\.jpg/), /--at 0s,<videoMs>ms --cols 1 --width <take width>/);
  assert.match(step(9), /Always Read the\s+first and last frames at full size, every take/);
  // D6: budget with a margin; runtime fixes are proposed, never silent
  assert.match(step(5), /measured rate × 0\.9/);
  assert.match(step(7), /never applied silently/);
  assert.match(step(7), /--lead-ms`, `--tail-ms`, storyboard waits/);
  // D7: re-record rebuilds the step 8 command from the project, not command[]
  const rr = SKILL.slice(SKILL.indexOf('**Re-recording.**'), SKILL.indexOf('## Workflow'));
  assert.match(rr, /not the saved `command\[\]`/);
  for (const k of ['`preset`', '`mode`', '`cursor: false` → `--no-cursor`', '`signedIn: true` → `--storage-state']) assert.ok(rr.includes(k), `re-record carries ${k}`);
  // D8: original → proposed printed before any spine or capture command
  assert.match(step(6), /first print it in chat as `original → proposed`/);
  assert.match(step(6), /\*\*before\*\* any spine or capture command runs/);
});
