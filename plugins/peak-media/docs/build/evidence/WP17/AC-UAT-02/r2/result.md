# AC-UAT-02 r2 — result: PASS

**Case:** To-do app · "Record a silent tour of `./ui-demo`, no captions, nothing on screen but the app." · "approve" · round 2 at `1779d1a`

| Then item | Verdict | Evidence |
|---|---|---|
| `--no-captions` | PASS | The turn-2 capture command ends `--preset web --no-captions` with no `--no-cursor`. The take `command[]` is the same, and the manifest has 0 captions (`probe.log`). |
| No caption in any still | PASS | `review.md` item 1: none of the 10 stills has a caption or overlay. |
| Cursor still visible | PASS | The take manifest has `"cursor": true`. `review.md` item 2: the pointer is visible in 9 of 10 stills, on every click and typing moment. The gate said "the pointer stays visible … I read 'nothing on screen but the app' as no captions" and offered `--no-cursor` only as an option (D2 fixed). |
| Silent AAC track | PASS | `probe.log`: AAC-LC 48 kHz stereo, about 2 kbps; volumedetect mean/max −91.0 dB. |

**Defects re-checked:**
- **D2 fixed** (see above).
- **D1 fixed:** exploration used `capture.mjs serve …/ui-demo` (one call, read the URL from the background output, `kill <pid>` after). It needed no improvised server and hit no `file://` attempt.
- **D4:** the session's own sheet used `--at 0s,…,${videoMs}ms`, plus a full-size first/last-frame sheet.
- **D7:** the hand-off says re-record rebuilds from the project's files.

**Notes:** 19.0 s; 1280×720@30; `web`; probe PASS; one gate (capture runs only in turn 2); 0 synth calls; 0 page errors. No server or browser was left running after the case.
