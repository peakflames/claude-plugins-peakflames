# AC-UAT-06 — result: PASS

**Case:** To-do app · "Make a high-quality 60 fps recording of `./ui-demo` for editing later." · "approve"

| Then item | Verdict | Evidence |
|---|---|---|
| Preset `hifi` | PASS | Gate: "`hifi` … because you asked for high quality, 60 fps and editing later"; `probe.log` hifi checks (CRF 16) ok. |
| 1920×1080@60 | PASS | `probe.log`: 1920×1080, 60.000 fps; no fallback needed. |

**Notes:** Length 19.75 s, one gate, zero TTS. A first attempt was discarded: the driver had saved the transcript inside the session's working dir, the session read it, and then skipped the gate. The case was re-run in a clean dir with transcripts kept outside; the result above is the clean run (driver artefact, not a skill defect).

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
