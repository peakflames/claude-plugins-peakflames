// Example UI demo: a captioned tour of the small to-do app in index.html (served on 127.0.0.1).
// The beats and their captions live in script.md; captions mode is the default and needs no key:
//   capture --storyboard storyboard.mjs --script script.md --mp4 ui-demo.mp4                    (captions)
//   capture --storyboard storyboard.mjs --script script.md --mp4 ui-demo.mp4 --no-captions      (silent)
//   capture --storyboard storyboard.mjs --script script.md --mp4 ui-demo.mp4 --caption-css captions-alt.css
// Each beat shows its caption, plays the action under it, and holds for the caption's reading
// time (about 3 words/s, at least 1.5 s) or until the action ends, whichever is later.

export const url = './index.html';

export default async function storyboard({ beat, click, type, wait, page }) {
  await beat('add', async () => {
    await type('#new', 'Buy milk', { enter: true });
    await type('#new', 'Call the plumber', { enter: true });
  });
  await beat('done', async () => {
    await click(page.getByLabel('Buy milk'));
  });
  await beat('filter', async () => {
    await click('[data-filter=active]');
    await wait(1100);
    await click('[data-filter=done]');
  });
  await beat('clear', async () => {
    await click('#clear');
    await click('[data-filter=all]');
  });
  await wait(500); // hold the final state
}
