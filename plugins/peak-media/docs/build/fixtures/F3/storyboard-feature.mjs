// F3 r1-feature (7 s): the README's requirements-baseline paragraph — Gherkin scenarios with TOR IDs.
import { glideTo } from './glide.mjs';

export default async function storyboard({ beat, page }) {
  await beat('feature', async () => {
    await glideTo(page, { match: 'Gherkin-style' });
  });
}
