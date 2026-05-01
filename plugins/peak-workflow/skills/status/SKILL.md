---
name: status
description: |
  Displays a project status dashboard — epic progress, requirements coverage, active work,
  stale paused epics, and next actions.
  Strictly read-only — does not modify any files.
  Triggers on: "status", "project status", "what's the progress", "how far along are we",
  "show me the dashboard", "where are we", "what's left to do", "epic status",
  "requirements coverage", "how many TOR IDs are covered".
---

You are generating a read-only project status dashboard from the implementation plan and the
requirements baseline.

**This command is strictly read-only — do NOT modify any files.**

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Phase Indexes

Glob `docs/implementation-plan/phase-*/index.md`. If no phase index files exist, inform the user:

> No implementation plan found. Run `/epic-workflow:discover` and `/epic-workflow:plan-project` first to create the plan.

Stop here if no phase indexes are found.

Read every phase index file. For each, capture:
- Phase number and name (from the `# Phase N: Name` heading)
- Each epic row: **Epic ID** (verbatim — 7-character alphanumeric ID like `a3f2K7p`), epic name, and the dependency IDs listed in the Dependencies column

Also glob `docs/requirements/*.feature.md` if the directory exists. For each feature file:
- Parse every `Scenario: [TOR-NN-XXXXXXX]` block — capture the TOR ID and scenario title.
- Build a flat list of all TOR IDs in the requirements baseline with their feature file source.

If `docs/requirements/` does not exist or is empty: note that no requirements baseline has been
established yet (no Requirements Coverage panel will be shown this run).

## Step 2: Load Status Sidecars

Glob `docs/implementation-plan/status/epic-*.md` and read every sidecar. For each, capture:
- Epic ID (from the filename: `epic-<id>.md` → `<id>`)
- `status:` value (Not Started, In Progress, Paused, Implemented, Complete)
- `implemented:` date (if set)
- `completed:` date (if set)
- `handoff:` link (if set)
- `requirements:` field (comma-separated TOR IDs, or `—` if empty). Parse the TOR IDs into a
  list; this is the set of TOR IDs this epic is responsible for implementing.

## Step 3: Build Dependency Graph

Using the Dependencies column values from all phase indexes (Step 1), build an internal map of which epics depend on which other epics.

## Step 4: Compute Summary Statistics

Using the epic IDs, statuses, and dates loaded from the sidecars (Step 2), calculate:
- **Total epics** and count by status (Not Started, In Progress, Paused, Implemented, Complete)
- **Phase progress** — for each phase (from Step 1), show X/Y epics complete (count both "Implemented" and "Complete" as done)
- **Overall progress** — percentage of epics that are "Implemented" or "Complete"

## Step 4.5: Compute Requirements Coverage

If no TOR IDs were found in Step 1 (requirements baseline is empty or missing), skip this step.

Build a TOR ID → coverage status map. For every TOR ID from the feature files:

1. Search all epic sidecars' `requirements:` fields for this TOR ID.
2. Map the TOR ID's coverage status based on the containing epic's `status:`:

   | Epic Status | TOR Coverage Status |
   |---|---|
   | No epic contains this TOR ID | `Specified (uncommitted — no epic assigned)` |
   | Not Started | `Planned` |
   | In Progress | `In Progress` |
   | Paused | `Paused (with epic <id>)` |
   | Implemented | `Implemented (pending independent verification)` |
   | Complete | `Verified` |

3. If a TOR ID appears in multiple epics' `requirements:` fields (rare but valid — multi-layer
   epic split), use the most advanced status among all containing epics.

Count totals for each coverage status. Compute overall verified percentage:
`(Verified count / total TOR count) * 100`

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

## Requirements Coverage

[Skip this panel if no requirements baseline exists. Otherwise:]

[N]% of TOR requirements verified — [X] of [Y] total

| Coverage Status | Count |
|---|---|
| Verified (Complete) | [N] |
| Implemented (pending verification) | [N] |
| In Progress | [N] |
| Planned (Not Started) | [N] |
| Paused | [N] |
| Specified (no epic assigned) | [N] |

**Total TOR requirements in baseline:** [Y]

[If any TOR IDs are "Specified (no epic assigned)":]
> ⚠️ [N] TOR requirements have no epic assigned. Run `/peak-workflow:add` to plan their implementation.

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

[Based on the current state, recommend what to do next:
 - If there's an "In Progress" epic: "Continue working on Epic <id> with `/peak-workflow:start <id>`"
 - If there's an "Implemented" epic awaiting review: "Review Epic <id> with `/peak-workflow:wrapup <id>`"
 - If there's a stale paused epic: "Resume or close paused Epic <id> — it's been [X] days"
 - If there are "Specified" TOR IDs (no epic): "Run `/peak-workflow:add` to assign [N] unplanned TOR requirements to epics"
 - If there are ready-to-start epics: "Start Epic <id> with `/peak-workflow:start <id>`"
 - If all epics are complete and all TOR IDs are Verified: "All requirements verified! Consider `/peak-workflow:refresh-docs` before release."
 - If all epics are complete but some TOR IDs still show Implemented (not Verified): "Run `/peak-workflow:wrapup <id>` to complete independent verification of remaining epics."]
```
