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

0. **Deferred organization sign-in.** If `CLAUDE.md`'s Tech Stack records
   `Auth: local accounts now, org SSO deferred`, the identity provider is not built yet. Do **not**
   write TORs whose Then clause depends on it — SSO redirects, directory-sourced role claims,
   account provisioning or deprovisioning, MFA, or organization password policy. Those belong in
   the **Coverage Gaps (explicitly deferred)** section, named as waiting on the provider epic.
   Do write, and require, the TORs the project satisfies for real today: a person sees only the
   records they own or their role grants, an unauthenticated request is rejected, and each declared
   role can do exactly what `CLAUDE.md` says it may. Add one line under each role TOR noting that
   the role is assigned in the product's own accounts until the provider epic maps it from the
   directory.

1. Read `CLAUDE.md` at the repo root. Capture: project name, tech stack, any custom
   `docs/requirements/` path override (default is `docs/requirements/`). Do not re-read if
   already in context. Specifically capture, if present:
   - **`Tool Hygiene & Operability` section** — Project type and the active (non-`N/A`)
     mechanism declarations. These drive the baseline TORs in Step 3A.2.1. Record the
     Project type; if the section is absent, infer it from the Tech Stack section
     (Electron / Tauri → Desktop app; web framework or "frontend" → Web app; otherwise treat the
     project as non-UI — CLI tool, Service, Library, or Embedded — and set
     `ux_baseline_section_present = false` silently).
   - **`UX Baseline` section** — Presence, the **Design system** declaration (a declaration
     for the walking skeleton, not a TOR), and the active (non-`N/A`) TOR lines. These drive
     the baseline UX TORs in Step 3A.2.2. Set `ux_baseline_section_present = true` when the
     section exists.
   - **`Security Baseline` section** — Note its presence. Security Baseline items are NOT
     derived as TORs (they are negative invariants); they are passed forward to `/start-epic`
     and `/wrapup-epic` via CLAUDE.md, which is auto-loaded on every session.

   If the `Tool Hygiene & Operability` section is missing, warn but allow continuation
   (the project may pre-date this convention or be opting out):
   > `Tool Hygiene & Operability` section not found in `CLAUDE.md`. Baseline tool-hygiene
   > TORs (version exposure, log startup stamping, logging convention, exit codes,
   > stdout/stderr discipline, error-message standards) will NOT be derived. To enable
   > baseline TORs, run `/peak-workflow:setup` to add the section, then re-run
   > `/peak-workflow:capture-requirements`. Continuing without baseline TORs.

   Use `AskUserQuestion`:
   - Question: `"Tool Hygiene & Operability section is missing from CLAUDE.md — continue without baseline TORs, or stop to run /setup first?"`
   - Options: `["Continue without baseline TORs", "Stop — I'll run /peak-workflow:setup first"]`

   If the user chooses Stop, end here. Otherwise, set an internal flag
   `tool_hygiene_section_present = false` and proceed; Step 3A.2.1 will be skipped.

   If the `UX Baseline` section is missing **and** the Project type is a UI type (Web app,
   Desktop app, or Hybrid with a UI), warn but allow continuation. For CLI / Service / Library /
   Embedded projects set `ux_baseline_section_present = false` silently — the section does not apply.
   > `UX Baseline` section not found in `CLAUDE.md`. Baseline UX TORs (screen states,
   > keyboard & focus, forms, destructive actions, progress feedback, layout floor, contrast,
   > reduced motion, navigation, desktop conventions) will NOT be derived. To enable them,
   > run `/peak-workflow:setup` to add the section, then re-run
   > `/peak-workflow:capture-requirements`. Continuing without baseline UX TORs.

   Use `AskUserQuestion`:
   - Question: `"UX Baseline section is missing from CLAUDE.md — continue without baseline UX TORs, or stop to run /setup first?"`
   - Options: `["Continue without baseline UX TORs", "Stop — I'll run /peak-workflow:setup first"]`

   If the user chooses Stop, end here. Otherwise, set `ux_baseline_section_present = false`
   and proceed; Step 3A.2.2 will be skipped.
2. Read `docs/product-vision-planning/product-vision.md`. If missing or skeleton (no
   substantive `## 2. Problem Statement` content), stop:
   > Run `/peak-workflow:discover` first to produce the product vision document.
3. Read `docs/product-vision-planning/concept-of-operations.md`. If missing or skeleton, stop
   with the same message.
3a. Read `docs/product-vision-planning/ux/screens.md` if it exists (written by
    `/peak-workflow:mockup` on UI projects). Capture every screen's `S-NN` ID, name, primary
    actions with their control text, and its four states (or `n/a — not data-bearing`). Set
    `screens_present = true`; Steps 3A.2, 3A.2.2, 4, and 5 use it. If absent, set it `false`
    silently — CLI / Service / Library / Embedded projects never have one.
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
- UX screens.md: [none / N screens, S-01–S-NN]
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

Feature files seed epics one-to-one in `/plan-project`, so keep each area **capability-shaped**
(something a user does — "supplier scorecards", "export") rather than layer-shaped ("database",
"API", "UI"). A layer-shaped feature file produces an epic that cannot satisfy its own Then
clauses.

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
[If tool_hygiene_section_present = true:]
Baseline tool-hygiene TORs: leading `# Tool Hygiene & Operability` section of
docs/requirements/01-<name>.feature.md
[If ux_baseline_section_present = true:]
Baseline UX TORs: `# UX Baseline` section of docs/requirements/01-<name>.feature.md,
immediately after the tool-hygiene block (say so if you want a dedicated
NN-ux-baseline.feature.md instead)
[If the ConOps names Open / Save / Import / Export and the Desktop conventions file-dialog
bullet in CLAUDE.md is N/A:]
Desktop conventions — file dialogs: the ConOps names <operation>, so the file-dialog TOR will
be derived anyway — flip the `N/A` bullet in CLAUDE.md's UX Baseline section to active.
```

Use `AskUserQuestion`:
- Question: `"Approve this feature file grouping, or tell me what to adjust (merge, split, rename, reorder)?"`
- Options: `["Approve — write the feature files", "Adjust — I'll describe the changes"]`

If the user chooses Adjust, incorporate their changes, re-present the updated grouping, and ask
again. Maximum 2 adjustment rounds — if still adjusting after round 2, apply the most recent
changes and proceed.

### 3A.2: Requirement Derivation

For each functional area, derive discrete "The {subject} shall …" requirements. Each
requirement must be:

- **Authored as a single Scenario where the title carries the full shall statement.** The
  Scenario title is the formal requirement; the Given/When/Then is the verification procedure
  that demonstrates it. There is no separate "Requirement:" or "Verification:" field — one
  Scenario, two roles. See `FEATURE_TEMPLATE.md` "Core Principle" for the full rationale.
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

When `screens_present = true`, Givens and Whens name screens and controls exactly as the
inventory does — `the Orders List (S-01)`, `the "Save" button` — never a paraphrase, so the
wireframe, the ConOps step, and the TOR agree on one name. Each data-bearing screen's empty
and error states (from the inventory's `## States`) are explicit negative-path requirements,
one TOR each, asserting the visible text and the call-to-action or retry control — except the
reference screen(s), whose empty and error states are already the 3A.2.2 Screen states TORs.

### 3A.2.1: Baseline Tool Hygiene TORs

If `tool_hygiene_section_present = false` (Step 1), skip this sub-step entirely.

Otherwise, after deriving requirements from the vision and ConOps, ensure the
`Tool Hygiene & Operability` section of `CLAUDE.md` is fully covered by TOR requirements.
For each active line in that section (non-`N/A`), derive at least one TOR — written in
normal Scenario form, with the Scenario title as a complete `shall` statement matching the
mechanism declared in `CLAUDE.md`.

Place baseline TORs in the **most appropriate functional-area feature file** (typically
the first feature file — `01-cli.feature.md` for CLI tools, `01-app.feature.md` for web
apps, `01-service.feature.md` for services, `01-api.feature.md` for libraries / SDKs,
`01-device.feature.md` for embedded).
If the natural functional area is not the first file (e.g., logging baseline belongs in a
dedicated `NN-logging.feature.md`), use that file instead. Write them under a literal
`# Tool Hygiene & Operability` section banner (`# ---` comment block per
`FEATURE_TEMPLATE.md`) — the Haiku sub-agent in 3A.5 keys on that exact heading, as it does
on `# UX Baseline` in 3A.2.2.

**Project type** and **Version single source of truth** are declarations, not TOR sources —
neither has a black-box observable, so neither yields a TOR (the same carve-out as **Design
system** in 3A.2.2). Exclude both from the Step 4 trace table and from the Step 7 "Tool
Hygiene lines covered" count.

The mappings below are the **default**; project-specific declarations in `CLAUDE.md`
override them. Project types without a column (Service or API, Library, Embedded) write each
shall-statement in the mechanism `CLAUDE.md` declares — e.g. Embedded: *"The device shall print its
name and semantic version on the debug console in response to the `version` command"*. A line
still reading `TBD — set by the walking-skeleton epic` yields a TOR stating the observable outcome
only (*"The device shall report its name and semantic version"*), with the mechanism left to the
skeleton.

| Tool Hygiene line | Default TOR shall-statement form (CLI example) | Default TOR shall-statement form (Web app example) | Default TOR shall-statement form (Desktop app example) |
|---|---|---|---|
| **Version exposure** | The tool shall report its name and semantic version to standard output when invoked with `--version`, exiting with code 0 | The web application shall expose its name and semantic version at GET `/version` as JSON `{"name", "version"}`, AND shall display the version in the application footer or About page | The application shall display its name and semantic version in an About dialog opened from Help > About |
| **Version stamped at log startup** | The tool shall emit a log line at startup containing its name and semantic version at INFO level | The web application shall emit a log line on application startup containing its name and semantic version at INFO level | The application shall write a first log line containing its name and semantic version to the electron-log file on startup |
| **Logging convention** | The tool shall emit log records at the levels DEBUG, INFO, WARN, and ERROR, in the format declared in CLAUDE.md (structured JSON / key=value / human-readable) | (same — substitute "web application") | (same — substitute "application") |
| **Exit code convention** (CLI / Hybrid only) | The tool shall exit with code 0 on success, code 1 on operational failure, and code 2 on invalid invocation | N/A | N/A |
| **stdout / stderr discipline** (CLI / Hybrid only) | The tool shall write primary data and parseable output to standard output and shall write diagnostics, progress, and log output to standard error | N/A | N/A |
| **Error message standard** | The tool shall emit user-facing error messages to standard error that name the problem AND name the next user action | The web application shall display user-facing error messages that name the problem AND name the next user action | The application shall display user-facing error messages on screen that name the problem AND name the next user action |

For each baseline TOR, write a concrete, observable Given/When/Then. Examples:

```gherkin
Scenario: [TOR-01-{XXXXXXX}] The tool shall report its name and semantic version to standard output when invoked with --version, exiting with code 0
    Given the user passes the commandline args '--version'
    When the Tool is Run
    Then the standard output should contain a line matching /^myapp v\d+\.\d+\.\d+$/
    And the exit code should be 0

Scenario: [TOR-NN-{XXXXXXX}] The tool shall emit a log line at startup containing its name and semantic version at INFO level
    Given the tool is invoked with any valid argument
    When the Tool is Run
    Then the standard error log should contain an INFO record matching /^\[INFO\] myapp v\d+\.\d+\.\d+ /
    And the log record should be the first record emitted

Scenario: [TOR-NN-{XXXXXXX}] The tool shall exit with code 0 on success, code 1 on operational failure, and code 2 on invalid invocation
    Given the user passes the commandline args '--bogus-flag'
    When the Tool is Run
    Then the exit code should be 2
    And the standard error should contain the string "Try 'myapp --help' for usage."
```

**Lines marked `N/A` in CLAUDE.md are skipped.** For example, a Web app project's
`CLAUDE.md` will mark `Exit code convention: N/A — not a CLI tool` and
`stdout / stderr discipline: N/A` — those rows produce no baseline TORs.

**Generate baseline TORs BEFORE non-baseline TORs in each affected feature file.** They
should occupy the leading TOR positions in the file. Domain-specific TORs derived from
vision / ConOps follow.

### 3A.2.2: Baseline UX TORs

If `ux_baseline_section_present = false` (Step 1), or the Project type has no user interface
(CLI tool, Service or API, Library, Embedded), skip this sub-step entirely.

Otherwise, ensure every **active TOR line** of the `UX Baseline` section of `CLAUDE.md` is
covered by TOR requirements. Active TOR lines are every bold-labelled line except
**Design system** (a declaration the walking skeleton consumes, not a requirement) and any
line marked `N/A`. For each active line derive at least one TOR — written in normal Scenario
form, with the Scenario title as a complete `shall` statement matching the convention
declared in `CLAUDE.md`. Each **Desktop conventions** bullet is its own line and yields its own
TOR (an `N/A` Desktop conventions bullet yields no TOR).

Place baseline UX TORs in the **first feature file**, immediately after the tool-hygiene
block, under a `# UX Baseline` section banner (`# ---` comment block per
`FEATURE_TEMPLATE.md`) followed by a `# Note: reference screen — <screen>` line naming the
screen every Given below is anchored on (with its `S-NN` when `screens_present = true`:
`# Note: reference screen — Orders List (S-01)`). When the inventory gives that screen's create
form its own `S-NN`, the note cites both — `# Note: reference screens — Orders List (S-01),
Order Form (S-02)` — and every Given names one of them. If the user asked for a dedicated file at
the 3A.1b grouping gate, write them to `docs/requirements/NN-ux-baseline.feature.md` instead.
Baseline UX TORs precede domain TORs, exactly like the tool-hygiene TORs.

Baseline UX TORs are **black-box and Playwright-observable**: assert on roles, visible text,
`document.activeElement`, computed styles, viewport size, and document title — never on
component internals. Anchor every baseline UX TOR's Given on **one reference screen**: the
thinnest entity list in ConOps Scenario 1, with its create form and its delete action (the
Application menu / Window stands in for Desktop conventions). When `screens_present = true`,
that is Scenario 1's thinnest list screen in `ux/screens.md` — cite its `S-NN` in the `# Note:`
line. `mockup` 3.1 makes a create form with its own actions a separate screen; when the
inventory did that, the form screen is the second reference screen — cite it in the same note
so the Forms TOR has a home, and name no third screen. If neither reference screen carries an
irreversible action in the inventory, anchor **Destructive actions** on the list screen's
row-level Delete and flag the inventory row at the 3A.1b gate. `/plan-project` reads the IDs to
pick the skeleton's screens. Those are the screens the walking skeleton in `/plan-project`
builds — Givens that name any other screen make it build that one too. Error-state and Progress
feedback Givens cite the skeleton's test-only fault / latency switch rather than a real
failure or slow operation (`Given the test fault switch forces the
data source to fail`; `Given the test latency switch delays the data source by 3 seconds`).
For a desktop app, the same assertions run through the project's Playwright Electron harness
against the dev build with a live main process.

The mappings below are the **default**; project-specific declarations in `CLAUDE.md`
override them. Where the Web app and Desktop app forms differ, both are given. Rows with
semicolon-separated clauses yield one TOR per clause.

| UX Baseline line | Default TOR shall-statement form (Web app) | Default TOR shall-statement form (Desktop app) |
|---|---|---|
| **Screen states** | The application shall render an explicit loading, empty, error, and populated state on every data-bearing screen, each distinguishable by visible text | (same) |
| **Keyboard & focus** | The application shall allow every interactive control to be reached and operated by keyboard alone with no keyboard trap; shall display a visible focus indicator on the focused control that is not obscured by sticky UI; and shall move focus into a modal dialog on open, keep Tab within it, and return focus to the invoking control on close | (same) |
| **Forms** | The application shall associate a label with every form field, shall identify each invalid field in text next to it naming the problem and the fix, and shall move focus to the first invalid field on a failed submission | (same) |
| **Destructive actions** | The application shall require an explicit confirmation before every irreversible action, with the safe option as the default and Escape cancelling | (same) |
| **Progress feedback** | The application shall show a visible progress indicator within 1 second of starting any operation longer than 1 second, and shall offer a cancel control for any operation longer than 10 seconds | (same) |
| **Layout floor** | The application shall present every screen without horizontal scrolling, overlap, or clipped controls at 320 CSS px viewport width and at 200% zoom | The application shall keep every control visible and usable at the declared minimum window size of {W} x {H}, and shall refuse to resize the window below it |
| **Contrast** | The application shall render body text at a contrast ratio of at least 4.5:1 (3:1 for large text) and control boundaries and focus indicators at least 3:1 against adjacent colors | (same) |
| **Reduced motion** | The application shall disable or replace with an instant transition all non-essential animation when the OS reduce-motion preference is set | (same) |
| **Navigation** | The application shall give every screen a unique document title, exactly one visible H1 matching it, and a primary navigation whose current item is marked with `aria-current` | The application shall give every window a unique title, exactly one visible H1 matching it, and a primary navigation whose current item is marked |
| **Responsiveness budget** (if not `N/A`) | The application shall render the primary screens at the 75th percentile with LCP ≤ 2.5 s, INP ≤ 200 ms, and CLS ≤ 0.1 | The application shall acknowledge every interaction on screen within {N} ms |
| **Undo** (if not `N/A`) | The application shall offer an Undo action for at least 5 seconds after a reversible action, and shall preserve unsaved form input across a reload of the same screen | (same) |
| **Desktop conventions** — menu | N/A | The application shall provide a menu bar with the platform's standard menus and standard roles for Undo, Redo, Cut, Copy, Paste, Select All, Close, Minimize, and Quit; Help > About is the in-app item declared under Version exposure |
| **Desktop conventions** — accelerators | N/A | The application shall bind each primary command to the platform's standard `CmdOrCtrl` accelerator and display the accelerator on its menu item |
| **Desktop conventions** — window state | N/A | The application shall restore the main window's last size, position, and maximized state on relaunch, clamped to a visible display |
| **Desktop conventions** — single instance | N/A | The application shall focus and restore the running window when launched a second time instead of starting a second instance |
| **Desktop conventions** — file dialogs | N/A | The application shall use the platform's native file dialog with file-type filters for Open, Save, and Export |

Error-message wording is covered by the Tool Hygiene **Error message standard** TOR in
3A.2.1 — do not derive a second TOR for it here.

For each baseline UX TOR, write a concrete, observable Given/When/Then. Examples:

```gherkin
# Note: reference screens — Projects List (S-01), Project Form (S-02)

Scenario: [TOR-01-{XXXXXXX}] The application shall render an explicit empty state when a list screen has no items
    Given the user is authenticated and owns zero projects
    When the user navigates to the Projects List (S-01)
    Then the main content region should contain visible text "No projects yet"
    And the main content region should contain a "Create project" button
    And no element with role "progressbar" should be visible

Scenario: [TOR-01-{XXXXXXX}] The application shall render an explicit error state when a data-bearing screen fails to load
    Given the test fault switch forces the data source to fail
    When the user navigates to the Projects List (S-01)
    Then the main content region should contain visible text "Could not load projects"
    And the main content region should contain a "Retry" button

Scenario: [TOR-01-{XXXXXXX}] The application shall identify an invalid form field in text that names the problem and the correction
    Given the Project Form (S-02) is open
    When the user leaves the Name field empty and activates the "Create" button
    Then the Name field should have aria-invalid="true"
    And an element referenced by the Name field's aria-describedby should contain text "Enter a project name"
    And focus should be on the Name field

Scenario: [TOR-01-{XXXXXXX}] The application shall require confirmation before deleting a record, with Cancel as the safe default
    Given the Projects List (S-01) lists a project named "Q3 Report"
    When the user activates the "Delete" button for "Q3 Report"
    Then a dialog with role "dialog" and aria-modal="true" should be visible containing the text "Delete Q3 Report?"
    And document.activeElement should be the Cancel button
    When the user presses Escape
    Then the dialog should not be visible and "Q3 Report" should still be listed

Scenario: [TOR-01-{XXXXXXX}] The application shall focus the running instance when launched a second time
    Given the application is running with its main window minimized
    When the user launches the application executable again
    Then within 2 seconds exactly one application process should exist
    And the main window should be restored and focused
```

**Lines marked `N/A` in CLAUDE.md are skipped.** For example, a Web app project's
`CLAUDE.md` will have no **Desktop conventions** line and will typically mark
`Responsiveness budget: N/A` and `Undo: N/A` — those rows produce no baseline TORs.

One exception: setup defaults the Desktop conventions file-dialog bullet to `N/A` before a
ConOps exists. If the ConOps names Open, Save, Import, or Export and that bullet is still
`N/A`, derive the file-dialog TOR anyway and flag the `CLAUDE.md` bullet at the 3A.1b grouping
gate for the user to flip to active.

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
> — do not copy source text. Read the `Tool Hygiene & Operability` and `UX Baseline` sections
> of `CLAUDE.md`. Scenarios under the `# Tool Hygiene & Operability` banner or the
> `# UX Baseline` banner trace to `CLAUDE.md` — record them under `traces_to.claude_md`,
> citing `section` (`Tool Hygiene & Operability` or `UX Baseline`) and copying the bold label
> verbatim into `line` (for Desktop conventions, `Desktop conventions — <bullet>`); never
> record them as `orphan_requirement`. If no credible trace can be found for a requirement,
> record it under `coverage_gaps` with `gap_type: "orphan_requirement"`. Also enumerate ConOps scenario
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
   Record the changelog path for archival in Step 6. A changelog whose "New Capabilities
   Identified" reads "None — UX concretization only" (written by `/peak-workflow:mockup`) is
   still consumed and archived; its `## UX Changes` rows are the inputs for 3B.2.

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

Read all existing `.feature.md` files. For each new capability from the delta (and each
`## UX Changes` row — an Added screen's states and primary actions, a Modified screen's changed
control text or states — when the changelog has that section):
- **Already covered by an existing TOR?** → Skip. Note: "already covered by `TOR-NN-XXXXXXX`".
- **Extends an existing TOR's scope?** → Flag. This is a potential requirements change, which
  is a change-control event. Surface to user:
  > The following existing TOR may need to be modified: `TOR-NN-XXXXXXX` in
  > `docs/requirements/{file}`. Modifying a merged requirement is a change-control event.
  > Options: (1) Add a new TOR alongside the existing one, (2) Modify the existing TOR's
  > scenario (requires stakeholder review), (3) Defer.
  Use `AskUserQuestion` with these options. Wait for answer before proceeding.
- **Genuinely new?** → Add as a new TOR requirement per 3A.2 rules.

**UX Baseline added after the baseline (UI projects only).** If
`ux_baseline_section_present = true` and no existing TOR traces to any `UX Baseline` line
(the project added the section after its first requirements capture), treat every active
TOR line of the section as part of the delta: derive TORs per Step 3A.2.2 and append them per
3B.3 under a section banner `UX Baseline (added YYYY-MM-DD)` in the first feature file, or in
a new `NN-ux-baseline.feature.md` if the user prefers at the 3B.3b gate. Lines already covered
by an existing TOR are skipped.

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
- **Every active (non-`N/A`) line in the `Tool Hygiene & Operability` section of `CLAUDE.md`,
  if `tool_hygiene_section_present = true`.** Cite each as `CLAUDE.md Tool Hygiene: {line label}`
  (e.g., `CLAUDE.md Tool Hygiene: Version exposure`). Each must map to at least one
  baseline TOR generated in Step 3A.2.1. **Project type** and **Version single source of
  truth** are declarations, not rows (3A.2.1).
- **Every active TOR line in the `UX Baseline` section of `CLAUDE.md`, if
  `ux_baseline_section_present = true`** (one row per **Desktop conventions** bullet). Cite
  each as `CLAUDE.md UX Baseline: {line label}` (e.g., `CLAUDE.md UX Baseline: Screen states`,
  `CLAUDE.md UX Baseline: Desktop conventions — single instance`). Each must map to at least
  one baseline UX TOR generated in Step 3A.2.2. **Design system** is not a row.
- **Every data-bearing screen's empty and error states, and every primary action, in
  `ux/screens.md`, if `screens_present = true`.** Cite each as
  `UX screens: S-NN <state|control text>` (e.g., `UX screens: S-01 empty`,
  `UX screens: S-02 "Save" button`). A screen's loading and populated rows are not inputs of
  their own — they map to the 3A.2.2 Screen states TOR and to the domain TOR that renders the
  screen. The Application menu and Window rows trace through the Desktop conventions rows
  above, not here.

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
- [ ] Every `Scenario:` title, after the `[TOR-NN-XXXXXXX]` tag, is a full sentence
  containing the word `shall` (e.g., `The tool shall …`, `The system shall …`). Reject
  fragments, bare noun phrases, and titles using `should` / `will` / `may` / `must` / `can`
  in the normative slot.
- [ ] No use of Gherkin features the template excludes: no `@tags`, no `Background:`,
  no `Rule:`, no `Scenario Outline` / `Examples:`. Use Doc Strings (`"""`) and Data Tables
  for multi-line literal content and tabular data where they aid readability.
- [ ] Every `Feature:` has the `As a … / I want … / So that …` triad.
- [ ] Every `.feature.tracing.json` sidecar exists for every `.feature.md` file.
- [ ] No `coverage_gaps` with `gap_type: "orphan_requirement"` remain unaddressed.
  (Orphan requirements must either gain a source trace — vision, ConOps, or a CLAUDE.md
  baseline line — or be removed.)
- [ ] If `tool_hygiene_section_present = true`: every active (non-`N/A`) line in
  `CLAUDE.md`'s `Tool Hygiene & Operability` section (excluding **Project type** and
  **Version single source of truth**) is covered by at least one TOR, placed under the
  `# Tool Hygiene & Operability` banner before any domain TOR. The trace appears in the
  Step 4 trace table with the source `CLAUDE.md Tool Hygiene: {line label}` and
  `Explicit? = Y`.
- [ ] If `ux_baseline_section_present = true`: every active (non-`N/A`) TOR line in
  `CLAUDE.md`'s `UX Baseline` section (excluding **Design system**) is covered by at least one
  TOR, placed under the `# UX Baseline` banner before any domain TOR. The trace appears in the
  Step 4 trace table with the source `CLAUDE.md UX Baseline: {line label}` and `Explicit? = Y`.
- [ ] If `screens_present = true`: every data-bearing screen's empty and error states are
  covered by a TOR whose Given/When/Then names the screen by `S-NN` and cites the state's
  visible text and control from `ux/screens.md`.

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
- Baseline tool-hygiene TORs: {H} [or "skipped — Tool Hygiene section absent"]
- Baseline UX TORs: {G} [omit row if not a UI project; "skipped — UX Baseline section absent" if a UI project without the section]
- ConOps scenario steps covered: {X} of {Y}
- Product Vision goals/scope items covered: {A} of {B}
- Tool Hygiene lines covered: {T} of {U} [omit row if section absent; Project type and Version single source of truth are declarations and do not count]
- UX Baseline lines covered: {V} of {W} [omit row if not applicable; each non-`N/A` Desktop conventions bullet counts as its own line]
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

**Do NOT commit.** The full planning sequence (`discover` → optional `mockup` →
`capture-requirements` → `plan-project` → optional `add`) runs on the `docs/` branch before
the user merges. The merge (solo or team PR) is the approval gate for the entire requirements
and plan as a unit.
