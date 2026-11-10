verifier-id: wp13-verifier-1

# WP13 verify-1 — presets and output

Builder: `wp13-builder`. Branch `feature/peak-media-wp13` at `23f63a1` (includes the Lead's DEC-51
commit `c04517b` and the `lib/presets.mjs` move).

Runs, each alone: `ac-run --wp WP13` (5/5 script ACs pass), `node --test evals/video-capture/presets.test.mjs`
(5/5), then my own runs: the ui-demo captured once per preset, flag and extension refusals, plate
refusal plus a real plate take, synthetic check-take cases, and the narrated deck captured per
preset. Then one full suite: 133 tests, 132 pass; the one failure is AC-PKG-01 (`'0.1.0' !== '0.2.0'`), expected until WP18. The suite rewrote the WP5/WP10 evidence, and I restored it with `git checkout --`. No headless browsers were left running.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-W2V-10 | PASS | `evidence/WP13/AC-W2V-10.verifier.log` | Both TTS key variables empty, `helpers/loopback-only.mjs` imported. Captions and silent ui-demo takes each made 1 request, to `127.0.0.1`, with 0 blocked attempts and no TTS host named. The control fetch to openrouter.ai is caught by the guard. |
| AC-W2V-11 | PASS | `evidence/WP13/AC-W2V-11.verifier.log` | Deck on a fake/tone spine (`--lead-ms 950`), default preset: the 3 tone onsets in `--out` are at 950, 7605 and 16078 ms, 0 ms error each (`audioOffsetMs` 0), with no TTS request. With `--preset youtube` the onsets are 21.4 ms late (see M2). |
| AC-W2V-12 | PASS | `evidence/WP13/AC-W2V-12.verifier.log`, `verifier-presets-independent.log` | My own captures: web 1280x720@30, youtube 1920x1080@30, hifi 1920x1080@60. All are H.264 High, yuv420p, progressive, AAC-LC 48 kHz stereo, with moov before mdat. `probe-spec --preset` exits 0 for each. x264 SEI: web `crf=26`, hifi `crf=16`, youtube `rc=abr bitrate=8000 vbv_maxrate=12000 cabac=1 bframes=2 open_gop=0 keyint=15 scenecut=0`. youtube has 0 elst, every GOP is 15 frames, closed, max B run 2. The audio is about 2 kbps on silence, under the ceiling per DEC-51. `x-take.preset` is recorded. The control check (web file checked as youtube) fails on size, rc, GOP, B-frames and elst. |
| AC-W2V-13 | PASS | `evidence/WP13/AC-W2V-13.verifier.log`, `verifier-flags-plate.log` | `--preset youtube --viewport 1280x720 --fps 25` gives 1280x720@25, `bitrate=8000`, keyint 13, and every youtube check passes. `--plates … --plate r1-feature --preset web\|youtube\|hifi` exits 2 with a one-line refusal (plus the standard `Run 'capture --help'` hint) in about 90 ms, and the browser spy never ran. Without `--preset` the plate take is picture-only (one h264 stream, 1280x720@30 from plates.json, `x-take.preset` null). |
| AC-W2V-14 | PASS | `evidence/WP13/AC-W2V-14.verifier.log`, `AC-W2V-14-deck-captions.verifier.jpg` | Narrated deck, captions on (one caption per beat; the contact sheet shows the caption bar on every frame). `check-take --expect-cuts 2` passes: cuts at 0:06.700 and 0:15.200, each in 1200 ms of silence. The `--caption-band 0` control finds 8 cuts, 6 over speech. The six-glide cursor take finds 0 cuts. Holds for the default `web` preset only; at 1080p see M1. |

Contact sheet (`AC-W2V-14-deck-captions.verifier.jpg`): seven frames from 01.25 to 16.40 s. Slide
1/3 "Water in the morning" carries the caption "Water your garden in the morning". At 07.90 it is
slide 2/3 "Less is lost" with "Less water lost, less mildew". At 16.38 it is slide 3/3 "Aim at the
roots" with "Water the roots deeply, then let the soil dry". Each caption is a dark rounded bar at
bottom centre, inside the bottom 25 %. The slide progress bar is also in that band.

## Scope

- `git diff --stat e4e9fcb..HEAD` touches only WP13-owned files: capture.mjs, check-take.mjs,
  example storyboard header comments, probe-spec.mjs, `evals/verify/**`, `evals/video-capture/**`,
  `wp/WP13/handoff.md` and `evidence/WP13/`. It also includes `lib/presets.mjs` (approved by the
  Lead) and the Lead's DEC-51 commit (`acceptance.md`, `decisions.md`, `brief.md`).
- No MP4, WAV, WebM or MKV files in the diff. Evidence is JSON, logs and JPEG.
- `grep -rli peakflames` over skills, lib, schemas, brand-packs, vendor, scripts and evals finds
  0 hits.
- `--mp4`, `.webm` and `.mkv` are gone. `--help` mentions none of them. `--out x.webm`, `x.mkv` and
  `x.mov` each exit 2 with `--out must end in .mp4`. `--mp4` exits 2 with `Unknown option`.
  `--preset 4k` exits 2. No VP9 or `OUT_EXT` code is left.
- The legacy narration fixtures were left as archival records (handoff explains why). That is
  allowed by the brief.

## check-take: caption band and the 250 ms merge

I tried to make the merge hide a cut over speech (`evidence/WP13/verifier-merge-cases.log`,
synthetic lavfi takes):

- **A:** cut at 2.0 s in silence, then a real cut at 2.2 s over speech. These merge into one
  transition, and it **fails** because the group passes only if every frame passes.
- **B:** a chain of cuts every 200 ms from 4.5 s to 5.3 s, the last one over speech. These merge
  into one 5-frame transition, and it **fails**.
- **C:** two real hard cuts 200 ms apart, both in silence. These count as **1** (see m1).
- **D:** a change over speech confined to the bottom 20 %. At the default band it is not seen
  (here the take fails only on "no scene changes on a narrated take"). `--caption-band 0` catches
  it. This is the DEC-50 design.

So the merge cannot turn a failing cut into a pass. It can only lower the count and move the
reported timecode.

## Findings

- **M1 — major — check-take misses the slide changes on 1080p presets (DEC-50 not met for
  youtube/hifi).** I captured the narrated deck with captions on per preset
  (`evidence/WP13/verifier-preset-sync-cuts.log`). `check-take --expect-cuts 2` passes on `web`,
  but on `youtube` and `hifi` it **fails with "found 0"**. Above the caption band the two slide
  changes score 0.0172 / 0.0195 (youtube) and 0.0172 / 0.0089 (hifi), against 0.057 / 0.056 on
  web. The scene score is a fraction of the frame, and the deck's fixed-px content covers less of a
  1080p frame. At 60 fps a transition is also spread over twice the frames. `--scene-threshold
  0.01` (youtube) finds both cuts in silence. So a delivered youtube/hifi narrated take fails its
  own default check. The help text gives no hint here: it suggests lowering the threshold only for
  fades. Fix options: scale the scene score (e.g. downscale to 1280x720 and sample at 30 fps
  before `select`), or derive the threshold from the take's size and fps. Add a 1080p case to the
  AC-W2V-14 test. AC-W2V-14 as written (default preset) still passes.
- **M2 — major — `youtube` narration is 21.4 ms late (AAC priming not trimmed without edit
  lists).** The narrated deck with `--preset youtube` puts every tone onset 21.4 ms after its
  spine time; web and hifi are at 0 ms. The audio stream is also 21.3 ms longer than the video
  (21.4547 vs 21.4333 s). `-use_editlist 0` drops the elst that trims AAC's 1024-sample encoder
  delay (1024 / 48000 = 21.3 ms). The video side was handled with `negative_cts_offsets`, but the
  audio side was not. This is within ±1 frame at 30 fps (33.3 ms), but **outside it at
  `--preset youtube --fps 60`** (16.7 ms), which breaks the AC-W2V-11 tolerance on that path.
  AC-W2V-11 is only run on `web`. Fix: shift the audio earlier by the priming, e.g. pre-trim the
  mix by 1024 samples, or accept and document the offset. Then add a youtube onset check.
- **m1 — minor — the merge chains without a bound and can under-count.** Grouping compares each
  detection to the previous one, not to the group's first, so a run of detections each < 250 ms
  apart becomes one "transition" of any length (case B: 800 ms). Two real hard cuts < 250 ms
  apart, both in silence, count as 1 (case C), so `--expect-cuts` can be off by one in the lenient
  direction. Pass/fail is not affected. Consider capping a group at 250 ms from its first frame.
- **m2 — minor — a failing merged transition is reported at the wrong timecode.** In case A the
  report says `scene change at 0:02.000 … over sound`, but 2.000 s is in silence and the cut over
  speech is at 2.2 s. `mergeTransitions` takes `cutMs`/`timecode` from `g[0]` even when it shows
  the failing frame's fields, which contradicts its own comment ("or its first failing one"). The
  user is pointed to the wrong place to fix. Report the failing frame's time, or print the span
  (`endMs` is already there).
- **n1 — nit — the youtube SEI shows `keyint_min=8`.** `presetArgs` asks for `-keyint_min` and
  `min-keyint=15`, but x264 clamps it to keyint/2+1. The GOP is still a fixed 15 (scenecut=0,
  packet check), so this is harmless. It is only a misleading argument.
- **n2 — nit — the `progressive` check passes when `field_order` is missing**
  (`?? 'progressive'`). ffprobe reports it for these files, so this is fine today.
