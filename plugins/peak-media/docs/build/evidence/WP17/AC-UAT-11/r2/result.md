# AC-UAT-11 r2 — result: PASS (D8 fixed)

**Case:** To-do app · AC-UAT-01 prompt · gate answer "Change the second caption to 'Tick it off when done'." · round 2 at `1779d1a`

| Then item | Verdict | Evidence |
|---|---|---|
| Shown as original → proposed **before capture starts** (D8) | PASS | Turn 2's first assistant output is a text block: "Change to `script.md` (beat `done`): `On screen: Tick a task when it is done` → `On screen: Tick it off when done`". Only then come the `Edit` and `capture.mjs` (`transcript-excerpt.md`, "order of events"). |
| Applied | PASS | `web2video/todo-demo/script.md` line 11 reads "On screen: Tick it off when done", and the user's `ui-demo/script.md` is unchanged. `review.md`: the caption reads exactly that at 06–08 s, and the old wording is in no still. |
| No second gate | PASS | Turn 2 has no question and no AskUserQuestion. The text block, Edit and capture run back to back in one turn, with one capture call. |

**Notes:**
- **Take:** 19.3 s; `web`; 1280×720@30; probe PASS; 0 synth; 0 page errors.
- **D1:** turn 1 explored via `capture.mjs serve ui-demo` and killed it after.
- **D4:** the session's sheet included 0 s and the last frame, plus the full-size ends.
- **D7:** the hand-off says re-record rebuilds from the project's files.
