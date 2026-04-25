---
name: wrapup
description: |
  Independent verification review of a completed epic — verifies implementation, closes out, and orients to next steps.
  Use after an epic is implemented and needs independent review.
  Triggers on: "wrapup epic", "verify epic", "review epic", "close epic",
  "is epic N done?", "check my work on epic N", "review what I built",
  "sign off on epic N", "close out epic N".
  Note: If the user says "I'm done with epic N", check whether the epic is "Implemented" (use wrapup) or "In Progress" (suggest /epic-workflow:pause instead).
argument-hint: "<epic-id>"
---

You are performing an independent verification and completion of Epic $ARGUMENTS. The epic ID may be a legacy integer (e.g., `7`, `6.5`) or a 7-character alphanumeric ID (e.g., `a3f2K7p`) — both formats are accepted throughout this skill.

You are acting as an independent reviewer — you did NOT implement this epic. Your job is to verify the implementation against the spec, close out the epic if it passes, and orient the team toward what's next.

This command has three phases: **Verify**, **Complete**, and **Orient**. Do not skip ahead — each phase gates the next.

---

## Phase 1: Verify

Your goal is to independently confirm the implementation meets the spec. Do not trust the implementer's self-assessment — inspect the code yourself.

> **Safe to re-run:** This command is safe to run multiple times. If a previous wrapup attempt was interrupted or failed, just run `/epic-workflow:wrapup N` again — it will re-verify from scratch.

### Step 1.1: Load Context

1. Use the project's `CLAUDE.md` content already loaded in your system context. Do not re-read it via the `Read` tool — it is injected into every conversation turn.
2. From `docs/implementation-plan/index.md`, locate the row for Epic $ARGUMENTS to confirm its current status. Use `grep -n "epic-$ARGUMENTS"` to find the row's line number, then `Read` with a tight `offset` / `limit` window covering it. Phase 3 (Orient) reads the broader index when it walks the dependency graph — Step 1.1 only needs this epic's row.
3. Verify Epic $ARGUMENTS is in **"Implemented"** status. If it is still "In Progress" or "Not Started", inform the user that `/epic-workflow:start` must finish first. If it is already "Complete", inform the user it has already been wrapped up.
4. Read the epic spec file for Epic $ARGUMENTS. While reading, parse the header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** — it drives the Step 5b PR body `Closes #<N>` line. If no `Source:` line exists, the source issue number is unknown; skip the `Closes` line later.
5. **Verify the Vision & Scenario Anchors.** The epic spec should contain a `## Vision & Scenario Anchors` section. An independent reviewer reads these first so the rest of the verification is judged against the right notion of user intent:
   1. **Forward-looking fast-path.** Before opening source docs, scan each anchor's paraphrase for forward-looking phrasing: "needs updating when this epic ships", "will be …", "after this epic", or similar. Anchors that explicitly describe future state cannot conflict with current source docs by definition — record them as "no conflict, source updates pending at close-out" in the Step 1.6 Anchor Reconciliation section and move on. Apply the full source-vs-paraphrase comparison only to anchors that make a substantive claim about *current* product behavior or scenario flow.
   2. For each remaining **vision anchor** bullet, open `docs/product-vision-planning/product-vision.md` and read the specific section cited. Compare paraphrase to source.
   3. For each remaining **scenario anchor** bullet, open `docs/product-vision-planning/concept-of-operations.md` and read the specific scenario step cited. Compare paraphrase to source.
   4. If any paraphrase conflicts with its source — meaning a reasonable reader would draw different acceptance conclusions from the two texts — **stop**. Neither source is automatically authoritative: the paraphrase may be the post-discovery refinement the implementer worked against, or the vision doc may have been updated mid-epic. Surface the discrepancy to the user with both texts side by side and ask which represents current intent. The user's answer then drives two downstream behaviors:
       - **Verification baseline** — Steps 1.2 and 1.3 (Verify Acceptance Criteria, Verify Verification) judge the implementation against the **confirmed intent**, not against whichever text is literally in the spec. If the implementation was built against the paraphrase but the user confirms the source doc reflects current intent (or vice versa), any resulting divergence is a verification **FAIL** and must be listed in the Step 1.6 report — do not silently accept it on the grounds that the implementation "matched the spec."
       - **Anchor Reconciliation note** — Record the discrepancy, the user's answer, and which text was used as the verification baseline in the new "Anchor Reconciliation" section of the Step 1.6 Verification Report so the reviewer (and future readers of the handoff) can see what the epic was ultimately verified against.
   5. If the spec has a placeholder line noting vision docs do not yet exist, note this and continue — the absence of vision docs is a known greenfield condition, not a conflict.
   6. If the spec pre-dates v2.1.0 and has no Anchors section at all, note this in the verification report and continue — legacy specs are grandfathered.
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

### Step 1.2: Verify Acceptance Criteria

Read the epic spec's **Acceptance Criteria** section. For each item, independently verify it was implemented correctly by reading the relevant source files.

Report each criterion:
- **PASS** — implemented correctly (cite the file and line)
- **FAIL** — not implemented, or implemented incorrectly (describe the gap)

### Step 1.3: Verify Verification Section

Read the epic spec's **Verification** section. For each item, independently confirm it is satisfied:
- Run commands (build, tests) yourself
- Use `playwright-cli` for any visual checks — **always use the live backend with real data** (see the "Local Environment" section in `CLAUDE.md` for how to start the backend). Do NOT mock API responses unless the backend genuinely cannot start. Start the backend first, then the frontend, and navigate with playwright-cli against the real running app.
- Read code to confirm behavioral claims (error handling, logging, etc.)
- Interactively test UI behaviors (filter inputs, clicks, navigation) against real data

Report each item:
- **PASS** — verified independently (include evidence)
- **FAIL** — verification failed (describe what's wrong)
- **CANNOT VERIFY** — only use this when the backend is genuinely unavailable after attempting to start it, or when the check requires an environment that doesn't exist locally (e.g., Kubernetes, CI/CD). Never use this for checks that can be run against the live local API.

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
- Acceptance Criteria: X/Y PASS
- Verification Items: X/Y PASS, Z CANNOT VERIFY
- Quality Gates: X/Y PASS

## Anchor Reconciliation
- [One of: "All vision and scenario anchors matched their source sections" / "Anchors grandfathered — spec pre-dates v2.1.0" / "Vision docs not yet present (greenfield placeholder)" / specific conflicts resolved, each with a one-line note on what intent was confirmed]

## Verification Narrative

### Highlights
- ✅ <Check name> was run and it passed.
- ✅ <Check name> was run and it passed.
- ⚠️ <Check name> mostly passed — <one-sentence exception>.
- ❌ <Check name> failed — <one-sentence reason>.

### Conclusion
<2–3 sentences explaining why this verification is sufficient for the epic's
acceptance criteria, or — if FAIL — what needs to be addressed before re-run>

## Code Review Findings
- [list any concerns, or "No issues found"]

## Verdict: PASS / FAIL / PASS WITH EXCEPTIONS
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

Use the template at `plugins/epic-workflow/skills/wrapup/HANDOFF_TEMPLATE.md`. Read that file once, copy its template body verbatim into the handoff file, and fill in placeholders from the Step 1.6 verification report and the Step 2.0 manual-verification disclosure.

### Step 2.2: Update the Implementation Plan Index

Update `docs/implementation-plan/index.md`:
1. Change Epic $ARGUMENTS status from "Implemented" to **"Complete"**
2. Add the handoff link: `[handoff](session-handoffs/epic-<id>-complete.md)` (where `<id>` is `$ARGUMENTS` verbatim)
3. Set the **Completed** date column to today's date (YYYY-MM-DD)

### Step 2.3: Commit

Automatically commit all changes made during verification and completion without
asking the user for permission:

1. Stage the handoff file, updated `index.md`, and any other files modified during
   verification (specific file paths, not `git add -A`)
2. Commit message format: `chore(epic-<id>): verify and complete — <brief summary>` (where `<id>` is `$ARGUMENTS` verbatim)

Do NOT push to the remote yet.

---

## Phase 3: Orient

Your goal is to help the user decide what to work on next. Read `docs/implementation-plan/index.md` in full now (Step 1.1 item 2 only loaded this epic's row) so you have the dependency graph for every remaining epic, then present:

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

---

## Step 4: Refresh Documentation

After presenting the orientation summary, automatically refresh `docs/architecture.md` and
`docs/design-notes.md` to reflect the as-built codebase. Delegate this to a subagent using
the Haiku model so the main session stays focused.

Use the Agent tool with model `haiku` (the shorthand resolves to the current Haiku version automatically). Brief the subagent with:

> Execute the `/epic-workflow:refresh-docs` skill (no arguments — refresh both documents).
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

   The body follows the template at `plugins/epic-workflow/skills/wrapup/PR_BODY_TEMPLATE.md`. Read that file once, copy its template body verbatim into the `--body` argument, and substitute placeholders from the Step 1.6 verification report and the Step 2.0 manual-verification disclosure. Reuse the "What Was Built" content **already in memory** from Step 2.1 — do not re-read the handoff file from disk.

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
