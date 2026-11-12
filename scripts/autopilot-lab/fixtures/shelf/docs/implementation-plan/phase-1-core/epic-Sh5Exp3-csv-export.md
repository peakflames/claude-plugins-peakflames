# Epic Sh5Exp3: CSV export

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** Sh1Add4
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/shelf-baseline

---

## Description

Adds the `shelf export --out <file>` command, which writes the reading list as a CSV file: a
header line, then one line per book in the order the books were added. It never overwrites a
file that is already there. The command is meant for scripts, so it prints nothing when it
succeeds; only an error produces output.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-05-Ex1Wr4e | `docs/requirements/05-export.feature.md` |
| TOR-05-Ex2Qt7f | `docs/requirements/05-export.feature.md` |
| TOR-05-Ex3Ov2g | `docs/requirements/05-export.feature.md` |

## Key Components

- `src/commands/export.js` — write the CSV file, quoting fields that need it (create)
- `test/export.test.js` — one `node:test` case per requirement, run in a temporary directory (create)
