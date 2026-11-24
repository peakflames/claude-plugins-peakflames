# Epic Lg3Sum9: Monthly summary

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** Lg2Cat4
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

Adds the `ledger summary --month YYYY-MM` command, which prints a text table with one row per
category and that category's total for the month. It is the report the product exists for, so
it must stay quick on a ledger that holds every transaction the user has ever imported.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-03-Sm1Tb4f | `docs/requirements/03-summary.feature.md` |
| TOR-03-Mo2Fl7g | `docs/requirements/03-summary.feature.md` |
| TOR-03-Em3Pt2h | `docs/requirements/03-summary.feature.md` |
| TOR-03-Bd4Mn5j | `docs/requirements/03-summary.feature.md` |
| TOR-03-Pf5Tn8k | `docs/requirements/03-summary.feature.md` |

## Key Components

- `src/index.js` — route the `summary` command (modify)
- `src/summary.js` — select the month, total per category, format the table (create)
- `test/summary.test.js` — one `node:test` case per requirement, run in a temporary directory (create)
