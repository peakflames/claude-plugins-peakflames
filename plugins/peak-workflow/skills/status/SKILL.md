---
name: status
description: |
  Displays a project status dashboard — epic progress, requirements coverage and health, active
  work, stale paused epics, and next actions.
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
On exit 1 with `verdict: behind`, print its message as a banner above everything else and continue in
degraded mode: show what the files hold, and add to the banner that figures may be incomplete
until `/peak-workflow:upgrade` brings the project up to date. In degraded mode that fix
is the top Suggested Next Action — above even an overdue Disputed requirement — and every other
action is marked "after the fix": the writing skills stop on a behind project. On any other exit, print its output and stop — it
names the fix (a plugin update or a Python install).

**This skill computes no requirement state itself.** Every requirement figure — states, the
verified percentage, findings A–F, overdue Disputed requirements — comes from the helper's two
JSON reports (Step 1.5). Never re-derive a state from feature files, sidecars, or Change Records.

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

## Step 1.5: Load the Requirements Reports

If `docs/requirements/` holds no `*.feature.md` file, no requirements baseline exists yet: skip
this step, and skip the Requirements Coverage, Changed Since Verified, and Requirements Health
panels. Otherwise run both, once each:

- `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" states --json` → **`states`**. `summary.live`
  is the live-requirement count (the denominator), `summary.verified` and
  `summary.verified_percent` the verified figures, `summary.by_state` the count per state.
  `requirements` holds one row per ID: `tor`, `state`, `live`, `title`, `epic` (the owning epic
  the state comes from), `dispute` (for a Disputed row: `record`, `age_days`, `threshold_days`,
  `safety`, `overdue`), `underlying_state` (what a Disputed row would otherwise be), `waived_to`,
  `successors`, `record`, and `removal_epics`. Retired and superseded IDs appear with
  `live: false` and are never in the denominator.
- `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" check --json` → **`check`**. Exit 0 (no
  findings) and exit 1 (findings) are both success. `counts` is the number per letter A–F;
  each entry of `findings` has `letter`, `message` (plain English, ready to print), `tor`,
  `epic`, `path`, `kind` (for F), and `detail`.

Either command exiting 2 or 3 is not a dashboard figure: print its output under the
Requirements Coverage heading, skip the three requirements panels, and render the rest. On a
project the Format Guard reported `behind` this is expected for older files — the banner already
names the fix. Never fall back to counting the files yourself.

## Step 2: Load Status Sidecars

Glob `docs/implementation-plan/status/epic-*.md` and read every sidecar. For each, capture:
- Epic ID (from the filename: `epic-<id>.md` → `<id>`)
- `status:` value (Not Started, In Progress, Paused, Implemented, Complete)
- `implemented:` date (if set)
- `completed:` date (if set)
- `handoff:` link (if set)
- `owner:` line: the person working on it (set by `start-epic`). `—` means unclaimed.
- `retires:` line (optional): the Change Record(s) a removal epic carries out.

An epic's `status:` and `owner:` move on its feature branch until it merges. For a sidecar reading
In Progress whose `feature/epic-<id>-*` branch exists locally (`git branch --list
'feature/epic-<id>-*'`), read `status:`, `owner:`, and `handoff:` from that branch instead
(`git show <branch>:docs/implementation-plan/status/epic-<id>.md`), as start-epic Step 2.5 does —
so a pause made there shows as Paused, and Step 5 can flag it.

Requirement ownership, `verified:`, `unverified:`, and `waived:` are read by the helper (Step
1.5), not here.

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

## Step 4.5: Requirements Coverage, Health, and the Nudge

Skip this step when Step 1.5 was skipped or failed. Everything below reads `states` and `check`.

1. **Coverage.** The denominator is `summary.live` — live requirements only; superseded and
   retired IDs never count. The headline is `summary.verified` of `summary.live`
   (`summary.verified_percent`). Fill the Requirements Coverage table from `summary.by_state`
   using the derived-state table:

   | State (from `states`) | Counts as verified | Where its next step appears |
   |---|---|---|
   | Verified | Yes | — |
   | Verified (reworded) | Yes | — |
   | Verified (legacy, unfingerprinted) | Yes — shown on its own row | — (the upgrade's seed fingerprints these) |
   | Changed since verified | No | Changed Since Verified panel |
   | Verification failed | No | Changed Since Verified panel |
   | Disputed | No | Health panel (F); overdue → top Suggested Next Action |
   | Implemented | No | Suggested Next Action (wrapup) |
   | In Progress / Paused / Planned | No | — |
   | Waived | No | Coverage warning |
   | Specified | No | Coverage warning; Suggested Next Action (`/add`) |
   | Superseded | Not in the denominator | — |
   | Retired | Not in the denominator | — |
   | Retired, removal pending | Not in the denominator | Coverage warning |

   Omit rows whose count is 0, except Verified. Labels: `Planned` → "Planned (Not Started)",
   `Implemented` → "Implemented (pending verification)", `Waived` → "Waived (successor does not
   list it)", `Specified` → "Specified (no epic assigned)"; every other state prints as its key.
2. **Changed since verified, by epic.** Group the live rows whose `state` is `Changed since
   verified` or `Verification failed` (and Disputed rows whose `underlying_state` is one of them)
   by `epic`. One group per Complete epic: its `<id> (<slug>) — <Name>`, each requirement as
   `TOR-… — <title>`, and the command `/peak-workflow:wrapup-epic <id> reverify`. A Verification
   failed requirement adds "fix the code first with `/peak-workflow:quick-fix`" — unless it is
   Disputed, which adds "known to be wrong (<CR-ID>): decide with
   `/peak-workflow:capture-requirements <TOR>` first — uphold it if it stands" instead. A requirement in
   this group (either state) that also has an A finding (edited without a record) adds "decide first
   whether its meaning changed: `/peak-workflow:capture-requirements <TOR>`" — reverify alone
   would ratify an unrecorded edit. A row with `historical_records` (an edit from before 3.0,
   recorded by the upgrade without test evidence) adds "edited before 3.0 (<CR-IDs>): if its meaning
   changed, `/peak-workflow:capture-requirements <TOR>`; if not, reverify". The epic stays
   Complete — the Phase Progress and Overall Progress counts do not change.
3. **Health.** Group `check.findings` by letter A–F with `check.counts`. Print each finding's
   `message` verbatim; when a letter has more than 8 findings, print the first 8 and "… and N
   more". Do not reword, re-rank, or re-check them. The panel carries their next steps;
   Suggested Next Action adds lines only for overdue `disputed` and `removal-missing`.
4. **Disputed past the threshold.** The live rows whose `dispute.overdue` is true. A `# Safety`
   requirement (`dispute.safety`) is always overdue (its threshold is 0 days). The oldest one —
   Safety first — becomes the **top** Suggested Next Action.
5. **The nudge.** If any live row is Disputed, Changed since verified, or Verification failed, Step 7 opens with one
   plain sentence naming the counts and the next command, for example: "2 requirements are known
   to be wrong, 3 changed after they were verified, and 1 failed verification — start with
   `/peak-workflow:capture-requirements TOR-02-Mail001`." The command is the top requirement
   action (an overdue Disputed one, else the first Changed Since Verified group's — or, when that
   group's first requirement carries an A finding or `historical_records`, its
   `/peak-workflow:capture-requirements <TOR>` decision first; when it is Verification failed,
   `/peak-workflow:quick-fix` for the code first — else the oldest Disputed one's
   `/peak-workflow:capture-requirements <TOR>`), even in degraded mode — there, add "after the fix".

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

Using the data assembled from phase indexes and sidecars (Steps 1–3) and the requirements reports (Steps 1.5 and 4.5), render:

```
# Project Status Dashboard

[Format Guard behind banner, if any — degraded mode]
[Step 0.5 behind-origin banner, if any]
[Step 4.5 nudge, if any]

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

[Skip this panel if no requirements baseline exists. If Step 1.5 failed, print the helper's
output here instead and skip the next two panels too.]

[summary.verified_percent]% of live TOR requirements verified — [summary.verified] of [summary.live]

| Requirement state | Count |
|---|---|
| Verified | [N] |
| Verified (reworded) | [N] |
| Verified (legacy, unfingerprinted) | [N] |
| Changed since verified | [N] |
| Verification failed | [N] |
| Disputed | [N] |
| Implemented (pending verification) | [N] |
| In Progress | [N] |
| Paused | [N] |
| Planned (Not Started) | [N] |
| Waived (successor does not list it) | [N] |
| Specified (no epic assigned) | [N] |

**Live requirements:** [summary.live]. Not counted: [N] superseded, [N] retired, [N] retired
with removal pending.

[If any are Specified:]
> ⚠️ [N] requirements have no epic assigned. Run `/peak-workflow:add` to plan them.

[If any are Waived:]
> ⚠️ [N] waived requirements name a successor epic that does not list them: {TOR → epic list}. Add them to the successor's spec and sidecar.

[If any are Retired, removal pending:]
> ⚠️ {CR-ID} retired {TOR list} but the code is still there — {removal epic `<id> (<slug>) — <Name>` and its status | no removal epic yet: `/peak-workflow:add removal epic for <CR-ID>`}.

## Changed Since Verified

[Skip when Step 4.5 item 2 found nothing. One block per epic:]

**<id> (<slug>) — <Name>** (Complete) — [N] requirement(s) to re-check
- TOR-… — <title> [— verification failed: fix the code first with `/peak-workflow:quick-fix`] [— edited without a record: decide first whether its meaning changed with `/peak-workflow:capture-requirements <TOR>`] [— edited before 3.0 (<CR-IDs>): if its meaning changed, `/peak-workflow:capture-requirements <TOR>`; if not, re-check]
- Re-check: `/peak-workflow:wrapup-epic <id> reverify`

## Requirements Health

[Skip when no baseline. Otherwise "No findings." when `check` reported none, else:]

| Finding | Count |
|---|---|
| A. Unrecorded change | [N] |
| B. Unrecorded removal | [N] |
| C. Dangling ID | [N] |
| D. Changed since verified | [N] |
| E. Retired or superseded ID still cited | [N] |
| F. Housekeeping and disputes | [N] |

[Then, per letter with findings, the heading and its messages verbatim (first 8, then "… and N more").]

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

[Based on the current state, recommend what to do next, in this order. Name every epic as `<id> (<slug>) — <Name>` and every requirement as `TOR-… — <title>`:
 - **First (after the degraded-mode fix, if any), when Step 4.5 item 4 found one:** the overdue Disputed requirement — "TOR-… — <title> is known to be wrong (<record>, <age_days> days[, a Safety requirement — no branch that touches it can ship]). Resolve it: `/peak-workflow:capture-requirements <TOR>`". When several are overdue, name the oldest (Safety first) and the count of the rest.
 - If there's an "In Progress" epic: "Continue working on Epic <id> (<slug>) — <Name> with `/peak-workflow:start-epic <id>`" — when its `owner:` is set and is not you, say whose it is instead ("In progress by <owner> — coordinate before touching it"); when `owner:` is `—` or missing and a `feature/epic-<id>-*` branch exists locally or on origin (`git branch -a --list '*feature/epic-<id>-*'`), say "In progress on <branch> — owner unknown; check with whoever pushed it before touching it"
 - If there's an "Implemented" epic awaiting review: "Review Epic <id> (<slug>) — <Name> with `/peak-workflow:wrapup-epic <id>`"
 - If a Disputed requirement is not overdue and the nudge's command does not name it: "Settle
   disputed TOR-… — <title> (<CR-ID>, <age> days of <threshold>): `/peak-workflow:capture-requirements <TOR>`" — the oldest one, after the re-check lines.
 - If any epic has requirements to re-check (Step 4.5 item 2): "Re-check Epic <id> (<slug>) — <Name>: `/peak-workflow:wrapup-epic <id> reverify`" — one line per epic, at most three, each carrying its group's caveat first ("fix the code with `/peak-workflow:quick-fix`, then …" or "decide on TOR-… with `/peak-workflow:capture-requirements TOR-…` first" — also for an edit from before 3.0)
 - If there's a stale paused epic: "Resume or close paused Epic <id> (<slug>) — <Name> — it's been [X] days"
 - If `check` reported `removal-missing`: "Plan the code removal for <CR-ID>: `/peak-workflow:add removal epic for <CR-ID>`"
 - If there are "Specified" requirements (no epic): "Run `/peak-workflow:add` to assign [N] unplanned TOR requirements to epics"
 - If exactly one epic is ready to start: "Start Epic <id> (<slug>) — <Name> with `/peak-workflow:start-epic <id>` — <one-clause reason, e.g. the only unblocked epic>"
 - If several epics are ready to start: do **not** pick one. Write "[N] epics are ready — choose from the Ready to Start table above", and add one line when the ready epics span more than one phase or more than one planner ("They come from phases 3 and 4; ⚑ rows were planned by someone else — check with them before starting"). Choosing among ready epics is the team's decision, not the dashboard's.
 - If all epics are complete and every live requirement counts as verified with no findings: "All requirements verified! Consider `/peak-workflow:refresh-docs` before release."
 - If all epics are complete but some requirements are still Implemented: "Run `/peak-workflow:wrapup-epic <id>` to complete independent verification of remaining epics."]
```
