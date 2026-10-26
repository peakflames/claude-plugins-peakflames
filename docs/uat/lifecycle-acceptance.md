# peak-workflow 3.0 — requirements-lifecycle acceptance (contributor kit)

This checks the 3.0 upgrade (`/peak-workflow:upgrade`, steps 0001 and 0002) against a **real
peak-workflow 2.1 project you cannot share**. You run everything on your machine, on copies.
What you send back is the output of a redacting runner: counts, requirement and epic IDs,
finding letters, record kinds, and timings. It never prints requirement text, titles, notes,
record reasons, or file names, and it refuses to print anything (exit 4) if its own check finds
protected text in the report.

Time: about 30 minutes per project, most of it reading the upgrade's classification table.

## What you need

- A clone of this repository on the 3.0 branch named in the request (the draft PR's head).
- Python 3.11 or newer (`python3 --version`).
- Claude Code with this branch's `peak-workflow` loaded (see step 2).
- A peak-workflow 2.1 project (no `docs/.peak-workflow.toml`, or one with `format = 0` or `1`).

## 1. Baseline (read-only)

```bash
python3.11 tests/peak-workflow/acceptance/run.py baseline /path/to/project > baseline.txt
```

The runner clones the project to a temporary folder and works only there; your project is not
touched (it does not even need a clean tree — only committed work is read). In the clone it
seeds fingerprints to preview what the upgrade will surface. Look at `baseline.txt` before
sending it: it should hold only numbers, IDs like `TOR-04-AbC1234`, epic IDs, and letters.

If `prerequisites: ok: False`, the upgrade will refuse this project until the listed problems
(invalid tracing JSON, a Scenario ID defined twice) are fixed. Send the baseline anyway.

## 2. Upgrade a copy

```bash
git clone /path/to/project /tmp/project-upgrade && cd /tmp/project-upgrade
git checkout develop   # or the project's base branch
```

Start Claude Code in `/tmp/project-upgrade` with the branch's plugin, for example
`claude --plugin-dir /path/to/claude-plugins-peakflames/plugins/peak-workflow`, and run:

```
/peak-workflow:upgrade
```

Answer as the project's owner would. At step 0002's classification table, check each row: is a
note really current rationale, history, a replaced requirement, a retired one, an open change
request, or nothing to keep? Change rows that are wrong ("Change some rows") — that judgment is
the part no script can do, and the report counts what you approved. At the end choose
**"Leave the branch for now"** (do not push).

Note anything that confused you or that you had to work around; send those notes with the
reports (paraphrased — no requirement text).

## 3. After report

Still in the upgraded copy, on the upgrade branch:

```bash
python3.11 /path/to/claude-plugins-peakflames/tests/peak-workflow/acceptance/run.py after . > after.txt
```

Then run `/peak-workflow:upgrade` once more and confirm it says the project is on format 2 with
nothing to upgrade (the re-run is a no-op).

## 4. Send back

`baseline.txt`, `after.txt`, the Claude Code version (`claude --version`), and your notes — on
the draft PR, or privately to the maintainer. Delete `/tmp/project-upgrade` afterwards.

## What the maintainer checks

| Check | Where in the reports |
|---|---|
| The upgrade reached format 2 and a re-run is a no-op | `after`: `format: current`, `rerun_pending` empty |
| Fingerprints identical for every surviving requirement | `after`: `fingerprints.changed` empty; `removed` = the IDs you retired or superseded |
| Every record valid, no `migration_source` left | `after`: `validate.problems: 0`, `records.with_migration_source: 0` |
| Changed since verified = the requirements edited after verification | `after`: `states.changed_since_verified` (compare with the baseline's `states_after_seed`) |
| Findings | `after`: `check.counts` and `check.ids` — A and B should be 0 (every pre-3.0 edit and deletion is recorded) |
| Timings | both: every helper call ≤ 10 s; `fingerprint` ≤ 2 s |

**Project A reference** (the #20 prototype): 429 Verified, 16 Changed since verified, and one
finding C (epic `fwseMVd`'s `requirements:` ending with `TOR-24 set`). The `after` report for
Project A should show `verified: 429`, those 16 IDs under `changed_since_verified`, and `C:
fwseMVd` — plus any `F` (`disputed`) rows for pending change-control notes you classified as
Pending.
