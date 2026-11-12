import { load, parse, save } from '../store.js';

export const summary = 'finish <number> --on <YYYY-MM-DD>   mark a book finished';
export function run(args, io) {
  const { flags, words } = parse(args);
  if (!words[0] || !/^\d{4}-\d{2}-\d{2}$/.test(flags.on ?? '')) {
    io.stderr.write(`Error: finish needs a book number and --on YYYY-MM-DD. Example: shelf finish 2 --on 2026-10-14\n`);
    return 2;
  }
  const shelf = load();
  const book = /^\d+$/.test(words[0]) ? shelf.books[Number(words[0]) - 1] : undefined;
  if (!book) {
    io.stderr.write(`Error: no book numbered ${words[0]}. Run 'shelf list' to see the numbers.\n`);
    return 1;
  }
  book.finished = flags.on;
  save(shelf);
  io.stdout.write(`Finished ${book.title}\n`);
  return 0;
}
