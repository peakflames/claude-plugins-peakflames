# Changelog — epic-workflow

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
