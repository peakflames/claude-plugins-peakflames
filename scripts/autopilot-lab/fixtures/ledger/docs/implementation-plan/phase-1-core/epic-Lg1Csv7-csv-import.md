# Epic Lg1Csv7: CSV import

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** —
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

Adds the `ledger import <csv>` command, which reads a bank's CSV export and stores its rows as
transactions in `ledger.json` in the current directory. Everything else the product does —
categorising, summarising, charting — reads that file, so the import has to produce data the
user can trust: one date format, exact integer cents, the bank's description kept exactly as
written, and no double counting when overlapping exports are imported.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-01-Kq7Rm2x | `docs/requirements/01-import.feature.md` |
| TOR-01-Zb4Nw9T | `docs/requirements/01-import.feature.md` |
| TOR-01-Hd3Yc8L | `docs/requirements/01-import.feature.md` |
| TOR-01-Vp6Js1G | `docs/requirements/01-import.feature.md` |
| TOR-01-Xt5Fa0M | `docs/requirements/01-import.feature.md` |

## Key Components

- `src/index.js` — route the `import` command to the importer (modify)
- `src/import.js` — read the CSV, normalise each row, skip duplicates, write the ledger (create)
- `src/csv.js` — CSV line parser that keeps quoted fields byte-for-byte (create)
- `src/store.js` — load and save `ledger.json` in the current directory (create)
- `test/import.test.js` — one `node:test` case per requirement, run in a temporary directory (create)
