---
name: plate-factory
description: |
  Makes a faceless motion-graphics video from a brief, end to end: brief → script → spine
  (narration or beat grid) → plate list → storyboard stills → plates → composite → music and
  SFX → out/final.mp4. Runs stages 0–9 in order, each with a gate: the user approves the brief,
  script, plate list, storyboard and mix; checks gate the rest. A thin orchestrator over
  video-spine, video-plates, video-capture and video-assemble.
  Triggers on: "make a video", "make an explainer video", "plate factory", "turn this brief into
  a video", "motion-graphics video from this page", "faceless video", "/plate-factory".
---

# plate-factory

You run a video project through ten stages. The **spine** (narration, or a beat grid with no
voice) sets the clock; each beat gets one **plate** (`motion`, `slide` or `live`) rendered on its
own; assembly puts the plates on the spine. Stills are approved before any animation is written,
and audio never forces a re-render.

**Every stage ends with its gate line**, and the run is checked for all ten.

- **Stages 2, 5, 6, 7: the script prints it.** Run the stage's gate command and its output carries
  the line: `spine.mjs` → `GATE 2 spine: …`; `render-plate.mjs plates.json <first id>
  --pipeline-test` → `GATE 5 pipeline: …`; `gate.mjs build .` → `GATE 6 build: …`;
  `assemble.mjs .` → `GATE 7 composite: …`. Never type or echo these four lines yourself; on
  `FAIL`, fix and rerun the command.
- **Stages 0, 1, 3, 4, 8, 9: you write it**, on its own line in your reply, e.g.
  `GATE 3 plates: APPROVED — plates.json (3 plates, retimed from spine/manifest.json)`. A user
  gate's `APPROVED` line goes right after the user's answer, before the next command. While you
  wait for an answer, print no gate line (`REJECTED` is only for an answer that turns it down).
- **Approved, but with changes** ("apply 1, approved"):
  - gates 0, 1, 3 — apply the text edits, then write the `APPROVED` line, then start the next stage;
  - gate 4 — a storyboard change reopens it: edit `plates.json`, re-run the storyboard
    (`--rescaffold`), show it and ask again; no `APPROVED` until the user approves the new one;
  - gate 8 — a level or music change means re-mix, show the new levels and let the user listen
    again; no `APPROVED` until they approve what they heard.
- This holds **whatever output style or brevity setting is active**: a concise style shortens
  your prose, never the gate lines.
- **A stage may not begin until the previous stage's gate line has been written** (printed by its
  script, or by you).

**The user's wording wins.** Keep the brief's wording in the script. Never rewrite the user's
lines on your own or apply cold-read findings before the user picks: present them as a batch of
proposed changes (original line → proposed line) and apply only the ones the user chooses.

**Show what the user approves.** Before each user gate's `AskUserQuestion`, put the thing being
approved in the chat, with absolute paths so the user can open files: gate 0 the whole `brief.md`,
gate 1 the whole `script.md` and the cold-read verdict per beat, gate 3 the plate table, gate 4
the storyboard path and one line per plate, gate 8 the file to listen to and its measured levels.
`references/stages.md` says exactly what for each.

The plugin root is `${CLAUDE_PLUGIN_ROOT}`. Wherever a reference file writes `PM/` or
`${CLAUDE_PLUGIN_ROOT}/`, use this path, quoted, in the command.

This skill only orders the work. Each stage calls the skill that owns it. Read that skill's
SKILL.md before its first stage:

| Stages | Skill | Entry points |
|---|---|---|
| 0–2 | `${CLAUDE_PLUGIN_ROOT}/skills/video-spine/SKILL.md` | `spine.mjs`, `sample-voice.mjs` |
| 3, 6, 8 | this skill | `skills/plate-factory/scripts/retime-plates.mjs`, `scripts/validate.mjs`, `skills/plate-factory/scripts/gate.mjs`, `skills/plate-factory/scripts/audio-options.mjs` |
| 4–6 (`motion`, `slide`) | `${CLAUDE_PLUGIN_ROOT}/skills/video-plates/SKILL.md` | `render-plate.mjs` |
| 6 (`live`) | `${CLAUDE_PLUGIN_ROOT}/skills/video-capture/SKILL.md` | `capture.mjs --plates plates.json --plate <id>` (no `--preset`); the storyboard calls `beat('<plate beat>', fn)` once |
| 7–9 | `${CLAUDE_PLUGIN_ROOT}/skills/video-assemble/SKILL.md` | `assemble.mjs`, `remux-audio.mjs` |
| review | — | `lib/verify/contact-sheet.mjs`, `lib/verify/check-cuts.mjs`, `lib/verify/probe-spec.mjs` |

Run any script with `--help` for its flags. If one reports a missing dependency, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"` (it needs the network: ask first) and retry.

**Before stage 0, Read `${CLAUDE_PLUGIN_ROOT}/skills/plate-factory/references/stages.md`.** It
has each stage's steps, commands and gate-line format. Read
`${CLAUDE_PLUGIN_ROOT}/skills/plate-factory/references/review-rubric.md` before stage 4.

## The stages

| # | Stage | Output | Gate | Gate line (required; 2, 5, 6, 7 printed by the script) |
|---|---|---|---|---|
| 0 | Brief | `brief.md` | user confirms | `GATE 0 brief: APPROVED — brief.md` |
| 1 | Script | `script.md` | cold-read agent, then user | `GATE 1 script: APPROVED — script.md (…)` |
| 2 | Spine | `spine/manifest.json` or `beatgrid.json` | runtime within ±10% | `GATE 2 spine: PASS — spine/manifest.json <ms> ms (target <ms> ±10%)` (`spine.mjs`) |
| 3 | Plate list | `plates.json`, retimed from the spine | user confirms | `GATE 3 plates: APPROVED — plates.json …` |
| 4 | Storyboard | `review/storyboard.jpg` | **user approves before any animation** | `GATE 4 storyboard: APPROVED — review/storyboard.jpg` |
| 5 | Pipeline test | plate 1 rendered alone | renders cleanly | `GATE 5 pipeline: PASS — renders/plates/<id>.mp4 (<ms> ms, lint clean)` (`render-plate --pipeline-test`) |
| 6 | Build plates | `renders/plates/<id>.mp4` each | ≤ 3 self-review rounds per plate, then a reviewer agent | `GATE 6 build: PASS — <n> plates; reviewer: <d> defects, <f> fixed` (`gate.mjs build`) |
| 7 | Composite | `review/review.mp4` | every cut in a silent gap | `GATE 7 composite: PASS — review/review.mp4 (<k> cuts in ≥300 ms silence)` (`assemble.mjs`) |
| 8 | Music, then SFX | `review/review-mix.mp4` | user listens | `GATE 8 audio: APPROVED — review/review-mix.mp4 …` |
| 9 | Export | `out/final.mp4` | spec check + final contact sheet | `GATE 9 export: PASS — out/final.mp4 …` |

## Rules

- **Stages run in order, and each ends with its gate line**, in exactly the format of
  `references/stages.md`, only once the gate holds. A failed check prints `FAIL` (from the script
  for 2, 5, 6, 7); a refusal by the user gets a `REJECTED` line; fix and repeat the stage.
  Going back to an earlier stage repeats every stage after it.
- **User gates (0, 1, 3, 4, 8) ask with `AskUserQuestion`** and wait for the answer. Never
  approve on the user's behalf. Mechanical gates (2, 5, 6, 7, 9) report the check's result.
- **Plate timing comes from the spine.** After every spine run, run `retime-plates plates.json`;
  never type `startMs`/`durationMs` by hand. One plate per beat.
- **No animation before the storyboard is approved.** Until `GATE 4 storyboard: APPROVED`, don't
  Write or Edit any `plates/<id>/index.html` and don't run `render-plate` without `--storyboard`.
  Storyboard changes go into `plates.json` (text, intent, kind, assets), then
  `render-plate plates.json --all --storyboard --rescaffold`. Re-running the storyboard later
  reopens gate 4: no plate writes until the user approves again.
- **Read `vendor/hyperframes/hyperframes/references/runtimes.md` before the first plate**, as
  listed in `skills/video-plates/references/vendored-map.md` (stage 4 does this).
- **Build plates in this session**, not in subagents. Subagents are only for the stage-1 cold
  read and the stage-6 reviewer, and they get no repo context beyond what stages.md lists.
- **The plate is the unit of work.** Every fix names a plate ("p2-table: row 4 touches the right
  margin") and re-renders only that plate. A timing fix goes to `script.md` and the spine, never
  to a render.
- **Review stills, not video.** Every look at a render is a contact sheet you Read.
- **Use the brief's real assets.** Never invent product UI, logos or data.
- Keep everything inside the video project folder (layout in `references/stages.md`). Never
  put music or keys in it that the user didn't give you. At stage 8 offer only the brand pack's
  tracks and SFX (`audio-options.mjs`) or a folder the user names; never search the disk for audio.
