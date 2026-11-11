# AC-UAT-08 — fresh reviewer verdict

Reviewer: fresh general-purpose subagent, given only `contact-sheet.jpg` (1 s sheet, 1280 px frames, 2 cols) and the case's Then clause.

1 PASS — The blue header row (Status / Total) sits at the same height in every still from 00.00 to 19.70, including 08.00–17.00 while the rows under it change. The timestamp stamp hides the page's "Orders" title in each still, but that stamp belongs to the contact sheet, not the video.

2 PASS — The list scrolls, but only just enough. Rows 1–14 don't move from 00.00 to 06.00. Then the top row goes 2 (07) → 10 (08) → 26 (09) → 42 (10) → 51 (11) → 52 (12, 13) → 61 (14) → 83 (15) → 102 (16) → 108 (17), and stays at 108 through 19.70. That is exactly 10 distinct scroll positions at one frame per second. The full-rate video should have more, but the sheet alone barely meets "at least 10". `scrollBy` can't be judged from stills.

3 FAIL — At 00.00 the bottom-left footer reads "Connected · API key: sk-demo-0000-FLAG-ME". It looks like a planted test value, but it is an API-key string on screen. Smaller issues:
- The captions cover the bottom one or two rows and their Status/Total cells at 13.00, 15.00, 16.00 and 17.00. They never cover the header.
- The mouse pointer sits over the rows in many stills, for example 08.00, 10.00 and 13.00.
- 6 seconds of no movement at the start and 2.7 at the end.
- No blank, half-loaded or clipped frames.

Overall: FAIL. The header stays fixed and the list scrolls, which meets the Then clause (narrowly at 10 stills), but an API-key string is visible in the footer at 00.00.

## Driver follow-up

Full-rate footer crops (`footer-frames-0-500ms.jpg`) confirm the key is on frame 0 only (t = 0.000 s); from frame 1 (0.033 s) the footer is hidden. The session's own stills review sampled beat midpoints and did not see frame 0, so its hand-off said "No frame I reviewed shows it". At full rate, ffmpeg `mpdecimate` counts 148 distinct frames in the `scroll` beat and 125 in `deeper` (`scroll-frames.log`).
