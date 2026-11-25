// The judge of what a verify-session fix did to a test (`testWeakening`): pure, so it is tested on changed lines.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedAsTest, isExpectedOutput, testWeakening } from '../lib.mjs';

const none = { lost: false, off: false, loosened: false, wrapped: false };

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

// ---- weakenings a probe found the guard missed (Step 4 box 1) --------------------------------------

test('testWeakening: a precise check swapped for a relaxed one, or a tautology, is `loosened`', () => {
  for (const [from, to] of [
    ['expect(n).toBe(3);', 'expect(n).toBeGreaterThan(0);'],
    ['expect(n).toBe(3);', 'expect(n).toBeGreaterThan(-1);'],
    ['expect(n).toBe(3);', 'expect(n).toBeGreaterThanOrEqual(0);'],
    ['expect(n).toBe(3);', 'expect(n).toBeLessThan(Infinity);'],
    ['expect(r).toEqual({ a: 1 });', 'expect(r).toBeInstanceOf(Object);'],
    ['self.assertEqual(x, 5)', 'self.assertIn(x, range(10))'],
    ['self.assertEqual(x, 5)', 'self.assertIsNotNone(x)'],
    ['assert x == 5', 'assert x is not None'],
    ['expect(n).toBe(3);', 'expect(true).toBe(true);'],
    ['expect(n).toBe(3);', "expect('a').toEqual('a');"],
    ['assert.equal(n, 3);', 'assert.equal(1, 1);'],
    ['self.assertEqual(x, 5)', 'self.assertEqual(1, 1)'],
    ['assert.equal(n, 3);', 'assert.ok(true);'],
    ['assert_eq!(n, 3);', 'assert!(true);'],
    ['XCTAssertEqual(n, 3)', 'XCTAssertTrue(true)'],
    ['assert n == 3', 'assert 1 == 1'],
  ]) assert.equal(testWeakening([`-  ${from}`, `+  ${to}`]).loosened, true, to);
  // A real bound, or a changed expected value of the same kind (owner's decision: allowed), is not loose.
  assert.equal(testWeakening(['-  expect(n).toBe(3);', '+  expect(n).toBeGreaterThan(5);']).loosened, false);
  assert.deepEqual(testWeakening(['-  expect(n).toBe(3);', '+  expect(n).toBe(4);']), none);
  assert.equal(testWeakening(['-  expect(n).toBe(3);', '+  expect(n).toBe(true);']).loosened, false);
  // A bound nothing misses is an everyday check in a new test: loose only in place of a check the fix removed.
  assert.equal(testWeakening(['+  expect(items.length).toBeGreaterThan(0);', '+    self.assertIsNotNone(r)']).loosened, false);
});

test('testWeakening: a check put where it never runs is `wrapped`', () => {
  assert.equal(testWeakening(['+  if (false) {', '+  }']).wrapped, true);
  assert.equal(testWeakening(['+  if (0) {', '+  }']).wrapped, true);
  assert.equal(testWeakening(['+    if False:', '+        assert x == 1', '-    assert x == 1']).wrapped, true);
  // A catch that swallows the failure of lines the fix left alone (its try in another hunk), or of a check in its try.
  assert.equal(testWeakening(['@@ -3,0 +3 @@', '+  try {', '@@ -5,0 +6 @@', '+  } catch {}']).wrapped, true);
  assert.equal(testWeakening(['@@ -3,0 +3 @@', '+  try {', '@@ -5,0 +6,2 @@', '+  } catch (e) {', '+  }']).wrapped, true);
  assert.equal(testWeakening(['@@ -3,0 +3 @@', '+    try:', '@@ -5,0 +6,2 @@', '+    except AssertionError:', '+        pass']).wrapped, true);
  assert.equal(testWeakening(['+    except Exception: pass']).wrapped, true);
  assert.equal(testWeakening(['+  try {', '-  expect(a).toBe(1);', '+    expect(a).toBe(1);', '+  } catch {}']).wrapped, true);
  // An empty catch around cleanup hides no check.
  assert.equal(testWeakening(['+  afterEach(() => { try { fs.rmSync(tmp, { recursive: true }); } catch {} });']).wrapped, false);
  assert.equal(testWeakening(['+    try:', '+        os.remove(p)', '+    except OSError:', '+        pass']).wrapped, false);
  // Structure that still runs the check.
  assert.equal(testWeakening(['+  if (process.env.CI) {', '+  }']).wrapped, false);
  assert.equal(testWeakening(['+  try {', '+  } finally {', '+    cleanup();', '+  }']).wrapped, false);
  assert.equal(testWeakening(['+  } catch (e) {', '+    throw e;', '+  }']).wrapped, false);
  // Already there before: not new.
  assert.equal(testWeakening(['-  if (false) { a(); }', '+  if (false) { b(); }']).wrapped, false);
});

test('testWeakening: Go, Swift and Rust checks count as check lines', () => {
  assert.equal(testWeakening(['-\tif got != want {', '-\t\tt.Errorf("got %v, want %v", got, want)', '-\t}']).lost, true);
  assert.equal(testWeakening(['-\tif err != nil { t.Fatal(err) }']).lost, true);
  assert.equal(testWeakening(['-    XCTAssertEqual(n, 3)']).lost, true);
  assert.equal(testWeakening(['-#[test]', '-fn adds() {}']).lost, true);
  assert.equal(testWeakening(['-#[tokio::test]', '-async fn adds() {}']).lost, true);
  // Moved, not removed; a subtest call is not a lost check.
  assert.equal(testWeakening(['-\t\tt.Errorf("got %v", got)', '+\t\tt.Errorf("got %v, want %v", got, want)']).lost, false);
  assert.deepEqual(testWeakening(['+\tt.Run("adds", func(t *testing.T) {', '+\t})']), none);
});

test('testWeakening: Rust, unittest, NUnit and runtime skips are `off`', () => {
  for (const l of ['+#[ignore]', '+#[ignore = "flaky"]', '+    @unittest.skip("flaky")', '+    @unittest.skipIf(True, "x")', '+    @skip', '+    pytest.skip("later")', '+        self.skipTest("later")', '+    this.skip();', '+    [Ignore("flaky")]', '+    [Test, Ignore("flaky")]']) {
    assert.equal(testWeakening([l]).off, true, l);
  }
  assert.equal(testWeakening(['+    @skipped_reason = 1', '+  const skip = 2;', '+  const modes = [Mode.A, Ignore];']).off, false);
});

test('testWeakening: a removed line whose text starts with `-` is still a changed line', () => {
  assert.equal(testWeakening(['---x; expect(x).toBe(0);']).lost, true);
  assert.equal(testWeakening(['@@ -3 +3 @@', '---x; expect(x).toBe(0);', '+--x;']).lost, true);
  // Real headers in a hunked diff are still skipped, even before a second file.
  assert.deepEqual(testWeakening(['diff --git a/t.test.ts b/t.test.ts', '--- a/t.test.ts', '+++ b/t.test.ts', '@@ -1 +1 @@', '-a', '+b', 'diff --git a/u.test.ts b/u.test.ts', '--- /dev/null', '+++ b/u.test.ts', '@@ -0,0 +1 @@', '+c']), none);
});

test('checkedAsTest: a test-named file outside the listed dirs is checked too; a manifest never is', () => {
  const dirs = ['test/']; const named = new Set();
  assert.equal(checkedAsTest('src/a.test.ts', dirs, named), true);
  assert.equal(checkedAsTest('pkg/adder_test.go', dirs, named), true);
  assert.equal(checkedAsTest('test/helpers.js', dirs, named), true);
  assert.equal(checkedAsTest('src/a.ts', dirs, named), false);
  assert.equal(checkedAsTest('tests/package.json', dirs, named), false);
  // Outside the listed dirs a data file is not a test, whatever its name.
  assert.equal(checkedAsTest('config/test.json', dirs, named), false);
  assert.equal(checkedAsTest('specs/openapi.yaml', dirs, named), false);
});

test('isExpectedOutput: data a test compares with, in a test path or a fixtures folder; not code, not config', () => {
  const dirs = ['test/']; const named = new Set();
  for (const f of ['test/fixtures/rows.json', 'test/expected.txt', 'src/__snapshots__/a.test.ts.snap', 'pkg/testdata/out.golden', 'fixtures/page.html', 'spec/golden/report.csv', 'test/out.yaml', 'test/data.xml']) assert.equal(isExpectedOutput(f, dirs, named), true, f);
  for (const f of ['test/helpers.js', 'src/config.json', 'test/package.json', 'test/tsconfig.json', 'docs/fixtures.md', 'test/.eslintrc.json', 'config/test.json', 'specs/openapi.yaml']) assert.equal(isExpectedOutput(f, dirs, named), false, f);
});
