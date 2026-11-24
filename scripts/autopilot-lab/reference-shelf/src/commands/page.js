import fs from 'node:fs';
import { esc, load, parse } from '../store.js';

export const summary = 'page --out <file>   write the reading list as a page';
const item = (b) => `<li><span class="title">${esc(b.title)}</span> <span class="author">${esc(b.author)}</span>${b.finished ? ` <span class="date">finished ${esc(b.finished)}</span>` : ''}</li>`;
export function run(args, io) {
  const { flags } = parse(args);
  if (!flags.out) { io.stderr.write(`Error: page needs --out <file>. Example: shelf page --out shelf.html\n`); return 2; }
  const { books } = load();
  const section = (name, cls, list) => (list.length ? `<h2>${name}</h2>\n<ul class="${cls}">\n${list.map(item).join('\n')}\n</ul>\n` : '');
  fs.writeFileSync(flags.out, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Reading list</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
li { margin: .4rem 0; }
.title { font-weight: 600; }
.author { color: #555; }
.finished .title { text-decoration: line-through; color: #888; }
.date { font-size: .85em; color: #888; }
</style></head><body>
<h1>Reading list</h1>
${section('Still to read', 'unfinished', books.filter((b) => !b.finished))}${section('Finished', 'finished', books.filter((b) => b.finished))}</body></html>
`);
  io.stdout.write(`Wrote ${flags.out}\n`);
  return 0;
}
