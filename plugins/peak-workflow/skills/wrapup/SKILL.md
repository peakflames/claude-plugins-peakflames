---
name: wrapup
description: |
  Independent verification review of a completed epic — verifies each TOR requirement's
  Given/When/Then, closes out, and orients to next steps.
  Use after an epic is implemented and needs independent review.
  Triggers on: "wrapup epic", "verify epic", "review epic", "close epic",
  "is epic N done?", "check my work on epic N", "review what I built",
  "sign off on epic N", "close out epic N".
  Note: If the user says "I'm done with epic N", check whether the epic is "Implemented" (use wrapup) or "In Progress" (suggest /peak-workflow:pause instead).
argument-hint: "<epic-id>"
---

You are performing an independent verification and completion of Epic $ARGUMENTS.

You are acting as an independent reviewer — you did NOT implement this epic. Your job is to verify the implementation against the spec, close out the epic if it passes, and orient the team toward what's next.

This command has three phases: **Verify**, **Complete**, and **Orient**. Do not skip ahead — each phase gates the next.

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

## Phase 1: Verify

Your goal is to independently confirm the implementation meets the spec. Do not trust the implementer's self-assessment — inspect the code yourself.

> **Safe to re-run:** This command is safe to run multiple times. If a previous wrapup attempt was interrupted or failed, just run `/peak-workflow:wrapup N` again — it will re-verify from scratch.

### Step 1.1: Load Context

1. Use the project's `CLAUDE.md` content already loaded in your system context. Do not re-read it via the `Read` tool — it is injected into every conversation turn.
2. Read `docs/implementation-plan/status/epic-$ARGUMENTS.md` to get the epic's current status. Phase 3 (Orient) loads all phase indexes and sidecars when it walks the dependency graph — Step 1.1 only needs this epic's sidecar.
3. Check the sidecar: if `status: Implemented`, proceed. If `status: In Progress` or `status: Not Started`, inform the user that `/peak-workflow:start` must finish first. If `status: Complete`, inform the user it has already been wrapped up.
4. Read the epic spec file for Epic $ARGUMENTS. While reading, parse the header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** — it drives the Step 5b PR body `Closes #<N>` line. If no `Source:` line exists, the source issue number is unknown; skip the `Closes` line later.
4a. **Load TOR Requirements.** Parse the epic spec's `## Requirements Anchors` table. For each
    row, extract the TOR ID, feature file path, and scenario title. Then, for each TOR ID, open
    the cited feature file and locate the `Scenario: [TOR-NN-XXXXXXX]` block with that exact ID.
    Read the full Given/When/Then. These become the verification specifications — every subsequent
    verification step judges the implementation against these Given/When/Then statements.
5. **Verify Requirements Anchors.** An independent reviewer loads TOR requirements first so all
   subsequent verification is judged against the requirements baseline, not the implementer's
   self-assessment. For each row in the Requirements Anchors table:
   1. Confirm the TOR ID exists in the cited feature file with an exact ID match.
   2. **TOR ID not found:** record as a Requirements Anchor gap in the Step 1.6 report. This is
      a FAIL for that TOR — the epic spec referenced a requirement that no longer exists or was
      never in the cited file. Surface to the user:
      > TOR ID `{TOR-NN-XXXXXXX}` from the Requirements Anchors table was not found in
      > `{feature-file-path}`. This is a verification FAIL for this TOR. Options: (1) the
      > requirement was removed — update the epic spec to reflect this, (2) the feature file path
      > is wrong — correct the spec row, (3) stop and reconcile the requirements baseline via
      > `/peak-workflow:capture-requirements`.
   3. **TOR ID found but scenario title in the spec row doesn't match the feature file:** the
      spec's Requirements Anchors row may be stale (scenario was updated after the spec was
      written). Present both titles side by side:
      > Requirements Anchor mismatch for `{TOR-ID}`:
      > - **Epic spec title:** "{spec-title}"
      > - **Feature file title:** "{feature-file-title}"
      Use `AskUserQuestion`:
      - Question: `"TOR mismatch for {TOR-ID} — which title is the correct verification baseline?"`
      - Options:
        - `"Feature file (authoritative) — verify against '{feature-file-title}'"`
        - `"Epic spec (intentional override) — verify against '{spec-title}'"`
        - `"Stop — I'll reconcile the requirements baseline first"`
      Proceed only after the user selects an option. If Stop, end here and do not proceed to
      Step 1.2. Note in the Step 1.6 Anchor Reconciliation section which text was used.
   4. **TOR ID found and titles match:** record "Requirements Anchor verified: TOR-NN-XXXXXXX".
   5. **Spec has no Requirements Anchors section** (legacy spec from before peak-workflow v1.0.0):
      note this in the verification report and continue — legacy specs are grandfathered.
6. Read the handoff file in `docs/implementation-plan/session-handoffs/` for this epic (if one exists).
7. **Conditional architecture / design-notes reads.** The Step 1.5 code review checks consistency with `docs/architecture.md` and `docs/design-notes.md` — load only what is relevant to this epic:
   - If the epic touches IPC, the database schema, or other cross-cutting concerns named in `architecture.md`'s table of contents, read the relevant section.
   - If the epic raises a decision the design notes might already have addressed, read `docs/design-notes.md`.
   - If the epic is a localized UI / copy change with no cross-cutting impact, skip both — there is no consistency surface to check, and Step 1.5 simply records "no architectural surface affected".
8. From the spec filename (loaded in item 4), extract the **branch short name**: strip the directory path, the `epic-<id>-` prefix (where `<id>` is either a legacy integer, a decimal like `6.5`, or a 7-char alphanumeric ID), and the `.md` suffix. For example, `epic-3-user-auth.md` → `user-auth`, and `epic-a3f2K7p-user-auth.md` → `user-auth`. If there is no suffix after `epic-<id>`, omit it.
9. Check out the feature branch for this epic. Detect existence with a reliable test — do **not** rely on `git branch --list … && echo "exists"` (always exits 0) or on `git checkout` failing silently:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = branch exists; nonzero = missing. Then:
   - If `feature/epic-<id>-<short-name>` exists, run `git checkout feature/epic-<id>-<short-name>` (where `<id>` is `$ARGUMENTS` verbatim).
   - If it does not exist, repeat the existence test against the legacy name `feat/epic-N` (applies to integer IDs only — sessions started before v1.3.0). If the legacy branch exists, check it out.
   - If neither branch exists, inform the user and proceed on the current branch (the work may have been done directly on main in an older session).

### Step 1.2: Verify Requirements (TOR IDs)

For each TOR ID in the epic spec's Requirements Anchors table, independently verify the
requirement is satisfied by the implementation. You are the independent reviewer — you did NOT
implement this epic. Do not trust the implementer's self-assessment.

**For each TOR ID:**

1. **Read the Given/When/Then** (loaded in Step 1.1 item 4a).
2. **Locate the test(s)** the implementer wrote for this TOR ID. Look in the implementation
   handoff file (`session-handoffs/epic-<id>-implemented.md`) under "TOR Coverage" for which
   test files cover this TOR, then read those test files. **If no implemented handoff exists**
   (the session was interrupted before the handoff was written), fall back to a grep:
   ```bash
   grep -rl "<TOR-ID>" <test-directory>
   ```
   where `<test-directory>` is derived from CLAUDE.md's Verification & Quality Gates section
   (e.g., `tests/`, `spec/`, `__tests__/`). Read the matching files.
3. **Verify the test mirrors the Gherkin structure:**
   - Given → test arranges the described preconditions
   - When → test performs the described action
   - Then → test asserts the described observable outcome
   A test that does not faithfully mirror the Gherkin is a gap regardless of whether it passes.
4. **Run the test** yourself: `<project test command from CLAUDE.md> <specific test>`. The test
   must pass.
5. **Independently inspect source code** — read the implementation file to confirm the code
   actually realizes the Given/When/Then behavior. A passing test that exercises the wrong code
   path is a FAIL.
6. **For UI TOR IDs:** use `playwright-cli` against the live backend with real data (see
   "Local Environment" in `CLAUDE.md`). Do NOT mock API responses unless the backend genuinely
   cannot start. Start the backend first, then the frontend.

Report each TOR ID:
- **PASS** — test passes AND implementation inspection confirms the Given/When/Then is realized.
  Cite: `test file:line` and `impl file:line`.
- **FAIL** — test fails, OR test passes but implementation does not realize the requirement
  (describe specifically what is wrong).
- **CANNOT VERIFY** — only when the test environment cannot start after a genuine attempt, or
  when the check requires an environment that does not exist locally (e.g., Kubernetes, CI/CD).
  Never use this for checks that can be run against the live local API.

### Step 1.4: Run Quality Gates

Read the **Verification & Quality Gates** section from `CLAUDE.md`. Run every applicable check independently:
- Build check
- Visual verification via `playwright-cli` (if UI was changed)
- Brand compliance via the project's brand guidelines skill (if UI was changed and a brand skill is configured)
- Console check via `playwright-cli` (if UI was changed)

### Step 1.5: Code Review

Review the implementation for:
- Adherence to patterns established in previous epics and documented in `docs/reference/`
- Security concerns (input validation, injection, secrets handling)
- Error handling completeness
- Logging adequacy
- Consistency with whichever of `docs/architecture.md` and `docs/design-notes.md` were loaded conditionally in Step 1.1 item 7. If neither was loaded (the epic had no cross-cutting surface), record "no architectural surface affected" and move on.

### Step 1.6: Present Verification Report

Present a consolidated report to the user. The report has two jobs: a fast skim at the top (counters) and a reviewer-friendly narrative below (Highlights + Conclusion).

```
# Epic <id>: [Name] — Verification Report

## Counts
- TOR Requirements: X/Y PASS, Z CANNOT VERIFY
- Quality Gates: X/Y PASS

## Requirements Anchor Reconciliation
- [One of: "All TOR IDs verified in feature files — no discrepancies" /
  "Anchors grandfathered — spec pre-dates peak-workflow v1.0.0" /
  specific discrepancies resolved, each with a one-line note on which text was
  used as the verification baseline]

## Verification Narrative

### Highlights
- ✅ TOR-01-Afs657G — version flag implemented and tested (tests/test_cli.py:42, src/cli.py:118)
- ✅ TOR-01-Bcd2345 — help flag implemented and tested (tests/test_cli.py:67, src/cli.py:124)
- ⚠️ TOR-02-Xyz5678 — happy-path test passes; negative-path test (invalid token) is missing
- ❌ TOR-03-Mno9012 — implementation returns status code 200 but the Then clause requires 201

### Conclusion
<2–3 sentences explaining why this verification is sufficient for the epic's TOR requirements,
or — if FAIL — what specifically needs to be addressed before re-run>

## Code Review Findings
- [list any concerns, or "No issues found"]

## Verdict: PASS / FAIL / PASS WITH EXCEPTIONS
```

**Requirements Implemented table** (always included below the Verdict):

```
## Requirements Implemented

| TOR ID | Feature File | Verdict | Test Reference |
|--------|--------------|---------|----------------|
| TOR-01-Afs657G | 01-cli.feature.md | PASS | tests/test_cli.py:42 |
| TOR-01-Bcd2345 | 01-cli.feature.md | PASS | tests/test_cli.py:67 |
| TOR-02-Xyz5678 | 02-auth.feature.md | PASS WITH EXCEPTIONS | tests/test_auth.py:91 |
| TOR-03-Mno9012 | 03-parts.feature.md | FAIL | tests/test_parts.py:15 |
```

**Authoring the Highlights list:**

- Highlights are **selective**, not comprehensive — 3–6 bullets is typical, not one bullet per item. Lead the reviewer to the substantive checks; skip trivialities.
- Author them from what was actually run in Steps 1.2–1.4.
- Lead each bullet with a literal Unicode emoji — ✅ for pass, ⚠️ for pass-with-exception, ❌ for fail. Do **not** use shortcodes like `:white_check_mark:` — they don't render in git commits or many markdown viewers.

**If the verdict is FAIL:** Stop here. List the specific items that need to be fixed. Do NOT proceed to Phase 2. The implementer needs to address the failures, then this command should be run again.

**If the verdict is PASS or PASS WITH EXCEPTIONS:** Ask the user to confirm before proceeding to Phase 2.

---

## Phase 2: Complete

Your goal is to close out the epic by writing the permanent record and updating project tracking.

### Step 2.0: Capture Manual Verification

Before writing the handoff or PR body, ask the user whether they performed any manual verification beyond the automated gates from Phase 1. Claude cannot infer this — it must come from the human.

Use `AskUserQuestion`:

- Question: `"Did you perform any manual verification beyond the automated gates I ran?"`
- Options: `["Yes — I performed manual verification", "No — only automated gates were run"]`

**If Yes:** follow up with a free-text request — "Briefly describe what you manually checked (one or two sentences)." Store the user's verbatim answer for use in Step 2.1 and Step 5b.

**If No:** store the literal string `No` as the manual-verification value.

This is a disclosure, not a gate — `No` is a perfectly acceptable answer. The point is the disclosure, not ceremony.

### Step 2.1: Write the Handoff File

Write the completion handoff to `docs/implementation-plan/session-handoffs/epic-<id>-complete.md` (where `<id>` is `$ARGUMENTS` verbatim — legacy integer or 7-char alphanumeric).

Use the template at `plugins/peak-workflow/skills/wrapup/HANDOFF_TEMPLATE.md`. Read that file once, copy its template body verbatim into the handoff file, and fill in placeholders from the Step 1.6 verification report and the Step 2.0 manual-verification disclosure.

### Step 2.2: Update Status Sidecar

Update `docs/implementation-plan/status/epic-$ARGUMENTS.md`:
1. Change `status: Implemented` to `status: Complete`
2. Set `completed: <today>` (YYYY-MM-DD)
3. Set `handoff: session-handoffs/epic-<id>-complete.md` (where `<id>` is `$ARGUMENTS` verbatim)

### Step 2.3: Commit

Automatically commit all changes made during verification and completion without
asking the user for permission:

1. Stage the handoff file, updated `docs/implementation-plan/status/epic-$ARGUMENTS.md`, and any other files modified during verification (specific file paths, not `git add -A`)
2. Commit message format: `chore(epic-<id>): verify and complete — <brief summary>` (where `<id>` is `$ARGUMENTS` verbatim)

Do NOT push to the remote yet.

---

## Phase 3: Orient

Your goal is to help the user decide what to work on next. Glob `docs/implementation-plan/phase-*/index.md` and read all phase indexes; glob `docs/implementation-plan/status/epic-*.md` and read all sidecars. (Step 1.1 item 2 only loaded this epic's sidecar.) Assemble the full dependency graph from the phase indexes and look up all epic statuses from the sidecars. Then present:

### Step 3.1: What's Now Unblocked

List any epics whose dependencies are now fully satisfied thanks to this epic's completion. For each, include:
- Epic ID (legacy integer or 7-char alphanumeric) and name
- Its dependencies (and whether they're all met)
- A one-line summary of what it involves

### Step 3.2: Parallelization Opportunities

If multiple epics are now unblocked, call out which ones can be worked on in parallel.

### Step 3.3: Recommended Next Action

Based on the dependency graph and project state, recommend which epic to start next (or which set to run in parallel), with a brief rationale.

### Step 3.4: Outstanding Items

If the verification found any non-blocking issues (PASS WITH EXCEPTIONS, CANNOT VERIFY items, tech debt), list them here as items to address before the final QA epic or during CI/CD setup.

Present this as a clear summary the user can act on:

```
## Next Steps

### Unblocked Epics
- Epic X: [Name] — [one-line summary] (all dependencies met)
- Epic Y: [Name] — [one-line summary] (all dependencies met)

### Recommended Action
[Your recommendation and why]

### Outstanding Items (non-blocking)
- [Items to address later]
```

After presenting the orientation summary, remind the user:

> Run `/peak-workflow:status` to see the updated Requirements Coverage dashboard — it shows
> which TOR IDs are now satisfied across all complete epics, and what percentage of the
> requirements baseline has been verified.

---

## Step 4: Refresh Documentation

After presenting the orientation summary, automatically refresh `docs/architecture.md` and
`docs/design-notes.md` to reflect the as-built codebase. Delegate this to a subagent using
the Haiku model so the main session stays focused.

Use the Agent tool with model `haiku` (the shorthand resolves to the current Haiku version automatically). Brief the subagent with:

> Execute the `/peak-workflow:refresh-docs` skill (no arguments — refresh both documents).
> When you reach Step 8 (Commit), auto-commit without asking the user for permission.
> Commit message format: `docs: refresh architecture and design notes — <brief summary of changes>`
> Do NOT push to the remote.

**Wait for the subagent to complete before proceeding.** The refreshed documents must be
committed on the feature branch before it is merged into main.

---

## Step 5: Ship to Base Branch

After Phase 3 orientation is complete and the Step 4 doc refresh subagent has
committed on the feature branch, ship the branch. Ask the user which mode to use
via `AskUserQuestion`. Present both options neutrally — do **not** auto-detect a
default, do **not** recommend one mode over the other. There is no reliable signal
to determine which mode is correct for the user's context (repo permissions, team
conventions, project phase, and personal preference all vary), so this choice must
be made by the user every invocation.

- Question: `"Ship mode — solo (merge locally to the base branch) or team (push the branch and open a pull request)?"`
- Options: `["Team — push and open PR", "Solo — local merge only"]`

### Step 5a: Solo mode

1. Note the current feature branch name (`feature/epic-<id>-<short-name>` or legacy `feat/epic-N`).
2. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
3. `git checkout <base-branch>`
4. `git merge <branch> --no-ff -m "epic(<id>): merge <branch> — <brief summary>"`
5. `git branch -d <branch>`
6. Confirm with `git log --oneline -5`
7. Report to the user:
   > Branch `<branch>` has been merged into `<base-branch>` and deleted.
   > Changes have not been pushed — run `git push` when ready.

### Step 5b: Team mode

1. Note the current feature branch name.
2. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
3. `git push -u origin <branch>`
4. `gh pr create --base <base-branch> --title "epic(<id>): <epic name>" --body "<body>"`

   The body follows the template at `plugins/peak-workflow/skills/wrapup/PR_BODY_TEMPLATE.md`. Read that file once, copy its template body verbatim into the `--body` argument, and substitute placeholders from the Step 1.6 verification report and the Step 2.0 manual-verification disclosure. Reuse the "What Was Built" content **already in memory** from Step 2.1 — do not re-read the handoff file from disk.

   The `Closes #<N>` line is driven by the spec's `**Source:** Issue #<N>` header captured in Step 1.1 item 4 — if no source issue is known, omit the `Closes` line entirely (existing integer-IDed epics without a `Source:` line render cleanly this way).

5. **Announce PR on the GitHub issue** (conditional) — run only if a source issue number was captured in Step 1.1 item 4 **and** `gh auth status` succeeds:
   ```bash
   gh issue comment <N> --body "PR opened for Epic <id>: <PR url>. Awaiting review."
   ```
   Capture the PR URL from the `gh pr create` output in item 4. If `gh auth status` fails or the comment command errors, print a warning (`gh issue comment failed — PR is still open, manual issue update may be desired`) and continue; the PR itself is the essential deliverable, the comment is a courtesy. Skip this step entirely in solo mode (Step 5a) — nothing external to link to.
6. Do **NOT** run `gh pr merge`. Merging is the reviewer's responsibility.
7. Do **NOT** delete the feature branch. GitHub auto-delete (if enabled) or manual cleanup handles it after merge.
8. Report to the user:
   > PR opened: `<url>`. Feature branch `<branch>` pushed. Await review; do not merge locally.
