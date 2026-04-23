---
name: plan-project
description: |
  Derives implementation plan (phases, epics, specs) from vision and ConOps documents.
  Use after /epic-workflow:discover or when the user wants to create an implementation plan from existing vision docs.
  Triggers on: "plan project", "create epics", "implementation plan", "derive epics",
  "break this into epics", "how should we phase this", "turn this into a plan",
  "organize work into phases", "what's the build order".
---

You are deriving a full implementation plan — phases, epics, and epic specs — from the project's product vision and concept of operations documents.

The user's request: $ARGUMENTS

Follow these steps exactly:

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root for project context and tech stack.
2. Read `docs/product-vision-planning/product-vision.md` — if it does not exist or is a placeholder, stop and tell the user to run `/epic-workflow:discover` first.
3. Read `docs/product-vision-planning/concept-of-operations.md` — if it does not exist or is a placeholder, stop and tell the user to run `/epic-workflow:discover` first.

## Step 2: Detect Greenfield vs Brownfield

1. Read `docs/implementation-plan/index.md` — check whether it exists and contains at least one epic.

**Greenfield** = index.md does not exist or has no epics. Proceed to Step 3A.

**Brownfield** = index.md exists with at least one epic. Proceed to Step 3B.

Report the detection result:
```
Mode: [Greenfield / Brownfield]
Existing epics: [N epics across M phases / none]
```

## Step 3A: Greenfield — Full Derivation

### 3A.1: Scenario Decomposition

Read each operational scenario in the ConOps (Section 5). For every numbered step in every scenario, extract the implied capability:

```
Scenario 1, Step 3: "The map loads showing all ~3,000 suppliers as clustered pins"
  → Capability: Render interactive map with pin clustering for all suppliers
```

Build a complete capability list. Note which scenario step(s) each capability traces to.

### 3A.2: Capability Grouping

Deduplicate the capability list (many scenarios imply the same capability). Group capabilities by implementation layer:

| Layer | Examples |
|-------|----------|
| **Foundation** | Project scaffolding, build pipeline, dev environment |
| **Data** | Database schema, data access, connection factories, background jobs |
| **Backend API** | REST endpoints, query logic, response models |
| **Frontend** | Pages, components, state management, routing |
| **Integration** | Cross-view navigation, deep linking, end-to-end flows |
| **Deployment & QA** | CI/CD, containerization, quality audits |

Not all layers apply to every project — omit layers with no work, add domain-specific layers as needed.

### 3A.3: Epic Formation

Cluster related capabilities within each layer into session-sized epics. Each epic should:
- Have 5–15 acceptance criteria (enough to be meaningful, not so many that a single session can't complete it)
- Be independently implementable once its dependencies are met
- Have a clear "done" state that can be verified

**Assign epic IDs:** for each new epic, generate a fresh **7-character random alphanumeric ID** via:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7
```

The `LC_ALL=C` prefix is required for portability — without it, BSD `tr` (macOS) can emit "Illegal byte sequence" on non-UTF8 bytes from `/dev/urandom`.

Validate each ID: if the 7-char string contains only digits, regenerate (this prevents the rare case where a random ID would be ambiguous with the legacy integer format). Also ensure uniqueness across the batch — extremely unlikely, but check.

Example IDs: `a3f2K7p`, `B9xQr2z`, `m4Ljf0T`.

**Do not** use incrementing integers or decimals for new epics. Random IDs eliminate collisions when multiple developers run `/add` or `/plan-project` concurrently, so the concept of "insertion order" no longer applies — ordering within a phase is by insertion time in the index.

### 3A.4: Phase Structure

Organize epics into phases. Start from this template and adapt:

1. **Foundation** — scaffolding, build tooling, dev environment, project structure
2. **Data Layer** — database connections, repositories, data access patterns
3. **Backend API** — REST endpoints, query logic, response models
4. **Frontend** — pages, components, views (may split into multiple phases if large)
5. **Integration** — cross-view navigation, deep linking, end-to-end user flows
6. **Deployment & QA** — CI/CD, containerization, final quality audit

Remove phases with no work. Split phases that are too large. Add domain-specific phases as needed (e.g., "Background Services" for geocoding).

Proceed to Step 4.

## Step 3B: Brownfield — Delta Derivation

### 3B.1: Load the Handoff

Look in `docs/product-vision-planning/changelogs/` for unprocessed discovery changelogs. An unprocessed changelog is any file matching `discovery-changelog-*.md` that does **not** end in `.processed` — once `/plan-project` consumes a changelog in Step 5.4 it appends a `.processed` suffix, so the glob naturally filters them out:

```bash
ls docs/product-vision-planning/changelogs/discovery-changelog-*.md 2>/dev/null | grep -v '\.processed$'
```

Interpret the result:

- **Exactly one unprocessed changelog:** Read it. The "New Capabilities Identified" section is your primary input. The "Priority Signal" section guides epic ordering. Remember this path for Step 5.4.
- **Two or more unprocessed changelogs:** STOP. Do not attempt to merge them silently. Inform the user:
  > Found {N} unprocessed discovery changelogs:
  > {list the filenames}
  >
  > This can happen when two `/epic-workflow:discover` sessions ran on different machines between planning cycles. Silent merging could lose intent, so I need you to reconcile them before planning continues. Options: (1) delete the ones that are superseded, (2) merge their "New Capabilities Identified" and "Priority Signal" sections into a single changelog and delete the others, or (3) tell me which single file to treat as authoritative.
  >
  > Once only one unprocessed changelog remains in the directory, re-run `/epic-workflow:plan-project`.

  Do not proceed until the user has reconciled.
- **Zero unprocessed changelogs:** Fall back to full-document delta analysis:
  1. Read the current product-vision.md and concept-of-operations.md.
  2. Use `git diff` or `git log` to identify what changed in these files since the last implementation plan update.
  3. Extract new or modified capabilities from the changed sections.

  Note in the Step 7 summary that no changelog handoff was found and delta analysis was used instead.

### 3B.2: Map Against Existing Plan

Read all existing epic specs (glob `docs/implementation-plan/phase-*/epic-*.md`). For each new capability from the changelog:
- Does an existing epic already cover it? → Skip (note as "already covered by Epic <id>").
- Does it extend an existing epic's scope? → Flag for discussion with the user (modifying completed epics is risky).
- Is it genuinely new? → Add to the new epic list.

### 3B.3: Form New Epics

Apply the same epic formation rules as greenfield (5–15 acceptance criteria, session-sized, independently implementable). New epics are added to existing phases where they fit, or to new phases if the work doesn't belong anywhere.

**Assign IDs** using the same generation command as Step 3A.3 — a fresh 7-character random alphanumeric ID per new epic, regenerated if all-digit, unique across the batch. Do not reuse existing integer IDs; do not attempt to slot new epics into the old decimal scheme (e.g., `6.7`). Existing integer-IDed epics in the index remain untouched; new epics always get alphanumeric IDs.

Proceed to Step 4.

## Step 4: Negotiate with the User

Present the full epic breakdown for approval. Do NOT write any files yet.

### Present the Plan

```
## Proposed Implementation Plan

### Phase Overview

| Phase | Name | Epics | Key Deliverables |
|-------|------|-------|------------------|
| 1 | [Name] | [N] | [1-line summary] |
| ... | ... | ... | ... |

### Epic Breakdown

| Phase | Epic | Name | Dependencies | Acceptance Criteria | Traces To |
|-------|------|------|--------------|--------------------:|-----------|
| 1 | a3f2K7p | [Name] | — | [N] | ConOps S1.3, S5.1 |
| 1 | B9xQr2z | [Name] | Epic a3f2K7p | [N] | ConOps S6.1, PV 10 |
| ... | ... | ... | ... | ... | ... |

### Dependency Graph

[ASCII tree showing dependencies — same format as existing index.md]

### Parallelization Opportunities

[List epics that can be worked on in parallel because they share no dependencies]

### Estimated Scope

- Total epics: [N]
- Total acceptance criteria: [N]
- Recommended session order: [list epic IDs in order]
```

### Iterate

Ask: "Approve this plan, or tell me what to adjust — merge epics, split epics, reorder, add, or remove."

Iterate until the user approves. Maximum 3 rounds — if the user is still adjusting after 3 rounds, write what's agreed and note open items.

## Step 5: Write the Implementation Plan

### 5.1: Create the Directory Structure

For each phase, create the directory: `docs/implementation-plan/phase-{N}-{kebab-case-name}/`

Create `docs/implementation-plan/session-handoffs/` if it doesn't exist.

### 5.2: Write Epic Specs

For each epic, write the spec file following the exact format required by `/epic-workflow:start` and `/epic-workflow:wrapup`. Use the same structure defined in `/epic-workflow:add`:

**File:** `docs/implementation-plan/phase-{N}-{name}/epic-{id}-{kebab-case-name}.md` (where `{id}` is the 7-char alphanumeric ID for new epics, or a preserved legacy integer for brownfield rows that already exist)

```markdown
# Epic {id}: {Name}

**Phase:** {N} — {Phase Name}
**Status:** Not Started
**Dependencies:** Epic {id1} ({short description}), Epic {id2} ({short description})
**Source:** Issue #{N}

> **Brand:** Use the project's brand guidelines skill for {relevant UI elements} if one is configured.

---

## Description

{2-4 sentences. What is being built and why.}

## Vision & Scenario Anchors

> Readers of this epic (`/epic-workflow:start`, `/epic-workflow:wrapup`, and the independent reviewer) will read the paraphrases below first, then spot-check them against the cited source sections. If a paraphrase conflicts with its source, neither text is automatically authoritative — stop and ask the user which reflects current intent.

### Vision anchors
- `docs/product-vision-planning/product-vision.md` § {section number/title} — {1–2 sentence paraphrase of why this epic serves the vision}
- {repeat for each cited vision section}

### Scenario anchors
- `docs/product-vision-planning/concept-of-operations.md` § {scenario id or section, e.g. "S1 step 3"} — {1–2 sentence paraphrase of the user intent this epic serves}
- {repeat for each cited scenario step}

## At Completion, a User Can

{3-6 bullet points from the end-user's perspective. Each starts with a verb.}

## Acceptance Criteria

{Checkboxes (`- [ ]`) for every discrete requirement. Group under ### subheadings if the epic spans layers. Each criterion traces back to a ConOps scenario step or MVP scope item — include the trace in parentheses.}

## Verification

{Checkboxes for concrete test scenarios. Always include:
- Build check (read CLAUDE.md for the project's build command)
- Zero console errors (if frontend)
- Brand audit (if UI work)
- Behavioral scenarios with specific test data}

## Key Components

{List of file paths to create or modify, with brief descriptions.}
```

**Conditional lines in the header template above** — do not carry this guidance into the written spec:

- Include the **Brand** note only if the epic involves UI work. Omit it entirely otherwise.
- Include the `**Source:** Issue #{N}` line only when the epic was spawned from a specific GitHub issue — rare from `/plan-project`, more common from `/add` after `/triage`. Omit it entirely otherwise; the line is optional and all downstream skills treat its absence as "no source issue known".

**Populating the Vision & Scenario Anchors section:**

`/plan-project` has a natural advantage here — Step 3A.1 (scenario decomposition) already traces every capability back to a scenario step, and Step 3A.3/3B.3 (epic formation) groups those capabilities. Use that linkage directly:

- The scenarios each epic's capabilities came from become the **scenario anchors**. Cite each by scenario id and step number (e.g. `S1 step 3`).
- The vision sections whose scope items those capabilities satisfy become the **vision anchors**. Cite each by section number and title.
- Paraphrase in your own words — do not copy-paste source text. The paraphrase expresses *why this epic serves that part of the vision/scenario* in plain language. Two sentences max per bullet.
- The note at the top of the section must be written verbatim into every spec — it drives conflict-surfacing behavior in `/start` and `/wrapup`.

If a given epic cannot be anchored to any vision section or scenario step, that is a signal — either the epic is premature (not justified by current scope) or the vision docs have a gap. Raise it to the user rather than skipping the anchors.

### Quality Checks Before Writing Each Spec

- [ ] Every acceptance criterion is specific enough to verify without ambiguity
- [ ] Every acceptance criterion has a traceability note (ConOps scenario step or PV scope item)
- [ ] Vision & Scenario Anchors cite specific sections/steps (not whole docs) with paraphrased intent
- [ ] Verification items describe observable outcomes, not implementation steps
- [ ] Key Components reference realistic directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — no circular references

### 5.3: Write the Index

**Greenfield:** Create `docs/implementation-plan/index.md` with:

```markdown
# [Project Name] — Implementation Plan

## Quick Start for New Session

1. Check the status table below for the current epic
2. Run `/epic-workflow:start <id>` (where `<id>` is the epic's ID from the Epic column — a 7-character alphanumeric ID for new epics, or a legacy integer for pre-v2.0.0 epics)
3. Claude Code will read the spec, load context, enter plan mode, and create tasks
4. When implementation is done, open a new session: `/epic-workflow:wrapup <id>`
5. If stopping early: `/epic-workflow:pause`

### Epic Lifecycle

```
Not Started → In Progress → Implemented → Complete
                  ^              ^             ^
     /epic-workflow:start  /epic-workflow:start  /epic-workflow:wrapup
           (begins)           (finishes)      (independent review)
```

## Status

| Phase | Epic | Name | Status | Handoff | Implemented | Completed |
|-------|------|------|--------|---------|-------------|-----------|
[One row per epic, all "Not Started", dates as "—"]

## Dependency Graph

[ASCII tree — same format as presented in Step 4]
```

**Brownfield:** Update the existing `docs/implementation-plan/index.md`:
- Add new epic rows to the status table, inserting them at the **bottom of their phase block** (random IDs have no meaningful sort order — use insertion order within each phase)
- Update the dependency graph to include new epics
- Preserve all existing epic rows and their statuses — legacy integer IDs stay exactly as they are

The "Epic" column in the status table holds the ID string verbatim (e.g., `a3f2K7p` for new epics, `7` or `6.5` for preserved legacy rows).

### 5.4: Brownfield Changelog Archival

If Step 3B.1 consumed a changelog (the "exactly one unprocessed" path), mark it processed by appending a `.processed` suffix to the filename. This prevents the next `/plan-project` run from re-consuming it, while preserving the original discovery timestamp embedded in the filename:

```
docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md
  → docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md.processed
```

Do **not** re-timestamp the file — the original timestamp is the discovery time and carries historical meaning. The `.processed` suffix is the "consumed" marker. If Step 3B.1 fell through to delta analysis (zero unprocessed changelogs), skip this step — there is nothing to archive.

## Step 6: Self-Check — Trace Inputs to Outputs

Before touching CLAUDE.md or presenting the summary, run an explicit post-write self-check. The pre-write "Quality Checks Before Writing Each Spec" in 5.2 ask whether each individual spec looks reasonable on its own. This step asks the different and more important cross-cutting question: **did every input capability actually land in at least one epic, explicitly and unambiguously?**

### 6.1: Enumerate Inputs

Build a flat list of every driving requirement. Sources:

- **ConOps scenario steps** — every numbered step in every scenario in Section 5 of `concept-of-operations.md`. Each step is an input row, keyed as `ConOps S{scenario}.{step}`.
- **Product vision scope items** — every MVP goal, in-scope capability, success criterion, and explicit user-facing commitment from `product-vision.md`. Keyed as `PV §{section-number}: {short-label}`.
- **Brownfield changelog entries** (if Step 3B.1 consumed a changelog) — every bullet under "New Capabilities Identified" and every explicit signal under "Priority Signal" / "Deferred Items". Keyed as `Changelog: {short-label}`.
- **User adjustments from Step 4 negotiation** — any merge/split/add/remove the user asked for during plan negotiation. Keyed as `Negotiation: {short-label}`.

One input per row. Be granular: a scenario step that says "the map loads clustered pins and the user clicks a cluster to zoom in" is two inputs, not one.

### 6.2: Build the Trace Table

Print the table to the user verbatim — it is part of the Step 8 summary, not internal scratch. For a project with many inputs, the table will be long; that is expected and correct. Do not summarize rows away.

```
## Self-Check: Input → Epic Trace

| # | Input (source:reference) | Captured in Epic(s) | Captured at (spec section) | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------------------------|---------------------|----------------------------|-----------------|-------------------|
| 1 | ConOps S1.3: "map loads ~3,000 suppliers as clustered pins" | Epic a3f2K7p | Acceptance Criteria § Frontend, item 2 | Y | N |
| 2 | ConOps S1.4: "user clicks cluster to zoom in" | Epic a3f2K7p | Acceptance Criteria § Frontend, item 5 | Y | N |
| 3 | PV §6: "supports offline mode" | (not captured) | — | N | Y |
| 4 | Changelog: "CSV export on supplier list" | Epic B9xQr2z | Acceptance Criteria § Frontend, item 1 | Y | N |
```

Rules:

- An input may map to **more than one epic** — list all of them in the "Captured in Epic(s)" column. This is expected when a capability spans layers (e.g. a user action that needs backend + frontend work). It is **not** a gap as long as each captured location is explicit and unambiguous.
- **Explicit? N** — the input is not captured in any epic. Gap.
- **Ambiguous? Y** — the input is captured but in vague language that two engineers could reasonably implement differently. Gap.
- An input may be legitimately out of scope for this plan (e.g. MVP vs. future scope). Strike the row with `Explicit? N/A — deferred to future cycle` and a one-line rationale in the "Captured at" column. Do not hide deferred items; list them explicitly.

### 6.3: Remediate and Re-Run

For every gap:

1. Edit the relevant epic spec(s) in place — add missing acceptance criteria, tighten vague wording with specific thresholds, or (for genuinely out-of-scope items) explicitly strike the row with deferral rationale.
2. If a gap requires a capability that belongs in a **new epic**, create one — generate a fresh 7-char ID, drop it in the appropriate phase directory, and update `index.md`. Then re-run Step 4 negotiation for that one epic before continuing. Do not silently absorb new scope.
3. Re-run the table. Iterate until every row shows `Explicit? Y` and `Ambiguous? N`, or has an explicit deferral.

Do not proceed to Step 7 with unresolved gaps.

### 6.4: Keep the Final Table

The final passing table is printed as part of Step 8 summary — so the user can audit coverage, and so future `/start` and `/wrapup` sessions can see which inputs each epic is responsible for.

## Step 7: Update CLAUDE.md References

Check whether `CLAUDE.md` has a "Design & Planning Documents" section (or similar) that references the vision and ConOps files.

- **If missing:** Add a section pointing to the documents:
  ```markdown
  ## Design & Planning Documents

  - [Product Vision](docs/product-vision-planning/product-vision.md)
  - [Concept of Operations](docs/product-vision-planning/concept-of-operations.md)
  ```
- **If present:** Verify the links are correct. Update if needed.

Do NOT perform a full CLAUDE.md audit — that is `/epic-workflow:setup`'s job. Only add the document references.

## Step 8: Present Summary & Next Steps

```
## Implementation Plan Complete

### What Was Written
- `docs/implementation-plan/index.md` — [Created / Updated]
- [N] epic spec files across [M] phases
- CLAUDE.md — [Updated with document references / Already up to date]
[Brownfield only, if a changelog was consumed:] - `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md` marked processed (`.processed` suffix appended)

### By the Numbers
- Phases: [N]
- Epics: [N]
- Total acceptance criteria: [N]
- Total verification items: [N]

### Self-Check
- [N] inputs traced to epics, all Explicit=Y and Ambiguous=N (see Step 6 trace table above)
- [N] items explicitly deferred to a future cycle: [list, or "none"]

### Dependency Quick Reference
[Compact version of the dependency graph — just the critical path]

### Recommended Next Steps
1. Run `/epic-workflow:setup` to audit CLAUDE.md for all required sections
2. Run `/epic-workflow:start <id>` to begin the first epic (use the ID from the Epic column)
[Brownfield:] 1. Run `/epic-workflow:start <id>` to begin the first new epic
```

Do NOT commit — leave that for the user to decide.
