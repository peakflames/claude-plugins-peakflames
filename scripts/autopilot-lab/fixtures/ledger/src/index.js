import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const NAME = 'ledger';
export const VERSION = pkg.version;

/**
 * Run the CLI. Returns the process exit code:
 * 0 success, 1 operational failure, 2 invalid invocation.
 * Commands are added by the epics in docs/implementation-plan/.
 */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  if (argv[0] === '--version') {
    io.stdout.write(`${NAME} v${VERSION}\n`);
    return 0;
  }
  io.stderr.write(`Error: unknown command: ${argv[0] ?? '(none)'}. Try 'ledger --version'.\n`);
  return 2;
}
