verifier-id: verifier-wp7b-r1-f4d34562

# WP7b verify-1: video-capture captions, mux, check-take, take manifest

- **What I checked:** branch `feature/peak-media-wp7b` @ 9ae47c5, based on a9fcfc5.
- **Independence:** the builder is `builder-wp7b-6d3f8842`, which is not this verifier.
- **Environment:** macOS arm64, Node 26.8.1, system ffmpeg 9.0.2, pinned Playwright 1.65.0.
- **How I ran:** alone, with no captures in parallel. Each run used `TMPDIR=$(mktemp -d)`, deleted afterwards. Pages were local only (127.0.0.1).
- **Repo hygiene:** no video or WAV was written to the repo. My driver scripts lived outside the repo, in `/tmp/wp7b-verifier-scripts/`.
- **Reading:** "record" means `capture` (DEC-21).

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-REC-05 | PASS | evidence/WP7b/AC-REC-05.log | **Take:** the narrated deck, spine-timed (`spine --lead-ms 950`, fake/tone), with `--mp4`. **probe-spec** (CLI, run by me) passed every check: h264 High, yuv420p, aac 48000 Hz, faststart (`ftyp,moov,free,mdat`), 1280×720, 30 fps, duration 21433 ms ±1 frame. **Audio:** ebur128 integrated −16.0 LUFS, AAC LC stereo. **Silent case:** the captions-only ui-demo `--mp4` also passes probe-spec and has a silent AAC track (AC-REC-10.log). |
| AC-REC-06 | PASS (alone) | evidence/WP7b/AC-REC-06.log, AC-REC-06-verifier-sync.json | **Runs:** 5 takes per mode, interleaved, 30 flips per mode. **Result:** every mode meets median ≤ 120 ms and worst ≤ 200 ms when run alone. See the sync table below. **Caveat:** in my full `node --test` run, the eval's first voice-only attempt failed (worst +251.6 ms) and only the retry passed (evals-all.verifier.log). See should-fix S2. |
| AC-REC-07 | PASS | evidence/WP7b/AC-REC-07.log | **Main result:** check-take passes the narrated deck with 2 scene changes, at 6.700 s and 15.200 s, each inside a 1200 ms silence (silencedetect: 6.405–7.605 s and 14.878–16.078 s). **Control A** (default `--lead-ms 250`) **FAILS**: both changes sit in 727 ms silences, exit 1. **Control B** (a temp copy of the deck with the original 500 ms fades) gives `no scene changes found` and still **PASS** (max scene score 0.011). Deviations 2 and 3 are judged below. Should-fix S1. |
| AC-REC-08 | PASS | evidence/WP7b/AC-REC-08-verifier-{default,no-captions,caption-css}.jpg, AC-REC-08.log | **Stills:** one at the middle of each of the 5 say()/caption windows, for each variant. Each sheet is described below. |
| AC-REC-09 | PASS | evidence/WP7b/AC-REC-09.log | **Validation:** all four manifests validate against the v1 spine schema: deck (`narration`, 3 clips at 950/7605/16078 = spine), ui default and ui css (`beatgrid`, `narrate:false`, 5 captions), and ui no-captions (0 captions). **Reproduction:** I re-ran `command[]` of the css take from another directory: exit 0, same command and mode, same videoMs (14233) and frames (427), same caption texts, caption starts +4/+5 ms, and probe-spec passes. Deviation 6, the ±1 s tolerance, is judged below. |
| AC-REC-10 | PASS | evidence/WP7b/AC-REC-10.log | **Setup:** both key variables were actually **unset** (not empty), and the run used the `loopback-only` preload. **Result:** the captions-only ui-demo exits 0. The only page request was `GET 127.0.0.1/index.html`. There were 0 `NETWORK-ATTEMPT` lines and 0 "openrouter" mentions. The MP4 passes probe-spec. check-take passes and reports the silent track. **Guard control:** the same guard does flag a `fetch` to openrouter.ai. |
| AC-BASE-10 | PASS | evidence/WP7b/AC-BASE-10.log | **Help and version:** `--help` lists all 5 `spec.options` flags; `--version` prints 0.1.0, the same as plugin.json. **Bad input:** 16 cases, all non-zero (usage errors exit 2, runtime errors exit 1, missing ffmpeg exits 3). Each gives one actionable line (usage errors add the house "Run --help" line), with 0 stack frames, and the run made 0 network attempts under `no-network.mjs`. **Extra cases I added beyond the eval:** an audio-only file is refused ("no video stream"), and `--scene-threshold 0` and `--json=1` are refused. |

Also run:
- **Full eval suite** (`node --test plugins/peak-media/evals`): 81/81 pass. **But** AC-REC-06 logged `attempt 1 failed (worst 251.6 ms: …, 151.6, 251.6); measuring again` (evals-all.verifier.log).
- **`ac-run --wp WP7b`:** all 6 script ACs `pass`, AC-REC-08 `—` (still), exit 0 (ac-run-wp7b.verifier.log).
- **`ac-run --trace`:** `PASS trace: 77 ACs, 12 briefs, 0 problem(s)` (ac-run-trace.verifier.log).

## AC-REC-06 sync, per mode (picture minus tone onset, + = picture lags)

**Setup**
- **Spine:** the sync spine from `spine.mjs --tts-model fake/tone` (6 tones), with `--audio-offset-ms 0`.
- **Measurement:** the eval's own `measureSync`. Each value carries up to ±16.7 ms of frame-grid rounding, so a steady +17 ms is about ½ frame of placement bias, not real lag.

**Modes**
- **(a) None:** `say("", {narrate})`. No caption is drawn, but the overlay warm-up still runs.
- **(b) Overlay:** `PEAK_MEDIA_SYNC_CAPTIONS=1`, so `showOverlay` draws captions.
- **(c) DOM:** the same, plus `PEAK_MEDIA_CAPTION_ENGINE=dom`. The env var is the only way to choose the engine; there is no flag.

| mode | conditions | takes / flips | median | worst | first `say()` per take | > 200 ms | meets AC? |
|---|---|---|---|---|---|---|---|
| (a) no captions | alone | 5 / 30 | +17.6 ms | +50.6 ms | +16.6 ×5 | 0 | **yes** |
| (b) showOverlay captions | alone | 5 / 30 | +17.5 ms | +18.3 ms | +16.6 ×5 | 0 | **yes** |
| (c) injected-DOM captions | alone | 5 / 30 | +17.5 ms | +51.0 ms | +16.6 ×5 | 0 | **yes** |
| (a) no captions | 2× x264 CPU load (info) | 3 / 18 | +17.6 ms | +117 ms | +16.6 ×3 | 0 | (yes) |
| (b) showOverlay captions | 2× x264 CPU load (info) | 3 / 18 | +17.6 ms | **+250 ms** | +16.6, **+250**, +16.6 | 1 | (no) |
| (c) injected-DOM captions | 2× x264 CPU load (info) | 3 / 18 | +17.5 ms | +18.3 ms | +16.6 ×3 | 0 | (yes) |
| eval, voice-only, attempt 1 | full `node --test` (parallel files) | 2 / 12 | +17.8 ms | **+251.6 ms** | — | 1 | **no** (retry passed) |

Loaded data: AC-REC-06-loaded.log and AC-REC-06-verifier-sync-loaded.json. The loaded rows are outside the AC ("run alone") and are information only.

**Plain answer:** run alone, all three modes meet the AC by a wide margin. The median is about ½ frame, and the worst is at most +51 ms, which is one frame. The warm-up has fixed the WP7a first-`say()` lag: it is +16.6 ms in every take, against +17 to +83 ms in WP7a. Under load the tail grows. The only flips past 200 ms in my runs were the overlay take under load and the eval's own voice-only take in the parallel suite.

**Is the test's design fair?**
- **Uncaptioned-only asserts:** fair to the AC's letter, because AC-REC-06 and D8 say "flips … on each `say()`" and say nothing about captions.
- **But it leaves the default path unasserted.** Captions are the default, and spine-timed takes draw them when `say()` has text, yet that path is information only. My data shows the captioned path passes alone, so there is no reason to exempt it.
- **Retry once:** a reasonable workaround for "run alone" not being enforced by `node --test`. However, it turns an intermittent >200 ms tail into a pass, and it did exactly that in my full-suite run.
- **Fairer design:** make the sync test truly run alone (a separate invocation or a serial gate), assert both voice-only and captioned takes, and drop the retry. See S2.

## Caption-method recommendation

**Keep `showOverlay` as the default (DEC-06), and expose the DOM engine as a documented choice.**

Why keep the overlay:
- Run alone, overlay and DOM meet the AC equally (both median +17.5 ms). The overlay actually had the cleanest tail of the three modes (worst +18.3 ms).
- It leaves the page DOM untouched. That matters for live sites, selectors and `page.evaluate` storyboards.
- My inference, not measured: it should survive in-take navigations, while an injected caption is lost when the document is replaced.

The DOM engine's case is narrow:
- Its advantage only appears under CPU contention: 0 of 66 flips over 51 ms across both of my sets, against one +250 ms overlay flip under load, which matches the builder's "about 1 in 25".
- Today it can only be chosen with the undocumented env var `PEAK_MEDIA_CAPTION_ENGINE`.

Recommended changes:
- Add `--caption-engine overlay|dom` (or document the env var in SKILL.md and storyboard-api.md).
- Advise `dom` for sync-critical narrated takes captured on a busy machine.
- I don't recommend switching the default on this evidence. A single loaded outlier is not enough to give up the DOM-isolation property.

## AC-REC-08 stills (read by me)

All three sheets show the same app states at about 1.7, 4.9, 7.6, 10.2 and 12.7 s:
1. "Buy milk" added (1 left).
2. "Book the de…" being typed under "Buy milk" and "Call the plumber".
3. "Buy milk" ticked and struck through; 3 tasks.
4. The Active filter: "Call the plumber", "Book the dentist".
5. After Clear done, back on All: 2 tasks.

No blank or half-rendered frames.

- **default** (`AC-REC-08-verifier-default.jpg`)
  - **Text:** every frame shows its caption, exactly as written in `CAPTIONS`, in white bold sans: "A small to-do list. Type a task and press Enter." / "New tasks land at the bottom of the list." / "Tick a task when it is done." / "Filters show what is left, or what is done." / "Clear done tasks to tidy up."
  - **Style:** a dark, semi-opaque, rounded bar, bottom-centre.
  - **Placement:** it covers nothing in the app.
- **no-captions** (`AC-REC-08-verifier-no-captions.jpg`): the same five frames with no caption. The bottom area is plain background.
- **caption-css** (`AC-REC-08-verifier-caption-css.jpg`)
  - **Text:** the same five texts.
  - **Style:** visibly restyled: an amber/yellow card at bottom-left, square corners, a thick dark left border, and dark italic serif (Georgia-like) text.

## Deviations (handoff items 1–8)

1. **Clips laid at the planned spine time, not at the actual `say()` time: consistent.**
   - **§6:** plate-factory-workflow.md §6 ("One timing model") puts the clock in the spine: "every renderer … is timed to the spine manifest". The voice therefore belongs where the spine puts it, and the take sounds like the assembled video.
   - **D8 and plan §2:** web2video's "logged start times" predates the spine (the old recorder synthesized its own TTS). In spine mode `say()` sleeps until the planned time, so on-time calls give the same answer either way. My sync takes had `lateMs` 0–8 ms.
   - **Honest under D8:** laying audio at the planned time keeps D8 honest. A late `say()` shows up as picture lag in the measurement instead of being hidden.
   - **Recorded:** lateness is kept (`x-lateMs`, `x-take.says`) and documented (storyboard-api.md, SKILL.md "How it fits the spine").
   - **Example:** the deck's first `say()` was +224 ms late with `--lead-ms 950`. The audio stays at 950 ms, which is the intended behaviour.
2. **`--lead-ms 950` for the deck: a legitimate fixture choice, not tuning the check.**
   - The check keeps its D9 values (0.02 / −40 dB / 900 ms / 100 ms edge).
   - Control A shows the same deck at the default lead-in fails, with 727 ms gaps.
   - The deck loop itself (`wait(250)` + slide change + `wait(900)` before `say`) needs about 1150 ms of gap, so a 1200 ms gap is what the loop was designed for. Runtime is 21.4 s against 20 s (+7.1%, inside ±10%).
   - It is documented in SKILL.md:99-101,122 and storyboard-api.md.
3. **Fades 500 → 200 ms: justified. It makes the check able to fail, not easier to pass.**
   - Control B reproduced the builder's claim: with 500 ms fades the highest scene score is 0.011, no change is detected, and check-take passes vacuously.
   - At 200 ms both slide changes are detected, and Control A proves they fail when they land in short gaps.
   - The underlying weakness is in check-take, not the deck: any real deck with slow fades gets a vacuous PASS. See S1.
4. **Non-narrated manifests are `beatgrid` with a nominal `bpm: 60`: acceptable under the v1 contract.**
   - They validate, and they carry `narrate:false` plus caption timings, as D11 asks.
   - `bpm: 60` is fiction a consumer might trust. Lead to decide whether a v2 `kind: "take"` is wanted. (nit N3)
5. **AC-REC-06 asserts voice-only takes, with a retry: see the sync section and S2.**
   - The default captioned path does meet the AC when run alone.
   - The asserted set should include it, and the retry should go.
6. **±1 s reproduction tolerance: too loose.**
   - The observed difference is 4–5 ms alone (13 ms in the builder's run), and ±1 s is 30 frames. A real regression would slip through, for example losing the warm-up (+100 ms) or a caption-queue stall.
   - The real cause of the failure the builder saw is the parallel suite, not real-time jitter.
   - Suggest ±3 frames (100 ms) for caption starts and ±1 frame for videoMs, with the file run serially (S2). (nit N1)
7. **New flags `--manifest` and `--max-ms`: fine.** They are not narration flags, they are listed in `--help` and SKILL.md, and AC-REC-01 still passes (in the 81/81 suite).
8. **Ownership: confirmed.** See Scope.

## Scope

- **Changed paths:** `git diff --name-only a9fcfc5..9ae47c5` has 30 files, all under `skills/video-capture/**`, `evals/video-capture/**`, `docs/build/evidence/WP7b/` or `docs/build/wp/WP7b/`.
  - Nothing is touched under `lib/` or `schemas/`.
  - No other doc is changed, and no contract change is logged or needed.
  - The edits to WP7a files stay inside `skills/video-capture/**`: capture.mjs, `examples/deck/index.html` (disclosed) and storyboard-api.md.
- **Media:** no MP4, WAV, WebM or MKV is in the diff or among tracked files. Evidence is JPEG, JSON and logs only.
- **Brand strings:** `grep -ril peakflames skills/ evals/` is empty.
- **SKILL.md:** complete and neutral.
  - It covers when to use it and when not, the 8-step workflow (playwright-cli → storyboard → capture → check-take → stills → keep manifest), every capture flag, captions (style, `--caption-css`, hold), checks, the spine relationship (no TTS, no narration flags) and both examples.
  - The only gap is the caption-engine choice (S3).

## Findings

**Blocker:** none.

**Should-fix**
- **S1. `skills/video-capture/scripts/check-take.mjs:69-74`: zero detected scene changes is reported as PASS.**
  - On a narrated track that is almost always a missed detection, not a clean take. Gradual transitions (≥ about 300–500 ms fades) score under 0.02 per frame.
  - Control B: the deck with its original 500 ms fades gives `note no scene changes found` and then `PASS`.
  - Fix: when the track is not silent and no change is found, print a warning saying gradual fades are invisible at this threshold (or exit 1 with `--strict`). Better still, also score changes over a short window (for example frame k against frame k−6) so fades are caught.
  - AC-REC-07 itself is protected only because the eval separately asserts that one change is detected per gap (`captions-mux.test.mjs:242-246`).
- **S2. `evals/video-capture/captions-mux.test.mjs:212-217`: the AC-REC-06 retry and the uncaptioned-only assert.**
  - In my full-suite run the first voice-only attempt failed (+251.6 ms) and the retry hid it.
  - Fix: run the sync test in true isolation instead of retrying. For example, gate it behind an env var that ac-run sets and run it as its own `node --test` invocation, or move it to its own file run with `--test-concurrency=1`.
  - Then also assert the captioned take, which passes when run alone (5/5 takes, worst +18.3 ms).
- **S3. `skills/video-capture/scripts/capture.mjs:426`: the caption engine can only be chosen with the undocumented `PEAK_MEDIA_CAPTION_ENGINE`.** Expose it as `--caption-engine overlay|dom` and document it in SKILL.md, or at least document the env var, so users can pick DOM for sync-critical takes (see the recommendation).

**Nits**
- **N1. `captions-mux.test.mjs:335-336`: the ±1 s reproduction tolerance.**
  - It is 200× the observed spread; tighten it to about 100 ms once S2 serializes the file.
  - Also, `re.command` vs `doc.command` (line 331) is self-referential: both come from `commandFor` of the same argv. It cannot catch a flag that `commandFor` drops. Comparing against the original spawn argv (or checking the caption band colour on the re-run) would.
- **N2. `evals/video-capture/fixtures/sync/storyboard.mjs`: the "no captions" sync take still runs with captions on.** It runs with captions enabled (`say("")`, overlay warm-up). A `--no-captions` take would measure the pure no-overlay path. That is minor, since the results are identical.
- **N3. `capture.mjs:343`: the nominal `bpm: 60` in non-narrated take manifests is meaningless data in a schema field.** Flag it for the Lead with deviation 4 (possible v2 `kind: "take"`).
- **N4. The spine-timed deck's first `say()` is +224 ms late with `--lead-ms 950`.** The loop waits 1150 ms before the first say. That is harmless (the audio is at its spine time) but it is reported as a warning on every documented deck run. SKILL.md could say "about 1150 ms" (the loop's real pre-roll) or note that the first-beat warning is expected.
