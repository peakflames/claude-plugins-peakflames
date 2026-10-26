# Step 0002 — requirements-lifecycle

**Summary:** Turn 2.1-era lifecycle prose into Change Records, strip notes and titles, seed
`verified:` fingerprints, and fold ad hoc sidecar keys into records.
**Rewrites:** `docs/requirements/*.feature.md` `docs/requirements/*.feature.tracing.json` `docs/requirements/changes/*.toml` `docs/requirements/README.md` `docs/implementation-plan/phase-*/epic-*.md` `docs/implementation-plan/status/epic-*.md`
**Skip:** not supported — every epic shares the feature files.
**Commits:** one per phase that changes files (Phases 4–7); the runner commits Phase 8 with the stamp.

Forward-only and append-only: this file is never edited after release. A correction is a new step.

`tor-lifecycle` means `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle"`. `<base>` is the
runner's base branch. `<scratch>` is `$(git rev-parse --git-path peak-workflow-0002)` — a folder
inside `.git`, so nothing in it is ever committed; create it with `mkdir -p` before first use.
Shell variables do not persist between commands, so inline the `$(…)` each time.

The mechanics are all in the helper; your part is the classification in Phase 4 and the owner's
approval of it. Never edit a feature file, tracing sidecar, spec, sidecar, or record by hand in
this step — when a helper command refuses, stop and show its output.

## Detect

`tor-lifecycle migrate scan --base <base>`

- Exit 0, last line `satisfied` — satisfied.
- Exit 1 — pending. One line per item (`prose`, `tracing`, `spec`, `sidecar-key`, `edit`,
  `removed`, `seed`, `migration-source`); the last line counts them. `kept` lines are prose the
  step leaves in place (outside the Gherkin and part of a requirement's fingerprint); they are
  not pending.
- Exit 2 — a prerequisite failed (#20 Migration 1): a tracing sidecar is not valid JSON, a
  Scenario ID is defined twice, or a sidecar or record cannot be read. Show the errors and stop:
  *"Fix these on <base> first (a duplicated ID: give the newer Scenario a fresh ID), then re-run
  /peak-workflow:upgrade."* An upgrade step never guesses which copy of a requirement is real.

## Preview

When resuming (the branch already has `step 0002` commits — see **Resuming** under Apply), show
only *"Resuming step 0002 after <last phase committed>"* and the phases left. Otherwise show the counts from the Detect's last line as a table, in plain words:

| What | Count | What happens |
|---|---|---|
| Lifecycle notes and markers in feature files | `prose` | Each is classified once (you approve the list), then removed |
| Requirements edited in place before 3.0 | distinct TORs in `edit` | A `reword` record with `result = "historical"` per edit — no test evidence, so an edit made **after** the owning epic was verified leaves the requirement Changed since verified |
| Requirements deleted without a record | `removed` | A `supersede` or `retire` record with the text as it last read |
| Tracing sidecars with titles | `tracing` | `title` and `generated` removed (the Scenario line is the only title) |
| Open epic specs with a title column | `specs` | The Requirements Anchors table becomes `TOR ID \| Feature File` |
| Ad hoc sidecar keys | `sidecar_keys` | Folded into the records, then removed |
| Complete epics' requirements to fingerprint | `seed` | `verified:` lines from the commit that completed each epic |

Then say:

- Fingerprints (the meaning-bearing text of each requirement) are checked before and after: they
  must come out identical for every requirement that stays.
- A Complete epic's spec is history and is not touched. A Complete epic's sidecar keeps its
  `status:` and every other line; it only gains `verified:` lines and loses ad hoc keys.
- Requirements edited after their epic was verified will show as **Changed since verified**, and
  known-wrong ones recorded in prose as **Disputed**. That is the point: the report at the end
  lists them per epic for you to triage.
- A dispute's age counts from today, the day its `pending` record is written — not from when the
  note was added — so the threshold (`[lifecycle] disputed_threshold_days`, default 30) gives you
  that long to settle it before it blocks work. A `# Safety` requirement blocks at once.
- The records are written in your name (`git config user.name`) with `approved_via = "migration"`.

## Apply

Run the phases in order. A phase whose command changes nothing makes no commit. Commit on the
upgrade branch only, staging by path (never `git add -A`), with the message
`chore(upgrade): step 0002 requirements-lifecycle — <phase>`.

**Resuming.** When the branch already has commits from this step
(`git log --format=%s <base>..HEAD` lists `step 0002`), the Preview says *"Resuming step 0002
after <last phase committed>"* and lists only the phases left, instead of the table above —
the classification is not shown or approved again. Keep `<scratch>/before.tsv`; if the `change
records` commit exists, skip Phases 3–4. Every other phase is safe to re-run: its command reports
nothing to do.

### Phase 1 — Prerequisites

Satisfied: Detect exited 1, not 2 (and the wrapper found Python 3.11+).

### Phase 2 — Fingerprint before

Unless resuming with the file in place: `tor-lifecycle fingerprint > "<scratch>/before.tsv"`.

### Phase 3 — Inventory

`tor-lifecycle migrate scan --base <base> --json > "<scratch>/scan.json"` and read it:

- `prose` items with `strip: true` — `id` (`<file>:<line>`), `kind` (`marker` for AMENDED /
  REVISED / SUPERSEDED / MODIFIED / CHANGE-CONTROL, `note`, `comment`, `banner`, `outside`), the
  requirement it sits in (`tor`), and `text`. Read each requirement's block with
  `tor-lifecycle text <TOR>` where the note alone is unclear.
- `sidecar_keys` — `superseded_by`, `supersession_note`, `revised`, `revision-reason` lines;
  `source` is `<sidecar path>:<key>`.
- `removed` — IDs that left the feature files with no record (`check` finding B), with the merge
  that removed them.
- `edits` — every trunk commit that changed a requirement's text with no record (`check`
  finding A): `tor`, `sha`, `date`, `subject`.

### Phase 4 — Classify (one owner gate)

Propose one classification per prose item and sidecar key:

| Choice | When | Plan entry |
|---|---|---|
| **Rationale** | Explains why a live requirement reads as it does, and is still true | `rationale`: `tor`, `text` — one or two plain sentences, no marker words |
| **History** | Describes an earlier edit of a requirement that stays live under the same ID (AMENDED, REVISED, MODIFIED, "was X, now Y") and that TOR has `edits` rows | `history`: `tors`, `title`, `reason` — the reason for that edit |
| **Supersede** | The requirement was replaced by another live requirement: prose marks it superseded or replaced, or a `removed` ID's successor is named by a note or a `superseded_by` key | `supersede`: `tors`, `successors` (live IDs), `title`, `reason`, `keywords` |
| **Retire** | The requirement no longer applies and nothing replaces it | `retire`: `tors`, `removal`, `title`, `reason`, `keywords` |
| **Pending** | An open change-control note: a change proposed but not decided ("pending", "under review", "do not change until…") | `pending`: `tors`, `title`, `reason`, `keywords`, optional `owner` (default: you) and `tracker` |
| **Drop** | Nothing to keep: housekeeping, TODOs, section reshuffles, "pre-amendment contract only" comments, or a note that only repeats what a record now says | its source ID in `drop` |

Rules:

- Every `removed` ID gets a Supersede or Retire entry; every `strip: true` prose item and every
  sidecar key is cited by exactly the entries it informs (each entry's `sources` list) or listed
  in `drop`. A source may inform several entries (a `superseded_by` key and the note naming the
  same successor both go in that supersede's `sources`).
- A History note whose TOR has no `edits` row describes no recorded edit: classify it Rationale
  or Drop.
- A live requirement marked superseded or retired in prose is deleted from its feature file by
  the helper after its record is written; its tracing entry goes too. A requirement with a
  Rationale, History, or Pending entry must not also be superseded or retired.
- Retire `removal`: run `git grep -n -w <TOR> -- . ':!docs'`. Hits in tests or source → propose
  `"code"` (a removal epic is needed; `/peak-workflow:add` plans it later); none → `"none"`.
- `keywords` are the words someone would use to re-propose the idea (two to five).
- `revised:` / `revision-reason:` keys are the reason for that epic's edited requirement (History
  `sources`); `supersession_note:` is the reason for its supersede.
- Every `edits` row becomes a historical `reword` whether or not you write a History entry; the
  entry only supplies the title and reason (without one the helper names the commit subject).

Show the gate as one table — `# | Where | Requirement | What it says | Proposed | Detail` —
`What it says` being the prose summarized in ≤ 80 characters, `Detail` the successor, removal,
rationale text, or pending owner. Below it list the `removed` IDs with their proposed entries and
the edited requirements with the History reason each will get. Then ask via `AskUserQuestion`:

- Question: `"Apply this classification? Each row becomes the record or tracing change shown."`
- Options: `["Apply (Recommended)", "Change some rows", "Stop here"]`

On **Change some rows**, take the row numbers and the new choices in the user's words, re-show
the table, and ask again. On **Stop here**, end the session: the branch keeps the commits made so
far, and a later run resumes from the stamp.

Write the approved classification as JSON to `<scratch>/plan.json`:

```json
{
  "rationale": [{"tor": "TOR-01-…", "text": "…", "sources": ["docs/requirements/01-x.feature.md:15"]}],
  "history":   [{"tors": ["TOR-02-…"], "title": "…", "reason": "…", "sources": ["…"]}],
  "supersede": [{"tors": ["TOR-02-…"], "successors": ["TOR-02-…"], "title": "…", "reason": "…",
                 "keywords": ["…"], "sources": ["…", "docs/implementation-plan/status/epic-<id>.md:superseded_by"]}],
  "retire":    [{"tors": ["TOR-03-…"], "removal": "none", "title": "…", "reason": "…", "keywords": ["…"], "sources": ["…"]}],
  "pending":   [{"tors": ["TOR-02-…"], "title": "…", "reason": "…", "keywords": ["…"], "sources": ["…"]}],
  "drop":      ["docs/requirements/01-x.feature.md:40"]
}
```

Run `tor-lifecycle migrate records --plan "<scratch>/plan.json" --base <base>` (a preview: one
line per record, rationale move, and deletion). Exit 2 names what is unclassified or inconsistent:
fix the plan — asking the user only when the fix is a new decision — and run it again. Then:

1. `tor-lifecycle migrate records --plan "<scratch>/plan.json" --base <base> --write`
2. `tor-lifecycle validate` — must exit 0.
3. `git add -- docs/requirements` and commit `— change records`.

Each record carries a `migration_source` line (where its prose came from) for review in this
commit; Phase 8 removes it.

### Phase 5 — Strip notes and titles

1. `tor-lifecycle migrate strip --write` — removes the classified prose from the feature files,
   `title` and `generated` from the tracing sidecars, and the title column from every spec whose
   epic is not Complete (Not Started, In Progress, Paused, Implemented). It refuses (exit 2) when
   removing a line would change any requirement's fingerprint or section; stop and show it.
2. `tor-lifecycle fingerprint --against "<scratch>/before.tsv"` — must exit 0: every surviving
   requirement `identical`, every `removed` one naming its record. Otherwise stop, show the
   output, and run `git checkout -- docs` (nothing from this phase is committed).
3. **Requirements README.** When `docs/requirements/README.md` holds the 2.1 stub's line
   `- Feature files are **append-only** — feature numbers are stable once assigned.`, replace its
   whole `## Conventions` section with the one below. When the file exists without that line,
   leave it alone (the user wrote it) and say so in the report. When there is no README, write
   one: the heading `# Requirements Baseline`, the line *"Formal Gherkin-style requirements
   (`.feature.md`), their traceability sidecars (`.feature.tracing.json`), and the Change Records
   (`changes/*.toml`) that explain each change to a merged requirement."*, then the section below.

   ```markdown
   ## Conventions

   - Feature numbers (`NN`) are stable once assigned and never reused.
   - TOR IDs (`TOR-NN-XXXXXXX`) are **immutable** once merged to develop — they are foreign keys
     referenced by epic specs, tests, and handoffs — and are never reused.
   - A change in meaning gets a **new ID**: a `supersede` Change Record names the successor. A
     requirement nobody needs any more is retired with a `retire` record. Only a same-meaning
     rewording with passing test evidence keeps its ID (a `reword` record).
   - Change Records (`changes/*.toml`) are history: written once, never edited.
   - Every change travels through a `docs/{task-short-name}` branch via
     `/peak-workflow:capture-requirements`; merging the branch is the approval.
   - `docs/.peak-workflow.toml` holds the project's format (kept by `/peak-workflow:setup` and
     `/peak-workflow:upgrade` — do not edit it) and `[lifecycle] disputed_threshold_days`, how long
     a requirement may stay disputed before it blocks work (default 30; `# Safety` requirements: 0).
   ```

4. `git add -- docs/requirements docs/implementation-plan` and commit `— strip notes and titles`.

### Phase 6 — Seed fingerprints

`tor-lifecycle seed --write`. Each row is `<epic> <TOR> <fingerprint> <completion commit>`; a row
reading `legacy` has no recoverable history and stays "Verified (legacy, unfingerprinted)" until
reverified. `git add -- docs/implementation-plan/status` and commit `— seed verified fingerprints`.

### Phase 7 — Normalize sidecar keys

`tor-lifecycle migrate sidecars --write` removes the `superseded_by`, `supersession_note`,
`revised`, and `revision-reason` lines Phase 4 folded into records (`reverified:` stays). `git add
-- docs/implementation-plan/status` and commit `— normalize sidecar keys`.

### Phase 8 — Drop `migration_source`

`tor-lifecycle migrate finish --write`, then `tor-lifecycle validate` (must exit 0). Leave the
result uncommitted: the runner commits it with the stamp as `chore(upgrade): step 0002
requirements-lifecycle`.

The changed files are those under `docs/requirements/` and `docs/implementation-plan/` (the
Rewrites globs) plus the stamp.

## Report

In the runner's final message — never a file — print the output of
`tor-lifecycle check --by-epic` verbatim, then the last line of `tor-lifecycle states`, and the
records this step wrote as a count per kind:
`git diff --name-only --diff-filter=A <base> -- docs/requirements/changes | xargs grep -h '^kind = ' | sort | uniq -c`.
Then say, in plain words:

- **Changed since verified** (`D`): the requirement's text changed after its epic verified it,
  and the upgrade recorded that edit without test evidence. Triage each with the decision test:
  when the meaning changed, `/peak-workflow:capture-requirements <TOR>`; when it did not,
  `/peak-workflow:wrapup-epic <epic> reverify` re-checks it. That triage is the owner's; nothing
  here decides it.
- **Disputed** (an `F` finding reading "known to be wrong"): a pending change-control note became
  a `pending` record; settle it with `/peak-workflow:capture-requirements <TOR>`.
- **Dangling ID** (`C`) in a sidecar's `requirements:` line: the upgrade never rewrites a Complete
  epic's `requirements:`. Correct the line by hand on a `docs/` branch — replace the stray text
  with the TOR IDs it meant, or delete it — and merge it like any planning change.
- Any other finding: follow its message.

Finally remove the scratch folder: `rm -rf "$(git rev-parse --git-path peak-workflow-0002)"`.
