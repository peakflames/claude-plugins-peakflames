# Changelog — peak-media

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — UNDER DEVELOPMENT

### Added

- **v1 file contracts** — JSON Schemas for the spine manifest, `plates.json` and brand packs, each carrying `schemaVersion: 1`.
- **`setup.sh`** — installs the pinned HyperFrames, Playwright, GSAP and ajv into the plugin data dir and fetches the render browser; safe to re-run, `--check` reports what's missing.
- **Verify tools** — `contact-sheet` (time-labelled frame grid), `probe-spec` (MP4 delivery spec) and `check-cuts` (every cut inside a silent gap).
- **Minimal motion-plate template** — kinetic type with brand tokens and local GSAP; renders identically offline.
- **`video-spine` skill and `spine` script** — turn a brief and a beat-tagged `script.md` into `spine/manifest.json` + `narration.wav`, or a no-network `beatgrid.json` without a key; beats sit ≥ 400 ms apart, with a ±10% runtime gate and a wpm table.
- **Spine TTS layer** (`lib/tts`, `sample-voice`) — OpenRouter speech with zero data retention on every request, cache-compatible with the old recorder (plus legacy cache dirs), an offline `fake/tone` provider, and a wpm table that warns on slow clips.
- **`video-plates` skill and `render-plate`** — motion (kinetic type) and slide (deck) templates driven by brand tokens and local GSAP; each plate renders alone to its planned duration, with lint/strict checks, contact sheets, and a text-fit guard (27 px minimum).
- **Vendored HyperFrames references** — six HyperFrames skills from a pinned upstream commit, kept as read-only references (Apache-2.0, telemetry lines removed, every change listed in `VENDORED.md`).
- **Neutral default brand pack** — `brand-packs/default` with Inter and JetBrains Mono (OFL, bundled woff2), design tokens, a placeholder logo, a 3 s outro and music rules; no music ships, and a rebrand is a re-render with `--brand`.
- **`validate` script** — checks any contract file against its schema plus cross-references, and imports a legacy `narration.json` as a spine manifest.
