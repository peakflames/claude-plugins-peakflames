# AC-UAT-12 — result: PASS

**Case:** To-do app plus AC-UAT-01's finished project (copied; tester inserted `await beat('nope');` after the `add` beat) · "Re-record it."

| Then item | Verdict | Evidence |
|---|---|---|
| The take stops with an error listing `add, done, filter, clear` | PASS | `capture.log`: "capture: beat 'nope' is not in script.md — valid: add, done, filter, clear", exit 1; the session reported it verbatim, changed nothing (storyboard byte-identical to the tester's edit), and offered two fixes. |

**Notes:** The session took the re-record path (no gate; step 8 directly) and backed up the previous take before re-running; `out/` was left intact. Setup note: the copied `out/todo-demo.take.json` `command[]` held absolute paths into AC-UAT-01's folder. The tester rewrote them to AC-UAT-12 first, so a rerun could not overwrite AC-UAT-01 (D7). AC-UAT-01's folder was verified unchanged afterwards. No MP4 produced, so no probe or contact sheet. Zero TTS.

Evidence in this folder: `transcript-excerpt.md`, plus any case-specific logs listed above.
