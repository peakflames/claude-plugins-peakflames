# PR Body Template — `/peak-workflow:wrapup` team mode

Used by Step 5b. Pass the populated template to `gh pr create --body`. Use literal Unicode
✅ ⚠️ ❌ in the Highlights list — not shortcodes, which don't render in GitHub markdown.

The "What Was Built" content is **already in memory** from Step 2.1's handoff write — reuse
it directly rather than re-reading `epic-<id>-complete.md` from disk.

Placeholder reference:

- `<id>`, `<Name>` — epic ID and epic name
- `<N>` — source issue number from Step 1.1 item 4. **Omit the `Closes #<N>` line entirely**
  if the spec has no `**Source:** Issue #<N>` header.
- TOR Counts, Highlights, Conclusion — lifted from the Step 1.6 verification report
- Requirements Implemented table — lifted from Step 1.6 verbatim (already in memory)
- Manual verification — from the Step 2.0 disclosure

---

```markdown
## Summary
<lift "What Was Built" content from Step 2.1 handoff — already in memory, do not re-read file>

<conditional: include only when source issue number is known>
Closes #<N>

## Spec
- Epic <id>: <Name> — `docs/implementation-plan/phase-*/epic-<id>-*.md`
- Handoff — `docs/implementation-plan/session-handoffs/epic-<id>-complete.md`

## Requirements Implemented

| TOR ID | Feature File | Verdict | Test Reference |
|--------|--------------|---------|----------------|
| TOR-NN-XXXXXXX | `docs/requirements/NN-name.feature.md` | PASS | tests/test_file.py:line |

## Verification

**Counts**
- TOR Requirements: X/Y PASS, Z CANNOT VERIFY
- Quality Gates: X/Y PASS

**Highlights**
- ✅ TOR-NN-XXXXXXX — <scenario title> (test file:line)
- ✅ TOR-NN-XXXXXXX — <scenario title> (test file:line)
- ⚠️ TOR-NN-XXXXXXX — <scenario title> — <one-sentence exception>

**Conclusion:** <2–3 sentences>

**Manual verification performed:** <Yes | No>
<if Yes: user-provided description from Step 2.0 on the next line>

## Review Notes
<anything from Phase 1 Code Review worth flagging to the reviewer>

🤖 Generated via /peak-workflow:wrapup
```
