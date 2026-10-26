---
name: capture-requirements
description: |
  Derives formal Gherkin-style TOR requirements (.feature.md files) from product-vision.md and
  concept-of-operations.md. Main agent adopts a seasoned-PM persona to author feature files
  autonomously; Haiku sub-agent verifies traceability and writes .feature.tracing.json sidecars.
  Changes to merged requirements (reword, supersede, retire, record as pending) each leave a
  Change Record in docs/requirements/changes/. With a TOR ID argument it amends that one
  requirement (e.g. one that changed since it was verified, or one known to be wrong).
  User reviews via the docs/ branch and merge — there is no inline interview.
  Run after /peak-workflow:discover and before /peak-workflow:plan-project.
  Triggers on: "capture requirements", "derive requirements", "write feature files",
  "create TOR requirements", "formalize requirements", "establish requirements baseline",
  "generate TOR IDs", "requirements capture", "amend requirement", "retire requirement",
  "supersede requirement".
argument-hint: "[TOR-ID description | brownfield-description | blank for auto-derivation from vision + ConOps]"
---

You are deriving a formal requirements baseline from the project's product vision and concept of
operations documents, producing Gherkin-style `.feature.md` files with `TOR-NN-XXXXXXX`
requirement IDs. This skill operates **autonomously** — no interview occurs during
derivation. The only questions are the named decisions below: the grouping gates (3A.1b,
3B.3b), the per-requirement choice for a change to a merged requirement (3B.2, 3C), the
re-litigation check (L4), and the follow-up offers in Step 7. The user reviews the output via
the `docs/` branch and the merge event is the approval gate.

The user's request / brownfield description: $ARGUMENTS

---

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On any other exit, print its output and stop — it names the fix (`/peak-workflow:upgrade`, a
plugin update, or a Python install). After this guard, read the project's files only in the
current format.

## Step 0: Branch Guard

**Right after the Format Guard:**

1. Run `git branch --show-current`. Capture the result as `<current-branch>`.
2. **TOR-ID mode** (the first word of `$ARGUMENTS` is a `TOR-NN-XXXXXXX` ID — Step 2) on
   `develop`, `main`, or `master`: this is a one-requirement change, so create its branch
   instead of stopping. If `git status --porcelain` is not empty, stop and ask the user to commit
   or stash first. Otherwise, if `git rev-parse --abbrev-ref @{u}` succeeds (the branch tracks a
   remote), run `git pull --ff-only`; then run `git checkout -b docs/amend-<tor-id-lowercased>`
   and continue at Step 1.
3. Otherwise, if `<current-branch>` is `develop`, `main`, or `master` — stop immediately:

   > `capture-requirements` modifies the requirements baseline (feature files, tracing sidecars).
   > These changes must travel through a `docs/{task-short-name}` branch so the merge event
   > serves as the approval gate. Run `/peak-workflow:discover` first — it will create the
   > `docs/` branch and chain into here. Or create the branch manually:
   > ```bash
   > git checkout -b docs/{task-short-name}
   > ```

4. If `<current-branch>` does **not** start with `docs/` (and is not develop/main/master) —
   warn the user but allow continuation:
   > Current branch (`<current-branch>`) is not a `docs/` branch. Proceeding will mix
   > requirements changes with other work on this branch.

   Use `AskUserQuestion`:
   - Question: `"Current branch is not a docs/ branch. Continue anyway, or stop to create one?"`
   - Options: `["Continue on this branch", "Stop — I'll create a docs/ branch first"]`

   If the user chooses Stop, end here.

5. If `<current-branch>` starts with `docs/` — continue. No action needed.

---

## Step 1: Load Context

0. **Sign-in projects.** If `CLAUDE.md`'s `**Product shape:**` block records
   `**Access rule:** owner-or-permitted-role` (named provider or deferred), write, and require, the
   access TORs: a person sees only the records they own or their role grants (including never
   seeing another person's identity inside a shared count or summary), an unauthenticated
   request is rejected, and each declared role can do exactly what `CLAUDE.md` says it may.
   - **Named provider:** write the provider round-trip TOR (signing in through the named provider
     lands the person in the product with their role). Automated tests sign in through the
     email-and-password test helper; tag the round-trip TOR `# Verification: operator-observed`
     (item 0c) so `wrapup-epic` asks for the observation instead of failing it.
   - **Deferred** — Tech Stack records `Auth: local accounts now, org SSO deferred`: the identity
     provider is not built yet. Do **not** write TORs whose Then clause depends on it — SSO
     redirects, directory-sourced role claims, account provisioning or deprovisioning, MFA, or
     organization password policy. Those belong in the **Coverage Gaps (explicitly deferred)**
     section, named as waiting on the provider epic. Add one line under each role TOR noting that
     the role is assigned in the product's own accounts until the provider epic maps it from the
     directory.

0b. **Safety (Embedded, or any product that switches physical equipment on or off).** Read the
   ConOps **What Must Never Happen** section `/peak-workflow:discover` writes for these products.
   Each hazard there becomes at least one TOR under a literal `# Safety` section banner, written as
   the safe outcome the product guarantees — *"The controller shall de-energize the heater relay
   within 2 seconds when the thermocouple reading is lost"*. Write the Given at the observable
   level (`Given the thermocouple reading is lost`), never naming the injection mechanism — the
   skeleton's hardware fault fixture or debug-build fault command decides how. Place the banner
   in the feature file of the capability that drives the output, directly after any baseline
   banners and before domain TORs. A hazard with no number the user gave (a limit, a time) gets
   the TOR anyway: at the 3A.1b grouping gate, ask for the value in plain words and offer a
   conservative default — never drop the TOR. If the section is missing on such a product, warn
   at 3A.1b and list the gap under Coverage Gaps. Safety TORs are never deferrable in
   `start-epic` or `wrapup-epic`, so every one must be something this product's own software can
   do and a test can check: a row marked `Assumption — hardware, outside the software` (a thermal
   fuse, a limit switch) is **not** a TOR — when the row is marked `— confirmed by the owner`, list
   it under Coverage Gaps as `hardware safeguard — outside the software, confirmed by the owner`;
   when it is marked `— NOT present` or carries no confirmation, stop and send the user back to
   `/peak-workflow:discover`. For a confirmed row, where the software
   can detect the failure the hardware guards against, write that detection as the TOR instead
   (*"The controller shall raise an alarm and keep the relay de-energized when the temperature
   keeps rising while the relay is commanded off"*). Each Safety TOR needs an automated check of
   its command and timing through the hardware-in-the-loop harness; tag it operator-observed
   (0c) only for the physical part a harness cannot sense.

0c. **Operator-observed TORs.** Tag a scenario with the comment line
   `# Verification: operator-observed` directly under its `Scenario:` line when no automated check
   can observe its Then — a named provider's real sign-in round-trip, a relay clicking, a display
   or indicator on a device. Automated tests still cover everything they can; the tag routes only
   the unobservable part to a person in `wrapup-epic`.

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
6. **Base branch.** `<base>` = the first of `develop`, `main`, `master` that exists
   (`git rev-parse --verify --quiet <name>`). Step 4 checks the branch against it, and a
   requirement counts as **merged** when it is on `<base>` (L1).
7. **Change Records.** List `docs/requirements/changes/*.toml` (the folder may not exist yet).
   Records are history: never edit one that is already on `<base>`.

Report the detected state:
```
Requirements baseline state:
- Existing feature files: [N]
- Highest feature number: [NN] (next available: [NN+1])
- Existing TOR IDs: [count]
- Tracing sidecars present: [count]
- Change Records: [count]
- Base branch: [<base>]
- UX screens.md: [none / N screens, S-01–S-NN]
```

---

## Step 2: Detect Greenfield vs Brownfield

**TOR-ID mode** = the first word of `$ARGUMENTS` matches `TOR-\d{2}-[A-Za-z0-9]{7}`. The rest
of `$ARGUMENTS` is the change description (may be empty). Proceed to Step 3C; skip the
changelog lookup below.

**Greenfield** = zero existing `.feature.md` files. Proceed to Step 3A.

**Brownfield** = at least one `.feature.md` exists. Proceed to Step 3B.

Look for an unprocessed discovery changelog:
```bash
ls docs/product-vision-planning/changelogs/discovery-changelog-*.md 2>/dev/null | grep -v '\.processed$'
```

Report detection:
```
Mode: [Greenfield / Brownfield / TOR-ID (<TOR-ID>)]
Unprocessed discovery changelog: [filename or "none found"]
```

---

## Lifecycle Rules (used by Steps 3A, 3B, 3C, and 4)

Every rule here is stated once; the steps below point at it by number. The helper is always
called as `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <command>` (written `tor-lifecycle`
below). A `tor-lifecycle` exit 2 or 3 is a data or install problem: print its output and stop.

### L1: Where the rule starts

A requirement is **merged** when `tor-lifecycle text <TOR> --rev <base>` prints it (exit 0). A
requirement that is not merged (created on this branch) is edited or deleted freely, with no
record. Once merged, every edit or deletion goes through the decision test (L3) and leaves a
Change Record (L5) — there is no fast path for a merged requirement that nobody has built or
tested yet. The feature file shows only present truth: `FEATURE_TEMPLATE.md` "Lifecycle Rules"
lists what may and may not appear in it.

### L2: Fingerprints

A requirement's fingerprint is a short hash of its Scenario title and steps. Changing case,
punctuation, spacing, blank lines, or comment lines (other than the `# Verification:` tag) leaves
it unchanged; changing any word or number changes it. `tor_lifecycle.py` is the **only**
implementation of these rules: always read fingerprints from `tor-lifecycle fingerprint` or
`tor-lifecycle text <TOR> [--rev <ref> | --verified] --json`, never compute or reason one out by
hand.

### L3: The decision test (one merged requirement, old text vs new text)

1. **Same fingerprint?** Write the new block to a scratch file outside the repository (the real
   file changes only after the gate), then compare `tor-lifecycle fingerprint <scratch file>`
   with the old fingerprint. Equal → only case, punctuation, or spacing changed: record nothing.
2. **Two-implementations test.** Is there a plausible implementation that passes a faithful test
   of the old Given/When/Then and fails the new one, or the reverse? Any added, removed, or
   changed actor, precondition, input, action, outcome, number, limit, status code, literal
   string, or scope word ("all", "only", "never", "at most", "exactly") is a yes. Yes → **meaning
   change**.
3. **Test-impact check.** List the citing tests: `git grep -n -w <TOR> -- . ':!docs/'`. Would any
   need a different arrange, act, or assert? Yes → **meaning change**. **No citing tests at all
   is also a meaning change** — a reword must be proven by running them.

Only when 2 and 3 are both no is the edit **reword-eligible**. When unsure, it is a meaning
change: a wrong "meaning change" costs one ID swap, a wrong "reword" is a false Verified.

### L4: Re-litigation check (before adding any requirement)

Before writing a new requirement — greenfield, brownfield, add-alongside, or a supersede
successor — run `tor-lifecycle search <2–4 key nouns or quoted phrases of the capability>`.
Exit 0 = no earlier decision; continue. Exit 1 prints the matching records. For each hit that is
really the same idea, ask with `AskUserQuestion`:
- Question: `"<capability> was <retired / superseded / recorded as pending> in <CR-ID> (<date>): <reason, one line>. Reintroduce it anyway?"`
- Options: `["Reintroduce — new requirement, new ID", "Drop it — the earlier decision stands"]`

On Reintroduce, the new requirement gets a **new ID** (never the old one) and its tracing entry's
`rationale` reads `Reintroduces the idea <kind> in <CR-ID>: <why now>`. On Drop, leave it out and
list it under the summary's Coverage Gaps as `dropped — <CR-ID> stands`. A hit on a `pending`
record means the requirement is still live and known wrong: resolve it with Step 3C instead of
adding a second one.

### L5: The five choices for a changed merged requirement

Each choice below that writes a record follows `CHANGE_RECORD_TEMPLATE.md` (file name, ID,
`approved_via = "docs-branch"`, `approved_by` from `git config user.name`) and is checked with
`tor-lifecycle validate <record file>` until it prints `ok`. One record per decision; a record
that resolves or renews a `pending` record lists that record's ID in `refs`.

1. **Add alongside** — the existing requirement stays true as written; write the new behavior as a
   new requirement (L4, then 3A.2 rules and a fresh ID per 3A.3). No record.
2. **Reword** — only when L3 found the edit reword-eligible. Edit the block in place, keeping its
   ID. First confirm `git status --porcelain` shows no change outside `docs/` (so `HEAD` is the
   code the tests run on), then run the citing tests with the test command `CLAUDE.md` lists,
   narrowed to the citing files where the runner allows. All pass → write a `reword` record:
   `from` = the old fingerprint, `to` = the new one, `[evidence]` `commit` =
   `git rev-parse --short HEAD`, `result = "pass"`, `tests` = the citing test files, and an
   `equivalence` sentence. Any failure, or no citing tests → it is not a reword: offer choice 3.
3. **Supersede** — a meaning change. Generate a new ID in the **same feature number** (3A.3) and
   write the new block **in place of** the old one, at the same position (a split writes several
   blocks there). Write a `supersede` record with the old block's `text` and `fingerprint` and the
   `successors`. In the same change, swap the old ID for its successor(s) in every **Not Started,
   In Progress, or Paused** epic: its spec's Requirements Anchors row (the ID, and the title
   column when the table has one) and its sidecar's `requirements:` line. **Never edit a Complete or Implemented epic's spec or sidecar** — it keeps
   the old ID it truthfully verified. Delete the old tracing entry, copying its sources into the
   record's `traced_to`; the sub-agent traces the
   successor (3B.4). A successor no open epic took is **unassigned**: Step 7 offers `/add` for it.
   Tests and source citing the old ID (`tor-lifecycle sweep <old ID>`) stay as they are on this
   branch — the successor's epic retargets them; list each in the summary as a follow-up.
4. **Retire** — the behavior is withdrawn with no successor. Delete the block and its tracing
   entry, copying the entry's sources into the record's `traced_to`. Write a `retire` record:
   `removal = "code"` when an Implemented or Complete epic lists the ID, or when tests or source
   cite it (`git grep -l -w <TOR> -- . ':!docs/'`); otherwise `removal = "none"`. Remove the ID
   from every Not Started, In Progress, or Paused epic's anchors table and `requirements:` line
   (never a Complete or Implemented epic's). Retiring every Scenario in a file is one record
   listing them all; delete the feature file and its tracing sidecar — the feature number stays
   reserved. A `removal = "code"` record needs a removal epic: Step 7 offers `/add` for it. Tests
   and source citing the retired ID are that epic's to delete; list them in the summary.
5. **Record as pending** — known to be wrong, but the right wording is not settled. The feature
   file is **not** touched. Write a `pending` record: `fingerprint` = the current one, `owner` =
   `git config user.name`. If `gh` is available and the repository is on GitHub, ask once whether
   to open a tracking issue first; on yes, run `gh issue create` and put its URL in `tracker`.
   **Never offer this for a requirement under a `# Safety` banner** — a known-wrong Safety
   requirement is resolved on this branch with choice 2, 3, or 4.

Ask one `AskUserQuestion` per changed requirement (batch up to four questions per call), with the
recommended choice first. Which choices appear depends on what the input says and on L3 —
`AskUserQuestion` shows at most four:

| Input | L3 result | Options (recommended first) |
|---|---|---|
| The requirement's text should change | reword-eligible | Reword, Supersede, Add alongside, Record as pending |
| The requirement's text should change | meaning change | Supersede, Add alongside, Retire, Record as pending |
| The capability is withdrawn (`Removed` row) | — | Retire, Supersede, Record as pending, Keep unchanged |
| A new capability extends the requirement's scope | — | Add alongside, Supersede, Record as pending |
| A change is raised but not decided (`Pending` row) | — | Record as pending, Supersede, Add alongside |

Question: `"<TOR-ID> — <title>: <what the input changes, one line>. How should it change?"`.
Drop `Record as pending` for a Safety requirement. `Keep unchanged` (Removed rows only) is for a
requirement the removal does not actually touch; name it in the summary with the reason.

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
- **Not an idea already decided against** — run the re-litigation check (L4) once per
  functional area before writing its requirements.

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
shall-statement in the mechanism `CLAUDE.md` declares — e.g. Service or API: *"The service shall
expose its name and semantic version at GET `/version` as JSON `{"name", "version"}` without requiring sign-in"* and
*"The service shall return error responses as RFC 9457 problem details whose `detail` names the
problem and the next action"*; the startup log line is asserted in the format the Logging line
declares (a JSON record, not a `[INFO]` text line, when the logger writes JSON); Embedded: *"The device shall print its
name and semantic version on the debug console in response to the `version` command"*. A line
still reading `TBD — set by the walking-skeleton epic` yields a TOR whose title, Given, When, and
Then all stay at the observable level — *"The device shall report its name and semantic version
on its reporting channel"*, `When the device is asked for its version over its reporting
channel` — so the TOR stays true whichever mechanism the skeleton picks and never needs a
Change Record once it is merged. The skeleton's tests name the concrete channel.

| Tool Hygiene line | Default TOR shall-statement form (CLI example) | Default TOR shall-statement form (Web app example) | Default TOR shall-statement form (Desktop app example) |
|---|---|---|---|
| **Version exposure** | The tool shall report its name and semantic version to standard output when invoked with `--version`, exiting with code 0 | The web application shall expose its name and semantic version at GET `/version` as JSON `{"name", "version"}`, AND shall display the version in the application footer or About page | The application shall display its name and semantic version in an About dialog opened from Help > About |
| **Version stamped at log startup** | The tool shall emit a log line at startup containing its name and semantic version at the logger's info level | The web application shall emit a log line on application startup containing its name and semantic version at the logger's info level | The application shall write a first log line containing its name and semantic version to the electron-log file on startup |
| **Logging convention** | The tool shall emit log records at the levels declared in CLAUDE.md (default DEBUG, INFO, WARN, and ERROR — use the logger's own level names, e.g. `Information` / `Warning` for .NET, `info` / `warn` for Pino and electron-log), in the format declared there (structured JSON / key=value / human-readable) | (same — substitute "web application") | (same — substitute "application") |
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
against the production build (`out/`), which `bun run test:e2e` builds first.

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
    Then within 2 seconds the second launch should have exited and exactly one main window should exist
    And the main window should be restored from minimized
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
> `plugins/peak-workflow/skills/capture-requirements/TRACING_TEMPLATE.md`. The sidecar has
> exactly one entry per `Scenario:` in its feature file — trace only those IDs, never read
> `docs/requirements/changes/`, and never write a `title` field or a top-level `generated` key.
> Keep any existing `rationale` value exactly as it is and never write one yourself. For each TOR
> ID's scenario, find the most specific matching section in
> `docs/product-vision-planning/product-vision.md` and the most specific scenario step in
> `docs/product-vision-planning/concept-of-operations.md`. Write paraphrases in your own words
> — do not copy source text. Read the `Tool Hygiene & Operability` and `UX Baseline` sections
> of `CLAUDE.md`. Scenarios under the `# Tool Hygiene & Operability` banner or the
> `# UX Baseline` banner trace to `CLAUDE.md` — record them under `traces_to.claude_md`,
> citing `section` (`Tool Hygiene & Operability` or `UX Baseline`) and copying the bold label
> verbatim into `line` (for Desktop conventions, `Desktop conventions — <bullet>`); never
> record them as `orphan_requirement`. Scenarios under the `# Safety` banner trace to the ConOps
> §8 `What Must Never Happen` table — record them under `traces_to.conops` with `scenario: "§8"`,
> `step: null`, and the hazard row paraphrased; never as `orphan_requirement`. If no credible
> trace can be found for a requirement, record it under `coverage_gaps` with
> `gap_type: "orphan_requirement"`. Also enumerate ConOps scenario steps and PV goals not
> covered by any TOR ID and record those under `coverage_gaps` with
> `gap_type: "uncovered_source"` in the most relevant feature file's sidecar. Do NOT modify
> any `.feature.md` file: if one holds a `# Note:` block (other than the
> `# Note: reference screen(s)` line under `# UX Baseline`) or an AMENDED / REVISED /
> SUPERSEDED / MODIFIED / CHANGE-CONTROL marker, list it by file and line in your report. Do NOT
> commit. After processing all files, report one line per feature file: filename, TOR count,
> gap count — then any marker lines found.

If the sub-agent reports a note or marker line, move its content into the matching tracing
entry's `rationale` (or drop it if it is change history — that belongs in a Change Record) and
delete the line from the feature file.

Wait for the sub-agent to complete before proceeding to Step 4.

---

## Step 3B: Brownfield — Delta Derivation

Adopt the same seasoned-PM persona as 3A. Differences from greenfield:

### 3B.1: Source the Deltas

1. **Exactly one unprocessed changelog found:** Read it. Its inputs for 3B.2 are:
   - **"New Capabilities Identified"** — new requirements (add, after L4).
   - **"What Changed" `Modified` rows** — each names a vision/ConOps section whose meaning
     changed. Find the merged requirements that trace to it (tracing sidecars, then a read of
     the feature files) and run the decision test (L3) on each one whose text must change.
   - **"What Changed" `Removed` rows** — each withdrawn capability. Its requirements are retire
     candidates (L5 choice 4).
   - **"What Changed" `Pending` rows** — a capability that may change, undecided. Its
     requirements get the L5 question with Record as pending recommended.
   - A `Modified` row whose summary starts `Wording only:` changes terms, not behavior: its
     requirements usually test reword-eligible (L3).
   - **`## UX Changes` rows** (from `/peak-workflow:mockup`) — `Added` screens are new inputs;
     `Modified` and `Removed` screens list the TORs citing that `S-NN`, which go through the
     decision test (Modified) or are retire candidates (Removed).
   The "Priority Signal" section guides requirement priority. Record the changelog path for
   archival in Step 6. A changelog whose "New Capabilities Identified" reads "None — UX
   concretization only" (written by `/peak-workflow:mockup`) is still consumed and archived.

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

Read all existing `.feature.md` files. For each input from 3B.1:
- **Already covered by an existing TOR?** → Skip. Note: "already covered by `TOR-NN-XXXXXXX`".
- **Changes, withdraws, or extends a merged requirement?** (L1) → Draft the change, run the
  decision test (L3), and ask the L5 question for that requirement. Record the answer; apply it
  per L5 after the 3B.3b gate approves (the citing-test run for a reword happens then too).
  There is no silent defer: a change the user does not want to make now is **Record as
  pending**.
- **Changes a requirement created on this branch?** → Edit it freely (L1).
- **Genuinely new?** → Run the re-litigation check (L4), then add it as a new TOR requirement
  per 3A.2 rules.

**UX Baseline added after the baseline (UI projects only).** If
`ux_baseline_section_present = true` and no existing TOR traces to any `UX Baseline` line
(the project added the section after its first requirements capture), treat every active
TOR line of the section as part of the delta: derive TORs per Step 3A.2.2 and append them per
3B.3 under a `# UX Baseline` section banner in the first feature file, or in a new
`NN-ux-baseline.feature.md` if the user prefers at the 3B.3b gate. Lines already covered by an
existing TOR are skipped.

### 3B.3: Assign IDs for New Requirements

- New requirements added to an **existing feature file**: keep that file's `{NN}`, generate
  fresh 7-char suffixes per 3A.3 rules.
- New **functional area** with no existing file: assign `{NN}` = (highest existing feature
  number + 1), create a new `.feature.md` file.
- Append new `Scenario:` blocks at the **bottom** of the relevant feature file, under a new
  section banner (`FEATURE_TEMPLATE.md` "Brownfield Append Note"). A supersede successor goes in
  its predecessor's place instead (L5 choice 3). Never reorder scenarios; change a merged one
  only through L5.

### 3B.3b: Brownfield Grouping Review Gate

Before writing any files, show the planned changes and ask for confirmation. Feature numbers
are stable once assigned and a merged TOR ID changes only through a Change Record — a wrong
grouping decision is expensive to reverse.

Present:
```
## Planned Requirements Changes

[For each existing file being extended:]
- Append {N} new TOR IDs to `docs/requirements/{NN}-{name}.feature.md`

[For each new file being created:]
- Create `docs/requirements/{NN}-{name}.feature.md` with {N} new TOR IDs

[For each L5 answer from 3B.2:]
- {Reword / Supersede / Retire / Record as pending}: `TOR-NN-XXXXXXX` — {title} → {successor ID(s) / removal = code|none / owner}
```

Use `AskUserQuestion`:
- Question: `"Approve this requirements grouping, or tell me what to adjust?"`
- Options: `["Approve — write the requirements", "Adjust — I'll describe the change"]`

If the user chooses Adjust, incorporate the change, re-present once, and proceed.
One adjustment round maximum.

### 3B.4: Invoke Haiku Sub-Agent

Before invoking it, delete the tracing entries of every requirement retired or superseded in
3B.2 yourself (their sources are already copied into the records). Then brief the sub-agent as
in 3A.5, but instruct it to **update only the affected `.feature.tracing.json` files**, to record
`uncovered_source` gaps only for sources this run's inputs touch (older gaps are listed in the
summary, not written), and: add
entries for new and successor TOR IDs at the bottom of the `requirements` array, keep every
other existing entry unchanged, and drop `coverage_gaps` entries naming an ID that is no longer
in the feature file. A whole-file retirement has no sidecar left to update.

---

## Step 3C: TOR-ID Mode — Amend One Requirement

`$ARGUMENTS` = `<TOR-ID> [description]`. This mode changes one requirement: one that changed
since it was verified (Re-verification path 1), one edited without a record, one recorded as
pending, or one the description asks to change. It reads no changelog and writes no
greenfield files.

1. **Look it up.** Run `tor-lifecycle titles <TOR-ID>`.
   - Exit 1 (unknown) → stop: `"<TOR-ID> is not a requirement in this project."`
   - Superseded or retired → stop and print the line: the ID is history; amend its successor
     instead.
2. **Read its state.** Run `tor-lifecycle states --json` and take this ID's row, and
   `tor-lifecycle check --base <base> --json` and take the findings naming it. Print the title,
   state, owning epic, and those findings in plain words.
3. **Pick the case** (first match):

   | Case | When | Old text (for L3) | New text |
   |---|---|---|---|
   | **Changed since verified** | Finding D, or state `Changed since verified` | `tor-lifecycle text <TOR> --verified --json` | The current block, plus the description's change if one is given |
   | **Edited without a record** | Finding A | `tor-lifecycle text <TOR> --rev <merged_commit> --json` (the finding's `detail.merged_commit`) | Same as above |
   | **Disputed** | State `Disputed` (an open `pending` record) | The current block | The description's change; with no description, ask what it should say |
   | **Requested change** | Anything else, with a description | The current block | The description's change |

   For the first two cases the old text may be the right one — the vision, the ConOps, or the
   description still says what the verified (or merged) text said. Then the fix is **Restore**:
   write the old block back in place, same ID, no record (`check` accepts a requirement returned
   to its text as first merged, and its saved fingerprint matches again). When the description
   asks for exactly the old text (new text = old text), skip L3 and step 4's question: offer
   only `Restore the verified text` and `"Unsure — re-verify instead"`.

   A requested change with no description: stop and ask for one
   (`/peak-workflow:capture-requirements <TOR-ID> <what should change>`). A requirement that is
   not merged (L1) is edited freely — apply the description and skip to Step 5.
4. **Decide.** Run the decision test (L3) on old vs new, then ask the L5 question with the
   "The requirement's text should change" row — and, for the first two cases, with these four
   options instead: `Restore the verified text` (recommended when the vision, ConOps, or
   description matches the old text), `Supersede` (or `Reword` when L3 found it reword-eligible),
   `Record as pending`, and `"Unsure — re-verify instead"` (it ends this mode: print
   `/peak-workflow:wrapup-epic <owning epic> reverify <TOR-ID>`, leave every file as it was, and
   delete the branch if Step 0 created it and nothing else is on it). For **Disputed**, offer
   Reword / Supersede / Retire, plus `Renew the pending record` (a new `pending` record that refs
   the open one, with a fresh reason) unless the requirement is under `# Safety`.
5. **Apply** the answer per L5, with these specifics:
   - **Changed since verified / Edited without a record:** the *old* text is the verified (or
     merged) version, not today's text. With no description, draft the record's `reason` from
     the commit that made the unrecorded edit
     (`git log --format='%h %s' <merged_commit>..HEAD -- docs/requirements/<feature file>`) and
     show it in the L5 question so the user can correct it. A supersede gives today's block (with any described
     change) the new ID in place and writes the record with the old text and its fingerprint
     from step 3; the owning Complete epic keeps the old ID. A reword records `from` = the old
     fingerprint, `to` = today's.
   - **Restore:** the block from step 3's old-text command goes back verbatim; no record and no
     tracing change. The code and tests may still follow the unrecorded edit — the requirement
     would then read Verified while the product does something else. List every citing test
     (`git grep -n -w <TOR> -- . ':!docs/'`) **and the code those tests exercise** that still
     does the edited behavior, and offer the code fix in Step 7.1.
   - **Disputed:** the record's `refs` lists the open `pending` record's ID — that is what
     resolves (or renews) it.
   - **Vision and ConOps:** if a vision or ConOps line states the detail this change replaced
     (e.g. "10 per page"), rewrite that line to the current state on this branch — no record, no
     changelog — and list it in the summary.
6. **Trace.** Delete the retired or superseded entry from the tracing sidecar yourself, then run
   the sub-agent as in 3B.4 for that one feature file (skip it for a reword, renewal, restore, or
   pending record).
7. Continue at Step 4 with a one-row trace table (the TOR-ID and the description), then Steps 5
   and 7. Step 6 does not apply.

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
- Every row of the ConOps §8 `What Must Never Happen` table (a hazard row → its `# Safety` TOR; an
  assumption row marked `— confirmed by the owner` → the Coverage Gaps entry `hardware safeguard — outside the software, confirmed by the owner`)
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
- For every gap: add or tighten the requirement, then re-run the affected row. Tightening a
  merged requirement is a change like any other (L1 → L3 → L5). Do not present the summary with
  unresolved gaps (only explicit deferrals are acceptable).
- `Removed`, `Modified`, and `Pending` changelog rows are inputs too: one row each, captured as
  the record ID(s) the L5 answer wrote (or `Keep unchanged — <reason>`).
- **Brownfield:** an input this run's delta does not touch may be marked
  `N/A — predates this branch` (count them in the summary); fix only gaps this branch's inputs
  open. Pre-existing gaps are listed, not silently tightened.

### 4.2: Health Check of This Branch

Run `tor-lifecycle validate` (every record in `changes/`), then
`tor-lifecycle check --base <base> --json`. Resolve, before Step 7:

- **Every record problem** `validate` prints.
- **Every finding with `own_branch: true`** (A–E introduced on this branch), with its fix:
  - **A / B** — a merged requirement was edited or deleted without a record on this branch:
    run L3 on it and apply the L5 answer (or restore the text from `<base>`).
  - **C** — an ID cited on this branch is neither live nor in a record: correct it to the live
    or successor ID, or remove the citation.
  - **D** — this branch changed a verified requirement's text with no passing reword chain: it
    needs a supersede (L5 choice 3) or a reword with evidence (choice 2).
  - **E** — a test or source line on this branch cites a retired or superseded ID: retarget it
    to the successor or delete it.
- **F findings this branch caused** — those naming an ID or record this run touched:
  `open-epic-retired` (an open epic still lists an ID this run retired or superseded: apply the
  L5 swap), `multiple-records`, `id-reused`, `feature-number-reused`, `multi-owner`. Two F kinds
  are expected and not fixed here: `disputed` for a `pending` record this run wrote, and
  `removal-missing` for a `removal = "code"` record (Step 7 offers its removal epic).

Re-run `check --base <base>` after each fix until no `own_branch` finding remains and the only F
findings tied to this run are the two expected kinds. A finding is **this run's** when the ID or
record it names belongs to a record this branch added
(`git diff --name-only --diff-filter=A <base> -- docs/requirements/changes/`) — `check` marks
those `own_branch: false` because the citation itself is old. **E** findings of this kind are
follow-ups (L5 choices 3 and 4), not old debt — list them with the epic that will clear them (or
`unassigned — see Step 7.1`). Findings that predate the branch are not this run's to fix —
list their count in the summary. Never edit a Complete or Implemented
epic's spec or sidecar to make a finding go away.

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
- [ ] If `screens_present = true` (brownfield: only screens Added in this run's UX Changes, or
  states whose copy changed on this branch; list the rest as predating): every data-bearing
  screen's empty and error states are covered by a TOR whose Given/When/Then names the screen by `S-NN` and cites the state's
  visible text and control from `ux/screens.md`.

- [ ] No feature file holds a `# Note:` block (other than the `# Note: reference screen(s)`
  line), a change marker, a version tag, or a dated banner (`FEATURE_TEMPLATE.md` "Lifecycle
  Rules").
- [ ] No tracing sidecar entry has a `title`, no sidecar has a top-level `generated`, and every
  sidecar has exactly one entry per Scenario in its feature file.
- [ ] Every Change Record this run wrote passes `tor-lifecycle validate`, and Step 4.2's
  `check --base` shows no `own_branch` finding.

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
[For each Change Record written:]
- `docs/requirements/changes/{file}.toml` — {kind} {CR-ID}: {TOR-ID(s)} {→ successor(s)}
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
- Change Records: {R} ({n} reword, {n} supersede, {n} retire, {n} pending) [omit when 0]
- Health check (`check --base <base>`): 0 own-branch findings; {k} expected from this run's records (pending, removal epic, citations to retarget); {P} predate this branch

### Coverage Gaps (explicitly deferred)
[List any out-of-scope deferrals with rationale, or "None"]

### Self-Check (final passing table)
[Paste the full trace table from Step 4 here — every row must show Explicit=Y and Ambiguous=N,
or have an explicit N/A deferral]

### Next Step
[Greenfield / Brownfield:]
Run `/peak-workflow:plan-project` to derive the implementation plan from these requirements.
Epic specs will reference TOR IDs as their Requirements Anchors — the TOR Given/When/Then
becomes the acceptance criterion and verification procedure.
[TOR-ID mode:]
Review the diff, commit it on this branch, and merge it into <base> (solo or team PR) — the
merge approves the Change Record.
```

In TOR-ID mode, replace "Documents Written" and "By the Numbers" with:

```
## Capture Requirements — <TOR-ID> amended

- Outcome: <Restored / Superseded by … / Reworded / Retired / Recorded as pending / Renewed> — <CR-ID or "no record">
- Files: <feature file, tracing sidecar, record, epic specs and sidecars swapped>
- Vision / ConOps lines rewritten: <list, or none>
- Follow-ups: <citing tests to retarget and the epic that will (or "unassigned"); code still following an unrecorded edit → quick-fix>
- Health check: 0 own-branch findings; <k> this run's; <P> predate this branch
```

### 7.1: Follow-up Offers

After printing the summary, offer the work the records this run wrote still need, on this same
branch, in one `AskUserQuestion` (one question per item, at most four; list the rest in the
summary):

- **Each unassigned supersede successor** (L5 choice 3 — no open epic took it):
  - Question: `"<successor ID> (<title>) replaces <old ID> and no epic owns it yet. Plan it now with /peak-workflow:add?"`
    When the old ID's epic is Complete and the code may already do what the successor says (the
    TOR-ID mode's first two cases), add: `"The code may already satisfy it, so the epic can be
    small — verify and retarget the tests."`
  - Options: `["Run /peak-workflow:add now", "Leave it for /peak-workflow:plan-project", "I'll do it later"]`
- **Each `removal = "code"` retire record**:
  - Question: `"<CR-ID> retires <TOR-ID(s)>, but the code is still there. Plan a removal epic now with /peak-workflow:add?"`
  - Options: `["Run /peak-workflow:add now", "Leave it for /peak-workflow:plan-project", "I'll do it later"]`

- **After a Restore whose code or tests still follow the unrecorded edit**:
  - Question: `"<TOR-ID> is back to its verified text, but <files> still do <edited behavior>. Fix the code with /peak-workflow:quick-fix after this branch merges?"`
  - Options: `["Print the quick-fix command", "I'll handle it"]` — print
    `/peak-workflow:quick-fix <TOR-ID>: make the code match the restored requirement (<detail>)`;
    it runs on `develop` after this branch merges, so never dispatch it from here.

On "Run /peak-workflow:add now", invoke `Skill({ skill: "peak-workflow:add", args: "<args>" })`
with `<args>` = `"<successor ID(s)> — <title>"` for a successor, or `"removal epic for <CR-ID>:
<record title>"` for a removal. Offer "Leave it for /peak-workflow:plan-project" only when
plan-project runs next (greenfield / brownfield); in TOR-ID mode drop it. An answer other than
running `/add` leaves the item visible: `/peak-workflow:status` lists the successor as an
unplanned requirement, and `check` reports a missing removal epic (finding F).

**Do NOT commit.** Greenfield / brownfield: the full planning sequence (`discover` → optional `mockup` →
`capture-requirements` → `plan-project` → optional `add`) runs on the `docs/` branch before
the user merges. The merge (solo or team PR) is the approval gate for the entire requirements
and plan as a unit. TOR-ID mode: nothing else follows; the user commits and merges.
