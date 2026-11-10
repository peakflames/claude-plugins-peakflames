#!/usr/bin/env node
// audio-options — stage 8's offer list (DEC-39): the active brand pack's tracks and SFX by name,
// or the audio files in one folder the user named. Never searches the disk.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli, CliError, EXIT } from '../../../lib/cli.mjs';

const AUDIO_RE = /\.(wav|mp3|m4a|aac|flac|ogg|opus|aiff?)$/i;

function readJson(file, what) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new CliError(`${what} ${file} is not valid JSON: ${e.message}`); }
}

/** Resolve a brand pack argument (folder, brand.json, or a project's plates.json / folder) to its brand.json. */
export function brandJsonOf(arg) {
  const p = path.resolve(arg);
  if (!existsSync(p)) throw new CliError(`${arg}: no such file or folder`);
  const isDir = statSync(p).isDirectory();
  if (isDir && existsSync(path.join(p, 'brand.json'))) return path.join(p, 'brand.json');
  const plates = isDir ? path.join(p, 'plates.json') : (/plates.*\.json$/i.test(p) ? p : null);
  if (plates && existsSync(plates)) {
    const brand = readJson(plates, 'plates').brand;
    if (!brand) throw new CliError(`${plates} names no "brand" pack`);
    return brandJsonOf(path.resolve(path.dirname(plates), brand));
  }
  if (!isDir) return p;
  throw new CliError(`${arg}: no brand.json or plates.json here`);
}

/** The pack's offerable audio: x-tracks entries and the SFX manifest named by x-sfx. Paths absolute. */
export function packAudio(brandJson) {
  const dir = path.dirname(brandJson);
  const brand = readJson(brandJson, 'brand pack');
  const tracks = (Array.isArray(brand['x-tracks']) ? brand['x-tracks'] : []).map((t) => ({
    kind: 'music', title: t.title ?? path.basename(t.file ?? ''), file: path.resolve(dir, t.file ?? ''), credit: t.credit ?? null, use: t.use ?? null, levels: t.levels ?? null,
  }));
  const sfx = [];
  const ref = brand['x-sfx'];
  const manifest = typeof ref === 'string' ? ref : ref?.manifest;
  if (manifest) {
    const mf = path.resolve(dir, manifest);
    if (existsSync(mf)) {
      const m = readJson(mf, 'SFX manifest');
      const mdir = path.dirname(mf);
      for (const s of Array.isArray(m) ? m : m.files ?? []) {
        sfx.push({ kind: 'sfx', title: s.title ?? path.basename(s.file ?? ''), file: path.resolve(mdir, s.file ?? ''), licence: s.licence ?? s.license ?? null, source: s.source ?? null, durationMs: s.durationMs ?? null, peakOffsetMs: s.peakOffsetMs ?? null });
      }
    }
  }
  const missing = [...tracks, ...sfx].filter((x) => !existsSync(x.file)).map((x) => x.file);
  return { pack: brand.name, brandJson, rules: brand.music?.rules ? path.resolve(dir, brand.music.rules) : null, tracks, sfx, missing };
}

/** Audio files directly inside one folder the user named (not recursive). */
export function folderAudio(folder) {
  const d = path.resolve(folder);
  if (!existsSync(d) || !statSync(d).isDirectory()) throw new CliError(`${folder}: no such folder`);
  return readdirSync(d).filter((f) => AUDIO_RE.test(f) && statSync(path.join(d, f)).isFile()).sort().map((f) => ({ title: f, file: path.join(d, f) }));
}

const spec = {
  name: 'audio-options',
  summary: 'list the music and SFX stage 8 may offer: the brand pack\'s, or one folder the user named',
  usage: 'audio-options [options] <brand-pack|brand.json|plates.json|project-folder>',
  description: `
Stage 8 (DEC-39) offers, in this order: the active brand pack's tracks (brand.json "x-tracks":
title, file, credit, levels) and SFX (the manifest named by "x-sfx"); else the audio files in one
folder the user names (--folder, not recursive); else narration only. It never searches the disk.
Exit 0 with the list (possibly empty), 1 when a listed file is missing, 2 usage.`,
  options: {
    folder: { type: 'string', arg: 'dir', desc: 'List the audio files directly in this folder the user named, instead of the pack' },
    json: { type: 'boolean', desc: 'Print the list as JSON' },
  },
  positionals: { min: 0, max: 1 },
  examples: [
    'audio-options plates.json',
    'audio-options ~/brand/my-pack',
    'audio-options --folder ~/Music/approved',
  ],
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runCli(spec, async ({ values, positionals: [target] }) => {
    if (values.folder) {
      const files = folderAudio(values.folder);
      if (values.json) process.stdout.write(JSON.stringify({ folder: path.resolve(values.folder), files }, null, 2) + '\n');
      else if (!files.length) process.stdout.write(`no audio files in ${path.resolve(values.folder)} — narration only, or ask for another folder\n`);
      else for (const f of files) process.stdout.write(`file   ${f.title}  ${f.file}\n`);
      return EXIT.OK;
    }
    if (!target) throw new CliError('give a brand pack, brand.json, plates.json or project folder (or --folder <dir>)', EXIT.USAGE);
    const r = packAudio(brandJsonOf(target));
    if (values.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    else {
      process.stdout.write(`pack   ${r.pack} (${r.brandJson})\n`);
      for (const t of r.tracks) process.stdout.write(`music  ${t.title}  ${t.file}${t.levels ? `  levels: --music-lufs ${t.levels.musicLufs} --duck-db ${t.levels.duckDb}` : ''}${t.credit ? `  credit: ${t.credit}` : ''}\n`);
      for (const s of r.sfx) process.stdout.write(`sfx    ${s.title}  ${s.file}${s.licence ? `  licence: ${s.licence}` : ''}${s.peakOffsetMs != null ? `  peak @${s.peakOffsetMs} ms` : ''}\n`);
      if (!r.tracks.length && !r.sfx.length) process.stdout.write('no pack tracks or SFX — ask the user for a folder (--folder), else narration only\n');
    }
    if (r.missing.length) throw new CliError(`pack lists audio that is missing: ${r.missing.join(', ')}`);
    return EXIT.OK;
  });
}

export { spec };
