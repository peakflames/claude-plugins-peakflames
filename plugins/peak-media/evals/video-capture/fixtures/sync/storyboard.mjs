// AC-REC-06 sync storyboard (web2video D8): one beat per spine clip (beats one..six of script.md),
// and the whole frame flips to the next colour the moment the beat starts. With fake/tone clips
// (full level from sample 0) the offset between each colour flip and its tone onset in the --mp4
// is the A/V sync error. Captions follow the capture flags: --no-captions for a voice-only take.
export const COLOURS = [
  { name: 'red', css: '#ff0000', rgb: [255, 0, 0] },
  { name: 'green', css: '#00ff00', rgb: [0, 255, 0] },
  { name: 'blue', css: '#0000ff', rgb: [0, 0, 255] },
  { name: 'yellow', css: '#ffff00', rgb: [255, 255, 0] },
  { name: 'magenta', css: '#ff00ff', rgb: [255, 0, 255] },
  { name: 'cyan', css: '#00ffff', rgb: [0, 255, 255] },
];

export const BEATS = ['one', 'two', 'three', 'four', 'five', 'six'];

export default async function storyboard({ beat, page }) {
  for (let i = 0; i < BEATS.length; i++) {
    await beat(BEATS[i], async () => {
      await page.evaluate((c) => window.flip(c), COLOURS[i].css);
    });
  }
}
