// The judge of what a verify-session fix did to a test (`testWeakening`): pure, so it is tested on changed lines.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import test from 'node:test';
import { testWeakening } from '../lib.mjs';

const none = { lost: false, off: false, loosened: false };

test('testWeakening: waiting before a click, or a stronger check, is not weakening', () => {
  assert.deepEqual(testWeakening(['+  await page.waitForSelector("#ok");', '-  await page.click("#ok");', '+  await page.click("#ok");']), none);
  assert.deepEqual(testWeakening(['-  expect(x).toBeTruthy();', '+  expect(x).toBe(5);']), none);
  assert.deepEqual(testWeakening(['-  expect(x).toBe(5);', '+  expect(x).toBe(6);', '+  expect(y).toBe(1);']), none);
});

test('testWeakening: removing more checks than it adds is `lost`', () => {
  assert.deepEqual(testWeakening(['-  expect(a).toBe(1);', '-  expect(b).toBe(2);', '+  expect(a).toBe(1);']), { ...none, lost: true });
  assert.deepEqual(testWeakening(['-    assert x == 1', '+    pass']), { ...none, lost: true });
});

test('testWeakening: a test skipped, marked to fail, or made the only one run is `off`', () => {
  for (const l of ['+  it.skip("shows the run", () => {', '+  test.todo("later")', '+xit("x", () => {})', '+  describe.only("a", () => {', '+@pytest.mark.skip(reason="flaky")', '+@pytest.mark.xfail', '+    [Fact(Skip = "flaky")]', '+  @Ignore', '+  t.Skip("flaky")']) {
    assert.equal(testWeakening([l]).off, true, l);
  }
  // Already skipped before and still skipped: not new.
  assert.equal(testWeakening(['-  it.skip("a", f);', '+  it.skip("a", g);']).off, false);
  // Text that only looks like one.
  assert.equal(testWeakening(['+  const skipped = items.filter((i) => i.skip);', '+  // todo: rename']).off, false);
});

test('testWeakening: a check that passes for nearly any value, in place of a precise one, is `loosened`', () => {
  assert.equal(testWeakening(['-  expect(res.status).toBe(404);', '+  expect(res.status).toBeTruthy();']).loosened, true);
  assert.equal(testWeakening(['-  expect(fn()).toThrow("bad");', '+  expect(fn()).not.toThrow();']).loosened, true);
  assert.equal(testWeakening(['-    assert x == 1', '+    assert True']).loosened, true);
  // Replacing one loose check with another is no change; a precise check is not loose.
  assert.equal(testWeakening(['-  expect(a).toBeTruthy();', '+  expect(b).toBeTruthy();']).loosened, false);
  assert.equal(testWeakening(['+  expect(a).toBe(1);']).loosened, false);
});

test('testWeakening: diff headers and context are not changed lines', () => {
  assert.deepEqual(testWeakening(['--- a/t.test.ts', '+++ b/t.test.ts', '@@ -1 +1 @@', ' expect(a).toBe(1);']), none);
});
