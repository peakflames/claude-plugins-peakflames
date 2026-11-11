// node:test for the full eval suite, which stays macOS-only (DEC-53): on Windows every test here
// is reported as skipped and the hooks don't run. The CI subset (evals/platform, verify, contracts,
// trace, packaging, smoke) imports node:test directly and runs on every OS.
import * as nt from 'node:test';

export const FULL_SUITE_SKIP = process.platform === 'win32' && 'full suite is macOS-only (DEC-53)';

const skipped = (name, opts, fn) => {
  const label = typeof name === 'string' ? name : (opts?.name ?? fn?.name ?? 'test');
  return nt.test(label, { skip: FULL_SUITE_SKIP }, () => {});
};
const noop = () => {};

export const test = FULL_SUITE_SKIP ? skipped : nt.test;
export const before = FULL_SUITE_SKIP ? noop : nt.before;
export const after = FULL_SUITE_SKIP ? noop : nt.after;
