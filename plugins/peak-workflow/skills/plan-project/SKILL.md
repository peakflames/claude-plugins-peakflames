---
name: plan-project
description: |
  Derives implementation plan (phases, epics, specs) from the TOR requirements baseline
  (docs/requirements/*.feature.md). Must be run after /peak-workflow:capture-requirements.
  Operates on the same docs/{task-short-name} branch as discover and capture-requirements.
  Use after the requirements baseline is established or when the user wants to create an
  implementation plan from existing vision + requirements docs.
  Triggers on: "plan project", "create epics", "implementation plan", "derive epics",
  "break this into epics", "how should we phase this", "turn this into a plan",
  "organize work into phases", "what's the build order".
---

You are deriving a full implementation plan — phases, epics, and epic specs — from the project's
TOR requirements baseline (`docs/requirements/*.feature.md`), informed by the product vision and
concept of operations documents.

The user's request: $ARGUMENTS

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root for project context and tech stack.
2. Read `docs/product-vision-planning/product-vision.md` — if it does not exist or is a placeholder, stop and tell the user to run `/peak-workflow:discover` first.
3. Read `docs/product-vision-planning/concept-of-operations.md` — if it does not exist or is a placeholder, stop and tell the user to run `/peak-workflow:discover` first.
4. **Load TOR requirements baseline.** Glob `docs/requirements/*.feature.md`. For each file:
   - Parse every `Scenario: [TOR-NN-XXXXXXX]` block: capture the TOR ID, scenario title, feature file path, and full Given/When/Then.
   - Note the feature file number (`{NN}`) and functional area name.
   If `docs/requirements/` does not exist or contains no `.feature.md` files, stop:
   > The requirements baseline is empty. Run `/peak-workflow:capture-requirements` first to
   > derive formal TOR requirements from the vision and ConOps documents. `/plan-project`
   > derives epics from TOR IDs, not directly from ConOps scenarios.
5. **Load tracing sidecars.** Glob `docs/requirements/*.feature.tracing.json`. For each, read the vision and ConOps linkage for supplementary context when writing epic Descriptions.

## Step 2: Detect Greenfield vs Brownfield

1. Check whether any `docs/implementation-plan/phase-*/index.md` files exist and contain epic rows (data rows beyond the header that follow the `| Epic | Name | Dependencies |` schema).

**Greenfield** = no phase index files exist, or all phase index files are empty or contain only the header row. Proceed to Step 3A.

**Brownfield** = at least one phase index file exists with one or more epic rows. Proceed to Step 3B.

Report the detection result:
```
Mode: [Greenfield / Brownfield]
Existing epics: [N epics across M phases / none]
```

## Step 3A: Greenfield — Full Derivation

### 3A.1: TOR Grouping by Implementation Layer

Using the TOR IDs loaded in Step 1 (grouped by feature file and functional area), map each
TOR ID to an **implementation layer**:

| Layer | Examples |
|-------|----------|
| **Foundation** | Project scaffolding, build pipeline, dev environment, CLI entry points |
| **Data** | Database schema, data access, connection factories, background jobs |
| **Backend API** | REST endpoints, query logic, response models, business rules |
| **Frontend** | Pages, components, state management, routing |
| **Integration** | Cross-view navigation, deep linking, end-to-end flows |
| **Deployment & QA** | CI/CD, containerization, quality audits |

Not all layers apply to every project — omit layers with no TOR IDs, add domain-specific layers
as needed (e.g., "Hardware Interface" for embedded systems tools).

### 3A.2: Capability Grouping

Many TOR IDs from different feature files may share an implementation layer. Group them by layer
and identify natural clusters — TOR IDs that touch the same subsystem, file, or service. These
clusters become epics.

### 3A.3: Epic Formation

Cluster TOR IDs within each layer into session-sized epics. Each epic should:
- Cover **5–15 TOR IDs** (enough to be meaningful, not so many that a single session can't implement and test them all)
- Have a clear "done" state: every covered TOR ID has an implementation and a passing test
- Be independently implementable once its dependencies are met
- Ideally draw TOR IDs from one or two related feature files (to keep the implementation focused)

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

### 3B.1: Load the Delta

**Primary source — unprocessed discovery changelog:**
```bash
ls docs/product-vision-planning/changelogs/discovery-changelog-*.md 2>/dev/null | grep -v '\.processed$'
```

- **Exactly one unprocessed changelog:** Read it. The "New Capabilities Identified" section is
  the primary input. "Priority Signal" guides epic ordering. Remember this path for Step 5.4.
- **Two or more unprocessed changelogs:** STOP. Inform the user:
  > Found {N} unprocessed discovery changelogs: {list filenames}
  >
  > Reconcile before continuing — delete superseded ones, or merge their "New Capabilities
  > Identified" sections into a single changelog and delete the others. Then re-run
  > `/peak-workflow:plan-project`.
- **Zero unprocessed changelogs:** Check for new TOR IDs added since the last `plan-project`
  run: cross-reference all TOR IDs in `docs/requirements/*.feature.md` against all TOR IDs
  referenced in existing epic sidecar `requirements:` fields. TOR IDs not in any sidecar are
  the delta. Note in the Step 8 summary that no changelog handoff was found and TOR-delta
  analysis was used instead.

### 3B.2: Map TOR Deltas Against Existing Plan

Collect the set of TOR IDs that are not yet assigned to any epic (the "unplanned TOR IDs").
Read all existing epic specs to understand what has already been planned. For each unplanned
TOR ID:
- Does its functional area overlap an existing epic? → Consider adding to that epic if the
  session scope fits. Flag for user confirmation.
- Is it genuinely new capability in a new area? → Add to the new epic list.

### 3B.3: Form New Epics

Apply the same epic formation rules as greenfield (5–15 TOR IDs per epic, session-sized,
independently implementable). New epics are added to existing phases where they fit, or to new
phases if the work belongs to a new layer.

**Assign IDs** using the same generation command as Step 3A.3 — a fresh 7-character random alphanumeric ID per new epic, regenerated if all-digit, unique across the batch. Do not reuse existing integer IDs; do not attempt to slot new epics into the old decimal scheme (e.g., `6.7`). Existing integer-IDed epics in the index remain untouched; new epics always get alphanumeric IDs.

Proceed to Step 4.

## Step 4: Negotiate with the User

Present the full epic breakdown for approval. Do NOT write any files yet.

### Present the Plan

```
## Proposed Implementation Plan

### Phase Overview

| Phase | Name | Epics | TOR IDs Covered | Key Deliverables |
|-------|------|-------|-----------------|------------------|
| 1 | [Name] | [N] | [count] | [1-line summary] |
| ... | ... | ... | ... | ... |

### Epic Breakdown

| Phase | Epic | Name | Dependencies | TOR IDs | Feature Files |
|-------|------|------|--------------|--------:|---------------|
| 1 | a3f2K7p | [Name] | — | [N] | 01-cli.feature.md |
| 1 | B9xQr2z | [Name] | Epic a3f2K7p | [N] | 02-auth.feature.md, 03-parts.feature.md |
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

For each epic, write the spec file following the exact format below (the same format as `/peak-workflow:add`). This format is read by `/peak-workflow:start` and `/peak-workflow:wrapup`.

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

{2-4 sentences. What is being built and why. Reference the functional areas and user goals this
epic addresses, drawn from the feature files and tracing sidecars.}

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file.
> `/peak-workflow:start` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup` independently verifies each TOR's Given/When/Then is satisfied.
> If a feature file has been updated since this spec was written and a scenario no longer matches
> its cited TOR ID, stop and surface the discrepancy to the user before proceeding — do not
> silently implement against stale requirements.

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` | {Scenario title verbatim from the feature file} |
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` | {Scenario title verbatim from the feature file} |

## Key Components

{List of file paths to create or modify, with brief descriptions. Use the project's actual
directory structure. Separate into ### Backend and ### Frontend subheadings if both are involved.}
```

**Conditional lines in the header template above** — do not carry this guidance into the written spec:

- Include the **Brand** note only if the epic involves UI work. Omit it entirely otherwise.
- Include the `**Source:** Issue #{N}` line only when the epic was spawned from a specific GitHub issue — rare from `/plan-project`, more common from `/add` after `/triage`. Omit it entirely otherwise.

**Populating Requirements Anchors:**

`/plan-project` has a natural advantage — Step 3A.2/3B.2 already groups TOR IDs by
implementation cluster. For each epic, list every TOR ID assigned to it:
- Copy the TOR ID verbatim from the feature file.
- Set Feature File to the relative path from the repo root (e.g., `docs/requirements/01-cli.feature.md`).
- Copy the Scenario Title verbatim from the `Scenario: [TOR-NN-XXXXXXX] {title}` line.

If a TOR ID from the feature file cannot be assigned to any epic in the plan, that is a
coverage gap — raise it in the Step 6 self-check, do not silently omit it.

### Quality Checks Before Writing Each Spec

- [ ] Every TOR ID in the Requirements Anchors table exists in the cited feature file with an exact ID match
- [ ] Scenario titles are copied verbatim from the feature file (not paraphrased)
- [ ] Feature file paths are correct relative paths from the repo root
- [ ] Key Components reference realistic directories and follow the project's naming conventions
- [ ] The Description explains *why*, not just *what*
- [ ] Dependencies are accurate — no circular references

### 5.3: Write the Phase Indexes, Sidecars, and Stubs

**Greenfield:**

a. **Phase indexes** — for each phase, write `docs/implementation-plan/phase-{N}-{name}/index.md`:

```markdown
# Phase {N}: {Phase Name}

| Epic | Name | Dependencies |
|------|------|--------------|
| {id} | [{Epic Name}](epic-{id}-{slug}.md) | {dep1}, {dep2} |
```

   - Dependencies column: comma-separated epic IDs of direct dependencies. Use `—` when there are none.
   - One row per epic in this phase, in the order they appear in the Step 4 breakdown.
   - Epic IDs are verbatim (7-char alphanumeric for new epics).

b. **Status sidecars** — create `docs/implementation-plan/status/` and write `epic-{id}.md` for every epic:

```
status: Not Started
implemented: —
completed: —
handoff: —
requirements: TOR-{NN}-{XXXXXXX}, TOR-{NN}-{XXXXXXX}
```

The `requirements:` field lists every TOR ID covered by this epic (verbatim from the Requirements
Anchors table). This is the mechanism by which `/peak-workflow:status` derives requirements
coverage. For epics with no TOR IDs (rare — implementation-only utility epics), use `requirements: —`.

c. **README.md** — create `docs/implementation-plan/README.md` with the project lifecycle prose:

```markdown
# [Project Name] — Implementation Plan

## Quick Start for New Session

1. Run `/peak-workflow:status` for the live cross-phase dashboard (includes Requirements Coverage)
2. Run `/peak-workflow:start <id>` to begin an epic (use the 7-character alphanumeric ID from the phase index)
3. Claude Code reads the epic spec, loads TOR requirements from feature files, enters plan mode, and creates tasks (one task per TOR ID or TOR group — these are user stories)
4. When implementation is done, open a new session: `/peak-workflow:wrapup <id>`
5. If stopping early: `/peak-workflow:pause`

## Epic Lifecycle

```
Not Started → In Progress → Implemented → Complete
                  ^              ^             ^
    /peak-workflow:start  /peak-workflow:start  /peak-workflow:wrapup
          (begins)           (finishes)      (independent review)
```

Each epic's status sidecar includes a `requirements:` field listing the TOR IDs the epic covers.
`/peak-workflow:status` uses these fields to compute the Requirements Coverage dashboard.
```

d. **Stub index** — create `docs/implementation-plan/index.md` as a thin pointer:

```markdown
# Implementation Plan

This project uses the v2.5.0 layout. See:

- `README.md` — project overview and lifecycle
- `phase-*/index.md` — per-phase epic registries (epic ID, name, dependencies)
- `status/epic-<id>.md` — per-epic status sidecars (includes requirements: field)
- Run `/peak-workflow:status` for the live cross-phase dashboard (includes Requirements Coverage)
```

Skills do not read or write this stub after initial creation — it is a human-readable pointer only.

**Brownfield:** For each new epic, append a row to the relevant `docs/implementation-plan/phase-{N}-{name}/index.md` at the **bottom** of the file (use insertion order — random IDs have no meaningful sort order). Create `docs/implementation-plan/status/epic-{id}.md` for each new epic. Preserve all existing phase index rows and their sidecar files — legacy integer IDs stay exactly as they are.

### 5.4: Brownfield Changelog Archival

If Step 3B.1 consumed a changelog (the "exactly one unprocessed" path), mark it processed by appending a `.processed` suffix to the filename. This prevents the next `/plan-project` run from re-consuming it, while preserving the original discovery timestamp embedded in the filename:

```
docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md
  → docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md.processed
```

Do **not** re-timestamp the file — the original timestamp is the discovery time and carries historical meaning. The `.processed` suffix is the "consumed" marker. If Step 3B.1 fell through to delta analysis (zero unprocessed changelogs), skip this step — there is nothing to archive.

## Step 6: Self-Check — Trace TOR IDs to Epics

Before updating CLAUDE.md or presenting the summary, run an explicit post-write self-check.
The per-spec "Quality Checks" in Step 5.2 ask whether each individual spec looks reasonable on
its own. This step asks the more important cross-cutting question: **did every TOR ID from the
requirements baseline land in at least one epic, explicitly and unambiguously?**

### 6.1: Enumerate TOR IDs

Build a flat list of every TOR ID from every `docs/requirements/*.feature.md` file. One row
per TOR ID. Also include:
- **Brownfield changelog entries** (if Step 3B.1 consumed a changelog) — every new capability
  not represented as a TOR ID signals a gap in `capture-requirements`; flag it.
- **User negotiation adjustments** — any add/remove/split from Step 4. Keyed as
  `Negotiation: {short-label}`.

### 6.2: Build the Trace Table

Print the table verbatim — it is part of the Step 8 summary. Do not summarize rows away.

```
## Self-Check: TOR ID → Epic Trace

| # | TOR ID | Feature File | Captured in Epic(s) | Sidecar requirements: field | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------|--------------|---------------------|----------------------------|-----------------|-------------------|
| 1 | TOR-01-Afs657G | 01-cli.feature.md | Epic a3f2K7p | ✓ | Y | N |
| 2 | TOR-01-Bcd2345 | 01-cli.feature.md | Epic a3f2K7p | ✓ | Y | N |
| 3 | TOR-02-Xyz5678 | 02-auth.feature.md | (not captured) | — | N | — |
```

Rules:

- A TOR ID may appear in **more than one epic** — list all. This is expected when the
  requirement spans layers (e.g., backend + frontend). It is not a gap as long as each
  capturing epic has it in its Requirements Anchors table and sidecar `requirements:` field.
- **Explicit? N** — the TOR ID is not in any epic's Requirements Anchors. Gap.
- **Ambiguous? Y** — the TOR ID appears in an epic's Requirements Anchors but the scenario
  title doesn't match the feature file (copy-paste error). Gap.
- Out-of-scope items: `Explicit? N/A — deferred: {rationale}`. List explicitly; do not hide.

### 6.3: Remediate and Re-Run

For every gap:

1. Add the missing TOR ID to the relevant epic's Requirements Anchors table and to the sidecar
   `requirements:` field.
2. If the TOR ID doesn't fit any existing epic's scope, create a new epic per Step 5.2 rules,
   then re-run Step 4 negotiation for that one epic.
3. Re-run the table. Iterate until every row is `Explicit? Y` and `Ambiguous? N`, or explicit
   deferral.

Do not proceed to Step 7 with unresolved gaps.

### 6.4: Keep the Final Table

The final passing table is printed as part of Step 8 summary — so the user can audit coverage,
and so future `/start` and `/wrapup` sessions can cross-reference which TOR IDs each epic owns.

## Step 7: Update CLAUDE.md References

Check whether `CLAUDE.md` has a "Design & Planning Documents" section (or similar) that references the vision, ConOps, and requirements files.

- **If missing:** Add a section pointing to the documents:
  ```markdown
  ## Design & Planning Documents

  - [Product Vision](docs/product-vision-planning/product-vision.md)
  - [Concept of Operations](docs/product-vision-planning/concept-of-operations.md)
  - [Requirements Baseline](docs/requirements/) — TOR feature files and tracing sidecars
  ```
- **If present:** Verify the links are correct. Add the requirements link if not already present. Update any stale paths.

Do NOT perform a full CLAUDE.md audit — that is `/peak-workflow:setup`'s job. Only add or verify the document references.

## Step 8: Present Summary & Next Steps

```
## Implementation Plan Complete

### What Was Written
- [N] phase index files across [M] phases — [Created / Updated]
- [K] status sidecars written to `docs/implementation-plan/status/` (each includes requirements: field)
[Greenfield only:] - `docs/implementation-plan/README.md` — Created
[Greenfield only:] - `docs/implementation-plan/index.md` — Stub created
- [N] epic spec files across [M] phases (Requirements Anchors format)
- CLAUDE.md — [Updated with document references / Already up to date]
[Brownfield only, if a changelog was consumed:] - `docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md` marked processed (`.processed` suffix appended)

### By the Numbers
- Phases: [N]
- Epics: [N]
- TOR requirements covered: [K] of [total in baseline]
- TOR requirements deferred: [N] (see Self-Check table)

### Requirements Coverage
- [K] TOR IDs assigned to epics in this plan
- [N] TOR IDs explicitly deferred to a future cycle
- [N] TOR IDs not yet covered (if any — signals a gap; consider adding epics or deferring explicitly)

### Self-Check
[Final passing TOR ID → Epic trace table from Step 6 — every row Explicit=Y and Ambiguous=N, or explicit deferral]

### Dependency Quick Reference
[Compact version of the dependency graph — just the critical path]

### Recommended Next Steps

1. **Merge the `docs/` branch** — this is the approval gate for the requirements and plan.
   TOR feature files and epic specs must land on the base branch before `/peak-workflow:start`
   can load them. If `start` later reports "feature file not found", the merge was skipped.

   **Solo** (no team review needed):
   ```bash
   git checkout develop        # or main / master
   git merge docs/<task-name> --no-ff -m "docs(plan): merge docs/<task-name> — requirements and plan baseline"
   git branch -d docs/<task-name>
   git push
   ```
   **Team** (PR review required):
   ```bash
   git push -u origin docs/<task-name>
   gh pr create --base develop --title "docs: requirements and plan baseline for <project>"
   # Await PR approval before starting epics
   ```

2. **Run `/peak-workflow:start <id>`** to begin the first epic (use the 7-character ID from
   the Epic column above). If you have not yet run `/peak-workflow:setup`, do that first —
   setup populates the Verification & Quality Gates section that `start` and `wrapup` depend on.

3. Run `/peak-workflow:status` at any time to see the live Requirements Coverage dashboard
   (which TOR IDs are covered, which epics are in progress, and what's next).

> **On ceremony overhead:** The discover → requirements → planning sequence amortizes across
> the project's lifetime. Once the TOR baseline is established, every new request routes
> through `/triage` to determine whether it needs new TOR IDs (HEAVY), implements existing
> ones (EPIC), or is a trivial bug (TRIVIAL) — preventing both over-engineering and
> under-speccing. For a one-off script, `epic-workflow` may be a better fit.
```

**[Brownfield mode only — adapt the Recommended Next Steps before presenting:]** The three steps above (merge → start → status) apply to brownfield too. Shorten the merge instruction to "Merge the `docs/` branch to approve the delta requirements and new epics" and omit the setup note in step 2 (setup was already done).

Do NOT commit — leave that for the user to decide.
