// AC-W2V-07: one animated scrollBy of a 120-row container: 1500 px in 600 ms.
export const url = './index.html';

export default async function storyboard({ beat, scrollBy }) {
  await beat('scroll', async () => {
    await scrollBy('#list', { y: 1500, ms: 600 });
  });
}
