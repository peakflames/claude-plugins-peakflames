# Plate authoring

How a `plates/<id>/index.html` is built so `render-plate` renders it cleanly, the same way every
time, in the brand of whichever pack is passed. Read `vendored-map.md` steps 1–3 first.

## The plate folder

```
plates/<id>/
  index.html          # the composition (yours; render-plate never overwrites it without --rescaffold)
  brand/              # copy of the brand pack — refreshed by render-plate on every run
  vendor/gsap.min.js  # the pinned local GSAP — refreshed on every run
  assets/             # optional: screenshots, logos, data for this plate (copy them in from the brief)
```

Never edit `brand/` or `vendor/` inside a plate: they are replaced on every run, which is what
makes a rebrand one command (`render-plate plates.json --all --brand <new pack>`).

## Composition rules (peak-media on top of the HF contract)

1. **Root:** `<div id="root" data-composition-id="main" data-start="0" data-duration="<durationMs/1000>"
   data-width data-height data-fps>` with the plates.json values. render-plate fails the plate if
   the MP4 is not `durationMs` ±1 frame, so never change `data-duration` by hand.
2. **One timeline:** `const tl = gsap.timeline({ paused: true })`, tweens at absolute seconds with
   `fromTo`, then `window.__timelines["main"] = tl` as the **last** statement — inside
   `document.fonts.ready.then(…)` when you measure text.
3. **No clip wrapper around a layout.** A plate with one continuous scene needs no `.clip`
   element: leave the layout untimed and animate its children. A `.clip` that contains nested
   layout triggers `nested_structure_needs_subcomposition` (a warning, so `check --strict` fails).
   Use `.clip` + `data-start`/`data-duration` only for elements that appear and disappear.
4. **Brand only through tokens:** colours `var(--color-bg|fg|accent)`, fonts
   `var(--font-display|body|mono)`, easing `--ease-*` (the templates' `tokenEase()` turns a
   `cubic-bezier()` token into a GSAP ease). No hex colours, font names or CDN links in a plate.
   The logo is `brand/<logo from brand.json>`.
5. **Local only:** `<script src="vendor/gsap.min.js">`, `<link href="brand/tokens.css">`, assets
   by relative path. No `http(s)://` in `src`/`href` — renders run with the network blocked.
6. **Deterministic:** no `Date.now()`, `performance.now()`, timers, `requestAnimationFrame`
   clocks, `repeat: -1`, or unseeded `Math.random()` (seed a mulberry32 if you need noise).
   Measure layout once, before building tweens.
7. **Something on screen at frame 0.** Plates are hard-cut together; a blank first frame reads as
   a flash. The templates keep the first line (motion) or the logo/footer (slide) visible at 0 s.
8. **Fit text in code, deterministically:** shrink the font in 1 px steps until the block fits
   (see the templates). Keep text inside the 90% action-safe box; reading text — slide counters
   included — never goes below 27 px at 720p (3.75% of the frame height). The motion template lets
   each line wrap onto two balanced rows while its type stays large (≥ 7.8% of the height, 56 px
   at 720p). Only if the text still doesn't fit does it let words break and shrink, down to the
   27 px reading floor. render-plate rejects a plate whose text can't fit at the 27 px floor
   ("shorten text or split the beat").

## One idea per plate

The plate's `intent` is the one idea. If the sheet needs two captions to explain it, split the
beat in `plates.json` (user gate) rather than packing a plate. Kinetic type: ≤ 4 short lines.
Slides: a title + ≤ 4 bullets, or a title + ≤ 5 table rows.

## The templates

| Kind | Template | Input from plates.json | Layout |
|---|---|---|---|
| `motion` | `templates/motion/index.html` | `text[]` (or `intent`) → one `.line` each | One large block centred in the safe area (up to 80% × 66% of the frame), accent bar, lines rise in staggered. The last line is the emphasis: accent colour, full size; earlier lines at 0.72×. A long line wraps onto two balanced rows (`text-wrap: balance`) before the type shrinks; earlier lines stay ≥ 56 px at 720p unless the text can't fit. Slow push-in |
| `slide` | `templates/slide/index.html` | `text[0]` = title, rest = bullets; if the lines hold `\|` cells they are table rows and the title is `intent` | Deck: title + accent rule, bullets (`Label: text` gets an accented label) or a table (first column bold accent; other columns weighted by content). The body is set as large as the content box allows; the leftover height becomes row padding. The title is on screen at 0 s; bullets or rows enter one at a time, evenly spaced from 0.5 s, the last settled by about 60% of the plate. Logo + `n / N` counter footer, progress line |

The templates are a starting point. For anything richer (a zoom over a real screenshot, a
diagram, a chart), scaffold with `--scaffold-only`, then edit `plates/<id>/index.html` by hand;
render-plate keeps it from then on.

## Checks a plate must pass

`render-plate plates.json <id> --lint` runs `hyperframes lint` and `check --strict` (lint,
runtime errors, layout overflow/clipping, WCAG AA contrast, and every warning except `craft`).
Fix by the `Fix:` line in the message; Read `lint-validate-inspect.md` for the codes. The usual
first failures: a CSS `transform` on an element GSAP moves, an animated `.clip`, a font family
with no `@font-face`, text overflowing its box, low contrast between accent and background.

## Review

`--sheet` writes `review/contact-<id>.jpg` (a frame every 0.5 s, timecode top-left). Read it with
the Read tool and check: brand colours and fonts, nothing clipped or overflowing, every line
on screen long enough to read, a clean first and last frame. Name the plate in every fix
("p2-table: third column wraps") and re-render only that plate. The timecode label covers the
top-left corner of each tile; content placed there (the templates keep ≥ 14% top margin) is
still visible in the frame itself.
