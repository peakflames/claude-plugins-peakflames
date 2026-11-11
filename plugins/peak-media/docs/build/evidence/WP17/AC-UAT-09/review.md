# AC-UAT-09 — fresh reviewer verdict

Reviewer: fresh general-purpose subagent, given only `contact-sheet.jpg` (1 s sheet, 1280 px frames, 2 cols) and the case's Then clause.

1. **PASS** — At 01.00 the cursor is near the top centre and at 02.00 it is mid-page. From 03.00 to 12.00 it sits on the orange Break button at top right, and "Click the Break button" is captioned from 07.00 to 12.00. At 13.00 the cursor has moved off to the table header and the caption becomes "Nothing changes on screen; the click throws a TypeError". The click itself can't be seen, since by design nothing changes on screen; it is inferred from the cursor resting on the button followed by the result caption.
2. **PASS** — Captions are short, high-contrast and readable even downscaled. They sit at the bottom centre over rows 13–14 (Mug and Headset), so they partly hide those rows' Item/Status text but never the Break button. 00.00 and 19.00 have no caption, which is fine for the first and last frame. All 20 frames show the fully loaded Orders table with no blank, half-loaded or clipped frames. The contact sheet's own time stamps cover the "Orders" heading and the "Item" column header, but that is the review overlay, not the video.
3. **PASS (limited by downscaling)** — No footer, banner, URL bar or corner text is visible in any frame, from 00.00 to 19.00. The only content is order rows 1–14 (item, status, total) and the Break button. The sheet is about 2.8× downscaled, so very small text could be missed, but no text-like strings appear in the corners or below the table.

Overall: **PASS** — the cursor reaches Break, the captions describe the click and its silent TypeError, and nothing private is visible. The `pageErrors` and report check still has to be confirmed from the logs.

Driver follow-up: full-rate footer crops of frames 0–3 (`footer-frames-0-100ms.jpg`) show no key from frame 0 (the session loaded the app through a `stage.html` wrapper that hides the footer before first paint).
