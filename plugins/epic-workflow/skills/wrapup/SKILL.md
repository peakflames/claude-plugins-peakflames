---
name: wrapup
description: |
  Independent verification review of a completed epic — verifies implementation, closes out, and orients to next steps.
  Use after an epic is implemented and needs independent review.
  Triggers on: "wrapup epic", "verify epic", "review epic", "close epic",
  "is epic N done?", "check my work on epic N", "review what I built",
  "sign off on epic N", "close out epic N".
  Note: If the user says "I'm done with epic N", check whether the epic is "Implemented" (use wrapup) or "In Progress" (suggest /epic-workflow:pause instead).
argument-hint: "<epic-number>"
---

You are performing an independent verification and completion of Epic $ARGUMENTS. You are acting as an independent reviewer — you did NOT implement this epic. Your job is to verify the implementation against the spec, close out the epic if it passes, and orient the team toward what's next.

This command has three phases: **Verify**, **Complete**, and **Orient**. Do not skip ahead — each phase gates the next.

---

## Phase 1: Verify

Your goal is to independently confirm the implementation meets the spec. Do not trust the implementer's self-assessment — inspect the code yourself.

> **Safe to re-run:** This command is safe to run multiple times. If a previous wrapup attempt was interrupted or failed, just run `/epic-workflow:wrapup N` again — it will re-verify from scratch.

### Step 1.1: Load Context

1. Read `CLAUDE.md` at the repo root for project context and quality gates
2. Read the implementation plan index: `docs/implementation-plan/index.md`
3. Verify Epic $ARGUMENTS is in **"Implemented"** status. If it is still "In Progress" or "Not Started", inform the user that `/epic-workflow:start` must finish first. If it is already "Complete", inform the user it has already been wrapped up.
4. Read the epic spec file for Epic $ARGUMENTS
5. Read the handoff file in `docs/implementation-plan/session-handoffs/` for this epic (if one exists)
6. Read `docs/architecture.md` for system context
7. From the spec filename (loaded in item 4), extract the **branch short name**: strip the directory path, the `epic-N-` prefix, and the `.md` suffix. For example, `epic-3-user-auth.md` → `user-auth`. If there is no suffix after `epic-N`, omit it.
8. Check out the feature branch for this epic: `git checkout feature/epic-N-<short-name>`
   - If the branch does not exist, try the legacy name `feat/epic-N` (for sessions started before v1.3.0)
   - If neither branch exists, inform the user and proceed on the current branch
     (the work may have been done directly on main in an older session)

### Step 1.2: Verify Acceptance Criteria

Read the epic spec's **Acceptance Criteria** section. For each item, independently verify it was implemented correctly by reading the relevant source files.

Report each criterion:
- **PASS** — implemented correctly (cite the file and line)
- **FAIL** — not implemented, or implemented incorrectly (describe the gap)

### Step 1.3: Verify Verification Section

Read the epic spec's **Verification** section. For each item, independently confirm it is satisfied:
- Run commands (build, tests) yourself
- Use `playwright-cli` for any visual checks — **always use the live backend with real data** (see the "Local Environment" section in `CLAUDE.md` for how to start the backend). Do NOT mock API responses unless the backend genuinely cannot start. Start the backend first, then the frontend, and navigate with playwright-cli against the real running app.
- Read code to confirm behavioral claims (error handling, logging, etc.)
- Interactively test UI behaviors (filter inputs, clicks, navigation) against real data

Report each item:
- **PASS** — verified independently (include evidence)
- **FAIL** — verification failed (describe what's wrong)
- **CANNOT VERIFY** — only use this when the backend is genuinely unavailable after attempting to start it, or when the check requires an environment that doesn't exist locally (e.g., Kubernetes, CI/CD). Never use this for checks that can be run against the live local API.

### Step 1.4: Run Quality Gates

Read the **Verification & Quality Gates** section from `CLAUDE.md`. Run every applicable check independently:
- Build check
- Visual verification via `playwright-cli` (if UI was changed)
- Brand compliance via the project's brand guidelines skill (if UI was changed and a brand skill is configured)
- Console check via `playwright-cli` (if UI was changed)

### Step 1.5: Code Review

Review the implementation for:
- Adherence to patterns established in previous epics and documented in `docs/reference/`
- Security concerns (input validation, injection, secrets handling)
- Error handling completeness
- Logging adequacy
- Consistency with `docs/architecture.md` and `docs/design-notes.md`

### Step 1.6: Present Verification Report

Present a consolidated report to the user:

```
# Epic N: [Name] — Verification Report

## Acceptance Criteria: X/Y PASS
- [PASS] criterion 1 — file:line evidence
- [FAIL] criterion 2 — description of gap

## Verification Items: X/Y PASS
- [PASS] item 1 — evidence
- [CANNOT VERIFY] item 2 — reason

## Quality Gates: X/Y PASS
- [PASS] Build check — zero errors

## Code Review Findings
- [list any concerns, or "No issues found"]

## Verdict: PASS / FAIL / PASS WITH EXCEPTIONS
```

**If the verdict is FAIL:** Stop here. List the specific items that need to be fixed. Do NOT proceed to Phase 2. The implementer needs to address the failures, then this command should be run again.

**If the verdict is PASS or PASS WITH EXCEPTIONS:** Ask the user to confirm before proceeding to Phase 2.

---

## Phase 2: Complete

Your goal is to close out the epic by writing the permanent record and updating project tracking.

### Step 2.1: Write the Handoff File

Create (or update) the handoff file at `docs/implementation-plan/session-handoffs/epic-N-complete.md` with this structure:

```markdown
# Epic N: [Name] — Complete

**Completed:** [today's date]
**Verified by:** Independent review via `/epic-workflow:wrapup N`

## What Was Built

[2-3 sentence summary of what this epic delivered]

## Key Files

| File | Purpose |
|------|---------|
| `path/to/file.cs` | Brief description |

## Key Decisions

- [Design choices made during implementation that future epics should know about]

## Verification Summary

- Acceptance Criteria: X/Y PASS
- Verification Items: X/Y PASS, Z CANNOT VERIFY (requires live environment)
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

## Known Issues / Follow-ups

- [Any non-blocking issues, tech debt, or items deferred to later epics]
```

### Step 2.2: Update the Implementation Plan Index

Update `docs/implementation-plan/index.md`:
1. Change Epic $ARGUMENTS status from "Implemented" to **"Complete"**
2. Add the handoff link: `[handoff](session-handoffs/epic-N-complete.md)`
3. Set the **Completed** date column to today's date (YYYY-MM-DD)

### Step 2.3: Commit

Automatically commit all changes made during verification and completion without
asking the user for permission:

1. Stage the handoff file, updated `index.md`, and any other files modified during
   verification (specific file paths, not `git add -A`)
2. Commit message format: `chore(epic-N): verify and complete — <brief summary>`

Do NOT push to the remote yet.

---

## Phase 3: Orient

Your goal is to help the user decide what to work on next. Read the implementation plan index and dependency graph, then present:

### Step 3.1: What's Now Unblocked

List any epics whose dependencies are now fully satisfied thanks to this epic's completion. For each, include:
- Epic number and name
- Its dependencies (and whether they're all met)
- A one-line summary of what it involves

### Step 3.2: Parallelization Opportunities

If multiple epics are now unblocked, call out which ones can be worked on in parallel.

### Step 3.3: Recommended Next Action

Based on the dependency graph and project state, recommend which epic to start next (or which set to run in parallel), with a brief rationale.

### Step 3.4: Outstanding Items

If the verification found any non-blocking issues (PASS WITH EXCEPTIONS, CANNOT VERIFY items, tech debt), list them here as items to address before the final QA epic or during CI/CD setup.

Present this as a clear summary the user can act on:

```
## Next Steps

### Unblocked Epics
- Epic X: [Name] — [one-line summary] (all dependencies met)
- Epic Y: [Name] — [one-line summary] (all dependencies met)

### Recommended Action
[Your recommendation and why]

### Outstanding Items (non-blocking)
- [Items to address later]
```

---

## Step 4: Refresh Documentation

After presenting the orientation summary, automatically refresh `docs/architecture.md` and
`docs/design-notes.md` to reflect the as-built codebase. Delegate this to a subagent using
the Haiku model so the main session stays focused.

Use the Agent tool with model `haiku` (the shorthand resolves to the current Haiku version automatically). Brief the subagent with:

> Execute the `/epic-workflow:refresh-docs` skill (no arguments — refresh both documents).
> When you reach Step 8 (Commit), auto-commit without asking the user for permission.
> Commit message format: `docs: refresh architecture and design notes — <brief summary of changes>`
> Do NOT push to the remote.

**Wait for the subagent to complete before proceeding.** The refreshed documents must be
committed on the feature branch before it is merged into main.

---

## Step 5: Merge to Base Branch

After Phase 3 orientation is complete, merge the feature branch into the base branch and clean up:

1. Note the current feature branch name (`feature/epic-N-<short-name>` or legacy `feat/epic-N`)
2. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`
3. Switch to the base branch: `git checkout <base-branch>`
4. Merge with a no-fast-forward merge:
   `git merge <branch> --no-ff -m "epic(N): merge <branch> — <brief summary>"`
5. Delete the feature branch: `git branch -d <branch>`
6. Confirm with `git log --oneline -5`
7. Report to the user:
   > Branch `<branch>` has been merged into `<base-branch>` and deleted.
   > Changes have not been pushed — run `git push` when ready.
