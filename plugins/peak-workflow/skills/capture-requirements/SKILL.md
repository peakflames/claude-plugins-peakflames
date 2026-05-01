---
name: capture-requirements
description: |
  Derives formal Gherkin-style TOR requirements (.feature.md files) from product-vision.md and
  concept-of-operations.md. Main agent adopts a seasoned-PM persona to author feature files
  autonomously; Haiku sub-agent verifies traceability and writes .feature.tracing.json sidecars.
  User reviews via the docs/ branch and merge — there is no inline interview.
  Run after /peak-workflow:discover and before /peak-workflow:plan-project.
  Triggers on: "capture requirements", "derive requirements", "write feature files",
  "create TOR requirements", "formalize requirements", "establish requirements baseline",
  "generate TOR IDs", "requirements capture".
argument-hint: "[brownfield-description | blank for auto-derivation from vision + ConOps]"
---

You are deriving a formal requirements baseline from the project's product vision and concept of
operations documents, producing Gherkin-style `.feature.md` files with `TOR-NN-XXXXXXX`
requirement IDs. This skill operates **fully autonomously** — no interview or inline user
interaction occurs during derivation. The user reviews the output via the `docs/` branch and
the merge event is the approval gate.

The user's request / brownfield description: $ARGUMENTS

---

## Step 0: Branch Guard

**Before any other action:**

1. Run `git branch --show-current`. Capture the result as `<current-branch>`.
2. If `<current-branch>` is `develop`, `main`, or `master` — stop immediately:

   > `capture-requirements` modifies the requirements baseline (feature files, tracing sidecars).
   > These changes must travel through a `docs/{task-short-name}` branch so the merge event
   > serves as the approval gate. Run `/peak-workflow:discover` first — it will create the
   > `docs/` branch and chain into here. Or create the branch manually:
   > ```bash
   > git checkout -b docs/{task-short-name}
   > ```

3. If `<current-branch>` does **not** start with `docs/` (and is not develop/main/master) —
   warn the user but allow continuation:
   > Current branch (`<current-branch>`) is not a `docs/` branch. Proceeding will mix
   > requirements changes with other work on this branch.

   Use `AskUserQuestion`:
   - Question: `"Current branch is not a docs/ branch. Continue anyway, or stop to create one?"`
   - Options: `["Continue on this branch", "Stop — I'll create a docs/ branch first"]`

   If the user chooses Stop, end here.

4. If `<current-branch>` starts with `docs/` — continue. No action needed.

---

## Step 1: Load Context

1. Read `CLAUDE.md` at the repo root. Capture: project name, tech stack, any custom
   `docs/requirements/` path override (default is `docs/requirements/`). Do not re-read if
   already in context.
2. Read `docs/product-vision-planning/product-vision.md`. If missing or skeleton (no
   substantive `## 2. Problem Statement` content), stop:
   > Run `/peak-workflow:discover` first to produce the product vision document.
3. Read `docs/product-vision-planning/concept-of-operations.md`. If missing or skeleton, stop
   with the same message.
4. Glob `docs/requirements/*.feature.md`. For each file found, capture:
   - The feature number `{NN}` from the filename prefix (e.g., `01` from `01-cli.feature.md`)
   - All existing TOR IDs (parse every `Scenario: [TOR-NN-XXXXXXX]` line)
   - The highest existing feature number (to determine the next available `{NN}`)
5. Glob `docs/requirements/*.feature.tracing.json`. Note which feature files already have
   tracing sidecars.

Report the detected state:
```
Requirements baseline state:
- Existing feature files: [N]
- Highest feature number: [NN] (next available: [NN+1])
- Existing TOR IDs: [count]
- Tracing sidecars present: [count]
```

---

## Step 2: Detect Greenfield vs Brownfield

**Greenfield** = zero existing `.feature.md` files. Proceed to Step 3A.

**Brownfield** = at least one `.feature.md` exists. Proceed to Step 3B.

Look for an unprocessed discovery changelog:
```bash
ls docs/product-vision-planning/changelogs/discovery-changelog-*.md 2>/dev/null | grep -v '\.processed$'
```

Report detection:
```
Mode: [Greenfield / Brownfield]
Unprocessed discovery changelog: [filename or "none found"]
```

---

## Step 3A: Greenfield — Full Derivation

**Adopt the following persona for the entirety of this step:**

> You are a seasoned product manager with 20+ years of experience shipping software that real
> human users depend on. You think holistically — not just about functional behavior, but about
> user emotional journey, stakeholder expectations, target audience nuance, accessibility, and
> how different user personas experience the system differently. You write requirements that
> capture not just what the system does, but the user's emotional contract with the software:
> what the user expects to feel, and what failing to meet that expectation would cost.

### 3A.1: Functional Decomposition

Read all of ConOps Section 5 (Operational Scenarios) and Section 7 (Functional Summary). Read
all of Product Vision Sections 5–8 (Goals, Scope, Scenarios). Group capabilities by
**functional area** — these become feature files. Common areas (adapt to the project):

- Command-line interface / invocation
- Authentication and access control
- Core domain (the primary subject matter of the product)
- Data management and persistence
- Reporting, export, and output
- Administration and configuration
- External integrations and interfaces
- Background services and jobs

For each functional area:
- Assign a sequential **2-digit zero-padded feature number** starting at `01`, incrementing by 1.
- Numbers are **stable and append-only** — once assigned, a feature number never changes.
- Derive a **kebab-case short name** for the area (e.g., `cli`, `auth`, `parts-management`).
- The feature file will be: `docs/requirements/{NN}-{short-name}.feature.md`

### 3A.1b: Grouping Review Gate

Before writing any files, present the proposed feature file structure and ask for confirmation.
This is the only opportunity to adjust grouping — once files are written and TOR IDs are
generated, renaming or merging files requires re-generating IDs.

Present:
```
## Proposed Feature File Grouping

| # | File | Functional Area | Estimated Requirements |
|---|------|-----------------|------------------------|
| 01 | docs/requirements/01-<name>.feature.md | <area> | ~N |
| 02 | docs/requirements/02-<name>.feature.md | <area> | ~N |
| ... | ... | ... | ... |

Total: {N} feature files
```

Use `AskUserQuestion`:
- Question: `"Approve this feature file grouping, or tell me what to adjust (merge, split, rename, reorder)?"`
- Options: `["Approve — write the feature files", "Adjust — I'll describe the changes"]`

If the user chooses Adjust, incorporate their changes, re-present the updated grouping, and ask
again. Maximum 2 adjustment rounds — if still adjusting after round 2, apply the most recent
changes and proceed.

### 3A.2: Requirement Derivation

For each functional area, derive discrete "the system shall …" requirements. Each requirement
must be:

- **Independently verifiable** — one Given/When/Then per requirement, testable in isolation.
- **Observable from the outside** — black-box, testable without reading source code.
- **Traceable** — maps to at least one of: a ConOps scenario step, a PV section/goal, or a
  legitimate implicit user expectation surfaced by the PM persona.

One ConOps scenario step often yields **multiple requirements**:
- The positive/happy path
- The negative path (invalid input, unauthorized access, unavailable resource)
- Edge cases (boundary values, empty states, maximum limits)
- Error handling and user feedback (what the system communicates when things go wrong)
- Accessibility and usability expectations (where applicable)

### 3A.3: TOR ID Generation

For each requirement, generate a TOR ID using:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7
```

Format: `TOR-{NN}-{XXXXXXX}` where `{NN}` is the feature number and `{XXXXXXX}` is the
7-character random alphanumeric suffix.

**Validation rules:**
- If the 7-char string contains only digits, regenerate.
- Ensure uniqueness across all IDs generated in this run AND all existing TOR IDs collected
  in Step 1 item 4. Regenerate on collision.

Example valid IDs: `TOR-01-Afs657G`, `TOR-02-Xyz5678`, `TOR-01-Bcd2345`

### 3A.4: Write Feature Files

For each functional area, write `docs/requirements/{NN}-{short-name}.feature.md` following
the template at `plugins/peak-workflow/skills/capture-requirements/FEATURE_TEMPLATE.md`.

Create the directory if it does not exist: `mkdir -p docs/requirements/`

### 3A.5: Invoke Haiku Sub-Agent for Traceability

After all feature files are written, invoke a Haiku sub-agent using the `Agent` tool with
`model: "haiku"`. Brief it with exactly this prompt (substitute actual file paths):

> Read every `.feature.md` file in `docs/requirements/`. For each, produce a corresponding
> `.feature.tracing.json` sidecar following the template at
> `plugins/peak-workflow/skills/capture-requirements/TRACING_TEMPLATE.md`. For each TOR ID's
> scenario, find the most specific matching section in
> `docs/product-vision-planning/product-vision.md` and the most specific scenario step in
> `docs/product-vision-planning/concept-of-operations.md`. Write paraphrases in your own words
> — do not copy source text. If no credible trace can be found for a requirement, record it
> under `coverage_gaps` with `gap_type: "orphan_requirement"`. Also enumerate ConOps scenario
> steps and PV goals not covered by any TOR ID and record those under `coverage_gaps` with
> `gap_type: "uncovered_source"` in the most relevant feature file's sidecar. Do NOT modify
> any `.feature.md` file. Do NOT commit. After processing all files, report one line per
> feature file: filename, TOR count, gap count.

Wait for the sub-agent to complete before proceeding to Step 4.

---

## Step 3B: Brownfield — Delta Derivation

Adopt the same seasoned-PM persona as 3A. Differences from greenfield:

### 3B.1: Source the Deltas

1. **Exactly one unprocessed changelog found:** Read it. The "New Capabilities Identified"
   section is your primary input. The "Priority Signal" section guides requirement priority.
   Record the changelog path for archival in Step 6.

2. **Two or more unprocessed changelogs found:** STOP. Do not attempt to merge silently. Inform
   the user:
   > Found {N} unprocessed discovery changelogs:
   > {list filenames}
   >
   > Please reconcile — delete superseded ones or merge their "New Capabilities" sections into a
   > single file, then re-run.

3. **Zero unprocessed changelogs and `$ARGUMENTS` is non-empty:** Treat `$ARGUMENTS` as the
   change description (the brownfield delta).

4. **Zero unprocessed changelogs and `$ARGUMENTS` is empty:** Fall back to git-diff analysis
   on the vision/ConOps docs since the last commit touching `docs/requirements/`:
   ```bash
   git log --oneline -1 -- docs/requirements/ 2>/dev/null
   git diff HEAD -- docs/product-vision-planning/
   ```
   Extract changed or added sections as the delta.

### 3B.2: Map Against Existing Requirements

Read all existing `.feature.md` files. For each new capability from the delta:
- **Already covered by an existing TOR?** → Skip. Note: "already covered by `TOR-NN-XXXXXXX`".
- **Extends an existing TOR's scope?** → Flag. This is a potential requirements change, which
  is a change-control event. Surface to user:
  > The following existing TOR may need to be modified: `TOR-NN-XXXXXXX` in
  > `docs/requirements/{file}`. Modifying a merged requirement is a change-control event.
  > Options: (1) Add a new TOR alongside the existing one, (2) Modify the existing TOR's
  > scenario (requires stakeholder review), (3) Defer.
  Use `AskUserQuestion` with these options. Wait for answer before proceeding.
- **Genuinely new?** → Add as a new TOR requirement per 3A.2 rules.

### 3B.3: Assign IDs for New Requirements

- New requirements added to an **existing feature file**: keep that file's `{NN}`, generate
  fresh 7-char suffixes per 3A.3 rules.
- New **functional area** with no existing file: assign `{NN}` = (highest existing feature
  number + 1), create a new `.feature.md` file.
- Append new `Scenario:` blocks at the **bottom** of the relevant feature file, after a
  horizontal rule separator (`---`). Never reorder or modify existing scenarios.

### 3B.3b: Brownfield Grouping Review Gate

Before writing any files, show the planned changes and ask for confirmation. Feature numbers
are stable once assigned and TOR IDs are immutable once merged — a wrong grouping decision
is expensive to reverse.

Present:
```
## Planned Requirements Changes

[For each existing file being extended:]
- Append {N} new TOR IDs to `docs/requirements/{NN}-{name}.feature.md`

[For each new file being created:]
- Create `docs/requirements/{NN}-{name}.feature.md` with {N} new TOR IDs
```

Use `AskUserQuestion`:
- Question: `"Approve this requirements grouping, or tell me what to adjust?"`
- Options: `["Approve — write the requirements", "Adjust — I'll describe the change"]`

If the user chooses Adjust, incorporate the change, re-present once, and proceed.
One adjustment round maximum.

### 3B.4: Invoke Haiku Sub-Agent

Same as 3A.5, but instruct it to **update only the affected `.feature.tracing.json` files**,
adding new TOR entries at the bottom of the `requirements` array and preserving all existing
entries unchanged.

---

## Step 4: Self-Check — Trace Inputs to Outputs

Build an explicit trace table. Print it verbatim — it is part of the Step 7 summary, not
internal scratch.

```
## Self-Check: Input → TOR Trace

| # | Input (source:reference) | Captured as TOR ID(s) | Feature file | Explicit? (Y/N) | Ambiguous? (Y/N) |
|---|--------------------------|------------------------|--------------|-----------------|-------------------|
| 1 | ConOps S1.3: "map loads ~3,000 suppliers as clustered pins" | TOR-03-Afs657G, TOR-03-Bcd2345 | 03-supplier-map.feature.md | Y | N |
| 2 | PV §6: "supports offline mode" | (not captured) | — | N | Y |
| 3 | ConOps S2.1: "user enters invalid credentials" | TOR-02-Xyz5678 | 02-auth.feature.md | Y | N |
```

**Input sources to enumerate (be granular — one ConOps step that says "X and Y" is two rows):**
- Every numbered step in every ConOps Section 5 scenario
- Every MVP goal, in-scope feature, and success criterion from PV Sections 5–6
- Every item under "New Capabilities Identified" in the brownfield changelog (if consumed)
- User-stated priorities from `$ARGUMENTS` (if non-empty)

**Rules:**
- An input may map to multiple TOR IDs — list all.
- `Explicit? N` → gap. `Ambiguous? Y` → gap.
- Out-of-scope items: mark `N/A — deferred: {rationale}` in the Ambiguous column.
- For every gap: edit the feature file in place to add or tighten the requirement, then re-run
  the affected row. Do not present the summary with unresolved gaps (only explicit deferrals are
  acceptable).

---

## Step 5: Quality Checks

Before presenting the summary, verify:

- [ ] Every TOR ID follows the format `TOR-{NN}-{XXXXXXX}` where `{NN}` matches the feature
  file's numeric prefix.
- [ ] Every `{XXXXXXX}` suffix is 7 alphanumeric characters, not all-digit.
- [ ] No TOR ID collisions across all feature files and all pre-existing IDs.
- [ ] Every `Scenario:` has at least one `Given`, one `When`, and one `Then` line.
- [ ] Every `Feature:` has the `As a … / I want … / So that …` triad.
- [ ] Every `.feature.tracing.json` sidecar exists for every `.feature.md` file.
- [ ] No `coverage_gaps` with `gap_type: "orphan_requirement"` remain unaddressed.
  (Orphan requirements must either gain a source trace or be removed.)

---

## Step 6: Archive Changelog (Brownfield Only)

If Step 3B.1 consumed an unprocessed changelog, archive it by renaming:
```
docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md
  → docs/product-vision-planning/changelogs/discovery-changelog-{TIMESTAMP}.md.processed
```
Preserve the original timestamp. The `.processed` suffix prevents re-consumption on the next
`capture-requirements` or `plan-project` run.

---

## Step 7: Present Summary

```
## Capture Requirements — Complete

### Documents Written
[For each feature file:]
- `docs/requirements/{NN}-{name}.feature.md` — {N} TOR requirements
- `docs/requirements/{NN}-{name}.feature.tracing.json` — traceability sidecar
[Brownfield only:]
- Discovery changelog archived: {filename}.processed

### By the Numbers
- Functional areas (feature files): {N}
- Total TOR requirements: {K}
- ConOps scenario steps covered: {X} of {Y}
- Product Vision goals/scope items covered: {A} of {B}
- Tracing gaps resolved: {M}

### Coverage Gaps (explicitly deferred)
[List any out-of-scope deferrals with rationale, or "None"]

### Self-Check (final passing table)
[Paste the full trace table from Step 4 here — every row must show Explicit=Y and Ambiguous=N,
or have an explicit N/A deferral]

### Next Step
Run `/peak-workflow:plan-project` to derive the implementation plan from these requirements.
Epic specs will reference TOR IDs as their Requirements Anchors — the TOR Given/When/Then
becomes the acceptance criterion and verification procedure.
```

**Do NOT commit.** The full planning sequence (`discover` → `capture-requirements` →
`plan-project` → optional `add`) runs on the `docs/` branch before the user merges. The merge
(solo or team PR) is the approval gate for the entire requirements and plan as a unit.
