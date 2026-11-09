#!/usr/bin/env node
// render-plate — turn motion/slide entries of plates.json into renders/plates/<id>.mp4.
// One HyperFrames composition per plate (plates/<id>/index.html), each rendered alone at
// the plates.json fps/size; the render must last durationMs ±1 frame. Live plates belong
// to video-capture. Brand comes only from the pack's tokens.css (copied to plates/<id>/brand/),
// GSAP only from the local pinned copy (plates/<id>/vendor/gsap.min.js).
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, statSync, mkdtempSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runCli, CliError, EXIT, PLUGIN_ROOT } from '../../../lib/cli.mjs';
import { validateFile } from '../../../lib/schemas.mjs';
import { preflight } from '../../../lib/preflight.mjs';
import { render, hf, gsapPath } from '../../../lib/hf.mjs';
import { ffmpeg } from '../../../lib/ffmpeg.mjs';
import { probeSpec } from '../../../lib/verify/probe-spec.mjs';
import { contactSheet } from '../../../lib/verify/contact-sheet.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES = { motion: path.join(SKILL, 'templates', 'motion'), slide: path.join(SKILL, 'templates', 'slide') };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lines = (p) => [p.text ?? p.intent].flat().map((l) => String(l)).filter((l) => l.trim());
const fail = (fileOrMsg, errs) => new CliError(errs ? `${fileOrMsg}: ${errs.map((e) => `${e.field}: ${e.message}`).join('; ')}` : fileOrMsg);

/** Body markup for a plate, by kind. Every element the template animates is written here, in HTML. */
export function bodyHtml(plate) {
  const ls = lines(plate);
  if (plate.kind === 'motion') {
    return ls.map((l, i) => `      <div class="line" id="line-${i + 1}">${esc(l)}</div>`).join('\n');
  }
  // slide: title + bullets, or title + table rows when lines hold "|" cells
  const isRow = (l) => l.includes('|');
  const title = isRow(ls[0] ?? '') ? plate.intent : ls[0];
  const rest = isRow(ls[0] ?? '') ? ls : ls.slice(1);
  const out = [`      <h1 class="title" id="title">${esc(title)}</h1>`, '      <div class="rule" id="rule"></div>'];
  if (rest.length && rest.every(isRow)) {
    const rows = rest.map((l) => l.split('|').map((c) => c.trim()));
    const cols = Math.max(...rows.map((r) => r.length));
    out.push('      <div id="body">');
    out.push(`        <div class="table" id="table" style="grid-template-columns: max-content repeat(${cols - 1}, minmax(0, 1fr));">`);
    rows.forEach((r, i) => {
      out.push(`          <div class="row" id="row-${i + 1}">`);
      for (let c = 0; c < cols; c++) out.push(`            <div class="cell${c === 0 ? ' head' : ''}" id="cell-${i + 1}-${c + 1}">${esc(r[c] ?? '')}</div>`);
      out.push('          </div>');
    });
    out.push('        </div>', '      </div>');
  } else if (rest.length) {
    out.push('      <div id="body">', '        <ul class="bullets" id="bullets">');
    rest.forEach((l, i) => {
      const m = /^([^:]{1,40}):\s+(.+)$/.exec(l); // "Label: text" -> accented label
      const inner = m ? `<span class="label">${esc(m[1])}:</span> ${esc(m[2])}` : esc(l);
      out.push(`          <li class="bullet" id="bullet-${i + 1}">${inner}</li>`);
    });
    out.push('        </ul>', '      </div>');
  }
  return out.join('\n');
}

/** Fill a kind's template for one plate. `logo` is the pack's logo path inside plates/<id>/. */
export function fillTemplate(plate, { fps, width, height, slideNo = 1, slideTotal = 1, logo = 'brand/logo.svg' }) {
  const tpl = TEMPLATES[plate.kind];
  if (!tpl) throw new CliError(`plate ${plate.id}: no template for kind '${plate.kind}'`);
  const body = bodyHtml(plate);
  const vars = {
    WIDTH: String(width), HEIGHT: String(height), FPS: String(fps), DURATION_S: String(plate.durationMs / 1000),
    PLATE_ID: esc(plate.id), INTENT: esc(plate.intent), LINES: body, BODY: body, LOGO: esc(logo),
    COUNTER: slideTotal > 1 ? `      <div class="counter" id="counter">${slideNo} / ${slideTotal}</div>` : '      <div class="counter" id="counter"></div>',
  };
  return readFileSync(path.join(tpl, 'index.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new CliError(`template ${plate.kind}: unknown placeholder ${m}`);
    return vars[k];
  });
}

/** Resolve a brand pack argument (folder or brand.json) to its folder. */
export function brandDirOf(p) {
  return existsSync(p) && statSync(p).isFile() ? path.dirname(p) : p;
}

/**
 * Make plates/<id>/ ready to render: keep a hand-authored index.html (unless rescaffold),
 * otherwise write it from the kind's template; always refresh brand/ and vendor/gsap.min.js.
 * Returns {dir, scaffolded}.
 */
export function preparePlate(plate, { project, brandDir, fps, width, height, slideNo, slideTotal, rescaffold = false, gsap }) {
  const dir = path.join(project, 'plates', plate.id);
  const html = path.join(dir, 'index.html');
  const scaffolded = rescaffold || !existsSync(html);
  mkdirSync(path.join(dir, 'vendor'), { recursive: true });
  if (scaffolded) {
    const logo = JSON.parse(readFileSync(path.join(brandDir, 'brand.json'), 'utf8')).logo;
    writeFileSync(html, fillTemplate(plate, { fps, width, height, slideNo, slideTotal, logo: path.posix.join('brand', logo) }));
  }
  rmSync(path.join(dir, 'brand'), { recursive: true, force: true });
  cpSync(brandDir, path.join(dir, 'brand'), { recursive: true });
  cpSync(gsap ?? gsapPath(), path.join(dir, 'vendor', 'gsap.min.js'));
  return { dir, scaffolded };
}

const firstFinding = (r) => {
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    const all = [...(j.findings ?? []), ...Object.values(j).flatMap((sec) => (sec && Array.isArray(sec.findings) ? sec.findings : []))];
    const f = all.find((x) => x?.severity === 'error') ?? all.find((x) => x?.severity === 'warning');
    if (f) return `${f.code ?? f.rule ?? f.id ?? ''} ${f.message ?? ''}`.trim();
  } catch { /* fall through */ }
  return (r.stderr + r.stdout).trim().split('\n').filter((l) => /error|✗|fail/i.test(l)).at(0) ?? `exit ${r.code}`;
};

/** hyperframes lint + check --strict on one plate folder. Throws on any finding that fails them. */
export function lintPlate(dir, id) {
  const lint = hf(['lint', dir, '--json']);
  if (lint.code !== 0) throw new CliError(`plate ${id}: hyperframes lint failed — ${firstFinding(lint)} (fix ${path.join(dir, 'index.html')})`);
  const check = hf(['check', dir, '--strict', '--json', '--no-cache']);
  if (check.code !== 0) throw new CliError(`plate ${id}: hyperframes check --strict failed — ${firstFinding(check)} (fix ${path.join(dir, 'index.html')})`);
  return { lint: lint.stdout, check: check.stdout };
}

/** One storyboard key frame per plate (HF snapshot), tiled into review/storyboard.jpg. */
export function storyboard(items, { project, atFrac = 0.7 }) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-story-'));
  try {
    const stills = path.join(project, 'review', 'storyboard');
    mkdirSync(stills, { recursive: true });
    items.forEach(({ plate, dir }, i) => {
      const at = ((plate.durationMs * atFrac) / 1000).toFixed(2);
      const o = path.join(tmp, plate.id);
      const r = hf(['snapshot', dir, '--at', at, '--no-end', '-o', o]);
      const png = existsSync(o) && readdirSync(o).find((f) => f.endsWith('.png'));
      if (r.code !== 0 || !png) throw new CliError(`plate ${plate.id}: snapshot failed — ${firstFinding(r)}`);
      cpSync(path.join(o, png), path.join(stills, `${plate.id}.png`));
      cpSync(path.join(o, png), path.join(tmp, `f_${String(i + 1).padStart(4, '0')}.png`));
    });
    const cols = Math.min(3, items.length);
    const out = path.join(project, 'review', 'storyboard.jpg');
    ffmpeg(['-y', '-framerate', '1', '-i', path.join(tmp, 'f_%04d.png'), '-vf', `scale=640:-2,tile=${cols}x${Math.ceil(items.length / cols)}:padding=6:margin=6:color=0x202020`, '-frames:v', '1', '-q:v', '3', out], { what: 'storyboard tiling' });
    return out;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Load + validate plates.json and the brand pack; pick the plates to work on. */
export async function loadPlan(platesFile, { ids = [], all = false, brand } = {}) {
  if (!existsSync(platesFile)) throw new CliError(`cannot read ${platesFile}: no such file`);
  const v = await validateFile(platesFile, 'plates');
  if (!v.ok) throw fail(platesFile, v.errors);
  const plan = JSON.parse(readFileSync(platesFile, 'utf8'));
  const brandDir = path.resolve(brandDirOf(brand ?? path.resolve(path.dirname(platesFile), plan.brand)));
  if (!existsSync(brandDir)) throw new CliError(`brand pack not found: ${brandDir} — fix "brand" in ${platesFile} or pass --brand <pack>`);
  const bv = await validateFile(brandDir, 'brand');
  if (!bv.ok) throw fail(`brand pack ${brandDir}`, bv.errors);
  if (!all && !ids.length) throw new CliError('name plate id(s) after plates.json, or pass --all', EXIT.USAGE);
  if (all && ids.length) throw new CliError('pass plate ids or --all, not both', EXIT.USAGE);
  const byId = new Map(plan.plates.map((p) => [p.id, p]));
  for (const id of ids) if (!byId.has(id)) throw new CliError(`no plate '${id}' in ${platesFile} (plates: ${[...byId.keys()].join(', ')})`);
  const chosen = all ? plan.plates.filter((p) => p.kind !== 'live') : ids.map((id) => byId.get(id));
  const live = chosen.find((p) => p.kind === 'live');
  if (live) throw new CliError(`plate ${live.id} is kind 'live' — it is played and screen-captured, not rendered: use video-capture (skills/video-capture/scripts/capture.mjs)`);
  if (!chosen.length) throw new CliError(`no motion or slide plates in ${platesFile} (live plates use video-capture)`);
  const slides = plan.plates.filter((p) => p.kind === 'slide').sort((a, b) => a.startMs - b.startMs).map((p) => p.id);
  return { plan, brandDir, chosen: [...chosen].sort((a, b) => a.startMs - b.startMs), slides };
}

const spec = {
  name: 'render-plate',
  summary: 'render motion/slide plates from plates.json, each alone, to renders/plates/<id>.mp4',
  usage: 'render-plate [options] <plates.json> (<plate-id>... | --all)',
  description: `
For each plate: plates/<id>/index.html is kept if it exists (hand-authored) or written from the
template for its kind (templates/motion, templates/slide); brand/ (the brand pack) and
vendor/gsap.min.js are refreshed; the composition is rendered on its own at the plates.json
fps and size; the MP4 must last durationMs ±1 frame. Live plates are refused (use video-capture).
Project folders (plates/, renders/plates/, review/) live next to plates.json unless --out is given.`,
  options: {
    all: { type: 'boolean', desc: 'Every motion and slide plate in plates.json (live plates are skipped)' },
    brand: { type: 'string', arg: 'pack', desc: 'Brand pack folder or brand.json (overrides plates.json "brand")' },
    out: { type: 'string', arg: 'dir', desc: 'Project folder for plates/, renders/plates/ and review/ (default: the plates.json folder)' },
    sheet: { type: 'boolean', desc: 'Also write review/contact-<id>.jpg (a frame every --every)' },
    every: { type: 'string', arg: 'time', desc: 'Contact-sheet interval with --sheet, e.g. 0.5s or 250ms', default: '0.5s' },
    lint: { type: 'boolean', desc: 'Run hyperframes lint and check --strict on each plate before rendering; any failure stops' },
    storyboard: { type: 'boolean', desc: 'Do not render: snapshot one key frame per plate into review/storyboard.jpg (stage 4)' },
    'scaffold-only': { type: 'boolean', desc: 'Only prepare plates/<id>/ (template, brand, GSAP); do not render' },
    rescaffold: { type: 'boolean', desc: 'Overwrite an existing plates/<id>/index.html from the template' },
    quality: { type: 'string', desc: 'HyperFrames render quality', default: 'standard', choices: ['draft', 'looks', 'standard', 'high', 'delivery'] },
    json: { type: 'boolean', desc: 'Print the results as JSON' },
  },
  positionals: { min: 1, max: Infinity },
  examples: [
    'render-plate plates.json --all --sheet',
    'render-plate plates.json p2-table --lint',
    'render-plate plates.json --all --storyboard',
    'render-plate docs/build/fixtures/F1/plates.json --all --brand brand-packs/default --out /tmp/f1',
  ],
};

function parseMs(v) {
  const m = /^([\d.]+)(ms|s)?$/.exec(String(v).trim());
  if (!m || !(Number(m[1]) > 0)) throw new CliError(`--every expects a time like 0.5s or 500ms, got '${v}'`, EXIT.USAGE);
  return m[2] === 'ms' ? Number(m[1]) : Number(m[1]) * 1000;
}

export async function main({ values, positionals: [platesArg, ...ids] }) {
  const everyMs = parseMs(values.every);
  if (values.storyboard && values['scaffold-only']) throw new CliError('pass --storyboard or --scaffold-only, not both', EXIT.USAGE);
  const platesFile = path.resolve(platesArg);
  const { plan, brandDir, chosen, slides } = await loadPlan(platesFile, { ids, all: values.all, brand: values.brand });
  const project = path.resolve(values.out ?? path.dirname(platesFile));
  const rendering = !values['scaffold-only'] && !values.storyboard;
  preflight({ ffmpeg: true, deps: ['gsap'], hyperframes: !values['scaffold-only'] });
  const { fps, width, height } = plan;
  const gsap = gsapPath();
  const results = [];
  const prepared = [];
  for (const plate of chosen) {
    const { dir, scaffolded } = preparePlate(plate, {
      project, brandDir, fps, width, height, gsap, rescaffold: values.rescaffold,
      slideNo: slides.indexOf(plate.id) + 1, slideTotal: slides.length,
    });
    prepared.push({ plate, dir });
    const r = { id: plate.id, kind: plate.kind, dir, scaffolded };
    if (values.lint) { lintPlate(dir, plate.id); r.lint = 'ok'; }
    if (rendering) {
      const mp4 = path.join(project, 'renders', 'plates', `${plate.id}.mp4`);
      mkdirSync(path.dirname(mp4), { recursive: true });
      rmSync(mp4, { force: true });
      render(dir, mp4, { fps, quality: values.quality });
      const ps = probeSpec(mp4, { durationMs: plate.durationMs, fps, width, height, audio: false });
      const bad = ps.checks.filter((c) => /^(duration|width|height|fps)/.test(c.name) && !c.ok);
      if (bad.length) throw new CliError(`plate ${plate.id}: ${bad.map((c) => `${c.name} is ${c.actual}, planned ${c.expected}`).join('; ')} — check data-duration/data-fps in ${path.join(dir, 'index.html')}`);
      r.mp4 = mp4;
      r.durationMs = Number(ps.checks.find((c) => c.name.startsWith('duration')).actual.replace(/ ms$/, ''));
      if (values.sheet) {
        r.sheet = contactSheet(mp4, { out: path.join(project, 'review', `contact-${plate.id}.jpg`), everyMs, cols: 3, width: 760 }).out;
      }
    }
    results.push(r);
    if (!values.json) {
      const what = rendering ? `${r.mp4} (${r.durationMs} ms, planned ${plate.durationMs})` : `${dir}${scaffolded ? ' (scaffolded)' : ' (kept)'}`;
      process.stdout.write(`${plate.id}: ${what}${r.lint ? ' lint+check ok' : ''}${r.sheet ? ` sheet ${r.sheet}` : ''}\n`);
    }
  }
  let board;
  if (values.storyboard) {
    board = storyboard(prepared, { project });
    if (!values.json) process.stdout.write(`storyboard: ${board}\n`);
  }
  if (values.json) process.stdout.write(JSON.stringify({ project, brand: brandDir, plates: results, storyboard: board }, null, 2) + '\n');
  return EXIT.OK;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runCli(spec, main);
export { spec };
