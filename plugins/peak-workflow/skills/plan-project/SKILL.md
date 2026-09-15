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

1. Read `CLAUDE.md` at the repo root for project context and tech stack. Capture the
   **Project type** from its `Tool Hygiene & Operability` section and, when present, the
   **UX Baseline** section (design system, app shell, screen-state and keyboard conventions) —
   Step 3A.1 uses both to shape the walking skeleton. Also capture the `**Product shape:**` block
   when present — a row it records as `N/A — <reason> (shape Q<N>)` is a decision, not a gap.
1b. Read `docs/design-notes.md` when it exists. A numbered decision there that names deferred work
   (for example *Organization Sign-In Deferred*) is an epic this plan must carry — Step 3A.4 places
   it. A decision with no epic is the failure mode this read exists to prevent.
2. Read `docs/product-vision-planning/product-vision.md` — if it does not exist or is a placeholder, stop and tell the user to run `/peak-workflow:discover` first.
2b. **Blockers from discovery.** Grep `docs/product-vision-planning/concept-of-operations.md` for
   `**Open — blocks planning:**` and `— NOT present`. Any hit stops this skill: quote the line and
   tell the user it must be resolved (by re-running `/peak-workflow:discover`) before planning.
3. Read `docs/product-vision-planning/concept-of-operations.md` — if it does not exist or is a placeholder, stop and tell the user to run `/peak-workflow:discover` first.
4. **Load TOR requirements baseline.** Glob `docs/requirements/*.feature.md`. For each file:
   - Parse every `Scenario: [TOR-NN-XXXXXXX]` block: capture the TOR ID, scenario title, feature file path, and full Given/When/Then.
   - Note the feature file number (`{NN}`) and functional area name.
   If `docs/requirements/` does not exist or contains no `.feature.md` files, stop:
   > The requirements baseline is empty. Run `/peak-workflow:capture-requirements` first to
   > derive formal TOR requirements from the vision and ConOps documents. `/plan-project`
   > derives epics from TOR IDs, not directly from ConOps scenarios.
5. **Load tracing sidecars.** Glob `docs/requirements/*.feature.tracing.json`. For each, read the vision and ConOps linkage for supplementary context when writing epic Descriptions.
6. **Load the screen inventory (UI projects).** Read `docs/product-vision-planning/ux/screens.md` if present (written by `/peak-workflow:mockup`). Capture every `S-NN` ID, name, wireframe path (the `Wireframe` column — `wireframes/S-NN-{kebab}.html`, relative to `ux/`, or `—`), states, and the per-scenario `## Flows`. Set `screens_present = true`; Steps 3A.1, 3A.2, 4, 5.2, and 6 use it. Absent → `false`, no comment.

## Step 2: Detect Greenfield vs Brownfield

1. Check whether any `docs/implementation-plan/phase-*/index.md` files exist and contain epic rows (data rows beyond the header that follow the `| Epic | Name | Dependencies |` schema).

**Greenfield** = no phase index files exist, or all phase index files are empty or contain only the header row. Proceed to Step 3A.

**Brownfield** = at least one phase index file exists with one or more epic rows. Proceed to Step 3B.

**Existing code** is a separate signal: a build manifest at the root or one level down
(`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `*.csproj`, `*.sln`, `CMakeLists.txt`,
`platformio.ini`, `Makefile`) or a populated `src/`. A repository with code but no epics is
**Greenfield with existing code** — Step 3A applies, and 3A.1 extends the code instead of
scaffolding.

Report the detection result:
```
Mode: [Greenfield / Greenfield with existing code / Brownfield]
Existing epics: [N epics across M phases / none]
```

## Step 3A: Greenfield — Full Derivation

Epics are **vertical slices**, not implementation layers. A TOR is a black-box, user-observable
behavior (see `capture-requirements` 3A.2), so an epic that owns a TOR must be able to make that
behavior observable end to end — schema, service, endpoint, and screen together, whatever the
TOR needs. Do not form a "backend epic" and a "frontend epic" for the same behavior: the backend
half can never satisfy the Then clause, which forces a deferral that the verification gates then
have to catch. One horizontal epic is the exception, and it always comes first.

### 3A.1: Walking Skeleton (Epic 0)

Form exactly one horizontal epic that stands the system up end to end with no domain logic:
project scaffolding (including a tech-stack `.gitignore` — `setup` 7.4 only warns when one is
missing), build and test tooling, dev environment, CI (only when `CLAUDE.md`'s Release Protocol
or `**Not decided yet:**` line names one), and the thinnest possible path through
every layer the product has. The **tool-hygiene baseline TORs** captured in
`capture-requirements` 3A.2.1 (version exposure, startup log line, logging convention, error
message standard, and for CLIs exit codes and stdout/stderr discipline) are this epic's
Requirements Anchors — they already touch every layer with no domain logic. If neither
tool-hygiene nor baseline UX TORs exist (`capture-requirements` skipped 3A.2.1 and 3A.2.2), the
skeleton has `requirements: —` (5.3b) and its spec Description states that wrapup verifies the
architectural pattern only.

**Greenfield with existing code:** the skeleton never re-scaffolds, never runs a project
generator, and never reads a reference sheet. It extends what is there: adds only the layers
`CLAUDE.md`'s `**Not decided yet:**` line lists or marks `TBD`, replaces template sample code (e.g. a
`WeatherForecast` endpoint) with the tool-hygiene baseline, and adds the version element when the
manifest lacks it. Name every existing project and file the skeleton will modify in Key Components.

A sheet's sample domain (the web sheet's `conversations` / `messages`) is illustrative: the
skeleton replaces it with the entity the reference screen needs, keeping the same file shapes.

The skeleton's job is to establish the architectural pattern every later slice follows (how a
request reaches a handler, how a screen calls the API, how the firmware reaches the hardware
abstraction, where tests live). Its spec Description
must say so, and must state that `docs/architecture.md` records the pattern once the skeleton
is complete.

**UI products (Project type Web app, Desktop app, or a Hybrid with a UI):** the skeleton also
owns the design system and the app shell. The **baseline UX TORs** captured in
`capture-requirements` 3A.2.2 (Screen states, Keyboard & focus, Forms, Destructive actions,
Progress feedback, Layout floor, Contrast, Reduced motion, Navigation, and the Desktop
conventions) join the tool-hygiene TORs as this epic's Requirements Anchors. To satisfy them the
skeleton must:

- Install the design system declared in `CLAUDE.md`'s **UX Baseline** section (default:
  shadcn/ui on Tailwind, themed only through the CSS-variable tokens in the global stylesheet —
  never by editing generated component files). When `CLAUDE.md`'s Tech Stack came from a
  reference sheet (`/peak-workflow:setup` names which one), scaffold from that sheet rather
  than from a generator: create the tree in its **Section 3 Repository Layout** and write the
  files in its **Section 4 Configuration Files** verbatim, substituting the project name — except
  what the sheet's **Section 2.1 Dropping a layer** table removes for every row `CLAUDE.md` marks
  `N/A` (and, on the desktop sheet, the blocks for operating systems not in `Target OS`; for a
  Service or API on the web sheet, everything under `apps/web/` and its Vite, router, and
  component-test configuration, which `setup` marks `N/A — no user interface (Service or API)`)
  — then `bun install`. Writing the files directly is what the sheet is for — no scaffolder is
  involved, so nothing collides with the `CLAUDE.md`, `docs/`, `README.md`, `CHANGELOG.md`, and
  `.gitignore` already in the repo root. Then `bunx shadcn@latest init` for the renderer on the
  web and static sheets (both carry the `@tailwindcss/vite` plugin and the path aliases in their
  Vite config). The desktop sheet ships `components.json`, `lib/utils.ts`, and the token stylesheet
  itself — `init` does not recognize electron-vite — so run only `bunx shadcn@latest add <name>`
  there. Static-SPA specifics the sheet supplies and the skeleton must not drop: hash history
  on the router (a static host has no rewrite rules), `base` taken from `BASE_PATH` so the
  GitHub Pages project path resolves, `__APP_VERSION__` injected from `package.json#version`
  (this is the Version exposure mechanism — the footer and the first console line both read it),
  the Dexie `version().stores()` block, `fake-indexeddb` preloaded for tests, the JSON
  export/import pair, and the deploy workflow in `.github/workflows/`. Web-sheet specifics the
  skeleton must not drop: `packages/core/src/app.ts` as the one reader of `package.json#version`,
  feeding `GET /version`, the footer, and the first log line from `apps/api/src/logger.ts`; the root
  `tsconfig.json`; the auth `basePath`; and Playwright's `testDir: "tests/e2e"`. Desktop specifics the
  sheet supplies and the skeleton must not drop:
  `trustedDependencies` (`electron`), better-sqlite3's N-API prebuilds with no native rebuild
  (`npmRebuild: false`), `asarUnpack` for `better-sqlite3`, `contextIsolation` +
  `sandbox` + `nodeIntegration: false`, Zod-validated IPC, and `migrate()` at startup resolving
  the SQL folder from `process.resourcesPath` when packaged.
- Build the app shell: layout, primary navigation, theme / dark-mode wiring, and for desktop
  apps the application menu, window-state persistence, and the About dialog.
- When `CLAUDE.md`'s `**Product shape:**` block records `**Access rule:** owner-or-permitted-role`
  (every sign-in project), the skeleton owns: the sheet's auth layer with sign-in working for real
  (no placeholder identity, no anonymous fallback, no header-asserted user), an owner column on
  every table, one **owner-or-permitted-role** access rule that every route calls, and the role
  field plus the roles named in `CLAUDE.md` when the roles follow-up was yes. A **named** provider
  is configured in the skeleton too, with tests signing in through the email-and-password helper,
  in the audience mode `CLAUDE.md` records (org-only or mixed). The skeleton plan includes a plain
  checklist for the person who administers the provider — create the OAuth client, register the
  local and production callback URLs, set the consent screen's audience and publish it (an
  unpublished app admits only listed test users), and paste the client ID and secret into `.env`.
  Substitute the role names `CLAUDE.md` records into the sheet's single roles constant — nowhere
  else.
  When the Tech Stack records `Auth: local accounts now, org SSO deferred`, the organization's
  provider is **its own later epic** — see Step 3A.4. Name the access rule, the owner columns, and
  the auth configuration in Key Components.
- Ship **one reference screen** that renders the loading, empty, error, and populated states and
  passes every baseline UX TOR. It is the pattern every later screen copies. The reference
  screen is the screen the baseline UX TORs name (the `# Note: reference screen` line under
  the `# UX Baseline` banner — the thinnest entity list from ConOps Scenario 1 with its create
  form and its delete; when `screens_present = true`, every `S-NN` that note names — the list
  screen and, when `mockup` made the create form its own screen, that form screen too — each
  listed in the skeleton spec's `## Screens` section); that is the minimum surface the Forms,
  Destructive actions, and Progress feedback TORs need; a file-dialog TOR needs one Export
  action on it. The screens the note names are skeleton-owned: a later slice that extends one
  of them does not re-list it. "No domain logic" means no business rules, not no data.
- Ship a **test-only fault / latency injection switch**: an environment variable read at
  startup (a build-time `import.meta.env` flag for a static SPA, which has no process
  environment), honored by the E2E harness, and ignored in anything a user runs — a packaged
  desktop app (`app.isPackaged`), a production server (`NODE_ENV=production`,
  `ASPNETCORE_ENVIRONMENT=Production`), a deployed static build. The harness runs
  the production build, so "ignored in production builds" is the wrong gate. The error-state and
  Progress feedback TORs cite it in their Givens — an app with a local database has nothing else
  to throttle or fail. Ship a **test-only data reset** beside it, in the form the stack actually
  has: a desktop app redirects the database location (normally `app.getPath('userData')`) to a
  fresh temp directory per test via an environment variable; a served web app points at a throwaway
  database file the same way; a static SPA has no process environment and no data directory, so it
  deletes and recreates its IndexedDB database in the harness's per-test setup (the static sheet's
  Section 7 shows this). Either way, empty-state, populated-state, and destructive-action Givens
  start from an empty database instead of the developer's live data. Name both switches in Key
  Components.
- Make the **E2E harness self-contained**: its `globalSetup` (or the `test:e2e` script) runs the
  production build the entry point needs (reference-sheet desktop stack: `bun run build`, whose
  electron-vite output is the `out/main/index.js` that `package.json#main` points at, and the sheet's Section 7 E2E example launches the app directory (`args: ["."]`) so Electron reads that `package.json`;
  static SPA: the sheet's `webServer` command builds and previews the bundle; web: the Vite
  build) and the launcher targets the built entry, so the Tests command in `CLAUDE.md` works
  cold in a fresh wrapup session.

**Every project type — resolve the deferred setup values.** `/peak-workflow:setup` writes
`TBD — set by the walking-skeleton epic` wherever nothing could decide a value before code existed
(typical on Embedded: board, build and flash commands, logger location, version channel). Grep
`CLAUDE.md` for `TBD — set by the walking-skeleton epic`, `— unconfirmed`, and `Board: not chosen`,
and read the `**Not decided yet:**` line. Once every layer on that line is a Tech Stack row, the
skeleton deletes the line. The skeleton spec's Description lists every hit, and the skeleton
replaces each one in `CLAUDE.md` with the real command, path, or mechanism it established — on its
own feature branch, so wrapup sees the change. A value that costs money or means buying hardware
(the board, a hosting provider, an email delivery provider) or depends on a team's accounts and
policies (a CI provider) is
confirmed with the user in the start-epic plan before it is resolved — never picked silently. A skeleton that leaves one behind fails wrapup's TBD gate.

**Every project type with data or outputs — the test-only fault switch.** The fault / latency
switch and data reset described for UI products apply to a Service or API, a CLI tool, and a
desktop app alike (an environment variable read at startup, ignored in anything a user runs), so
an error-path TOR such as "database unavailable" has a Given to cite.

**Bench only, for anything that switches mains power or heat.** Every `tests/hil/` run — automated or
operator-observed — happens on the bench: the equipment unplugged from mains, the output wired to an
indicator lamp or LED instead of the load. `start-epic` and `wrapup-epic` ask the user before each run to confirm that setup in one
plain question (*"Is the kiln unplugged, with the relay driving the test lamp?"*); if they cannot
confirm, do not run it. The harness
itself refuses to run a mains or heat output check unless an environment variable such as
`HIL_BENCH=1` is set, so no command line can drive live equipment by accident.

**Embedded products — the skeleton also owns the hardware-in-the-loop harness:** a script under
`tests/hil/` that talks to the connected board over its debug or serial port non-interactively
(port from `HIL_PORT`, a timeout, captured output asserted like any test), flashing the current
build first (the debug build for fault-injection checks, the release build for the version and
boot-banner checks). The device-side Tool Hygiene TORs (version, boot banner) are verified through it.
The skeleton keeps every output de-energized — it proves the hardware abstraction reads inputs
and reports, but never switches a heater, motor, or relay on; the first epic that drives an output
ships that output's Safety TORs. It also owns **fault injection for Safety TORs**: a debug-build-only console command (compiled out
of release builds by a build flag, so shipped firmware cannot be told to fake a fault) or a
physical fault fixture on the bench (e.g. a switch that disconnects the sensor). Record in
`CLAUDE.md` Local Environment a `HIL port:` line naming the variable and how to find the port on
the user's OS, label the harness command `(tests/hil)` on the `Verification & Quality Gates` Tests
line, and name the harness and the fault mechanism in Key Components.

**Reference stacks (greenfield only).** The sheet named in `CLAUDE.md`'s Tech Stack — under the
installed plugin's `references/` directory (`${CLAUDE_PLUGIN_ROOT}/references/`, not a path
inside the user's repository): `bun-web-app-stack.md` for a web app or service,
`bun-static-spa-stack.md` for a browser-only SPA, `bun-electron-desktop-stack.md` for a desktop
app — is the skeleton's build instructions: Section 2 is the stack, Section 3 the tree, Section 4
the config files, and the later sections the wiring (data access, IPC or routes, tests,
packaging). Its *Stack Summary* table is also the checklist for "every layer the product has" —
if the skeleton does not touch a layer the table names, that layer is missing from the skeleton.
Three limits: a pick the user overrode during `/peak-workflow:setup` is recorded in `CLAUDE.md`
and wins over the sheet; a row `CLAUDE.md` marks `N/A — <reason> (shape Q<N>)` is a recorded
decision, so it is **not** a missing layer and the skeleton must not build it back (a row marked
`org SSO deferred` is the exception — the layer is built now, and one later epic adds the
organization's provider to it); and in
**Brownfield mode (Step 3B) and Greenfield with existing code the sheets play no part at all** —
never plan an epic that re-platforms an existing codebase toward a sheet.

No later epic installs a component library, defines tokens, or builds a second shell — a slice
composes its screens from the skeleton's shell and the reference screen. The skeleton's Key
Components must name the design-system files (`components.json`, the global stylesheet,
`components/ui/`), the shell, the reference screen, and the fault / latency switch, and its
Description must state that `docs/architecture.md` records the token file and the
screen-composition pattern.

### 3A.2: Vertical Slices by Capability

Cluster the remaining TOR IDs by **what a user can do once the slice ships**. The clustering key
is the ConOps scenario / vision goal each TOR traces to — already loaded from the tracing
sidecars in Step 1 item 5 — not the subsystem the TOR touches. When `screens_present = true`,
the per-scenario flows in `ux/screens.md` are a second clustering signal: the screens a flow
walks through belong to the slice that ships that scenario (except the reference screens the
`# Note:` line names — those stay with the skeleton, 3A.1), and the TORs that name those
screens (`S-NN` in their Given/When) travel with them.

- **Seed:** one slice per feature file. Feature files are functional areas and are already
  capability-shaped.
- **Split** a feature file into two slices only when it holds more than one distinct ConOps
  scenario (e.g., "search: basic" and "search: filters & sort"), and then split along the
  scenario boundary.
- **Merge** two adjacent feature files into one slice when each is small and they serve the
  same scenario.
- A slice spans every layer it needs. The spec's Key Components section uses `### Backend` /
  `### Frontend` subheadings when both are involved.
- **Cross-cutting TORs** (logging conventions, performance budgets, accessibility baselines)
  belong in the skeleton, or in one small hardening epic at the end of the plan. Never spread
  them across slices. **Safety TORs are the exception** (the `# Safety` banner from
  `capture-requirements`): each belongs to the **first epic that drives the output it protects** —
  the over-temperature cutoff ships in the same epic that first switches the heater on, never in
  a later hardening epic. Baseline UX TORs always go to the skeleton (3A.1) — they are verified on
  the reference screen once, and every later screen inherits the pattern.

### 3A.3: Sizing — the Whole-Capability Rule

**Every TOR in an epic must be fully realizable inside that epic.** No Then clause may depend on
code a *later* epic creates. A Then clause may rely on code an *earlier* epic creates (an export
TOR that needs auth's role check) — declare that as a functional dependency in 3A.4; do not
widen. Widen the slice only when no earlier epic owns the code the TOR needs — never split the
TOR across epics, and never park it in a layer epic.

Prefer the **fewest epics** that satisfy this rule. Every epic pays a fixed cost regardless of
size — a start-epic plan, a separate blind wrapup session, a PR — and an oversized epic is cheap
to split later (`/pause`, then `/add` for the remainder) while an over-split plan pays that cost
on every epic. Do not size epics by predicted context usage; that cannot be measured here, and
the operator watches the meter in `/start-epic`.

Count is a sanity check only, not a target. The walking skeleton is exempt from the count
check — its size is set by the baseline sections.
- More than **~20 TOR IDs** → split by ConOps scenario (3A.2).
- Fewer than **~4 TOR IDs** → merge with the adjacent slice from the same scenario, unless the
  TORs are individually heavy (doc strings, data tables, a `docs/reference/` dependency) — then
  say so in the spec Description.

Each epic must also:
- Have a clear "done" state: every covered TOR ID has an implementation and a passing test
- Be independently implementable once its dependencies are met
- Own each of its TOR IDs exclusively — a TOR ID appears in exactly one epic (Step 6 enforces this)

**Assign epic IDs:** for each new epic, generate a fresh **7-character random alphanumeric ID** via:

```bash
LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7
```

The `LC_ALL=C` prefix is required for portability — without it, BSD `tr` (macOS) can emit "Illegal byte sequence" on non-UTF8 bytes from `/dev/urandom`.

Validate each ID: if the 7-char string contains only digits, regenerate (this prevents the rare case where a random ID would be ambiguous with the legacy integer format). Also ensure uniqueness across the batch — extremely unlikely, but check.

Example IDs: `a3f2K7p`, `B9xQr2z`, `m4Ljf0T`.

**Do not** use incrementing integers or decimals for new epics. Random IDs eliminate collisions when multiple developers run `/add` or `/plan-project` concurrently, so the concept of "insertion order" no longer applies — ordering within a phase is by insertion time in the index.

### 3A.4: Phase Structure — Value Milestones

**Deferred-decision epics.** Epics are otherwise formed by clustering TOR IDs (3A.2), so an epic
with no TOR IDs of its own can never arise that way and would be lost. For each deferred decision
captured from `docs/design-notes.md` in Step 1, create one epic explicitly:

- Name it for the decision (e.g. `Organization Sign-In`), give it `requirements: —`, and cite the
  design-notes section in its Description as the reason it exists.
- Place it in the **last phase**, and record in the phase index that no production release should
  precede it. Its trigger is external (the user confirming the provider), so it is scheduled, not
  blocked on other epics.
- Scope it from the decision's own text rather than assuming a one-line swap — for an identity
  provider that means the callback route, session configuration, mapping directory groups onto the
  project's roles, and updating the end-to-end sign-in helper.
- Because it has no TOR IDs, the "every covered TOR has a passing test" criterion is vacuous for it.
  State its done-criterion in the spec instead, in terms of the behavior the decision describes.


Phases are milestones of user value, not architectural layers. Start from this template and
adapt:

1. **Foundation** — the walking skeleton (3A.1). Exactly one epic.
2. **Core** — the minimum set of slices that make the primary ConOps scenario work end to end
   (the first thing a user could actually do with the product).
3. **Extend** — further ConOps scenarios in priority order (from the vision's Priority Signal
   or the ConOps scenario ordering). Split into multiple phases when there are natural release
   boundaries.
4. **Harden** — only if there are cross-cutting TORs left over from 3A.2 (a small hardening epic)
   or deployment / QA work that has TORs of its own.

Remove phases with no work. Name phases after the milestone ("Scorecard export", "Supplier
onboarding"), not the layer. Dependencies between epics are functional — "needs auth", "needs
the scorecard list" — never architectural ("needs the data layer"); an epic that only needs the
skeleton depends on Epic 0 alone, which is what makes slices parallelizable.

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
- Does its functional area overlap an existing epic? → Consider adding to that epic if it is
  Not Started and the whole-capability rule still holds. Flag for user confirmation.
- Is it genuinely new capability in a new area? → Add to the new epic list.

### 3B.3: Form New Epics

Apply the same epic formation rules as greenfield (vertical slice per capability, the
whole-capability rule from 3A.3, exclusive TOR ownership, ~4–20 TOR IDs as a sanity check). New
epics are added to the phase whose milestone they extend, or to a new phase when they open a new
ConOps scenario.

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

| Phase | Epic | Name | Dependencies | TOR IDs | Feature Files | Screens | Layers touched |
|-------|------|------|--------------|--------:|---------------|---------|----------------|
| 1 | a3f2K7p | Walking skeleton | — | [N] | 01-app.feature.md | S-01 | all |
| 2 | B9xQr2z | [Capability name] | Epic a3f2K7p | [N] | 02-auth.feature.md | S-02, S-03 | db, api, ui |
| ... | ... | ... | ... | ... | ... | ... | ... |

The "Layers touched" column is how the user checks that slices are vertical — a domain epic
showing a single layer is a sign the clustering slipped back to layers. Derive the layer names
from the tech stack in `CLAUDE.md` (e.g., `db, api, ui`). For a single-process product (CLI
tool, library) write `single-process` for every epic; the vertical check does not apply.

The "Screens" column appears only when `screens_present = true` — omit it otherwise. List the
`S-NN` IDs the epic delivers, or `—` for an epic with no screen. Every screen in `ux/screens.md`
appears in exactly one row (the Application menu and Window rows go to the skeleton; `mockup`
draws no wireframe for them).

### Dependency Graph

[ASCII tree showing dependencies — same format as existing index.md]

### Parallelization Opportunities

[List epics that can be worked on in parallel because they share no dependencies]

### Estimated Scope

- Total epics: [N]
- Total TOR IDs covered: [N]
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

For each epic, write the spec file following the exact format below (the same format as `/peak-workflow:add`). This format is read by `/peak-workflow:start-epic` and `/peak-workflow:wrapup-epic`.

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
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.
> If a feature file has been updated since this spec was written and a scenario no longer matches
> its cited TOR ID, stop and surface the discrepancy to the user before proceeding — do not
> silently implement against stale requirements.

| TOR ID | Feature File | Scenario Title |
|--------|--------------|----------------|
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` | {Scenario title verbatim from the feature file} |
| TOR-{NN}-{XXXXXXX} | `docs/requirements/{NN}-{name}.feature.md` | {Scenario title verbatim from the feature file} |

## Screens

| Screen | Wireframe | States this epic delivers |
|--------|-----------|---------------------------|
| S-NN {Name} | `docs/product-vision-planning/ux/wireframes/S-NN-{kebab}.html` | loading / empty / error / populated |

## Key Components

{List of file paths to create or modify, with brief descriptions. Use the project's actual
directory structure. Separate into ### Backend and ### Frontend subheadings if both are involved.
For a UI epic, list each screen the epic adds or changes and note that it composes from the
skeleton's app shell and design system — no new component library, no new tokens.}
```

**Conditional lines and sections in the template above** — do not carry this guidance into the written spec:

- Include the **Brand** note only if the epic involves UI work. Omit it entirely otherwise.
- Include the `**Source:** Issue #{N}` line only when the epic was spawned from a specific GitHub issue — rare from `/plan-project`, more common from `/add` after `/triage`. Omit it entirely otherwise.
- Include the `## Screens` section only for a UI epic when `screens_present = true` (Step 1 item 6). Omit it entirely otherwise. A screen appears in **exactly one** epic's Screens table — the skeleton owns every `S-NN` the `# Note: reference screen` line names (the list screen and, when listed, its form screen); a slice owns the other screens its TORs name, and a slice that extends a skeleton-owned screen does not re-list it. Copy the name verbatim from `ux/screens.md`, and the wireframe path verbatim from its `Wireframe` column, resolved under `docs/product-vision-planning/ux/`; a screen marked `n/a — not data-bearing` lists `populated` only. The Application menu and Window rows (desktop apps) carry `—` in that column and write `—` here — `mockup` draws no wireframe for them; their contract is the `ux/screens.md` row and the Desktop conventions TORs. `/peak-workflow:start-epic` reads the wireframes as the layout contract and `/peak-workflow:wrapup-epic` checks fidelity against them.

**Populating Requirements Anchors:**

`/plan-project` has a natural advantage — Step 3A.2/3B.2 already groups TOR IDs by
capability slice. For each epic, list every TOR ID assigned to it:
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
2. Run `/peak-workflow:start-epic <id>` to begin an epic (use the 7-character alphanumeric ID from the phase index)
3. Claude Code reads the epic spec, loads TOR requirements from feature files, enters plan mode, and creates tasks (one task per TOR ID or TOR group — these are user stories)
4. When implementation is done, open a new session: `/peak-workflow:wrapup-epic <id>`
5. If stopping early: `/peak-workflow:pause`

## Epic Lifecycle

```
Not Started → In Progress → Implemented → Complete
                  ^              ^             ^
    /peak-workflow:start-epic  /peak-workflow:start-epic  /peak-workflow:wrapup-epic
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
requirements baseline land in exactly one epic, explicitly and unambiguously?**

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

- A TOR ID must appear in **exactly one epic**. If it appears in two or more, list all and mark
  `Ambiguous? Y` — that is a gap: the slice was split across layers. Remediate by widening one
  epic to own the whole behavior and removing the TOR from the others (3A.3).
- **Explicit? N** — the TOR ID is not in any epic's Requirements Anchors. Gap.
- **Ambiguous? Y** — the TOR ID appears in more than one epic, or appears in an epic's
  Requirements Anchors with a scenario title that doesn't match the feature file (copy-paste
  error). Gap.
- Out-of-scope items: `Explicit? N/A — deferred: {rationale}`. List explicitly; do not hide.

When `screens_present = true`, print a second table directly below it — `## Self-Check: Screen →
Epic Trace` — one row per `S-NN` in `ux/screens.md` with columns `Screen | Captured in Epic(s)
(## Screens) | Explicit? (Y/N) | Ambiguous? (Y/N)`. The same rules apply: not in any epic's
`## Screens` section → `Explicit? N`; in two or more → `Ambiguous? Y`; the Application menu and
Window rows trace to the skeleton; a retired screen is `N/A — retired`.

### 6.3: Remediate and Re-Run

For every gap:

1. Add the missing TOR ID to the relevant epic's Requirements Anchors table and to the sidecar
   `requirements:` field. For a screen gap, add the row to (or remove it from) the epic's
   `## Screens` section so each screen has one owner.
2. If the TOR ID doesn't fit any existing epic's scope, create a new epic per Step 5.2 rules,
   then re-run Step 4 negotiation for that one epic.
3. Re-run the table(s). Iterate until every row is `Explicit? Y` and `Ambiguous? N`, or explicit
   deferral.

Do not proceed to Step 7 with unresolved gaps.

### 6.4: Keep the Final Table

The final passing table is printed as part of Step 8 summary — so the user can audit coverage,
and so future `/start-epic` and `/wrapup-epic` sessions can cross-reference which TOR IDs each epic owns.

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

## Step 8: Commit Gate, Then Present Summary & Next Steps

### 8.1: Commit Gate

`plan-project` is normally the last skill in the `discover` → `capture-requirements` →
`plan-project` chain, and all three explicitly avoid auto-committing. That means by the time
this step runs, the working tree can hold uncommitted output from **all three** stages — not
just what this run wrote. The "Recommended Next Steps" merge/push commands below only act on
what is committed, so run this gate before presenting them:

1. Run `git status --short`. If the working tree is clean, skip straight to 8.2.
2. If there are uncommitted changes, draft a commit message summarizing everything currently
   uncommitted under `docs/` (and `CLAUDE.md` if this run updated it) — not only the files this
   run itself wrote — so a discover/capture-requirements run that never got committed earlier in
   the chain is captured too.
3. Use `AskUserQuestion`:
   - Question: `"This docs/ branch has uncommitted changes — commit them now so the merge instructions below are safe to run?"`
   - Options: `["Commit with this message", "Let me edit the message first", "I'll commit myself — skip this"]`
   - **Commit with this message:** stage the specific files (never `git add -A`) and commit.
   - **Let me edit the message first:** ask for the edited message, then commit with it.
   - **I'll commit myself — skip this:** do not commit. Prefix the "Recommended Next Steps"
     block in 8.2 with: `⚠️ Uncommitted changes remain. The merge commands below only merge what
     is committed — commit first, or this work will be silently left out of the base branch.`

Do NOT commit without this confirmation exchange — the gate makes committing an explicit,
visible user decision at the one point it is actually required (immediately before the merge
instructions are printed), not a silent action taken on the skill's own initiative.

### 8.2: Present Summary

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
   TOR feature files and epic specs must land on the base branch before `/peak-workflow:start-epic`
   can load them. If `start` later reports "feature file not found", the merge was skipped.

   **Solo** (no team review needed):
   ```bash
   git checkout <base-branch>  # develop if it exists, else main, else master
   git merge docs/<task-name> --no-ff -m "docs(plan): merge docs/<task-name> — requirements and plan baseline"
   git branch -d docs/<task-name>
   git push
   ```
   **Team** (PR review required):
   ```bash
   git push -u origin docs/<task-name>
   gh pr create --base <base-branch> --title "docs: requirements and plan baseline for <project>"
   # Await PR approval before starting epics
   ```

2. **Run `/peak-workflow:start-epic <id>`** to begin the first epic (use the 7-character ID from
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

Do NOT commit on your own initiative while writing the plan (Steps 1–7). Committing only ever
happens via the explicit Commit Gate in Step 8.1, and only with the user's confirmation.
