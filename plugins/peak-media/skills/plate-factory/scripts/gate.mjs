#!/usr/bin/env node
// gate — stage 6's gate line comes from this check, not from the model (WP9 round 5).
//   gate build <plates.json|project>   every plate rendered to plan, its final render sheeted,
//                                      and the independent review recorded with every defect fixed
// Prints `GATE 6 build: PASS — …` (exit 0) or `GATE 6 build: FAIL — …` plus a one-line error (exit 1).
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT } from '../../../lib/cli.mjs';
import { validateFile } from '../../../lib/schemas.mjs';
import { requireFfmpeg } from '../../../lib/ffmpeg.mjs';
import { probeSpec } from '../../../lib/verify/probe-spec.mjs';

export const REVIEW = path.join('review', 'plate-review.md');
const mtime = (f) => statSync(f).mtimeMs;

/** Problems with stage 6's output in `project` for the plates in `plan`; [] when the gate holds. */
export function checkBuild(plan, project) {
  const problems = [];
  const reviewDir = path.join(project, 'review');
  const sheets = existsSync(reviewDir) ? readdirSync(reviewDir).filter((f) => /\.jpe?g$/i.test(f)) : [];
  for (const p of plan.plates) {
    const mp4 = path.join(project, 'renders', 'plates', `${p.id}.mp4`);
    if (!existsSync(mp4)) { problems.push(`plate ${p.id}: no render at renders/plates/${p.id}.mp4`); continue; }
    const ps = probeSpec(mp4, { durationMs: p.durationMs, fps: plan.fps, width: plan.width, height: plan.height, audio: false });
    const bad = ps.checks.filter((c) => /^(duration|width|height|fps)/.test(c.name) && !c.ok);
    if (bad.length) problems.push(`plate ${p.id}: ${bad.map((c) => `${c.name} is ${c.actual}, planned ${c.expected}`).join('; ')}`);
    // the last look at a plate must be a sheet of its final render
    const own = sheets.filter((f) => f.includes(p.id)).map((f) => path.join(reviewDir, f));
    if (!own.some((f) => mtime(f) >= mtime(mp4))) problems.push(`plate ${p.id}: no contact sheet of its final render in review/ (sheet it after the last re-render)`);
  }
  const rec = path.join(project, REVIEW);
  let defects = null, fixed = null;
  if (!existsSync(rec)) problems.push(`no review record at ${REVIEW} — save the independent reviewer's report there, with "Defects: <n>" and "Fixed: <n>" lines`);
  else {
    const text = readFileSync(rec, 'utf8');
    defects = Number(/^\s*\**defects\**:\s*(\d+)/im.exec(text)?.[1] ?? NaN);
    fixed = Number(/^\s*\**fixed\**:\s*(\d+)/im.exec(text)?.[1] ?? NaN);
    if (!Number.isInteger(defects) || !Number.isInteger(fixed)) problems.push(`${REVIEW} has no "Defects: <n>" and "Fixed: <n>" lines`);
    else if (fixed < defects) problems.push(`${REVIEW}: ${defects - fixed} of ${defects} reviewer defect(s) not fixed`);
    const unnamed = plan.plates.filter((p) => !text.includes(p.id)).map((p) => p.id);
    if (unnamed.length) problems.push(`${REVIEW} doesn't cover plate(s) ${unnamed.join(', ')}`);
  }
  return { problems, defects, fixed };
}

const spec = {
  name: 'gate',
  summary: 'print a plate-factory gate line from a mechanical check (stage 6: build)',
  usage: 'gate build <plates.json|project-folder>',
  description: `
build: every plate in plates.json has renders/plates/<id>.mp4 at its planned duration (±1 frame),
fps and size; a contact sheet in review/ (file name containing the plate id) made after its final
render; and review/plate-review.md, the independent reviewer's report, with "Defects: <n>" and
"Fixed: <n>" lines (fixed must equal defects) naming every plate. Prints the GATE 6 line.
Exit 0 PASS, 1 FAIL (one line on stderr), 2 usage.`,
  options: {},
  positionals: { min: 2, max: 2 },
  examples: ['gate build plates.json', 'gate build .'],
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli(spec, async ({ positionals: [what, target] }) => {
    if (what !== 'build') throw new CliError(`unknown gate '${what}' — the only scripted gate here is 'build' (stage 6)`, EXIT.USAGE);
    const fail = (why) => { process.stdout.write(`GATE 6 build: FAIL — ${why}\n`); return new CliError(why); };
    const platesFile = existsSync(target) && statSync(target).isDirectory() ? path.join(target, 'plates.json') : target;
    if (!existsSync(platesFile)) throw fail(`no plates.json at ${target}`);
    const v = await validateFile(platesFile, 'plates');
    if (!v.ok) throw fail(`${platesFile} is not a valid plates.json: ${v.errors[0].field}: ${v.errors[0].message}`);
    requireFfmpeg();
    const plan = JSON.parse(readFileSync(platesFile, 'utf8'));
    const { problems, defects, fixed } = checkBuild(plan, path.dirname(path.resolve(platesFile)));
    if (problems.length) throw fail(problems.length > 1 ? `${problems[0]} (+${problems.length - 1} more)` : problems[0]);
    process.stdout.write(`GATE 6 build: PASS — ${plan.plates.length} plates; reviewer: ${defects} defects, ${fixed} fixed\n`);
    return EXIT.OK;
  });
}

export { spec };
