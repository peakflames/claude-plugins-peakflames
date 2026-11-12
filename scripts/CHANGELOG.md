# Changelog — scripts

All notable changes to the repo's standalone scripts (not part of a plugin) are
documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.2.0] — UNDER DEVELOPMENT

### Added

- **`autopilot-lab/fixtures/ledger/` seed (epic E1 only).** A pre-planned peak-workflow project
  for the autopilot proof of concept; passes `tor-lifecycle format` and `check`.
- **`autopilot-lab/spike/` P0 harness.** The stdio host and hook scripts used to answer the
  spike's questions; reference only, replaced by the driver in P1.
- **`autopilot-lab/lab.mjs reset`.** Builds the seeded six-epic `ledger` project for run A, B or
  C in a throwaway directory, byte-for-byte the same each time, and prints how to launch it.
- **`autopilot-lab/lab.mjs evaluate`.** Compares a finished autopilot run with the scenario's
  expected outcomes, runs the hidden oracle tests on the merged code, and writes `evaluation.json`.
- **`autopilot-lab/fixtures/ledger-full/` epics E2–E6.** Requirements, specs and sidecars with the
  planted traps; copied over the E1 seed by `reset`.
- **`autopilot-lab/oracle/` and `reference/`.** Hidden black-box tests per epic, and a reference
  `ledger` that passes them; neither is ever copied into a seeded project.
- **`autopilot-lab` scenario D.** `lab.mjs reset --run D` seeds a separate five-epic `shelf`
  project (`fixtures/shelf/`) built to reach the repair, unsettled-look and "Fix now" paths in
  real sessions; `scenarios/D.md` is the owner's walkthrough.
- **`autopilot-lab/oracle-shelf/` and `reference-shelf/`.** Hidden tests and a reference
  implementation for the `shelf` project; `evaluate --run D` judges the first launch.

## [0.1.1] — 2026-11-04

### Fixed

- **`setup.sh` detects a node that won't start.** Exits with a clear error instead of a
  raw `dyld` crash; on macOS Homebrew installs it suggests `brew upgrade node`.
- **`setup.ps1` detects a node that won't start.** Exits with the first lines of node's
  error and a reinstall hint (`winget install OpenJS.NodeJS.LTS` or nodejs.org).

## [0.1.0] — 2026-09-02

### Added

- **`claude-code-setup`: one-line Claude Code status line installer.** Cross-platform
  (macOS/Linux via `setup.sh`, Windows via `setup.ps1`) install of a standardized status
  line showing model, cwd, git branch, context-window usage, and session cost.
- **`setupHelper.js` as a dedicated, temp-directory-only installer.** Entry-point scripts
  download and run the installer from a temp directory rather than writing installer code
  into `~/.claude`; it fetches `statusline.js` to `~/.claude/statusline.js` and patches
  `settings.json` to point `statusLine` at it.
- **Team-standard permission defaults.** Install also sets `permissions.defaultMode` to
  `"bypassPermissions"` and `skipDangerousModePermissionPrompt` to `true` in
  `settings.json`, preserving any existing `permissions.allow`/`deny` lists.
- **Marker-based download validation and timestamped settings backups.** Both the
  installer and the renderer it fetches are checked for a version marker before use, and
  `settings.json` is backed up (`settings.json.bak.<timestamp>`) before every patch.
