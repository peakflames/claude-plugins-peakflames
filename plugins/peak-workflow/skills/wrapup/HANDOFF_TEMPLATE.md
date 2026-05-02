# Completion Handoff Template — `/peak-workflow:wrapup`

Used by Step 2.1. Write the populated template to
`docs/implementation-plan/session-handoffs/epic-<id>-complete.md`
(where `<id>` is `$ARGUMENTS` verbatim). Use literal Unicode ✅ ⚠️ ❌ in the Highlights
list — not shortcodes (`:white_check_mark:` etc.) which don't render in many markdown viewers.

Placeholder reference:

- `<id>`, `<Name>` — epic ID and epic name from the spec
- TOR Counts, Highlights, Conclusion — lifted from the Step 1.5 verification report
- Requirements Implemented table — lifted from the Step 1.5 report verbatim
- Manual verification — from the Step 2.0 disclosure prompt (literal `Yes` / `No` plus
  user-authored description if `Yes`)

---

```markdown
# Epic <id>: <Name> — Complete

**Completed:** <today's date YYYY-MM-DD>
**Verified by:** Independent review via `/peak-workflow:wrapup <id>`

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
| TOR-NN-XXXXXXX | `docs/requirements/NN-name.feature.md` | PASS | tests/test_file.py:line |

## Verification Summary

### Counts
- TOR Requirements: X/Y PASS, Z CANNOT VERIFY
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

### Highlights
- ✅ TOR-NN-XXXXXXX — <scenario title> (test file:line, impl file:line)
- ⚠️ TOR-NN-XXXXXXX — <scenario title> — <one-sentence exception>
- ❌ TOR-NN-XXXXXXX — <scenario title> — <one-sentence failure reason>

### Conclusion
<2–3 sentences explaining why this verification is sufficient, or what must be addressed>

### Manual verification performed: <Yes | No>
<if Yes: user-provided description from Step 2.0 on this line>

## Known Issues / Follow-ups

- <non-blocking issues, tech debt, or items deferred to later epics>
- <TOR IDs that received CANNOT VERIFY — describe what would be needed to verify>
```
