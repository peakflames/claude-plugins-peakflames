# Epic Sh2Pag6: Reading page

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** Sh1Add4
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/shelf-baseline

---

## Description

Adds the `shelf page --out <file>` command, which writes the reading list as one
self-contained HTML page: every book with its author, with the finished books told apart from
the ones still to read. Whether the page can be taken in at a glance is judged by a person
opening it, not by a test.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-02-Pg1Wr5s | `docs/requirements/02-page.feature.md` |
| TOR-02-Pg2Sc8t | `docs/requirements/02-page.feature.md` |
| TOR-02-Pg3Es4u | `docs/requirements/02-page.feature.md` |
| TOR-02-Pg4Gl9v | `docs/requirements/02-page.feature.md` |

## Key Components

- `src/commands/page.js` — build the HTML page from the reading list (create)
- `test/page.test.js` — one `node:test` case per automated requirement, run in a temporary directory (create)
- `tests/manual/TOR-02-Pg4Gl9v.md` — the checklist a person follows to look at the page (create)
