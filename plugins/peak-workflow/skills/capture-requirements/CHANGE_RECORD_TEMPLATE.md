# Change Record Template — `/peak-workflow:capture-requirements`

One Change Record per decision, written to `docs/requirements/changes/<YYYY-MM-DD>-<suffix>.toml`.
The examples below show the shape of each kind. They are examples, not the schema: the schema's
only definition is `tor_lifecycle.py`, and every record is checked with

```bash
sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" validate docs/requirements/changes/<file>.toml
```

Fix every problem it prints (exit 1) and run it again until it prints `ok`.

## Filling a record

| Field | Where the value comes from |
|---|---|
| file name, `id`, `date` | `date` = today (`date +%Y-%m-%d`); `<suffix>` = 7 characters generated exactly like a TOR suffix (capture-requirements Step 3A.3; regenerate when all digits or already used in `changes/`); `id = "CR-<suffix>"` |
| `approved_via` | `"docs-branch"` for every record capture-requirements writes (start-epic writes `"epic-branch"`, wrapup-epic `"wrapup"`, quick-fix `"quick-fix"`) |
| `approved_by` | `git config user.name` — never ask the user to type a name |
| `refs` | Issues, epics (`"epic <id>"`), and other records (`"CR-…"`) this one answers. A record that resolves or renews a `pending` record **must** list that record's ID. May be empty |
| `keywords` | 3–6 nouns (records written by upgrade step 0002 may carry 2) and phrases someone would use to propose the idea again — the re-litigation search reads them with `title` and `reason` |
| `fingerprint`, `from`, `to` | Never computed by hand. The old text is `tor-lifecycle text <TOR> --verified --json` for a requirement changed since it was verified, `--rev <merged commit>` for one edited without a record (capture-requirements 3C step 3), and `--rev <base>` otherwise; the current text is `tor-lifecycle fingerprint` |
| `text` | The old Scenario block verbatim, from the same `text` command. A block ending in `"` needs that quote escaped (`\"`) before the closing `"""` |
| `traced_to` | The deleted tracing entry's sources as short strings (`"vision §6"`, `"conops S2.3"`, `"CLAUDE.md UX Baseline: Forms"`) |

Records are write-once after merge. Before merge, on this branch, a record this run wrote may be
corrected in place.

## supersede — meaning change, new ID in place

```toml
id = "CR-k3P9xQa"
date = 2026-10-26
kind = "supersede"
title = "Page size grows from 10 to 25 rows"
reason = """
Users scan long lists on wide screens; 10 rows forced constant paging (issue #41)."""
approved_via = "docs-branch"
approved_by = "A. Maintainer"
refs = ["issue #41"]
keywords = ["page size", "pagination", "rows per page"]

[[changes]]
tor = "TOR-03-xaiEdg3"
feature_file = "03-orders.feature.md"
fingerprint = "9d04c1e7a2b8"        # the old text's fingerprint
successors = ["TOR-03-Qm4rT8v"]     # one = replace; several = split
traced_to = ["vision §6", "conops S1.1"]   # the deleted tracing entry's sources
text = """
Scenario: [TOR-03-xaiEdg3] The application shall show at most 10 orders per page
    Given 30 orders exist
    When the user opens the Orders List (S-01)
    Then exactly 10 order rows should be visible"""
```

## reword — same meaning, same ID, with test evidence

```toml
id = "CR-Hn2wQ8d"
date = 2026-10-26
kind = "reword"
title = "Call the settings file the settings store where it is only a label"
reason = "Terminology catch-up; no step names the storage mechanism."
equivalence = "No plausible implementation passes one version and fails the other."
approved_via = "docs-branch"
approved_by = "A. Maintainer"
refs = []

[evidence]
commit = "1a2b3c4"                  # the commit the citing tests ran on
result = "pass"
tests = ["tests/test_settings.py"]

[[changes]]
tor = "TOR-01-DyRB0pM"
from = "51c0e9a7d3f2"               # fingerprint before
to = "a8e14b20c9d6"                 # fingerprint after
```

## retire — behavior withdrawn, no successor

```toml
id = "CR-p2Lk9Vb"
date = 2026-10-26
kind = "retire"
title = "Remove the legacy CSV export"
reason = """
The export API replaced CSV export; keeping it is an unowned second code path."""
approved_via = "docs-branch"
approved_by = "A. Maintainer"
refs = []
keywords = ["CSV", "legacy export", "download"]
removal = "code"                    # "code" = still in code, needs a removal epic; "none" = never built or already gone

[[changes]]
tor = "TOR-08-8tmnLhA"
feature_file = "08-export.feature.md"
fingerprint = "3b7a91d0e6c4"
traced_to = ["vision §6", "conops S4.2"]
text = """
Scenario: [TOR-08-8tmnLhA] The application shall export the order list as CSV
    ..."""
```

## pending — known wrong, not changed yet

```toml
id = "CR-Wq7nR2c"
date = 2026-10-26
kind = "pending"
title = "Item type rename descoped; requirement still demands it"
reason = """
The vision dropped the rename, but no replacement wording is agreed yet."""
approved_via = "docs-branch"
approved_by = "A. Maintainer"
owner = "A. Maintainer"             # who must resolve it (git config user.name)
tracker = "https://github.com/example-org/example-app/issues/123"   # optional
refs = []
keywords = ["item type", "rename"]

[[changes]]
tor = "TOR-26-CEadAmF"
feature_file = "26-item-type-rename.feature.md"
fingerprint = "5e2c0a9b7d14"        # the current text's fingerprint
```

## uphold — a disputed requirement stands as written

Closes an open `pending` record without changing the requirement. The feature file and tracing
sidecar are not touched. `refs` must name the open pending record (the latest renewal, if any);
`validate` checks that it names this requirement.

```toml
id = "CR-Up4hLd2"
date = 2026-10-26
kind = "uphold"
title = "Item type rename stays required"
reason = """
The owner checked with support: customers still ask for the rename, so the requirement stands."""
approved_via = "docs-branch"
approved_by = "A. Maintainer"
refs = ["CR-Wq7nR2c"]
keywords = ["item type", "rename", "upheld"]

[[changes]]
tor = "TOR-26-CEadAmF"
feature_file = "26-item-type-rename.feature.md"
fingerprint = "5e2c0a9b7d14"        # the current text's fingerprint (tor-lifecycle fingerprint)
```
