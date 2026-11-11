#!/usr/bin/env node
// Writes the synthetic plate-factory session transcripts the checker evals read.
// One good run (F1-shaped: 3 plates) and one bad run per rule. No real transcript is copied:
// every line is built here in the Claude Code session JSONL shape (assistant tool_use / text
// blocks, user tool_result blocks, subagent transcripts in <session>/subagents/).
// Run `node evals/plate-factory/fixtures/generate.mjs` after changing it; a test checks the files match.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = '/opt/plugins/peak-media';
const P = '/home/user/videos/orc-01';
const node = (s, args) => `node "${ROOT}/${s}" ${args}`;
const RP = (args) => `cd ${P} && ${node('skills/video-plates/scripts/render-plate.mjs', args)}`;
const SHEET = (mp4, out) => `cd ${P} && ${node('lib/verify/contact-sheet.mjs', `${mp4} --every 0.5s -o ${out}`)}`;

// Step DSL: ['bash', cmd, out] ['read', file] ['write', file] ['edit', file] ['ask', q, a]
// ['agent', description, prompt, out] ['say', text] ['user', text]
function goodSteps() {
  return [
    ['user', '<command-name>/peak-media:plate-factory</command-name>\n<command-args>brief.md, target 26 s</command-args>'],
    ['bash', `node "${ROOT}/scripts/setup.mjs" --check`, 'ready'],
    ['read', `${P}/brief.md`],
    ['ask', 'Brief: 26 s, 3 beats (hook, compare, close), default brand, 1280x720 30 fps. Go?', 'Yes'],
    ['say', 'Brief confirmed.\n\nGATE 0 brief: APPROVED — brief.md'],
    ['read', `${ROOT}/skills/video-spine/references/narration-writing.md`],
    ['bash', `cd ${P} && ${node('skills/video-spine/scripts/spine.mjs', '--brief brief.md --budget --wpm 127')}`, 'budget 50 words'],
    ['write', `${P}/script.md`],
    ['agent', 'Cold-read the script', 'You are a cold reader. Use no tools. Mark each beat CLEAR or UNCLEAR…', 'hook CLEAR, compare CLEAR, close CLEAR'],
    ['ask', 'Script (50 words, cold read 3/3 CLEAR). Approve?', 'Approve'],
    ['say', 'GATE 1 script: APPROVED — script.md (cold read 3/3 CLEAR)'],
    ['bash', `cd ${P} && ${node('skills/video-spine/scripts/spine.mjs', '--brief brief.md')}`, 'PASS  runtime 26.00 s against a 26.0 s target (+0.0%)'],
    ['bash', `cd ${P} && ${node('lib/verify/check-cuts.mjs', 'spine/narration.wav --cuts 7173,19386 --min-silence-ms 400')}`, 'PASS  2 cuts'],
    ['say', 'GATE 2 spine: PASS — spine/manifest.json 25999 ms (target 26000 ±10%)'],
    ['write', `${P}/plates.json`],
    ['bash', `cd ${P} && ${node('skills/plate-factory/scripts/retime-plates.mjs', 'plates.json')}`, 'PASS  retimed 3 plate(s)'],
    ['ask', 'Plate list: p1-hook (motion), p2-table (slide), p3-close (motion). OK?', 'OK'],
    ['say', 'GATE 3 plates: APPROVED — plates.json (3 plates, retimed from spine/manifest.json)'],
    ['read', `${ROOT}/skills/video-plates/references/vendored-map.md`],
    ['read', `${ROOT}/vendor/hyperframes/hyperframes/SKILL.reference.md`],
    ['read', `${ROOT}/vendor/hyperframes/hyperframes/references/runtimes.md`],
    ['read', `${ROOT}/vendor/hyperframes/hyperframes/references/format.md`],
    ['read', `${ROOT}/vendor/hyperframes/hyperframes/references/storyboard.md`],
    ['bash', RP('plates.json --all --storyboard'), 'storyboard: review/storyboard.jpg'],
    ['read', `${P}/review/storyboard.jpg`],
    ['ask', 'Storyboard (review/storyboard.jpg): 1 hook, 2 table, 3 close. Approve before animation?', 'Approve'],
    ['say', 'GATE 4 storyboard: APPROVED — review/storyboard.jpg'],
    ['bash', RP('plates.json p1-hook --lint --sheet'), 'ok p1-hook 7173 ms'],
    ['read', `${P}/review/contact-p1-hook.jpg`],
    ['say', 'GATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (7173 ms, lint clean)'],
    ['read', `${ROOT}/vendor/hyperframes/motion-doctrine/SKILL.reference.md`],
    ['read', `${ROOT}/skills/plate-factory/references/review-rubric.md`],
    // p1-hook: 1 round
    ['edit', `${P}/plates/p1-hook/index.html`],
    ['bash', RP('plates.json p1-hook --lint'), 'ok p1-hook'],
    ['bash', SHEET('renders/plates/p1-hook.mp4', 'review/p1-hook-r1.jpg'), 'wrote review/p1-hook-r1.jpg'],
    ['read', `${P}/review/p1-hook-r1.jpg`],
    // p2-table: 2 rounds
    ['bash', RP('plates.json p2-table --lint'), 'ok p2-table'],
    ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-r1.jpg'), 'wrote review/p2-table-r1.jpg'],
    ['read', `${P}/review/p2-table-r1.jpg`],
    ['edit', `${P}/plates/p2-table/index.html`],
    ['bash', RP('plates.json p2-table --lint'), 'ok p2-table'],
    ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-r2.jpg'), 'wrote review/p2-table-r2.jpg'],
    ['read', `${P}/review/p2-table-r2.jpg`],
    // p3-close: 1 round
    ['bash', RP('plates.json p3-close --lint'), 'ok p3-close'],
    ['bash', SHEET('renders/plates/p3-close.mp4', 'review/p3-close-r1.jpg'), 'wrote review/p3-close-r1.jpg'],
    ['read', `${P}/review/p3-close-r1.jpg`],
    ['agent', 'Independent plate review', `You are an independent reviewer. Read ${ROOT}/skills/plate-factory/references/review-rubric.md, then ${P}/plates.json, ${P}/review/storyboard.jpg, ${P}/review/p1-hook-r1.jpg, ${P}/review/p2-table-r2.jpg, ${P}/review/p3-close-r1.jpg. List defects per plate.`, 'p2-table @3.5s: row 4 text touches the right safe margin (major)'],
    ['edit', `${P}/plates/p2-table/index.html`],
    ['bash', RP('plates.json p2-table --lint'), 'ok p2-table'],
    ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-fix1.jpg'), 'wrote review/p2-table-fix1.jpg'],
    ['read', `${P}/review/p2-table-fix1.jpg`],
    ['say', 'GATE 6 build: PASS — 3 plates; reviewer found 1 defect (p2-table), fixed'],
    ['bash', `cd ${P} && ${node('skills/video-assemble/scripts/assemble.mjs', '.')}`, 'PASS  cuts in silence'],
    ['bash', SHEET('review/review.mp4', 'review/contact-review.jpg'), 'wrote review/contact-review.jpg'],
    ['read', `${P}/review/contact-review.jpg`],
    ['say', 'GATE 7 composite: PASS — review/review.mp4 (2 cuts in ≥300 ms silence)'],
    ['ask', 'Music track for the music pass? (path, or none)', '/home/user/music/track.mp3'],
    ['bash', `cd ${P} && ${node('skills/video-assemble/scripts/remux-audio.mjs', 'review/review.mp4 --music audio/music.wav -o review/review-mix.mp4 --levels review/levels.json')}`, 'mix -16.1 LUFS'],
    ['ask', 'Listen to review/review-mix.mp4. Levels OK?', 'Approve'],
    ['say', 'GATE 8 audio: APPROVED — review/review-mix.mp4 (review/levels.json)'],
    ['bash', `cd ${P} && ${node('skills/video-assemble/scripts/assemble.mjs', '. --music audio/music.wav')}`, 'PASS  out/final.mp4'],
    ['bash', SHEET('out/final.mp4', 'review/contact-final.jpg'), 'wrote review/contact-final.jpg'],
    ['read', `${P}/review/contact-final.jpg`],
    ['say', 'GATE 9 export: PASS — out/final.mp4 (probe-spec PASS, outro on review/contact-final.jpg)'],
  ];
}

const reviewerSteps = () => [
  ['read', `${ROOT}/skills/plate-factory/references/review-rubric.md`],
  ['read', `${P}/plates.json`],
  ['read', `${P}/review/p2-table-r2.jpg`],
];

const idx = (steps, pred) => steps.findIndex(pred);
const sayIdx = (steps, n) => idx(steps, (s) => s[0] === 'say' && s[1].includes(`GATE ${n} `));

/** Gate 1 answered "Apply 1, as you suggest. Approved.", the edit made, then (or not) the GATE 1 line. */
function approvedWithEdits(s, writeGate) {
  const ask = idx(s, (x) => x[0] === 'ask' && x[1].startsWith('Script'));
  s[ask] = ['ask', 'Script (50 words, cold read 2/3 CLEAR). Proposed: 1. compare — "…" → "…". Apply which, and approve?', 'Apply 1, as you suggest. Approved.'];
  const gate = sayIdx(s, 1);
  s.splice(gate, 1, ['edit', `${P}/script.md`], ...(writeGate ? [['say', 'Applied change 1.\n\nGATE 1 script: APPROVED — script.md (50 words, cold read 2/3 CLEAR)']] : []));
  return s;
}

/** Gate 4 answered "Change p2's heading, then approved": edit, re-run the storyboard, (re-ask), APPROVED. */
function g4WithChanges(s, reask) {
  const ask = idx(s, (x) => x[0] === 'ask' && x[1].startsWith('Storyboard'));
  s[ask] = ['ask', s[ask][1], "Change p2's heading to 'Who checks?', then approved."];
  s.splice(ask + 1, 0, ['write', `${P}/plates.json`],
    ['bash', RP('plates.json --all --storyboard --rescaffold'), 'storyboard: review/storyboard.jpg'],
    ['read', `${P}/review/storyboard.jpg`],
    ...(reask ? [['ask', "Storyboard re-run with p2's new heading (review/storyboard.jpg). Approve?", 'Approve']] : []));
  return s;
}

/** The good run with gates 2, 5, 6, 7 printed by their scripts and not written by the model. */
function scriptGates(s) {
  const drop = (n) => s.splice(sayIdx(s, n), 1);
  for (const n of [2, 5, 6, 7]) drop(n);
  const at = (pred) => idx(s, pred);
  let i = at((x) => x[0] === 'bash' && x[1].includes('spine.mjs') && x[1].endsWith('--brief brief.md'));
  s[i] = ['bash', s[i][1], `${s[i][2]}\nGATE 2 spine: PASS — spine/manifest.json 25999 ms (target 26000 ±10%)`];
  i = at((x) => x[0] === 'bash' && x[1] === RP('plates.json p1-hook --lint --sheet'));
  s[i] = ['bash', RP('plates.json p1-hook --pipeline-test'), 'p1-hook: renders/plates/p1-hook.mp4 (7173 ms, planned 7173) lint+check ok sheet review/contact-p1-hook.jpg\nGATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (7173 ms, lint clean)'];
  i = at((x) => x[0] === 'read' && x[1].endsWith('p2-table-fix1.jpg'));
  s.splice(i + 1, 0, ['write', `${P}/review/plate-review.md`],
    ['bash', `cd ${P} && ${node('skills/plate-factory/scripts/gate.mjs', 'build .')} 2>&1 | tail -3`, 'GATE 6 build: PASS — 3 plates; reviewer: 1 defects, 1 fixed']);
  i = at((x) => x[0] === 'bash' && x[1].endsWith(`${node('skills/video-assemble/scripts/assemble.mjs', '.')}`));
  s[i] = ['bash', s[i][1], 'cuts      2 plate cut(s) in silence (≥300 ms)\nGATE 7 composite: PASS — review/review.mp4 (2 cuts in ≥300 ms silence)'];
  return s;
}

/** Bad variants: each breaks exactly one rule. */
export const VARIANTS = {
  good: (s) => s,
  'bad-gate-order': (s) => { const a = sayIdx(s, 2); const b = sayIdx(s, 3); [s[a], s[b]] = [s[b], s[a]]; return s; },
  'bad-plate-before-approval': (s) => { s.splice(sayIdx(s, 4) - 1, 0, ['write', `${P}/plates/p1-hook/index.html`]); return s; },
  'bad-four-rounds': (s) => {
    const at = idx(s, (x) => x[0] === 'read' && x[1].endsWith('p2-table-r2.jpg')) + 1;
    s.splice(at, 0,
      ['bash', RP('plates.json p2-table --lint'), 'ok'], ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-r3.jpg'), 'ok'], ['read', `${P}/review/p2-table-r3.jpg`],
      ['bash', RP('plates.json p2-table --lint'), 'ok'], ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-r4.jpg'), 'ok'], ['read', `${P}/review/p2-table-r4.jpg`]);
    return s;
  },
  'bad-no-reviewer': (s) => s.filter((x) => !(x[0] === 'agent' && x[1] === 'Independent plate review')),
  'bad-runtimes-late': (s) => {
    const r = idx(s, (x) => x[0] === 'read' && x[1].endsWith('runtimes.md'));
    const [step] = s.splice(r, 1);
    s.splice(idx(s, (x) => x[0] === 'edit') + 1, 0, step);
    return s;
  },
  // round 1 (verify-1 finding 1): the same sheet name made and Read again counts as another round
  'bad-sheet-reused': (s) => {
    const at = idx(s, (x) => x[0] === 'read' && x[1].endsWith('p2-table-r2.jpg')) + 1;
    const again = () => [['edit', `${P}/plates/p2-table/index.html`], ['bash', RP('plates.json p2-table --lint'), 'ok'],
      ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-r1.jpg'), 'ok'], ['read', `${P}/review/p2-table-r1.jpg`]];
    s.splice(at, 0, ...again(), ...again());
    return s;
  },
  // finding 2: a rendered plate with no self-review round
  'bad-plate-no-rounds': (s) => s.filter((x) => !(x[1]?.includes?.('p3-close-r1.jpg'))),
  // finding 3: the storyboard is reopened (re-run + REJECTED) and a plate is edited before it is re-approved
  'bad-storyboard-reopened': (s) => {
    s.splice(idx(s, (x) => x[0] === 'agent' && x[1] === 'Independent plate review'), 0,
      ['bash', RP('plates.json --all --storyboard --rescaffold'), 'storyboard: review/storyboard.jpg'],
      ['read', `${P}/review/storyboard.jpg`],
      ['say', 'The close needs a new layout.\n\nGATE 4 storyboard: REJECTED — review/storyboard.jpg'],
      ['edit', `${P}/plates/p3-close/index.html`],
      ['ask', 'Storyboard (review/storyboard.jpg), new close layout. Approve?', 'Approve'],
      ['say', 'GATE 4 storyboard: APPROVED — review/storyboard.jpg']);
    return s;
  },
  // finding 5: writers the first checker missed — python, and render-plate run without `node`
  'bad-python-write': (s) => { s.splice(sayIdx(s, 4) - 1, 0, ['bash', `cd ${P} && python3 -c "open('plates/p1-hook/index.html','w').write('<html></html>')"`, '']); return s; },
  'bad-bare-render': (s) => { s.splice(sayIdx(s, 4) - 1, 0, ['bash', `cd ${P} && "${ROOT}/skills/video-plates/scripts/render-plate.mjs" plates.json p1-hook`, 'ok p1-hook']); return s; },
  // finding 6: a quoted or unasked gate-4 line is not the approval
  'bad-quoted-gate': (s) => {
    s.splice(sayIdx(s, 4) - 1, 0,
      ['say', 'Once you approve, I will write:\n\n```\nGATE 4 storyboard: APPROVED — review/storyboard.jpg\n```\n\n> GATE 4 storyboard: APPROVED — review/storyboard.jpg'],
      ['edit', `${P}/plates/p1-hook/index.html`]);
    return s;
  },
  // round 2 (verify-2): legitimate runs the checker must still pass
  // finding 2: every gate line bolded only on its head, `**GATE n name: RESULT** — evidence`
  'good-bold-head': (s) => s.map((x) => (x[0] === 'say' ? [x[0], x[1].replace(/^(GATE \d+ [a-z-]+: [A-Z]+)/m, '**$1**')] : x)),
  // finding 3: round 3 of p2-table, whose first sheet run errors and is re-run (3 rounds, not 4);
  // finding 4: that render's output is redirected (`> out 2>&1` is not a plate id)
  'good-retried-round': (s) => {
    const at = idx(s, (x) => x[0] === 'read' && x[1].endsWith('p2-table-r2.jpg')) + 1;
    s.splice(at, 0,
      ['edit', `${P}/plates/p2-table/index.html`],
      ['bash', `${RP('plates.json p2-table --lint')} > out 2>&1`, ''],
      ['bash-err', `cd ${P} && ${node('lib/verify/contact-sheet.mjs', 'renders/plates/p2-table.mp4 --evry 0.5s -o review/p2-table-r3.jpg')}`, 'Exit code 2\ncontact-sheet: Unknown option \'--evry\''],
      ['bash', SHEET('renders/plates/p2-table.mp4', 'review/p2-table-r3.jpg'), 'wrote review/p2-table-r3.jpg'],
      ['read', `${P}/review/p2-table-r3.jpg`]);
    return s;
  },
  // round 3 (the user's live run): round 1 of two plates rendered and sheeted in one `for id in …` loop
  'good-loop': (s) => {
    // drop each plate's first render and its r1 sheet run, then put the loop where p2-table's round 1 was
    const at = idx(s, (x) => x[0] === 'bash' && x[1] === RP('plates.json p2-table --lint'));
    for (const plate of ['p2-table', 'p3-close']) {
      s.splice(idx(s, (x) => x[0] === 'bash' && x[1] === RP(`plates.json ${plate} --lint`)), 1);
      s.splice(idx(s, (x) => x[0] === 'bash' && x[1] === SHEET(`renders/plates/${plate}.mp4`, `review/${plate}-r1.jpg`)), 1);
    }
    s.splice(at, 0, ['bash', `cd ${P} && for id in p2-table p3-close; do node "${ROOT}/skills/video-plates/scripts/render-plate.mjs" plates.json $id --lint; node "${ROOT}/lib/verify/contact-sheet.mjs" renders/plates/\${id}.mp4 --every 0.5s -o review/$id-r1.jpg; done`, 'ok p2-table\nwrote review/p2-table-r1.jpg\nok p3-close\nwrote review/p3-close-r1.jpg']);
    return s;
  },
  // round 5: the automatic gates' lines come only from their scripts' output
  'good-script-gates': (s) => scriptGates(s),
  // ... and an echoed line is not the script's verdict (render-plate ran, but the GATE 5 line was echoed)
  'bad-echoed-gate': (s) => {
    s = scriptGates(s);
    const i = idx(s, (x) => x[0] === 'bash' && x[1].includes('--pipeline-test'));
    s[i] = ['bash', `${RP('plates.json p1-hook --lint --sheet')} && echo "GATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (7173 ms, lint clean)"`, 'p1-hook: ok\nGATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (7173 ms, lint clean)'];
    return s;
  },
  // round 6 (cold start r3): the script is approved with an edit; GATE 1 is written after the edit
  'good-approved-with-edits': (s) => approvedWithEdits(s, true),
  // ... and without the GATE 1 line (the session went from the edit straight to the spine)
  'bad-approved-with-edits': (s) => approvedWithEdits(s, false),
  // round 7 (verify-5 F2-r5): a storyboard approved "with a change" reopens gate 4 — re-run, ask again
  'good-g4-changes-reasked': (s) => g4WithChanges(s, true),
  // ... and writing APPROVED after the re-run without asking again doesn't close the storyboard
  'bad-g4-changes-no-reask': (s) => g4WithChanges(s, false),
  'bad-unasked-gate': (s) => {
    s.splice(sayIdx(s, 4) - 1, 0,
      ['say', 'GATE 4 storyboard: APPROVED — review/storyboard.jpg'],
      ['edit', `${P}/plates/p1-hook/index.html`]);
    return s;
  },
};

const SESSION = '00000000-0000-4000-8000-00000000f1f1';
const T0 = Date.parse('2026-11-09T12:00:00.000Z');

/** Render steps to JSONL lines in the session shape. */
export function render(steps, { sidechain = false, agentId = null, t0 = T0, stepMs = 1000 } = {}) {
  const lines = [];
  let parent = null; let k = 0; let tool = 0;
  const ts = () => new Date(t0 + (k++) * stepMs).toISOString();
  const uuid = () => `00000000-0000-4000-8000-${String(lines.length + (agentId ? 500000 : 0)).padStart(12, '0')}`;
  const push = (type, content, extra = {}) => {
    const u = uuid();
    lines.push({ parentUuid: parent, isSidechain: sidechain, ...(agentId && { agentId }), type, message: { role: type, content }, uuid: u, timestamp: ts(), sessionId: SESSION, ...extra });
    parent = u;
  };
  const call = (name, input, out, isError = false) => {
    const id = `toolu_${agentId ?? 'main'}_${String(++tool).padStart(4, '0')}`;
    push('assistant', [{ type: 'tool_use', id, name, input }]);
    push('user', [{ tool_use_id: id, type: 'tool_result', content: out, ...(isError && { is_error: true }) }]);
  };
  for (const [op, a, b, c] of steps) {
    if (op === 'user') push('user', a);
    else if (op === 'say') push('assistant', [{ type: 'text', text: a }]);
    else if (op === 'bash') call('Bash', { command: a, description: 'run' }, b ?? '');
    else if (op === 'bash-err') call('Bash', { command: a, description: 'run' }, b ?? 'Exit code 1', true);
    else if (op === 'read') call('Read', { file_path: a }, `(contents of ${path.basename(a)})`);
    else if (op === 'write') call('Write', { file_path: a, content: '…' }, `File created successfully at: ${a}`);
    else if (op === 'edit') call('Edit', { file_path: a, old_string: 'a', new_string: 'b' }, `The file ${a} has been updated.`);
    else if (op === 'ask') call('AskUserQuestion', { questions: [{ question: a, header: 'Gate', multiSelect: false, options: [{ label: b, description: '' }, { label: 'Change something', description: '' }] }] }, `The user answered: "${a}"="${b}"`);
    else if (op === 'agent') call('Agent', { description: a, subagent_type: 'general-purpose', prompt: b }, [{ type: 'text', text: c }]);
  }
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

/** {relativePath: content} for every fixture file. */
export function fixtureFiles() {
  const files = {};
  for (const [name, mutate] of Object.entries(VARIANTS)) {
    const steps = mutate(goodSteps());
    files[`${name}/session.jsonl`] = render(steps);
    // the reviewer subagent's own transcript, timed inside its Agent call
    const at = steps.findIndex((s) => s[0] === 'agent' && s[1] === 'Independent plate review');
    if (at >= 0) {
      const before = render(steps.slice(0, at + 1)).trim().split('\n');
      const tUse = Date.parse(JSON.parse(before.at(-2)).timestamp); // the Agent tool_use line
      files[`${name}/session/subagents/agent-areview0001.jsonl`] = render(reviewerSteps(), { sidechain: true, agentId: 'areview0001', t0: tUse + 100, stepMs: 100 });
    }
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const name of Object.keys(VARIANTS)) rmSync(path.join(HERE, name), { recursive: true, force: true });
  for (const [rel, content] of Object.entries(fixtureFiles())) {
    mkdirSync(path.dirname(path.join(HERE, rel)), { recursive: true });
    writeFileSync(path.join(HERE, rel), content);
  }
  process.stdout.write(`wrote ${Object.keys(fixtureFiles()).length} fixture files under ${path.relative(process.cwd(), HERE) || '.'}\n`);
}
