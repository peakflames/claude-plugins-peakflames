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
  section banner and that section's first Scenario, and for a whole-file banner or header marker:
  it speaks for the section or file. Pick the requirement it explains (Rationale), or drop it.
  When it marks the section or file superseded or retired, cite it instead in the Supersede or
  Retire entry for the requirements of that section or file (only when `strip: true`; a kept
  banner line goes with the file).
  A preamble note directly above a Scenario line gets that Scenario's `tor`: judge every note by
  its words, not only by its `tor`.
- `sidecar_keys` — `superseded_by`, `supersession_note`, `revised`, `revision-reason` /
  `revision_reason` lines;
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
  Rationale, History, or Pending entry must not also be superseded or retired: a note on a
  requirement being removed is cited in that Supersede or Retire entry's `sources` with its
  content folded into the reason, or dropped.
- Retire `removal`: run `git grep -n -w <TOR> -- . ':!docs'`. Hits in tests or source → propose
  `"code"` (a removal epic is needed; `/peak-workflow:add` plans it later); none → `"none"`.
- `keywords` are the words someone would use to re-propose the idea (two to five).
- `revised:` / `revision-reason:` (or `revision_reason:`) keys are the reason for an edited requirement of the epic whose
  sidecar holds the key (History `sources`) — the requirement the value names, among that
  sidecar's `requirements:`; when it
  names none, propose Drop and say why. When that requirement has no `edits` row, classify them
  Rationale or Drop.
  `superseded_by:` names the replaced requirements' successors. The requirements it replaces are
  among the `requirements:` of the epic whose sidecar holds the key. Its successors are the live
  IDs its value names; when it names an epic or a file, propose only the requirements in it that
  take over (see "Successors are the requirements that take over"), never all of them. A key alone never deletes a live requirement: without a prose
  marker or the owner's say-so, propose Drop. `supersession_note:` is the reason for its
  supersede.
- Every `edits` row becomes a historical `reword` whether or not you write a History entry; the
  entry only supplies the title and reason (without one the helper names the commit subject).
  When no note explains an edit and the title the `migrate records` preview shows for it (*"Edited in place before 3.0: <subject>"*, the inner commit's subject) does not say what changed, read the change with `git diff --word-diff -U3 <sha>^1 <sha> -- <feature file>`
  (most `edits` shas are merges, which `git show` prints empty), looking only at the hunk under
  that requirement's Scenario line, and write a History entry for it with `sources: []`.
- A Rationale for a requirement with no tracing entry cannot be kept: the helper refuses it.
  Propose Drop, and tell the owner in plain words: *"This requirement has no companion entry to
  hold the note. To keep it, choose Stop here (answers so far are not kept), add an entry for
  <TOR> to <file>.feature.tracing.json on a docs/ branch, merge it into <base>, then run the
  upgrade again."* (The other skills stop on an un-upgraded project, so the entry is added by
  hand, shaped like that file's other entries.)
- **An existing rationale is kept.** When the requirement's tracing entry already holds a
  rationale, the new `text` keeps it and adds the note (the helper refuses a text that would
  replace a different one). The item is a decision, shown with its own `FROM:` line (*"existing
  reason in the .tracing.json file"*) and NOW rows.
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

- **Reword only the marker words.** A Rationale `text` drops marker and history wording
  ("AMENDED", "Note (updated 2026-05-14):", "has been removed", version tags) and keeps every
  example, ID, number, and named detail word for word. Anything you leave out is a loss the owner
  must see (below).
- **Successors are the requirements that take over.** The helper links every requirement in a
  Supersede entry to every one of its `successors`, so list only the live requirements that
  replace those in `tors`. When different requirements have different replacements (A and B by
  X, C and D by Y), write one entry per successor group; it is still one question, and its block
  shows each arrow. When a whole feature file replaces another, name the specific successors;
  never list a whole file "to be safe".

The classification is the owner's decision, not yours: you draft it, they decide. If helper agents
draft rows, read every row they wrote before you show it. Run the preview below before the gate,
so the owner never approves a plan the helper rejects.

Write the full table to `<scratch>/table.md` — `# | Note in | Requirement | What it says | Choice
| Saved as`, one row per prose item, sidecar key, `removed` ID, History entry with `sources: []`,
and `edits` row with no History entry (its title is the one the preview shows). `Note in` is the
file and line range (`docs/requirements/02-x.feature.md, lines 40–42`, or `epic-<id> status file:
revised`); `What it says` is the prose summarized in ≤ 80 characters; `Choice` is the plain label
below (two, joined by "+", for a note feeding two entries); `Saved as` is the full entry the row informs — Supersede: successors, title, reason,
keywords; Retire: removal, title, reason, keywords; Pending: owner, tracker, title, reason,
keywords; History: title and reason; any `refs`; Rationale: text. A row whose entry another row
already shows may say "as row N"; a Supersede or Retire row also says the Scenario is deleted (or, for a `removed` ID: already gone, removal recorded). Row
numbers are fixed once written: a later change never renumbers. Give the file's absolute path
(`git rev-parse --path-format=absolute --git-path peak-workflow-0002/table.md`) on its own line with
the row count.

#### Presenting the gate

**The owner may not be technical, and reads only your chat text.** The terminal collapses tool
output to "Ran 1 shell command", so anything a command prints is invisible: paste it into your
own message. Never use the plan keys, `NN:line` shorthand, or a long markdown table in what the
owner reads (long table cells collapse into key/value lists in a terminal). Number every item by
its `table.md` row, so "item 37" means one thing everywhere.

Name each choice by its plain label; the briefing gives each one as a single bullet, worded as here:

| Plain label | Plan key | Briefing bullet |
|---|---|---|
| **Keep as the reason** | Rationale | saved next to the requirement as the reason it reads as it does |
| **Log as a past change** | History | saved in a history file saying what changed and why |
| **Replaced by another requirement** | Supersede | the requirement is deleted (or, if already gone, its removal is recorded); a history file names what replaced it |
| **No longer needed** | Retire | the requirement is deleted (or, if already gone, its removal is recorded); a history file says why |
| **Open question** | Pending | the change is recorded as undecided, and that requirement is flagged until someone decides |
| **Delete the note** | Drop | the note is thrown away (git history still has it) |

Sort the items into three groups:

- **Copied notes:** a Rationale whose `text` is its note minus the marker words, nothing else
  changed, attached to the requirement whose Scenario the note sits inside. A note just above a
  Scenario line (it may belong to the Scenario before) is a decision.
- **Housekeeping drops:** a Drop of a note that says nothing lasting (a TODO, a section reshuffle,
  a marker with no text), except on a requirement being replaced or retired: those notes are
  LOST lines in that removal's block.
- **Decisions:** everything else — Supersede, Retire, and Pending entries and `removed` IDs; other
  Drops; History entries; Rationale you reworded beyond marker words, merged, wrote, or attached
  from a section-level note (`tor` null); anything you narrowed or were unsure of.

**Ask about each item once.** A sidecar key or `#` note line is shown inside the question for the
entry it feeds; a section-level note is shown as that entry's item, with the Changed line *"This
note was about the whole section; I attached it to <ID>."* (in a removal block: *"This note marks
the whole section"*). A note that feeds several entries (a Rationale and a History) is one box
with one `TO:` line per entry and its BECOMES rows labelled by destination; when one of those
entries is a removal, the box goes inside that removal's question and not in a round. `edits` rows with no History entry are
not asked about; they are counted. **Counts are in questions and box items** — the units the owner
answers — and an item spanning several `table.md` rows is headed by all of them ("Items 31 + 32").

**1. Briefing** (one message, no items yet), in plain words:

- What is happening: the requirement files hold notes, markers, and comments written inside
  their Scenarios over time. This format does not allow them there, so each one moves to a
  permanent place. The wording of every requirement that stays does not change, and a check
  proves it afterward.
- One real example from this project, as a code block: a short Scenario excerpt with its note
  lines as they are today, then the same excerpt without them, then the `FROM:` and `TO:` lines
  (format below) saying where that note goes.
- The six choices, one bullet each, as in the table above.
- The stakes: *"<N> notes: <K> copied word for word (low risk), <H> housekeeping notes to drop,
  and <M> decisions (<F> from notes, <S> from git history) in about <Q> questions"*. <N> is
  <K> + <H> + <F>; say *"<X> of these combine several notes"* when the inventory count differs.
  `removed` IDs always count in <S>; <Q> counts the housekeeping question.
- Which live requirements would be deleted, by ID and title.
- *"<E> other past edits are logged under their commit message."*
- Nothing is written until the final Apply.

Then ask via `AskUserQuestion`, with no option marked recommended:

- Question: `"How do you want to review the notes?"`
- Options: `["Only the <M> decisions", "Every note", "Stop here"]` — the first's description:
  *"one at a time or in small rounds; the <K> copied notes are kept word for word, marker words
  removed, and you approve dropping the <H> housekeeping notes in one question"*; the second's: *"the decisions, then the
  housekeeping drops, then the copied notes in small rounds"*.

**2. Decisions**, in this order: Drops the helper forces (a reason for a requirement with no
companion entry), then removals, pending, and other Drops, one per question; then all altered
text (History and Rationale) in rounds; then the housekeeping drops. Items that share one decision (26 requirements replaced
by one feature) are one question.

- **Replaced, No longer needed, Open question:** one code block showing each affected
  requirement's title (`<ID> — <title>`; for a `removed` ID, read it with `tor-lifecycle text
  <TOR> --rev <sha>^1`, `<sha>` being the commit that removed it), for Replaced an arrow to each successor's `<ID> —
  <title>` (when you narrowed successors from an epic or file, list the others below as `<ID> —
  <title> (not a successor)`), then each record's title and reason as they will be saved, under its arrows, then the notes or sidecar
  keys it came from, word for word, and a `Keywords:` line (plus `Tracker:` and `Refs:` when set). For a Retire with `removal = "code"`, add: *"A later piece of
  work will remove the code that implements this, in <files>."* For Open question, add who owns
  it, and that the requirement is flagged until decided and blocks work after <threshold> days
  (a safety requirement at once).
- **A whole file goes:** when the preview has a `file-delete` row for a removal's requirements,
  say in its block *"Every requirement in <file> is removed, so the file and its .tracing.json file
  are deleted."* When that row lists `coverage_gaps`, add each gap's `note` (with its `source_ref`)
  word for word, then *"LOST: these known coverage gaps."*
- **Delete the note:** the note word for word, then *"LOST: all of this."* Drops of notes on
  requirements being replaced or retired go inside that removal's block as LOST lines, not as
  their own questions.
- Under the block: why you propose it, and the alternative. Ask `"Item <n>: <short decision>?"` (`"Items <a> + <b>: …"` for one spanning several rows)
  with options `["Yes, as shown", "Change it", "Stop here"]`, no option marked recommended. A
  forced drop (no companion entry) offers only `["Yes, drop it", "Stop here"]`.

**Altered text** (reworded, merged, or written Rationale; History titles and reasons) goes in rounds
of about 5 items, one code block per round. Before the first box, the legend: *"Each row is one
sentence. Left is what's there now; right is what it becomes."* Then, per item:

```
<n>. <TOR-ID> — <requirement title>
FROM: docs/requirements/<NN-name>.feature.md, lines <a>–<b> (the note is removed from here)
      (or: epic-<id> status file, key "revised")
TO:   docs/requirements/<NN-name>.feature.tracing.json → entry "<TOR-ID>" → field "rationale"
+------------------------------------------------------+------------------------------------------------------+
| NOW                                                  | BECOMES                                              |
+------------------------------------------------------+------------------------------------------------------+
| <one sentence or clause of the note>                 | <its rewrite, or "(unchanged)">                      |
+------------------------------------------------------+------------------------------------------------------+
Changed: <what changed, all in one line>. LOST: <each dropped detail>, or LOST: nothing.
```

Both columns are 52 characters wide, each original sentence its own row, wrapped so the columns
line up. Render the boxes with the helper, never by hand: write the round's items to
`<scratch>/box-<r>.json` (`[{"n", "tor", "title", "from": [...], "to": [...], "above", "rows":
[[now, becomes], ...], "changed", "lost"}]`, `above` only when set) and paste the output of
`tor-lifecycle box "<scratch>/box-<r>.json"` into the round's code block. The legend ends *"If the
boxes look jumbled, say so and I'll stack them."*; when the owner says so, re-render this and every
later round with `--stacked` (NOW above BECOMES). A merged item has one `FROM:`
line per source note, with its NOW rows grouped by source in that order. For History, `TO:` is *"a
new history file in docs/requirements/changes/"* (*"<n> history files, one per commit that edited it"* when
more than one commit did), and the BECOMES column holds the title, then the
reason; for an entry written from a diff, `FROM:` names the commit (no "removed from here"), the
line *"Requirement wording untouched; this logs a past edit."* goes above the box, its Changed
line reads *"Changed: past edit logged. LOST: nothing."*, the NOW column
holds the requirement's sentences from the diff labelled *"Before <date>:"* and *"After:"*, word
for word, and the BECOMES cells start *"Title:"* and *"Reason:"*. A cell whose text moves
elsewhere says where in plain words (*"(moved to the history file in docs/requirements/changes/)"*).
Then ask `"Round <r> of <T> (items <a>, <b>, … above): save the BECOMES text as shown?"` with
options `["Save as shown", "Change some", "Stop here"]`, no option marked recommended.

**Housekeeping drops** are one question on either path: each note word for word in one code
block, then *"LOST: all of these."* — `"Drop these <H> housekeeping notes?"` with options
`["Yes, drop them", "Change some", "Stop here"]`. **Every note** then shows the copied notes in the
same boxes, about 5 per round.

**Changes.** On **Change it**, **Change some**, or **Change something**, ask in chat *"Which item
numbers, and what should change?"*, take the owner's words, rewrite `plan.json` and `table.md`, and
re-run the preview. The other items in that question or round are accepted as shown. Re-show only the changed items, in the format they were shown in, and ask about
just those. An item whose choice changed (Keep as the reason → Delete the note) is re-asked in its
new form. On **Stop here**, end the session: the branch keeps the commits made so far, the answers
given at this gate are not kept, and a later run starts the gate again. After a change at Apply,
ask Apply again.

**3. Apply.** One message: counts per plain label, the past edits logged under their commit
message, the live requirements to be deleted by ID and title, any whole files deleted (with how many coverage gaps they lose) (and, separately, already-removed ones whose removal is recorded), and the items changed through a Change
option. Then ask via `AskUserQuestion`, with no option marked recommended:

- Question: `"Apply these choices? Each note is saved or dropped as shown; <D> requirements are deleted as listed, and every other requirement keeps its wording."`
  (with no deletions: `"…saved or dropped as shown; no requirement's wording changes."`)
- Options: `["Apply", "Change something", "Stop here"]`

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
tracker, refs). Fill each row's `Saved as` in `table.md`, and every BECOMES column, from this output, not from your draft, so the
owner reads exactly what will be written. Two row kinds write nothing: `file-delete` (every
requirement in a feature file is removed; shown at the gate as above) and `warning` (a Supersede
entry wide enough to link many old IDs to many successors). For a `warning`, check the entry
against "Successors are the requirements that take over": split it into one entry per successor
group, or, when every old requirement really is replaced by every successor, say so in that
removal's block (*"Each of these <a> requirements is replaced by all <b> successors."*). Exit 2 names what is unclassified, inconsistent, or would be lost (a second entry for one
requirement, a History entry with no edit, a source listed twice in one entry, or both cited and dropped): fix the plan — asking the user only
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
