// Transcript checker for /peak-media:plate-factory runs (AC-ORC-01..04).
// Reads a Claude Code session JSONL (plus its <session>/subagents/*.jsonl) and checks the
// orchestrator's gates and ordering rules. Format of the gate lines: skills/plate-factory/references/stages.md.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Gate number -> [name, kind]. user gates must end APPROVED, mechanical gates PASS. */
export const GATES = [
  ['brief', 'user'], ['script', 'user'], ['spine', 'check'], ['plates', 'user'], ['storyboard', 'user'],
  ['pipeline', 'check'], ['build', 'check'], ['composite', 'check'], ['audio', 'user'], ['export', 'check'],
];
const GATE_RE = /^GATE (\d+) ([a-z-]+): (APPROVED|PASS|REJECTED|FAIL)\b\s*(?:[—–-]\s*(.*))?$/;
const PLATE_HTML_RE = /(?:^|[\s/'"=])plates\/([a-z0-9][a-z0-9-]*)\/index\.html\b/;
const SHEET_RE = /(?:^|\/)review\/([a-z0-9][a-z0-9-]*)-r(\d+)\.jpg$/;
const RUNTIMES_RE = /(?:^|\/)vendor\/hyperframes\/hyperframes\/references\/runtimes\.md$/;
const SHELL_WRITE_RE = /(>>?|\btee\b|\bsed\s+-i|\bperl\s+-[a-z]*i|\bcp\b|\bmv\b|\bln\b)/;

/** Strip markdown dressing so `**GATE 4 …**` or `` `GATE 4 …` `` still reads as a gate line. */
const cleanLine = (l) => l.trim().replace(/^[>*`_\s]+|[*`_\s]+$/g, '');

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

/** All gate lines the main thread wrote: {n, name, result, evidence, event}. */
export function gateLines(events) {
  const out = [];
  for (const e of events) {
    if (e.kind !== 'text' || !isMain(e)) continue;
    for (const l of e.text.split('\n')) {
      const m = GATE_RE.exec(cleanLine(l));
      if (m) out.push({ n: Number(m[1]), name: m[2], result: m[3], evidence: (m[4] ?? '').trim(), event: e });
    }
  }
  return out;
}

const passed = (g) => g.result === (GATES[g.n]?.[1] === 'user' ? 'APPROVED' : 'PASS');

/** First passing line of each gate 0–9, or null. */
function firstPasses(events) {
  const lines = gateLines(events);
  return { lines, first: GATES.map((_, n) => lines.find((g) => g.n === n && passed(g)) ?? null) };
}

/**
 * Events that write a plate's composition (DEC-37): a Write/Edit/MultiEdit on plates/<id>/index.html,
 * a Bash command that writes one (redirect, tee, sed -i, cp, mv), or a render-plate call without
 * --storyboard (the --storyboard template scaffold is not authoring).
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
      for (const part of cmd.split(/&&|\|\||;|\n/)) {
        if (/\bnode\b.*render-plate(\.mjs)?\b/.test(part) && !/--storyboard\b/.test(part) && !/(^|\s)(--help|-h|--version)\b/.test(part)) {
          out.push({ event: e, plate: null, how: `Bash ${brief(part.slice(part.indexOf('render-plate')), 70)}` });
          break;
        }
        const m = PLATE_HTML_RE.exec(part);
        if (m && SHELL_WRITE_RE.test(part)) { out.push({ event: e, plate: m[1], how: `Bash ${brief(part.trim(), 70)}` }); break; }
      }
    }
  }
  return out;
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
    if (first[n].event.seq < first[n - 1].event.seq || (first[n].event === first[n - 1].event && lines.indexOf(first[n]) < lines.indexOf(first[n - 1]))) {
      return result(id, false, `gate ${n} ${GATES[n][0]} passed before gate ${n - 1} ${GATES[n - 1][0]}`, first[n].event);
    }
  }
  for (let n = 0; n < first.length; n++) {
    if (GATES[n][1] !== 'user') continue;
    const lo = n ? first[n - 1].event.seq : -1;
    const asked = events.some((e) => isMain(e) && e.kind === 'tool_use' && e.name === 'AskUserQuestion' && e.seq > lo && e.seq < first[n].event.seq);
    if (!asked) return result(id, false, `gate ${n} ${GATES[n][0]} APPROVED without an AskUserQuestion since gate ${n - 1}`, first[n].event);
  }
  const coldRead = events.some((e) => isMain(e) && e.kind === 'tool_use' && ['Agent', 'Task'].includes(e.name) && e.seq > first[0].event.seq && e.seq < first[1].event.seq);
  if (!coldRead) return result(id, false, 'no cold-read Agent call between gate 0 and gate 1', first[1].event);
  if (!/out\/final\.mp4/.test(first[9].evidence)) return result(id, false, `gate 9 export does not name out/final.mp4: "${brief(first[9].evidence)}"`, first[9].event);
  return result(id, true, `gates 0–9 pass in order (lines ${first.map((g) => g.event.line).join(', ')})`);
}

/** AC-ORC-02: render-plate --storyboard ran and gate 4 was APPROVED before any plate is written. */
export function checkStoryboardFirst(events) {
  const id = 'AC-ORC-02';
  const { first } = firstPasses(events);
  const writes = plateWrites(events);
  const sb = events.find((e) => e.kind === 'tool_use' && e.name === 'Bash' && /\bnode\b[^\n;&|]*render-plate(\.mjs)?\b[^\n;&|]*--storyboard\b/.test(String(e.input.command ?? '')));
  const approved = first[4];
  if (!approved) {
    return writes.length ? result(id, false, `plate written but the storyboard was never approved (no "GATE 4 storyboard: APPROVED"): ${writes[0].how}`, writes[0].event)
      : result(id, false, 'no "GATE 4 storyboard: APPROVED" line');
  }
  if (!sb || sb.seq > approved.event.seq) return result(id, false, 'storyboard approved before any `render-plate … --storyboard` produced review/storyboard.jpg', approved.event);
  const early = writes.find((w) => w.event.seq < approved.event.seq);
  if (early) return result(id, false, `plate written before the storyboard was approved (gate 4 at ${where(approved.event)}): ${early.how}`, early.event);
  if (!writes.length) return result(id, false, 'no plate was written after the storyboard was approved');
  return result(id, true, `storyboard produced (${where(sb)}) and approved (${where(approved.event)}) before the first plate write (${where(writes[0].event)}: ${writes[0].how})`);
}

/** AC-ORC-03: each plate has 1–3 self-review rounds (Read of review/<id>-r<N>.jpg), then a separate reviewer Agent call. */
export function checkSelfReview(events) {
  const id = 'AC-ORC-03';
  const rounds = new Map(); // plate -> Map(round -> first Read event)
  for (const e of events) {
    if (!isMain(e) || e.kind !== 'tool_use' || e.name !== 'Read') continue;
    const m = SHEET_RE.exec(String(e.input.file_path ?? ''));
    if (!m) continue;
    const r = rounds.get(m[1]) ?? new Map();
    if (!r.has(Number(m[2]))) r.set(Number(m[2]), e);
    rounds.set(m[1], r);
  }
  if (!rounds.size) return result(id, false, 'no self-review round found (no Read of review/<id>-r<N>.jpg)');
  for (const [plate, r] of rounds) {
    const nums = [...r.keys()].sort((a, b) => a - b);
    if (nums.length > 3 || nums.at(-1) > 3) {
      const ev = r.get(nums.find((n) => n > 3) ?? nums[3]);
      return result(id, false, `plate '${plate}' has ${Math.max(nums.length, nums.at(-1))} self-review rounds (max 3): review/${plate}-r${nums.find((n) => n > 3) ?? nums[3]}.jpg`, ev);
    }
  }
  const reviewers = events.filter((e) => isMain(e) && e.kind === 'tool_use' && ['Agent', 'Task'].includes(e.name) && /review-rubric/.test(`${e.input.prompt ?? ''} ${e.input.description ?? ''}`));
  const lastRound = Math.max(...[...rounds.values()].flatMap((r) => [...r.values()].map((e) => e.seq)));
  const lastEv = events[lastRound];
  if (!reviewers.length) return result(id, false, 'no separate reviewer Agent call (an Agent prompt naming review-rubric.md) after the self-review rounds', lastEv);
  const after = reviewers.find((e) => e.seq > lastRound);
  if (!after) return result(id, false, `reviewer Agent call comes before the last self-review round (${where(lastEv)})`, reviewers[0]);
  const summary = [...rounds].map(([p, r]) => `${p}×${r.size}`).join(', ');
  return result(id, true, `self-review rounds ${summary} (≤ 3 each), then reviewer Agent at ${where(after)}`);
}

/** AC-ORC-04: runtimes.md is Read before the first plate is written (by whoever writes it). */
export function checkRuntimesFirst(events) {
  const id = 'AC-ORC-04';
  const writes = plateWrites(events);
  if (!writes.length) return result(id, false, 'no plate was written, so the runtimes.md order cannot be checked');
  const reads = events.filter((e) => e.kind === 'tool_use' && e.name === 'Read' && RUNTIMES_RE.test(String(e.input.file_path ?? '')));
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
