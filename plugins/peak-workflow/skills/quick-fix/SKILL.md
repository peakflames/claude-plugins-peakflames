---
name: quick-fix
description: |
  Lightweight path for trivial items — bugs, copy changes, small enhancements (~2 hours or less).
  Creates a `hotfix/` branch, plans and implements the fix with applicable quality gates (plus an
  owner-approved amendment path for one wrong requirement), and
  ships via prompted solo mode (local merge) or team mode (push + `gh pr create`).
  Quick-fixes are commit-level records — they do NOT get epic IDs, do NOT update
  `implementation-plan/index.md`, and do NOT write epic handoff files.
  Use when `/peak-workflow:triage` returned TRIVIAL, or when you know the request is too small
  to justify a full epic spec.
  Triggers on: "quick fix", "hotfix", "small fix", "trivial bug", "one-liner", "small tweak".
argument-hint: "<issue-number | free-text description>"
---

You are implementing a small fix via the lightweight quick-fix path. Unlike `/peak-workflow:start-epic`, this path does **not** create an epic spec, does **not** touch `docs/implementation-plan/index.md`, and does **not** write a handoff file. The commit message (and optional PR) is the permanent record.

The user's request: $ARGUMENTS

## Format Guard

**Before any other action:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On any other exit, print its output and stop — it names the fix (`/peak-workflow:upgrade`, a
plugin update, or a Python install). After this guard, read the project's files only in the
current format.

---

Follow these steps exactly:

## Step 1: Load Context and Resolve the Request

1. Read `CLAUDE.md` at the repo root — extract the **Verification & Quality Gates** section (build, tests, lint, UI checks) that apply to this fix.
2. Read `docs/architecture.md` for system context (if it exists).
3. Interpret `$ARGUMENTS` (first strip a trailing `— amends <TOR-ID> (owner-approved)` — Step 1
   item 6 reads it):
   - If it parses as an integer or starts with `#`, treat it as a GitHub issue number. Run `gh issue view <N> --json title,body,labels,state` to fetch the title and body. Extract a **kebab-case slug** from the title: lowercase, alphanumerics and hyphens only, ≤ 40 characters, trailing punctuation stripped.
   - Otherwise, treat `$ARGUMENTS` as a free-text description. Derive a kebab-case slug from the first meaningful phrase of the description (same rules).
4. Compose a **one-line summary** of the fix — this becomes the commit subject and (in team mode) the PR title.
5. **Requirements in play.** The helper is always called as
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <command>` (written `tor-lifecycle` below);
   exit 2 or 3 from it is a data or install problem — print its output and stop. Run
   `tor-lifecycle states --json` once. The fix's **requirements** are the TOR IDs the request
   names, plus those cited by the test functions and source lines the fix will change (not every
   ID in those files). Print each as `TOR-… — <title>` from one `tor-lifecycle titles <IDs>` run,
   with its `states` state; `titles` exits 1 when an ID is unknown — print its line and continue.
   - **Owned by an In Progress or Paused epic** — warn: `<TOR> is being built by Epic <id>
     (<slug>) — <Name>; this fix may conflict with its branch.` Also run
     `tor-lifecycle inflight <files the fix changes>` and list any branch it names. If the fix
     changes the behavior that requirement states (rather than making the code match it), stop:
     `This changes <TOR>, which Epic <id> is building — amend it first with
     /peak-workflow:capture-requirements <TOR> <change>, and build the change in that epic.`
   - **Disputed under `# Safety`** (`dispute.safety: true`) — stop: `<TOR> is a Safety
     requirement known to be wrong (<CR-ID>). No branch that touches it can ship until it is
     resolved on a docs/ branch: /peak-workflow:capture-requirements <TOR>`.
   - **Disputed** (other) — warn in one line and list it in the PR body; continue.
   - **Changed since verified** or **Verification failed** — note it for Step 4 item 7 (the
     reverify command after the fix).
6. **Amendment path?** It applies when `$ARGUMENTS` ends with `— amends <TOR-ID>
   (owner-approved)` (from `/peak-workflow:triage`), or when reading the code shows that a
   requirement in play is itself wrong, not the code. Settle it here, before the branch:
   - **Safety** (`safety: true`) — never amended here: stop with
     `/peak-workflow:capture-requirements <TOR>` (a `docs/` branch).
   - **Owning epic** (`states` row `epic`): **Complete**, or none → continue. **Not Started, In
     Progress, or Paused** → stop: `That epic builds it — amend the requirement first with
     /peak-workflow:capture-requirements <TOR> <description>.` **Implemented** → stop: `Epic <id>
     is waiting for wrapup — run /peak-workflow:wrapup-epic <id>; its Step 1.4b can amend the
     requirement there.`
   - **Size** — the requirement change plus the code fix must be about two hours or less; if
     not, stop and recommend `/peak-workflow:triage <request>`.

   These are the **eligibility rules**; Step 4 item 5 reuses them.
   - Ask with `AskUserQuestion` — always, even after a triage hand-off: this answer is the owner
     approval the record cites (`approved_by` is whoever answers it):
     - Question: `"<TOR> — <title> looks wrong: <why, one line>. Proposed: <new wording, one line>. Amend it with this fix?"`
     - Options: `["Amend <TOR> (owner approval)", "Fix the code only — the requirement stands", "Stop"]`

     On **Amend**, run the decision test as `capture-requirements` states it once
     (`${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/SKILL.md`, "Lifecycle Rules", L3) on the current block vs the proposed one: **reword-eligible** → the
     amendment is a **reword**; **meaning change** → a **supersede**. For a supersede, generate the
     successor ID now, in the same feature number — generate the 7-character suffix with `LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7` and regenerate it while it is all digits or `git grep --untracked -q <suffix>` finds it anywhere (feature files and `docs/requirements/changes/` included) — so the plan's tests cite it from the
     start.
     Carry the result into the plan (Step 4 items 2a and 5a).

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
2. **Implement the fix** — name the specific files being modified and what changes. A test or
   comment that cites a retired or superseded ID (`tor-lifecycle sweep <ID>`) may be retargeted to
   its successor or deleted as part of the fix — a test-and-comment-only change.
2a. **Amend the requirement** (amendment path only — omit otherwise). Written as
   `capture-requirements` states it once (`${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/SKILL.md`, "Lifecycle Rules" L4 and L5;
   `${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/CHANGE_RECORD_TEMPLATE.md`; the record's `CR-`
   suffix is generated like the successor's),
   with `approved_via = "quick-fix"`, `approved_by` = `git config user.name`, and `refs` naming the
   issue (if any) and `"epic <owning epic>"`. Check the record with `tor-lifecycle validate <record>`
   until it prints `ok`.
   - **Reword** (same ID): nothing here — the reword is item 5a, after the code commit, because
     its evidence must be the tree the citing tests ran against.
   - **Supersede** (new ID): write the successor's block in place of the old one (L5 choice 3),
     the `supersede` record (old `text` and `fingerprint` from
     `tor-lifecycle text <TOR> --rev <base-branch> --json`), and the tracing swap — delete the old
     entry (its sources go into `traced_to`) and add the successor's with the same `traces_to` and
     `"rationale": "Supersedes <old TOR> (<CR-ID>): <reason>"`. The fix's tests cite the
     successor; retarget any test still citing the old ID. With no owning epic, the successor stays
     unassigned: Step 4 item 7 prints `/peak-workflow:add` for it.
2b. **Reverify the successor** (supersede with an owning epic only). Verification stays
   independent: launch a fresh `general-purpose` sub-agent with the `Agent` tool (never a fork —
   it must not see this session). Give it only the successor's Scenario block
   (`tor-lifecycle text <successor>`), the repository root, the Test directories line and the test
   command wherever `CLAUDE.md` lists them, and this brief: *"Independently verify this
   requirement against the code in the working tree at <repo root>. Find its tests by grepping the
   test directories for the ID; run them; read the implementation. A test that passes without
   exercising the Given/When/Then is a FAIL. Do not modify any file. Reply PASS, FAIL, or CANNOT
   VERIFY with test file:line, implementation file:line, and one sentence of reasoning."* Then
   record the result and append the successor to the owning Complete epic in **one** call — the
   only change ever made to a Complete epic's `requirements:` (the old ID stays, now superseded),
   and never without a `verified:` or `unverified:` line beside it:
   - **PASS** → `tor-lifecycle mark <epic> --append <successor> --pass <successor>`.
   - **FAIL / CANNOT VERIFY** → ask: `"<successor> did not verify: <reason>. How to proceed?"`
     with `["Fix it and verify again", "Ship it marked unverified", "Stop"]`. **Ship it marked
     unverified** runs `tor-lifecycle mark <epic> --append <successor> --fail <successor> "<reason>"` (it then reads
     Verification failed) and Step 4 item 7 prints its reverify command. Never leave a successor
     with neither line — it would read as verified.
3. **Run applicable quality gates from `CLAUDE.md`** — build, tests, lint, and `playwright-cli` if the fix is UI-visible. When `CLAUDE.md`'s Important Reminders carry the **Bench only** rule, follow it before any gate that flashes or runs the board or runs `tests/hil/`. Report each as PASS / FAIL / CANNOT VERIFY (only CANNOT VERIFY if the environment genuinely cannot be stood up).
4. **Capture manual verification** (asked during execution, after quality gates and before the commit) — ask the user whether they performed any manual verification beyond the automated gates. Claude cannot infer this.

   Use `AskUserQuestion`:
   - Question: `"Did you perform any manual verification beyond the automated gates?"`
   - Options: `["Yes — I performed manual verification", "No — only automated gates were run"]`

   **If Yes:** follow up with a free-text request — "Briefly describe what you manually checked (one or two sentences)." Store the user's verbatim answer for use in the PR body (team mode).

   **If No:** store the literal string `No`.

   This is a disclosure, not a gate — `No` is a perfectly acceptable answer.
5. **Commit** — with these rules:
   - Run `git branch --show-current` first; it **must** equal the hotfix branch name. If not, switch before staging.
   - **Health check first:** run `tor-lifecycle check --base <base-branch> --json`. Every finding
     with `blocking: true` (A, B, or C this branch introduced) blocks the commit until fixed — offer
     the fix for each, plus `Stop`:
     - **A / B** — a merged requirement was edited or deleted on this branch without a record.
       Apply Step 1 item 6's eligibility rules first. Ask
       `"<TOR> — <title> was edited on this branch without a Change Record. Restore it or amend it?"`
       with `["Restore <TOR> from <base-branch>", "Amend <TOR> (owner approval)", "Stop"]`, dropping
       **Amend** when the rules would stop. **Restore** writes the block back from
       `tor-lifecycle text <TOR> --rev <base-branch>` (re-add a deleted one at its old position).
       **Amend** is Step 1 item 6's approval of record; run items 2a–2b, re-run item 3, and resume
       here — the one permitted insertion into the plan. When Amend was dropped, also print
       `To change the requirement, run /peak-workflow:capture-requirements <TOR> <change> from
       <base-branch> after this branch merges.` **Stop** says: `Uncommitted changes remain on
       <branch>; restore the feature file (git restore --source <base-branch> <file>) or discard
       the branch before running anything else.`
     - **C** — an ID this branch cites is neither live nor in a record: correct it to the live or
       successor ID, or remove the citation.

     Re-run the check after each fix. Other findings are warnings: name their count in one line
     and list this branch's own D and E (if any) in the PR body.
   - Stage by specific file path (not `git add -A`) — on the amendment path, also the Change Record,
     the feature file, its tracing sidecar, and the epic's status sidecar.
   - Commit message subject: `fix: <one-line summary>`
   - If a GitHub issue number was provided, append a trailer line: `Closes #<N>`. If no issue number, omit the trailer.
   - On a supersede, add the body lines `Amends: <old TOR> → <successor> (<CR-ID>)` and
     `Reverified: <successor> PASS` (or `Unverified: <successor> — <reason>`) — the record solo mode
     keeps. A reword adds its `Amends:` line to its own commit (item 5a).
5a. **Reword <TOR>** (reword amendments only — omit otherwise). With no uncommitted change outside
   `docs/`, run the citing tests (`git grep -l -w <TOR> -- . ':!docs/'`). All pass → edit the block
   in place, write the `reword` record per item 2a (`from` = the old fingerprint, `to` =
   `tor-lifecycle fingerprint` of the new block, `[evidence]` `commit` = `git rev-parse --short
   HEAD`, `result = "pass"`, `tests` = the citing files, and an `equivalence` sentence — why no
   plausible implementation passes one version and fails the other), validate it, run item 5's health check,
   and commit `docs: reword <TOR> (<CR-ID>)` with the body line `Amends: <TOR> reworded
   (<CR-ID>)`. Any failure, or no citing tests → it is not a reword: ask
   `"<TOR> cannot be reworded: <reason>. How to proceed?"` with `["Supersede it", "Stop"]` —
   Supersede runs items 2a–2b as a supersede, then item 5 again. On a reword, item 5's subject
   names only the code change; with no code change, skip item 5's commit (5a's evidence commit is
   HEAD) and put the `Closes #<N>` trailer on this commit instead.
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

     <only when the branch adds a Change Record, a Disputed requirement is in play, or this
     branch has its own D or E findings:>
     ## Requirement changes
     | Record | Kind | Requirement | Approved by |
     |---|---|---|---|
     | CR-… | supersede | TOR-old → TOR-new — <successor title> | <approved_by> |
     <one row per record the branch adds (`git diff --name-only --diff-filter=A <base-branch> -- docs/requirements/changes/`); titles from one `tor-lifecycle titles` run.
      Then, if any: `Reverified: <successor> PASS` (or `marked unverified — <reason>`), `Disputed: TOR-… (<CR-ID>, <N> days)`, and this branch's own D / E findings, one line each>

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

7. **Present next steps** — print the PR URL (team) or a merge confirmation (solo), and note that no further tracking is required (quick-fixes are not in `implementation-plan/index.md`). Then, when they apply:
   - For each requirement in play that was **Changed since verified** or **Verification failed**
     (Step 1 item 5), or a successor shipped marked unverified: `Re-check it in a new session:
     /peak-workflow:wrapup-epic <owning epic> reverify <TOR>` (after a team-mode PR merges).
   - An unassigned successor: `Plan it: /peak-workflow:add <what it does> (<successor>)`.
   - A superseded requirement that a `CLAUDE.md` line describes (its tracing entry cites
     `CLAUDE.md`, or a Tool Hygiene / UX Baseline line states the old block's key literals — grep
     for them): `CLAUDE.md <section>: <label> still describes the old behavior — update it by
     hand.`

## Step 5: Execute the Plan

Exit plan mode and execute every item in the plan in order. Do not add, skip, or reorder items.

## Step 6: What NOT to Do

- Do **NOT** create a spec file under `docs/implementation-plan/phase-*/`.
- Do **NOT** write a handoff file under `docs/implementation-plan/session-handoffs/`.
- Do **NOT** update `docs/implementation-plan/index.md` — quick-fixes are not tracked there.
- Do **NOT** assign an epic ID. Quick-fixes have no epic ID.
- Do **NOT** run `gh pr merge` in team mode.
- Do **NOT** modify any `.feature.md` or `.feature.tracing.json` file in `docs/requirements/`, or
  any epic sidecar, outside the amendment path (Step 1 item 6, plan items 2a, 2b, and 5a). That path changes
  one requirement, never a Safety one, with the owner's approval and a Change Record. A larger
  requirements change is not a quick fix — re-triage it with `/peak-workflow:triage`.
- Do **NOT** change a Complete epic's `status:` line, or remove anything from its `requirements:`
  line. Only `tor-lifecycle mark` writes its `requirements:` (append), `verified:`, and
  `unverified:` lines.
