import fs from 'node:fs';
import { load, parse } from '../store.js';

export const summary = 'export --out <file>   write the reading list as CSV';
const field = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
export function run(args, io) {
  const { flags } = parse(args);
  if (!flags.out) { io.stderr.write(`Error: export needs --out <file>. Example: shelf export --out books.csv\n`); return 2; }
  if (fs.existsSync(flags.out)) { io.stderr.write(`Error: ${flags.out} already exists. Choose another name or delete it first.\n`); return 1; }
  const { books } = load();
  fs.writeFileSync(flags.out, ['title,author,pages,finished', ...books.map((b) => [b.title, b.author, b.pages, b.finished].map(field).join(','))].join('\n') + '\n');
  io.stdout.write(`Wrote ${books.length} books to ${flags.out}\n`);
  return 0;
}
