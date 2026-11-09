#!/usr/bin/env node
// retime-plates — set every plate's startMs/durationMs from its spine beat (DEC-37, AC-ORC-05).
// Plate times are never hand-set: real TTS moves the beats, and assemble refuses a plate that
// doesn't match the spine. One plate per beat, so every cut lands in a silent gap between beats.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT } from '../../../lib/cli.mjs';
import { validateDoc } from '../../../lib/schemas.mjs';

function readJson(file, what) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new CliError(`cannot read ${what} ${file}: no such file`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    throw new CliError(`${what} ${file} is not valid JSON: ${e.message.split('\n')[0]}`);
  }
}

/** A relative path written in `fromDir`, re-expressed relative to `toDir` (absolute paths and URLs kept). */
function rebase(p, fromDir, toDir) {
  if (typeof p !== 'string' || path.isAbsolute(p) || /^[a-z]+:\/\//i.test(p) || fromDir === toDir) return p;
  return relOrAbs(toDir, path.resolve(fromDir, p));
}

/** `abs` relative to `dir`, or absolute when the two share nothing below the filesystem root. */
function relOrAbs(dir, abs) {
  const top = (x) => x.split(path.sep).filter(Boolean)[0];
  if (top(dir) !== top(abs)) return abs;
  return path.relative(dir, abs) || '.';
}

/**
 * Map plates onto spine beats, one plate per beat. Returns {problems[], changes[]}; `plates` is
 * updated in place only when there are no problems.
 */
export function retime(plates, spine) {
  const beats = spine.beats ?? [];
  const byId = new Map(beats.map((b) => [b.id, b]));
  const problems = [];
  const owners = new Map();
  for (const p of plates.plates) {
    if (!byId.has(p.beat)) {
      problems.push(`plate '${p.id}' names beat '${p.beat}', which is not in the spine (beats: ${beats.map((b) => b.id).join(', ')}) — fix its beat`);
      continue;
    }
    owners.set(p.beat, [...(owners.get(p.beat) ?? []), p.id]);
  }
  for (const [beat, ids] of owners) {
    if (ids.length > 1) problems.push(`beat '${beat}' has ${ids.length} plates (${ids.join(', ')}) — one plate per beat: merge them, or split the beat in script.md and rerun the spine`);
  }
  for (const b of beats) {
    if (!owners.has(b.id)) problems.push(`beat '${b.id}' has no plate — add one plate for it to plates.json`);
  }
  if (problems.length) return { problems, changes: [] };
  const changes = plates.plates.map((p) => {
    const b = byId.get(p.beat);
    const c = { id: p.id, beat: p.beat, from: [p.startMs, p.durationMs], to: [b.startMs, b.durationMs] };
    p.startMs = b.startMs;
    p.durationMs = b.durationMs;
    return c;
  });
  return { problems, changes };
}

const spec = {
  name: 'retime-plates',
  summary: 'set each plate\'s startMs/durationMs from its spine beat (one plate per beat)',
  usage: 'retime-plates [options] <plates.json|project-folder>',
  description: `
Reads plates.json (or <folder>/plates.json when given a project folder) and its spine (the "spine" path in plates.json, or --spine): spine/manifest.json
for narration or spine/beatgrid.json for a beat grid. Every plate takes its beat's startMs and
durationMs, so plate cuts fall in the silent gaps between beats. Each spine beat must have exactly
one plate: a plate naming an unknown beat, a beat with no plate, or two plates on one beat is
refused with the plate or beat named. The result is validated against plates.v1.json and written
in place (or to --out; relative spine/brand paths are rebased). Run it after every spine run.
Exit 0 ok, 1 refused or invalid (nothing written), 2 usage. --check writes nothing and exits 1
if any plate's times would change. Plates listed out of beat order are kept in their order, with a
warning on stderr (exit 0): the plate list reads best in beat order.`,
  options: {
    out: { type: 'string', short: 'o', arg: 'file', desc: 'Write the retimed plates.json here (default: in place)' },
    spine: { type: 'string', arg: 'file', desc: 'Spine manifest.json or beatgrid.json (default: plates.json "spine"); also sets "spine"' },
    check: { type: 'boolean', desc: 'Write nothing; exit 1 if any plate is not on its beat\'s times' },
    json: { type: 'boolean', desc: 'Print the per-plate changes as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: [
    'retime-plates plates.json',
    'retime-plates plates.json --spine spine/beatgrid.json',
    'retime-plates plates.json --check',
    'retime-plates my-video/',
  ],
};

async function main({ values, positionals }) {
  if (values.check && values.out) throw new CliError('pass --check or --out, not both', EXIT.USAGE);
  let src = path.resolve(positionals[0]);
  let shown = positionals[0]; // the plates.json as the user would name it
  if (existsSync(src) && statSync(src).isDirectory()) {
    src = path.join(src, 'plates.json');
    shown = path.join(positionals[0], 'plates.json');
    if (!existsSync(src)) throw new CliError(`${positionals[0]} is a folder with no plates.json — pass the plates.json path`);
  }
  const doc = readJson(src, 'plates file');
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.plates)) throw new CliError(`${positionals[0]} has no plates[] — not a plates.json`);
  const srcDir = path.dirname(src);
  const out = values.out ? path.resolve(values.out) : src;
  const outDir = path.dirname(out);
  if (values.out) {
    if (!existsSync(outDir) || !statSync(outDir).isDirectory()) throw new CliError(`cannot write ${values.out}: folder ${path.dirname(values.out)} does not exist — create it first`);
    if (existsSync(out) && statSync(out).isDirectory()) throw new CliError(`cannot write ${values.out}: it is a folder — pass a file path such as ${path.join(values.out, 'plates.json')}`);
  }

  let spinePath; let spineShown; // spineShown: --spine as given, or plates.json's "spine" next to the plates file
  if (values.spine) { spinePath = path.resolve(values.spine); spineShown = values.spine; }
  else {
    if (typeof doc.spine !== 'string' || !doc.spine) throw new CliError(`${shown} has no "spine" path — pass --spine spine/manifest.json`);
    spinePath = path.resolve(srcDir, doc.spine);
    spineShown = path.isAbsolute(doc.spine) ? doc.spine : path.join(path.dirname(shown), doc.spine);
  }
  if (!existsSync(spinePath)) {
    const otherName = path.basename(spinePath) === 'beatgrid.json' ? 'manifest.json' : 'beatgrid.json';
    const other = path.join(path.dirname(spinePath), otherName);
    const hint = existsSync(other) ? ` — the spine here is ${otherName}: pass --spine ${path.join(path.dirname(spineShown), otherName)}` : ' — run the spine first (video-spine)';
    throw new CliError(`spine not found: ${spineShown}${hint}`);
  }
  const spine = readJson(spinePath, 'spine');
  const sv = await validateDoc('spine', spine, spinePath);
  if (!sv.ok) throw new CliError(`spine ${spineShown} is invalid: ${sv.errors[0].field}: ${sv.errors[0].message} — rerun the spine`);

  const { problems, changes } = retime(doc, spine);
  if (problems.length) throw new CliError(problems[0] + (problems.length > 1 ? ` (+${problems.length - 1} more)` : ''));

  if (values.spine) doc.spine = relOrAbs(outDir, spinePath);
  else doc.spine = rebase(doc.spine, srcDir, outDir);
  doc.brand = rebase(doc.brand, srcDir, outDir);

  const v = await validateDoc('plates', doc, out);
  if (!v.ok) throw new CliError(`retimed plates.json would not validate: ${v.errors[0].field}: ${v.errors[0].message}`);

  const order = new Map(spine.beats.map((b, i) => [b.id, i]));
  const outOfOrder = doc.plates.findIndex((p, i) => i > 0 && order.get(p.beat) < order.get(doc.plates[i - 1].beat));
  if (outOfOrder > 0) {
    process.stderr.write(`retime-plates: warning: plates are not in beat order ('${doc.plates[outOfOrder].id}' on beat '${doc.plates[outOfOrder].beat}' is listed after '${doc.plates[outOfOrder - 1].id}' on beat '${doc.plates[outOfOrder - 1].beat}') — times are still set; reorder plates.json to match the spine\n`);
  }
  const moved = changes.filter((c) => c.from[0] !== c.to[0] || c.from[1] !== c.to[1]);
  if (!values.check) {
    try { writeFileSync(out, JSON.stringify(doc, null, 2) + '\n'); } catch (e) {
      throw new CliError(`cannot write ${values.out ?? shown}: ${e.code ?? e.message}`);
    }
  }
  if (values.json) process.stdout.write(JSON.stringify({ plates: out, spine: spinePath, changed: moved.length, changes }, null, 2) + '\n');
  else {
    for (const c of changes) {
      const was = c.from[0] === c.to[0] && c.from[1] === c.to[1] ? 'unchanged' : `was ${c.from[0]} +${c.from[1]}`;
      process.stdout.write(`${c.id.padEnd(16)} ${c.beat.padEnd(12)} ${String(c.to[0]).padStart(7)} ms +${c.to[1]} ms  (${was})\n`);
    }
    for (const w of v.warnings ?? []) process.stdout.write(`warn  ${w.field}: ${w.message}\n`);
  }
  if (values.check) {
    if (moved.length) {
      process.stdout.write(`FAIL  ${moved.length} of ${changes.length} plate(s) off their beat times — run retime-plates ${shown}\n`);
      return EXIT.FAIL;
    }
    process.stdout.write(`PASS  ${changes.length} plate(s) on their beat times (${path.basename(spinePath)})\n`);
    return EXIT.OK;
  }
  if (!values.json) process.stdout.write(`PASS  retimed ${changes.length} plate(s) from ${spineShown} (${moved.length} changed) → ${values.out ?? shown}\n`);
  return EXIT.OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCli(spec, main);
