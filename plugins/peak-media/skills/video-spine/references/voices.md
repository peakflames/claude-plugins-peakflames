# Narrator voices

`--tts-model` and `--voice` are checked before any network call. The source
of truth is `lib/tts/voices.mjs`; this page is for picking one. Compare
voices by ear with `scripts/sample-voice.mjs` on the same line and style:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/sample-voice.mjs" \
  --voices Achird,Kore,Puck --style "Clear, friendly, unhurried explainer tone." \
  --text "One paragraph from your script."
```

It writes `voice-samples/<voice>.wav` and prints words, seconds and wpm per
voice. Clips are cached, so a re-run is free.

## Models

| Model | Voices | Style (`--style`) |
| --- | --- | --- |
| `google/gemini-3.8-flash-lite-tts` (default) | Gemini | Sent as `instructions` |
| `google/gemini-3.8-flash-tts` | Gemini | Sent as `instructions` |
| `microsoft/mai-voice-2.1-flash` | MAI | Not sent |
| `microsoft/mai-voice-2.1` | MAI | Not sent |
| `fake/tone` | any name below | Ignored. Offline test tone, no key |

Real models need `PEAK_MEDIA_OPENROUTER_API_KEY` (an OpenRouter key; the
older `TTS_OPENROUTER_API_KEY` is read as a fallback). Requests go
to `POST https://openrouter.ai/api/v1/audio/speech` with
`response_format: "pcm"`. The raw 16-bit mono PCM (24 kHz) is wrapped in a
WAV header before it is cached.

**Data retention.** Every request sends `provider: { "zdr": true }`. Gemini's
only zero-retention endpoint keeps data for safety review, so the account
needs "Allow Safety Retention" turned on in OpenRouter's privacy settings.
Without it OpenRouter has no endpoint to route Gemini to and the request fails; use `--tts-model microsoft/mai-voice-2.1-flash`
instead.

## Gemini

Default `Rasalgethi`, with the house style "No-nonsense tech content creator. Plain, measured delivery: honest facts and conclusions only, no hype, no sales tone. Paced for learning." (it reads at about 127 wpm, so budget scripts at ~125–130 wpm, not 165). For a British accent, append "Speak with a British accent." to the style. On its own that can drift: in a 2026-11-08 test, Gemini dropped the accent on the one clip that opened with `<Matter-of-fact>`. Putting the accent in every mood tag (`<Matter-of-fact, British accent>`) as well as the style is the reliable form. Names match case-insensitively. Labels are Google's.

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
OpenRouter returned audio for it in an earlier probe.

Accent comes from `--style` rather than the voice, e.g. `"Speak with a
British accent."`, so pick a voice for its timbre. A new style without that
sentence drops the accent.

Mood tags such as `<Warm>` at the start of a paragraph, or mid-paragraph, are
performed, not read: they shape the delivery and are not counted as words (see
`narration-writing.md`). A tagged clip can run slower than the same words without
a tag, so expect some wpm spread across a script.

## MAI

Default `en-GB-Emily`. Pass the short ID; the plugin adds the model suffix
(`en-GB-Emily:MAI-Voice-2.1-Flash` for `mai-voice-2.1-flash`,
`:MAI-Voice-2.1` for `mai-voice-2.1`). A pasted full ID has its suffix
stripped. The voice's locale sets the language. OpenRouter reads SSML
aloud, so no styles are sent.

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

Other locales (Czech through Chinese) are accepted when the ID has the
`xx-YY-Name` shape, with a note that it is not in the built-in list. The
full table is Microsoft's "Managed voices and styles" at
https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-voices.

## Clip cache

Each clip is cached as `<sha256(model \0 voice \0 style \0 text)>.wav` in
`~/.cache/peak-media/tts/`. The older `~/.cache/web2video/tts/` and
`~/.cache/record-website-interaction/tts/` are also read (never written),
so archived clips still replay. A hit there is copied into the plugin cache.
Exported clips copied into an empty cache reproduce a run with no
synthesis.

## Testing knobs (environment)

| Variable | Effect |
| --- | --- |
| `PEAK_MEDIA_TTS_CACHE` | Cache dir instead of `~/.cache/peak-media/tts/` |
| `PEAK_MEDIA_TTS_LEGACY_DIRS` | Read-only cache dirs, `:`-separated (`;` on Windows). Empty = none |
| `PEAK_MEDIA_FAKE_SLOW` | `fake/tone` only: clip numbers to slow down, e.g. `2` or `2,5` |
| `PEAK_MEDIA_FAKE_SLOW_FACTOR` | How much slower those clips are (default `2`) |
| `PEAK_MEDIA_TTS_PCM_RATE` | Override the PCM sample rate assumed for OpenRouter audio (default 24000) |

`fake/tone` makes a 440 Hz, 48 kHz mono tone at 165 wpm of the clip's words
(mood tags don't count), at full level from the first sample. A slowed clip
is cached like any other, so use a separate `PEAK_MEDIA_TTS_CACHE` when you
slow one.
