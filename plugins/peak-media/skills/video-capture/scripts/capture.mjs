#!/usr/bin/env node
// capture — play a live page in real time, drive it with a storyboard, and screen-capture it.
// Engine (DEC-06/DEC-35): Playwright page.screencast.start({fps, onFrame}); t0 is the timestamp of
// the first onFrame, and every say()/wait() is timed against that same clock. Frames are placed on
// a constant-rate grid by their own timestamps (frame k covers t0 + k/fps), so a take is exactly
// round(ms × fps / 1000) frames. With a spine, say() plays to the manifest's clip timing — no TTS
// here (plate-factory §6, one timing model). Captions are drawn with screencast.showOverlay
// (injected DOM as the fallback). --mp4 lays the spine's clips at the logged say() times plus
// --audio-offset-ms at -16 LUFS (D7), and every take writes a take manifest (D11).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync, mkdtempSync, linkSync, copyFileSync, createReadStream } from 'node:fs';
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
import { resolveDep, depRoot, pins } from '../../../lib/deps.mjs';
import { browserPath } from '../../../lib/hf.mjs';

const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.sh');
const OUT_EXT = ['.mp4', '.webm', '.mkv'];
/** Watchdog: a spine-timed take aborts once it runs this far past its window. */
export const OVERRUN_GRACE_MS = 2000;
/** Watchdog for takes with no window (silent, captions): the default --max-ms. */
export const DEFAULT_MAX_MS = 600_000;
/** Warm-up before t0: evaluate/paint round trips so the first say() isn't late (WP7a nit). */
export const WARMUP_ROUNDS = 6;

export const DEFAULT_CAPTION_CSS = `
.pm-caption-wrap { position: fixed; left: 0; right: 0; bottom: 6%; display: flex; justify-content: center; pointer-events: none; z-index: 2147483647; }
.pm-caption { max-width: 80%; padding: 0.45em 0.9em; border-radius: 0.4em; background: rgba(0, 0, 0, 0.72); color: #fff;
  font: 600 28px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; }
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const words = (t) => String(t ?? '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const norm = (t) => String(t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

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
 * Clips are the narration clips that start inside the window, in order; times are window-relative.
 */
export function spineWindow(spine, plate) {
  const startMs = plate ? plate.startMs : 0;
  const durationMs = plate ? plate.durationMs : spine.totalMs;
  const clips = (spine.clips ?? [])
    .filter((c) => c.startMs >= startMs && c.startMs < startMs + durationMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((c) => ({ n: c.n, beat: c.beat, text: c.text, atMs: c.startMs - startMs, durationMs: c.durationMs, file: c.file, spineStartMs: c.startMs }));
  return { startMs, durationMs, clips };
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

async function loadStoryboard(file) {
  let mod;
  try { mod = await import(pathToFileURL(file).href); } catch (e) {
    throw new CliError(`cannot load storyboard ${file}: ${String(e?.message ?? e).split('\n')[0]}`);
  }
  const fn = mod.default ?? mod.storyboard;
  if (typeof fn !== 'function') throw new CliError(`storyboard ${file} must export a default async function ({ page, say, waitForVoice, wait }) => { … }`);
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
  if (values.plates) plates = { file: path.resolve(values.plates), ...(await readPlate(path.resolve(values.plates), values.plate)) };
  const platesDir = plates && path.dirname(plates.file);

  const storyboard = values.storyboard ? path.resolve(values.storyboard) : plates && path.resolve(platesDir, plates.plate.live.storyboard);
  if (!storyboard) throw usageError('--storyboard <file.mjs> is required (or --plates/--plate naming a live plate)');
  if (!existsSync(storyboard) || statSync(storyboard).isDirectory()) throw new CliError(`storyboard not found: ${storyboard}`);

  const out = values.out ? path.resolve(values.out) : plates && path.join(platesDir, 'renders', 'plates', `${plates.plate.id}.mp4`);
  if (!out && !values.mp4) throw usageError('--out <take.webm|.mp4> is required (or --mp4 <file.mp4>)');
  if (out && !OUT_EXT.includes(path.extname(out).toLowerCase())) throw usageError(`--out must end in ${OUT_EXT.join(', ')}, got '${path.basename(out)}'`);
  const mp4 = values.mp4 ? path.resolve(values.mp4) : null;
  if (mp4 && path.extname(mp4).toLowerCase() !== '.mp4') throw usageError(`--mp4 must end in .mp4, got '${path.basename(mp4)}'`);

  const viewport = parseViewport(values.viewport ?? plates?.plate.live.viewport ?? '1280x720');
  const fps = values.fps ?? plates?.doc.fps ?? 30;
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

  const maxMs = values['max-ms'];
  if (maxMs !== undefined && !(Number.isFinite(maxMs) && maxMs > 0)) throw usageError(`--max-ms must be a positive number of ms, got ${maxMs}`);
  // watchdog: a spine-timed take may not run more than 2 s past its window; any other take is capped at --max-ms (default 10 min)
  const watchdogMs = maxMs ?? (window ? window.durationMs + OVERRUN_GRACE_MS : DEFAULT_MAX_MS);

  const primary = mp4 ?? out;
  const manifest = values.manifest ? path.resolve(values.manifest) : manifestPathFor(primary);
  if (path.extname(manifest).toLowerCase() !== '.json') throw usageError(`--manifest must end in .json, got '${path.basename(manifest)}'`);

  // --mp4 narration: every clip in the window needs its audio before a browser opens
  let sources = null;
  if (mp4 && window?.clips.length) {
    sources = new Map();
    for (const c of window.clips) {
      const src = clipSource(spineFile, spine, c);
      if (!src) throw new CliError(`no audio for spine clip ${c.n} (${c.file ?? 'no file'}): not in ${path.join(path.dirname(spineFile), 'clips')}, the TTS cache or the spine's audio — rerun spine for this manifest`);
      sources.set(c.n, src);
    }
  }

  // tools: ffmpeg, the pinned Playwright, the pinned Chrome
  requireFfmpeg();
  const pwRoot = depRoot('playwright');
  const pwEntry = resolveDep('playwright');
  if (!pwRoot || !pwEntry) throw new CliError(`Playwright not installed — run ${SETUP}`, EXIT.MISSING_PREREQ);
  const pwVersion = JSON.parse(readFileSync(path.join(pwRoot, 'package.json'), 'utf8')).version;
  if (pwVersion !== pins().playwright) throw new CliError(`Playwright ${pwVersion} found but ${pins().playwright} is pinned — run ${SETUP}`, EXIT.MISSING_PREREQ);
  const chrome = browserPath();
  if (!chrome || !existsSync(chrome)) throw new CliError(`Chromium not found${chrome ? ` at ${chrome}` : ''} — run ${SETUP} (or set HYPERFRAMES_BROWSER_PATH)`, EXIT.MISSING_PREREQ);

  const sb = await loadStoryboard(storyboard);
  const page = values.url ? resolvePage(values.url, process.cwd())
    : plates?.plate.live.url ? resolvePage(plates.plate.live.url, platesDir)
      : sb.url ? resolvePage(sb.url, path.dirname(storyboard))
        : existsSync(path.join(path.dirname(storyboard), 'index.html')) ? resolvePage('index.html', path.dirname(storyboard))
          : resolvePage(null);

  const captions = !values['no-captions'];
  const mode = spine ? 'spine' : captions ? 'captions' : 'silent';
  const captionEngineChoice = values['caption-engine'] ?? 'overlay';
  return { values, plates, storyboard, sb, out, mp4, viewport, size, fps, captions, captionCss, captionEngine: captionEngineChoice, spineFile, spine, window, audioOffsetMs, chrome, pwEntry, page, mode, manifest, sources, watchdogMs };
}

/** Narration loudness of the --mp4 deliverable (D7). */
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
 * The narration track for a take: each placed clip at its position (logged say() start plus the
 * audio offset), summed, padded to the take's length, then levelled to NARRATION_LUFS.
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

const PATH_FLAGS = new Set(['storyboard', 'out', 'mp4', 'caption-css', 'spine', 'plates', 'manifest']);

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
 * "narrate": false and a nominal bpm. Both carry captions[] and one beat, "take", spanning the take.
 */
export function takeManifest(plan, take, { command, manifestFile, placed = [] }) {
  const videoMs = Math.max(1, take.videoMs);
  const rel = (f) => (f ? path.relative(path.dirname(manifestFile), f) || path.basename(f) : undefined);
  const captions = take.captionTimings.map((c) => ({ n: c.n, text: c.text, startMs: Math.max(0, c.startMs), durationMs: Math.max(1, c.durationMs) }));
  const narrated = placed.length > 0;
  const beat = { id: 'take', startMs: 0, durationMs: videoMs, clipNs: narrated ? placed.map((p) => p.spineClip.n) : [] };
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
  if (!narrated) beat.onScreenText = captions.map((c) => c.text).filter(Boolean).join(' / ') || '(no captions)';
  doc.beats = [beat];
  doc.clips = placed.map((p) => {
    const startMs = Math.min(videoMs - 1, Math.max(0, Math.round(p.atMs)));
    const c = p.spineClip;
    return {
      n: c.n, beat: 'take', text: c.text, style: c.style ?? '', startMs,
      durationMs: Math.max(1, Math.min(c.durationMs, videoMs - startMs)), words: c.words, wpm: c.wpm, file: c.file,
      'x-spineBeat': c.beat, 'x-spineStartMs': c.startMs, 'x-sayN': p.say.n, 'x-lateMs': p.say.lateMs ?? 0,
    };
  });
  doc.captions = captions;
  doc['x-take'] = {
    mode: take.mode, storyboard: rel(take.storyboard), url: take.url, plate: take.plate, fps: take.fps, width: take.width, height: take.height,
    frames: take.frames, out: rel(take.out), mp4: rel(take.mp4), captionEngine: take.captionEngine,
    ...(take.audio && { audio: take.audio }),
    says: take.says.map((s) => ({ n: s.n, text: s.text, narrate: s.narrate, startMs: s.startMs, durationMs: s.durationMs, caption: s.caption, ...(s.clip && { clip: s.clip, plannedMs: s.plannedMs, lateMs: s.lateMs }) })),
  };
  return doc;
}

const log = (msg) => process.stderr.write(`capture: ${msg}\n`);

/**
 * Encode the image sequence to `file`: an .mp4 picture-only plate, a .webm/.mkv take, or the --mp4
 * deliverable (D7: H.264 High, yuv420p, AAC 48 kHz, faststart) with `audio` (a WAV) or a silent AAC track.
 */
function encode(pattern, n, file, { fps, size, deliverable = false, audio = null }) {
  mkdirSync(path.dirname(file), { recursive: true });
  const ext = path.extname(file).toLowerCase();
  // screencast JPEGs are full range; convert to limited-range yuv420p (the delivery spec)
  const vf = [`scale=${size.width}:${size.height}:flags=lanczos:in_range=pc:out_range=tv`, 'setsar=1', 'format=yuv420p'];
  const args = ['-y', '-v', 'error', '-framerate', String(fps), '-start_number', '0', '-i', pattern];
  if (deliverable) {
    if (audio) args.push('-i', audio); else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    args.push('-map', '0:v:0', '-map', '1:a:0');
  }
  args.push('-frames:v', String(n), '-vf', vf.join(','), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(fps));
  if (ext === '.webm') args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4');
  else args.push('-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '18');
  if (deliverable) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-t', (n / fps).toFixed(6));
  if (ext === '.mp4') args.push('-movflags', '+faststart');
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
      await page.evaluate(({ id, css, text }) => {
        if (!document.getElementById('pm-caption-style')) {
          const st = document.createElement('style'); st.id = 'pm-caption-style'; st.textContent = css; document.documentElement.appendChild(st);
        }
        const wrap = document.createElement('div'); wrap.className = 'pm-caption-wrap'; wrap.id = id;
        const box = document.createElement('div'); box.className = 'pm-caption'; box.textContent = text;
        wrap.appendChild(box); document.documentElement.appendChild(wrap);
      }, { id, css, text });
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

/**
 * Warm-up before t0 (WP7a nit): round trips through evaluate + two animation frames and, with
 * captions on, a caption shown and removed, so the first say() pays no cold-start cost (the
 * first showOverlay call alone measured ~100 ms). Runs before the screencast starts: nothing of
 * it is captured.
 */
async function warmUp(page, engine, captions) {
  if (process.env.PEAK_MEDIA_CAPTURE_WARMUP === '0') return;
  for (let i = 0; i < WARMUP_ROUNDS; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    if (captions && i < 2) { const remove = await engine.show('warm-up'); await remove(); }
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
    log(`launching browser (${viewport.width}x${viewport.height}, ${fps} fps, mode ${mode})`);
    browser = await chromium.launch({ executablePath: plan.chrome, headless: true });
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
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
    await warmUp(page, engine, captions);

    // ---- the clock: t0 = timestamp of the first onFrame (DEC-06) ----
    const grid = new FrameGrid(tmp, fps);
    const wallStart = Date.now();
    await page.screencast.start({ fps, size: viewport, quality: 90, onFrame: (f) => grid.onFrame(f) });
    let firstFrameTimer;
    const t0 = await Promise.race([grid.ready, new Promise((_, rej) => { firstFrameTimer = setTimeout(() => rej(new CliError('no screencast frame within 10 s of start — the page may not be rendering')), 10_000); })])
      .finally(() => clearTimeout(firstFrameTimer)); // don't keep the process alive after the first frame
    const now = () => performance.timeOrigin + performance.now() - t0; // ms since t0, same clock as frame timestamps
    // timers wake ~5 ms early, then yield with setImmediate to the exact ms (timer slack would make say() late)
    const sleepUntil = async (ms) => {
      for (let d = ms - now(); d > 0; d = ms - now()) {
        await new Promise((r) => (d > 6 ? setTimeout(r, Math.min(d - 5, 1000)) : setImmediate(r)));
      }
    };

    let voiceEndsAt = 0, n = 0;
    const says = [];
    const captionTimings = []; // {n, text, startMs, durationMs} as shown (the manifest's captions[])
    const timers = new Set();
    let current = null; // the caption on screen: {cap, remove, timer}
    // Caption work runs on its own queue, so say() returns on the clock and the storyboard's next
    // action is never held up by overlay round trips (they measured up to ~200 ms).
    let captionQueue = Promise.resolve();
    const hideCurrent = async () => {
      const c = current;
      if (!c) return;
      current = null; clearTimeout(c.timer); timers.delete(c.timer);
      c.cap.durationMs = Math.max(1, Math.min(c.cap.durationMs, Math.round(now() - c.cap.startMs)));
      await c.remove();
    };
    const showCaption = (sayN, text, ms) => {
      if (!captions || !text || ms <= 0) return false;
      const endsAt = now() + ms;
      captionQueue = captionQueue.then(async () => {
        await hideCurrent(); // one caption at a time: a new say() replaces the one still showing
        const left = endsAt - now();
        if (left <= 0) return;
        const shownAt = now();
        const remove = await engine.show(text);
        const entry = { cap: { n: sayN, text, startMs: Math.round(shownAt), durationMs: Math.max(1, Math.round(endsAt - shownAt)) }, remove };
        captionTimings.push(entry.cap);
        entry.timer = setTimeout(() => { timers.delete(entry.timer); if (current === entry) current = null; remove(); }, Math.max(0, endsAt - now()));
        timers.add(entry.timer);
        current = entry;
      }).catch((e) => log(`caption ${sayN} not drawn: ${String(e?.message ?? e).split('\n')[0]}`));
      return true;
    };
    const say = async (text = '', opts = {}) => {
      const spoken = opts.narrate ?? text;
      n += 1;
      const rec = { n, text, narrate: opts.narrate ?? null };
      if (win && win.clips.length) {
        const clip = win.clips[n - 1];
        if (!clip) throw new CliError(`say() #${n} has no spine clip — the ${plan.plates ? `plate's window` : 'spine'} holds ${win.clips.length} clip(s); add a beat to the script or drop a say()`);
        if (norm(spoken) && norm(spoken) !== norm(clip.text)) log(`warning: say() #${n} text differs from spine clip ${clip.n} ("${clip.text.slice(0, 40)}…") — the spine's audio plays regardless`);
        const at = clip.atMs - audioOffsetMs;
        await sleepUntil(at);
        const startMs = now();
        Object.assign(rec, { clip: clip.n, plannedMs: Math.round(at), startMs: Math.round(startMs), lateMs: Math.max(0, Math.round(startMs - at)), durationMs: clip.durationMs });
        voiceEndsAt = at + clip.durationMs;
        rec.caption = showCaption(n, text, voiceEndsAt - now());
      } else {
        const startMs = now();
        const hold = holdMs(text || spoken);
        Object.assign(rec, { startMs: Math.round(startMs), durationMs: hold });
        voiceEndsAt = startMs + hold;
        // captions-only: with no voice, a voice-only line is shown so the viewer can read it
        rec.caption = showCaption(n, text || (mode === 'captions' ? spoken : ''), hold);
      }
      says.push(rec);
    };
    const api = {
      page, say,
      waitForVoice: () => sleepUntil(voiceEndsAt),
      wait: (ms) => new Promise((r) => { const t = setTimeout(() => { timers.delete(t); r(); }, Math.max(0, Number(ms) || 0)); timers.add(t); }),
      mode, fps, viewport, elapsedMs: () => now(),
    };

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
          } catch (e) {
            if (e instanceof CliError) throw e;
            const at = String(e?.stack ?? '').split('\n').find((l) => l.includes(plan.storyboard))?.trim().replace(/^at\s+/, '') ?? '';
            throw new CliError(`storyboard failed: ${String(e?.message ?? e).split('\n')[0]}${at ? ` (${at})` : ''}`);
          }
          await sleepUntil(voiceEndsAt);
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
    if (current) { // the caption still showing ends with the take
      const c = current; current = null; clearTimeout(c.timer); timers.delete(c.timer);
      c.cap.durationMs = Math.max(1, Math.min(c.cap.durationMs, Math.round(endMs - c.cap.startMs)));
    }
    for (const t of timers) clearTimeout(t);
    await page.screencast.stop();
    const wallMs = Date.now() - wallStart;
    await browser.close(); browser = null;

    const frames = framesFor(endMs, fps);
    const videoMs = (frames * 1000) / fps;
    const { pattern, unique } = grid.finish(frames);
    const opts = { fps, size };
    // narration (D7): each spine clip at its logged say() time on the spine clock (plannedMs: the
    // clip start minus the offset) plus the audio offset — i.e. where the spine puts it. A late
    // say() moves the picture, not the voice, so waitForVoice() (the clip's planned end) and the
    // laid audio agree, and the take sounds exactly like the assembled video will.
    const placed = says.filter((s) => s.clip).map((s) => ({
      say: s, spineClip: plan.spine.clips.find((c) => c.n === s.clip), source: plan.sources?.get(s.clip), atMs: s.plannedMs + audioOffsetMs,
    }));
    if (plan.out) encode(pattern, frames, plan.out, { ...opts, deliverable: false });
    let audio = null;
    if (plan.mp4) {
      audio = mixNarration(placed.filter((p) => p.source), { durationMs: videoMs, dir: tmp });
      encode(pattern, frames, plan.mp4, { ...opts, deliverable: true, audio: audio.file });
      log(audio.clips ? `narration: ${audio.clips} clip(s) laid at their say() times ${audioOffsetMs >= 0 ? '+' : ''}${audioOffsetMs} ms, ${audio.lufs} LUFS` : 'audio: silent AAC track (no narration in this take)');
    }
    const late = says.filter((s) => s.lateMs > 1000 / fps); // later than one frame
    if (late.length) log(`${late.length} say() call(s) started after their clip: ${late.map((s) => `#${s.n} +${s.lateMs} ms`).join(', ')}`);
    const take = {
      mode, out: plan.out, mp4: plan.mp4, manifest: plan.manifest, storyboard: plan.storyboard, url,
      plate: plan.plates?.plate.id ?? null, spine: plan.spineFile ?? null,
      window: win ? { startMs: win.startMs, durationMs: win.durationMs, clips: win.clips.length } : null,
      fps, width: size.width, height: size.height, frames, uniqueFrames: unique,
      videoMs: Math.round(videoMs), wallMs, ranMs: Math.round(ranMs), audioOffsetMs, captions, captionEngine: captions ? engine.name : null,
      captionTimings, says,
      audio: audio && { clips: audio.clips, lufs: Number.isFinite(audio.lufs) ? audio.lufs : null },
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
  usage: 'capture --storyboard <file.mjs> --out <take.webm|.mp4> [options]   |   capture --plates plates.json --plate <id>',
  description: `
Three modes, one storyboard: silent (--no-captions), captions (default) and spine-timed (--spine,
or --plates/--plate). In spine-timed mode say() plays to the spine manifest's clip timing (no TTS
here), waitForVoice() waits for the clip's end, and the take lasts exactly the plate's (or the
spine's) planned duration. Otherwise say() holds for reading time (about 3 words/s, at least 1.5 s)
and the take ends when the storyboard returns and the last say() has finished.
The page is --url, else the plate's live.url, else the storyboard's exported \`url\`, else an
index.html next to the storyboard; local files are served on 127.0.0.1. Pre-flight (Chromium,
ffmpeg, the pinned Playwright, a valid --spine, the spine clips' audio for --mp4) runs before any
browser opens. Captions (default) are a neutral bottom-centre bar; --caption-css restyles them.
--mp4 is the deliverable (H.264 High, yuv420p, AAC 48 kHz, faststart): a spine-timed take gets the
spine's clips at their say() times on the spine clock plus --audio-offset-ms (a late say() moves the
picture, not the voice), levelled to -16 LUFS; other takes
get a silent AAC track. Every take writes a take manifest (v1 spine schema). A watchdog aborts a
spine-timed take 2 s past its window, and any take at --max-ms. Check a take with check-take.mjs.
Storyboard API: references/storyboard-api.md.`,
  options: {
    storyboard: { type: 'string', arg: 'file.mjs', desc: 'Storyboard module: export default async ({ page, say, waitForVoice, wait }) => { … }' },
    out: { type: 'string', arg: 'file', desc: 'The take: .webm, .mkv or .mp4 (picture only) (default with --plate: <project>/renders/plates/<id>.mp4)' },
    mp4: { type: 'string', arg: 'file.mp4', desc: 'Also write the deliverable: H.264 High/AAC 48 kHz MP4 with faststart; spine clips laid at their say() times plus --audio-offset-ms at -16 LUFS, else a silent AAC track' },
    viewport: { type: 'string', arg: 'WxH', desc: 'Browser viewport (default: the plate\'s live.viewport, else 1280x720)' },
    'no-captions': { type: 'boolean', desc: 'Draw no captions (silent mode without --spine)' },
    'caption-css': { type: 'string', arg: 'file.css', desc: 'Caption style sheet (classes .pm-caption-wrap, .pm-caption) replacing the neutral default' },
    'caption-engine': { type: 'string', arg: 'overlay|dom', choices: ['overlay', 'dom'], desc: 'How captions are drawn: overlay = screencast.showOverlay, in the captured frames only (default); dom = injected into the page (visible to page scripts; no overlay frame delays)' },
    url: { type: 'string', arg: 'url|file', desc: 'Page to load: http(s) URL or local .html file/folder (overrides the plate and storyboard)' },
    'debug-requests': { type: 'boolean', desc: 'Log every page request, failure and HTTP error to stderr' },
    'audio-offset-ms': { type: 'number', arg: 'ms', desc: 'Audio placement offset. Spine-timed: say() fires at clip start minus this (default: the spine\'s audioOffsetMs); otherwise only recorded in the take manifest (default: -100)' },
    spine: { type: 'string', arg: 'manifest.json', desc: 'Spine manifest: say() plays to its clip timing (spine-timed mode)' },
    plates: { type: 'string', arg: 'plates.json', desc: 'Project plate list; with --plate, supplies storyboard, url, viewport, fps, size, spine and the planned window' },
    plate: { type: 'string', arg: 'id', desc: 'The live plate to capture (needs --plates)' },
    fps: { type: 'number', desc: 'Capture frame rate (default: plates.json fps, else 30)' },
    manifest: { type: 'string', arg: 'file.json', desc: 'Where to write the take manifest (default: <take>.take.json next to --mp4, else --out)' },
    'max-ms': { type: 'number', arg: 'ms', desc: `Abort a take that runs longer than this (default: the spine window + ${OVERRUN_GRACE_MS} ms, else ${DEFAULT_MAX_MS})` },
    json: { type: 'boolean', desc: 'Print the take summary as JSON' },
  },
  examples: [
    'capture --storyboard examples/deck/storyboard.mjs --out /tmp/deck.webm',
    'capture --storyboard examples/deck/storyboard.mjs --out /tmp/deck.mp4 --no-captions',
    'capture --storyboard examples/deck/storyboard.mjs --out /tmp/deck.mp4 --spine spine/manifest.json',
    'capture --plates plates.json --plate r1-feature',
  ],
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli(spec, async ({ values }) => {
    const plan = await planTake(values);
    const take = await capture(plan);
    if (values.json) process.stdout.write(JSON.stringify(take, null, 2) + '\n');
    else {
      process.stdout.write(`${take.out ?? take.mp4}: ${take.frames} frames at ${take.fps} fps = ${take.videoMs} ms (${take.mode}; ${take.says.length} say(), wall ${take.wallMs} ms)\n`);
      if (take.out && take.mp4) process.stdout.write(`${take.mp4}: H.264/AAC deliverable\n`);
      process.stdout.write(`${take.manifest}: take manifest\n`);
    }
  });
  // a watchdog abort can leave a hung storyboard's own timers behind; don't let them hold the process
  if (aborted) setTimeout(() => process.exit(), 300).unref();
}
