// F3 r2-anchor (6.5 s): the TOR ID section, then the paragraph saying epics, tests and handoffs reference them by ID.
import { glideTo } from './glide.mjs';

export default async function storyboard({ beat, page, wait }) {
  await glideTo(page, { match: '^\\s*TOR Requirement IDs', ms: 0, mark: false }); // before the beat: in silence
  await beat('anchor', async () => {
    await wait(1200);
    await glideTo(page, { match: 'foreign keys', ms: 1400 });
  });
}
