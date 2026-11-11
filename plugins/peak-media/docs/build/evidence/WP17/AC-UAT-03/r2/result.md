# AC-UAT-03 r2 — result: PASS (new defects D9, D10)

**Case:** 3-slide deck · "Turn the deck in `./deck` into a narrated video for YouTube." · "approve" · then "3" (driver reply, see below) · real key · round 2 at `1779d1a`

| Then item | Verdict | Evidence |
|---|---|---|
| Given a valid key | PASS | `PEAK_MEDIA_OPENROUTER_API_KEY` was set. String match: the key is in no transcript or evidence file. |
| `sample-voice` and cold read before the gate | PASS | Turn 1 ran `sample-voice --voices Rasalgethi` (175 wpm, cached), then `spine --budget --wpm 157`, then an Agent cold read given only the script. The cold-read verdict is at the gate, and turn 1 ends with the gate. `spine.log` has the outputs. |
| Preset `youtube` | PASS | The gate and hand-off name `youtube` "because you said it's for YouTube". `probe.log`: every youtube encode check ok. |
| 1920×1080@30 | PASS | `probe.log`. |
| `check-take --expect-cuts 2` passes | PASS | `check-take.log`: 2 scene changes, silences 1363 ms and 1443 ms, PASS, exit 0. |
| Runtime within ±10 % of target | PASS | Video 21.93 s (spine 21.94 s) against a 20 s target: +9.7 %. |
| Words/pauses change proposed, not applied (D6) | PASS | Turn 2 ("approve") ran `spine --lead-ms 950`, which failed at 22.24 s (+11.2 %). The session then **stopped without changing anything** and proposed (1) target → 22 s, (2) trim the intro by three words, or (3) `--lead-ms 950 → 850` plus `wait(900) → wait(800)`, each as original → proposed. Turn 3 applied only option 3. |

**Driver reply:** the case script has only "approve"; no scripted answer exists for a runtime-miss proposal. The driver answered "3", which keeps the 20 s target so the ±10 % check stays meaningful. It reproduces round 1's padding change, this time with consent.

**Synth calls: 0 new.** The TTS cache held 54 files before and after the case. `sample-voice` was 1/1 cached, and both spine runs were 3/3 cached: the text, voice and style match round 1.

**Defects re-checked:**
- **D6 fixed:** the change was proposed, not silently applied, and the budget used 0.9 × wpm (157).
- **D5 fixed:** `contact-sheet --every 2s` succeeded on this file, with the last sample at 21.90 s.
- **D1 fixed:** `capture.mjs serve …/deck`, killed after.
- **D4:** the session's sheet included 0 s and `21940ms`, plus a full-size first/last-frame sheet.

**New:**
- **D9 (skill, step 5 budget):** the budget command uses default padding (3 × 500 ms), but a deck runs with `--lead-ms 950`. So a script reported "on budget" (49 vs 48 words) overruns by 2.24 s, as in round 1. Suggested fix: pass the deck's `--lead-ms` to `spine --budget`.
- **D10 (skill, gate wording):** the gate said "The voice is the only text track; no captions are drawn over the slides". The take drew captions, as narrated mode does by default (`review.md` item c). The hand-off disclosed the mismatch.
