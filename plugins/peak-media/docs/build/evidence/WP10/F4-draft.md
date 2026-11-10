# WP10b — F4 real-video DRAFT run (plate-factory, headless, agent as user)

- **Date:** 2026-11-10
- **Driver:** agent standing in for the user (user asleep; asked us to take it as far as possible).
  Headless `claude -p` + `--resume` per gate, `CLAUDE_CONFIG_DIR=~/tmp/pm-pkg02/.claude-config`,
  `--permission-mode bypassPermissions`, narration key via `zsh -i`.
- **Plugin:** `--plugin-dir <main checkout>/plugins/peak-media`, branch
  `feature/new-peak-media-plugin` at `10518db` (contains 46f6005). `scripts/setup.sh` run first
  (`peak-media ready`, `--check` exit 0).
- **Folder:** `~/tmp/pm-f4` (fresh, no CLAUDE.md). `source.md` = copy of
  `docs/build/references/openspec-vs-peak-workflow.md` (hand step, M11).
- **Brand pack:** `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/`
- **Session id:** `3dc411f1-ec4f-45a7-8702-eb488aad02e9`
- **Result:** completed, `out/final.mp4` exported.

## Prompt

> Make a 75–90 second narrated explainer for developers and leads choosing a spec-driven
> AI-coding workflow: OpenSpec vs. peak-workflow. Use the talking points in source.md (§7). About 9
> beats: hook ("Two tools, same promise: no code until we agree on the spec. They disagree about who
> checks the work."), the shared problem, the OpenSpec loop, delta merge, peak-workflow's TOR IDs,
> Requirements Anchors and /wrapup-epic refusing a same-session review, a trimmed head-to-head, an
> honest close (speed vs. proof — pick by whether you must show your work), then the brand outro.
> Use the brand pack at ~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/.
> 1920×1080. Keep everything in this folder.

## Answers given (every one)

| Turn | Session stopped at | Answer |
|---|---|---|
| 1 | Gate 0 — brief: 8 beats + pack outro, 80 s spine (+4 s outro), all typographic plates, 1920×1080@30 | "Approved." |
| 2 | Gate 1 — script, cold read 6/8 CLEAR; edits 1–4 offered (with trims to fit), #5 not recommended | "Apply 1–4, trimmed to fit, as you suggest. Approved." |
| 3 | Gate 3 — plate list (8 plates); offered dropping a head-to-head row (no recommendation) | "Approved." |
| 4 | Gate 4 — storyboard (p7 cut to 3 rows by the template) | "Approve, as you recommend." |
| 5 | Gate 8 — music choice (Groove Sauce / own folder / none) | "Use the pack's groove-sauce track at the pack's levels, no SFX." |
| 6 | Gate 8 — mix levels to approve | "Approved." |
| 7 | Done — export | — |

No live captures were proposed, so none were allowed or refused. No hints, no file pointers, no
loops, no stalls.

## GATE lines in order (transcript line, source)

| JSONL line | Source | Line |
|---|---|---|
| 86 | assistant text | `GATE 0 brief: APPROVED — brief.md` |
| 141 | script output (`spine.mjs`) | `GATE 2 spine: PASS — spine/manifest.json 82760 ms (target 80000 ±10%)` (repeated in text, line 171) |
| 184 | assistant text | `GATE 3 plates: APPROVED — plates.json (8 plates, retimed from spine/manifest.json)` |
| 288 | assistant text | `GATE 4 storyboard: APPROVED — review/storyboard.jpg` |
| 302 | script output (`render-plate.mjs --pipeline-test`) | `GATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (9500 ms, lint clean)` |
| 529 | script output (`gate.mjs build`) | `GATE 6 build: PASS — 8 plates; reviewer: 1 defects, 0 fixed` |
| 538 | script output (`assemble.mjs`) | `GATE 7 composite: PASS — review/review.mp4 (7 cuts in ≥300 ms silence)` (repeated in text, line 564) |
| 601 | assistant text | `GATE 8 audio: APPROVED — review/review-mix.mp4 (review/levels.json)` |
| 603 | script output (`assemble.mjs` with music) | `GATE 7 composite: PASS — review/review.mp4 (7 cuts in ≥300 ms silence)` |
| 627 | assistant text | `GATE 9 export: PASS — out/final.mp4 (86.8 s, probe-spec PASS, outro on review/contact-final.jpg)` |

**Missing: `GATE 1`** — never printed in any form (text, thinking or tool input), although the
session applied the approved edits (python/sed on `script.md`) and went on to the spine. Same
"approved with edits" case that printed GATE 1 in the r4 cold start on 46f6005.

GATE 6 vs reviewer: reviewer `VERDICT: 0 blocker, 0 major, 1 minor` (p2 line dims to grey at 5.5 s,
left `— open`) → "1 defects, 0 fixed". **Counts match.**

## check-transcript.mjs (main checkout)

```
FAIL  AC-ORC-01  no passing gate line for gate(s) 1
FAIL  AC-ORC-02  plate written before the storyboard was approved — the APPROVED line at line 288 had no AskUserQuestion since the storyboard opened, so it doesn't count: Bash render-plate.mjs" plates.json p1-hook --pipeline-test 2>&1 (line 301)
PASS  AC-ORC-03  self-review rounds p1-hook×1, p2-problem×1, p3-openspec-loop×1, p4-delta-merge×1, p5-tor-ids×1, p6-wrapup×1, p7-head-to-head×1, p8-close×1 (1–3 each, every rendered plate), then reviewer Agent at line 523
PASS  AC-ORC-04  runtimes.md Read (line 208) before the first plate write (line 301: Bash render-plate.mjs" plates.json p1-hook --pipeline-test 2>&1)
exit=1
```

AC-ORC-02 is the expected headless failure (typed approvals). AC-ORC-01 fails on the missing
GATE 1 line, not on AskUserQuestion this time.

Only-SKILL.md scan (no reads of `plugins/peak-media/docs/` or `docs/build/`): 0 hits.

## Output

- **`~/tmp/pm-f4/out/final.mp4`** — **86.77 s** (82.76 s spine + 4 s Peakflames outro),
  1920×1080, 30 fps, H.264 + AAC. probe-spec PASS (session).
- Audio: narration −16.0 LUFS / −1.7 dBTP; Groove Sauce under voice −30.5 LUFS (pack target −28),
  ducks 6 dB; full mix −16.3 LUFS / −1.4 dBTP. Credit in `audio/CREDITS.md`.
- Contact sheet (1 s, `contact-sheet.mjs --every 1s`): `F4-draft-sheet.jpg`.
- Other: `review/review.mp4`, `review/review-mix.mp4`, `review/levels.json`,
  `review/plate-review.md`, `review/storyboard.jpg`.

## Anything odd

- **No live captures, no diagrams.** The F4 fixture plans live pages (OpenSpec docs, GitHub TOR
  page), a delta-merge motion diagram and a terminal replay. The session chose typographic plates
  only ("no screenshots supplied") and never proposed captures. All 8 plates are left-aligned text
  stacks with an accent bar, lines revealed in sync with narration (M15).
- **Placeholder IDs on screen:** `TOR-NN-XXXXXXX` (M16).
- **Head-to-head slide** cut to 3 rows (IDs, Verify, Ceremony) by the slide template's fit check;
  on screen ~6 s.
- **p2 minor** left open by the reviewer: "Intent lives in chat that disappears" dims to grey.
- **Music** sits 2.5 dB under the pack target while ducked; session passed levels by hand (M13).
- **Brief listed 8 beats** (outro not counted); spine targeted 80 s to land 84–87 s with the outro.
- Frame 1:23 is a near-black transition into the outro; last frame fades to black (intended).
- Narration spells "T-O-R", "Open Spec", "Peak Workflow", "slash wrapup epic" for TTS; tor-ids clip
  reads slowly (96 wpm vs 125 median), flagged by the session.

Hand steps added to `docs/build/wp/WP10/manual-steps.md` as M11–M16.
