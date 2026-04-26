---
name: pause
description: |
  Pauses current epic implementation and saves progress to a handoff file.
  Use when stopping mid-epic before the session ends.
  Triggers on: "pause epic", "stop epic", "save progress",
  "I need to stop for today", "save my progress", "I'm done for now",
  "let's pick this up later".
  Note: If the user says "I'm done with epic N", check whether they mean pause (stopping mid-work) or wrapup (finished implementation). If all acceptance criteria are checked, suggest /epic-workflow:wrapup instead.
---

You are pausing the current epic implementation session. This preserves context so the next session can resume exactly where you left off.

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/epic-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Identify Current Epic

Glob `docs/implementation-plan/status/epic-*.md` and read each sidecar to find the one with `status: In Progress`. This is the epic you are pausing. The epic ID is the filename stem after stripping `epic-` and `.md` (e.g., `status/epic-a3f2K7p.md` → ID `a3f2K7p`).

Open the epic spec file (`docs/implementation-plan/phase-*/epic-<id>-*.md`) and parse its header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** for the Step 5 commit trailer. If no `Source:` line exists, the source issue number is unknown — skip the trailer later.

### Disambiguation Check

Before proceeding with the pause, read the epic spec file and check its **Acceptance Criteria** section. If ALL acceptance criteria are checked (`[x]`), the epic may actually be done — suggest running `/epic-workflow:wrapup N` instead:

> All acceptance criteria for Epic <id> are checked off. This looks like it might be ready for independent review rather than a pause.
> Would you like to run `/epic-workflow:wrapup <id>` instead, or do you still want to pause?

If the user confirms they want to pause anyway, proceed with Step 2.

## Step 2: Capture Task State

List all tasks from this session with their current status (completed, in_progress, pending). This becomes the progress snapshot.

## Step 3: Write Handoff File

Create a handoff file at `docs/implementation-plan/session-handoffs/epic-<id>-paused.md` (where `<id>` is the epic's ID — either a legacy integer like `7` or `6.5`, or a 7-char alphanumeric ID like `a3f2K7p`) with this structure:

```markdown
# Epic <id>: [Name] — Session Handoff (Paused)

**Paused:** [today's date]
**Reason:** [user-provided or "end of session"]

## Progress Snapshot

### Completed
- [List acceptance criteria items that are done]

### In Progress
- [List items partially done — describe exactly what's been done and what remains]

### Not Started
- [List items not yet touched]

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

Update `docs/implementation-plan/status/epic-<id>.md` (use the epic's actual ID — legacy integer or 7-char alphanumeric):
1. Change `status: In Progress` to `status: Paused`
2. Change `handoff: —` to `handoff: session-handoffs/epic-<id>-paused.md`

## Step 5: Commit

**Ask the user if they'd like to commit** all changes made during this session (implementation work + handoff file + index update). If the user confirms:

1. Stage all files created or modified during this epic session (use specific file paths, not `git add -A`)
2. Use the commit message format: `wip(epic-<id>): pause — <brief summary of progress so far>` (use the epic's actual ID — legacy integer or 7-char alphanumeric)
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
> `/epic-workflow:start <id>`
> 
> The start command will automatically read the pause handoff and pick up where you left off.
