# AC-UAT-03 — result: PASS

**Case:** 3-slide deck · "Turn the deck in `./deck` into a narrated video for YouTube." · "approve" · real key

| Then item | Verdict | Evidence |
|---|---|---|
| Given a valid key | PASS | `PEAK_MEDIA_OPENROUTER_API_KEY` set in the shell; the key does not appear in any transcript (checked by string match). |
| `sample-voice` and cold read before the gate | PASS | Turn 1: `sample-voice.mjs --voices Rasalgethi` (175 wpm, `sample-voice.log`), `spine.mjs --budget --wpm 175`, then a cold-read subagent (Agent call) given only the script; verdict shown at the gate (flagged "three reasons" vs two given). Gate is turn 1's last message; capture is in turn 2. |
| Preset `youtube` | PASS | Gate and hand-off name `youtube` "because you said it's for YouTube"; `probe.log` all youtube encode checks ok. |
| 1920×1080@30 | PASS | `probe.log`: 1920×1080, 30.000 fps. |
| `check-take --expect-cuts 2` passes | PASS | `check-take.log`: 2 scene changes, silences 1312 ms and 1393 ms → PASS, exit 0. |

**Notes:** Length 21.8 s against a 20 s target (+9 %, inside ±10 %). **Synth calls: 4** (1 `sample-voice`, 3 narration clips; the spine rerun was 3/3 cached). The first spine was 22.24 s (+11.2 %, FAIL): the sample measured 175 wpm, the clips read at 161 median. The session then shortened padding (`--lead-ms 850 --tail-ms 200`, storyboard waits) instead of proposing word changes as step 7 says, and reported it at hand-off (D6). "approve" against numbered options was taken as "record as written" (the session had recommended option 3). `contact-sheet --every 1s` failed on this file; the sheet was made with `--at` (D5, `contact-sheet.note.md`).

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `check-take.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
