# AC-PKG-05 (a) r4 — 20 s narrated explainer, re-run on commit 46f6005

- **Date:** 2026-11-10
- **Driver:** agent standing in for the user (user-approved), headless `claude -p` + `--resume`,
  `CLAUDE_CONFIG_DIR=~/tmp/pm-pkg02/.claude-config`, `--permission-mode bypassPermissions`.
- **Plugin:** `--plugin-dir .claude/worktrees/agent-ae42bf332f2a3a11c/plugins/peak-media`
  (worktree HEAD `46f6005`, "WP9 round 6 — GATE 1 after approved edits, review record counted per
  defect, …"). That copy's `scripts/setup.sh` was run first (`peak-media ready`, `--check` exit 0).
- **Folder:** `~/tmp/pm-pkg05/explainer-r4` (fresh, no CLAUDE.md, outside any repo).
- **Session id:** `295b532f-889e-4d6e-8f04-4f1c8d32b90a`

## Prompt

> Make a 20-second narrated explainer video for home gardeners: why to water plants in the
> morning. Three beats: the habit, the reason (less evaporation, leaves dry before night), and the
> tip (water the roots, early). Use the default brand pack. Keep everything in this folder.

## Answers given

| Turn | Session stopped at | Answer |
|---|---|---|
| 1 | Gate 0 — brief (also asked early about music/SFX) | "Approve." |
| 2 | Gate 1 — script + cold read; 2 edits: #1 (disease clause, trim habit line to fit), #2 (drop "early"; it advised keeping your wording) | "Apply 1, as you suggest. Approved." |
| 3 | Gate 3 — plate list | "Approved." |
| 4 | Gate 4 — storyboard (offered equal-weight reasons as an option, no explicit recommendation) | "Approve, as you recommend." |
| 5 | Gate 8 — audio (−16 LUFS, −2.4 dBTP) | "No music, no SFX. Levels approved." |
| 6 | Done — export | — |

Gate-1 edit applied as approved: reason now ends "And wet leaves dry before night, which helps
prevent disease."; habit trimmed to "A simple habit: …". No hints, no file pointers, no loops.

## GATE lines in order (transcript line, source)

| JSONL line | Source | Line |
|---|---|---|
| 74 | assistant text | `GATE 0 brief: APPROVED — brief.md` |
| 108 | assistant text | `GATE 1 script: APPROVED — script.md (43 words, cold read 2/3 CLEAR)` |
| 110 | script output (`spine.mjs`) | `GATE 2 spine: PASS — spine/manifest.json 20860 ms (target 20000 ±10%)` |
| 140 | assistant text | `GATE 3 plates: APPROVED — plates.json (3 plates, retimed from spine/manifest.json)` |
| 222 | assistant text | `GATE 4 storyboard: APPROVED — review/storyboard.jpg` |
| 224 | script output (`render-plate.mjs --pipeline-test`) | `GATE 5 pipeline: PASS — renders/plates/p1-habit.mp4 (3567 ms, lint clean)` |
| 488 | script output (`plate-factory/scripts/gate.mjs build`) | `GATE 6 build: PASS — 3 plates; reviewer: 4 defects, 4 fixed` |
| 493 | script output (`assemble.mjs`) | `GATE 7 composite: PASS — review/review.mp4 (2 cuts in ≥300 ms silence)` |
| 518 | assistant text | `GATE 8 audio: APPROVED — review/review.mp4 (narration only)` |
| 520 | script output (`assemble.mjs`, re-run) | `GATE 7 composite: PASS — review/review.mp4 (2 cuts in ≥300 ms silence)` |
| 533 | assistant text | `GATE 9 export: PASS — out/final.mp4 (23.86 s, probe-spec PASS, outro on review/contact-final.jpg)` |

All gates 0–9 present, first pass of each in order. GATE 1 now prints after approved edits. No
REJECTED lines. GATE 7 prints again after gate 8 (assemble re-run for the export).

## check-transcript.mjs (worktree copy)

```
FAIL  AC-ORC-01  gate 0 brief APPROVED without an AskUserQuestion since gate -1 (line 74)
FAIL  AC-ORC-02  plate written before the storyboard was approved — the APPROVED line at line 222 had no AskUserQuestion since the storyboard opened, so it doesn't count: Bash render-plate.mjs" plates.json p1-habit --pipeline-test 2>&1 (line 223)
PASS  AC-ORC-03  self-review rounds p1-habit×1, p2-reason×2, p3-tip×1 (1–3 each, every rendered plate), then reviewer Agent at line 336
PASS  AC-ORC-04  runtimes.md Read (line 150) before the first plate write (line 223: Bash render-plate.mjs" plates.json p1-habit --pipeline-test 2>&1)
exit=1
```

Both FAILs come from typed approvals (no AskUserQuestion in headless `-p`). AC-ORC-01 no longer
reports missing gate lines; it now stops at the first user gate's AskUserQuestion requirement.

## GATE 6 count vs reviewer agent

Reviewer subagent `agent-ad0b79728af58f1df` ("Independent plate review") final report:

```
p1-habit @0.00s [blocker] 1: No sunrise appears behind the headline …
p1-habit @0.00s [major] 9: The first frame is half-built …
p2-reason @0.00s [major] 9: The first frame is half-built …
p3-tip @0.00s [major] 9: The first frame is half-built …
VERDICT: 1 blocker, 3 major, 0 minor
```

= 4 defects. Session wrote all 4 to `review/plate-review.md`, each marked `— fixed`, then ran
`gate.mjs build` → "reviewer: 4 defects, 4 fixed". **Counts match** (r3 said "1 defects" against a
reported 1 major + 3 minor).

## Only SKILL.md check — PASS

Transcript `~/tmp/pm-pkg02/.claude-config/projects/-Users-schaveyt-tmp-pm-pkg05-explainer-r4/295b532f-889e-4d6e-8f04-4f1c8d32b90a.jsonl`
scanned for Read/cat/grep/find of `plugins/peak-media/docs/` or `docs/build/`: **0 hits**.

## Output

- `~/tmp/pm-pkg05/explainer-r4/out/final.mp4` — 23.87 s (20.86 s narration + 3 s brand outro),
  1920×1080, H.264 + AAC. Narration ran +4.3% over the 20 s target (within ±10%).
- Contact sheet (1 s, `contact-sheet.mjs --every 1s`): `AC-PKG-05-a-r4-sheet.jpg`. "Water in the
  morning" with an outline sunrise rising (0–3 s); "Less evaporation" (4–10 s), "Leaves dry before
  night" added from ~11 s; "Water the roots, early" (15–20 s); "Your Name" outro (22–23 s). Black
  frames at 21.00 s and 23.83 s (outro fade). The p2/p3 plates are text-only (the plate intents
  named no drawings beyond p1's sunrise).
