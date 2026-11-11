# Changelog — peak-media

All notable changes to this plugin are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.2.0] — UNDER DEVELOPMENT

### Added

- **`web2video` skill** — `/peak-media:web2video` turns "make a video of this page" into an MP4: intake, one approval gate, sign-in, recording, checks and hand-off. It calls `video-capture` and `video-spine`; it never uploads or sends the file.
- **Storyboard helpers and visible cursor** — `goto`, `click`, `type`, `point`, `scrollTo` and `scrollBy` move an arrow pointer that survives navigation; `--no-cursor` hides it.
- **Output presets** — `capture --preset web|youtube|hifi` (default `web`) sets capture size, frame rate and encode; `probe-spec --preset` checks a file against one.
- **Sign-in** — `capture signin <url>` saves a session after the user signs in by hand (file 0600, outside the project); `--storage-state` starts a take signed in; `--headed` records in a visible window.
- **Take reports** — every take prints size, format, per-beat timing and page errors; the take manifest records them.
- **Hide before the first frame** — a storyboard's `export const hide = [...]` or `setup()` runs before recording starts, so private elements never reach frame 0.
- **`capture serve <dir>`** — serves a local folder on 127.0.0.1 for exploring a page before writing its storyboard.

### Changed

- **Breaking: `beat(id, fn?)` replaces `say()` and `waitForVoice()`** — caption and narration text live once in `script.md` or the spine; unknown, out-of-order, repeated, nested or uncalled beats stop the take with a one-line fix.
- **Breaking: `capture` needs a beat source** — exactly one of `--script`, `--spine` or `--plates/--plate`.
- **Breaking: `--out` is the MP4 deliverable** — with audio and the preset's encode; `--mp4` and `.webm`/`.mkv` takes are removed. Live plates stay picture-only.
- **Live plates run their plate's beat** — `capture --plates --plate <id>` plays the beat named by the plate, not a time window.
- **`setup.sh` also installs Playwright's Chromium** (about 380 MB) for `signin` and `--headed`; recording stays on the headless shell.
- **`check-take` ignores captions and the cursor** — the caption band is masked and the threshold scales with frame size, so narrated takes with captions pass at 1080p.

### Fixed

- **`contact-sheet` past the last video frame** — sample times are clamped to the video stream, so audio longer than the picture no longer fails.

## [0.1.0] — 2026-11-10

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
- **Step watchdog** — every HyperFrames and ffmpeg step fails with one line if it overruns (render 30 min; `PEAK_MEDIA_STEP_TIMEOUT_S` overrides); Ctrl-C stops the running step and removes its temp folder.
- **Script-printed gate lines** — `spine`, `render-plate --pipeline-test`, the new `gate build` check and `assemble` print the GATE 2/5/6/7 lines themselves; `gate build` counts the reviewer's listed defects.
- **`audio-options`** — gate 8 offers the brand pack's music tracks and SFX by name, or the audio in a folder the user names; never searches the disk.
- **README and marketplace entry** — install, macOS prerequisites, key setup, the three modes, known limits; `peak-media` is listed in the marketplace.
