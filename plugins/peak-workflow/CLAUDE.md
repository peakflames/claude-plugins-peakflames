# CLAUDE.md — peak-workflow plugin

## What This Plugin Is

Requirements-driven development lifecycle in the spirit of DO-330 TQL-5. Formal
Gherkin-style TOR requirements (`TOR-NN-XXXXXXX`) are the single source of truth —
epics implement them, tests derive from Given/When/Then, wrapup verifies against them.

Forked from `epic-workflow` v2.5.1. The two plugins coexist; there is no migration path.

## Skill Inventory

| Skill | Purpose |
|-------|---------|
| `setup` | Audit CLAUDE.md, stub architecture/design-notes docs (run once before discover) |
| `discover` | Adaptive interview → product-vision.md + concept-of-operations.md |
| `capture-requirements` | Derive TOR requirements → .feature.md + .feature.tracing.json |
| `plan-project` | Derive epics from TOR IDs → phase indexes + epic specs + sidecars |
| `add` | Add new epic(s) referencing existing TOR IDs |
| `triage` | Route incoming request → HEAVY / EPIC / TRIVIAL |
| `start` | Implement an epic — TOR-driven plan + tasks + verification |
| `wrapup` | Independent TOR verification, complete, ship |
| `pause` | Save progress mid-epic |
| `status` | Read-only dashboard — phase progress + Requirements Coverage |
| `quick-fix` | Trivial bug fix on a hotfix/ branch, no TOR changes |
| `refresh-docs` | Refresh architecture.md + design-notes.md from as-built code |
| `migrate-2.5` | One-shot migration from legacy index.md layout |

## Key Design Invariants

**TOR ID format:** `TOR-{NN}-{XXXXXXX}`
- `{NN}` = 2-digit zero-padded feature file number (stable, never renumbered)
- `{XXXXXXX}` = 7-char random alphanumeric (`LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7`)
- Immutable once merged to develop — they are foreign keys

**Feature file:** `docs/requirements/{NN}-{name}.feature.md`
**Tracing sidecar:** `docs/requirements/{NN}-{name}.feature.tracing.json` (written by Haiku sub-agent)
**Epic sidecar:** `docs/implementation-plan/status/epic-<id>.md` — has a `requirements:` field listing TOR IDs

**Branch families:**
- `docs/{task-short-name}` — full planning sequence (discover → capture-requirements → plan-project)
- `feature/epic-<id>-<short-name>` — implementation
- `hotfix/<slug>` — quick-fix

**Develop-branch invariant:** merge = approval. Anything on `develop` is approved.

## Skill File Rules

- `SKILL.md` is the sole source of truth for skill behavior — no logic elsewhere
- Template files (`PLAN_TEMPLATE.md`, `HANDOFF_TEMPLATE.md`, etc.) live alongside SKILL.md in the skill directory
- Sibling template files are referenced by path in SKILL.md; Claude Code makes them available at skill load time
- `[Greenfield only:]` and `[Brownfield only:]` tags inside code-block templates are conditional — the LLM interprets them, not renders them. Tags that must not render go *outside* fenced template blocks as plain prose conditionals.

## Validating Changes

The standard validation method is a **dry-run simulation**: spawn a sub-agent and ask it to
trace through each skill prompt as if executing it on a fresh empty repo for a simple project
(e.g., a Python CLI tool), report any rough edges, then fix and re-run. Two clean passes =
ready to ship.

Prompt template for the simulation agent:
> Read each SKILL.md in greenfield order (setup → discover → capture-requirements →
> plan-project → start → wrapup) and simulate executing it on a fresh empty repo for
> [project description]. Report any step that would block, confuse, or produce wrong
> output. For each gap: Severity (Critical / UX / Minor), Skill, Step, Problem, Fix.

## Versioning

Follows the repo-level versioning protocol in `/opt/github_public/peakflames/claude-plugins-peakflames/CLAUDE.md`.
Both `plugin.json` and `CHANGELOG.md` must be updated in the same commit.

- **Patch** — wording, UX clarity, step renumbering, no behavioral change
- **Minor** — new steps, new skills, changed skill contracts
- **Major** — breaking changes to artifact formats or skill API

Current version: see `.claude-plugin/plugin.json`.
