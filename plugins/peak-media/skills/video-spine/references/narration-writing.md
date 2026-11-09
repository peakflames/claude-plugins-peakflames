# Writing narration

How to write `script.md` so it sounds right when a TTS voice reads it, and how
to check a narrated spine before anyone hears it. Learned from a 4.5-minute,
13-slide voice-only deck video on a Gemini Flash Lite TTS voice.

## One paragraph per beat

| Kind of video | Beat | Spine |
| --- | --- | --- |
| Short UI demo, 15 to 40 s | One short line per action, spoken as written | A beat per action |
| Explainer or deck | One paragraph per scene or slide | A beat per scene; plates carry their own text |

A paragraph-length clip flows like a person talking; a string of one-line
clips sounds like a list being read. Captions that repeat a paragraph only
echo what the viewer is already hearing, so explainers usually run without
them.

## Write for the ear

- **Numbers as words** when they are spoken as a phrase: "twenty-three", "sixty-four".
- **Commands as they are said:** "slash deploy, staging", not `/deploy:staging`.
- **Names spelled for speech:** "the acme tools channel", not `#acme-tools`.
  Hyphenated product names read better as two capitalized words, so a
  listener hears a name and not a phrase.
- **Say what you point at.** "The install steps are right here on screen" with
  nothing read aloud leaves a cold viewer lost. Read the key part, or drop the line.
- **Short sentences, plain words.** Aim for grade 8 or lower; conversational
  connectors ("So,", "Now,", "Well,") keep a long paragraph moving.
- **Quotes and pauses come from punctuation.** The model shifts tone inside
  quotation marks and pauses at "...". CAPS do nothing.

## Delivery: style, tags, accent

- **`--style`** sets the whole run. A creator voice that worked:
  `"Dynamic, conversational, and energetic tone, characteristic of modern tech-focused creators."`
  A `Style:` line inside a beat overrides it for that clip only.
- **Mood tags** open a paragraph, or turn the mood mid-paragraph, and are
  performed, not read: `<Energetic and excited>`, `<Tone becomes informative>`,
  `<Confident>`, `<Thoughtful>`, `<Engaged>`, `<Animated>`, `<Warm>`, plus
  `<short pause>` and `<chuckle>`. Tags don't count toward the word budget.
- **Accent lives in `--style`, not the voice.** Replacing the style drops the
  accent. To keep one, append it: `"...creators. Speak with a British accent."`
- **Pick a voice by ear.** Run `scripts/sample-voice.mjs` on the opening
  paragraph with two or three voices before writing the rest.

## Budget the runtime

1. Sample one paragraph and read its rate from `sample-voice.mjs`
   (one voice with the creator style above ran about 178 wpm).
2. Words ≈ (target seconds − beats × padding) × wpm ÷ 60. The spine pads each
   beat with `--lead-ms` + `--tail-ms` (default 0.5 s). `spine --budget --wpm <n>`
   does the sum and counts the words already in `script.md`.
3. Short closing paragraphs run fast (about 240 wpm against 178). A tag
   such as `<Relaxed and warm, slowing down to wrap up>` brought one to
   about 205; sample it before the full take.
4. Over budget? Cut words; never ask for a trim of a longer script. A spine a
   little under the target is fine: each beat holds up to `--max-hold-ms` longer.

## Check the take

- **Tags performed, not read.** The spine prints wpm per clip and warns
  when one clip runs far slower than the rest. Steady rates (160 to 200 wpm)
  mean every tag was performed; a slow outlier usually read its tag aloud.
- **Cuts land in silence.** Every beat boundary sits in at least 400 ms of
  silence. Check it on the spine audio:

  ```bash
  check-cuts spine/narration.wav --cuts <beat startMs list> --min-silence-ms 400
  ```

- **A cold read.** Give only the script text to a fresh agent playing the
  intended viewer, and ask, beat by beat, what was unclear, what they would do
  next, and which lines sound like hype. It catches overclaims and unread
  on-screen references the author misses.

## Keep it reproducible

- The tagged text in `script.md` is the source of truth. A transcript with
  the tags stripped loses the delivery.
- A TTS voice reads a line differently on every new synthesis, so the text
  alone does not reproduce the audio. Keep `spine/manifest.json` and the
  exported clips (`spine/clips/`) with the video.
- To rebuild that exact audio later, copy the clips into the TTS cache
  (`~/.cache/peak-media/tts/`). The cache key is
  `sha256(model \0 voice \0 style \0 text)`, so the text, voice, style and
  model must match character for character.
