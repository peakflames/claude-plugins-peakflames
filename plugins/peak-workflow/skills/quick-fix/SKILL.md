---
name: quick-fix
description: |
  Lightweight path for trivial items — bugs, copy changes, small enhancements (~2 hours or less).
  Creates a `hotfix/` branch, plans and implements the fix with applicable quality gates, and
  ships via prompted solo mode (local merge) or team mode (push + `gh pr create`).
  Quick-fixes are commit-level records — they do NOT get epic IDs, do NOT update
  `implementation-plan/index.md`, and do NOT write epic handoff files.
  Use when `/peak-workflow:triage` returned TRIVIAL, or when you know the request is too small
  to justify a full epic spec.
  Triggers on: "quick fix", "hotfix", "small fix", "trivial bug", "one-liner", "small tweak".
argument-hint: "<issue-number | free-text description>"
---

You are implementing a small fix via the lightweight quick-fix path. Unlike `/peak-workflow:start`, this path does **not** create an epic spec, does **not** touch `docs/implementation-plan/index.md`, and does **not** write a handoff file. The commit message (and optional PR) is the permanent record.

The user's request: $ARGUMENTS

## Layout Guard

**Before any other action:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

Follow these steps exactly:

## Step 1: Load Context and Resolve the Request

1. Read `CLAUDE.md` at the repo root — extract the **Verification & Quality Gates** section (build, tests, lint, UI checks) that apply to this fix.
2. Read `docs/architecture.md` for system context (if it exists).
3. Interpret `$ARGUMENTS`:
   - If it parses as an integer or starts with `#`, treat it as a GitHub issue number. Run `gh issue view <N> --json title,body,labels,state` to fetch the title and body. Extract a **kebab-case slug** from the title: lowercase, alphanumerics and hyphens only, ≤ 40 characters, trailing punctuation stripped.
   - Otherwise, treat `$ARGUMENTS` as a free-text description. Derive a kebab-case slug from the first meaningful phrase of the description (same rules).
4. Compose a **one-line summary** of the fix — this becomes the commit subject and (in team mode) the PR title.

## Step 2: Ask for Ship Mode

Use `AskUserQuestion` to pick the ship mode. Present both options neutrally — do **not** auto-detect a default, do **not** recommend one mode over the other. There is no reliable signal to determine which mode is correct for the user's context (repo permissions, team conventions, project phase, and personal preference all vary), so this choice must be made by the user every invocation.

- Question: `"Ship mode — solo (local merge, no push) or team (push + PR)?"`
- Options: `["Team — push and open PR", "Solo — local merge only"]`

Remember the user's choice — Step 4 and Step 5 branch on it.

## Step 3: Create the Hotfix Branch

1. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
2. `git checkout <base-branch>`
3. Create the hotfix branch:
   - If you have a GitHub issue number: `git checkout -b hotfix/issue-<N>-<slug>`
   - Otherwise: `git checkout -b hotfix/<slug>`
4. Confirm to the user:
   > Created hotfix branch `<branch-name>` from `<base-branch>`.

## Step 4: Enter Plan Mode

Enter plan mode. The plan is the complete execution script for this fix — every step after plan approval must appear as an explicit numbered item. The plan must include these items in order:

1. **Read affected source files** — enumerate the specific files the fix touches.
2. **Implement the fix** — name the specific files being modified and what changes.
3. **Run applicable quality gates from `CLAUDE.md`** — build, tests, lint, and `playwright-cli` if the fix is UI-visible. Report each as PASS / FAIL / CANNOT VERIFY (only CANNOT VERIFY if the environment genuinely cannot be stood up).
4. **Capture manual verification** (asked during execution, after quality gates and before the commit) — ask the user whether they performed any manual verification beyond the automated gates. Claude cannot infer this.

   Use `AskUserQuestion`:
   - Question: `"Did you perform any manual verification beyond the automated gates?"`
   - Options: `["Yes — I performed manual verification", "No — only automated gates were run"]`

   **If Yes:** follow up with a free-text request — "Briefly describe what you manually checked (one or two sentences)." Store the user's verbatim answer for use in the PR body (team mode).

   **If No:** store the literal string `No`.

   This is a disclosure, not a gate — `No` is a perfectly acceptable answer.
5. **Commit** — with these rules:
   - Run `git branch --show-current` first; it **must** equal the hotfix branch name. If not, switch before staging.
   - Stage by specific file path (not `git add -A`).
   - Commit message subject: `fix: <one-line summary>`
   - If a GitHub issue number was provided, append a trailer line: `Closes #<N>`. If no issue number, omit the trailer.
6. **Ship** — branch on the ship mode chosen in Step 2:

   ### If ship mode is SOLO
   - `git checkout <base-branch>`
   - `git merge <hotfix-branch> --no-ff -m "fix: merge <hotfix-branch> — <one-line summary>"`
   - `git branch -d <hotfix-branch>`
   - Do **not** push.
   - Report: `Branch <hotfix-branch> merged into <base-branch> and deleted. Changes not pushed — run 'git push' when ready.`

   ### If ship mode is TEAM
   - `git push -u origin <hotfix-branch>`
   - `gh pr create --base <base-branch> --title "fix: <one-line summary>" --body "<body>"`
   - Body template (populate from the issue body, quality gate results, and the manual-verification value captured in Step 4):

     ```
     ## Summary
     <2–3 sentence summary of the fix>

     <if issue number is known:>
     Closes #<N>

     ## Verification

     **Highlights**
     - ✅ <check> was run and it passed.
     - ⚠️ <check> passed with <exception>.

     **Conclusion:** <1–2 sentences explaining why the fix is safe to merge>

     **Manual verification performed:** <Yes | No>
     <if Yes: user-provided description from Step 4 on the next line>

     🤖 Generated via /peak-workflow:quick-fix
     ```

     Use literal Unicode ✅ ⚠️ ❌ — not shortcodes. Highlights are selective (2–4 bullets typical); skip trivialities.

     If no GitHub issue number was provided (free-text `$ARGUMENTS`, no triage handoff), omit the `Closes #<N>` line entirely — do not leave a bare `Closes #` in the rendered body.

   - **Announce PR on the GitHub issue** (conditional) — run only if an issue number was resolved in Step 1 **and** `gh auth status` succeeds:
     ```bash
     gh issue comment <N> --body "PR opened for this fix: <PR url>. Awaiting review."
     ```
     Capture the PR URL from the `gh pr create` output. If `gh auth status` fails or the comment command errors, print a warning (`gh issue comment failed — PR is still open, manual issue update may be desired`) and continue. Skip entirely in solo mode — nothing external to link to.
   - Stay on the hotfix branch. Do **NOT** run `gh pr merge` — merging is the reviewer's responsibility.
   - Do **NOT** delete the hotfix branch. GitHub auto-delete (if enabled) or manual cleanup handles it after the PR is merged.
   - Report: `PR opened: <url>. Feature branch <hotfix-branch> pushed. Await review; do not merge locally.`

7. **Present next steps** — print the PR URL (team) or a merge confirmation (solo), and note that no further tracking is required (quick-fixes are not in `implementation-plan/index.md`).

## Step 5: Execute the Plan

Exit plan mode and execute every item in the plan in order. Do not add, skip, or reorder items.

## Step 6: What NOT to Do

- Do **NOT** create a spec file under `docs/implementation-plan/phase-*/`.
- Do **NOT** write a handoff file under `docs/implementation-plan/session-handoffs/`.
- Do **NOT** update `docs/implementation-plan/index.md` — quick-fixes are not tracked there.
- Do **NOT** assign an epic ID. Quick-fixes have no epic ID.
- Do **NOT** run `gh pr merge` in team mode.
- Do **NOT** modify any `.feature.md` or `.feature.tracing.json` file in `docs/requirements/`.
  Quick-fixes implement bugs in code that already covers an existing TOR requirement — they do
  not change the requirement. If the fix requires changing a TOR's Given/When/Then, it is NOT
  a trivial fix — re-triage as HEAVY (requirements change needed) or EPIC (new implementation
  scope) via `/peak-workflow:triage`.
