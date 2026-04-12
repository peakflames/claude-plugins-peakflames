# Changelog — epic-workflow

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.3.0] — 2026-04-12

### Changed

- **Branch naming convention: `feat/epic-N` → `feature/epic-N-<short-name>`** — feature
  branches now derive a descriptive short name from the epic spec filename. For example,
  `epic-3-user-auth.md` produces branch `feature/epic-3-user-auth`. If the spec filename
  has no suffix after `epic-N`, the branch falls back to `feature/epic-N`.
- **`start`: Step 1 extracts branch short name (new item 5)** — the short name is derived
  from the spec filename during context loading and used in Step 3 for branch creation.
- **`start`: Step 3 uses new branch format** — creates `feature/epic-N-<short-name>`
  instead of `feat/epic-N`.
- **`wrapup`: Step 1.1 uses new branch format with backwards compatibility** — checks out
  `feature/epic-N-<short-name>` first, falls back to legacy `feat/epic-N` for sessions
  started before v1.3.0.
- **`wrapup`: Step 5 uses actual branch name** — merge and cleanup reference the branch
  checked out in Step 1.1, supporting both new and legacy naming.
- **`setup`: Git Workflow audit and questions include branch naming convention** — the
  Step 2 audit checks for `feature/epic-N-<short-name>` documentation, and Step 3
  instructs the agent to include it when populating the Git Workflow section in CLAUDE.md.

---

## [1.2.0] — 2026-04-12

### Added

- **`wrapup`: Automatic doc refresh via Haiku subagent (Step 4)** — after Phase 3
  orientation, always spawns a Haiku subagent (model shorthand `haiku`, resolves to
  current version) to execute `/epic-workflow:refresh-docs` and auto-commit the results.
  Runs on the feature branch before the final merge so refreshed docs are included in
  the merge commit.

### Changed

- **`wrapup`: Removed optional documentation nudge (Step 3.5)** — the manual currency
  check and "consider running refresh-docs" prompt are replaced by the automatic Step 4
  refresh. The Next Steps template no longer includes a Documentation Refresh section.
- **`wrapup`: Merge step renumbered** — "Step 4: Merge to Main" is now "Step 5" to
  accommodate the new doc refresh step.

---

## [1.1.0] — 2026-04-12

### Added

- **`start`: Feature branch automation (Step 3)** — automatically creates and checks out
  `feat/epic-N` before entering plan mode. Detects existing branch on resume and confirms
  rather than re-creating it.

- **`start`: Auto-commit after implementation (Step 11)** — commits all changes on
  completion without prompting the user. Stages specific files (not `git add -A`).

- **`start`: Next-steps nudge (Step 12)** — always presents a terse post-commit block
  pointing the user to `wrapup`, `status`, or re-running `start` to continue on the
  same branch.

- **`wrapup`: Branch checkout at load time (Step 1.1, item 7)** — checks out
  `feat/epic-N` at the start of wrapup so verification runs on the feature branch.
  Graceful fallback if the branch doesn't exist (older sessions that worked on main).

- **`wrapup`: Auto-commit after completion (Step 2.3)** — commits handoff file and
  index update without prompting the user.

- **`wrapup`: Merge to main as final step** — after Phase 3 orientation is complete,
  merges `feat/epic-N` into main with `--no-ff`, deletes the feature branch, and
  reports back. Placed last so any Phase 3 document touches remain on the branch
  until everything is finalized.

### Changed

- **`start`: Steps renumbered** — old Steps 3–10 are now Steps 4–11 to accommodate
  the new feature branch step.

---

## [1.0.0] — 2026-04-06

Initial release with 9 skills covering the full epic lifecycle:
`discover`, `plan-project`, `setup`, `add`, `start`, `pause`, `wrapup`, `status`,
`refresh-docs`.
