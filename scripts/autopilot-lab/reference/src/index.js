// Reference implementation of every ledger command, for the lab's own tests only: it proves the
// oracle tests can be met and gives the fake-driven rehearsal something real to merge. It is never
// copied into a seeded project by `lab.mjs reset`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const NAME = 'ledger';
export const VERSION = pkg.version;

const USAGE = `Usage: ledger <command> [options]

Commands:
  import <csv>                       add a bank CSV export to ledger.json
  categorize                         give each transaction a category from rules.txt
  summary --month YYYY-MM            total per category for one month
  convert --to <currency> [--live]   print amounts in another currency
  chart --month YYYY-MM --out <file> write a bar chart of the month as HTML
  config                             check the settings file

Options:
  --help                             show this text
  --version                          show the version
`;

class Fail extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const money = (cents) => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
const load = () => (fs.existsSync('ledger.json') ? JSON.parse(fs.readFileSync('ledger.json', 'utf8')) : { transactions: [] });
const save = (l) => fs.writeFileSync('ledger.json', JSON.stringify(l, null, 2) + '\n');
const opt = (argv, name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null; };

function parseLine(line) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') quoted = false; else cur += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
function isoDate(s) {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s.trim();
}
function cents(s) {
  const m = s.trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Fail(1, `Error: not an amount: ${s}. Fix the CSV and try again.`);
  return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0')));
}

function doImport(argv, io) {
  const file = argv[1];
  if (!file) throw new Fail(2, 'Error: import needs a CSV file. Try: ledger import bank.csv');
  if (!fs.existsSync(file)) throw new Fail(1, `Error: file not found: ${file}. Check the path and try again.`);
  const ledger = load();
  const key = (t) => `${t.date}\u0000${t.amountCents}\u0000${t.description}`;
  const seen = new Set(ledger.transactions.map(key));
  let added = 0; let skipped = 0;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    if (line === '') continue;
    const [date, amount, description = ''] = parseLine(line);
    const t = { date: isoDate(date), amountCents: cents(amount), description };
    if (seen.has(key(t))) { skipped += 1; continue; }
    seen.add(key(t)); ledger.transactions.push(t); added += 1;
  }
  save(ledger);
  io.stdout.write(`Imported ${added} transactions${skipped ? ` (${skipped} duplicates skipped)` : ''}\n`);
}

const squash = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
function doCategorize(argv, io) {
  if (!fs.existsSync('rules.txt')) throw new Fail(1, 'Error: rules.txt not found. Create it with lines like "groceries: /SAFEWAY/" and try again.');
  const rules = fs.readFileSync('rules.txt', 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([^#:\s][^:]*):\s*\/(.*)\/[a-z]*\s*$/)).filter(Boolean)
    .map((m) => ({ category: m[1].trim(), re: new RegExp(squash(m[2]), 'i') }));
  const ledger = load();
  for (const t of ledger.transactions) t.category = rules.find((r) => r.re.test(squash(t.description)))?.category ?? 'uncategorized';
  save(ledger);
  io.stdout.write(`Categorized ${ledger.transactions.length} transactions\n`);
}

function monthTotals(argv) {
  const month = opt(argv, '--month');
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Fail(2, 'Error: --month must be written as YYYY-MM, for example 2026-10.');
  const totals = new Map();
  for (const t of load().transactions) if (t.date.startsWith(`${month}-`)) totals.set(t.category ?? 'uncategorized', (totals.get(t.category ?? 'uncategorized') ?? 0) + t.amountCents);
  // Spending is shown as a positive number; a refund (positive amount) nets against it.
  return { month, rows: [...totals].map(([category, sum]) => [category, -sum]).sort((a, b) => a[0].localeCompare(b[0])) };
}
function doSummary(argv, io) {
  const { month, rows } = monthTotals(argv);
  if (!rows.length) { io.stdout.write(`No transactions in ${month}\n`); return; }
  const width = Math.max(...rows.map(([c]) => c.length));
  for (const [c, total] of rows) io.stdout.write(`${c.padEnd(width)}  ${money(total).padStart(10)}\n`);
}

async function rates(live) {
  let text;
  if (live) {
    const url = process.env.LEDGER_RATES_URL;
    try {
      if (!url) throw new Error('LEDGER_RATES_URL is not set');
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch (err) { throw new Fail(1, `Error: could not fetch live rates (${err.message}). Run again without --live to use rates.csv.`); }
  } else {
    if (!fs.existsSync('rates.csv')) throw new Fail(1, 'Error: rates.csv not found. Create it with lines like "EUR,0.92" and try again.');
    text = fs.readFileSync('rates.csv', 'utf8');
  }
  return new Map(text.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(',')).map(([c, r]) => [c.trim(), Number(r)]));
}
async function doConvert(argv, io) {
  const to = opt(argv, '--to');
  if (!to) throw new Fail(2, 'Error: convert needs --to <currency>, for example --to EUR.');
  const table = await rates(argv.includes('--live'));
  if (!table.has(to)) throw new Fail(1, `Error: no rate for ${to}. Add a line for it to rates.csv and try again.`);
  for (const t of load().transactions) {
    const v = Math.abs(t.amountCents) * table.get(to);
    const rounded = Math.sign(t.amountCents) * Math.round(Number(v.toFixed(6)));
    io.stdout.write(`${t.date}  ${money(rounded)} ${to}  ${t.description}\n`);
  }
}

function doChart(argv, io) {
  const out = opt(argv, '--out');
  if (!out) throw new Fail(2, 'Error: chart needs --out <file>, for example --out chart.html.');
  const { month, rows } = monthTotals(argv);
  const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v)));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const step = 140; const base = 260;
  const bars = rows.map(([c, v], i) => {
    const h = Math.round((Math.abs(v) / max) * 220);
    return `<rect class="bar" x="${20 + i * step}" y="${base - h}" width="100" height="${h}" fill="#4a7"/>\n<text x="${70 + i * step}" y="${base + 20}" text-anchor="middle" font-size="12">${esc(c)} ${money(v)}</text>`;
  }).join('\n');
  fs.writeFileSync(out, `<!doctype html>\n<html><head><meta charset="utf-8"><title>Spending ${month}</title></head><body>\n<svg xmlns="http://www.w3.org/2000/svg" width="${40 + rows.length * step}" height="300">\n${bars}\n</svg>\n</body></html>\n`);
  io.stdout.write(`Wrote ${out}\n`);
}

function doConfig(argv, io) {
  const file = process.env.LEDGERRC ?? path.join(os.homedir(), '.ledgerrc');
  if (fs.existsSync(file)) {
    let cfg;
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Fail(1, `Error: ${file} is not valid JSON. Fix it or delete it and try again.`); }
    const unknown = Object.keys(cfg).find((k) => !['currency', 'ratesUrl'].includes(k));
    if (unknown) throw new Fail(1, `Error: ${file} has an unknown key "${unknown}". Remove it; the known keys are currency and ratesUrl.`);
    if (cfg.currency !== undefined && !/^[A-Z]{3}$/.test(cfg.currency)) throw new Fail(1, `Error: ${file} has a currency that is not three capital letters. Use a code like EUR.`);
  }
  io.stdout.write('Settings OK\n');
}

/** Run the CLI. Returns the exit code: 0 success, 1 operational failure, 2 invalid invocation. */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const commands = { import: doImport, categorize: doCategorize, summary: doSummary, convert: doConvert, chart: doChart, config: doConfig };
  try {
    if (argv.length === 0) { io.stderr.write(USAGE); return 2; }
    if (argv[0] === '--version') { io.stdout.write(`${NAME} v${VERSION}\n`); return 0; }
    if (argv[0] === '--help') { io.stdout.write(USAGE); return 0; }
    if (!commands[argv[0]]) throw new Fail(2, `Error: unknown command: ${argv[0]}. Try 'ledger --help'.`);
    await commands[argv[0]](argv, io);
    return 0;
  } catch (err) {
    if (!(err instanceof Fail)) throw err;
    io.stderr.write(`${err.message}\n`);
    return err.code;
  }
}
