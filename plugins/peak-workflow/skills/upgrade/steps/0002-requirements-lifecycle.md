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

When resuming (see **Resuming** under Apply for how to tell), show only *"Resuming step 0002
after <last phase done>"* and the phases left. Otherwise show the counts from the Detect's last line as a table, in plain words:

| What | Count | What happens |
|---|---|---|
| Lifecycle notes and markers in feature files | `prose` | Each is classified once (you approve the list), then removed |
| Requirements edited in place before 3.0 | distinct TORs across the `edit` lines | A `reword` record with `result = "historical"` per edit — no test evidence, so an edit made **after** the owning epic was verified leaves the requirement Changed since verified |
| Requirements deleted without a record | `removed` | A `supersede` or `retire` record with the text as it last read |
| Tracing sidecars with titles | `tracing` | `title` and `generated` removed (the Scenario line is the only title) |
| Open epic specs with a title column | `specs` | The Requirements Anchors table becomes `TOR ID \| Feature File` |
| Ad hoc sidecar keys and `#` note lines | `sidecar_keys` | Folded into the records, then removed |
| Complete epics' requirements to fingerprint | `seed` | `verified:` lines from the commit that completed each epic |

Then say:

- Fingerprints (the meaning-bearing text of each requirement) are checked before and after: they
  must come out identical for every requirement that stays.
- A Complete epic's spec is history and is not touched. A Complete epic's sidecar keeps its
  `status:` and every other line; it only gains `verified:` lines and loses ad hoc keys and `#` note lines.
- Requirements edited after their epic was verified will show as **Changed since verified**, and
  known-wrong ones recorded in prose as **Disputed**. That is the point: the findings file saved
  at the end lists them per epic for you to triage.
- A dispute's age counts from today, the day its `pending` record is written — not from when the
  note was added — so the threshold (`[lifecycle] disputed_threshold_days`, default 30) gives you
  that long to settle it before it blocks work. A `# Safety` requirement blocks at once.
- The records are written in your name (`git config user.name`) with `approved_via = "migration"`.

## Apply

Run the phases in order. A phase whose command changes nothing makes no commit. Commit on the
upgrade branch only, staging by path (never `git add -A`), with the message
`chore(upgrade): step 0002 requirements-lifecycle — <phase>`.

**Resuming.** This step is being resumed when either is true: `git log --format=%s <base>..HEAD`
lists `step 0002`, or a record added since `<base>` holds a `migration_source` line (`git diff
--name-only --diff-filter=A <base> -- docs/requirements/changes | xargs grep -l '^migration_source'`
— this catches records committed by hand under another message). The Preview then says
*"Resuming step 0002 after <last phase done>"* and lists only the phases left, instead of the
table above. When such a record exists, Phase 4 is done whatever the commit messages say: skip
Phases 3–4, and the classification is not shown or approved again. Every other phase is safe to
re-run: its command reports nothing to do.

### Phase 1 — Prerequisites

Satisfied: Detect exited 1, not 2 (and the wrapper found Python 3.11+).

### Phase 2 — Fingerprint before

When `<scratch>/before.tsv` already exists, keep it and skip this phase (it is the snapshot from
before any change). Otherwise: `tor-lifecycle fingerprint > "<scratch>/before.tsv"`.

### Phase 3 — Inventory

`tor-lifecycle migrate scan --base <base> --json > "<scratch>/scan.json"` (exit 1 is normal: items
are pending) and read it:

- `prose` items with `strip: true` — `id` (`<file>:<line>`), `kind` (`marker` for AMENDED /
  REVISED / SUPERSEDED / MODIFIED / CHANGE-CONTROL, `note`, `comment`, `banner`, `outside`), the
  requirement it sits in (`tor`), and `text`. Read each requirement's block with
  `tor-lifecycle text <TOR>` where the note alone is unclear. `tor` is null for prose between a
  section banner and that section's first Scenario: it speaks for the section, so pick the
  requirement it explains (Rationale) or drop it.
- `sidecar_keys` — `superseded_by`, `supersession_note`, `revised`, `revision-reason` lines;
  `source` is `<sidecar path>:<key>`. Each run of `#` note lines (key `#`, e.g. "TOR-… rewritten
  by v1.27 and moved to epic …") is one entry; `source` is `<sidecar path>:#<line>`.
- `removed` — IDs that left the feature files with no record (`check` finding B), with the merge
  that removed them.
- `edits` — every trunk commit that changed a requirement's text with no record (`check`
  finding A): `tor`, `sha`, `date`, `subject`.

**Strip preflight.** Before any classification, run `tor-lifecycle migrate strip` (no `--write`)
on its own, unpiped, and read its exit code: strip removes every `strip: true` item whatever its
classification, so a refusal now would stop Phase 5 after the owner's work. Its line counts can
differ from Phase 5's (records are not written yet); only the refusal matters. Exit 0 or 1: say
*"Strip preflight passed"* and continue. Exit 2: show its output and stop before Phase 4 —
*"The helper cannot strip these files without changing a requirement's fingerprint or section.
Nothing was classified or written; report this to the peak-workflow maintainers."* The branch
keeps the commits made so far.

### Phase 4 — Classify (the owner gate)

Propose one classification per prose item and sidecar key:

| Choice | When | Plan entry |
|---|---|---|
| **Rationale** | Explains why a live requirement reads as it does, and is still true | `rationale`: `tor`, `text` — a few plain sentences, no marker words |
| **History** | Describes an earlier edit of a requirement that stays live under the same ID (AMENDED, REVISED, MODIFIED, "was X, now Y") and that TOR has `edits` rows | `history`: `tors`, `title`, `reason` — the title names what changed in ≤ 60 characters ("Export limit raised from 100 to 500 rows"), never just a date or epic; the reason says why, with the date and source |
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
  When no note explains an edit and its `edits` row's `subject` does not say what changed, read the change with `git diff --word-diff -U3 <sha>^1 <sha> -- <feature file>`
  (most `edits` shas are merges, which `git show` prints empty), looking only at the hunk under
  that requirement's Scenario line, and write a History entry for it with `sources: []`.
- A Rationale for a requirement with no tracing entry cannot be kept: the helper refuses it. Tell
  the owner, propose Drop, and note that adding the tracing entry first (on `<base>`, through
  `/peak-workflow:capture-requirements`) would keep it.
- **One Rationale entry per requirement.** A tracing entry holds one rationale, and the helper
  refuses a plan with two for one requirement. When several notes explain one requirement, write
  one `text` covering them all and list every note in its `sources`.
- **One removal or pending entry per requirement.** A requirement may appear in only one Supersede
  or Retire entry, and in only one Pending entry; the helper refuses a second.
- `refs` (optional on History, Supersede, Retire, and Pending): issues, tickets, or design notes
  the note cites; the helper adds the source commits itself.
- **One History entry per requirement.** The helper gives every edit of a requirement the same
  title and reason, and refuses a plan with two entries for one requirement. When a requirement
  has several `edits` rows, or a note plus an unexplained edit, write one entry whose title and
  reason cover them all.

The classification is the owner's decision, not yours: you draft it, they decide. If helper agents
draft rows, read every row they wrote before you show it. Run the preview below before the gate,
so the owner never approves a plan the helper rejects.

Write the full table — `# | Where | Requirement | What it says | Proposed | Detail`, one row per
prose item, sidecar key, `removed` ID, History entry with `sources: []`, and `edits` row with no
History entry (its title is the one the preview shows), written in part order when the gate is
split (below); `What it says` being
the prose summarized in ≤ 80 characters (each note, when one item holds several), `Detail` the
full entry the row informs — Supersede: successors, title, reason, keywords; Retire: removal,
title, reason, keywords; Pending: owner, tracker, title, reason, keywords; History: title and
reason; any `refs`; Rationale: text; a row whose
entry another row already shows may say "as row N", and a Supersede or Retire row also says the
Scenario is deleted — to `<scratch>/table.md`, and give its absolute path (`git rev-parse --path-format=absolute
--git-path peak-workflow-0002/table.md`) on its own line with the row count. Then show inline, in this order, the rows that carry a judgment:

1. Every Supersede, Retire, and Pending entry, and every `removed` ID with its proposed entry.
2. Every section-level item (`tor` null) with the requirement you chose for it, or Drop.
3. Every sidecar key and `#` note line.
4. Every History entry: requirements, title, and reason.
5. Anything you were unsure of, with the alternative.

Drop rows, and Rationale rows whose `text` only restates the note, stay in the file; show any
Rationale you reworded or wrote from scratch. When the table has more than 40 rows, skip
the inline list and walk the table in parts instead. Group whole feature files in feature-number
order until the next file would take the part past 40 rows; a file over 40 rows is a part of its
own; rows outside the feature files (sidecar keys, `removed` IDs, History entries with
`sources: []`, `edits` rows with no History entry) form the last part, named "outside the
feature files" in its question and split again past 40. Say how many parts there are, then for each part show its judgment rows in the order above
followed by its other rows, and ask `"Rows <first>–<last> (<files>): are these right?"` with
options `["These are right", "Change some rows", "Stop here"]`. These choices work as they do at
the final question below; after a change, rewrite `plan.json` and `table.md` and re-run the preview
before the next part.

Then ask via `AskUserQuestion`, with no option marked recommended:

- Question: `"Apply this classification? Each row, shown above or in table.md, becomes the record or tracing change listed."`
- Options: `["Apply", "Change some rows", "Stop here"]`

On **Change some rows**, ask in chat which rows and what to change, take the new choices in the
user's words, rewrite `plan.json` and `table.md`, re-run the preview, re-show the changed rows,
and ask again. On **Stop here**, end the session: the branch keeps the commits
made so far, and a later run resumes from the stamp.

The plan file, `<scratch>/plan.json`:

```json
{
  "rationale": [{"tor": "TOR-01-…", "text": "…", "sources": ["docs/requirements/01-x.feature.md:15"]}],
  "history":   [{"tors": ["TOR-02-…"], "title": "…", "reason": "…", "sources": ["…"]}],
  "supersede": [{"tors": ["TOR-02-…"], "successors": ["TOR-02-…"], "title": "…", "reason": "…",
                 "keywords": ["…"], "sources": ["…", "docs/implementation-plan/status/epic-<id>.md:superseded_by"]}],
  "retire":    [{"tors": ["TOR-03-…"], "removal": "none", "title": "…", "reason": "…", "keywords": ["…"], "sources": ["…"]}],
  "pending":   [{"tors": ["TOR-02-…"], "title": "…", "reason": "…", "keywords": ["…"], "sources": ["…"],
                 "owner": "…", "tracker": "ENG-123", "refs": ["issue #40"]}],
  "drop":      ["docs/requirements/01-x.feature.md:40"]
}
```

Before the gate, write your draft to `<scratch>/plan.json` and run `tor-lifecycle migrate records
--plan "<scratch>/plan.json" --base <base> --json` (a preview: one row per record, rationale move,
and deletion, each record with its `fields` — reason, keywords, successors, removal, owner,
tracker, refs). Fill each row's `Detail` in `table.md` from this output, not from your draft, so the
owner reads exactly what will be written. Exit 2 names what is unclassified, inconsistent, or would be lost (a second entry for one
requirement, a History entry with no edit, a source cited twice or both cited and dropped): fix the plan — asking the user only
when the fix is a new decision — and run it again. After the owner's changes, rewrite
`plan.json` and re-run the preview. Once they choose **Apply**:

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
`revised`, and `revision-reason` lines and the `#` note lines Phase 4 folded into records
(`reverified:` stays). `git add
-- docs/implementation-plan/status` and commit `— normalize sidecar keys`.

### Phase 8 — Drop `migration_source`

`tor-lifecycle migrate finish --write`, then `tor-lifecycle validate` (must exit 0). Leave the
result uncommitted: the runner commits it with the stamp as `chore(upgrade): step 0002
requirements-lifecycle`.

The changed files are those under `docs/requirements/` and `docs/implementation-plan/` (the
Rewrites globs) plus the stamp.

## Report

Save the full findings, which can run to hundreds of lines, outside the scratch folder:
`tor-lifecycle check --by-epic --base <base> > "$(git rev-parse --path-format=absolute --git-path peak-workflow-0002-findings.txt)"`.
In the runner's final message print its last line (the counts); every `C` and `E` finding and
every `F` finding reading "known to be wrong", verbatim; every blocking finding (the lines of
the findings file containing `[this branch, blocking]`); one line per
other finding letter with its count labelled from what its messages say (e.g. *"12 F: owned by more than one epic"*, *"5 D:
changed since verified"*); then the file's
absolute path on its own line. Then print the last line of `tor-lifecycle states`, and the records this step
wrote as a count per kind:
`git diff --name-only --diff-filter=A <base> -- docs/requirements/changes | xargs grep -h '^kind = ' | sort | uniq -c`.
Then say, in plain words:

- **Changed since verified** (`D`): the requirement's text changed after its epic verified it;
  when the message names a record, the upgrade recorded that edit without test evidence. Triage each with the decision test:
  when the meaning changed, `/peak-workflow:capture-requirements <TOR>`; when it did not,
  `/peak-workflow:wrapup-epic <epic> reverify` re-checks it. That triage is the owner's; nothing
  here decides it.
- **Disputed** (an `F` finding reading "known to be wrong"): a pending change-control note became
  a `pending` record; settle it with `/peak-workflow:capture-requirements <TOR>`.
- **Dangling ID** (`C`) in a sidecar's `requirements:` line: the upgrade never rewrites a Complete
  epic's `requirements:`. Correct the line by hand on a `docs/` branch — replace the stray text
  with the TOR IDs it meant, or delete it — and merge it like any planning change. A dangling ID
  cited anywhere else (a design note, a spec): fix that citation on a `docs/` branch the same way.
- Any other finding: follow its message.
- When Phase 5 left a user-written `docs/requirements/README.md` alone, say so, and that its
  Conventions may still describe 2.1 rules (the section Phase 5 would have written is above).

Finally remove the scratch folder: `rm -rf "$(git rev-parse --git-path peak-workflow-0002)"`.
