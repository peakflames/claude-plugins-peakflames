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

## Plan checklist

| # | Plan | Done when | State |
|---|---|---|---|
| 1 | **Foundation** — `scripts/tor-lifecycle`, `scripts/tor_lifecycle.py` (`fingerprint`, `titles`, `version`, loaders), `tests/peak-workflow/`, plugin `CLAUDE.md`, this doc | `fingerprint`/`titles`/loaders pass the tests on 3.11 + 3.14 | ✅ Done |
| 2 | **Script analysis** — `check` A–F (`--base`, `--json`, own-branch marking), `sweep`, `seed`, `states --json` (incl. Q17); process pool for files, thread pool for git | Every row of the decision-test, derived-state, and finding A–F tables has a fixture test; the scale fixture meets Q14 | ✅ Done |
| 3 | **Format & cleanup** — `upgrade` runner, step `0001-epic-provenance`, format guard in every skill, delete the two migrate skills, new-project routes on the stamp, setup writes the stamp + `[lifecycle]` + Python probe + requirements README stub, Q15 bundle | Format-0 fixture upgrades to 1 idempotently; dry-run of new-project → setup → upgrade | ☐ |
| 4 | **Authoring** — capture-requirements 3B.2 five options, TOR-ID argument mode, re-litigation grep, Step 4 `check --base`, Haiku brief rewrite; FEATURE/TRACING templates; discover Removed/Modified rows; mockup (Q22); triage routes + `check` | Dry-run: brownfield supersede, retire, pending, reword-with-evidence on a docs/ branch | ☐ |
| 5 | **Planning & dashboards** — plan-project/add (ID-only anchors, live-set delta, removal epics with `retires:`); status (Requirements Health, live denominator, degraded mode, overdue-Disputed action); pause; refresh-docs | Dry-run on a fixture holding every derived state | ☐ |
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
