# peak-workflow 3.0.0 — tracking doc

Requirements lifecycle (amend, retire, re-verify) and versioned upgrades, per issue #20 (v2
proposal + addendum). Every plan reads this file first and updates it last.

- **Spec:** issue #20 v2 + R1–R6 + the versioned-upgrades addendum. Deviations are logged below
  and posted once on #20 after approval.
  Posted so far: rows through Plan 4 (Plan 4 comment), Plans 5–7b (issuecomment-6428372050),
  and Plan 8 (issuecomment-6429562613). Post rows added from Plan 9 on in one follow-up at the
  merge gate. **Plan 9 rows not yet posted:** `Non-ID requirements: entry`, `Kept banner`, `Implemented owner`, `Fixes: trailer`.
- **Integration branch:** `feature/peak-workflow-3.0` (off `develop`). Each plan works on
  `feature/peak-workflow-3.0-pN-<name>` and merges back `--no-ff`. The integration branch merges to
  `develop` only after the merge gate (Q10).
- **Commits:** `<type>(peak-workflow): … (v3.0.0)`.
- **Tests:** `python3.11 -m unittest discover -s tests/peak-workflow -v`, and the same with
  `python3.14`.

## Plan shape

1. Merge `develop` into the integration branch, then cut the sub-branch.
2. Read this doc and the #20 sections the plan covers.
3. Implement.
4. Run unit tests (3.11 + 3.14) and the targeted dry-run (Q13).
5. Fix the findings.
6. Update this doc and `plugins/peak-workflow/CHANGELOG.md` (one bullet per change, ≤ 50 words).
7. Merge `--no-ff` into the integration branch.

## Settled decisions

| # | Decision |
|---|---|
| Q1 | #20 v2 + R1–R6 is the approved spec. Deviations and gap fixes are logged here and posted once on #20 |
| Q2/Q21 | Addendum in scope. Upgrade steps are **0001-epic-provenance** and **0002-requirements-lifecycle**. Format 0 = any peak-workflow ≤2.1 project. 3.0.0 ships `format = 2`. No `migrate-lifecycle` skill |
| Q3 | Integration branch `feature/peak-workflow-3.0` off develop. Each plan gets a sub-branch `feature/peak-workflow-3.0-pN-<name>`, merged `--no-ff` into it. It merges to develop only after the gate (Q10) |
| Q4/Q9 | Synthetic fixtures first. An outside contributor runs the real-project acceptance against a draft PR, using `docs/uat/lifecycle-acceptance.md` plus a redacting runner `tests/peak-workflow/acceptance/run.py` (counts, IDs, finding letters, timings; no requirement text) |
| Q5 | Stamp is `docs/.peak-workflow.toml`: `format = N` |
| Q6 | Behind-format guard: writing skills hard-stop; `status`/`triage` run degraded with a banner; `new-project` routes to `/upgrade`; a plugin that is behind the project tells the user to update the plugin. The old single-index layout fails as "not a peak-workflow layout" |
| Q7 | Plugin CLAUDE.md Skill File Rules amended. `scripts/` holds the deterministic mechanics (the fingerprint normalization's only implementation). `skills/upgrade/steps/NNNN-*.md` are runner-executed, forward-only, append-only step files |
| Q8 | Tests live in repo-root `tests/peak-workflow/` (not shipped). stdlib `unittest`, plus a fixture builder that makes tmpdir git repos. No CI. Run on `python3.11` and `python3.14` |
| Q10 | **Merge gate (all):** unit/fixture tests green on 3.11 + 3.14; 2 clean full dry-run passes including lifecycle scenarios; live UAT upgrade of a 2.1.0 project; contributor report reproducing Project A (429 Verified / 16 Changed since verified / 1 finding C) and upgrading B and C cleanly |
| Q11 | *Deviation:* the Disputed threshold lives in `.peak-workflow.toml` `[lifecycle] disputed_threshold_days = 30` (Safety is fixed at 0), not in CLAUDE.md |
| Q12 | *Deviation:* skills call `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" <cmd>`. This POSIX wrapper probes `python3` → `py -3` → `python` for ≥3.11 and execs `tor_lifecycle.py`, or prints a plain-English install hint. Works on Windows via Git Bash. setup uses the same probe |
| Q13 | Each skill-editing plan ends with a targeted sub-agent dry-run of the skills it changed, on a synthetic fixture project. Findings are fixed before the sub-branch merges |
| Q14 | Scale fixture is about 800 TORs, ~60 Complete epics, ~400 commits. `fingerprint` ≤ 2s; `check` and `seed` ≤ 10s each |
| Q15 | Compat bundle: 11 layout guards → 1 format guard. Provenance/owner "absent" branches deleted. Epic IDs are opaque (the ~15 integer parentheticals are deleted). `feat/epic-N` lookup → a generic "ask which branch" fallback. TOR-split check → `check` F. **Kept:** the auth-deferral disjunct, CLAUDE.md-section fallbacks, and the missing-Deferrals check. No step ever edits the user's CLAUDE.md |
| Q16 | Open epics without Requirements Anchors: start-epic and wrapup stop with "re-plan it with /add" (grandfather clauses deleted). reverify refuses `requirements: —` |
| Q17 | *Gap fix:* `status`/`check` treat a `waived:` entry whose TOR is not live as history. Complete sidecars are never rewritten |
| Q19/Q19a | *Scope change:* delete `migrate-from-epic-workflow`, `migrate-2.5`, new-project's epic-workflow detection, and the "epic-workflow may be a better fit" advice. Removing the `epic-workflow` plugin from the marketplace is a **separate** marketplace release |
| Q22 | *Gap fix:* mockup gains a `Removed` change type. Modified/Removed screen rows list the TORs citing that `S-NN` and feed capture-requirements' decision test |
| Q24 | The user builds the live-UAT source in parallel: Habit Tracker on released 2.1.0 to 3–4 Complete epics, plus one in-place edit of a verified TOR and one "pending change-control" note |
| Q25 | Plan 1 commits this tracking doc. Every plan reads it first and updates it last. After approval, one comment on #20 summarizes the deviations |
| Q26 | The integration branch renames `## [2.2.0] — UNDER DEVELOPMENT` to `## [3.0.0] — UNDER DEVELOPMENT`. Each plan starts by merging develop into the integration branch. Hotfixes in the meantime ship as 2.1.x |

## Deviation log (to post on #20)

| Ref | #20 says | 3.0.0 does | Why |
|---|---|---|---|
| Q11 | Disputed threshold configurable in the project's CLAUDE.md | `docs/.peak-workflow.toml` `[lifecycle] disputed_threshold_days` (default 30); `# Safety` requirements are always 0 | No skill or step ever edits the user's CLAUDE.md; the stamp file is already machine-owned |
| Q12 | Skills call `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/tor_lifecycle.py` | Skills call `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"`; the wrapper probes `python3` → `py -3` → `python` for ≥ 3.11, else prints an install hint and exits 3 | `python3` is missing or too old on many Windows and stock macOS machines |
| Q17 | (gap) | A `waived:` entry naming a TOR that is no longer live is history, not a finding | Complete sidecars are never rewritten, so retiring a waived TOR would otherwise raise a permanent false finding |
| Q19/Q21 | Addendum numbers steps 0001 split-index, 0002 provenance, 0003 lifecycle; `migrate-from-epic-workflow` stays | Steps are **0001-epic-provenance** and **0002-requirements-lifecycle**; `migrate-2.5` and `migrate-from-epic-workflow` are deleted; the old single-index layout fails as "not a peak-workflow layout" | epic-workflow is being retired; no 2.5-era single-index projects remain to bring forward |
| Q22 | (gap) | `mockup` gains a `Removed` change type; Modified/Removed screen rows list the TORs citing that `S-NN` and feed the decision test | Screen removals otherwise leave their TORs silently stale |
| `states` | Subcommands: `fingerprint`, `titles`, `check`, `sweep`, `seed` | Adds `states --json` (the derived-state table, incl. Q17) | `status` computes nothing itself; the derived-state rules then have one implementation |
| `version` | (none) | Adds `version`: prints the interpreter and `PLUGIN_FORMAT` | `setup` reuses it as the Python probe (Q12) |
| `format` | Guard compares `format` with the plugin's; no stamp = format 0 | Adds `format` (verdict + user message, exit 1 unless current/new), `format --init` (setup), `format --set N` (upgrade). No stamp **and** no planning artifacts = `new`, not format 0. `--init` refuses a project that already has artifacts | A fresh repo is not a 2.1 project; setup must never stamp over a project that needs upgrading |
| `provenance`, `inflight` | Step 0002 backfills provenance with `git log --follow`; runner warns about in-flight branches | Adds `provenance [--write] [--skip]` and `inflight <paths>`. Provenance stops at a copy or a rename from another epic's spec | `--follow` pairs a new templated spec with a look-alike one (`C071`) and reports the wrong author and date |
| `validate`, `search`, `text` | Skills validate records, grep `title`/`reason`/`keywords`, and recover the verified text from git | Adds `validate [files]` (schema + record-ID clashes, exit 1 on problems), `search <terms>` (supersede/retire/pending records, whole-word, normalized), `text <TOR> [--rev REF \| --verified] [--json]` (block verbatim; `--verified` matches the owning Complete epic's saved fingerprint in the file's history) | Skills call only the wrapper; a raw grep also hits `text` fields, and "the commit that saved the fingerprint" is a seed or wrapup commit, not the text's commit |
| triage `AMEND` | A meaning change with no vision/ConOps impact dispatches `capture-requirements <TOR-ID>` | A fourth verdict, `AMEND`, carries that route (dispatched in-session) | HEAVY prints commands for a fresh session; this route is one short run |
| `# Note: reference screen` | Feature files allow no `# Note:` blocks | The `# Note: reference screen(s) — …` line under `# UX Baseline` stays, as the one named exception | plan-project and add read it to pick the skeleton's screens; renaming it needs an upgrade step |
| Restore | Re-verification offers three paths: supersede, reword, or reverify | `capture-requirements <TOR-ID>` also offers **Restore the verified text** (same ID, no record); `check`'s branch-scoped A accepts a requirement returned to its first-merged text | When the unrecorded edit is the mistake, supersede and reword could only ratify it |
| discover `Pending` | Changelog rows are Added / Modified / Removed | Adds a `Pending` change type (an undecided change → "Record as pending") and `Wording only:` Modified rows (→ reword candidates) | An undecided change otherwise never reaches capture-requirements' pending option |
| `mark` | wrapup, reverify, and quick-fix write `verified:` / `unverified:` / `reverified:` and append to `requirements:` | Adds `mark <epic> [--append TOR…] [--pass TOR…] [--fail TOR REASON] [--reverified]`, the only writer of those lines; refuses IDs that are not live, not owned, or waived, and never touches `status:` | Hand-edited sidecars are a strict-parse data error waiting to happen; fingerprints are never typed by a prompt |
| In-epic amend | start-epic "Amend" runs the decision test and writes the record | In-epic amendment is always a **supersede**; a reword-eligible (wording-only) edit is implemented as written and suggested for a later `capture-requirements <TOR>` | A wording-only edit changes nothing the epic builds, and a reword's test evidence cannot point at uncommitted mid-epic work |
| quick-fix reword | The record ships "in the same commit as the code" | A quick-fix **reword** is a second commit on the same `hotfix/` branch, after the code commit, so `[evidence] commit` names the tree the citing tests ran on. A supersede stays one commit | A commit cannot cite its own SHA |
| `uphold` | A `pending` record is resolved only by a reword, supersede, or retire that refs it | A fifth kind, `uphold`, refs the open pending record and closes it with no text change (`keywords` and the current fingerprint required; `validate` checks a pending record in `refs` names the same TOR; `search` finds it). capture-requirements 3C (Disputed: Uphold / Change it / Retire / Renew) and wrapup's overdue question offer it | When the owner decides a disputed requirement was right, nothing could close the dispute; it turned overdue and blocked every epic touching it |
| Wrapup pending line | Record as pending writes a `pending` record; `unverified:` is only for a reverify FAIL | A TOR recorded as pending at wrapup also gets an `unverified:` line (`RECORDED AS PENDING — CR-…`) from Step 2.2's `mark` | With neither line, a Complete epic's failed requirement reads "Verified (legacy)" under its dispute, and reverify's default scope skips it |
| Reverify A stop | Reverify re-checks every stale requirement | Reverify stops on a scoped requirement with an A finding (edited without a record) and sends it to `capture-requirements <TOR>`; `check`'s D message says the same when A is present | A reverify PASS would ratify an unrecorded meaning change |
| Wrapup branch freshness | (none) | When the base gained Change Records the branch lacks, wrapup merges the base into the branch and re-runs its health check in the same session (nothing read before it is the implementer's handoff) | Dispute ages and record lookups read the branch's own files |
| quick-fix reverify | quick-fix "runs the reverify step for that successor on the same branch" | A fresh `general-purpose` sub-agent (never a fork) verifies the successor blind; the result and the `requirements:` append are one `mark` call. FAIL offers fix again / ship marked unverified / Stop | Keeps verification independent of the implementing session, and a successor never sits in a Complete epic with neither line (it would read as Verified) |
| Step 0002 commits | Migration is one commit per phase; the addendum says one commit per step | Step 0002 commits Phases 4–7 itself (`… — change records`, `— strip notes and titles`, `— seed verified fingerprints`, `— normalize sidecar keys`); the runner commits Phase 8 (`migration_source` stripped) with the stamp. Phases 1–3 and the report write no files | Keeps each phase reviewable and revertable while the runner keeps "the stamp moves in the step's own commit" |
| `migrate` | Migration phases are prompt work over `fingerprint` and `seed` | Adds `migrate scan` (prerequisites + prose inventory + unrecorded edits/removals + seedable rows; the step's detect), `migrate records --plan <json>` (writes the owner-approved classification), `migrate strip`, `migrate sidecars`, `migrate finish`; plus `fingerprint --against FILE` and `check --by-epic` | Record files, fingerprints, verbatim texts, and table rewrites are mechanics a prompt gets wrong at Project C's scale (145 notes); the classification stays the agent's, approved at one gate |
| Historical rewords | One migration record per historical event, `refs` = commit SHA from `git log -S` | Every unrecorded trunk edit of a live requirement (finding A) becomes a `reword` with `result = "historical"`, one record per trunk commit, its `from`/`to` chained along first-parent history, whether or not a note explains it; a note only supplies title and reason. `refs` name the edit's commit and the note's | An edit nobody noted would otherwise stay an A finding forever; chaining by commit makes the A check pass exactly |
| Migration record dates | (unstated) | Migration records are dated the upgrade day; a `pending` record's dispute clock starts then, not at the note's commit | A years-old "pending change-control" note would otherwise block every epic touching it the moment the upgrade merges |
| Kept prose | Feature files allow no notes or markers | Comment-line prose is removed; a marker line in Markdown **after** the first Scenario (outside the Gherkin fence) is left in place and reported `kept` | Such lines are inside the last Scenario's fingerprint body; removing them would make a verified requirement read Changed since verified |
| Sidecar keys on Complete epics | Ad hoc keys become records | On a Complete sidecar the only lines the step removes are the ad hoc keys (`superseded_by`, `supersession_note`, `revised`, `revision-reason`); `status:` and every other line stay, and `verified:` lines are only added | Complete sidecars are history; the keys' content now lives in the records |
| Historical D message | (none) | `states` adds `historical_records` to a Changed-since-verified row whose edit only a historical reword explains; `check`'s D message then names both routes (meaning changed → `capture-requirements <TOR>`; else reverify), and status's panel and nudge put the decision first | A reverify would otherwise ratify a pre-3.0 meaning change the migration could record only as a reword |
| Duplicate sidecar keys | (none) | The sidecar parser rejects a key that appears twice (`owner:` twice → data error naming both lines), so `check`, `states`, and step 0002's prerequisites stop on it | A clean git merge of an in-flight branch after step 0001 can add a second `owner:` line silently; step 0001 is frozen, so the parser catches it |
| Requirements README | Migration rewrites `docs/requirements/README.md` | Step 0002 replaces the `## Conventions` section only when the file is still the 2.1 setup stub, writes one when there is none, and leaves a user-written README alone (named in the report) | An upgrade step never overwrites prose a user wrote |
| Non-ID `requirements:` entry | A Complete epic's `requirements:` line is append-only | A non-ID entry `check` reports as finding C (e.g. `TOR-24 set`) is corrected or deleted by hand on a `docs/` branch; quick-fix's amendment path and reverify stop before branching while one exists | `mark` refuses a sidecar it cannot parse strictly, so the epic could never record a verdict again; step 0002's report already prescribed the hand fix |
| Kept banner | (as `Kept prose`) | A section banner's first text line is kept (reported `kept`) even when it holds a marker word; only later marker lines in a banner are stripped | The first line names the section; removing it moves the requirements below into another section (Summit live UAT) |
| Implemented owner | Retire and supersede act on the live set; open epics are swapped, Complete ones keep the old ID | capture-requirements refuses a retire or supersede that would leave an **Implemented** epic with no live anchor ("wrap it up first") | wrapup cannot complete an epic with nothing left to verify |
| `Fixes:` trailer | (none) | A quick-fix for a Verification failed requirement adds `Fixes: <TOR>` to its commit body; status then points that requirement at reverify | Nothing else records that the code was fixed before the reverify |

## Plan checklist

| # | Plan | Done when | State |
|---|---|---|---|
| 1 | **Foundation** — `scripts/tor-lifecycle`, `scripts/tor_lifecycle.py` (`fingerprint`, `titles`, `version`, loaders), `tests/peak-workflow/`, plugin `CLAUDE.md`, this doc | `fingerprint`/`titles`/loaders pass the tests on 3.11 + 3.14 | ✅ Done |
| 2 | **Script analysis** — `check` A–F (`--base`, `--json`, own-branch marking), `sweep`, `seed`, `states --json` (incl. Q17); process pool for files, thread pool for git | Every row of the decision-test, derived-state, and finding A–F tables has a fixture test; the scale fixture meets Q14 | ✅ Done |
| 3 | **Format & cleanup** — `upgrade` runner, step `0001-epic-provenance`, format guard in every skill, delete the two migrate skills, new-project routes on the stamp, setup writes the stamp + `[lifecycle]` + Python probe + requirements README stub, Q15 bundle | Format-0 fixture upgrades to 1 idempotently; dry-run of new-project → setup → upgrade | ✅ Done |
| 4 | **Authoring** — capture-requirements 3B.2 five options, TOR-ID argument mode, re-litigation grep, Step 4 `check --base`, Haiku brief rewrite; FEATURE/TRACING templates; discover Removed/Modified rows; mockup (Q22); triage routes + `check` | Dry-run: brownfield supersede, retire, pending, reword-with-evidence on a docs/ branch | ✅ Done |
| 5 | **Planning & dashboards** — plan-project/add (ID-only anchors, live-set delta, removal epics with `retires:`); status (Requirements Health, live denominator, degraded mode, overdue-Disputed action); pause; refresh-docs | Dry-run on a fixture holding every derived state | ✅ Done |
| 6 | **Execution** — start-epic (`check` + nudge, 6.2 successor/drop/stop, 6.3 removed, `sweep` retarget, in-epic amendment, `titles`, Q16 stop); PLAN_TEMPLATE; quick-fix amendment path | Dry-run: in-epic amend, quick-fix supersede | ✅ Done |
| 7 | **wrapup-epic** — 1.1 `check --base` + own-branch blocking; Disputed block; 5.2/5.3; 1.4b Amend / Record as pending; removal-epic gate; 2.2 `verified:`; `reverify` mode; HANDOFF/PR_BODY templates | Dry-run: wrapup amend, pending, removal epic, reverify PASS/FAIL | ✅ Done |
| 7b | **uphold** — fifth record kind closing a dispute when the requirement stands; capture-requirements 3C, wrapup overdue question, status/triage/quick-fix wording | Dry-run: capture-requirements uphold, wrapup uphold, status | ✅ Done |
| 8 | **Step 0002 lifecycle migration** (#20 Migration 1–8, one commit each; strips `migration_source`) + contributor kit (Q9) | A "Project A-like" fixture upgrades with identical fingerprints before/after the strip; seed surfaces exactly the planted stale set | ✅ Done |
| 9 | **Release gate** — README / plugin CLAUDE.md / CHANGELOG (BREAKING, /upgrade), 2-pass full dry-run, live UAT, draft PR → develop, contributor request, release | All four Q10 gates pass | ◐ In progress (gate 1 ✅) |

## Plan notes

### Plan 1 — Foundation

- `tor_lifecycle.py` commands: `fingerprint [files…] [--rev SHA]`, `titles <ids>`, `version`.
  Global `--root` (default: the enclosing git repository). Library API for later plans:
  `parse_scenarios`, `fingerprint_text`, `live_requirements`, `load_stamp`, `load_records`,
  `validate_record`, `parse_sidecar`, `load_sidecars`, `describe_gone`, `PLUGIN_FORMAT`.
- Lines are split on newlines only (`\n`, `\r\n`, `\r`), matching the #20 sketch's file iteration;
  `test_fingerprint.py` embeds the sketch verbatim and cross-checks it on a multi-file fixture.
- The process pool starts at `POOL_MIN_FILES = 4` files; fewer are parsed in-process.
  800 TORs in 40 files fingerprint in ~0.25s through the wrapper.
- Record schema choices beyond #20's examples: `refs` is required but may be empty; `equivalence`
  is required for reword; `[evidence] tests` may be omitted only when `result = "historical"`;
  record `date` must equal the file-name date and `id` the file-name suffix; unknown keys are
  ignored (so step 0002 can carry and later strip `migration_source`).
- Sidecar parser: `verified:` / `unverified:` are indented blocks (`  TOR-…: value`); `waived:`
  accepts `→` or `->`; unknown keys are kept in `extra`. Any malformed line is a data error.
- `titles` exits 1 when an ID is unknown (neither live nor in a supersede/retire record); records
  are loaded only when a non-live ID is asked about.

### Plan 2 — Script analysis

- New commands: `check [--base REF] [--json]`, `states [--json]`, `sweep [ids] [--json]`,
  `seed [--write] [--json]`. `check` and `states` take a hidden `--today YYYY-MM-DD` for tests.
- **Trunk.** "Merged" means on the first-parent history of `--base`, else the first of `develop`,
  `main`, `master`, `HEAD` that exists. One `git log --first-parent -m` plus one
  `git cat-file --batch` read every feature-file version on that history.
- **A** compares each live ID with its text when it first appeared on the trunk; any reword chain
  explains it (`historical` included). IDs never on the trunk are edited freely.
- **Branch scope (`--base`).** Compares the working tree with `merge-base(base, HEAD)`. A/B on the
  branch must be covered by records whose files are new on the branch. C and E are own-branch when
  the (file, ID) citation is new; D when the branch changed the text. F is never own-branch.
  `blocking` = own-branch A, B, or C. Skills add the removal-epic E and overdue-Disputed blocks.
- **Scan scope.** Citations come from `git grep -w` over tracked and untracked (not ignored)
  files. Change Records, `session-handoffs/`, and `CHANGELOG*` are history and never scanned.
  E and `sweep` cover tests and source only: everything outside `docs/requirements/`,
  `docs/implementation-plan/`, and `docs/product-vision-planning/`.
- **C** also reports malformed `requirements:` entries in sidecars (e.g. `TOR-24 set`); sidecars
  load leniently for `check` and `states`.
- **F kinds:** `disputed`, `removal-missing` (retire `removal = "code"` with no epic `retires:` it),
  `open-epic-retired`, `multiple-records` (two removing records, or two open pendings, on one ID),
  `feature-number-reused`, `id-reused` (a removed ID is live again), `multi-owner` (the old TOR-split
  check; a waiver is not a second owner).
- **Disputed:** a `pending` record no other record refs. A renewal (new pending that refs it)
  restarts the clock. Overdue = age > threshold; `# Safety` is always overdue. The Safety section
  is read from banners: a comment line right after a `# ----` rule, or a bare `# Safety`.
- **States precedence:** Disputed (with `underlying_state`) > Verification failed > fingerprint
  comparison (Verified / Verified (reworded), `pass` evidence only / Changed since verified) >
  legacy > open-epic status. Owners exclude epics that waive the TOR; Q17 falls out because only
  live TORs get live states.
- **Seed:** the completion commit is the first commit whose diff adds `status: Complete` to the
  sidecar (full history, not first-parent). Only TORs without a `verified:` line are seeded,
  waived ones are skipped, and `--write` only adds lines (idempotent).
- **Scale fixture** (`test_scale.py`, built with `git fast-import`): 800 TORs, 60 Complete epics,
  400 commits, 16 edits carrying historical rewords, and 1 dangling citation. Result: 784 Verified,
  16 Changed since verified, 1 finding C. Timings on the dev Mac: fingerprint 0.27s, seed 1.10s,
  check 0.35s (0.34s with `--base`), states 0.28s, sweep 0.29s.
- No skill files changed, so there was no Q13 dry-run.

### Plan 3 — Format & cleanup

- New commands: `format` (`verdict: current|new|behind|ahead|not-peak-workflow`, then the user
  message; exit 0 only for current/new; 2 for a bad stamp), `format --init`, `format --set N`
  (forward only, keeps `[lifecycle]`), `provenance [--base] [--skip] [--write] [--json]`,
  `inflight [--base] <paths…>`. "Artifacts" = feature files, sidecars, specs, vision/ConOps;
  README stubs do not count.
- **Format Guard** is one block per skill (12 skills): `tor-lifecycle format`, exit 0 continues,
  anything else prints the message and stops. `status`/`triage` continue on `behind` with a banner
  (triage prints `/add` / `/quick-fix` instead of dispatching). discover/mockup/capture-requirements
  run it before their branch guards. `setup` and `new-project` read the verdict themselves.
- **Interim state:** `PLUGIN_FORMAT` is 2 but only step 0001 ships until Plan 8, so `/upgrade`
  reaches format 1 and says the build is incomplete; a format-1 project stays `behind`.
- **Step 0001** values: author and author date of the commit that added the spec (same-epic renames
  followed); plan branch = subject of the first-parent trunk merge that brought it in (`Merge
  branch '…'`, `Merge pull request #N from owner/…`, `Merge remote-tracking branch`), or the trunk
  name for a commit made on it; `—` otherwise. A `—` value is filled; real values never change.
- **Runner:** a step whose detect is already satisfied still gets a commit (the stamp alone). An
  in-flight skip does not hold the stamp back. Every run also re-detects already-applied steps
  that support `--skip` (**catch-up**, branch `docs/upgrade-catch-up-N`, commit suffix
  `(catch-up)`, no restamp), so skipped epics are upgraded once they merge. A run that commits
  nothing deletes its branch. Steps list **Rewrites** as globs, so `inflight` ignores branches that
  touch only other planning files.
- **Format guard reads before the tree check:** `upgrade` reports `current` even on a dirty tree.
  A stamp created by `format --set` gets the default `[lifecycle]` table.
- **discover before setup:** on `verdict: new`, discover runs `format --init` itself and commits
  the stamp on its `docs/` branch; otherwise the vision would make a brand-new project "format 0".
- **`format` knows the shipped steps:** behind but already at the highest shipped step prints
  `upgradable: no` and a "later build" message instead of "run /upgrade", so no command loops the
  user back to an upgrade that can do nothing. `inflight` never lists `docs/upgrade-*` branches.
- **Q13 dry-run:** 3 passes on fixtures (greenfield; format 0 with in-flight epic, new-epic, and
  phase-index branches; discover before setup; empty repo). Pass 1: 11 findings (2 Critical:
  skipped epics never caught up; discover-before-setup trap). Pass 2: 11 (1 Critical: stale merged
  catch-up branch reused). Pass 3: 0 Critical, 5 message fixes. All fixed except one pre-existing
  PLAN_TEMPLATE wording note (its proposed fix used `git log --author`, which start-epic forbids).
- **Q15 done:** guards, integer/decimal IDs and all-digit regeneration, `feat/epic-N` (→ ask which
  branch), provenance/owner "absent" fallbacks (incl. PLAN_TEMPLATE's pre-2.1 owner clause),
  status multi-owner → `check` F. **Left for Plans 6/7 (Q16):** the pre-v1.0 "no Requirements
  Anchors" grandfather clauses in start-epic and wrapup-epic.
- README: migration section → "Upgrading an existing project"; root README drops the
  epic-workflow migration pointer (removing the plugin itself stays a separate release, Q19a).

### Plan 4 — Authoring

- New commands: `validate [files]`, `search <terms> [--json]`, `text <TOR> [--rev REF | --verified]
  [--json]` (deviation-log row). `check`'s branch-scoped A now accepts a requirement restored to
  its text as first merged (undoing an unrecorded edit needs no record); E's heading reads
  "Retired or superseded ID still cited".
- **capture-requirements** gains a "Lifecycle Rules" section stated once (L1 where the rule starts,
  L2 fingerprints — plain-words summary, `tor_lifecycle.py` the only implementation, L3 decision
  test, L4 re-litigation, L5 the five choices with a ≤4-option menu per input type). Answers are
  applied after the 3B.3b gate. Step 4.2 runs `validate` + `check --base`; findings tied to this
  run's records (E citations, `disputed`, `removal-missing`) are reported as follow-ups, not
  predating debt. Step 7.1 offers `/add` for unassigned successors and removal epics.
- **TOR-ID mode (3C)** cases: Changed since verified, Edited without a record, Disputed (resolve or
  renew), Requested change. Adds **Restore the verified text** (same ID, no record) — the dry-run
  showed supersede/reword alone could only ratify the unrecorded edit. Creates
  `docs/amend-<tor-id>` from the base on its own; rewrites vision/ConOps lines that state a
  replaced detail; never commits (the user commits and merges).
- `CHANGE_RECORD_TEMPLATE.md` holds one example per kind; `validate` is the schema's authority.
- **discover** adds a `Pending` change type (an undecided change → Record as pending) and
  `Wording only:` Modified rows (→ reword candidates). **triage** adds the `AMEND` verdict;
  "edited after verification" requests route AMEND (restore) when they match the verified text,
  else reverify first.
- **Interim state:** triage and capture-requirements name `/peak-workflow:wrapup-epic <id>
  reverify` (Plan 7) and quick-fix's amendment path (Plan 6) before those exist.
- **For Plan 5:** plan-project must propose removal epics for `removal = "code"` records (Step 7.1
  offers "Leave it for plan-project"), and capture-requirements Step 6 archives the changelog
  before plan-project reads its Priority Signal. Fix one of the two sides.
- Left alone (pre-existing, not lifecycle): mockup's design-canvas wording, the AlertDialog
  "Cancel" label when the action is itself a cancel, the greenfield row-level Delete rule in
  brownfield, and a second ConOps version bump on one branch. README triage row (Plan 9).
- **Q13 dry-run:** synthetic orders web app (`tests/peak-workflow/dryrun/plan4_orders.py`: format 2, two Complete epics, a
  verified TOR edited in place on develop). Two agents per pass — (A) triage → AMEND →
  TOR-ID supersede with open-epic swap; triage → AMEND → restore; TOR-ID supersede of a stale
  TOR with the `/add` offer; (B) discover → mockup (`Removed` screen) → capture-requirements:
  retire (whole file, `removal = "code"`), supersede, pending, reword with evidence. Pass 1: 6
  Critical (no restore path, triage dead end, no `Pending` changelog row, …). Pass 2: 1 Critical
  (restore left the code doing the edit while the TOR read Verified). Pass 3: 0 Critical, 13
  wording fixes, all applied. `check --base develop` had no own-branch findings in every run.

### Plan 5 — Planning & dashboards

- **No helper changes.** `states --json` and `check --json` already carried what the skills need
  (`removal_epics`, `dispute.overdue`/`safety`, `underlying_state`, `waived_to`, F
  `removal-missing`), so no deviation-log row. `test_dryrun_fixtures.py` pins the Plan 5 fixture
  (every derived state, letters A–F, the docs-branch successor and missing removal epic, `--behind`).
- **status** runs `states --json` + `check --json` once and computes nothing: coverage over
  `summary.live`, a Changed Since Verified panel per epic (Verification failed included; an A
  finding adds "capture-requirements first"), a Requirements Health panel (messages verbatim), the
  opening nudge, and overdue Disputed (Safety first) as the top action. Exit 2/3 prints the helper
  output and skips the requirement panels. Degraded mode puts the format fix first (upgrade or
  plugin update per `upgradable:`) and marks the rest "after the fix".
- **plan-project / add**: live set and ownership from `states` (unassigned = `Specified`, or
  Disputed over `Specified`; an epic that waives a TOR is not its owner). Two-column anchors.
  Removal epics: sidecar `retires: CR-…`, a `## Removal` section (retires / retired IDs / code from
  `sweep` / done-when), guard-only anchors; a requirement satisfied only by absent code is never an
  anchor on any epic and is listed as deferred. `/add removal epic for CR-…` (and plain-language
  removal requests matched on record `title`/`keywords`) stops cleanly for a missing, non-retire,
  `removal = "none"`, or already-planned record. Non-Not-Started epics are never edited. Planning
  PR body (team path) and summaries print titles from one `titles` run.
- **Carry-overs:** (a) plan-project Step 3C proposes the removal epics. (b) Fixed on the
  plan-project side: 3B.1 reads the changelog the branch archived (`.processed` absent at the
  merge base); capture-requirements Step 6 is unchanged apart from a pointer.
- **pause**: a removal epic's empty anchors no longer read as "done"; the handoff records remaining
  `sweep` citations. **refresh-docs**: nothing in #20 or this doc applies (it reads no TORs or
  titles); left alone.
- **For Plan 6/7 (interim):** start-epic 6.3 and wrapup 5.3 still compare anchor titles, which new
  specs no longer carry — both are deleted in those plans. **For Plan 8:** step 0002 strips the
  title column from every non-Complete spec (Not Started, In Progress, Paused, Implemented), not
  only Not Started / In Progress.
- **`CLAUDE.md` document links (owner decision):** setup's Peak Workflow section now links the
  vision and ConOps too; plan-project Step 7 stays as the fallback for projects set up earlier,
  adds only a missing link to whichever section holds the others, and never a second section. The
  plugin rule now reads "No upgrade step edits the user's `CLAUDE.md`" and names the skills that
  may add to it.
- **Left alone** (pre-existing): pause commits on whatever branch is checked
  out; refresh-docs has no Key Files fallback and does not mark decisions about retired behavior.
  Text-mode `states` omits `removal_epics`; check F's removal-missing message names only `/add`.
- **Q13 dry-run:** `tests/peak-workflow/dryrun/plan5_states.py` (orders app grown to every derived
  state and findings A–F; `docs/q4-requirements` with an unassigned successor, a `removal = "code"`
  retire with no epic, a guard TOR, a "shall remove" TOR, and an archived changelog; `--behind`).
  Agents ran the real helper. Pass 1 (plan-project; /add removal epic; status current + behind,
  pause, refresh-docs): 1 Critical (brownfield screen trace could never pass), 8 UX. Pass 2: 2
  Critical in plan-project (3B.2 consumed the guard rows before 3C; Waived trace forced editing a
  Complete epic). Pass 3: plan-project 0 Critical; /add 1 Critical (a plain-language request after
  the removal epic existed could anchor the "shall remove" TOR). Pass 4 (/add, four invocations):
  0 Critical. UX findings from every pass applied.

### Plan 6 — Execution

- **New helper command `mark`** (deviation-log row, `test_mark.py`). wrapup Step 2.2, reverify,
  and quick-fix call it; Plan 7 uses it as is.
- **start-epic** opens with a Requirements Health block (`states`, `check --base`, `sweep` once
  each; the nudge with Safety-overdue first; never blocks). 4a: Q16 stop (removal epics exempt);
  anchors are `TOR ID | Feature File`, titles from one `titles` run. Item 6: live anchors
  (Disputed / multi-owner warnings), superseded → Replace (chain followed; a successor another
  epic owns is not taken) / Drop / Stop, retired → Drop / Stop, unknown → merge-the-docs-branch
  stop or Drop. Questions come after Step 2.5's Start it; edits apply in the plan's opening step
  2 on the feature branch, only for Not Started / In Progress / Paused (Implemented → wrapup).
  `sweep` rows whose successor is an anchor become retarget steps. 6.3 and the grandfather clause
  are gone.
- **PLAN_TEMPLATE**: `<anchor-decisions>` / `<retired-IDs>` placeholders; a Removal middle step
  (symbols, whole test functions, imports; done = `sweep` exits 0); the **Amendment gate** next
  to the Deferral gate (supersede only, `approved_via = "epic-branch"`, refs the open pending
  when Disputed, tracing swap, `check --base` clean, Spec Deviations row citing the record);
  self-assessment `sweep <IDs>` check; commit `Amends:` / `Anchors:` / `Removes:` lines;
  `$ARGUMENTS` → `<id>` throughout; Mark as Implemented sets `handoff:`.
- **quick-fix**: Step 1 item 5 (requirements in play: Safety-Disputed stop, In Progress owner +
  `inflight` warning), item 6 (amendment eligibility: never Safety; owner Complete or none;
  Implemented → wrapup; open epic → capture-requirements; ~2 hours; always asks). Plan items 2a
  (supersede), 2b (blind sub-agent reverify + one `mark --append --pass|--fail`), 5 (`check
  --base`, blocking A/B/C with Restore / Amend / Stop — the A/B Amend is the one permitted plan
  insertion), 5a (reword commit with evidence). PR body "Requirement changes"; reverify command
  in next steps.
- Cross-skill rules are referenced as `${CLAUDE_PLUGIN_ROOT}/skills/capture-requirements/…`
  (L3–L5, the record template); start-epic's template path is now `${CLAUDE_PLUGIN_ROOT}`-based.
- **Left alone** (pre-existing): "E2E last" with a one-entry Test directories line; "most recent
  handoff" ties; author instructions copied verbatim into plans; `validate` does not cross-check a
  supersede record's `fingerprint` against its `text`.
- **Q13 dry-run:** `tests/peak-workflow/dryrun/plan6_execution.py` (Plan 5 develop + jRfd09 with a
  superseded anchor and a prototype test citing it, lDue11, mNoA12 with no anchors) and
  `plan7_wrapup.py` for Plan 7. Pass 1 (3 agents: start-epic Replace + Q16; in-epic amend +
  removal epic; quick-fix supersede + own-branch A): 5 Critical — bare `feature_file` compared to
  a path, removal step named files not symbols and missed imports, no ID-generation command, the
  A-block Amend offered where eligibility then refused it, a successor reading Verified between
  `--append` and the verdict. All fixed. Pass 2 (start-epic: Replace, amend, removal, Q16;
  quick-fix: supersede with a sub-agent PASS, reword as a second commit, own-branch A restored):
  0 Critical; UX/Minor fixes applied (record `equivalence`, the `Closes` trailer's home, a fix
  that changes an in-progress epic's requirement stops).

### Plan 7 — wrapup-epic

- **Helper:** `mark --pass` / `--append` take several IDs (`extend`); `check`'s D message points at
  `capture-requirements <TOR>` when the same TOR has an A finding; F `disputed` says "failed
  verification" / "still marked done" / nothing, by the owning Complete epic's lines. No new command.
- **wrapup-epic:** `<id>` = first word of `$ARGUMENTS`; Session Guard also refuses after quick-fix.
  Step 1.1 item 3a (Requirements Health): stop when the base has records the branch lacks;
  blocking own-branch A/B/C (Restore / Amend / Stop, C fix); Disputed touched (sidecar or an
  *added* test line): Safety stops with no renewal, overdue → resolve on the branch / renew
  (fields spelled out) / Stop, under threshold → listed. 4a: Q16 stop (removal epics exempt),
  two-column anchors, titles from one `titles` run. Item 5: superseded / retired / unknown anchor
  = FAIL whose Fix now replaces, drops, or corrects (no Defer). 1.3: Tests gate named; Removal gate
  (sweep exit 0, symbols gone except absence tests, guards pass). 1.4b: fourth option "The
  requirement may be wrong, not the code" → Amend (supersede, `approved_via = "wrapup"`,
  `AMENDED AT WRAPUP`) / Record as pending / Back; never for Safety or an anchor gap. Verdict rule
  admits pending records. Report: Counts with amended/pending, Requirement Changes (committed +
  untracked records), Removal block, title column. 2.2: one `mark` (`--pass` PASS, `--fail`
  pending). Pre-ship `check --base` re-run. 3.3 never picks among several ready epics.
- **Reverify mode** (R1–R6): Complete only; `requirements: —` refused (Q16); scope = named IDs or
  owned Changed since verified / Verification failed (by `underlying_state`); stops on an A
  finding; `hotfix/verify-epic-<id>-<short-name>` (an unmerged earlier one stops); Step 1.2 + Tests
  gate (+ UX Baseline on named screens); one `mark … --reverified`; dated handoff (appended on a
  same-day re-run, Was column keeps the old line); ships like quick-fix.
- **Templates:** HANDOFF / PR_BODY gain Requirement Changes, Removal, the title column, amended /
  pending counts and legend. Template paths are `${CLAUDE_PLUGIN_ROOT}`-based.
- **Interim names made real:** every `wrapup-epic <id> reverify` and quick-fix amendment-path
  mention (triage, capture-requirements, status, plan-project, start-epic, quick-fix) matches what
  shipped. triage now routes an Implemented epic's requirement change to wrapup (quick-fix's path
  is Complete-only); status adds the "decide first" caveat to any A-flagged requirement in the
  re-check panel, not only Changed since verified ones.
- **Left alone** (pre-existing): Step 1.2's verdict for a test that mirrors the Then but skips the
  Given/When; "UNDISCLOSED DEFERRAL" for a claimed PASS that was never deferred; `check` E
  `own_branch` on a rewritten line; `validate` does not enforce that a second pending on a TOR refs
  the open one (`check` F `multiple-records` reports it).
- **Q13 dry-run:** `tests/peak-workflow/dryrun/plan7_wrapup.py` (Plan 6 + nGft13, qDsc15, rPrv16,
  hRmXls7 Implemented on feature branches; a historical-evidence reword for an honest reverify
  PASS; Page010 with A + D). Pass 1 (3 agents): 5 Critical — `mark --pass A B` exit 2, Requirement
  Changes missed uncommitted records, "code gone" grep hit absence tests, reverify could ratify an
  unrecorded edit, status lost the A caveat after a FAIL. Pass 2 (3 agents: amend, pending,
  renew, Safety stop, removal FAIL→PASS, reverify PASS+FAIL in one run, A stop, status): 1
  Critical (a pending TOR read legacy-verified) — fixed, checked by hand. Pass 3 (record as
  pending → status → code fixed → reverify PASS → status): every step worked as written; status
  now sends a Disputed failed requirement to capture-requirements before quick-fix, and the
  reverified handoff says a PASS does not resolve a dispute.
- **Open question → Plan 7b:** nothing closed a dispute when the owner decided the requirement
  stands. Owner chose a fifth record kind, `uphold`, done before Plan 8.

### Plan 7b — uphold

- **Helper:** `KINDS` gains `uphold` (`keywords`, `[[changes]]` `tor` / `feature_file` /
  `fingerprint`, and a `CR-…` in `refs`). `validate` (multi-file) checks that a pending record in
  `refs` names each upheld TOR. `open_pending` needed no change — any record that refs a pending
  record resolves it. `search` includes upholds. Tests: `test_uphold.py`; the fixture builder's
  `record_data` knows the kind.
- **Skills:** capture-requirements L5 choice 6 (Uphold; Disputed only; verifies nothing — the
  underlying state then applies), 3C Disputed question (Uphold / Change it / Retire / Renew, Renew
  dropped for Safety), L4 names upheld decisions; CHANGE_RECORD_TEMPLATE uphold example and
  `approved_via` per skill. wrapup 1.1 item 3a overdue: Uphold / Amend / Renew / Stop; reverify R6
  points at Uphold. status, triage, quick-fix name it where they say how to settle a dispute.
- `search` marks a pending record a later record refs as `pending (closed by CR-…)` (JSON
  `closed_by`), so the re-litigation check never sends the user to reopen a settled dispute.
- wrapup's stale-branch stop now merges the base and re-runs item 3a in the same session (nothing
  read before it is the implementer's handoff).
- **Q13 dry-run:** Plan 7 fixture; capture-requirements `TOR-02-Cncl001` → Uphold (docs branch,
  merged), wrapup `qDsc15` → overdue Disc001 → Uphold, status. Both records `validate` ok; both
  TORs back to Verified, F `disputed` cleared. 0 Critical; UX/Minor fixed (reason prompt, closed
  pending in `search`, Disputed + D/A cases get Uphold, empty `docs/amend-*` branch removed on a
  lookup stop).

### Plan 8 — Step 0002 lifecycle migration + contributor kit

- **Step `0002-requirements-lifecycle.md`** maps #20 Migration 1–8 onto the runner: Detect =
  `migrate scan` (exit 2 = a prerequisite failed: invalid tracing JSON, a duplicated Scenario ID,
  an unreadable sidecar or record); Phase 2 saves `fingerprint` to `.git/peak-workflow-0002/`;
  Phase 4 is the one owner gate (Rationale / History / Supersede / Retire / Pending / Drop per
  prose item and ad hoc key, written as `plan.json`, applied by `migrate records`); Phase 5
  `migrate strip` + `fingerprint --against` (survivors identical, removals recorded) + README;
  Phase 6 `seed --write`; Phase 7 `migrate sidecars`; Phase 8 `migrate finish` (committed by the
  runner with the stamp); Report = `check --by-epic` in the final message. One commit per phase
  (deviation row). Resuming skips Phases 3–4 once `change records` is committed.
- **Helper** (deviation rows `migrate`, historical rewords, kept prose, historical D message,
  duplicate keys): `migrate scan|records|strip|sidecars|finish`, `fingerprint --against`,
  `check --by-epic`, `states` `historical_records`, `F. Housekeeping and disputes` heading.
  Prose = every comment line in the Gherkin except rules, banners, `# Verification:`, the
  reference-screen note, a bare `# Safety`, doc-string content, and Markdown titles before
  `Feature:`; marker lines in Markdown before the first Scenario are prose too. `strip` refuses any
  change to a fingerprint or a section. Records are validated before anything is written.
- **Format 2 reached:** `PLUGIN_FORMAT` = shipped steps = 2. The interim `upgradable:` line and
  every "later build" message (format, upgrade, status, new-project) are gone; a test holds the
  shipped steps equal to `PLUGIN_FORMAT`.
- **Runner:** steps may commit per phase (**Commits** line) and add a **Report**; a resume check
  finds an unmerged `docs/upgrade-*` branch before planning; the plan, summary, and Leave text name
  the base's format; Skip is offered only when the in-flight paths name epics and a step supports
  it; requirements branches in flight are told they will need `capture-requirements`; a catch-up
  whose epics are all still in flight stops early.
- **Fixtures/tests:** `dryrun/plan8_project_a.py` (importable `build()` + `classification()`),
  pinned in `test_dryrun_fixtures.py`; `test_migrate.py` (scanner, tables, flags, the format 0 → 2
  upgrade twice); `test_acceptance.py`; scale fixture adds `migrate scan` before and after seed
  (0.55s) and `check --by-epic` (0.37s).
- **Contributor kit:** `docs/uat/lifecycle-acceptance.md`; `tests/peak-workflow/acceptance/run.py`
  `baseline` (a scratch clone: inventory, then seed to preview the stale set) and `after` (format,
  re-run no-op, fingerprints vs the pre-upgrade commit, validate, records by kind, states, check,
  timings). Output is IDs, counts, letters, timings; a redaction check refuses to print (exit 4)
  when any title, step, note, paraphrase, or record text would appear.
- **Done-when on the fixture:** fingerprints identical for the 13 survivors (Old0001 and Imp0001
  removed with records); `seed` → exactly {TOR-02-Wrd0001} Changed since verified (TOR-01-Pre0001,
  edited before verification, stays Verified); `check` = C (`TOR-24 set`, the only C) + D (Wrd0001)
  + F (`disputed`, the planted pending note); A = B = E = 0; a re-run is a no-op.
- **Q13 dry-run** on `plan8_project_a.py` copies, agents running the real helper. Pass 1 (2
  agents: new-project → upgrade → re-run → status; in-flight epic + stop/resume + start-epic
  guard + constraint checks 4a–4e, all passing): 3 Critical — D message prescribed reverify for a
  pre-3.0 meaning change, an ambiguous `docs/upgrade-format-<target>` broke resume, and the fixture
  lacked phase indexes. Pass 2 (Change-some-rows to `removal = "code"`, status, triage AMEND;
  resume from develop + in-flight requirements branch + redaction check — no leak): 2 Critical —
  capture-requirements 3C asked 5 options for an edited, disputed requirement, and TOR-ID mode hit
  greenfield stops. Pass 3 (amend with supersede, catch-up after the epic merged; resume + dispute
  carried to a successor): 1 Critical — a clean merge after "Rewrite everything anyway" left two
  `owner:` lines unnoticed (now a parser error). Pass 4 (that path end to end, status, uphold back
  to Verified): **0 Critical**; its UX fixes applied (which `owner:` line to delete, a status line
  for a non-overdue dispute, TOR-ID checklist scope).
- **Also fixed while dry-running** (outside step 0002): capture-requirements TOR-ID mode skips the
  greenfield context stops and cleans up its branch; 3C with an open pending on an edited
  requirement drops Uphold/Record as pending (four options), asks whether a supersede or reword
  settles the dispute and carries it to the successor when not, and cites `historical_records`;
  L4 ignores the amended requirement's own pending hit; template paths are
  `${CLAUDE_PLUGIN_ROOT}`-based (capture-requirements, mockup). status: historical caveat slot,
  nudge falls back to the oldest Disputed, an ownerless In Progress epic with a branch says
  "coordinate". new-project: exit 1 is a verdict, not an error.
- **Left alone:** a supersede/retire record's `text` keeps the 2.1 note lines (verbatim, as #20
  says); retire records carry `traced_to`, supersedes do not (schema); `migration_source` is
  removed from records committed earlier on the same unmerged branch; capture-requirements TOR-ID
  mode still leaves committing to the user (no commit-message convention); a superseded ID's
  successor shows only as Specified; step 0001 inserts `owner: —` after `status:` (a frozen step,
  so the duplicate-key parse error covers the merge case); the runner's in-flight warning about a
  duplicated `owner:` stays generic.

### Plan 9 — Release gate

**Q10 gates**

| # | Gate | State |
|---|---|---|
| 1 | Unit + fixture tests green on 3.11 and 3.14 | ✅ 223 tests OK on both (after pass 1 fixes) |
| 2 | Two clean full dry-run passes incl. lifecycle scenarios | ✅ passes 9 and 10 clean (0 Critical, 8 agents). Criticals per pass 1–8: 4, 2, 1, 1, 3, 0, 1, 2 — all fixed |
| 3 | Live UAT upgrade of the maintainer's 2.x project | ✅ Summit (1.5.0-era, format 0, 6 Complete epics, 33 TORs) with two planted merges. First run stopped at 2.6 (strip refused a one-line marker banner; Plan branch `—` for the skills' own merge subjects) — both fixed (`e83a681`). Re-run on `01827af`: 0.3–6.2 all ✅; 33/33 fingerprints identical; exactly TOR-03-s6tFG4V Changed since verified, TOR-02-K6frDEV Disputed, A = B = C = 0; supersede, reverify PASS, uphold all clean |
| 4 | Contributor report: Project A reproduced (429 Verified / 16 Changed since verified / 1 C), B and C upgrade cleanly | ☐ waits on the contributor |

- **Docs:** plugin README gains Prerequisites (Python 3.11+), a Requirements lifecycle section
  (five record kinds, where amendments happen, fingerprints, reverify, findings A–F), the 2.1 →
  3.0 upgrade walkthrough, the triage AMEND / TOR-ID / reverify rows, and drops "immutable" and
  "quick-fixes never change requirements"; spec example has no title column; sidecar example
  shows `verified:`. Root README: upgrade pointer. Plugin CLAUDE.md: sidecar lifecycle lines,
  Change Records, derived states. Every skill, helper command, and path the docs name was checked
  by script.
- **CHANGELOG:** BREAKING bullets (must run `/upgrade`, Python 3.11+, titles gone, deleted
  migrate skills); a Fixed section; every bullet ≤ 50 words.
- **Dry-run fixtures:** `dryrun/plan9_release.py` `greenfield | brownfield | upgraded` (the last is
  the Plan 8 fixture taken through steps 0001 + 0002 and merged, with a gated CLAUDE.md,
  `unittest`-discoverable tests, `.gitignore`, and architecture stubs).
- **Pass 1** (4 agents: greenfield planning; start/wrapup/pause/status/refresh-docs/triage/
  quick-fix/add; brownfield upgrade + supersede/retire/pending/uphold; reverify PASS/FAIL, removal
  epic, quick-fix reword + supersede). 4 Critical: the helper gave the last Scenario before a
  banner the next banner's section (a requirement above `# Safety` read as Safety); start-epic's
  nudge disagreed with status on a pre-3.0 edit; `mark` refused a sidecar with `TOR-24 set`, so
  quick-fix and reverify died mid-run; the rules contradicted each other on fixing that line
  (deviation row). All fixed with a test for the parser. UX/Minor applied: capture-requirements
  3C Removed/Pending routing, settle question after Change it, records-only merge path, Haiku
  skipped with no new IDs; Release Protocol template push order and headings; plan-project solo
  push, `.gitkeep`, nested fence, stub label; pause branch check; quick-fix pull; start-epic
  `<id>` = first word; refresh-docs heading; `removal-missing` names the full `/add` command.
- **Left alone** (pre-existing, not lifecycle): status reads In Progress sidecars from the working
  tree only; refresh-docs has no missing-target or branch rule; quick-fix has no
  bug-does-not-reproduce path; triage routes a single new requirement through discover; the
  test-only fault switch on CLIs without persistence; migrated supersede records carry no
  `traced_to` and keep 2.1 note lines in `text` (Plan 8 left alone; step 0002 frozen).
- **Pass 2** (same four scopes, new scenarios: wrapup of an Implemented epic with no branch,
  reverify with a malformed sidecar, Change some rows at the upgrade gate). 2 Critical: wrapup
  committed on `develop` when the work sat there (it now branches first); capture-requirements let
  a baseline TOR use a domain command the skeleton cannot satisfy. UX applied: nudge sends a
  failed requirement to quick-fix first; status reads open epics' sidecar from their branch;
  quick-fix pulls and reproduces; refresh-docs branches; `docs/amend-*` reuse; "Meaning unchanged
  or unsure — re-verify instead"; `Disclosed: n/a (no handoff)`; removal empties a test file.
- **Pass 3** (greenfield through the skeleton's wrapup; in-flight branch through upgrade +
  catch-up; regression → reverify FAIL → quick-fix → PASS). 1 Critical: retiring the only anchor
  of an Implemented epic stranded it — capture-requirements now refuses ("wrap it up first") and
  wrapup explains a pre-existing case. UX applied: nudge names the quick-fix argument; add stops
  when an open epic already covers the request; upgrade catch-up stop matches by epic; L4 skips
  the requirement's own lineage; baseline exit-code example proves code 2 only.
- **Left alone** (adds to the list above): wrapup has no NOT RUN path for a gate tool that cannot
  be installed; add writes planning files on the current branch; discover/plan-project offer Team
  PR with no remote; setup's logging default vs the toolchain row; no test-only clock switch.
- **Live UAT (gate 3).** Run by a separate Claude Code session on a `/tmp` clone of Summit with
  the plugin pinned to a frozen worktree. Run 1 found two helper bugs: `migrate scan` marked a
  one-line banner holding a marker word strippable though it names the section below it (strip
  then refused), and step 0001's `provenance` did not read the skills' own solo-merge subjects
  (`docs(plan): merge docs/<task> — …`), leaving Plan branch `—`. Fixed with tests. Run 2: every
  step ✅. Observations: the kept banner tripped capture-requirements' "no dated banner" check
  (now exempt); the Session Guard does not count a capture-requirements run on the same epic
  (left alone — reverify does not read implementer context).
- **Passes 4–5:** pass 4, 1 Critical (pause wrote on `develop`); pass 5, 3 Critical (add wrote
  on the current branch; status read only In Progress epics from their branches; quick-fix
  amendments left vision/ConOps stale and could close a dispute unrecorded). All fixed.
- **Pass 6: clean** (0 Critical, four agents incl. greenfield through a paused-and-resumed
  skeleton, Disputed supersede via quick-fix with renewal, removal epic, Change-some-rows Drop).
  UX applied: status suggests resuming a Paused epic and points a merged fix at reverify;
  PLAN_TEMPLATE TODO grep is case-sensitive; add's stop names the branch and its merge has `-m`;
  wrapup PASS question text; discover/3B.2 treat an open pending hit as a settle, not a
  re-proposal; upgrade Stop deletes its empty branch; Recovery Check reads the branch.
- **Pass 7:** 1 Critical — wrapup's Haiku doc refresh wrote a superseded ID into
  `design-notes.md`, leaving an E finding on `develop`; refresh-docs now cites the record and
  successor, and wrapup's pre-ship `check` fixes an own-branch E. UX applied: Amendment gate
  rewrites vision/ConOps lines and handles splits; `Fixes: <TOR>` trailer lets status point a
  merged fix at reverify; Safety Keep unchanged and Disputed → Change it wording; triage's
  current-text case; AMEND in the ceremony notes; Disclosed cell values in the templates.
- **Pass 8:** 2 Critical, both on a pre-3.0 edit: `states` listed a reword with passing evidence
  in `historical_records` (the D message then said "recorded without test evidence"), and
  quick-fix let a reword ratify an undecided pre-3.0 edit. Fixed with a test; reverify now
  confirms before a PASS on such a requirement. UX applied: Keep unchanged checks out the base
  before deleting its branch; capture-requirements Renew matches wrapup's (`(renewed)`, 3–6
  keywords); Restore commit subject; triage asks which text when a request could mean either,
  and routes new behavior on a stale requirement through HEAVY/AMEND; C message names the
  branch; `1 day old`.
- **Pass 9: clean** (0 Critical; regression of passes 7–8 plus upgrade Skip/resume/catch-up on
  F1 and Summit). UX applied: status's panel agrees with the nudge once a fix merged, strips the
  `RECORDED AS PENDING` prefix from the quick-fix argument, suggests housekeeping and a pending
  upgrade catch-up; capture-requirements Restore prints the reverify too, names the merge command
  and the expected E follow-ups; wrapup reviews the doc-refresh sub-agent's diff; discover's
  backlog promotion is an `Added` row.
- **Pass 10: clean** (0 Critical). Gate 2 met with passes 9 and 10. UX applied: standalone
  refresh-docs runs `check --base` before committing; "Meaning unchanged — re-verify instead"
  (no "or unsure", which L3 treats as a meaning change) with a warning when L3 found one;
  reverify skips its pre-3.0 question for that route.
- **Left alone after the passes** (UX/Minor, not lifecycle-critical): no setup toolchain row for
  standard-library Python; plan-project's skeleton fault switch on CLIs; triage routing of a
  request an open epic already covers (add stops cleanly); `approved_by` typed by hand is not
  caught by `validate`; renewed pending records reuse a reason that may name a replaced detail;
  wrapup 1.4b Amend has no vision/ConOps rewrite item (quick-fix and start-epic do).

