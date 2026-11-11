---
name: video-plates
description: Build and render motion and slide plates for a peak-media video — one HyperFrames composition per plates.json entry, rendered alone to renders/plates/<id>.mp4 at the planned duration, in the brand pack's tokens. Use for stages 4–6 of plate-factory (storyboard stills, pipeline test, build plates), to re-render one plate after a fix, or to rebrand every plate. Not for live (screen-captured) plates — that is video-capture.
---

# video-plates

A **plate** is one visual beat: a short, self-contained HTML composition that HyperFrames renders
frame by frame into `renders/plates/<id>.mp4`, exactly `durationMs` long. `motion` plates are
invented visuals (kinetic type, diagrams, zooms over real screenshots); `slide` plates are motion
plates in a deck layout. `live` plates are not built here — use video-capture.

Everything runs through one entry point:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/video-plates/scripts/render-plate.mjs" <plates.json> (<id>... | --all) [--brand <pack>] [--sheet] [--lint] [--storyboard] [--scaffold-only] [--rescaffold] [--out <dir>]
```

`--help` lists every flag. Never call `npx hyperframes`: the CLI is pinned and run through
`lib/hf.mjs` (no telemetry, no updates, no network).

## Before the first plate

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/video-plates/references/vendored-map.md`, then do its
   steps 1–3: Read `vendor/hyperframes/hyperframes/SKILL.reference.md`,
   **`vendor/hyperframes/hyperframes/references/runtimes.md`** and
   `vendor/hyperframes/hyperframes/references/format.md` (all under `${CLAUDE_PLUGIN_ROOT}`).
   `runtimes.md` must be Read before any `plates/<id>/index.html` is written.
2. Read `${CLAUDE_PLUGIN_ROOT}/skills/video-plates/references/plate-authoring.md`.
3. Check `plates.json` validates and its `brand` points at a pack (or pass `--brand`).

## The loop, per video

1. **Storyboard stills first (gate).** `render-plate plates.json --all --storyboard` scaffolds
   any missing plate from its kind's template and writes one key frame per plate to
   `review/storyboard.jpg` (+ `review/storyboard/<id>.png`). Read the sheet; the user approves
   it **before** any animation is written or tuned. Wording, layout and asset choices are fixed here.
2. **Pipeline test.** Render plate 1 alone: `render-plate plates.json <first-id> --pipeline-test` (lint, render, sheet; prints the `GATE 5 pipeline:` line).
3. **Build each plate.** Start from the template (`--scaffold-only`) or keep it; for anything the
   template can't show, edit `plates/<id>/index.html` by hand following `plate-authoring.md` and
   the vendored-map Read steps for that kind of content. Rules:
   - **One idea per plate** — the plate's `intent`. Two ideas means two beats.
   - **Brand only via tokens** (`var(--color-*)`, `var(--font-*)`, `--ease-*`, the pack's logo).
     No hard-coded colours or fonts, no presets.
   - **Local GSAP only** (`vendor/gsap.min.js`); no CDN or remote URL anywhere.
   - **Deterministic:** no wall clock, timers, `requestAnimationFrame` clocks or unseeded
     randomness; tweens at absolute times; register `window.__timelines["main"]` last.
   - Use real assets from the brief (copy into `plates/<id>/assets/`); never invent product UI.
4. **Check, render alone, review.** `render-plate plates.json <id> --lint --sheet` runs
   `hyperframes lint` + `check --strict` (must be clean), renders that plate on its own, asserts
   the MP4 is `durationMs` ±1 frame, and writes `review/contact-<id>.jpg`. Read the sheet: brand
   fonts and colours, no overflow or clipping, text readable and on screen long enough, a non-blank
   first frame. Fix and re-render **only that plate**; up to 3 self-review rounds, then hand the
   sheets to an independent reviewer (plate-factory runs that gate).
5. **Rebrand** = `render-plate plates.json --all --brand <new pack> --sheet`. `brand/` and
   `vendor/` inside each plate are refreshed on every run; your `index.html` is kept.

## Outputs

`plates/<id>/index.html` (+ `brand/`, `vendor/`), `renders/plates/<id>.mp4` (picture only, H.264,
plates.json fps and size), `review/contact-<id>.jpg`, `review/storyboard.jpg`. Folders sit next
to `plates.json` unless `--out <dir>` is given. Exit codes: 0 ok, 1 a plate failed (one line naming
the plate and the fix), 2 usage, 3 a missing prerequisite (run `node scripts/setup.mjs`).
