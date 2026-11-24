# Epic Lg5Chr8: Spending chart

**Phase:** 2 — Extras
**Status:** Not Started
**Dependencies:** Lg3Sum9
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

Adds the `ledger chart --month YYYY-MM --out <file>` command, which writes one self-contained
HTML page holding an inline SVG bar chart: a bar per category, labelled with the category and
its total for the month. It reuses the monthly summary's totals. Whether the picture reads well
is judged by a person opening the page, not by a test.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-05-Ch1Wr4s | `docs/requirements/05-chart.feature.md` |
| TOR-05-Ch2Lb7t | `docs/requirements/05-chart.feature.md` |
| TOR-05-Ch4Sc9v | `docs/requirements/05-chart.feature.md` |
| TOR-05-Ch3Lk2u | `docs/requirements/05-chart.feature.md` |

## Key Components

- `src/index.js` — route the `chart` command (modify)
- `src/chart.js` — build the SVG and the HTML page from the month's totals (create)
- `test/chart.test.js` — one `node:test` case per automated requirement, run in a temporary directory (create)
- `tests/manual/TOR-05-Ch3Lk2u.md` — the checklist a person follows to look at the chart (create)
