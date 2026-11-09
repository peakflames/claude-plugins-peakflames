---
name: video-assemble
description: |
  Assembly for a plate-factory video: composites the rendered plates onto the spine at their
  timecodes into a review MP4, checks that every plate cut lands in a silent gap, remuxes
  music and SFX stems under the narration without re-encoding the picture, appends the brand
  outro and exports out/final.mp4 (source size or 1080p60).
  Triggers on: "assemble the video", "composite the plates", "make the review cut",
  "add the music", "add sound effects", "music pass", "SFX pass", "export the final video",
  "export 1080p60".
---

# video-assemble

Stages 7–9 of the plate factory: **composite → music, then SFX → export**. Input is a video
project folder (see the layout below) whose plates are already rendered. Two entry points:

- `node "${CLAUDE_PLUGIN_ROOT}/skills/video-assemble/scripts/assemble.mjs" <project>` — the whole stage.
- `node "${CLAUDE_PLUGIN_ROOT}/skills/video-assemble/scripts/remux-audio.mjs" <video.mp4> -o <out.mp4> --music … --sfx …` — one audio pass on a rendered MP4.

Run either with `--help` for every flag. Expected failures are one line naming the fix.

## Project layout it reads and writes

```
<video>/
  plates.json                 # fps, width, height, spine, brand, plates[] (v1 contract)
  spine/manifest.json         # narration spine (+ spine/narration.wav), or spine/beatgrid.json
  renders/plates/<id>.mp4     # one render per plate, exactly durationMs, plates.json size
  audio/music.wav  audio/sfx.wav   # optional stems, timeline-aligned from 0
  review/review.mp4           # written: plates on the spine, narration at -16 LUFS
  review/review-mix.mp4       # written when stems are given (picture copied from review.mp4)
  review/assemble.json        # written: cuts, levels, outro, final spec checks
  renders/outro-<key>.mp4     # written: cached brand outro render
  out/final.mp4               # written: spine + outro, delivery spec checked
```

## Steps

1. **Check the inputs.** `assemble` validates `plates.json`, the spine and the brand pack, then
   every `renders/plates/<id>.mp4`: it must exist, match the plates.json size, and last
   `durationMs` ±1 frame. A failure names the plate; re-render only that plate.
2. **Composite (stage 7).** Run `assemble <project>` with no stems first. It writes
   `review/review.mp4` with the narration at −16 LUFS (a beat grid gets a silent AAC track),
   then runs `check-cuts --min-silence-ms 300` at every plate boundary (DEC-13). If a cut is
   not in silence it exits 1 with the timecode, e.g. `cut not in a ≥300 ms silence at 0:06.500
   (p1-hook|p2-table: …)`. Fix the timing at the source — re-time that spine beat or move the
   plate boundary into the gap — never by trimming audio here.
3. **Review the picture.** Make a contact sheet of `review/review.mp4`
   (`lib/verify/contact-sheet.mjs --every 1s`) and Read it.
4. **Music pass, then SFX pass (stage 8).** Audio never forces a re-render. Each pass starts
   from the narration-only `review/review.mp4` and is a remux (video stream copied, md5
   unchanged):
   ```
   remux-audio review/review.mp4 --music audio/music.wav -o review/review-music.mp4
   remux-audio review/review.mp4 --music audio/music.wav --sfx audio/sfx.wav -o review/review-mix.mp4 --levels review/levels.json
   ```
   Levels (the same flags on `assemble`):

   | Flag | Default | Meaning |
   |---|---|---|
   | `--narration-lufs` | −16 | narration loudness (always levelled; never time-stretched) |
   | `--music-lufs` | −28 | music loudness **under the voice**, about 12 dB below the narration: audible without competing |
   | `--duck-db` | 6 | how much louder the music is between lines than under the voice (it ducks 150 ms before each line and recovers over 350 ms; pauses under 500 ms stay ducked). `--no-duck` = 0 |
   | `--sfx-lufs` | −20 | loudness of each SFX hit (silence between hits does not count) |
   | `--sfx-db` | 0 | extra trim on the SFX stem after `--sfx-lufs` |

   A true-peak limiter at −1.5 dBFS guards the mix. The levels report gives each stem's
   LUFS, the mix LUFS and true peak, and the measured music level under the voice
   (`belowVoiceDb`, expect about 12). If the music fights the voice, lower `--music-lufs`;
   if it swells too much between lines, lower `--duck-db`. The user listens and approves the levels — that
   is the stage-8 gate; don't skip it.
   `remux-audio` refuses an already-mixed MP4 as the narration source (pass `--narration`
   if you really mean it).
5. **Export (stage 9).** `assemble <project> --music audio/music.wav --sfx audio/sfx.wav
   [--export 1080p60]` repeats the cut check, remuxes the stems, appends the brand outro
   (rendered once with HyperFrames and cached by the pack's bytes; `--rerender-outro`
   forces it, `--outro <mp4>` supplies one) and writes `out/final.mp4`. It is checked with
   `probe-spec`: H.264 High, yuv420p, AAC 48 kHz, faststart, the export size and fps, and
   duration = spine `totalMs` + outro `durationMs` ±1 frame.
   The outro is rendered at the export fps. `--export 1080p60` from plates rendered below
   60 fps (F1 is 30) scales and **duplicates frames**: the file is 60 fps but plate motion
   stays 30 fps, and assemble prints a `note` saying so. For true 60 fps motion set `"fps": 60`
   in plates.json and re-render the plates (`render-plate` renders at plates.json fps).
6. **Final contact sheet.** Sheet `out/final.mp4` and Read it: the last frames must show the
   brand outro.

## Rules

- Music is optional: with no `--music`/`--sfx` the final carries narration only.
- Stems are files the user supplies or makes; the plugin ships no music. Respect the brand
  pack's `music-rules.md` for what to pick and its levels.
- Never edit a plate render to fix a cut. Every fix names a plate or a spine beat.
- The brand outro is rendered exactly like a plate: its `index.html` is copied to the top of
  a temp dir, the whole brand pack to `<dir>/brand/`, and the locally installed GSAP to
  `<dir>/vendor/gsap.min.js` (DEC-09). So an outro loads `brand/tokens.css`,
  `brand/logo.svg`, `brand/fonts/…` and `vendor/gsap.min.js` — never `../` paths or a CDN.
- Each run deletes the old `out/final.mp4` first, so a failed run never leaves a stale final.
