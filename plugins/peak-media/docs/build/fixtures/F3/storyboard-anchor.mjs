// F3 r2-anchor (6.5 s): the TOR ID section, then the paragraph saying epics, tests and handoffs reference them by ID.
import { glideTo } from './glide.mjs';

export default async function storyboard({ page, say, waitForVoice, wait }) {
  await glideTo(page, { match: '^\\s*TOR Requirement IDs', ms: 0, mark: false });
  await say('That ID is what the epic plans against, and what the verifier checks.');
  await wait(1200);
  await glideTo(page, { match: 'foreign keys', ms: 1400 });
  await waitForVoice();
}
