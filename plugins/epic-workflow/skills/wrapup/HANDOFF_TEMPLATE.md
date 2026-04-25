# Completion Handoff Template — `/epic-workflow:wrapup`

Used by Step 2.1. Write the populated template to `docs/implementation-plan/session-handoffs/epic-<id>-complete.md` (where `<id>` is `$ARGUMENTS` verbatim — legacy integer or 7-char alphanumeric). Use literal Unicode ✅ ⚠️ ❌ in the Highlights list — not shortcodes (`:white_check_mark:` etc.) which don't render in many markdown viewers.

Placeholder reference:

- `<id>`, `<Name>` — epic ID and epic name from the spec
- Counts, Highlights, Conclusion — lifted from the Step 1.6 verification report
- Manual verification — from the Step 2.0 disclosure prompt (literal `Yes` / `No` plus user-authored description if `Yes`)

---

```markdown
# Epic <id>: <Name> — Complete

**Completed:** <today's date YYYY-MM-DD>
**Verified by:** Independent review via `/epic-workflow:wrapup <id>`

## What Was Built

<2–3 sentence summary of what this epic delivered>

## Key Files

| File | Purpose |
|------|---------|
| `path/to/file.cs` | Brief description |

## Key Decisions

- <design choices made during implementation that future epics should know about>

## Verification Summary

### Counts
- Acceptance Criteria: X/Y PASS
- Verification Items: X/Y PASS, Z CANNOT VERIFY (requires live environment)
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

### Highlights
- ✅ <highlight 1>
- ⚠️ <highlight 2>

### Conclusion
<2–3 sentences>

### Manual verification performed: <Yes | No>
<if Yes: user-provided description from Step 2.0 on this line>

## Known Issues / Follow-ups

- <non-blocking issues, tech debt, or items deferred to later epics>
```
