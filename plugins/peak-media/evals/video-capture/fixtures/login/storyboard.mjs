// A take of the login fixture's protected page (AC-W2V-22): run with --url <server> and
// --storage-state <session.json>. Signed out, the page is the red sign-in form instead (the eval's
// control take), and there is no report button to click.
export default async function storyboard({ beat, point, click, page }) {
  await beat('dash', async () => { await point('h1'); });
  await beat('report', async () => { if (await page.locator('#report').count()) await click('#report'); else await point('h1'); });
}
