// Shared CLI shell for every peak-media entry point (baseline ACs):
// --help lists every flag, --version prints plugin.json's version, expected
// failures print one actionable line with no stack trace, exit codes are stable.
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The command that runs setup, as printed in "run …" hints (a .mjs path alone won't run on Windows). */
export const setupCommand = (extra = '') => `node "${path.join(PLUGIN_ROOT, 'scripts', 'setup.mjs')}"${extra ? ` ${extra}` : ''}`;

export const EXIT = { OK: 0, FAIL: 1, USAGE: 2, MISSING_PREREQ: 3, UNEXPECTED: 70 };

/** An expected failure: printed as one line, no stack. */
export class CliError extends Error {
  constructor(message, code = EXIT.FAIL) {
    super(message);
    this.code = code;
  }
}

export const usageError = (msg) => new CliError(msg, EXIT.USAGE);

export function pluginVersion() {
  return JSON.parse(readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
}

function renderHelp(spec) {
  const lines = [`${spec.name} — ${spec.summary}`, '', `Usage: ${spec.usage}`, ''];
  if (spec.description) lines.push(spec.description.trim(), '');
  lines.push('Options:');
  const all = { ...spec.options, help: { type: 'boolean', short: 'h', desc: 'Show this help and exit' }, version: { type: 'boolean', desc: 'Print the plugin version and exit' } };
  const rows = Object.entries(all).map(([k, o]) => {
    const flag = `${o.short ? `-${o.short}, ` : '    '}--${k}${o.type !== 'boolean' ? ` <${o.arg ?? (o.type === 'number' ? 'n' : 'value')}>` : ''}`;
    const def = o.default !== undefined && o.type !== 'boolean' ? ` (default: ${o.default})` : '';
    return [flag, `${o.desc}${def}`];
  });
  const w = Math.max(...rows.map((r) => r[0].length)) + 2;
  for (const [f, d] of rows) lines.push(`  ${f.padEnd(w)}${d}`);
  if (spec.examples?.length) lines.push('', 'Examples:', ...spec.examples.map((e) => `  ${e}`));
  return lines.join('\n') + '\n';
}

/**
 * defineCli(spec, main) — spec: {name, summary, usage, description?, options:{flag:{type,desc,short?,default?,arg?,multiple?}},
 * positionals?:{min?,max?}, examples?[]}. main({values, positionals}) may return an exit code.
 */
export async function runCli(spec, main, argv = process.argv.slice(2)) {
  const fail = (e) => {
    if (e instanceof CliError) {
      process.stderr.write(`${spec.name}: ${e.message}\n`);
      if (e.code === EXIT.USAGE) process.stderr.write(`Run '${spec.name} --help' for usage.\n`);
      return e.code;
    }
    if (process.env.PEAK_MEDIA_DEBUG) process.stderr.write(`${e?.stack ?? e}\n`);
    else process.stderr.write(`${spec.name}: unexpected error: ${e?.message ?? e} (set PEAK_MEDIA_DEBUG=1 for a stack trace)\n`);
    return EXIT.UNEXPECTED;
  };
  let code;
  try {
    const options = {};
    for (const [k, o] of Object.entries(spec.options ?? {})) {
      options[k] = { type: o.type === 'number' ? 'string' : o.type, ...(o.short && { short: o.short }), ...(o.multiple && { multiple: true }) };
    }
    options.help = { type: 'boolean', short: 'h' };
    options.version = { type: 'boolean' };
    let parsed;
    try {
      // let number options take negative values: `--noise-db -50` -> `--noise-db=-50`
      const nums = new Set(Object.entries(spec.options ?? {}).filter(([, o]) => o.type === 'number').map(([k]) => `--${k}`));
      const args = [];
      for (let i = 0; i < argv.length; i++) {
        if (nums.has(argv[i]) && /^-\d/.test(argv[i + 1] ?? '')) { args.push(`${argv[i]}=${argv[i + 1]}`); i++; } else args.push(argv[i]);
      }
      parsed = parseArgs({ args, options, allowPositionals: true, strict: true });
    } catch (e) {
      throw usageError(e.message.split('\n')[0].split('. To specify a positional')[0]);
    }
    const { values, positionals } = parsed;
    if (values.help) { process.stdout.write(renderHelp(spec)); code = EXIT.OK; }
    else if (values.version) { process.stdout.write(`${pluginVersion()}\n`); code = EXIT.OK; }
    else {
      for (const [k, o] of Object.entries(spec.options ?? {})) {
        if (values[k] === undefined && o.default !== undefined) values[k] = o.type === 'number' ? String(o.default) : o.default;
        if (o.type === 'number' && values[k] !== undefined) {
          const n = Number(values[k]);
          if (!Number.isFinite(n)) throw usageError(`--${k} expects a number, got '${values[k]}'`);
          values[k] = n;
        }
        if (o.choices && values[k] !== undefined && !o.choices.includes(values[k])) {
          throw usageError(`--${k} must be one of ${o.choices.join(', ')}, got '${values[k]}'`);
        }
      }
      const { min = 0, max = Infinity } = spec.positionals ?? { max: 0 };
      if (positionals.length < min) throw usageError(`expected at least ${min} argument(s), got ${positionals.length}`);
      if (positionals.length > max) throw usageError(`unexpected argument '${positionals[max]}'`);
      code = (await main({ values, positionals })) ?? EXIT.OK;
    }
  } catch (e) {
    code = fail(e);
  }
  process.exitCode = code;
  return code;
}

/** True when the module at metaUrl is the script node was started with (case-insensitive on win32). */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  const a = path.resolve(process.argv[1]), b = fileURLToPath(metaUrl);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
