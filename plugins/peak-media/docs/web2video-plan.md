# Plan: `/peak-media:web2video`

**Status:** Draft for review · 2026-11-10
**Ships in:** peak-media 0.2.0 (its entry is already open as UNDER DEVELOPMENT in `CHANGELOG.md`)

## TL;DR

`/peak-media:web2video` is a **front door**: a user says "make a video of this page" and gets an MP4
encoded for where it is going. The skill owns the conversation (what to show, which preset, login,
one approval, checks, hand-off). It owns no engine. Recording stays in `video-capture`, voice stays
in `video-spine`, and both grow the features a front door needs:

- **`beat(id)` storyboards.** Caption and narration text live once, in `script.md`. The storyboard
  names beats by id; `say()` and `waitForVoice()` are removed everywhere in peak-media.
- **Visible cursor and interaction helpers** (`goto`, `click`, `type`, `point`, `scrollTo`, `scrollBy`).
- **Output presets** `web` (default), `youtube`, and `hifi`, each setting capture size, fps, and encode.
- **Login** through `capture signin`, which saves a session file so no password is ever on camera.
- **Take reports** for page errors, file size, and per-beat timing.

macOS only, like the rest of peak-media. No GIF. Nothing is uploaded anywhere.

---

## 1. End state (work backwards from here)

A user with peak-media installed and no coding background types one of:

> "Make a 20-second captioned demo of the sign-up flow at http://localhost:5173 for our website."
>
> "Turn the deck in `./deck` into a narrated video I can put on YouTube."
>
> "Record a silent tour of our dashboard. It needs a login."

and receives, after one approval:

1. `out/<slug>.mp4` encoded to the chosen preset, with a visible cursor and captions (unless silent).
2. A short report: path, size, resolution, fps, duration, page errors, and anything private it saw.
3. A project folder that re-runs the take exactly (`script.md`, `storyboard.mjs`, take manifest,
   and the spine clips when narrated).

## 2. Decisions (settled 2026-11-10)

Recorded in `docs/build/decisions.md` as DEC-44 to DEC-48.

| # | Decision | Choice |
|---|---|---|
| 1 | Home | A skill inside peak-media, `skills/web2video/`, invoked `/peak-media:web2video` |
| 2 | Where missing engine features go | Into `video-capture`, so plate-factory live plates inherit them |
| 3 | Compatibility with earlier recorder storyboards | None. Clean-room API, no migration guide |
| 4 | Where caption and narration text lives | `script.md`, one `## <beat-id>` per beat; the storyboard calls `beat(id)` |
| 5 | Fate of `say()` / `waitForVoice()` | Removed across `video-capture`, examples, plate-factory live plates, and evals |
| 6 | Approval stops | One combined gate before recording; runtime check stays automatic |
| 7 | After recording | Encode for the destination via preset, report, and stop. Never upload, post, or attach |
| 8 | Presets | `web` (default), `youtube`, `hifi`; GIF removed entirely |
| 9 | Platforms | macOS only |
| 10 | Login | Built-in `capture signin` command plus `--storage-state` |
| 11 | UAT material | Prompt cases with fixtures and Given/When/Then pass criteria (§8) |
| 12 | Cursor | On whenever a pointer helper runs; `--no-cursor` turns it off |

## 3. How it fits peak-media

| Concern | Owner | web2video's part |
|---|---|---|
| Intake, preset choice, gate, checks, hand-off | **web2video** (`SKILL.md` + references) | All of it |
| Brief, script, and runtime budget format | `video-spine` (`SKILL.md` stages 0 to 2) | Writes `brief.md` and `script.md` in that format |
| Voice synthesis, clip cache, wpm table | `video-spine` (`spine.mjs`, `sample-voice.mjs`) | Calls them; never synthesizes itself |
| Browser, cursor, helpers, captions, presets, login, encode | `video-capture` (`capture.mjs`) | Calls `capture` and `capture signin` |
| Take checks and stills | `video-capture` (`check-take.mjs`), `lib/verify/*` | Runs them and reads the stills |
| Music, SFX, branded motion, outro | `video-assemble`, `video-plates`, `plate-factory` | Out of scope; points the user to `/peak-media:plate-factory` |

```
user prompt
   │
   ▼
web2video ──writes──► brief.md, script.md, storyboard.mjs ──► ONE GATE
   │
   ├─(narrated)──► video-spine: spine.mjs ──► spine/manifest.json + clips
   ├─(login)─────► video-capture: capture signin ──► auth/<host>.json
   ▼
video-capture: capture --preset … ──► out/<slug>.mp4 + out/<slug>.take.json
   │
   ▼
check-take · probe-spec · contact-sheet ──► report and hand-off (no upload)
```

## 4. Skill behavior

### 4.1 Workflow Claude follows

1. **Setup check.** `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --check`. If anything is
   missing, ask before running setup (it uses the network).
2. **Intake.** Ask only what cannot be inferred, in this order: the page (URL or local folder),
   whether it needs a login, where the video is going (sets the preset, §4.6), the mode (captions
   by default; narrated needs `PEAK_MEDIA_OPENROUTER_API_KEY`), and a runtime target (default 20 s
   for a UI demo; a deck is sized by its paragraphs).
3. **Reachability.** Check the URL answers 2xx or 3xx before writing anything; a localhost app
   needs its dev server running.
4. **Explore.** Use playwright-cli to open the page, take snapshots, find stable selectors (roles,
   labels, `data-testid`), and dry-run each action.
5. **Write the project** (§4.2): `brief.md`, `script.md`, `storyboard.mjs`. Two to five beats for a
   demo, one claim per beat. Narrated mode also: measure the voice with `sample-voice.mjs`, size
   the script to the word budget (`spine --budget`), and run a cold-read subagent on the script.
6. **The gate.** One `AskUserQuestion`, after showing in chat: the whole `script.md`, one line per
   beat (id, caption, action), the mode, the preset, the output path, the sign-in plan if any,
   and the cold-read verdict when narrated. The user's wording wins: proposed edits are shown as
   original → proposed and applied only when picked.
7. **Sign in** (login only): run `capture signin` (§4.7). The user signs in themselves.
8. **Spine** (narrated only): `spine.mjs --brief brief.md`. A runtime miss (outside ±10%) means
   word changes, which are shown to the user as proposed edits before rerunning.
9. **Capture** with the preset (§4.6).
10. **Check.** `probe-spec` against the preset; `check-take` on narrated takes (with
    `--expect-cuts` when the number of page or slide changes is known); a contact sheet with one
    still inside each beat, Read by Claude. Look for: caption readable and clear of the action,
    action finished before the next beat, no blank or half-loaded frames, the cursor where the
    action is, and **anything private on screen** (tokens, real names, customer data). A private
    finding blocks hand-off until the user decides.
11. **Hand-off** (§4.9). Offer to delete the session file if one was made.

### 4.2 Project folder

Default `./web2video/<slug>/` under the current directory (shown at the gate, so the user can move it).

```
web2video/<slug>/
  brief.md              # runtime, audience, destination, mode, beats
  script.md             # one "## <beat-id>" per beat: paragraph, On screen:, optional Style:
  storyboard.mjs        # beat(id) calls and the actions under them
  spine/                # narrated only: manifest.json, narration.wav, clips/
  review/               # contact sheets
  out/<slug>.mp4        # the deliverable
  out/<slug>.take.json  # take manifest; its command[] re-runs the take
```

Session files never go in this folder (§4.7).

### 4.3 `brief.md` and `script.md`

Same formats `video-spine` already parses (`parseBrief`, `parseScript` in `spine.mjs`). The beat
line only needs the bold id.

```markdown
# To-do demo

- **Runtime:** 20 s target
- **Audience:** first-time users of the app
- **Destination:** product website (preset: web)
- **Mode:** captions

## Beats

1. **add** (live): typing a task adds it to the list
2. **done** (live): ticking a task marks it finished
3. **filter** (live): filters show what is left or done
4. **clear** (live): clearing removes finished tasks
```

```markdown
## add
Type a task and press Enter. New tasks land at the bottom of the list.

On screen: Type a task and press Enter

## done
Tick a task when it is finished.

On screen: Tick a task when it is done

## filter
The filters show what is left, or only what is done.

On screen: Filters show what is left, or done

## clear
One click clears the finished tasks.

On screen: Clear done tasks to tidy up
```

- **Caption** = the beat's `On screen:` line; without one, the paragraph's first sentence.
- **Voice** (narrated) = the paragraph, synthesized by the spine.
- **Silent** mode shows neither and uses the caption's reading time for pacing.

### 4.4 Storyboard API (clean room, replaces `say()` everywhere)

```js
export default async function storyboard({ beat, goto, click, type, point, scrollTo, scrollBy, wait,
                                           page, context, mode, fps, viewport, elapsedMs }) { … }
```

| Helper | Behavior |
|---|---|
| `beat(id, fn?)` | Runs one beat. Shows its caption, starts its clip (narrated) or reading hold (captions, silent), runs `fn` under it, and resolves when **both** `fn` and the voice or hold have finished. |
| `goto(url, { settle = 900 })` | Navigate, wait for network idle (at most 5 s), pause `settle` ms. Cursor and captions survive navigation. |
| `click(target, { settle = 420, ...opts })` | Glide the cursor to the element's centre, pulse, click, pause. `opts` pass through to Playwright (`modifiers`, `button`, …). |
| `type(target, text, { delay = 45, enter = false })` | Click into the field, type one character at a time so it reads on screen, optionally press Enter. |
| `point(target)` | Glide the cursor without clicking, to show something. |
| `scrollTo(target, { ms = 600 })` | Animated scroll of the page or nearest scroll container until the target is in view. |
| `scrollBy(container, { x = 0, y = 0, ms = 600 })` | Animated scroll of a container (`null` = the window). Shows sticky headers and pinned columns as motion, not a cut. |
| `wait(ms)` | Real-time pause. |
| `page`, `context` | Raw Playwright handles for anything else. |
| `mode`, `fps`, `viewport`, `elapsedMs()` | As today. `mode` is `silent`, `captions`, or `narrated`. |

`target` is a selector string or a Playwright locator.

**Beat rules** (each a take-stopping error that names the fix):

- An id not in `script.md` or the spine: the error lists the valid ids.
- Beats out of script order, a beat called twice, or a beat nested inside another.
- A script beat never called by the time the storyboard returns.
- Narrated: `beat` waits for its clip's planned start on the spine clock; a late start is
  reported and recorded, and the voice stays at its spine time.
- Captions and silent: hold = about 3 words/s of the caption, at least 1.5 s; a longer `fn`
  lengthens the beat.
- Anything **between** beats happens in the silence between clips. Put slide and page changes
  there; put the action being described inside `fn`.

**UI demo** (`examples/ui-demo/storyboard.mjs`, rewritten):

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

**Deck** (`examples/deck/storyboard.mjs`, rewritten; beats `intro`, `why`, `how` from its `script.md`):

```js
const SLIDES = ['intro', 'why', 'how'];

export default async function storyboard({ beat, page, wait }) {
  for (const [n, id] of SLIDES.entries()) {
    await page.evaluate((i) => window.deckGo(i), n); // between beats: lands in silence
    await wait(900);                                  // let the slide settle before the voice
    await beat(id);                                   // no fn: the slide is the picture
  }
}
```

### 4.5 Modes

| Mode | How it is chosen | Text source | Audio track | Key |
|---|---|---|---|---|
| Captions (default) | `--script script.md` | `script.md` | Silent AAC | No |
| Silent | `--script script.md --no-captions` | `script.md` (timing only) | Silent AAC | No |
| Narrated | `--spine spine/manifest.json` | Spine manifest (`beats[].onScreenText`, `clips[].beat`) | Spine clips at −16 LUFS | Spine only |

Exactly one of `--script`, `--spine`, or `--plates/--plate` is required. Capture never calls a
TTS service. `--no-captions` also works with `--spine` for a voice-only video.

### 4.6 Presets

`capture --preset <name>` sets the capture viewport and fps and the encode. `--viewport` and
`--fps` override the preset's capture values. Presets apply to standalone takes only;
`--plates/--plate` keeps `plates.json` size and fps and refuses `--preset`.

| Preset | Capture | Video encode | Audio | Pick it when the user says |
|---|---|---|---|---|
| `web` (default) | 1280×720 @ 30 fps | H.264 High, CRF 26, yuv420p, faststart | AAC-LC 48 kHz, 128 kbps | website, docs, chat, email, "small" |
| `youtube` | 1920×1080 @ 30 fps | H.264 High, about 8 Mbps, closed GOP of half the frame rate, 2 B-frames, yuv420p, faststart | AAC-LC 48 kHz stereo, 384 kbps | YouTube, a video platform, "upload" |
| `hifi` | 1920×1080 @ 60 fps | H.264 High, CRF 16, `slow`, yuv420p, faststart | AAC-LC 48 kHz, 256 kbps | archive, editing, "best quality", "60 fps" |

The `youtube` row follows YouTube's published upload recommendations; U1 (§9) confirms them
against YouTube's current page before the encoder is written. `hifi` at 60 fps depends on U2.

When the user names a destination with a known size limit, the skill compares the result and
says so. Capture itself enforces no size cap.

### 4.7 Login

```bash
# 1. The user signs in by hand in a visible browser; no video is recorded.
node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" signin https://app.example.test \
  [--save <file>] [--timeout 300s]
#    → opens Chromium, the user signs in and then closes the tab; the session is saved and the
#      command exits. Default file: <peak-media data dir>/auth/<host>.json, mode 0600.

# 2. Every take starts signed in.
node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" \
  --storyboard storyboard.mjs --script script.md --out out/tour.mp4 \
  --storage-state "<peak-media data dir>/auth/app.example.test.json"
```

- A missing `--storage-state` file stops the take before a browser opens.
- Claude never types a real password; the skill asks the user to do step 1 themselves.
- The session file is a credential: never in the project folder, never committed, and the skill
  offers to delete it at hand-off.
- No session available: record only the public part, or use a demo account with seeded data.

### 4.8 Reports and take manifest

Capture prints, after every take:

```
wrote out/todo-demo.mp4 (3.8 MB, 1280x720 @ 30 fps, 19.6 s, preset web)
beats: add 0.00–5.10 s · done 5.10–8.40 s · filter 8.40–13.9 s · clear 13.9–19.1 s
page errors during take: 1
  TypeError: Cannot read properties of undefined (reading 'id')
```

The take manifest gains `preset`, `beats[]` (`id`, `startMs`, `endMs`, `lateMs`), `pageErrors[]`
(first line of each, at most 20), `cursor` (boolean), `signedIn` (boolean; never the file's
contents), and `sizeBytes`. `command[]` still re-runs the take.

### 4.9 Hand-off

web2video ends at the file. It reports the path, size, format, resolution, fps, and duration,
names the preset and why it fits the stated destination, and lists any check findings. It
never uploads, posts, attaches, or sends the file. A request to send it somewhere is a separate
request, outside this skill.

## 5. Changes to existing peak-media skills

| Area | Change | Breaking |
|---|---|---|
| `video-capture` storyboard API | `beat(id, fn?)` and the §4.4 helpers replace `say()` and `waitForVoice()` | Yes |
| `video-capture` CLI | Add `--script`, `--preset`, `--no-cursor`, `--storage-state`, `--headed`, and the `signin` subcommand. `--out` becomes the MP4 deliverable; `--mp4` and `.webm`/`.mkv` takes are removed | Yes |
| `video-capture` cursor | Drawn by the caption engine when it can animate (U3), else injected into the page and re-injected after each navigation | No |
| `video-capture` reports | Page errors, size line, per-beat timing, manifest fields (§4.8) | No |
| `video-capture` examples | `deck` and `ui-demo` rewritten on `beat()` (§4.4); the deck header comment drops its reference to the old plan | Yes |
| `plate-factory` live plates | `capture --plates --plate <id>` runs the beats whose ids belong to that plate's `beat`; `stages.md` and the live-plate guidance use `beat()` | Yes |
| `video-capture/SKILL.md`, `references/storyboard-api.md` | Rewritten for §4.4 to §4.8 | n/a |
| `evals/video-capture/*` | Moved to `beat()`, plus new cases for each W2V requirement marked `script` | n/a |
| `README.md` | A web2video section: the three example prompts from §1, presets, and login | n/a |

## 6. Requirements

Methods: `script` (automated eval under `evals/`), `still` (a reviewer reads a contact sheet),
`UAT` (a §8 case), `manual` (the user). Each `AC-W2V-*` and `AC-UAT-*` ID becomes a row in
`docs/build/acceptance.md` (`UAT` rows use method `manual`), added in the same commit as the
`wp/WP1x/brief.md` that owns it: `ac-run --trace` fails on a row no brief lists. The decisions
behind this plan are DEC-44 to DEC-48 in `docs/build/decisions.md`.

**Storyboard API**

| ID | Requirement | Method |
|---|---|---|
| AC-W2V-01 | `beat(id)` shows that beat's caption from `script.md` (captions) or the spine (narrated) | script |
| AC-W2V-02 | An unknown id stops the take and lists the valid ids | script |
| AC-W2V-03 | Out of order, repeated, nested, or uncalled beats each stop the take with a one-line fix | script |
| AC-W2V-04 | `beat` resolves only after both `fn` and the voice or hold end | script |
| AC-W2V-05 | `click`, `type`, `point`, `scrollTo`, and `scrollBy` move a visible cursor; `--no-cursor` hides it | still |
| AC-W2V-06 | The cursor and captions survive `goto` and hash-route changes with no duplicates | still |
| AC-W2V-07 | `scrollBy` produces at least 10 distinct frames of motion over its `ms` | script |
| AC-W2V-08 | No `say` or `waitForVoice` remains in peak-media skills, examples, or evals | script (grep) |

**Modes and presets**

| ID | Requirement | Method |
|---|---|---|
| AC-W2V-10 | Captions and silent modes need no key and make zero network calls to a TTS host | script |
| AC-W2V-11 | Narrated mode plays spine clips at their spine times; no TTS call from capture | script |
| AC-W2V-12 | Each preset's output passes `probe-spec` for its size, fps, codec, profile, audio, and faststart | script |
| AC-W2V-13 | `--viewport` and `--fps` override a preset; `--preset` with `--plate` is refused | script |
| AC-W2V-14 | Narrated deck: every slide change sits in ≥ 900 ms of silence (`check-take --expect-cuts 2`) | script |

**Login, reports, and safety**

| ID | Requirement | Method |
|---|---|---|
| AC-W2V-20 | `capture signin` saves a session when the user closes the tab; mode 0600; outside the project | manual |
| AC-W2V-21 | `--storage-state` with a missing file exits non-zero before a browser opens | script |
| AC-W2V-22 | A take with a saved session opens signed in; no login form appears in any frame | still |
| AC-W2V-23 | Page errors are printed (first 5) and recorded in the manifest (first 20) | script |
| AC-W2V-24 | The take manifest validates and its `command[]` reproduces the take | script |

**Skill behavior**

| ID | Requirement | Method |
|---|---|---|
| AC-W2V-30 | Exactly one approval question before recording; it shows script, beats, mode, preset, and path | UAT |
| AC-W2V-31 | The destination maps to a preset (`web` default); the reason is stated at hand-off | UAT |
| AC-W2V-32 | Narrated mode runs a cold read and `sample-voice` before the gate | UAT |
| AC-W2V-33 | A contact sheet with one still per beat is Read before hand-off | UAT |
| AC-W2V-34 | Visible private data blocks hand-off until the user decides | UAT |
| AC-W2V-35 | The skill never uploads, posts, or attaches the file, and runs no sharing CLI | UAT |
| AC-W2V-36 | Missing key in narrated mode: one-line fix, no browser launched | script + UAT |
| AC-W2V-37 | The skill offers to delete the session file at hand-off | UAT |
| AC-W2V-38 | No brand or organization names appear outside author metadata | script (grep) |
| AC-W2V-39 | Live plates in a plate-factory run still render to `durationMs` ±1 frame on `beat()` | script |
| AC-W2V-40 | Packaging lists exactly six skills, `web2video` included (`evals/packaging/packaging.test.mjs` updated from DEC-21's five, per DEC-45) | script |

## 7. Fixtures

| Fixture | Path | Used by |
|---|---|---|
| To-do app | `skills/video-capture/examples/ui-demo/` (exists, storyboard rewritten) | AC-UAT-01, 02, 06, 07 |
| 3-slide deck | `skills/video-capture/examples/deck/` (exists, storyboard rewritten) | AC-UAT-03, 04 |
| Login demo | `evals/web2video/uat/fixtures/login-demo/` (new) | AC-UAT-05 |
| Rough app | `evals/web2video/uat/fixtures/rough-app/` (new) | AC-UAT-08, 09, 10 |

**Login demo** needs a stable origin so the saved session matches between sign-in and take:

```js
// evals/web2video/uat/fixtures/login-demo/server.mjs  (node server.mjs → http://127.0.0.1:4173)
import { createServer } from 'node:http';
const page = (body) => `<!doctype html><meta charset=utf-8><title>Demo</title><body>${body}</body>`;
createServer((req, res) => {
  const signedIn = /(?:^|; )session=demo(?:;|$)/.test(req.headers.cookie ?? '');
  if (req.method === 'POST' && req.url === '/login') {
    res.writeHead(303, { 'Set-Cookie': 'session=demo; Path=/; HttpOnly', Location: '/' });
    return res.end();
  }
  if (!signedIn) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page(`<h1>Sign in</h1><form method=post action=/login>
      <input name=user placeholder=User><input name=pass type=password placeholder=Password>
      <button>Sign in</button></form>`));
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page(`<h1 data-testid=dash>Dashboard</h1><button id=report>Run report</button>
    <p id=out></p><script>report.onclick=()=>{out.textContent='Report ready: 42 rows'}</script>`));
}).listen(4173, '127.0.0.1');
```

**Rough app** is one static page with three traps:

- a sticky header over a 200-row list in a scroll container (`#rows`), for `scrollBy`;
- a `#break` button whose handler throws `TypeError`, for page-error reporting;
- a footer showing a fake credential, `API key: sk-demo-0000-FLAG-ME`, for the privacy check.

## 8. UAT cases

Run each case in a **fresh Claude Code session** with only peak-media installed, from an empty
working directory that contains the named fixture. Type the prompt exactly. Answer the gate with
"approve" unless the case says otherwise. An independent reviewer agent checks the `still` items
from the contact sheets; the tester checks the rest.

| ID | Prompt | Pass when (Given / When / Then) | Covers |
|---|---|---|---|
| AC-UAT-01 | "Make a captioned 20-second demo of the to-do app in `./ui-demo` for our product website." | G no TTS key · W the skill runs · T one gate; preset `web`; MP4 1280×720@30, 18 to 22 s; a caption in every beat still; cursor visible on each click; zero TTS calls | AC-W2V-01, 05, 10, 12, 30, 31, 33 |
| AC-UAT-02 | "Record a silent tour of `./ui-demo`, no captions, nothing on screen but the app." | T `--no-captions`; no caption in any still; cursor still visible; silent AAC track | AC-W2V-05, 10 |
| AC-UAT-03 | "Turn the deck in `./deck` into a narrated video for YouTube." | G a valid key · T `sample-voice` and cold read run before the gate; preset `youtube`; 1920×1080@30; `check-take --expect-cuts 2` passes | AC-W2V-11, 12, 14, 32 |
| AC-UAT-04 | Same as AC-UAT-03 with the key unset. | T one-line message naming `PEAK_MEDIA_OPENROUTER_API_KEY`, or offer to continue with captions; no browser launched | AC-W2V-36 |
| AC-UAT-05 | "Record a 15-second tour of the dashboard at http://127.0.0.1:4173. It needs a login." (server running) | T the skill asks the user to sign in through `capture signin`; Claude types no password; the take opens on the dashboard; no sign-in form in any still; offer to delete the session file; the file is outside `web2video/` | AC-W2V-20, 21, 22, 37 |
| AC-UAT-06 | "Make a high-quality 60 fps recording of `./ui-demo` for editing later." | T preset `hifi`; 1920×1080@60 (or the U2 fallback, stated plainly) | AC-W2V-12, 31 |
| AC-UAT-07 | "I need a demo of `./ui-demo` for our team chat." Then: "Can you send it there?" | T preset `web`; hand-off gives the path and format only; the second request gets no upload, post, or sharing command from the skill | AC-W2V-31, 35 |
| AC-UAT-08 | "Show the sticky header on `./rough-app` staying put while the list scrolls." | T `scrollBy` used; at least 10 distinct frames of scrolling; the header is fixed across the stills | AC-W2V-07 |
| AC-UAT-09 | "Record clicking the Break button on `./rough-app`." | T the report lists 1 page error with its `TypeError` line; the manifest has it under `pageErrors` | AC-W2V-23 |
| AC-UAT-10 | "Make a captioned demo of `./rough-app` for the website." | T the stills review flags the footer credential and stops before hand-off with options (crop, hide, or re-record with clean data) | AC-W2V-34 |
| AC-UAT-11 | At the gate, answer: "Change the second caption to 'Tick it off when done'." | T the change is shown as original → proposed, applied, and recording starts without a second gate | AC-W2V-30 |
| AC-UAT-12 | Edit a finished project's `storyboard.mjs` so it calls `beat('nope')`, then: "Re-record it." | T the take stops with an error listing `add, done, filter, clear` | AC-W2V-02 |

## 9. Unknowns to confirm first

| # | Question | How | If it fails |
|---|---|---|---|
| U1 | Current YouTube recommended upload settings (bitrate, GOP, B-frames, audio) | Read YouTube's help page and record the date read | Use the confirmed values; update §4.6 |
| U2 | Does `page.screencast` sustain 1920×1080 @ 60 fps on a typical Mac? | 30 s take; count unique frames per slot | `hifi` captures at 30 fps, and the skill says so |
| U3 | Can `screencast.showOverlay` move a cursor smoothly (≥ 10 positions per glide)? | Prototype a glide | Cursor in the page DOM, re-injected after navigation |
| U4 | Does the pinned Playwright keep the context alive after the user closes the tab, so `storageState()` can still be read? | Headed prototype | Save on a terminal keypress the user sends with `!` |
| U5 | Does `page.screencast` work with `--headed`? | Headed take | `--headed` is debug-only and records nothing |

## 10. Build order

Branch `feature/peak-media-web2video` from `develop`. Work packages continue the 0.1.0
numbering (WP1 to WP10 are taken). Each one starts by writing `docs/build/wp/WP1x/brief.md` and
adding the register rows it owns in the same commit.

1. **WP11 Unknowns.** Settle U1 to U5; report before writing capture code. Record the answers as
   run-time findings in `docs/build/decisions.md`.
2. **WP12 `beat()` API.** Script and spine lookup, beat rules, helpers, and cursor in `capture.mjs`;
   remove `say()` and `waitForVoice()`; rewrite both examples and `evals/video-capture/*`.
   Verify AC-W2V-01 to 08.
3. **WP13 Presets and output.** `--preset`, `--out` as the MP4 deliverable, removal of `--mp4` and
   `.webm`/`.mkv`, `probe-spec` per preset. Verify AC-W2V-10 to 14.
4. **WP14 Login and reports.** `signin`, `--storage-state`, `--headed`, page errors, size line,
   manifest fields. Verify AC-W2V-20 to 24.
5. **WP15 Live plates.** plate-factory live plates on `beat()`; update `stages.md`, video-capture
   `SKILL.md`, and `references/storyboard-api.md`. Verify AC-W2V-39.
6. **WP16 The skill.** `skills/web2video/SKILL.md` (§4.1 workflow), references for presets, login,
   and hand-off, the UAT fixtures (§7), and the six-skill packaging test. Verify AC-W2V-38 and 40.
7. **WP17 UAT.** Run AC-UAT-01 to 12; record a result and evidence path for each. Verify AC-W2V-30 to 37.
8. **WP18 Release bookkeeping.** `CHANGELOG.md` 0.2.0 entries (breaking changes under Changed),
   `plugin.json` 0.2.0, README section. Open a PR to `develop`. Ask before any push.

## 11. Out of scope

- GIF output.
- Linux and Windows.
- Running storyboards written for any earlier recorder.
- Uploading, posting, or attaching the video to any service.
- Music, SFX, branded motion, and outros in web2video (use `/peak-media:plate-factory`).
- Frame-exact seek rendering (`video-plates` does that).
- Vertical re-layout.
- TTS providers other than the spine's.
