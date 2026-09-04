# Peak Workflow

> All slash commands belong to the `peak-workflow` plugin. This README uses the short form (`/discover`, `/start-epic`, etc.) for readability; invoke them with the full form (`/peak-workflow:discover`, `/peak-workflow:start-epic`, etc.) or use the short form if no other plugin uses the same skill name.

## Where do I start?

```
                Is there an existing project here?
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
         No (greenfield)           Yes (brownfield)
              │                           │
              ▼                           ▼
       /peak-workflow:setup    Was it built with epic-workflow?
              │                           │
              ▼                  ┌────────┴────────┐
        /discover                ▼                 ▼
              │                Yes              No (already
              ▼                  │              peak-workflow
   /capture-requirements         ▼              or different)
              │      /peak-workflow:               │
              ▼      migrate-from-                 ▼
       /plan-project   epic-workflow         /triage  or  /status
              │                  │                 │
              ▼                  ▼                 ▼
         iterate via /start-epic / /wrapup-epic / /quick-fix
```

**If unsure, run `/peak-workflow:new-project`** — it detects project state and dispatches to the right entry point automatically.

## Greenfield Quick Start

```
/peak-workflow:new-project           → (optional) detect state, dispatches the rest
/peak-workflow:setup                 → audit CLAUDE.md, stub architecture.md + design-notes.md
/peak-workflow:discover              → creates docs/ branch, produces vision + ConOps
/peak-workflow:capture-requirements  → derives TOR requirements on the same docs/ branch
/peak-workflow:plan-project          → derives epics from TOR IDs on the same docs/ branch
[merge docs/ branch]                 → requirements and plan baseline approved
/peak-workflow:start-epic <id>       → implement first epic (tasks = user stories per TOR ID)
/peak-workflow:wrapup-epic <id>      → independent TOR verification, ship
```

> **Why run setup first?** `/discover` reads `CLAUDE.md` for project context, and `start-epic` /
> `wrapup-epic` depend on the Verification & Quality Gates section that `setup` populates.
> Running discover without setup means quality gates aren't in place until after the planning
> session — and on a small project, that gap can go unnoticed until the first wrapup fails.

## Brownfield — existing project, no peak-workflow yet

If your project pre-dates peak-workflow but was **not** built with epic-workflow, run the
greenfield path in **brownfield mode**: `/discover` and `/capture-requirements` both detect
that vision/ConOps and TOR files already exist (or don't) and adapt accordingly.

```
/peak-workflow:discover              → brownfield: creates docs/ branch, updates vision + ConOps
/peak-workflow:capture-requirements  → brownfield: appends new TOR IDs, archives changelog
/peak-workflow:plan-project          → brownfield: new epics for unplanned TOR IDs
[merge docs/ branch]                 → delta requirements and new epics approved
/peak-workflow:start-epic <id>       → implement new epics
```

## Migration from epic-workflow

If your project was built with `epic-workflow` (epic specs use `## Acceptance Criteria`,
no `docs/requirements/*.feature.md` files), run the one-shot migration:

```
/peak-workflow:migrate-from-epic-workflow
```

The skill is non-destructive, atomic (single revertable commit), and idempotent:

1. **Derives a TOR requirements baseline** from existing vision/ConOps and epic acceptance
   criteria (hybrid strategy — ConOps-first, refined by epic content).
2. **Transforms Not-Started epic specs** from Acceptance Criteria format to Requirements
   Anchors format.
3. **Updates all status sidecars** with the `requirements:` field.
4. **Updates CLAUDE.md** to reference peak-workflow commands.
5. **Lands everything in one commit** — `git revert HEAD` rolls the migration back.

In-Progress, Paused, Implemented, and Complete epics are left untouched and their sidecars
get `requirements: —`.

## Philosophy

Peak Workflow is a requirements-driven development lifecycle in the spirit of DO-330 TQL-5. The core principle: **requirements are the ground truth**. Tests are derived from requirements — not from implementation. You cannot verify "a bad implementation is correctly bad" when the verification baseline is independent of the code.

The formal requirements baseline lives in Gherkin-style `.feature.md` files with TOR requirement IDs (`TOR-NN-XXXXXXX`). Each TOR ID is:
- The **acceptance criterion** for an epic (an epic's spec lists the TOR IDs it implements)
- The **verification procedure** for wrapup (the Given/When/Then defines exactly what a passing test must demonstrate)
- An **immutable foreign key** once merged to develop (referenced by epic specs, tests, and handoffs)

> **On ceremony overhead:** the discover → requirements → planning sequence amortizes as the
> project grows — every new request routes through `/triage`, which tells you whether it needs
> new TOR IDs (HEAVY), implements existing ones (EPIC), or is a trivial bug (TRIVIAL). For a
> one-off script, `epic-workflow` may be a better fit.

### Small epics and the context budget

**An epic is one focused session.** Keep epics small so Claude works from a small context — a
large context degrades into needle-in-a-haystack retrieval and forces the model to juggle too
many rules at once, which is exactly what breaks faithful tests and honest verification.

**The signal:** when `/start-epic` presents its plan, context usage should be around 25%. Up to
~35% is fine. Above that, the epic is too large — split it (`/add` for the remainder). Watch the
status line's context meter; the operator enforces this, not the skills.

## Skills

Grouped by lifecycle phase. The same commands are listed in `CLAUDE.md`'s skill inventory.

### Bootstrap

| Command | Purpose |
|---|---|
| `/new-project` | **Front door for newcomers.** Detects project state (greenfield, brownfield epic-workflow, or existing peak-workflow) and dispatches to the right entry point. Writes no state files. |
| `/setup` | Audits `CLAUDE.md`, stubs `architecture.md`, `design-notes.md`, and `docs/requirements/README.md`. **Run once per project, before `/discover`.** |

### Plan

| Command | Purpose | Branch / Status |
|---|---|---|
| `/discover` | Adaptive interview that produces `product-vision.md` + `concept-of-operations.md` | Creates `docs/{task-short-name}` branch |
| `/capture-requirements` | Derives TOR requirements (`.feature.md` files + `.feature.tracing.json` sidecars) from vision + ConOps | Continues on `docs/` branch |
| `/plan-project` | Derives implementation plan (phases, epics, Requirements Anchors specs) from TOR requirements | Continues on `docs/` branch |
| `/add <description>` | Adds new epic(s) referencing existing TOR IDs | — (writes planning docs) |
| `/triage <issue\|description>` | Advisory routing — HEAVY (needs new TOR IDs) / EPIC (implements existing TOR IDs) / TRIVIAL (bug in already-implemented TOR) | — (writes no files) |

### Implement

| Command | Purpose | Branch / Status |
|---|---|---|
| `/start-epic <id>` | Implement the epic — loads TOR Given/When/Then, creates user-story tasks, implements, verifies | Not Started → In Progress → **Implemented** |
| `/wrapup-epic <id>` | Independent review — verifies each TOR's Given/When/Then is satisfied, closes out, ships; runs on Opus in a fresh session | Implemented → **Complete** |
| `/pause` | Stop mid-epic, save progress | In Progress → **Paused** |
| `/quick-fix <issue\|description>` | Lightweight path for trivial bugs in already-implemented TORs — creates `hotfix/` branch, implements, ships | Not tracked in implementation plan |

### Inspect

| Command | Purpose |
|---|---|
| `/status` | Read-only dashboard — epic progress, Requirements Coverage, active work, next actions |

### Maintain

| Command | Purpose |
|---|---|
| `/refresh-docs` | Refresh `architecture.md` + `design-notes.md` to match the as-built codebase |

### Migrate

| Command | Purpose |
|---|---|
| `/migrate-2.5` | One-shot migration from the legacy single-`index.md` layout to per-phase indexes + status sidecars |
| `/migrate-from-epic-workflow` | One-shot migration from an epic-workflow project — derives TOR baseline, transforms Not-Started specs, updates sidecars and CLAUDE.md |

## Choosing a Path

The lifecycle has two stages: a one-time bootstrap to get the requirements baseline in place,
and a recurring iteration loop for incoming work.

```mermaid
flowchart TD
    Start[New project /<br/>first time here] --> NP["/new-project<br/>(detects state)"]
    NP --> NPV{Verdict}
    NPV -->|Greenfield| Setup["/setup → /discover →<br/>/capture-requirements →<br/>/plan-project"]
    NPV -->|Brownfield<br/>epic-workflow| Mig["/migrate-from-epic-workflow"]
    NPV -->|Existing<br/>peak-workflow| Iter
    Setup --> Merge[merge docs/ branch<br/>= requirements approved]
    Mig --> Iter
    Merge --> Iter[Iteration loop]

    Iter --> Req[GitHub issue<br/>or ad-hoc request]
    Req --> Tri["/triage"]
    Tri --> Verd{Verdict}
    Verd -->|HEAVY<br/>new TOR IDs needed| Heavy["docs/ branch:<br/>/discover → /capture-requirements<br/>→ /plan-project"]
    Verd -->|EPIC<br/>implements existing TOR IDs| Epic["/add → /start-epic → /wrapup-epic"]
    Verd -->|TRIVIAL<br/>bug in already-implemented TOR| Quick["/quick-fix"]
    Heavy --> Iter
    Epic --> Ship{Ship mode}
    Quick --> Ship
    Ship -->|team| Team[push + PR<br/>reviewer merges]
    Ship -->|solo| Solo[local merge<br/>branch deleted]
```

## Branch Families

| Branch | Pattern | Scope |
|---|---|---|
| Planning | `docs/{task-short-name}` | discover → capture-requirements → plan-project → add (cohesive; merge = approval) |
| Implementation | `feature/epic-<id>-<short-name>` | start-epic → wrapup-epic |
| Quick fix | `hotfix/<slug>` or `hotfix/issue-<N>-<slug>` | quick-fix |

**Develop-branch invariant:** anything on `develop` is approved. The merge event (solo merge or team PR) is the approval signature.

## TOR Requirement IDs

Format: `TOR-{NN}-{XXXXXXX}`

| Part | Meaning |
|---|---|
| `TOR` | Tool/Product Requirements prefix |
| `{NN}` | Feature file number, 2-digit zero-padded (e.g., `01`). **Stable once assigned.** |
| `{XXXXXXX}` | 7-character random alphanumeric (parallel-safe, collision-resistant) |

Example: `TOR-01-Afs657G` lives in `docs/requirements/01-cli.feature.md`.

TOR IDs are **immutable once merged to develop.** They are foreign keys — epic specs, tests, and handoffs all reference them by ID. If a requirement changes substantively, it goes through `/peak-workflow:capture-requirements` (brownfield mode) on a `docs/` branch as a change-control event.

## Epic Spec Structure

Epic specs no longer contain prose Acceptance Criteria or Verification sections. Instead:

```markdown
# Epic a3f2K7p: CLI Version and Help Flags

**Phase:** 1 — Foundation
**Status:** Not Started
**Dependencies:** —

---

## Description

Implements the `-v` / `--version` and `--help` command-line flags. Users need to confirm
tool installation and access usage documentation from the command line.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline
> for this epic. Each ID maps to a Gherkin scenario in the referenced feature file.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
| TOR-01-Afs657G | `docs/requirements/01-cli.feature.md` | The tool shall report its part number and version to standard output |
| TOR-01-Bcd2345 | `docs/requirements/01-cli.feature.md` | The tool shall display usage help when invoked with --help |

## Key Components

- `src/cli.py` — add version and help flag handlers
- `tests/test_cli.py` — TOR-based tests
```

## Status Sidecar Format

```
status: Not Started
implemented: —
completed: —
handoff: —
requirements: TOR-01-Afs657G, TOR-01-Bcd2345
```

The `requirements:` field is how `/peak-workflow:status` computes the Requirements Coverage dashboard.

## Artifact Hierarchy

```
docs/product-vision-planning/
  product-vision.md           ← product intent (written by /discover)
  concept-of-operations.md    ← user scenarios (written by /discover)
  changelogs/                 ← brownfield discovery changelogs

docs/requirements/
  NN-{name}.feature.md        ← TOR requirements (written by /capture-requirements)
  NN-{name}.feature.tracing.json  ← TOR → vision/ConOps linkage (written by Haiku sub-agent)
  README.md                   ← conventions (written by /setup)

docs/implementation-plan/
  phase-N-*/index.md          ← epic registry per phase (epic ID, name, dependencies)
  phase-N-*/epic-<id>-*.md    ← epic specs with Requirements Anchors tables
  status/epic-<id>.md         ← status sidecar (status, implemented, completed, requirements:)
  session-handoffs/           ← implemented and complete handoff files
  README.md                   ← lifecycle prose (never written by skills after creation)

docs/architecture.md          ← system architecture (stubbed by /setup, refreshed by /refresh-docs)
docs/design-notes.md          ← design decisions (same)
```

## Requirements & Verification

The key distinction between peak-workflow and a typical Agile workflow:

| | Typical | Peak Workflow |
|---|---|---|
| Acceptance criteria | Prose checkboxes in the spec | TOR IDs referencing Gherkin scenarios |
| Test derivation | Implementer decides what to test | Given/When/Then dictates what the test must verify |
| Wrapup baseline | Did the implementation match the spec? | Does the implementation satisfy the TOR Given/When/Then? |
| Requirements source | Implicitly distributed across docs | Formally captured in `docs/requirements/*.feature.md` |
| Requirements approval | N/A | Merge of `docs/` branch (solo or team PR) |

**Quick-fixes never change requirements.** If a fix requires modifying a TOR's Given/When/Then, re-triage as HEAVY. If a quick-fix lands and later someone thinks the requirement itself was wrong, that's a new HEAVY event — not a retroactive quick-fix.

## Key Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Auto-loaded every session — project context, tech stack, quality gates |
| `docs/product-vision-planning/product-vision.md` | Product vision (written by `/discover`) |
| `docs/product-vision-planning/concept-of-operations.md` | Operational scenarios (written by `/discover`) |
| `docs/requirements/*.feature.md` | TOR requirements — Gherkin feature files (written by `/capture-requirements`) |
| `docs/requirements/*.feature.tracing.json` | TOR → vision/ConOps linkage (written by Haiku sub-agent) |
| `docs/implementation-plan/phase-N-*/index.md` | Per-phase epic registry — append-only |
| `docs/implementation-plan/status/epic-<id>.md` | Per-epic sidecar — status + requirements: field |
| `docs/implementation-plan/phase-N-*/epic-<id>-*.md` | Epic specs (Requirements Anchors format) |
| `docs/implementation-plan/session-handoffs/` | Implemented and complete handoff files |
| `docs/architecture.md` | System architecture (stubbed by `/setup`, refreshed by `/refresh-docs`) |
| `docs/design-notes.md` | Design decisions (same as above) |
