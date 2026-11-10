#!/usr/bin/env node
// probe-spec — assert an MP4 meets the delivery spec (D7): H.264 High, yuv420p,
// AAC 48 kHz, faststart (moov before mdat), size, and duration within ±N frames.
import { openSync, readSync, closeSync, fstatSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT } from '../cli.mjs';
import { probe, fpsOf, requireFfmpeg } from '../ffmpeg.mjs';

/** Top-level MP4 box order, e.g. ['ftyp','moov','mdat']. */
export function topBoxes(file) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const out = [];
    let pos = 0;
    const hdr = Buffer.alloc(16);
    while (pos + 8 <= size && out.length < 64) {
      readSync(fd, hdr, 0, 16, pos);
      let len = hdr.readUInt32BE(0);
      const type = hdr.toString('latin1', 4, 8);
      if (len === 1) len = Number(hdr.readBigUInt64BE(8));
      else if (len === 0) len = size - pos;
      if (len < 8) break;
      out.push(type);
      pos += len;
    }
    return out;
  } finally { closeSync(fd); }
}

/** Returns {ok, checks:[{name, ok, expected, actual}]} */
export function probeSpec(file, { width, height, durationMs, toleranceFrames = 1, fps, audio = true } = {}) {
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
  return { ok: checks.every((c) => c.ok), file, checks };
}

const spec = {
  name: 'probe-spec',
  summary: 'check an MP4 against the peak-media delivery spec',
  usage: 'probe-spec [options] <file.mp4>',
  description: 'Checks H.264 High, yuv420p, AAC 48 kHz and faststart, plus any size/fps/duration given. Exit 0 if every check passes, 1 if any fails.',
  options: {
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
  examples: ['probe-spec out/final.mp4 --size 1280x720 --duration-ms 3000'],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, ({ values, positionals: [file] }) => {
    if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file`);
    let { width, height } = values;
    if (values.size) {
      const m = /^(\d+)x(\d+)$/.exec(values.size);
      if (!m) throw new CliError(`--size expects WxH, e.g. 1280x720, got '${values.size}'`, EXIT.USAGE);
      [width, height] = [Number(m[1]), Number(m[2])];
    }
    requireFfmpeg();
    const r = probeSpec(file, { width, height, fps: values.fps, durationMs: values['duration-ms'], toleranceFrames: values['tolerance-frames'], audio: !values['no-audio'] });
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      for (const c of r.checks) process.stdout.write(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}: ${c.actual}${c.ok ? '' : ` (expected ${c.expected})`}\n`);
      process.stdout.write(r.ok ? `PASS  ${file}\n` : `FAIL  ${file}\n`);
    }
    return r.ok ? EXIT.OK : EXIT.FAIL;
  });
}
