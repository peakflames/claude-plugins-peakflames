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
- **`video-plates` skill and `render-plate`** — motion (kinetic type) and slide (deck) templates driven by brand tokens and local GSAP; each plate renders alone to its planned duration, with lint/strict checks, contact sheets, and a text-fit guard (27 px minimum); motion text is centred and wraps rather than shrinking, and table rows and bullets reveal one at a time.
- **Vendored HyperFrames references** — six HyperFrames skills from a pinned upstream commit, kept as read-only references (Apache-2.0, telemetry lines removed, every change listed in `VENDORED.md`).
- **`video-assemble` skill** — `assemble` composites rendered plates onto the spine, checks every cut lands in silence (failing with the timecode), appends the brand outro and writes `out/final.mp4` to the delivery spec (`--export 1080p60` option).
- **`remux-audio`** — lays music and SFX stems under the narration (music about 12 dB under the voice, ducked between lines) without re-encoding the picture.
- **`capture` (video-capture)** — plays a live page in real time from a storyboard and screen-captures it with Playwright `page.screencast`, timed to the spine; silent, captions or spine-timed mode, and a live plate lasts its planned duration to the frame. Pages answering HTTP errors are refused.
- **Captions, mux and take manifest** — captions on by default (`--no-captions`, `--caption-css`, `--caption-engine overlay|dom`); `--mp4` lays the spine's narration at −16 LUFS to the delivery spec; each take writes a manifest whose `command[]` reproduces it; picture-to-voice sync measured at about +18 ms.
- **`check-take`** — fails a take whose scene changes don't sit inside ≥ 900 ms of silence, or a narrated take where no change is detected (`--expect-cuts`).
- **Storyboard API reference and example deck** — `references/storyboard-api.md` and a neutral 3-slide deck whose storyboard runs unchanged in all three modes.
- **Neutral default brand pack** — `brand-packs/default` with Inter and JetBrains Mono (OFL, bundled woff2), design tokens, a placeholder logo, a 3 s outro and music rules; no music ships, and a rebrand is a re-render with `--brand`.
- **`plate-factory` orchestrator** — `/peak-media:plate-factory` runs brief → script → spine → plate list → storyboard → plates → composite → audio → export, with a gate line per stage; shows each artifact before asking for approval; storyboard stills approved before any animation; up to 3 self-review rounds per plate, then an independent reviewer.
- **`retime-plates`** — sets every plate's start and duration from its spine beat (one plate per beat), so plate timing always matches the real narration.
- **`validate` script** — checks any contract file against its schema plus cross-references, and imports a legacy `narration.json` as a spine manifest.
