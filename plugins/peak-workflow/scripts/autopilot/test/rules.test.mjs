// What a build or repair session is told: pure text, tested without a model.
// Run: node --test plugins/peak-workflow/scripts/autopilot/test/
import assert from 'node:assert/strict';
import test from 'node:test';
import { amendmentRule } from '../driver.mjs';

test('amendmentRule: a build is told who approved an amendment a provisional run took (Pilot Light, 2026-11-23)', () => {
  assert.equal(amendmentRule([]), '');
  assert.equal(amendmentRule(undefined), '');
  const one = amendmentRule(['TOR-10-FU1mh9M']);
  assert.match(one, /TOR-10-FU1mh9M was amended/);
  assert.match(one, /approved_by = "autopilot \(provisional run\)"/);
  assert.match(one, /never a person's name/);
  assert.match(one, /docs\/requirements\/changes\//);
  const two = amendmentRule(['TOR-10-FU1mh9M', 'TOR-10-BxvIpxp']);
  assert.match(two, /TOR-10-FU1mh9M, TOR-10-BxvIpxp were amended/);
  assert.match(two, /no person has approved them/);
});
