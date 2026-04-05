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

Assign epic numbers: whole numbers (1, 2, 3...) for the primary sequence. Reserve decimal numbers (6.5, 6.6) for epics that are added later to an existing phase.

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

Check for `.discovery-changelog.md` at the repo root (written by `/epic-workflow:discover` in brownfield mode).

**If it exists:** Read it. The "New Capabilities Identified" section is your primary input. The "Priority Signal" section guides epic ordering.

**If it does not exist:** Fall back to full-document delta analysis:
1. Read the current product-vision.md and concept-of-operations.md.
2. Use `git diff` or `git log` to identify what changed in these files since the last implementation plan update.
3. Extract new or modified capabilities from the changed sections.

### 3B.2: Map Against Existing Plan

Read all existing epic specs (glob `docs/implementation-plan/phase-*/epic-*.md`). For each new capability from the changelog:
- Does an existing epic already cover it? → Skip (note as "already covered by Epic N").
- Does it extend an existing epic's scope? → Flag for discussion with the user (modifying completed epics is risky).
- Is it genuinely new? → Add to the new epic list.

### 3B.3: Form New Epics

Apply the same epic formation rules as greenfield (5–15 acceptance criteria, session-sized, independently implementable). New epics are added to existing phases where they fit, or to new phases if the work doesn't belong anywhere.

Use decimal numbering (e.g., 6.7, 6.8) when inserting into an existing phase. Use the next whole number when starting a new phase.

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
| 1 | 1 | [Name] | — | [N] | ConOps S1.3, S5.1 |
| 1 | 2 | [Name] | Epic 1 | [N] | ConOps S6.1, PV 10 |
| ... | ... | ... | ... | ... | ... |

### Dependency Graph

[ASCII tree showing dependencies — same format as existing index.md]

### Parallelization Opportunities

[List epics that can be worked on in parallel because they share no dependencies]

### Estimated Scope

- Total epics: [N]
- Total acceptance criteria: [N]
- Recommended session order: [list epic numbers in order]
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

**File:** `docs/implementation-plan/phase-{N}-{name}/epic-{number}-{kebab-case-name}.md`

```markdown
# Epic {number}: {Name}

**Phase:** {N} — {Phase Name}
**Status:** Not Started
**Dependencies:** Epic {N} ({short description}), Epic {M} ({short description})

> **Brand:** Use the project's brand guidelines skill for {relevant UI elements} if one is configured.

(Include the Brand note only if the epic involves UI work.)

---

## Description

{2-4 sentences. What is being built and why.}

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

### Quality Checks Before Writing Each Spec

- [ ] Every acceptance criterion is specific enough to verify without ambiguity
- [ ] Every acceptance criterion has a traceability note (ConOps scenario step or PV scope item)
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
2. Run `/epic-workflow:start N` (where N is the epic number)
3. Claude Code will read the spec, load context, enter plan mode, and create tasks
4. When implementation is done, open a new session: `/epic-workflow:wrapup N`
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
- Add new epic rows to the status table in the correct position
- Update the dependency graph to include new epics
- Preserve all existing epic rows and their statuses

### 5.4: Brownfield Changelog Archival

If `.discovery-changelog.md` exists, rename it to prevent re-processing:

```
.discovery-changelog.md → .discovery-changelog-{YYYY-MM-DD}.md
```

This archived file serves as a historical record of the discovery session.

## Step 6: Update CLAUDE.md References

Check whether `CLAUDE.md` has a "Design & Planning Documents" section (or similar) that references the vision and ConOps files.

- **If missing:** Add a section pointing to the documents:
  ```markdown
  ## Design & Planning Documents

  - [Product Vision](docs/product-vision-planning/product-vision.md)
  - [Concept of Operations](docs/product-vision-planning/concept-of-operations.md)
  ```
- **If present:** Verify the links are correct. Update if needed.

Do NOT perform a full CLAUDE.md audit — that is `/epic-workflow:setup`'s job. Only add the document references.

## Step 7: Present Summary & Next Steps

```
## Implementation Plan Complete

### What Was Written
- `docs/implementation-plan/index.md` — [Created / Updated]
- [N] epic spec files across [M] phases
- CLAUDE.md — [Updated with document references / Already up to date]
[Brownfield only:] - `.discovery-changelog.md` archived to `.discovery-changelog-{date}.md`

### By the Numbers
- Phases: [N]
- Epics: [N]
- Total acceptance criteria: [N]
- Total verification items: [N]

### Dependency Quick Reference
[Compact version of the dependency graph — just the critical path]

### Recommended Next Steps
1. Run `/epic-workflow:setup` to audit CLAUDE.md for all required sections
2. Run `/epic-workflow:start 1` to begin the first epic
[Brownfield:] 1. Run `/epic-workflow:start {N}` to begin the first new epic
```

Do NOT commit — leave that for the user to decide.
