#!/usr/bin/env node
// AC-ASM-06 listening gate (manual): build the F1 video with a spoken narration (macOS `say`,
// offline; tones elsewhere), a synthetic music bed and synthetic SFX hits, then run the music
// pass and the music + SFX pass with remux-audio, and assemble the final with both stems.
// Usage: node listen-mix.mjs <listen-dir (MP4s, outside the repo)> <evidence-dir (levels JSON)>
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../helpers/run.mjs';
import { makeF1Project, musicWav, sfxWav, ff, F1 } from './fixtures.mjs';

const [listen, evidence] = process.argv.slice(2).map((p) => path.resolve(p));
if (!listen || !evidence) { process.stderr.write('usage: listen-mix.mjs <listen-dir> <evidence-dir>\n'); process.exit(2); }
rmSync(listen, { recursive: true, force: true });
mkdirSync(listen, { recursive: true });
mkdirSync(evidence, { recursive: true });
const node = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${script} ${args.join(' ')}\n${r.stderr}`);
  return r.stdout;
};
const ebur = (f) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-i', f, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const g = (re) => Number(re.exec(s)?.[1]);
  return { integratedLufs: g(/I:\s*(-?[\d.]+) LUFS/), lraLu: g(/LRA:\s*(-?[\d.]+) LU/), truePeakDbfs: g(/Peak:\s*(-?[\d.]+) dBFS/) };
};

const proj = path.join(listen, 'project');
makeF1Project(proj);
const manifest = JSON.parse(readFileSync(path.join(F1, 'spine', 'manifest.json'), 'utf8'));
let narrationSource = 'tones (no macOS say)';
if (spawnSync('say', ['-v', '?']).status === 0) {
  // one spoken clip per manifest clip, fitted into its window, silence elsewhere
  const clips = manifest.clips.map((c) => {
    const aiff = path.join(listen, `clip${c.n}.aiff`);
    spawnSync('say', ['-v', 'Samantha', '-r', '215', '-o', aiff, c.text]);
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', aiff], { encoding: 'utf8' }).stdout) * 1000;
    return { c, aiff, tempo: Math.max(1, dur / (c.durationMs - 40)) };
  });
  const args = [];
  clips.forEach((x) => args.push('-i', x.aiff));
  const fg = clips.map((x, i) => `[${i}:a]aresample=24000,atempo=${x.tempo.toFixed(4)},atrim=end=${(x.c.durationMs - 20) / 1000},asetpts=N/SR/TB,adelay=${x.c.startMs}:all=1,apad=whole_dur=${manifest.totalMs / 1000}[a${i}]`).join(';')
    + `;${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0[n]`;
  ff([...args, '-filter_complex', fg, '-map', '[n]', '-ac', '1', '-t', String(manifest.totalMs / 1000), '-c:a', 'pcm_s16le', path.join(proj, 'spine', 'narration.wav')]);
  narrationSource = `macOS say (Samantha, 215 wpm, atempo ${clips.map((x) => x.tempo.toFixed(2)).join('/')}) fitted to the F1 clip windows`;
}
const music = musicWav(path.join(listen, 'music.wav'), 22);
const sfx = sfxWav(path.join(listen, 'sfx.wav'), [6500, 14000], 20);

const A = 'skills/video-assemble/scripts/assemble.mjs', R = 'skills/video-assemble/scripts/remux-audio.mjs';
node(A, [proj]); // narration-only review + final
const review = path.join(proj, 'review', 'review.mp4');
const pass1 = path.join(listen, 'AC-ASM-06-pass1-music.mp4');
const pass2 = path.join(listen, 'AC-ASM-06-pass2-music-sfx.mp4');
const SFX_DB = '-6';
const l1 = JSON.parse(node(R, [review, '--music', music, '-o', pass1, '--json']));
const l2 = JSON.parse(node(R, [review, '--music', music, '--sfx', sfx, '--sfx-db', SFX_DB, '-o', pass2, '--json']));
const rep = JSON.parse(node(A, [proj, '--music', music, '--sfx', sfx, '--sfx-db', SFX_DB, '--json']));
const final = path.join(listen, 'AC-ASM-06-final.mp4');
copyFileSync(rep.final.file, final);
copyFileSync(review, path.join(listen, 'AC-ASM-06-pass0-narration-only.mp4'));

const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'string' ? v.replace(listen, '<listen>') : v)));
const out = {
  ac: 'AC-ASM-06', status: 'blocked: needs user listen',
  narration: narrationSource, music: 'synthetic A-minor pad, 2 Hz pulse (helpers/fixtures.mjs musicWav)', sfx: `synthetic whoosh + low thud into each cut (6.5 s, 14.0 s), --sfx-db ${SFX_DB}`,
  targets: { narrationLufs: -16, musicLufsBeforeDucking: -28, truePeakCeilingDbfs: -1 },
  files: {
    'AC-ASM-06-pass0-narration-only.mp4': ebur(path.join(listen, 'AC-ASM-06-pass0-narration-only.mp4')),
    'AC-ASM-06-pass1-music.mp4': ebur(pass1),
    'AC-ASM-06-pass2-music-sfx.mp4': ebur(pass2),
    'AC-ASM-06-final.mp4': ebur(final),
  },
  pass1MusicLevels: strip(l1),
  pass2MusicSfxLevels: strip(l2),
};
writeFileSync(path.join(evidence, 'AC-ASM-06-levels.json'), JSON.stringify(out, null, 2) + '\n');
for (const f of ['clip1.aiff', 'clip2.aiff', 'clip3.aiff']) rmSync(path.join(listen, f), { force: true });
process.stdout.write(`${listen}\n${JSON.stringify(out.files, null, 2)}\n`);
