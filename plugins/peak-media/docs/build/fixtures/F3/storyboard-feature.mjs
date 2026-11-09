// F3 r1-feature (7 s): the README's requirements-baseline paragraph — Gherkin scenarios with TOR IDs.
import { glideTo } from './glide.mjs';

export default async function storyboard({ page, say, waitForVoice, wait }) {
  await wait(300);
  await say('In peak-workflow, every requirement is a Gherkin scenario with a stable ID.');
  await glideTo(page, { match: 'Gherkin-style' });
  await waitForVoice();
}
