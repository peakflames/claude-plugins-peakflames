# Changelog — claude-plugins-peakflames

This marketplace bundles independently versioned plugins and scripts, each with its own
changelog. This file only tracks marketplace-level releases; see the linked changelogs
for the history of each component.

| Component | Changelog |
|-----------|-----------|
| [peak-workflow](plugins/peak-workflow/CHANGELOG.md) | Requirements-driven epic workflow |
| [epic-workflow](plugins/epic-workflow/CHANGELOG.md) | Prose-acceptance-criteria epic workflow |
| [peak-mods](plugins/peak-mods/CHANGELOG.md) | Bundle of Claude Code mods (`file-tree`) |
| [scripts/claude-code-setup](scripts/CHANGELOG.md) | Claude Code status line installer |

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — 2026-10-16

### Added

- **Bundles `peak-mods` v0.1.0** — a new plugin of Claude Code mods; its first mod, `file-tree`,
  adds an Explorer-style Files pane (`/files`). Also bundles `peak-workflow` v2.0.0,
  `epic-workflow` v2.5.1 and the `claude-code-setup` scripts v0.1.0, all unchanged.

## [1.1.0] — 2026-09-16

### Changed

- **Bundles `peak-workflow` v2.0.0** — a major release: shape-driven stack selection, a
  defaults-first `setup`, and design skills invoked in every UI epic. Also bundles
  `epic-workflow` v2.5.1 and the `claude-code-setup` scripts v0.1.0, both unchanged.

## [1.0.0] — 2026-09-02

### Added

- **Initial marketplace release**, bundling `peak-workflow` v1.5.0, `epic-workflow`
  v2.5.1, and the `claude-code-setup` scripts v0.1.0.
