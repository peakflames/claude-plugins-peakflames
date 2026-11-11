# Presets: destination → `--preset`

Pick the preset from where the user says the video is going. No destination named → `web`.
`--viewport WxH` and `--fps <n>` override the capture size and fps (the encode stays the
preset's); use them only when the user asks for a size or rate.

| The user says | Preset | You get |
|---|---|---|
| website, docs, help page, chat, email, a ticket, "small", nothing at all | `web` | 1280×720 @ 30 fps, H.264 CRF 26, AAC 128 kbps |
| YouTube, Vimeo, a video platform, "upload", a channel | `youtube` | 1920×1080 @ 30 fps, H.264 at YouTube's recommended settings, AAC 384 kbps |
| archive, editing later, "best quality", "60 fps", "master" | `hifi` | 1920×1080 @ 60 fps, H.264 CRF 16 (x264 slow), AAC 256 kbps |

All three are H.264 High, yuv420p, faststart MP4 with an AAC-LC 48 kHz stereo track (silent in
captions and silent modes). Two destinations in one request → pick for the stricter one and say
which at the gate.

## What to say at hand-off

State the preset and one reason tied to the user's own words, e.g. "Preset `web` (1280×720,
30 fps): you said it's for the product website, so it's kept small and plays inline." Then, if
it applies:

- **`youtube` file sizes look small.** The encoder targets YouTube's 8 Mbps (12 Mbps above
  30 fps) but a screen recording needs far fewer bits, so it often comes out under 1 Mbps. That
  is expected; probe-spec checks the encoder settings, not the measured bitrate. Say: "It's
  encoded to YouTube's recommended settings; screen recordings compress well, so the file is
  smaller than a camera video would be."
- **The audio measures under the preset's bitrate.** AAC on a silent or speech-only track never
  fills 384/256/128 kbps. Expected; the preset bitrate is a ceiling.
- **`youtube` and voice at 0 ms.** The `youtube` file has no edit lists, so a voice clip at 0 ms
  loses its first ~21 ms. The spine's default 250 ms lead-in avoids it; keep `--lead-ms` ≥ 200.
- **`hifi` is 60 fps.** If the report shows another rate, state the rate it actually is, plainly.
- **An override was used** (`--viewport`, `--fps`): name it, e.g. "1920×1080 at 30 fps on the
  `web` encode, as you asked".

## Size limits

Capture enforces no size cap. When the user names a destination with a known attachment or
upload limit, compare the reported size with it and say whether it fits. If it doesn't, offer a
shorter runtime or the `web` preset; never re-encode outside `capture`.
