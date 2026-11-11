// AC-W2V-06: one hash-route change (click #go) and one goto (page2.html), each inside a beat, so
// the cursor and the caption must carry across both navigations without doubling up.
export const url = './index.html';

export default async function storyboard({ beat, click, point, goto, wait }) {
  await beat('home', async () => {
    await point('#go');
  });
  await beat('details', async () => {
    await click('#go');           // hash route: same document
    await point('#next');
  });
  await beat('page-two', async () => {
    await goto('page2.html');     // a real page load
    await point('#ok');
    await wait(600);
  });
}
