# AC-UAT-04 — result: PASS

**Case:** 3-slide deck · same prompt as AC-UAT-03, run with `PEAK_MEDIA_OPENROUTER_API_KEY=` and `TTS_OPENROUTER_API_KEY=` empty

| Then item | Verdict | Evidence |
|---|---|---|
| One-line message naming `PEAK_MEDIA_OPENROUTER_API_KEY`, or offer to continue with captions | PASS | `sample-voice` exited 3 naming the variable (`sample-voice.log`); the reply opens "Narration is blocked: `PEAK_MEDIA_OPENROUTER_API_KEY` isn't set", gives the one-line `export …` instruction, and offers captions mode. (The whole reply is several short paragraphs, not a single line.) |
| No browser launched | PASS | No `playwright-cli` or `capture.mjs` call in the transcript; no `web2video/` folder written. |

**Notes:** Zero synth calls. One turn; the session stopped and waited, as step 2 says.

Evidence in this folder: `transcript-excerpt.md`, plus any case-specific logs listed above.
