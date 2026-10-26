# Changelog — peak-mods

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — 2026-10-16

### Added

- **`peak-mods` bundle** — one plugin that holds many Claude Code mods, each behind its own
  `userConfig` toggle.
- **`file-tree` mod and `/files`** — a pane showing the working directory as an expandable
  tree; folders list lazily, symlinks are marked `→` and not followed.
- **Read-only file viewer** — selecting a file swaps the pane to the file with a line-number
  gutter; `b` or Back returns to the same row.
- **Viewer limits** — first 2,000 lines or 256 KB with a truncation note; binary files show
  one line; `a` adds `@<path>` to the prompt.
- **Live refresh** — the tree and an open file update after Write, Edit, NotebookEdit or Bash,
  and every 5 seconds while the pane is open.
- **Options** — `enableFileTree`, `fileTreeAutoOpen` and `fileTreeIgnore`, editable in
  `/config`.
