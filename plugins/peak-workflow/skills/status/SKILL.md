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

**This command is strictly read-only — do NOT modify any files.** The one git command that
writes anything is `git fetch` (Step 0.5), which updates remote-tracking refs only — never a
tracked file, a local branch, or the working tree.

**Epic references.** Everywhere this dashboard names an epic, print it as `<id> (<slug>) — <Name>`,
where `<slug>` is the spec filename with the `epic-<id>-` prefix and `.md` suffix stripped (the
same short name `start-epic` uses for the branch). Never print an epic by ID alone — random IDs
are unrecognizable to a teammate who did not plan them.

**Who "you" are (`me`).** Compare case-insensitively, trimmed. Your names are
`git config user.name` plus every author name already used with your email — collect them once:
`git log --all --format='%ae|%an' | awk -F'|' -v e="$(git config user.email)" 'tolower($1)==tolower(e) {print $2}' | sort -u`.
A commit is yours when its author email (`%ae`) equals `git config user.email` or its author name
(`%an`) is one of your names; a bare name (a `**Planned by:**` or `owner:` value) is yours when it
is one of your names. Shell variables do not persist between commands — inline
`$(git config user.email)` / `$(git config user.name)` where a command needs them. Never decide
with `git log --author` (a regex substring match).

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On `verdict: behind`, print its message as a banner above everything else and continue in
degraded mode: show what the files hold, and add to the
banner that figures may be incomplete until the upgrade runs. On any other exit, print its output and stop — it
names the fix (a plugin update or a Python install).

---

Follow these steps exactly:

## Step 0.5: Freshness

A dashboard read from a stale checkout hides a teammate's work. Before loading anything:

1. Detect the base branch: `git branch --list develop main master` — prefer `develop`, then
   `main`, then `master`. Call it `<base>`.
2. If `git remote` lists `origin`, run `git fetch --quiet origin`. If there is no remote, or the
   fetch fails (offline), skip the rest of this step silently.
3. If `origin/<base>` exists, count commits:
   `git rev-list --left-right --count <base>...origin/<base>` → `<ahead> <behind>`.
4. If `<behind>` is greater than 0, print this banner at the very top of the dashboard:

   > ⚠️ Your `<base>` is <behind> commit(s) behind `origin/<base>` — this dashboard shows your
   > local copy. Run `git checkout <base> && git pull --ff-only origin <base>` to see your teammates' latest work, then re-run
   > `/peak-workflow:status`.

Do not pull — this command stays read-only.

## Step 1: Load Phase Indexes

Glob `docs/implementation-plan/phase-*/index.md`. If no phase index files exist, inform the user:

> No implementation plan found. Run `/peak-workflow:discover`, `/peak-workflow:capture-requirements`, and `/peak-workflow:plan-project` first to create the plan.

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
- `waived:` line (optional, written by `wrapup-epic`): comma-separated `TOR-… → <succ>` pairs.
  Parse into a TOR ID → successor epic ID map.
- `owner:` line: the person working on it (set by `start-epic`). `—` means unclaimed.

Take each epic's **Slug** from its spec filename alone — glob
`docs/implementation-plan/phase-*/epic-*.md`, do not open the specs (see "Epic references" above).
Planner, date, and purpose are read later, in Step 6, for ready epics only.

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

1. Search all epic sidecars' `requirements:` fields for this TOR ID. Ignore any epic whose
   `waived:` line also lists this TOR ID — a waived TOR is not satisfied by that epic; its
   coverage comes from the successor epic named after the arrow. If no other epic lists it,
   the status is `Waived (→ epic <succ>, successor does not list it)`.
2. Map the TOR ID's coverage status based on the containing epic's `status:`:

   | Epic Status | TOR Coverage Status |
   |---|---|
   | No epic contains this TOR ID | `Specified (uncommitted — no epic assigned)` |
   | Not Started | `Planned` |
   | In Progress | `In Progress` |
   | Paused | `Paused (with epic <id>)` |
   | Implemented | `Implemented (pending independent verification)` |
   | Complete | `Verified` |

3. If a TOR ID appears in more than one epic's `requirements:` field **after excluding epics
   that waive it**, use the most advanced status among those epics. Owning a TOR twice is a
   health finding, reported by `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" check --json`
   as finding F with `"kind": "multi-owner"` (`detail.epics` lists the owners) — run it once and
   keep those findings for the dashboard.

Count totals for each coverage status. Compute overall verified percentage:
`(Verified count / total TOR count) * 100`

## Step 5: Flag Stale Paused Epics

For each epic whose sidecar (Step 2) has `status: Paused`:
1. Read its handoff file from `docs/implementation-plan/session-handoffs/epic-<id>-paused.md` 
2. Check the **Paused** date
3. If the pause date is more than 7 days ago, flag it as stale

## Step 5.5: What's New Since You Last Looked

A teammate's merged plan is otherwise indistinguishable from your own. Show what changed on
`<base>` since the user's own last commit there:

`me` below follows "Who you are" above.

1. Find the starting point `<since>`: the user's own last commit on `<base>` — list
   `git log --format='%H|%ae|%an' <base>` and take the first row that is yours. If there is none, fall back
   to the last commit before a 14-day window, `git rev-list -1 --before="14 days ago" <base>`, and
   label the panel "in the last 14 days" instead of "since your last commit". If the repository is
   younger than that, use its root commit: `git rev-list --max-parents=0 <base> | tail -1`.
2. List the planning commits since then, dropping rows that are yours:
   `git log --format='%h|%ae|%an|%ad|%s' --date=short <since>..<base> -- docs/implementation-plan docs/requirements`
3. Classify what changed: `git diff --name-status <since> <base> -- docs/implementation-plan/`.
   - An added `phase-*/index.md` → **new phase**.
   - An added `phase-*/epic-*.md` → **new epic**.
   - A modified `status/epic-*.md` → **status change**: read the old value with
     `git show <since>:<path>` and the new one with `git show <base>:<path>` (not the working
     tree, which differs when the user is on a feature branch).
   - Ignore every other path (added sidecars, READMEs, handoffs).
   Attribute each change to the last commit touching that path in the range,
   `git log -1 --format='%ae|%an|%ad' --date=short <since>..<base> -- <path>`; omit it when that
   commit is yours.
4. **Not pulled yet.** If Step 0.5 found `<behind>` greater than 0, also list
   `git log --format='%h|%an|%ad|%s' --date=short <base>..origin/<base> -- docs/implementation-plan docs/requirements`
   as rows marked **not pulled yet** (change = the commit subject). In that case never print
   "Nothing new from teammates." — the new work is on origin.

Render the result in Step 7's **New Since You Last Looked** panel.

## Step 6: Identify Ready-to-Start Epics

Using the dependency graph from Step 3 and statuses from Step 2, find epics that are "Not Started" but whose dependencies are ALL satisfied (status "Implemented" or "Complete"). These are unblocked and ready to begin.

For each ready epic, also compute **Unblocks** — the number of Not Started epics that list it as a
direct dependency. Then read the spec facts for the ready epics only — never every spec — with one
command over their spec paths (no full-file reads):
`grep -H -E -A3 '^\*\*Planned( by)?:\*\*|^## Description' <ready-spec-paths>`
- **Planned by** and **Planned** — the `**Planned by:**` and `**Planned:**` lines.
- **Purpose** — the first sentence after `## Description`, cut to about 90 characters.

Flag a ready epic with `⚑` when its **Planned by** is set and is not one of your names.

## Step 7: Present Dashboard

Using the data assembled from phase indexes (Steps 1–3) and sidecars (Step 2), render:

```
# Project Status Dashboard

[Step 0.5 behind-origin banner, if any]

## New Since You Last Looked

[Skip this panel if Step 5.5 was skipped. Otherwise, heading line:
 "Changes by teammates since your last commit on <base> (<short-sha>, <date>):" — or
 "Changes by teammates in the last 14 days:" on the fallback path]

| Change | Epic / Phase | By | Date |
|--------|--------------|----|------|
| New phase | Phase 4 — Frontend Migration | Todd | 2026-09-28 |
| New epic | aBVPpli (svelte-skeleton) — Svelte Skeleton and Integration Branch | Todd | 2026-09-28 |
| Status change | r8W6j9a (habit-management) — Not Started → In Progress | Todd | 2026-09-29 |
| Not pulled yet | 9424bd8 docs: frontend migration plan — … | Todd | 2026-09-28 |

[If nothing changed and nothing is waiting on origin: "Nothing new from teammates."]

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
| Waived (successor does not list it) | [N] |
| Specified (no epic assigned) | [N] |

**Total TOR requirements in baseline:** [Y]

[If any TOR IDs are "Specified (no epic assigned)":]
> ⚠️ [N] TOR requirements have no epic assigned. Run `/peak-workflow:add` to plan their implementation.

[If any TOR IDs are "Waived (successor does not list it)":]
> ⚠️ [N] waived TOR requirements name a successor epic that does not list them: {TOR → epic list}. Add them to the successor's spec and sidecar.

[If `check` reported any `multi-owner` findings (Step 4.5 item 3):]
> ⚠️ [N] TOR requirements are owned by more than one epic: {TOR (epic, epic) list}. Each TOR should have exactly one owner.

## Active Work

[List any epics currently "In Progress" as `<id> (<slug>) — <Name>`, with phase and owner]
[If none: "No epics currently in progress."]

## Stale Paused Epics (>7 days)

[List any stale paused epics with their pause date and how many days ago]
[If none: "No stale paused epics."]

## Ready to Start

| Epic | Name | Phase | Planned by | Added | Unblocks | Purpose |
|------|------|-------|------------|-------|----------|---------|
| Uq8QpFa (backup-and-restore) | Backup and Restore | 3 — Extend | Abigail | 2026-08-14 | 0 | Export and import all habit data as a JSON file |
| ⚑ aBVPpli (svelte-skeleton) | Svelte Skeleton and Integration Branch | 4 — Frontend Migration | Todd | 2026-09-28 | 2 | Stand up SvelteKit static beside the React app |

[One row per ready epic from Step 6. `⚑` marks an epic planned by someone other than you; `—`
means the spec records no planner.]
[If none: "No unblocked epics ready to start — check the dependency graph."]

## Recently Completed

[List the last 3 epics that reached "Implemented" or "Complete" status, with dates from their sidecars]

## Suggested Next Action

[Based on the current state, recommend what to do next. Name every epic as `<id> (<slug>) — <Name>`:
 - If there's an "In Progress" epic: "Continue working on Epic <id> (<slug>) — <Name> with `/peak-workflow:start-epic <id>`" — when its `owner:` is set and is not you, say whose it is instead ("In progress by <owner> — coordinate before touching it")
 - If there's an "Implemented" epic awaiting review: "Review Epic <id> (<slug>) — <Name> with `/peak-workflow:wrapup-epic <id>`"
 - If there's a stale paused epic: "Resume or close paused Epic <id> (<slug>) — <Name> — it's been [X] days"
 - If there are "Specified" TOR IDs (no epic): "Run `/peak-workflow:add` to assign [N] unplanned TOR requirements to epics"
 - If exactly one epic is ready to start: "Start Epic <id> (<slug>) — <Name> with `/peak-workflow:start-epic <id>` — <one-clause reason, e.g. the only unblocked epic>"
 - If several epics are ready to start: do **not** pick one. Write "[N] epics are ready — choose from the Ready to Start table above", and add one line when the ready epics span more than one phase or more than one planner ("They come from phases 3 and 4; ⚑ rows were planned by someone else — check with them before starting"). Choosing among ready epics is the team's decision, not the dashboard's.
 - If all epics are complete and all TOR IDs are Verified: "All requirements verified! Consider `/peak-workflow:refresh-docs` before release."
 - If all epics are complete but some TOR IDs still show Implemented (not Verified): "Run `/peak-workflow:wrapup-epic <id>` to complete independent verification of remaining epics."]
```
