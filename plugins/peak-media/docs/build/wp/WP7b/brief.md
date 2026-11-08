# WP7b — Recorder captions + mux

**Runs as:** Builder (run alone) · **Branch:** `feature/peak-media-wp7b` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP7b`, a `wp/WP7b/handoff.md` that records your agent/session ID, and evidence in `evidence/WP7b/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Captions via `showOverlay(html,{duration})` with injected-DOM fallback; neutral default style, `--caption-css` override. Mix/mux to D7 spec, silent AAC for non-narrated takes. `check-take` = scene changes vs silence (`check-cuts --min-silence-ms 900`). Take manifest validates against v1 spine schema. Sync test (AC-REC-06) must run alone.

## Owns

- `skills/video-capture/scripts/check-take.mjs`
- `caption overlay code in skills/video-capture/`
- `skills/video-capture/examples/ui-demo/`
- `skills/video-capture/SKILL.md`

## Acceptance criteria

- **AC-REC-05** (script) — G the recorder `--mp4` output · W probe-spec · T it passes
- **AC-REC-06** (script) — G a sync page that flips a full-frame colour on each `say()`, with fake tones · W record (run alone) · T median offset ≤ 120 ms and worst ≤ 200 ms
- **AC-REC-07** (script) — G the narrated example deck · W `check-take` · T every scene change (threshold 0.02) is inside silence (−40 dB, ≥ 900 ms)
- **AC-REC-08** (still) — G the ui-demo · W stills are sampled inside each `say()` window · T the caption text shows; with `--no-captions` it doesn't; `--caption-css` changes the style
- **AC-REC-09** (script) — G a take · W the manifest is written · T it validates; `command[]` reproduces the take
- **AC-REC-10** (script) — G the key is unset · W the captions-only example runs · T it passes with 0 OpenRouter calls
- **AC-BASE-10** (script) — G the `check-take` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
