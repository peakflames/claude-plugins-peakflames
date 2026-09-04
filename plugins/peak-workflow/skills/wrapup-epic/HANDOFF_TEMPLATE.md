# Completion Handoff Template — `/peak-workflow:wrapup-epic`

Used by Step 2.1. Write the populated template to
`docs/implementation-plan/session-handoffs/epic-<id>-complete.md`
(where `<id>` is `$ARGUMENTS` verbatim). Use literal Unicode ✅ ⚠️ ❌ in the Highlights
list — not shortcodes (`:white_check_mark:` etc.) which don't render in many markdown viewers.

Placeholder reference:

- `<id>`, `<Name>` — epic ID and epic name from the spec
- `<model>` — the model this wrapup session ran on (frontmatter default `opus`, or the
  project's `Verifier model:` override)
- Deferrals table — lifted from the Step 1.5 report verbatim, including waiver annotations.
  Always present; `Count: 0` + `None` if empty.
- TOR Counts, Highlights, Conclusion — lifted from the Step 1.5 verification report
- Requirements Implemented table — lifted from the Step 1.5 report verbatim
- Manual verification — from the Step 2.0 disclosure prompt (literal `Yes` / `No` plus
  user-authored description if `Yes`)

Highlights legend: ✅ pass · ⚠️ waived (a non-PASS TOR a human explicitly waived) · ❌ fail.

---

```markdown
# Epic <id>: <Name> — Complete

**Completed:** <today's date YYYY-MM-DD>
**Verified by:** Independent review via `/peak-workflow:wrapup-epic <id>` (model: <model>, fresh session)

## Deferrals
Count: N (undisclosed: M, waived: W)

| TOR ID | Unmet | Disclosed | Implementer decision | Verifier finding | Waived by / Date / Reason |
|--------|-------|-----------|----------------------|------------------|---------------------------|
| TOR-NN-XXXXXXX | <what is unmet> | yes / **no** | <decision (by, date)> | FAIL / CANNOT VERIFY — <detail> | <user> / <YYYY-MM-DD> / <reason> — or `—` |

<If Count is 0: replace the table with the literal line `None`.>

## What Was Built

<2–3 sentence summary of what this epic delivered in terms of user-observable capabilities>

## Key Files

| File | Purpose |
|------|---------|
| `path/to/file` | Brief description |

## Key Decisions

- <design choices made during implementation that future epics should know about>

## Requirements Implemented

| TOR ID | Feature File | Verdict | Test Reference |
|--------|--------------|---------|----------------|
| TOR-NN-XXXXXXX | `docs/requirements/NN-name.feature.md` | PASS | tests/test_file.py:line |
| TOR-NN-XXXXXXX | `docs/requirements/NN-name.feature.md` | WAIVED | tests/test_file.py:line |

## Verification Summary

### Counts
- TOR Requirements: X/Y PASS, Z FAIL, W CANNOT VERIFY (V waived)
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

### Highlights
- ✅ TOR-NN-XXXXXXX — <scenario title> (test file:line, impl file:line)
- ⚠️ TOR-NN-XXXXXXX — waived: <one-sentence gap> (waived by <user>, <date>)
- ❌ TOR-NN-XXXXXXX — <scenario title> — <one-sentence failure reason>

### Conclusion
<2–3 sentences explaining why this verification is sufficient, or what must be addressed>

### Manual verification performed: <Yes | No>
<if Yes: user-provided description from Step 2.0 on this line>

## Known Issues / Follow-ups

- <non-TOR items only: tech debt, refactors, observations from code review>
- <TOR-level gaps belong in the Deferrals table above, never here>
```
