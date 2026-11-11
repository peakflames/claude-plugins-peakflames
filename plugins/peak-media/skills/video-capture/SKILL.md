---
name: video-capture
description: |
  Captures a live web page in real time while a storyboard drives it (clicks, typing, scrolling,
  slide changes), with captions and a visible cursor, and writes an MP4 plus a take manifest. Use
  it for app demos, site tours and web slide decks, on its own or as the `live` plates of a
  plate-factory video (timed to the spine's narration). No TTS here: the spine owns the voice.
  Triggers on: "record this web app", "screen-capture the site", "capture a demo of", "make a
  captioned demo", "record the deck", "capture the live plates", "tour this page".
---

You turn a live page, a storyboard and a beat list into a take: a real-time screen capture with
captions, a cursor and, when it is timed to a spine, the spine's narration. Pages play live in
Chromium, so anything a browser can show can be captured; HyperFrames plates (`video-plates`) are
the frame-by-frame alternative for designed motion.

Scripts: `${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/` (`capture.mjs`, `check-take.mjs`).
`node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --help` and the same with
`signin --help` or `serve --help` list every flag; `--version` prints the plugin version. If a script says a
dependency is missing, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"` and retry. Before
writing a storyboard, Read `references/storyboard-api.md`.

## When to use it

- A **captioned demo** of a web app or site (no key needed): the default mode.
- A **silent screen recording**: `--no-captions`.
- A **narrated** web deck or demo: write the narration with `video-spine` first, then capture with
  `--spine spine/manifest.json`. This skill never synthesizes speech; there are no `--narrate`,
  `--voice` or `--tts-model` flags.
- **Live plates** in a plate-factory project: `--plates plates.json --plate <id>` times the
  take to the spine and writes `renders/plates/<id>.mp4` at the plate's exact length.

Not for designed motion graphics, kinetic text or slides you are building from scratch: those are
`video-plates`.

## Modes

Pass exactly one beat source: `--script`, `--spine`, or `--plates` with `--plate`. Every beat in
it must be run once, in order, by `beat(id, fn?)` in the storyboard.

| Mode | Flags | Caption text | Audio track | Key needed |
|---|---|---|---|---|
| Captions (default) | `--script script.md` | each `## <id>` section's `On screen:` line, else its first sentence | silent AAC | no |
| Silent | `--script script.md --no-captions` | none (the caption's reading time still paces the beat) | silent AAC | no |
| Narrated | `--spine spine/manifest.json` | the spine's `beats[].onScreenText` | the spine's clips at their spine times, −16 LUFS | only to build the spine |
| Live plate | `--plates plates.json --plate <id>` | the plate's beat, from the project spine | none (picture-only) | only to build the spine |

- Only a `kind: "narration"` spine makes a narrated take. A beatgrid spine (`spine/beatgrid.json`)
  times the beats to its grid but runs in captions mode (silent with `--no-captions`), with a
  silent AAC track.
- `--no-captions` with a narration spine makes a voice-only video.
- `script.md` is `video-spine`'s script format: one `## <beat-id>` section per beat, a paragraph,
  an optional `On screen:` line and an optional `Style:` line. The text lives there once; the
  storyboard names beats by id only.

## Presets

`--preset` picks the capture size, fps and encode of a standalone take. Pick it from where the
video is going; default `web`. `--viewport` and `--fps` override the capture size and fps; the
encode stays the preset's. Live plates refuse `--preset`: they keep `plates.json`'s size and fps.

| Preset | Capture | Encode | Audio | Pick it when the user says |
|---|---|---|---|---|
| `web` (default) | 1280×720 @ 30 fps | H.264 High, CRF 26, x264 medium | AAC-LC 48 kHz stereo, 128 kbps | website, docs, chat, email, "small" |
| `youtube` | 1920×1080 @ 30 fps | H.264 High, VBR ~8 Mbps (12 above 30 fps, peak ×1.5), CABAC, closed GOP of half the fps, 2 B-frames, no edit lists | AAC-LC 48 kHz stereo, 384 kbps | YouTube, a video platform, "upload" |
| `hifi` | 1920×1080 @ 60 fps | H.264 High, CRF 16, x264 slow | AAC-LC 48 kHz stereo, 256 kbps | archive, editing, "best quality", "60 fps" |

Every preset is yuv420p with faststart. When the user names a destination with a size limit,
compare the reported size with it and say so; capture enforces no cap.

On `youtube` (no edit lists), a voice clip placed at 0 ms of the take loses its first ~21 ms. Keep
the spine's lead-in (`spine --lead-ms`, default 250 ms, minimum 200) so no clip starts at 0 ms.

## Workflow

1. **Serve or point at the page.** A local `index.html` (or folder) is served on 127.0.0.1; a URL
   is loaded as is. Live sites move: if a URL answers 4xx/5xx the take stops with nothing captured.
2. **Sign in, if the page needs it** (see Signed-in pages). Never type a real password yourself.
3. **Explore it with playwright-cli** (the authoring companion, not the recorder): open the page,
   take snapshots, find stable selectors (prefer roles, labels and text over CSS paths) and
   dry-run each interaction. `playwright-cli install --skills` installs its own skill.
   playwright-cli blocks `file://`: for a local page, serve its folder on 127.0.0.1 with
   `node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" serve <folder>` (Bash in
   the background; see Local pages) and open the URL it prints.
4. **Choose the mode and preset.** Captions is the default. Ask about narration only if the user
   hasn't said; narration means a spine (`video-spine`, which needs an OpenRouter key for a real
   voice). Ask where the video is going if it decides the preset.
5. **Write `script.md`** (captions or silent) or build the spine (narrated): one beat per action
   or slide, captions of 6–12 words.
6. **Write `storyboard.mjs`** (API: `references/storyboard-api.md`): one `beat(id, fn)` per beat,
   in script order, with the action the beat describes inside `fn`. Change slides or pages
   *between* beats, never inside one. Keep the bottom quarter of the frame clear of content the
   captions would cover. Hide anything private with `export const hide = ['<selector>', …]`
   (hidden before the first frame and after every `goto`), never with a style tag added inside
   the default function, which runs after recording starts.
7. **Capture.**
   ```bash
   # captions, web (default preset)
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/demo.mp4
   # captions, youtube
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/demo.mp4 --preset youtube
   # silent
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/demo.mp4 --no-captions
   # narrated
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --spine spine/manifest.json --out out/demo.mp4
   # a live plate (no --preset)
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --plates plates.json --plate p3-demo
   ```
8. **Read the report** (see Report) and fix any page errors or late beats.
9. **Check the take** (see Checks): probe-spec with `--preset`, then check-take on narrated takes.
10. **Review stills.** Sample a frame inside each beat (spans are in the report and in
    `x-take.beats[]`) and Read them:
    `node "${CLAUDE_PLUGIN_ROOT}/lib/verify/contact-sheet.mjs" out/demo.mp4 --at 1.7s,4.9s,… -o review/demo.jpg`.
    Look for: the caption readable and not covering the action, the action finished before the
    next beat, the cursor on its target, no blank or half-loaded frames, nothing private on screen.
    For private data also Read the first and last frames full size (`--at 0s,<videoMs>ms --cols 1
    --width <take width>`; a time past the last frame is clamped to it).
11. **Keep the take manifest** (`out/demo.take.json`) with the video: its `command[]` re-runs the
    take in place. Its paths are absolute: after moving or copying the project, rebuild the
    command from the project's files (the step 7 command, with `x-take`'s preset, mode and
    cursor) instead.

## Flags (`capture.mjs`)

| Flag | Meaning |
|---|---|
| `--storyboard <file.mjs>` | The storyboard (a live plate takes it from `live.storyboard`) |
| `--script <script.md>` | Beat source for captions or silent mode |
| `--spine <manifest.json>` | Beat source from a spine manifest: each beat plays to its clip (narration) or its beat time (beatgrid) |
| `--plates <plates.json> --plate <id>` | Beat source for one live plate: its beat, timed to the plate's window |
| `--out <file.mp4>` | The take. Standalone: the MP4 deliverable with audio, encoded to `--preset`. Live plate: the picture-only plate MP4 (default `<project>/renders/plates/<id>.mp4`) |
| `--preset web\|youtube\|hifi` | Capture size, fps and encode of a standalone take (default `web`); refused with `--plates` |
| `--viewport WxH` | Browser size (default: the plate's `live.viewport`, else the preset's size) |
| `--fps <n>` | Capture frame rate, 1–60 (default: `plates.json`'s, else the preset's) |
| `--url <url\|file>` | The page (else the plate's `live.url`, the storyboard's `url` export, or `index.html` beside it) |
| `--no-captions` | No captions: silent mode with `--script`, voice-only with a narration spine |
| `--no-cursor` | No cursor: the pointer helpers act without it |
| `--caption-css <file.css>` | Replace the caption style (`.pm-caption-wrap`, `.pm-caption`) |
| `--caption-engine overlay\|dom` | Draw captions into the frames only (`overlay`, default) or into the page DOM (`dom`) |
| `--audio-offset-ms <ms>` | Spine-timed: a beat starts at its clip start minus this (default: the spine's `audioOffsetMs`); otherwise only recorded (default −100) |
| `--storage-state <file.json>` | Start the take signed in, from a session saved by `capture signin` |
| `--headed` | Record in a visible window of Playwright's Chromium; the frames are the same as headless |
| `--manifest <file.json>` | Where the take manifest goes (default `<take>.take.json` next to `--out`) |
| `--max-ms <ms>` | Abort a take that runs longer (default: spine window + 2000 ms, else 600000) |
| `--debug-requests` | Log every page request, failure and HTTP error to stderr |
| `--json` | Print the take summary as JSON instead of the report |

`capture signin <url> [--save <file.json>] [--timeout 300s]` is a separate subcommand; see
Signed-in pages. `capture serve <dir> [--port n]` is another; see Local pages.

## Local pages

`capture serve <dir|file.html> [--port n]` serves a folder on 127.0.0.1 (loopback only) the way a
take serves a local page, so playwright-cli (which blocks `file://`) can explore it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" serve ./site
```

- It prints the URL on stdout (`http://127.0.0.1:<port>/`, or `…/<file.html>` for a file) and
  its pid on stderr, then runs until Ctrl-C or SIGTERM and exits 0. Run it in the background;
  stop it with `node -e "process.kill(<pid>)"` (works on every OS; Git Bash's `kill` can miss a
  Windows pid).
- `--port <n>` picks the port (default: a free one). A busy port is a one-line error.
- `/` serves the folder's `index.html`; nothing outside the folder is served.
- A take doesn't need it: capture serves a local `--url`/`url` itself.

## Cursor

An arrow cursor glides (~400 ms, eased) to the target of `click`, `type` and `point`, and pulses
on a click. `scrollTo` and `scrollBy` glide it to the scroll container's centre; scrolling the page
itself shows it where it is. `goto` keeps it in place across the navigation. Once shown, it stays
on screen between helpers. `--no-cursor` turns it off; the helpers then act at once, so a take
with many pointer steps also runs shorter (no glides). Plain `page.click()` and other raw
Playwright calls never move the cursor.

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
- A caption shows for its whole beat: at least its reading time (about 3 words/s, at least 1.5 s)
  in captions and silent modes, to its clip's end in a narrated take, longer if `fn` runs longer.
  Keep captions to one line of 6–12 words.

## Signed-in pages

1. Tell the user a window will open for them to sign in, then run (Bash timeout above `--timeout`):
   `node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" signin <url>`.
   A visible Chromium window opens; the user signs in themselves and closes the tab (not the whole
   browser: quitting the browser saves nothing). The session (cookies
   and local storage) is saved to `<data dir>/auth/<host>.json` (`<data dir>` =
   `$CLAUDE_PLUGIN_DATA`, else `~/.cache/peak-media`), folder 0700, file 0600 (on Windows those
   modes don't apply: the per-user profile folder is what protects the file), and the command
   prints only that path. It gives up after `--timeout` (default `300s`; `5m`, `1500ms` also work)
   and saves nothing.
2. Capture with `--storage-state <that file>`. A missing or unreadable session file stops the take
   before a browser opens; the take manifest records `signedIn: true`, never the file's contents.

The session file is a credential:

- Never put it in the project folder or any git work tree. `--save` refuses `./web2video/` and any
  git work tree, but not other folders: keep the default path.
- Never commit it, print it, or Read it.
- At hand-off, offer to delete it.
- No session available: record only the public part, or use a demo account with seeded data.

`signin` and `--headed` need Playwright's Chromium, which `setup.mjs` installs; if it is missing
they stop with one line naming `setup.mjs`. Recording otherwise uses the headless shell.

## Report

After every take, capture prints:

```
wrote out/todo-demo.mp4 (3.8 MB, 1280x720 @ 30 fps, 19.6 s, preset web)
beats: add 0.00–5.10 s · done 5.10–8.40 s · filter 8.40–13.9 s · clear 13.9–19.1 s
page errors during take: 1
  TypeError: Cannot read properties of undefined (reading 'id')
take manifest: /abs/path/out/todo-demo.take.json
```

- A live plate's line ends `plate <id>` instead of `preset <p>`.
- `page errors` appears only when the page threw uncaught errors: the first 5 are listed, then
  `… and N more`. Treat them as findings: the page may have broken on camera.
- A timed beat that started more than a frame late is logged to stderr as
  `capture: N beat(s) started after their planned time: 'why' +224 ms` and kept in
  `x-take.beats[].lateMs`. The voice stays at its spine time; only the picture moves. A few
  hundred ms in a deck loop is harmless; more means the storyboard does too much before the beat.

**The take manifest** (`<take>.take.json`) is a v1 spine manifest: `kind: "narration"` with the
laid clips for a narrated take, else `kind: "beatgrid"`. It carries `beats[]`, `captions[]`,
`videoMs`, `wallMs`, `command[]` (absolute paths; re-runs the take in place, not after the
project moves) and `x-take` (its paths are relative to the manifest's folder):

- `mode`, `preset`, `plate`, `storyboard`, `script`, `url`, `fps`, `width`, `height`, `frames`, `out`
- `cursor`, `signedIn`, `sizeBytes`, `captionEngine`
- `hide` (the storyboard's hidden selectors) and `setup: true`, when the storyboard has them
- `audio` (narrated takes: the clips as laid and the loudness)
- `beats[]`, one per beat: `n`, `id`, `text`, `startMs`, `durationMs`, `endMs`, `lateMs`,
  `caption`, and for timed beats `plannedMs` and `clipNs`
- `pointer[]`: where each pointer helper acted (`action`, `beat`, `x`, `y`, `atMs`). Use it to
  pick stills that check the cursor is on its target.
- `pageErrors[]` (first line of each, at most 20) and `pageErrorCount`

## Checks

- **probe-spec** confirms the delivery spec of a standalone take:
  `node "${CLAUDE_PLUGIN_ROOT}/lib/verify/probe-spec.mjs" out/demo.mp4 --preset web` (use the
  take's preset). It checks size, fps, H.264 High, yuv420p, faststart, AAC-LC stereo 48 kHz at no
  more than the preset's bitrate +15 %, and the encoder settings written in the stream (CRF for `web`/`hifi`;
  for `youtube` the 8 Mbps target, peak, CABAC, closed GOP, 2 B-frames and no edit lists). A
  screen recording encodes far below 8 Mbps; that is expected.
- **check-take** (`node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/check-take.mjs" out/demo.mp4`)
  runs on a narrated take: every scene change must
  sit inside a silence of at least 900 ms (≤ −40 dB, 100 ms clear of each edge). Pass the `--out`
  MP4; a live plate has no audio and is refused.
  - Captions and the cursor are not scene changes: the bottom `--caption-band` of the frame
    (default 0.25; `0` scores the whole frame) is left out, and a glide is too small to count.
  - `--scene-threshold` (default 0.02) is set for 1280×720; larger frames are scored against a
    proportionally lower threshold, and takes above 30 fps are sampled at 30 fps.
  - A failing timecode means a slide or page changed over speech: move the change between beats,
    or give the spine longer lead-ins (`spine --lead-ms …`; the deck loop needs about 950 ms).
  - A narrated take with **no** detected change fails: fades of ~300 ms or longer score under the
    threshold. Shorten the transitions or lower `--scene-threshold`; pass `--expect-cuts 0` only
    if the take really has none.
  - **For a deck, always pass `--expect-cuts <slides − 1>`:** without it, a take where some slide
    changes are detected and others missed still passes.
  - A captions or silent take has a silent track, so it always passes and says so.

## How it fits the spine

- The spine (`video-spine`) owns the clock and the voice. In a narrated take each `beat(id)` waits
  for its clip's planned start (clip start minus `--audio-offset-ms`) and ends at its clip's end,
  and the take lasts exactly the spine's `totalMs`. A late beat moves the picture, never the voice.
- The narrated `--out` lays the spine's own clips (from `spine/clips/`, the TTS cache or
  `narration.wav`) at their spine times plus the offset, at −16 LUFS, so the take sounds like the
  final video. No OpenRouter call is ever made here.
- A live plate's storyboard runs one beat: the plate's `beat` from `plates.json`, timed to the
  plate's window. The take lasts exactly the plate's `durationMs`, and `video-assemble` composites
  the picture-only `renders/plates/<id>.mp4` onto the spine's narration.

## Examples

- `examples/ui-demo/` — a small static to-do app, its `script.md` (beats `add`, `done`, `filter`,
  `clear`) and a captioned storyboard. No key:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" \
    --storyboard "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/examples/ui-demo/storyboard.mjs" \
    --script "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/examples/ui-demo/script.md" --out /tmp/ui-demo.mp4
  ```
- `examples/deck/` — a neutral 3-slide deck, its `script.md` (beats `intro`, `why`, `how`) and the
  deck loop; runs in all three modes. Narrated:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/spine.mjs" \
    --brief "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/examples/deck/brief.md" \
    --tts-model fake/tone --lead-ms 950 --out /tmp/deck-spine
  node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" \
    --storyboard "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/examples/deck/storyboard.mjs" \
    --spine /tmp/deck-spine/manifest.json --out /tmp/deck.mp4
  node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/check-take.mjs" /tmp/deck.mp4 --expect-cuts 2
  ```
