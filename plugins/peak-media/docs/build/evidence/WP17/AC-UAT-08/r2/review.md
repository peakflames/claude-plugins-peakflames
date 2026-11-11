# AC-UAT-08 r2 — fresh reviewer

Reviewer: a fresh general-purpose subagent, given only the paths to `contact-sheet.jpg` (11 stills, 0–18 s every 2 s plus 19.90 s) and `frames-0-last.jpg` (frame 0 and the last frame at full size), the Then clause, and the footer-key privacy check. It made two Read calls and no others.

1. **Header fixed: PASS.** The "Orders" title, the blue `# / Item / Status / Total` bar and the Break button sit at the same position in every still. Rows per still:

   | Still | Rows |
   |---|---|
   | 00–06 | 1–14 |
   | 08 | 13–26 |
   | 10 | about 36–49 |
   | 12 | 76–89 |
   | 14–19.90 | 82–95 |

   Row 82 is partly tucked under the header.
2. **Scrolling evident: PASS.** There are 5 distinct positions between 6 and 14 s. The reviewer could not confirm the 10-frame count or `scrollBy` from stills; see `scroll-frames.log`.
3. **API key / footer text: none visible** in any still, nor in frame 0 or the last frame. The last frame shows only blank background below the table.
4. **Other:**
   - 0–6 s and 14–19.9 s are static holds (the cursor points at the header), about 60 % of the runtime.
   - Captions cover some bottom-row cells (cosmetic).
   - The cursor is visible in most frames.
