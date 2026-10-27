# Plan Template — `/peak-workflow:start-epic`

This file is the lifecycle template that `start-epic` Step 4 plans must follow. Copy the Opening
and Closing sections verbatim into your plan, substituting placeholders with values derived
in Step 1. The Middle section ("Implementation work") is the only place where epic-specific
steps are authored.

Placeholder reference:

- `<id>` — the epic ID: the first word of `$ARGUMENTS`, verbatim (7-char alphanumeric)
- `<short-name>` — extracted from the spec filename in Step 1
- `<N>` — source issue number from Step 1 (omit announce/trailer if unknown)
- `<base-branch>` — `develop` if it exists, else `main`, else `master`
- `<TOR-list>` — comma-separated list of TOR IDs from the Requirements Anchors table, after
  `start-epic` Step 1 item 6's decisions
- `<anchor-decisions>` — Step 1 item 6's answers, one per line (`Replace TOR-old with TOR-new
  (CR-…)`, `Drop TOR-old (retired in CR-…)`, `Correct the Feature File cell of TOR-…`), or `none`
- `<retired-IDs>` — removal epics only: the retired IDs from the spec's `## Removal` section
- `<test-directories>` — every directory listed under Test directories in CLAUDE.md's
  Verification & Quality Gates section, space-separated (e.g., `tests/ e2e/`; if the line is
  absent, the single test directory that section names). If no directory can be derived (a
  legacy Tests row like `pytest` names none), `start-epic` Step 1 item 4b already asked the
  user and resolved this value before plan mode; if the user declined to record it, replace
  the per-directory grep loop with `git grep --untracked -l "<TOR-ID>" -- ':!docs'` (the
  `--untracked` flag matters — new test files are not yet staged at self-assessment time).
- `<deferral-count>` — the `Count:` value from the handoff's Deferrals section (filled at
  execution time, like `<record title>` and the TOR lists in the commit message — not at plan time)
- `<handoff-path>` — `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md`

When copying, drop notes addressed to the plan author ("omit this paragraph when…", "Copy this
paragraph verbatim…"); keep every rule.

---

## Opening steps (always the first four plan items)

1. **Create (or verify) feature branch** — run `git branch --show-current` to check the
   current branch. Then check whether the target branch already exists:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = exists, nonzero = missing. (Do **not** rely on `git branch --list … && echo
   "exists"` — that pipeline always exits 0 and produces false positives.) Then:
   - If already on `feature/epic-<id>-<short-name>`, confirm and continue.
   - If the branch exists but you are not on it, run `git checkout feature/epic-<id>-<short-name>`.
   - If the branch does not exist, detect the base branch (`develop` > `main` > `master`),
     switch to it, run `git pull --ff-only origin <base-branch>` if `origin/<base-branch>` exists
     (stop and show git's message if the pull fails), and run `git checkout -b feature/epic-<id>-<short-name>`.

2. **Update status to "In Progress"** — edit `docs/implementation-plan/status/epic-<id>.md`:
   change `status: Not Started` (or `status: Paused`) to `status: In Progress`, and set
   `owner: <git config user.name>` — replace `owner: —` (insert the line after `status:` if an
   epic skipped by `/peak-workflow:upgrade` has none), and keep it if it already names you (case-insensitive; any name you have committed under with your
   `git config user.email` counts). If it names someone else, the user confirmed taking it over at
   `start-epic` Step 2.5 — replace it and say so in one line. Leave `implemented:`,
   `completed:`, and `requirements:` unchanged except for the anchor decisions below. Capture whether this is a
   **fresh transition** (prior status was Not Started or Paused) or a **resumption**
   (prior status was already In Progress, or was Implemented — rework after a wrapup FAIL).
   Item 3 uses this. On a Paused → In Progress transition, also `git rm` the
   `session-handoffs/epic-<id>-paused.md` handoff (git keeps it) and set `handoff: —`; both land in
   the closing Commit step, so a later interrupted session still trips the Recovery Check.

   Also update the epic spec file's `**Status:**` header line (the spec path was already
   identified in Step 1, at `docs/implementation-plan/phase-*/epic-<id>-*.md`) to
   `**Status:** In Progress` (no date), so the spec stays in sync with the sidecar.

   Then apply these anchor decisions (omit this paragraph when `<anchor-decisions>` is `none`):
   <anchor-decisions, one bullet each>. In the spec's
   Requirements Anchors table, put each successor in its predecessor's row (same position, the
   successor's feature file) or delete the dropped row; in the sidecar's `requirements:` line,
   make the same swap or removal. Touch no other epic's files.

3. **Announce work-started on GitHub** — if Step 1 captured no source issue, replace this plan
   item with: `GitHub announce: SKIP — no source issue`. Otherwise, run only if (a) this is a
   fresh transition (not a resumption) and (b) `gh auth status` succeeds:
   ```bash
   gh issue comment <N> --body "Epic <id> work has started on branch \`feature/epic-<id>-<short-name>\`. I'll follow up here when the PR opens."
   ```
   On `gh` failure, print a warning and continue — this is a courtesy, not a blocker.

4. **Create tasks (user stories)** — create one task per TOR ID in the Requirements Anchors
   table, or one task per small group of closely-related TOR IDs from the same feature file
   (typically 5–10 tasks for a normal epic). Each task is a **user story** whose:
   - **Subject** = the TOR ID + its title from the `tor-lifecycle titles` run (e.g., "TOR-01-Afs657G: tool shall report version to stdout")
   - **Description** = the full Given/When/Then from the feature file, verbatim

   Grouping guidance: TOR IDs that touch the same source file or module can be in one task.
   TOR IDs that address entirely different surfaces (e.g., one CLI flag vs. one API endpoint)
   should be separate tasks.

   A removal epic adds one task, `<record title> (<CR-ID>)`, whose description is the
   spec's `## Removal` section.

   Issue a single batched `TaskCreate` call (one tool use creating all tasks) rather than
   sequential calls — this is faster and keeps the task list atomic.

---

## Middle steps (implementation work)

Authored per-epic. Derive these from the TOR IDs' Given/When/Then and the spec's Key
Components. Each middle step must:

- **Explicitly name the TOR ID(s) it implements** — e.g., "Implement the version-flag handler
  to satisfy **TOR-01-Afs657G** ('the system shall report its part number and version to
  standard output when invoked with `-v`')."
- **Name the specific files to create or modify** — use actual paths from Key Components.
- **Include a test for each TOR ID** — the test must mirror the Gherkin structure: arrange the
  Given preconditions, act on the When, assert the Then outcome. Name the test file and test
  method/function. **The TOR ID must appear literally in the test** (name, docstring, or a
  comment on the test) — wrapup locates tests by grepping every directory in
  `<test-directories>` for the TOR ID and nothing else. If the Then names a quantity or
  boundary (e.g., 10,000 rows), the test's Given must construct it; a test that only checks a
  flag is accepted does not mirror the Then.

If Step 1 item 13 (E2E audit) surfaced regression specs likely to break, include an explicit
"update regression specs: …" item here, committed alongside the implementation.

For a UI epic (Step 1 item 11a), each middle step that adds or changes a screen must name the
screen, state that it composes from the skeleton's app shell and design system, and list the
loading / empty / error / populated states it renders — the wrapup UX Baseline gate checks
every one of them. When the spec has a `## Screens` section (Step 1 item 4c), the step also
cites the screen's `S-NN`, its wireframe path, and the `data-component` primitives it composes
— the wrapup Wireframe fidelity line checks regions, control texts, and states against that file.
Each such step also says which design skill or component lookup it used (from the Design pass).

**Design pass (UI epics only — Step 1 item 11a applies).** Add this as a numbered middle step
immediately before the first middle step that adds or changes a screen, so it survives a cleared
context and runs again when the epic resumes. Substitute the names Step 1 item 11b found:
```
N. Design pass [UI]: invoke Skill("<exact name>") for each design skill from Step 1 item 11b
   (e.g. shadcn, frontend-design:frontend-design); load mcp__shadcn__* via ToolSearch and use
   them to look up each component's docs/examples before composing it. Add components with the
   sheet's `bunx shadcn@latest add <name>` — never `init`.
   Precedence: TOR Given/When/Then > wireframe layout (S-NN) > UX Baseline + design tokens
   > design-skill choices. Theme/preset changes only in the token file; the Contrast TOR must still pass.
   If the context was cleared after this step ran, re-run it before the next screen step.
```
Drop the clauses for tools 11b did not find. If it found nothing, the step reads
`N. Design pass [UI]: none installed — UX Baseline and tokens only` plus 11b's install hint; if
11b reported shadcn tooling missing, add its restart or install line to the step.

**Bench only (products that switch mains power or heat).** Before any command that flashes the
board, runs it, or runs anything under `tests/hil/` — in a middle step, the self-assessment, or a
quality gate — ask the user in one plain question to confirm the bench setup: the equipment
unplugged from mains, the output wired to an indicator lamp instead of the load. If they do not
confirm, do not run it. `HIL_BENCH=1` goes on that one command line only, right after the user
confirms for this run (e.g. `HIL_BENCH=1 <harness command>`) — never exported, never written into
`CLAUDE.md`, a script, or a config file, and never set without the confirmation. For a product that
switches mains power or heat, copy this paragraph verbatim into the plan as a standing rule ahead
of the first middle step, next to the Deferral gate; omit it for every other product.

**Removal (removal epics only).** Add this as the first middle step of a removal epic:
```
N. <record title> [<CR-ID>; retires <retired-IDs>]
   - Delete the code the Removal section's **Code to remove** names (the symbols in parentheses;
     a whole file only when it names the file with no symbol), and each test that
     `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" sweep <retired-IDs>` lists — the whole test
     function containing the hit: <path:line, …> (when it was the last test in its file, delete
     the file)
   - Remove every remaining reference to the deleted symbols (imports, call sites):
     `git grep -n -w <symbol> -- . ':!docs/'` must return nothing
   - A test that only proved the old behavior is deleted, not retargeted; a guard requirement
     gets its own test in a later step
   - Done when `tor-lifecycle sweep <retired-IDs>` exits 0, those symbols are gone, and every
     guard requirement's test passes
```

**Deferral gate.** Copy this paragraph verbatim into the plan as a standing rule ahead of the
first middle step; it applies to every middle step and to the self-assessment. If at any point
a TOR's Given/When/Then cannot be fully met as written in this session (technical constraint,
missing dependency, scope larger than estimated, a Then clause that would need adjusting, or
anything else), stop implementation and use `AskUserQuestion` — unless the cause is that the
requirement itself is wrong, which is the Amendment gate below:
- Question: `"TOR-<NN-XXXXXXX> cannot be fully met: <reason>. Recommendation: <Fix now | Defer | Stop> — <one clause why>. How to proceed?"`
- Options: `["Fix now", "Defer — depends on a later epic", "Stop — I'll take it from here"]`

The recommendation is mandatory — never ask without one. Recommend **Defer** only when the
eligibility rule below is met; otherwise recommend Fix now, or Stop if the fix is beyond this
session.

Rules:
- Never continue silently past an unmet TOR, and never narrow the Then clause to make the
  requirement fit what was built. A Then clause that must be adjusted is a gate event too —
  the TOR as written is not met.
- If the constraint is already known when the plan is authored, fire the gate immediately
  after plan approval, before any middle step.
- **Only an option the user selects counts.** A free-text reply that does not name one of the
  three options ("ok", "proceed", "go ahead") is not consent to defer — re-ask.
- **Safety TORs are never deferrable.** A TOR under the `# Safety` banner offers only Fix now or
  Stop — the epic that drives an output ships its safeguard.
- **Defer eligibility:** Defer is allowed only when the Then clause depends on code a later
  epic creates (a handler, table, screen, or service that does not exist yet and is not this
  epic's to build). When the user picks Defer, ask `"Which later epic creates the code this Then
  clause depends on?"` and judge on that answer. "Larger than estimated", "tricky", "tedious",
  or "out of session scope" name no epic and are not eligible. When not eligible, re-ask:
  `"Defer is not eligible for TOR-<NN-XXXXXXX>: <reason> is not a dependency on a later epic. How to proceed?"`
  with options `["Fix now", "Stop — I'll take it from here"]`.
- **Defer — successor check:** with `<succ>` = the epic ID the user named, run
  `ls docs/implementation-plan/phase-*/epic-<succ>-*.md`. If no spec exists, Defer is not
  available — re-ask as above. If the spec exists but its Requirements Anchors
  table does not list this TOR, append the row (TOR ID, feature file)
  and add the TOR ID to `docs/implementation-plan/status/epic-<succ>.md`'s `requirements:`
  field before continuing. Record `<succ>` in the Deferrals row's `Successor epic` column.
- **Defer — record:** write the Deferrals row immediately to
  `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` (if the file does not
  exist yet, create it with a `## Deferrals` section, `Count: 1`, and the table header;
  "Reconcile spec" fills in the rest later) so the decision survives a context clear. Columns:
  `Unmet` = the Then clause(s) not realized, `Why` = the reason given at the gate, `Decision` =
  the option chosen, `Date` = today. `By` is `git config user.name`. Keep the
  TOR's test but mark it skip/xfail with reason
  `Deferred: <TOR-ID> — <why>` so the suite stays green and the ID stays greppable. Report the
  TOR as FAIL in the self-assessment.
- **Fix now:** implement the fix, then re-run that TOR's test and the two mechanical checks
  from the self-assessment before continuing. If a Deferrals row was already written for this
  TOR (the gate fired during self-assessment), delete the row, decrement `Count:`, and remove
  the skip/xfail marking.
- **Stop:** run `/peak-workflow:pause` so the sidecar and handoff reflect the stopping point.
- Plan approval does not pre-authorize any deferral.

**Amendment gate.** Copy this paragraph verbatim into the plan as a standing rule, next to the
Deferral gate. It applies when implementation shows that one of this epic's anchor requirements is
itself wrong — building it as written would ship the wrong behavior — not merely hard or slow to
build. When the requirement is already known to be wrong as the plan is written, the gate fires
right after plan approval, before any middle step. The helper is `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"` (written `tor-lifecycle`).
Stop implementation and use `AskUserQuestion`:
- Question: `"TOR-<NN-XXXXXXX> — <title> looks wrong: <what implementation showed, one line>. Proposed: <new title> / <changed step(s)>. How to proceed?"`
  — before asking, check the proposed literals against the Given (dates, totals, counts) so the
  owner approves text an implementation can meet.
- Options: `["Amend TOR-<NN-XXXXXXX> (owner approval)", "Implement as written", "Stop — I'll take it from here"]`

Rules:
- **Never for Safety.** For a requirement under the `# Safety` banner (its `tor-lifecycle states
  --json` row has `safety: true`) offer only `Implement as written` and `Stop`; a Safety
  requirement changes only on a `docs/` branch (`/peak-workflow:capture-requirements <TOR>`).
- **Only an option the user selects counts**, as for the Deferral gate. Plan approval does not
  pre-authorize an amendment.
- **Amend** is a supersede, decided and written as `capture-requirements` states it once
  (`${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/SKILL.md`, "Lifecycle Rules": L3 decision test, L4 re-litigation check, L5 choice 3; and
  `${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/CHANGE_RECORD_TEMPLATE.md`), with these
  differences:
  1. Run L3 on the current block vs the proposed one. **Reword-eligible** (same meaning) → this is
     not an amendment the code needs: say so, implement as written, and suggest
     `/peak-workflow:capture-requirements <TOR> <wording>` after the epic. **Meaning change** →
     continue.
  2. Run L4 (`tor-lifecycle search <key nouns>`) for the successor. Generate its ID in the same
     feature number — generate the 7-character suffix with `LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7` and regenerate it while it is all digits or `git grep --untracked -q <suffix>` finds it anywhere (feature files and `docs/requirements/changes/` included) — and write its block in place of the old one. Generate the record's
     `CR-` suffix the same way. Read the old tracing entry's sources first (they become the
     record's `traced_to`). Write the `supersede` record with `approved_via = "epic-branch"`, `approved_by` =
     `git config user.name`, `refs` = `["epic <id>"]` plus the open `pending` record's ID when
     the requirement was Disputed (that resolves it), and the old `text` and `fingerprint` from
     `tor-lifecycle text <TOR> --rev <base-branch> --json`. Run `tor-lifecycle validate <record>`
     until it prints `ok`.
  3. In the tracing sidecar, delete the old entry (its sources go into the record's
     `traced_to`) and add one for the successor with the same `traces_to` and
     `"rationale": "Supersedes <old TOR> (<CR-ID>): <reason>"`.
  4. Swap the old ID for the successor in this epic's Requirements Anchors row and sidecar
     `requirements:` line — no other epic's files (another open epic still listing the old ID
     shows as `check` F `open-epic-retired`; its own start-epic settles it). Update the task's
     subject and description.
  5. Retarget this epic's tests from the old ID to the successor, then run
     `tor-lifecycle check --base <base-branch>`: no finding may be marked `[this branch, blocking]`.
  6. Continue the middle steps against the successor's Given/When/Then; the self-assessment checks
     the successor. Reconcile spec records a Spec Deviations row citing the record.
- **Implement as written** — continue; never narrow the Then clause to fit what was built (that
  is a Deferral gate event).
- **Stop** — run `/peak-workflow:pause`.

Middle step example:
```
5. Implement version-flag handler [TOR-01-Afs657G, TOR-01-Bcd2345]
   - Modify `src/cli.py`: add `-v` / `--version` flag that writes "{name} {version}" to stdout
   - Modify `src/cli.py`: add `--help` flag that writes the full usage message
   - Write `tests/test_cli.py::test_version_flag`: Given tool is installed, When `-v` is passed,
     Then stdout contains "Version:"
   - Write `tests/test_cli.py::test_help_flag`: Given tool is installed, When `--help` is passed,
     Then stdout contains the usage synopsis
```

---

## Closing steps (always the last five plan items, in this order)

- **Implementer self-assessment** — each TOR Given/When/Then. For every TOR ID in the
  Requirements Anchors table:
  1. Confirm that the implementation code has been written (see Middle steps above).
  2. Run the test(s) written for this TOR ID. Every test must pass.
  3. Inspect source to confirm the implementation realizes the Given/When/Then (a passing test
     that doesn't exercise the requirement is a FAIL).
  4. Also run the project's Verification & Quality Gates from `CLAUDE.md` (build, lint, console
     errors, brand audit if UI, and for a UI epic the UX Baseline check — every active line of
     the UX Baseline section, exactly as `/peak-workflow:wrapup-epic` Step 1.3 lists them).
     Report each gate as PASS / FAIL / CANNOT VERIFY. On a web or static-SPA project, before
     `bun run test:e2e`, run `bunx playwright install chromium` (it does nothing when the browser
     is already present); a run failing with *Executable doesn't exist* means run it again and
     continue — a missing browser is not CANNOT VERIFY.

  Before reporting, run two mechanical checks against the working tree (nothing is committed
  yet, so `git diff <base-branch>` alone would miss new files):
  - `for d in <test-directories>; do grep -rl --exclude-dir={bin,obj,node_modules,dist,out,build} "<TOR-ID>" "$d"; done` must hit in at least one
     directory for every TOR ID. A miss means the test is not traceable — fix the test before
     continuing. A TOR whose scenario carries `# Verification: operator-observed` is traced by a
     checklist `tests/manual/<TOR-ID>.md` (or under `tests/hil/`) that restates its Given / When /
     Then as steps a person performs and what they should see; write it, and report the TOR as
     `PASS (operator-observed pending)` — `/peak-workflow:wrapup-epic` collects the observation.
     A checklist for anything that switches mains power or heat names a bench setup — the
     equipment unplugged, the output driving an indicator lamp — never the live equipment.
  - ```bash
    grep -inE --exclude-dir={.venv,node_modules,__pycache__,.pytest_cache,dist,build,out} \
      'todo|stub|placeholder|for now|not implemented|NotImplementedError' \
      $(git diff --name-only --diff-filter=d <base-branch>; git ls-files --others --exclude-standard)
    ```
     Judge each hit: a marker describing incomplete TOR behavior is a deferral-gate trigger for
     that TOR, unless the TOR already has a Deferrals row (a hit inside a `Deferred:` xfail
     reason is expected and not a trigger).
     Legitimate uses (e.g., argparse `placeholder`/`metavar`, test doubles for hardware or a
     native dialog under the test directories) are not triggers.
  - `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" sweep <IDs>` must exit 0, where `<IDs>` are
     the retarget steps' old IDs, an Amendment gate's superseded IDs, and — removal epics — the
     `<retired-IDs>`. A hit is a test or source line still citing them: retarget or delete it. A
     removal epic also confirms each symbol named under **Code to remove** is gone
     (`git grep -n -w <symbol> -- . ':!docs/'` returns nothing). Always copy this bullet; at
     self-assessment time skip it only when `<IDs>` is still empty — a bare `sweep` reports every
     citation in the project, not this epic's.
  - Walking-skeleton epic only: `grep -nE 'TBD — set by the walking-skeleton epic|— unconfirmed|Board: not chosen|\*\*Not decided yet:\*\*' CLAUDE.md`
     must return nothing. Each hit is a value this epic owns resolving — resolve it before reporting.

  **Any TOR reported FAIL or CANNOT VERIFY here that has no Deferrals row fires the deferral
  gate** before the handoff is written — the self-assessment and the Deferrals section must
  agree. Any mention of "stub", "partial", "follow-up", or similar anywhere in the handoff
  must correspond to a Deferrals row.

  This is the implementer's own assessment of its own work. It is labeled as such in the
  handoff and is not trusted by `/peak-workflow:wrapup-epic`, which re-verifies every TOR
  independently in a fresh session.

  Report each TOR ID as:
  - **PASS** — test passes AND implementation inspection confirms the Given/When/Then is
    realized. Cite test file:line and impl file:line.
  - **FAIL** — test fails, or test passes but implementation does not realize the requirement.
    Describe the gap.
  - **PASS (operator-observed pending)** — only for a TOR tagged `# Verification: operator-observed`:
    its checklist exists and every automated part it has passes. A `# Safety` TOR with no automated
    `tests/hil/` test naming it is **FAIL**, whatever its tag.
  - **CANNOT VERIFY** — only if the test environment cannot start after a genuine attempt.

  **IPC / dev-server caveat:** if the project uses a dev-server-only render harness (e.g., Vite
  for an Electron app) and TOR IDs touch surfaces that depend on IPC, the database, or backend
  wiring, do **not** rely on `playwright-cli` against the dev server alone — that environment
  cannot exercise the data path. Use the project's E2E suite for those surfaces.

- **Reconcile spec** — re-read the epic spec's Requirements Anchors table. For each TOR ID:
  - If the TOR was implemented exactly as its Given/When/Then specifies: note "no deviation".
  - If the implementation deviated (e.g., the Then clause needed adjustment for a technical
    constraint): the deferral gate must already have fired for this TOR. Record the deviation
    in the handoff file as a "Spec Deviation" row **and** a Deferrals row (the TOR as written
    is not met). Never edit the feature file outside the Amendment gate — any other requirement
    change goes through `/peak-workflow:capture-requirements` on a `docs/` branch.
  - If the Amendment gate superseded it: a Spec Deviations row `<old TOR> → <successor> |
    <old Then> | <new Then> | Amended in <CR-ID> (owner-approved)` — not a Deferrals row, since
    the successor is met.

  Write (or update) `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` with
  these sections in this order:
  - **What Was Built** — 2–3 sentence summary
  - **Deferrals** — **mandatory, always present, placed immediately after What Was Built.**
    First line `Count: N`. Then a table
    `TOR ID | Unmet | Why | Decision | Successor epic | By | Date` with one row per TOR whose
    Given/When/Then is not fully met, where `Decision` is the option chosen at the deferral
    gate, `Successor epic` is the epic ID confirmed by the successor check, and `By` is the
    user who chose it. Every "Defer" answer from the deferral gate must appear here. If
    nothing was deferred, write `Count: 0` followed by the literal line `None` — do not omit
    the section.
  - **Key Files** table — files created or modified
  - **Spec Deviations** table — `TOR ID | As-Written | As-Implemented | Reason`
    (empty if no deviations). A deviation is a Then clause that was *adjusted*; it is also a
    deferral of the TOR as written, so every deviated TOR appears in both tables — except an
    Amendment gate row, which cites its Change Record and needs no Deferrals row.
  - **Key Decisions** — design choices future epics should know about. Anything here that
    describes partial or stubbed behavior must have a matching Deferrals row. For a UI epic,
    include the line `Design skills used: <names, plus mcp__shadcn__* if used> / none installed`.
  - **TOR Coverage (self-assessment)** — list each TOR ID with its PASS / PASS (operator-observed pending) / FAIL / CANNOT VERIFY
    verdict from the self-assessment step. A removal epic lists its guard requirements (or
    `None — removal epic`), then `Removal (<CR-ID>): PASS/FAIL — sweep <retired-IDs> exit <n>;
    symbols gone: yes/no`
  - **Verification Results (self-assessment)** — quality gate results

  After writing the handoff, run
  `grep -inE 'stub|partial|for now|follow-up|placeholder|not implemented' <handoff-path>` plus the case-sensitive `grep -nE '\bTODO\b|\bFIXME\b' <handoff-path>` (a product named "todo" is not a hit).
  Any hit outside the Deferrals table that has no matching Deferrals row fires the deferral
  gate for that TOR before continuing. If Defer is chosen here, update that TOR's TOR Coverage
  verdict to FAIL, apply the xfail marking, and re-run this grep.

  Plan approval already authorizes both the handoff write and any spec-level notation —
  do not re-prompt.

- **Mark as Implemented** — edit `docs/implementation-plan/status/epic-<id>.md`:
  change `status: In Progress` to `status: Implemented`. Set `implemented: <today>` (YYYY-MM-DD) and
  `handoff: session-handoffs/epic-<id>-implemented.md`.
  Leave `completed:` as `—`. The `requirements:` field is NOT changed here — it stays as set by
  `plan-project` or `add`, plus opening step 2's anchor decisions and any Amendment gate swap.

  Also rewrite the epic spec file's `**Status:**` header line to
  `**Status:** Implemented — <today>` (same date just written to the sidecar's `implemented:`
  field), so the spec stays in sync with the sidecar.

- **Commit** — run `git branch --show-current` and confirm you are on
  `feature/epic-<id>-<short-name>`; if not, switch before staging anything. Stage all files
  created or modified during this epic by specific path (not `git add -A`), including the
  handoff file, updated status sidecar, updated spec file, — if a Defer edited them — the
  successor epic's spec and sidecar, and — if the Amendment gate fired — the Change Record, the
  feature file, and its tracing sidecar. A paused handoff removed with `git rm` is already staged —
  do not pass it to `git add`. Commit without asking for permission.
  Message format:
  ```
  feat(epic-<id>): <short summary>

  Implements <TOR-list of TORs self-assessed PASS, or "none (removal epic)"> — <1 sentence describing what the user can now do>.
  Deferred: <TOR-list of deferred TORs, or "none">
  Deferrals: <deferral-count>
  Amends: <old TOR → successor (CR-…), one per amendment — omit the line when none>
  Anchors: <Replace TOR-old → TOR-new (CR-…) / Drop TOR-old (CR-…), one per anchor decision — omit when none>
  Removes: <retired-IDs> (<CR-ID>) — removal epics only

  Refs #<N>
  ```
  `<deferral-count>` is the `Count:` value from the handoff's Deferrals section (`0` if none).
  Always `Refs`, never `Closes` — the implementer cannot know whether the epic will pass
  verification; only the wrapup PR body may close the source issue. Omit the `Refs #<N>`
  trailer if no source issue was captured. Do not push.

- **Present next steps** — output this block exactly:
  > ---
  > **Next steps**
  > - Open a **new** session (wrapup refuses to run in this one) and run
  >   `/peak-workflow:wrapup-epic <id>` to independently verify each TOR requirement's
  >   Given/When/Then and close out this epic
  > - Or run `/peak-workflow:status` to review overall project progress and requirements coverage
  > - If something needs fixing before wrapup, make the changes and re-run
  >   `/peak-workflow:start-epic <id>` to continue on the same branch
  > ---
