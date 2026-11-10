verifier-id: verifier-wp7a-r1-f0f14857

# WP7a verify-1: video-capture (Recorder engine)

Branch `feature/peak-media-wp7a` @ 2330d8c (merges DEC-35 and the F3 URL fix). Builder id `builder-wp7a-77ef3901`, which differs from this verifier's id. I ran alone, on macOS arm64, Node 26.8.1, system ffmpeg 9.0.2 and the pinned Playwright 1.65.0 / chrome-headless-shell 152. Every run used `TMPDIR=$(mktemp -d)`, deleted afterwards. No video or WAV was written into the repo.

I read "record" as `capture` (DEC-21) and the engine as `screencast.start({fps, onFrame})` plus system ffmpeg (DEC-35, which refines DEC-06).

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-REC-01 | PASS | evidence/WP7a/AC-REC-01.log | `--help` lists all 10 flags: `--storyboard --out --mp4 --viewport --no-captions --caption-css --url --debug-requests --audio-offset-ms --spine`. It lists no narration flag, and `--narrate --tts-model --voice --style --export-clips --manifest` each exit 2 with `Unknown option`. **Parsing:** I gave each flag a bad value of its own. Each one produced an error naming that flag, which proves the flag was parsed and its value used. Both booleans reject `=value`, and with ffmpeg removed both get through parsing to pre-flight. The eval parses every flag too. |
| AC-REC-02 | PASS | evidence/WP7a/AC-REC-02.log | **Method:** a `node --import` spy recorded every `child_process` spawn. **Control:** on a real take the spy recorded the chrome-headless-shell spawn. **Results:** missing Chromium (`HYPERFRAMES_BROWSER_PATH=/nonexistent`) exited 3 in 0.11 s. `PEAK_MEDIA_FFMPEG=/nonexistent` exited 3 in 0.06 s, and a missing ffprobe exited 3 in 0.08 s. A bad `--spine` (schema-invalid, not JSON, or missing) exited 1 in 0.06–0.12 s. Every case gave a one-line error, the spy saw **0 browser spawns**, and `pgrep chrome-headless-shell` was 0 before and after. |
| AC-REC-03 | PASS | evidence/WP7a/AC-REC-03.log, evidence/WP7a/AC-REC-03-verifier-modes.jpg | **Diff against web2video §1/D6:** `storyboard.mjs:17-24` is the original loop: `waitForVoice()` → `wait(250)` → `page.evaluate(n => window.deckGo(n), slide)` → `wait(900)` → `say('', { narrate: paragraph })`, then a final `waitForVoice()`. **Runs:** the same file (blob edd95618, unchanged before and after) ran exit 0 in all three modes: silent (596 fr), captions (595 fr) and spine-timed against a real fake/tone deck spine (600 fr = 20000 ms = spine totalMs). **Stills:** slides 1→2→3 change at the same points in all three modes. Silent shows no caption, captions shows the narrate text in a neutral bar, and spine shows no caption, as documented: `say("", {narrate})` is voice-only. Spine mode reports `say()` 431–932 ms late; this is expected and documented (storyboard-api.md:60-63). |
| AC-REC-04 | PASS | evidence/WP7a/AC-REC-04.log, evidence/WP7a/AC-REC-04-verifier-f3.jpg | **Spine:** built with `spine.mjs --tts-model fake/tone` on a temp `PEAK_MEDIA_TTS_CACHE`, with both key vars unset. It has 3 clips, totalMs 19500, and the F3 plates.json windows were taken from its beats. **Plates, captured live:** r1-feature planned 6864 ms → 206 frames (+0.08 fr). r2-anchor 7227 ms → 217 frames (+0.19 fr). r3-openspec 5409 ms → 162 frames (−0.27 fr). All are within ±1 frame by ffprobe `nb_read_frames`, and all are h264 1280x720 yuv420p at 30/1. Both sites were reachable (curl 200), so nothing was flaky. Contact sheet described below. |
| AC-BASE-09 | PASS | evidence/WP7a/AC-BASE-09.log | `--version` prints `0.1.0`, the same as plugin.json. `--help` lists every flag. `--help`, `--version` and pre-flight bad input all ran under the `no-network` preload with 0 network attempts. **Bad input:** no args, an unknown flag, an odd viewport, `--fps 0`, `--plate` without `--plates`, a storyboard with no default export and an unknown plate id each exit non-zero with one actionable line and no stack trace. Expected runtime failures also give one line with no stack: a storyboard that throws, a 4th `say()` on a 3-clip spine, a storyboard that overruns the window, and **HTTP 404**. The 404 was tested both on a local server and on the live `openspec.dev/docs/the-workflow`: `… answered HTTP 404 — check the URL (live pages move); nothing was captured`, exit 1, no output file. |

Also run:
- `node --test plugins/peak-media/evals`: 71/71 pass, 0 skipped (evidence/WP7a/evals.verifier.log).
- `ac-run --wp WP7a`: all 5 ACs `pass`, exit 0 (evidence/WP7a/ac-run-wp7a.verifier.log).
- `ac-run --trace`: `PASS trace: 77 ACs, 12 briefs, 0 problem(s)` (evidence/WP7a/ac-run-trace.verifier.log).

## F3 real-site contact sheet (AC-REC-04-verifier-f3.jpg)

The sheet has 12 stills over the three concatenated plates, 0.2–18.8 s.
- **r1-feature:** the GitHub peak-workflow README starts at the top. It glides to "Philosophy" and outlines in amber the paragraph on the "formal requirements baseline … Gherkin-style `.feature.md` files with TOR requirement IDs". The caption "In peak-workflow, every requirement is a Gherkin scenario with a stable ID." shows from 1.2 s to 4.0 s and is gone by 6.0 s.
- **r2-anchor:** the same README, starting at the command tables. It glides to "TOR Requirement IDs", then outlines "TOR IDs are stable once merged to develop and never reused". The caption "That ID is what the epic plans against, and what the verifier checks." shows at 8.6 s and 10.0 s.
- **r3-openspec:** the real openspec.dev **/docs/quickstart** page, not a 404. It opens on the "Quickstart" heading, then shows "The loop at a glance" with its 5-step diagram and the caption "OpenSpec takes the lighter road: propose, apply, archive.". It ends on an outlined "Step 5: Archive".

No blank, error or half-rendered frames.

## Timing correctness (preview of WP7b D8)

**How frames are placed.** Frames go on the fps grid by their own timestamps. t0 is the first `onFrame` timestamp (capture.mjs:77). The slot is `round((ts − t0)·fps/1000)` (capture.mjs:78). Frame k is the newest unique frame with slot ≤ k, hard-linked (capture.mjs:93-97). `say()`, `wait` and `waitForVoice` use `performance.timeOrigin + performance.now() − t0` (capture.mjs:279), which is the same epoch clock.

**Test setup.** I used a full-black page. The storyboard flipped it to R, G, then B straight after each `say()` returned (`evaluate` plus one rAF). The spine was the deck's fake/tone spine, with clips at 250, 6432 and 14432 ms and audioOffsetMs 0. I ran it 4 times: twice with captions and twice without.

**Offset.** The offset is the first frame showing the new colour minus the clip's planned start (evidence/WP7a/sync-preview.log). The picture lags the planned audio by:
- **say #2 and #3 (steady state):** +1.3 ms in 6 of 8 cases (0.04 frame), and +34.7 ms (1.04 frames) in one captions run.
- **say #1, the first after t0:** +16.7, +50, +50 and +83.3 ms (0.5–2.5 frames).
- **Overall (12 flips):** median **+9 ms**, worst **+83 ms**. That is inside D8's limits (median ≤ 120 ms, worst ≤ 200 ms).

`say()` itself fired within 1–2 ms of plan every time.

## Scope

- **Changed paths:** `git diff --stat 6aaa5b2..cea1974` shows 19 files. They are all inside WP7a's owned paths (`skills/video-capture/scripts/capture.mjs`, `references/storyboard-api.md`, `examples/deck/**`), the F3 storyboards plus their `glide.mjs` helper (the F3 brief assigns them to WP7a), `evals/video-capture/**` (where builder.md §5 puts tests), and `wp/WP7a/handoff.md` and `evidence/WP7a/`.
- **Contracts:** no edits to `lib/` or `schemas/`, and no contract change is logged.
- **Merge commit:** the merge (cea1974→2330d8c) changes only the lead's F3 `brief.md` and `plates.json`.
- **Media:** no MP4, WAV, WebM or MKV appears in the diff, in tracked files, or as a stray file in the worktree.
- **Brand strings:** `grep -ril peakflames skills/ evals/` finds nothing.

## Findings

**Blocker:** none.

**Should-fix**
1. `skills/video-capture/scripts/capture.mjs:278`: the 10 s "no screencast frame" `setTimeout` inside `Promise.race` is never cleared. Node therefore stays alive until 10 s after t0 for any take shorter than that. I measured a 200 ms take: its result printed at +1.3 s and the process exited at +11.0 s. Every F3 plate (5–7 s) pays 3–5 s of idle time, and plate-factory captures plates one after another. Fix: keep the timer handle and `clearTimeout` it once `grid.ready` resolves.

**Nits**
1. `capture.mjs:327-341`: an overrun is only detected after the storyboard returns. My `wait(25000)` on a 20 s spine ran the full 25 s before failing, and a storyboard that hangs (for example a selector wait with no timeout) has no overall cap. In spine mode, the take could abort once `now()` passes `win.durationMs + 1 frame`.
2. `capture.mjs:78`: rounding to the nearest slot can put a frame up to half a frame (16.7 ms at 30 fps) *before* its own timestamp. The mean error is zero and this is within ±1 frame. I note it so WP7b's D8 analysis reads the sign correctly.
3. The first `say()` after t0 has visibly more picture latency (+17 to +83 ms) than later ones (about +1 ms). This is within D8, but worth knowing for WP7b's AC-REC-06 worst-case budget. A short warm-up before t0 would probably remove it.
4. `lib/hf.mjs:63` (not WP7a-owned, information only): without `HYPERFRAMES_BROWSER_PATH`, the Chromium check spawns `hyperframes browser path` with a 60 s timeout. A wedged hf would break REC-02's "under 2 s" in the real missing-browser case. The normal lookup took 0.21 s here. The eval and my run both simulate a missing Chromium through the env override.
