# AC-UAT-02 — result: FAIL

**Case:** To-do app · "Record a silent tour of `./ui-demo`, no captions, nothing on screen but the app." · "approve"

| Then item | Verdict | Evidence |
|---|---|---|
| `--no-captions` | PASS | Capture command and take `command[]` carry `--no-captions`; manifest has 0 captions. |
| No caption in any still | PASS | Reviewer item 1: no caption or overlay in any of the 21 stills. |
| Cursor still visible | FAIL | The session added `--no-cursor`, reading "nothing on screen but the app" as no pointer (gate: "I read … as also dropping the pointer"; it offered "Keep the cursor" as option 2). "approve" took the plan as shown, so the take has no cursor (`command[]` ends `--no-captions --no-cursor`). Reviewer item 2 could not see one either. Defect D2. |
| Silent AAC track | PASS | `probe.log`: AAC-LC 48 kHz stereo, 2 kbps; ffmpeg volumedetect mean/max −91.0 dB. |

**Notes:** Length 20.4 s, 1280×720@30, preset `web`, one gate, zero TTS. Exploration spent ~8 tool calls getting a local server up after the file:// block (D1).

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
