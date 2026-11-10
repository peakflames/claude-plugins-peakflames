# Writing narration

How to write text that sounds right when a TTS voice reads it, and how to
check a narrated take before anyone hears it. Learned from a 4.5-minute,
13-slide voice-only deck video on Gemini 3.8 Flash Lite (2026-10-27).

## Captions or voice only

| Kind of video | Beat | Storyboard |
| --- | --- | --- |
| Short UI demo, 15 to 40 s | One short caption per action, spoken as written | `say("Filter to just yours")` |
| Explainer or deck, minutes long | One paragraph per slide or scene, no captions | `say("", { narrate: paragraph })` plus `--no-captions` |

A paragraph-length clip flows like a person talking; a string of one-line
clips sounds like a list being read. Captions on a paragraph only repeat what
the viewer is already hearing, so drop them with `--no-captions`.

## Write for the ear

- **Numbers as words** when they are spoken as a phrase: "twenty-three", "sixty-four".
- **Commands as they are said:** "Slash peak workflow, new project", not `/peak-workflow:new-project`.
- **Names spelled for speech:** "the peak flames plugins channel", not `#peakflames-plugins`.
- **Say what you point at.** "The install steps are right here on screen" with
  nothing read aloud left a cold viewer lost. Read the key part, or drop the line.
- **Short sentences, plain words.** Aim for grade 8 or lower; conversational
  connectors ("So,", "Now,", "Well, I think") keep a long paragraph moving.
- **Quotes and pauses come from punctuation.** The model shifts tone inside
  quotation marks and pauses at "...". CAPS do nothing.

## Delivery: style, tags, accent

- **`--style`** sets the whole run. A creator voice that worked:
  `"Dynamic, conversational, and energetic tone, characteristic of modern tech-focused creators."`
- **Mood tags** open a paragraph, or turn the mood mid-paragraph, and are
  performed, not read: `<Energetic and excited>`, `<Tone becomes informative>`,
  `<Confident>`, `<Thoughtful>`, `<Engaged>`, `<Animated>`, `<Warm>`, plus
  `<short pause>` and `<chuckle>`.
- **Accent lives in `--style`, not the voice.** Replacing the style drops the
  accent. To keep one, append it: `"...creators. Speak with a British accent."`
- **Pick a voice by ear.** Run `scripts/sample-voice.mjs` on the opening
  paragraph with two or three voices before writing the rest.

## Budget the runtime

1. Sample one paragraph and read its rate from `sample-voice.mjs`
   (Rasalgethi with the creator style above: about 178 wpm).
2. Words ≈ target seconds × wpm ÷ 60, minus about 1.5 s per beat for the
   gaps between clips and slide moves.
3. Short closing paragraphs run fast (about 240 wpm against 178). A tag
   such as `<Relaxed and warm, slowing down to wrap up>` brought one to
   about 205; sample it before the full take.
4. Judge length only on a cached take. The first take pays 2 to 6 s per new
   clip: 5:37 cold against 4:30 cached for the same script.

## Check the take

- **Tags performed, not read.** The recorder prints wpm per clip and warns
  when one clip runs far slower than the rest. Steady rates (160 to 200 wpm
  here) mean every tag was performed.
- **Nothing changes mid-sentence.** Call `waitForVoice()` before every slide
  move or page change, then confirm each visual change sits in a silent gap:

  ```bash
  ffmpeg -i out.mp4 -af silencedetect=noise=-40dB:d=0.9 -f null - 2>&1 | grep -oE "silence_(start|end): [0-9.]+"
  ffmpeg -i out.mp4 -vf "select='gt(scene,0.02)',showinfo" -an -f null - 2>&1 | grep -oE "pts_time:[0-9.]+"
  ```

  A threshold of 0.02 catches moves between similar dark slides; 0.08 missed
  most of them. A single-frame hit mid-speech at an even multiple of the
  keyframe interval (5.12 s here) is the encoder, not a slide move.

- **A cold read.** Give only the transcript to a fresh agent playing the
  intended viewer, and ask what they would do next, what confused them, and
  which lines sound like hype. It caught two overclaims and an unread
  on-screen reference that the author missed.

## Keep it reproducible

- The tagged text is the source of truth. A transcript with the tags
  stripped loses the delivery.
- Gemini reads a line differently on every new synthesis, so the text alone
  does not reproduce the audio. Record the final take with
  `--manifest narration.json --export-clips clips/` and keep both with the video.
- To rebuild that exact audio later, copy the clips into
  `~/.cache/record-website-interaction/tts/`. The cache key is
  `sha256(model, voice, style, text)`, so the text, voice, style, and model
  must match character for character.

## Decks driven by a storyboard

```js
for (const { slide, paragraph } of SCRIPT) {
  await waitForVoice();                              // previous paragraph finishes first
  await wait(250);
  await page.evaluate((n) => window.deckGo(n), slide);
  await wait(900);                                   // let the slide land before speaking
  await say("", { narrate: paragraph });
}
await waitForVoice();
await wait(1800);
```
