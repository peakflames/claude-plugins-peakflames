import fs from 'node:fs';
import { esc, load, parse } from '../store.js';

export const summary = 'chart --out <file>   draw the pages finished each month';
export function run(args, io) {
  const { flags } = parse(args);
  if (!flags.out) { io.stderr.write(`Error: chart needs --out <file>. Example: shelf chart --out chart.html\n`); return 2; }
  const months = new Map();
  for (const b of load().books) if (b.finished) months.set(b.finished.slice(0, 7), (months.get(b.finished.slice(0, 7)) ?? 0) + b.pages);
  const rows = [...months].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...rows.map(([, n]) => n));
  const W = 120; const H = 240; const top = 30; const height = top + H + 40;
  const bars = rows.map(([month, pages], i) => {
    const h = Math.round((pages / max) * H); const x = 20 + i * W;
    return `<rect class="bar" x="${x}" y="${top + H - h}" width="80" height="${h}" fill="#4a7"/>\n<text x="${x + 40}" y="${top + H + 24}" text-anchor="middle">${esc(month)}: ${pages} pages</text>`;
  }).join('\n');
  fs.writeFileSync(flags.out, `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Pages finished each month</title>
<style>body { font: 14px system-ui, sans-serif; margin: 2rem; } text { font-size: 12px; }</style></head><body>
<h1>Pages finished each month</h1>
<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, rows.length) * W + 40}" height="${height}" role="img">
${bars}
</svg>
</body></html>
`);
  io.stdout.write(`Wrote ${flags.out}\n`);
  return 0;
}
