# Epic Lg2Cat4: Categorization rules

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** Lg1Csv7
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

Adds the `ledger categorize` command. It reads the user's rules from `rules.txt` in the current
directory and writes a `category` onto every transaction in `ledger.json`: the category of the
first rule whose pattern matches the description, or `uncategorized`. Matching ignores letter
case and extra spaces, because banks vary both between exports — but the stored description is
the user's record of what the bank said and is not changed.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-02-Rc1Ld5a | `docs/requirements/02-categorize.feature.md` |
| TOR-02-Fm2Wn8b | `docs/requirements/02-categorize.feature.md` |
| TOR-02-Un3Ct6c | `docs/requirements/02-categorize.feature.md` |
| TOR-02-Ci4Ws7d | `docs/requirements/02-categorize.feature.md` |
| TOR-02-Mr5Er9e | `docs/requirements/02-categorize.feature.md` |

## Key Components

- `src/index.js` — route the `categorize` command (modify)
- `src/categorize.js` — read the rules, match each description, write the categories (create)
- `src/rules.js` — parse `rules.txt` into ordered category and pattern pairs (create)
- `test/categorize.test.js` — one `node:test` case per requirement, run in a temporary directory (create)
