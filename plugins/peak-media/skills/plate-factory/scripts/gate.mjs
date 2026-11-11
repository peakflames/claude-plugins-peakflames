#!/usr/bin/env node
// gate — stage 6's gate line comes from this check, not from the model (WP9 round 5).
//   gate build <plates.json|project>   every plate rendered to plan, its final render sheeted,
//                                      and the independent review recorded with every defect fixed
// Prints `GATE 6 build: PASS — …` (exit 0) or `GATE 6 build: FAIL — …` plus a one-line error (exit 1).
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT, isMain } from '../../../lib/cli.mjs';
import { validateFile } from '../../../lib/schemas.mjs';
import { requireFfmpeg } from '../../../lib/ffmpeg.mjs';
import { probeSpec } from '../../../lib/verify/probe-spec.mjs';

export const REVIEW = path.join('review', 'plate-review.md');
const mtime = (f) => statSync(f).mtimeMs;

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Is `file` (a review/ JPEG name) a sheet of plate `id`: contact-<id>, <id>-r<N> or <id>-fix<N>? */
export function isSheetOf(file, id) {
  return new RegExp(`^(contact-${esc(id)}|${esc(id)}-(r|fix)\\d+)\\.jpe?g$`, 'i').test(file);
}

const SEVERITIES = ['blocker', 'major', 'minor'];
// review-rubric.md § C: `<plate-id> @<time>s [severity] <#>: <what> → <fix>`; bullets, bold and
// brackets around the severity are tolerated. Stage 6 appends ` — fixed` or ` — open` to each.
const DEFECT_RE = /^\s*(?:[-*+]\s+)?\**([a-z0-9][a-z0-9-]*)\**\s+@\s*[\d.]+\s*s\b\s*\**\[?\s*(blocker|major|minor)\s*\]?\**(.*)$/i;
const VERDICT_RE = /^\s*(?:[-*+]\s+)?\**verdict\**\s*:?\**\s*(\d+)\s*blockers?\s*,\s*(\d+)\s*majors?\s*,\s*(\d+)\s*minors?/im;

/**
 * Parse review/plate-review.md: the reviewer's own report (review-rubric.md § C), one line per
 * defect, each ending ` — fixed` or ` — open`, and its VERDICT line. Counts come from the listed
 * lines, never from a summary the model wrote; the VERDICT must agree with them.
 */
export function parseReview(text, plateIds) {
  const problems = [];
  const defects = [];
  for (const line of text.split('\n')) {
    const m = DEFECT_RE.exec(line);
    if (!m) continue;
    // the status is its own trailing token after a spaced dash: ` — fixed`, ` — **open**`, ` — fixed ✅`
    const status = /\s(?:—|–|--?)\s*\**\s*(fixed|open|not fixed)\s*\**\s*\.?[\s\p{Extended_Pictographic}\uFE0F✓✔]*$/iu.exec(m[3])?.[1]?.toLowerCase() ?? null;
    defects.push({ plate: m[1], severity: m[2].toLowerCase(), status, line: line.trim() });
  }
  const v = VERDICT_RE.exec(text);
  if (!v) problems.push(`${REVIEW} has no reviewer VERDICT line ("VERDICT: <n> blocker, <n> major, <n> minor") — save the reviewer's report as it answered`);
  else {
    const want = { blocker: Number(v[1]), major: Number(v[2]), minor: Number(v[3]) };
    for (const sev of SEVERITIES) {
      const got = defects.filter((d) => d.severity === sev).length;
      if (got !== want[sev]) problems.push(`${REVIEW}: the VERDICT says ${want[sev]} ${sev} but ${got} ${sev} defect line(s) are listed — list every defect the reviewer reported, one per line`);
    }
  }
  for (const d of defects) {
    if (!plateIds.includes(d.plate)) problems.push(`${REVIEW}: defect for unknown plate '${d.plate}': ${d.line}`);
    if (!d.status) problems.push(`${REVIEW}: defect line has no " — fixed" or " — open" at its end: ${d.line}`);
    else if (d.status !== 'fixed' && d.severity !== 'minor') problems.push(`${REVIEW}: ${d.severity} defect not fixed: ${d.line}`);
  }
  return { problems, defects, fixed: defects.filter((d) => d.status === 'fixed').length };
}

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
    // the last look at a plate must be a non-empty sheet of its final render
    const own = sheets.filter((f) => isSheetOf(f, p.id)).map((f) => path.join(reviewDir, f));
    if (!own.some((f) => mtime(f) >= mtime(mp4) && statSync(f).size > 0)) problems.push(`plate ${p.id}: no contact sheet of its final render in review/ (contact-${p.id}.jpg, ${p.id}-r<N>.jpg or ${p.id}-fix<N>.jpg, made after the last re-render)`);
  }
  const rec = path.join(project, REVIEW);
  let defects = null, fixed = null;
  if (!existsSync(rec)) problems.push(`no review record at ${REVIEW} — save the independent reviewer's report there as it answered, with " — fixed" or " — open" after each defect line`);
  else {
    const r = parseReview(readFileSync(rec, 'utf8'), plan.plates.map((p) => p.id));
    problems.push(...r.problems);
    defects = r.defects.length; fixed = r.fixed;
  }
  return { problems, defects, fixed };
}

const spec = {
  name: 'gate',
  summary: 'print a plate-factory gate line from a mechanical check (stage 6: build)',
  usage: 'gate build <plates.json|project-folder>',
  description: `
build: every plate in plates.json has renders/plates/<id>.mp4 at its planned duration (±1 frame),
fps and size; a contact sheet of its final render in review/ (contact-<id>.jpg, <id>-r<N>.jpg or
<id>-fix<N>.jpg); and review/plate-review.md: the independent reviewer's report as it answered
(review-rubric.md § C), one line per defect ending " — fixed" or " — open", and its VERDICT line.
Defects are counted from those lines; the VERDICT must agree; every blocker and major must be
fixed (a minor may stay open). Prints the GATE 6 line.
Exit 0 PASS, 1 FAIL (one line on stderr), 2 usage.`,
  options: {},
  positionals: { min: 2, max: 2 },
  examples: ['gate build plates.json', 'gate build .'],
};

if (isMain(import.meta.url)) {
  await runCli(spec, async ({ positionals: [what, target] }) => {
    const fail = (why, code) => { process.stdout.write(`GATE 6 build: FAIL — ${why}\n`); return new CliError(why, code); };
    if (what !== 'build') throw fail(`unknown gate '${what}' — the only scripted gate here is 'build' (stage 6)`, EXIT.USAGE);
    const platesFile = existsSync(target) && statSync(target).isDirectory() ? path.join(target, 'plates.json') : target;
    if (!existsSync(platesFile)) throw fail(`no plates.json at ${target}`);
    const v = await validateFile(platesFile, 'plates');
    if (!v.ok) throw fail(`${platesFile} is not a valid plates.json: ${v.errors[0].field}: ${v.errors[0].message}`);
    try { requireFfmpeg(); } catch (e) { throw fail(e.message, e.code); }
    const plan = JSON.parse(readFileSync(platesFile, 'utf8'));
    const { problems, defects, fixed } = checkBuild(plan, path.dirname(path.resolve(platesFile)));
    if (problems.length) throw fail(problems.length > 1 ? `${problems[0]} (+${problems.length - 1} more)` : problems[0]);
    process.stdout.write(`GATE 6 build: PASS — ${plan.plates.length} plates; reviewer: ${defects} defects, ${fixed} fixed\n`);
    return EXIT.OK;
  });
}

export { spec };
