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
5. Check for any existing handoff files in `docs/implementation-plan/session-handoffs/` — read the most recent one, plus any handoff specifically for this epic (it may have been paused previously)
6. Read `docs/architecture.md` for system context
7. Read `docs/design-notes.md` for technical decisions
8. Read all files in `docs/reference/` for implementation patterns and reference material from similar projects

### Recovery Check

If Epic $ARGUMENTS is already marked **"In Progress"** in `index.md` but there is no pause handoff file (`session-handoffs/epic-N-paused.md`), a previous session was likely interrupted without running `/epic-workflow:pause`. Inform the user:

> Epic $ARGUMENTS is marked "In Progress" but has no pause handoff — a previous session may have been interrupted. I'll scan the codebase for any partial implementation and pick up from the current state.

Proceed with the implementation, using git history and the current codebase to determine what has already been done.

## Step 2: Verify Prerequisites

Check the epic's Dependencies section. Verify that prerequisite epics are marked as "Implemented" or "Complete" in `index.md` (both mean the code exists). If dependencies are not met, inform the user and suggest which epic to start instead.

## Step 3: Enter Plan Mode

Enter plan mode and create a detailed implementation plan based on:
- The epic's acceptance criteria (these become your plan items)
- The epic's key components (these are the files you'll create/modify)
- The epic's verification steps (these are how you'll confirm success)
- Any context from previous handoff files (decisions made, patterns established)
- Any relevant patterns from reference materials in `docs/reference/`

The plan should be specific enough to execute without re-reading the epic spec.

## Step 4: Create Tasks

After plan approval, create a task for each acceptance criteria item from the epic spec. These tasks will track your progress through the session.

## Step 5: Update Status

Update `docs/implementation-plan/index.md` — change Epic $ARGUMENTS status from "Not Started" (or "Paused") to **"In Progress"**. Leave the Implemented and Completed date columns as `—` for now — they will be set at the end.

## Step 6: Begin Work

Start executing the plan, working through tasks one at a time. Mark each task as completed as you finish it.

### Reminders
- Check `CLAUDE.md` for project-specific conventions and reminders
- Reference `docs/reference/` for established patterns from similar projects

> **If interrupted:** If you need to stop before the epic is complete, run `/epic-workflow:pause` to save your progress. Do not simply close the session — the pause handoff file is what allows the next session to pick up where you left off.

## Step 7: Satisfy Verification

After all acceptance criteria tasks are complete, read the epic spec's **Verification** section. Treat each verification item as additional implementation work — write the code, tests, or configuration needed to satisfy each one. Create tasks for verification items that require implementation effort.

Run the **Verification & Quality Gates** from `CLAUDE.md` that apply to this epic's changes (build checks, visual verification, brand compliance, etc.).

**Important:** Check the "Local Environment" section in `CLAUDE.md` for backend/API availability. When the backend is live, always verify against real data — start the backend, then the frontend, and use `playwright-cli` against the running app. Do NOT mock API responses when the real API is available.

Report results to the user:
- **PASS** — item is satisfied (include evidence: command output, screenshot path, etc.)
- **FAIL** — item could not be satisfied (describe what went wrong and what was attempted)
- **CANNOT VERIFY** — only use when the backend is genuinely unavailable after attempting to start it, or when the check requires an environment that doesn't exist locally (e.g., Kubernetes, CI/CD)

## Step 8: Reconcile Spec with Implementation

Re-read the epic spec file. Compare the original acceptance criteria and verification items against what was actually implemented during this session. Implementation often diverges from the original spec — data volumes differ, additional work is discovered, items are descoped, or approaches change.

If there are any deviations, ask the user for permission to:

1. **Update the epic spec in-place** — adjust acceptance criteria wording, numbers, and scope to reflect what was actually delivered. Check off completed acceptance criteria. Update verification items to match what was actually tested. The goal is that someone reading the spec later sees the *current truth*, not a stale plan.

2. **Record deviations in the handoff file** — create (or update) `docs/implementation-plan/session-handoffs/epic-N-implemented.md` with:
   - A **Spec Deviations** table: Original Spec | As-Implemented | Reason
   - An **Implementation Notes** section: what was built, key files changed, any additional work not in the original spec
   - A **Verification Results** section: summarize what was tested and the outcomes

   This gives the `/epic-workflow:wrapup` reviewer explicit context about what changed and why, without requiring them to reconstruct it from git history.

If there are no deviations (spec matched reality exactly), note that in the handoff file and skip the spec updates.

**Important:** Git history preserves the original spec, so in-place updates are safe. The handoff file provides the narrative bridge between "what was planned" and "what was delivered."

## Step 9: Mark as Implemented

Update `docs/implementation-plan/index.md`:
1. Change Epic $ARGUMENTS status from "In Progress" to **"Implemented"**
2. Set the **Implemented** date column to today's date (YYYY-MM-DD)
3. Leave the **Completed** date column as `—` — this will be set by `/epic-workflow:wrapup`

## Step 10: Commit

After all implementation and verification work is complete, **ask the user if they'd like to commit the changes.** If the user confirms:

1. Stage all files created or modified during this epic (use specific file paths, not `git add -A`)
2. Include the epic's handoff file if one was written
3. Use the commit message format: `feat(epic-N): <short summary of what was built>`
4. The commit body should be 1-2 sentences summarizing the key deliverables

Do NOT push to the remote — leave that for the user to decide.
