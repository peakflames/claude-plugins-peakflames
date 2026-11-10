# WP6 — Assembly

**Runs as:** Builder (render-heavy) · **Branch:** `feature/peak-media-wp6` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP6`, a `wp/WP6/handoff.md` that records your agent/session ID, and evidence in `evidence/WP6/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

`assemble`: composite plate MP4s onto the spine at their timecodes → review MP4 → stem remux (no video re-encode) → brand outro → export (1080p60 option). `remux-audio`: music/SFX stems onto a rendered picture with narration at −16 LUFS and music ducked. Work from fixture plate MP4s and the F1 manifest; don't wait for WP4. Prior art: `peakflames-videos/build_soundtrack.py` (ducking/mix only). AC-ASM-06 is a user listening gate: produce the mix, mark `blocked: needs user listen`.

## Owns

- `skills/video-assemble/**`

## Acceptance criteria

- **AC-ASM-01** (script) — G the F1 manifest and plate MP4s · W assemble · T every plate cut lands in a silent gap (`check-cuts --min-silence-ms 300`)
- **AC-ASM-02** (script) — G the review MP4 · W music and SFX stems are remuxed · T the md5 of the video stream (`-map 0:v -f md5`) is unchanged
- **AC-ASM-03** (script) — G `out/final.mp4` · W probe-spec · T the spec passes and duration = spine + outro ±1 frame
- **AC-ASM-04** (script) — G no music supplied · W assemble · T it succeeds with narration only
- **AC-ASM-05** (still) — G the brand pack outro · W assemble · T the final contact sheet's last frames show the outro
- **AC-ASM-06** (manual) — G a user-supplied track and SFX · W the music pass, then the SFX pass · T the user listens and approves the levels (narration −16 LUFS, music ducked)
- **AC-BASE-11** (script) — G the `assemble` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
- **AC-BASE-12** (script) — G the `remux-audio` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
