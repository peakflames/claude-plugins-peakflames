# Epic Lg6Cfg3: Config validation and help

**Phase:** 1 — Core
**Status:** Not Started
**Dependencies:** —
**Planned by:** Todd Schavey
**Planned:** 2026-11-11
**Plan branch:** docs/ledger-baseline

---

## Description

Adds `ledger --help`, a usage message when the tool is run with no arguments, and the
`ledger config` command, which checks the user's settings file (the file named by `LEDGERRC`,
or else `.ledgerrc` in the home directory) and reports a problem in one line that names the
file, what is wrong and what to do. It depends on no other epic.

## Requirements Anchors

> The TOR requirement IDs listed below are the acceptance criteria and verification baseline for
> this epic. Each ID maps to a Gherkin scenario in the referenced feature file, which is the only
> place its title and text live.
> `/peak-workflow:start-epic` reads each TOR's Given/When/Then to drive implementation and tests.
> `/peak-workflow:wrapup-epic` independently verifies each TOR's Given/When/Then is satisfied.

| TOR ID | Feature File |
|--------|--------------|
| TOR-06-Hp1Us5w | `docs/requirements/06-cli.feature.md` |
| TOR-06-Hp2Nc8x | `docs/requirements/06-cli.feature.md` |
| TOR-06-Cf3Vd2y | `docs/requirements/06-cli.feature.md` |
| TOR-06-Cf4Er6z | `docs/requirements/06-cli.feature.md` |
| TOR-06-Cf5Uk9A | `docs/requirements/06-cli.feature.md` |

## Key Components

- `src/index.js` — route `--help`, the no-argument case and the `config` command (modify)
- `src/help.js` — the usage text, one line per command (create)
- `src/config.js` — find, read and validate the settings file (create)
- `test/help.test.js`, `test/config.test.js` — one `node:test` case per requirement; settings files live in a temporary directory (create)
