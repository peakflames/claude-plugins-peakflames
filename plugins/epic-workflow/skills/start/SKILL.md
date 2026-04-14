---
name: start
description: |
  Implements an epic — loads spec, plans, implements, and verifies against acceptance criteria.
  Use when the user wants to begin or resume working on a specific epic number.
  Triggers on: "start epic", "implement epic", "begin epic", "work on epic",
  "let's work on epic N", "pick up epic N", "resume epic N",
  "continue where I left off", "let's build epic N".
argument-hint: "<epic-number>"
---

You are starting an implementation session for Epic $ARGUMENTS.

Follow these steps exactly:

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root for project context and tech stack
2. Read the implementation plan index: `docs/implementation-plan/index.md`
3. Identify which phase and file corresponds to Epic $ARGUMENTS
4. Read the epic spec file (e.g., `docs/implementation-plan/phase-N-*/epic-$ARGUMENTS-*.md`)
5. From the spec filename, extract the **branch short name**: strip the directory path, the `epic-N-` prefix, and the `.md` suffix. For example, `epic-3-user-auth.md` → `user-auth`. This becomes the branch short name for Step 3. If there is no suffix after `epic-N` (e.g., `epic-3.md`), omit it.
6. Check for any existing handoff files in `docs/implementation-plan/session-handoffs/` — read the most recent one, plus any handoff specifically for this epic (it may have been paused previously)
7. Read `docs/architecture.md` for system context
8. Read `docs/design-notes.md` for technical decisions
9. Read all files in `docs/reference/` for implementation patterns and reference material from similar projects

### Recovery Check

If Epic $ARGUMENTS is already marked **"In Progress"** in `index.md` but there is no pause handoff file (`session-handoffs/epic-N-paused.md`), a previous session was likely interrupted without running `/epic-workflow:pause`. Inform the user:

> Epic $ARGUMENTS is marked "In Progress" but has no pause handoff — a previous session may have been interrupted. I'll scan the codebase for any partial implementation and pick up from the current state.

Proceed with the implementation, using git history and the current codebase to determine what has already been done.

## Step 2: Verify Prerequisites

Check the epic's Dependencies section. Verify that prerequisite epics are marked as "Implemented" or "Complete" in `index.md` (both mean the code exists). If dependencies are not met, inform the user and suggest which epic to start instead.

## Step 3: Create Feature Branch

Before entering plan mode, ensure work is isolated on a feature branch. The branch name uses the format `feature/epic-N-<short-name>` where `<short-name>` was extracted in Step 1 (e.g., `feature/epic-3-user-auth`). If no short name was available, use `feature/epic-N`.

1. Run `git branch --show-current` to check the current branch
2. If already on `feature/epic-N-<short-name>`, confirm to the user:
   > Resuming on existing branch: `feature/epic-N-<short-name>`
3. If NOT on `feature/epic-N-<short-name>`:
   a. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`
   b. Switch to the base branch: `git checkout <base-branch>`
   c. Create and checkout the feature branch: `git checkout -b feature/epic-N-<short-name>`
   d. Confirm to the user:
   > Created and switched to branch: `feature/epic-N-<short-name>` (from `<base-branch>`)

## Step 4: Enter Plan Mode

Enter plan mode. **The plan you produce here is the complete and authoritative execution script for this epic.** It must be fully executable in isolation — if this session's context is cleared and only the plan text survives, the plan alone must be sufficient to drive the entire implementation to completion. Every step that follows plan approval must be represented in the plan as an explicit numbered item. Do not rely on any post-plan skill instructions to cover branch setup, status tracking, task creation, verification, spec reconciliation, or committing. Those responsibilities belong to the plan.

Build the plan from:
- The epic's acceptance criteria (these become your implementation items)
- The epic's key components (these are the files you'll create/modify)
- The epic's verification steps (these are how you'll confirm success)
- Any context from previous handoff files (decisions made, patterns established)
- Any relevant patterns from reference materials in `docs/reference/`

**The plan must follow this exact structure.** All lifecycle steps must appear as explicit numbered items in the plan body — not as footnotes or asides.

### Opening steps (always the first three plan items):

1. **Create (or verify) feature branch** — run `git branch --show-current`. If already on `feature/epic-N-<short-name>`, confirm and continue. If not, detect base branch (`develop` > `main` > `master`), switch to it, and run `git checkout -b feature/epic-N-<short-name>`. Use the exact branch name derived from the spec filename.
2. **Update status to "In Progress"** — edit `docs/implementation-plan/index.md`: change Epic N status from "Not Started" (or "Paused") to "In Progress". Leave Implemented and Completed dates as `—`.
3. **Create tasks** — create one task per acceptance criteria item from the epic spec for progress tracking.

### Middle steps (implementation work):

Derive these from the epic's acceptance criteria and key components. Each step should map to one or more acceptance criteria items and name the specific files to create or modify.

### Closing steps (always the last five plan items, in this order):

- **Satisfy verification** — re-read the epic spec's Verification section. For each item, write any code, tests, or configuration needed to satisfy it. Also run the Verification & Quality Gates from `CLAUDE.md` that apply to this epic. Check the "Local Environment" section in `CLAUDE.md`: when the backend is live, verify against real data using `playwright-cli` — do not mock. Report each item as: PASS (with evidence), FAIL (describe what went wrong), or CANNOT VERIFY (only if the environment is genuinely unavailable after attempting to start it).
- **Reconcile spec** — re-read the epic spec file. Compare original acceptance criteria and verification items against what was actually implemented. Ask user permission to: (1) update the spec in-place to reflect actual delivery, checking off completed items; and (2) create (or update) `docs/implementation-plan/session-handoffs/epic-N-implemented.md` with a Spec Deviations table (Original Spec | As-Implemented | Reason), an Implementation Notes section (key files changed, additional work), and a Verification Results section. If no deviations, note that in the handoff file and skip spec edits.
- **Mark as Implemented** — edit `docs/implementation-plan/index.md`: change Epic N status from "In Progress" to "Implemented". Set the Implemented date to today (YYYY-MM-DD). Leave the Completed date as `—`.
- **Commit** — run `git branch --show-current` and confirm you are on `feature/epic-N-<short-name>`; if not, switch before staging anything. Stage all files created or modified during this epic by specific path (not `git add -A`), including the handoff file. Commit without asking for permission. Message format: `feat(epic-N): <short summary>` with a 1–2 sentence body summarizing key deliverables. Do not push.
- **Present next steps** — output this block:
  > ---
  > **Next steps**
  > - Open a new session and run `/epic-workflow:wrapup N` to independently verify and close out this epic
  > - Or run `/epic-workflow:status` to review overall project progress
  > - If something needs fixing before wrapup, make the changes and re-run `/epic-workflow:start N` to continue on the same branch
  > ---

## Step 5: Execute the Plan

Exit plan mode and execute every item in the plan you created in Step 4, in order. The plan is the complete execution script for this session — it contains every remaining step, from branch setup through the final next-steps block. Do not add, skip, or reorder items.

> **If interrupted mid-execution:** Run `/epic-workflow:pause` to save your progress. Do not simply close the session — the pause handoff file is what allows the next session to pick up where you left off.
