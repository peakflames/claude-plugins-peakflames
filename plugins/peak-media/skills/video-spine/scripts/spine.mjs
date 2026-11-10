#!/usr/bin/env node
// spine — brief.md + script.md -> spine/manifest.json + spine/narration.wav (narration),
// or spine/beatgrid.json (no narration: no key, or --no-narrate). Stage 2 of the plate factory.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { runCli, CliError, EXIT, usageError } from '../../../lib/cli.mjs';
import { ffmpeg, requireFfmpeg } from '../../../lib/ffmpeg.mjs';
import { validateDoc } from '../../../lib/schemas.mjs';
import { DEFAULT_MODEL, DEFAULT_VOICE, DEFAULT_STYLE, checkTtsOptions, synthesizeClips, wpmReport } from '../../../lib/tts/index.mjs';

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const KEY_ENV = 'PEAK_MEDIA_OPENROUTER_API_KEY'; // DEC-30; legacy fallback below
const LEGACY_KEY_ENV = 'TTS_OPENROUTER_API_KEY';

/** Words as a listener hears them: mood tags like <Warm> are performed, not read. */
export const countWords = (t) => t.replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Target runtime (ms) and beat ids from a brief.md. */
export function parseBrief(text) {
  const m = /\bruntime\b[^0-9\n]*?(\d+(?:\.\d+)?)\s*(ms|seconds|sec|s|minutes|min)\b/i.exec(text);
  const unit = m?.[2].toLowerCase();
  const targetMs = m ? Math.round(Number(m[1]) * (unit === 'ms' ? 1 : unit.startsWith('min') ? 60000 : 1000)) : undefined;
  const sec = /^##\s+beats\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(text);
  const beats = sec ? [...sec[1].matchAll(/^\s*(?:\d+\.|[-*])\s+\*\*([^*]+)\*\*/gm)].map((x) => x[1].trim()) : [];
  return { targetMs, beats };
}

/**
 * script.md: one `## <beat-id>` section per beat, holding exactly one narration paragraph.
 * Optional `On screen: …` and `Style: …` lines; HTML comments and text before the first heading are ignored.
 */
export function parseScript(text) {
  const src = text.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const beats = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const paras = cur.lines.join('\n').split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean);
    if (paras.length > 1) throw new CliError(`script.md: beat '${cur.id}' has ${paras.length} paragraphs — write one paragraph per beat (merge them, or split the beat)`);
    beats.push({ id: cur.id, text: paras[0] ?? '', onScreenText: cur.onScreen, style: cur.style, line: cur.line });
  };
  src.split('\n').forEach((line, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      const id = h[1].replace(/`/g, '').trim();
      if (!ID_RE.test(id)) throw new CliError(`script.md line ${i + 1}: beat id '${id}' must be lowercase letters, digits and dashes`);
      if (beats.some((b) => b.id === id)) throw new CliError(`script.md line ${i + 1}: beat '${id}' appears twice`);
      cur = { id, lines: [], line: i + 1 };
      return;
    }
    if (!cur) return;
    const meta = /^\s*(on[ -]screen|style)\s*:\s*(.*)$/i.exec(line);
    if (meta) {
      if (/style/i.test(meta[1])) cur.style = meta[2].trim();
      else cur.onScreen = meta[2].trim();
      cur.lines.push('');
      return;
    }
    cur.lines.push(line);
  });
  flush();
  if (!beats.length) throw new CliError('script.md has no beats — add one "## <beat-id>" heading per beat, each followed by its paragraph');
  const empty = beats.find((b) => !b.text);
  if (empty) throw new CliError(`script.md: beat '${empty.id}' (line ${empty.line}) has no narration paragraph`);
  return beats;
}

/** Narration layout: lead + clip + tail per beat; short spines hold each beat up to maxHoldMs longer to reach the target. */
export function layoutNarration(script, durations, { leadMs, tailMs, targetMs, maxHoldMs }) {
  const base = script.reduce((s, _, i) => s + leadMs + durations[i] + tailMs, 0);
  const hold = base < targetMs ? Math.min(maxHoldMs, Math.floor((targetMs - base) / script.length)) : 0;
  let t = 0;
  return script.map((b, i) => {
    const beat = { id: b.id, startMs: t, durationMs: leadMs + durations[i] + tailMs + hold, clipStartMs: t + leadMs };
    t += beat.durationMs;
    return beat;
  });
}

/** Beat grid: the target split into whole beats at bpm, weighted by each paragraph's words. */
export function layoutBeatgrid(script, { targetMs, bpm, minBeatMs = 2000 }) {
  const unit = 60000 / bpm;
  const n = Math.max(1, Math.round(targetMs / unit));
  const minU = Math.max(1, Math.ceil(minBeatMs / unit));
  if (minU * script.length > n) throw new CliError(`target ${targetMs} ms is too short for ${script.length} beats at ${bpm} bpm (need ≥ ${Math.ceil(minU * script.length * unit)} ms)`);
  const w = script.map((b) => Math.max(1, countWords(b.text)));
  const sum = w.reduce((a, b) => a + b, 0);
  const free = n - minU * script.length;
  const ideal = w.map((x) => (free * x) / sum);
  const units = ideal.map((x) => minU + Math.floor(x));
  let left = n - units.reduce((a, b) => a + b, 0);
  ideal.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { units[i]++; left--; } });
  let u = 0;
  return script.map((b, i) => {
    const startMs = Math.round(u * unit);
    u += units[i];
    return { id: b.id, startMs, durationMs: Math.round(u * unit) - startMs };
  });
}

function silentWav(file, ms, rate = 48000) {
  const n = Math.round((rate * ms) / 1000);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  writeFileSync(file, buf);
}

/** Place each clip at its startMs on a silent bed of totalMs; 48 kHz mono 16-bit WAV. */
function mixNarration(clips, totalMs, out) {
  const inputs = clips.flatMap((c) => ['-i', c.path]);
  const chains = clips.map((c, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,adelay=${c.startMs}:all=1[a${i}]`);
  const graph = `${chains.join(';')};${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad[out]`;
  ffmpeg(['-y', ...inputs, '-filter_complex', graph, '-map', '[out]', '-t', (totalMs / 1000).toFixed(3), '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out], { what: 'narration mix' });
}

const readText = (file, what) => {
  if (!existsSync(file)) throw new CliError(`cannot read ${what} ${file}: no such file`);
  return readFileSync(file, 'utf8');
};

const spec = {
  name: 'spine',
  summary: 'turn brief.md + script.md into the timed spine every plate hangs on',
  usage: 'spine [options]',
  description: `
Reads the brief's runtime and beat list, and script.md (one "## <beat-id>" section per beat,
one paragraph each). With narration it synthesizes one clip per beat, lays them out with
--lead-ms/--tail-ms of silence inside each beat (so beats are separated by at least 400 ms),
and writes spine/narration.wav + spine/manifest.json. Without narration (--no-narrate, or no
${KEY_ENV} (or legacy ${LEGACY_KEY_ENV}) for a real model) it writes spine/beatgrid.json and a silent spine/narration.wav, with
no network calls. Narration is on by default when ${KEY_ENV} is set or --tts-model is fake/tone.
Exit 1 (files still written) when the runtime is outside the target ±10%: resize script.md.`,
  options: {
    brief: { type: 'string', arg: 'file', desc: 'The video brief (runtime and beat list)', default: 'brief.md' },
    script: { type: 'string', arg: 'file', desc: 'Narration script (default: script.md next to the brief)' },
    out: { type: 'string', arg: 'dir', desc: 'Spine folder (default: spine/ next to the brief)' },
    'target-ms': { type: 'number', arg: 'ms', desc: 'Target runtime (overrides the brief)' },
    narrate: { type: 'boolean', desc: `Require narration (fails without ${KEY_ENV} unless --tts-model fake/tone)` },
    'no-narrate': { type: 'boolean', desc: 'Write a beat grid (no voice, no network)' },
    'tts-model': { type: 'string', arg: 'model', desc: 'TTS model (fake/tone for offline tests)', default: DEFAULT_MODEL },
    voice: { type: 'string', arg: 'name', desc: 'TTS voice', default: DEFAULT_VOICE },
    style: { type: 'string', arg: 'text', desc: 'Style instructions sent with every clip ("" for none)', default: DEFAULT_STYLE },
    'lead-ms': { type: 'number', arg: 'ms', desc: 'Silence before the clip inside each beat (≥ 200)', default: 250 },
    'tail-ms': { type: 'number', arg: 'ms', desc: 'Silence after the clip inside each beat (≥ 200)', default: 250 },
    'max-hold-ms': { type: 'number', arg: 'ms', desc: 'Most extra hold added per beat when the spine runs short of the target', default: 1000 },
    bpm: { type: 'number', arg: 'n', desc: 'Beat-grid tempo; beat lengths snap to whole beats', default: 120 },
    'audio-offset-ms': { type: 'number', arg: 'ms', desc: 'Recorded in the manifest for laying narration onto picture', default: 0 },
    'cache-dir': { type: 'string', arg: 'dir', desc: 'TTS clip cache (default: $PEAK_MEDIA_TTS_CACHE or ~/.cache/peak-media/tts)' },
    'export-clips': { type: 'string', arg: 'dir', desc: 'Copy every clip here (default: <out>/clips)' },
    'debug-requests': { type: 'boolean', desc: 'Log TTS requests (key redacted)' },
    budget: { type: 'boolean', desc: 'Print the word budget per beat and exit (no synthesis, no network)' },
    wpm: { type: 'number', arg: 'n', desc: 'Speaking rate for --budget (measure yours with sample-voice)', default: 165 },
  },
  positionals: { max: 0 },
  examples: [
    'spine --brief brief.md --budget',
    'spine --brief brief.md --tts-model fake/tone',
    'spine --brief brief.md --voice Rasalgethi --style "… Speak with a British accent."',
    'spine --brief brief.md --no-narrate',
  ],
};

let gateWritten = false;
async function main({ values: v }, argv) {
  if (v.narrate && v['no-narrate']) throw usageError('--narrate and --no-narrate are mutually exclusive');
  for (const k of ['lead-ms', 'tail-ms']) if (v[k] < 200) throw usageError(`--${k} must be ≥ 200 (DEC-13/29: beats need ≥ 400 ms of silence between them), got ${v[k]}`);
  if (v['max-hold-ms'] < 0) throw usageError('--max-hold-ms must be ≥ 0');
  if (!(v.bpm > 0)) throw usageError(`--bpm must be > 0, got ${v.bpm}`);
  if (!(v.wpm > 0)) throw usageError(`--wpm must be > 0, got ${v.wpm}`);
  if (v['target-ms'] !== undefined && !(v['target-ms'] >= 1000)) throw usageError(`--target-ms must be ≥ 1000, got ${v['target-ms']}`);
  if (!Number.isInteger(v['audio-offset-ms'])) throw usageError('--audio-offset-ms must be a whole number of ms');

  const briefFile = path.resolve(v.brief);
  const dir = path.dirname(briefFile);
  const brief = parseBrief(readText(briefFile, 'brief'));
  const targetMs = v['target-ms'] ?? brief.targetMs;
  if (!targetMs) throw new CliError(`${v.brief} gives no runtime — add a line like "Runtime: 20 s", or pass --target-ms`);
  const scriptFile = path.resolve(v.script ?? path.join(dir, 'script.md'));
  const outDir = path.resolve(v.out ?? path.join(dir, 'spine'));
  const gapMs = v['lead-ms'] + v['tail-ms'];

  if (v.budget) {
    const script = existsSync(scriptFile) ? parseScript(readFileSync(scriptFile, 'utf8')) : null;
    const ids = script?.map((b) => b.id) ?? brief.beats;
    const n = Math.max(1, ids.length);
    const words = Math.max(0, Math.round((((targetMs - n * gapMs) / 1000) * v.wpm) / 60));
    process.stdout.write(`budget  ${(targetMs / 1000).toFixed(1)} s at ${v.wpm} wpm, ${n} beat(s) × ${gapMs} ms padding → about ${words} words\n`);
    if (script) {
      const have = script.reduce((s, b) => s + countWords(b.text), 0);
      for (const b of script) process.stdout.write(`  ${b.id.padEnd(16)} ${String(countWords(b.text)).padStart(4)} words  ≈ ${((countWords(b.text) * 60) / v.wpm + gapMs / 1000).toFixed(1)} s\n`);
      process.stdout.write(`script  ${have} words (${have > words * 1.1 ? 'too long — cut' : have < words * 0.9 ? 'short — the spine holds beats up to --max-hold-ms each' : 'on budget'})\n`);
    } else if (!ids.length) process.stdout.write('note  the brief lists no beats\n');
    return EXIT.OK;
  }

  const script = parseScript(readText(scriptFile, 'script'));
  if (brief.beats.length) {
    const got = script.map((b) => b.id).join(', ');
    if (got !== brief.beats.join(', ')) throw new CliError(`script.md beats (${got}) must match the brief's beats in order (${brief.beats.join(', ')})`);
  }

  const model = v['tts-model'];
  const keySet = !!(process.env[KEY_ENV] || process.env[LEGACY_KEY_ENV]);
  const narrate = v['no-narrate'] ? false : v.narrate ? true : model.startsWith('fake/') || keySet;
  checkTtsOptions({ model, voice: v.voice, narrate });
  const command = ['node', '${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/spine.mjs', ...argv];
  mkdirSync(outDir, { recursive: true });
  const audioFile = path.join(outDir, 'narration.wav');
  let doc, outFile, stale;

  if (!narrate) {
    if (!v['no-narrate']) process.stdout.write(`note  ${KEY_ENV} (or ${LEGACY_KEY_ENV}) is not set: writing a beat grid (no voice). Set it, or pass --tts-model fake/tone, for narration\n`);
    const beats = layoutBeatgrid(script, { targetMs, bpm: v.bpm });
    const totalMs = beats.at(-1).startMs + beats.at(-1).durationMs;
    doc = {
      schemaVersion: 1, kind: 'beatgrid', targetMs, totalMs, bpm: v.bpm, command, narrate: false, audio: 'narration.wav',
      beats: script.map((b, i) => ({ id: b.id, startMs: beats[i].startMs, durationMs: beats[i].durationMs, clipNs: [], onScreenText: b.onScreenText || firstSentence(b.text) })),
      clips: [],
    };
    outFile = path.join(outDir, 'beatgrid.json');
    stale = path.join(outDir, 'manifest.json');
    await check(doc);
    silentWav(audioFile, totalMs);
  } else {
    requireFfmpeg();
    // only pass a cache dir when asked, so lib/tts applies its default (and PEAK_MEDIA_TTS_CACHE)
    const cacheDir = v['cache-dir'] ? path.resolve(v['cache-dir']) : undefined;
    const exportDir = path.resolve(v['export-clips'] ?? path.join(outDir, 'clips'));
    const results = await synthesizeClips({
      clips: script.map((b, i) => ({ n: i + 1, text: b.text, ...(b.style !== undefined && { style: b.style }) })),
      model, voice: v.voice, style: v.style, cacheDir, exportDir, debugRequests: !!v['debug-requests'],
    });
    const byN = new Map(results.map((r) => [r.n, r]));
    const res = script.map((_, i) => byN.get(i + 1));
    const beats = layoutNarration(script, res.map((r) => r.durationMs), { leadMs: v['lead-ms'], tailMs: v['tail-ms'], targetMs, maxHoldMs: v['max-hold-ms'] });
    const totalMs = beats.at(-1).startMs + beats.at(-1).durationMs;
    const clips = res.map((r, i) => ({ n: i + 1, beat: script[i].id, text: r.text, style: r.style, startMs: beats[i].clipStartMs, durationMs: r.durationMs, words: r.words, wpm: r.wpm, file: r.file }));
    doc = {
      schemaVersion: 1, kind: 'narration', targetMs, totalMs, model, voice: v.voice, style: v.style,
      audioOffsetMs: v['audio-offset-ms'], command, narrate: true, audio: 'narration.wav',
      beats: script.map((b, i) => ({ id: b.id, startMs: beats[i].startMs, durationMs: beats[i].durationMs, clipNs: [i + 1], ...(b.onScreenText && { onScreenText: b.onScreenText }) })),
      clips,
    };
    outFile = path.join(outDir, 'manifest.json');
    stale = path.join(outDir, 'beatgrid.json');
    await check(doc);
    mixNarration(clips.map((c, i) => ({ ...c, path: res[i].path })), totalMs, audioFile);
    const rep = wpmReport(res);
    process.stdout.write(`${rep.table}\n`);
    for (const w of rep.warnings) process.stdout.write(`warn  ${w.message}\n`);
    process.stdout.write(`clips  ${results.filter((r) => r.cached).length}/${results.length} cached · exported to ${exportDir}\n`);
  }

  writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n');
  if (existsSync(stale)) { rmSync(stale); process.stdout.write(`note  removed stale ${path.basename(stale)}\n`); }
  for (const b of doc.beats) process.stdout.write(`beat  ${b.id.padEnd(16)} ${(b.startMs / 1000).toFixed(2).padStart(6)} s  +${(b.durationMs / 1000).toFixed(2)} s\n`);
  const off = Math.abs(doc.totalMs - targetMs) / targetMs;
  const summary = `${(doc.totalMs / 1000).toFixed(2)} s against a ${(targetMs / 1000).toFixed(1)} s target (${doc.totalMs >= targetMs ? '+' : '-'}${(off * 100).toFixed(1)}%)`;
  process.stdout.write(`wrote ${outFile} and ${audioFile}\n`);
  // stage 2's gate line comes from here, not from the model (plate-factory stages.md)
  const rel = path.relative(path.dirname(path.resolve(v.brief)), outFile) || outFile;
  if (off > 0.1) {
    gateWritten = true;
    process.stdout.write(`GATE 2 spine: FAIL — ${rel} ${doc.totalMs} ms is outside ±10% of the ${targetMs} ms target\n`);
    throw new CliError(`runtime ${summary} is outside ±10% — resize script.md (words ≈ s × wpm ÷ 60; see --budget) and rerun`);
  }
  process.stdout.write(`PASS  runtime ${summary}\n`);
  process.stdout.write(`GATE 2 spine: PASS — ${rel} ${doc.totalMs} ms (target ${targetMs} ±10%)\n`);
  return EXIT.OK;
}

function firstSentence(text) {
  const t = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return (/^.*?[.!?](?=\s|$)/.exec(t)?.[0] ?? t).trim();
}

async function check(doc) {
  const r = await validateDoc('spine', doc);
  if (!r.ok) throw new Error(`internal: spine output fails the v1 schema: ${r.errors.map((e) => `${e.field} ${e.message}`).join('; ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  await runCli(spec, async (a) => {
    try { return await main(a, argv); } catch (e) {
      // stage 2 always ends with a gate line from here: a failure before the runtime check too
      if (!a.values.budget && !gateWritten) process.stdout.write(`GATE 2 spine: FAIL — ${String(e.message ?? e).split('\n')[0]}\n`);
      throw e;
    }
  }, argv);
}
