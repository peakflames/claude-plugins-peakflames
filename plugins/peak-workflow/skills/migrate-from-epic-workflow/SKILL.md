---
name: migrate-from-epic-workflow
description: |
  One-shot migration from an epic-workflow project (v2.5.0 layout) to peak-workflow format.
  Derives a formal TOR requirements baseline from existing project artifacts (vision/ConOps +
  epic acceptance criteria), transforms Not-Started epic specs from epic-workflow format to
  peak-workflow format, updates all status sidecars with the `requirements:` field, and updates
  CLAUDE.md to reference peak-workflow commands. Non-destructive, atomic (single revertable
  commit), and idempotent — running on an already-migrated project exits cleanly.
  Run on the project's working branch (e.g., a dedicated `migrate/` branch).
  Triggers on: "migrate from epic-workflow", "migrate to peak-workflow",
  "upgrade to peak-workflow", "convert epic-workflow project",
  "migrate-from-epic-workflow".
argument-hint: "[optional notes about the project being migrated]"
---

You are performing a one-shot migration of a project from `epic-workflow` format to
`peak-workflow` format. The migration derives a formal TOR requirements baseline from existing
artifacts, transforms Not-Started epic specs, updates all status sidecars, and updates
project infrastructure files.

**Core principles:**
- **Non-destructive** — In-Progress, Paused, Implemented, and Complete epics are never touched.
- **Atomic** — all changes land in a single commit. `git revert HEAD` rolls everything back.
- **Idempotent** — running on an already-migrated project exits cleanly with no changes.

The user's notes (if any): $ARGUMENTS

---

## Step 0: Pre-flight Checks

Run each check in order. Stop immediately if any fails.

### 0.1 — Verify v2.5.0 layout

Run:
```bash
ls docs/implementation-plan/ 2>/dev/null
```

If `docs/implementation-plan/` does not exist: stop.
> This does not appear to be an epic-workflow project. `docs/implementation-plan/` is not
> present. Nothing to migrate.

If it exists, check for the status sidecar directory:
```bash
ls docs/implementation-plan/status/ 2>/dev/null | head -5
```

If `status/` is missing: stop and direct user to migrate-2.5 first:
> The implementation plan uses the pre-v2.5.0 layout (no `status/` directory). Run
> `/peak-workflow:migrate-2.5` (or `/epic-workflow:migrate-2.5`) first to upgrade to
> per-phase indexes + status sidecars, then re-run this migration.

### 0.2 — Check for legacy index.md

Run:
```bash
grep -l '| Status |' docs/implementation-plan/index.md 2>/dev/null
```

If the file contains a legacy status-table header (a line matching `| Status |`): stop.
> The implementation plan uses the pre-v2.5.0 layout (legacy `index.md` status table). Run
> `/peak-workflow:migrate-2.5` (or `/epic-workflow:migrate-2.5`) first, then re-run this
> migration.

### 0.3 — Idempotency check

Run:
```bash
ls docs/requirements/*.feature.md 2>/dev/null | head -3
```

If any `.feature.md` files are found: exit cleanly.
> `docs/requirements/` already contains feature files — this project has already been
> migrated to peak-workflow. Nothing to do.
>
> If you believe this is wrong, check whether `docs/requirements/*.feature.md` files exist
> and whether epic specs contain `## Requirements Anchors` sections.

### 0.4 — Epic inventory

Glob all status sidecars and read each to determine status:
```bash
ls docs/implementation-plan/status/epic-*.md 2>/dev/null
```

For each sidecar, read the `status:` field. Count epics by status:
- `Not Started`
- `In Progress`
- `Paused`
- `Implemented`
- `Complete`

Also find all epic specs by globbing phase indexes:
```bash
ls docs/implementation-plan/phase-*/index.md 2>/dev/null
```

Read each phase index to build the list: (phase-number, epic-id, spec-filename).

Report:
```
Epic inventory: N total
- Not Started: N (will be transformed)
- In Progress: N (left as legacy)
- Paused: N (left as legacy)
- Implemented: N (left as legacy)
- Complete: N (left as legacy)
```

If zero epics are found: stop.
> No epics found in `docs/implementation-plan/status/`. Nothing to migrate.

### 0.5 — Check for vision/ConOps

Check whether the following files exist and have substantive content
(non-skeleton = either file has more than 100 words of body content beyond its title heading):

```bash
ls docs/product-vision-planning/product-vision.md 2>/dev/null
ls docs/product-vision-planning/concept-of-operations.md 2>/dev/null
wc -w docs/product-vision-planning/product-vision.md 2>/dev/null
wc -w docs/product-vision-planning/concept-of-operations.md 2>/dev/null
```

Set flags:
- `has_vision_conops = true` if both files exist and each exceeds 100 words
- `has_vision_conops = false` otherwise (files missing, or either file is a short stub)

Note the result — it determines whether Step 2A runs.

---

## Step 1: Present Migration Scope

Present the migration preview and ask for confirmation before writing any files.

```
## Migration Preview

### Epic Inventory
- Not Started: N epics → will be transformed to Requirements Anchors format
- In Progress: N epics → left as legacy (sidecar: requirements: —)
- Paused: N epics → left as legacy (sidecar: requirements: —)
- Implemented: N epics → left as legacy (sidecar: requirements: —)
- Complete: N epics → left as legacy (sidecar: requirements: —)

### Will Create
- docs/requirements/ directory + README.md
- docs/requirements/{NN}-{name}.feature.md files (TOR requirements baseline)
- docs/requirements/{NN}-{name}.feature.tracing.json tracing sidecars

### Will Modify
- N Not-Started epic specs (replace Acceptance Criteria sections with Requirements Anchors table)
- All N status sidecars (add `requirements:` field)
- CLAUDE.md (Epic Workflow section → Peak Workflow section)
- docs/implementation-plan/README.md (update command references)

### Will Preserve Untouched
- All In-Progress, Paused, Implemented, and Complete epic specs
- All session-handoffs/
- product-vision.md, concept-of-operations.md, architecture.md, design-notes.md
- All source code
- All git history

### Derivation Strategy
[If has_vision_conops is true:]
TOR baseline derived from vision/ConOps first (PM persona), then reconciled against existing
epics oldest-to-latest (latest epic wording overrides ConOps when they conflict).

[If has_vision_conops is false:]
No substantive vision/ConOps found. TOR baseline derived directly from existing epic
acceptance criteria. All TOR IDs will be sourced from epic content only.

### Rollback
All changes land in a single commit. To roll back: `git revert HEAD`
```

Use `AskUserQuestion`:
- Question: `"Proceed with migration? This will transform Not-Started epic specs and update all sidecars. All changes land in one revertable commit."`
- Options: `["Proceed — migrate the project", "Stop — I'll review and decide later"]`

If the user chooses Stop, exit here.

---

## Step 2A: Full PM-Persona Derivation from Vision/ConOps

**Run this step only if `has_vision_conops = true` (from Step 0.5). Otherwise skip to Step 2B.**

**Adopt the following persona for the entirety of this step:**

> You are a seasoned product manager with 20+ years of experience shipping software that real
> human users depend on. You think holistically — not just about functional behavior, but about
> user emotional journey, stakeholder expectations, target audience nuance, accessibility, and
> how different user personas experience the system differently. You write requirements that
> capture not just what the system does, but the user's emotional contract with the software:
> what the user expects to feel, and what failing to meet that expectation would cost.

### 2A.1 — Functional Decomposition

Read `docs/product-vision-planning/product-vision.md` and
`docs/product-vision-planning/concept-of-operations.md`.

Group capabilities by **functional area** — these become feature files. Common areas
(adapt to the project):
- Command-line interface / invocation
- Authentication and access control
- Core domain (the primary subject matter of the product)
- Data management and persistence
- Reporting, export, and output
- Administration and configuration
- External integrations and interfaces
- Background services and jobs

For each functional area:
- Assign a sequential **2-digit zero-padded feature number** starting at `01`.
- Derive a **kebab-case short name** (e.g., `cli`, `auth`, `parts-management`).
- The feature file will be: `docs/requirements/{NN}-{short-name}.feature.md`

For each area, derive discrete "the system shall …" requirements from ConOps Section 5
(Operational Scenarios) and PV Sections 5–8 (Goals, Scope, Scenarios). Apply the PM persona:
- One ConOps scenario step often yields multiple requirements: positive path, negative path,
  edge cases, error handling, accessibility.
- Mark each derived TOR with its ConOps source reference (e.g., `S1.3`) for use in Step 2B.

This produces the **ConOps-derived TOR draft** — a working set of TOR IDs (without final
7-char suffixes yet) organized by functional area. Do not generate final TOR IDs until
Step 2B reconciliation is complete.

---

## Step 2B: Reconcile with Existing Epics (Oldest → Latest)

Build the ordered epic list using these rules:

**Ordering (oldest = earliest, latest = most recent):**
1. Complete epics — sort ascending by `completed:` date in sidecar (parse YYYY-MM-DD; if
   value is `—` or unreadable, fall back to phase/index order)
2. Implemented epics — sort ascending by `implemented:` date in sidecar
3. In-Progress epics — sort by first-commit date of the spec file (earliest first). Run for
   each In-Progress spec:
   ```bash
   git log --follow --format="%ai" docs/implementation-plan/phase-*/epic-<id>-*.md | tail -1
   ```
4. Paused epics — same as In-Progress (earliest first-commit date first)
5. Not-Started epics — order by phase number ascending, then by position within the phase
   index file

Read each epic's spec file and parse its `## Acceptance Criteria` section. If the spec has
no `## Acceptance Criteria` section (already transformed or legacy), skip it.

**Walk the list oldest-first → latest-last.** For each acceptance criterion in each spec:

1. **If has_vision_conops = true (Step 2A ran):** Match against the ConOps-derived TOR drafts:
   - **Clear match** — the draft TOR's Given/When/Then expresses the same intent as the
     criterion. Confirm the match. If the epic's wording is **more specific** than the
     ConOps-derived draft (it narrows the condition, names an exact value, adds a constraint),
     **update the draft TOR's Given/When/Then to use the epic's wording** (latest wins).
   - **Multiple candidate matches** — pick the closest match, update wording if the epic is
     more specific.
   - **No matching draft TOR** — generate a new TOR draft for this criterion. Assign it to
     the most appropriate functional area feature file. Mark its source as `epic-only`.
   - **Direct conflict** (same scenario, contradictory Given/When/Then) — the epic's wording
     wins. Replace the draft TOR's Given/When/Then with the epic's content.

2. **If has_vision_conops = false (Step 2A skipped):**
   - For each acceptance criterion, create a new TOR draft directly from the criterion.
   - Group by functional area (infer from the criterion's content or the epic's phase/title).

After processing all epics, the TOR draft set reflects:
- Original ConOps/PV intent (when vision/ConOps existed)
- Refined by latest epic content where epics were more specific
- All acceptance criteria that had no ConOps counterpart are added as new TORs

**Track the mapping:** For each finalized TOR draft, record which epic acceptance criterion
it came from (or that it's ConOps-only). This mapping is passed to the Haiku sub-agent in
Step 2E and used to build the Requirements Anchors tables in Step 3.

---

## Step 2C: Grouping Review Gate

Before writing any feature files, present the proposed structure and ask for confirmation.
Feature numbers are stable once assigned — renaming or merging files after this point
requires regenerating TOR IDs.

Present:
```
## Proposed Feature File Grouping

| # | File | Functional Area | TOR Count | Source Mix |
|---|------|-----------------|-----------|------------|
| 01 | docs/requirements/01-<name>.feature.md | <area> | ~N | K ConOps + M epics |
| 02 | docs/requirements/02-<name>.feature.md | <area> | ~N | K ConOps + M epics |
| ... | ... | ... | ... | ... |

Total: {N} feature files, {K} TOR requirements
```

("Source Mix" = TOR IDs derived from ConOps vs. those added solely from epic criteria)

Use `AskUserQuestion`:
- Question: `"Approve this feature file grouping, or tell me what to adjust (merge, split, rename, reorder)?"`
- Options: `["Approve — write the feature files", "Adjust — I'll describe the changes"]`

If the user chooses Adjust, incorporate the changes, re-present the updated grouping, and
ask again. Maximum 2 adjustment rounds — after round 2, apply the most recent changes and
proceed.

---

## Step 2D: Write Feature Files

Create the requirements directory:
```bash
mkdir -p docs/requirements/
```

For each functional area in the approved grouping, generate final TOR IDs:
```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7
```

Format: `TOR-{NN}-{XXXXXXX}` where `{NN}` is the feature file number and `{XXXXXXX}` is the
7-character random alphanumeric suffix.

**Validation rules:**
- If the 7-char string contains only digits, regenerate.
- Ensure uniqueness across all IDs generated in this run. Regenerate on collision.

Write each feature file following the template at:
`plugins/peak-workflow/skills/capture-requirements/FEATURE_TEMPLATE.md`

The file is `docs/requirements/{NN}-{short-name}.feature.md`. Reuse the template verbatim —
do not write a new template.

**As you write each file, record the final TOR ID ↔ acceptance criterion mapping** (which
epic spec, which criterion text maps to each TOR ID). This is used in Step 2E and Step 3.

---

## Step 2E: Invoke Haiku Sub-Agent for Tracing Sidecars

After all feature files are written, invoke a Haiku sub-agent using the `Agent` tool with
`model: "haiku"`. Brief it with this prompt (substitute actual paths and the TOR-to-criterion
mapping table from Step 2D):

> Read every `.feature.md` file in `docs/requirements/`. For each, produce a corresponding
> `.feature.tracing.json` sidecar following the template at
> `plugins/peak-workflow/skills/capture-requirements/TRACING_TEMPLATE.md`, with one extension:
> each requirement entry must also include a `"migration_source"` field (see format below).
>
> For each TOR ID's scenario:
> 1. Find the most specific matching section in `docs/product-vision-planning/product-vision.md`
>    and the most specific scenario step in `docs/product-vision-planning/concept-of-operations.md`.
>    Write paraphrases in your own words — do not copy source text.
> 2. Record the epic acceptance criterion that confirmed or refined this TOR (from the mapping
>    table below). If the TOR came from ConOps only (no matching epic criterion), set
>    `migration_source` to `null`.
>
> If no credible vision/ConOps trace can be found for a requirement, record it under
> `coverage_gaps` with `gap_type: "orphan_requirement"`. Also enumerate ConOps scenario steps
> and PV goals not covered by any TOR and record under `coverage_gaps` with
> `gap_type: "uncovered_source"` in the most relevant feature file's sidecar.
>
> **Extended JSON format for each requirement entry:**
> ```json
> {
>   "id": "TOR-NN-XXXXXXX",
>   "title": "Scenario title verbatim",
>   "traces_to": {
>     "vision": [{"section": "§N — heading", "paraphrase": "..."}],
>     "conops": [{"scenario": "SN", "step": N, "paraphrase": "..."}]
>   },
>   "migration_source": {
>     "epic_spec": "docs/implementation-plan/phase-N-name/epic-id-name.md",
>     "acceptance_criterion": "exact criterion text from the epic spec"
>   }
> }
> ```
>
> **TOR-to-criterion mapping:**
> {paste the complete mapping table from Step 2D here — one row per TOR ID}
>
> **Generator field:** Set `"generator"` in every sidecar to
> `"haiku-sub-agent via /peak-workflow:migrate-from-epic-workflow"` (not
> `capture-requirements`).
>
> Do NOT modify any `.feature.md` file. Do NOT commit. After processing all files, report
> one line per feature file: filename, TOR count, gap count.

Wait for the sub-agent to complete before proceeding to Step 3.

If `has_vision_conops = false`, use this simplified brief instead — omit all vision/ConOps
tracing instructions and use this reduced JSON format for each requirement entry:

```json
{
  "id": "TOR-NN-XXXXXXX",
  "title": "Scenario title verbatim",
  "migration_source": {
    "epic_spec": "docs/implementation-plan/phase-N-name/epic-id-name.md",
    "acceptance_criterion": "exact criterion text from the epic spec"
  }
}
```

In the `has_vision_conops = false` case, omit `"traces_to"` entirely (do not write empty
arrays) and omit `"coverage_gaps"` (there is no vision/ConOps source to be uncovered).
Set `"generator"` in every sidecar to `"haiku-sub-agent via /peak-workflow:migrate-from-epic-workflow"`.

---

## Step 3: Transform Not-Started Epic Specs

For each epic with `status: Not Started` in its sidecar:

1. Read the epic spec file at `docs/implementation-plan/phase-*/epic-<id>-*.md`.
2. Parse the existing sections:
   - Keep: heading (`# Epic <id>: <Name>`), header metadata (Phase, Status, Dependencies,
     Source, Brand note), `## Description` section, `## Key Components` section.
   - Remove: `## Vision & Scenario Anchors`, `## At Completion, a User Can`,
     `## Acceptance Criteria`, `## Verification`
3. Build the `## Requirements Anchors` table using the TOR ID mapping from Step 2D:
   - For each acceptance criterion from the original spec, look up the TOR ID assigned to it.
   - Populate the table with TOR ID, feature file path, and scenario title.
   - **Deduplicate:** if multiple criteria from this epic map to the same TOR ID (because they
     express the same testable behavior), include that TOR ID only once in the table.
4. Write the transformed spec:

```markdown
# Epic <id>: <Name>

**Phase:** N — Name
**Status:** Not Started
**Dependencies:** ...
[**Source:** Issue #N — if present]
[> **Brand:** ... — if present]

---

## Description

[preserved content unchanged]

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline
> for this epic. Each ID maps to a Gherkin scenario in the referenced feature file.
> `/peak-workflow:start` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
| TOR-NN-XXXXXXX | `docs/requirements/NN-name.feature.md` | Scenario title |
| TOR-NN-XXXXXXX | `docs/requirements/NN-name.feature.md` | Scenario title |

## Key Components

[preserved content unchanged]
```

**Skipped epics:** In-Progress, Paused, Implemented, Complete — leave their spec files
untouched. They remain legacy artifacts from the epic-workflow era.

---

## Step 4: Update Status Sidecars

For **every** sidecar in `docs/implementation-plan/status/epic-*.md`, append a `requirements:`
line as the fifth field:

**Not-Started epics** (transformed in Step 3): list the TOR IDs from the Requirements Anchors
table, comma-separated:
```
status: Not Started
implemented: —
completed: —
handoff: —
requirements: TOR-01-Afs657G, TOR-02-Xyz5678
```

**All other epics** (In-Progress, Paused, Implemented, Complete): set `requirements: —`
```
status: In Progress
implemented: —
completed: —
handoff: docs/implementation-plan/session-handoffs/epic-<id>-pause-*.md
requirements: —
```

Before editing each sidecar, check whether it already has a `requirements:` line:
```bash
grep -q '^requirements:' docs/implementation-plan/status/epic-<id>.md && echo "already has requirements:"
```
If the line is already present, skip that sidecar (do not append a second line).

Edit each sidecar file in place — append the `requirements:` line after the existing 4 lines.
Do not rewrite or reorder the existing fields.

---

## Step 5: Update CLAUDE.md

Read `CLAUDE.md` at the repo root.

### 5.1 — Replace the Epic Workflow section

Find the section matching `## Epic Workflow` (or equivalent — may be titled slightly
differently; look for a section containing `/epic-workflow:` command references).

Replace it entirely with a Peak Workflow section. Use this template, preserving the project's
specific paths if they differ from the defaults:

```markdown
## Peak Workflow

Requirements-driven development lifecycle — TOR Gherkin requirements are the single source of
truth for acceptance criteria and verification. Run `/peak-workflow:setup` once per project
before starting discovery.

**Full lifecycle:**
1. `/peak-workflow:setup` — Audit CLAUDE.md; stub architecture.md, design-notes.md, docs/requirements/README.md
2. `/peak-workflow:discover` — Adaptive interview → product-vision.md + concept-of-operations.md (on docs/ branch)
3. `/peak-workflow:capture-requirements` — Derive TOR requirements → .feature.md + .feature.tracing.json (on docs/ branch)
4. `/peak-workflow:plan-project` — Derive epics from TOR IDs → phase indexes + epic specs + sidecars (on docs/ branch)
5. Merge docs/ branch — requirements and plan baseline approved
6. `/peak-workflow:start <id>` — Implement epic (TOR-driven tasks + verification)
7. `/peak-workflow:wrapup <id>` — Independent TOR verification, complete, ship

**Other commands:**
- `/peak-workflow:triage <issue|description>` — Route → HEAVY / EPIC / TRIVIAL
- `/peak-workflow:add <description>` — Add epic(s) referencing existing TOR IDs
- `/peak-workflow:quick-fix <issue|description>` — Trivial fix on hotfix/ branch
- `/peak-workflow:pause` — Save progress mid-epic
- `/peak-workflow:refresh-docs` — Refresh architecture.md + design-notes.md
- `/peak-workflow:status` — Dashboard: epic progress + Requirements Coverage
- `/peak-workflow:migrate-from-epic-workflow` — One-shot migration from epic-workflow (already run)

**Requirements baseline:** `docs/requirements/` (`.feature.md` files — TOR IDs are immutable once merged)
**Implementation plan:** `docs/implementation-plan/` — run `/peak-workflow:status` for dashboard
```

### 5.2 — Replace remaining `/epic-workflow:` references

Scan all other sections of `CLAUDE.md` for remaining `/epic-workflow:*` command references.
Replace each with the equivalent `/peak-workflow:*` command. Do not change anything else.

Preserve all other CLAUDE.md content untouched.

---

## Step 6: Update Infrastructure Files

### 6.1 — Create docs/requirements/README.md

If `docs/requirements/README.md` does not exist, create it:

```markdown
# Requirements Baseline

This directory holds the formal Gherkin-style requirements (`.feature.md` files) and their
traceability sidecars (`.feature.tracing.json`), written by `/peak-workflow:capture-requirements`.

## Conventions

- Feature files are **append-only** — feature numbers are stable once assigned.
- TOR IDs (`TOR-NN-XXXXXXX`) are **immutable** once merged to develop — they are foreign keys
  referenced by epic specs, tests, and handoffs.
- Requirements changes go through a `docs/{task-short-name}` branch via
  `/peak-workflow:capture-requirements` (brownfield mode), reviewed and merged like any
  change to the requirements baseline.

## Lifecycle

1. Run `/peak-workflow:discover` to establish or update the product vision and ConOps.
2. Run `/peak-workflow:capture-requirements` to derive TOR requirements from the vision/ConOps.
3. Run `/peak-workflow:plan-project` to derive epics that implement the TOR requirements.
4. Run `/peak-workflow:start <id>` to implement each epic — tests are derived from
   TOR Given/When/Then.
5. Run `/peak-workflow:wrapup <id>` to independently verify each TOR requirement is satisfied.

## Migrated from epic-workflow

This requirements baseline was derived from the project's existing epic-workflow artifacts
(product vision, concept of operations, and epic acceptance criteria) by
`/peak-workflow:migrate-from-epic-workflow`. The `.feature.tracing.json` sidecars record
which epic acceptance criterion confirmed or refined each TOR ID.
```

### 6.2 — Update docs/implementation-plan/README.md

If `docs/implementation-plan/README.md` exists:
1. Replace every occurrence of `/epic-workflow:` with `/peak-workflow:`.
2. If it does not already reference `docs/requirements/`, add a note after the introduction:
   > **Requirements baseline:** `docs/requirements/` holds the formal TOR requirements
   > (`.feature.md` files) that epic specs reference via their `## Requirements Anchors`
   > table. Run `/peak-workflow:capture-requirements` to add or modify requirements.

If the file does not exist, skip this step.

---

## Step 7: Self-Check

Verify all of the following before committing:

- [ ] Every Not-Started epic spec has a `## Requirements Anchors` section with at least one
  TOR ID in the table
- [ ] Every TOR ID in every Requirements Anchors table exists in the cited `.feature.md` file
  (verify with grep)
- [ ] All status sidecars have a `requirements:` line (5-line format)
- [ ] CLAUDE.md contains a `## Peak Workflow` section with peak-workflow command references
- [ ] CLAUDE.md has no remaining `/epic-workflow:` command references
- [ ] `docs/requirements/` exists and contains at least one `.feature.md` file
- [ ] `docs/requirements/README.md` exists
- [ ] Every `.feature.md` has a corresponding `.feature.tracing.json` sidecar

Run targeted checks:
```bash
# TOR IDs referenced in specs exist in feature files (POSIX-compatible grep -oE, works on BSD and GNU)
grep -h 'TOR-' docs/implementation-plan/phase-*/epic-*.md | grep -oE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' | sort -u > /tmp/spec_tors.txt
grep -h 'TOR-' docs/requirements/*.feature.md | grep -oE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' | sort -u > /tmp/feat_tors.txt
comm -23 /tmp/spec_tors.txt /tmp/feat_tors.txt
# If any output: those TOR IDs are referenced in specs but missing from feature files — fix before committing
```

```bash
# Every sidecar has a requirements: line
for f in docs/implementation-plan/status/epic-*.md; do
  grep -q '^requirements:' "$f" || echo "MISSING requirements: in $f"
done
```

If any check fails, fix the issue before proceeding to Step 8.

---

## Step 8: Atomic Commit

Stage all migration changes by specific path (not `git add -A`):

```bash
git add docs/requirements/
git add docs/implementation-plan/status/
git add CLAUDE.md
```

Then stage **only the Not-Started epic specs** (not the legacy In-Progress/Implemented/Complete
specs). Use the explicit list of Not-Started epic IDs collected in Step 0.4:
```bash
git add docs/implementation-plan/phase-N-name/epic-<not-started-id>-<name>.md
# repeat for each Not-Started epic spec
```

If `docs/implementation-plan/README.md` was modified in Step 6.2:
```bash
git add docs/implementation-plan/README.md
```

Do NOT use `git add docs/implementation-plan/phase-*/epic-*.md` — that glob would
stage all epic specs including legacy ones, risking inclusion of unrelated in-flight edits.

Single commit:
- **Subject:** `chore(peak-workflow): migrate from epic-workflow to peak-workflow`
- **Body:**

```
Migrated <N> Not-Started epic specs; derived <K> TOR requirements across <M> feature files.

- Feature files written: <M>
- Tracing sidecars written: <M>
- Not-Started epic specs transformed: <N>
- Sidecars updated with requirements: field: <total>
- CLAUDE.md updated to peak-workflow commands
- Legacy epics preserved: <count> (In-Progress + Paused + Implemented + Complete)

Roll back: git revert HEAD
```

Do NOT push.

---

## Step 9: Summary & Next Steps

```
## Migration Complete

### What Was Migrated
- TOR requirements baseline: K TOR IDs across M feature files
- N Not-Started epic specs transformed to Requirements Anchors format
- All N+legacy sidecars updated with `requirements:` field
- CLAUDE.md migrated to peak-workflow commands
- docs/requirements/README.md created

### What Was Preserved (Legacy)
- N In-Progress epics — finish under epic-workflow rules; their sidecars remain `requirements: —`
- N Paused epics — same as In-Progress
- N Implemented/Complete epics — historical record, untouched

### TOR Derivation Source
[If has_vision_conops was true:]
- Primary: vision/ConOps (PM-persona derivation, full ConOps scenario coverage)
- Supplemented by: existing epic acceptance criteria (latest epic wording overrides ConOps)

[If has_vision_conops was false:]
- Derived solely from existing epic acceptance criteria (no substantive vision/ConOps found)
- Recommendation: run `/peak-workflow:discover` to establish a proper vision/ConOps baseline,
  then `/peak-workflow:capture-requirements` (brownfield) to refine the TOR requirements

### Next Steps
1. Review `docs/requirements/*.feature.md` — these are now the formal requirements baseline
2. Run `/peak-workflow:setup` to confirm CLAUDE.md aligns with peak-workflow expectations
3. Run `/peak-workflow:status` — should show the Requirements Coverage panel
4. For new work: use the full peak-workflow cycle
   (`/peak-workflow:triage` → discover → capture-requirements → plan-project → start)
5. For in-progress work: finish under epic-workflow rules on the current branch;
   the `requirements: —` sidecar marks it as legacy
6. To roll back: `git revert HEAD`
```
