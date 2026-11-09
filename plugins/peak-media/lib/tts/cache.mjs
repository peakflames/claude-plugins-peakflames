// TTS clip cache (DEC-12). Key: sha256(model \0 voice \0 style \0 text) + '.wav'.
// Written to ~/.cache/peak-media/tts/; also read (never written) from the legacy
// ~/.cache/web2video/tts/ and ~/.cache/record-website-interaction/tts/.
//
// Overrides (tests must use these so they never touch the real home cache):
//   PEAK_MEDIA_TTS_CACHE        the read/write cache dir
//   PEAK_MEDIA_TTS_LEGACY_DIRS  read-only dirs, path.delimiter-separated ('' = none)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, renameSync, copyFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function cacheKey({ model, voice, style = '', text }) {
  return `${createHash('sha256').update([model, voice, style ?? '', text].join('\0')).digest('hex')}.wav`;
}

export function defaultCacheDir(env = process.env) {
  return env.PEAK_MEDIA_TTS_CACHE || path.join(os.homedir(), '.cache', 'peak-media', 'tts');
}

export function legacyCacheDirs(env = process.env) {
  if (env.PEAK_MEDIA_TTS_LEGACY_DIRS !== undefined) return env.PEAK_MEDIA_TTS_LEGACY_DIRS.split(path.delimiter).filter(Boolean);
  const home = os.homedir();
  return [path.join(home, '.cache', 'web2video', 'tts'), path.join(home, '.cache', 'record-website-interaction', 'tts')];
}

const isFile = (p) => existsSync(p) && statSync(p).isFile() && statSync(p).size > 44;

/** First dir holding `file`: {path, legacy} or null. */
export function lookup(file, cacheDir, legacyDirs) {
  const own = path.join(cacheDir, file);
  if (isFile(own)) return { path: own, legacy: false };
  for (const d of legacyDirs) {
    const p = path.join(d, file);
    if (isFile(p)) return { path: p, legacy: true };
  }
  return null;
}

/** Atomic write into the cache dir. */
export function store(cacheDir, file, buf) {
  mkdirSync(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, file);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, buf);
  renameSync(tmp, dest);
  return dest;
}

/** Copy a legacy hit into the plugin cache (the legacy dir stays untouched). */
export function adopt(cacheDir, file, src) {
  mkdirSync(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, file);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  copyFileSync(src, tmp);
  renameSync(tmp, dest);
  return dest;
}
