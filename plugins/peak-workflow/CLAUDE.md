# CLAUDE.md — peak-workflow plugin

## What This Plugin Is

Requirements-driven development lifecycle in the spirit of DO-330 TQL-5. Formal
Gherkin-style TOR requirements (`TOR-NN-XXXXXXX`) are the single source of truth —
epics implement them, tests derive from Given/When/Then, wrapup verifies against them.

Forked from `epic-workflow` v2.5.1. The two plugins coexist. Use
`/peak-workflow:migrate-from-epic-workflow` to migrate an existing epic-workflow project.

## Skill Inventory

| Skill | Purpose |
|-------|---------|
| `new-project` | Front-door router — detects project state and dispatches to the right entry point |
| `setup` | Audit CLAUDE.md, stub architecture/design-notes docs (run once before discover) |
| `discover` | Adaptive interview → product-vision.md + concept-of-operations.md |
| `mockup` | UI projects only — screen inventory (`S-NN`), per-scenario flows, grayscale wireframes; concretizes ConOps steps |
| `capture-requirements` | Derive TOR requirements → .feature.md + .feature.tracing.json |
| `plan-project` | Derive epics from TOR IDs → phase indexes + epic specs + sidecars |
| `add` | Add new epic(s) referencing existing TOR IDs |
| `triage` | Route incoming request → HEAVY / EPIC / TRIVIAL |
| `start-epic` | Implement an epic — TOR-driven plan + tasks + verification |
| `wrapup-epic` | Independent TOR verification, complete, ship |
| `pause` | Save progress mid-epic |
| `status` | Read-only dashboard — phase progress + Requirements Coverage |
| `quick-fix` | Trivial bug fix on a hotfix/ branch, no TOR changes |
| `refresh-docs` | Refresh architecture.md + design-notes.md from as-built code |
| `migrate-2.5` | One-shot migration from legacy index.md layout |
| `migrate-from-epic-workflow` | One-shot migration from an epic-workflow project to peak-workflow |

## Key Design Invariants

**TOR ID format:** `TOR-{NN}-{XXXXXXX}`
- `{NN}` = 2-digit zero-padded feature file number (stable, never renumbered)
- `{XXXXXXX}` = 7-char random alphanumeric (`LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7`)
- Immutable once merged to develop — they are foreign keys

**Feature file:** `docs/requirements/{NN}-{name}.feature.md`
**Tracing sidecar:** `docs/requirements/{NN}-{name}.feature.tracing.json` (written by Haiku sub-agent)
**Epic sidecar:** `docs/implementation-plan/status/epic-<id>.md` — has a `requirements:` field listing TOR IDs (each owned by exactly one epic) and an optional `waived: TOR-… → <succ>` line written by wrapup

**Branch families:**
- `docs/{task-short-name}` — full planning sequence (discover → mockup [UI] → capture-requirements → plan-project)
- `feature/epic-<id>-<short-name>` — implementation
- `hotfix/<slug>` — quick-fix

**Develop-branch invariant:** merge = approval. Anything on `develop` is approved.

**Verification independence:** wrapup runs in a fresh session on a stronger model, blind to
the implementer handoff until verdicts are recorded. `context: fork` is never used for
verification. A fix the verifier applies at wrapup is always recorded as `FIXED DURING WRAPUP`
in the Deferrals table so the human sees the one place self-review occurs.

**Deferral gate:** one contract in `start-epic` and `wrapup-epic` — Fix now / Defer / Stop with a
recommendation. Defer only when the Then clause depends on a later epic whose spec names the TOR.

**Baseline chains:** `CLAUDE.md` sections written by `setup` become baseline TORs in
`capture-requirements` — `Tool Hygiene & Operability` (all project types, Step 3A.2.1) and
`UX Baseline` (Web app / Desktop app / Hybrid with a UI, Step 3A.2.2). Both sets belong to the
walking-skeleton epic in `plan-project`; the skeleton installs the declared design system
(default shadcn/ui, themed only via CSS-variable tokens) and proves the UX TORs on one reference
screen. `wrapup-epic` re-checks every UX Baseline line on each UI epic as a quality gate. The
bold line labels in the UX Baseline template are cited verbatim by downstream skills — do not
rename them.

**Mockups are planning artifacts:** `mockup` writes `docs/product-vision-planning/ux/` (screens.md
with stable, append-only `S-NN` IDs; grayscale `wireframes/*.html`) and rewrites ConOps Section 5
steps to name screens and controls. Screen IDs are referenced by ConOps steps, TOR Given/When/Then,
and epic `## Screens` tables — never renumbered. Wireframes carry no colors or typefaces; visual
design lands in the walking-skeleton epic. `mockup` never invokes `frontend-design`.

**Companion skills:** `setup` recommends `frontend-design@claude-plugins-official` for UI
projects and `playwright-cli` for web UIs (desktop apps verify through a Playwright Electron
harness, a project dependency rather than a skill). `frontend-design` shapes visual execution; the UX Baseline and
design-system tokens take precedence over its aesthetic choices.

## Skill File Rules

- `SKILL.md` is the sole source of truth for skill behavior — no logic elsewhere
- Template files (`PLAN_TEMPLATE.md`, `HANDOFF_TEMPLATE.md`, etc.) live alongside SKILL.md in the skill directory
- Sibling template files are referenced by path in SKILL.md; Claude Code makes them available at skill load time
- `references/` holds the two stack sheets (Bun web, Bun + Electron desktop). They are the
  single source of truth for the greenfield stack: `setup` offers a sheet's Section 2 and
  `plan-project` builds the skeleton from its Sections 3-4, so no skill keeps its own copy of
  the picks or the script names. For an **existing** project they are reference only — no skill
  may treat divergence from a sheet as a finding, a TOR, or a reason to re-platform
- `[Greenfield only:]` and `[Brownfield only:]` tags inside code-block templates are conditional — the LLM interprets them, not renders them. Tags that must not render go *outside* fenced template blocks as plain prose conditionals.

## Validating Changes

The standard validation method is a **dry-run simulation**: spawn a sub-agent and ask it to
trace through each skill prompt as if executing it on a fresh empty repo for a simple project
(e.g., a Python CLI tool), report any rough edges, then fix and re-run. Two clean passes =
ready to ship.

Prompt template for the simulation agent:
> Read each SKILL.md in greenfield order (new-project → setup → discover → capture-requirements →
> plan-project → start-epic → wrapup-epic) and simulate executing it on a fresh empty repo for
> [project description]. Report any step that would block, confuse, or produce wrong
> output. For each gap: Severity (Critical / UX / Minor), Skill, Step, Problem, Fix.

## Versioning

Follows the repo-level versioning protocol in the repo-root `CLAUDE.md`.
Both `plugin.json` and `CHANGELOG.md` must be updated in the same commit.

- **Patch** — wording, UX clarity, step renumbering, no behavioral change
- **Minor** — new steps, new skills, changed skill contracts
- **Major** — breaking changes to artifact formats or skill API
- **Changelog entries:** one bullet per change, each ≤ 50 words, no rationale essays —
  see "Changelog entry style" in the repo-level CLAUDE.md.

Current version: see `.claude-plugin/plugin.json`.
