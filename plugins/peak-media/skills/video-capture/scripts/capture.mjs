#!/usr/bin/env node
// capture — play a live page in real time, drive it with a storyboard, and screen-capture it.
// Engine (DEC-06): Playwright page.screencast.start({fps, onFrame}); t0 is the timestamp of the
// first onFrame, and every say()/wait() is timed against that same clock. Frames are placed on a
// constant-rate grid by their own timestamps (frame k covers t0 + k/fps), so a take is exactly
// round(ms × fps / 1000) frames. With a spine, say() plays to the manifest's clip timing — no TTS
// here (plate-factory §6, one timing model). Narration mux, captions styling, check-take and the
// take manifest are video-capture's next stage (WP7b).
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
import { resolveDep, depRoot, pins } from '../../../lib/deps.mjs';
import { browserPath } from '../../../lib/hf.mjs';

const SETUP = path.join(PLUGIN_ROOT, 'scripts', 'setup.sh');
const OUT_EXT = ['.mp4', '.webm', '.mkv'];

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
    .map((c) => ({ n: c.n, beat: c.beat, text: c.text, atMs: c.startMs - startMs, durationMs: c.durationMs }));
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
  return { values, plates, storyboard, sb, out, mp4, viewport, size, fps, captions, captionCss, spineFile, spine, window, audioOffsetMs, chrome, pwEntry, page, mode };
}

const log = (msg) => process.stderr.write(`capture: ${msg}\n`);

/** Encode the image sequence to `file` (.mp4 picture-only plate, .webm/.mkv take, or the --mp4 deliverable with a silent AAC track). */
function encode(pattern, n, file, { fps, size, viewport, deliverable = false }) {
  mkdirSync(path.dirname(file), { recursive: true });
  const ext = path.extname(file).toLowerCase();
  // screencast JPEGs are full range; convert to limited-range yuv420p (the delivery spec)
  const vf = [`scale=${size.width}:${size.height}:flags=lanczos:in_range=pc:out_range=tv`, 'setsar=1', 'format=yuv420p'];
  const args = ['-y', '-v', 'error', '-framerate', String(fps), '-start_number', '0', '-i', pattern];
  if (deliverable) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.push('-frames:v', String(n), '-vf', vf.join(','), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(fps));
  if (ext === '.webm') args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4');
  else args.push('-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '18');
  if (deliverable) args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-t', (n / fps).toFixed(6));
  if (ext === '.mp4') args.push('-movflags', '+faststart');
  args.push(file);
  ffmpeg(args, { what: `encoding ${path.basename(file)}` });
}

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

    // ---- the clock: t0 = timestamp of the first onFrame (DEC-06) ----
    const grid = new FrameGrid(tmp, fps);
    const wallStart = Date.now();
    await page.screencast.start({ fps, size: viewport, quality: 90, onFrame: (f) => grid.onFrame(f) });
    const t0 = await Promise.race([grid.ready, new Promise((_, rej) => setTimeout(() => rej(new CliError('no screencast frame within 10 s of start — the page may not be rendering')), 10_000))]);
    const now = () => performance.timeOrigin + performance.now() - t0; // ms since t0, same clock as frame timestamps
    const sleepUntil = async (ms) => { for (let d = ms - now(); d > 0; d = ms - now()) await new Promise((r) => setTimeout(r, Math.min(d, 1000))); };

    let voiceEndsAt = 0, n = 0;
    const says = [];
    const showCaption = async (text, ms) => {
      if (!captions || !text || ms <= 0) return false;
      const html = `<style>${captionCss}</style><div class="pm-caption-wrap"><div class="pm-caption">${esc(text)}</div></div>`;
      // showOverlay(html, {duration}) resolves only when the overlay is removed, which would stall
      // the storyboard; show it open-ended and remove it on our own clock instead.
      const shownAt = now();
      const overlay = await page.screencast.showOverlay(html);
      const remove = () => Promise.resolve(overlay?.[Symbol.asyncDispose]?.() ?? overlay?.dispose?.()).catch(() => {});
      setTimeout(remove, Math.max(0, ms - (now() - shownAt)));
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
        rec.caption = await showCaption(text, voiceEndsAt - now());
      } else {
        const startMs = now();
        const hold = holdMs(text || spoken);
        Object.assign(rec, { startMs: Math.round(startMs), durationMs: hold });
        voiceEndsAt = startMs + hold;
        // captions-only: with no voice, a voice-only line is shown so the viewer can read it
        rec.caption = await showCaption(text || (mode === 'captions' ? spoken : ''), hold);
      }
      says.push(rec);
    };
    const api = {
      page, say,
      waitForVoice: () => sleepUntil(voiceEndsAt),
      wait: (ms) => new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0))),
      mode, fps, viewport, elapsedMs: () => now(),
    };

    log(`t0 anchored on the first frame; running ${path.basename(plan.storyboard)}`);
    try {
      await plan.sb.fn(api);
    } catch (e) {
      if (e instanceof CliError) throw e;
      const at = String(e?.stack ?? '').split('\n').find((l) => l.includes(plan.storyboard))?.trim().replace(/^at\s+/, '') ?? '';
      throw new CliError(`storyboard failed: ${String(e?.message ?? e).split('\n')[0]}${at ? ` (${at})` : ''}`);
    }
    await sleepUntil(voiceEndsAt);
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
    await page.screencast.stop();
    const wallMs = Date.now() - wallStart;
    await browser.close(); browser = null;

    const frames = framesFor(endMs, fps);
    const { pattern, unique } = grid.finish(frames);
    const opts = { fps, size, viewport };
    if (plan.out) encode(pattern, frames, plan.out, { ...opts, deliverable: false });
    if (plan.mp4) encode(pattern, frames, plan.mp4, { ...opts, deliverable: true });
    const late = says.filter((s) => s.lateMs > 1000 / fps); // later than one frame
    if (late.length) log(`${late.length} say() call(s) started after their clip: ${late.map((s) => `#${s.n} +${s.lateMs} ms`).join(', ')}`);
    return {
      mode, out: plan.out, mp4: plan.mp4, storyboard: plan.storyboard, url,
      plate: plan.plates?.plate.id ?? null, spine: plan.spineFile ?? null,
      window: win ? { startMs: win.startMs, durationMs: win.durationMs, clips: win.clips.length } : null,
      fps, width: size.width, height: size.height, frames, uniqueFrames: unique,
      videoMs: Math.round((frames * 1000) / fps), wallMs, ranMs: Math.round(ranMs), audioOffsetMs, captions, says,
    };
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
ffmpeg, the pinned Playwright, a valid --spine) runs before any browser opens.
Storyboard API: references/storyboard-api.md.`,
  options: {
    storyboard: { type: 'string', arg: 'file.mjs', desc: 'Storyboard module: export default async ({ page, say, waitForVoice, wait }) => { … }' },
    out: { type: 'string', arg: 'file', desc: 'The take: .webm, .mkv or .mp4 (picture only) (default with --plate: <project>/renders/plates/<id>.mp4)' },
    mp4: { type: 'string', arg: 'file.mp4', desc: 'Also write an H.264/AAC MP4 with faststart (silent audio track)' },
    viewport: { type: 'string', arg: 'WxH', desc: 'Browser viewport (default: the plate\'s live.viewport, else 1280x720)' },
    'no-captions': { type: 'boolean', desc: 'Draw no captions (silent mode without --spine)' },
    'caption-css': { type: 'string', arg: 'file.css', desc: 'Caption style sheet (classes .pm-caption-wrap, .pm-caption) replacing the neutral default' },
    url: { type: 'string', arg: 'url|file', desc: 'Page to load: http(s) URL or local .html file/folder (overrides the plate and storyboard)' },
    'debug-requests': { type: 'boolean', desc: 'Log every page request, failure and HTTP error to stderr' },
    'audio-offset-ms': { type: 'number', arg: 'ms', desc: 'Audio placement offset. Spine-timed: say() fires at clip start minus this (default: the spine\'s audioOffsetMs); otherwise recorded for the mux (default: -100)' },
    spine: { type: 'string', arg: 'manifest.json', desc: 'Spine manifest: say() plays to its clip timing (spine-timed mode)' },
    plates: { type: 'string', arg: 'plates.json', desc: 'Project plate list; with --plate, supplies storyboard, url, viewport, fps, size, spine and the planned window' },
    plate: { type: 'string', arg: 'id', desc: 'The live plate to capture (needs --plates)' },
    fps: { type: 'number', desc: 'Capture frame rate (default: plates.json fps, else 30)' },
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
    }
  });
}
