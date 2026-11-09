# plate-factory stages 0–9

Every command runs from the video project folder. `PM` below stands for the plugin root that
`SKILL.md` names (`${CLAUDE_PLUGIN_ROOT}`): write that absolute path, quoted, in each command.

## Project layout

```
<video>/
  brief.md  script.md
  spine/manifest.json (or beatgrid.json)  spine/narration.wav  spine/clips/
  plates.json
  assets/                         # real source material from the brief (screenshots, logos, data)
  plates/<id>/index.html          # one composition per plate (+ brand/, vendor/ refreshed by render-plate)
  renders/plates/<id>.mp4
  review/storyboard.jpg  review/storyboard/<id>.png
  review/contact-<id>.jpg         # stage 5 pipeline sheet
  review/<id>-r<N>.jpg            # stage 6 self-review round N (N = 1..3) — no other sheet uses this name
  review/<id>-fix<N>.jpg          # stage 6 sheet after a reviewer fix
  review/review.mp4  review/contact-review.jpg  review/review-mix.mp4  review/levels.json
  audio/music.wav  audio/sfx.wav  audio/CREDITS.md   # only what the user supplies
  out/final.mp4  review/contact-final.jpg
```

## Gate lines

Each stage ends with exactly one line of this form, on its own line in your reply:

```
GATE <n> <name>: <RESULT> — <evidence>
```

| n | name | kind | RESULT when it holds | otherwise |
|---|---|---|---|---|
| 0 | `brief` | user | `APPROVED` | `REJECTED` |
| 1 | `script` | user | `APPROVED` | `REJECTED` |
| 2 | `spine` | check | `PASS` | `FAIL` |
| 3 | `plates` | user | `APPROVED` | `REJECTED` |
| 4 | `storyboard` | user | `APPROVED` | `REJECTED` |
| 5 | `pipeline` | check | `PASS` | `FAIL` |
| 6 | `build` | check | `PASS` | `FAIL` |
| 7 | `composite` | check | `PASS` | `FAIL` |
| 8 | `audio` | user | `APPROVED` | `REJECTED` |
| 9 | `export` | check | `PASS` | `FAIL` |

- `<evidence>` names the file the gate rests on and its key number, e.g.
  `GATE 2 spine: PASS — spine/manifest.json 25999 ms (target 26000 ±10%)`. Gate 9's names
  `out/final.mp4`.
- A **user** gate's `APPROVED` line comes only after an `AskUserQuestion` in that stage that the
  user answered yes to. A **check** gate reports the check you just ran.
- Write `FAIL`/`REJECTED` when the gate doesn't hold, fix, and run the stage again until it
  does. Never write a passing line for a later stage before the earlier one has passed.
- Write the line plainly, starting the line with `GATE`. Bold is fine, around the whole line or
  only its head (`**GATE 4 storyboard: APPROVED** — review/storyboard.jpg`). Never preview
  or quote a gate line: one in a code block, a `>` quote, a bullet or inline code doesn't count,
  and a plain one written before the user answered counts as approving without asking.

### What the transcript check counts

The lines and the order of your tool calls are checked mechanically
(`evals/plate-factory/check-transcript.mjs`), so keep the names, results and the `—` exactly as
above, and follow these rules:

- **A plate is written** by a Write or Edit of `plates/<id>/index.html`; by any `render-plate`
  run without `--storyboard` (with or without `node`); or by a shell command that writes the file:
  a redirect onto it, `tee`, `cp`/`mv`/`ln`/`install`/`rsync`/`dd`/`touch`, `sed -i`/`perl -i`, or
  any interpreter (python, node, perl…) in a command that names it. Read a plate with Read, never
  with an interpreter. The template scaffold `render-plate --storyboard` makes is not authoring
  (DEC-37).
- **The storyboard window.** The storyboard is open at the start, after every
  `render-plate --storyboard` run and after every `GATE 4 storyboard: REJECTED`. It closes at a
  `GATE 4 storyboard: APPROVED` line that follows an `AskUserQuestion` asked since it opened. No
  plate may be written while it is open: re-running the storyboard after approval reopens it until
  the user approves again.
- **A self-review round** is one `contact-sheet` run on `renders/plates/<id>.mp4` before the
  reviewer call, whatever the sheet's name. Every rendered plate needs 1–3 of them. Sheets made
  after the reviewer (`<id>-fix<N>.jpg`), the stage-5 `render-plate --sheet`, and a sheet run
  that errored (and was re-run) are not rounds. A simple `for id in a b c; do …$id…; done` loop
  over literal plate ids is counted per plate, but prefer one plate per command.
- **The reviewer** is the first `Agent` call whose prompt names `review-rubric.md`; it comes after
  every plate's rounds.
- **`runtimes.md`** is Read (with Read, not cat) before the first plate is written.

**Known limits** (accepted; follow the stages and they don't arise):

- A sheet that is made but never Read still counts as a round, and a plate rendered only by
  `render-plate --all` (no id) isn't known to need a round: render each plate alone, Read each sheet.
- Writers it doesn't see: `bash -c "…render-plate…"`, `timeout … render-plate …`, `cp … plates/<id>/`
  (folder target) and `curl -o plates/<id>/index.html`. Don't write plates that way.
- Any `AskUserQuestion` after the storyboard opens unlocks gate 4; the check can't tell whether the
  answer was about the storyboard. Ask about the storyboard, then write the gate line.

---


Each stage below ends with **"End the stage with:"** and the literal gate line to emit. Fill in the
`<…>` parts and write it on its own line in your reply before starting the next stage, every
time, whatever output style or brevity setting is active. **A stage may not begin until the
previous stage's gate line has been written**: before a stage's first command, confirm the
previous gate line is in your replies, and if it isn't, write it now (or finish that stage first). "Show" means put it in the chat, as
text, before the `AskUserQuestion`; give every file as an absolute path (`<abs>/…` below is the
video project's absolute path) so the user can open it.

## Stage 0 — Brief (user gate)

1. `bash "PM/scripts/setup.sh" --check`. If it isn't ready, ask, then run `setup.sh` (network).
2. Gather the brief from what the user gave (a URL, repo, document or concept). Facts and real
   assets only: copy screenshots, logos and data into `assets/`. Write or complete `brief.md` in
   the format of `PM/skills/video-spine/SKILL.md` § Stage 0: `- **Runtime:** <n> s target`, a
   `## Beats` list (`1. **<beat-id>** (<kind>) — what it says`), audience, size and fps, assets,
   brand pack path (default `PM/brand-packs/default`), export (`source` or `1080p60`).
3. Voice: with `PEAK_MEDIA_OPENROUTER_API_KEY` (or legacy `TTS_OPENROUTER_API_KEY`) set the spine
   narrates in the house voice (Rasalgethi, measured style); without it, a silent beat grid
   carries on-screen text.
4. **Show:** `<abs>/brief.md` in full; whether the run is narrated or a beat grid; and, with the
   default pack, that its outro is a placeholder card reading "Your Name" (a real pack replaces it).
5. `AskUserQuestion`: runtime, beats, size/fps, brand, voice or beat grid, export.

End the stage with: `GATE 0 brief: APPROVED — brief.md`

## Stage 1 — Script (cold read, then user gate)

1. Read `PM/skills/video-spine/references/narration-writing.md` (and `voices.md` for a non-default
   voice).
2. Size first: `node "PM/skills/video-spine/scripts/spine.mjs" --brief brief.md --budget --wpm <rate>`.
   The house voice reads at about **127 wpm**; for another voice measure it with `sample-voice.mjs`.
   Beat grid: 165.
3. Write `script.md` (format in video-spine § Stage 1), to the budget. **Keep the brief's
   wording**: where a beat in the brief gives the words (a quoted line), use them as written. If
   `script.md` already exists, check it against the budget and the brief's beats instead of
   rewriting it.
4. **Runtime check, before any TTS.** Count the spoken words (mood tags like `<Warm>` and
   `On screen:` lines don't count) and estimate the runtime at the house rate:
   `estimate s = words × 60 ÷ 127 + 0.5 s per beat` (the spine's lead/tail padding; DEC-33/34).
   It must be within ±10% of the brief's target. Otherwise say so at this gate, with the numbers,
   so the user can trim words or move the target now, not after synthesis at stage 2.
5. **Cold read:** one `Agent` call whose prompt holds only the script text and the audience from
   the brief: no file paths, no repo, no tools. Ask it to mark each beat CLEAR or UNCLEAR, say
   what confused it and which lines sound like hype. **Don't apply its findings yourself.** Turn
   them into a batch of proposed changes, each with the beat, the original line and the proposed
   line.
6. **Show:** `<abs>/script.md` in full (as written, findings not applied), its word count and
   runtime estimate against the target (flag it if outside ±10%), the cold-read verdict per beat
   (`hook: CLEAR — …`), and the numbered proposed changes (`1. compare — original: "…" →
   proposed: "…"`), or "no changes proposed".
7. `AskUserQuestion`: which proposed changes to apply (each, all, none) and whether to approve the
   script. Apply only what the user picks; the user's wording wins. If words or the target
   changed, redo step 4, show the result and ask again.

End the stage with: `GATE 1 script: APPROVED — script.md (<words> words, cold read <k>/<n> CLEAR)`

## Stage 2 — Spine (check gate: runtime within ±10%)

1. `node "PM/skills/video-spine/scripts/spine.mjs" --brief brief.md` (house voice and style are
   the defaults; `--voice/--style` only if the brief says so).
2. The last line must be `PASS  runtime …`. Read the wpm table: a clip far slower than the rest
   means a tag was read aloud; fix that line.
3. Narration: `node "PM/lib/verify/check-cuts.mjs" spine/narration.wav --cuts <each beat's startMs after the first, comma-separated> --min-silence-ms 400`.
4. On `FAIL`, change words in `script.md` and go back to stage 1's approval; never stretch the
   spine by hand.

End the stage with: `GATE 2 spine: PASS — spine/manifest.json <totalMs> ms (target <targetMs> ±10%)`
(or `spine/beatgrid.json`).

## Stage 3 — Plate list (user gate)

1. Write `plates.json` (schema `PM/schemas/plates.v1.json`): `schemaVersion: 1`, `spine`
   (`spine/manifest.json` or `spine/beatgrid.json`), `brand` (absolute path of the pack), `fps`,
   `width`, `height`, and **one plate per beat** in beat order:
   `{id: "p<N>-<beat>", beat, kind, startMs: 0, durationMs: 1, intent, assets, text}`.
   - `intent` is the plate's one idea. `text` is its on-screen copy (the script's `On screen:`
     line, table rows as `a | b | c`). `assets` are files under `assets/`.
   - A `live` plate also gets `live: {url?, storyboard, viewport}` (video-capture).
   - The times are placeholders: the next step sets them.
2. `node "PM/skills/plate-factory/scripts/retime-plates.mjs" plates.json` — every plate takes its
   beat's `startMs`/`durationMs`. It refuses a missing, unknown or doubled beat; fix the list.
   Rerun it after every spine run.
3. `node "PM/scripts/validate.mjs" plates.json` must print `ok`.
4. **Show:** `<abs>/plates.json` as a table with columns id, beat, kind, start (ms), duration (ms),
   intent, text.
5. `AskUserQuestion`: approve the plate list?

End the stage with: `GATE 3 plates: APPROVED — plates.json (<n> plates, retimed from <spine file>)`

## Stage 4 — Storyboard (user gate, before any animation)

1. Read `PM/skills/video-plates/references/vendored-map.md`, then its Read steps 1–4:
   `PM/vendor/hyperframes/hyperframes/SKILL.reference.md`,
   **`PM/vendor/hyperframes/hyperframes/references/runtimes.md`**,
   `PM/vendor/hyperframes/hyperframes/references/format.md`,
   `PM/vendor/hyperframes/hyperframes/references/storyboard.md` and `storyboard-format.md`.
2. `node "PM/skills/video-plates/scripts/render-plate.mjs" plates.json --all --storyboard` — it
   scaffolds each `motion`/`slide` plate from its template and writes `review/storyboard.jpg`.
   For a `live` plate, screenshot its page's first state with playwright-cli into
   `review/storyboard/<id>.png`.
3. Read `review/storyboard.jpg` (and any live stills). Check it against `review-rubric.md` § A.
4. **Show:** the absolute path `<abs>/review/storyboard.jpg` (and any live stills), then one line
   per plate: id, time range, on-screen text, planned motion.
5. `AskUserQuestion`: approve the storyboard before any animation? Changes go into `plates.json`
   (text, intent, kind, assets), then `render-plate plates.json --all --storyboard --rescaffold`;
   show and ask again.

End the stage with: `GATE 4 storyboard: APPROVED — review/storyboard.jpg`

The approved stills are the spec for stage 6.

## Stage 5 — Pipeline test (check gate)

1. `node "PM/skills/video-plates/scripts/render-plate.mjs" plates.json <first plate id> --lint --sheet`
   (a `live` first plate: `capture.mjs --plates plates.json --plate <id>`).
2. Read `review/contact-<id>.jpg`: frames render, fonts and brand colours load, the first frame
   isn't blank. A missing dependency is `FAIL`: run setup, repeat.

End the stage with: `GATE 5 pipeline: PASS — renders/plates/<id>.mp4 (<durationMs> ms, lint clean)`

## Stage 6 — Build plates (check gate: self-review ×3, then one reviewer)

Read `review-rubric.md`. For each plate, Read the vendored-map steps its content needs (5–14).
Work on **one plate per command**: one `render-plate <id>` and one `contact-sheet` per Bash call,
not a loop over plates.

**Self-review, per plate, rounds N = 1, 2, 3 at most:**

1. Author or adjust `plates/<id>/index.html` (`PM/skills/video-plates/references/plate-authoring.md`),
   or keep the template if it already shows the approved still.
2. Render it alone: `render-plate plates.json <id> --lint` (`live`: `capture.mjs --plates plates.json --plate <id>`).
3. `node "PM/lib/verify/contact-sheet.mjs" renders/plates/<id>.mp4 --every 0.5s -o review/<id>-r<N>.jpg`
4. Read `review/<id>-r<N>.jpg` and list what fails `review-rubric.md` § A. Nothing → the plate is
   done. Otherwise fix and start round N+1. After round 3, stop: what's left goes to the reviewer.

**Reviewer, once per video** (after every plate's last round, so one reviewer sees all plates
together): one `Agent` call. Its prompt gives only these paths and asks it to Read them, look at
nothing else, and answer in the format of `review-rubric.md` § C:

- `PM/skills/plate-factory/references/review-rubric.md`
- `plates.json` and `review/storyboard.jpg` (the approved spec)
- each plate's last self-review sheet, `review/<id>-r<N>.jpg`

Then fix every `blocker` and `major` defect, each in its named plate only: re-render that plate
and Read `review/<id>-fix<N>.jpg` (made the same way; it is not a self-review round). Fix
`minor` ones when cheap. At most one more reviewer call, on the fixed plates only. The gate
holds when every plate has rendered at its `durationMs` with lint clean and no blocker or major
defect is open.

**Stage 6 ends here, not at the reviewer.** It ends once the reviewer's fixes are re-rendered,
re-sheeted (`-fix<N>.jpg`) and Read. Write the GATE 6 line at that point, before any assemble
command.

End the stage with: `GATE 6 build: PASS — <n> plates; reviewer: <k> defects, <k> fixed`

## Stage 7 — Composite (check gate: every cut in a silent gap)

0. **First confirm `GATE 6 build: PASS — …` was written.** If it wasn't, write it now (the
   reviewer's fixes must already be re-rendered and Read), then continue.
1. `node "PM/skills/video-assemble/scripts/assemble.mjs" .` (no stems) — writes
   `review/review.mp4` and checks every plate cut with `check-cuts --min-silence-ms 300`.
2. `node "PM/lib/verify/contact-sheet.mjs" review/review.mp4 --every 1s -o review/contact-review.jpg`; Read it.
3. A cut not in silence is fixed at the source (the spine beat, then `retime-plates`, then
   re-render that plate).

End the stage with: `GATE 7 composite: PASS — review/review.mp4 (<k> cuts in ≥300 ms silence)`

## Stage 8 — Music, then SFX (user gate: the user listens)

1. `AskUserQuestion`: a music track (path, or none) and an SFX stem (path, or none). The plugin
   ships no music. Copy what the user gives into `audio/` and note its credit in
   `audio/CREDITS.md` (`PM/brand-packs/<pack>/music-rules.md`).
2. Each pass starts from the narration-only `review/review.mp4` (picture copied, never
   re-rendered). `RX` = `node "PM/skills/video-assemble/scripts/remux-audio.mjs" review/review.mp4`.
   The file the user listens to is always the last one in the row:

   | Stems | Commands | User listens to |
   |---|---|---|
   | none | — | `review/review.mp4` |
   | music only | `RX --music audio/<track> -o review/review-mix.mp4 --levels review/levels.json` | `review/review-mix.mp4` |
   | SFX only | `RX --sfx audio/<sfx> -o review/review-mix.mp4 --levels review/levels.json` | `review/review-mix.mp4` |
   | music + SFX | music pass `RX --music audio/<track> -o review/review-music.mp4` (check it), then `RX --music audio/<track> --sfx audio/<sfx> -o review/review-mix.mp4 --levels review/levels.json` | `review/review-mix.mp4` |

   Defaults: music −28 LUFS under the voice, `--duck-db 6`, SFX −20 LUFS. (Stage 9's `assemble`
   with any stem also writes `review/review-mix.mp4` and `review/levels.json`.)
3. **Show:** the absolute path of the file to listen to (`<abs>/review/review-mix.mp4`, or
   `<abs>/review/review.mp4` with no stems) and its measured levels: integrated LUFS and true
   peak of the mix (from `review/levels.json`, or `review/assemble.json` with no stems), plus
   `belowVoiceDb` when there is music.
4. `AskUserQuestion`: listen and approve the levels? Adjust `--music-lufs`/`--duck-db` on request,
   rerun, show and ask again.

End the stage with: `GATE 8 audio: APPROVED — review/review-mix.mp4 (review/levels.json)`
(no stems: `GATE 8 audio: APPROVED — review/review.mp4 (narration only)`).

## Stage 9 — Export (check gate: spec + final contact sheet)

1. `node "PM/skills/video-assemble/scripts/assemble.mjs" . [--music audio/<track>] [--sfx audio/<sfx>] [--export 1080p60]`
   with the approved levels flags and the brief's export. It appends the brand outro and checks
   `out/final.mp4` with probe-spec (and duration = spine + outro).
2. `node "PM/lib/verify/contact-sheet.mjs" out/final.mp4 --every 1s -o review/contact-final.jpg`;
   Read it: the plates in order, the last frames show the brand outro.
3. Tell the user the absolute path of `<abs>/out/final.mp4`.

End the stage with: `GATE 9 export: PASS — out/final.mp4 (<duration> s, probe-spec PASS, outro on review/contact-final.jpg)`
