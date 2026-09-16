---
name: wrapup-epic
description: |
  Independent verification review of a completed epic — verifies each TOR requirement's
  Given/When/Then, closes out, and orients to next steps.
  Use after an epic is implemented and needs independent review.
  Triggers on: "wrapup epic", "verify epic", "review epic", "close epic",
  "is epic N done?", "check my work on epic N", "review what I built",
  "sign off on epic N", "close out epic N".
  Note: If the user says "I'm done with epic N", check whether the epic is "Implemented" (use wrapup) or "In Progress" (suggest /peak-workflow:pause instead).
argument-hint: "<epic-id>"
model: opus
---

You are performing an independent verification and completion of Epic $ARGUMENTS.

You are acting as an independent reviewer — you did NOT implement this epic. Your job is to verify the implementation against the spec, close out the epic if it passes, and orient the team toward what's next.

This skill runs on Opus by default (frontmatter `model: opus`) so verification is done by a stronger model than the one that typically implements. Projects may state a different preference with a `Verifier model: <model>` line in their `CLAUDE.md`. That line is informational — a skill cannot switch the model of a running session — so record the model this session is actually running on as `<model>` in the handoff and PR body, and if it differs from the project's stated verifier model, tell the user (`claude --model <model>` or editing this skill's frontmatter is how to change it).

This command has three phases: **Verify**, **Complete**, and **Orient**. Do not skip ahead — each phase gates the next.

## Session Guard

**Before any other action:** check whether this conversation has already executed `/peak-workflow:start-epic $ARGUMENTS`, or has done any implementation work on Epic $ARGUMENTS (edited its source files, written its tests, or authored its `epic-$ARGUMENTS-implemented.md` handoff). If so, stop immediately and print:

> Wrapup must run in a fresh session so verification is independent of the implementer's context. Close this session and run `/peak-workflow:wrapup-epic $ARGUMENTS` in a new one.

Do not proceed. A verifier that shares the implementer's context inherits the implementer's rationalizations, which defeats the purpose of independent verification.

## Layout Guard

**Immediately after the Session Guard:** check whether `docs/implementation-plan/index.md` contains a legacy status table header — a line matching `| Phase | Epic |` with a `| Status |` column present in the file. If the legacy header is found, stop immediately and print:

> This project uses the pre-v2.5.0 implementation-plan layout. Run `/peak-workflow:migrate-2.5` once to upgrade to the new layout (per-phase indexes + status sidecars), then retry your command.

Do not attempt the skill's normal flow on a legacy layout.

---

## Phase 1: Verify

Your goal is to independently confirm the implementation meets the spec. Do not trust the implementer's self-assessment — inspect the code yourself.

> **Safe to re-run:** This command is safe to run multiple times. If a previous wrapup attempt was interrupted or failed, just run `/peak-workflow:wrapup-epic N` again — it will re-verify from scratch.

### Step 1.1: Load Context

1. Use the project's `CLAUDE.md` content already loaded in your system context. Do not re-read it via the `Read` tool — it is injected into every conversation turn.
1a. **Check out the feature branch before reading any sidecar or spec content.** The sidecar and spec on `develop`/`main` may still say `Not Started` or `In Progress` — only the feature branch carries the implementer's updates. Locate the spec by filename only (no content read): `ls docs/implementation-plan/phase-*/epic-$ARGUMENTS-*.md`. Extract the **branch short name** from that filename: strip the directory path, the `epic-<id>-` prefix (where `<id>` is either a legacy integer, a decimal like `6.5`, or a 7-char alphanumeric ID), and the `.md` suffix. For example, `epic-3-user-auth.md` → `user-auth`, and `epic-a3f2K7p-user-auth.md` → `user-auth`. If there is no suffix after `epic-<id>`, omit it. Then detect the branch with a reliable test — do **not** rely on `git branch --list … && echo "exists"` (always exits 0) or on `git checkout` failing silently:
   ```bash
   git show-ref --verify --quiet refs/heads/feature/epic-<id>-<short-name>
   ```
   Exit 0 = branch exists; nonzero = missing. Then:
   - If `feature/epic-<id>-<short-name>` exists, run `git checkout feature/epic-<id>-<short-name>` (where `<id>` is `$ARGUMENTS` verbatim).
   - If it does not exist, repeat the existence test against the legacy name `feat/epic-N` (applies to integer IDs only — sessions started before v1.3.0). If the legacy branch exists, check it out.
   - If neither branch exists, inform the user and proceed on the current branch (the work may have been done directly on main in an older session).
   - After checkout, **re-read `CLAUDE.md`** from the working tree. The copy loaded at session start
     came from the base branch; an epic that changed `CLAUDE.md` (the walking skeleton resolving
     `TBD` lines, for one) is only visible after checkout.
2. Read `docs/implementation-plan/status/epic-$ARGUMENTS.md` to get the epic's current status. Phase 3 (Orient) loads all phase indexes and sidecars when it walks the dependency graph — Step 1.1 only needs this epic's sidecar.
3. Check the sidecar: if `status: Implemented`, proceed. If `status: In Progress`, `status: Paused`, or `status: Not Started`, inform the user that `/peak-workflow:start-epic $ARGUMENTS` must finish first and stop. If `status: Complete`, inform the user it has already been wrapped up.
4. Read the epic spec file located in item 1a. While reading, parse the header for a `**Source:** Issue #<N>` line. If present, capture the integer `<N>` as the **source issue number** — it drives the Step 5b PR body `Closes #<N>` / `Refs #<N>` line. If no `Source:` line exists, the source issue number is unknown; skip that line later.
4a. **Load TOR Requirements.** Parse the epic spec's `## Requirements Anchors` table. For each
    row, extract the TOR ID, feature file path, and scenario title. Then, for each TOR ID, open
    the cited feature file and locate the `Scenario: [TOR-NN-XXXXXXX]` block with that exact ID.
    Read the full Given/When/Then. These become the verification specifications — every subsequent
    verification step judges the implementation against these Given/When/Then statements.
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
   self-assessment. For each row in the Requirements Anchors table:
   1. Confirm the TOR ID exists in the cited feature file with an exact ID match.
   2. **TOR ID not found:** record as a Requirements Anchor gap in the Step 1.5 report. This is
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
      Step 1.2. Note in the Step 1.5 Anchor Reconciliation section which text was used.
   4. **TOR ID found and titles match:** record "Requirements Anchor verified: TOR-NN-XXXXXXX".
   5. **Spec has no Requirements Anchors section** (legacy spec from before peak-workflow v1.0.0):
      note this in the verification report and continue — legacy specs are grandfathered.
6. **Do NOT read the implementer handoff yet.** `docs/implementation-plan/session-handoffs/epic-$ARGUMENTS-implemented.md` is the implementer's self-assessment. Reading it before you have formed your own per-TOR verdicts contaminates the review. It is read in Step 1.2b, after every verdict is recorded. (Any `epic-$ARGUMENTS-paused.md` handoff is likewise off-limits until then.)
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

For each TOR ID in the epic spec's Requirements Anchors table, independently verify the
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
`docs/implementation-plan/session-handoffs/epic-$ARGUMENTS-implemented.md` and locate its
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

Read the **Verification & Quality Gates** section from `CLAUDE.md`. Run every applicable check independently:
- Build check
- Visual verification (if UI was changed) — web: `playwright-cli`; desktop: the Playwright Electron harness
- Brand compliance via the project's brand guidelines skill (if UI was changed and a brand skill is configured)
- Console check (if UI was changed) — web: `playwright-cli`; desktop: the renderer console captured by the Playwright Electron harness
- UX Baseline check (if UI was changed and `CLAUDE.md` has a **UX Baseline** section) — see below
- Access-control check — on routes that return or change records (if `CLAUDE.md`'s `**Product shape:**` block records
  `**Access rule:** owner-or-permitted-role`, or its Tech Stack records
  `Auth: local accounts now, org SSO deferred`, and this epic touched user data) — see below
- Deferred-value check (walking-skeleton epic only): `grep -nE 'TBD — set by the walking-skeleton epic|— unconfirmed|Board: not chosen|\*\*Not decided yet:\*\*' CLAUDE.md`
  on the feature branch must return nothing. Any hit is a FAIL — the skeleton owns resolving
  every one

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
TORs fixed during this wrapup) or every remaining non-PASS TOR carries a **human waiver**, AND
every quality gate from Step 1.3 passes (including any `GATE DISCREPANCY`). Otherwise the epic
verdict is **FAIL**.

**Failing quality gates first.** For each gate that failed in Step 1.3, ask the same question
below with options `["Fix now", "Stop — epic FAILs"]` only — a gate cannot be deferred. On Fix
now, apply the fix and re-run that gate; if it still fails, the epic verdict is FAIL. Record the
outcome in Code Review Findings (`fixed at wrapup` or `unfixed — epic FAILs`).

A substantive finding is never filed as a follow-up by default — it is put to the user as a
decision, at the moment it is cheapest to act on. For each TOR whose verdict is FAIL or CANNOT
VERIFY, use `AskUserQuestion` (one question per TOR, all asked before the report is rendered):
- Question: `"TOR-<NN-XXXXXXX> is <FAIL | CANNOT VERIFY>: <what is unmet>. Recommendation: <Fix now | Defer | Stop> — <one clause why>. How to proceed?"`
- Options: `["Fix now", "Defer — depends on a later epic", "Stop — epic FAILs"]`

The recommendation is mandatory — never ask without one. Recommend **Defer** only when the
eligibility rule below is met.

**Only an option the user selects counts.** A free-text reply that does not name one of the
three options ("ok", "proceed", "fine") is not consent to defer — re-ask.

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
- **Stop** — the epic FAILs. Still ask about every remaining non-PASS TOR so the report is
  complete.

An undisclosed deferral **may** be fixed or waived, but its `Disclosed: **no**` mark stays in
the table permanently — fixing or waiving forgives the gap, not the silence.

### Step 1.5: Present Verification Report

Present a consolidated report to the user. The report has three jobs: deferrals first (the one thing an operator must not miss), a fast skim below that (counters), then a reviewer-friendly narrative (Highlights + Conclusion).

```
# Epic <id>: [Name] — Verification Report

## Deferrals
Count: N (undisclosed: M, waived: W, fixed at wrapup: F)

| TOR ID | Unmet | Disclosed | Implementer decision | Verifier finding | Waived by / Date / Reason |
|--------|-------|-----------|----------------------|------------------|---------------------------|
| TOR-02-Xyz5678 | negative-path (invalid token) rejection | yes | defer — needs auth middleware → epic B9xQr2z (tschavey, 2026-09-04) | FAIL — confirmed unmet | tschavey / 2026-09-04 / auth middleware lands in → epic B9xQr2z |
| TOR-03-Mno9012 | returns 201 on create | **no** | — (handoff Key Decisions: "201 can wait") | FIXED DURING WRAPUP — status code changed to 201, test updated | — |
| TOR-03-Pqr3456 | rejects empty name | **no** | — | FAIL — ❌ UNDISCLOSED DEFERRAL | — |

(If Count is 0: write `None` in place of the table. Prepend the Step 1.2b warning line if the
implementer handoff had no Deferrals section. `Count:` is the number of rows; a fixed TOR keeps
its row.)

## Counts
- TOR Requirements: X/Y PASS, Z FAIL, C CANNOT VERIFY (V waived, F fixed at wrapup)
- Quality Gates: X/Y PASS
- Tests: X passed, Y skipped, Z failed

(X includes TORs fixed at wrapup; Z and C include waived TORs; xfail/skip results count as
skipped.)

## Requirements Anchor Reconciliation
- [One of: "All TOR IDs verified in feature files — no discrepancies" /
  "Anchors grandfathered — spec pre-dates peak-workflow v1.0.0" /
  specific discrepancies resolved, each with a one-line note on which text was
  used as the verification baseline]

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

## Code Review Findings
- [list any concerns, or "No issues found"]

## Verdict: PASS / FAIL
```

**Requirements Implemented table** (always included below the Verdict):

```
## Requirements Implemented

| TOR ID | Feature File | Verdict | Test Reference |
|--------|--------------|---------|----------------|
| TOR-01-Afs657G | 01-cli.feature.md | PASS | tests/test_cli.py:42 |
| TOR-01-Bcd2345 | 01-cli.feature.md | PASS | tests/test_cli.py:67 |
| TOR-02-Xyz5678 | 02-auth.feature.md | WAIVED | tests/test_auth.py:91 |
| TOR-03-Mno9012 | 03-parts.feature.md | PASS | tests/test_parts.py:15 |
| TOR-03-Pqr3456 | 03-parts.feature.md | FAIL | tests/test_parts.py:28 |
```

The Verdict line follows the rule in Step 1.4b. The Deferrals table, Counts, and Requirements
Implemented table are lifted verbatim into the completion handoff and PR body — keep their
column sets exactly as shown.

**Authoring the Highlights list:**

- Highlights are **selective**, not comprehensive — 3–6 bullets is typical, not one bullet per item. Lead the reviewer to the substantive checks; skip trivialities.
- Author them from what was actually run in Steps 1.2–1.4.
- Lead each bullet with a literal Unicode emoji — ✅ for pass, ⚠️ for waived, 🔧 for fixed during wrapup, ❌ for fail. Do **not** use shortcodes like `:white_check_mark:` — they don't render in git commits or many markdown viewers.
- Deferrals never appear *only* in Highlights — they are already in the Deferrals table at the top. Highlights may reference them but must not be the sole record.

**If the verdict is FAIL:** Stop here. List the specific items that need to be fixed — TORs already fixed during this wrapup are re-verified and not on that list. Do NOT proceed to Phase 2. Tell the user: make the fixes (re-run `/peak-workflow:start-epic $ARGUMENTS` on the same branch, or fix by hand), then run `/peak-workflow:wrapup-epic $ARGUMENTS` again in a fresh session. Any fix applied during this wrapup is uncommitted on the feature branch — say so, so it is not lost.

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

Write the completion handoff to `docs/implementation-plan/session-handoffs/epic-<id>-complete.md` (where `<id>` is `$ARGUMENTS` verbatim — legacy integer or 7-char alphanumeric).

Use the template at `plugins/peak-workflow/skills/wrapup-epic/HANDOFF_TEMPLATE.md`. Read that file once, copy its template body verbatim into the handoff file, and fill in placeholders from the Step 1.5 verification report and the Step 2.0 manual-verification disclosure.

### Step 2.2: Update Status Sidecar

Update `docs/implementation-plan/status/epic-$ARGUMENTS.md`:
1. Change `status: Implemented` to `status: Complete`
2. Set `completed: <today>` (YYYY-MM-DD)
3. Set `handoff: session-handoffs/epic-<id>-complete.md` (where `<id>` is `$ARGUMENTS` verbatim)
4. If any TOR was waived in Step 1.4b, add (or replace) a
   `waived: TOR-… → <succ>, TOR-… → <succ>` line after `requirements:`, where `<succ>` is the
   successor epic ID recorded in the waiver. `/peak-workflow:status` treats a waived TOR as not
   satisfied by this epic — its coverage comes from the successor. Omit the line when nothing
   was waived.

Then locate the epic spec file — `grep -rl "epic-$ARGUMENTS" docs/implementation-plan/phase-*/epic-$ARGUMENTS-*.md` (or the glob `docs/implementation-plan/phase-*/epic-$ARGUMENTS-*.md` directly) — and rewrite its `**Status:**` header line to `**Status:** Complete — <today>` (same date just written to `completed:`), so the spec stays in sync with the sidecar.

### Step 2.3: Commit

Automatically commit all changes made during verification and completion without
asking the user for permission:

1. Stage the handoff file, updated `docs/implementation-plan/status/epic-$ARGUMENTS.md`, the updated epic spec file, and any other files modified during verification (specific file paths, not `git add -A`)
2. Commit message format (where `<id>` is `$ARGUMENTS` verbatim):
   ```
   chore(epic-<id>): verify and complete — <brief summary>

   Deferrals: <deferral-count>, waived: <waived-count>, fixed at wrapup: <fixed-count>.
   Refs #<N>
   ```
   `<deferral-count>` / `<waived-count>` / `<fixed-count>` come from the Step 1.5 Deferrals `Count:` line. Include the `Refs #<N>` line only if a source issue number was captured in Step 1.1 item 4. Files changed by a Step 1.4b fix are part of this commit — stage them by path.

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

This section is a record, not a decision point. It may list only:
- TORs already waived in Step 1.4b, each with its successor epic (`TOR-… → epic <succ>`)
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

   The body follows the template at `plugins/peak-workflow/skills/wrapup-epic/PR_BODY_TEMPLATE.md`. Read that file once, copy its template body verbatim into the `--body` argument, and substitute placeholders from the Step 1.5 verification report and the Step 2.0 manual-verification disclosure. Reuse the "What Was Built" content **already in memory** from Step 2.1 — do not re-read the handoff file from disk.

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
