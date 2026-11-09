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

The plugin root is `${CLAUDE_PLUGIN_ROOT}`. Wherever a reference file writes `PM/` or
`${CLAUDE_PLUGIN_ROOT}/`, use this path, quoted, in the command.

This skill only orders the work. Each stage calls the skill that owns it. Read that skill's
SKILL.md before its first stage:

| Stages | Skill | Entry points |
|---|---|---|
| 0–2 | `${CLAUDE_PLUGIN_ROOT}/skills/video-spine/SKILL.md` | `spine.mjs`, `sample-voice.mjs` |
| 3 | this skill | `skills/plate-factory/scripts/retime-plates.mjs`, `scripts/validate.mjs` |
| 4–6 (`motion`, `slide`) | `${CLAUDE_PLUGIN_ROOT}/skills/video-plates/SKILL.md` | `render-plate.mjs` |
| 6 (`live`) | `${CLAUDE_PLUGIN_ROOT}/skills/video-capture/SKILL.md` | `capture.mjs`, `check-take.mjs` |
| 7–9 | `${CLAUDE_PLUGIN_ROOT}/skills/video-assemble/SKILL.md` | `assemble.mjs`, `remux-audio.mjs` |
| review | — | `lib/verify/contact-sheet.mjs`, `lib/verify/check-cuts.mjs`, `lib/verify/probe-spec.mjs` |

Run any script with `--help` for its flags. If one reports a missing dependency, run
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"` (it needs the network: ask first) and retry.

**Before stage 0, Read `${CLAUDE_PLUGIN_ROOT}/skills/plate-factory/references/stages.md`.** It
has each stage's steps, commands and gate-line format. Read
`${CLAUDE_PLUGIN_ROOT}/skills/plate-factory/references/review-rubric.md` before stage 4.

## The stages

| # | Stage | Output | Gate | Gate line |
|---|---|---|---|---|
| 0 | Brief | `brief.md` | user confirms | `GATE 0 brief: APPROVED — brief.md` |
| 1 | Script | `script.md` | cold-read agent, then user | `GATE 1 script: APPROVED — script.md (…)` |
| 2 | Spine | `spine/manifest.json` or `beatgrid.json` | runtime within ±10% | `GATE 2 spine: PASS — spine/manifest.json …` |
| 3 | Plate list | `plates.json`, retimed from the spine | user confirms | `GATE 3 plates: APPROVED — plates.json …` |
| 4 | Storyboard | `review/storyboard.jpg` | **user approves before any animation** | `GATE 4 storyboard: APPROVED — review/storyboard.jpg` |
| 5 | Pipeline test | plate 1 rendered alone | renders cleanly | `GATE 5 pipeline: PASS — renders/plates/<id>.mp4 …` |
| 6 | Build plates | `renders/plates/<id>.mp4` each | ≤ 3 self-review rounds per plate, then a reviewer agent | `GATE 6 build: PASS — …` |
| 7 | Composite | `review/review.mp4` | every cut in a silent gap | `GATE 7 composite: PASS — review/review.mp4 …` |
| 8 | Music, then SFX | `review/review-mix.mp4` | user listens | `GATE 8 audio: APPROVED — review/review-mix.mp4 …` |
| 9 | Export | `out/final.mp4` | spec check + final contact sheet | `GATE 9 export: PASS — out/final.mp4 …` |

## Rules

- **Stages run in order, and each ends with its gate line.** Write it on its own line in your
  reply, in exactly the format of `references/stages.md`, only once the gate holds. A failed or
  refused gate gets a `FAIL`/`REJECTED` line; fix and repeat the stage. Going back to an earlier
  stage repeats every stage after it.
- **User gates (0, 1, 3, 4, 8) ask with `AskUserQuestion`** and wait for the answer. Never
  approve on the user's behalf. Mechanical gates (2, 5, 6, 7, 9) report the check's result.
- **Plate timing comes from the spine.** After every spine run, run `retime-plates plates.json`;
  never type `startMs`/`durationMs` by hand. One plate per beat.
- **No animation before the storyboard is approved.** Until `GATE 4 storyboard: APPROVED`, don't
  Write or Edit any `plates/<id>/index.html` and don't run `render-plate` without `--storyboard`.
  Storyboard changes go into `plates.json` (text, intent, kind, assets), then
  `render-plate plates.json --all --storyboard --rescaffold`.
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
  put music or keys in it that the user didn't give you.
