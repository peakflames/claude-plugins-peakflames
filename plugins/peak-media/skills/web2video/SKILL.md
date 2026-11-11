---
name: web2video
description: |
  Makes a short MP4 of a web page or app from one sentence: asks only what it can't infer, writes
  the script and storyboard, gets one approval, records with a visible cursor and captions (or
  narration, or silent), checks the take, and hands over a file encoded for where it is going
  (website, YouTube, archive). Handles pages behind a sign-in. A front door over video-capture
  and video-spine; it never uploads or sends the video.
  Triggers on: "make a video of this page", "record a demo of", "turn this deck into a video",
  "screen recording of the app", "video tour of the dashboard", "/web2video".
---

You turn "make a video of this page" into `out/<slug>.mp4`. You own the conversation: intake,
the one approval gate, checks and hand-off. The engines do the work: `video-capture` records,
`video-spine` voices, `lib/verify/*` checks. You write no engine code; for music, branded motion
or an outro, point the user to `/peak-media:plate-factory`.

Before writing a storyboard, Read `${CLAUDE_PLUGIN_ROOT}/skills/video-capture/references/storyboard-api.md`.
Every script prints its flags with `--help`.

## Rules

- **The user's wording wins.** Any change you suggest to their words is shown as
  original → proposed and applied only when they pick it. A change they ask for is applied as asked.
- **The user signs in themselves**, in the window `capture signin` opens. You never type, ask for,
  or store a password (`references/login.md`).
- **The deliverable is a file on disk.** Hand-off ends at its path. No upload, post, attachment,
  message or sharing CLI, even when asked; a request to send it is outside this skill
  (`references/handoff.md`).
- **Private data on screen blocks hand-off** (step 9) until the user decides.
- **Session files are credentials:** never in the project folder, never Read, printed or committed.

## Project folder

`./web2video/<slug>/` under the current directory (`<slug>`: short, lowercase, dashes). Run the
commands below from inside it.

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

**Re-recording.** When `web2video/<slug>/` already exists and the user asks to re-record it, take
the project as it is: skip to step 8 and run the step 8 command from inside the project folder,
rebuilt from the project's own files, not the saved `command[]` (its absolute paths point at
wherever the project was first recorded, so a moved or copied project would record over the
original). Take the settings from `out/<slug>.take.json`'s `x-take`: `preset`; `mode` (`silent`
→ `--no-captions`, `narrated` → `--spine spine/manifest.json`); `cursor: false` → `--no-cursor`;
`signedIn: true` → `--storage-state <session file>`. Leave `storyboard.mjs` and `script.md`
untouched; a beat error is reported to the user as printed before anything is changed. Then
steps 9–10.

## Workflow

1. **Setup check.** `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh" --check`. If it reports
   anything missing, ask before running `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"` (it
   downloads). `capture signin` also needs the headed browser it reports.

2. **Intake.** Infer what you can from the prompt; ask (one `AskUserQuestion`) only for the rest,
   in this order:
   - the page: a URL, or a local folder with an `index.html`;
   - whether it needs a sign-in;
   - where the video is going → the preset (`references/presets.md`; default `web`);
   - the mode: **captions** (default), **silent** (`--no-captions`), or **narrated** (a voice;
     needs `PEAK_MEDIA_OPENROUTER_API_KEY`). Silent, "no text", "nothing on screen but the app"
     all mean `--no-captions` only: the cursor stays. Add `--no-cursor` only when the user
     explicitly asks for no cursor or pointer;
   - the runtime: default 20 s for a UI demo; a deck is sized by its slides.

   **Narrated: check the key now, before anything else runs.** Measure the voice:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/sample-voice.mjs" --voices Rasalgethi --out-dir "${TMPDIR:-/tmp}/web2video-voice"
   ```
   It prints the voice's wpm; keep it for step 5. If it exits naming `PEAK_MEDIA_OPENROUTER_API_KEY`,
   **stop**: tell the user in one line to `export PEAK_MEDIA_OPENROUTER_API_KEY=<their OpenRouter
   key>` and restart Claude Code, and offer to continue in captions mode instead. Open no browser
   and write no files until they answer.

3. **Reach the page.** A URL must answer 2xx or 3xx:
   `curl -sS -o /dev/null -w '%{http_code}\n' <url>`. A localhost URL that doesn't answer means
   its dev server isn't running: ask the user to start it. A local folder must hold `index.html`.
   **Sign-in page:** sign in now, following `references/login.md` (it records nothing), so step 4
   sees what the take will see.

4. **Explore** with playwright-cli: `playwright-cli open`, then (signed-in page)
   `playwright-cli state-load <session file>`, then `playwright-cli goto <url>`. Take snapshots,
   find stable selectors (roles, labels, `data-testid`, visible text over CSS paths), and dry-run
   each action you plan to record. Take a `playwright-cli screenshot` of each screen and Read it
   for private data (step 9) now, so the plan can avoid it. Then `playwright-cli close` (after
   `playwright-cli delete-data` for a signed-in page).

   **A local folder:** playwright-cli blocks `file://` URLs. Serve the folder the way the take
   will, with this one command, run with Bash in the background (`run_in_background`); don't
   start any other server:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" serve <folder>
   ```
   It prints the URL (`http://127.0.0.1:<port>/`, loopback only) on stdout and its pid on
   stderr; `goto` that URL. When exploring is done, stop it: stop the background task, or
   `kill <pid>`.

5. **Write the project.**
   - `brief.md` and `script.md` in `video-spine`'s format: Read
     `${CLAUDE_PLUGIN_ROOT}/skills/video-spine/SKILL.md` (Stage 0 and Stage 1) for the file
     format, the budget and the cold-read method only; their user gates are replaced by step 6.
     The brief also carries `- **Destination:** … (preset: <p>)` and `- **Mode:** <mode>`.
   - Two to five beats for a demo, one claim per beat; a deck gets one beat per slide. Each beat's
     `On screen:` line is its caption: 6–12 words.
   - `storyboard.mjs`: one `beat(id, fn)` per beat in script order, the action inside `fn`, page
     and slide changes between beats. Use the pointer helpers (`click`, `type`, `point`,
     `scrollTo`, `scrollBy`) so the cursor shows. A local page: `export const url =
     '<path to its index.html, relative to storyboard.mjs>'`. Keep the bottom quarter of the frame
     clear of the action (captions sit there).
   - **Anything private the user chose to hide** goes in `export const hide = ['<selector>', …]`
     in `storyboard.mjs`: hidden before the first frame and after every `goto`. Never hide it with
     `page.addStyleTag` or `evaluate` in the default function: that runs after recording starts,
     so frame 0 shows it. Other setup that must not be filmed (dismiss a banner, pick a tab) goes
     in `export async function setup({ page, context })`, which runs before recording starts.
   - **Captions and silent: size the beats to the runtime.** A beat lasts as long as its `fn` (at
     least its caption's reading time, ~3 words/s), so the target is met with holds. Give each
     beat ≈ runtime ÷ beats: estimate its action (each pointer helper ~0.4 s glide, a click
     +0.4 s settle, typing 45 ms a character) and end `fn` with `await wait(<the rest>)` so the
     viewer sees the result. A hold between beats (`await wait(…)` after a `beat`) is for a page
     or slide change. Step 9 measures the real length.
   - **Narrated:** size the script to the measured rate before writing it:
     `node "${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/spine.mjs" --brief brief.md --budget --wpm <wpm>`.
     Add the same `--lead-ms`/`--tail-ms` the spine will run with (a deck: `--lead-ms 950`);
     without them the budget assumes the default pauses and the take overruns.
     `<wpm>` is the measured rate × 0.9, rounded down (175 → 157). Short beats read slower
     than the sample paragraph, so budgeting at the full rate overruns. `sample-voice` and `spine`
     both send the default style; if you give `spine` a `--style`, give `sample-voice` the same.
     Then run the cold read: a fresh subagent given *only* `script.md`, playing the brief's
     audience, marks each beat CLEAR or UNCLEAR and flags hype. Fix UNCLEAR beats and read again.

6. **The gate: one `AskUserQuestion` before anything is recorded.** First show in chat:
   - the whole `script.md`;
   - one line per beat: `id · caption · action`;
   - mode and whether captions are drawn (narrated draws them unless the user asked for none:
     `--no-captions`), preset (and why it fits the destination), output path
     `web2video/<slug>/out/<slug>.mp4`;
   - the runtime target, and the session file the take will use, if signed in;
   - the cold-read verdict, if narrated, with any suggested edits as original → proposed.

   Ask with options such as "Record it", one per suggested edit, and "Change something". When the
   user asks for a change: first print it in chat as `original → proposed` (one line per changed
   line of `script.md` or `storyboard.mjs`), then apply it, then go on to step 7. That line comes
   **before** any spine or capture command runs, never only at hand-off. The gate is passed, with
   no second approval. Ask again only if they reject the plan outright.

7. **Spine** (narrated only):
   `node "${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/spine.mjs" --brief brief.md --narrate --voice Rasalgethi`
   (a deck adds `--lead-ms 950`). It must end `PASS  runtime …`. On a runtime miss, propose
   changes as original → proposed, apply the ones the user picks, and rerun. This covers words,
   pauses and padding alike (`--lead-ms`, `--tail-ms`, storyboard waits): any change made to hit
   the runtime is proposed to the user, never applied silently.

8. **Capture.**
   ```bash
   # captions (silent: add --no-captions)
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --script script.md --out out/<slug>.mp4 --preset <p>
   # narrated
   node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" --storyboard storyboard.mjs --spine spine/manifest.json --out out/<slug>.mp4 --preset <p>
   ```
   Add `--storage-state <session file>` for a signed-in page. Read the report: page errors and
   late beats are findings. A beat error names its fix; fix the storyboard and rerun.

9. **Check.** All five, every take:
   - **Length:** the report's length (`videoMs` in `out/<slug>.take.json`) is within ±10 % of the
     runtime target (18–22 s for 20 s). Off target in captions or silent mode: spread the
     difference over the beats' `wait()` holds and re-capture.
   - `node "${CLAUDE_PLUGIN_ROOT}/lib/verify/probe-spec.mjs" out/<slug>.mp4 --preset <p>` passes.
   - Narrated: `node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/check-take.mjs" out/<slug>.mp4`
     passes, with `--expect-cuts <n>` when you know the number of page or slide changes.
   - A contact sheet with the first frame, one still inside each beat (the midpoint of each span
     in `x-take.beats[]` of `out/<slug>.take.json`) and the last frame, at a width where small
     text reads:
     `node "${CLAUDE_PLUGIN_ROOT}/lib/verify/contact-sheet.mjs" out/<slug>.mp4 --at 0s,<t1>s,<t2>s,…,<videoMs>ms --width 1280 --cols 2 -o review/<slug>.jpg`
     (a time past the last frame is clamped to it, so `<videoMs>ms` is the last frame).
     **Read it.** Check: caption readable and clear of the action; the action finished before
     the next beat; no blank or half-loaded frame; the cursor on its target.
   - **Private data:** tokens or keys, real names, emails, customer records. Always Read the
     first and last frames at full size, every take:
     `node "${CLAUDE_PLUGIN_ROOT}/lib/verify/contact-sheet.mjs" out/<slug>.mp4 --at 0s,<videoMs>ms --cols 1 --width <take width> -o review/<slug>-ends.jpg`.
     Then read the beat stills; the frame edges closely (footers, status bars, sidebars,
     corners). For a doubtful spot, Read a full-size still of that moment (`--at <t>s --cols 1
     --width <take width>`). The time stamp covers each still's top-left corner: check that
     corner in the step 4 screenshots. Say in the hand-off which frames you read. A finding
     stops here. Show the still and its timecode, then ask: **crop** it out of frame (scroll
     position or viewport), **hide** it (`export const hide = ['<selector>']` in the storyboard:
     hidden from frame 0 on), or **re-record with clean data**. Hand off only after the user
     decides; record their choice.

   A failed check means fix and re-run steps 8–9, not a new gate.

10. **Hand-off** with `references/handoff.md`. If a session file was made, offer to delete it.
