---
name: pause
description: |
  Pauses current epic implementation and saves progress to a handoff file.
  Use when stopping mid-epic before the session ends.
  Triggers on: "pause epic", "stop epic", "save progress",
  "I need to stop for today", "save my progress", "I'm done for now",
  "let's pick this up later".
  Note: If the user says "I'm done with epic N", check whether they mean pause (stopping mid-work) or wrapup (finished implementation). If all acceptance criteria are checked, suggest /peak-workflow:wrapup-epic instead.
---

You are pausing the current epic implementation session. This preserves context so the next session can resume exactly where you left off.

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On any other exit, print its output and stop — it names the fix (`/peak-workflow:upgrade`, a
plugin update, or a Python install). After this guard, read the project's files only in the
current format.

---

Follow these steps exactly:

## Step 1: Identify Current Epic

Run `git branch --show-current`. The epic you are pausing is the one this branch implements:
the branch must be `feature/epic-<id>-<short-name>` and that epic's sidecar
(`docs/implementation-plan/status/epic-<id>.md`, read on this branch) must say
`status: In Progress`. Otherwise stop and write nothing: *"Nothing to pause — no epic is in
progress on this branch (<branch>). /peak-workflow:pause runs on the epic's feature branch."* The epic ID is the filename stem after stripping `epic-` and `.md` (e.g., `status/epic-a3f2K7p.md` → ID `a3f2K7p`).

Open the epic spec file (`docs/implementation-plan/phase-*/epic-<id>-*.md`) and parse its header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** for the Step 5 commit trailer. If no `Source:` line exists, the source issue number is unknown — skip the trailer later.

### Disambiguation Check

Before proceeding with the pause, read the epic spec file and check its **Requirements Anchors**
table. Check the implementation handoff file (`session-handoffs/epic-<id>-implemented.md`) if
it exists — look at its "TOR Coverage" section. If ALL TOR IDs in the Requirements Anchors
table show PASS or CANNOT VERIFY in the TOR Coverage section, the epic may be ready for wrapup:

> All TOR requirements for Epic <id> appear to be implemented (all show PASS or CANNOT VERIFY
> in the implemented handoff). This looks like it might be ready for independent verification
> rather than a pause.
> Would you like to run `/peak-workflow:wrapup-epic <id>` instead, or do you still want to pause?

If no implemented handoff exists yet, use test-file presence for the TOR IDs as a heuristic.
When in doubt, defer to the user.

A **removal epic** (its sidecar has a `retires:` line, its spec a `## Removal` section) may have
no anchors at all. Its removal part is done only when
`sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" sweep <the Removal section's retired IDs>`
reports nothing (exit 0) — check that as well, and never read an empty anchors table as "all
done".

If the user confirms they want to pause anyway, proceed with Step 2.

## Step 2: Capture Task State

List all tasks from this session with their current status (completed, in_progress, pending). This becomes the progress snapshot.

## Step 3: Write Handoff File

Create a handoff file at `docs/implementation-plan/session-handoffs/epic-<id>-paused.md` with this structure:

```markdown
# Epic <id>: [Name] — Session Handoff (Paused)

**Paused:** [today's date]
**Reason:** [user-provided or "end of session"]

## Progress Snapshot

### TOR IDs Completed
- [List TOR IDs whose Given/When/Then is fully implemented and tested]

### TOR IDs In Progress
- [List TOR IDs partially implemented — describe what's done and what remains]

### TOR IDs Not Started
- [List TOR IDs not yet touched]

[Removal epic only:]
### Removal
- [N] citations of the retired IDs remain (`tor-lifecycle sweep <retired IDs>`); code paths still to delete: [list]

## Files Created/Modified So Far

[List files with brief description of their state]

## Key Decisions Made So Far

[Any design choices made during this partial session]

## Resume Instructions

When resuming this epic, start by:
1. Reading this handoff file
2. Reading the epic spec: `docs/implementation-plan/phase-*/epic-<id>-*.md`
3. The next task to work on is: **[specific task description]**
4. [Any specific context needed to pick up where you left off]

## Open Questions / Blockers

[Any unresolved issues that may need attention before resuming]
```

## Step 4: Update Status Sidecar

Update `docs/implementation-plan/status/epic-<id>.md`:
1. Change `status: In Progress` to `status: Paused`
2. Change `handoff: —` to `handoff: session-handoffs/epic-<id>-paused.md`

Then locate the epic spec file (`docs/implementation-plan/phase-*/epic-<id>-*.md` — already
opened in Step 1) and rewrite its `**Status:**` header line to `**Status:** Paused` (no date),
so the spec stays in sync with the sidecar.

## Step 5: Commit

**Ask the user if they'd like to commit** all changes made during this session (implementation work + handoff file + sidecar and spec Status line). If the user confirms:

1. Stage all files created or modified during this epic session, including the updated status sidecar and the updated epic spec file (use specific file paths, not `git add -A`)
2. Use the commit message format: `wip(epic-<id>): pause — <brief summary of progress so far>`
3. When a **source issue number** was captured in Step 1, append a blank line then `Refs #<N>` as a trailer to the commit body. `Refs` links the commit to the issue **without closing it** — appropriate for work-in-progress:
   ```
   wip(epic-<id>): pause — <brief summary of progress so far>

   Refs #<N>
   ```
   If no source issue is known, omit the trailer.

Do NOT push to the remote — leave that for the user to decide.

## Step 6: Confirm to User

Tell the user:
> Epic <id> has been paused and committed. To resume, start a new session and run:
> `/peak-workflow:start-epic <id>`
> 
> The start command will automatically read the pause handoff and pick up where you left off.
