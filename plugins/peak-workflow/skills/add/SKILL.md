---
name: add
description: |
  Adds new epic(s) to the implementation plan from a natural language description.
  Epics reference TOR requirement IDs from docs/requirements/*.feature.md as their Requirements
  Anchors — the TOR ID is the acceptance criterion and the Given/When/Then is the verification.
  Use when the user wants to add a single epic or small batch without re-running full planning.
  Triggers on: "add epic", "new epic", "create epic", "I need to add more work",
  "there's a new feature we need", "can we squeeze in", "add a feature",
  "another thing we need to build".
argument-hint: "<description of what the epic should accomplish> | removal epic for CR-…"
---

You are adding one or more new epics to the implementation plan based on the user's description.
Each epic's acceptance criteria are expressed as TOR requirement IDs from the requirements
baseline — not prose checkboxes.

The user's request: $ARGUMENTS

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On any other exit, print its output and stop — it names the fix (`/peak-workflow:upgrade`, a
plugin update, or a Python install). After this guard, read the project's files only in the
current format.

---

Follow these steps exactly:

## Step 1: Load Context

0. **Freshness check.** If `git remote` lists `origin`, run `git fetch --quiet origin` and, if
   `origin/<base>` exists, count `git rev-list --count <base>..origin/<base>` (base: `develop` >
   `main` > `master`). If the
   base is behind, warn before reading anything: `Your <base> is <N> commit(s) behind origin — a
   teammate may have planned epics or claimed TORs you cannot see. Pull <base> first, then re-run
   /peak-workflow:add.` Continue only if the user says to. Skip silently with no remote.
1. Read `CLAUDE.md` at the repo root for project context.
2. Read the phase indexes: glob `docs/implementation-plan/phase-*/index.md` and read each file to understand the existing epic structure, phase names, and existing epic IDs.
3. Read `docs/architecture.md` for system context.
4. **Load TOR requirements baseline.** Glob `docs/requirements/*.feature.md`. For each file, parse every `Scenario: [TOR-NN-XXXXXXX]` block: capture the TOR ID, feature file path, and Given/When/Then. Then run, once each:
   - `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" states --json` → **`states`**: one row
     per requirement with its `title`, `state`, and owning `epic`. Only `live: true` rows can be
     anchors — retired and superseded IDs are never planned. A live row is **unassigned** when
     its `state` is `Specified`, or `Disputed` with `underlying_state` `Specified`; a `Waived`
     row shows as `Waived → <waived_to>`: when the user asks for one, say "<TOR> was waived to
     <epic ref>, which does not list it yet — add it there with /peak-workflow:plan-project, or
     ask me to add it there now" and, on the latter, add it to that epic's anchors table and
     sidecar `requirements:` — only when that epic is Not Started;
     any other live row is owned by its `epic`. A supersede successor nobody took yet is unassigned like any
     other.
   - `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" check --json` → **`check`** (exit 0 and 1
     are both success). Its F findings with `kind: removal-missing` are the retire records still
     waiting for a removal epic (`detail.record`).
   Exit 2 or 3 from either: print the output and stop — it names the fix.
   If `docs/requirements/` is empty or missing, stop:
   > The requirements baseline is empty. Run `/peak-workflow:capture-requirements` first to
   > establish TOR requirements before adding epics. Epics reference TOR IDs as their acceptance
   > criteria — without a requirements baseline, there are no acceptance criteria to reference.
5. Read `docs/product-vision-planning/ux/screens.md` if it exists (UI projects — written by `/peak-workflow:mockup`). Capture each `S-NN`, name, and wireframe path (the `Wireframe` column — `wireframes/S-NN-{kebab}.html`, relative to `ux/`, or `—`), and grep existing specs for `## Screens` sections to note which epic owns each screen. Steps 2.2 and 6 use this.

## Step 2: Resolve the Request

### 2.0: Check for an issue-number prefix

If `$ARGUMENTS` starts with the pattern `[issue #<N>]` (e.g. `[issue #42] Add CSV export — …`), extract the integer `<N>` and strip the prefix from the remaining description:

1. Capture the number: this is the **source issue number** and must be remembered for Step 6 (spec `Source:` line).
2. Run `gh issue view <N> --json title,body,labels` to fetch the canonical title and body, and use them to augment the stripped description — the prefix-bearing description from `/triage` is a summary, not the full issue.
3. If `gh` is unavailable or the issue cannot be fetched, fall back to the stripped description alone and still record the number for the `Source:` line.

If no `[issue #<N>]` prefix is present, the source issue number is unknown — skip the fetch and leave the `Source:` line out of the spec in Step 6.

### 2.0b: Removal epic for a retire record

A request of the form `removal epic for CR-XXXXXXX` (optionally followed by `: <title>` —
`capture-requirements` Step 7.1 dispatches exactly this), or a description asking to plan the
removal of something a retire record names, is a **removal epic**. A retire record with
`removal = "code"` means the code still does what the retired requirements described; the
removal epic takes it out.

0. **No CR-ID given** (a plain-language removal request): match the description against the
   `title` and `keywords` of every retire record with `removal = "code"` (the `states` rows in
   `Retired, removal pending` name them in `record`). One match → use it, and item 1's stops
   apply (it may already have a removal epic); several → ask which; none → this is a normal
   epic, continue at 2.1.
1. Read the record (`docs/requirements/changes/*-<7 chars after "CR-">.toml`) and stop, in this
   order, with the matching message (when `$ARGUMENTS` names the ID, do this right after loading
   `states` and `check`, before the rest of Step 1):
   - No such file: `<CR-ID> is not a Change Record in docs/requirements/changes/. Check the ID
     with /peak-workflow:status.`
   - A `supersede` record: `<CR-ID> is a supersede record — nothing to remove. Plan its
     successor(s) <IDs> with /peak-workflow:add <description>.`
   - Any other kind but `retire`: `<CR-ID> is a <kind> record — only a retire record gets a
     removal epic.`
   - `removal = "none"`: `<CR-ID> retired <TOR-IDs> with nothing left in the code — no removal
     epic is needed.`
   - Its `states` row (any retired ID) lists `removal_epics`: `<CR-ID> already has a removal
     epic: <id> (<slug>) — <Name> (<status>). A record gets one removal epic.` (Name and slug from
     the phase index and spec filename, status from the sidecar.) When the request also matches
     a live requirement that states a removal, add: `<TOR> — reword it as a guard with
     /peak-workflow:capture-requirements <TOR>.`
2. Find the code still doing it: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" sweep <the
   record's retired IDs>` lists the tests and source citing them (exit 1 means citations were
   found — expected here); add the source paths those tests exercise, found in Step 5.
3. **Guard requirements** are its only possible anchors: live, unassigned requirements that state
   what must stay true once the code is gone (for example "The service shall answer a CSV export
   request with HTTP 410 and a message naming the export API"). Find candidates by matching the
   record's `keywords` and `title` against unassigned titles in `states`. Offer them in Step
   2.2's table — zero is a valid answer. **Never** anchor a requirement satisfied only by code
   being absent ("shall be removed", "shall remove X", "X does not exist"): it is dead the day it
   passes. If one exists, leave it out, list it in the Step 8 trace as `N/A — deferred: states a
   removal; reword as a guard` and in the Step 9 summary as **Left out**, and recommend
   `/peak-workflow:capture-requirements <TOR-ID>`. This skill never writes requirements.
4. Continue at Step 2.2 with the guard candidates, then Steps 3–9. The spec gets the
   `## Removal` section and the sidecar the `retires:` line (Steps 6 and 7). Skip the
   whole-capability check; code a guard needs that another epic owns (a server to answer 404) is
   a dependency (Step 3). A removal epic has no `## Screens` section and no Design note — a
   screen its retired requirement named stays with the epic that owns it.

### 2.1: Interpret the description

Interpret the (now prefix-free) description. It may be:
- A full description of what the epic should accomplish
- A reference to something discussed earlier in the conversation (e.g., "the outstanding items", "what we just talked about") — scan conversation history to expand these into concrete requirements
- A request for multiple epics — detect plural intent ("add both as separate epics", "split this into two")
- Minimal or ambiguous — ask one round of clarifying questions before proceeding

### 2.2: Identify Covering TOR IDs

Based on the description, identify which TOR IDs from the requirements baseline this epic will implement. Present the candidates to the user:

```
## TOR Requirements Relevant to This Epic

Based on your description, these TOR IDs appear relevant:

| TOR ID | Feature File | Title | Owner |
|--------|--------------|-------|-------|
| TOR-01-Afs657G | 01-cli.feature.md | The tool shall report its part number and version... | unassigned |
| TOR-02-Xyz5678 | 02-auth.feature.md | The tool shall reject requests with invalid tokens... | Epic aB3dE5f (Not Started) |
| ...    | ...          | ...   | ... |

Titles and owners come from `states`, never from an epic spec. Mark a Disputed row "Disputed —
resolve with `/peak-workflow:capture-requirements <TOR>` before starting".

**Unplanned TOR IDs (not yet in any epic):** [N]
**Already-planned TOR IDs (owned by another epic):** [N] — each must be moved here or dropped [omit for a removal epic]
```

Use `AskUserQuestion`:
- Question: `"Which TOR IDs should this epic cover? Confirm the list above, add others, or remove any that don't apply."`
- Options: `["Confirmed — use the list above", "I'll specify — list TOR IDs to add or remove"]`

If the user confirms the list, use it. If the user specifies additions or removals, update accordingly.

**If no existing TOR IDs match the description** (except for a removal epic, where an empty set
is valid — continue with `requirements: —`), inform the user:
> No existing TOR requirements match this description. To add new requirements, run
> `/peak-workflow:capture-requirements` (brownfield mode) on a `docs/{task-short-name}` branch
> to derive and approve new TOR IDs, then re-run `/peak-workflow:add`.

Wait for the user's answer. The confirmed TOR ID set is the Requirements Anchors list for this epic.

**Never anchor a removal statement.** On any epic, a requirement satisfied only by code being
absent ("shall be removed", "shall remove X", "X does not exist") is never an anchor — it is dead
the day it passes. Leave it out, name it under **Left out** in Step 9, and recommend
`/peak-workflow:capture-requirements <TOR-ID>` to reword it as a guard.

**Supersede successors.** For a confirmed TOR that `states` shows as a successor (a `live: false`
row lists it in `successors`), run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" sweep
<predecessor>` and list the tests it finds in Key Components — retarget or replace them.

**Whole-capability check.** An epic is a vertical slice: every TOR it lists must be fully
realizable inside it — schema, service, endpoint, and screen together, whatever the Then clause
needs to be observable. If a confirmed TOR needs code that no other epic — of any status — owns
or is planned to create, and this epic does not create it, widen this epic to include that code
rather than listing the TOR and deferring it. Code another epic owns, whatever its status, is a
dependency (Step 3), not a reason to widen; a Not Started provider only means this epic is
blocked until that one is Implemented.

A TOR ID is owned by exactly one epic. For each confirmed TOR that `states` shows owned by
another epic, use `AskUserQuestion`:
- Question: `"TOR-<NN-XXXXXXX> is already owned by Epic <id> (<status>). Keep it there, or move it here?"`
- Options: `["Keep it in Epic <id> — drop it from this epic", "Move it here"]`

Moving is allowed only when the other epic is **Not Started**: remove the ID from that epic's
sidecar `requirements:` line and its spec's Requirements Anchors table (Step 7 item 3).
If the other epic is In Progress, Paused, Implemented, or Complete, do not ask — tell the user it stays there and drop it from this epic — the TOR
stays where it is being (or was) delivered. **Never edit an epic that is not Not Started** — no
spec, sidecar, or phase-index change; a Complete epic keeps the IDs it verified.

If every confirmed TOR was dropped via Keep, the set is empty — stop with the "No existing TOR
requirements match" message above (a removal epic continues with no anchors).

**Screens (UI epics, when `ux/screens.md` exists).** A UI epic lists the `S-NN` screens its
confirmed TORs name in their Given/When — those are its `## Screens` rows in Step 6. A screen
belongs to exactly one epic: a screen an existing epic already built (its anchors' TORs name
it) is not owned here even when no Screens table lists it — list it with `extends — <what
changes>` in the States column so start-epic gets the wireframe. If another epic's spec already lists it, ask the same Keep / Move
question as for a TOR, with the same Not Started rule for moving. Never offer Move for an `S-NN`
the `# Note: reference screen` / `reference screens` line in the first feature file names — those
are skeleton-owned; offer Keep only, and the new epic extends the screen without re-listing it.

**Assign the epic ID:** generate a fresh **7-character random alphanumeric ID** for each new epic via:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7
```

The `LC_ALL=C` prefix is required for portability — without it, BSD `tr` (macOS) can emit "Illegal byte sequence" on non-UTF8 bytes from `/dev/urandom`.

Ensure each ID is unique across the batch and the existing plan.

If the user tried to specify an ID or number up front (e.g., "as Epic 6.6"), politely override:

> Epic IDs are auto-generated random 7-character strings; this new epic will be `<generated-id>`. The phase you chose will be honored.

With random IDs there is no "insert between X and Y" — epics are appended at the bottom of their phase block in the index.

## Step 3: Determine Dependencies

From the user's description and the existing phase indexes, determine:
- Which existing epics this new epic depends on
- Whether any existing **Not Started** epics should depend on this one (if so, update that
  epic's phase-index Dependencies cell and its spec's `**Dependencies:**` line). Phase-index row
  order is insertion order, not build order.

If dependencies are ambiguous, ask the user.

## Step 4: Read Existing Epics for Context

1. Read 1-2 completed or well-defined epic specs from the same phase to match the level of detail, tone, and specificity. These are the quality bar — the new epic must be at least as detailed. Match their detail, not their format: a Complete spec may keep an older anchors table, and the Step 6 template wins.
2. Identify which phase directory the new epic belongs in based on the dependency and the existing phase structure in the phase indexes.

## Step 5: Explore Relevant Codebase

If the epic modifies or extends existing features (not greenfield), explore the relevant source files to understand:
- Current component structure, props, and state management
- Existing patterns that the epic should follow or extend
- File paths to reference in the Key Components section

Use this understanding to write acceptance criteria that reference real files, real components, and real state — not vague placeholders. This is what separates a useful spec from a generic one.

Skip this step only if the epic is entirely greenfield with no connection to existing code.

## Step 6: Write the Epic Spec(s)

Create the epic spec file(s) following the **required structure** below. `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic` depend on this exact format — particularly the Requirements Anchors table.

### File Location

`docs/implementation-plan/{phase-directory}/epic-{id}-{kebab-case-name}.md` (where `{id}` is the 7-char alphanumeric ID generated in Step 2)

The phase directory must match an existing `phase-N-name/` directory in the implementation plan. If the epic belongs to a new phase, ask the user to confirm before creating it.

### Required File Structure

```markdown
# Epic {id}: {Name}

**Phase:** {N} — {Phase Name}
**Status:** Not Started
**Dependencies:** Epic {id1} ({short description}), Epic {id2} ({short description})
**Planned by:** {planner}
**Planned:** {YYYY-MM-DD}
**Plan branch:** {plan-branch}
**Source:** Issue #{N}

> **Design:** UI epic — `/peak-workflow:start-epic` runs a Design pass with the design skills installed at that time (brand kit, `frontend-design`, shadcn) for {relevant UI elements}.

---

## Description

{2-4 sentences. What is being built and why. Reference the functional areas and TOR requirements
this epic addresses. Explain the motivation — user request, architectural need, or gap in
coverage.}

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` |
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` |

## Removal

**Retires:** {CR-ID} — {record title} ({record date})
**Retired requirements:** {TOR-ID}, {TOR-ID} — no longer requirement(s); their text is in the record
**Code to remove:** {paths from `sweep` and the code those tests exercise}
**Done when:** `tor-lifecycle sweep {retired IDs}` reports nothing, the code above is gone, and
every guard requirement in Requirements Anchors passes. Tests that only proved the old behavior
are deleted, not retargeted.

## Screens

| Screen | Wireframe | States this epic delivers |
|--------|-----------|---------------------------|
| S-NN {Name} | `docs/product-vision-planning/ux/wireframes/S-NN-{kebab}.html` | loading / empty / error / populated |

## Key Components

{List of file paths that will be created or modified, with a brief description of each. Use the
project's actual directory structure. Separate into ### Backend and ### Frontend subheadings if
both are involved.}
```

**Conditional lines and sections in the template above** — do not carry this guidance into the written spec:

- Include the **Design** note only if the epic involves UI work. Omit it entirely otherwise.
- Write `**Dependencies:** —` when there are none.
- Always include the three provenance lines, filled at write time — never leave a placeholder: `{planner}` is `git config user.name`, `{YYYY-MM-DD}` is today, and `{plan-branch}` is `git branch --show-current`. `/peak-workflow:status` and `/peak-workflow:start-epic` show them so a teammate can tell who planned an epic.
- Include the `**Source:** Issue #{N}` line only when a source issue number is known — i.e., `$ARGUMENTS` arrived with an `[issue #<N>]` prefix in Step 2.0. Omit the line entirely otherwise.
- Include the `## Removal` section only for a removal epic (Step 2.0b). Omit it entirely otherwise. A removal epic with no guard requirements keeps the Requirements Anchors heading with the line `None — a removal epic; see Removal.` in place of the table.
- Include the `## Screens` section only for a UI epic when `ux/screens.md` exists (Step 1 item 5). Omit it entirely otherwise. Rows are the screens confirmed in Step 2.2, name copied verbatim from `ux/screens.md` and wireframe path copied verbatim from its `Wireframe` column, resolved under `docs/product-vision-planning/ux/`; a screen marked `n/a — not data-bearing` lists `populated` only. The Application menu and Window rows (desktop apps) carry `—` in that column and write `—` here — `mockup` draws no wireframe for them; their contract is the `ux/screens.md` row and the Desktop conventions TORs. A screen appears in exactly one epic's Screens table.

**Populating Requirements Anchors:**

Use the confirmed TOR ID set from Step 2.2:
- Copy each TOR ID verbatim.
- Set Feature File to the relative path from the repo root (e.g., `docs/requirements/01-cli.feature.md`).
- Write no title: titles live only in the feature file.

Do not paraphrase or summarize TOR IDs — verbatim accuracy is required for downstream skills
(`start` and `wrapup`) to locate the scenario in the feature file.

### Quality Checks Before Writing

Before writing each spec, verify:
- [ ] Every TOR ID in Requirements Anchors exists in the cited feature file with an exact ID match
- [ ] The anchors table has exactly two columns, `TOR ID | Feature File`, and every ID is live (no retired or superseded ID)
- [ ] Feature file paths are correct relative paths from the repo root
- [ ] Key Components reference real directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — no circular references introduced

## Step 7: Update Phase Index and Create Status Sidecar

1. **Phase index** — append a row for the new epic at the **bottom** of `docs/implementation-plan/{phase-dir}/index.md`. Use the format:
   ```
   | {id} | [{Name}](epic-{id}-{kebab-name}.md) | {dep-id-1}, {dep-id-2} |
   ```
   Use `—` in the Dependencies column if the epic has no dependencies. Use the epic ID verbatim.

2. **Status sidecar** — create `docs/implementation-plan/status/epic-{id}.md` with exactly these six lines
   (`owner:` stays `—` until `/peak-workflow:start-epic` sets it), plus `retires: CR-{XXXXXXX}` as a
   seventh line for a removal epic:
   ```
   status: Not Started
   owner: —
   implemented: —
   completed: —
   handoff: —
   requirements: TOR-{NN}-{XXXXXXX}, TOR-{NN}-{XXXXXXX}
   ```
   The `requirements:` field lists every TOR ID from the epic's Requirements Anchors table
   (comma-separated, verbatim). This field is how `/peak-workflow:status` computes requirements
   coverage. For epics with no TOR IDs (rare — utility epics with no direct user-facing
   requirement), use `requirements: —`.
   Create the `docs/implementation-plan/status/` directory if it does not already exist.

3. **Moved TORs and screens** — for each TOR moved here in Step 2.2, remove its ID from the
   donor epic's sidecar `requirements:` line and delete its row from the donor spec's
   Requirements Anchors table. For each `S-NN` moved here, delete its row from the donor spec's
   `## Screens` table. Skip if nothing was moved.

## Step 8: Self-Check — Trace Inputs to Outputs

Before presenting the summary, run an explicit post-write self-check. The pre-write "Quality
Checks" in Step 6 ask "does the spec look reasonable on its own." This self-check asks the more
important cross-cutting question: **did every input — including each selected TOR ID — land in
the output explicitly and unambiguously?**

### 8.1: Enumerate Inputs

List every discrete requirement or intent signal that drove this invocation. Sources:

- **Selected TOR IDs** (from Step 2.2) — every TOR ID the user confirmed for this epic.
- **Removal record** (Step 2.0b) — one row, `Removal: <CR-ID>`, captured by the sidecar's
  `retires:` line and the spec's `## Removal` section; one more row per `sweep` path.
- **User description** (`$ARGUMENTS` after Step 2.0 prefix stripping) — each distinct behavior,
  constraint, or deliverable named. Include follow-up clarifications.
- **GitHub issue body** (if Step 2.0 fetched one) — each acceptance hint, constraint, or user
  story. Do not skip items merely because they weren't phrased as requirements.
- **Dependency signals** — prerequisite epics identified in Step 3.

One input per row. A TOR ID is a single row. A user description with two distinct behaviors is
two rows.

### 8.2: Build the Trace Table

Print the table verbatim — it is part of the Step 9 summary.

```
## Self-Check: Input → Output Trace

| # | Input (source:reference) | Captured in Output (spec section) | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------------------------|-----------------------------------|-----------------|-------------------|
| 1 | TOR-01-Afs657G — The tool shall report its version… | Requirements Anchors, row 1 | Y | N |
| 2 | TOR-01-Bcd2345 — The tool shall accept --help… | Requirements Anchors, row 2 | Y | N |
| 3 | User description: "must work on Windows and Linux" | Key Components (note on portability) | Y | N |
| 4 | Issue #42 body: "also validate the exit code" | (not captured) | N | — |
```

Rules:
- **Explicit? N** — not captured in any output section. Gap.
- **Ambiguous? Y** — captured in language so vague that two engineers could implement it
  differently. Gap.
- Out-of-scope items: `N/A — deferred: {rationale}`. List explicitly.

### 8.3: Remediate and Re-Run

For every gap:
1. If a TOR ID is missing from Requirements Anchors, add it.
2. If a user description item is not captured, add a note to Key Components or Description
   (or, if it represents a new requirement, direct the user to `capture-requirements`).
3. Re-run the table. Iterate until all rows are `Explicit? Y` and `Ambiguous? N`, or explicit
   deferral.

Do not present the summary with unresolved gaps.

### 8.4: Keep the Final Table

The final passing table is printed as part of Step 9 summary — so the user and future reviewers
can see what this epic was intended to cover and which TOR IDs it owns.

## Step 9: Present Summary

Show the user what was created:

```
## Added Epic(s)

### Epic {id} ({slug}): {Name}
- **File:** `docs/implementation-plan/{path}`
- **Planned by:** {planner}, {YYYY-MM-DD}
- **Phase:** {N} — {Name}
- **Dependencies:** {list}
- **Requirements:** one line per anchor, `TOR-… — <title>`, titles from one
  `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" titles <anchor IDs>` run [or "None — a removal epic"]
- [Removal epic only:] **Retires:** {CR-ID} — {record title}; {N} `sweep` citations to delete
- [Removal epic only, when one was left out:] **Left out:** TOR-… — states a removal; reword it as a guard with `/peak-workflow:capture-requirements TOR-…`

{Repeat for each epic if multiple were created}

### Plan Updated
- 1 row appended to `docs/implementation-plan/{phase-dir}/index.md`
- `docs/implementation-plan/status/epic-{id}.md` created (status: Not Started)
- [If any TOR was moved:] Epic {donor-id} sidecar and spec updated — {TOR list} moved here

### Self-Check
- {count} inputs traced to outputs, all Explicit=Y and Ambiguous=N (see Step 8 trace table above)
- Out-of-scope items explicitly struck: {list, or "none"}

### Ready to implement
Run `/peak-workflow:start-epic {id}` when ready to begin (in a fresh session for clean context).
Note: `/peak-workflow:start-epic` loads TOR requirements from the feature files listed in the
Requirements Anchors table — ensure those feature files are on develop (merged) before starting.
```

Do NOT commit — leave that for the user to decide.
