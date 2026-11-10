# Storyboard API

A storyboard is an ES module that drives a live page while `capture` screen-captures it. It names
beats by id; the text of each beat lives once, in `script.md` or the spine manifest. The same
storyboard runs in captions, silent and narrated mode.

```js
// storyboard.mjs
export const url = './index.html'; // optional; see "Which page loads"

export default async function storyboard({ beat, click, type }) {
  await beat('add', async () => {
    await type('#new', 'Buy milk', { enter: true });
  });
  await beat('done', async () => {
    await click('#buy-milk');
  });
}
```

## The function

`export default async ({ beat, goto, click, type, point, scrollTo, scrollBy, wait, page, context, mode, fps, viewport, elapsedMs }) => { … }`.
A named export `storyboard` is also accepted. The take starts at t0, the timestamp of the first
screencast frame; every time below is on that clock.

| Name | What it does |
|---|---|
| `beat(id, fn?)` | Runs one beat: shows its caption, starts its clip (narrated) or its reading hold (captions, silent), runs `fn` under it, and resolves when **both** `fn` and the clip or hold have finished. Without `fn` the beat only holds (a deck slide). |
| `goto(url, { settle = 900 })` | Navigate (relative to the current page), wait for load and network idle (at most 5 s), then pause `settle` ms. The cursor and captions survive navigation. A 4xx/5xx answer stops the take. |
| `click(target, { settle = 420, ...opts })` | Glide the cursor to the element's centre, pulse, click, pause `settle` ms. `opts` pass through to Playwright's `click` (`modifiers`, `button`, …). |
| `type(target, text, { delay = 45, enter = false })` | Glide to the field, pulse, click into it, type one character every `delay` ms so it reads on screen, then press Enter if `enter`. |
| `point(target)` | Glide the cursor to the element without clicking, to show something. |
| `scrollTo(target, { ms = 600 })` | Scroll the nearest scroll container (or the page) over `ms` until `target` is centred in it. No scroll if it is already fully in view. |
| `scrollBy(container, { x = 0, y = 0, ms = 600 })` | Scroll `container` by `x`/`y` px over `ms` (`null` = the window). Sticky headers and pinned columns read as motion, not a cut. |
| `wait(ms)` | Real-time pause. |
| `page`, `context` | The Playwright `Page` (already loaded) and `BrowserContext`, for anything else: `evaluate`, `fill`, `keyboard`, … Raw calls don't move the cursor. |
| `mode` | `'captions'`, `'silent'` or `'narrated'`. A storyboard rarely needs it. |
| `fps`, `viewport` | The capture frame rate and `{width, height}`. |
| `elapsedMs()` | ms since t0, for debugging timing. |

`target` is a selector string (first match) or a Playwright locator such as
`page.getByLabel('Buy milk')`. The target is scrolled into view and must be visible.

`click`, `type` and `point` glide a visible cursor (~400 ms) to their target before they act.
`scrollTo` and `scrollBy` glide it to the scroll container's centre; scrolling the page itself
(`scrollTo` with no nested container, `scrollBy(null)`) shows it where it is, with no glide. `goto`
doesn't move it. `--no-cursor` hides it and skips the glides, so the same storyboard runs shorter.

## Beat rules

The beats are the take's beat source, in order: the `## <id>` sections of `--script`, the
`beats[]` of `--spine`, or the single beat of the `--plate`. Each rule below stops the take with a
one-line error that names the fix:

| Mistake | Error |
|---|---|
| Unknown id | `beat 'x' is not in script.md — valid: add, done, filter, clear` |
| No id | `beat() needs a beat id as its first argument — valid: …` |
| Out of order | `beat 'filter' was called before 'done' — call the beats in script.md order: …` |
| Called twice | `beat 'add' was called twice — each beat runs once: give the second part its own beat in script.md, or move it into beat('add', fn)` |
| Nested | `beat 'done' was called inside beat 'add' — beats can't nest: await beat('add', …) to the end, then call beat('done')` |
| `fn` not a function | `beat('add', fn): fn must be a function, or left out` |
| Never called | `beat 'clear' never called — the storyboard returned without it; add await beat('clear', …) in script.md order, or remove the beat from script.md` |

Always `await` each `beat()`.

## Timing

- **Captions and silent (`--script`).** A beat holds for its caption's reading time: about
  3 words/s, at least 1.5 s. A longer `fn` lengthens the beat. The take ends when the storyboard
  returns.
- **Narrated (`--spine`).** `beat(id)` waits for its clip's planned start (clip start minus
  `--audio-offset-ms`, default the spine's `audioOffsetMs`) and ends at its clip's end. Called
  late, it starts at once: the delay is logged and kept as `lateMs`, and the voice stays at its
  spine time. A beatgrid spine times each beat to its `startMs`/`durationMs` instead. The take
  lasts exactly the spine's `totalMs`.
- **Live plate (`--plates --plate`).** The storyboard runs the plate's one beat, timed like a
  narrated beat inside the plate's window. The take lasts exactly the plate's `durationMs`; if
  the storyboard finishes early, the last picture keeps recording to the end.
- **Between beats is silence.** In a narrated take, anything the storyboard does between two
  `beat()` calls lands in the gap between clips. Put slide and page changes there; put the action
  the beat describes inside its `fn`. `check-take` fails a scene change made over speech.
- **Overruns.** A spine-timed storyboard that runs more than one frame past its window stops the
  take: shorten its waits or lengthen the beat in the spine. A watchdog aborts a take still
  running 2 s past its window, so a hung step can't stall it; other takes stop at `--max-ms`
  (default 10 minutes).

## Captions

Captions are drawn with Playwright's `page.screencast.showOverlay`, into the captured frames only
(the page DOM is untouched); `--caption-engine dom` injects them into the page instead (see
SKILL.md for when). If the overlay is unavailable or fails, the caption goes into the page DOM
with the same classes and style.

- **Text:** the beat's `On screen:` line in `script.md`, else its paragraph's first sentence; a
  spine beat's `onScreenText`.
- **Default style:** a bottom-centre, semi-opaque dark bar with white system sans text.
- **`--caption-css <file>`** replaces it. Style `.pm-caption-wrap` (positioning, full width) and
  `.pm-caption` (the text box). `examples/ui-demo/captions-alt.css` is a worked example.
- **`--no-captions`** draws none; the reading time still paces `--script` beats.
- **One caption at a time,** shown for its whole beat and removed at the beat's end.
- Before t0 the capture warms up (page round trips, one caption shown and removed) so the first
  beat is not late; none of it is captured.

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
that answers HTTP 4xx or 5xx is an error, and nothing is captured. With `--storage-state` the page
loads signed in.

## Examples

**UI demo** (`examples/ui-demo/storyboard.mjs`; beats `add`, `done`, `filter`, `clear` from its
`script.md`):

```js
export const url = './index.html';

export default async function storyboard({ beat, click, type, wait, page }) {
  await beat('add', async () => {
    await type('#new', 'Buy milk', { enter: true });
    await type('#new', 'Call the plumber', { enter: true });
  });
  await beat('done', async () => {
    await click(page.getByLabel('Buy milk'));
  });
  await beat('filter', async () => {
    await click('[data-filter=active]');
    await wait(1100);
    await click('[data-filter=done]');
  });
  await beat('clear', async () => {
    await click('#clear');
    await click('[data-filter=all]');
  });
  await wait(500); // hold the final state
}
```

**Deck** (`examples/deck/storyboard.mjs`; beats `intro`, `why`, `how` from its `script.md`):

```js
const SLIDES = ['intro', 'why', 'how'];

export default async function storyboard({ beat, page, wait }) {
  for (const [n, id] of SLIDES.entries()) {
    if (n) await wait(250);                           // let the last word ring out
    await page.evaluate((i) => window.deckGo(i), n); // between beats: lands in silence
    await wait(900);                                  // let the slide settle before the voice
    await beat(id);                                   // no fn: the slide is the picture
  }
}
```

The deck changes each slide about 250 ms after the previous beat ends and calls the next `beat()`
about 1150 ms after it (900 ms after the change; 900 ms into the take for the first beat). A
narrated deck therefore needs a spine with long lead-ins:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/spine.mjs" \
  --brief "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/examples/deck/brief.md" --tts-model fake/tone --lead-ms 950
```

The default 250 ms lead-in leaves gaps of about 500 ms: every beat starts late and `check-take`
rejects the slide changes.

**Live plate** (one beat, the plate's `beat` in `plates.json`):

```js
export default async function storyboard({ beat, scrollTo, point }) {
  await beat('feature', async () => {
    await scrollTo('text=Gherkin-style');
    await point('text=Gherkin-style');
  });
}
```

## Output

- **`--out`** is an MP4 with exactly `round(ms × fps / 1000)` frames. A standalone take is the
  deliverable, encoded to `--preset`, with the spine's clips (narrated) or a silent AAC track. A
  live plate's take is picture-only (H.264, `plates.json` size and fps), for `video-assemble`.
- **Narrated audio** is each clip at its beat's spine time plus `--audio-offset-ms`, levelled to
  −16 LUFS. Clip audio comes from the spine's `clips/` folder, the TTS cache or the spine's
  `narration.wav`, checked before the browser opens.
- **The take manifest** (`<take>.take.json` next to `--out`; `--manifest` moves it) is a v1 spine
  manifest, described in SKILL.md § Report.
- **`--json`** prints the take summary instead of the report.
- **`--debug-requests`** logs every page request and failure to stderr. Turn it on when a live
  site misbehaves.
