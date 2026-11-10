# WP13 handoff — presets and output

builder-id: wp13-builder

## Read this first: one item for the Lead

**The ±15 % audio-bitrate band can't hold with AAC, and the youtube video bitrate can't be
checked as a band either.** Both are variable-rate in practice. I measured (ffmpeg 9.0.2):

| Source | requested | ffmpeg `aac` | AudioToolbox `aac_at` CBR |
|---|---|---|---|
| silence (every captions/silent take) | 128 / 256 / 384k | ~2 kbps | 128 / 256 / **320** kbps |
| `say` speech | 128 / 256 / 384k | 129 / 241 / **233** kbps | 128 / 257 / **320** kbps |

- With ffmpeg's `aac`, a silent track measures about 2 kbps, and 384k speech measures about 233.
- `aac_at` CBR hits 128 and 256 exactly, even on silence. It caps at 320 kbps for 48 kHz stereo,
  so youtube's 384 can't be met by either encoder.
- The ui-demo at `youtube` measures 661 kbps of video against the 8 Mbps target, because a screen
  recording needs few bits. x264 ABR doesn't pad.

**What I built:**

- Audio is ffmpeg `aac` at the preset's bitrate, as the brief says.
- probe-spec checks the audio bitrate as a **ceiling** (≤ target +15 %). It also checks the AAC-LC
  profile, 2 channels and 48 kHz.
- For video, probe-spec reads the encoder's own settings from the x264 SEI in the stream: `rc=crf
  crf=26/16` for web/hifi, and `rc=abr bitrate=8000 vbv_maxrate=12000` plus `cabac=1` for youtube.
  The measured youtube bitrate is checked as ≤ the VBR peak.

**Decide one of:**

- (a) Accept ceiling + SEI.
- (b) Switch audio to `aac_at` CBR. web and hifi then meet ±15 % on any take. This needs an
  `aac` fallback off macOS, and youtube's audio would become 320 kbps.
- (c) Drop the audio-bitrate band from the AC wording.

## Done

- **`capture.mjs`**
  - `PRESETS` is an exported table. `presetArgs` builds the ffmpeg arguments, `presetExpect` builds
    what probe-spec expects, and `presetSummary` builds the `--help` lines.
  - `--preset web|youtube|hifi` defaults to `web`. `--viewport` and `--fps` override the capture
    size and fps only.
  - youtube encodes with: `-b:v 8000k` (12000k above 30 fps), `-maxrate` ×1.5, `-bufsize` ×2, a
    closed GOP of round(fps/2), `bframes=2:b-adapt=0`, `scenecut=0` and CABAC.
  - youtube writes no edit lists: `-use_editlist 0` plus `negative_cts_offsets`. Without the second
    flag the picture started 2 frames (67 ms) after the audio.
  - `--out` must end in `.mp4` and is the deliverable with audio. `--mp4`, `.webm`, `.mkv`, the VP9
    branch and `OUT_EXT` are gone.
  - Plates keep the picture-only veryfast/CRF 18 MP4. `--plates … --preset` is a one-line usage
    error (exit 2), raised before any pre-flight.
  - The take and `x-take` record `preset`; `x-take.mp4` is gone. The stdout line names the preset.
  - The `loadStoryboard` error and the `--storyboard` help line now list the full
    `STORYBOARD_CONTEXT` (the WP12 verify-1 nit).
- **`probe-spec.mjs`** — `--preset`. It imports `PRESETS`/`presetExpect` from `capture.mjs`, so the
  table is not duplicated. An explicit `--size`/`--fps` overrides the preset's values. The youtube
  checks:
  - GOP length: the spacing of keyframe packets' pts.
  - Closed GOP: no packet after a keyframe, in decode order, has an earlier pts.
  - Max B-run = 2: from `frame=pict_type`.
  - No `elst` box.
  - All of these, with the ffprobe commands, are in `--help`.
- **`check-take.mjs`**
  - Wording now names the take's `--out` MP4.
  - Scene detection crops away the bottom `--caption-band` (default 0.25; 0 = the whole frame).
  - A cursor glide scores far below 0.02. AC-W2V-14 checks this with a captioned take of a still
    page whose only motion is 6 glides: `--expect-cuts 0` passes.
- **Evals**
  - Every `--mp4` and `.webm` use in `evals/video-capture/**` now uses `--out x.mp4`.
  - AC-REC-01's flag list has `--preset` and no `--mp4`, and it asserts `--mp4` is now an unknown
    option.
  - AC-BASE-09 has three new bad-input cases: a `.webm` take, `--mp4`, and an unknown preset.
  - AC-BASE-10 has two new bad `--caption-band` cases.
  - AC-REC-07 now captures the narrated deck with captions on.
  - The new file `evals/video-capture/presets.test.mjs` holds AC-W2V-10..14.
  - `evals/verify` has a probe-spec `--preset` negative test (open GOP, 3 B-frames, GOP 20, edit
    lists) and `--preset` in AC-BASE-04.
- **Example header comments** (`deck`, `ui-demo`, and the sync fixture) now use `--out`.
- **Evidence** (`evidence/WP13/`):
  - `AC-W2V-10-network.json`, `-11-onsets.json` (each onset within 0 ms of its spine time),
    `-12-probe.json`, `-13-override.json`
  - `-14-check-take.json`, `-14-deck-captions.jpg`
  - `ac-run.log`

## Deviations

- **The audio and video bitrate checks are ceilings plus the x264 SEI**, not a ±15 % or bitrate
  band (see above).
- **check-take merges detections under 250 ms apart into one transition.** The deck's 200 ms
  slide fade sometimes scored on two consecutive frames (15.167 s and 15.200 s), which broke
  `--expect-cuts 2`. A merged transition passes only if every frame of it is in silence. The
  merge window is a constant, not a flag.
- **Fixed a pre-existing flake in `capture.mjs`.** A beat's `durationMs` was rounded from its
  length, so the next beat could start 1 ms inside it. The v1 schema rejects that, and AC-REC-09
  failed once. Both ends are now rounded.
- **Without an edit list, youtube's AAC priming (1024 samples, about 21 ms) is not trimmed.** The
  audio starts that much late. This is within AC-REC-06 tolerances; only youtube is affected.
- **Legacy narration fixtures are left as they are.** `evals/fixtures/legacy-narration.json` and
  `docs/reference/narration.json` are archival records. AC-CON-03 reads every legacy field
  verbatim and AC-TTS-02 reads their clip keys. No capture eval runs them.

## Results

- Run alone: `capture.test.mjs` 6/6, `beat.test.mjs` 9/9, `captions-mux.test.mjs` 10/10,
  `presets.test.mjs` 5/5, `verify-tools.test.mjs` 9/9.
- `ac-run --wp WP13`: AC-W2V-10..14 all `pass`.
- **Full suite:** 132/133. The only failure is AC-PKG-01, which already fails on the base (the
  version bump is WP18). The suite rewrote WP5/WP10 evidence; I restored it and it is not
  committed.

## Follow-up after DEC-51

- **The bitrate checks follow DEC-51 (option a):** ceilings plus the encoder settings. I merged
  `feature/peak-media-web2video` into this branch to pick it up.
- **The preset table moved to a new `lib/presets.mjs`**, which WP13 owns for this change. It holds
  `PRESETS`, `DEFAULT_PRESET`, `presetArgs`, `presetSummary` and `presetExpect`.
  - `capture.mjs` and `lib/verify/probe-spec.mjs` both import it.
  - probe-spec no longer imports a skill script.
  - `capture.mjs` doesn't re-export the presets; `presets.test.mjs` imports them from
    `lib/presets.mjs`.
- **Re-run only the affected tests:**
  - `verify-tools.test.mjs` 9/9, including AC-BASE-04 and the probe-spec `--preset` test.
  - `capture.test.mjs` AC-BASE-09 and AC-REC-01: pass.
  - `ac-run --wp WP13`: AC-W2V-10..14 all pass, and the evidence was rewritten by that run.
  - No full suite, as the coordinator said.

## Open

- `SKILL.md` and `references/storyboard-api.md` still describe `--mp4` (WP15).
