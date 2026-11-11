# AC-UAT-09 — result: PASS

**Case:** Rough app · "Record clicking the Break button on `./rough-app`." · "approve"

| Then item | Verdict | Evidence |
|---|---|---|
| Report lists 1 page error with its `TypeError` line | PASS | `capture-report.log`: "page errors during take: 1 / TypeError: Cannot read properties of undefined (reading 'id')"; hand-off repeats it under Findings. |
| Manifest has it under `pageErrors` | PASS | `take-manifest.json`: `x-take.pageErrorCount` 1, `pageErrors` ["TypeError: Cannot read properties of undefined (reading 'id')"]. |

**Notes:** The key was handled at the gate ("approve" took the recommended hide). The session noticed its first take leaked the key on frame 0, discarded it, read `capture.mjs` source, and re-recorded through a `stage.html` wrapper plus an `app` symlink that hides the footer before first paint (`footer-frames-0-100ms.jpg`: clean from frame 0). This confirms D3. No step-9 stop happened, so the scripted "Continue" reply was not needed. Length 19.2 s, `web`, probe PASS, zero TTS.

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
