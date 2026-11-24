# Epic Lg4Fx2q: Currency conversion

**Phase:** 2 — Extras
**Status:** Not Started
**Dependencies:** Lg1Csv7
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

Adds the `ledger convert --to <currency>` command, which prints every transaction with its
amount converted at the rate in `rates.csv` and rounded to whole cents. With `--live` the rates
are fetched from the address in `LEDGER_RATES_URL` instead — the one place the tool touches the
network — and a failed fetch tells the user to run without `--live`.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-04-Cv1Rt3m | `docs/requirements/04-convert.feature.md` |
| TOR-04-Rd2Hf6n | `docs/requirements/04-convert.feature.md` |
| TOR-04-Uk3Cr9p | `docs/requirements/04-convert.feature.md` |
| TOR-04-Lv4Ft2q | `docs/requirements/04-convert.feature.md` |
| TOR-04-Lf5Er7r | `docs/requirements/04-convert.feature.md` |

## Key Components

- `src/index.js` — route the `convert` command (modify)
- `src/convert.js` — convert and round each amount, print the lines (create)
- `src/rates.js` — read rates from `rates.csv`, or fetch them from the rates address for `--live` (create)
- `test/convert.test.js` — one `node:test` case per requirement, run in a temporary directory (create)
