# WP7a — Recorder engine

**Runs as:** Builder (run alone) · **Branch:** `feature/peak-media-wp7a` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP7a`, a `wp/WP7a/handoff.md` that records your agent/session ID, and evidence in `evidence/WP7a/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Playwright `page.screencast.start({path,fps,onFrame})`, t0 anchored on the first `onFrame` timestamp (DEC-06). Storyboard API per web2video D6 (plan at `0ea0ea6`, DEC-44); `say()` plays to the spine manifest's clip timing (no TTS here). Flags per AC-REC-01. Pre-flight (Chromium, ffmpeg, `--spine` valid) before any browser launch. Fixture F3. Run with no other render-heavy WP active.

## Owns

- `skills/video-capture/scripts/capture.mjs`
- `skills/video-capture/references/storyboard-api.md`
- `skills/video-capture/examples/deck/`

## Acceptance criteria

- **AC-REC-01** (script) — G `capture --help` · W parsed · T it lists `--storyboard --out --mp4 --viewport --no-captions --caption-css --url --debug-requests --audio-offset-ms --spine` and no narration flags; a test parses each flag
- **AC-REC-02** (script) — G a missing Chromium or ffmpeg, or a bad `--spine` · W capture · T exits non-zero in under 2 s with no browser launch
- **AC-REC-03** (script) — G `examples/deck/storyboard.mjs` (original loop) · W it runs in silent, captions and spine-timed modes · T it runs unmodified in all three
- **AC-REC-04** (script) — G F3 with a 3-clip spine · W capture · T the plate duration equals the planned duration ±1 frame
- **AC-BASE-09** (script) — G the `capture` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
