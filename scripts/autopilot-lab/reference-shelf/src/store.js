import fs from 'node:fs';

const FILE = 'shelf.json';
export const load = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { books: [] });
export const save = (shelf) => fs.writeFileSync(FILE, JSON.stringify(shelf, null, 2) + '\n');
/** `--name value` pairs and the words that are not part of one. */
export function parse(args) {
  const flags = {}; const words = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; i += 1; } else words.push(args[i]);
  }
  return { flags, words };
}
export const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
