// Transcript checker for /peak-media:plate-factory runs (AC-ORC-01..04).
// Reads a Claude Code session JSONL (plus its <session>/subagents/*.jsonl) and checks the
// orchestrator's gates and ordering rules. The rules it enforces are written down in
// skills/plate-factory/references/stages.md § "Gate lines" and § "What the transcript check counts".
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Gate number -> [name, kind]. user gates must end APPROVED, mechanical gates PASS. */
export const GATES = [
  ['brief', 'user'], ['script', 'user'], ['spine', 'check'], ['plates', 'user'], ['storyboard', 'user'],
  ['pipeline', 'check'], ['build', 'check'], ['composite', 'check'], ['audio', 'user'], ['export', 'check'],
];
const GATE_RE = /^GATE (\d+) ([a-z-]+): (APPROVED|PASS|REJECTED|FAIL)\b\s*(?:[—–-]\s*(.*))?$/;
const ID = '[a-z0-9][a-z0-9-]*';
const PLATE_HTML_RE = new RegExp(`(?:^|[\\s/'"=])plates/(${ID})/index\\.html\\b`);
const RENDER_MP4_RE = new RegExp(`(?:^|[\\s/'"=])renders/plates/(${ID})\\.mp4\\b`);
const RUNTIMES_RE = /(?:^|\/)vendor\/hyperframes\/hyperframes\/references\/runtimes\.md$/;
const INTERPRETERS = new Set(['python', 'python3', 'node', 'perl', 'ruby', 'deno', 'bun', 'php', 'osascript']);
const COPIERS = new Set(['cp', 'mv', 'ln', 'install', 'rsync', 'dd', 'touch', 'truncate', 'ditto']);
const WRAPPERS = new Set(['env', 'exec', 'time', 'nice', 'nohup', 'command', 'sudo']);

function parseFile(file, src) {
  const events = [];
  readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    let o;
    try { o = JSON.parse(raw); } catch { return; }
    const base = { src, file, line: i + 1, ts: o.timestamp ?? null, sidechain: !!o.isSidechain };
    const content = o.message?.content;
    if (o.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'text') events.push({ ...base, kind: 'text', text: b.text ?? '' });
        else if (b.type === 'tool_use') events.push({ ...base, kind: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} });
      }
    } else if (o.type === 'user' && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === 'tool_result') {
          const text = typeof b.content === 'string' ? b.content : (b.content ?? []).map((x) => x.text ?? '').join('\n');
          events.push({ ...base, kind: 'tool_result', id: b.tool_use_id, text, isError: !!b.is_error });
        }
      }
    }
  });
  return events;
}

/**
 * Load a session: the main JSONL plus subagent JSONLs (default: <session>/subagents/ beside it).
 * Main-thread events keep file order; subagent events are merged in by timestamp.
 */
export function loadTranscript(file, { subagentsDir } = {}) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`no such transcript: ${file}`);
  const main = parseFile(file, 'main');
  const dir = subagentsDir ?? path.join(path.dirname(file), path.basename(file, '.jsonl'), 'subagents');
  const subs = [];
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) {
      subs.push(...parseFile(path.join(dir, f), path.basename(f, '.jsonl')));
    }
  }
  // Merge: each subagent event goes after the last main event with ts <= its ts.
  const out = [...main];
  const t = (e) => (e.ts ? Date.parse(e.ts) : NaN);
  for (const s of subs.sort((a, b) => t(a) - t(b))) {
    let k = out.length;
    if (!Number.isNaN(t(s))) { k = out.findIndex((e) => !Number.isNaN(t(e)) && t(e) > t(s)); if (k < 0) k = out.length; }
    out.splice(k, 0, s);
  }
  out.forEach((e, i) => { e.seq = i; });
  return out;
}

const where = (e) => `${e.src === 'main' ? '' : `${e.src} `}line ${e.line}`;
const brief = (s, n = 90) => { const x = String(s).replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const isMain = (e) => e.src === 'main' && !e.sidechain;
const isTool = (e, ...names) => e.kind === 'tool_use' && names.includes(e.name);
const isAsk = (e) => isMain(e) && isTool(e, 'AskUserQuestion');
const askedBetween = (events, lo, hi) => events.some((e) => isAsk(e) && e.seq > lo && e.seq < hi);

/**
 * Gate lines the main thread wrote. A gate line counts only as the assistant's own marker: a line
 * of a text block that starts with `GATE ` or `**GATE ` (bold may cover the whole line or only
 * its head: `**GATE 4 storyboard: APPROVED** — …`), outside ``` / ~~~ fences. A
 * quoted (`> GATE …`), bulleted or inline-code (`` `GATE …` ``) line doesn't count.
 * Returns {n, name, result, evidence, event, k}.
 */
export function gateLines(events) {
  const out = [];
  for (const e of events) {
    if (e.kind !== 'text' || !isMain(e)) continue;
    let fenced = false;
    for (const raw of e.text.split('\n')) {
      const l = raw.trim();
      if (/^(```|~~~)/.test(l)) { fenced = !fenced; continue; }
      if (fenced) continue;
      // must start with GATE or **GATE; bold anywhere on the line (whole line or only the head) is dropped
      const m = /^(\*\*)?GATE /.test(l) ? GATE_RE.exec(l.replace(/\*\*/g, '').trim()) : null;
      if (m) out.push({ n: Number(m[1]), name: m[2], result: m[3], evidence: (m[4] ?? '').trim(), event: e, k: out.length });
    }
  }
  return out;
}

const passed = (g) => g.result === (GATES[g.n]?.[1] === 'user' ? 'APPROVED' : 'PASS');
const before = (a, b) => a.event.seq < b.event.seq || (a.event === b.event && a.k < b.k);

/** First passing line of each gate 0–9, or null. */
function firstPasses(events) {
  const lines = gateLines(events);
  return { lines, first: GATES.map((_, n) => lines.find((g) => g.n === n && passed(g)) ?? null) };
}

/** Split a shell command into simple commands (on &&, ||, ;, |, newlines). */
const segments = (cmd) => String(cmd).split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);

/** The program a simple command runs: skips VAR=x assignments and wrappers like env/time. */
function program(seg) {
  const toks = seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  let i = 0;
  while (i < toks.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]) || WRAPPERS.has(toks[i]))) i++;
  return { prog: path.basename((toks[i] ?? '').replace(/^["']|["']$/g, '')), toks: toks.slice(i) };
}

/** Is this simple command a run of the named script (`node x/script.mjs …` or `x/script.mjs …`)? */
function runs(seg, script) {
  const { prog, toks } = program(seg);
  const re = new RegExp(`^${script}(\\.mjs)?$`);
  if (re.test(prog)) return true;
  return INTERPRETERS.has(prog) && toks.slice(1).some((t) => re.test(path.basename(t.replace(/^["']|["']$/g, ''))));
}

/** Does this whole Bash command write plates/<id>/index.html? Returns the plate id or null. */
function shellPlateWrite(cmd) {
  const m = PLATE_HTML_RE.exec(cmd);
  if (!m) return null;
  const target = `plates/${m[1]}/index\\.html`;
  if (new RegExp(`>>?\\s*["']?[^\\s"'<>|;&]*${target}`).test(cmd)) return m[1]; // redirect onto it
  for (const seg of segments(cmd)) {
    if (!PLATE_HTML_RE.test(seg) && !/<</.test(seg)) continue;
    const { prog, toks } = program(seg);
    if (prog === 'tee' || COPIERS.has(prog)) return m[1];
    if ((prog === 'sed' || prog === 'perl') && toks.some((t) => /^-[a-zA-Z]*i/.test(t))) return m[1];
  }
  // any interpreter in a command that names the plate's index.html counts (python -c "open(…,'w')", node -e …)
  if (segments(cmd).some((s) => INTERPRETERS.has(program(s).prog))) return m[1];
  return null;
}

/**
 * Events that write a plate's composition (DEC-37, tightened in WP8 round 1): a Write/Edit/MultiEdit
 * on plates/<id>/index.html; a render-plate run without --storyboard (with or without `node`;
 * --help/--version excluded); or a Bash command that writes plates/<id>/index.html (redirect, tee,
 * cp/mv/ln/install/rsync/dd/touch, sed -i/perl -i, or any interpreter such as python or node).
 */
export function plateWrites(events) {
  const out = [];
  for (const e of events) {
    if (e.kind !== 'tool_use') continue;
    if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(e.name)) {
      const p = String(e.input.file_path ?? e.input.notebook_path ?? '');
      const m = PLATE_HTML_RE.exec(p);
      if (m && p.endsWith('index.html')) out.push({ event: e, plate: m[1], how: `${e.name} ${p.slice(p.lastIndexOf('plates/'))}` });
    } else if (e.name === 'Bash') {
      const cmd = String(e.input.command ?? '');
      const render = segments(cmd).find((s) => runs(s, 'render-plate') && !/--storyboard\b/.test(s) && !/(^|\s)(--help|-h|--version)\b/.test(s));
      if (render) { out.push({ event: e, plate: renderIds(render)[0] ?? null, plates: renderIds(render), how: `Bash ${brief(render.slice(render.indexOf('render-plate')), 70)}` }); continue; }
      const id = shellPlateWrite(cmd);
      if (id) out.push({ event: e, plate: id, how: `Bash ${brief(cmd, 70)}` });
    }
  }
  return out;
}

/** Plate ids named in a render-plate command (positional args after plates.json; not --all). */
function renderIds(seg) {
  const toks = (seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ''));
  const i = toks.findIndex((t) => /plates[^/]*\.json$/.test(t));
  if (i < 0) return [];
  const ids = [];
  const valued = new Set(['--brand', '--out', '--every', '--quality']);
  for (let k = i + 1; k < toks.length; k++) {
    if (/^(\d*>|&>|<|\|)/.test(toks[k])) break; // a redirect ends the arguments (`> out 2>&1`)
    if (valued.has(toks[k])) { k++; continue; }
    if (new RegExp(`^${ID}$`).test(toks[k])) ids.push(toks[k]);
  }
  return ids;
}

const result = (id, ok, message, event) => ({ id, ok, message: event ? `${message} (${where(event)})` : message, line: event?.line ?? null, src: event?.src ?? null });

/** AC-ORC-01 (transcript part): GATE 0–9 each pass, first passes in order; user gates asked; cold read before gate 1; final at gate 9. */
export function checkGates(events) {
  const id = 'AC-ORC-01';
  const { lines, first } = firstPasses(events);
  for (const g of lines) {
    if (!GATES[g.n]) return result(id, false, `unknown gate number ${g.n}: "${brief(`GATE ${g.n} ${g.name}`)}"`, g.event);
    if (GATES[g.n][0] !== g.name) return result(id, false, `gate ${g.n} must be named '${GATES[g.n][0]}', got '${g.name}'`, g.event);
    const want = GATES[g.n][1] === 'user' ? ['APPROVED', 'REJECTED'] : ['PASS', 'FAIL'];
    if (!want.includes(g.result)) return result(id, false, `gate ${g.n} ${g.name} is a ${GATES[g.n][1] === 'user' ? 'user' : 'mechanical'} gate: result must be ${want.join(' or ')}, got ${g.result}`, g.event);
  }
  const missing = first.map((g, n) => (g ? null : n)).filter((n) => n !== null);
  if (missing.length) return result(id, false, `no passing gate line for gate(s) ${missing.join(', ')}`);
  for (let n = 1; n < first.length; n++) {
    if (before(first[n], first[n - 1])) return result(id, false, `gate ${n} ${GATES[n][0]} passed before gate ${n - 1} ${GATES[n - 1][0]}`, first[n].event);
  }
  for (let n = 0; n < first.length; n++) {
    if (GATES[n][1] !== 'user') continue;
    if (!askedBetween(events, n ? first[n - 1].event.seq : -1, first[n].event.seq)) {
      return result(id, false, `gate ${n} ${GATES[n][0]} APPROVED without an AskUserQuestion since gate ${n - 1}`, first[n].event);
    }
  }
  const coldRead = events.some((e) => isMain(e) && isTool(e, 'Agent', 'Task') && e.seq > first[0].event.seq && e.seq < first[1].event.seq);
  if (!coldRead) return result(id, false, 'no cold-read Agent call between gate 0 and gate 1', first[1].event);
  if (!/out\/final\.mp4/.test(first[9].evidence)) return result(id, false, `gate 9 export does not name out/final.mp4: "${brief(first[9].evidence)}"`, first[9].event);
  return result(id, true, `gates 0–9 pass in order (lines ${first.map((g) => g.event.line).join(', ')})`);
}

/**
 * AC-ORC-02: plates are written only while the storyboard stands approved. Walking the transcript,
 * the storyboard is "open" at the start, after every `render-plate --storyboard` run and after every
 * `GATE 4 storyboard: REJECTED` line; it closes at a `GATE 4 storyboard: APPROVED` line that follows
 * an AskUserQuestion asked since it opened. Any plate write while it is open fails.
 */
export function checkStoryboardFirst(events) {
  const id = 'AC-ORC-02';
  const writes = plateWrites(events);
  const gate4 = gateLines(events).filter((g) => g.n === 4);
  const timeline = [
    ...events.filter((e) => isTool(e, 'Bash') && segments(e.input.command ?? '').some((s) => runs(s, 'render-plate') && /--storyboard\b/.test(s))).map((e) => ({ seq: e.seq, k: -1, what: 'storyboard', event: e })),
    ...gate4.map((g) => ({ seq: g.event.seq, k: g.k, what: g.result, event: g.event })),
    ...writes.map((w) => ({ seq: w.event.seq, k: Infinity, what: 'write', w, event: w.event })),
  ].sort((a, b) => a.seq - b.seq || a.k - b.k);
  let open = true; let openedAt = -1; let produced = null; let approvedAt = null; let firstWrite = null; let ignored = null;
  for (const t of timeline) {
    if (t.what === 'storyboard') { produced ??= t.event; open = true; openedAt = t.seq; }
    else if (t.what === 'REJECTED') { open = true; openedAt = t.seq; }
    else if (t.what === 'APPROVED') {
      if (!produced) return result(id, false, 'storyboard approved before any `render-plate … --storyboard` produced review/storyboard.jpg', t.event);
      if (askedBetween(events, openedAt, t.seq)) { open = false; approvedAt ??= t.event; openedAt = t.seq; } else ignored ??= t.event;
    } else if (t.what === 'write') {
      if (open) {
        const why = approvedAt ? 'while the storyboard was reopened (re-run or REJECTED) and not yet re-approved' : 'before the storyboard was approved';
        return result(id, false, `plate written ${why}${ignored ? ` — the APPROVED line at ${where(ignored)} had no AskUserQuestion since the storyboard opened, so it doesn't count` : ''}: ${t.w.how}`, t.event);
      }
      firstWrite ??= t;
    }
  }
  if (!approvedAt) return result(id, false, ignored ? `the only GATE 4 APPROVED line (${where(ignored)}) had no AskUserQuestion since the storyboard opened` : 'no "GATE 4 storyboard: APPROVED" line');
  if (!firstWrite) return result(id, false, 'no plate was written after the storyboard was approved');
  return result(id, true, `storyboard produced (${where(produced)}) and approved (${where(approvedAt)}) before the first plate write (${where(firstWrite.event)}: ${firstWrite.w.how}); no write while reopened`);
}

/**
 * AC-ORC-03: every rendered plate gets 1–3 self-review rounds, then a separate reviewer Agent call.
 * A round is one main-thread `contact-sheet` run on renders/plates/<id>.mp4 (any output name) before
 * the reviewer call; the stage-5 `render-plate --sheet` is not a round. The reviewer is the first
 * Agent call whose prompt or description names review-rubric. Rendered plates are those named by a
 * plate write (Write/Edit of its index.html, `render-plate <id>`, `capture --plate <id>`).
 */
export function checkSelfReview(events) {
  const id = 'AC-ORC-03';
  const reviewer = events.find((e) => isMain(e) && isTool(e, 'Agent', 'Task') && /review-rubric/.test(`${e.input.prompt ?? ''} ${e.input.description ?? ''}`));
  const cut = reviewer ? reviewer.seq : Infinity;
  const errored = new Set(events.filter((e) => e.kind === 'tool_result' && e.isError).map((e) => e.id));
  const rounds = new Map(); // plate -> [events]
  for (const e of events) {
    if (!isMain(e) || !isTool(e, 'Bash') || e.seq > cut) continue;
    if (errored.has(e.id)) continue; // a sheet run that failed (is_error) and was retried is not a round
    for (const s of segments(e.input.command ?? '')) {
      if (!runs(s, 'contact-sheet')) continue;
      const m = RENDER_MP4_RE.exec(s);
      if (m) rounds.set(m[1], [...(rounds.get(m[1]) ?? []), e]);
    }
  }
  const rendered = new Map(); // plate -> first write event
  for (const w of plateWrites(events)) for (const p of w.plates ?? (w.plate ? [w.plate] : [])) if (!rendered.has(p)) rendered.set(p, w.event);
  for (const e of events) {
    if (!isTool(e, 'Bash')) continue;
    for (const s of segments(e.input.command ?? '')) {
      const m = runs(s, 'capture') && /--plate\s+["']?([a-z0-9][a-z0-9-]*)/.exec(s);
      if (m && !rendered.has(m[1])) rendered.set(m[1], e);
    }
  }
  for (const [plate, evs] of rounds) {
    if (evs.length > 3) return result(id, false, `plate '${plate}' has ${evs.length} self-review rounds before the reviewer (max 3): contact-sheet run #4`, evs[3]);
  }
  for (const [plate, ev] of rendered) {
    if (!rounds.has(plate)) return result(id, false, `plate '${plate}' was rendered but has no self-review round (contact-sheet of renders/plates/${plate}.mp4) before the reviewer`, ev);
  }
  if (!rounds.size) return result(id, false, 'no self-review round found (no contact-sheet run on renders/plates/<id>.mp4)');
  const last = Math.max(...[...rounds.values()].flat().map((e) => e.seq));
  if (!reviewer) return result(id, false, 'no separate reviewer Agent call (an Agent prompt naming review-rubric.md) after the self-review rounds', events[last]);
  const summary = [...rounds].map(([p, r]) => `${p}×${r.length}`).join(', ');
  return result(id, true, `self-review rounds ${summary} (1–3 each, every rendered plate), then reviewer Agent at ${where(reviewer)}`);
}

/** AC-ORC-04: runtimes.md is Read before the first plate is written (by whoever writes it). */
export function checkRuntimesFirst(events) {
  const id = 'AC-ORC-04';
  const writes = plateWrites(events);
  if (!writes.length) return result(id, false, 'no plate was written, so the runtimes.md order cannot be checked');
  const reads = events.filter((e) => isTool(e, 'Read') && RUNTIMES_RE.test(String(e.input.file_path ?? '')));
  // per transcript source (main thread, each subagent): its first plate write needs its own earlier Read
  for (const src of [...new Set(writes.map((w) => w.event.src))]) {
    const w = writes.find((x) => x.event.src === src);
    const r = reads.find((x) => x.src === src);
    if (!r || r.seq > w.event.seq) {
      return result(id, false, `${src === 'main' ? 'first plate written' : `subagent ${src} wrote a plate`} before runtimes.md was Read${r ? ` (Read at ${where(r)})` : ''}: ${w.how}`, w.event);
    }
  }
  const r = reads.find((x) => x.src === writes[0].event.src);
  return result(id, true, `runtimes.md Read (${where(r)}) before the first plate write (${where(writes[0].event)}: ${writes[0].how})`);
}

export function checkAll(events) {
  return [checkGates(events), checkStoryboardFirst(events), checkSelfReview(events), checkRuntimesFirst(events)];
}
