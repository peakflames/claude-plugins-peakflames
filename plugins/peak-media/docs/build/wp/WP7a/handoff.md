builder-id: builder-wp7a-77ef3901

# WP7a handoff — Capture engine (video-capture)

Branch `feature/peak-media-wp7a`, based on `feature/new-peak-media-plugin` @ 6aaa5b2. Model: claude-opus-5-5, worktree Builder session, 2026-11-08. Ran alone.

## Done

- `skills/video-capture/scripts/capture.mjs` (AC-BASE-09), built on `runCli`:
  - **Engine (DEC-06).** Uses `page.screencast.start({fps, size, quality, onFrame})` on the pinned Playwright, with the pinned Chrome from `lib/hf.browserPath()`. I confirmed at run time that `page.screencast.start` and `showOverlay` exist; `capture` exits 3 if they don't.
  - **Clock.** t0 is the first `onFrame` timestamp (epoch ms). Every `say()`, `wait()` and `waitForVoice()` is timed on that clock (`performance.timeOrigin + performance.now() − t0`).
  - **Frame grid.** `FrameGrid` puts each frame on a constant-rate grid by its own timestamp: slot = round((ts − t0) × fps / 1000). Unique JPEGs go to a temp dir, and duplicate frames are hard links, so a take is exactly `round(ms × fps / 1000)` frames. System ffmpeg encodes them.
  - **Modes.** Silent (`--no-captions`), captions (the default) and spine-timed (`--spine`, or `--plates`/`--plate`).
  - **Spine-timed `say()`.** The n-th `say()` is the n-th clip in the window, and nothing is synthesized. An early call waits for the clip's planned start; a late call starts at once and the delay is reported. `waitForVoice()` waits for the clip's planned end. The take is exactly the window's length. A storyboard that runs more than one frame past the window is an error.
  - **Pre-flight, before any browser launch:** flags, then `plates.json` and the plate, the storyboard file, `--spine` (schema-validated), ffmpeg/ffprobe, the pinned Playwright (version checked against `pins.json`), Chromium on disk, and finally the storyboard module import.
  - **Pages.** Local pages are served on 127.0.0.1. Capture waits for `networkidle` (at most 5 s) before t0, and a main document that answers HTTP ≥ 400 is an error (`… answered HTTP 404 — check the URL`).
  - **Captions (minimal hook for WP7b).** Drawn with `page.screencast.showOverlay(html)` and removed on our own clock. `showOverlay(html, {duration})` resolves only when the overlay is removed, which stalled storyboards, so I don't use it. Default style is neutral; `--caption-css` replaces it.
  - **Output.**
    - `--out` (`.mp4` H.264, `.webm` VP9 or `.mkv`) is picture only.
    - `--mp4` also writes H.264 High, yuv420p (limited range), a silent AAC 48 kHz track and faststart. A hand check with `probe-spec` passed; formal verification is AC-REC-05 in WP7b.
    - `--json` prints the take summary (mode, frames, `videoMs`, `wallMs`, and each `say()` with its clip and lateness).
    - `--debug-requests` logs page requests, failures and HTTP errors.
- `skills/video-capture/references/storyboard-api.md` — the D6 API, the three modes, spine-timed rules, captions, which page loads, the deck loop and the output.
- `skills/video-capture/examples/deck/` — a neutral 3-slide deck (`index.html`, "Water in the morning", `window.deckGo`) and `storyboard.mjs` with the original loop (`waitForVoice`, `wait(250)`, `deckGo`, `wait(900)`, `say("", {narrate})`). `brief.md` and `script.md` let `spine.mjs` build the matching 3-clip spine. No brand content.
- F3 storyboards (the F3 brief assigns them to WP7a): `docs/build/fixtures/F3/storyboard-{feature,anchor,openspec}.mjs`, plus `glide.mjs`, an eased scroll to a heading or paragraph that settles if the layout shifts and outlines its target.
- Evals in `evals/video-capture/capture.test.mjs`. Helpers in `helpers/projects.mjs` build real spines with `spine.mjs --tts-model fake/tone` and a temp TTS cache. The local stand-in page is `fixtures/live-page/index.html`.
  - **AC-BASE-09:** the shared `baseline()` with 8 bad inputs.
  - **AC-REC-01:**
    - `--help` lists all 10 flags and none of `--narrate --tts-model --voice --style --export-clips`, and each of those is rejected as an unknown option.
    - The spec's option table parses every flag (`parseArgs`, strict).
    - The real CLI accepts each flag: with ffmpeg removed, every run reaches pre-flight and stops on "ffmpeg not found".
  - **AC-REC-02:** six cases — missing Chromium, ffmpeg, ffprobe, a schema-invalid spine, a spine that isn't JSON, a missing spine. Each exits non-zero in < 2 s with a one-line error. "No launch" is proven by a browser spy: `HYPERFRAMES_BROWSER_PATH` points at a wrapper that touches a marker, then execs the real Chrome. A control run shows the spy does record a real launch.
  - **AC-REC-03:** the deck storyboard runs in all three modes. The file hash is unchanged afterwards and the loop steps are present. Each take has 3 `say()` calls, a frame count that matches the file, 1280×720@30, and changing pictures. Silent has no captions; captions holds each for ≥ 1.5 s. Spine-timed matches clips 1–3, `waitForVoice` holds each slide until the previous clip ends + 1150 ms, and the take equals the spine's `totalMs` ±1 frame.
  - **AC-REC-04:** F3's 3 live plates on a real fake/tone 3-clip spine, with plate windows taken from the spine's beats and the local page. Each render is `durationMs` ±1 frame and exactly `framesFor(durationMs)` frames, and `video-assemble`'s `checkRenders` accepts all three. A unit test covers the frame-grid placement.
  - **No internet in the evals.** The loopback server can't run under the no-network preload, because `listen` triggers `dns.lookup`. Capture runs therefore turn the preload off and instead assert from `--debug-requests` that every page request went to `127.0.0.1` and none failed. That checks the browser's own traffic, which the preload never covered anyway.

## Evidence (`docs/build/evidence/WP7a/`)

- **`f3-live-contact.jpg`** — F3 captured once against the real sites (GitHub README, OpenSpec), with the three plates joined and one frame every 1 s.
  - **0–7 s, r1-feature.** GitHub's peak-workflow README. The caption "In peak-workflow, every requirement is a Gherkin scenario with a stable ID." appears from about 0.3 s. The page glides down to the "formal requirements baseline lives in Gherkin-style … TOR requirement IDs" paragraph, which is outlined in amber from about 3 s.
  - **7–14.4 s, r2-anchor.** Caption "That ID is what the epic plans against, and what the verifier checks."
    - About 8 s: the view first lands on "Branch Families". GitHub's lazily rendered diagrams grew after the jump.
    - About 9 s: the settle step corrects to the "TOR Requirement IDs" table.
    - From about 10 s: it glides to the "TOR IDs are stable once merged … foreign keys" paragraph, which is outlined.
  - **14.4–20 s, r3-openspec.** OpenSpec Quickstart with the caption "OpenSpec takes the lighter road: propose, apply, archive." It glides to "The loop at a glance" (the explore → propose → review → apply → archive diagram) and ends on the outlined "Step 5: Archive" heading.
- `f3-live-takes.json` — the three take summaries (frames, `videoMs`, `say()` timing). The plates came out at 7033, 7400 and 5567 ms against planned 7030, 7393 and 5575 ms, all within ±1 frame.
- `f3-live-<id>.log` — the command, exit code, request counts and any failed or 4xx/5xx requests per plate.

## Open / deviations

1. **`page.screencast.start({path})` is not used.** The `path` option needs Playwright's own downloaded ffmpeg (`ms-playwright/ffmpeg-1013`), which `setup.sh` doesn't install: the first probe failed with "Executable doesn't exist … npx playwright install ffmpeg". Capture uses `onFrame` only and encodes with the system ffmpeg (DEC-11). The video is then built on the same clock as t0, frame for frame, so there's no second clock to drift. It's still `page.screencast` (DEC-06). **The Lead may want a DEC entry recording this**, or a `setup.sh` change if `path` is wanted later.
2. **Flags added beyond AC-REC-01's list:** `--plates`, `--plate`, `--fps`, `--json`. None is a narration flag. `--plates`/`--plate` are how a live plate gets its storyboard, URL, viewport, fps, size, spine and window from `plates.json`; the default output is `<project>/renders/plates/<id>.mp4`.
3. **The F3 OpenSpec URL is stale.** `https://openspec.dev/docs/the-workflow` now answers **404**. The first live run captured a 404 page, which is why capture now fails on HTTP ≥ 400. The workflow content is now at `https://openspec.dev/docs/quickstart`. The evidence run overrode r3's URL to that page in its temp copy of `plates.json`. **I did not edit `F3/plates.json`; the Lead should update it.**
4. **Live sites are flaky.** GitHub's README keeps laying out after load (diagrams), so the r2 opening frame lands about 1 s off target before it settles (see above). On this run, each GitHub plate made 140 requests. One was a 404 on a GitHub navigation payload that a signed-out session gets; nothing visible was affected. OpenSpec made 43 requests, and 4 link prefetches were aborted (`ERR_ABORTED`), which is harmless.
5. **F3's committed `spine/manifest.json` is hand-written** (7000/6500/6500). AC-REC-04 builds a real spine from F3's beats and clip texts with `spine.mjs` (`--max-hold-ms 3000` to reach the 20 s target), so plate windows come from that spine (about 7030/7393/5575 ms).
6. **`--audio-offset-ms` behaviour.** In spine-timed mode it shifts `say()` (clip start minus offset; the default is the spine's `audioOffsetMs`). Otherwise it is recorded for the WP7b mux (default −100, as in the original).
7. **Left for WP7b:** captions styling and verification, narration mux, `check-take`, the take manifest and the ui-demo. There is no `SKILL.md` for video-capture yet; it isn't in WP7a's owns list.

## Results

- `node --test plugins/peak-media/evals`: 71 tests, 71 passed, 0 failed (run alone).
- `ac-run --trace`: PASS — 77 ACs, 12 briefs, 0 problems.
- `ac-run --wp WP7a`:

| AC | method | run | register | evidence |
|---|---|---|---|---|
| AC-REC-01 | script | pass | not-started | — |
| AC-REC-02 | script | pass | not-started | — |
| AC-REC-03 | script | pass | not-started | — |
| AC-REC-04 | script | pass | not-started | — |
| AC-BASE-09 | script | pass | not-started | — |

## Suggested CHANGELOG bullets (Added)

- **`capture` (video-capture)** — plays a live page in real time from a storyboard and screen-captures it with Playwright `page.screencast`. It runs in silent, captions or spine-timed mode, and a live plate lasts its planned duration to the frame.
- **Storyboard API reference and example deck** — `references/storyboard-api.md` and a neutral 3-slide deck whose storyboard runs unchanged in all three modes.

## Round 1 (Lead, after verify-1)

- Should-fix: the 10 s first-frame timer is cleared once the first frame arrives (a 200 ms take now exits in ~3 s, was ~11 s).
- Nits left for WP7b/WP9: overrun only detected after the storyboard returns; first say() lag (+17–83 ms) — a warm-up would help; frames rounded to nearest slot (±½ frame).
