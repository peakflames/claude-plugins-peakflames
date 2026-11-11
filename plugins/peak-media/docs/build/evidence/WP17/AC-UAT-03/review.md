# AC-UAT-03 — fresh reviewer verdict

Reviewer: fresh general-purpose subagent, given only `contact-sheet.jpg` (1 s sheet, 1280 px frames, 2 cols; made with `--at 0s..21s,21.7s`, see `contact-sheet.note.txt`) and the case's Then clause.

1 PASS: The three slides appear in order. Slide 1/3, "Water in the morning", runs from 00.00 to 06.00. Slide 2/3, "Less is lost", runs from 07.00 to 14.00. Slide 3/3, "Aim at the roots", runs from 15.00 to 21.70. That makes two slide changes. 15.00 catches a crossfade mid-way, with slide 2's "WHY MORNINGS" and "Dry leaves by noon" ghosting under slide 3. That is one transition, not an extra cut. Between those changes the slide content stays the same in every frame.

2 PASS: Every frame is fully drawn, with no blank or half-loaded slides. The only partial frame is the crossfade at 15.00. The title, eyebrow label, body lines and "n / 3" counter are all readable, and nothing is clipped or runs off the slide. The progress bar moves forward with each slide: about a third at 00–06, about two thirds at 07–14, full by 16+. One minor observation, not a defect: the content is small and sits in the upper-left of the frame, leaving most of the 16:9 canvas empty.

3 PASS: The captions are white text on a dark pill, centered just above the progress bar and well below the slide text, so they never cover it. They read "Water your garden in the morning" (01–06), "Less water lost, less mildew" (08–14) and "Water the roots deeply, then let the soil dry" (16–21). No caption shows at 00.00, 07.00, 15.00 or 21.70, which are the slide starts, the transition and the tail. That is consistent with gaps between narration lines.

4 PASS: I see no private data, only gardening text, the slide counter and the progress bar.

Overall: PASS on the visual items. I can't judge the rest of the Then clause from stills: that `sample-voice` and the cold read ran before the gate, the `youtube` preset, the exact 1920×1080@30 resolution and frame rate, and the `check-take --expect-cuts 2` result. Two slide changes are consistent with that check passing, but the 15.00 crossfade is something to confirm against how `check-take` detects cuts.
