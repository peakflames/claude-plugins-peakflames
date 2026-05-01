# Plan Template — `/peak-workflow:start`

This file is the lifecycle template that `start` Step 4 plans must follow. Copy the Opening
and Closing sections verbatim into your plan, substituting placeholders with values derived
in Step 1. The Middle section ("Implementation work") is the only place where epic-specific
steps are authored.

Placeholder reference:

- `<id>` — `$ARGUMENTS` verbatim (7-char alphanumeric)
- `<short-name>` — extracted from the spec filename in Step 1
- `<N>` — source issue number from Step 1 (omit announce/trailer if unknown)
- `<base-branch>` — `develop` if it exists, else `main`, else `master`
- `<TOR-list>` — comma-separated list of TOR IDs from the Requirements Anchors table

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
   (prior status was already In Progress). Item 3 uses this.

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
  method/function.

If Step 1 item 13 (E2E audit) surfaced regression specs likely to break, include an explicit
"update regression specs: …" item here, committed alongside the implementation.

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

- **Satisfy each TOR Given/When/Then** — for every TOR ID in the Requirements Anchors table:
  1. Confirm that the implementation code has been written (see Middle steps above).
  2. Run the test(s) written for this TOR ID. Every test must pass.
  3. Independently verify the implementation realizes the Given/When/Then (a passing test that
     doesn't exercise the requirement is a FAIL — inspect source code to confirm).
  4. Also run the project's Verification & Quality Gates from `CLAUDE.md` (build, lint, console
     errors, brand audit if UI). Report each gate as PASS / FAIL / CANNOT VERIFY.

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
    constraint): record the deviation in the handoff file as a "Spec Deviation" row. Do NOT
    silently update the feature file — deviations that require changing a TOR requirement are
    change-control events and must go through `/peak-workflow:capture-requirements` on a `docs/`
    branch.

  Write (or update) `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` with:
  - **What Was Built** — 2–3 sentence summary
  - **Key Files** table — files created or modified
  - **Spec Deviations** table — `TOR ID | As-Written | As-Implemented | Reason`
    (empty if no deviations)
  - **TOR Coverage** — list each TOR ID with its PASS / FAIL / CANNOT VERIFY verdict
  - **Verification Results** — quality gate results

  Plan approval already authorizes both the handoff write and any spec-level notation —
  do not re-prompt.

- **Mark as Implemented** — edit `docs/implementation-plan/status/epic-$ARGUMENTS.md`:
  change `status: In Progress` to `status: Implemented`. Set `implemented: <today>` (YYYY-MM-DD).
  Leave `completed:` as `—`. The `requirements:` field is NOT changed — it stays as set by
  `plan-project` or `add`.

- **Commit** — run `git branch --show-current` and confirm you are on
  `feature/epic-<id>-<short-name>`; if not, switch before staging anything. Stage all files
  created or modified during this epic by specific path (not `git add -A`), including the
  handoff file and updated status sidecar. Commit without asking for permission.
  Message format:
  ```
  feat(epic-<id>): <short summary>

  Implements <TOR-list> — <1 sentence describing what the user can now do>.

  Closes #<N>
  ```
  Omit the `Closes #<N>` trailer if no source issue was captured. Do not push.

- **Present next steps** — output this block exactly:
  > ---
  > **Next steps**
  > - Open a new session and run `/peak-workflow:wrapup $ARGUMENTS` to independently verify
  >   each TOR requirement's Given/When/Then and close out this epic
  > - Or run `/peak-workflow:status` to review overall project progress and requirements coverage
  > - If something needs fixing before wrapup, make the changes and re-run
  >   `/peak-workflow:start $ARGUMENTS` to continue on the same branch
  > ---
