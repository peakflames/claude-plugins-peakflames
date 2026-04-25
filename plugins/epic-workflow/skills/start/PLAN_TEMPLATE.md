# Plan Template — `/epic-workflow:start`

This file is the lifecycle template that `start` Step 4 plans must follow. Copy the opening and closing sections verbatim into your plan, substituting placeholders with values derived in Step 1. The middle "Implementation work" section is the only place where epic-specific steps are authored.

Placeholder reference:

- `<id>` — `$ARGUMENTS` verbatim (legacy integer, decimal, or 7-char alphanumeric)
- `<short-name>` — extracted from the spec filename in Step 1 item 7
- `<N>` — source issue number captured in Step 1 item 8 (omit trailer / announce if unknown)
- `<base-branch>` — `develop` if it exists, else `main`, else `master`

---

## Opening steps (always the first four plan items)

1. **Create (or verify) feature branch** — run `git branch --show-current` to check the current branch. Then check whether the target branch already exists with a reliable test:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = exists, nonzero = missing. (Do **not** rely on `git branch --list … && echo "exists"` — that pipeline always exits 0 and produces false positives.) Then:
   - If already on `feature/epic-<id>-<short-name>`, confirm and continue.
   - If the branch exists but you are not on it, run `git checkout feature/epic-<id>-<short-name>`.
   - If the branch does not exist, detect the base branch (`develop` > `main` > `master`), switch to it, and run `git checkout -b feature/epic-<id>-<short-name>`.

   Use the exact branch name derived from the spec filename (`<id>` is `$ARGUMENTS` verbatim).
2. **Update status to "In Progress"** — edit `docs/implementation-plan/index.md`: change Epic $ARGUMENTS status from "Not Started" (or "Paused") to "In Progress". Leave Implemented and Completed dates as `—`. Capture whether this is a **fresh transition** (prior status was "Not Started" or "Paused") or a **resumption** (prior status was already "In Progress"). Item 3 uses this.
3. **Announce work-started on GitHub** — if Step 1 item 8 captured no source issue, replace this plan item with the single line `GitHub announce: SKIP — no source issue`. Otherwise, run only if (a) this is a fresh transition (not a resumption — do not re-announce an already-in-progress epic) and (b) `gh auth status` succeeds. Then:
   ```bash
   gh issue comment <N> --body "Epic <id> work has started on branch \`feature/epic-<id>-<short-name>\`. I'll follow up here when the PR opens."
   ```
   On `gh` failure (auth fails or command errors), print a warning (`gh unavailable — skipping issue announcement`) and continue; this is a nice-to-have, not a blocker. Do not prompt the user for permission — the user already opted in by attaching an issue number to the epic source.
4. **Create tasks** — create one task per **logical work block** (typically 5–10 tasks for a normal epic), grouping fine-grained acceptance criteria. Aim for a task list a human can scan in 10 seconds; per-AC granularity creates noise without improving execution. Issue a single batched `TaskCreate` call (one tool use creating all tasks) rather than sequential calls per task.

## Middle steps (implementation work)

Authored per-epic. Derive these from the epic's acceptance criteria and key components. Each step should map to one or more acceptance criteria items and name the specific files to create or modify. If Step 1 item 13 (E2E audit) surfaced regression specs likely to break, include an explicit "update regression specs: …" item here so it is committed alongside the implementation rather than discovered at the verification gate.

## Closing steps (always the last five plan items, in this order)

- **Satisfy verification** — re-read the epic spec's Verification section. For each item, write any code, tests, or configuration needed to satisfy it. Also run the Verification & Quality Gates from `CLAUDE.md` that apply to this epic. Check the "Local Environment" section in `CLAUDE.md`: when the backend is live, verify against real data using `playwright-cli` — do not mock.

  **IPC / dev-server caveat:** if the project uses a dev-server-only render harness (e.g., Vite for an Electron app) and the epic touches surfaces that depend on IPC, the database, or any backend wiring, do **not** rely on `playwright-cli` against the dev server alone — that environment cannot exercise the data path. Use the project's E2E suite for those surfaces, and reserve `playwright-cli` for pure render/style verification.

  Report each item as: PASS (with evidence), FAIL (describe what went wrong), or CANNOT VERIFY (only if the environment is genuinely unavailable after attempting to start it).
- **Reconcile spec** — re-read the epic spec file. Compare original acceptance criteria and verification items against what was actually implemented. Then:
  - Write (or update) `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` with a Spec Deviations table (Original Spec | As-Implemented | Reason), an Implementation Notes section (key files changed, additional work), and a Verification Results section.
  - **If there are deviations to record**, also edit the spec in-place to reflect actual delivery, checking off completed items and annotating any items that should remain unchecked or carry as-implemented divergence notes.
  - **If the implementation tracks the spec's acceptance criteria 1:1 with no deviations**, skip the in-place spec checkbox edits — the index status change to "Implemented" is the source of truth for completion. Note "no deviations" in the handoff file.
  - Plan approval already authorizes both the handoff write and any spec edits — proceed without re-prompting.
- **Mark as Implemented** — edit `docs/implementation-plan/index.md`: change Epic $ARGUMENTS status from "In Progress" to "Implemented". Set the Implemented date to today (YYYY-MM-DD). Leave the Completed date as `—`.
- **Commit** — run `git branch --show-current` and confirm you are on `feature/epic-<id>-<short-name>`; if not, switch before staging anything. Stage all files created or modified during this epic by specific path (not `git add -A`), including the handoff file. Commit without asking for permission. Message format: `feat(epic-<id>): <short summary>` (where `<id>` is `$ARGUMENTS` verbatim) with a 1–2 sentence body summarizing key deliverables. When a **source issue number** was captured in Step 1 item 8, append a blank line then `Closes #<N>` as a trailer to the commit body so GitHub auto-closes the issue when the epic merges:
  ```
  feat(epic-<id>): <short summary>

  <1–2 sentence body summarizing key deliverables>

  Closes #<N>
  ```
  If no source issue is known, omit the trailer. Do not push.
- **Present next steps** — output this block:
  > ---
  > **Next steps**
  > - Open a new session and run `/epic-workflow:wrapup $ARGUMENTS` to independently verify and close out this epic
  > - Or run `/epic-workflow:status` to review overall project progress
  > - If something needs fixing before wrapup, make the changes and re-run `/epic-workflow:start $ARGUMENTS` to continue on the same branch
  > ---
