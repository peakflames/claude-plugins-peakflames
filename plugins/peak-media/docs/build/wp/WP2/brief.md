# WP2 — Walking skeleton + shared verify tools

**Runs as:** Lead · **Branch:** `feature/new-peak-media-plugin` · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP2`, a `wp/WP2/handoff.md` that records your agent/session ID, and evidence in `evidence/WP2/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

`brew install ffmpeg` first (DEC-11). Run F0 end to end: beat grid → 1 motion plate → composite → `out/final.mp4`. Build `contact-sheet`, `probe-spec`, `check-cuts`, and `ac-run` (`--wp`, `--trace`, independence guard). Pins only in `lib/pins.json` (DEC-05/06). Fonts and GSAP local, so render works offline. Prior art (read, don't copy): `peakflames-videos/tools/contact_sheet.sh`, `env.sh`.

## Owns

- `lib/pins.json`
- `lib/hf.mjs`
- `lib/ffmpeg.mjs`
- `lib/preflight.mjs`
- `lib/verify/*`
- `scripts/setup.sh`
- `skills/video-plates/templates/motion/` (minimal)
- `docs/build/tools/ac-run.mjs`

## Acceptance criteria

- **AC-SKL-01** (script) — G F0 and no TTS key · W `skeleton` runs beatgrid → 1 motion plate → composite · T `out/final.mp4` exists and lasts 3.0 s ±1 frame
- **AC-SKL-02** (script) — G AC-SKL-01's output · W `probe-spec` · T H.264 High, yuv420p, AAC 48 kHz, faststart, 1280×720
- **AC-SKL-03** (still) — G any MP4 · W `contact-sheet --every 0.5s` · T a JPEG grid with a timecode label on each frame; the Lead reads the F0 sheet and the kinetic text is legible
- **AC-SKL-04** (script) — G a synthetic MP4 with one cut in silence and one cut over a tone · W `check-cuts --min-silence-ms 300` · T the first passes, the second fails, and the timecode is reported
- **AC-SKL-05** (script) — G F0 · W the plate is rendered twice · T the per-frame `framemd5` matches exactly
- **AC-SKL-06** (script) — G the network is blocked during render · W the F0 plate renders · T it succeeds (fonts and GSAP are local)
- **AC-SKL-07** (script) — G the repo · W grep for the HF/Playwright version strings · T they appear only in `lib/pins.json` (plus lockfile/VENDORED.md)
- **AC-TRC-01** (script) — G acceptance.md and the briefs · W `ac-run --trace` · T fails on an orphan AC, an unknown AC in a brief, or a PASS with no evidence; passes on the real register
- **AC-TRC-02** (script) — G a verify report whose agent ID equals the handoff's builder ID · W `ac-run` · T the report is rejected
- **AC-BASE-01** (script) — G the `setup.sh` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
- **AC-BASE-03** (script) — G the `contact-sheet` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
- **AC-BASE-04** (script) — G the `probe-spec` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
- **AC-BASE-05** (script) — G the `check-cuts` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
