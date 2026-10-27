# PR Body Template — `/peak-workflow:wrapup-epic` team mode

Used by Step 5b. Pass the populated template to `gh pr create --body`. Use literal Unicode
✅ ⚠️ 🔧 ❌ in the Highlights list — not shortcodes, which don't render in GitHub markdown.

The "What Was Built" content is **already in memory** from Step 2.1's handoff write — reuse
it directly rather than re-reading `epic-<id>-complete.md` from disk.

Placeholder reference:

- `<id>`, `<Name>` — epic ID and epic name
- `<N>` — source issue number from Step 1.1 item 4. **Omit the issue-link line entirely**
  if the spec has no `**Source:** Issue #<N>` header. Write `Closes #<N>` only when the
  Deferrals **waived** count is 0 (fixed-at-wrapup rows do not block closing); otherwise write
  `Refs #<N>` so a partially delivered issue stays open.
- Deferrals block — lifted from the Step 1.5 report (already in memory), including any
  `FIXED DURING WRAPUP` rows. Always first. If the count is 0, the block is the heading plus
  the single line `None`.
- TOR Counts, Highlights, Conclusion — lifted from the Step 1.5 verification report
- Requirements Implemented table — lifted from Step 1.5 verbatim (already in memory).
  Verdict values here are PASS / WAIVED / PENDING (<CR-ID>) / SUPERSEDED → <successor> only — a
  FAIL or CANNOT VERIFY without a waiver or pending record never reaches Phase 2.
- Manual verification — from the Step 2.0 disclosure
- Requirement changes — lifted from the Step 1.5 report; omit the section when it is `None`.
  Titles in every table come from the one `tor-lifecycle titles` run

Highlights legend: ✅ pass (or a dispute closed by uphold) · ⚠️ waived or recorded as pending · 🔧 fixed or amended during wrapup by the verifier · ❌ fail.

---

```markdown
## Deferrals
Count: N (undisclosed: M, waived: W, fixed at wrapup: F, amended: A, pending: P)

| TOR ID | Unmet | Disclosed | Implementer decision | Verifier finding | Waived by / Date / Reason |
|--------|-------|-----------|----------------------|------------------|---------------------------|
| TOR-NN-XXXXXXX | <what is unmet> | yes / yes (misfiled) / **no** / n/a (no handoff) / n/a (observation) | <decision — why → epic <succ> (by, date)> | FAIL / CANNOT VERIFY — <detail>, FIXED DURING WRAPUP — <what changed>, AMENDED AT WRAPUP — <CR-ID>: <old> → <successor>, or RECORDED AS PENDING — <CR-ID> | <user> / <YYYY-MM-DD> / <reason> → epic <succ> — or `—` |

<If Count is 0: replace the table with the literal line `None`.>

## Summary
<lift "What Was Built" content from Step 2.1 handoff — already in memory, do not re-read file>

<conditional: include only when source issue number is known>
<`Closes #<N>` if the waived count is 0, else `Refs #<N>`>

## Spec
- Epic <id>: <Name> — `docs/implementation-plan/phase-*/epic-<id>-*.md`
- Handoff — `docs/implementation-plan/session-handoffs/epic-<id>-complete.md`

## Removal

<removal epics only — omit otherwise; lifted from the Step 1.5 report:>
Retires <CR-ID> — <record title>
- No citations left: PASS (sweep <retired IDs> exit 0)
- Code gone: PASS (<absence-test lines, if any>)
- Guard requirements: PASS / N/A — no guard requirements

## Requirements Implemented

| TOR ID | Title | Feature File | Verdict | Test Reference |
|--------|-------|--------------|---------|----------------|
| TOR-NN-XXXXXXX | <title from `tor-lifecycle titles`> | `docs/requirements/NN-name.feature.md` | PASS | tests/test_file.py:line |
| TOR-NN-XXXXXXX | <title> | `docs/requirements/NN-name.feature.md` | WAIVED | tests/test_file.py:line |

## Requirement changes

- <CR-ID> <kind> — <TOR(s)> — <record title> (approved via <approved_via>, by <approved_by>)
- Disputed: <TOR> — <title> (<CR-ID>, <N> days)

Merging this PR approves each record above.

## Verification

**Verified by:** `/peak-workflow:wrapup-epic <id>` (model: <model>, fresh session)

**Counts**
- TOR Requirements: X/Y PASS, Z FAIL, C CANNOT VERIFY (V waived, F fixed at wrapup, A amended, P pending)
- Quality Gates: X/Y PASS

**Highlights**
- ✅ TOR-NN-XXXXXXX — <scenario title> (test file:line)
- ⚠️ TOR-NN-XXXXXXX — waived: <one-sentence gap> (waived by <user>, <date> → epic <succ>)
- 🔧 TOR-NN-XXXXXXX — fixed during wrapup: <one-sentence gap and fix>

**Conclusion:** <2–3 sentences>

**Manual verification performed:** <Yes | No>
<if Yes: user-provided description from Step 2.0 on the next line>

## Review Notes
<anything from Phase 1 Code Review worth flagging to the reviewer>

🤖 Generated via /peak-workflow:wrapup-epic
```
