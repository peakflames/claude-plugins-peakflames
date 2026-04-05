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

Follow these steps exactly:

## Step 1: Identify Current Epic

Read `docs/implementation-plan/index.md` and find the epic currently marked as "In Progress". This is the epic you are pausing.

### Disambiguation Check

Before proceeding with the pause, read the epic spec file and check its **Acceptance Criteria** section. If ALL acceptance criteria are checked (`[x]`), the epic may actually be done — suggest running `/epic-workflow:wrapup N` instead:

> All acceptance criteria for Epic N are checked off. This looks like it might be ready for independent review rather than a pause.
> Would you like to run `/epic-workflow:wrapup N` instead, or do you still want to pause?

If the user confirms they want to pause anyway, proceed with Step 2.

## Step 2: Capture Task State

List all tasks from this session with their current status (completed, in_progress, pending). This becomes the progress snapshot.

## Step 3: Write Handoff File

Create a handoff file at `docs/implementation-plan/session-handoffs/epic-N-paused.md` (where N is the epic number) with this structure:

```markdown
# Epic N: [Name] — Session Handoff (Paused)

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
2. Reading the epic spec: `docs/implementation-plan/phase-N-*/epic-N-*.md`
3. The next task to work on is: **[specific task description]**
4. [Any specific context needed to pick up where you left off]

## Open Questions / Blockers

[Any unresolved issues that may need attention before resuming]
```

## Step 4: Update Index

Update `docs/implementation-plan/index.md`:
1. Change the epic's status to **"Paused"**
2. Add a link to the handoff file in the Handoff column: `[paused](session-handoffs/epic-N-paused.md)`

## Step 5: Commit

**Ask the user if they'd like to commit** all changes made during this session (implementation work + handoff file + index update). If the user confirms:

1. Stage all files created or modified during this epic session (use specific file paths, not `git add -A`)
2. Use the commit message format: `wip(epic-N): pause — <brief summary of progress so far>`

Do NOT push to the remote — leave that for the user to decide.

## Step 6: Confirm to User

Tell the user:
> Epic N has been paused and committed. To resume, start a new session and run:
> `/epic-workflow:start N`
> 
> The start command will automatically read the pause handoff and pick up where you left off.
