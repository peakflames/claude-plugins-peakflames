# Epic Sh1Add4: Add and list

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** —
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/shelf-baseline

---

## Description

Adds the `shelf add`, `shelf list` and `shelf finish` commands, which keep the reading list in
`shelf.json` in the current directory. Everything else the product does reads that file, so
these commands have to leave data the reader can trust: titles and authors exactly as typed,
no book twice, and a finish date only on the book that was named.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-01-Ad1Bk3m | `docs/requirements/01-list.feature.md` |
| TOR-01-Ad2Dp6n | `docs/requirements/01-list.feature.md` |
| TOR-01-Ls3Nm8p | `docs/requirements/01-list.feature.md` |
| TOR-01-Fn4Dt2q | `docs/requirements/01-list.feature.md` |
| TOR-01-Fn5Rg7r | `docs/requirements/01-list.feature.md` |

## Key Components

- `src/commands/add.js`, `src/commands/list.js`, `src/commands/finish.js` — the three commands (create)
- `src/store.js` — load and save `shelf.json` in the current directory (create)
- `test/list.test.js` — one `node:test` case per requirement, run in a temporary directory (create)
