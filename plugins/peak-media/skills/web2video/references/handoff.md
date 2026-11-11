# Hand-off

web2video ends at the file. Report it, answer questions about it, and stop.

## Before you hand off

- The length is within ±10 % of the runtime target; probe-spec passed (and check-take, if narrated).
- You Read the contact sheet (first frame, one still per beat, last frame) and the full-size
  first and last frames.
- Every private-data finding has the user's decision, and it was carried out.

## Report template

Fill every line from the capture report and `out/<slug>.take.json`; leave none out.

```
Your video is ready: web2video/<slug>/out/<slug>.mp4

- Size: <MB> · <W>×<H> @ <fps> fps · <duration> s · H.264 + AAC (MP4)
- Preset: <p> — <one reason tied to the destination the user named>
- Mode: <captions | silent | narrated (voice <v>)>
- Beats: <id start–end s · …>
- Checks: probe-spec <PASS>; check-take <PASS | n/a (no voice)>; stills reviewed (review/<slug>.jpg: <the times read, first and last frames included>)
- Findings: <page errors (first lines), late beats, private data and what was done — or "none">
- Re-record: ask to re-record web2video/<slug>/ (the take is rebuilt from the project's files, so the folder can be moved)
```

Then, if a session file was made: offer to delete it (`login.md`). If a destination size limit
applies, add whether the file fits (`presets.md`).

For music, a branded intro/outro or motion graphics, point to `/peak-media:plate-factory`.

## The file stays on disk

The skill's last action is the report. Uploading, posting, attaching, emailing or messaging the
file, and any sharing CLI or API (`gh`, `curl` uploads, `scp`, chat or cloud CLIs), are outside
this skill, even when the user asks in the same session ("send it to the team chat").

Answer such a request with the path and format, and say the user can attach or upload it
themselves: "It's at `web2video/<slug>/out/<slug>.mp4` (MP4, H.264, <MB>). I don't upload or send
videos; drag it into <the destination> to share it."
