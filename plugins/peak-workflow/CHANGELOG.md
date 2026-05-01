# Changelog — peak-workflow

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.0.4] — 2026-04-30

### Fixed
- triage: HEAVY branch note clarified
- triage: HEAVY passes args to discover
- capture-requirements: brownfield gate

---

## [1.0.3] — 2026-04-30

### Fixed
- wrapup: HANDOFF_TEMPLATE step ref
- setup: CLI build step wording
- discover: stale epic-workflow ref

---

## [1.0.2] — 2026-04-30

### Fixed
- setup: CLI-aware env interview
- wrapup: renumber steps 1.3–1.5
- plan-project: brownfield tag leak
- discover: CLI design notes

---

## [1.0.1] — 2026-04-30

### Fixed
- setup runs before discover
- docs/ merge commands added
- branch name format guidance
- grouping review gate
- clearer ship-or-continue
- ceremony overhead note
- quality gate cmd check
- wrapup: handoff fallback
- status prompts added
- TOR mismatch → prompt

---

## [1.0.0] — 2026-04-29

**INITIAL RELEASE — peak-workflow forked from epic-workflow v2.5.1 with a full
requirements-driven development overhaul.** Projects new to peak-workflow start fresh;
there is no automated migration from epic-workflow because the artifact sets differ
fundamentally (epic-workflow projects should remain on epic-workflow).

### Added

- **New skill: `capture-requirements`** — fully autonomous skill that derives Gherkin-style
  TOR requirements from `product-vision.md` and `concept-of-operations.md`. Main agent
  adopts a seasoned-PM persona (user emotional journey, stakeholder expectations, target
  audience, holistic product thinking) to author `.feature.md` files. Haiku sub-agent
  verifies traceability and writes `.feature.tracing.json` sidecars. Greenfield and
  brownfield modes. Operates on a `docs/{task-short-name}` branch — never runs on
  `develop` / `main` / `master` directly. Produces a self-check trace table mapping every
  ConOps scenario step and PV section to at least one TOR ID.

- **New artifact: `docs/requirements/*.feature.md`** — Gherkin feature files containing
  `Feature:` / `Scenario:` / Given-When-Then blocks. TOR ID format is
  `TOR-{NN}-{XXXXXXX}` where `{NN}` is the 2-digit zero-padded feature file number
  (stable and append-only once assigned; never renumbered) and `{XXXXXXX}` is a
  7-character random alphanumeric suffix (parallel-safe, same generation method as epic
  IDs). TOR IDs are immutable once merged to develop — they are foreign keys referenced
  by epic specs, handoffs, and tests.

- **New artifact: `docs/requirements/*.feature.tracing.json`** — static JSON sidecar per
  feature file, written by the Haiku sub-agent. Maps each TOR ID to its upstream sources:
  vision section (with paraphrase) and ConOps scenario step (with paraphrase). Static
  after written; updated only when requirements themselves change (a change-control event,
  not an epic implementation event). Coverage gaps (orphan requirements with no upstream
  source; uncovered ConOps steps) are recorded under `coverage_gaps`.

- **Epic sidecar `requirements:` field** — the per-epic status sidecar
  (`docs/implementation-plan/status/epic-<id>.md`) gains a `requirements:` line listing
  the TOR IDs the epic is responsible for implementing. Replaces the implicit
  acceptance-criteria-only tracking. Requirements coverage for the whole project is derived
  dynamically by cross-referencing all sidecar `requirements:` fields against all TOR IDs
  in the feature files.

- **New branch family: `docs/{task-short-name}`** — the full planning sequence (`discover`
  → `capture-requirements` → `plan-project` → `add`) operates on a single cohesive
  `docs/` branch. The merge of that branch to develop (solo or team PR) is the approval
  gate for the requirements and plan as a unit. Anything on `develop` is guaranteed
  approved. `discover` creates the branch if on the base branch; subsequent skills in the
  same planning session detect and continue on the existing `docs/` branch.

- **Requirements Coverage panel in `/peak-workflow:status`** — new dashboard panel after
  Phase Progress. Shows TOR IDs in each lifecycle state: Specified (no epic), Planned
  (epic Not Started), In Progress, Implemented (pending verification), Verified (Complete),
  and Paused. Reports overall requirements baseline coverage percentage.

- **Requirements Anchor reconciliation in `start` and `wrapup`** — before planning or
  verifying, both skills check that every TOR ID in the epic spec's Requirements Anchors
  table still exists in the cited feature file with a matching scenario. A missing or
  substantively-modified TOR surfaces as a discrepancy the user must resolve before
  implementation or verification continues.

- **`docs/requirements/README.md` stub** — `/peak-workflow:setup` creates this file when
  initializing a new project, explaining the requirements-baseline conventions
  (append-only, immutable IDs, change-control for modifications).

### Changed

- **BREAKING — Epic spec structure.** The `## Vision & Scenario Anchors`, `## At
  Completion, a User Can`, `## Acceptance Criteria`, and `## Verification` sections are
  removed from all epic specs. Replaced by a single `## Requirements Anchors` section: a
  table listing each TOR ID the epic implements, its feature file path, and its scenario
  title. The TOR ID **is** the acceptance criterion; the Given/When/Then in the feature
  file **is** the verification procedure. Sections that remain: header lines, Description,
  Key Components.

- **BREAKING — Acceptance criteria are no longer authored alongside epic specs.** New
  requirements must be captured via `/peak-workflow:capture-requirements` on a `docs/`
  branch before they can be referenced in an epic spec. `/peak-workflow:add` prompts the
  user to select which existing TOR IDs the new epic covers.

- **`/peak-workflow:wrapup` verifies Given/When/Then, not prose criteria.** For each TOR
  ID in the Requirements Anchors table, the independent reviewer reads the feature file's
  Given/When/Then, locates the test the implementer wrote, runs it, and independently
  inspects source code to confirm the implementation actually realizes the requirement.
  A passing test that does not exercise the requirement is a FAIL. The old Step 1.3
  "Verify Verification Section" is removed (subsumed into TOR-driven Step 1.2). The
  verification report Counts line is now "TOR Requirements: X/Y PASS".

- **`/peak-workflow:start` plan template — tasks are user stories per TOR ID.** Plan
  opening item 4 creates one task per TOR ID (or per small group of closely-related TORs
  from the same feature file). Each task's subject is the TOR's scenario title; its
  description includes the full Given/When/Then. The task tool layer is the user-story
  decomposition of the epic. The plan's middle steps explicitly name which TOR ID(s) each
  step implements.

- **`/peak-workflow:discover` operates on a `docs/` branch.** Added Step 0 branch guard:
  if on `develop` / `main` / `master`, prompts for a task short name and creates
  `docs/{task-short-name}`. Added Step 6 ship option at the end (continue into
  `capture-requirements`, or solo/team merge if this is a vision-only update). Updated
  next-step pointer to `capture-requirements` (not `plan-project`).

- **`/peak-workflow:plan-project` reads feature files.** Step 1 loads all
  `docs/requirements/*.feature.md` and `.feature.tracing.json` files. Gated: if
  `docs/requirements/` is empty or missing, the skill stops and directs the user to run
  `capture-requirements` first. Epic formation in Step 3A/3B is now TOR-driven (group
  TOR IDs into session-sized epics) rather than ConOps-scenario-driven. Step 6 self-check
  traces TOR IDs → epics (not ConOps steps → acceptance criteria). Step 7 updates
  CLAUDE.md to also reference `docs/requirements/`.

- **`/peak-workflow:triage` rubric updated for requirements awareness.** Step 1 loads
  feature files. HEAVY now means the request requires new or modified TOR IDs (vision,
  ConOps, or requirements baseline change). EPIC now means the request implements existing
  TOR IDs or a cohesive group of currently-unimplemented TOR IDs. TRIVIAL now means the
  request fixes a bug in an already-implemented TOR without changing the requirement.
  HEAVY dispatch message updated to include `capture-requirements` in the sequence.

- **All skill cross-references renamed** — `/epic-workflow:*` → `/peak-workflow:*`
  throughout all skill files, Layout Guard messages, triage dispatch commands, and
  documentation.

- **`/peak-workflow:pause` disambiguation check updated** — uses the Requirements Anchors
  table (TOR IDs) instead of prose acceptance-criteria checkboxes to determine if an epic
  is potentially ready for wrapup. Handoff template sections renamed to "TOR IDs
  Completed / In Progress / Not Started".

- **`/peak-workflow:quick-fix` "What NOT to Do" updated** — explicitly prohibits
  modifying `.feature.md` or `.feature.tracing.json` files. Quick-fixes implement bugs in
  code covering existing TOR requirements; they do not change the requirement itself.

- **`/peak-workflow:refresh-docs` clarified** — requirements live in feature files, not
  in `architecture.md` or `design-notes.md`. The refresh-docs skill does not touch the
  requirements baseline.

- **`/peak-workflow:setup` updated** — audit checklist includes a "Peak Workflow" section
  referencing all peak-workflow commands including `capture-requirements`. Setup creates
  the `docs/requirements/README.md` stub if the directory does not exist.

### Removed

- `## Vision & Scenario Anchors` section in epic specs (replaced by Requirements Anchors).
- `## At Completion, a User Can` section in epic specs (semantically captured by Gherkin
  Scenarios in feature files).
- Prose `## Acceptance Criteria` checkboxes in epic specs.
- Prose `## Verification` section in epic specs (Quality Gates from CLAUDE.md continue to
  apply universally; per-epic verification is now TOR Given/When/Then driven).
- `/peak-workflow:wrapup` Step 1.3 "Verify Verification Section" (merged into TOR-driven
  Step 1.2).

### Migration from epic-workflow

There is no automated migration tool. The artifact sets diverge fundamentally. Recommended
manual transition for a project that wants to adopt peak-workflow alongside existing
epic-workflow work:

1. Keep in-flight epic-workflow epics on epic-workflow until they complete.
2. When ready, install peak-workflow alongside epic-workflow in the same project.
3. Run `/peak-workflow:discover` (brownfield mode) to refresh vision and ConOps.
4. Run `/peak-workflow:capture-requirements` to derive the TOR baseline.
5. New work uses `/peak-workflow:plan-project`, `/peak-workflow:add`, `/peak-workflow:start`.
6. Old epic-workflow specs and handoffs remain as historical record.

---

## [2.5.1] — 2026-04-27 (inherited from epic-workflow)

### Fixed

- **`start` skill: plan mode override in auto mode** — Step 4 now explicitly states it is mandatory regardless of any active auto mode, continuous execution, or "prefer action" instruction. Added rationale (the plan gate catches architectural errors before wrong code is written). Step 5 now requires explicit user approval before exiting plan mode, eliminating the ambiguous "exit plan mode and execute" phrasing that could be read as skipping the gate entirely.

---

## [2.5.0] — 2026-04-25

**BREAKING — requires `/epic-workflow:migrate-2.5` on existing projects.**

### Added

- **New skill: `migrate-2.5`** — one-shot migration from the legacy single `index.md` layout to the v2.5.0 per-phase indexes + status sidecars layout. Parses the legacy status table, writes one `phase-*/index.md` per phase, writes one `status/epic-<id>.md` sidecar per epic, extracts prose to `README.md`, and replaces `index.md` with a thin stub. Single commit for atomic rollback via `git revert`. Idempotent — safe to re-run.

### Changed

- **BREAKING — Implementation plan layout.** The single `docs/implementation-plan/index.md` that all skills read and wrote is the primary source of merge conflicts on multi-branch projects. v2.5.0 eliminates this by splitting it into:
  - `docs/implementation-plan/phase-N-*/index.md` — one append-only file per phase, containing only `| Epic | Name | Dependencies |`. Never written during status transitions.
  - `docs/implementation-plan/status/epic-<id>.md` — one per-epic sidecar with four key:value lines (`status`, `implemented`, `completed`, `handoff`). Each branch owns only its own sidecar, so status transitions never produce merge conflicts.
  - `docs/implementation-plan/README.md` — human prose (lifecycle diagram, Quick Start). Skills never write to it.
  - `docs/implementation-plan/index.md` — replaced with a thin stub pointing at the above. Skills do not read or write it after migration.
  
  The hand-maintained dependency graph is discarded; `/epic-workflow:status` regenerates it on demand from phase indexes.

- **Layout guard added to every skill (except `migrate-2.5`).** Each skill now checks for the legacy status table header at startup and stops with a "run `/epic-workflow:migrate-2.5` first" message if found. Skills do not dual-read old and new layouts.

- **`add`**: Step 7 rewritten — appends row to `phase-N-*/index.md`, creates `status/epic-<id>.md` with `status: Not Started`. No dependency graph maintenance.
- **`discover`**: Step 1.3 rewritten — globs `status/epic-*.md` sidecars to detect brownfield state instead of reading `index.md`. Step 2B reads phase indexes for "what has been built" context.
- **`pause`**: Step 1 rewritten — globs sidecars to find the In Progress epic. Step 4 rewritten — writes `status: Paused` + `handoff:` link to the sidecar instead of editing `index.md`.
- **`plan-project`**: Step 2 detection rewritten — checks for phase index files instead of `index.md`. Step 5.3 rewritten — greenfield creates phase indexes + sidecars + `README.md` + stub `index.md`; brownfield appends to existing phase indexes + creates new sidecars.
- **`quick-fix`**: Layout guard only (already didn't touch `index.md`).
- **`refresh-docs`**: Step 1.2 rewritten — globs `status/epic-*.md` and greps for Complete/Implemented status instead of reading `index.md`.
- **`setup`**: Layout guard added at Step 7 — detects legacy layout and prints a one-line "run migrate-2.5" hint when found.
- **`start`**: Step 1.2 rewritten — finds the epic's phase index via grep, reads dependency IDs from the phase index, reads dependency sidecars for status verification. Step 2 verifies deps against sidecars. Recovery check reads the sidecar instead of `index.md`.
- **`start/PLAN_TEMPLATE.md`**: Opening item 2 ("Update status to In Progress") and closing "Mark as Implemented" step rewritten to edit the `status/epic-<id>.md` sidecar instead of `index.md`.
- **`status`**: Steps 1–3 rewritten — globs all phase indexes and all sidecars, assembles the dependency graph and status counts on the fly. No longer reads `index.md` at all.
- **`triage`**: Step 1.4 rewritten — reads phase indexes instead of `index.md` for project context.
- **`wrapup`**: Step 1.1.2 rewritten — reads epic's sidecar for status gate instead of `index.md`. Step 2.2 rewritten — writes `status: Complete`, `completed:`, and `handoff:` to the sidecar. Phase 3 rewritten — globs all phase indexes + sidecars to assemble dependency graph.

### Migration

Run `/epic-workflow:migrate-2.5` once per project after updating to v2.5.0. The migration:
- Reads the legacy `index.md` status table
- Writes one `phase-*/index.md` per phase + one `status/epic-*.md` per epic
- Extracts the preamble prose to `docs/implementation-plan/README.md`
- Replaces `index.md` with the thin stub
- Commits everything atomically (`git revert <hash>` rolls back)

To roll back: `git revert <migration-commit-hash>`, then downgrade to v2.4.0.

---

## [2.4.0] — 2026-04-25

### Changed

- **`setup` + `refresh-docs`: removed `Document Version` / `Date` / `Status` header block from `architecture.md` and `design-notes.md`.** These three fields were the primary cause of merge conflicts when multiple feature branches tried to merge back to `develop` — every `refresh-docs` run bumped them, creating a conflict on every merge. Git history already tracks when a file changed and by whom, making the fields redundant. Removed from both the stubs that `setup` writes and from the rewrite instructions in `refresh-docs`. Existing projects can delete the header block from their docs manually and will see no further conflicts from that source.

---

## [2.3.0] — 2026-04-25

### Changed

- **`wrapup`: efficiency pass parallel to v2.2.0 `start`.** Same categories of
  redundant context loads carried over from `start` reviews:
  - **Drop the `CLAUDE.md` re-read** — Step 1.1 item 1 now points at the
    in-context copy instead of issuing a `Read` call.
  - **Narrow the Step 1.1 `index.md` read** — item 2 now `grep`s for the epic's
    row and reads only that line via `offset` / `limit`. The full index is
    read once in Phase 3 where the dependency-graph walk actually needs it,
    eliminating the prior duplicate read.
  - **Conditional `architecture.md` and `design-notes.md` reads** — Step 1.1
    item 7 now loads each only when the epic touches a relevant surface (IPC,
    schema, cross-cutting decisions). Localized UI / copy changes skip both.
    Step 1.5 code review consistency check is now scoped to whichever doc was
    loaded; if neither was, it records "no architectural surface affected"
    instead of citing files it never opened.
  - **Reliable branch-existence check** — Step 1.1 item 9 now prescribes
    `git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>`
    (exit 0 = exists), with the legacy `feat/epic-N` fallback gated on the
    same test. Replaces the prior reliance on `git checkout` failing silently
    or `git branch --list … && echo` (which always exits 0).
- **`wrapup`: forward-looking anchor fast-path.** Step 1.1 item 5 now opens
  with the same pre-check as `start` v2.2.0 — anchors whose paraphrase
  describes future state are recorded as "no conflict, source updates pending
  at close-out" without opening source docs. Full source-vs-paraphrase
  comparison runs only on anchors that make a substantive claim about
  *current* product behavior.
- **`wrapup`: handoff and PR body templates extracted.** The completion
  handoff template (Step 2.1, ~40 lines) and team-mode PR body template
  (Step 5b, ~30 lines) used to be embedded inline and re-transcribed verbatim
  every run. They now live in
  `plugins/epic-workflow/skills/wrapup/HANDOFF_TEMPLATE.md` and
  `plugins/epic-workflow/skills/wrapup/PR_BODY_TEMPLATE.md`. The skill body
  references them; future template tweaks happen in one place. The PR body
  template also notes that "What Was Built" content is already in memory from
  Step 2.1's handoff write — reuse it rather than re-reading the handoff file
  from disk.

---

## [2.2.0] — 2026-04-25

### Changed

- **`start`: efficiency pass on context loading.** Three independent field runs
  (one Opus, two Sonnet) converged on inefficiencies in Step 1's unconditional
  reads. This release targets the high-consensus wins:
  - **Drop the `CLAUDE.md` re-read** — `CLAUDE.md` is already injected into
    every conversation turn via system context. Step 1 item 1 now points at the
    in-context copy instead of issuing a `Read` call.
  - **Narrow the `index.md` read** — Step 1 item 2 now `grep`s for the epic's
    row and reads only that line plus dependency rows via `offset` / `limit`,
    rather than reading the full ~650-line index.
  - **Scope `docs/reference/` reads** — Step 1 item 12 now scans the spec for
    explicit `docs/reference/...md` links and reads only those. Bulk-reading
    the directory is removed; many reference files are dense (e.g., 1,300-line
    algorithm specs) and most epics touch only a slice.
  - **Conditional `architecture.md` and `design-notes.md` reads** — Step 1
    items 10–11 are now conditional on whether the epic touches cross-cutting
    concerns (IPC, schema, etc.) or raises a decision the design notes might
    have addressed. Localized UI / copy changes skip both.
- **`start`: forward-looking anchor fast-path.** Step 1 item 6 now opens with a
  pre-check: anchors whose paraphrase explicitly describes future state ("will
  be …", "after this epic", "needs updating when this epic ships") are
  recorded as "no conflict, source updates pending at close-out" without
  opening source docs. Full source-vs-paraphrase comparison runs only on
  anchors that make a substantive claim about *current* product behavior.
- **`start`: reliable branch existence check.** Step 3 and the lifecycle
  template now prescribe `git show-ref --verify --quiet
  refs/heads/feature/epic-<id>-<short-name>` (exit 0 = exists). The previous
  ad-hoc `git branch --list … && echo "exists"` pattern always exited 0 and
  produced false positives on missing branches.
- **`start`: lifecycle template extracted to `PLAN_TEMPLATE.md`.** Step 4 used
  to embed ~50 lines of opening / closing prose inline; the LLM transcribed
  those verbatim into every plan. The opening and closing steps now live in
  `plugins/epic-workflow/skills/start/PLAN_TEMPLATE.md`. The skill body is
  shorter, and future template tweaks happen in one place.
- **`start`: task granularity guidance.** Plan opening item 4 now creates one
  task per **logical work block** (typically 5–10 tasks), grouping fine-grained
  acceptance criteria, and issues a single batched `TaskCreate` call. The
  prior "one task per acceptance criteria item" rule produced noisy task lists
  without improving execution.
- **`start`: closing-step permission and deviation cleanup.** The "Reconcile
  spec" closing step no longer re-prompts for permission to write the handoff
  or edit the spec — plan approval already authorizes both. When the
  implementation tracks the spec 1:1 with no deviations, the in-place
  checkbox edits are skipped (the index "Implemented" status is the source of
  truth) and only the handoff file is written.
- **`start`: GitHub announce short-circuit.** When Step 1 captures no source
  issue, the plan's announce item collapses to the single line `GitHub
  announce: SKIP — no source issue` rather than transcribing the full
  conditional block.

### Added

- **`start`: pre-flight scan for new artifacts.** New Step 1 item 5 greps the
  spec for the literal strings `NEW component` and `NEW spec`, surfacing
  matches as explicit "create file X" plan items so new files are named
  upfront rather than discovered mid-implementation.
- **`start`: pre-flight E2E regression audit.** New Step 1 item 13 — when the
  project has an E2E test directory and the epic's key components include UI
  modules likely referenced there, `grep -rl` for each component captures
  matching specs. The plan's middle section gets an explicit "update
  regression specs: …" item so they ship alongside the implementation rather
  than break at the verification gate. No-ops on projects without an E2E
  directory.
- **`start`: IPC / dev-server verification caveat.** The closing "Satisfy
  verification" step now warns that `playwright-cli` against a dev-server-only
  render harness (e.g., Vite for an Electron app) cannot exercise the data
  path on IPC- or backend-dependent surfaces — the project's E2E suite must be
  used for those, with `playwright-cli` reserved for pure render / style
  verification. Phrased conditionally so it no-ops on non-Electron consumers.

---

## [2.1.0] — 2026-04-23

### Added

- **Vision & Scenario Anchors section in epic specs** — `/add` and `/plan-project` now
  write a `## Vision & Scenario Anchors` section into every new epic spec (after
  Description, before "At Completion, a User Can"). It cites specific
  `product-vision.md` sections and `concept-of-operations.md` scenario steps with a
  1–2 sentence paraphrase of intent per bullet. `/start` (new Step 1 item 5) and
  `/wrapup` (new Step 1.1 item 5) read the section first and reconcile each paraphrase
  against its source. If a paraphrase conflicts with the source, neither text is
  privileged — the skill surfaces the discrepancy to the user and asks which represents
  current intent. Wrapup records the reconciliation outcome in a new "Anchor
  Reconciliation" section of the Phase 1 Verification Report. Legacy specs without an
  Anchors section are grandfathered.
- **Self-Check step in `/add`** (new Step 8) and **`/plan-project`** (new Step 6) — a
  post-write trace pass that enumerates every input requirement (user description,
  GitHub issue body, vision/ConOps touchpoints, brownfield changelog entries,
  negotiation adjustments) and maps each to the output spec sections that capture it.
  Produces a visible `Input → Output Trace` table with Explicit (Y/N) and Ambiguous
  (Y/N) columns; any gap triggers a remediation edit and re-run. Final passing table
  is printed as part of the step's summary so users and future reviewers can audit
  input coverage.
- **GitHub issue comments on work start and PR open** — when an epic or quick-fix has
  a linked GitHub issue (`**Source:** Issue #<N>` on epics, resolved issue number on
  quick-fixes):
  - `/start` posts a "work has started on branch X" comment when status transitions
    from Not Started / Paused → In Progress (skipped on resumption of an already
    In Progress epic).
  - `/wrapup` team mode posts the PR URL to the issue after `gh pr create` succeeds.
  - `/quick-fix` team mode does the same after its `gh pr create`.

  All three are gated on `gh auth status` succeeding; failures print a warning and
  continue (the comment is a courtesy, not a blocker). Solo mode skips the PR-open
  comment on wrapup and quick-fix since there is no external URL to link to; `/start`
  still fires its announcement regardless of ship mode.

### Changed

- **Discovery changelog filename and location.** `{TIMESTAMP}` in the brownfield
  `/discover` output is now defined as a second-granularity UTC timestamp
  (`date -u +%Y-%m-%d-%H%M%S`), e.g. `discovery-changelog-2026-04-23-174205.md`.
  Day granularity was not sufficient when two developers ran `/discover` on different
  machines the same day. `/plan-project` is updated to match:
  - Reads from `docs/product-vision-planning/changelogs/` (was the stale
    `.discovery-changelog.md` at the repo root, a leftover from v1.6.0's move).
  - Globs `discovery-changelog-*.md` and filters out anything ending in `.processed`.
  - If it finds two or more unprocessed changelogs it **refuses to plan**, lists them,
    and asks the user to reconcile. Silent merging is not attempted — losing intent
    that way is worse than pausing for a human.
  - Archival appends `.processed` to the consumed file instead of re-timestamping —
    the original discovery timestamp is preserved.

---

## [2.0.0] — 2026-04-22

### Added

- **New skill: `triage`** — advisory routing for incoming GitHub issues or ad-hoc
  requests. Sizes the request against product vision and ConOps, then presents one of
  three verdicts (HEAVY / EPIC / TRIVIAL). For EPIC and TRIVIAL, offers ask-and-dispatch
  via the Skill tool (invokes `/add` or `/quick-fix` directly on user confirm). For
  HEAVY, prints the commands to run in a fresh session. Accepts a GitHub issue number
  (loaded via `gh issue view`) or free-text description. Writes no state files.
- **New skill: `quick-fix`** — lightweight path for trivial items (bugs, copy changes,
  small enhancements). Creates a `hotfix/issue-<N>-<slug>` branch, runs a plan-mode
  implementation with applicable quality gates, and ships via prompted solo/team mode.
  Does not update `implementation-plan/index.md`; quick-fixes are commit-level records.
- **Issue-number persistence across the epic chain** — when `/triage` loads a GitHub
  issue and routes to the EPIC path, the issue number now flows through to the epic
  spec (as a `**Source:** Issue #<N>` header line), `/start` commit trailers
  (`Closes #<N>`), `/pause` commit trailers (`Refs #<N>`), and `/wrapup` team-mode PR
  body (`Closes #<N>`). Existing integer-IDed epics without a `Source:` line are
  unaffected.
- **Verification narrative in `/wrapup` and `/quick-fix`** — team-mode PR bodies and
  the wrapup handoff now include a Highlights list (✅ pass / ⚠️ pass-with-exceptions /
  ❌ fail), a Conclusion paragraph explaining why the verification is sufficient, and
  a Manual verification disclosure (Yes/No with user-authored description) prompted
  via `AskUserQuestion` during wrapup Phase 2 and quick-fix before ship. The counter
  strip (`Acceptance Criteria: X/Y PASS`, etc.) is preserved at the top for quick
  skim.

### Changed

- **BREAKING — Epic ID format.** New epics created from v2.0.0 onward use a 7-character
  random alphanumeric ID (generated via `LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7`,
  regenerated if all-digit) instead of a monotonically incrementing integer. This
  eliminates collisions when multiple developers run `/add` in parallel. All skills now
  parse both formats: existing integer-IDed epics (e.g. `Epic 7`, `Epic 6.5`) are
  preserved as-is. Affected surfaces:
  - Spec filenames: `epic-<id>-<short-name>.md`
  - Branch names: `feature/epic-<id>-<short-name>`
  - Handoff filenames: `epic-<id>-*.md`
  - Commit message prefixes: `feat(epic-<id>): …`, `wip(epic-<id>): pause — …`,
    `chore(epic-<id>): verify and complete — …`
  - `/start`, `/pause`, `/wrapup` arguments accept either format.
  - Index.md "Epic" column: new epics show alphanumeric ID; existing rows unchanged.
  - `/add` no longer accepts a user-specified number; IDs are always auto-generated.
- **BREAKING — `wrapup`: Step 5 now prompts for ship mode** (solo vs. team). Previously,
  Step 5 silently auto-merged the feature branch locally with `git merge --no-ff` and
  deleted it. Now:
  - **Solo mode** preserves the previous behavior.
  - **Team mode** pushes the branch with `git push -u origin` and opens a pull request
    via `gh pr create` with a templated body. Does NOT run `gh pr merge`. Does NOT delete
    the feature branch.
  - The prompt is presented neutrally with no default and no recommendation — there is
    no reliable signal to auto-determine the right mode for the user's context, so the
    choice must be made explicitly every invocation. `/quick-fix` follows the same rule.
- **`wrapup` Step 5 heading** renamed from "Merge to Base Branch" to "Ship to Base Branch".

---

## [1.6.0] — 2026-04-19

### Changed

- **`discover`**: now placing the `discover-changelog.md` into the
  `docs/product-vision-planning/changelog/` directory

---

## [1.5.0] — 2026-04-14

### Changed

- **`start`: Plan is now the complete and authoritative execution script** — Step 4 now
  mandates that the generated plan must be fully executable in isolation. If the session's
  context is cleared after plan approval and only the plan text survives, the plan alone
  is sufficient to drive the entire implementation to completion.
- **`start`: Plan opening steps embedded (branch, status, tasks)** — the plan's first three
  items are always: (1) create/verify the feature branch, (2) update `index.md` to "In
  Progress", (3) create tasks for each acceptance criteria item.
- **`start`: Plan closing steps embedded (verify, reconcile, mark, commit, next steps)** —
  the plan's last five items are always: satisfy verification (with PASS/FAIL/CANNOT VERIFY
  protocol and `playwright-cli` guidance), reconcile spec and write handoff file, mark epic
  as Implemented in `index.md`, commit (with branch guard), and present the next-steps block.
- **`start`: Steps 5–12 collapsed into Step 5 "Execute the Plan"** — all post-approval
  workflow logic now lives in the plan body. Step 5 simply instructs Claude to execute the
  plan in order without adding, skipping, or reordering items. Eliminates the duplication
  that would have occurred if both the skill steps and the plan's embedded lifecycle steps
  ran in the same session.

---

## [1.4.1] — 2026-04-14

### Changed

- **`wrapup`: Step 5 prefers `develop` as merge target** — base branch detection now runs
  `git branch --list develop main master` and prefers `develop` if it exists, then `main`,
  then `master`. The heading and confirmation message updated from "Merge to Main" to
  "Merge to Base Branch" to reflect the dynamic target. Consistent with the `start` v1.4.0
  base branch detection fix.

---

## [1.4.0] — 2026-04-14

### Changed

- **`start`: Step 3 prefers `develop` as base branch** — branch detection now runs
  `git branch --list develop main master` and prefers `develop` if it exists, then
  `main`, then `master`. The confirmation message reports which base branch was used.
- **`start`: Step 11 adds branch guard before committing** — a `git branch --show-current`
  check is now the first action in the commit step. If Claude is not on the feature branch,
  it stops and switches before staging any files, preventing accidental commits to
  `develop`, `main`, or `master`.

---

## [1.3.0] — 2026-04-12

### Changed

- **Branch naming convention: `feat/epic-N` → `feature/epic-N-<short-name>`** — feature
  branches now derive a descriptive short name from the epic spec filename. For example,
  `epic-3-user-auth.md` produces branch `feature/epic-3-user-auth`. If the spec filename
  has no suffix after `epic-N`, the branch falls back to `feature/epic-N`.
- **`start`: Step 1 extracts branch short name (new item 5)** — the short name is derived
  from the spec filename during context loading and used in Step 3 for branch creation.
- **`start`: Step 3 uses new branch format** — creates `feature/epic-N-<short-name>`
  instead of `feat/epic-N`.
- **`wrapup`: Step 1.1 uses new branch format with backwards compatibility** — checks out
  `feature/epic-N-<short-name>` first, falls back to legacy `feat/epic-N` for sessions
  started before v1.3.0.
- **`wrapup`: Step 5 uses actual branch name** — merge and cleanup reference the branch
  checked out in Step 1.1, supporting both new and legacy naming.
- **`setup`: Git Workflow audit and questions include branch naming convention** — the
  Step 2 audit checks for `feature/epic-N-<short-name>` documentation, and Step 3
  instructs the agent to include it when populating the Git Workflow section in CLAUDE.md.

---

## [1.2.0] — 2026-04-12

### Added

- **`wrapup`: Automatic doc refresh via Haiku subagent (Step 4)** — after Phase 3
  orientation, always spawns a Haiku subagent (model shorthand `haiku`, resolves to
  current version) to execute `/epic-workflow:refresh-docs` and auto-commit the results.
  Runs on the feature branch before the final merge so refreshed docs are included in
  the merge commit.

### Changed

- **`wrapup`: Removed optional documentation nudge (Step 3.5)** — the manual currency
  check and "consider running refresh-docs" prompt are replaced by the automatic Step 4
  refresh. The Next Steps template no longer includes a Documentation Refresh section.
- **`wrapup`: Merge step renumbered** — "Step 4: Merge to Main" is now "Step 5" to
  accommodate the new doc refresh step.

---

## [1.1.0] — 2026-04-12

### Added

- **`start`: Feature branch automation (Step 3)** — automatically creates and checks out
  `feat/epic-N` before entering plan mode. Detects existing branch on resume and confirms
  rather than re-creating it.

- **`start`: Auto-commit after implementation (Step 11)** — commits all changes on
  completion without prompting the user. Stages specific files (not `git add -A`).

- **`start`: Next-steps nudge (Step 12)** — always presents a terse post-commit block
  pointing the user to `wrapup`, `status`, or re-running `start` to continue on the
  same branch.

- **`wrapup`: Branch checkout at load time (Step 1.1, item 7)** — checks out
  `feat/epic-N` at the start of wrapup so verification runs on the feature branch.
  Graceful fallback if the branch doesn't exist (older sessions that worked on main).

- **`wrapup`: Auto-commit after completion (Step 2.3)** — commits handoff file and
  index update without prompting the user.

- **`wrapup`: Merge to main as final step** — after Phase 3 orientation is complete,
  merges `feat/epic-N` into main with `--no-ff`, deletes the feature branch, and
  reports back. Placed last so any Phase 3 document touches remain on the branch
  until everything is finalized.

### Changed

- **`start`: Steps renumbered** — old Steps 3–10 are now Steps 4–11 to accommodate
  the new feature branch step.

---

## [1.0.0] — 2026-04-06

Initial release with 9 skills covering the full epic lifecycle:
`discover`, `plan-project`, `setup`, `add`, `start`, `pause`, `wrapup`, `status`,
`refresh-docs`.
