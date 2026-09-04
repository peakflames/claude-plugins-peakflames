# Plan Template — `/peak-workflow:start-epic`

This file is the lifecycle template that `start-epic` Step 4 plans must follow. Copy the Opening
and Closing sections verbatim into your plan, substituting placeholders with values derived
in Step 1. The Middle section ("Implementation work") is the only place where epic-specific
steps are authored.

Placeholder reference:

- `<id>` — `$ARGUMENTS` verbatim (7-char alphanumeric)
- `<short-name>` — extracted from the spec filename in Step 1
- `<N>` — source issue number from Step 1 (omit announce/trailer if unknown)
- `<base-branch>` — `develop` if it exists, else `main`, else `master`
- `<TOR-list>` — comma-separated list of TOR IDs from the Requirements Anchors table
- `<test-directory>` — the project's test directory from CLAUDE.md's Verification & Quality
  Gates section (e.g., `tests/`, `spec/`, `__tests__/`)
- `<deferral-count>` — the `Count:` value from the handoff's Deferrals section
- `<handoff-path>` — `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md`

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
     switch to it, and run `git checkout -b feature/epic-<id>-<short-name>`.

2. **Update status to "In Progress"** — edit `docs/implementation-plan/status/epic-$ARGUMENTS.md`:
   change `status: Not Started` (or `status: Paused`) to `status: In Progress`. Leave
   `implemented:`, `completed:`, and `requirements:` unchanged. Capture whether this is a
   **fresh transition** (prior status was Not Started or Paused) or a **resumption**
   (prior status was already In Progress, or was Implemented — rework after a wrapup FAIL).
   Item 3 uses this.

   Also update the epic spec file's `**Status:**` header line (the spec path was already
   identified in Step 1, at `docs/implementation-plan/phase-*/epic-<id>-*.md`) to
   `**Status:** In Progress` (no date), so the spec stays in sync with the sidecar.

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
   - **Subject** = the TOR ID + scenario title (e.g., "TOR-01-Afs657G: tool shall report version to stdout")
   - **Description** = the full Given/When/Then from the feature file, verbatim

   Grouping guidance: TOR IDs that touch the same source file or module can be in one task.
   TOR IDs that address entirely different surfaces (e.g., one CLI flag vs. one API endpoint)
   should be separate tasks.

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
  comment on the test) — wrapup locates tests by `grep -rl "<TOR-ID>" <test-directory>` and
  nothing else. If the Then names a quantity or boundary (e.g., 10,000 rows), the test's Given
  must construct it; a test that only checks a flag is accepted does not mirror the Then.

If Step 1 item 13 (E2E audit) surfaced regression specs likely to break, include an explicit
"update regression specs: …" item here, committed alongside the implementation.

**Deferral gate.** Copy this paragraph verbatim into the plan as a standing rule ahead of the
first middle step; it applies to every middle step and to the self-assessment. If at any point
a TOR's Given/When/Then cannot be fully met as written in this session (technical constraint,
missing dependency, scope larger than estimated, a Then clause that would need adjusting, or
anything else), stop implementation and use `AskUserQuestion`:
- Question: `"TOR-<NN-XXXXXXX> cannot be fully met: <reason>. How to proceed?"`
- Options: `["Fix it now", "Defer — record in Deferrals with this reason", "Stop — I'll take it from here"]`

Rules:
- Never continue silently past an unmet TOR, and never narrow the Then clause to make the
  requirement fit what was built. A Then clause that must be adjusted is a gate event too —
  the TOR as written is not met.
- If the constraint is already known when the plan is authored, fire the gate immediately
  after plan approval, before any middle step.
- **Defer:** write the Deferrals row immediately to
  `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` (create the file with
  just a `## Deferrals` section if it does not exist yet; "Reconcile spec" fills in the rest
  later) so the decision survives a context clear. `By` is `git config user.name`. Keep the
  TOR's test but mark it skip/xfail with reason
  `Deferred: <TOR-ID> — <why>` so the suite stays green and the ID stays greppable. Report the
  TOR as FAIL in the self-assessment.
- **Stop:** run `/peak-workflow:pause` so the sidecar and handoff reflect the stopping point.
- Plan approval does not pre-authorize any deferral.

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
     errors, brand audit if UI). Report each gate as PASS / FAIL / CANNOT VERIFY.

  Before reporting, run two mechanical checks against the working tree (nothing is committed
  yet, so `git diff <base-branch>` alone would miss new files):
  - `grep -rl "<TOR-ID>" <test-directory>` must hit for every TOR ID. A miss means the test
     is not traceable — fix the test before continuing.
  - ```bash
    grep -inE 'todo|stub|placeholder|for now|not implemented|NotImplementedError' \
      $(git diff --name-only <base-branch>; git ls-files --others --exclude-standard)
    ```
     Judge each hit: a marker describing incomplete TOR behavior is a deferral-gate trigger for
     that TOR, unless the TOR already has a Deferrals row (a hit inside a `Deferred:` xfail
     reason is expected and not a trigger).
     Legitimate uses (e.g., argparse `placeholder`/`metavar`) are not triggers.

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
    is not met). Do NOT silently update the feature file — deviations that require changing a
    TOR requirement are change-control events and must go through
    `/peak-workflow:capture-requirements` on a `docs/` branch.

  Write (or update) `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` with
  these sections in this order:
  - **What Was Built** — 2–3 sentence summary
  - **Deferrals** — **mandatory, always present, placed immediately after What Was Built.**
    First line `Count: N`. Then a table `TOR ID | Unmet | Why | Decision | By | Date` with one
    row per TOR whose Given/When/Then is not fully met, where `Decision` is the option chosen
    at the deferral gate and `By` is the user who chose it. Every "Defer" answer from the
    deferral gate must appear here. If nothing was deferred, write `Count: 0` followed by the
    literal line `None` — do not omit the section.
  - **Key Files** table — files created or modified
  - **Spec Deviations** table — `TOR ID | As-Written | As-Implemented | Reason`
    (empty if no deviations). A deviation is a Then clause that was *adjusted*; it is also a
    deferral of the TOR as written, so every deviated TOR appears in both tables.
  - **Key Decisions** — design choices future epics should know about. Anything here that
    describes partial or stubbed behavior must have a matching Deferrals row.
  - **TOR Coverage (self-assessment)** — list each TOR ID with its PASS / FAIL / CANNOT VERIFY
    verdict from the self-assessment step
  - **Verification Results (self-assessment)** — quality gate results

  After writing the handoff, run
  `grep -inE 'stub|partial|for now|follow-up|todo|placeholder|not implemented' <handoff-path>`.
  Any hit outside the Deferrals table that has no matching Deferrals row fires the deferral
  gate for that TOR before continuing. If Defer is chosen here, update that TOR's TOR Coverage
  verdict to FAIL, apply the xfail marking, and re-run this grep.

  Plan approval already authorizes both the handoff write and any spec-level notation —
  do not re-prompt.

- **Mark as Implemented** — edit `docs/implementation-plan/status/epic-$ARGUMENTS.md`:
  change `status: In Progress` to `status: Implemented`. Set `implemented: <today>` (YYYY-MM-DD).
  Leave `completed:` as `—`. The `requirements:` field is NOT changed — it stays as set by
  `plan-project` or `add`.

  Also rewrite the epic spec file's `**Status:**` header line to
  `**Status:** Implemented — <today>` (same date just written to the sidecar's `implemented:`
  field), so the spec stays in sync with the sidecar.

- **Commit** — run `git branch --show-current` and confirm you are on
  `feature/epic-<id>-<short-name>`; if not, switch before staging anything. Stage all files
  created or modified during this epic by specific path (not `git add -A`), including the
  handoff file, updated status sidecar, and updated spec file. Commit without asking for permission.
  Message format:
  ```
  feat(epic-<id>): <short summary>

  Implements <TOR-list of TORs self-assessed PASS> — <1 sentence describing what the user can now do>.
  Deferred: <TOR-list of deferred TORs, or "none">
  Deferrals: <deferral-count>

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
  >   `/peak-workflow:wrapup-epic $ARGUMENTS` to independently verify each TOR requirement's
  >   Given/When/Then and close out this epic
  > - Or run `/peak-workflow:status` to review overall project progress and requirements coverage
  > - If something needs fixing before wrapup, make the changes and re-run
  >   `/peak-workflow:start-epic $ARGUMENTS` to continue on the same branch
  > ---
