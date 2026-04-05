# Epic Workflow

## Skills

| Command | Purpose | Status Transition |
|---|---|---|
| `/epic-workflow:discover` | Adaptive interview that produces product-vision.md + concept-of-operations.md | — (writes planning docs) |
| `/epic-workflow:plan-project` | Derive implementation plan (phases, epics, specs) from vision + ConOps docs | Creates all epics as "Not Started" |
| `/epic-workflow:setup` | Audit `CLAUDE.md` for required sections, stub `architecture.md` and `design-notes.md` | — |
| `/epic-workflow:add <description>` | Add new epic(s) from natural language — writes spec(s), updates index | Creates as "Not Started" |
| `/epic-workflow:start N` | Implement epic N — loads spec, plans, implements, verifies | Not Started → In Progress → **Implemented** (sets date) |
| `/epic-workflow:wrapup N` | Independent review — verifies implementation, closes out, orients to next | Implemented → **Complete** (sets date) |
| `/epic-workflow:pause` | Stop mid-epic, save progress | In Progress → **Paused** |
| `/epic-workflow:status` | Read-only project dashboard — progress, active work, stale epics, next actions | — (read-only) |
| `/epic-workflow:refresh-docs` | Refresh architecture and design docs to match the as-built codebase | — (updates docs, not epic status) |

## Epic Lifecycle

```
[Idea] → [Vision & ConOps] → [Implementation Plan] → Not Started → In Progress → Implemented → Complete
            ^                      ^                        ^              ^             ^
  /epic-workflow:discover  /epic-workflow:plan-project  /epic-workflow:start  /epic-workflow:start  /epic-workflow:wrapup
       (interviews)          (derives epics)              (begins)            (finishes)       (independent review)

                              /epic-workflow:status — read-only dashboard at any point
```

The status table in `index.md` has two date columns:
- **Implemented** — set by `/epic-workflow:start` when implementation + self-verification is done
- **Completed** — set by `/epic-workflow:wrapup` when independent review passes

An epic with an Implemented date but no Completed date is waiting for independent review.

## Starting a Brand New Project (Greenfield)

Use this path when there is no existing product vision, no implementation plan, and no code yet. The goal is to go from an idea to a fully planned set of epics.

```
/epic-workflow:discover → /epic-workflow:plan-project → /epic-workflow:setup → /epic-workflow:start 1
```

### Step 1: Discovery — `/epic-workflow:discover`

Run `/epic-workflow:discover` with a description of what you want to build. Claude conducts an adaptive interview in 4 phases:

1. **Identity & Problem** — product name, problem statement, target users, vision statement
2. **Goals, Scope & Boundaries** — MVP goals, feature scope, out-of-scope items
3. **Scenarios** — detailed operational scenarios with step-by-step user interactions (this is the heart)
4. **Constraints, Data & Future** — design direction, data strategy, backlog, glossary

Claude drafts content for you to react to (confirm, refine, reject) — not open-ended questions. Each phase is gated by your approval before moving on.

**Output:**
- `docs/product-vision-planning/product-vision.md` (11 sections)
- `docs/product-vision-planning/concept-of-operations.md` (9 sections with detailed scenarios)

### Step 2: Planning — `/epic-workflow:plan-project`

Run `/epic-workflow:plan-project`. Claude reads the vision and ConOps documents and derives the implementation plan:

1. **Scenario decomposition** — extracts capabilities from every ConOps scenario step
2. **Capability grouping** — deduplicates and groups by implementation layer
3. **Epic formation** — clusters capabilities into session-sized epics (5-15 acceptance criteria each)
4. **Negotiation** — presents the full plan (phases, epics, dependency graph) for your approval before writing any files

**Output:**
- `docs/implementation-plan/index.md` (status table + dependency graph)
- Epic spec files in `docs/implementation-plan/phase-N-*/`

### Step 3: Setup — `/epic-workflow:setup`

Run `/epic-workflow:setup` to audit `CLAUDE.md` for required sections (tech stack, quality gates, reminders, etc.) and stub `architecture.md` + `design-notes.md`.

### Step 4: Build — `/epic-workflow:start 1`

Begin implementing. One epic per session, following the epic lifecycle described below.

## Evolving an Existing Project (Brownfield)

Use this path when the project already has a product vision, implementation plan, and completed epics. The goal is to add new features or shift direction without starting from scratch.

```
/epic-workflow:discover → /epic-workflow:plan-project → /epic-workflow:start N
```

### Step 1: Discovery — `/epic-workflow:discover`

Run `/epic-workflow:discover` with a description of what's changing. Claude detects brownfield mode automatically (it checks for an existing `product-vision.md` with substantive content and completed epics).

In brownfield mode, Claude:
- Reads the existing vision and ConOps documents as the starting point
- Only interviews you about what's new or changed — skips sections that don't need updates
- Shows current content alongside proposed changes so you can see exactly what's different
- Updates the documents in place (increments version, updates date)

**Output:**
- Updated `docs/product-vision-planning/product-vision.md`
- Updated `docs/product-vision-planning/concept-of-operations.md`
- `.discovery-changelog.md` at the repo root (the handoff to planning)

### Step 2: Planning — `/epic-workflow:plan-project`

Run `/epic-workflow:plan-project`. Claude detects brownfield mode and reads the discovery changelog as its primary input.

In brownfield mode, Claude:
- Maps new capabilities against existing epics to avoid duplication
- Flags cases where a new capability extends a completed epic's scope (risky — discussed with you)
- Forms new epics and adds them to the existing plan using decimal numbering (e.g., 6.7, 6.8)
- Preserves all existing epic rows and statuses in the index
- Archives the changelog to `.discovery-changelog-{date}.md` to prevent re-processing

**Output:**
- Updated `docs/implementation-plan/index.md` (new rows added)
- New epic spec files in existing or new phase directories

### Step 3: Build — `/epic-workflow:start N`

Begin implementing the first new epic. `/epic-workflow:setup` is typically not needed again since it was already run during the initial project setup.

### Discovery Changelog Handoff

The `.discovery-changelog.md` file is the explicit handoff between discover and plan-project in brownfield mode. It captures:
- What changed in the vision/ConOps documents
- New capabilities identified
- Priority signals from the user (what's most important, what's deferred)

After `/epic-workflow:plan-project` processes the changelog, it archives the file to `.discovery-changelog-{date}.md`. If no changelog exists (e.g., you edited the vision docs manually instead of running `/epic-workflow:discover`), `/epic-workflow:plan-project` falls back to full-document delta analysis using git history.

### When to Use Each Approach

| Situation | Command |
|-----------|---------|
| Adding a single well-defined epic | `/epic-workflow:add` — fastest path, no discovery needed |
| Adding several related features within the existing vision | `/epic-workflow:plan-project` — reads existing docs, derives new epics |
| Shifting product direction, adding new user groups, or rethinking scope | `/epic-workflow:discover` first, then `/epic-workflow:plan-project` |

## Documentation Currency Loop

The epic workflow maintains architecture and design documentation through a closed loop:

```
/epic-workflow:setup
    → stubs docs/architecture.md + docs/design-notes.md from CLAUDE.md

/epic-workflow:start N
    → reads architecture.md + design-notes.md as context
    → writes session-handoffs/epic-N-implemented.md (Key Files, Key Decisions)

/epic-workflow:wrapup N
    → reads architecture.md to verify consistency
    → writes session-handoffs/epic-N-complete.md
    → Phase 3 (Orient) checks whether docs need a refresh

/epic-workflow:refresh-docs
    → reads all complete handoffs (Key Files + Key Decisions)
    → reads actual source files to verify doc claims
    → shows gap analysis, rewrites docs to as-built state
```

**Handoffs are the staging buffer for documentation.** Design decisions accumulate in handoff files as epics complete. `/epic-workflow:refresh-docs` drains that buffer into the permanent docs on demand — after a phase, before a release, or whenever the drift becomes meaningful.

## Workflow

```
0. Bootstrap the project (once, before any epics exist):
   /epic-workflow:discover
   → Adaptive interview produces product-vision.md and concept-of-operations.md
   /epic-workflow:plan-project
   → Derives implementation plan with phases, epics, and specs from the vision + ConOps

1. First-time setup (once per project):
   /epic-workflow:setup
   → Audits CLAUDE.md for required sections, fixes gaps interactively
   → Creates docs/architecture.md and docs/design-notes.md as planning stubs

2. Open a new Claude Code session in the repo root:
   /epic-workflow:start N
   → Claude reads the epic spec, architecture docs, and any prior handoffs
   → Claude enters plan mode and proposes an implementation plan
   → You approve (or adjust) the plan
   → Claude creates tasks and begins working
   → After implementation, Claude satisfies the Verification section as additional work
   → Claude runs CLAUDE.md quality gates and reports results
   → Status moves to "Implemented" with today's date

3. When implementation is done, open a NEW session:
   /epic-workflow:wrapup N
   → Phase 1 (Verify): Acts as independent reviewer, re-reads spec, verifies all criteria, produces report
   → Phase 2 (Complete): If PASS — writes handoff file, marks epic "Complete" with today's date
   → Phase 3 (Orient): Reads dependency graph, presents unblocked epics and recommended next action
   → Phase 3 also checks if architecture/design docs need a refresh
   → If FAIL: lists gaps for the implementer to fix (does not proceed to Phase 2 or 3)

4. If stopping early:
   /epic-workflow:pause

5. Check project status at any time:
   /epic-workflow:status
   → Read-only dashboard: progress, active work, stale paused epics, next actions

6. After completing a phase or before a release:
   /epic-workflow:refresh-docs
   → Reads all handoffs, reads source files, shows gap analysis
   → Rewrites architecture.md and design-notes.md to as-built state
```

## What Happens Automatically

- **`/epic-workflow:setup`** reads `CLAUDE.md`, checks for required sections (Tech Stack, Epic Workflow, Quality Gates, Reminders, References), interactively fills any gaps, and creates documentation stubs if they don't exist
- **`/epic-workflow:start`** checks dependencies are met (prerequisite epics must be "Implemented" or "Complete"), reads prior session handoffs, sets status to "In Progress", implements all acceptance criteria, satisfies the Verification section, runs CLAUDE.md quality gates, then sets status to "Implemented" with today's date
- **`/epic-workflow:wrapup`** verifies the epic is in "Implemented" status, then runs three phases: (1) **Verify** — independently inspects code, runs checks, produces a structured verification report; (2) **Complete** — if the verdict passes, writes the handoff file and marks the epic "Complete" with today's date; (3) **Orient** — reads the dependency graph and presents which epics are now unblocked, parallelization opportunities, recommended next action, and whether the documentation needs a refresh
- **`/epic-workflow:pause`** snapshots progress, writes resume instructions to `session-handoffs/`, updates `index.md` to "Paused"
- **`/epic-workflow:status`** reads the implementation plan index, computes progress statistics, flags stale paused epics (>7 days), identifies unblocked ready-to-start epics from the dependency graph, and suggests the next action — strictly read-only, modifies no files
- **`/epic-workflow:refresh-docs`** aggregates Key Files and Key Decisions from all complete handoffs, reads the actual source files, produces a gap analysis table comparing doc claims against reality, and rewrites both documents after user confirmation

## Key Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Auto-loaded every session — project context, tech stack, reminders |
| `docs/product-vision-planning/product-vision.md` | Product vision & brief — written by `/epic-workflow:discover` |
| `docs/product-vision-planning/concept-of-operations.md` | Concept of operations — written by `/epic-workflow:discover` |
| `docs/implementation-plan/index.md` | Status dashboard — check here first |
| `docs/implementation-plan/phase-N-*/epic-N-*.md` | Epic specs (acceptance criteria + verification) |
| `docs/implementation-plan/session-handoffs/` | Handoff files written by `/epic-workflow:start`, `/epic-workflow:wrapup`, and `/epic-workflow:pause` |
| `docs/architecture.md` | System architecture — stubbed by `/epic-workflow:setup`, refreshed by `/epic-workflow:refresh-docs` |
| `docs/design-notes.md` | Design decisions — stubbed by `/epic-workflow:setup`, refreshed by `/epic-workflow:refresh-docs` |
| `.discovery-changelog.md` | Brownfield handoff from `/epic-workflow:discover` to `/epic-workflow:plan-project` (temporary, archived after use) |

## Rules of Thumb

- **One epic per session.** Start fresh for each epic so Claude has clean context.
- **Always `/epic-workflow:pause` before closing** if the epic isn't done. Don't just close the terminal — the handoff file is what preserves your progress.
- **Check `index.md`** if you're unsure what's next. The dependency graph shows what's unblocked.
- **UI epics** will trigger the brand guidelines skill for brand compliance if one is configured in the project.
- **Don't skip epics** unless the dependency graph allows it. Parallel-safe epics are visible in the graph.
- **Run `/epic-workflow:refresh-docs` before a release.** Architecture and design docs should reflect the as-built system at each release boundary, not the original plan.
- **Record decisions in handoffs, not in the docs directly.** Let `/epic-workflow:refresh-docs` consolidate them — this prevents partial updates and keeps the docs internally consistent.
- **Re-run `/epic-workflow:discover` when the product direction changes.** If you're adding features within the existing vision, use `/epic-workflow:add` directly. If the product scope or user base is shifting, re-run `/epic-workflow:discover` in brownfield mode first — it will capture the delta and hand it off to `/epic-workflow:plan-project`.
- **Re-run `/epic-workflow:plan-project` when you need multiple new epics from a vision change.** For a single new epic, `/epic-workflow:add` is faster. For a batch of related epics that need dependency analysis and phase placement, `/epic-workflow:plan-project` is the right tool.

