# AC-UAT-11 — result: PASS

**Case:** To-do app · AC-UAT-01 prompt · gate answer "Change the second caption to 'Tick it off when done'."

| Then item | Verdict | Evidence |
|---|---|---|
| The change is shown as original → proposed | PASS (shown at hand-off) | Hand-off: "**Caption change:** \"Tick a task when it is done\" → \"Tick it off when done\", applied as you asked." The turn ran the edit and capture with no message first, so in an interactive session the line appears only after recording (minor, D8). |
| Applied | PASS | `web2video/todo-demo/script.md` line 11 "On screen: Tick it off when done"; reviewer item 1 reads that caption at 05–09 s. The user's `ui-demo/script.md` is unchanged. |
| Recording starts without a second gate | PASS | Turn 2's first tool call is the `sed` edit chained with `capture.mjs`; no question asked. |

**Notes:** Length 19.4 s, `web`, 1280×720@30, probe PASS, zero TTS.

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
