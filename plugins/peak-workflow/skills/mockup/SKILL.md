---
name: mockup
description: |
  Low-fidelity UX prototyping on the docs/ branch. Turns ConOps operational scenarios into a
  screen inventory, per-scenario screen flows, and grayscale HTML wireframes, then feeds the
  screen and control names back into the ConOps steps so /peak-workflow:capture-requirements
  derives TORs against named screens and states. Web app, Desktop app, and UI-bearing Hybrid
  projects only. Run after /peak-workflow:discover and before /peak-workflow:capture-requirements.
  Triggers on: "mockup", "wireframe", "prototype the screens", "sketch the UI",
  "what screens do we need", "screen flow", "storyboard the app".
argument-hint: "[scenario title or blank for all scenarios]"
---

You are producing low-fidelity UX mockups for the project's operational scenarios: a screen
inventory (`ux/screens.md`), one screen flow per scenario, and one grayscale wireframe per
screen. You then rewrite the ConOps scenario steps so each names the screen and the exact control
it uses. Mockups are **planning artifacts** approved by the `docs/` branch merge — they are not
requirements and not code. Low fidelity is deliberate: no colors, no typefaces, no brand, no
imagery. Aesthetic choices happen later, in the walking-skeleton epic that `/peak-workflow:plan-project`
forms. Do **not** invoke the `frontend-design` skill from this skill.

The user's request (scenario title, or blank for all scenarios): $ARGUMENTS

---

## Project Type Guard

**Before any other action (read-only):** read `CLAUDE.md` at the repo root (do not re-read if
already in context) and take the **Project type** from its `Tool Hygiene & Operability`
section. If it is `CLI tool`, `Library`, `Service or API`, or a `Hybrid` whose description names
no UI, print and stop — before the branch guard, so a non-UI project never sees a branch question:

> `mockup` does not apply to `<type>` projects — there are no screens to prototype.
> Continue with `/peak-workflow:capture-requirements`.

If the section is missing, ask via `AskUserQuestion`:
- Question: `"CLAUDE.md has no Tool Hygiene & Operability section, so the project type is unknown. Is this a Web app, a Desktop app, or something without a UI?"`
- Options: `["Web app", "Desktop app", "No UI — stop"]`

On "No UI — stop", end here. Otherwise carry the project type into Step 1.

## Step 0: Branch Guard

**After the project type guard:**

1. Run `git branch --show-current`. Capture the result as `<current-branch>`.
2. If `<current-branch>` is `develop`, `main`, or `master` — stop immediately:

   > `mockup` writes planning artifacts (screen inventory, flows, wireframes) and rewrites
   > ConOps scenario steps. These changes must travel through a `docs/{task-short-name}` branch
   > so the merge event serves as the approval gate. Run `/peak-workflow:discover` first — it
   > will create the `docs/` branch and produce the ConOps this skill needs. Or create the
   > branch manually:
   > ```bash
   > git checkout -b docs/{task-short-name}
   > ```

3. If `<current-branch>` does **not** start with `docs/` (and is not develop/main/master) —
   warn the user but allow continuation:
   > Current branch (`<current-branch>`) is not a `docs/` branch. Proceeding will mix
   > mockup and ConOps changes with other work on this branch.

   Use `AskUserQuestion`:
   - Question: `"Current branch is not a docs/ branch. Continue anyway, or stop to create one?"`
   - Options: `["Continue on this branch", "Stop — I'll create a docs/ branch first"]`

   If the user chooses Stop, end here.

4. If `<current-branch>` starts with `docs/` — continue. No action needed.

## Layout Guard

**Before any other action after the branch guard:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context

1. From `CLAUDE.md` (already read by the Project Type Guard), capture:
   - **Project type** — as resolved by the Project Type Guard (Web app, Desktop app, or a
     Hybrid with a UI).
   - The **UX Baseline** section, when present: the declared design system (default shadcn/ui),
     the *Screen states* line, the *Layout floor* line (minimum width or window size), and for
     desktop apps the *Desktop conventions* line (standard menus, accelerators, window-state
     persistence). If the section is absent, note it — Step 3 assumes shadcn/ui primitives and
     Step 10 advises running `/peak-workflow:setup`.
   - Set `is_desktop = true` when the project type is `Desktop app` or a Hybrid that names a
     desktop UI.
2. Read `docs/product-vision-planning/product-vision.md` — Sections 6 (MVP Scope Summary),
   8 (Key Business Scenarios), and 9 (Design Direction). If missing or skeleton (no substantive
   `## 2. Problem Statement` content), stop:
   > Run `/peak-workflow:discover` first to produce the product vision and ConOps documents.
3. Read `docs/product-vision-planning/concept-of-operations.md` — Sections 4 (User Roles &
   Profiles), 5 (Operational Scenarios), and 7 (Functional Summary). If missing, skeleton, or
   Section 5 has no numbered steps, stop with the same message. Capture the ConOps
   **Document Version** and each scenario's title and numbered steps. Refer to steps as
   `S{scenario}.{step}` (e.g., `S3.4` = Scenario 3, step 4).
4. List existing UX artifacts:
   ```bash
   ls docs/product-vision-planning/ux/ docs/product-vision-planning/ux/wireframes/ 2>/dev/null
   ```
   If `docs/product-vision-planning/ux/screens.md` exists, read it in full and capture every
   `S-NN` ID, name, and the highest existing number.

Report the loaded state:
```
Mockup context:
- Project type: [Web app / Desktop app / Hybrid (UI)]   Desktop conventions: [yes / no]
- Design system: [from UX Baseline, or "not declared — assuming shadcn/ui"]
- Layout floor: [e.g., 320 px / 800×600 window / "not declared"]
- ConOps v[N.N]: [N] scenarios, [N] steps total
- Existing screens.md: [none / N screens, highest S-NN]
- Scope: [all scenarios / "Scenario N: {title}" from $ARGUMENTS]
```

If `$ARGUMENTS` names a scenario that does not match any ConOps Section 5 title (case-insensitive
substring match), list the available titles and ask the user to pick one via `AskUserQuestion`.

---

## Step 2: Detect Greenfield vs Brownfield

First, in either mode, list the unprocessed discovery changelogs:
```bash
ls docs/product-vision-planning/changelogs/discovery-changelog-*.md 2>/dev/null | grep -v '\.processed$'
```
If two or more are listed, stop before drafting anything — Step 7 could write the UX delta to
neither. Print the same message `/peak-workflow:capture-requirements` 3B.1 uses:
> Found {N} unprocessed discovery changelogs:
> {list filenames}
>
> Please reconcile — delete superseded ones or merge their "New Capabilities" sections into a
> single file, then re-run.

**Greenfield** = `ux/screens.md` does not exist or has zero screen rows. All scenarios in scope
are processed from scratch (or only the scenario named in `$ARGUMENTS`).

**Brownfield** = `ux/screens.md` exists with at least one screen row. Existing screens are the
baseline; this run only **adds or changes** screens for the scenarios named in `$ARGUMENTS` or
in the unprocessed discovery changelog listed above. Read the changelog **read-only** — do not
archive or rename it; `/peak-workflow:capture-requirements` does that. Its "What Changed" rows
for `concept-of-operations.md` Section 5 identify the scenarios in scope. A changelog whose
`**Mode:**` line reads `Brownfield (UX concretization)` is this skill's own output from an earlier
run on this branch — it names no changed scenarios, so for scoping it counts as no discovery
changelog: fall through to `$ARGUMENTS` or the git-diff fallback below. It still counts toward
the two-or-more stop above and still receives the Step 7 item 5 in-place replace. If `$ARGUMENTS`
is empty and no discovery changelog scopes the run, diff the ConOps against the last commit that
touched `ux/screens.md`:
```bash
git diff $(git log -1 --format=%H -- docs/product-vision-planning/ux/screens.md) -- docs/product-vision-planning/concept-of-operations.md
```
Scenarios whose steps changed are in scope. If nothing is in scope, say so and stop.

Set `feature_files_exist = true` when `docs/requirements/*.feature.md` matches at least one file
— Step 7 uses it.

Report detection:
```
Mode: [Greenfield / Brownfield]
Scenarios in scope: [list of "Scenario N: {title}"]
Unprocessed discovery changelog: [filename / filename (UX concretization — not used for scoping) / "none found"]
```

---

## Step 3: Screen Inventory

Derive the inventory from the ConOps Section 5 steps of every scenario in scope. Walk each step
and ask: *which screen is the actor looking at, and which control do they use?* A screen is a
distinct place in the app the user can name ("the Orders list", "the Edit Supplier dialog") —
not a component and not a state.

**Draft this autonomously — hold no inline interview.** The inventory table and the mermaid flows
are machine-readable artifacts bound for `screens.md`: a nine-column table wraps into mush in a
terminal and a mermaid block is just source code there, so presenting either for approval asks
the user to review a format they cannot read. The wireframes are what a person can actually
judge. This skill therefore drafts the inventory, the states, and the flows in one pass, writes
`screens.md`, generates the wireframes, and gates **once** — on the wireframes, at Step 6. A
wrong inventory is cheap to correct there: the rows change and the affected wireframes are
rewritten.

### 3.1: Draft the inventory

One row per screen, with these columns (the table format is in
`plugins/peak-workflow/skills/mockup/SCREENS_TEMPLATE.md`):

| Column | Rule |
|---|---|
| **Screen ID** | `S-NN`, 2-digit zero-padded, sequential from `S-01`. Brownfield: continue from the highest existing number; never renumber. |
| **Name** | Title-case noun phrase the user would say — "Orders List", "Order Detail", "Sign In". |
| **Wireframe** | `wireframes/S-NN-<kebab-name>.html`, relative to `ux/` — the file Step 5.1 writes. The Application menu and Window rows write `—`. Downstream skills copy this path verbatim into epic `## Screens` tables. |
| **Purpose** | One sentence: what the actor accomplishes here. |
| **Entry points** | How the user arrives: a nav item, a control on another screen (`S-02 "Open" button`), a deep link, app launch. |
| **Primary actions** | Each action **names its control and its visible text** — "Save button", "Delete… menu item", "Status filter select". No bare verbs. |
| **Data shown** | The fields, lists, and counts the screen renders. |
| **States** | `loading / empty / error / populated` — every data-bearing screen has all four. A screen with no data (e.g., a pure form, an About dialog) says `n/a — not data-bearing`. |
| **Serves** | The ConOps steps this screen serves, `S3.4` style, comma-separated. |

Rules:
- Every ConOps step in scope maps to **exactly one** screen. A step that reads "user opens X and
  edits Y" is two steps for this purpose — split it in Step 7 when rewriting the ConOps.
- Steps with no UI (a background job runs, an email is sent) are recorded as `n/a — no screen`
  in Step 9; do not invent a screen for them.
- Prefer the fewest screens that satisfy the scenarios. A dialog or sheet that has its own
  actions and data is a screen; a confirmation dialog for a destructive action is **not** — it
  is an action on its parent screen and appears in the wireframe's populated state.
- Scenario 1's thinnest list screen carries the entity's row-level `"Delete…"` action, with its
  confirmation dialog in the populated state (as `WIREFRAME_TEMPLATE.md` shows) — this is what
  the **Destructive actions** baseline TOR in `/peak-workflow:capture-requirements` anchors on.
- Keep to the design-system primitives the UX Baseline declares (default shadcn/ui). Name nothing
  the walking skeleton cannot compose from them.
- **Desktop apps (`is_desktop = true`)** also get two rows that share the ID space but are not
  screens: an **Application menu** row (Primary actions = every menu and its items with
  accelerators, following the platform order the UX Baseline *Desktop conventions* line names)
  and a **Window** row (Data shown = minimum size, remembered bounds and maximized state, title
  format including the unsaved marker). Both use `States: n/a — not data-bearing`.

### 3.2: Draft the States

For every data-bearing screen, draft the four states as one short line each:
- **loading** — what is skeletoned or spinning, and what text (if any) is visible.
- **empty** — the visible text ("No orders yet") and the call-to-action control it offers.
- **error** — the visible text naming the problem *and* the next action, plus the retry control.
- **populated** — what is rendered when data exists (reference the Data shown column).

### 3.3: Print the orientation line, not the table

Do not print the inventory table or the states list to the terminal. Print one compact line per
screen so the user knows what is being drawn and can interrupt if a screen is obviously wrong,
then continue straight to Step 4:

```
Drafting {N} screens, then writing wireframes:
- S-01 {Screen Name} — {purpose, trimmed to ~8 words}
- S-02 {Screen Name} — {purpose, trimmed to ~8 words}
```

---

## Step 4: Screen Flows

### 4.1: Draft one flow per scenario

For each scenario in scope, draw a mermaid `flowchart LR`:
- **Nodes** = screens, labeled with ID and name. Use the ID without the hyphen as the node
  handle: `S01["S-01 Orders List"]`.
- **Edges** = user actions, labeled with the action *and the control*: `-->|"Click New order button"|`.
- Start at the scenario's entry screen (or `Launch(["App launch"])` for desktop apps); end at the
  screen where the Outcome is visible.
- **Draw error and empty branches explicitly**: an edge to the same screen's error state
  (`S02 -->|"Save fails"| S02err["S-02 error state"]`) and the empty branch where a list may
  have no items. A flow with only a happy path is incomplete.

Example:
```mermaid
flowchart LR
  S01["S-01 Orders List"] -->|"Click New order button"| S02["S-02 Order Form"]
  S02 -->|"Click Save button"| S03["S-03 Order Detail"]
  S02 -->|"Save fails — Retry button"| S02err["S-02 error state"]
  S02err -->|"Click Retry button"| S02
  S01 -->|"No orders — Create first order button"| S02
```

Do not print the flows to the terminal — mermaid does not render there. They go straight into
`screens.md`, where the user reads them rendered on the `docs/` branch.

### 4.2: Write screens.md

Write `docs/product-vision-planning/ux/screens.md` following
`plugins/peak-workflow/skills/mockup/SCREENS_TEMPLATE.md` (`mkdir -p docs/product-vision-planning/ux/wireframes`
first). Greenfield: create it at version 1.0. Brownfield: append new rows, `## States`
subsections, and `## Flows` blocks per the template's append note; replace a changed screen's
row and states in place; bump the document version (minor) and date.

---

## Step 5: Wireframes

### 5.1: One HTML file per screen

For every screen in scope (not the Application menu and Window rows), write the file its
`Wireframe` column in `ux/screens.md` names —
`docs/product-vision-planning/ux/wireframes/S-NN-<kebab-name>.html` — following
`plugins/peak-workflow/skills/mockup/WIREFRAME_TEMPLATE.md`. Each file is self-contained:

**Write these files in parallel.** Every screen's wireframe is independent of every other
screen's — none reads or depends on another's output — so issue one `Write` tool call per screen
and send them together in a single message/turn instead of one after another. This holds
regardless of screen count (2 screens or 20): batch every `Write` call for this step into one
turn.

- **Inline CSS only** — grayscale palette, system font stack, dashed region boxes with a small
  uppercase label. No external stylesheets, fonts, images, or scripts. No colors, no typefaces,
  no brand marks.
- **Header line** with the screen ID, name, the ConOps steps it serves, and its entry points.
- **Mock menu bar strip** naming the menus (desktop apps only; delete it for web apps).
- **State switcher** — four buttons (Loading / Empty / Error / Populated) toggling four
  `section.state` blocks with plain JS. The Populated state is active on load. A screen marked
  `n/a — not data-bearing` keeps only the Populated section and drops the switcher.
- **Regions** — one `div.region` per layout area, each carrying `data-component` naming the
  design-system primitive it will become: `Button`, `Dialog`, `Table`, `Form`, `Input`,
  `Sidebar`, `Tabs`, `Sheet`, `Toast` (add `Card`, `Select`, `Checkbox`, `Breadcrumb` only if the
  screen needs them). This is what the walking skeleton and later slices compose from.
- **Every control labeled with its visible text** — the exact text from the Primary actions
  column ("Save", "Delete…", "New order"). Placeholder data uses striped `.placeholder` blocks,
  not lorem ipsum.
- **Error and empty states carry their real copy** — the text drafted in Step 3.2, naming the
  problem and the next action, with the retry or call-to-action control present.
- **Destructive actions** show their confirmation dialog inside the Populated state as a
  `data-component="Dialog"` region whose safe option (Cancel) is listed first.
- **Footer** listing the ConOps step refs and the screens this one links to.
- The `:focus-visible` outline in the template stays — the wireframe itself models keyboard
  focus. Every control must be a real `button`, `a`, `input`, or `select` so Tab reaches it.

### 5.2: ux/README.md

Write `docs/product-vision-planning/ux/README.md` — one paragraph: these are low-fidelity
planning wireframes produced by `/peak-workflow:mockup`; open `wireframes/index.html` in a browser
(no server needed) to get a clickable list of every screen, then use the state buttons on each to
switch loading / empty / error / populated; they are grayscale on purpose — visual design happens
in the walking-skeleton epic; `screens.md` is the inventory and the ConOps references screens by
their `S-NN` IDs. Create it only if it does not exist.

### 5.3: Write the wireframe index

Write `docs/product-vision-planning/ux/wireframes/index.html` following the **Index Template** in
`plugins/peak-workflow/skills/mockup/WIREFRAME_TEMPLATE.md` — one linked row per screen in
`ux/screens.md`, in `S-NN` order. This is the file Step 6 opens in the browser, so it is written
on every run, greenfield or brownfield, and regenerated in full whenever the screen set changes
(including after a Step 6 adjustment round that adds, merges, or drops a screen).

It is a review aid, not a screen: it gets no `S-NN` ID, no row in `ux/screens.md`, and no entry in
the Step 9 trace table.

---

## Step 6: Review Gate

This is the **only** human gate in the skill — Steps 3 and 4 drafted without one, because the
wireframes are the first artifact the user can actually see. Everything upstream (screen rows,
states, flows) is in scope for the feedback given here.

**Open the index in the user's default browser.** Do not rely on the user clicking a path —
several terminals (Ghostty among them) do not linkify bare paths, and a `file://` *directory* URL
opens Finder on macOS and renders not at all in Safari. Open the `index.html` file itself, with
the platform's own opener so the user's default browser is honored:

```bash
index="$(git rev-parse --show-toplevel)/docs/product-vision-planning/ux/wireframes/index.html"
case "$(uname -s)" in
  Darwin*)              open "$index" ;;
  Linux*)               if command -v wslview >/dev/null 2>&1; then wslview "$index"
                        else xdg-open "$index"; fi ;;
  MINGW*|MSYS*|CYGWIN*) start "" "$index" ;;
  *)                    echo "No opener for $(uname -s) — open manually: $index" ;;
esac
```

The command may fail on a headless, SSH, or container session with no browser — that is not an
error worth retrying. Either way, print the absolute paths as the fallback so the user can copy
one into a browser or their file manager:

```
- /abs/path/to/repo/docs/product-vision-planning/ux/wireframes/index.html   ← opened for you
- /abs/path/to/repo/docs/product-vision-planning/ux/wireframes/S-01-orders-list.html
- /abs/path/to/repo/docs/product-vision-planning/ux/wireframes/S-02-order-form.html
```

Then tell the user:

> The wireframe index is open in your browser — click a screen, then use its state buttons to
> switch loading / empty / error / populated.

Use `AskUserQuestion` — a **single call**, carrying the second question only when a design-canvas
skill (e.g., one named `design`) is available in this session:
- Question 1: `"Approve these wireframes, or tell me what to adjust?"`
  Options: `["Approve", "Adjust — I'll describe the changes"]`
- Question 2, only if a design-canvas skill is available: `"Also publish these wireframes to the design canvas for hand-tweaking? The HTML files under ux/wireframes/ remain the committed artifact either way."`
  Options: `["No — HTML files only", "Yes — publish to the canvas too"]`

If no design-canvas skill is available, ask Question 1 alone and never mention a canvas. Ask
Question 2 on the first round only — carry its answer across any adjustment rounds rather than
re-asking.

If Adjust, apply the changes to the affected wireframe files **and** to the matching rows,
states, or flows in `ux/screens.md` (they must not drift), then ask again. Maximum **3 adjustment
rounds** — if still adjusting after round 3, apply the most recent changes and proceed.

Feedback here may be **structural**, not just cosmetic — a screen is missing, two screens should
be one, a screen was invented that no ConOps step needs. Handle those by re-running Step 3.1 and
Step 4.1 for the affected rows only, then rewriting each affected wireframe (in parallel, per
Step 5.1). Never renumber an `S-NN` that survives the change; a screen dropped before any commit
frees its ID for reuse in this same run only.

**Design-canvas publish.** If the user answered Yes to Question 2, hand the wireframes to that
skill once they are **final** — after the last adjustment round, so the canvas receives the
approved artboards — as grayscale artboards, one per screen, instructed to add no colors,
typefaces, or imagery. Do not wait on the canvas before continuing to Step 7. Do not invoke
`frontend-design` under any circumstances.

---

## Step 7: Feed Back into ConOps

Rewrite the ConOps Section 5 steps of every scenario in scope so the requirements capture can
cite named screens and controls. **Never change scenario intent** — only make each step
concrete.

1. **Rewrite each step** to name the screen (by name, with the ID in parentheses) and the exact
   control text it uses. Split a step that touches two screens into two numbered steps.

   Before:
   ```
   3. User creates a new order and saves it.
   ```
   After:
   ```
   3. On the Orders List (S-01), user clicks the "New order" button; the Order Form (S-02) opens.
   4. User fills the Customer and Quantity fields and clicks the "Save" button; the Order Detail (S-03) shows the new order.
   ```
   State-dependent steps name the state: `…the Orders List (S-01) shows its empty state with the "Create first order" button`.
2. **Add a Screens cross-reference line** directly under each rewritten scenario's `**Outcome:**`
   line:
   ```
   **Screens:** S-01 Orders List, S-02 Order Form, S-03 Order Detail
   ```
3. **Update the header:** bump the ConOps **Document Version** by a minor increment (1.0 → 1.1)
   and set **Date** to today. Also set the `**Companion:**` line in `ux/screens.md` to the bumped
   ConOps version — Step 4.2 wrote it before the bump.
4. Do not touch Sections 1–4 or 6–9, and do not rewrite scenarios out of scope.
5. **Discovery changelog** — write one only when `feature_files_exist = true` (Step 2), in
   either mode. Otherwise the coming `/peak-workflow:capture-requirements` run is greenfield and
   would never consume it, and the stale file would later trip the two-unprocessed-changelogs
   stop — write no changelog. When it applies:
   - If exactly one unprocessed discovery changelog exists (Step 2 already stopped on two or
     more), append this section to it. If the changelog already has a `## UX Changes` section
     (a second run on the same `docs/` branch), replace that section in place rather than
     appending a second one:
     ```markdown
     ## UX Changes

     | Screen | Change Type | Summary |
     |--------|-------------|---------|
     | S-NN {Name} | [Added / Modified] | [1-line summary — which steps it now serves] |
     ```
   - If none exists, create `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md`
     with `{TIMESTAMP}` from:
     ```bash
     date -u +%Y-%m-%d-%H%M%S
     ```
     containing:
     ```markdown
     # Discovery Changelog

     **Date:** [today's date]
     **Mode:** Brownfield (UX concretization)
     **Previous Version:** ConOps [version before this run]

     ## UX Changes

     | Screen | Change Type | Summary |
     |--------|-------------|---------|
     | S-NN {Name} | [Added / Modified] | [1-line summary] |

     ## New Capabilities Identified

     None — UX concretization only.
     ```

---

## Step 8: Quality Check

Before the self-check, verify:

- [ ] Every ConOps Section 5 step in scope maps to exactly one screen (or is `n/a — no screen`).
- [ ] Every screen in `ux/screens.md` appears in at least one flow.
- [ ] Every data-bearing screen lists all four states in `ux/screens.md` **and** its wireframe
  has all four `section.state` blocks with matching copy.
- [ ] Every primary action names a control with its visible text; the same text appears in the
  wireframe and in the rewritten ConOps step.
- [ ] Every path in the `Wireframe` column of `ux/screens.md` exists under
  `docs/product-vision-planning/ux/` (`wireframes/S-NN-<kebab-name>.html`), and every file in
  `wireframes/` **except `index.html`** appears in that column. Only the Application menu and
  Window rows carry `—`.
- [ ] `wireframes/index.html` exists and links to every `S-NN` wireframe file, with no dead links
  and no link to a screen that was dropped during a Step 6 adjustment round.
- [ ] Every `div.region` carries a `data-component` value from the Step 5.1 list.
- [ ] Desktop apps: `ux/screens.md` has the Application menu and Window rows; every wireframe
  has the menu-bar strip.
- [ ] No color names, hex values other than grays, `font-family` other than the system stack,
  images, or external URLs anywhere in `ux/`. Run the hex test against each file's `<style>`
  block only — dialog copy such as `Delete order #0412?` would otherwise match — and the other
  checks file-wide:
  ```bash
  for f in docs/product-vision-planning/ux/wireframes/*.html; do
    sed -n '/<style>/,/<\/style>/p' "$f" | grep -oiE '#[0-9a-f]{3,6}\b' | grep -viE '^#(fff|f2f2f2|e5e5e5|999|777|222)$' | sed "s|^|$f: |"
  done
  grep -rnoiE 'font-family:[^;]*|url\(|<img|<link|https?://' docs/product-vision-planning/ux/wireframes/ | grep -viE 'system-ui'
  ```
  Any output is a violation — fix it.
- [ ] `ux/screens.md` mermaid blocks parse (node handles have no hyphens; every edge has a label).
- [ ] ConOps Document Version and Date were bumped, `ux/screens.md`'s `**Companion:**` line cites
  the bumped version, and every rewritten step names a screen ID.
- [ ] Brownfield: no existing `S-NN` ID was renumbered or reassigned.

Fix every failure in place before continuing.

---

## Step 9: Self-Check — Trace ConOps Steps to Screens

Build an explicit trace table. Print it verbatim — it is part of the Step 10 summary, not
internal scratch.

```
## Self-Check: ConOps Step → Screen Trace

| # | Input (source:reference) | Captured as (screen + control) | Wireframe | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------------------------|--------------------------------|-----------|-----------------|-------------------|
| 1 | ConOps S1.1: "user opens the orders list" | S-01 Orders List (populated) | S-01-orders-list.html | Y | N |
| 2 | ConOps S1.2: "user creates a new order" | S-01 "New order" button → S-02 Order Form | S-02-order-form.html | Y | N |
| 3 | ConOps S1.5: "nightly job reconciles totals" | n/a — no screen | — | Y | N |
| 4 | ConOps S2.3: "user reviews the summary" | (not captured) | — | N | Y |
```

**Input sources to enumerate (one row per step; a step that says "X and Y" is two rows):**
- Every numbered step in every ConOps Section 5 scenario in scope — cite the **original** step
  text, before the Step 7 rewrite.
- Desktop apps: one row per menu the *Desktop conventions* line names, captured as the
  Application menu row.

**Rules:**
- A step may map to multiple screens only when it was split in Step 7 — list both.
- `Explicit? N` → gap. `Ambiguous? Y` → gap (the step names no control, or the control text
  differs between screens.md, the wireframe, and the ConOps).
- Steps with no UI: `n/a — no screen` with `Explicit? Y`, `Ambiguous? N`.
- Out-of-scope steps (brownfield, scenario not in scope): `N/A — not in scope` in the Ambiguous
  column.
- For every gap: add or tighten the screen row, state, wireframe, or ConOps step in place, then
  re-run the affected row. Do not present the summary with unresolved gaps.

---

## Step 10: Present Summary & Next Step

```
## Mockup — Complete

### Documents Written
- `docs/product-vision-planning/ux/screens.md` — [Created v1.0 / Updated to v{N.N}]
- `docs/product-vision-planning/ux/wireframes/S-NN-<name>.html` — [one line per file written]
- `docs/product-vision-planning/ux/wireframes/index.html` — [Created / Regenerated], {N} screens linked
- `docs/product-vision-planning/ux/README.md` — [Created / unchanged]
- `docs/product-vision-planning/concept-of-operations.md` — Section 5 steps concretized, v{N.N}
[Only when `feature_files_exist = true`:] - `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md` — [UX Changes appended / replaced / created]

### By the Numbers
- Screens: {N} ({M} new, {K} modified) [desktop: + Application menu and Window rows]
- Flows: {N} (one per scenario in scope)
- Wireframes: {N} files, {N} data-bearing screens × 4 states
- ConOps steps concretized: {X} of {Y} in scope ({Z} split)
- Trace gaps resolved: {M}

### Self-Check (final passing table)
[Paste the full trace table from Step 9 — every row Explicit=Y and Ambiguous=N, or an explicit
n/a / N/A entry]

[If the UX Baseline section was absent in Step 1:]
### Advisory
`CLAUDE.md` has no **UX Baseline** section. Run `/peak-workflow:setup` before
`/peak-workflow:capture-requirements` so the baseline UX TORs (screen states, keyboard and focus,
forms, destructive actions, progress feedback, layout floor[, desktop conventions]) are derived
against these screens.

### Next Step
Run `/peak-workflow:capture-requirements` next on this same `docs/` branch. It reads
`ux/screens.md` and the concretized ConOps, and cites screens and states (`S-NN`) in its
Given/When/Then and trace table. After that, `/peak-workflow:plan-project` forms the
walking-skeleton epic that installs the design system, builds the app shell, and ships the
reference screen these wireframes assume.
```

**Do NOT commit.** The full planning sequence (`discover` → `mockup` → `capture-requirements` →
`plan-project` → optional `add`) runs on the `docs/` branch before the user merges. Committing
happens only at the `plan-project` Commit Gate, with the user's confirmation, and the merge
(solo or team PR) is the approval gate for the mockups, requirements, and plan as a unit.
