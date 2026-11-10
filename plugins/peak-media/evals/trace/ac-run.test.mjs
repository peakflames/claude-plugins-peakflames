// WP2 traceability tool (AC-TRC-01/02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { run, tmpDir } from '../helpers/run.mjs';

const AC = 'docs/build/tools/ac-run.mjs';
const row = (id, wp, status = 'not-started', ev = '—') => `| ${id} | src | ${wp} | G x · W y · T z | script | ${status} | ${ev} |`;

function fixture({ rows, briefs, files = {} }) {
  const root = tmpDir('pm-trace-');
  writeFileSync(path.join(root, 'acceptance.md'), `# r\n\n| WP | Status | Verify report |\n|---|---|---|\n${Object.keys(briefs).map((w) => `| ${w} | not-started | — |`).join('\n')}\n\n| ID | source | WP | gwt | method | status | evidence |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`);
  for (const [wp, ids] of Object.entries(briefs)) { mkdirSync(path.join(root, 'wp', wp), { recursive: true }); writeFileSync(path.join(root, 'wp', wp, 'brief.md'), `# ${wp}\n\n${ids.map((i) => `- **${i}**`).join('\n')}\n`); }
  for (const [f, s] of Object.entries(files)) { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); writeFileSync(path.join(root, f), s); }
  return root;
}

test('AC-TRC-01: --trace fails on orphan AC, unknown AC in a brief, PASS without evidence; passes on the real register', () => {
  const ok = fixture({ rows: [row('AC-X-01', 'WP1', 'PASS', 'evidence/WP1/a.log')], briefs: { WP1: ['AC-X-01'] }, files: { 'evidence/WP1/a.log': 'ok' } });
  assert.equal(run(AC, ['--trace', '--root', ok]).code, 0);

  const orphan = fixture({ rows: [row('AC-X-01', 'WP1'), row('AC-X-02', 'WP9')], briefs: { WP1: ['AC-X-01'] } });
  let r = run(AC, ['--trace', '--root', orphan]);
  assert.equal(r.code, 1); assert.match(r.stdout, /AC-X-02: orphan/);

  const unlisted = fixture({ rows: [row('AC-X-01', 'WP1'), row('AC-X-02', 'WP1')], briefs: { WP1: ['AC-X-01'] } });
  r = run(AC, ['--trace', '--root', unlisted]);
  assert.equal(r.code, 1); assert.match(r.stdout, /AC-X-02: orphan — not listed in wp\/WP1\/brief\.md/);

  const unknown = fixture({ rows: [row('AC-X-01', 'WP1')], briefs: { WP1: ['AC-X-01', 'AC-X-99'] } });
  r = run(AC, ['--trace', '--root', unknown]);
  assert.equal(r.code, 1); assert.match(r.stdout, /lists unknown AC-X-99/);

  const noEv = fixture({ rows: [row('AC-X-01', 'WP1', 'PASS', '—'), row('AC-X-02', 'WP1', 'PASS', 'evidence/missing.log')], briefs: { WP1: ['AC-X-01', 'AC-X-02'] } });
  r = run(AC, ['--trace', '--root', noEv]);
  assert.equal(r.code, 1); assert.match(r.stdout, /AC-X-01: PASS with no evidence/); assert.match(r.stdout, /AC-X-02: PASS but evidence file missing/);

  const pipe = fixture({ rows: ['| AC-X-01 | src | WP1 | G a | b · W y · T z | script | PASS | — |'], briefs: { WP1: ['AC-X-01'] } });
  r = run(AC, ['--trace', '--root', pipe]);
  assert.notEqual(r.code, 0); assert.match(r.stderr, /malformed row for AC-X-01/);
  const dirEv = fixture({ rows: [row('AC-X-01', 'WP1', 'PASS', 'evidence/WP1'), row('AC-X-02', 'WP1', 'PASS', '../outside.log')], briefs: { WP1: ['AC-X-01', 'AC-X-02'] }, files: { 'evidence/WP1/x.log': 'x' } });
  r = run(AC, ['--trace', '--root', dirEv]);
  assert.equal(r.code, 1); assert.match(r.stdout, /AC-X-01: PASS but evidence file missing: evidence\/WP1/); assert.match(r.stdout, /AC-X-02: evidence must live under the build folder/);

  r = run(AC, ['--trace']);
  assert.equal(r.code, 0, r.stdout);
});

test('AC-TRC-02: a verify report whose verifier-id equals the builder-id is rejected', () => {
  const same = fixture({ rows: [row('AC-X-01', 'WP1')], briefs: { WP1: ['AC-X-01'] }, files: { 'wp/WP1/handoff.md': 'builder-id: agent-123\n', 'wp/WP1/verify-1.md': 'verifier-id: agent-123\n' } });
  let r = run(AC, ['--trace', '--root', same]);
  assert.equal(r.code, 1); assert.match(r.stdout, /verify-1\.md: verifier-id equals the builder-id \(agent-123\) — report rejected/);
  r = run(AC, ['--wp', 'WP1', '--no-run', '--root', same]);
  assert.equal(r.code, 1); assert.match(r.stdout, /report rejected/);
  const loose = fixture({ rows: [row('AC-X-01', 'WP1')], briefs: { WP1: ['AC-X-01'] }, files: { 'wp/WP1/handoff.md': 'builder-id: Lead-Main (opus, 2026)\n', 'wp/WP1/verify-1.md': 'verifier-id: lead-main\n' } });
  assert.equal(run(AC, ['--trace', '--root', loose]).code, 1, 'case and a trailing (note) do not make ids differ');
  const diff = fixture({ rows: [row('AC-X-01', 'WP1')], briefs: { WP1: ['AC-X-01'] }, files: { 'wp/WP1/handoff.md': 'builder-id: agent-123\n', 'wp/WP1/verify-1.md': 'verifier-id: agent-456\n' } });
  assert.equal(run(AC, ['--trace', '--root', diff]).code, 0);
});

test('ac-run: baseline-style usage errors (not AC-bound)', () => {
  for (const args of [[], ['--wp', 'WP404'], ['--bogus']]) {
    const r = run(AC, args);
    assert.notEqual(r.code, 0); assert.equal(r.stderr.trim().split('\n')[0].startsWith('ac-run: '), true);
  }
});
