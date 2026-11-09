---
name: video-capture
description: |
  Captures a live web page in real time while a storyboard drives it (clicks, typing, scrolling,
  slide changes), with captions, and writes an MP4 plus a take manifest. Use it for app demos,
  site tours and web slide decks, on its own or as the `live` plates of a plate-factory video
  (timed to the spine's narration). No TTS here: the spine owns the voice.
  Triggers on: "record this web app", "screen-capture the site", "capture a demo of", "make a
  captioned demo", "record the deck", "capture the live plates", "tour this page".
---

You turn a live page plus a storyboard into a take: a real-time screen capture with captions
and, when it is timed to a spine, the spine's narration. Pages play live in Chromium, so anything
a browser can show can be captured; HyperFrames plates (`video-plates`) are the frame-by-frame
alternative for designed motion.

Scripts: `${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/` (`capture.mjs`, `check-take.mjs`).
Run `node <script> --help` for every flag. If a script says a dependency is missing, run
`bash ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh` and retry. Before writing a storyboard, Read
`references/storyboard-api.md`.

## When to use it

- A **captioned demo** of a web app or site (no key needed): the default mode.
- A **silent screen recording** (`--no-captions`).
- **Live plates** in a plate-factory project: `capture --plates plates.json --plate <id>` times the
  take to the spine and writes `renders/plates/<id>.mp4` at the plate's exact length.
- A **narrated** web deck or demo: write the narration with `video-spine` first, then capture with
  `--spine spine/manifest.json --mp4 …`. This skill never synthesizes speech; there are no
  `--narrate`, `--voice` or `--tts-model` flags.

Not for designed motion graphics, kinetic text or slides you are building from scratch: those are
`video-plates`.

## Workflow

1. **Serve or point at the page.** A local `index.html` (or folder) is served on 127.0.0.1; a URL
   is loaded as is. Live sites move: if a URL answers 4xx/5xx the take stops with nothing captured.
2. **Explore it with playwright-cli** (the authoring companion, not the recorder): open the page,
   take snapshots, find stable selectors (prefer roles, labels and text over CSS paths) and
   dry-run each interaction. `playwright-cli install --skills` installs its own skill.
3. **Choose the mode.** Captions only is the default. Ask about narration only if the user hasn't
   said; narration means a spine (`video-spine`, which needs an OpenRouter key for a real voice).
4. **Write `storyboard.mjs`** (API: `references/storyboard-api.md`). One `say()` per beat, the
   action under it, `waitForVoice()` before anything that must not overlap the beat. Keep the
   bottom fifth of the frame clear of content the captions would cover. Change slides or pages
   *between* beats, never during one.
5. **Capture.**
   ```bash
   node capture.mjs --storyboard storyboard.mjs --mp4 out/demo.mp4                  # captions
   node capture.mjs --storyboard storyboard.mjs --mp4 out/demo.mp4 --no-captions    # silent
   node capture.mjs --storyboard storyboard.mjs --mp4 out/demo.mp4 --spine spine/manifest.json
   node capture.mjs --plates plates.json --plate p3-demo                            # a live plate
   ```
6. **Check the take.** `node check-take.mjs out/demo.mp4` (narrated takes; see Checks).
7. **Review stills.** Sample a frame inside each `say()` window (times are in the take manifest's
   `captions[]` and `x-take.says`) and Read them:
   `node ${CLAUDE_PLUGIN_ROOT}/lib/verify/contact-sheet.mjs out/demo.mp4 --at 1.7s,4.9s,… -o review/demo.jpg`.
   Look for: the caption readable and not covering the action, the action finished before the
   next beat, no blank or half-loaded frames, nothing private on screen.
8. **Keep the take manifest** (`out/demo.take.json`) with the video: its `command[]` re-runs the
   take.

## Flags (`capture.mjs`)

| Flag | Meaning |
|---|---|
| `--storyboard <file.mjs>` | The storyboard (or from the plate with `--plates/--plate`) |
| `--out <file>` | Picture-only take: `.mp4`, `.webm` or `.mkv` (a plate's render) |
| `--mp4 <file.mp4>` | The deliverable: H.264 High, yuv420p, AAC 48 kHz, faststart, with narration or a silent track |
| `--url <url\|file>` | The page (else the plate's `live.url`, the storyboard's `url` export, or `index.html` beside it) |
| `--viewport WxH` | Browser size (default 1280x720, or the plate's) |
| `--no-captions` | No captions (silent mode) |
| `--caption-css <file.css>` | Replace the caption style (`.pm-caption-wrap`, `.pm-caption`) |
| `--caption-engine overlay\|dom` | Draw captions into the frames only (`overlay`, default) or into the page DOM (`dom`) |
| `--spine <manifest.json>` | Spine-timed mode: `say()` plays to the spine's clips |
| `--plates <plates.json> --plate <id>` | Capture one live plate to its planned window |
| `--audio-offset-ms <ms>` | Shift between picture and voice (spine-timed: `say()` fires at clip start minus this) |
| `--fps <n>` | Capture frame rate (default 30, or plates.json's) |
| `--manifest <file.json>` | Where the take manifest goes (default `<take>.take.json`) |
| `--max-ms <ms>` | Abort a take that runs longer (default: spine window + 2 s, else 10 min) |
| `--debug-requests` | Log every page request and failure |
| `--json` | Print the take summary |

## Captions

- On by default: a neutral bottom-centre, semi-opaque dark bar in the system sans font.
- `--caption-engine overlay` (default) draws it into the captured frames with Playwright's
  `screencast.showOverlay`; the page DOM is untouched. If `showOverlay` is unavailable, the caption
  falls back to the page DOM. Rarely, a page change made at the same moment as a caption appears
  reaches the frames up to ~200 ms late.
- `--caption-engine dom` injects the caption into the page instead. Choose it for sync-critical
  takes (a picture change on the same beat as a caption), when the page doesn't react to extra DOM
  (no MutationObserver-driven layout, no full-page screenshots of its own).
- `--caption-css` restyles it for a brand; `examples/ui-demo/captions-alt.css` shows the classes.
  A brand pack's `captionCss` is the file to pass.
- Hold time: about 3 words/s, at least 1.5 s (captions/silent modes), or to the clip's end
  (spine-timed). Keep captions short: one line of 6–12 words.

## Checks

- **`check-take.mjs <take.mp4>`** — every scene change (ffmpeg scene score > 0.02) must sit inside
  a silence of at least 900 ms (≤ −40 dB, 100 ms clear of each edge). Run it on the `--mp4`
  deliverable; the picture-only `--out` has no audio and is refused. A captions-only take's track
  is silent, so it always passes and says so. A failing timecode means a slide or page changed
  over speech: move the change between beats, or give the spine longer lead-ins
  (`spine --lead-ms …`; the deck loop needs about 950 ms). A narrated take with **no** detected
  change fails too: fades of ~300 ms or longer score under 0.02 per frame. Shorten the transitions
  or lower `--scene-threshold`; `--expect-cuts n` pins the expected count (`0` for a take that
  really has none).
- **probe-spec** (`lib/verify/probe-spec.mjs out/demo.mp4 --size 1280x720`) confirms the delivery
  spec.
- **The take summary** reports any `say()` that started after its clip; a few hundred ms in a deck
  loop is expected, more means the storyboard does too much before speaking.

## How it fits the spine

- The spine (`video-spine`) owns the clock and the voice. In spine-timed mode the n-th `say()` is
  the n-th clip of the window: it waits for the clip's planned start, `waitForVoice()` waits for
  its planned end, and the take lasts exactly the window. A late `say()` moves the picture, never
  the voice.
- `--mp4` lays the spine's own clips (from `spine/clips/`, the TTS cache or `narration.wav`) at
  their spine times plus the offset, at −16 LUFS, so a narrated take sounds like the final video.
  No OpenRouter call is ever made here.
- For live plates, `video-assemble` composites the picture-only `renders/plates/<id>.mp4` onto the
  spine's narration; the take's own audio is for review.

## Examples

- `examples/deck/` — a neutral 3-slide deck and the original deck loop; runs unchanged in all
  three modes. Narrated: `spine --brief examples/deck/brief.md --tts-model fake/tone --lead-ms 950 --out /tmp/deck-spine`,
  then `capture --storyboard examples/deck/storyboard.mjs --spine /tmp/deck-spine/manifest.json --mp4 /tmp/deck.mp4`.
  Expect `1 say() call(s) started after their clip: #1 +224 ms` (about): the loop waits 1150 ms
  before its first `say()` and the first clip starts at 950 ms. The voice stays at its spine time;
  only the first slide's picture is that much later. The warning is harmless here.
- `examples/ui-demo/` — a small static to-do app and a captioned storyboard (5 beats, about 14 s).
  No key: `capture --storyboard examples/ui-demo/storyboard.mjs --mp4 /tmp/ui-demo.mp4`.
