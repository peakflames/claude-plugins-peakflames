import { load } from '../store.js';

export const summary = 'list   print the books, numbered';
export function run(args, io) {
  load().books.forEach((b, i) => io.stdout.write(`${i + 1}. ${b.title} — ${b.author}${b.finished ? ` (finished ${b.finished})` : ''}\n`));
  return 0;
}
