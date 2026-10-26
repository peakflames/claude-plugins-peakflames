# peak-workflow 3.0.0 — tracking doc

Requirements lifecycle (amend, retire, re-verify) and versioned upgrades, per issue #20 (v2
proposal + addendum). Every plan reads this file first and updates it last.

- **Spec:** issue #20 v2 + R1–R6 + the versioned-upgrades addendum. Deviations are logged below
  and posted once on #20 after approval.
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

## Plan checklist

| # | Plan | Done when | State |
|---|---|---|---|
| 1 | **Foundation** — `scripts/tor-lifecycle`, `scripts/tor_lifecycle.py` (`fingerprint`, `titles`, `version`, loaders), `tests/peak-workflow/`, plugin `CLAUDE.md`, this doc | `fingerprint`/`titles`/loaders pass the tests on 3.11 + 3.14 | ✅ Done |
| 2 | **Script analysis** — `check` A–F (`--base`, `--json`, own-branch marking), `sweep`, `seed`, `states --json` (incl. Q17); process pool for files, thread pool for git | Every row of the decision-test, derived-state, and finding A–F tables has a fixture test; the scale fixture meets Q14 | ✅ Done |
| 3 | **Format & cleanup** — `upgrade` runner, step `0001-epic-provenance`, format guard in every skill, delete the two migrate skills, new-project routes on the stamp, setup writes the stamp + `[lifecycle]` + Python probe + requirements README stub, Q15 bundle | Format-0 fixture upgrades to 1 idempotently; dry-run of new-project → setup → upgrade | ✅ Done |
| 4 | **Authoring** — capture-requirements 3B.2 five options, TOR-ID argument mode, re-litigation grep, Step 4 `check --base`, Haiku brief rewrite; FEATURE/TRACING templates; discover Removed/Modified rows; mockup (Q22); triage routes + `check` | Dry-run: brownfield supersede, retire, pending, reword-with-evidence on a docs/ branch | ✅ Done |
| 5 | **Planning & dashboards** — plan-project/add (ID-only anchors, live-set delta, removal epics with `retires:`); status (Requirements Health, live denominator, degraded mode, overdue-Disputed action); pause; refresh-docs | Dry-run on a fixture holding every derived state | ✅ Done |
| 6 | **Execution** — start-epic (`check` + nudge, 6.2 successor/drop/stop, 6.3 removed, `sweep` retarget, in-epic amendment, `titles`, Q16 stop); PLAN_TEMPLATE; quick-fix amendment path | Dry-run: in-epic amend, quick-fix supersede | ☐ |
| 7 | **wrapup-epic** — 1.1 `check --base` + own-branch blocking; Disputed block; 5.2/5.3; 1.4b Amend / Record as pending; removal-epic gate; 2.2 `verified:`; `reverify` mode; HANDOFF/PR_BODY templates | Dry-run: wrapup amend, pending, removal epic, reverify PASS/FAIL | ☐ |
| 8 | **Step 0002 lifecycle migration** (#20 Migration 1–8, one commit each; strips `migration_source`) + contributor kit (Q9) | A "Project A-like" fixture upgrades with identical fingerprints before/after the strip; seed surfaces exactly the planted stale set | ☐ |
| 9 | **Release gate** — README / plugin CLAUDE.md / CHANGELOG (BREAKING, /upgrade), 2-pass full dry-run, live UAT, draft PR → develop, contributor request, release | All four Q10 gates pass | ☐ |

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
- **Left alone** (pre-existing): plan-project Step 7 adds a "Design & Planning Documents" section
  to the user's `CLAUDE.md` when missing, which conflicts with the plugin rule "No skill or step
  edits the user's `CLAUDE.md`" — reconcile in Plan 9. pause commits on whatever branch is checked
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
