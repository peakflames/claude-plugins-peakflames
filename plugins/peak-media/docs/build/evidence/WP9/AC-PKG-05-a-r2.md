# AC-PKG-05 (a) r2 — 20 s narrated explainer, re-run on the fixed plate-factory skill

- **Date:** 2026-11-09
- **Driver:** agent standing in for the user (user-approved), headless `claude -p` + `--resume`,
  `CLAUDE_CONFIG_DIR=~/tmp/pm-pkg02/.claude-config`, `--permission-mode bypassPermissions`.
- **Plugin:** `--plugin-dir .claude/worktrees/agent-ae42bf332f2a3a11c/plugins/peak-media`
  (worktree HEAD `ac29631`, "plate-factory — automatic stages 2/5/6/7 must print their GATE
  lines"). That copy's `scripts/setup.sh` was run first (`peak-media ready`, `--check` exit 0).
- **Folder:** `~/tmp/pm-pkg05/explainer-r2` (fresh, no CLAUDE.md, outside any repo).
- **Session id:** `223063fc-3ad9-4f92-92d2-a6b276b1c6a7`

## Prompt

> Make a 20-second narrated explainer video for home gardeners: why to water plants in the
> morning. Three beats: the habit, the reason (less evaporation, leaves dry before night), and the
> tip (water the roots, early). Use the default brand pack. Keep everything in this folder.

## Answers given (same as r1)

| Turn | Session stopped at | Answer |
|---|---|---|
| 1 | Gate 0 — brief | "Approve." |
| 2 | Gate 1 — script, cold read, 2 proposed edits | "Apply both. Approved." |
| 3 | Gate 3 — plate list | "Approved." |
| 4 | Gate 4 — storyboard; options A text-only (recommended) / B add drawings / C change | "Approve." |
| 5 | Gate 8 — audio (−16 LUFS, −2.1 dBTP) | "No music, no SFX. Levels approved." |
| 6 | Done — export | — |

No hints, no file pointers, no loops.

## GATE lines (assistant text, in order)

```
GATE 0 brief: REJECTED — brief.md (awaiting user approval; not yet approved)
GATE 0 brief: APPROVED — brief.md
GATE 1 script: REJECTED — script.md (awaiting user choice on proposed changes and approval)
GATE 3 plates: REJECTED — plates.json (awaiting user approval)
GATE 3 plates: APPROVED — plates.json (3 plates, retimed from spine/manifest.json)
GATE 4 storyboard: REJECTED — review/storyboard.jpg (awaiting user approval)
GATE 4 storyboard: APPROVED — review/storyboard.jpg (option A: text-only plates, as shown)
GATE 7 composite: PASS — review/review.mp4 (2 cuts in ≥300 ms silence)
GATE 8 audio: REJECTED — review/review.mp4 (awaiting user's music/SFX choice and listening approval)
GATE 8 audio: APPROVED — review/review.mp4 (narration only)
GATE 9 export: PASS — out/final.mp4 (23.0 s, probe-spec PASS, outro on review/contact-final.jpg)
```

- **Missing:** `GATE 1 … APPROVED`, `GATE 2`, `GATE 5`, `GATE 6`. Searched all assistant text,
  thinking and tool inputs: none present. The stages ran (narration + spine, plate p1 rendered
  first, self-review rounds + reviewer Agent).
- **New vs r1:** `GATE 7` now prints. Each user gate is first printed as `REJECTED … (awaiting
  user approval)` while the question is open, then `APPROVED` after the reply.

## check-transcript.mjs (fixed copy)

```
FAIL  AC-ORC-01  no passing gate line for gate(s) 1, 2, 5, 6
FAIL  AC-ORC-02  plate written before the storyboard was approved — the APPROVED line at line 218 had no AskUserQuestion since the storyboard opened, so it doesn't count: Bash render-plate.mjs" plates.json p1-habit --lint --sheet 2>&1 (line 219)
PASS  AC-ORC-03  self-review rounds p1-habit×1, p2-reason×2, p3-tip×1 (1–3 each, every rendered plate), then reviewer Agent at line 350
PASS  AC-ORC-04  runtimes.md Read (line 160) before the first plate write (line 219: Bash render-plate.mjs" plates.json p1-habit --lint --sheet 2>&1)
exit=1
```

AC-ORC-02 failing is expected (approvals were typed replies; no AskUserQuestion in headless `-p`).
**AC-ORC-01 (under test) FAILS:** gates 1, 2, 5, 6 have no passing line.

## Only SKILL.md check — PASS

Transcript `~/tmp/pm-pkg02/.claude-config/projects/-Users-schaveyt-tmp-pm-pkg05-explainer-r2/223063fc-3ad9-4f92-92d2-a6b276b1c6a7.jsonl`
scanned for Read/cat/grep/find of `plugins/peak-media/docs/` or `docs/build/`: **0 hits**.

## Output

- `~/tmp/pm-pkg05/explainer-r2/out/final.mp4` — 23.0 s (20 s + 3 s brand outro), 1920×1080,
  H.264 + AAC.
- Contact sheet (1 s, `contact-sheet.mjs --every 1s`): `AC-PKG-05-a-r2-sheet.jpg`. Text-only
  plates (user picked option A at gate 4 by "Approve."): "Water in the morning" 0–5 s; "Less
  evaporation" 6–9 s, plus "Leaves dry before night" from ~10 s; "Water the roots, early" 14–19 s;
  "Your Name" outro 21–22 s. Black frames at 20.00 s and 22.97 s (outro fade).
