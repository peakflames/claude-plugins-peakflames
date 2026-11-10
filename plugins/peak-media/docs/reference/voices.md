# Narrator voices

`--voice` is checked against these lists before a browser opens. The source
of truth is `scripts/voices.mjs`; this page is for picking one.

## Gemini (`google/gemini-3.8-flash-lite-tts`, `google/gemini-3.8-flash-tts`)

Default `Achird`. Names match case-insensitively. Labels are Google's.

| Voice | Label | Voice | Label | Voice | Label |
| --- | --- | --- | --- | --- | --- |
| Achernar | Soft | Callirrhoe | Easy-going | Pulcherrima | Forward |
| Achird | Friendly | Charon | Informative | Puck | Upbeat |
| Algenib | Gravelly | Despina | Smooth | Rasalgethi | Informative |
| Algieba | Smooth | Enceladus | Breathy | Sadachbia | Lively |
| Alnilam | Firm | Erinome | Clear | Sadaltager | Knowledgeable |
| Aoede | Breezy | Fenrir | Excitable | Schedar | Even |
| Autonoe | Bright | Gacrux | Mature | Sulafat | Warm |
| Iapetus | Clear | Kore | Firm | Umbriel | Easy-going |
| Laomedeia | Upbeat | Leda | Youthful | Vindemiatrix | Gentle |
| Orus | Firm | Zephyr | Bright | Zubenelgenubi | Casual |

`Lumi` is also accepted. It is not in Google's published list, but
OpenRouter returns audio for it while a made-up name gets HTTP 400 (probed
2026-10-27).

Accent comes from `--style` rather than the voice, e.g. `"Speak with a
British accent."`, so pick a voice for its timbre. A new style without that
sentence drops the accent. Compare voices by ear with
`scripts/sample-voice.mjs` on the same line and style.

## MAI (`microsoft/mai-voice-2.1-flash`, `microsoft/mai-voice-2.1`)

Default `en-GB-Emily`. Pass the short ID; the recorder adds the model suffix.
Microsoft lists named styles per voice, but OpenRouter reads SSML aloud, so
the recorder sends none of them.

| Voice | Locale | Gender |
| --- | --- | --- |
| `en-AU-Isla` | English (Australia) | Female |
| `en-GB-Emily` | English (United Kingdom) | Female |
| `en-GB-Harry` | English (United Kingdom) | Male |
| `en-IN-Dhruv` | English (India) | Male |
| `en-IN-Priya` | English (India) | Female |
| `en-US-Ethan` | English (United States) | Male |
| `en-US-Grant` | English (United States) | Male |
| `en-US-Harper` | English (United States) | Female |
| `en-US-Iris` | English (United States) | Female |
| `en-US-Jasper` | English (United States) | Male |
| `en-US-Olivia` | English (United States) | Female |
| `en-US-Sage` | English (United States) | Male |

The other 85 voices cover 22 more locales (Czech through Chinese). The full
table is Microsoft's "Managed voices and styles" at
https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-voices
(updated 2026-10-01).
