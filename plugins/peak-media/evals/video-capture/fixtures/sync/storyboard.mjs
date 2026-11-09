// AC-REC-06 sync storyboard (web2video D8): one say() per spine clip, and the whole frame flips
// to the next colour the moment say() returns. With fake/tone clips (full level from sample 0)
// the offset between each colour flip and its tone onset in the --mp4 is the A/V sync error.
export const COLOURS = [
  { name: 'red', css: '#ff0000', rgb: [255, 0, 0] },
  { name: 'green', css: '#00ff00', rgb: [0, 255, 0] },
  { name: 'blue', css: '#0000ff', rgb: [0, 0, 255] },
  { name: 'yellow', css: '#ffff00', rgb: [255, 255, 0] },
  { name: 'magenta', css: '#ff00ff', rgb: [255, 0, 255] },
  { name: 'cyan', css: '#00ffff', rgb: [0, 255, 255] },
];

export const LINES = [
  'Red is the first colour.',
  'Green is the second colour.',
  'Blue is the third colour.',
  'Yellow is the fourth colour.',
  'Magenta is the fifth colour.',
  'Cyan is the sixth colour.',
];

// PEAK_MEDIA_SYNC_CAPTIONS=1 also draws each line as a caption (bottom bar), so the caption path's
// cost is inside the measurement; the measurement reads the top half of the frame only.
const CAPTIONED = process.env.PEAK_MEDIA_SYNC_CAPTIONS === '1';

export default async function storyboard({ page, say, waitForVoice }) {
  for (let i = 0; i < LINES.length; i++) {
    await say(CAPTIONED ? LINES[i] : '', { narrate: LINES[i] });
    await page.evaluate((c) => window.flip(c), COLOURS[i].css);
    await waitForVoice();
  }
}
