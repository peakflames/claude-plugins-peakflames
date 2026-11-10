# AC-PKG-05 (a) — 20 s narrated explainer, cold start

- **Date:** 2026-11-09
- **Driver:** agent standing in for the user (user-approved), headless `claude -p` + `--resume`.
- **Plugin:** peak-media 0.1.0 as installed from GitHub by AC-PKG-02 (cache copy at
  `~/tmp/pm-pkg02/.claude-config/plugins/cache/peakflames-plugins/peak-media/0.1.0`, commit
  `afffa64`), loaded with `--plugin-dir` on that cached install. See "Harness note".
- **Folder:** `~/tmp/pm-pkg05/explainer` (no CLAUDE.md, outside any repo); narration key exported.
- **Session id:** `f4df6d2b-cfa6-4307-b516-9b259482fed0`

## Prompt

> Make a 20-second narrated explainer video for home gardeners: why to water plants in the
> morning. Three beats: the habit, the reason (less evaporation, leaves dry before night), and the
> tip (water the roots, early). Use the default brand pack. Keep everything in this folder.

## Turns and answers

| Turn | Session stopped at | Answer given |
|---|---|---|
| 1 | Gate 0 — brief (asked runtime, beats, size, voice, export) | "Approve." |
| 2 | Gate 1 — script + cold-read verdicts, offered 2 edits | "Apply both. Approved." |
| 3 | Gate 3 — plate list (voice-over already recorded) | "Approved." |
| 4 | Gate 4 — storyboard stills, options a/b/c | "Approve." |
| 5 | Gate 8 — audio (music/SFX? levels −16 LUFS, −2.6 dBTP) | "No music, no SFX. Levels approved." |
| 6 | Done — export | — |

No hints, no file pointers. No loops; each gate asked once.

## Gate lines (as printed by the session, in order)

```
GATE 0 brief: APPROVED — brief.md
GATE 1 script: APPROVED — script.md (42 words, cold read 1/3 CLEAR)
GATE 3 plates: APPROVED — plates.json (3 plates, retimed from spine/manifest.json)
GATE 4 storyboard: APPROVED — review/storyboard.jpg
GATE 8 audio: APPROVED — review/review.mp4 (narration only)
GATE 9 export: PASS — out/final.mp4 (23.0 s, probe-spec PASS, outro on review/contact-final.jpg)
```

**Gaps:** no `GATE 2`, `GATE 5`, `GATE 6` or `GATE 7` line was printed. The stages ran (spine.mjs
→ `spine/manifest.json` 20 000 ms; plate renders with `--lint` and contact sheets; an independent
plate-review agent; `assemble.mjs` → `review/review.mp4`), but their PASS lines never appeared in
the chat. Order of the printed lines is correct.

## Outputs

| Path | Present |
|---|---|
| `~/tmp/pm-pkg05/explainer/out/final.mp4` | yes — 23.0 s (20 s + 3 s brand outro), 1920×1080, H.264 + AAC |
| `~/tmp/pm-pkg05/explainer/spine/manifest.json` | yes — beats habit 0/5320, reason 5320/8400, tip 13720/6280 ms |
| `~/tmp/pm-pkg05/explainer/review/review.mp4` | yes |

Contact sheet (1 s, plugin's `contact-sheet.mjs --every 1s`): `AC-PKG-05-a-sheet.jpg`. Plates
match beats: sun rising + "Water in the morning" (0–5 s), drop/vapour + leaf, "Less evaporation" /
"Leaves dry before night" (6–13 s), plant with roots + "Water the roots, early" (14–19 s), "Your
Name" outro (21–22 s). Black frames at 20.00 s and 22.97 s (outro fade in/out). Session-noted
nits accepted: "Less evaporation" shifts ~24 px at ~7.3 s; p1 headline sits above the sun line.
Delivery is 1920×1080 (brief default); the runbook's reviewer D7 command uses `--size 1280x720`.

## Only SKILL.md check — PASS

Transcript `~/tmp/pm-pkg02/.claude-config/projects/-Users-schaveyt-tmp-pm-pkg05-explainer/f4df6d2b-cfa6-4307-b516-9b259482fed0.jsonl`
scanned for any Read/cat/grep/find of `plugins/peak-media/docs/` or `docs/build/`: **0 hits**.
Plugin files read: `skills/plate-factory/SKILL.md` (via Skill) and `references/stages.md`,
`skills/video-spine/SKILL.md` + `references/narration-writing.md`, `skills/video-plates/SKILL.md`
+ `references/vendored-map.md`, `plate-authoring.md`, `schemas/plates.v1.json`, brand pack,
`vendor/hyperframes/**` references.

## Reviewer (D7–D10)

Not run here; the Lead runs a separate reviewer agent.

## Harness note

The first attempt (session `04cd9ae3-f30e-4e39-90b7-16a454165acf`, folder kept as
`~/tmp/pm-pkg05/explainer-attempt1-noplugin`, stopped at gate 0, abandoned) is **invalid**: the
PKG-02 install is project-scoped to `~/tmp/pm-pkg02`, so copying `.claude/settings.json` into the
run folder did not load the plugin's skills; the session found the plugin on disk and read its
README instead. Re-run with `--plugin-dir` pointed at the same cached GitHub install.

## Reviewer (fresh agent, no repo context) — 2026-11-09
- D7 PASS — 1920×1080 matches brief.md/plates.json; probe-spec exit 0 (H.264 High, yuv420p, AAC 48 kHz, faststart).
- D8 PASS — stills at 1.00/6.32/14.72 s show p1-habit, p2-reason, p3-tip in order.
- D9 PASS — check-cuts exit 0; cuts 5.320 s / 13.720 s in 1809 / 1448 ms silence.
- Sheet PASS — no clipped/misplaced text; black frames only at the outro card's fades (20.00, 22.97 s); card shows default pack placeholder "Your Name".

## Lead: gate transcript check (evals/plate-factory/check-transcript.mjs)
- AC-ORC-01 FAIL — no gate lines for 2, 5, 6, 7 (stages ran). Real cold-start adherence gap; WP8 live runs printed them.
- AC-ORC-02 FAIL — storyboard approved via a typed `-p --resume` reply, not AskUserQuestion (headless drive). Artifact of the test method.
- AC-ORC-03, 04 PASS.
- Plugin loaded with `--plugin-dir <isolated config>/plugins/cache/peakflames-plugins/peak-media/0.1.0` (the GitHub-installed copy): project-scope install only enables it inside ~/tmp/pm-pkg02.
