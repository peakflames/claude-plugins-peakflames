# Changelog — claude-plugins-peakflames

This marketplace bundles independently versioned plugins and scripts, each with its own
changelog. This file only tracks marketplace-level releases; see the linked changelogs
for the history of each component.

| Component | Changelog |
|-----------|-----------|
| [peak-workflow](plugins/peak-workflow/CHANGELOG.md) | Requirements-driven epic workflow |
| [epic-workflow](plugins/epic-workflow/CHANGELOG.md) | Prose-acceptance-criteria epic workflow |
| [peak-media](plugins/peak-media/CHANGELOG.md) | Faceless motion-graphics video from web content |
| [scripts/claude-code-setup](scripts/CHANGELOG.md) | Claude Code status line installer |

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.6.0] — 2026-11-11

### Added

- **Bundles `peak-media` v0.3.0** — Windows x64 and Linux x64 support (beta) alongside macOS, verified by a 3-OS CI matrix. Breaking: `scripts/setup.mjs` replaces `setup.sh`. See the [peak-media changelog](plugins/peak-media/CHANGELOG.md).

## [1.5.0] — 2026-11-10

### Added

- **Bundles `peak-media` v0.2.0** — adds `/peak-media:web2video` (a page or folder to an MP4 for a named destination, with presets, sign-in and one approval) and breaking `video-capture` changes: `beat()` storyboards and `--out` as the MP4. See the [peak-media changelog](plugins/peak-media/CHANGELOG.md).

## [1.4.0] — 2026-11-10

### Added

- **Bundles `peak-media` v0.1.0** — a new plugin for faceless motion-graphics video from web
  content: narration spine, HyperFrames and live-capture plates, assembly with audio and a brand
  outro. macOS only.

## [1.3.1] — 2026-11-05

### Fixed

- **Bundles `peak-workflow` v3.0.1** — Windows fixes for the `tor-lifecycle` helper (UTF-8 output,
  kept line endings) and step 0002 keeping a wrapped reference-screen note whole.

## [1.3.0] — 2026-11-04

### Changed

- **Bundles `peak-workflow` v3.0.0** — a major release: a requirements lifecycle (amend,
  supersede, retire, pending, uphold), the `tor-lifecycle` helper, and `/peak-workflow:upgrade`.
  2.1 projects must run `/upgrade`; Python 3.11+ required.
- **Bundles the `claude-code-setup` scripts v0.1.1** — setup scripts detect a node that won't
  start. `epic-workflow` v2.5.1 is unchanged.

## [1.2.0] — 2026-10-26

### Changed

- **Bundles `peak-workflow` v2.1.0** — team orientation (epic provenance, "new since you last
  looked", Ready to Start table, epic card before branching, freshness guard) and the RustFS fix
  for local S3. Also bundles `epic-workflow` v2.5.1 and the `claude-code-setup` scripts v0.1.0,
  both unchanged.

## [1.1.0] — 2026-09-16

### Changed

- **Bundles `peak-workflow` v2.0.0** — a major release: shape-driven stack selection, a
  defaults-first `setup`, and design skills invoked in every UI epic. Also bundles
  `epic-workflow` v2.5.1 and the `claude-code-setup` scripts v0.1.0, both unchanged.

## [1.0.0] — 2026-09-02

### Added

- **Initial marketplace release**, bundling `peak-workflow` v1.5.0, `epic-workflow`
  v2.5.1, and the `claude-code-setup` scripts v0.1.0.
