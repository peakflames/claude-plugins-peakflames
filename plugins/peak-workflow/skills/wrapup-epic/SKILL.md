---
name: wrapup-epic
description: |
  Independent verification review of a completed epic — verifies each TOR requirement's
  Given/When/Then, closes out, and orients to next steps.
  Use after an epic is implemented and needs independent review.
  Triggers on: "wrapup epic", "verify epic", "review epic", "close epic",
  "is epic N done?", "check my work on epic N", "review what I built",
  "sign off on epic N", "close out epic N". With `reverify`, re-checks requirements of a Complete
  epic that changed since verification or failed it ("reverify epic N", "re-check TOR-…").
  Note: If the user says "I'm done with epic N", check whether the epic is "Implemented" (use wrapup) or "In Progress" (suggest /peak-workflow:pause instead).
argument-hint: "<epic-id> [reverify [TOR-… …]]"
model: opus
---

You are performing an independent verification and completion of an epic. `<id>` is the first word
of `$ARGUMENTS`. When the second word is `reverify`, run **Reverify Mode** (after the guards below)
instead of Phases 1–3 and Steps 4–5; any further words are the TOR IDs to re-check.

You are acting as an independent reviewer — you did NOT implement this epic. Your job is to verify the implementation against the spec, close out the epic if it passes, and orient the team toward what's next.

This skill runs on Opus by default (frontmatter `model: opus`) so verification is done by a stronger model than the one that typically implements. Projects may state a different preference with a `Verifier model: <model>` line in their `CLAUDE.md`. That line is informational — a skill cannot switch the model of a running session — so record the model this session is actually running on as `<model>` in the handoff and PR body, and if it differs from the project's stated verifier model, tell the user (`claude --model <model>` or editing this skill's frontmatter is how to change it).

This command has three phases: **Verify**, **Complete**, and **Orient**. Do not skip ahead — each phase gates the next.

## Session Guard

**Before any other action:** check whether this conversation has already executed `/peak-workflow:start-epic <id>` or `/peak-workflow:quick-fix`, or has done any implementation work on Epic <id> (edited its source files, written its tests, or authored its `epic-<id>-implemented.md` handoff). If so, stop immediately and print:

> Wrapup must run in a fresh session so verification is independent of the implementer's context. Close this session and run `/peak-workflow:wrapup-epic $ARGUMENTS` in a new one.

Do not proceed. A verifier that shares the implementer's context inherits the implementer's rationalizations, which defeats the purpose of independent verification.

## Format Guard

**Immediately after the Session Guard:** run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`.
On exit 0 (`verdict: current`, or `new` for a project with no peak-workflow files yet), continue.
On any other exit, print its output and stop — it names the fix (`/peak-workflow:upgrade`, a
plugin update, or a Python install). After this guard, read the project's files only in the
current format.

---

## Reverify Mode

`/peak-workflow:wrapup-epic <id> reverify [TOR-… …]` re-checks requirements of an epic that is
already **Complete** — after a requirement changed since it was verified (finding D), after a
failed reverify (Verification failed) once the code is fixed, or to record that an earlier PASS
was wrong. It never reopens the epic: the sidecar's `status:` line does not change.

The Session Guard and Format Guard above apply unchanged (verification stays independent: a
fresh session, blind to the implementer handoff — reverify never reads one). The helper is called
as `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <command>` (written `tor-lifecycle`); exit 2
or 3 is a data or install problem — print its output and stop (exit 1 from `check` only means it
has findings). Run these steps instead of Phases
1–3 and Steps 4–5.

### R1: Scope

1. Read `docs/implementation-plan/status/epic-<id>.md` on the base branch (`develop` > `main` >
   `master`, after `git checkout <base>` and — if `origin/<base>` exists —
   `git pull --ff-only origin <base>`).
   - Not `status: Complete` → stop: `Reverify is for Complete epics. Epic <id> is <status> —
     reverify applies only after /peak-workflow:wrapup-epic <id> has completed it.`
   - `requirements: —` → stop: `Epic <id> lists no requirements, so there is nothing to
     re-verify. Re-plan the work with /peak-workflow:add.`
2. Run `tor-lifecycle states --json`. The **scope** is the TOR IDs given after `reverify`, else
   every requirement this epic owns (`epic` = `<id>`) whose state is **Changed since verified**
   or **Verification failed** (a Disputed one counts by its `underlying_state`).
   - A named ID the epic does not list in `requirements:`, or lists but waives → stop and say
     which epic owns it (`states` row `epic`).
   - A named ID that is not live → stop with its `tor-lifecycle titles` line: superseded or
     retired requirements are history — the successor is re-checked through its own epic.
   - Default scope empty → stop: `Every requirement Epic <id> owns is verified — nothing to
     re-check.`
   - A named ID that is Verified is allowed: re-checking it records a past false PASS as data.
   - A Disputed requirement in scope → say it is known to be wrong (`<CR-ID>`, `<N>` days) and
     that a PASS does not resolve the dispute.
   - Run `tor-lifecycle check --json`. A scoped ID with an **A** finding (edited without a Change
     Record) → stop: `<TOR> was edited without a Change Record — decide whether its meaning changed
     with /peak-workflow:capture-requirements <TOR> first; a reverify PASS would ratify the edit.`
     (Name the other scoped IDs so the user can re-run with just those.)
3. Print the scope as `TOR-… — <title> (<state>)` from one `tor-lifecycle titles` run, with the
   epic as `<id> (<slug>) — <Name>`.

### R2: Branch

Create `hotfix/verify-epic-<id>-<short-name>` from the base (`<short-name>` from the spec file
name, as in Step 1.1 item 1a). If it already exists with commits the base does not have
(`git rev-list --count <base>..<branch>` > 0), stop: `An earlier reverify of Epic <id> is not merged
yet (<branch>) — merge or delete it first.` An existing branch with no such commits is a leftover:
delete it and create it fresh.

### R3: Verify

- Load each scoped requirement's Given/When/Then with `tor-lifecycle text <TOR>`, and resolve
  `<test-directories>` as Step 1.2 item 2 does. In Step 1.2, read "the Requirements Anchors" as
  this scope, and its "re-run `/peak-workflow:wrapup-epic <id>`" as
  `/peak-workflow:wrapup-epic <id> reverify <scope>`.
- Run **Step 1.2** for each (tests by grep, mirror check, run, source inspection, UI and device
  rules) — no other Phase 1 step. Record PASS / FAIL / CANNOT VERIFY.
- Run the **Tests** gate from Step 1.3 (the full test command `CLAUDE.md` lists), and the **UX
  Baseline check** only when a scoped requirement names a screen (`S-NN`) or sits under the
  `# UX Baseline` banner — checked on the `S-NN` screens the scoped requirements name, not every
  screen of the epic. No code review, no docs refresh, no Fix now — reverify records results;
  code fixes go through `/peak-workflow:quick-fix`.

### R4: Record

Run `mark` once, repeating the flag per ID — `--pass` for each PASS, `--fail <TOR> "<reason>"` for
each FAIL or CANNOT VERIFY (a CANNOT VERIFY reason starts `CANNOT VERIFY:`):

```bash
sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" mark <id> --pass TOR-A --pass TOR-B --fail TOR-C "<reason>" --reverified
```

- **PASS** writes the requirement's `verified:` line at its current fingerprint and drops any
  `unverified:` line. **FAIL** removes its `verified:` line and writes
  `unverified: TOR: <today> <reason>`. `reverified:` is set to today either way.
- A failed Tests gate makes every scoped requirement whose tests failed a FAIL.

Before running it, note each scoped requirement's previous sidecar line (its `unverified:` date and
reason, if any) for the handoff's **Was** column — `mark` replaces it. Then write
`docs/implementation-plan/session-handoffs/epic-<id>-reverified-<today>.md`; if that file already
exists (a second reverify today), append a `---` line and a new section — never overwrite it:

```markdown
# Epic <id>: <Name> — Reverified <today>

**Verified by:** `/peak-workflow:wrapup-epic <id> reverify` (model: <model>, fresh session)

| TOR ID | Title | Was | Verdict | Evidence |
|--------|-------|-----|---------|----------|
| TOR-… | <title> | Changed since verified | PASS | tests/test_x.py:12, src/x.py:40 |
| TOR-… | <title> | Verification failed (<old date>: <old reason>) | FAIL | <one-line reason> |

Tests gate: PASS / FAIL (<summary>). UX Baseline: <PASS / N/A — no UI requirement in scope>.
<per Disputed requirement in scope:> Disputed: <TOR> (<CR-ID>, <N> days) — this PASS does not resolve it.
```

### R5: Ship

Commit the sidecar and the reverified handoff:
`chore(epic-<id>): reverify <TOR-list> — <N> PASS, <M> FAIL`. Then ship exactly as
`/peak-workflow:quick-fix` Step 4 item 6 does — ask solo or team (neutrally, every time); solo
merges `--no-ff` into the base (message `chore(epic-<id>): merge <branch> — reverify <TOR-list>`)
and deletes the branch, team pushes and opens a PR (title
`verify(epic-<id>): <TOR-list>`, body = the handoff's table plus `🤖 Generated via
/peak-workflow:wrapup-epic reverify`). Never push in solo mode.

### R6: Next steps

- For each FAIL: `The code does not meet <TOR>: fix it with /peak-workflow:quick-fix <request>,
  then reverify again in a new session` — or, when the requirement (not the code) is what is
  wrong: `/peak-workflow:capture-requirements <TOR>`.
- For each Disputed requirement in scope: `<TOR> is still disputed (<CR-ID>) — settle it with
  /peak-workflow:capture-requirements <TOR>.`
- `Run /peak-workflow:status to see the updated Requirements Coverage.`

---

## Phase 1: Verify

Your goal is to independently confirm the implementation meets the spec. Do not trust the implementer's self-assessment — inspect the code yourself.

> **Safe to re-run:** This command is safe to run multiple times. If a previous wrapup attempt was interrupted or failed, just run `/peak-workflow:wrapup-epic N` again — it will re-verify from scratch.

### Step 1.1: Load Context

1. Use the project's `CLAUDE.md` content already loaded in your system context. Do not re-read it via the `Read` tool — it is injected into every conversation turn.
1a. **Check out the feature branch before reading any sidecar or spec content.** The sidecar and spec on `develop`/`main` may still say `Not Started` or `In Progress` — only the feature branch carries the implementer's updates. Locate the spec by filename only (no content read): `ls docs/implementation-plan/phase-*/epic-<id>-*.md`. Extract the **branch short name** from that filename: strip the directory path, the `epic-<id>-` prefix (`<id>` is an opaque string), and the `.md` suffix. For example, `epic-a3f2K7p-user-auth.md` → `user-auth`. If there is no suffix after `epic-<id>`, omit it. Then detect the branch with a reliable test — do **not** rely on `git branch --list … && echo "exists"` (always exits 0) or on `git checkout` failing silently:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = branch exists; nonzero = missing. Then:
   - If `feature/epic-<id>-<short-name>` exists, run `git checkout feature/epic-<id>-<short-name>` .
   - If it does not exist, ask via `AskUserQuestion` which branch holds the work — question
     `"There is no feature/epic-<id>-<short-name> branch. Which branch holds this epic's work?"`,
     options: the current branch, `"Let me type a branch name"`, `"Stop"`. Check out the branch
     the user names (stop if it does not exist), and call it the feature branch from here on.
   - After checkout, check freshness (base: `develop` > `main` > `master`). If `git remote` does
     not list `origin`, skip silently. Otherwise run `git fetch --quiet origin`; if the fetch
     fails, say `Freshness check skipped — origin not reachable`. If `origin/<base>` exists, count
     `git rev-list --count <base>..origin/<base>`; if the base is behind, note it for the user now
     (`<base> is <N> commit(s) behind origin — solo shipping (Step 5a) pulls it before merging`)
     and carry it to Step 5. Verification itself runs on the feature branch and is unaffected.
   - After checkout, **re-read `CLAUDE.md`** from the working tree. The copy loaded at session start
     came from the base branch; an epic that changed `CLAUDE.md` (the walking skeleton resolving
     `TBD` lines, for one) is only visible after checkout.
2. Read `docs/implementation-plan/status/epic-<id>.md` to get the epic's current status. Phase 3 (Orient) loads all phase indexes and sidecars when it walks the dependency graph — Step 1.1 only needs this epic's sidecar.
3. Check the sidecar: if `status: Implemented`, proceed. If `status: In Progress`, `status: Paused`, or `status: Not Started`, inform the user that `/peak-workflow:start-epic <id>` must finish first and stop. If `status: Complete`, inform the user it has already been wrapped up — and, when any requirement it owns changed since verification or failed it, that `/peak-workflow:wrapup-epic <id> reverify` re-checks those.
3a. **Requirements Health.** The helper is always called as
    `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <command>` (written `tor-lifecycle` below);
    exit 2 or 3 from it is a data or install problem — print its output and stop (exit 1 from
    `check` or `sweep` only means findings). Run once each
    and keep the output: `tor-lifecycle states --json`,
    `tor-lifecycle check --base <base> --json` (base: `develop` > `main` > `master`), and
    `tor-lifecycle sweep --json`. These read the branch's own files: when
    `git diff --name-only HEAD...<base> -- docs/requirements/changes/` lists records the base gained
    after the branch was cut, say `<base> has requirement changes this branch has not seen —
    merge <base> into the branch first (git merge <base>), then re-run this wrapup in a fresh
    session.` and stop (nothing written; stay on the branch). Open the report to the user with the nudge when any live
    requirement is Disputed, Changed since verified, or Verification failed — one plain sentence
    with the counts and the next command, as `/peak-workflow:status` words it. Then, in order:
    1. **Blocking findings.** Every finding with `blocking: true` (A, B, or C this branch
       introduced) blocks the wrapup. For each, ask with a fix offer, plus `Stop — epic FAILs`:
       - **A / B** — a merged requirement was edited or deleted on this branch without a record:
         `["Restore <TOR> from <base>", "Amend <TOR> (owner approval)", "Stop — epic FAILs"]`.
         Restore writes the block back from `tor-lifecycle text <TOR> --rev <base>`. Amend runs
         Step 1.4b's **Amend requirement** procedure against the edit (not for Safety — drop the
         option). Each fix is recorded in Code Review Findings (`fixed at wrapup`).
       - **C** — an ID this branch cites is neither live nor in a record: correct it to the live or
         successor ID, or remove the citation (`["Fix now", "Stop — epic FAILs"]`).

       Re-run `check --base <base>` after each fix. Other findings are warnings: count them in
       Code Review Findings.
    2. **Disputed requirements this epic touches.** It *touches* a requirement when its sidecar
       `requirements:` lists it, or the branch changed a test that cites it
       — a line the branch added cites it:
       `git diff -U0 <base>...HEAD -- <test-directories> | grep '^+' | grep -oE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' | sort -u`
       (`<test-directories>` as in Step 1.2 item 2).
       For each touched requirement whose `states` row is Disputed:
       - **Safety** (`dispute.safety: true`) — stop, epic FAILs: `<TOR> is a Safety requirement
         known to be wrong (<CR-ID>). This branch touches it, so it cannot ship until the
         requirement is resolved on a docs/ branch: /peak-workflow:capture-requirements <TOR>.`
         Renewal does not lift this, and no in-branch amendment is offered. No report is rendered
         and nothing is written; run `git checkout <base>`. If the branch only cites it in passing,
         removing that citation in an implementer commit and re-running wrapup in a fresh session
         also clears this.
       - **Overdue** (`dispute.overdue: true`) — ask
         `"<TOR> — <title> has been disputed for <N> days (<CR-ID>: <record title>). It must be settled before this epic ships."`
         with `["Resolve it on this branch (owner approval)", "Renew the pending record", "Stop — epic FAILs"]`.
         **Resolve** runs Step 1.4b's **Amend requirement** procedure with the pending record's
         ID in the new record's `refs`. **Renew** writes a new `pending` record (the
         `CHANGE_RECORD_TEMPLATE.md` pending shape): `refs = ["<open CR-ID>", "epic <id>"]`, `owner`
         = the open record's owner unless the user names another, `approved_by` = `git config
         user.name`, `approved_via = "wrapup"`, `fingerprint` from `tor-lifecycle text <TOR>
         --json`, `title` = `<open title> (renewed)`, the open record's `keywords` topped up to 3–6
         from the reason, and the `reason` the owner gives; validate it. Either one is listed in Requirement Changes.
       - **Under the threshold** — a warning: list it in the report's Requirement changes section
         and the PR body (`Disputed: <TOR> (<CR-ID>, <N> days, due after <threshold> days)`).
    3. Keep `sweep` for the Removal gate (Step 1.3) when the epic is a removal epic.
4. Read the epic spec file located in item 1a. While reading, parse the header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** — it drives the Step 5b PR body `Closes #<N>` / `Refs #<N>` line. If no `Source:` line exists, the source issue number is unknown; skip that line later.
4a. **Load TOR Requirements.** The epic is a **removal epic** when its sidecar has a `retires:`
    line: read its `## Removal` section (record, retired IDs, code to remove, done-when) for the
    Removal gate (Step 1.3); its anchors hold only guard requirements, or the line
    `None — a removal epic; see Removal.`
    - **No Requirements Anchors** — not a removal epic, and the spec has no
      `## Requirements Anchors` section or the section lists no TOR ID: stop. `Epic <id> (<slug>) —
      <Name> has no Requirements Anchors, so there is nothing to verify it against. Re-plan it with
      /peak-workflow:add <description> (or add the requirements first with
      /peak-workflow:capture-requirements).`

    Parse the `## Requirements Anchors` table (`TOR ID | Feature File`). Settle every ID with item 5
    first; then, for each anchor, open its feature file and locate the `Scenario: [TOR-NN-XXXXXXX]`
    block with that exact ID. Read the full Given/When/Then. These become the verification
    specifications — every subsequent verification step judges the implementation against these
    Given/When/Then statements. Titles in the report, handoff, and PR body come from one
    `tor-lifecycle titles` run over the final anchors (plus any superseded ID), never from the spec.
4b. **Load Screens (UI epics only).** If the spec has a `## Screens` section, open each listed
    wireframe file (`docs/product-vision-planning/ux/wireframes/S-NN-*.html`); skip rows whose
    Wireframe is `—` (the Application menu and Window rows — their contract is the
    `ux/screens.md` row and the Desktop conventions TORs). Wireframes are planning artifacts
    approved by the `docs/` branch merge, not the implementer's handoff — safe to read blind.
    Step 1.3's **Wireframe fidelity** line checks the built screens against them, and takes the
    wireframe path verbatim from the `Wireframe` column of
    `docs/product-vision-planning/ux/screens.md` (resolved under `docs/product-vision-planning/ux/`)
    for a screen this epic changes but another epic's `## Screens` table owns — read
    `ux/screens.md` too when it exists. If neither the section nor `ux/screens.md` exists, skip
    this item without comment.
5. **Verify Requirements Anchors.** An independent reviewer loads TOR requirements first so all
   subsequent verification is judged against the requirements baseline, not the implementer's
   self-assessment. For each anchor ID, take its `states` row (item 3a):
   1. **Live** — record "Requirements Anchor verified: TOR-NN-XXXXXXX". (A row's `feature_file`
      is a bare file name; compare it with the spec cell's file name, and correct a wrong cell as
      `` `docs/requirements/<feature_file>` `` in the wrapup commit.)
   2. **Not live** — this TOR is a **FAIL** (an anchor gap); run `tor-lifecycle titles <TOR>` and
      put it to Step 1.4b with the matching **Fix now**:
      - **Superseded** (`superseded in CR-… by TOR-…`; follow the chain to live successors) —
        `Fix now` = **replace with successor** (recommended): put the successor(s) in its place in
        this epic's spec anchors and sidecar `requirements:` line (unless a successor's `states`
        row names another epic — then Fix now is unavailable: say so and offer Stop), then run
        Step 1.2 against the successor and record it as `FIXED DURING WRAPUP — anchor replaced:
        <old> → <successor> (<CR-ID>)`.
      - **Retired** (`retired in CR-…`) — `Fix now` = drop it from the anchors and `requirements:`
        (`FIXED DURING WRAPUP — retired anchor dropped (<CR-ID>)`). If no anchor would remain and
        this is not a removal epic, Fix now is unavailable — Stop.
      - **Unknown** (exit 1, finding C) — `Fix now` = correct the ID to the requirement the epic
        built (then verify that one) or drop it.

      These edits touch only this epic's own spec and sidecar. A Defer is never offered for an
      anchor gap.
6. **Do NOT read the implementer handoff yet.** `docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` is the implementer's self-assessment. Reading it before you have formed your own per-TOR verdicts contaminates the review. It is read in Step 1.2b, after every verdict is recorded. (Any `epic-<id>-paused.md` handoff is likewise off-limits until then.)
7. **Conditional architecture / design-notes reads.** The Step 1.4 code review checks consistency with `docs/architecture.md` and `docs/design-notes.md` — load only what is relevant to this epic:
   - If the epic touches IPC, the database schema, or other cross-cutting concerns named in `architecture.md`'s table of contents, read the relevant section.
   - If the epic raises a decision the design notes might already have addressed, read `docs/design-notes.md`.
   - If the epic is a localized UI / copy change with no cross-cutting impact, skip both — there is no consistency surface to check, and Step 1.4 simply records "no architectural surface affected".
8. The feature branch is already checked out (item 1a) — every read above was made on it.

### Step 1.2: Verify Requirements (TOR IDs)

**Bench only (products that switch mains power or heat).** Before any command that flashes the
board, runs it, or runs anything under `tests/hil/` — in this step's item 4, item 7, or the Step 1.3 Tests gate — ask the user in one plain question to confirm the bench setup: the equipment
unplugged from mains, the output wired to an indicator lamp instead of the load. If they do not
confirm, do not run it. `HIL_BENCH=1` goes on that one command line only, right after the user
confirms for this run (e.g. `HIL_BENCH=1 <harness command>`) — never exported, never written into
`CLAUDE.md`, a script, or a config file, and never set without the confirmation. Ask it once at the start of this step when
the epic has `tests/hil/` TORs, and again only if the user changes the setup.

For each TOR ID in the epic spec's Requirements Anchors table (after Step 1.1 item 5), independently verify the
requirement is satisfied by the implementation. You are the independent reviewer — you did NOT
implement this epic. Do not trust the implementer's self-assessment.

**For each TOR ID:**

1. **Read the Given/When/Then** (loaded in Step 1.1 item 4a).
2. **Locate the test(s)** for this TOR ID by grep only:
   ```bash
   for d in <test-directories>; do grep -rl --exclude-dir={bin,obj,node_modules,dist,out,build} "<TOR-ID>" "$d"; done
   ```
   where `<test-directories>` is every directory listed under **Test directories** in
   CLAUDE.md's Verification & Quality Gates section, space-separated (e.g., `tests/ e2e/`; if
   the line is absent, the single test directory that section names). If no directory can be
   derived (a legacy Tests row like `pytest` names none), ask once via `AskUserQuestion`:
   - Question: `"Which directories hold tests? (space-separated, E2E last)"`
   - Then offer to write the answer as the `**Test directories:**` line of the Verification &
     Quality Gates section. If the user declines, replace the loop with
     `git grep --untracked -l "<TOR-ID>" -- ':!docs'` (`--untracked` so a test file created by a
     Step 1.4b Fix now is found on the re-run).
   Read the matching files.
   **Operator-observed TORs.** A TOR whose feature-file scenario carries the comment
   `# Verification: operator-observed` is traced by a checklist instead of an automated test:
   also grep `tests/manual/` (and `tests/hil/` when present) for it, whether or not those are on
   the Test directories line. The checklist names the TOR ID and restates the Given / When / Then
   as steps a person performs and what they should see. Items 3–4 apply to the checklist (it
   mirrors the Gherkin), item 7 replaces item 4 for the part only a person can observe, and any
   automated part the TOR also has (a Safety TOR's command and timing through `tests/hil/`) still
   runs under item 4.
   If the grep returns nothing in any listed directory, no test traces to this requirement —
   the TOR's verdict is **FAIL** ("no test names TOR-…"), even if source inspection finds the
   behavior implemented. Do not go looking
   in the handoff for a test. **Do not open the implementer handoff before finishing this
   step** for every TOR; it is read only in Step 1.2b.
3. **Verify the test mirrors the Gherkin structure:**
   - Given → test arranges the described preconditions
   - When → test performs the described action
   - Then → test asserts the described observable outcome
   A test that does not faithfully mirror the Gherkin is a gap regardless of whether it passes.
4. **Run the test** yourself: the test command CLAUDE.md lists for that directory, followed by
   the specific test. The test must pass — a skipped, xfail, or xpass result is not a pass
   (the runner exits 0 on these; read the per-test outcome).
5. **Independently inspect source code** — read the implementation file to confirm the code
   actually realizes the Given/When/Then behavior. A passing test that exercises the wrong code
   path is a FAIL.
6. **For UI TOR IDs:** Web app: `playwright-cli` against the running app with real data (see
   "Local Environment" in `CLAUDE.md`) — start the backend first, then the frontend. Do NOT
   mock API responses unless the backend genuinely cannot start. Desktop app: the project's
   Playwright Electron harness (`@playwright/test` with `_electron.launch`, in the last entry
   on the Test directories line — setup lists the E2E directory last); `playwright-cli`
   cannot attach to an Electron window.
7. **For device TOR IDs (Embedded, or any Then observed on physical hardware) and every
   operator-observed TOR.**
   - *Device:* run the project's hardware-in-the-loop harness under `tests/hil/` against the
     connected board for everything it can capture. If the board is not connected, ask the user
     to connect it. For anything that switches mains power or heat, first ask the user to confirm
     the bench setup — equipment unplugged, output driving an indicator lamp — and do not run
     until they do.
   - *Named provider sign-in:* the round-trip needs the real provider's credentials configured
     and the app running where its callback URL points. If they are not set up, ask the user to
     set them up.
   - Whatever is missing — board, credentials, a person able to observe — if the user cannot
     provide it now, **end the session with no verdicts recorded** and tell them to re-run
     `/peak-workflow:wrapup-epic <id>` once they can. That is neither CANNOT VERIFY nor FAIL, and
     never an undisclosed deferral.
   - For each operator-observed TOR, walk the user through its checklist in plain words, ask them
     to perform the When and describe what they see, and judge it against the Then. Record the evidence as `operator-observed: <their words>`; that annotation
   is carried into the Step 1.5 report's Highlights so the human sees every verdict that rests on
   an observation rather than a test.

Report each TOR ID:
- **PASS** — a test that mirrors the Given/When/Then (item 3) passes AND implementation
  inspection confirms the behavior is realized. Cite: `test file:line` and `impl file:line`.
  For an operator-observed TOR: the checklist mirrors the Gherkin, implementation inspection
  confirms the behavior, AND the operator's described observation matches the Then. Cite the
  checklist file, `impl file:line`, and `operator-observed: <their words>`. An observation that
  does not match is FAIL; one the user cannot make now ends the session (item 7). A `# Safety`
  TOR also needs an automated `tests/hil/` test naming it that passes — without one it is FAIL,
  whatever its tag; the observation confirms only the physical part.
- **FAIL** — test fails, OR no test mirrors the Then (e.g., the test only checks a flag is
  accepted when the Then names an outcome), OR test passes but implementation does not realize
  the requirement (describe specifically what is wrong).
- **CANNOT VERIFY** — only when the test environment cannot start after a genuine attempt, or
  when the check requires an environment that does not exist locally (e.g., Kubernetes, CI/CD).
  Never use this for checks that can be run against the live local API, and never because a
  fixture would be large, a test is missing, or the check is tedious — write a throwaway probe
  (do not commit it) or run the CLI directly; if the behavior is still unobservable, FAIL.

Record every verdict before moving on. Step 1.2b may annotate these verdicts but never changes
them; the only thing that can replace a verdict is a Step 1.4b **Fix now** followed by a re-run
of this step for that TOR.

### Step 1.2b: Compare to Implementer's Deferrals

Only now, with every per-TOR verdict recorded, read
`docs/implementation-plan/session-handoffs/epic-<id>-implemented.md` and locate its
`## Deferrals` section.

1. **If the handoff has no `## Deferrals` section** (or no handoff exists): add a warning line
   to the Step 1.5 Deferrals section — `⚠️ implementer handoff has no Deferrals section —
   disclosure could not be checked` — and proceed to item 2 with an empty Deferrals table (the
   misfiled branch still applies). The warning itself does not affect the epic verdict (legacy
   handoffs pre-date this section).
2. **For each TOR whose verdict is FAIL or CANNOT VERIFY** (one Deferrals-table row each;
   `Count:` is the number of rows — a row survives a later Step 1.4b fix):
   - If the TOR ID appears as a row in the implementer's Deferrals table → `Disclosed: yes`.
     Map the implementer's `Unmet` into `Unmet` (amend if your finding differs) and
     `Decision — Why → Successor epic (By, Date)` into `Implementer decision`. If the
     successor epic's spec does not exist or does not list this TOR in its Requirements
     Anchors, append ` — ⚠️ successor spec missing or does not list this TOR` to that cell.
   - Else if it appears as a Spec Deviations row, or as FAIL / CANNOT VERIFY in the handoff's
     TOR Coverage → `Disclosed: yes (misfiled)`; note where it was found.
   - Else if the handoff reported it `PASS (operator-observed pending)` and the observation did not
     match → `Disclosed: n/a (observation)` — the implementer could not have known; no
     UNDISCLOSED marker.
   - Else → `Disclosed: **no**`. The Deferrals table row for this TOR reads
     `FAIL — ❌ UNDISCLOSED DEFERRAL` (or `CANNOT VERIFY — ❌ UNDISCLOSED DEFERRAL`) in the
     Verifier finding column. A mention in Key Decisions or prose ("stub for now") does not
     count as disclosure — only a row does; quote the mention in the row so the reader sees it.
3. **For each TOR the implementer listed as deferred but you verified as PASS:** add a
   Highlights bullet `✅ TOR-… — disclosed as deferred but verified PASS` — no table row, no
   penalty, but it is worth the reader's attention.

Undisclosed deferrals are the specific failure mode this step exists to catch. Never soften
one into a Highlights bullet or a Known Issue — it gets its own row, marked as above.

### Step 1.3: Run Quality Gates

Read the **Verification & Quality Gates** section from `CLAUDE.md`. Run every applicable check independently — first the **Tests** gate, the full test command `CLAUDE.md` lists (web and static SPA projects: before `bun run test:e2e`, run
`bunx playwright install chromium`, which does nothing when the browser is already present; a run
failing with *Executable doesn't exist* means run it again and continue — a missing browser is not
CANNOT VERIFY. If `playwright-cli` reports a missing browser, run the install command its
own `--help` gives):
- Build check
- Visual verification (if UI was changed) — web: `playwright-cli`; desktop: the Playwright Electron harness
- Brand compliance via the project's brand guidelines skill (if UI was changed and a brand skill is configured)
- Console check (if UI was changed) — web: `playwright-cli`; desktop: the renderer console captured by the Playwright Electron harness
- UX Baseline check (if UI was changed and `CLAUDE.md` has a **UX Baseline** section) — see below
- Access-control check — on routes that return or change records (if `CLAUDE.md`'s `**Product shape:**` block records
  `**Access rule:** owner-or-permitted-role`, or its Tech Stack records
  `Auth: local accounts now, org SSO deferred`, and this epic touched user data) — see below
- Removal gate (removal epics only) — see below
- Deferred-value check (walking-skeleton epic only): `grep -nE 'TBD — set by the walking-skeleton epic|— unconfirmed|Board: not chosen|\*\*Not decided yet:\*\*' CLAUDE.md`
  on the feature branch must return nothing. Any hit is a FAIL — the skeleton owns resolving
  every one

**Removal gate.** A removal epic's definition of done (Step 1.1 item 4a); a quality gate like the
others — Fix now or Stop, never deferred. Report PASS / FAIL per line with the evidence:

- **No citations left** — `tor-lifecycle sweep <retired IDs>` exits 0. Each hit is a FAIL (this
  is the one case where `check` finding E blocks): a test or source line still citing a retired ID.
- **Code gone** — every symbol the Removal section's **Code to remove** names returns nothing
  from `git grep -n -w <symbol> -- . ':!docs/'` other than lines that assert its absence (a test
  checking the symbol no longer exists); list each such line as evidence. A file the section names
  with no symbol no longer exists.
- **Guard requirements pass** — every anchor's Step 1.2 verdict is PASS (none → `N/A — no guard
  requirements`).

**Access-control check.** A quality gate, not a code-review note, on any epic that adds or changes
user data in a project with sign-in — named provider or deferred. Record PASS / FAIL per line with the
evidence, and treat a FAIL like any other failed gate — Fix now or Stop, never a Known Issue:

- **No sign-in bypass.** Grep the diff and the auth configuration for a development-only login,
  an anonymous fallback, or a current user taken from a request header, query parameter, or
  environment variable. Any hit is a FAIL. Tests signing in through the auth layer's own test
  helper are not a bypass.
- **Owner on every new table.** Each table this epic added carries an owner column. FAIL if one
  does not.
- **Every new read and write goes through the access rule.** Each route this epic added calls the
  project's single access rule rather than re-deriving access inline or relying on a front-end
  check. FAIL on any that does not.
- **Role checks are server-side.** If roles are declared, the permission decision happens on the
  server. A role read only from client state is a FAIL.

**UX Baseline check.** This is a quality gate, not a code-review note. Web app: `playwright-cli`
against the running app with real data. Desktop app: the project's Playwright Electron harness
(`@playwright/test` with `_electron.launch`, in the last entry on the Test directories line —
setup lists the E2E directory last); `playwright-cli` cannot attach to an Electron window. Open
every screen this epic adds or changes and confirm each active line of the UX Baseline holds
on it:

- **Screen states** — loading, empty, error, and populated states each render with visible
  text. Force each one with the skeleton's test-only fault / latency switch (or an empty dataset for the empty state).
- **Keyboard & focus** — every interactive element is reachable by Tab in a sensible order
  with no trap; Enter / Space activate; Escape closes dialogs and menus; focus is visibly
  indicated at each stop and not hidden behind sticky UI; a modal keeps focus inside and
  returns it to the invoker on close.
- **Forms** — every field has an associated label; a failed submission names the problem and
  the fix next to the field, and focus moves to the first invalid field.
- **Destructive actions** — an irreversible action asks for confirmation with the safe option
  as the default and Escape cancelling.
- **Progress feedback** — an operation longer than a second shows progress within a second;
  one longer than ten seconds can be cancelled.
- **Layout floor** — the screen is usable at 320 px and 200% zoom (web) or the declared
  minimum window size (desktop) with no clipped controls and no horizontal page scroll.
- **Contrast** — body text at least 4.5:1, control boundaries and focus indicators at least 3:1.
- **Reduced motion** — with the OS reduce-motion preference set, non-essential animation is off.
- **Navigation** — unique page or window title, one visible H1 matching it, current item
  marked in the primary navigation.
- **Desktop conventions** (desktop apps only) — new commands appear in the application menu
  with accelerators; file choices use native dialogs; window state and single-instance
  behavior still hold.
- **Wireframe fidelity** (only when `ux/screens.md` exists — Step 1.1 item 4b) — check every
  screen this epic adds or changes, taking the wireframe path from the `Wireframe` column of
  `ux/screens.md` when the screen is owned by another epic's `## Screens` table: the screen's
  regions, control texts, and four states match its wireframe. This line never yields FAIL — report
  `PASS (deviations noted)` and record each deviation in Code Review Findings; a deviation a
  TOR's Then requires is not a deviation.
- Any project-specific line the section declares (Responsiveness budget, Undo) when not `N/A`.

The skeleton epic's baseline UX TORs proved these behaviors once on the reference screen; this
gate checks that the new screens kept the pattern. Report one of these per line:
- `PASS`
- `PASS (deviations noted)` — Wireframe fidelity only; each deviation goes to Code Review Findings
- `FAIL — <baseline line>: <screen>: <one-line detail>`
- `N/A — <baseline line>: no <form / irreversible action / long operation / file operation> on
  the screens this epic adds or changes (<screens checked>)` — must name the screens checked
  and does not fail the gate. N/A is never valid for Screen states, Keyboard & focus, Layout
  floor, Contrast, Reduced motion, or Navigation.

A FAIL is handled in Step 1.4b as a failing gate (Fix now / Stop) — it cannot be deferred. A
configured `frontend-design` or brand skill does not replace this check.

**Gate discrepancies are findings.** After running the gates, compare each result against the
implementer handoff's *Verification Results (self-assessment)* section (the handoff is already
open from Step 1.2b). Any gate the handoff reports as PASS that does not pass now is a named
Code Review finding in Step 1.5: `⚠️ GATE DISCREPANCY: <gate> — handoff reports PASS, reproduces
FAIL (<one-line detail>)`. Report it even when the failure predates this epic — the discrepancy
is the finding, not the failure's age.

### Step 1.4: Code Review

Review the implementation for:
- Adherence to patterns established in previous epics and documented in `docs/reference/`
- Security concerns (input validation, injection, secrets handling), including each item in
  `CLAUDE.md`'s **Security Baseline** section where the project type makes it applicable
- Error handling completeness
- Logging adequacy
- **UI epics:** screens compose from the skeleton's app shell and design system — no second
  component library, no ad-hoc colors or spacing outside the token file, and any theme change
  made in the global stylesheet's CSS-variable tokens rather than in generated component files
- Consistency with whichever of `docs/architecture.md` and `docs/design-notes.md` were loaded conditionally in Step 1.1 item 7. If neither was loaded (the epic had no cross-cutting surface), record "no architectural surface affected" and move on.

### Step 1.4b: Fix, Defer, or Stop

**Verdict rule.** Per-TOR verdicts are **PASS / FAIL / CANNOT VERIFY** only — there is no
"pass with exceptions". The epic verdict is **PASS** if and only if every TOR is PASS (including
TORs fixed or amended during this wrapup) or every remaining non-PASS TOR carries a **human
waiver** or a **pending record** written here, AND every quality gate from Step 1.3 passes
(including any `GATE DISCREPANCY` and the Removal gate), AND Step 1.1 item 3a left no blocking
finding or unresolved overdue Disputed requirement. Otherwise the epic verdict is **FAIL**.

**Failing quality gates first.** For each gate that failed in Step 1.3, ask
`"<gate> failed: <line>: <evidence>. Recommendation: <Fix now | Stop> — <one clause why>. How to proceed?"`
with options `["Fix now", "Stop — epic FAILs"]` only — a gate cannot be deferred. On Fix
now, apply the fix and re-run that gate; if it still fails, the epic verdict is FAIL. Record the
outcome in Code Review Findings (`fixed at wrapup` or `unfixed — epic FAILs`).

A substantive finding is never filed as a follow-up by default — it is put to the user as a
decision, at the moment it is cheapest to act on. For each TOR whose verdict is FAIL or CANNOT
VERIFY, use `AskUserQuestion` (one question per TOR, all asked before the report is rendered):
- Question: `"TOR-<NN-XXXXXXX> is <FAIL | CANNOT VERIFY>: <what is unmet>. Recommendation: <Fix now | Defer | Requirement is wrong | Stop> — <one clause why>. How to proceed?"`
- Options: `["Fix now", "Defer — depends on a later epic", "The requirement may be wrong, not the code", "Stop — epic FAILs"]`

`The requirement may be wrong, not the code` is never offered for a requirement under the `# Safety`
banner (its `states` row has `safety: true`), nor for an anchor gap (Step 1.1 item 5). When chosen,
ask `"How should TOR-<NN-XXXXXXX> change?"` with
`["Amend requirement (owner-approved)", "Record as pending", "Back"]` (Back re-asks the first
question).

The recommendation is mandatory — never ask without one. Recommend **Defer** only when the
eligibility rule below is met.

**Only an option the user selects counts.** A free-text reply that does not name one of the
offered options ("ok", "proceed", "fine") is not consent to defer — re-ask.

- **Fix now** — always offered; the human decides. Apply the fix, remove any
  `Deferred: <TOR-ID>` skip/xfail marking the implementer left on the test, re-run Step 1.3
  for the affected gates, then re-run Step 1.2 for this TOR only and replace its verdict. The TOR's
  Deferrals row is **kept** with Verifier finding `FIXED DURING WRAPUP — <what changed>` and
  `Waived by / Date / Reason` set to `—`; the TOR shows `PASS` in Requirements Implemented.
  This is the one place the verifier writes code it then verifies — the row is how the human
  sees that. If the implementer's Deferrals row names a successor epic, also remove the TOR's
  row from that epic's Requirements Anchors and its ID from
  `docs/implementation-plan/status/epic-<succ>.md` `requirements:`, and stage those files —
  a fixed TOR must not keep two owners. If the fix does not bring the TOR to PASS, re-ask with
  only `Defer` / `Stop`.
- **Defer** — a waiver. Eligible only when the Then clause depends on code a later epic creates.
  **Never eligible for a TOR under the `# Safety` banner** — its only options are Fix now or Stop;
  an epic that drives an output never closes without the safeguard for it.
  Ask `"Which later epic creates the code this Then clause depends on?"` — if the implementer's
  Deferrals row (Step 1.2b) already names a successor, offer it as the default. Judge
  eligibility on that answer: "larger than expected", "tedious", or "out of scope" name no
  epic and are not eligible. When not eligible, re-ask:
  `"Defer is not eligible for TOR-<NN-XXXXXXX>: <reason> is not a dependency on a later epic. How to proceed?"`
  with options `["Fix now", "Stop — epic FAILs"]`.
  When eligible (`<succ>` named): run `ls docs/implementation-plan/phase-*/epic-<succ>-*.md`.
  If no spec exists, Defer is not available — re-ask as above. If the spec exists but its
  Requirements Anchors table does not list this TOR, append the row and add the TOR ID to
  `docs/implementation-plan/status/epic-<succ>.md`'s `requirements:` field. Then fill the
  TOR's `Waived by / Date / Reason` cell (`Waived by` is `git config user.name`; `Reason` ends
  with `→ epic <succ>`). The TOR displays as `WAIVED` in the Requirements Implemented table —
  a display state for a waived FAIL / CANNOT VERIFY, not a fourth verdict.
- **Amend requirement (owner-approved)** — the owner's answer is the approval the record cites.
  Ask what the requirement should say (draft it from the finding, and check its literals against
  the Given), then decide and write it as `capture-requirements` states it once (`${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/SKILL.md`,
  "Lifecycle Rules": L3 decision test, L4 re-litigation check, L5 choice 3; `${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/CHANGE_RECORD_TEMPLATE.md`):
  Where these steps differ from L5 choice 3, these win: this epic is edited although Implemented,
  its tests are retargeted, and the tracing entry is replaced here. As L5 says, also swap the old ID
  in any other Not Started / In Progress / Paused epic that lists it. Ask the owner for one line on
  why the requirement is wrong (the record's `reason`); write `title` and 3–6 `keywords` from it.
  1. Run L3 on the current block vs the proposed one. **Reword-eligible** → the wording is not what
     failed: say so and re-ask the first question without this option. **Meaning change** →
     continue.
  2. Run L4 for the successor. Generate its ID in the same feature number — generate each 7-character suffix with `LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 7` and regenerate it while it is all digits or `git grep --untracked -q <suffix>` finds it anywhere (feature files and `docs/requirements/changes/` included) — and write its
     block in place of the old one. Write a `supersede` record (`CR-` suffix generated the same
     way) with `approved_via = "wrapup"`, `approved_by` = `git config user.name`, `refs` =
     `["epic <id>"]` plus the open `pending` record's ID when the requirement is Disputed, the old
     `text` and `fingerprint` from `tor-lifecycle text <TOR> --rev <base> --json`, and the old
     tracing entry's sources as `traced_to`. Run `tor-lifecycle validate <record>` until it prints
     `ok`.
  3. In the tracing sidecar, replace the old entry with the successor's (same `traces_to`,
     `"rationale": "Supersedes <old TOR> (<CR-ID>): <reason>"`).
  4. If this epic lists the old ID, swap the successor into its spec anchors and sidecar
     `requirements:` line; otherwise (a Disputed requirement this branch only touches) the
     successor is unassigned — list it for `/peak-workflow:add` in Step 3.4. Retarget the tests
     that cite the old ID to the successor.
  5. Re-run Step 1.2 for the successor and use its verdict. The Deferrals row reads
     `AMENDED AT WRAPUP — <CR-ID>: <old> → <successor>; successor <verdict>`. A successor that is
     not PASS goes back to the first question, without `The requirement may be wrong, not the code`.
     A successor brought to PASS by Fix now keeps that one row:
     `AMENDED AT WRAPUP — <CR-ID>: <old> → <successor>; successor PASS after FIXED DURING WRAPUP — <what changed>`,
     counted in both `amended` and `fixed at wrapup`.
- **Record as pending** — the owner agrees the requirement is wrong but not how to fix it. Write a
  `pending` record (L5 choice 5: the feature file is not touched; `reason` = the owner's one line
  on why it is wrong, with `title` and 3–6 `keywords` written from it; `fingerprint` = the current
  one; `owner` = `git config user.name`; `approved_via = "wrapup"`; `approved_by` = `git config
  user.name`; `refs` = `["epic <id>"]`; offer a tracking issue when `gh` is available and the
  repository is on GitHub), and validate it. The TOR displays as
  `PENDING (<CR-ID>)`; the Deferrals row reads `RECORDED AS PENDING — <CR-ID>`, and Step 2.2
  writes its `unverified:` line. This is also the choice for an owner who cannot yet say whether
  the requirement or the code is right. It reads Disputed
  from now on, and an epic that later touches it is held to the Disputed rules (Step 1.1 item 3a).
- **Stop** — the epic FAILs. Still ask about every remaining non-PASS TOR so the report is
  complete.

An undisclosed deferral **may** be fixed, waived, amended, or recorded as pending, but its `Disclosed: **no**` mark stays in
the table permanently — fixing or waiving forgives the gap, not the silence.

### Step 1.5: Present Verification Report

Present a consolidated report to the user. The report has three jobs: deferrals first (the one thing an operator must not miss), a fast skim below that (counters), then a reviewer-friendly narrative (Highlights + Conclusion).

```
# Epic <id>: [Name] — Verification Report

## Deferrals
Count: N (undisclosed: M, waived: W, fixed at wrapup: F, amended: A, pending: P)

| TOR ID | Unmet | Disclosed | Implementer decision | Verifier finding | Waived by / Date / Reason |
|--------|-------|-----------|----------------------|------------------|---------------------------|
| TOR-02-Xyz5678 | negative-path (invalid token) rejection | yes | defer — needs auth middleware → epic B9xQr2z (tschavey, 2026-09-04) | FAIL — confirmed unmet | tschavey / 2026-09-04 / auth middleware lands in → epic B9xQr2z |
| TOR-03-Mno9012 | returns 201 on create | **no** | — (handoff Key Decisions: "201 can wait") | FIXED DURING WRAPUP — status code changed to 201, test updated | — |
| TOR-03-Pqr3456 | rejects empty name | **no** | — | FAIL — ❌ UNDISCLOSED DEFERRAL | — |

(If Count is 0: write `None` in place of the table. Prepend the Step 1.2b warning line if the
implementer handoff had no Deferrals section. `Count:` is the number of rows; a fixed TOR keeps
its row.)

## Counts
- TOR Requirements: X/Y PASS, Z FAIL, C CANNOT VERIFY (V waived, F fixed at wrapup, A amended, P pending)
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

(Y is the final anchors — a SUPERSEDED row is not counted; Z includes pending TORs. P counts Step 1.4b pending records only; renewals from Step 1.1 item 3a appear under Requirement
Changes. X includes TORs fixed at wrapup; Z and C include waived TORs; xfail/skip results count as
skipped.)

## Requirements Anchor Reconciliation
- [One of: "All TOR IDs are live requirements — no discrepancies" /
  each anchor gap from Step 1.1 item 5 with its outcome (replaced with <successor> (<CR-ID>),
  dropped (<CR-ID>), corrected, or unfixed — FAIL)]

## Requirement Changes
- [Every Change Record this branch adds — committed ones from
  `git diff --name-only --diff-filter=A <base>...HEAD -- docs/requirements/changes/`, plus those
  written in this session and not committed yet
  (`git ls-files --others --exclude-standard docs/requirements/changes/`) — one line each:
  `<CR-ID> <kind> — <TOR(s), old → new for a supersede> — <record title> (approved via <approved_via>, by <approved_by>)`;
  then `Disputed: <TOR> — <title> (<CR-ID>, <N> days)` for each touched Disputed requirement under
  the threshold (one renewed or resolved here is listed once, by its record line); or "None"]

## Removal (removal epics only — omit otherwise)
Retires <CR-ID> — <record title>
- No citations left: PASS (sweep <retired IDs> exit 0) / FAIL — <path:line, …>
- Code gone: PASS (<absence-test lines, if any>) / FAIL — <path:line, …>
- Guard requirements: PASS / N/A — no guard requirements / FAIL — <TOR, …>

## Verification Narrative

### Highlights
- ✅ TOR-01-Afs657G — version flag implemented and tested (tests/test_cli.py:42, src/cli.py:118)
- ✅ TOR-01-Bcd2345 — help flag implemented and tested (tests/test_cli.py:67, src/cli.py:124)
- ⚠️ TOR-02-Xyz5678 — waived: negative-path test (invalid token) missing (waived by tschavey, 2026-09-04 → epic B9xQr2z)
- 🔧 TOR-03-Mno9012 — fixed during wrapup: returned 200, Then requires 201; deferral was undisclosed
- ❌ TOR-03-Pqr3456 — empty name accepted; deferral undisclosed

### Conclusion
<2–3 sentences explaining why this verification is sufficient for the epic's TOR requirements,
or — if FAIL — what specifically needs to be addressed before re-run>

## Design
Design skills used: <copied from the implementer handoff's Key Decisions line> (UI epics only — omit otherwise)

## Code Review Findings
- [list any concerns, or "No issues found"]

## Verdict: PASS / FAIL
```

**Design line (UI epics only).** Copy the handoff's `Design skills used:` line verbatim (write
`not recorded` if the handoff has none). It is not a gate. If it says `none installed` but this
session's available-skills or deferred-tool list shows a design skill or `mcp__shadcn__*` tools,
add the non-gating note `ℹ️ design tooling is installed but the implementer recorded none — check
the session was restarted after install`. The verifier does not invoke design skills; its checks
stay independent of them.

**Requirements Implemented table** (always included below the Verdict):

```
## Requirements Implemented

| TOR ID | Title | Feature File | Verdict | Test Reference |
|--------|-------|--------------|---------|----------------|
| TOR-01-Afs657G | Tool shall report its version | docs/requirements/01-cli.feature.md | PASS | tests/test_cli.py:42 |
| TOR-01-Bcd2345 | Tool shall print help | docs/requirements/01-cli.feature.md | PASS | tests/test_cli.py:67 |
| TOR-02-Xyz5678 | Expired token is rejected | docs/requirements/02-auth.feature.md | WAIVED | tests/test_auth.py:91 |
| TOR-03-Mno9012 | Create returns 201 | docs/requirements/03-parts.feature.md | PASS | tests/test_parts.py:15 |
| TOR-03-Pqr3456 | Empty name is rejected | docs/requirements/03-parts.feature.md | FAIL | tests/test_parts.py:28 |
```

Titles come from the one `tor-lifecycle titles` run (Step 1.1 item 4a). An amended requirement
shows its successor (with its own verdict) plus a row for the old ID reading
`SUPERSEDED → <successor> (<CR-ID>)`, whose Title is the `titles` line as printed and whose Test
Reference is `—`; a pending one reads `PENDING (<CR-ID>)`. A removal epic with no guard
requirements writes `None — a removal epic with no guard requirements`. Feature File is the path
as `docs/requirements/NN-name.feature.md` in the report, handoff, and PR body alike.

The Verdict line follows the rule in Step 1.4b. The Deferrals table, Counts, and Requirements
Implemented table are lifted verbatim into the completion handoff and PR body — keep their
column sets exactly as shown.

**Authoring the Highlights list:**

- Highlights are **selective**, not comprehensive — 3–6 bullets is typical, not one bullet per item. Lead the reviewer to the substantive checks; skip trivialities.
- Author them from what was actually run in Steps 1.2–1.4.
- Lead each bullet with a literal Unicode emoji — ✅ for pass, ⚠️ for waived or recorded as pending, 🔧 for fixed or amended during wrapup, ❌ for fail. Do **not** use shortcodes like `:white_check_mark:` — they don't render in git commits or many markdown viewers.
- Deferrals never appear *only* in Highlights — they are already in the Deferrals table at the top. Highlights may reference them but must not be the sole record.

**If the verdict is FAIL:** Stop here, on the feature branch (a stop that wrote nothing, like the
Step 1.1 item 3a stops, says where it leaves the session). List the specific items that need to be fixed — TORs already fixed during this wrapup are re-verified and not on that list. Do NOT proceed to Phase 2. Tell the user: make the fixes (re-run `/peak-workflow:start-epic <id>` on the same branch, or fix by hand), then run `/peak-workflow:wrapup-epic <id>` again in a fresh session. Any fix or Change Record written during this wrapup is uncommitted on the feature branch — say so, so it is not lost.

**If the verdict is PASS:** Ask the user to confirm before proceeding to Phase 2.

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

Write the completion handoff to `docs/implementation-plan/session-handoffs/epic-<id>-complete.md` .

Use the template at `${CLAUDE_PLUGIN_ROOT}/skills/wrapup-epic/HANDOFF_TEMPLATE.md`. Read that file once, copy its template body verbatim into the handoff file, and fill in placeholders from the Step 1.5 verification report and the Step 2.0 manual-verification disclosure.

### Step 2.2: Update Status Sidecar

Update `docs/implementation-plan/status/epic-<id>.md`:
1. Change `status: Implemented` to `status: Complete` (leave any `owner:` line as it is — it
   records who implemented the epic)
2. Set `completed: <today>` (YYYY-MM-DD)
3. Set `handoff: session-handoffs/epic-<id>-complete.md` 
4. If any TOR was waived in Step 1.4b, add (or replace) a
   `waived: TOR-… → <succ>, TOR-… → <succ>` line after `requirements:`, where `<succ>` is the
   successor epic ID recorded in the waiver. `/peak-workflow:status` treats a waived TOR as not
   satisfied by this epic — its coverage comes from the successor. Omit the line when nothing
   was waived.
5. Record the results: run `tor-lifecycle mark <id> --pass <TOR> <TOR> … --fail <TOR> "RECORDED AS PENDING — <CR-ID>: <unmet>"`
   — `--pass` for every TOR whose final verdict is PASS (fixed and amended ones included), one
   `--fail` per TOR recorded as pending; waived and superseded TORs are left out. It writes one
   `verified:` line per PASS from the current fingerprint (never type a fingerprint) and an
   `unverified:` line per pending TOR — without one, a failed requirement would read as verified
   underneath its dispute. Skip it when there is nothing to record (a removal epic with no guard
   requirements).

Then locate the epic spec file — `grep -rl "epic-<id>" docs/implementation-plan/phase-*/epic-<id>-*.md` (or the glob `docs/implementation-plan/phase-*/epic-<id>-*.md` directly) — and rewrite its `**Status:**` header line to `**Status:** Complete — <today>` (same date just written to `completed:`), so the spec stays in sync with the sidecar.

### Step 2.3: Commit

Automatically commit all changes made during verification and completion without
asking the user for permission:

1. Stage the handoff file, updated `docs/implementation-plan/status/epic-<id>.md`, the updated epic spec file, any Change Record written here with the feature file and tracing sidecar it changed, and any other files modified during verification (specific file paths, not `git add -A`)
2. Commit message format:
   ```
   chore(epic-<id>): verify and complete — <brief summary>

   Deferrals: <deferral-count>, waived: <waived-count>, fixed at wrapup: <fixed-count>.
   Amended: <A>, pending: <P>. Requirement changes: <CR-ID kind TOR, …, or "none">
   Refs #<N>
   ```
   `<deferral-count>` / `<waived-count>` / `<fixed-count>` come from the Step 1.5 Deferrals `Count:` line. Include the `Refs #<N>` line only if a source issue number was captured in Step 1.1 item 4. Files changed by a Step 1.4b fix are part of this commit — stage them by path.

Do NOT push to the remote yet.

---

## Phase 3: Orient

Your goal is to help the user decide what to work on next. Glob `docs/implementation-plan/phase-*/index.md` and read all phase indexes; glob `docs/implementation-plan/status/epic-*.md` and read all sidecars. (Step 1.1 item 2 only loaded this epic's sidecar.) Assemble the full dependency graph from the phase indexes and look up all epic statuses from the sidecars. Then present:

### Step 3.1: What's Now Unblocked

List any epics whose dependencies are now fully satisfied thanks to this epic's completion. For each, include:
- Epic ID and name
- Its dependencies (and whether they're all met)
- A one-line summary of what it involves

### Step 3.2: Parallelization Opportunities

If multiple epics are now unblocked, call out which ones can be worked on in parallel.

### Step 3.3: Recommended Next Action

If exactly one epic is ready, recommend it with a brief rationale. If several are, list them and say that choosing is the team's decision (as `/peak-workflow:status` does) — never pick one.

### Step 3.4: Outstanding Items

This section is a record, not a decision point. It may list only:
- TORs already waived in Step 1.4b, each with its successor epic (`TOR-… → epic <succ>`)
- Pending records written here (`TOR-… — recorded as pending in <CR-ID>; resolve with
  /peak-workflow:capture-requirements TOR-…`) and unassigned successors (`TOR-… — plan it with
  /peak-workflow:add`)
- Non-TOR observations from the Step 1.4 code review (tech debt, refactors)

It must not originate a deferral. If a substantive finding first surfaces here, go back to the
Step 1.4b question for it — do not file it as a follow-up.

Present this as a clear summary the user can act on:

```
## Next Steps

### Unblocked Epics
- Epic X: [Name] — [one-line summary] (all dependencies met)
- Epic Y: [Name] — [one-line summary] (all dependencies met)

### Recommended Action
[Your recommendation and why]

### Outstanding Items (non-blocking)
- TOR-… — waived: <gap> → epic <succ>
- <non-TOR code-review observation>
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
> At Step 5 (Gap Analysis), print the gap tables in your output and proceed to Step 6 without
> waiting for confirmation — you have no user to ask.
> When you reach Step 8 (Commit), auto-commit without asking the user for permission.
> Commit message format: `docs: refresh architecture and design notes — <brief summary of changes>`
> Do NOT push to the remote.

**Wait for the subagent to complete before proceeding.** The refreshed documents must be
committed on the feature branch before it is merged into main.

---

## Step 5: Ship to Base Branch

After Phase 3 orientation is complete and the Step 4 doc refresh subagent has
committed on the feature branch, run `tor-lifecycle check --base <base>` once more: a finding
marked `[this branch, blocking]` stops the ship (the doc refresh or a late fix introduced it) —
fix it as in Step 1.1 item 3a and commit before continuing. Then ship the branch. Ask the user which mode to use
via `AskUserQuestion`. Present both options neutrally — do **not** auto-detect a
default, do **not** recommend one mode over the other. There is no reliable signal
to determine which mode is correct for the user's context (repo permissions, team
conventions, project phase, and personal preference all vary), so this choice must
be made by the user every invocation.

- Question: `"Ship mode — solo (merge locally to the base branch) or team (push the branch and open a pull request)?"`
- Options: `["Team — push and open PR", "Solo — local merge only"]`

### Step 5a: Solo mode

1. Note the current feature branch name (the feature branch from Step 1.1 item 1a).
2. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
3. `git checkout <base-branch>`, then — if `origin/<base-branch>` exists —
   `git pull --ff-only origin <base-branch>`, so the merge lands on the team's latest base rather
   than a stale local copy. If the pull fails for any reason, stop, show git's message, and tell
   the user to reconcile `<base-branch>` first; the feature branch and its wrapup commit are intact.
4. `git merge <branch> --no-ff -m "epic(<id>): merge <branch> — <brief summary>"`
5. `git branch -d <branch>`
6. Confirm with `git log --oneline -5`
7. Report to the user:
   > Branch `<branch>` has been merged into `<base-branch>` and deleted.
   > Changes have not been pushed — run `git push` when ready.

   If `CLAUDE.md`'s `**Remote:**` line records branch protection, add: *"`<base-branch>` is
   protected — the push goes through only for a repository administrator. Without admin rights,
   use team mode instead."*

### Step 5b: Team mode

1. Note the current feature branch name.
2. Detect the base branch: run `git branch --list develop main master` and prefer `develop` if it exists, then `main`, then `master`.
3. `git push -u origin <branch>`
4. `gh pr create --base <base-branch> --title "epic(<id>): <epic name>" --body "<body>"`

   The body follows the template at `${CLAUDE_PLUGIN_ROOT}/skills/wrapup-epic/PR_BODY_TEMPLATE.md`. Read that file once, copy its template body verbatim into the `--body` argument, and substitute placeholders from the Step 1.5 verification report and the Step 2.0 manual-verification disclosure. Reuse the "What Was Built" content **already in memory** from Step 2.1 — do not re-read the handoff file from disk.

   The issue-link line is driven by the spec's `**Source:** Issue #<N>` header captured in Step 1.1 item 4 and by the Step 1.5 Deferrals **waived count** (`W`). If no source issue is known, omit the line entirely (existing integer-IDed epics without a `Source:` line render cleanly this way). If `W` is 0, write `Closes #<N>` — rows marked `FIXED DURING WRAPUP` are delivered and do not block closing. If `W` is greater than 0, write `Refs #<N>` — a waived TOR means the issue's requirement is not fully delivered, so merging must not auto-close it. Only the PR body may close the issue; the start-epic and wrapup commits always use `Refs`.

5. **Announce PR on the GitHub issue** (conditional) — run only if a source issue number was captured in Step 1.1 item 4 **and** `gh auth status` succeeds:
   ```bash
   gh issue comment <N> --body "PR opened for Epic <id>: <PR url>. Awaiting review."
   ```
   If the waived count `W` is greater than 0, use this body instead:
   ```bash
   gh issue comment <N> --body "PR opened for Epic <id>: <PR url>. <W> TOR(s) waived to a later epic — see Deferrals in the PR body. This issue stays open until the successor epic ships."
   ```
   Capture the PR URL from the `gh pr create` output in item 4. If `gh auth status` fails or the comment command errors, print a warning (`gh issue comment failed — PR is still open, manual issue update may be desired`) and continue; the PR itself is the essential deliverable, the comment is a courtesy. Skip this step entirely in solo mode (Step 5a) — nothing external to link to.
6. Do **NOT** run `gh pr merge`. Merging is the reviewer's responsibility.
7. Do **NOT** delete the feature branch. GitHub auto-delete (if enabled) or manual cleanup handles it after merge.
8. Report to the user:
   > PR opened: `<url>`. Feature branch `<branch>` pushed. Await review; do not merge locally.
