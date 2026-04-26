---
name: status
description: |
  Displays a project status dashboard — epic progress, active work, stale paused epics, and next actions.
  Strictly read-only — does not modify any files.
  Triggers on: "status", "project status", "what's the progress", "how far along are we",
  "show me the dashboard", "where are we", "what's left to do", "epic status".
---

You are generating a read-only project status dashboard from the implementation plan.

**This command is strictly read-only — do NOT modify any files.**

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/epic-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Phase Indexes

Glob `docs/implementation-plan/phase-*/index.md`. If no phase index files exist, inform the user:

> No implementation plan found. Run `/epic-workflow:discover` and `/epic-workflow:plan-project` first to create the plan.

Stop here if no phase indexes are found.

Read every phase index file. For each, capture:
- Phase number and name (from the `# Phase N: Name` heading)
- Each epic row: **Epic ID** (verbatim — may be a legacy integer like `7` or `6.5`, or a 7-character alphanumeric ID like `a3f2K7p`), epic name, and the dependency IDs listed in the Dependencies column

## Step 2: Load Status Sidecars

Glob `docs/implementation-plan/status/epic-*.md` and read every sidecar. For each, capture:
- Epic ID (from the filename: `epic-<id>.md` → `<id>`)
- `status:` value (Not Started, In Progress, Paused, Implemented, Complete)
- `implemented:` date (if set)
- `completed:` date (if set)
- `handoff:` link (if set)

## Step 3: Build Dependency Graph

Using the Dependencies column values from all phase indexes (Step 1), build an internal map of which epics depend on which other epics.

## Step 4: Compute Summary Statistics

Using the epic IDs, statuses, and dates loaded from the sidecars (Step 2), calculate:
- **Total epics** and count by status (Not Started, In Progress, Paused, Implemented, Complete)
- **Phase progress** — for each phase (from Step 1), show X/Y epics complete (count both "Implemented" and "Complete" as done)
- **Overall progress** — percentage of epics that are "Implemented" or "Complete"

## Step 5: Flag Stale Paused Epics

For each epic whose sidecar (Step 2) has `status: Paused`:
1. Read its handoff file from `docs/implementation-plan/session-handoffs/epic-<id>-paused.md` (where `<id>` is the epic's ID — legacy integer or 7-char alphanumeric)
2. Check the **Paused** date
3. If the pause date is more than 7 days ago, flag it as stale

## Step 6: Identify Ready-to-Start Epics

Using the dependency graph from Step 3 and statuses from Step 2, find epics that are "Not Started" but whose dependencies are ALL satisfied (status "Implemented" or "Complete"). These are unblocked and ready to begin.

## Step 7: Present Dashboard

Using the data assembled from phase indexes (Steps 1–3) and sidecars (Step 2), render:

```
# Project Status Dashboard

## Overall Progress

[N]% complete — [X] of [Y] epics done

| Status | Count |
|--------|-------|
| Complete | [N] |
| Implemented | [N] |
| In Progress | [N] |
| Paused | [N] |
| Not Started | [N] |

## Phase Progress

| Phase | Name | Progress | Status |
|-------|------|----------|--------|
| 1 | [Name] | [X/Y] | [Complete / In Progress / Not Started] |
| ... | ... | ... | ... |

## Active Work

[List any epics currently "In Progress" with their name and phase]
[If none: "No epics currently in progress."]

## Stale Paused Epics (>7 days)

[List any stale paused epics with their pause date and how many days ago]
[If none: "No stale paused epics."]

## Ready to Start

[List epics that are unblocked and "Not Started", with their dependencies (all met)]
[If none: "No unblocked epics ready to start — check the dependency graph."]

## Recently Completed

[List the last 3 epics that reached "Implemented" or "Complete" status, with dates from their sidecars]

## Suggested Next Action

[Based on the current state, recommend what to do next (use the epic's ID verbatim — legacy integer or 7-char alphanumeric):
 - If there's an "In Progress" epic: "Continue working on Epic <id> with `/epic-workflow:start <id>`"
 - If there's an "Implemented" epic awaiting review: "Review Epic <id> with `/epic-workflow:wrapup <id>`"
 - If there's a stale paused epic: "Resume or close paused Epic <id> — it's been [X] days"
 - If there are ready-to-start epics: "Start Epic <id> with `/epic-workflow:start <id>`"
 - If all epics are complete: "All epics complete! Consider `/epic-workflow:refresh-docs` before release."]
```
