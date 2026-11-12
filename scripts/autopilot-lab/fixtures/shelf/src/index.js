import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const NAME = 'shelf';
export const VERSION = pkg.version;

/**
 * Run the CLI. Returns the process exit code:
 * 0 success, 1 operational failure, 2 invalid invocation.
 *
 * A command is one file: `src/commands/<name>.js`, exporting
 * `run(args, io)` (returns the exit code) and `summary` (one line for the help text).
 * Adding a command means adding its file; this file does not change.
 */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const [name, ...args] = argv;
  if (name === '--version') {
    io.stdout.write(`${NAME} v${VERSION}\n`);
    return 0;
  }
  if (name && /^[a-z][a-z-]*$/.test(name)) {
    const file = new URL(`./commands/${name}.js`, import.meta.url);
    if (existsSync(file)) return (await import(file.href)).run(args, io);
  }
  io.stderr.write(`Error: unknown command: ${name ?? '(none)'}. Try 'shelf --version'.\n`);
  return 2;
}
