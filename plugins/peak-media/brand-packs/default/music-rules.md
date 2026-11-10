# Music rules — default pack

**No music ships with peak-media.** This pack has no audio files: no tracks, no stings, no SFX.
A video made with it is narration only unless you bring your own audio.

## Bringing your own track

- Use only tracks you have the right to use (your own, bought, or under a free licence that
  allows it — check the attribution and commercial-use terms).
- Put the track in the video project's `audio/` folder, not in the brand pack.
- Record the credit (title, artist, source URL, licence) in the project's `audio/CREDITS.md`, and
  in the video description if the licence asks for attribution. A pack that ships its own music
  points `brand.json` → `music.credits` at its credits file.

## Levels

| Stem | Target |
|------|--------|
| Narration | −16 LUFS integrated, true peak ≤ −1 dBTP |
| Music under narration | ducked well below the voice (start near −30 LUFS; duck while the voice speaks) |
| Music with no narration (gaps, outro) | may come up, but stays below the narration level |
| SFX | short and below narration; never on top of a spoken word |

## Picking a track

- Steady tempo, no lyrics, no busy lead melody — it sits under a voice.
- Fade in and out in silence, like the plate cuts (they land in the gaps between beats).
- Fade out by the end of the outro; the last frame is silent.
