// F3 r3-openspec (6.5 s): OpenSpec's workflow — the loop at a glance (propose, apply, archive), then
// the archive step. Headings from openspec.dev's docs; "The workflow"/"Archive" match the eval stand-in.
import { glideTo } from './glide.mjs';

export default async function storyboard({ beat, page, wait }) {
  await beat('openspec', async () => {
    await glideTo(page, { match: '^\\s*(The loop at a glance|The workflow)', ms: 1400, mark: false });
    await wait(1000);
    await glideTo(page, { match: '^\\s*(Step 5|Archive)\\b', ms: 1200 });
  });
}
