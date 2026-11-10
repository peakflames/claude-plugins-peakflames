# WP10b — F4 real-video DRAFT 2 (plate-factory, headless, agent as user, with creative direction)

- **Date:** 2026-11-10
- **Driver:** agent standing in for the user (user asleep). Headless `claude -p` + `--resume` per
  gate, `CLAUDE_CONFIG_DIR=~/tmp/pm-pkg02/.claude-config`, `--permission-mode bypassPermissions`,
  narration key via `zsh -i`.
- **Plugin:** `--plugin-dir <main checkout>/plugins/peak-media` (branch
  `feature/new-peak-media-plugin`; HEAD `eccdd97` at start, `22dc85a` at end — Lead doc commits only).
  `setup.sh --check` exit 0.
- **Folder:** `~/tmp/pm-f4-r2` (fresh, no CLAUDE.md); `source.md` copied in by hand again (M11).
- **Brand pack:** `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/`
- **Session id:** `24d9a442-4da9-4451-971a-415d7c27ba23`
- **Result:** completed, `out/final.mp4` exported.

## Prompt

Same as draft 1 (`F4-draft.md`).

## Answers and directions given (every one)

| Turn | Session stopped at | What I said |
|---|---|---|
| 1 | Gate 0 — brief (8 beats + outro, 80 s, all typographic, placeholder TOR ID) | "Approved." |
| 2 | Gate 1 — script, cold read 4/8 CLEAR, edits 1–4 proposed | "Apply 1–4, as you suggest. Approved." |
| 3 | Gate 1 again — edits pushed runtime to ~90 s (+12.5%); options 1/2/3, recommended 2 (trims A–C + target 84 s) | "Option 2, as you recommend. Approved." |
| 4 | Gate 3 — plate list, text-only motion plates, placeholder TOR | **Direction:** "Make it visual, not just text. I want: the OpenSpec loop as a live capture of the OpenSpec docs/README page (https://github.com/Fission-AI/OpenSpec), the delta merge as an animated diagram (ADDED/MODIFIED/REMOVED folding into the living spec), the TOR ID beat as a live capture of a real peak-workflow page on GitHub (https://github.com/peakflames/claude-plugins-peakflames, the peak-workflow plugin README or a requirements file showing a TOR ID — use a real TOR ID, not a placeholder), the /wrapup-epic refusal as a terminal replay, and the head-to-head as a proper table slide with enough time to read it. Text should be big and centred, not small in a corner." |
| 5 | Gate 3 — revised list (2 live, diagram, terminal replay, table held into p8); asked A/B for table time and OK to use `peakflames/summit` for the real TOR ID (plugin README has only example IDs) | "Option A, as you recommend, and summit is fine for the TOR ID. Approved." (checked: summit is public) |
| 6 | Gate 4 — storyboard | **Direction (once):** "The head-to-head frame is still small text in the corner, and the page text in the two live captures is small. Please fix those so they read big and centred." |
| 7 | Gate 4 — fixed storyboard (p7 full-frame table; captures at 42–44 px) | "Approve, as you recommend." |
| 8 | Gate 8 — music choice | "Use the pack's groove-sauce track at the pack's levels, no SFX." |
| 9 | Gate 8 — mix levels | "Approved." |
| 10 | Done — export | — |

No plugin internals mentioned, no loops (max 2 turns on a gate), no stalls (build turn ~25 min,
transcript growing throughout).

## GATE lines in order (transcript line, source)

| JSONL line | Source | Line |
|---|---|---|
| 85 | assistant text | `GATE 0 brief: APPROVED — brief.md` |
| 165 | assistant text | `GATE 1 script: APPROVED — script.md (174 words, cold read 4/8 CLEAR)` |
| 167 | script output (`spine.mjs`) | `GATE 2 spine: PASS — spine/manifest.json 84000 ms (target 84000 ±10%)` |
| 198 | assistant text | `GATE 3 plates: REJECTED — plates.json (user asked for live captures, an animated diagram, a terminal replay, a longer table slide, and big centred text)` |
| 267 | assistant text | `GATE 3 plates: APPROVED — plates.json (8 plates, retimed from spine/manifest.json)` |
| 560 | assistant text | `GATE 4 storyboard: REJECTED — review/storyboard.jpg (head-to-head text small and off-centre; page text in both live captures too small)` |
| 656 | assistant text | `GATE 4 storyboard: APPROVED — review/storyboard.jpg` |
| 658 | script output (`render-plate.mjs --pipeline-test`) | `GATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (9567 ms, lint clean)` |
| 1094 | script output (`gate.mjs build`) | `GATE 6 build: PASS — 8 plates; reviewer: 20 defects, 16 fixed` |
| 1104 | script output (`assemble.mjs`) | `GATE 7 composite: PASS — review/review.mp4 (7 cuts in ≥300 ms silence)` |
| 1171 | assistant text | `GATE 8 audio: APPROVED — review/review-mix.mp4 (review/levels.json)` |
| 1173 | script output (`assemble.mjs` with music) | `GATE 7 composite: PASS — review/review.mp4 (7 cuts in ≥300 ms silence)` |
| 1196 | assistant text | `GATE 9 export: PASS — out/final.mp4 (88.0 s, probe-spec PASS, outro on review/contact-final.jpg)` |

All gates 0–9 present (GATE 1 printed this time). REJECTED lines mark the two times I sent work back.
GATE 6 vs reviewer: `VERDICT: 1 blocker, 8 major, 11 minor` = 20; 16 marked fixed, 4 minor open
(p1 card ease, p5 Gherkin line wraps, p6 refusal terminal sits high, p8 summary line off-centre).
**Counts match.**

## check-transcript.mjs (main checkout)

```
FAIL  AC-ORC-01  gate 0 brief APPROVED without an AskUserQuestion since gate -1 (line 85)
FAIL  AC-ORC-02  plate written before the storyboard was approved — the APPROVED line at line 656 had no AskUserQuestion since the storyboard opened, so it doesn't count: Bash render-plate.mjs" plates.json p1-hook --pipeline-test 2>&1 (line 657)
PASS  AC-ORC-03  self-review rounds p1-hook×2, p2-problem×2, p4-delta-merge×2, p6-anchors-wrapup×2, p7-head-to-head×1, p8-close×1, p3-openspec-loop×2, p5-tor-ids×1 (1–3 each, every rendered plate), then reviewer Agent at line 991
PASS  AC-ORC-04  runtimes.md Read (line 279) before the first plate write (line 657: Bash render-plate.mjs" plates.json p1-hook --pipeline-test 2>&1)
exit=1
```

Both FAILs are the expected headless ones (typed approvals, no AskUserQuestion).

Only-SKILL.md scan: 0 reads of `plugins/peak-media/docs/` or `docs/build/`. The session did read
`plugins/peak-workflow/skills/wrapup-epic/SKILL.md` in the local checkout (for the real refusal text)
and pulled `peakflames/summit` files with `gh api` — project content, not peak-media build docs.

## Output

- **`~/tmp/pm-f4-r2/out/final.mp4`** — **88.0 s** (84.0 s spine + 4 s outro), 1920×1080, 30 fps,
  H.264 + AAC, probe-spec PASS (session).
- Audio: narration −16.0 LUFS; Groove Sauce under voice −29.4 LUFS (target −28), ducks 6 dB; full
  mix −16.2 LUFS / −1.1 dBTP. Credit in `audio/CREDITS.md`.
- Contact sheet (1 s): `F4-draft2-sheet.jpg`.
- Plates: p1 hook (two tool cards + shared spec, "Who checks the work?"), p2 asked/meant fork + repo
  tree, p3 **live** OpenSpec README "See it in action" (light theme, 42 px mono, scrolls through
  propose/apply/archive), p4 **diagram** ADDED/MODIFIED/REMOVED chips folding into a living-spec
  stack + 3 tags, p5 **live** summit `02-habit-management.feature.md` with real
  `TOR-02-AZYrPMQ`, p6 Requirements Anchors table → **terminal replay** of the real Session Guard
  refusal → fresh-session PASS rows, "TOR Requirements: 9/9 PASS", p7 full-frame table (~15 s with
  p8), p8 "Do you need to show your work?".

## Anything odd

- **Skill again proposed text-only plates** at gate 0/3; visuals only came after my direction (M17).
- **Designed plates are top-heavy:** p1, p4 and p6 put their content in the upper half with the lower
  half empty for long stretches (reviewer flagged p6 as minor, open).
- **p5 capture:** the TOR line sits near the top of the frame with the rest of the file below it;
  the amber highlight shows only from ~48 s; page text is left-aligned, not centred.
- **Live captures are light-theme** against the dark brand plates (session offered dark theme; I
  wasn't asked to choose it and didn't).
- **Live takes hand-patched:** first 9–12 frames replaced via `live/hold-first-frames.sh` (M21).
- **Real content from outside the prompt:** TOR ID, anchors and PASS rows from public
  `peakflames/summit`; refusal text from the local peak-workflow SKILL.md (M22, M23).
- **Music** 1.4 dB under the pack target while ducked; again copied/levelled by hand (M12, M13).
- **Black frame at 1:24** (transition into the outro), outro fades to black at the end.

Hand steps added to `docs/build/wp/WP10/manual-steps.md` as M17–M24.
