---
name: start
description: |
  Implements an epic — loads spec, plans, implements, and verifies against acceptance criteria.
  Use when the user wants to begin or resume working on a specific epic number.
  Triggers on: "start epic", "implement epic", "begin epic", "work on epic",
  "let's work on epic N", "pick up epic N", "resume epic N",
  "continue where I left off", "let's build epic N".
argument-hint: "<epic-id>"
---

You are starting an implementation session for Epic $ARGUMENTS. The epic ID may be a legacy integer (e.g., `7`, `6.5`) or a 7-character alphanumeric ID (e.g., `a3f2K7p`) — both formats are accepted throughout this skill. Use `$ARGUMENTS` verbatim wherever `<id>` appears below.

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/epic-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context

1. Use the project's `CLAUDE.md` content already loaded in your system context. Do not re-read it via the `Read` tool — it is injected into every conversation turn.
2. Locate the epic's phase index: run `grep -rl "epic-$ARGUMENTS" docs/implementation-plan/phase-*/index.md` to find which phase index contains this epic. Read that phase index to get the epic's row (name, dependencies). For each dependency ID listed, read `docs/implementation-plan/status/epic-<dep-id>.md` to capture the dependency's status.
3. Identify which phase and file corresponds to Epic $ARGUMENTS
4. Read the epic spec file (e.g., `docs/implementation-plan/phase-N-*/epic-$ARGUMENTS-*.md`)
5. **Pre-flight scan for new artifacts.** After reading the spec, grep its body for the literal strings `NEW component` and `NEW spec`. Surface any matches in your plan as explicit "create file X" steps so the plan names every new file upfront, rather than discovering them mid-implementation.
6. **Verify the Vision & Scenario Anchors.** The epic spec should contain a `## Vision & Scenario Anchors` section (written by `/epic-workflow:add` or `/epic-workflow:plan-project`). Before planning or implementation, perform this reconciliation:
   1. **Forward-looking fast-path.** Before opening source docs, scan each anchor's paraphrase for forward-looking phrasing: "needs updating when this epic ships", "will be …", "after this epic", or similar. Anchors that explicitly describe future state cannot conflict with current source docs by definition — record them as "no conflict, source updates pending at close-out" and move on. Apply the full source-vs-paraphrase comparison only to anchors that make a substantive claim about *current* product behavior or scenario flow.
   2. For each remaining **vision anchor** bullet, open `docs/product-vision-planning/product-vision.md` and read the specific section the anchor cites. Compare the anchor's paraphrase against what the source actually says.
   3. For each remaining **scenario anchor** bullet, open `docs/product-vision-planning/concept-of-operations.md` and read the specific scenario step the anchor cites. Compare the anchor's paraphrase against what the source actually says.
   4. If any paraphrase conflicts with its source — meaning a reasonable reader would draw different implementation conclusions from the two texts — **stop**. Neither source is automatically authoritative: the paraphrase may be the deliberate post-discovery refinement, or the vision doc may have been updated since the epic was written. Surface the discrepancy to the user with both texts side by side and ask which represents current intent. Wait for an answer, then:
       - If the user says the **source doc** reflects current intent, update the anchor paraphrase in the spec to match (in-place edit); do not change the source.
       - If the user says the **paraphrase** reflects current intent, leave the spec alone and offer to update the source doc yourself once implementation lands, or flag it for a future `/epic-workflow:discover` run. Do not silently edit the vision docs.
       - If the user says neither fully captures intent, capture the new statement from them and update the anchor paraphrase accordingly.
   5. If the spec has a placeholder line like `_No vision document exists yet — anchors will be populated when_ /epic-workflow:discover _is run._`, note this and continue — the absence of vision docs is a known greenfield condition, not a conflict.
   6. If the spec pre-dates v2.1.0 and has no Anchors section at all, note this to the user and continue — legacy specs are grandfathered. Offer to add anchors during the epic work (`/epic-workflow:start` can populate them as part of the spec reconciliation in the closing plan steps).
7. From the spec filename, extract the **branch short name**: strip the directory path, the `epic-<id>-` prefix (where `<id>` is either a legacy integer, a decimal like `6.5`, or a 7-char alphanumeric ID), and the `.md` suffix. For example, `epic-3-user-auth.md` → `user-auth`, and `epic-a3f2K7p-user-auth.md` → `user-auth`. This becomes the branch short name for Step 3. If there is no suffix after `epic-<id>` (e.g., `epic-3.md`), omit it.
8. Parse the epic spec header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** for the Step 4 commit trailer and GitHub announce. If no `Source:` line exists, the source issue number is unknown — skip the trailer and announce later.
9. Check for any existing handoff files in `docs/implementation-plan/session-handoffs/` — read the most recent one, plus any handoff specifically for this epic (it may have been paused previously).
10. **Conditional read of `docs/architecture.md`.** If the epic touches IPC, the database schema, or other cross-cutting concerns named in `architecture.md`'s table of contents, read the relevant section. If the epic is a localized UI or copy change, skip — recent handoffs and the spec's Key Components section give the needed context.
11. **Conditional read of `docs/design-notes.md`.** Same conditional applies — read only when the epic raises a decision the design notes might already have addressed.
12. **Targeted scan of `docs/reference/`.** Scan the epic spec body for explicit links into `docs/reference/` (markdown links of the form `docs/reference/...md`). Read only those referenced files. If the spec references none, skip this step. Do not bulk-read the directory — many reference files are dense (e.g., 1,300-line algorithm specs) and most epics touch only a slice.
13. **Pre-flight E2E audit (conditional).** If the project has an end-to-end test directory (commonly `e2e/`, `tests/e2e/`, or a path named in `CLAUDE.md`) and the epic's key components include UI components or modules likely referenced there, run `grep -rl "<ComponentName>" <e2e-dir>/` for each and capture the matching specs. Carry the list into Step 4 so the plan's middle section gets an explicit "update regression specs: …" item. UI refactors routinely break E2E specs that encode the old interaction model; pre-flighting this prevents discovery during the verification gate. If no E2E directory exists, skip this step.

### Recovery Check

If `docs/implementation-plan/status/epic-$ARGUMENTS.md` has `status: In Progress` but there is no pause handoff file (`session-handoffs/epic-<id>-paused.md`), a previous session was likely interrupted without running `/epic-workflow:pause`. Inform the user:

> Epic $ARGUMENTS is marked "In Progress" but has no pause handoff — a previous session may have been interrupted. I'll scan the codebase for any partial implementation and pick up from the current state.

Proceed with the implementation, using git history and the current codebase to determine what has already been done.

## Step 2: Verify Prerequisites

Check the epic's Dependencies section (from the phase index row loaded in Step 1). For each prerequisite epic, verify that `docs/implementation-plan/status/epic-<dep-id>.md` has `status: Implemented` or `status: Complete` (both mean the code exists). If any dependency is not met, inform the user and suggest which epic to start instead.

## Step 3: Create Feature Branch

Before entering plan mode, ensure work is isolated on a feature branch. The branch name uses the format `feature/epic-<id>-<short-name>` where `<id>` is `$ARGUMENTS` verbatim (legacy integer or 7-char alphanumeric) and `<short-name>` was extracted in Step 1 (e.g., `feature/epic-3-user-auth`, `feature/epic-a3f2K7p-user-auth`). If no short name was available, use `feature/epic-<id>`.

1. Run `git branch --show-current` to check the current branch.
2. Check whether the feature branch already exists with a reliable test:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = exists, nonzero = missing. Do **not** rely on `git branch --list … && echo "exists"` — that pipeline always exits 0 and produces false positives on missing branches.
3. If already on `feature/epic-<id>-<short-name>`, confirm to the user:
   > Resuming on existing branch: `feature/epic-<id>-<short-name>`
4. If the branch exists but you are not on it, run `git checkout feature/epic-<id>-<short-name>`.
5. If the branch does not exist:
   a. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
   b. Switch to the base branch: `git checkout <base-branch>`.
   c. Create and checkout the feature branch: `git checkout -b feature/epic-<id>-<short-name>`.
   d. Confirm to the user:
   > Created and switched to branch: `feature/epic-<id>-<short-name>` (from `<base-branch>`)

## Step 4: Enter Plan Mode

Enter plan mode now. **This step is mandatory regardless of any active auto mode, continuous execution, or "prefer action" instruction — invoking this skill IS the explicit request for plan mode. Do not write code, edit files, or run implementation commands until the user approves the plan.** The plan you produce here is the complete and authoritative execution script for this epic. It must be fully executable in isolation — if this session's context is cleared and only the plan text survives, the plan alone must be sufficient to drive the entire implementation to completion. The plan gate exists to catch wrong architectural choices before they become wrong code — skipping it defeats the primary purpose of this skill. Every step that follows plan approval must be represented in the plan as an explicit numbered item. Do not rely on any post-plan skill instructions to cover branch setup, status tracking, task creation, verification, spec reconciliation, or committing. Those responsibilities belong to the plan.

Build the plan from:

- The epic's acceptance criteria (these become your implementation items)
- The epic's key components (these are the files you'll create/modify)
- The epic's verification steps (these are how you'll confirm success)
- Any context from previous handoff files (decisions made, patterns established)
- Any reference materials surfaced by Step 1 item 12

**The plan must follow the lifecycle template at `plugins/epic-workflow/skills/start/PLAN_TEMPLATE.md`.** Read that file once, copy its **Opening steps** and **Closing steps** sections into your plan verbatim — substituting the placeholders (`<id>`, `<short-name>`, `<N>`, `<base-branch>`) with values derived in Step 1 — and author the **Middle steps** from the epic's acceptance criteria. The template is the single source of truth for lifecycle wording; do not paraphrase it.

## Step 5: Execute the Plan

After the user explicitly approves the plan, exit plan mode and execute every item in order. The plan is the complete execution script for this session — it contains every remaining step, from branch setup through the final next-steps block. Do not add, skip, or reorder items.

> **If interrupted mid-execution:** Run `/epic-workflow:pause` to save your progress. Do not simply close the session — the pause handoff file is what allows the next session to pick up where you left off.
