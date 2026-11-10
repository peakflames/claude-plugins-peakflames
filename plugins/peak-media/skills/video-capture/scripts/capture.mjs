#!/usr/bin/env node
// capture — play a live page in real time, drive it with a storyboard, and screen-capture it.
// Engine (DEC-06/DEC-35): Playwright page.screencast.start({fps, onFrame}); t0 is the timestamp of
// the first onFrame, and every beat()/wait() is timed against that same clock. Frames are placed on
// a constant-rate grid by their own timestamps (frame k covers t0 + k/fps), so a take is exactly
// round(ms × fps / 1000) frames. The storyboard runs beat(id, fn?) per beat of --script script.md,
// --spine, or the plate's beat (DEC-46); with a spine a beat plays to the manifest's clip timing — no
// TTS here (plate-factory §6, one timing model). Captions and the cursor are drawn with
// screencast.showOverlay (injected DOM as the fallback). A standalone take's --out is the MP4
// deliverable, encoded to its --preset (DEC-47): the spine's clips at their spine times at -16 LUFS
// (D7), else a silent AAC track. A plate's --out stays picture-only. Every take writes a take
// manifest (D11) and prints a report (size, beats, page errors).
// `capture signin <url>` (DEC-47/49) opens Playwright's own Chromium headed, lets the user sign in
// by hand, and saves the session when the last tab closes (U4); --storage-state replays it.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync, mkdtempSync, linkSync, copyFileSync, createReadStream, chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { runCli, CliError, EXIT, usageError, PLUGIN_ROOT } from '../../../lib/cli.mjs';
import { validateFile } from '../../../lib/schemas.mjs';
import { requireNode } from '../../../lib/preflight.mjs';
import { requireFfmpeg, ffmpeg } from '../../../lib/ffmpeg.mjs';
import { lookup as cacheLookup, defaultCacheDir, legacyCacheDirs } from '../../../lib/tts/cache.mjs';
import { levelStem, silentStem, RATE } from '../../video-assemble/scripts/audio.mjs';
import { resolveDep, depRoot, pins, dataDir } from '../../../lib/deps.mjs';
import { browserPath } from '../../../lib/hf.mjs';
import { headedBrowserPath, headedBrowserOk } from '../../../lib/browser.mjs';
import { parseScript } from '../../video-spine/scripts/spine.mjs';
import { PRESETS, DEFAULT_PRESET, presetArgs, presetSummary } from '../../../lib/presets.mjs';

const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.sh');
/** Watchdog: a spine-timed take aborts once it runs this far past its window. */
export const OVERRUN_GRACE_MS = 2000;
/** Watchdog for takes with no window (silent, captions): the default --max-ms. */
export const DEFAULT_MAX_MS = 600_000;
/** Warm-up before t0: evaluate/paint round trips so the first beat() isn't late (WP7a nit). */
export const WARMUP_ROUNDS = 6;

export const DEFAULT_CAPTION_CSS = `
.pm-caption-wrap { position: fixed; left: 0; right: 0; bottom: 6%; display: flex; justify-content: center; pointer-events: none; z-index: 2147483647; }
.pm-caption { max-width: 80%; padding: 0.45em 0.9em; border-radius: 0.4em; background: rgba(0, 0, 0, 0.72); color: #fff;
  font: 600 28px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const words = (t) => String(t ?? '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Caption reading time (web2video §2): about 3 words/s, at least 1.5 s. */
export const holdMs = (text) => Math.max(1500, Math.round((words(text) / 3) * 1000));

/** "1280x720" -> {width, height}; throws a usage error otherwise. */
export function parseViewport(v) {
  const m = /^([1-9]\d*)x([1-9]\d*)$/.exec(String(v ?? '').trim());
  if (!m) throw usageError(`--viewport expects WxH like 1280x720, got '${v}'`);
  const [width, height] = [Number(m[1]), Number(m[2])];
  if (width % 2 || height % 2) throw usageError(`--viewport ${v}: width and height must be even (H.264 needs it)`);
  return { width, height };
}

/** Frames in a take of `ms` at `fps` (the constant-rate grid). */
export const framesFor = (ms, fps) => Math.max(1, Math.round((ms * fps) / 1000));

/**
 * The spine window a take covers: a plate's [startMs, startMs+durationMs), or the whole spine.
 * Clips are the narration clips of the take, in order, with window-relative times: a plate's are
 * the clips of its beat (clip.beat === plate.beat), the whole spine's are all of them.
 */
export function spineWindow(spine, plate) {
  const startMs = plate ? plate.startMs : 0;
  const durationMs = plate ? plate.durationMs : spine.totalMs;
  const clips = (spine.clips ?? [])
    .filter((c) => !plate || c.beat === plate.beat)
    .sort((a, b) => a.startMs - b.startMs)
    .map((c) => ({ n: c.n, beat: c.beat, text: c.text, atMs: c.startMs - startMs, durationMs: c.durationMs, file: c.file, spineStartMs: c.startMs }));
  return { startMs, durationMs, clips };
}

/** The first sentence of a paragraph (mood tags dropped), as video-spine writes onScreenText. */
export function firstSentence(text) {
  const t = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return (/^.*?[.!?](?=\s|$)/.exec(t)?.[0] ?? t).trim();
}

/**
 * The beat list of a take ("the script"), in order. Each beat is
 *   {id, caption, holdMs}                              — script.md: a reading hold from beat() start
 *   {id, caption, timed, plannedMs, endMs, clips[]}    — spine/plate: planned start and voice end on the take clock
 * `script` is parseScript() output; `spine`+`win` come from the spine (plate: its window and beat).
 */
export function beatList({ script, spine, win, plate, audioOffsetMs = 0 }) {
  if (script) return script.map((b) => { const caption = b.onScreenText || firstSentence(b.text); return { id: b.id, caption, holdMs: holdMs(caption) }; });
  const beats = plate ? spine.beats.filter((b) => b.id === plate.beat) : spine.beats;
  return beats.map((b) => {
    const clips = win.clips.filter((c) => (plate ? c.beat === b.id : (b.clipNs ?? []).includes(c.n)));
    const caption = b.onScreenText || (clips[0] ? firstSentence(clips[0].text) : '');
    if (spine.kind === 'narration' && clips.length) {
      const plannedMs = clips[0].atMs - audioOffsetMs;
      const voiceMs = Math.max(...clips.map((c) => c.atMs + c.durationMs)) - clips[0].atMs;
      return { id: b.id, caption, timed: true, plannedMs, endMs: plannedMs + voiceMs, clips };
    }
    const plannedMs = b.startMs - win.startMs;
    return { id: b.id, caption, timed: true, plannedMs, endMs: plannedMs + b.durationMs, clips: [] };
  });
}

/**
 * Places screencast frames on the constant-rate grid. Frame k of the take shows the newest
 * frame whose timestamp is <= t0 + k/fps (rounded to the nearest slot). Unique JPEGs go to
 * `dir`; finish(n) hard-links them into an n-frame image sequence.
 */
export class FrameGrid {
  constructor(dir, fps) {
    this.dir = dir; this.fps = fps; this.t0 = null; this.slots = []; this.stopped = false; this.firstFrame = null;
    this.ready = new Promise((r) => { this.resolveReady = r; });
  }

  onFrame({ data, timestamp }) {
    if (this.stopped) return;
    if (this.t0 === null) { this.t0 = timestamp; this.resolveReady(timestamp); }
    const slot = Math.max(0, Math.round(((timestamp - this.t0) * this.fps) / 1000));
    const last = this.slots.at(-1);
    if (last && slot < last.slot) return; // out of order: keep the newer picture
    const file = path.join(this.dir, `u${String(slot).padStart(7, '0')}.jpg`);
    writeFileSync(file, data);
    if (last && last.slot === slot) last.file = file; else this.slots.push({ slot, file });
  }

  /** Write seq/%07d.jpg for frames 0..n-1; returns the sequence pattern. */
  finish(n) {
    this.stopped = true;
    if (!this.slots.length) throw new CliError('the screencast delivered no frames — is the page rendering? (try --debug-requests)');
    const seq = path.join(this.dir, 'seq');
    mkdirSync(seq, { recursive: true });
    let j = 0;
    for (let k = 0; k < n; k++) {
      while (j + 1 < this.slots.length && this.slots[j + 1].slot <= k) j++;
      const dst = path.join(seq, `${String(k).padStart(7, '0')}.jpg`);
      try { linkSync(this.slots[j].file, dst); } catch { copyFileSync(this.slots[j].file, dst); }
    }
    return { pattern: path.join(seq, '%07d.jpg'), unique: this.slots.filter((s) => s.slot < n).length };
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };

/** Serve `root` on 127.0.0.1 (loopback only). Resolves to {url, close}. */
export function serveDir(root) {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(path.resolve(root)) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) }));
  });
}

const isUrl = (u) => /^(https?|file|about|data):/i.test(u);

/** Turn a --url / live.url / storyboard `url` into {kind:'remote'|'local'|'blank', ...}. */
export function resolvePage(u, baseDir) {
  if (!u) return { kind: 'blank', url: 'about:blank' };
  if (isUrl(u)) return { kind: 'remote', url: u };
  const file = path.resolve(baseDir, u);
  if (!existsSync(file)) throw new CliError(`page not found: ${file} — pass --url <http(s) URL or local .html file>`);
  const html = statSync(file).isDirectory() ? path.join(file, 'index.html') : file;
  if (!existsSync(html)) throw new CliError(`no index.html in ${file} — pass --url <file.html>`);
  return { kind: 'local', root: path.dirname(html), file: path.basename(html) };
}

/** What the storyboard's default export receives (DEC-46). */
export const STORYBOARD_CONTEXT = '{ beat, goto, click, type, point, scrollTo, scrollBy, wait, page, context, mode, fps, viewport, elapsedMs }';

async function loadStoryboard(file) {
  let mod;
  try { mod = await import(pathToFileURL(file).href); } catch (e) {
    throw new CliError(`cannot load storyboard ${file}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
  const fn = mod.default ?? mod.storyboard;
  if (typeof fn !== 'function') throw new CliError(`storyboard ${file} must export a default async function (${STORYBOARD_CONTEXT}) => { … }`);
  return { fn, url: mod.url };
}

async function readSpine(file) {
  if (!existsSync(file)) throw new CliError(`--spine ${file}: no such file — point it at spine/manifest.json (or beatgrid.json)`);
  const v = await validateFile(file, 'spine');
  if (!v.ok) throw new CliError(`--spine ${file} is not a valid spine manifest: ${v.errors.map((e) => `${e.field} ${e.message}`).join('; ')}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

async function readPlate(platesFile, id) {
  if (!existsSync(platesFile)) throw new CliError(`--plates ${platesFile}: no such file`);
  const v = await validateFile(platesFile, 'plates');
  if (!v.ok) throw new CliError(`${platesFile} is not a valid plates.json: ${v.errors.map((e) => `${e.field} ${e.message}`).join('; ')}`);
  const doc = JSON.parse(readFileSync(platesFile, 'utf8'));
  const plate = doc.plates.find((p) => p.id === id);
  if (!plate) throw new CliError(`plate '${id}' is not in ${platesFile} (plates: ${doc.plates.map((p) => p.id).join(', ')})`);
  if (plate.kind !== 'live') throw new CliError(`plate '${id}' is kind '${plate.kind}' — only live plates are captured (render it with video-plates render-plate)`);
  return { doc, plate };
}

/** Everything that can fail before a browser opens (AC-REC-02). Returns the resolved take plan. */
export async function planTake(values) {
  requireNode();
  let plates = null;
  if (values.plate && !values.plates) throw usageError('--plate needs --plates <plates.json>');
  if (values.plates && !values.plate) throw usageError('--plates needs --plate <id>');
  // a plate keeps plates.json's size and fps and writes the picture-only MP4 that video-assemble reads
  if (values.plates && values.preset !== undefined) throw usageError(`--preset is for standalone takes: plate '${values.plate}' keeps plates.json's size and fps and writes a picture-only MP4 — drop --preset`);
  const sourceCount = [values.script, values.spine, values.plates].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw usageError(`pass exactly one of --script <script.md>, --spine <manifest.json>, or --plates <plates.json> --plate <id>${sourceCount ? ' (got more than one)' : ' — the beats come from it'}`);
  }
  let script = null, scriptFile = null;
  if (values.script) {
    scriptFile = path.resolve(values.script);
    if (!existsSync(scriptFile) || statSync(scriptFile).isDirectory()) throw new CliError(`--script ${scriptFile}: no such file — point it at the take's script.md`);
    script = parseScript(readFileSync(scriptFile, 'utf8'));
  }
  if (values.plates) plates = { file: path.resolve(values.plates), ...(await readPlate(path.resolve(values.plates), values.plate)) };
  const platesDir = plates && path.dirname(plates.file);

  const storyboard = values.storyboard ? path.resolve(values.storyboard) : plates && path.resolve(platesDir, plates.plate.live.storyboard);
  if (!storyboard) throw usageError('--storyboard <file.mjs> is required (or --plates/--plate naming a live plate)');
  if (!existsSync(storyboard) || statSync(storyboard).isDirectory()) throw new CliError(`storyboard not found: ${storyboard}`);

  const out = values.out ? path.resolve(values.out) : plates && path.join(platesDir, 'renders', 'plates', `${plates.plate.id}.mp4`);
  if (!out) throw usageError('--out <take.mp4> is required: the MP4 the take is written to');
  if (path.extname(out).toLowerCase() !== '.mp4') throw usageError(`--out must end in .mp4, got '${path.basename(out)}'`);
  const storageState = values['storage-state'] ? readStorageState(values['storage-state']) : null;

  // standalone takes record at the preset's viewport and fps unless --viewport/--fps say otherwise
  const preset = plates ? null : values.preset ?? DEFAULT_PRESET;
  const pc = preset && PRESETS[preset].capture;
  const viewport = parseViewport(values.viewport ?? plates?.plate.live.viewport ?? `${pc.width}x${pc.height}`);
  const fps = values.fps ?? plates?.doc.fps ?? pc.fps;
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw usageError(`--fps must be a whole number from 1 to 60, got ${fps}`);
  const size = plates ? { width: plates.doc.width, height: plates.doc.height } : viewport;

  let captionCss = DEFAULT_CAPTION_CSS;
  if (values['caption-css']) {
    const f = path.resolve(values['caption-css']);
    if (!existsSync(f)) throw new CliError(`--caption-css ${f}: no such file`);
    captionCss = readFileSync(f, 'utf8');
  }

  const spineFile = values.spine ? path.resolve(values.spine) : plates && path.resolve(platesDir, plates.doc.spine);
  const spine = spineFile ? await readSpine(spineFile) : null;
  const window = spine ? spineWindow(spine, plates?.plate) : null;
  if (spine && plates && plates.plate.startMs + plates.plate.durationMs > spine.totalMs) {
    throw new CliError(`plate '${plates.plate.id}' ends at ${plates.plate.startMs + plates.plate.durationMs} ms, past the spine's totalMs ${spine.totalMs}`);
  }
  const audioOffsetMs = values['audio-offset-ms'] ?? (spine ? spine.audioOffsetMs ?? 0 : -100);
  if (!Number.isInteger(audioOffsetMs)) throw usageError(`--audio-offset-ms must be a whole number of ms, got ${audioOffsetMs}`);
  if (plates && !spine.beats.some((b) => b.id === plates.plate.beat)) {
    throw new CliError(`plate '${plates.plate.id}' has beat '${plates.plate.beat}', which is not in the spine (beats: ${spine.beats.map((b) => b.id).join(', ')}) — fix the plate's beat or rerun spine`);
  }
  const beats = beatList({ script, spine, win: window, plate: plates?.plate, audioOffsetMs });
  const beatSource = script ? path.basename(scriptFile) : plates ? `plate '${plates.plate.id}'` : path.basename(spineFile);

  const maxMs = values['max-ms'];
  if (maxMs !== undefined && !(Number.isFinite(maxMs) && maxMs > 0)) throw usageError(`--max-ms must be a positive number of ms, got ${maxMs}`);
  // watchdog: a spine-timed take may not run more than 2 s past its window; any other take is capped at --max-ms (default 10 min)
  const watchdogMs = maxMs ?? (window ? window.durationMs + OVERRUN_GRACE_MS : DEFAULT_MAX_MS);

  const manifest = values.manifest ? path.resolve(values.manifest) : manifestPathFor(out);
  if (path.extname(manifest).toLowerCase() !== '.json') throw usageError(`--manifest must end in .json, got '${path.basename(manifest)}'`);

  // a narrated standalone take: every clip in the window needs its audio before a browser opens
  let sources = null;
  if (preset && window?.clips.length) {
    sources = new Map();
    for (const c of window.clips) {
      const src = clipSource(spineFile, spine, c);
      if (!src) throw new CliError(`no audio for spine clip ${c.n} (${c.file ?? 'no file'}): not in ${path.join(path.dirname(spineFile), 'clips')}, the TTS cache or the spine's audio — rerun spine for this manifest`);
      sources.set(c.n, src);
    }
  }

  // tools: ffmpeg, the pinned Playwright, the pinned Chrome (and, with --headed, Playwright's Chromium)
  requireFfmpeg();
  const pwEntry = requirePlaywright();
  const chrome = browserPath();
  if (!chrome || !existsSync(chrome)) throw new CliError(`Chromium not found${chrome ? ` at ${chrome}` : ''} — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)`, EXIT.MISSING_PREREQ);
  const headed = values.headed ? requireHeadedBrowser('--headed') : null;

  const sb = await loadStoryboard(storyboard);
  const page = values.url ? resolvePage(values.url, process.cwd())
    : plates?.plate.live.url ? resolvePage(plates.plate.live.url, platesDir)
      : sb.url ? resolvePage(sb.url, path.dirname(storyboard))
        : existsSync(path.join(path.dirname(storyboard), 'index.html')) ? resolvePage('index.html', path.dirname(storyboard))
          : resolvePage(null);

  const captions = !values['no-captions'];
  const mode = spine?.kind === 'narration' ? 'narrated' : captions ? 'captions' : 'silent';
  const captionEngineChoice = values['caption-engine'] ?? 'overlay';
  const cursor = !values['no-cursor'];
  return { values, plates, storyboard, sb, out, preset, viewport, size, fps, captions, captionCss, captionEngine: captionEngineChoice, cursor, scriptFile, spineFile, spine, window, beats, beatSource, audioOffsetMs, chrome, headed, storageState, pwEntry, page, mode, manifest, sources, watchdogMs };
}

/** The pinned Playwright's entry point, or a one-line MISSING_PREREQ error naming setup.sh. */
function requirePlaywright() {
  const pwRoot = depRoot('playwright');
  const pwEntry = resolveDep('playwright');
  if (!pwRoot || !pwEntry) throw new CliError(`Playwright not installed — run ${SETUP}`, EXIT.MISSING_PREREQ);
  const pwVersion = JSON.parse(readFileSync(path.join(pwRoot, 'package.json'), 'utf8')).version;
  if (pwVersion !== pins().playwright) throw new CliError(`Playwright ${pwVersion} found but ${pins().playwright} is pinned — run ${SETUP}`, EXIT.MISSING_PREREQ);
  return pwEntry;
}

/** Playwright's own Chromium (DEC-49), which `signin` and `--headed` launch; one line if it is missing. */
function requireHeadedBrowser(what) {
  const p = headedBrowserPath();
  if (!headedBrowserOk(p)) throw new CliError(`${what} needs Playwright's Chromium (the headed browser), not found${p ? ` at ${p}` : ''} — run ${SETUP}`, EXIT.MISSING_PREREQ);
  return p;
}

/**
 * --storage-state pre-flight: the file must exist and be a Playwright storage state (cookies[]).
 * Returns its absolute path; the contents are never copied anywhere (the manifest says signedIn).
 */
export function readStorageState(file) {
  const f = path.resolve(file);
  const hint = 'save a session first with: capture signin <url>';
  if (!existsSync(f) || statSync(f).isDirectory()) throw new CliError(`--storage-state ${f}: no such file — ${hint}`);
  let doc;
  try { doc = JSON.parse(readFileSync(f, 'utf8')); } catch (e) {
    throw new CliError(`--storage-state ${f}: not a readable session file (${String(e?.code ?? e?.message ?? e).split('\n')[0]}) — ${hint}`);
  }
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.cookies)) throw new CliError(`--storage-state ${f}: not a session file (no cookies[]) — ${hint}`);
  return f;
}

/** Narration loudness of the deliverable (D7). */
export const NARRATION_LUFS = -16;

/**
 * Where a spine clip's audio comes from, for the mux: the spine's exported clips/ folder, then the
 * TTS cache (and its legacy dirs), then a slice of the spine's narration WAV. Null if none exists.
 */
export function clipSource(spineFile, spine, clip, env = process.env) {
  const dir = path.dirname(spineFile);
  if (clip.file) {
    const exported = path.join(dir, 'clips', clip.file);
    if (existsSync(exported) && statSync(exported).size > 44) return { file: exported };
    const hit = cacheLookup(clip.file, defaultCacheDir(env), legacyCacheDirs(env));
    if (hit) return { file: hit.path };
  }
  if (spine.audio) {
    const wav = path.resolve(dir, spine.audio);
    if (existsSync(wav)) return { file: wav, startMs: clip.spineStartMs, durationMs: clip.durationMs };
  }
  return null;
}

const sec = (ms) => (ms / 1000).toFixed(6);

/**
 * The narration track for a take: each placed clip at its position (its spine time in the take
 * window), summed, padded to the take's length, then levelled to NARRATION_LUFS.
 * placed: [{source:{file,startMs?,durationMs?}, atMs}]. Returns the levelled WAV and its loudness.
 */
export function mixNarration(placed, { durationMs, dir }) {
  const out = path.join(dir, 'narration.wav');
  if (!placed.length) { silentStem(out, durationMs); return { file: out, lufs: -Infinity, clips: 0 }; }
  const raw = path.join(dir, 'narration-raw.wav');
  const args = ['-y'];
  const chains = [];
  placed.forEach((p, i) => {
    if (p.source.startMs !== undefined) args.push('-ss', sec(p.source.startMs), '-t', sec(p.source.durationMs));
    args.push('-i', p.source.file);
    const f = [`aresample=${RATE}`, `aformat=sample_fmts=fltp:sample_rates=${RATE}:channel_layouts=stereo`];
    if (p.atMs < 0) f.push(`atrim=start=${sec(-p.atMs)}`, 'asetpts=PTS-STARTPTS');
    else if (p.atMs > 0) f.push(`adelay=delays=${Math.round(p.atMs)}:all=1`);
    chains.push(`[${i}:a]${f.join(',')}[a${i}]`);
  });
  const ins = placed.map((_, i) => `[a${i}]`).join('');
  const mix = placed.length > 1 ? `${ins}amix=inputs=${placed.length}:normalize=0:duration=longest:dropout_transition=0,` : `${ins}`;
  const graph = `${chains.join(';')};${mix}apad=whole_dur=${sec(durationMs)},atrim=end=${sec(durationMs)}[mix]`;
  args.push('-filter_complex', graph, '-map', '[mix]', '-c:a', 'pcm_f32le', '-ar', String(RATE), '-ac', '2', raw);
  ffmpeg(args, { what: 'narration mix' });
  const lv = levelStem(raw, out, { durationMs, lufs: NARRATION_LUFS });
  return { file: out, lufs: Number.isFinite(lv.lufs) ? Number(lv.lufs.toFixed(1)) : -Infinity, truePeakDb: lv.truePeakDb, gainDb: lv.gainDb, clips: placed.length };
}

const PATH_FLAGS = new Set(['storyboard', 'script', 'out', 'caption-css', 'spine', 'plates', 'manifest', 'storage-state']);

/** argv that reproduces the take: paths made absolute, so it runs from any directory. */
export function commandFor(values, script = fileURLToPath(import.meta.url)) {
  const cmd = ['node', script];
  for (const [k, o] of Object.entries(spec.options)) {
    const v = values[k];
    if (v === undefined || v === false) continue;
    if (o.type === 'boolean') { cmd.push(`--${k}`); continue; }
    let s = String(v);
    if (PATH_FLAGS.has(k) || (k === 'url' && !isUrl(s))) s = path.resolve(s);
    cmd.push(`--${k}`, s);
  }
  return cmd;
}

/** Default take-manifest path: next to the deliverable, <name>.take.json. */
export const manifestPathFor = (file) => path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.take.json`);

/**
 * The take manifest (D11): a v1 spine manifest describing the take. Narrated takes (clips laid
 * from a spine) are kind "narration" with the laid clips; every other take is kind "beatgrid" with
 * "narrate": false and a nominal bpm. Both carry captions[] and one beats[] entry per beat called,
 * as it ran (startMs, durationMs on the take clock); clips keep beat = their beat id.
 */
export function takeManifest(plan, take, { command, manifestFile, placed = [] }) {
  const videoMs = Math.max(1, take.videoMs);
  const rel = (f) => (f ? path.relative(path.dirname(manifestFile), f) || path.basename(f) : undefined);
  const captions = take.captionTimings.map((c) => ({ n: c.n, text: c.text, startMs: Math.max(0, c.startMs), durationMs: Math.max(1, c.durationMs), 'x-beat': c.beat }));
  const narrated = placed.length > 0;
  const beats = take.beats.map((b) => {
    // a late beat moved the picture, not the voice: the beat's span still covers its clips (the schema needs it)
    const own = narrated ? placed.filter((p) => p.beat === b) : [];
    const from = Math.min(b.startMs, ...own.map((p) => Math.round(p.atMs)));
    const to = Math.max(b.startMs + b.durationMs, ...own.map((p) => Math.round(p.atMs) + p.spineClip.durationMs));
    const startMs = Math.min(videoMs - 1, Math.max(0, from));
    const beat = { id: b.id, startMs, durationMs: Math.max(1, Math.min(to - startMs, videoMs - startMs)), clipNs: own.map((p) => p.spineClip.n) };
    if (!narrated || b.text) beat.onScreenText = b.text || b.id; // a beatgrid beat needs one (DEC-23)
    return beat;
  });
  const doc = {
    schemaVersion: 1,
    kind: narrated ? 'narration' : 'beatgrid',
    targetMs: plan.window ? Math.max(1, plan.window.durationMs) : videoMs,
    totalMs: videoMs,
  };
  if (narrated) Object.assign(doc, { model: plan.spine.model, voice: plan.spine.voice, style: plan.spine.style ?? '' });
  Object.assign(doc, { audioOffsetMs: Math.round(plan.audioOffsetMs), command, narrate: narrated });
  if (!narrated) doc.bpm = plan.spine?.kind === 'beatgrid' && plan.spine.bpm ? plan.spine.bpm : 60;
  if (plan.spineFile) doc.spine = rel(plan.spineFile);
  doc.videoMs = videoMs;
  doc.wallMs = take.wallMs;
  doc.beats = beats;
  doc.clips = placed.map((p) => {
    const startMs = Math.min(videoMs - 1, Math.max(0, Math.round(p.atMs)));
    const c = p.spineClip;
    return {
      n: c.n, beat: c.beat, text: c.text, style: c.style ?? '', startMs,
      durationMs: Math.max(1, Math.min(c.durationMs, videoMs - startMs)), words: c.words, wpm: c.wpm, file: c.file,
      'x-spineStartMs': c.startMs, 'x-lateMs': p.beat.lateMs ?? 0,
    };
  });
  doc.captions = captions;
  doc['x-take'] = {
    mode: take.mode, storyboard: rel(take.storyboard), script: rel(take.script), url: take.url, plate: take.plate, fps: take.fps, width: take.width, height: take.height,
    frames: take.frames, out: rel(take.out), preset: take.preset, captionEngine: take.captionEngine, cursor: !!take.cursor,
    signedIn: !!take.signedIn, sizeBytes: take.sizeBytes,
    ...(take.audio && { audio: take.audio }),
    beats: take.beats.map((b) => ({ n: b.n, id: b.id, text: b.text, startMs: b.startMs, durationMs: b.durationMs, endMs: b.startMs + b.durationMs, lateMs: b.lateMs ?? 0, caption: b.caption,
      ...(b.plannedMs !== undefined && { plannedMs: b.plannedMs }), ...(b.clipNs?.length && { clipNs: b.clipNs }) })),
    // first line of each uncaught page error, at most MAX_MANIFEST_PAGE_ERRORS; the count is all of them
    pageErrors: (take.pageErrors ?? []).slice(0, MAX_MANIFEST_PAGE_ERRORS),
    pageErrorCount: (take.pageErrors ?? []).length,
    pointer: take.pointer,
  };
  return doc;
}

const log = (msg) => process.stderr.write(`capture: ${msg}\n`);

/** Page errors kept in the take manifest, and printed in the report (plan §4.8). */
export const MAX_MANIFEST_PAGE_ERRORS = 20;
export const MAX_REPORTED_PAGE_ERRORS = 5;

/** The first line of an uncaught page error, as "TypeError: message". */
export function errorLine(e) {
  const s = e instanceof Error || (e && typeof e.message === 'string') ? `${e.name || 'Error'}: ${e.message}` : String(e);
  return s.split('\n')[0].trim();
}

/** Seconds to about 3 significant digits: 0.00, 5.10, 13.9, 125. */
const secs = (ms) => { const v = ms / 1000; return v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0); };
const sizeText = (bytes) => (bytes >= 100_000 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);

/**
 * The after-take report (plan §4.8):
 *   wrote out/x.mp4 (3.8 MB, 1280x720 @ 30 fps, 19.6 s, preset web)
 *   beats: add 0.00–5.10 s · done 5.10–8.40 s
 *   page errors during take: 7          (only when there are any; the first 5, then "… and N more")
 */
export function report(take, cwd = process.cwd()) {
  const rel = path.relative(cwd, take.out);
  const shown = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : take.out;
  const kind = take.preset ? `preset ${take.preset}` : `plate ${take.plate}`;
  const lines = [`wrote ${shown} (${sizeText(take.sizeBytes ?? 0)}, ${take.width}x${take.height} @ ${take.fps} fps, ${(take.videoMs / 1000).toFixed(1)} s, ${kind})`];
  if (take.beats.length) lines.push(`beats: ${take.beats.map((b) => `${b.id} ${secs(b.startMs)}–${secs(b.startMs + b.durationMs)} s`).join(' · ')}`);
  const errs = take.pageErrors ?? [];
  if (errs.length) {
    lines.push(`page errors during take: ${errs.length}`);
    for (const e of errs.slice(0, MAX_REPORTED_PAGE_ERRORS)) lines.push(`  ${e}`);
    if (errs.length > MAX_REPORTED_PAGE_ERRORS) lines.push(`  … and ${errs.length - MAX_REPORTED_PAGE_ERRORS} more`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Encode the image sequence to `file` (an .mp4). With a preset: the deliverable, encoded to that
 * preset (PRESETS), with `audio` (a WAV) or a silent AAC track. Without one (a plate): the
 * picture-only plate MP4 that video-assemble reads (H.264 High, yuv420p, faststart).
 */
function encode(pattern, n, file, { fps, size, preset = null, audio = null }) {
  mkdirSync(path.dirname(file), { recursive: true });
  // screencast JPEGs are full range; convert to limited-range yuv420p (the delivery spec)
  const vf = [`scale=${size.width}:${size.height}:flags=lanczos:in_range=pc:out_range=tv`, 'setsar=1', 'format=yuv420p'];
  const args = ['-y', '-v', 'error', '-framerate', String(fps), '-start_number', '0', '-i', pattern];
  if (preset) {
    if (audio) args.push('-i', audio); else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    args.push('-map', '0:v:0', '-map', '1:a:0');
  }
  args.push('-frames:v', String(n), '-vf', vf.join(','), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(fps));
  if (preset) {
    const p = presetArgs(preset, fps);
    args.push(...p.video, ...p.audio, '-t', (n / fps).toFixed(6), ...p.mux);
  } else {
    args.push('-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart');
  }
  args.push(file);
  ffmpeg(args, { what: `encoding ${path.basename(file)}` });
}

/**
 * Caption drawing (DEC-06, DEC-36): --caption-engine overlay (default) uses screencast.showOverlay,
 * which renders into the captured frames only; if the Playwright build lacks it, or it fails, the
 * caption falls back to the page DOM. --caption-engine dom injects it into the page DOM from the
 * start. show(text) resolves to an idempotent remove().
 */
function captionEngine(page, css, choice = 'overlay') {
  const html = (text) => `<style>${css}</style><div class="pm-caption-wrap"><div class="pm-caption">${esc(text)}</div></div>`;
  const dom = {
    name: 'dom',
    async show(text) {
      const id = `pm-caption-${Math.random().toString(36).slice(2)}`;
      // one caption at a time: drawing replaces any caption already in the page, so a re-draw after
      // a navigation never doubles up
      const draw = () => page.evaluate(({ id, css, text }) => {
        if (!document.getElementById('pm-caption-style')) {
          const st = document.createElement('style'); st.id = 'pm-caption-style'; st.textContent = css; document.documentElement.appendChild(st);
        }
        document.querySelectorAll('.pm-caption-wrap[data-pm]').forEach((e) => e.remove());
        const wrap = document.createElement('div'); wrap.className = 'pm-caption-wrap'; wrap.id = id; wrap.dataset.pm = '1';
        const box = document.createElement('div'); box.className = 'pm-caption'; box.textContent = text;
        wrap.appendChild(box); document.documentElement.appendChild(wrap);
      }, { id, css, text });
      // a navigation in flight destroys the context: wait for the new document, then draw there
      try { await draw(); } catch { await page.waitForLoadState('domcontentloaded').catch(() => {}); await draw(); }
      let done = false;
      return () => { if (done) return Promise.resolve(); done = true; return page.evaluate((id) => document.getElementById(id)?.remove(), id).catch(() => {}); };
    },
  };
  const overlay = {
    name: 'overlay',
    async show(text) {
      // showOverlay(html, {duration}) resolves only when the overlay is removed, which would stall
      // the storyboard; show it open-ended and remove it on our own clock instead.
      const o = await page.screencast.showOverlay(html(text));
      let done = false;
      return () => { if (done) return Promise.resolve(); done = true; return Promise.resolve(o?.[Symbol.asyncDispose]?.() ?? o?.dispose?.()).catch(() => {}); };
    },
  };
  const noOverlay = typeof page.screencast?.showOverlay !== 'function';
  if (choice === 'overlay' && noOverlay) log('this Playwright has no screencast.showOverlay; drawing captions in the page instead');
  const engine = { name: choice === 'dom' || noOverlay ? 'dom' : 'overlay' };
  engine.show = async (text) => {
    if (engine.name === 'overlay') {
      try { return await overlay.show(text); } catch (e) {
        log(`showOverlay failed (${String(e?.message ?? e).split('\n')[0]}); drawing captions in the page instead`);
        engine.name = 'dom';
      }
    }
    return dom.show(text);
  };
  return engine;
}

/** Glide length of the cursor between two targets (~400 ms, eased). */
export const GLIDE_MS = 400;
const EASE = 'cubic-bezier(.4,0,.2,1)';
/** A classic arrow pointer: black with a white rim; its tip is at (2,2) of the box. */
const ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="30" viewBox="0 0 24 30" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">'
  + '<path d="M2 2 L2 24 L7.5 18.8 L11.4 27.4 L15.6 25.6 L11.8 17.2 L19.4 17.2 Z" fill="#000" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
// showOverlay strips inline <svg>, so the overlay cursor draws the same arrow as a data-URI background
const ARROW_BG = `width:24px;height:30px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));background:url("data:image/svg+xml,${encodeURIComponent(ARROW.replace(/ style="[^"]*"/, ''))}") no-repeat`;
const RING ='border:3px solid rgba(0,0,0,.55);border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.7)';

/**
 * The visible cursor (U3): one screencast.showOverlay per glide whose HTML carries a CSS keyframe
 * animation from the last position to the target. The overlay is in the captured frames only and
 * survives navigation, so nothing is re-injected. The previous overlay is disposed only after the
 * next one is up (they meet at the same point, so no duplicate shows). If showOverlay is missing or
 * throws, the cursor is drawn in the page DOM instead (re-created after a navigation).
 */
function cursorEngine(page, { enabled, start, sleep }) {
  let pos = { ...start }, shown = false, k = 0, current = null;
  let name = typeof page.screencast?.showOverlay === 'function' ? 'overlay' : 'dom';
  const dispose = (o) => Promise.resolve(o?.[Symbol.asyncDispose]?.() ?? o?.dispose?.()).catch(() => {});
  const box = (x, y) => `position:fixed;left:0;top:0;margin:-2px 0 0 -2px;pointer-events:none;z-index:2147483647;transform:translate(${x}px,${y}px)`;
  const overlayHtml = ({ from, to, ms, pulse }) => {
    const id = `pmc${++k}`;
    let css = `.${id}{${box(to.x, to.y)};${ARROW_BG}${ms ? `;animation:${id}g ${ms}ms ${EASE} both` : ''}}`;
    if (ms) css += `@keyframes ${id}g{from{transform:translate(${from.x}px,${from.y}px)}to{transform:translate(${to.x}px,${to.y}px)}}`;
    let html = `<div class="${id}"></div>`;
    if (pulse) {
      css += `.${id}r{position:fixed;left:${to.x - 20}px;top:${to.y - 20}px;width:40px;height:40px;box-sizing:border-box;pointer-events:none;z-index:2147483646;${RING};animation:${id}p 450ms ease-out both}`
        + `@keyframes ${id}p{from{transform:scale(.35);opacity:1}to{transform:scale(1.4);opacity:0}}`;
      html = `<div class="${id}r"></div>` + html;
    }
    return `<style>${css}</style>${html}`;
  };
  const domDraw = (args) => page.evaluate(({ arrow, ring, ease, from, to, ms, pulse }) => {
    let el = document.getElementById('pm-cursor');
    if (!el) {
      el = document.createElement('div'); el.id = 'pm-cursor'; el.innerHTML = arrow;
      el.style.cssText = `position:fixed;left:0;top:0;margin:-2px 0 0 -2px;pointer-events:none;z-index:2147483647;transform:translate(${from.x}px,${from.y}px)`;
      document.documentElement.appendChild(el); el.getBoundingClientRect();
    }
    el.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
    el.style.transform = `translate(${to.x}px,${to.y}px)`;
    if (pulse) {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${to.x - 20}px;top:${to.y - 20}px;width:40px;height:40px;box-sizing:border-box;pointer-events:none;z-index:2147483646;${ring}`;
      document.documentElement.appendChild(r);
      r.animate([{ transform: 'scale(.35)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 450, easing: 'ease-out', fill: 'forwards' }).finished.then(() => r.remove());
    }
  }, { arrow: ARROW, ring: RING, ease: EASE, ...args });
  const draw = async (args) => {
    if (name === 'overlay') {
      try {
        const o = await page.screencast.showOverlay(overlayHtml(args));
        const old = current; current = o; await dispose(old);
        return;
      } catch (e) {
        log(`showOverlay failed for the cursor (${String(e?.message ?? e).split('\n')[0]}); drawing it in the page instead`);
        name = 'dom';
      }
    }
    await domDraw(args);
  };
  return {
    get name() { return enabled ? name : null; },
    get pos() { return { ...pos }; },
    /** Glide to `to` (shows the cursor if it isn't yet); resolves when it has arrived. */
    async glide(to, ms = GLIDE_MS) {
      if (!enabled) return;
      const dist = Math.hypot(to.x - pos.x, to.y - pos.y);
      const dur = dist < 2 ? 0 : ms;
      await draw({ from: pos, to, ms: dur, pulse: false });
      pos = { x: to.x, y: to.y }; shown = true;
      if (dur) await sleep(dur);
    },
    /** Make sure the cursor is on screen where it is. */
    async show() { if (enabled && !shown) await this.glide(pos, 0); },
    /** A click pulse at the cursor. */
    async pulse() { if (enabled) { await draw({ from: pos, to: pos, ms: 0, pulse: true }); shown = true; } },
    /** After a navigation: the DOM cursor is gone with the old document; draw it again. */
    async restore() { if (enabled && shown && name === 'dom') await domDraw({ from: pos, to: pos, ms: 0, pulse: false }).catch(() => {}); },
  };
}

/**
 * In-page scrolling for scrollTo/scrollBy, run with locator.evaluate(SCROLL, args). Scrolls are
 * animated with requestAnimationFrame (eased over `ms`), so they read as motion, not a jump.
 *   op 'measure': the nearest scrolling ancestor of el (none = the page), its centre, and the
 *                 dx/dy that centre el in it (0 when el is already fully in view)
 *   op 'to':      scroll that ancestor (or the page) by dx/dy      op 'by': scroll el itself
 *   op 'window':  scroll the page
 */
const SCROLL = async (el, { op, dx = 0, dy = 0, ms = 0 }) => {
  const root = document.scrollingElement ?? document.documentElement;
  const scrollerOf = (e) => {
    for (let s = e.parentElement; s && s !== document.body && s !== document.documentElement; s = s.parentElement) {
      const cs = getComputedStyle(s);
      if (/(auto|scroll|overlay)/.test(cs.overflowY + cs.overflowX) && (s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth)) return s;
    }
    return null;
  };
  if (op === 'measure') {
    const sc = scrollerOf(el);
    const r = el.getBoundingClientRect();
    const v = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const inView = r.top >= v.top && r.bottom <= v.top + v.height && r.left >= v.left && r.right <= v.left + v.width;
    return {
      scroller: !!sc, cx: Math.round(v.left + v.width / 2), cy: Math.round(v.top + v.height / 2),
      dx: inView ? 0 : Math.round(r.left + r.width / 2 - (v.left + v.width / 2)), dy: inView ? 0 : Math.round(r.top + r.height / 2 - (v.top + v.height / 2)),
    };
  }
  const sc = op === 'by' ? el : op === 'to' ? scrollerOf(el) ?? root : root;
  const x0 = sc.scrollLeft, y0 = sc.scrollTop;
  if (!ms) { sc.scrollTo(x0 + dx, y0 + dy); return null; }
  await new Promise((done) => {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      sc.scrollTo(x0 + dx * e, y0 + dy * e);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  return null;
};

/**
 * Warm-up before t0 (WP7a nit): round trips through evaluate + two animation frames and, with
 * captions or the cursor on, an overlay shown and removed, so the first beat() pays no cold-start
 * cost (the first showOverlay call alone measured ~100 ms). Runs before the screencast starts:
 * nothing of it is captured.
 */
async function warmUp(page, engine, captions, cursor) {
  if (process.env.PEAK_MEDIA_CAPTURE_WARMUP === '0') return;
  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    if (captions && i < 2) { const remove = await engine.show('warm-up'); await remove(); }
    else if (cursor && i < 2 && typeof page.screencast?.showOverlay === 'function') {
      const o = await page.screencast.showOverlay('<div></div>').catch(() => null);
      await Promise.resolve(o?.[Symbol.asyncDispose]?.() ?? o?.dispose?.()).catch(() => {});
    }
  }
}

let aborted = false; // set when the watchdog aborts a take; the entry point then makes sure the process exits

/** Run one take. Returns the take summary. */
export async function capture(plan) {
  const { fps, viewport, size, window: win, captions, captionCss, mode, audioOffsetMs } = plan;
  const pw = await import(pathToFileURL(plan.pwEntry).href);
  const chromium = (pw.default ?? pw).chromium;
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pm-capture-'));
  let server = null, browser = null;
  try {
    if (plan.page.kind === 'local') server = await serveDir(plan.page.root);
    const url = plan.page.kind === 'local' ? server.url + encodeURIComponent(plan.page.file) : plan.page.url;
    log(`launching ${plan.headed ? 'headed ' : ''}browser (${viewport.width}x${viewport.height}, ${fps} fps, mode ${mode}${plan.storageState ? ', signed in' : ''})`);
    // --headed (DEC-49, U5): Playwright's own Chromium in a visible window; same screencast, same grid
    browser = await chromium.launch({ executablePath: plan.headed ?? plan.chrome, headless: !plan.headed });
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(plan.storageState && { storageState: plan.storageState }) });
    const page = await context.newPage();
    // uncaught page errors (plan §4.8): from the first load to the end of the take
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(errorLine(e)));
    if (typeof page.screencast?.start !== 'function') {
      throw new CliError(`the installed Playwright has no page.screencast.start — capture needs Playwright ${pins().playwright} (run ${SETUP})`, EXIT.MISSING_PREREQ);
    }
    if (plan.values['debug-requests']) {
      page.on('request', (r) => log(`request ${r.method()} ${r.url()}`));
      page.on('requestfailed', (r) => log(`request failed ${r.url()} — ${r.failure()?.errorText ?? 'unknown'}`));
      page.on('response', (r) => { if (r.status() >= 400) log(`response ${r.status()} ${r.url()}`); });
    }
    let res;
    try {
      res = await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    } catch (e) {
      throw new CliError(`could not load ${url}: ${String(e?.message ?? e).split('\n')[0]}`);
    }
    if (res && res.status() >= 400) throw new CliError(`${url} answered HTTP ${res.status()} — check the URL (live pages move); nothing was captured`);
    // live sites keep laying out after 'load' (lazy diagrams, fonts); let them settle, briefly
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    const engine = captionEngine(page, captionCss, plan.captionEngine);
    await warmUp(page, engine, captions, plan.cursor);

    // ---- the clock: t0 = timestamp of the first onFrame (DEC-06) ----
    const grid = new FrameGrid(tmp, fps);
    const wallStart = Date.now();
    await page.screencast.start({ fps, size: viewport, quality: 90, onFrame: (f) => grid.onFrame(f) });
    let firstFrameTimer;
    const t0 = await Promise.race([grid.ready, new Promise((_, rej) => { firstFrameTimer = setTimeout(() => rej(new CliError('no screencast frame within 10 s of start — the page may not be rendering')), 10_000); })])
      .finally(() => clearTimeout(firstFrameTimer)); // don't keep the process alive after the first frame
    const now = () => performance.timeOrigin + performance.now() - t0; // ms since t0, same clock as frame timestamps
    // timers wake ~5 ms early, then yield with setImmediate to the exact ms (timer slack would make a beat late)
    const sleepUntil = async (ms) => {
      for (let d = ms - now(); d > 0; d = ms - now()) {
        await new Promise((r) => (d > 6 ? setTimeout(r, Math.min(d - 5, 1000)) : setImmediate(r)));
      }
    };
    const timers = new Set();
    const wait = (ms) => new Promise((r) => { const t = setTimeout(() => { timers.delete(t); r(); }, Math.max(0, Number(ms) || 0)); timers.add(t); });

    const captionTimings = []; // {n, beat, text, startMs, durationMs} as shown (the manifest's captions[])
    let current = null; // the caption on screen: {cap, remove}
    // Caption work runs on its own queue, so beat() starts its fn on the clock and the storyboard's
    // next action is never held up by overlay round trips (they measured up to ~200 ms).
    let captionQueue = Promise.resolve();
    const hideCurrent = async (atMs = now()) => {
      const c = current;
      if (!c) return;
      current = null;
      c.cap.durationMs = Math.max(1, Math.round(atMs - c.cap.startMs));
      await c.remove();
    };
    /** Show a beat's caption; it stays up until hideCaption() at the beat's end. */
    const showCaption = (n, beatId, text) => {
      if (!captions || !text) return false;
      captionQueue = captionQueue.then(async () => {
        await hideCurrent();
        const shownAt = now();
        const remove = await engine.show(text);
        const cap = { n, beat: beatId, text, startMs: Math.round(shownAt), durationMs: 1 };
        captionTimings.push(cap);
        current = { cap, remove };
      }).catch((e) => log(`caption ${n} not drawn: ${String(e?.message ?? e).split('\n')[0]}`));
      return true;
    };
    const hideCaption = (atMs) => { captionQueue = captionQueue.then(() => hideCurrent(atMs)).catch(() => {}); };

    // ---- beat(id, fn?) (DEC-46): each beat of the script once, in order, never nested ----
    const beats = plan.beats;
    const ids = beats.map((b) => b.id);
    const src = plan.beatSource;
    const records = []; // as run: {n, id, text, startMs, durationMs, plannedMs?, lateMs?, caption, clipNs?}
    const st = { next: 0, called: new Set(), active: null, pending: null };
    const beat = (id, fn) => {
      const run = (async () => {
        if (typeof id !== 'string') throw new CliError(`beat() needs a beat id as its first argument — valid: ${ids.join(', ')}`);
        const idx = ids.indexOf(id);
        if (idx < 0) throw new CliError(`beat '${id}' is not in ${src} — valid: ${ids.join(', ')}`);
        if (st.active) throw new CliError(`beat '${id}' was called inside beat '${st.active}' — beats can't nest: await beat('${st.active}', …) to the end, then call beat('${id}')`);
        if (st.called.has(id)) throw new CliError(`beat '${id}' was called twice — each beat runs once: give the second part its own beat in ${src}, or move it into beat('${id}', fn)`);
        if (idx !== st.next) throw new CliError(`beat '${id}' was called before '${ids[st.next]}' — call the beats in ${src} order: ${ids.join(', ')}`);
        if (fn !== undefined && typeof fn !== 'function') throw new CliError(`beat('${id}', fn): fn must be a function, or left out`);
        st.called.add(id); st.next = idx + 1; st.active = id;
        const b = beats[idx];
        const rec = { n: idx + 1, id, text: b.caption };
        let endAt;
        try {
          if (b.timed) {
            await sleepUntil(b.plannedMs); // the clip's planned start on the take clock (clip start − audio offset)
            const startMs = now();
            Object.assign(rec, { startMs, plannedMs: Math.round(b.plannedMs), lateMs: Math.max(0, Math.round(startMs - b.plannedMs)), clipNs: b.clips.map((c) => c.n) });
            endAt = b.endMs; // a late start moves the picture, not the voice
          } else {
            rec.startMs = now();
            endAt = rec.startMs + b.holdMs; // reading time; a longer fn lengthens the beat
          }
          records.push(rec);
          rec.caption = showCaption(rec.n, id, b.caption);
          if (fn) await fn();
          await sleepUntil(endAt);
        } finally {
          const end = now();
          if (rec.startMs !== undefined) {
            // round both ends, not the length: the next beat starts at or after round(end), so the
            // manifest's beats never overlap by a rounding millisecond (the v1 schema rejects that)
            const s = Math.round(rec.startMs);
            rec.durationMs = Math.max(1, Math.round(end) - s);
            rec.startMs = s;
            hideCaption(end);
          }
          if (st.active === id) st.active = null;
        }
      })();
      run.catch(() => {}); // a beat the storyboard forgot to await rejects through st.pending instead
      st.pending = run;
      return run;
    };

    // ---- pointer helpers: the cursor glides to the target first (U3; --no-cursor turns it off) ----
    const cursor = cursorEngine(page, { enabled: plan.cursor, start: { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2) }, sleep: wait });
    const pointer = []; // {action, beat, x, y, atMs}: where the cursor was when each helper acted
    const locate = (target) => {
      if (typeof target === 'string') return page.locator(target).first();
      if (target && typeof target.boundingBox === 'function') return target;
      throw new CliError(`a pointer helper got ${target === null ? 'null' : typeof target} as its target — pass a selector string or a Playwright locator`);
    };
    const centreOf = async (loc) => {
      await loc.scrollIntoViewIfNeeded({ timeout: 10_000 });
      const box = await loc.boundingBox({ timeout: 10_000 });
      if (!box) throw new CliError(`target ${loc} is not visible — it has no box to point at`);
      return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    };
    const note = (action, p) => pointer.push({ action, beat: st.active, x: p.x, y: p.y, atMs: Math.round(now()) });
    const helpers = {
      async goto(url, { settle = 900 } = {}) {
        const to = new URL(String(url), page.url()).href;
        let r;
        try { r = await page.goto(to, { waitUntil: 'load', timeout: 45_000 }); } catch (e) { throw new CliError(`goto ${url}: ${String(e?.message ?? e).split('\n')[0]}`); }
        if (r && r.status() >= 400) throw new CliError(`goto ${url}: ${to} answered HTTP ${r.status()} — check the URL`);
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
        // overlays survive navigation; the DOM fallbacks went with the old document
        await cursor.restore();
        if (engine.name === 'dom') captionQueue = captionQueue.then(async () => { if (current) current.remove = await engine.show(current.cap.text); }).catch(() => {});
        await wait(settle);
      },
      async click(target, { settle = 420, ...opts } = {}) {
        const loc = locate(target);
        const p = await centreOf(loc);
        await cursor.glide(p);
        note('click', p);
        await cursor.pulse();
        await loc.click(opts);
        await wait(settle);
      },
      async type(target, text, { delay = 45, enter = false } = {}) {
        const loc = locate(target);
        const p = await centreOf(loc);
        await cursor.glide(p);
        note('type', p);
        await cursor.pulse();
        await loc.click();
        await loc.pressSequentially(String(text), { delay });
        if (enter) await loc.press('Enter');
      },
      async point(target) {
        const p = await centreOf(locate(target));
        await cursor.glide(p);
        note('point', p);
      },
      async scrollTo(target, { ms = 600 } = {}) {
        const loc = locate(target);
        const m = await loc.evaluate(SCROLL, { op: 'measure' });
        if (m.scroller) await cursor.glide({ x: m.cx, y: m.cy }); else await cursor.show();
        note('scrollTo', cursor.pos);
        if (m.dx || m.dy) await loc.evaluate(SCROLL, { op: 'to', dx: m.dx, dy: m.dy, ms: Math.max(0, Number(ms) || 0) });
      },
      async scrollBy(container, { x = 0, y = 0, ms = 600 } = {}) {
        const args = { dx: Number(x) || 0, dy: Number(y) || 0, ms: Math.max(0, Number(ms) || 0) };
        if (container === null || container === undefined) {
          await cursor.show();
          note('scrollBy', cursor.pos);
          await page.locator('html').evaluate(SCROLL, { op: 'window', ...args });
          return;
        }
        const loc = locate(container);
        const p = await centreOf(loc);
        await cursor.glide(p);
        note('scrollBy', p);
        await loc.evaluate(SCROLL, { op: 'by', ...args });
      },
    };
    const api = { beat, ...helpers, wait, page, context, mode, fps, viewport, elapsedMs: () => now() };

    // watchdog (WP7a nit): a spine-timed take may run at most OVERRUN_GRACE_MS past its window;
    // any take stops at --max-ms. Either way a hung storyboard step can't stall the take forever.
    let watchdogTimer;
    const watchdog = new Promise((_, rej) => {
      watchdogTimer = setTimeout(() => {
        aborted = true;
        rej(new CliError(win && plan.values['max-ms'] === undefined
          ? `storyboard still running ${Math.round(now())} ms in, more than ${OVERRUN_GRACE_MS} ms past the ${plan.plates ? `plate's planned ${win.durationMs} ms` : `spine's ${win.durationMs} ms`} — aborted (a step may be hanging, or its waits are too long)`
          : `take aborted at --max-ms ${plan.watchdogMs} ms — the storyboard may be hanging (e.g. a selector wait with no timeout); raise --max-ms for a longer take`));
      }, Math.max(0, plan.watchdogMs - now()));
    });

    log(`t0 anchored on the first frame; running ${path.basename(plan.storyboard)}`);
    try {
      await Promise.race([
        (async () => {
          try {
            await plan.sb.fn(api);
            await st.pending; // a beat the storyboard didn't await still runs to its end
          } catch (e) {
            if (e instanceof CliError) throw e;
            const at = String(e?.stack ?? '').split('\n').find((l) => l.includes(plan.storyboard))?.trim().replace(/^at\s+/, '') ?? '';
            throw new CliError(`storyboard failed: ${String(e?.message ?? e).split('\n')[0]}${at ? ` (${at})` : ''}`);
          }
          const missing = ids.filter((id) => !st.called.has(id));
          if (missing.length) {
            throw new CliError(`beat${missing.length > 1 ? 's' : ''} ${missing.map((id) => `'${id}'`).join(', ')} never called — the storyboard returned without ${missing.length > 1 ? 'them' : 'it'}; add await beat('${missing[0]}', …) in ${src} order, or remove the beat from ${src}`);
          }
        })(),
        watchdog,
      ]);
    } finally {
      clearTimeout(watchdogTimer);
      if (aborted) { for (const t of timers) clearTimeout(t); timers.clear(); }
    }
    const ranMs = now();
    let endMs = ranMs;
    if (win) {
      const tol = 1000 / fps;
      if (ranMs > win.durationMs + tol) {
        throw new CliError(`storyboard ran ${Math.round(ranMs)} ms, past the ${plan.plates ? `plate's planned ${win.durationMs} ms` : `spine's ${win.durationMs} ms`} — shorten its waits or lengthen the beat`);
      }
      await sleepUntil(win.durationMs + tol); // hold the last picture to the end of the window
      endMs = win.durationMs;
    }
    await captionQueue; // caption work still queued settles before the screencast stops
    if (current) { // a caption still showing ends with the take
      const c = current; current = null;
      c.cap.durationMs = Math.max(1, Math.round(endMs - c.cap.startMs));
    }
    for (const t of timers) clearTimeout(t);
    await page.screencast.stop();
    const wallMs = Date.now() - wallStart;
    await browser.close(); browser = null;

    const frames = framesFor(endMs, fps);
    const videoMs = (frames * 1000) / fps;
    const { pattern, unique } = grid.finish(frames);
    const opts = { fps, size };
    // narration (D7): each spine clip of a beat that ran, at its spine time in the take window —
    // where the assembled video puts it. The beat waited for the clip's start minus the audio
    // offset; a late beat moves the picture, not the voice, so the take sounds exactly like the
    // assembled video will.
    const placed = records.flatMap((r) => beats[r.n - 1].clips?.map((c) => ({
      beat: r, spineClip: plan.spine.clips.find((x) => x.n === c.n), source: plan.sources?.get(c.n), atMs: c.atMs,
    })) ?? []);
    let audio = null;
    if (plan.preset) {
      audio = mixNarration(placed.filter((p) => p.source), { durationMs: videoMs, dir: tmp });
      encode(pattern, frames, plan.out, { ...opts, preset: plan.preset, audio: audio.file });
      log(audio.clips ? `narration: ${audio.clips} clip(s) laid at their spine times, ${audio.lufs} LUFS` : 'audio: silent AAC track (no narration in this take)');
    } else {
      encode(pattern, frames, plan.out, opts); // a plate: picture only
    }
    const sizeBytes = statSync(plan.out).size;
    const late = records.filter((r) => r.lateMs > 1000 / fps); // later than one frame
    if (late.length) log(`${late.length} beat(s) started after their planned time: ${late.map((r) => `'${r.id}' +${r.lateMs} ms`).join(', ')}`);
    const take = {
      mode, out: plan.out, preset: plan.preset, manifest: plan.manifest, storyboard: plan.storyboard, script: plan.scriptFile ?? null, url,
      plate: plan.plates?.plate.id ?? null, spine: plan.spineFile ?? null,
      window: win ? { startMs: win.startMs, durationMs: win.durationMs, clips: win.clips.length } : null,
      fps, width: size.width, height: size.height, frames, uniqueFrames: unique,
      videoMs: Math.round(videoMs), wallMs, ranMs: Math.round(ranMs), audioOffsetMs, captions, captionEngine: captions ? engine.name : null,
      cursor: plan.cursor, cursorEngine: cursor.name,
      captionTimings, beats: records, pointer,
      audio: audio && { clips: audio.clips, lufs: Number.isFinite(audio.lufs) ? audio.lufs : null },
      headed: !!plan.headed, signedIn: !!plan.storageState, sizeBytes, pageErrors: [...pageErrors],
    };
    const doc = takeManifest(plan, take, { command: commandFor(plan.values), manifestFile: plan.manifest, placed });
    mkdirSync(path.dirname(plan.manifest), { recursive: true });
    writeFileSync(plan.manifest, JSON.stringify(doc, null, 2) + '\n');
    return take;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

export const spec = {
  name: 'capture',
  summary: 'play a live page in real time, drive it with a storyboard, and screen-capture it',
  usage: 'capture --storyboard <file.mjs> (--script script.md | --spine manifest.json) --out <take.mp4> [--preset web|youtube|hifi] [options]   |   capture --plates plates.json --plate <id>   |   capture signin <url> (see capture signin --help)',
  description: `
The storyboard runs one beat(id, fn?) per beat, in order. The beats come from exactly one of
--script (script.md: "## <id>" sections), --spine (a spine manifest's beats) or --plates/--plate
(the plate's beat). beat() shows the beat's caption (its On screen: line, else its first sentence;
a spine's onScreenText), runs fn under it, and ends when both fn and the beat's time have ended:
with --script the reading time (about 3 words/s, at least 1.5 s; a longer fn lengthens the beat),
with a spine the beat's clip, played at its spine time (no TTS here; beat() waits for the clip's
start), and the take lasts exactly the plate's (or the spine's) planned duration. An unknown,
out-of-order, repeated, nested or uncalled beat stops the take. Modes: captions (default),
silent (--no-captions), narrated (a narration spine). The pointer helpers goto, click, type, point,
scrollTo and scrollBy glide a visible cursor (--no-cursor hides it) to their target.
The page is --url, else the plate's live.url, else the storyboard's exported \`url\`, else an
index.html next to the storyboard; local files are served on 127.0.0.1. Pre-flight (Chromium,
ffmpeg, the pinned Playwright, a valid --script/--spine, the spine clips' audio) runs before any
browser opens. Captions are a neutral bottom-centre bar; --caption-css restyles them.
--out is the MP4 deliverable with audio, encoded to --preset (default web): a narrated take gets
the spine's clips at their spine times (a late beat moves the picture, not the voice), levelled
to -16 LUFS; other takes get a silent AAC track. Every preset is H.264 High, yuv420p, faststart,
with AAC-LC 48 kHz stereo audio:
${Object.keys(PRESETS).map((k) => `  ${k.padEnd(8)} ${presetSummary(k)}`).join('\n')}
--viewport and --fps override the preset's capture size and fps; the encode stays the preset's.
With --plates/--plate the take is the picture-only plate MP4 video-assemble reads, at plates.json's
size and fps; --preset is refused there. Every take writes a take manifest (v1 spine schema).
Signed-in takes: run \`capture signin <url>\` once (you sign in by hand in a visible browser; the
session is saved to <data dir>/auth/<host>.json, mode 0600, when you close the tab), then pass
--storage-state <that file>. A missing session file stops the take before a browser opens; the
take manifest records signedIn: true, never the file's contents. --headed records in a visible
window of Playwright's Chromium (installed by setup.sh); the frames are the same.
After every take capture prints the file (bytes, size in px, fps, length, preset or plate), each
beat's span, and the page's uncaught errors (the first ${MAX_REPORTED_PAGE_ERRORS}; the manifest keeps ${MAX_MANIFEST_PAGE_ERRORS}).
A watchdog aborts a spine-timed take 2 s past its window, and any take at --max-ms. Check a take
with check-take.mjs. Storyboard API: references/storyboard-api.md.`,
  options: {
    storyboard: { type: 'string', arg: 'file.mjs', desc: `Storyboard module: export default async (${STORYBOARD_CONTEXT}) => { … }` },
    script: { type: 'string', arg: 'script.md', desc: 'The beats: one "## <id>" section per beat (captions or silent mode; video-spine\'s script format)' },
    out: { type: 'string', arg: 'file.mp4', desc: 'The take: the MP4 deliverable with audio, encoded to --preset; with --plate the picture-only plate MP4 (default there: <project>/renders/plates/<id>.mp4)' },
    preset: { type: 'string', arg: 'web|youtube|hifi', choices: Object.keys(PRESETS), desc: `Capture size, fps and encode of a standalone take (default: ${DEFAULT_PRESET}; see above). Not with --plates` },
    viewport: { type: 'string', arg: 'WxH', desc: 'Browser viewport (default: the plate\'s live.viewport, else the preset\'s size)' },
    'no-captions': { type: 'boolean', desc: 'Draw no captions (silent mode with --script; a voice-only video with a narration spine)' },
    'no-cursor': { type: 'boolean', desc: 'Draw no cursor: the pointer helpers act without it' },
    'caption-css': { type: 'string', arg: 'file.css', desc: 'Caption style sheet (classes .pm-caption-wrap, .pm-caption) replacing the neutral default' },
    'caption-engine': { type: 'string', arg: 'overlay|dom', choices: ['overlay', 'dom'], desc: 'How captions are drawn: overlay = screencast.showOverlay, in the captured frames only (default); dom = injected into the page (visible to page scripts; no overlay frame delays)' },
    url: { type: 'string', arg: 'url|file', desc: 'Page to load: http(s) URL or local .html file/folder (overrides the plate and storyboard)' },
    'debug-requests': { type: 'boolean', desc: 'Log every page request, failure and HTTP error to stderr' },
    'audio-offset-ms': { type: 'number', arg: 'ms', desc: 'Audio placement offset. Spine-timed: a beat starts at its clip start minus this (default: the spine\'s audioOffsetMs); otherwise only recorded in the take manifest (default: -100)' },
    spine: { type: 'string', arg: 'manifest.json', desc: 'The beats from a spine manifest: each beat plays to its clip (narration) or its beat time (beatgrid)' },
    plates: { type: 'string', arg: 'plates.json', desc: 'Project plate list; with --plate, supplies storyboard, url, viewport, fps, size, spine and the planned window' },
    plate: { type: 'string', arg: 'id', desc: 'The live plate to capture (needs --plates)' },
    fps: { type: 'number', desc: 'Capture frame rate, 1-60 (default: plates.json fps, else the preset\'s)' },
    manifest: { type: 'string', arg: 'file.json', desc: 'Where to write the take manifest (default: <take>.take.json next to --out)' },
    'max-ms': { type: 'number', arg: 'ms', desc: `Abort a take that runs longer than this (default: the spine window + ${OVERRUN_GRACE_MS} ms, else ${DEFAULT_MAX_MS})` },
    'storage-state': { type: 'string', arg: 'file.json', desc: 'Start the take signed in: a session saved by `capture signin` (default place: <data dir>/auth/<host>.json)' },
    headed: { type: 'boolean', desc: 'Record in a visible window of Playwright\'s Chromium (setup.sh installs it); same frames as headless' },
    json: { type: 'boolean', desc: 'Print the take summary as JSON' },
  },
  examples: [
    'capture --storyboard examples/ui-demo/storyboard.mjs --script examples/ui-demo/script.md --out /tmp/ui-demo.mp4',
    'capture --storyboard examples/ui-demo/storyboard.mjs --script examples/ui-demo/script.md --out /tmp/ui-demo.mp4 --preset youtube',
    'capture --storyboard examples/deck/storyboard.mjs --script examples/deck/script.md --out /tmp/deck.mp4 --no-captions',
    'capture --storyboard examples/deck/storyboard.mjs --spine spine/manifest.json --out /tmp/deck.mp4',
    'capture --plates plates.json --plate r1-feature',
    'capture signin https://app.example.test',
    'capture --storyboard storyboard.mjs --script script.md --out out/tour.mp4 --storage-state ~/.cache/peak-media/auth/app.example.test.json',
  ],
};

// ---- capture signin <url> (DEC-47, DEC-49, U4) ----

/** The default timeout of `capture signin`. */
export const SIGNIN_TIMEOUT = '300s';

/** "300s" | "5m" | "1500ms" | "300" (seconds) -> ms; a usage error otherwise. */
export function parseDuration(v, flag = '--timeout') {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(String(v ?? '').trim());
  if (!m || Number(m[1]) <= 0) throw usageError(`${flag} expects a duration like 300s, 5m or 1500ms, got '${v}'`);
  return Math.round(Number(m[1]) * ({ ms: 1, s: 1000, m: 60_000 })[m[2] ?? 's']);
}

/** Where sessions live by default: <data dir>/auth (created 0700). */
export const authDir = () => path.join(dataDir(), 'auth');

/** The git work tree containing `p` (walking up from it), or null. */
function gitWorkTree(p) {
  for (let d = path.resolve(p); ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/**
 * Where `capture signin` saves the session. Default: <data dir>/auth/<host>.json. A --save path
 * inside <cwd>/web2video/ or inside any git work tree is refused: a session is a credential.
 */
export function signinTarget(url, save, cwd = process.cwd()) {
  let u;
  try { u = new URL(String(url)); } catch { u = null; }
  if (!u || !/^https?:$/.test(u.protocol)) throw usageError(`signin needs the http(s) URL of the sign-in page, got '${url}'`);
  const def = path.join(authDir(), `${u.hostname}.json`);
  if (!save) return { url: u.href, host: u.hostname, file: def, isDefault: true };
  const file = path.resolve(cwd, save);
  if (path.extname(file).toLowerCase() !== '.json') throw usageError(`--save must end in .json, got '${path.basename(file)}'`);
  const project = path.resolve(cwd, 'web2video');
  const rel = path.relative(project, file);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) throw usageError(`--save ${file} is inside ${project} — a session is a credential and never goes in a project; leave out --save to use ${def}`);
  const tree = gitWorkTree(path.dirname(file));
  if (tree) throw usageError(`--save ${file} is inside the git work tree ${tree} — a session is a credential and is never committed; leave out --save to use ${def}`);
  return { url: u.href, host: u.hostname, file, isDefault: false };
}

/** Write the session file: its folder 0700 (the default auth folder is forced to 0700), the file 0600. */
export function writeSession(target, state) {
  const dir = path.dirname(target.file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (target.isDefault) chmodSync(dir, 0o700);
  if (existsSync(target.file)) chmodSync(target.file, 0o600);
  writeFileSync(target.file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  chmodSync(target.file, 0o600);
}

/**
 * Open Playwright's Chromium headed at the URL; the user signs in by hand and closes the tab.
 * When the last page closes (U4: the context stays up), save context.storageState(). Exits
 * non-zero with nothing saved on --timeout, or if the browser quits first.
 */
export async function signin(url, values) {
  requireNode();
  const target = signinTarget(url, values.save);
  const ms = parseDuration(values.timeout ?? SIGNIN_TIMEOUT);
  const pw = await import(pathToFileURL(requirePlaywright()).href);
  const exe = requireHeadedBrowser('capture signin');
  const chromium = (pw.default ?? pw).chromium;
  const browser = await chromium.launch({ executablePath: exe, headless: false });
  let timer;
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    const lastTabClosed = new Promise((resolve, reject) => {
      const check = () => { if (context.pages().length === 0) resolve(); };
      const watch = (p) => p.on('close', () => setImmediate(check));
      watch(page);
      context.on('page', watch);
      browser.on('disconnected', () => reject(new CliError('the browser quit before the tab was closed — nothing saved; run capture signin again and close the tab (not the whole browser) once signed in')));
      timer = setTimeout(() => reject(new CliError(`not done within ${values.timeout ?? SIGNIN_TIMEOUT} — nothing saved; run capture signin again (raise --timeout if you need longer)`)), ms);
    });
    lastTabClosed.catch(() => {});
    try {
      await page.goto(target.url, { timeout: 45_000 });
    } catch (e) {
      if (!page.isClosed()) throw new CliError(`could not load ${target.url}: ${String(e?.message ?? e).split('\n')[0]}`);
    }
    log(`sign in to ${target.host} in the browser window, then close the tab — the session is saved when the last tab closes`);
    await lastTabClosed;
    const state = await context.storageState();
    writeSession(target, state);
    process.stdout.write(`saved the session to ${target.file} (mode 0600) — record signed in with --storage-state ${target.file}\n`);
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => {});
  }
}

export const signinSpec = {
  name: 'capture signin',
  summary: 'sign in by hand in a visible browser and save the session for capture --storage-state',
  usage: 'capture signin <url> [--save <file.json>] [--timeout 300s]',
  description: `
Opens <url> in a visible window of Playwright's Chromium (setup.sh installs it). Sign in by hand,
then close the tab: the session (cookies and local storage) is saved when the last tab closes, and
the command exits. Nothing is recorded. The default file is <data dir>/auth/<host>.json
(<data dir> = $CLAUDE_PLUGIN_DATA, else ~/.cache/peak-media); its folder is 0700, the file 0600.
The session is a credential: --save refuses a path inside ./web2video/ or inside any git work tree.
Only the saved path is printed, never the contents. If --timeout passes first, nothing is saved
and the exit is non-zero. Then record signed in with: capture … --storage-state <file>.`,
  options: {
    save: { type: 'string', arg: 'file.json', desc: 'Save the session here instead (not in a project folder or git work tree)' },
    timeout: { type: 'string', arg: 'duration', default: SIGNIN_TIMEOUT, desc: 'Give up, saving nothing, after this long: 300s, 5m, 1500ms' },
  },
  positionals: { min: 1, max: 1 },
  examples: ['capture signin http://127.0.0.1:4173', 'capture signin https://app.example.test --timeout 10m'],
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  // runCli takes no positionals for a take, so the signin subcommand is dispatched before parsing
  if (argv[0] === 'signin') await runCli(signinSpec, ({ values, positionals }) => signin(positionals[0], values), argv.slice(1));
  else await runCli(spec, async ({ values }) => {
    const plan = await planTake(values);
    const take = await capture(plan);
    if (values.json) process.stdout.write(JSON.stringify(take, null, 2) + '\n');
    else {
      process.stdout.write(report(take));
      process.stdout.write(`take manifest: ${take.manifest}\n`);
    }
  }, argv);
  // a watchdog abort can leave a hung storyboard's own timers behind; don't let them hold the process
  if (aborted) setTimeout(() => process.exit(), 300).unref();
}
