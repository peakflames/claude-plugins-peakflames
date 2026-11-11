#!/usr/bin/env node
// probe-spec — assert an MP4 meets the delivery spec (D7): H.264 High, yuv420p,
// AAC 48 kHz, faststart (moov before mdat), size, and duration within ±N frames.
// With --preset web|youtube|hifi it also checks that preset's encode (DEC-47); the preset table
// is lib/presets.mjs (shared with capture), imported, not copied.
import { openSync, readSync, closeSync, fstatSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT, isMain } from '../cli.mjs';
import { probe, fpsOf, requireFfmpeg, ffprobeBin } from '../ffmpeg.mjs';
import { spawnSync } from 'node:child_process';
import { PRESETS, presetExpect } from '../presets.mjs';

/** Boxes at one level of an MP4, from byte `start` to `end`: [{type, start, size, header}]. */
function boxesIn(fd, start, end) {
  const out = [];
  const hdr = Buffer.alloc(16);
  let pos = start;
  while (pos + 8 <= end && out.length < 256) {
    readSync(fd, hdr, 0, 16, pos);
    let len = hdr.readUInt32BE(0);
    let header = 8;
    const type = hdr.toString('latin1', 4, 8);
    if (len === 1) { len = Number(hdr.readBigUInt64BE(8)); header = 16; } else if (len === 0) len = end - pos;
    if (len < 8) break;
    out.push({ type, start: pos, size: len, header });
    pos += len;
  }
  return out;
}

/** Top-level MP4 box order, e.g. ['ftyp','moov','mdat']. */
export function topBoxes(file) {
  const fd = openSync(file, 'r');
  try { return boxesIn(fd, 0, fstatSync(fd).size).map((b) => b.type); } finally { closeSync(fd); }
}

/** Number of edit lists (moov/trak/edts/elst boxes) in an MP4. */
export function editLists(file) {
  const fd = openSync(file, 'r');
  try {
    let n = 0;
    const walk = (start, end, depth) => {
      for (const b of boxesIn(fd, start, end)) {
        if (b.type === 'elst') n++;
        else if (depth < 4 && ['moov', 'trak', 'edts'].includes(b.type)) walk(b.start + b.header, b.start + b.size, depth + 1);
      }
    };
    walk(0, fstatSync(fd).size, 0);
    return n;
  } finally { closeSync(fd); }
}

/**
 * The x264 settings the encoder wrote into the stream (its "x264 - core … options: …" SEI), as
 * {key: value}; null if the file has none in its first 16 MB.
 */
export function x264Options(file) {
  const fd = openSync(file, 'r');
  try {
    const size = Math.min(fstatSync(fd).size, 16 * 1024 * 1024);
    const buf = Buffer.alloc(size);
    readSync(fd, buf, 0, size, 0);
    const at = buf.indexOf('x264 - core');
    if (at < 0) return null;
    const end = buf.indexOf(0, at);
    const text = buf.toString('latin1', at, end < 0 ? Math.min(size, at + 4096) : end);
    return Object.fromEntries([...text.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1], m[2]]));
  } finally { closeSync(fd); }
}

/**
 * Video GOP structure from ffprobe: packets (decode order: pts, key flag) and frames (display
 * order: pict_type). Returns {gops: keyframe distances in frames, closed, maxB, bRuns}.
 *   closed — no packet after a keyframe (decode order) shows before it (pts < the keyframe's pts):
 *            frames of a closed GOP never reference the previous GOP
 *   maxB   — the longest run of consecutive B-frames in display order
 */
export function gopInfo(file, fps) {
  const pk = spawnSync(ffprobeBin(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts,flags', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (pk.status !== 0) throw new CliError(`ffprobe could not read the packets of ${file}: ${pk.stderr.trim().split('\n')[0]}`);
  const packets = pk.stdout.trim().split('\n').filter(Boolean).map((l) => { const [pts, flags] = l.split(','); return { pts: Number(pts), key: flags.includes('K') }; });
  let closed = true;
  let after = Infinity; // the smallest pts of the packets after this one (decode order)
  for (let i = packets.length - 1; i >= 0; i--) {
    if (packets[i].key && after < packets[i].pts) closed = false;
    after = Math.min(after, packets[i].pts);
  }
  const keys = packets.filter((p) => p.key).map((p) => p.pts).sort((a, b) => a - b);
  const all = packets.map((p) => p.pts).sort((a, b) => a - b);
  const step = all.length > 1 ? all[1] - all[0] : 1; // pts units per frame
  const gops = keys.slice(1).map((k, i) => Math.round((k - keys[i]) / step));
  const fr = spawnSync(ffprobeBin(), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pict_type', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (fr.status !== 0) throw new CliError(`ffprobe could not decode ${file}: ${fr.stderr.trim().split('\n')[0]}`);
  const types = fr.stdout.trim().split('\n').map((s) => s.trim()).join('');
  const runs = types.match(/B+/g) ?? [];
  return { frames: packets.length, gops, closed, maxB: Math.max(0, ...runs.map((r) => r.length)), bRuns: runs.length, fps };
}

const kbps = (bps) => Math.round(Number(bps) / 1000);

/** Returns {ok, checks:[{name, ok, expected, actual}]}. `preset` adds that preset's checks; explicit width/height/fps override its size and fps. */
export function probeSpec(file, { width, height, durationMs, toleranceFrames = 1, fps, audio = true, preset } = {}) {
  const exp = preset ? presetExpect(preset, { fps, width, height }) : null;
  if (preset && !exp) throw new CliError(`unknown preset '${preset}' — one of ${Object.keys(PRESETS).join(', ')}`, EXIT.USAGE);
  if (exp) ({ width, height, fps } = exp);
  const info = probe(file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const checks = [];
  const add = (name, ok, expected, actual) => checks.push({ name, ok: !!ok, expected, actual });
  add('video codec', v?.codec_name === 'h264', 'h264', v?.codec_name ?? 'none');
  add('video profile', v?.profile === 'High', 'High', v?.profile ?? 'none');
  add('pixel format', v?.pix_fmt === 'yuv420p', 'yuv420p', v?.pix_fmt ?? 'none');
  if (audio) {
    add('audio codec', a?.codec_name === 'aac', 'aac', a?.codec_name ?? 'none');
    add('audio sample rate', Number(a?.sample_rate) === 48000, '48000', a?.sample_rate ?? 'none');
  }
  const boxes = topBoxes(file);
  const moov = boxes.indexOf('moov'), mdat = boxes.indexOf('mdat');
  add('faststart (moov before mdat)', moov >= 0 && mdat >= 0 && moov < mdat, 'moov<mdat', boxes.join(','));
  if (width) add('width', v?.width === width, String(width), String(v?.width));
  if (height) add('height', v?.height === height, String(height), String(v?.height));
  const rate = v ? fpsOf(v) : 0;
  if (fps) add('fps', Math.abs(rate - fps) < 0.01, String(fps), rate.toFixed(3));
  if (durationMs !== undefined) {
    const frames = Number(v?.nb_frames);
    const actualMs = Number.isFinite(frames) && frames > 0 && rate ? (frames / rate) * 1000 : Number(info.format.duration) * 1000;
    const tol = (toleranceFrames / (rate || 30)) * 1000;
    add(`duration (±${toleranceFrames} frame)`, Math.abs(actualMs - durationMs) <= tol + 0.5, `${durationMs} ms`, `${Math.round(actualMs)} ms`);
  }
  if (exp) presetChecks(file, exp, { v, a, audio, add });
  return { ok: checks.every((c) => c.ok), file, preset: preset ?? null, checks };
}

/** The preset's encode, as far as the file shows it. */
function presetChecks(file, exp, { v, a, audio, add }) {
  const p = `[${exp.preset}]`;
  if (audio) {
    add(`${p} audio profile`, a?.profile === 'LC', 'LC', a?.profile ?? 'none');
    add(`${p} audio channels`, Number(a?.channels) === exp.channels, String(exp.channels), String(a?.channels ?? 'none'));
    // AAC is variable rate: ffmpeg's encoder spends only what the sound needs (a silent track
    // measures ~2 kbps), so the preset's bitrate is a ceiling (+15 %), not a floor
    const ak = kbps(a?.bit_rate);
    add(`${p} audio bitrate ≤ ${exp.audioKbps} kbps +15%`, a && ak > 0 && ak <= exp.audioKbps * 1.15, `≤ ${Math.round(exp.audioKbps * 1.15)} kbps`, `${ak} kbps`);
  }
  add(`${p} progressive`, (v?.field_order ?? 'progressive') === 'progressive', 'progressive', v?.field_order ?? 'unknown');
  const x = x264Options(file);
  const pre = PRESETS[exp.preset].video;
  if (exp.videoKbps) {
    add(`${p} encoder rate control (x264 SEI)`, x?.rc === 'abr' && Number(x?.bitrate) === exp.videoKbps && Number(x?.vbv_maxrate) === exp.videoMaxKbps,
      `rc=abr bitrate=${exp.videoKbps} vbv_maxrate=${exp.videoMaxKbps}`, x ? `rc=${x.rc} bitrate=${x.bitrate} vbv_maxrate=${x.vbv_maxrate}` : 'no x264 SEI');
    add(`${p} CABAC (x264 SEI)`, x?.cabac === '1', 'cabac=1', x ? `cabac=${x.cabac}` : 'no x264 SEI');
    // VBR about the target; screen content often needs far less, so the band's hard edge is the peak
    const vk = kbps(v?.bit_rate);
    add(`${p} video bitrate ≤ ${exp.videoMaxKbps} kbps peak`, v && vk > 0 && vk <= exp.videoMaxKbps, `≤ ${exp.videoMaxKbps} kbps`, `${vk} kbps`);
    const g = gopInfo(file, exp.fps);
    const body = g.gops.slice(0, -1); // the last GOP may be cut short by the end of the take
    add(`${p} GOP length = ${exp.gop} frames (half of ${exp.fps} fps)`, g.gops.length > 0 && body.every((n) => n === exp.gop) && g.gops.at(-1) <= exp.gop,
      `every keyframe ${exp.gop} frames apart`, g.gops.length ? `${[...new Set(g.gops)].join('/')} frames` : 'one keyframe');
    add(`${p} closed GOP`, g.closed, 'no frame reorders across a keyframe', g.closed ? 'closed' : 'open');
    add(`${p} ${exp.bframes} consecutive B-frames`, g.maxB === exp.bframes, `max B run ${exp.bframes}`, `max B run ${g.maxB} (${g.bRuns} runs)`);
    const elst = editLists(file);
    add(`${p} no edit lists`, elst === 0, '0 elst', `${elst} elst`);
  } else {
    add(`${p} encoder rate control (x264 SEI)`, x?.rc === 'crf' && Number(x?.crf) === pre.crf, `rc=crf crf=${pre.crf}`, x ? `rc=${x.rc} crf=${x.crf}` : 'no x264 SEI');
  }
}

const spec = {
  name: 'probe-spec',
  summary: 'check an MP4 against the peak-media delivery spec',
  usage: 'probe-spec [options] <file.mp4>',
  description: `
Checks H.264 High, yuv420p, AAC 48 kHz and faststart, plus any size/fps/duration given. Exit 0 if
every check passes, 1 if any fails.
--preset web|youtube|hifi (video-capture's presets) also expects the preset's size and fps and
checks its encode: AAC-LC stereo at no more than the preset's bitrate +15 % (AAC is variable rate,
so a quiet or silent track measures far less), progressive, and the x264 rate control the encoder
wrote into the stream (its "x264 - core" SEI: crf for web/hifi; abr bitrate and vbv_maxrate plus
CABAC for youtube). For youtube it also checks, with ffprobe: the video bitrate is at most the VBR
peak; every keyframe is exactly half the frame rate apart (keyframe packets' pts, -show_entries
packet=pts,flags); the GOP is closed (no packet after a keyframe in decode order has an earlier
pts); the longest run of B-frames is 2 (frame pict_type in display order, -show_entries
frame=pict_type); and the file has no edit lists (no elst box in moov/trak/edts).
--size/--width/--height/--fps given with --preset override its size and fps (a take captured with
--viewport/--fps); the encode checks stay the preset's.`,
  options: {
    preset: { type: 'string', arg: 'web|youtube|hifi', choices: Object.keys(PRESETS), desc: 'Also check this video-capture preset\'s size, fps and encode' },
    width: { type: 'number', arg: 'px', desc: 'Expected video width' },
    height: { type: 'number', arg: 'px', desc: 'Expected video height' },
    size: { type: 'string', arg: 'WxH', desc: 'Expected size, e.g. 1280x720 (same as --width/--height)' },
    fps: { type: 'number', desc: 'Expected frame rate' },
    'duration-ms': { type: 'number', arg: 'ms', desc: 'Expected duration' },
    'tolerance-frames': { type: 'number', arg: 'n', desc: 'Duration tolerance in frames', default: 1 },
    'no-audio': { type: 'boolean', desc: 'Skip the audio checks (picture-only files such as plate renders)' },
    json: { type: 'boolean', desc: 'Print the result as JSON' },
  },
  positionals: { min: 1, max: 1 },
  examples: ['probe-spec out/final.mp4 --size 1280x720 --duration-ms 3000', 'probe-spec take.mp4 --preset youtube', 'probe-spec take.mp4 --preset youtube --size 1280x720 --fps 25'],
};

if (isMain(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [file] }) => {
    if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file`);
    let { width, height } = values;
    if (values.size) {
      const m = /^(\d+)x(\d+)$/.exec(values.size);
      if (!m) throw new CliError(`--size expects WxH, e.g. 1280x720, got '${values.size}'`, EXIT.USAGE);
      [width, height] = [Number(m[1]), Number(m[2])];
    }
    requireFfmpeg();
    const r = probeSpec(file, { width, height, fps: values.fps, durationMs: values['duration-ms'], toleranceFrames: values['tolerance-frames'], audio: !values['no-audio'], preset: values.preset });
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      for (const c of r.checks) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}: ${c.actual}${c.ok ? '' : ` (expected ${c.expected})`}\n`);
      process.stdout.write(r.ok ? `PASS  ${file}\n` : `FAIL  ${file}\n`);
    }
    return r.ok ? EXIT.OK : EXIT.FAIL;
  });
}
