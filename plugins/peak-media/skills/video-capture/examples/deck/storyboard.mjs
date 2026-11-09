// Example deck storyboard: the original deck loop (web2video D6). It runs unmodified in all
// three modes:
//   capture --storyboard storyboard.mjs --out deck.webm --no-captions          (silent)
//   capture --storyboard storyboard.mjs --out deck.webm                        (captions)
//   capture --storyboard storyboard.mjs --out deck.mp4 --spine spine/manifest.json   (spine-timed)
// The page is index.html next to this file (served on 127.0.0.1 by capture).

// One paragraph per slide. For spine-timed mode, script.md has one "## <beat>" section per
// entry holding the same paragraph, so the spine has one clip per slide.
export const SCRIPT = [
  { beat: 'intro', slide: 0, paragraph: 'Water your garden in the morning. It is one small habit with three good reasons.' },
  { beat: 'why', slide: 1, paragraph: 'Cool morning air means less water is lost, and the leaves dry out by noon, so mildew has less chance.' },
  { beat: 'how', slide: 2, paragraph: 'Aim at the roots, not the leaves. Water deeply, then let the soil dry.' },
];

export default async function storyboard({ page, say, waitForVoice, wait }) {
  for (const { slide, paragraph } of SCRIPT) {
    await waitForVoice(); // previous paragraph finishes first
    await wait(250);
    await page.evaluate((n) => window.deckGo(n), slide);
    await wait(900); // let the slide land before speaking
    await say('', { narrate: paragraph });
  }
  await waitForVoice();
}
