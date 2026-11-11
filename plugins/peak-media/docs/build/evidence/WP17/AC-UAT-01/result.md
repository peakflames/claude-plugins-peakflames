# AC-UAT-01 — result: PASS

**Case:** To-do app · "Make a captioned 20-second demo of the to-do app in `./ui-demo` for our product website." · gate answer "approve"

| Then item | Verdict | Evidence |
|---|---|---|
| Given no TTS key used | PASS | Zero TTS: no `sample-voice`/`--narrate` command in either turn; TTS cache unchanged (0 new files). |
| One gate | PASS | Turn 1 ends with the plan and "Reply \"record it\"…" (one question); the first `capture.mjs` call is in turn 2, after "approve". No AskUserQuestion (headless, DEC-42). |
| Preset `web` | PASS | Gate and hand-off: "`web` … because it is for the product website"; `probe.log` checks `--preset web` → PASS. |
| MP4 1280×720@30, 18–22 s | PASS | `probe.log`: 1280×720, 30.000 fps; `videoMs` 19933 (19.9 s). |
| A caption in every beat still | PASS | Reviewer item 1: all four captions seen inside their beats. |
| Cursor visible on each click | PASS | Reviewer item 2: cursor on the input, checkbox, Active, Done, Clear done and All. |
| Zero TTS calls | PASS | See first row. |

**Notes:** The session re-captured once (first take 18.5 s, already in range) to land nearer 20 s. Exploration hit playwright-cli's file:// block and served the folder with `python3 -m http.server` (defect D1).

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
