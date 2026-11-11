# AC-UAT-07 — fresh reviewer verdict

Reviewer: fresh general-purpose subagent, given only `contact-sheet.jpg` (1 s sheet, 1280 px frames, 2 cols) and the case's Then clause.

1 PASS — All 20 frames (00.00–19.00) show the fully drawn app. None are blank, half-loaded or clipped. The state changes are consistent from frame to frame: empty list at 00, typing "C" at 01, two tasks at 02, "Buy milk" ticked at 06, Active filter at 10, Done filter at 12, "Nothing here." after Clear done at 15, back to All at 17. One minor point: the app card fills only about a quarter of the frame and the rest is empty grey. That is acceptable for a chat demo.

2 PASS — The captions are white on a dark pill, sit low in the frame below the card, and never cover the app. They are legible even on the downscaled sheet. The cursor is visible on every click: on the input at 01 (with a click ring), 02 and 04, the "Buy milk" checkbox at 05–09, Active at 10–11, Done at 12–14, Clear done at 15–16, and All at 17–19. Two small points. Frame 00 has no caption, and 19 has no caption either, so the video ends without one. At 17–18 the caption still reads "Clear done tasks to tidy up" while the click is on All. Neither affects the result. The sheet is about 2.8x downscaled, so the small filter-button labels are only just readable, but the cursor positions are clear.

3 PASS — No private data. The only content is the "Tasks" app with the dummy tasks "Buy milk" and "Call the plumber". There is no browser chrome, URL bar, tabs, desktop, notifications or account names in any frame from 00 to 19.

Overall: PASS. The stills show a clean, captioned demo with a visible cursor and no private data, fit to post in a team chat. The Then-clause items (preset, hand-off wording, no upload or post command) still need checking against the transcript.
