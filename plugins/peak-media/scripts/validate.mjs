#!/usr/bin/env node
// validate — check peak-media contract files (spine manifest, plates.json, brand pack) against v1.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { runCli, CliError, EXIT } from '../lib/cli.mjs';
import { validateFile, validateDoc, fromLegacyNarration, KINDS } from '../lib/schemas.mjs';

const spec = {
  name: 'validate',
  summary: 'check peak-media contract files against their v1 schemas',
  usage: 'validate [options] <file|brand-pack-dir>...',
  description: `
The contract is inferred from the file name (*manifest*.json / *beatgrid*.json -> spine,
*plates*.json -> plates, brand*.json or a folder -> brand) unless --schema is given.
Beyond the schema it checks cross-references: beat/clip links, plate beats against the
spine, and that every brand-pack file exists and tokens.css defines the required properties.
Exit 0 when every file is valid, 1 when any is invalid, 2 on usage errors.`,
  options: {
    schema: { type: 'string', arg: 'spine|plates|brand', desc: 'Contract to validate against (skips name inference)', choices: Object.keys(KINDS) },
    'from-legacy': { type: 'boolean', desc: 'Treat inputs as legacy narration.json and validate the mapped v1 spine manifest' },
    out: { type: 'string', arg: 'file', desc: 'With --from-legacy and one input: write the mapped manifest here' },
    json: { type: 'boolean', desc: 'Print results as JSON' },
    quiet: { type: 'boolean', short: 'q', desc: 'Print only failures' },
  },
  positionals: { min: 1, max: Infinity },
  examples: [
    'validate spine/manifest.json plates.json',
    'validate --schema brand ./my-brand-pack',
    'validate --from-legacy narration.json --out spine/manifest.json',
  ],
};

await runCli(spec, async ({ values, positionals }) => {
  if (values.out && !(values['from-legacy'] && positionals.length === 1)) {
    throw new CliError('--out needs --from-legacy and exactly one input', EXIT.USAGE);
  }
  const results = [];
  for (const file of positionals) {
    if (values['from-legacy']) {
      if (!existsSync(file)) throw new CliError(`cannot read ${file}: no such file`);
      let legacy;
      try { legacy = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new CliError(`${file} is not valid JSON: ${e.message}`); }
      if (!Array.isArray(legacy?.clips)) throw new CliError(`${file} has no clips[] — not a legacy narration.json`);
      const doc = fromLegacyNarration(legacy);
      const r = { ...(await validateDoc('spine', doc)), file };
      if (r.ok && values.out) writeFileSync(values.out, JSON.stringify(doc, null, 2) + '\n');
      results.push(r);
    } else {
      results.push(await validateFile(file, values.schema));
    }
  }
  if (values.json) {
    process.stdout.write(JSON.stringify(results.map(({ file, kind, ok, errors }) => ({ file, kind, ok, errors })), null, 2) + '\n');
  } else {
    for (const r of results) {
      if (r.ok) { if (!values.quiet) process.stdout.write(`ok    ${r.file} (${r.kind} v1)\n`); continue; }
      process.stdout.write(`FAIL  ${r.file} (${r.kind} v1)\n`);
      for (const e of r.errors) process.stdout.write(`      ${e.field}: ${e.message}\n`);
    }
  }
  return results.every((r) => r.ok) ? EXIT.OK : EXIT.FAIL;
});
