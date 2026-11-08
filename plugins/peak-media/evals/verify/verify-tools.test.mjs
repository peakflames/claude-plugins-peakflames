// WP2 shared verify tools: contact-sheet, probe-spec, check-cuts, setup.sh (AC-SKL-03/04, AC-BASE-01/03/04/05).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, baseline } from '../helpers/run.mjs';

let dir, cuts, plain;
before(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'pm-verify-'));
  // 4 s: red | blue at 1.0 s (audio silent 0–2 s) | green at 3.0 s (440 Hz tone 2–4 s)
  cuts = path.join(dir, 'cuts.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x240:r=30:d=1', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=green:s=320x240:r=30:d=1',
    '-f', 'lavfi', '-i', "aevalsrc='if(lt(t,2),0,0.5*sin(2*PI*440*t))':s=48000:d=4",
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-map', '3:a',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart', cuts]);
  assert.equal(r.status, 0, r.stderr?.toString());
  plain = path.join(dir, 'plain.mp4'); // no faststart, no audio, wrong profile
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=320x240:r=30:d=1', '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p', plain]);
});

test('contact-sheet: one labelled frame every 0.5 s (supports AC-SKL-03)', () => {
  const out = path.join(dir, 'sheet.jpg');
  const r = run('lib/verify/contact-sheet.mjs', [cuts, '--every', '0.5s', '-o', out, '--json']);
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.frames.map((f) => f.label), ['00.00', '00.50', '01.00', '01.50', '02.00', '02.50', '03.00', '03.50', '03.97']);
  assert.ok(existsSync(out) && statSync(out).size > 1000);
});

test('AC-SKL-04: check-cuts passes the cut in silence and fails the cut over a tone, with its timecode', () => {
  const r = run('lib/verify/check-cuts.mjs', [cuts, '--min-silence-ms', '300', '--json']);
  assert.equal(r.code, 1, 'overall FAIL');
  const j = JSON.parse(r.stdout);
  assert.equal(j.cuts.length, 2, `detected cuts: ${j.cuts.map((c) => c.timecode)}`);
  const [a, b] = j.cuts;
  assert.ok(Math.abs(a.cutMs - 1000) <= 34 && a.ok, 'cut at 1.0 s in silence passes');
  assert.ok(Math.abs(b.cutMs - 3000) <= 34 && !b.ok, 'cut at 3.0 s over tone fails');
  const txt = run('lib/verify/check-cuts.mjs', [cuts, '--min-silence-ms', '300']);
  assert.match(txt.stdout, /FAIL\s+cut at 0:03\.0\d\d/);
  assert.equal(run('lib/verify/check-cuts.mjs', [cuts, '--cuts', '1000', '--min-silence-ms', '300']).code, 0, 'given cut in silence passes');
  assert.equal(run('lib/verify/check-cuts.mjs', [cuts, '--cuts', '1000', '--min-silence-ms', '2500']).code, 1, 'gap shorter than the minimum fails');
});

test('probe-spec: catches a file that misses the spec (not AC-bound)', () => {
  const r = run('lib/verify/probe-spec.mjs', [plain, '--json']);
  assert.equal(r.code, 1);
  const failed = JSON.parse(r.stdout).checks.filter((c) => !c.ok).map((c) => c.name);
  for (const n of ['video profile', 'audio codec', 'faststart (moov before mdat)']) assert.ok(failed.includes(n), n);
});

test('AC-BASE-01: setup.sh baseline (help, version, bad input)', (t) => {
  baseline(t, assert, 'scripts/setup.sh', { flags: ['--check', '--skip-browser', '--data-dir', '--quiet'], badArgs: [['--bogus'], ['--data-dir']] });
  const r = run('scripts/setup.sh', ['--check'], { env: { PEAK_MEDIA_FFMPEG: '/nonexistent/ffmpeg' } });
  assert.equal(r.code, 3);
  assert.match(r.stderr.trim(), /^setup\.sh: ffmpeg not found — install it/);
});

test('AC-BASE-03: contact-sheet baseline', (t) => {
  baseline(t, assert, 'lib/verify/contact-sheet.mjs', { flags: ['--out', '--every', '--count', '--at', '--cols', '--width', '--json'], badArgs: [[], ['nope.mp4'], [cuts, '--every', 'soon'], [cuts, '--cols', '0'], ['--x']] });
  const r = run('lib/verify/contact-sheet.mjs', [cuts], { env: { PEAK_MEDIA_FFMPEG: '/nonexistent/ffmpeg' } });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /ffmpeg not found — install it/);
});

test('AC-BASE-04: probe-spec baseline', (t) => {
  baseline(t, assert, 'lib/verify/probe-spec.mjs', { flags: ['--width', '--height', '--size', '--fps', '--duration-ms', '--tolerance-frames', '--no-audio', '--json'], badArgs: [[], ['nope.mp4'], [cuts, '--size', 'big'], [path.join(dir)]] });
});

test('AC-BASE-05: check-cuts baseline', (t) => {
  baseline(t, assert, 'lib/verify/check-cuts.mjs', { flags: ['--min-silence-ms', '--cuts', '--scene-threshold', '--noise-db', '--json'], badArgs: [[], ['nope.mp4'], [cuts, '--cuts', 'a,b'], [cuts, '--min-silence-ms', 'x']] });
});
