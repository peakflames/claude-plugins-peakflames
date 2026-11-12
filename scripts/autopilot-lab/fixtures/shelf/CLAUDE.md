# CLAUDE.md — shelf

## Project Overview

`shelf` is a reading-list command-line tool. One person runs it in a terminal to keep a list of
books in a local `shelf.json` file, mark books finished, and write two pages to open in a
browser: the reading list, and a chart of pages read per month. It needs no account and no
network.

## Tech Stack

| Layer | Choice |
|---|---|
| Language / runtime | JavaScript (ES modules, `"type": "module"`) on Node.js 22 or later |
| Package manager | npm — no dependencies, nothing to install |
| Tests | `node:test` with `node:assert/strict` (built into Node) |
| Storage | `shelf.json` in the current working directory |
| Lint / format | None — no linter is part of this project |
| Build | None — the source runs as written |
| CI | None — checks run locally |

The stack was read from the existing code (`package.json`). Do not add runtime or development
dependencies.

## Local Environment

- **Run:** `node bin/shelf.js <command>` (for example `node bin/shelf.js --version`)
- **Tests:** `node --test` (runs every `*.test.js` file under `test/`)
- Tests need no network, no keys and no browser. A test that touches `shelf.json` runs in its
  own temporary directory, never in the repository root.

Verification runs against the real, running project with its real local data. Never mock the
project's own API or database to make a check pass.

## Tool Hygiene & Operability

This section declares the project's conventions for the load-bearing tool-hygiene practices.
Each line is a baseline TOR requirement source — `/peak-workflow:capture-requirements` will
ensure at least one TOR exists per active line, written in the form appropriate to the
declared mechanism. Lines marked `N/A` are skipped. Project type and Version single source
of truth are declarations, not TOR sources.

**Project type:** CLI tool

**Version exposure:** `--version` flag printing `shelf v<semver>` to stdout with exit code 0.

**Version stamped at log startup:** The first log line emitted on process startup includes the
tool name and semantic version, in the Logging format below (`[INFO] shelf v0.1.0 starting`).
Log lines are written only when logging is switched on (see Logging convention).

**Version single source of truth:** `package.json#version`

**Logging convention:**
- Levels: DEBUG / INFO / WARN / ERROR
- Format: human-readable plain text to stderr; off by default, switched on with a `LOG_LEVEL` env var
- Configured at: `src/index.js`

**Exit code convention:** 0 — success; 1 — operational failure (no such book, unreadable or
malformed input); 2 — invalid invocation (unknown command or flag, missing argument).

**stdout / stderr discipline:** stdout — results and confirmations; stderr — errors, diagnostics
and log output.

**Error message standard:** User-facing errors name the problem AND the next user action.
Example: `Error: no book numbered 7. Run 'shelf list' to see the numbers.`

## Security Baseline

These are coding-standard reminders that apply to every epic. They are NOT requirements —
TORs verify positive observable behavior, and "do not X" invariants are hard to express as
Given/When/Then. They MUST be respected during implementation and reviewed during
`/peak-workflow:wrapup-epic`.

**No `shell=True` / `eval` with user input.**
Never pass user-supplied data to a shell interpreter without escaping. In Node.js, prefer
`child_process.execFile` over `exec`. Never use `eval` or `Function()` constructors on user
input.

**Do not log secrets or PII.**
Tokens, passwords, API keys, session IDs, and personally identifiable information must
never appear in logs. Review log output during `/peak-workflow:wrapup-epic` for accidental
leakage.

**No secrets committed to the repo.**
`.env`, credential files, private keys, and any configuration containing real secrets must
be in `.gitignore`.

`/peak-workflow:wrapup-epic` includes these as default review items unless the project type
makes them inapplicable.

## Peak Workflow

- [Product Vision](docs/product-vision-planning/product-vision.md)
- [Concept of Operations](docs/product-vision-planning/concept-of-operations.md)
- [Requirements Baseline](docs/requirements/) — TOR feature files and tracing sidecars
- [Implementation Plan](docs/implementation-plan/) — run `/peak-workflow:status` for the dashboard
- [Architecture](docs/architecture.md) and [Design Notes](docs/design-notes.md)

Commands: `/peak-workflow:discover`, `/peak-workflow:mockup`,
`/peak-workflow:capture-requirements`, `/peak-workflow:plan-project`, `/peak-workflow:add`,
`/peak-workflow:triage <issue|description>`, `/peak-workflow:start-epic <id>`,
`/peak-workflow:wrapup-epic <id>`, `/peak-workflow:pause`,
`/peak-workflow:quick-fix <issue|description>`, `/peak-workflow:refresh-docs`,
`/peak-workflow:status`, `/peak-workflow:setup`, `/peak-workflow:upgrade`,
`/peak-workflow:new-project`

## Verification & Quality Gates

**Test directories:** test/

Run every applicable check before marking an epic Implemented or Complete:

- **Build:** N/A — no build step; the source runs as written
- **Tests:** `node --test` (test/)
- **Lint / format:** N/A — no linter is part of this project
- **Run the tool:** `node bin/shelf.js --version` → `shelf v0.1.0`, exit code 0

## Important Reminders

- No dependencies: use only the Node.js standard library (`node:fs`, `node:path`, `node:test`, …).
- No network access, in the tool or in its tests.
- **One command, one file.** A command is `src/commands/<name>.js`, exporting `run(args, io)`
  and `summary`; `src/index.js` finds it by name. Adding a command never edits `src/index.js`
  or another command's file, and each epic's tests go in their own new file under `test/`.
- `CHANGELOG.md` and `README.md` are written at release time. An epic does not edit them.
- The reading list is `shelf.json` in the current working directory. It is git-ignored; tests
  create it only inside a temporary directory.
- Do not create large fixture files; generate any test data in memory or in a temporary directory.

## Reference Materials

- `docs/product-vision-planning/concept-of-operations.md` §3–§4 — the commands and the
  `shelf.json` shape.
- `samples/shelf.json` — a sample reading list for trying the tool by hand.

## Git Workflow

- **Base branch:** `develop`. Epic, docs, and quick-fix branches are cut from it and merge back
  into it.
- **Release branch:** `main`. It receives only release merges from `develop` and tagged releases.
- Epic feature branches: `feature/epic-<id>-<short-name>`, where `<id>` is the epic's ID and
  `<short-name>` comes from the epic spec filename (e.g. `epic-a3f2K7p-user-auth.md` →
  `feature/epic-a3f2K7p-user-auth`).
- Quick-fix branches: `hotfix/issue-<N>-<slug>` when tied to a GitHub issue, `hotfix/<slug>` otherwise.
- Merges use `--no-ff` to preserve history.
- Claude asks before every push to a remote.
- Never commit: `.env` and `.env.*` (except `.env.example`), credential and key files,
  `node_modules/`, or `shelf.json`.
- **Remote:** none — this project is not published; it has no `origin`.

## CRITICAL: Verification Before Commit Rule

**NEVER commit code changes before verification!**

A successful build (compile) does NOT equal working code. The workflow MUST be:

1. **Implement** — Make the code changes
2. **Lint** — No linter in this project; skip
3. **Build** — No build step; skip
4. **Verify** — Run `node --test`, then run the tool with a known input and check its output
5. **Commit** — ONLY after verification passed

**Why this matters:**
- Compiled code ≠ correct behavior
- Business logic needs functional testing
- Committing untested code pollutes git history with potential bugs

**Verification Workflow Example:**
```bash
node --test                                       # Run the tests
node bin/shelf.js --version                      # Run the tool with a known input
git add <files> && git commit -m "feat: ..."      # Commit after verification
```

## Release Protocol

**Prerequisites:** Must be on `develop` branch with a clean working tree.

**Steps:**

1. **Finalize CHANGELOG** — Change `## [X.Y.Z] — UNDER DEVELOPMENT` → `## [X.Y.Z] — YYYY-MM-DD` in `CHANGELOG.md`
   - Commit: `chore: release vX.Y.Z`

2. **Merge to main**
   ```bash
   git checkout main
   git merge develop --no-ff -m "Merge branch 'develop' into main for release vX.Y.Z"
   ```

3. **Tag the release** (on main)
   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z - Brief description"
   ```

4. **Merge back to develop**
   ```bash
   git checkout develop && git merge main --no-ff
   ```

5. **Post-release version bump** (on develop)
   - Bump the version in `package.json` → next version
   - Add `## [X.Y+1.0] — UNDER DEVELOPMENT` to `CHANGELOG.md`
   - Commit: `chore: bump version for next development cycle`

6. **Push** (ASK USER FIRST) — only once the project has a remote.

**Note:** There is no CI and no remote; a tag on `main` is the release record.
