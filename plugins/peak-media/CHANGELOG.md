# Changelog — peak-media

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — UNDER DEVELOPMENT

### Added

- **v1 file contracts** — JSON Schemas for the spine manifest, `plates.json` and brand packs, each carrying `schemaVersion: 1`.
- **`validate` script** — checks any contract file against its schema plus cross-references, and imports a legacy `narration.json` as a spine manifest.
