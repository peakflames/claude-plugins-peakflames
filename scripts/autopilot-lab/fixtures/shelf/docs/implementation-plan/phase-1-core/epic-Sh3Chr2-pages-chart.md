# Epic Sh3Chr2: Pages chart

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** Sh1Add4
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/shelf-baseline

---

## Description

Adds the `shelf chart --out <file>` command, which writes one self-contained HTML page
holding an inline SVG bar chart: a bar per month in which a book was finished, labelled with
the month and the pages finished in it. Whether the picture reads well is judged by a person
opening the page, not by a test.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-03-Ch1Wr3w | `docs/requirements/03-chart.feature.md` |
| TOR-03-Ch2Lb6x | `docs/requirements/03-chart.feature.md` |
| TOR-03-Ch3Sc1y | `docs/requirements/03-chart.feature.md` |
| TOR-03-Ch4Lk7z | `docs/requirements/03-chart.feature.md` |

## Key Components

- `src/commands/chart.js` — build the SVG and the HTML page from the reading list (create)
- `test/chart.test.js` — one `node:test` case per automated requirement, run in a temporary directory (create)
- `tests/manual/TOR-03-Ch4Lk7z.md` — the checklist a person follows to look at the chart (create)
