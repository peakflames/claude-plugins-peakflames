# AC-UAT-08 r2 — result: PASS (privacy defects D3/D4 fixed)

**Case:** Rough app · "Show the sticky header on `./rough-app` staying put while the list scrolls." · "approve" · round 2 at `1779d1a`

| Then item | Verdict | Evidence |
|---|---|---|
| `scrollBy` used | PASS | `storyboard.mjs` (in `scroll-frames.log`): `scrollBy('#rows', { y: 1400, ms: 2600 })` and `scrollBy('#rows', { y: 1800, ms: 2600 })`. |
| ≥ 10 distinct frames of scrolling | PASS | `scroll-frames.log`: mpdecimate finds 167 distinct frames in the `scroll` beat (78 and 66 in the two scroll windows); control hold: 1. |
| Header fixed across the stills | PASS | `review.md` item 1: the header bar sits in the same place in all 11 stills while rows 1 → 95 pass under it. |
| Key `sk-demo-0000-FLAG-ME` in no frame, incl. 0 s and last (D3/D4) | PASS | The storyboard uses `export const hide = ['footer']` (D3's pre-t0 hook). The driver extracted frame 0 and the last frame (n = 597) at 1280×720 and read both: the footer area is empty (`frames-0-last.jpg`). An all-frames scan of the footer-text region found 0 / 598 frames with text; the round-1 take flags exactly frame 0 (`privacy-frames.log`). `review.md` item 3: no key in any still or in the first/last frames. |
| `capture.mjs serve` for exploration (D1) | PASS | Turn 1 call [8]: `capture.mjs serve …/rough-app`. The session read the URL from the background output, explored at `http://127.0.0.1:52917/`, then ran `playwright-cli close; kill <pid>`. No `file://` attempt, no `python3 -m http.server`, no hand-written node server. |

**Notes:**
- **Gate:** it named the key and offered hide / crop / clean data / leave; "approve" took hide.
- **Privacy stop:** none came at step 9, because nothing was visible, so the scripted "Continue — it's a fake demo key." was not needed.
- **D4 in the session:** its own sheet was `--at 0s,…,19900ms`, plus a full-size first/last-frame sheet, and the hand-off names the frames read.
- **Take:** 19.9 s; `web`; probe PASS; 0 synth; 0 page errors.
- **Pacing:** about 60 % of the runtime is static holds (0–6.5 s and 13.2–19.6 s). This is a pacing nit, not a Then item.
