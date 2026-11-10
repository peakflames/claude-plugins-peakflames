// Example deck storyboard: one beat per slide, beats `intro`, `why`, `how` from script.md. The
// same storyboard runs in all three modes:
//   capture --storyboard storyboard.mjs --script script.md --out deck.mp4 --no-captions   (silent)
//   capture --storyboard storyboard.mjs --script script.md --out deck.mp4                 (captions)
//   capture --storyboard storyboard.mjs --spine spine/manifest.json --mp4 deck.mp4        (narrated)
// The page is index.html next to this file (served on 127.0.0.1 by capture). Slide changes
// happen between beats, so in a narrated take they land in the silence between clips.

const SLIDES = ['intro', 'why', 'how'];

export default async function storyboard({ beat, page, wait }) {
  for (const [n, id] of SLIDES.entries()) {
    if (n) await wait(250);                           // let the last word ring out
    await page.evaluate((i) => window.deckGo(i), n); // between beats: lands in silence
    await wait(900);                                  // let the slide settle before the voice
    await beat(id);                                   // no fn: the slide is the picture
  }
}
