# WP12 handoff — `beat()` storyboard API

builder-id: wp12-builder-2

**Takeover.** The first WP12 builder was stopped mid-way. Its commit `ec2d09a` had the `beat()`
engine in `capture.mjs`, the deck and ui-demo examples and the F3 storyboards, none of it run.
I reviewed that diff against the brief, fixed what was wrong, and finished the WP on top of it
(the WIP commit is kept, not squashed).

## Read this first: two items for the Lead

1. **A captioned narrated take fails `check-take`.** With `--spine` and captions on (the default),
   each caption comes up with its clip's first word and goes down with its last. The scene
   detector sees those as picture changes over speech. AC-REC-07 now captures the narrated deck
   with `--no-captions`; the old deck had no captions either (`say('', …)`). The check needs a
   decision before WP15 docs or UAT: either ignore the caption band in `check-take`, or say
   narrated + captions is expected to fail.
2. **`showOverlay` strips inline `<svg>`.** The WIP cursor was an inline SVG, so only the click
   pulse showed and the arrow was missing. The arrow is now the same SVG as a data-URI CSS
   background, which the overlay draws. U3 tested a plain box and never hit this, so it isn't in
   `decisions.md`. Worth a findings line.

## Cursor (user requirement relayed by the coordinator)

The arrow pointer is drawn in every frame once a pointer helper has run. That covers gliding,
resting on a target, and resting between helpers, not just at the click. I checked this on the
contact sheets myself:

- `evidence/WP12/AC-W2V-05-cursor.jpg` has the arrow at every type/click target, and between
  them at 1.95 s, 4.27 s and 6.26 s.
- `AC-W2V-05-no-cursor.jpg` shows no arrow anywhere.
- `AC-W2V-06-overlay.jpg` and `-dom.jpg` show exactly one arrow and one caption after the
  hash route and after `goto`.
- AC-W2V-05 also asserts it in pixels: near-black arrow pixels at each target and at each
  between-helpers rest, compared with the `--no-cursor` take.

The click pulse is drawn on top of the arrow.

## Done

- `capture.mjs`
  - Takes `--script`, `--spine` or `--plates/--plate`, exactly one.
  - `beat(id, fn?)` enforces all five beat rules as one-line `CliError`s.
  - Spine beats wait for clip start − offset and record `lateMs`.
  - Script beats last max(fn, hold).
  - Plate clips are selected by `clip.beat`.
  - Modes are `narrated`, `captions` and `silent`.
  - Helpers: `goto`, `click`, `type`, `point`, `scrollTo`, `scrollBy` (rAF), `wait`.
  - The cursor is drawn with `showOverlay`, one overlay per glide with a CSS keyframe glide; the
    DOM fallback is used only if the overlay is missing or throws. `--no-cursor` turns it off.
  - Manifest `beats[]` has one entry per beat, and `x-take.beats[]` replaces `says`.
  - `say` and `waitForVoice` are gone from all code.
- **Fixes to the WIP:**
  - The overlay arrow is now visible (see above).
  - The DOM caption was lost when a beat's caption draw raced a `goto`: "Execution context was
    destroyed". It now waits for the new document and redraws. A redraw replaces any caption
    already in the page, so it never doubles up.
  - A narrated beat that starts late now spans its clips in the manifest. The v1 schema rejected
    a clip outside its beat.
  - The deck storyboard skips the 250 ms "ring out" pause before the first slide, so `intro`
    isn't late on a 950 ms lead.
- **Evals moved to `beat()`:**
  - `capture.test.mjs`, `captions-mux.test.mjs`, `fixtures/sync/*` and `helpers/sync.mjs`.
  - AC-REC-01's `REC01_FLAGS` gains `--script` and `--no-cursor`.
- **New tests in `evals/video-capture/beat.test.mjs`:** AC-W2V-01..08. There are two AC-W2V-01
  tests; the second checks that the manifest is v1-valid with real beats.
- **New fixtures:** `fixtures/two-page/` (hash route + `goto`) and `fixtures/scroll/` (120 rows).
- **Evidence** (`evidence/WP12/`, JPEG/JSON only):
  - `AC-W2V-01-captions.json`, `-03-errors.json`, `-04-timing.json`
  - `-05-cursor.jpg`, `-05-no-cursor.jpg`, `-05-cursor.json`
  - `-06-overlay.jpg`, `-06-dom.jpg`, `-06-navigation.json`
  - `-07-scroll.json`

## Results

- `video-capture` files, each run alone: `capture.test.mjs` 6/6, `captions-mux.test.mjs` 10/10,
  `beat.test.mjs` 9/9.
- **Full suite:** 126/127. The only failure is AC-PKG-01, which already fails on the base
  (version bump is WP18). The suite rewrote WP5/WP10 evidence files; I restored them and they
  are not committed.
- **`ac-run --wp WP12`:** all six script ACs pass. The two still ACs (05, 06) aren't run by
  ac-run; their tests passed and the sheets are in `evidence/WP12/`.

## Deviations

- **AC-REC-01 and AC-BASE-09/AC-REC-02:** these tests changed beyond `REC01_FLAGS`. A beat source
  is now required, so their base argv gains `--script` (or `--spine` alone). BASE-09 also gains a
  "no beat source" case and a "missing script" case.
- **AC-REC-03 and AC-REC-04:** the storyboard text checks, `take.mode` and the `says` assertions
  were rewritten for beats (`narrated`, `beats[].clipNs`). The intent is unchanged.
- **AC-REC-07:** the narrated deck is captured with `--no-captions` (see item 1).
- **AC-REC-08:** a beat may now last longer than its reading time (`fn` lengthens it), so the
  check is "≥ hold" instead of "= hold".
- **AC-W2V-08:** the test builds its regex from string pieces, and its own name and comments
  avoid the two words. Without that, the grep finds itself.

## Open

- No Markdown docs were changed (WP15 owns them): `SKILL.md`, `references/storyboard-api.md` and
  others still describe `say()`.
- The DOM cursor fallback can't be forced from the CLI, so only the overlay cursor is tested.
