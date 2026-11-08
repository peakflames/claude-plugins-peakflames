// v1 contract validation: JSON Schema (ajv, draft 2020-12) plus the
// cross-reference checks a schema can't express. Every error names its field.
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { PLUGIN_ROOT, CliError } from './cli.mjs';
import { importDep } from './deps.mjs';

export const SCHEMA_VERSION = 1;
export const KINDS = {
  spine: 'spine-manifest.v1.json',
  plates: 'plates.v1.json',
  brand: 'brand-pack.v1.json',
};
export const REQUIRED_TOKENS = ['--color-bg', '--color-fg', '--color-accent', '--font-display', '--font-body', '--font-mono'];

let ajvPromise;
async function validators() {
  ajvPromise ??= (async () => {
    const mod = await importDep('ajv/dist/2020');
    const Ajv = mod.default?.default ?? mod.default;
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
    const out = {};
    for (const [k, f] of Object.entries(KINDS)) {
      out[k] = ajv.compile(JSON.parse(readFileSync(path.join(PLUGIN_ROOT, 'schemas', f), 'utf8')));
    }
    return out;
  })();
  return ajvPromise;
}

/** Guess the contract from a file name; null if it can't tell. */
export function detectKind(file) {
  const b = path.basename(file).toLowerCase();
  if (/(manifest|beatgrid|narration)[^/]*\.json$/.test(b)) return 'spine';
  if (/plates[^/]*\.json$/.test(b)) return 'plates';
  if (/brand[^/]*\.json$/.test(b)) return 'brand';
  return null;
}

/** "/plates/0/beat" -> "plates[0].beat" */
export function fieldPath(pointer, extra) {
  const parts = pointer.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (extra !== undefined) parts.push(extra);
  let s = '';
  for (const p of parts) s += /^\d+$/.test(p) ? `[${p}]` : s ? `.${p}` : p;
  return s || '(root)';
}

function ajvToErrors(errs) {
  const out = [];
  for (const e of errs ?? []) {
    if (e.keyword === 'if') continue; // the failing `then` branch is reported on its own
    let field = fieldPath(e.instancePath);
    let message = e.message;
    if (e.keyword === 'required') { field = fieldPath(e.instancePath, e.params.missingProperty); message = 'is required'; }
    else if (e.keyword === 'additionalProperties') { field = fieldPath(e.instancePath, e.params.additionalProperty); message = 'is not allowed (unknown field; use an x- prefix for extensions)'; }
    else if (e.keyword === 'enum') message = `must be one of ${e.params.allowedValues.join(', ')}`;
    else if (e.keyword === 'not' && e.schemaPath.endsWith('/else/not') && e.instancePath.startsWith('/plates/')) {
      if (errs.some((o) => o.keyword === 'required' && o.instancePath === e.instancePath && o.params.missingProperty === 'kind')) continue; field = fieldPath(e.instancePath, 'live'); message = 'is only allowed on plates of kind "live"'; }
    else if (e.keyword === 'const') message = `must be ${JSON.stringify(e.params.allowedValue)}`;
    out.push({ field, message });
  }
  // de-duplicate (allErrors can repeat through allOf branches)
  const seen = new Set();
  return out.filter((e) => { const k = `${e.field}\0${e.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function semanticSpine(doc) {
  const errs = [];
  const ids = new Set();
  doc.beats.forEach((b, i) => {
    if (ids.has(b.id)) errs.push({ field: `beats[${i}].id`, message: `duplicate beat id '${b.id}'` });
    ids.add(b.id);
    if (i > 0) {
      const prev = doc.beats[i - 1];
      if (b.startMs < prev.startMs + prev.durationMs) errs.push({ field: `beats[${i}].startMs`, message: `overlaps beats[${i - 1}] (must be >= ${prev.startMs + prev.durationMs})` });
    }
  });
  if (doc.kind === 'beatgrid') doc.beats.forEach((b, i) => {
    if (!b.onScreenText?.trim()) errs.push({ field: `beats[${i}].onScreenText`, message: 'must have visible text in a beat grid (DEC-23)' });
  });
  const ns = new Set();
  doc.clips.forEach((c, i) => {
    if (ns.has(c.n)) errs.push({ field: `clips[${i}].n`, message: `duplicate clip number ${c.n}` });
    ns.add(c.n);
    const b = doc.beats.find((x) => x.id === c.beat);
    if (!b) { errs.push({ field: `clips[${i}].beat`, message: `references unknown beat '${c.beat}'` }); return; }
    if (!b.clipNs.includes(c.n)) errs.push({ field: `clips[${i}].beat`, message: `beat '${b.id}' does not list clip ${c.n} in clipNs` });
    if (c.startMs < b.startMs || c.startMs + c.durationMs > b.startMs + b.durationMs) {
      errs.push({ field: `clips[${i}].startMs`, message: `clip ${c.n} (${c.startMs}–${c.startMs + c.durationMs} ms) is outside beat '${b.id}' (${b.startMs}–${b.startMs + b.durationMs} ms)` });
    }
  });
  doc.beats.forEach((b, i) => b.clipNs.forEach((n, j) => {
    if (!ns.has(n)) errs.push({ field: `beats[${i}].clipNs[${j}]`, message: `references unknown clip ${n}` });
    else if (doc.clips.find((c) => c.n === n).beat !== b.id) errs.push({ field: `beats[${i}].clipNs[${j}]`, message: `clip ${n} belongs to a different beat` });
  }));
  const end = Math.max(...doc.beats.map((b) => b.startMs + b.durationMs), ...doc.clips.map((c) => c.startMs + c.durationMs));
  if (doc.totalMs < end) errs.push({ field: 'totalMs', message: `is ${doc.totalMs} but content ends at ${end}` });
  return errs;
}

function semanticPlates(doc, file) {
  const errs = [];
  const ids = new Set();
  doc.plates.forEach((p, i) => {
    if (ids.has(p.id)) errs.push({ field: `plates[${i}].id`, message: `duplicate plate id '${p.id}'` });
    ids.add(p.id);
  });
  const order = doc.plates.map((p, i) => [p, i]).sort((a, b) => a[0].startMs - b[0].startMs);
  for (let k = 1; k < order.length; k++) {
    const [prev, pi] = order[k - 1]; const [p, i] = order[k];
    if (p.startMs < prev.startMs + prev.durationMs) errs.push({ field: `plates[${i}].startMs`, message: `overlaps plates[${pi}] '${prev.id}' (must be >= ${prev.startMs + prev.durationMs})` });
  }
  if (file) {
    const dir = path.dirname(file);
    const spinePath = path.resolve(dir, doc.spine);
    if (!existsSync(spinePath)) errs.push({ field: 'spine', message: `file not found: ${doc.spine}` });
    else {
      let spine;
      try { spine = JSON.parse(readFileSync(spinePath, 'utf8')); } catch { errs.push({ field: 'spine', message: `${doc.spine} is not valid JSON` }); }
      if (spine) doc.plates.forEach((p, i) => {
        const b = (spine.beats ?? []).find((x) => x.id === p.beat);
        if (!b) { errs.push({ field: `plates[${i}].beat`, message: `beat '${p.beat}' is not in ${doc.spine}` }); return; }
        if (p.startMs < b.startMs || p.startMs + p.durationMs > b.startMs + b.durationMs) {
          errs.push({ field: `plates[${i}].startMs`, message: `plate '${p.id}' (${p.startMs}–${p.startMs + p.durationMs} ms) is outside beat '${b.id}' (${b.startMs}–${b.startMs + b.durationMs} ms)` });
        }
      });
    }
    const brandPath = path.resolve(dir, doc.brand);
    if (!existsSync(brandPath)) errs.push({ field: 'brand', message: `not found: ${doc.brand} (render steps will fail until it exists)`, warn: true });
  }
  return errs;
}

function semanticBrand(doc, file) {
  if (!file) return [];
  const errs = [];
  const dir = path.dirname(file);
  const mustExist = (rel, field) => {
    if (!existsSync(path.resolve(dir, rel))) { errs.push({ field, message: `file not found: ${rel}` }); return false; }
    return true;
  };
  if (mustExist(doc.tokens, 'tokens')) {
    const css = readFileSync(path.resolve(dir, doc.tokens), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:\s*([^;}]*)/g)].filter((m) => m[2].trim()).map((m) => m[1]));
    for (const t of REQUIRED_TOKENS) if (!defined.has(t)) errs.push({ field: 'tokens', message: `${doc.tokens} does not define ${t}` });
    if (![...defined].some((t) => t.startsWith('--ease-'))) errs.push({ field: 'tokens', message: `${doc.tokens} defines no --ease-* property` });
  }
  doc.fonts.forEach((f, i) => {
    f.files.forEach((x, j) => mustExist(x, `fonts[${i}].files[${j}]`));
    mustExist(f.license, `fonts[${i}].license`);
  });
  mustExist(doc.logo, 'logo');
  mustExist(doc.outro.composition, 'outro.composition');
  if (doc.outro.audio) mustExist(doc.outro.audio, 'outro.audio');
  if (doc.captionCss) mustExist(doc.captionCss, 'captionCss');
  mustExist(doc.music.rules, 'music.rules');
  if (doc.music.credits) mustExist(doc.music.credits, 'music.credits');
  return errs;
}

/**
 * Validate a parsed contract document. `file` (optional) enables path checks.
 * Returns {ok, kind, errors:[{field,message}]}.
 */
export async function validateDoc(kind, doc, file) {
  if (!KINDS[kind]) throw new CliError(`unknown contract '${kind}' (expected ${Object.keys(KINDS).join(', ')})`);
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, kind, errors: [{ field: '(root)', message: 'must be a JSON object' }] };
  }
  if (!('schemaVersion' in doc)) {
    return { ok: false, kind, errors: [{ field: 'schemaVersion', message: `is required (this plugin reads schemaVersion ${SCHEMA_VERSION})` }] };
  }
  if (doc.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, kind, errors: [{ field: 'schemaVersion', message: `is ${JSON.stringify(doc.schemaVersion)}; this plugin reads ${SCHEMA_VERSION} — update peak-media or migrate the file` }] };
  }
  const v = (await validators())[kind];
  if (!v(doc)) return { ok: false, kind, errors: ajvToErrors(v.errors) };
  const sem = kind === 'spine' ? semanticSpine(doc) : kind === 'plates' ? semanticPlates(doc, file) : semanticBrand(doc, file);
  const errors = sem.filter((e) => !e.warn);
  const warnings = sem.filter((e) => e.warn).map(({ field, message }) => ({ field, message }));
  return { ok: errors.length === 0, kind, errors, warnings };
}

/** Read + parse + validate a file. A brand pack folder resolves to its brand.json. */
export async function validateFile(file, kind) {
  let f = file;
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'brand.json');
  if (!existsSync(f)) throw new CliError(`cannot read ${file}: no such file`);
  const k = kind ?? detectKind(f);
  if (!k) throw new CliError(`can't tell which contract ${file} is — pass --schema spine|plates|brand`, 2);
  let doc;
  try { doc = JSON.parse(readFileSync(f, 'utf8')); } catch (e) {
    return { ok: false, kind: k, file: f, errors: [{ field: '(file)', message: `is not valid JSON: ${e.message.replace(/\s*\n\s*/g, ' ')}` }] };
  }
  return { ...(await validateDoc(k, doc, f)), file: f };
}

/**
 * Map a legacy web2video / record-website-interaction narration.json to a v1
 * spine manifest (D11). Every legacy field is kept; each clip becomes its own beat.
 */
export function fromLegacyNarration(legacy) {
  const clips = legacy.clips.map((c) => ({ ...c, beat: `b${c.n}` }));
  const end = Math.max(...clips.map((c) => c.startMs + c.durationMs));
  const totalMs = Math.max(legacy.videoMs ?? 0, end);
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'narration',
    targetMs: totalMs,
    totalMs,
    model: legacy.model,
    voice: legacy.voice,
    style: legacy.style ?? '',
    audioOffsetMs: legacy.audioOffsetMs ?? 0,
    command: legacy.command ?? [],
    narrate: true,
    ...(legacy.videoMs !== undefined && { videoMs: legacy.videoMs }),
    ...(legacy.wallMs !== undefined && { wallMs: legacy.wallMs }),
    beats: clips.map((c) => ({ id: c.beat, startMs: c.startMs, durationMs: c.durationMs, clipNs: [c.n] })),
    clips,
  };
}
