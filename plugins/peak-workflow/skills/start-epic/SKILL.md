---
name: start-epic
description: |
  Implements an epic — loads spec, loads TOR requirements from feature files, plans with
  TOR-driven user story tasks, implements, and verifies each TOR's Given/When/Then.
  Use when the user wants to begin or resume working on a specific epic.
  Triggers on: "start epic", "implement epic", "begin epic", "work on epic",
  "let's work on epic N", "pick up epic N", "resume epic N",
  "continue where I left off", "let's build epic N".
argument-hint: "<epic-id>"
---

You are starting an implementation session for an epic. `<id>` is the first word of `$ARGUMENTS`, used verbatim (an opaque string) wherever `<id>` appears below; any further words (e.g. `resume`) are not part of it.

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On any other exit, print its output and stop — it names the fix (`/peak-workflow:upgrade`, a
plugin update, or a Python install). After this guard, read the project's files only in the
current format.

## Freshness Guard

**Immediately after the Format Guard:** make sure the spec, sidecars, and plan you are about to
read are current — a teammate may have merged plan changes since this clone last synced.

1. Detect the base branch: `git branch --list develop main master` — prefer `develop`, then
   `main`, then `master`.
2. If `git remote` does not list `origin`, skip this guard silently. Otherwise run
   `git fetch --quiet origin`; if the fetch fails (offline), say
   `Freshness check skipped — origin not reachable` and continue.
3. If `origin/<base>` exists, count `git rev-list --count <base>..origin/<base>` (commits the
   local base is missing); otherwise skip this item.
   - **On the base branch and behind:** run `git pull --ff-only origin <base>` and tell the user
     `Pulled <N> new commit(s) on <base> before starting.` If the pull fails for any reason
     (diverged branches, local changes in the way), stop and show git's message:
     `Your <base> could not be fast-forwarded to origin/<base> — reconcile it before starting an epic.`
   - **On another branch and the base is behind:** fast-forward the base without checking it
     out: `git fetch origin <base>:<base>` (git refuses this unless it is a fast-forward). On
     success say `Updated <base> to origin (<N> commit(s)).` — Step 3's Leftover check then sees
     the team's current base. If it is refused, continue and say
     `Note: <base> is <N> commit(s) behind origin and could not be fast-forwarded.` An existing
     epic branch is never rebased.

## Requirements Health

**After the Freshness Guard, before any planning.** The helper is always called as
`sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <command>` (written `tor-lifecycle` below).
Run, once each, and keep the output for Step 1:

- `tor-lifecycle states --json` — every requirement's derived state and owning epic.
- `tor-lifecycle check --base <base> --json` (`<base>` from the Freshness Guard).
- `tor-lifecycle sweep --json` — tests and source still citing superseded or retired IDs.

Exit 2 or 3 from any of them is a data or install problem: print its output and stop. Exit 1
means findings — this skill warns and never blocks on them.

**The nudge.** If any live `states` row is Disputed, Changed since verified, or Verification
failed, open the session with one plain sentence naming the counts and the next command, e.g.
`3 requirements are known to be wrong, 1 changed after it was verified, and 1 failed
verification — start with /peak-workflow:capture-requirements TOR-04-Priv001 (it does not touch
this epic's anchors).` The command is the top requirement action exactly as
`/peak-workflow:status` Step 4.5 item 5 picks it (an overdue Disputed one, Safety first; else the
first Changed since verified or Verification failed one — `capture-requirements <TOR>` first when
it carries an A finding or `historical_records`, `quick-fix` first when it failed verification,
otherwise its reverify; else the oldest Disputed one). Say whether it
touches this epic's anchors (Step 1 item 6 handles those). When Step 1 stops the skill before
the Step 2.5 card, print the nudge after the stop message as one `Also:` line instead.

---

Follow these steps exactly:

## Step 1: Load Context

1. Use the project's `CLAUDE.md` content already loaded in your system context. Do not re-read it via the `Read` tool — it is injected into every conversation turn.
2. Locate the epic's phase index: run `grep -rl "epic-<id>" docs/implementation-plan/phase-*/index.md` to find which phase index contains this epic. Read that phase index to get the epic's row (name, dependencies). For each dependency ID listed, read `docs/implementation-plan/status/epic-<dep-id>.md` to capture the dependency's status.
3. Identify which phase and file corresponds to Epic <id>
4. Read the epic spec file (e.g., `docs/implementation-plan/phase-N-*/epic-<id>-*.md`).
4a. **Load TOR Requirements.** Read the epic's sidecar (`docs/implementation-plan/status/epic-<id>.md`,
    from the feature branch when it exists — Step 2.5 says how). It is a **removal epic** when it
    has a `retires:` line.
    - **No Requirements Anchors** — the epic is not a removal epic, and its spec has no
      `## Requirements Anchors` section or the section lists no TOR ID: stop.
      > Epic <id> (<slug>) — <Name> has no Requirements Anchors, so there is nothing to build
      > against or verify. Re-plan it with `/peak-workflow:add <description>` (it picks the
      > requirements) and delete this epic's spec, sidecar, and phase-index row in the same
      > commit — or add the missing requirements first with `/peak-workflow:capture-requirements`.

      Fill `<description>` from the spec's `## Description`, plus each `## Acceptance Criteria`
      bullet when that section exists. If no live requirement covers it (check the live titles
      and `tor-lifecycle search <2–3 key nouns>`), put the `/peak-workflow:capture-requirements`
      option first.
    - **Removal epic** — read its `## Removal` section (the record it retires, the retired IDs,
      the code to remove, and the done-when line) and carry it into Step 4. Its Requirements
      Anchors hold only guard requirements, or the line `None — a removal epic; see Removal.`
      (zero anchors is valid here).

    Parse the `## Requirements Anchors` table (`TOR ID | Feature File`). For each row, extract
    the TOR ID and feature file path, then settle every ID with item 6 **before** reading any
    Given/When/Then. For each ID item 6 leaves in the anchors, open its feature file and locate
    the `Scenario: [TOR-NN-XXXXXXX]` block with the exact TOR ID. Read the full Given/When/Then.
    These become the implementation specifications for this epic — carry them forward into Step 4
    (plan mode) and the plan's Middle and Closing steps. Titles shown in the card and the plan come
    from one `tor-lifecycle titles` run over the anchors item 6 leaves (skip it when none remain) —
    the spec carries none.
4b. **Resolve the test directories.** Read the `Test directories` line of `CLAUDE.md`'s Verification & Quality Gates section (space-separated, E2E last). If the line is absent, use the single directory the Tests command names. If none can be derived (a legacy Tests row like `pytest`), ask once via `AskUserQuestion`:
    - Question: `"Which directories hold tests? (space-separated, E2E last)"`
    - Then ask: `"Record this as the Test directories line in CLAUDE.md's Verification & Quality Gates section?"` with options `["Yes — record it", "No — use a git grep fallback this session"]`. On Yes, write the line right after Step 3 has checked out the feature branch (this is a docs edit, not implementation, so it still precedes plan mode, and the base branch stays clean). Carry the result forward as `<test-directories>` for the Step 4 plan.
4c. **Load Screens (UI epics only).** If the spec has a `## Screens` section, open each listed
    wireframe file (`docs/product-vision-planning/ux/wireframes/S-NN-*.html`, written by
    `/peak-workflow:mockup`) and carry its regions (the `data-component` values), its control
    texts, and its four `section.state` blocks into the Step 4 middle steps. Skip rows whose
    Wireframe is `—` (the Application menu and Window rows — their contract is the
    `ux/screens.md` row and the Desktop conventions TORs). The wireframe is
    the **layout contract** — what is on the screen and what it is called; the TOR
    Given/When/Then is the **behavior contract**. Where they disagree, the TOR wins and the
    middle step says so. Also open, via the `Wireframe` column in
    `docs/product-vision-planning/ux/screens.md`, the wireframe of every `S-NN` this epic's TOR
    Givens/Whens (item 4a) name that is absent from the spec's `## Screens` — a slice extending
    a skeleton-owned screen — and carry it into the middle steps the same way. If neither the
    section nor `ux/screens.md` exists, skip this item without comment.
5. **Pre-flight scan for new artifacts.** After reading the spec, grep its body for the literal strings `NEW component` and `NEW spec`. Surface any matches in your plan as explicit "create file X" steps so the plan names every new file upfront, rather than discovering them mid-implementation.
6. **Verify the Requirements Anchors.** For every anchor ID, take its `states` row (Requirements
   Health). Decisions here are applied on the feature branch by the plan's opening step 2, so the
   base branch stays clean and the decisions survive a cleared context. Run the lookups here, but
   ask this item's questions only after Step 2.5 continues (its **Start it**, or a resumed epic's
   card) — an answer is wasted if the user then stops. **Feature file paths:** a `states` row's
   `feature_file` is a bare file name (`02-orders.feature.md`); compare it with the spec cell's
   file name, and write a cell as `` `docs/requirements/<feature_file>` ``.
   1. **Live** — record `Requirements Anchor verified: TOR-NN-XXXXXXX` and continue. If the row's
      `feature_file` differs from the spec's Feature File cell, use the row's and correct the cell
      in the same opening step. Then by state:
      - **Disputed** — say `TOR-… is known to be wrong (<CR-ID>, <N> days): <record title>.` If
        `dispute.overdue` or `dispute.safety`, add `/peak-workflow:wrapup-epic will refuse to ship
        this epic until it is resolved.` and recommend resolving it first
        (`/peak-workflow:capture-requirements <TOR>` on a `docs/` branch). The in-epic Amendment
        gate (`PLAN_TEMPLATE.md`) can also resolve a non-Safety one on this branch.
      - **Owned by another epic** (`epic` is set and is not `<id>`) — warn that two epics
        list it; `check` reports it as F `multi-owner`. Continue.
   2. **Not live** — run `tor-lifecycle titles <TOR>` and act on what it prints:
      - **Superseded** (`superseded in CR-… by TOR-…`) — follow the chain: run `titles` on each
        successor until every one is live. Ask with `AskUserQuestion`:
        - Question: `"<TOR> was superseded in <CR-ID> (<date>) by <successor(s)> — <successor title(s)>. Update this epic's anchors?"`
        - Options: `["Replace with successor (recommended)", "Drop (superseded in <CR-ID>)", "Stop"]`

        **Replace** puts every live successor in the old ID's place — the spec's anchors row (same
        position, the successor's feature file) and the sidecar's `requirements:` line. A
        successor whose `states` row names another epic is not this epic's to take: drop the old
        ID instead and say `<successor> belongs to Epic <id> (<slug>) — <Name>.` **Drop** removes
        the row and the ID from `requirements:`. **Stop** ends the skill with
        `/peak-workflow:capture-requirements <TOR>` or `/peak-workflow:add` as the next step.
      - **Retired** (`retired in CR-…`) — ask: `"<TOR> was retired in <CR-ID> (<date>): <record title>. Drop it from this epic?"`
        with options `["Drop (retired in <CR-ID>)", "Stop"]`.
      - **Unknown** (exit 1) — when the cited feature file is not on this branch, stop:
        > `{TOR}` and its feature file `{path}` are not on branch `{current-branch}`. If you ran
        > `/peak-workflow:capture-requirements` on a `docs/` branch, merge it to `<base>` first —
        > requirements travel with the docs/ branch:
        > ```bash
        > git checkout <base>
        > git merge docs/<task-name> --no-ff
        > git checkout feature/epic-<id>-<short-name>   # if it already exists
        > ```
        Otherwise (`check` finding C — a typo or a deleted ID), ask
        `"<TOR> is not a requirement and no change record names it. Drop it from this epic?"`
        with options `["Drop it", "Stop"]`.

      These edits touch only this epic's own spec anchors and sidecar, and only while its status
      is **Not Started, In Progress, or Paused**. An **Implemented** epic is not edited here: stop
      with `Epic <id> is Implemented — /peak-workflow:wrapup-epic <id> checks its anchors and offers
      the successor swap there.` After a Replace or Drop, the remaining anchors (plus the guard
      requirements of a removal epic) must not be empty — if they are and this is not a removal
      epic, stop with the item 4a "No Requirements Anchors" message.
   3. **Retargets.** For each `sweep` row whose `successors` include one of this epic's anchors
      (after the item above), carry a plan step `Retarget or delete tests citing <old TOR>
      (successor <new TOR>): <path:line, …>` into Step 4 — a test that checks behavior the
      successor keeps is rewritten to the successor's Given/When/Then and cites the new ID; one
      that only proved the old behavior is deleted.
   4. **Removal epic.** Run `tor-lifecycle sweep <retired IDs from the Removal section>` and carry
      its hits, with the Removal section's **Code to remove**, into Step 4 (the code may have
      moved since the epic was planned — the sweep is current, the section is the plan-time list).
7. From the spec filename, extract the **branch short name**: strip the directory path, the `epic-<id>-` prefix (`<id>` as defined at the top — an opaque string), and the `.md` suffix. For example, `epic-a3f2K7p-user-auth.md` → `user-auth`. This becomes the branch short name for Step 3. If there is no suffix after `epic-<id>` (e.g., `epic-3.md`), omit it.
8. Parse the epic spec header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** for the Step 4 commit trailer and GitHub announce. If no `Source:` line exists, the source issue number is unknown — skip the trailer and announce later.
9. Check for any existing handoff files in `docs/implementation-plan/session-handoffs/` — read the most recent one, plus any handoff specifically for this epic (it may have been paused previously).
10. **Conditional read of `docs/architecture.md`.** If the epic touches IPC, the database schema, or other cross-cutting concerns named in `architecture.md`'s table of contents, read the relevant section. If the epic is a localized UI or copy change, skip — recent handoffs and the spec's Key Components section give the needed context.
11. **Conditional read of `docs/design-notes.md`.** Same conditional applies — read only when the epic raises a decision the design notes might already have addressed.
11a. **UX Baseline (UI epics only).** Applies only when `CLAUDE.md` has a **UX Baseline** section (Project type Web app, Desktop app, or Hybrid with a UI) **and** the spec's Key Components name screens, pages, UI components, or a renderer. For CLI / Service / Library / Embedded projects, or when the section is absent, skip this item without comment. Otherwise the **UX Baseline** section of `CLAUDE.md` (already in context) governs every screen this epic touches: compose from the walking skeleton's app shell and design system, render the loading / empty / error / populated states, and keep the keyboard, focus, form, and destructive-action conventions. Screens compose the `data-component` primitives their wireframes name (item 4c) — `Button`, `Dialog`, `Table`, `Form`, and so on from the design system. `/peak-workflow:wrapup-epic` runs the UX Baseline check as a quality gate. Design skills and component-lookup tools are found in item 11b and invoked in the plan's **Design pass** step; the UX Baseline and the design-system tokens in the global stylesheet take precedence over their choices — theme changes go in the token file, never in generated component files. Carry this into the Step 4 middle steps.
11b. **Design skills and tools (UI epics only — same condition as 11a).** Find them fresh each session: read this session's available-skills list and deferred-tool list, **not** `CLAUDE.md` (its `**Recommended skills:**` line is a setup-time snapshot). Select:
    - (a) every skill whose name or description is about visual or interface design — design, frontend, UI/UX, brand, styling, theming, typography, design system, shadcn;
    - (b) domain skills such as `dataviz` or a brand kit, only when this epic's screens need them (a chart, a dashboard, branded material);
    - (c) the shadcn MCP tools (`mcp__shadcn__*`), if present.

    Exclude peak-workflow's own skills, test tools (`playwright-cli`), and migration skills (e.g. `migrate-radix-to-base`) — they change the component base, not the design; invoke one only in an epic whose spec explicitly calls for that migration. Record each skill by its exact invocable name (e.g. `frontend-design:frontend-design`).
    - **shadcn project missing its tooling.** If `CLAUDE.md` has a `**shadcn tooling:**` line (without `not installed yet`) but the session lists no `shadcn` skill or no `mcp__shadcn__*` tools, the Design pass step says: *"shadcn tooling is part of this project but not loaded — restart Claude Code and approve the `shadcn` server before the next epic."* If the stack uses shadcn (a `components.json` exists) and `CLAUDE.md` has no such line, or the line says `not installed yet` (setup's install failed, or the project predates this), the step lists the install — `bunx skills add shadcn/ui -a claude-code -y --copy` plus the `.mcp.json` entry `"shadcn": { "command": "bunx", "args": ["--bun", "shadcn@latest", "mcp"] }` — with *"install, then restart before the next epic"*. Never install mid-epic (the tooling only loads in a new session) — except in the walking skeleton, whose plan installs it (`/peak-workflow:plan-project`) for the epics after it.
    - **None found:** carry `none installed` and the hint *"Install `frontend-design@claude-plugins-official` for stronger visual design."* This never blocks.

    Carry the list into Step 4's Design pass step.
12. **Targeted scan of `docs/reference/`.** Scan the epic spec body for explicit links into `docs/reference/` (markdown links of the form `docs/reference/...md`). Read only those referenced files. If the spec references none, skip this step. Do not bulk-read the directory — many reference files are dense (e.g., 1,300-line algorithm specs) and most epics touch only a slice.
13. **Pre-flight E2E audit (conditional).** If the project has an end-to-end test directory (the last entry on the `Test directories` line of `CLAUDE.md`'s Verification & Quality Gates section — setup lists the E2E directory last — or commonly `e2e/` / `tests/e2e/` when that line is absent) and the epic's key components include UI components or modules likely referenced there, run `grep -rl "<ComponentName>" <e2e-dir>/` for each and capture the matching specs. Carry the list into Step 4 so the plan's middle section gets an explicit "update regression specs: …" item. UI refactors routinely break E2E specs that encode the old interaction model; pre-flighting this prevents discovery during the verification gate. If no E2E directory exists, skip this step.

### Recovery Check

If `owner:` in the sidecar names someone other than you (as defined in Step 2.5), defer this check until Step 2.5 confirms **Start it**, then run it.

If `docs/implementation-plan/status/epic-<id>.md` has `status: In Progress` but there is no pause handoff file (`session-handoffs/epic-<id>-paused.md`), a previous session was likely interrupted without running `/peak-workflow:pause`. Inform the user:

> Epic <id> is marked "In Progress" but has no pause handoff — a previous session may have been interrupted. I'll scan the codebase for any partial implementation and pick up from the current state.

Proceed with the implementation, using git history and the current codebase to determine what has already been done.

## Step 2: Verify Prerequisites

Check the epic's Dependencies section (from the phase index row loaded in Step 1). For each prerequisite epic, verify that `docs/implementation-plan/status/epic-<dep-id>.md` has `status: Implemented` or `status: Complete` (both mean the code exists). If any dependency is not met, inform the user and suggest which epic to start instead.

**Walking skeleton — values that cost money or follow team policy.** Before planning, list the
`CLAUDE.md` values this epic resolves that are a CI, hosting, or email delivery provider (from the
`**Not decided yet:**` line or `TBD` rows) and confirm each with the user in one question, with a
recommended default (e.g. GitHub Actions for a GitHub repository). Never pick one silently.

**Hardware on the desk (Embedded, or any epic whose TORs are verified through `tests/hil/`).** In
this order:
1. **Board chosen?** If `CLAUDE.md` still records `Board: candidate … — unconfirmed` or
   `Board: not chosen` (walking skeleton), recommend a board in plain words — name, rough price,
   and any parts the product needs with it (e.g. a thermocouple amplifier, a relay module) — and
   confirm it with the user. Nothing is ordered or installed on a guess. If `CLAUDE.md` still says
   unconfirmed but the user already bought a board on an earlier run, ask which board they have
   first. Recording the confirmed board in `CLAUDE.md` is the first plan step after the opening
   steps, on the feature branch.
2. **Board in hand?** If the user does not have it yet, print a short parts list to keep (board,
   add-on parts, cable, and — for anything that switches mains power or heat — a low-voltage
   indicator lamp or LED module for the bench setup), end the session, and tell them to run `/peak-workflow:start-epic <id>`
   again when it arrives (nothing is In Progress yet, so there is nothing to pause). Host-side work may start first only if the user asks.
3. **Board connected?** Check the port named on the `CLAUDE.md` Local Environment `HIL port:` line
   (e.g. `HIL_PORT=/dev/ttyUSB0`, `COM3` on Windows) exists. If not, tell the user how to connect
   it and how to find the port, and wait. On the walking skeleton the line does not exist yet: ask
   the user to plug the board in, find the port with them, and write the line as a plan step.

**Bench only, for anything that switches mains power or heat.** Every `tests/hil/` run — automated or
operator-observed — happens on the bench: the equipment unplugged from mains, the output wired to an
indicator lamp or LED instead of the load. Before each run, ask the user to confirm that setup in one
plain question (*"Is the kiln unplugged, with the relay driving the test lamp?"*); if they cannot
confirm, do not run it.

## Step 2.5: Confirm the Epic

Before creating the branch in Step 3, show the user what they are about to start —
the epic ID alone is not recognizable, and the epic may belong to a phase a teammate planned.
Print this card (the slug is the branch short name from Step 1 item 7):

```
Epic <id> (<slug>) — <Name>
Phase:         <N> — <Phase Name>
Planned by:    <name> on <date>
Dependencies:  <dep-id (dep-slug) — status>, … (or —)
Owner:         <sidecar owner: value, or —>
Scope:         <N> TOR(s); screens <S-NN list from ## Screens, or —>
               (removal epic: removal — retires <retired IDs> (<CR-ID>); <N> guard TOR(s))
               (<N> counts the anchors as listed now; append "(<M> superseded/retired — settled
               next)" when Step 1 item 6 has questions)
Purpose:       <first sentence of the spec's ## Description>
```

- **Planned by / date** — the spec's `**Planned by:**` and `**Planned:**` lines.
- **Owner** — the `owner:` line in `docs/implementation-plan/status/epic-<id>.md`. `owner:` and an In Progress / Paused / Implemented status live on the feature branch
  until the epic merges, so when the local branch `feature/epic-<id>-<short-name>` exists, read
  this sidecar (for the card and for the resume rule below) from it:
  `git show feature/epic-<id>-<short-name>:docs/implementation-plan/status/epic-<id>.md`
  (if the path is absent there, use the working-tree sidecar).

Below the card, add one `⚑` line for each that applies. **Who "you" are:** compare
case-insensitively, trimmed. Your names are `git config user.name` plus every author name already
used with your email — collect them once:
`git log --all --format='%ae|%an' | awk -F'|' -v e="$(git config user.email)" 'tolower($1)==tolower(e) {print $2}' | sort -u`.
A commit is yours when its author email (`%ae`) equals `git config user.email` or its author name
is one of your names; a bare name (`**Planned by:**`, `owner:`) is yours when it is one of your
names. Inline `$(git config user.email)` / `$(git config user.name)` in any command (shell
variables do not persist between commands), and never decide with `git log --author` (a regex
substring match).
- `⚑ Planned by <name>, not you — check this is yours to start.` (skip when Planned by is `—`)
- `⚑ Phase <N> — <Phase Name> was added to the plan by <name>, not you.` — the author of the
  commit that added the phase index:
  `git log --diff-filter=A --format='%ae|%an' -- docs/implementation-plan/phase-<N>-*/index.md | tail -1`.
- `⚑ Owned by <owner> — someone else has already started this epic.`
- `⚑ Branch <name> already exists on origin (last commit by <author>, <date>) — someone may be
  working on it.` — when the Freshness Guard fetched, check
  `git branch -r --list 'origin/feature/epic-<id>-*'` and read the author with
  `git log -1 --format='%ae|%an|%ad' --date=short <that-ref>`. Skip when the last commit is yours.

`owner:` travels with the feature branch and reaches the base branch only when the epic merges,
so a teammate's in-flight epic usually shows up through the origin-branch line, not the owner line.

**Resuming your own epic** — sidecar `status: In Progress`, `Paused`, or `Implemented`, and `owner:`
is you or `—`: drop the two "planned by / added by" lines (you already chose this epic). If no `⚑`
line remains, print the card and continue without asking.

**Otherwise**, ask with `AskUserQuestion`:
- Question: `"Start Epic <id> (<slug>) — <Name>?"`
- Options: `["Start it", "Show me the ready epics instead", "Stop"]`

On **Show me the ready epics instead**, invoke `Skill({ skill: "peak-workflow:status", args: "" })`
and end this skill. On **Stop**, end. Only **Start it** continues — first running the Recovery
Check if it was deferred above, then Step 1 item 6's questions (when it has any), then Step 3. A
resumed epic that prints its card without asking goes straight to those questions.

**Clean-tree rule** (used by Step 3's Leftover check and Step 4's rejected-plan cleanup — both
delete a branch, so they must never discard work). The working tree counts as clean when
`git status --porcelain` is empty, or when its only entry is ` M CLAUDE.md` **and**
`git diff -U0 -- CLAUDE.md` changes nothing but the single `Test directories` line that Step 1
item 4b writes (blank lines aside). Only in that second case restore it with `git checkout -- CLAUDE.md` before
deleting. Any other change — including other edits to `CLAUDE.md` — means not clean: keep the
branch, touch nothing, and say why in one line.

## Step 3: Create Feature Branch

Before entering plan mode, ensure work is isolated on a feature branch. The branch name uses the format `feature/epic-<id>-<short-name>` where `<id>` is the epic ID defined at the top and `<short-name>` was extracted in Step 1 (e.g., `feature/epic-a3f2K7p-user-auth`). If no short name was available, use `feature/epic-<id>`.

1. Run `git branch --show-current` to check the current branch.
2. Check whether the feature branch already exists with a reliable test:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = exists, nonzero = missing. Do **not** rely on `git branch --list … && echo "exists"` — that pipeline always exits 0 and produces false positives on missing branches.

   **Leftover check.** If the branch exists, detect the base branch (item 5a) and test whether it
   is an empty branch left by an earlier rejected or abandoned start: the base's sidecar still
   says `status: Not Started` (`git show <base-branch>:docs/implementation-plan/status/epic-<id>.md`),
   `git rev-list --count <base-branch>..feature/epic-<id>-<short-name>` returns `0`, and the
   working tree is clean under Step 2.5's **Clean-tree rule**. If all three hold, run
   `git checkout <base-branch>` and `git branch -d feature/epic-<id>-<short-name>`, say
   `Removed an empty leftover branch from an earlier start.`, and continue with item 5 as if the
   branch did not exist. If only the tree is not clean, say `Kept the existing branch — the working
   tree has uncommitted changes.` and continue with item 3 or 4.
3. If already on `feature/epic-<id>-<short-name>`, confirm to the user:
   > Resuming on existing branch: `feature/epic-<id>-<short-name>`
4. If the branch exists but you are not on it, run `git checkout feature/epic-<id>-<short-name>`.
5. If the branch does not exist:
   a. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
   b. Switch to the base branch: `git checkout <base-branch>`, then — if `origin/<base-branch>`
      exists — run `git pull --ff-only origin <base-branch>` so the branch is cut from the team's
      latest base (stop and show git's message if the pull fails, as in the Freshness Guard).
   c. Create and checkout the feature branch: `git checkout -b feature/epic-<id>-<short-name>`.
   d. Confirm to the user:
   > Created and switched to branch: `feature/epic-<id>-<short-name>` (from `<base-branch>`)

## Step 4: Enter Plan Mode

Enter plan mode now. **This step is mandatory regardless of any active auto mode, continuous execution, or "prefer action" instruction — invoking this skill IS the explicit request for plan mode. Do not write code, edit files, or run implementation commands until the user approves the plan.** The plan you produce here is the complete and authoritative execution script for this epic. It must be fully executable in isolation — if this session's context is cleared and only the plan text survives, the plan alone must be sufficient to drive the entire implementation to completion. The plan gate exists to catch wrong architectural choices before they become wrong code — skipping it defeats the primary purpose of this skill. Every step that follows plan approval must be represented in the plan as an explicit numbered item. Do not rely on any post-plan skill instructions to cover branch setup, status tracking, task creation, verification, spec reconciliation, or committing. Those responsibilities belong to the plan.

Build the plan from:

- The TOR Given/When/Then loaded in Step 1 item 4a (these become your implementation items and their tests)
- The epic's key components (these are the files you'll create/modify)
- Any context from previous handoff files (decisions made, patterns established)
- Any reference materials surfaced by Step 1 item 12
- Step 1 item 6: the anchor decisions (applied in opening step 2), the retarget steps, and — for
  a removal epic — the code and tests to delete
- The scenario titles from the one `tor-lifecycle titles` run (Step 1 item 4a)

**If the user rejects the plan and ends** (declines rather than asking for revisions): when this
session created the feature branch in Step 3 item 5, it has no commits beyond the base
(`git rev-list --count <base-branch>..HEAD` returns `0`), and the working tree is clean under
Step 2.5's **Clean-tree rule**, run `git checkout <base-branch>` and
`git branch -d feature/epic-<id>-<short-name>`, and tell the
user the empty branch was removed. If the tree is not clean, keep the branch and say so. If plan mode is still active (git writes are not allowed), print
those commands for the user to run instead (with `git checkout -- CLAUDE.md` first when the rule
called for the restore). Step 3's Leftover check (under item 2) also removes such a leftover the next
time this epic is started, so a closed session does not leave a trap.

**The plan must follow the lifecycle template at `${CLAUDE_PLUGIN_ROOT}/skills/start-epic/PLAN_TEMPLATE.md`.** Read that file once, copy its **Opening steps**, **Deferral gate** and **Amendment gate** paragraphs, **Removal** step (removal epics only), **Bench only** paragraph (products that switch mains power or heat only), **Design pass** step (UI epics only, with the names from Step 1 item 11b), and **Closing steps** sections into your plan verbatim — substituting every placeholder in the template's Placeholder reference list (`<id>`, `<short-name>`, `<N>`, `<base-branch>`, `<TOR-list>`, `<test-directories>`, `<deferral-count>`, `<handoff-path>`, `<anchor-decisions>`, `<retired-IDs>`) with values derived in Step 1 — and author the **Middle steps** from the TOR requirements' Given/When/Then (loaded in Step 1 item 4a). The template is the single source of truth for lifecycle wording; do not paraphrase it.

## Step 5: Execute the Plan

After the user explicitly approves the plan, exit plan mode and execute every item in order. The plan is the complete execution script for this session — it contains every remaining step, from branch setup through the final next-steps block. Do not add, skip, or reorder items.

> **If interrupted mid-execution:** Run `/peak-workflow:pause` to save your progress. Do not simply close the session — the pause handoff file is what allows the next session to pick up where you left off.
