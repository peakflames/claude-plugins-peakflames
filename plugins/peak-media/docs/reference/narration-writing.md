# Writing narration

How to write text that sounds right when a TTS voice reads it, and how to
check a narrated take before anyone hears it. Learned from a 4.5-minute,
13-slide voice-only deck video on Gemini 3.8 Flash Lite (2026-10-27).

## Captions or voice only

The words live in `script.md`, one `## <beat-id>` section per beat: the
paragraph is spoken, and the `On screen:` line (else the first sentence) is the
caption. The storyboard only names the beat: `beat('filter', fn)`.

| Kind of video | `script.md` beat | Capture |
| --- | --- | --- |
| Short UI demo, 15 to 40 s | One short sentence per action; `On screen:` the same words | `--spine spine/manifest.json` |
| Explainer or deck, minutes long | One paragraph per slide or scene | `--spine spine/manifest.json --no-captions` |

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

- **Tags performed, not read.** `spine` prints wpm per clip. Steady rates
  (160 to 200 wpm here) mean every tag was performed; one clip far slower
  than the rest read its tag aloud.
- **Nothing changes mid-sentence.** Make every slide move or page change
  between two `beat()` calls, never inside a beat's `fn`: between beats is the
  silence between clips. Then check the take:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/check-take.mjs" out.mp4 --expect-cuts <slides − 1>
  ```

  It fails any scene change outside a silence of at least 900 ms and lists its
  timecode. Its default threshold, 0.02, catches moves between similar dark
  slides; 0.08 missed most of them. Captions and the cursor are not counted.

- **A cold read.** Give only the transcript to a fresh agent playing the
  intended viewer, and ask what they would do next, what confused them, and
  which lines sound like hype. It caught two overclaims and an unread
  on-screen reference that the author missed.

## Keep it reproducible

- The tagged text is the source of truth. A transcript with the tags
  stripped loses the delivery.
- Gemini reads a line differently on every new synthesis, so the text alone
  does not reproduce the audio. Keep the spine folder (`manifest.json` and
  `clips/`) with the video; capture plays those clips, never a new synthesis.
- To rebuild that exact audio later, copy the clips into the TTS cache
  (`$PEAK_MEDIA_TTS_CACHE`, else `~/.cache/peak-media/tts/`). The cache key is
  `sha256(model, voice, style, text)`, so the text, voice, style, and model
  must match character for character.

## Decks driven by a storyboard

One `## <beat-id>` per slide in `script.md`, and one `beat()` per slide in the
storyboard. The slide changes between beats, so it lands in the silence:

```js
const SLIDES = ['intro', 'why', 'how'];

export default async function storyboard({ beat, page, wait }) {
  for (const [n, id] of SLIDES.entries()) {
    if (n) await wait(250);                           // let the last word ring out
    await page.evaluate((i) => window.deckGo(i), n); // between beats: lands in silence
    await wait(900);                                  // let the slide settle before the voice
    await beat(id);                                   // no fn: the slide is the picture
  }
}
```

Build its spine with `--lead-ms 950` so each clip starts after the slide has
settled.
