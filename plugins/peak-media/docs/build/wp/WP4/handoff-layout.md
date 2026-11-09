builder-id: builder-wp4l-eb96f9ca

# WP4 follow-up: plate layout polish

Branch `feature/peak-media-wp4-layout`, built on `feature/new-peak-media-plugin` at `f503621`.
This is a template-only change. The plates.json contract, `lib/`, schemas, acceptance.md and decisions.md are unchanged.

## What the user flagged, and what changed

| # | Issue (Lead's F1 contact sheet) | Fix | File |
|---|---|---|---|
| 1 | Motion plates sat top-left and left most of the frame empty | The block is set as large as the safe area allows (up to 80% × 66% of the frame), centred both ways. After fitting it shrinks to its widest row, so the composition centres on the text rather than on an empty box. | `templates/motion/index.html` |
| 1 | Hierarchy | The last line is the emphasis: accent colour at full size. Earlier lines are set at 0.72× in the foreground colour. | same |
| 2 | Close text was small because the block was sized to its longest line | Each line may wrap onto two balanced rows (`text-wrap: balance`) before the type shrinks. In pass 1, earlier lines stay ≥ 7.8% of the height (56 px at 720p). Pass 2 lets words break; pass 3 sets every line the same size, down to the 27 px floor. | same |
| 3 | The table sat static for 12 s | Title (and logo) on screen at frame 0. Rows (or bullets) then enter one at a time, the first at 0.5 s and the rest evenly spaced, so the last one has settled by about 60% of the plate. F1 p2-table: rows at 0.5 / 2.8 / 5.1 / 7.3 s. | `templates/slide/index.html` |
| 3 | Small cells, empty space below | The body is fitted from 7.5% of the height (tables) or 6.5% (bullets) down to the floor. At each size the table tries three column weightings: the first column at max-content, the others in proportion to their one-row width^k for k = 1, 0.5, 0. The first weighting that fits wins. Leftover height becomes row padding, so the rules sit evenly down to the content bottom. The content box is now 14%–87% of the height (was 14%–84%). | same |

Determinism is kept. Every measurement is made once, in `document.fonts.ready`, before any tween is built. There is no wall clock, timer or randomness, GSAP is the local copy, colours and fonts come only from tokens, and `window.__timelines["main"]` is still set last. The 27 px floor and `checkTextFits` are unchanged. Slide cells and bullets keep `overflow-wrap: anywhere`, and the title gained it too.

`references/plate-authoring.md` now describes the new layouts (the templates table and rule 8). `render-plate.mjs` is unchanged; one edit to its column template was tried and then reverted.

## Measured (computed styles, pinned chrome-headless-shell, final plates)

| Plate | Before (verify-2) | After |
|---|---|---|
| F1 p1-hook | all 3 lines 69 px on one row each, block about 1/3 of the frame | lead lines 69.8 px, accent "Who checks / the work?" 97 px on 2 balanced rows; block x 311–969, y 122–598 (about 66% of the height) |
| F1 p3-close | both lines 51 px | "OpenSpec wins on speed." 64.8 px; accent "Peak Workflow wins / on an auditable record." 90 px on 2 balanced rows; block y 220–500 |
| F1 p2-table | cells 31.2 px, table ends around 60% of the height, all rows in by about 2 s | cells 40 px, columns 322 / 183 / 483 px, table runs to y 622 (content bottom 626); title 61.2 px; rows at 0.5–7.3 s |
| F2 s1–s5 | bullets 43.2 px, all in by about 1–1.5 s | bullets 47 px, evenly spaced, the last settled by 3.0 s of 5 s; counter 27 px |

## Evidence (`docs/build/evidence/WP4/`)

- `layout-before-f1-contact-final.jpg`: the Lead's full F1 sheet (before).
- `layout-f1-p1-hook.jpg`, `layout-f1-p2-table.jpg`, `layout-f1-p3-close.jpg`: after. These are the Lead's F1 plates.json with real spine timings, rendered with `--all --lint --sheet` (0.5 s interval). Every plate gave `lint+check ok` and its planned duration ±1 frame.
- `layout-f2-s{1..5}-*.jpg`: F2 rendered with `--brand brand-packs/default --lint --sheet`. All 5 passed lint+check at 5000 ms.

What the after-sheets show:
- **p1-hook**: "Two tools." is at frame 0, then the bar grows. "One promise: / spec before code." is in at 1.0 s, and the large blue "Who checks / the work?" at 1.5 s. The block fills the centre of the frame.
- **p3-close**: the white lead is at frame 0; the large blue two-row accent is in by 1.0 s. The block is centred.
- **p2-table**: the title is alone at 0 s, then one row arrives about every 2.3 s, and the full table holds from 7.3 s to the end. Cells are large, and "each requirement traced / to its test + status" wraps onto 2 clean rows. There is no clipping, and the table no longer collides with the footer.
- **F2**: deck layout with larger bullets that arrive progressively; `Label:` accents are kept and wraps are clean.

## Self-review rounds

1. Motion: accepted. Table: `grid-auto-rows: 1fr` plus equal columns overflowed the content box, so row 4 was clipped behind the footer and cells came out small.
2. Table: column-weight search plus a padding fill. Cells went up to 40 px and every row fits. F2 checked. Moving the content top to 11% put the title under the sheet timecode, so I restored the ≥ 14% top margin that plate-authoring.md promises.
3. Padding fill fixed: it had used `scrollHeight - clientHeight`, which is never positive. It now uses rects, so the table reaches the content bottom.

## Checks

- `node --test plugins/peak-media/evals`: 61/61 pass on the final templates. No eval change was needed.
- `ac-run --wp WP4`: PLT-01, PLT-04, VND-01, VND-02 and BASE-08 scripts pass. PLT-02 and PLT-03 are still ACs, so there is no run.
- `ac-run --trace`: PASS, 77 ACs, 12 briefs, 0 problems.

## Round 2 (verify-3 S-1, N-4)

- **S-1**: added `evals/video-plates/layout.test.mjs`. It scaffolds F1 and F2 (no render), loads each plate with a probe in HyperFrames' pinned headless browser (file:// only), seeks the template's own GSAP timeline and measures the page. There are 4 tests:
  - `layout: motion close plate keeps display text >= 56 px and wraps its long line instead of shrinking`
  - `layout: settled motion text block is centred in the frame within 2% both ways`
  - `layout: the last table row (and last bullet) has settled by 60% of the slide plate`
  - `layout: slide body stays inside the content box and nothing reaches the footer`

  I mutation-checked each one by temporarily breaking the template, and each failed with a one-line reason:
  - no-wrap: close lines 36.7 px;
  - left-aligned stage: off-centre by 14.5%;
  - reveal ending at 90%: last row opacity 0 at 0.6 D;
  - content box reaching into the footer: "Human checks" past the footer.
- **N-4**: `plate-authoring.md` rule 8 now names the 56 px (7.8%) target and the 27 px reading floor separately.
- N-1, N-2 and N-3 are left as they are, per the Lead.

## Open / for the Verifier

- Status is not marked PASS here (builder rule 9). AC-PLT-02 and AC-PLT-03 are `still` ACs whose sheets now differ, so a Verifier should re-check them on these sheets.
- Bullet slides (F2) still leave room below 2–3 short bullets, because bullets start at 6.5% of the height (47 px). Not raised by the user; a bigger start size is an easy follow-up if wanted.
- In the table, the "same AI reviews" column wraps to 2 rows at 40 px. This is the trade the weight search makes to fit four rows.
