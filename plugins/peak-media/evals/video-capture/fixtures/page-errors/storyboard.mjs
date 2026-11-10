// Click the broken button once and let its errors land (AC-W2V-23). The page is --url seven.html
// (7 TypeErrors) or many.html (25).
export const url = './seven.html';

export default async function storyboard({ beat, click, wait }) {
  await beat('boom', async () => { await click('#boom'); await wait(800); });
}
