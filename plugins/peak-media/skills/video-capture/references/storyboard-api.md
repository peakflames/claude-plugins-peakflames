# Storyboard API

A storyboard is an ES module that drives a live page while `capture` screen-captures it. The
same storyboard runs unchanged in all three modes. Only the meaning of `say()` changes.

```js
// storyboard.mjs
export const url = './index.html'; // optional; see "Which page loads"

export default async function storyboard({ page, say, waitForVoice, wait }) {
  await page.click('text=New task');
  await say('Add a task');
  await waitForVoice();
}
```

## The function

`export default async ({ page, say, waitForVoice, wait, ... }) => { … }`. A named export
`storyboard` is also accepted. The take starts at t0, the timestamp of the first screencast
frame. Every time below is measured from t0 on that same clock.

| Name | What it does |
|---|---|
| `page` | The Playwright `Page`, already loaded. Use any Playwright call: `click`, `fill`, `evaluate`, `mouse.wheel`, … |
| `say(text)` | One beat of narration or caption, spoken and shown as written. See the modes table below. |
| `say("", { narrate })` | Voice only: `narrate` is the spoken text and no caption is drawn. The exception is captions mode, where there is no voice, so `narrate` is shown as the caption. |
| `say(text, { narrate })` | The caption shows `text` and the voice speaks `narrate`. |
| `waitForVoice()` | Resolves when the current `say()` has finished: the clip's end in spine-timed mode, or the end of the caption's reading time otherwise. |
| `wait(ms)` | Sleeps for `ms` ms of real time. |
| `elapsedMs()` | ms since t0, useful for debugging timing. |
| `mode` | `'silent'`, `'captions'` or `'spine'`. A storyboard should rarely need it. |
| `fps`, `viewport` | The capture frame rate and `{width, height}`. |

`say()` resolves once the beat has started. Use `waitForVoice()` before anything that must not
overlap the beat, such as a slide change.

## Modes

| Mode | Flags | What `say()` does | How long the take lasts |
|---|---|---|---|
| Silent | `--no-captions` | Timing only. The beat is held for reading time (about 3 words/s, at least 1.5 s). | Until the storyboard returns and the last beat ends |
| Captions (default) | none | Draws a caption and holds it for reading time | Same as silent |
| Spine-timed | `--spine manifest.json`, or `--plates plates.json --plate <id>` | Plays to the spine. The n-th `say()` is the n-th narration clip in the window. If called early, it waits for the clip's planned start; if called late, it starts at once and the delay is reported. `waitForVoice()` waits for the clip's planned end. No TTS runs here: the spine owns the voice. | Exactly the window: the plate's `durationMs`, or the spine's `totalMs` |

### Spine-timed details

- **The window.** With `--plate`, it is the plate's `[startMs, startMs + durationMs)` on the
  spine clock, and its clips are those that start inside it. With `--spine` alone, it is the whole
  spine.
- **Text check.** If a `say()` text differs from its clip's text, you get a warning. The spine's
  audio plays regardless.
- **Too many `say()` calls.** A `say()` with no clip left in the window is an error.
- **Overrunning.** A storyboard that runs past the window by more than one frame is an error:
  shorten its waits, or lengthen the beat in the spine. A watchdog aborts a take that is still
  running 2 s past its window, so a hung step (a selector wait with no timeout) can't stall it.
  Takes with no window stop at `--max-ms` (default 10 minutes).
- **Short storyboards.** If it finishes early, the last picture keeps recording live until the
  window ends.
- **`--audio-offset-ms`** shifts every clip: `say()` fires at the clip start minus the offset. The
  default is the spine's `audioOffsetMs`.
- **Late starts in decks.** The deck loop below changes the slide 250 ms after the previous clip
  ends, then waits 900 ms. On a spine with short lead-ins, each `say()` therefore starts after its
  clip. That is expected: the slide change lands in the silence between clips, which is the point
  of the loop.
- **Late `say()` moves the picture, not the voice.** `--mp4` lays each clip where the spine puts
  it (the `say()` time on the spine clock plus `--audio-offset-ms`), so the take sounds exactly like
  the assembled video. A late `say()` is reported, and recorded in the take manifest.
- **Gaps for `check-take`.** `check-take` wants every scene change inside a silence of at least
  900 ms. The deck loop changes the slide 250 ms into the gap and speaks 1150 ms in, so give its
  spine long lead-ins: `spine --brief examples/deck/brief.md --tts-model fake/tone --lead-ms 950`.
  The default 250 ms lead-in leaves gaps of about 730 ms, which `check-take` rejects.

## Captions

Captions are drawn with Playwright's `page.screencast.showOverlay`, which renders into the
captured frames only (the page's DOM is untouched). If the Playwright build has no `showOverlay`,
or it fails, the caption is injected into the page DOM instead, with the same classes and style.

- **Default style:** neutral: a bottom-centre, semi-opaque dark bar with white system sans text.
- **`--caption-css <file>`** replaces it. Style `.pm-caption-wrap` (positioning, full width) and
  `.pm-caption` (the text box). `examples/ui-demo/captions-alt.css` is a worked example.
- **`--no-captions`** draws none.
- **Timing:** one caption at a time. In captions and silent modes a caption holds for reading
  time, about 3 words/s and at least 1.5 s; in spine-timed mode it holds until its clip ends. A new
  `say()` replaces a caption still showing. A voice-only `say("", { narrate })` shows no caption,
  except in captions mode, where `narrate` is shown so the viewer can read it.
- Before t0 the capture warms up (page round trips, one caption shown and removed) so the first
  `say()` is not late; none of it is captured.

## Which page loads

The first match wins:

1. `--url`
2. the plate's `live.url`
3. the storyboard's exported `url`
4. `index.html` next to the storyboard
5. `about:blank`, for a storyboard that builds its own page with `page.setContent`

A relative `url` resolves from the current directory (`--url`), the `plates.json` folder
(`live.url`) or the storyboard's folder (export).

Local files are served from their folder on `127.0.0.1`, so ES modules and fonts work. Once the
page has loaded and settled (network idle, at most 5 s), the screencast starts. A main document
that answers HTTP 4xx or 5xx is an error, and nothing is captured.

## The deck loop

Each slide waits for the previous voice, changes in the silence, lets the slide land, then
speaks:

```js
for (const { slide, paragraph } of SCRIPT) {
  await waitForVoice();                        // previous paragraph finishes first
  await wait(250);
  await page.evaluate((n) => window.deckGo(n), slide);
  await wait(900);                             // let the slide land before speaking
  await say('', { narrate: paragraph });
}
await waitForVoice();
```

`examples/deck/` is a runnable copy. Its `brief.md` and `script.md` build the matching spine:
`spine --brief examples/deck/brief.md --tts-model fake/tone --out /tmp/deck-spine`.

## Output

- **`--out`** is the picture-only take: `.mp4` (H.264), `.webm` (VP9) or `.mkv`. It has exactly
  `round(ms × fps / 1000)` frames.
- **`--mp4`** writes the deliverable: H.264 High, yuv420p, AAC 48 kHz, faststart. A spine-timed
  take carries the spine's clips, each at its `say()` time on the spine clock plus
  `--audio-offset-ms`, levelled to −16 LUFS. Clip audio comes from the spine's `clips/` folder,
  the TTS cache or the spine's `narration.wav`, checked before the browser opens. Silent and
  captions-only takes get a silent AAC track.
- **The take manifest** (`<take>.take.json` next to `--mp4`, else `--out`; `--manifest` moves it)
  is a v1 spine manifest. `command[]` reproduces the take (absolute paths). A narrated take is
  `kind: "narration"` with the clips as laid; any other take is `kind: "beatgrid"`,
  `"narrate": false`, a nominal `bpm` of 60, and one beat whose `onScreenText` joins the captions.
  Both carry `captions[]` (`n`, `text`, `startMs`, `durationMs` as shown), `videoMs`, `wallMs`,
  `spine` (relative path) and `x-take` (mode, every `say()` with its lateness, caption engine).
- **`--json`** prints the take summary: mode, frames, `videoMs`, `wallMs`, each `say()` with
  its start, clip and lateness, the caption timings and the audio.
- **`--debug-requests`** logs every page request and failure to stderr. Turn it on when a live site
  misbehaves.
