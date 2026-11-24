# Epic Sh4Cfg9: Settings check

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** —
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/shelf-baseline

---

## Description

Adds the `shelf config` command, which checks the reader's settings file (the file named by
`SHELFRC`, or else `.shelfrc` in the home directory) and reports a problem in one line that
names the file, what is wrong and what to do. This epic only checks the file; the page and the
chart start using the settings in later work. It depends on no other epic.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-04-Cf1Ok3a | `docs/requirements/04-settings.feature.md` |
| TOR-04-Cf2Er6b | `docs/requirements/04-settings.feature.md` |
| TOR-04-Cf3Uk9c | `docs/requirements/04-settings.feature.md` |
| TOR-04-Cf4Ty2d | `docs/requirements/04-settings.feature.md` |

## Key Components

- `src/commands/config.js` — find, read and check the settings file (create)
- `test/config.test.js` — one `node:test` case per requirement, with `SHELFRC` pointing into a temporary directory (create)
