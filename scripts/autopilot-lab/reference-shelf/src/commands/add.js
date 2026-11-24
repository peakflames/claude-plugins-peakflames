import { load, parse, save } from '../store.js';

export const summary = 'add "<title>" --author "<name>" --pages <n>   add a book to the list';
export function run(args, io) {
  const { flags, words } = parse(args);
  const title = words[0]; const pages = Number(flags.pages);
  if (!title || !flags.author || !Number.isInteger(pages) || pages <= 0) {
    io.stderr.write(`Error: add needs a title, --author and --pages. Example: shelf add "Dune" --author "Frank Herbert" --pages 412\n`);
    return 2;
  }
  const shelf = load();
  if (shelf.books.some((b) => b.title === title)) {
    io.stderr.write(`Error: "${title}" is already on the list. Run 'shelf list' to see it.\n`);
    return 1;
  }
  shelf.books.push({ title, author: flags.author, pages, finished: null });
  save(shelf);
  io.stdout.write(`Added ${title}\n`);
  return 0;
}
