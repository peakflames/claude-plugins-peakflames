# Completion Handoff Template — `/peak-workflow:wrapup-epic`

Used by Step 2.1. Write the populated template to
`docs/implementation-plan/session-handoffs/epic-<id>-complete.md`
(where `<id>` is `$ARGUMENTS` verbatim). Use literal Unicode ✅ ⚠️ 🔧 ❌ in the Highlights
list — not shortcodes (`:white_check_mark:` etc.) which don't render in many markdown viewers.

Placeholder reference:

- `<id>`, `<Name>` — epic ID and epic name from the spec
- `<model>` — the model this wrapup session actually ran on (SKILL.md explains when it differs from
  the project's `Verifier model:` line)
- Deferrals table — lifted from the Step 1.5 report verbatim, including waiver annotations and
  any `FIXED DURING WRAPUP` rows. Always present; `Count: 0` + `None` if empty.
- TOR Counts, Highlights, Conclusion — lifted from the Step 1.5 verification report
- Requirements Implemented table — lifted from the Step 1.5 report verbatim (titles as they read
  at wrapup — a dated snapshot no skill reads back)
- Requirement Changes — lifted from the Step 1.5 report (every Change Record the branch adds, plus
  touched Disputed requirements under the threshold); `None` when empty
- Manual verification — from the Step 2.0 disclosure prompt (literal `Yes` / `No` plus
  user-authored description if `Yes`)

Highlights legend: ✅ pass · ⚠️ waived (a non-PASS TOR a human explicitly waived) or recorded as
pending · 🔧 fixed or amended during wrapup by the verifier (Step 1.4b) · ❌ fail.

---

```markdown
# Epic <id>: <Name> — Complete

**Completed:** <today's date YYYY-MM-DD>
**Verified by:** Independent review via `/peak-workflow:wrapup-epic <id>` (model: <model>, fresh session)

## Deferrals
Count: N (undisclosed: M, waived: W, fixed at wrapup: F, amended: A, pending: P)

| TOR ID | Unmet | Disclosed | Implementer decision | Verifier finding | Waived by / Date / Reason |
|--------|-------|-----------|----------------------|------------------|---------------------------|
| TOR-NN-XXXXXXX | <what is unmet> | yes / **no** | <decision — why → epic <succ> (by, date)> | FAIL / CANNOT VERIFY — <detail>, FIXED DURING WRAPUP — <what changed>, AMENDED AT WRAPUP — <CR-ID>: <old> → <successor>, or RECORDED AS PENDING — <CR-ID> | <user> / <YYYY-MM-DD> / <reason> → epic <succ> — or `—` |

<If Count is 0: replace the table with the literal line `None`.>

## What Was Built

<2–3 sentence summary of what this epic delivered in terms of user-observable capabilities>

## Key Files

| File | Purpose |
|------|---------|
| `path/to/file` | Brief description |

## Key Decisions

- <design choices made during implementation that future epics should know about>

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

## Requirement Changes

- <CR-ID> <kind> — <TOR(s)> — <record title> (approved via <approved_via>, by <approved_by>)
- Disputed: <TOR> — <title> (<CR-ID>, <N> days)
<or the literal line `None`>

## Verification Summary

### Counts
- TOR Requirements: X/Y PASS, Z FAIL, C CANNOT VERIFY (V waived, F fixed at wrapup, A amended, P pending)
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

### Highlights
- ✅ TOR-NN-XXXXXXX — <scenario title> (test file:line, impl file:line)
- ⚠️ TOR-NN-XXXXXXX — waived: <one-sentence gap> (waived by <user>, <date> → epic <succ>)
- 🔧 TOR-NN-XXXXXXX — fixed during wrapup: <one-sentence gap and fix>
- ❌ TOR-NN-XXXXXXX — <scenario title> — <one-sentence failure reason>

### Conclusion
<2–3 sentences explaining why this verification is sufficient, or what must be addressed>

### Manual verification performed: <Yes | No>
<if Yes: user-provided description from Step 2.0 on this line>

## Known Issues / Follow-ups

- <non-TOR items only: tech debt, refactors, observations from code review>
- <TOR-level gaps belong in the Deferrals table above, never here>
```
