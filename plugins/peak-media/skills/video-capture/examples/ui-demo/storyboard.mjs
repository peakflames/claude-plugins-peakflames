// Example UI demo: a captioned tour of the small to-do app in index.html (served on 127.0.0.1).
// Captions mode is the default and needs no key:
//   capture --storyboard storyboard.mjs --mp4 ui-demo.mp4                    (captions)
//   capture --storyboard storyboard.mjs --mp4 ui-demo.mp4 --no-captions      (silent)
//   capture --storyboard storyboard.mjs --mp4 ui-demo.mp4 --caption-css captions-alt.css
// Each beat: say() shows the caption, the action plays under it, waitForVoice() holds the caption
// for its reading time (about 3 words/s, at least 1.5 s) before the next beat.

export const CAPTIONS = [
  'A small to-do list. Type a task and press Enter.',
  'New tasks land at the bottom of the list.',
  'Tick a task when it is done.',
  'Filters show what is left, or what is done.',
  'Clear done tasks to tidy up.',
];

const type = async (page, text) => {
  await page.locator('#new').pressSequentially(text, { delay: 45 });
  await page.keyboard.press('Enter');
};

export default async function storyboard({ page, say, waitForVoice, wait }) {
  await page.locator('#new').focus();

  await say(CAPTIONS[0]);
  await wait(400);
  await type(page, 'Buy milk');
  await waitForVoice();

  await say(CAPTIONS[1]);
  await type(page, 'Call the plumber');
  await wait(200);
  await type(page, 'Book the dentist');
  await waitForVoice();

  await say(CAPTIONS[2]);
  await wait(500);
  await page.getByLabel('Buy milk').check();
  await waitForVoice();

  await say(CAPTIONS[3]);
  await wait(400);
  await page.click('[data-filter=active]');
  await wait(1100);
  await page.click('[data-filter=done]');
  await waitForVoice();

  await say(CAPTIONS[4]);
  await wait(400);
  await page.click('#clear');
  await wait(500);
  await page.click('[data-filter=all]');
  await waitForVoice();
  await wait(500);
}
