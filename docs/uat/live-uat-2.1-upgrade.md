# peak-workflow 3.0 — live UAT: upgrade a real 2.1.0 project (Q10 gate 3)

The maintainer runs this on the Habit Tracker built with released peak-workflow 2.1.0 (3–4
Complete epics, one verified TOR edited in place afterwards, one "pending change-control" note).
Everything happens on a copy; the original project is never touched.

Placeholders: `<HABIT>` = the 2.1.0 project, `<REPO>` = this repository on
`feature/peak-workflow-3.0`, `<UAT>` = `/tmp/habit-uat`. Record each result in the table at the
end (✅ / ❌ + a note).

## 0. Prepare

```bash
cd <HABIT> && git status --short && git branch --show-current     # clean, on develop
python3.11 <REPO>/tests/peak-workflow/acceptance/run.py baseline <HABIT> > /tmp/habit-baseline.txt
rm -rf <UAT> && git clone <HABIT> <UAT> && cd <UAT> && git checkout develop
```

Expect in `/tmp/habit-baseline.txt`:

- **0.1** `format: behind`, `prerequisites: ok: True`, `inventory.edited` includes the TOR you
  edited in place, `inventory.prose` > 0.
- **0.2** `states_after_seed.changed_since_verified` lists **exactly one** requirement — the TOR
  you edited in place, with its epic. Note them: `<STALE>` and `<EPIC>`.

Start Claude Code **with the branch's plugin only**. The marketplace copy of peak-workflow
(2.1.0) must be disabled for this session (`/plugin` → peak-workflow → Disable), then:

```bash
cd <UAT> && claude --plugin-dir <REPO>/plugins/peak-workflow
```

- **0.3** Type `/peak-workflow:` — `upgrade` is listed; `migrate-2-5` and
  `migrate-from-epic-workflow` are **not**.

## 1. `/peak-workflow:status` before the upgrade (degraded mode)

- **1.1** A banner says the project is on format 0 and names `/peak-workflow:upgrade` as the fix,
  first in the next actions. The rest is marked "after the fix". Nothing is written
  (`git status --short` is empty).

## 2. `/peak-workflow:upgrade`

- **2.1** Plan reads `Upgrade: format 0 → 2` with rows `0001 epic-provenance` and
  `0002 requirements-lifecycle`. Branch `docs/upgrade-format-2` is created from `develop`.
- **2.2** No in-flight warning (or, if you have unmerged branches, the warning lists them with a
  Skip option only for epic paths).
- **2.3** Step 0001 preview shows counts of specs gaining provenance and sidecars gaining
  `owner: —`. Apply → one commit `chore(upgrade): step 0001 epic-provenance`.
- **2.4** Step 0002 preview table shows counts. `prose` includes your pending note; `edit` includes
  `<STALE>`; `seed` covers every Complete epic's requirements.
- **2.5** Classification table: your "pending change-control" note is proposed **Pending**; any
  note about the in-place edit is proposed **History** for `<STALE>`. Correct anything wrong with
  "Change some rows", then Apply.
- **2.6** Commits, in order: `— change records`, `— strip notes and titles`, `— seed verified
  fingerprints`, (`— normalize sidecar keys` only if you had ad hoc keys), then
  `chore(upgrade): step 0002 requirements-lifecycle` with the stamp. `git status --short` empty.
- **2.7** Report: `check --by-epic` shows **D** for `<STALE>` under `<EPIC>` (naming both routes:
  capture-requirements if the meaning changed, else reverify) and **F** "known to be wrong" for
  the pending TOR. **No A or B.** The records count lists `reword` (historical) and `pending`.
- **2.8** `git diff develop -- CLAUDE.md` is empty (no upgrade step edits it).
- **2.9** Choose **Solo — merge into develop locally**. `docs/.peak-workflow.toml` on develop
  reads `format = 2` with `[lifecycle] disputed_threshold_days = 30`.
- **2.10** Run `/peak-workflow:upgrade` again → *"This project is on format 2 — nothing to
  upgrade."* and no branch is left behind (`git branch --list 'docs/upgrade-*'` empty).

Then, in a shell:

```bash
python3.11 <REPO>/tests/peak-workflow/acceptance/run.py after <UAT> > /tmp/habit-after.txt
```

- **2.11** `format: current`, `rerun_pending` empty, `fingerprints.changed` empty,
  `validate.problems: 0`, `records.with_migration_source: 0`, `states.changed_since_verified` =
  `[<STALE>]` (same as 0.2).

## 3. `/peak-workflow:status`

- **3.1** No banner. Requirements Coverage counts live requirements only.
- **3.2** Changed Since Verified panel lists `<STALE>` under `<EPIC>` with the "decide first"
  caveat (its edit is explained only by a pre-3.0 historical record).
- **3.3** Requirements Health lists D and the dispute (not yet overdue: 0 days, due after 30).
- **3.4** The opening nudge and Suggested Next Actions put the decision on `<STALE>` and the
  dispute first. Still nothing written.

## 4. Decide `<STALE>` — `/peak-workflow:capture-requirements <STALE>`

Decide as the owner. Pick the branch that matches what your in-place edit really was:

- **Meaning changed** → choose Supersede.
  - **4.1** A `docs/amend-<stale-id>` branch is created from develop.
  - **4.2** The block gets a new ID in place; a `supersede` record whose `text` is the
    **verified** version; the tracing entry is swapped; `/add` is offered for the successor.
  - **4.3** `tor-lifecycle validate` ok and `check --base develop` shows no own-branch findings.
  - **4.4** The skill does not commit; commit and merge the branch yourself. `/status` then shows
    the old ID gone from the denominator and the successor **Specified** (unassigned unless you
    accepted `/add`).
- **Wording only** → the skill should send you to reverify (step 5) or offer a reword with test
  evidence. Either is a pass; note which.

## 5. `/peak-workflow:wrapup-epic <EPIC> reverify` (fresh session)

Run this if step 4 kept the ID (or on another of `<EPIC>`'s requirements by naming it:
`/peak-workflow:wrapup-epic <EPIC> reverify <TOR>`).

- **5.1** Refuses nothing it shouldn't: `<EPIC>` is Complete; branch
  `hotfix/verify-epic-<EPIC>-<short-name>` is created.
- **5.2** Verifies each scoped requirement independently (Step 1.2) and runs the Tests gate only —
  no code review, no docs refresh, no status change.
- **5.3** PASS: the sidecar's `verified:` line for the TOR holds its current fingerprint and
  `reverified:` is today (both written by `tor-lifecycle mark`; `status:` unchanged).
  A dated `session-handoffs/epic-<EPIC>-reverified-<date>.md` is written.
- **5.4** Ships like a quick-fix (solo merge). `/status` shows the TOR **Verified**, and D is gone.

## 6. Settle the dispute — `/peak-workflow:capture-requirements <PENDING-TOR>`

- **6.1** The Disputed case offers Uphold / Change it / Retire / Renew (Renew absent for Safety).
- **6.2** Choose what is true for the Habit Tracker. Uphold writes an `uphold` record referencing
  the `pending` one; `validate` ok. After merge, `/status` shows no dispute.

## Results

| Step | Result | Note |
|---|---|---|
| 0.1–0.3 | | |
| 1.1 | | |
| 2.1–2.11 | | |
| 3.1–3.4 | | |
| 4 | | |
| 5.1–5.4 | | |
| 6.1–6.2 | | |

Gate 3 passes when every row is ✅, or every ❌ is fixed and its step re-run clean on a fresh
`<UAT>` clone. Send back the table, `/tmp/habit-baseline.txt`, `/tmp/habit-after.txt`, and any
message that confused you.
