# Plan: `/web2video`, a general-purpose rebuild of `record-website-interaction`

**Status:** Draft for review · 2026-11-08
**Goal:** a public Claude Code skill that any user can install. Claude writes or points at a web page (a slide deck, an app demo, a site tour) plus a storyboard, and one command turns them into an MP4. Captions are on by default. Narration is optional and needs an OpenRouter API key only when it's used. When narration is on, every voice clip is archived so the audio can be rebuilt exactly.

Nothing in the skill is tied to Peakflames: no brand tokens, no channel assumptions, and neutral examples.

---

## 1. What we know the old skill did

These are recovered from the surviving Project docs (`narration-writing`, `voices`, `02-narration-script.md`, `narration.json`). Everything else in this plan is new design.

| Area | Recovered behaviour |
|---|---|
| Entry point | `node scripts/record.mjs --storyboard ./storyboard.mjs …` |
| Storyboard API | An async function given `page`, `say(text)`, `say("", { narrate })`, `waitForVoice()` and `wait(ms)`. Slides advance via `page.evaluate(n => window.deckGo(n), slide)`. |
| Flags | `--storyboard`, `--out` (.webm), `--mp4`, `--viewport WxH`, `--narrate`, `--no-captions`, `--manifest`, `--export-clips`, `--tts-model`, `--voice`, `--style`, `--audio-offset-ms` (default -100) |
| Captions | On by default. One short caption per `say()`, showing the spoken text. |
| TTS | Through OpenRouter, using `TTS_OPENROUTER_API_KEY`. The style is sent as `instructions`. ZDR was on, but how is unknown. Supported models: `google/gemini-3.8-flash-lite-tts`, `google/gemini-3.8-flash-tts`, `microsoft/mai-voice-2.1-flash` and `microsoft/mai-voice-2.1`. |
| Voices | Listed in `scripts/voices.mjs`. `--voice` is validated before a browser opens. Gemini names are case-insensitive, default `Achird`, and `Lumi` is accepted. For MAI, pass the short ID (default `en-GB-Emily`) and the recorder adds the model suffix. No SSML is sent. |
| Clip cache | `~/.cache/record-website-interaction/tts/<sha256(model \0 voice \0 style \0 text)>.wav` |
| Manifest | Same shape as `narration.json`: `model`, `voice`, `style`, `audioOffsetMs`, `command[]`, `videoMs`, `wallMs`, and `clips[]` with `n`, `text`, `style`, `startMs`, `durationMs`, `words`, `wpm` and `file`. |
| Feedback | Prints wpm per clip and warns when one clip runs far slower than the rest. |
| Timing model | Real time. A first take pays 2–6 s per new clip, so you run twice: the first take fills the cache and the second is the deliverable. |
| Helper | `scripts/sample-voice.mjs` reads one paragraph with 2–3 voices and reports wpm. |
| Measured quality | 113 ms audio drift on a 3:15 deck, and every slide change landed in a silent gap. |

## 2. Design

### Three modes, one storyboard

| Mode | Flags | Needs a key | What `say(text)` does |
|---|---|---|---|
| Silent | `--no-captions`, no `--narrate` | No | Does nothing apart from timing. Plain screen recording. |
| Captions only (default) | none | No | Shows the caption, holding it for its reading time (about 3 words/s, minimum 1.5 s). `waitForVoice()` waits for that hold. |
| Narrated | `--narrate` | **Yes** | Synthesizes or reuses the clip. The caption shows unless `--no-captions` is set. `waitForVoice()` waits for the clip to end. |

The same storyboard runs unchanged in every mode. If `--narrate` is set with no key, the run stops before a browser opens and prints a one-line message saying how to set `TTS_OPENROUTER_API_KEY`, or to drop `--narrate`.

### Recording engine

The Playwright library (Node), using `recordVideo` at viewport size and real-time capture, as the original did. The browser plays the page while the recorder logs when each `say()` fires. Audio is never played in the browser; ffmpeg lays it onto the video afterwards from the logged start times plus `--audio-offset-ms`.

### Role of playwright-cli

playwright-cli is the authoring and debugging companion, not the recorder.

- **Install:** `playwright-cli install --skills`, or add `-g` for all projects.
- **Authoring:** Claude uses it to open the page, take snapshots, find selectors and dry-run interactions before writing a storyboard.
- **Possible captions:** its `page.screencast.showOverlay`/`showChapter` APIs are candidates for drawing captions. They are used only if the pinned Playwright version exposes them; otherwise the recorder injects its own caption DOM.

### Pipeline for one take

1. Parse flags. Validate the mode, the key (narrated mode only), the model and the voice. Check that `ffmpeg` and Chromium exist. Fail before launching anything.
2. Launch Chromium with `recordVideo`, record `t0`, and load `--url` or the storyboard's page.
3. Run the storyboard. Each `say()` logs `startMs`, shows the caption, gets the clip (narrated mode) and sets `voiceEndsAt`. `waitForVoice()` sleeps until `voiceEndsAt`.
4. Close the context, which saves the `.webm`.
5. If `--mp4` is set: ffmpeg places the clips with `adelay` and `amix`, loudness-normalizes to -16 LUFS, and muxes everything into H.264/AAC with faststart. Silent and captions-only takes get a silent AAC track, so players behave.
6. Write the manifest. Narrated mode also copies clips to `--export-clips` and prints a per-clip table of words, seconds and wpm, with a warning for slow clips.

### Supporting pieces

- **Caption style:** neutral by default (bottom-centre, semi-opaque dark bar, system sans font). `--caption-css <file>` lets users apply their own brand.
- **Clip cache:**
  - Lives at `~/.cache/web2video/tts/`, using the same key formula as before.
  - The legacy `~/.cache/record-website-interaction/tts/` is also read, so old archived clips still replay.
- **Data retention (ZDR):** every OpenRouter request explicitly opts out of data retention through OpenRouter's provider routing. The exact field and the TTS endpoint shape are confirmed from OpenRouter's current docs at the start of execution, not guessed.
- **Offline test provider:** `--tts-model fake/tone` generates a tone sized by word count. Tests and CI run with no key and at no cost.
- **Setup:** `scripts/setup.sh` checks Node 18 or later and ffmpeg, installs the pinned Playwright plus Chromium into the skill's own folder, and says plainly what is missing. It is safe to re-run.

### Packaging

The skill ships as a new public plugin in `claude-plugins-peakflames`, following that repo's CLAUDE.md conventions.

```
plugins/web2video/
  .claude-plugin/plugin.json      # version 0.1.0
  CHANGELOG.md                    # ## [0.1.0] — UNDER DEVELOPMENT
  README.md                       # install, the three modes, key setup, examples
  skills/web2video/
    SKILL.md                      # when to use, workflow, storyboard API, flags, checks
    references/narration-writing.md   # ported and made brand-neutral
    references/voices.md
    references/storyboard-api.md
    scripts/setup.sh
    scripts/record.mjs
    scripts/voices.mjs
    scripts/sample-voice.mjs
    scripts/check-take.sh         # silence vs scene-change report
    scripts/lib/{tts,cache,mix,captions,manifest}.mjs
    scripts/package.json          # pinned playwright
    examples/deck/                # neutral 3-slide deck + voice-only storyboard
    examples/ui-demo/             # small static todo app + captioned storyboard
    test/                         # node:test suites
```

The root `marketplace.json` lists the plugin, and a version bump touches both `plugin.json` and the plugin's `CHANGELOG.md`.

### SKILL.md workflow for Claude

1. Run setup if needed.
2. Build or serve the page.
3. Use playwright-cli to explore it and confirm selectors.
4. Choose the mode. Ask about narration only if the user hasn't said, and mention that it needs an OpenRouter key.
5. For narrated videos:
   1. Write the narration per `narration-writing.md`.
   2. Use `sample-voice.mjs` to pick a voice.
6. Write `storyboard.mjs`.
7. Record. In narrated mode, take 1 fills the cache and take 2 is the deliverable.
8. Run `check-take.sh` and review sampled stills.
9. Narrated mode only: cold-read the transcript.
10. Archive the manifest (and clips, when narrated) next to the video.

## 3. Definition of done and how each item is verified

| # | Requirement | Verification |
|---|---|---|
| D1 | Every flag in §1 keeps its name and meaning. Added flags: `--url`, `--caption-css`, `--debug-requests`. | `record.mjs --help` lists them all, and a test parses each one. |
| D2 | Bad input fails before a browser launches | Tests, each exiting non-zero in under 2 s with no Chromium launch recorded: (a) `--voice Nope`, (b) `--narrate` with no key (the message names the env var), (c) missing ffmpeg (simulated). |
| D3 | **No key needed without narration** | With `TTS_OPENROUTER_API_KEY` unset, the captions-only and silent examples produce a passing MP4. The network spy shows zero calls to OpenRouter. |
| D4 | Cache keys match the old skill byte for byte | Test: for all 9 clips in the archived `narration.json`, `sha256(model\0voice\0style\0text)` equals the recorded `file` name. This proves the formula was rebuilt exactly. |
| D5 | The legacy cache is honoured | Test: a WAV seeded in the legacy folder is used, with zero synthesis calls. |
| D6 | The storyboard API matches §1 | `examples/deck/storyboard.mjs` uses the original deck loop (`waitForVoice`, `wait(250)`, `deckGo`, `wait(900)`, `say("", {narrate})`) and runs unmodified in all three modes. |
| D7 | The MP4 meets spec | `ffprobe` asserts H.264 High, yuv420p, AAC 48 kHz, faststart, the requested viewport, and a duration within 1 s of `videoMs`. |
| D8 | Audio sync | The test page flips a full-frame colour on each `say()`, and the fake tone starts at sample 0. Pass if the median offset is ≤ 120 ms and the worst is ≤ 200 ms. The original measured 113 ms. |
| D9 | Visual changes land in silence | On the narrated example deck, `check-take.sh` reports every scene change (threshold 0.02) inside a silence window (-40 dB, ≥ 0.9 s). |
| D10 | Captions | In the UI demo, frames sampled inside each `say()` window show the caption text, read by Claude from stills. With `--no-captions` the same frames show none. `--caption-css` visibly changes the style. |
| D11 | The manifest matches the `narration.json` shape | A JSON-schema test. `command[]` reproduces the invocation. Non-narrated takes record `"narrate": false` and caption timings. |
| D12 | Reproducibility | With the fake provider, run 2 makes zero synthesis calls and reports "N/N cached". Exported clips copied into an empty cache also reproduce the run. |
| D13 | wpm table and slow-clip warning | A test makes one fake clip 2× slower and asserts the warning names that clip. |
| D14 | Live TTS through both providers | Manual run with a key: one Gemini voice and one MAI voice each produce audible speech at a plausible wpm. The ZDR field appears in the `--debug-requests` log, with the key redacted. |
| D15 | `sample-voice.mjs` | Three Gemini voices on one paragraph produce three WAVs, with wpm printed for each. |
| D16 | Fresh-machine setup | In a clean Linux container, `setup.sh` followed by the captions-only example passes with no manual steps. macOS is checked once by hand. |
| D17 | Brand neutrality | A grep of the plugin finds no "peakflames"/"Peakflames" outside author metadata, and examples carry no brand assets. |
| D18 | Usable cold by any user | A fresh session with only the plugin installed is asked to "make a captioned 20-second demo of this todo app" and, separately, a narrated version. Both pass, using only SKILL.md. An independent reviewer agent checks D7–D10 on the results. |
| D19 | Plugin conventions | `plugin.json` and `CHANGELOG.md` versions match, `marketplace.json` lists the plugin, and `/plugin marketplace add …#develop` followed by install exposes `/web2video`. |

Out of scope for v1:

- Frame-perfect seek rendering (HyperFrames' job).
- Background music.
- Vertical re-layout.
- TTS providers other than OpenRouter. The provider layer is pluggable, so they can come later.

## 4. Build order (execution session)

1. **Confirm unknowns.** Check the OpenRouter TTS request and response shape, the ZDR field, and the audio format each model returns. Check whether the pinned Playwright exposes `page.screencast`. Report findings before writing recorder code.
2. **Scaffold.** On `develop`, branch `feature/web2video-initial`. Create the plugin skeleton, `package.json` and `node:test`, then run `playwright-cli install --skills`.
3. **Pre-flight and cache.** Write `voices.mjs`, `cache.mjs` and the pre-flight checks. Verify D2, D4 and D5.
4. **TTS providers.** Build the fake provider, then OpenRouter Gemini, then OpenRouter MAI.
5. **Recorder.** Build the three modes, captions, mix and mux, and the manifest and clip export. Verify D1, D3, D6, D7 and D11–D13.
6. **Examples.** Add the two examples and `check-take.sh`. Verify D8–D10.
7. **Docs and setup.** Write SKILL.md, the references, `sample-voice.mjs`, `setup.sh` and the README. Verify D15–D17 and D19.
8. **Live run.** Run with a key to check D14.
9. **Cold-start test.** Verify D18.
10. **Ship.** Open a PR to `develop` with a D-item results table. Ask before pushing.

## 5. Decisions needed before approval

1. **Plugin home:** a new plugin in public `claude-plugins-peakflames` (recommended), or a standalone public repo of its own.
2. **Recording mode:** real-time capture only, as in the original (recommended), or also a seek-based mode now.
3. **Original 3.0 deck sources:** do `deck/`, `storyboard.mjs` and `narration-clips/` from the 3.0 upgrade video still exist anywhere? If so, a bonus check re-records that deck from the archived clips and compares it to the original MP4.

## 6. Kickoff prompt for the new session

> Execute the approved plan in `web2video-plan.md` (attached) in `peakflames/claude-plugins-peakflames`, following that repo's CLAUDE.md. Branch `feature/web2video-initial` from `develop`. Start with Build order step 1 and report what you confirmed before writing recorder code. Treat §3 as the acceptance checklist and finish with a table of each D-item's result and evidence. Ask before any push.
