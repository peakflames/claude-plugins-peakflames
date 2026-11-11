# AC-UAT-06 — fresh reviewer verdict

Reviewer: fresh general-purpose subagent, given only `contact-sheet.jpg` (1 s sheet, 1280 px frames, 2 cols) and the case's Then clause.

1 PASS — All 21 frames (00.00–19.73) show the fully rendered "Tasks" card. None are blank, half-loaded, torn or clipped. The story runs in order: empty list "No tasks yet" (00), typing and adding "Buy milk" and "Call the plumber" (01–04), ticking "Buy milk" (05–09), the Active filter (10–12), the Done filter (13–14), Clear done giving "Nothing here." (15–16), and back to All with only "Call the plumber" left (17–19.73). The counter matches each step (0 left, 1 left, 2 left, 1 left). The black last cell only pads the empty grid slot. One side note: the app card fills only about a third of the frame width, so the UI text is small even at full resolution. That's a framing issue, not a capture defect.

2 PASS — The captions ("Type a task and press Enter", "Tick a task when it is done", "Filters show what is left, or done", "Clear done tasks to tidy up") are readable even at this scale. They sit near the bottom of the frame, well below the card, so they never cover the action. 00.00 and 19.73 have no caption. A cursor is visible at each interaction: in the input (01–04), on the "Buy milk" checkbox (05–09), on Active (10–11), on Done (12–14), on Clear done (15–16) and on All (17–19.73). The sheet is too small to judge how crisp the cursor is.

3 PASS — The only data on screen is placeholder to-do text ("Buy milk", "Call the plumber") on a plain grey background. There are no names, emails, URLs, browser chrome or desktop parts.

Overall: PASS on all three stills-based items; resolution, fps and the `hifi` preset still need to be measured separately.
