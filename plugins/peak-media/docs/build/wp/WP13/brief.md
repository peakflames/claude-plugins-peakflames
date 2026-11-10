# WP13 — Presets and output

**Runs as:** Builder · **Branch:** `feature/peak-media-wp13` (worktree, from `feature/peak-media-web2video`) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` (DEC-44..50 and the WP11 run-time findings U1/U2), `acceptance.md`, `agents/builder.md`, `wp/WP12/handoff.md`, and `plugins/peak-media/docs/web2video-plan.md` §4.5–§4.6 before starting.
- You own only the files listed below (paths relative to `plugins/peak-media/`). Touch nothing else.
- Contracts are **v1** and frozen.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP13`, a `wp/WP13/handoff.md` with a `builder-id:` line, and evidence in `evidence/WP13/` (JPEG, JSON, logs only — no MP4/WAV).
- No plan mode. Don't push. Don't merge. Build only on merged work (DEC-32).
- Captures are real time: run the video-capture evals alone. `TMPDIR=$(mktemp -d)` per suite run; delete it afterwards. One full `node --test 'plugins/peak-media/evals/**/*.test.mjs'` at the end.
- Markdown docs (`SKILL.md`, `references/storyboard-api.md`) are WP15; keep `--help` accurate.

## Scope

**Preset table** in `capture.mjs` (an exported constant, like `EXPORTS` in `skills/video-assemble/scripts/assemble.mjs` L21). `--preset web|youtube|hifi`, default `web`:

| Preset | Capture | Video encode | Audio |
|---|---|---|---|
| `web` (default) | 1280×720 @ 30 fps | H.264 High, CRF 26, yuv420p, faststart | AAC-LC 48 kHz stereo, 128 kbps |
| `youtube` | 1920×1080 @ 30 fps | H.264 High (CABAC), VBR about 8 Mbps (12 Mbps if `--fps` > 30), closed GOP = half the frame rate, 2 consecutive B-frames, yuv420p, progressive, faststart, no edit lists | AAC-LC 48 kHz stereo, 384 kbps |
| `hifi` | 1920×1080 @ 60 fps | H.264 High, CRF 16, preset `slow`, yuv420p, faststart | AAC-LC 48 kHz stereo, 256 kbps |

U1 (YouTube Help 1722171, read 2026-11-10) confirmed the `youtube` row; U2 confirmed 1080p60 capture, so `hifi` needs no fallback.

- `--viewport` and `--fps` override the preset's capture values; the encode settings stay the preset's.
- `--preset` applies to standalone takes only. `--plates/--plate` keeps `plates.json` size and fps, keeps writing the **picture-only** plate MP4 that `video-assemble` reads (unchanged), and refuses an explicit `--preset` with a one-line usage error.

**Output.** For standalone takes `--out` is the MP4 deliverable with audio (spine clips at −16 LUFS when narrated, else a silent AAC track), encoded to the preset. Remove `--mp4`, and remove `.webm`/`.mkv` outputs (`OUT_EXT`, the VP9 branch in `encode`). `--out` must end in `.mp4`. The take manifest default path stays `<out>.take.json`; `x-take` records `preset`. Encode the audio per preset.

**`probe-spec --preset <name>`** (`lib/verify/probe-spec.mjs`): checks size, fps, codec, profile, pix_fmt, faststart **and** the preset's encode properties that ffprobe can see — audio codec/rate/channels/bitrate (±15 %), video bitrate band for bitrate-targeted presets, closed GOP length and B-frame count for `youtube` (check via ffprobe frame/packet data; document how in `--help`). `--size`/`--fps` given explicitly override the preset's expectations (for `--viewport`/`--fps` overrides). Import the preset table from one place; don't duplicate it.

**`check-take`**: wording now points at the take's `--out` MP4 (no more "--mp4 deliverable" / "picture-only --out" text, L5, 19–24, 51).

**`check-take` ignores captions and the cursor (DEC-50).** A caption appearing at its clip's onset is not a scene change. Run the scene detection on the picture with the caption band masked out (default: bottom 25 % of the frame; `--caption-band <fraction>`, `0` to disable), and make sure a cursor glide alone does not count as a cut at the default threshold. The narrated deck **with captions on** must pass `--expect-cuts 2`; switch AC-REC-07 back to captions on.

**WP12 verify-1 nit:** the `loadStoryboard` error (`capture.mjs` ~L179) and the `--storyboard` help line list the full storyboard context (`beat, goto, click, type, point, scrollTo, scrollBy, wait, page, context, mode, fps, viewport, elapsedMs`).

**Legacy narration fixtures** `evals/fixtures/legacy-narration.json` and `docs/reference/narration.json`: update their `--mp4`/`.webm` mentions only if they are inputs a capture eval runs; if they are archival records that AC-CON-03 or the D4 cache-key test read verbatim, leave them and say so in `handoff.md`.

**Callers.** Move every `--mp4`/`.webm` use in `evals/video-capture/**` and the example storyboards' header comments to `--out x.mp4`. Existing AC IDs keep passing (AC-REC-05 now runs on `--out`). AC-REC-01's flag list drops `--mp4` and gains `--preset`.

## Owns

- `skills/video-capture/scripts/capture.mjs`, `skills/video-capture/scripts/check-take.mjs`, `skills/video-capture/examples/**` (comments only)
- `lib/verify/probe-spec.mjs`, `evals/verify/**` (probe-spec tests)
- `evals/video-capture/**`, `evals/fixtures/legacy-narration.json`, `docs/reference/narration.json` (per the rule above)
- `docs/build/wp/WP13/handoff.md`, `docs/build/evidence/WP13/`

## Acceptance criteria

- **AC-W2V-10** (script) — G no TTS key and a loopback-only network guard · W the ui-demo is captured in captions and silent mode · T both succeed with zero requests to any TTS host
- **AC-W2V-11** (script) — G the deck narrated on a fake/tone spine · W capture `--spine` · T each clip's onset in `--out` is at its spine time (± one frame, after the audio offset), and capture made no TTS request
- **AC-W2V-12** (script) — G the ui-demo · W captured once per preset · T `probe-spec --preset <name>` passes for each (size, fps, codec, profile, audio, faststart, and the preset's encode checks)
- **AC-W2V-13** (script) — G the ui-demo · W `--preset youtube --viewport 1280x720 --fps 25`, and `--plates … --plate … --preset web` · T the first is 1280×720@25 with youtube encode settings; the second exits non-zero with a one-line refusal before a browser opens
- **AC-W2V-14** (script) — G the deck narrated on a fake/tone spine · W capture with captions on, then `check-take --expect-cuts 2` · T it passes (caption changes and the cursor are not counted as cuts): both slide changes sit in ≥ 900 ms of silence
