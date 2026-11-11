verifier-id: wp12-verifier-1

# WP12 verify-1 — `beat()` storyboard API

Builder: `wp12-builder-2` (taking over from a stopped first builder; WIP `ec2d09a`). Branch
`feature/peak-media-wp12`, with `feature/peak-media-web2video` merged in first (Lead's AC-W2V-05
wording, `b39cb4a`).

Runs, each alone: `ac-run --wp WP12` (6/6 script ACs pass), `node --test evals/video-capture/beat.test.mjs`
(9/9), my own takes and contact sheets for 05/06, then one full suite: 126/127. The only failure
is AC-PKG-01 (`'0.1.0' !== '0.2.0'`), which is known and expected (the version bump is WP18). The suite
rewrote the WP5/WP10 evidence; I restored it with `git checkout --`. No headless browsers were left running.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-W2V-01 | PASS | evidence/WP12/AC-W2V-01.verifier.log | Both tests pass. ui-demo `captions[]` matches the `On screen:` lines; the narrated deck (fake/tone spine, mode `narrated`) matches the spine `onScreenText`. The caption band is sampled in the frames, and the manifest validates as v1 with `x-take.says` gone. My verifier sheets also show the right caption in each beat. |
| AC-W2V-02 | PASS | evidence/WP12/AC-W2V-02.verifier.log | Exits non-zero with one line: `beat 'nope' is not in script.md — valid: add, done, filter, clear`. No MP4 and no take manifest are written. |
| AC-W2V-03 | PASS | evidence/WP12/AC-W2V-03.verifier.log | Out of order, repeated, nested and never-called each exit with one line that names the fix. Code review: the checks are at capture.mjs L739–745 and L878–881. |
| AC-W2V-04 | PASS | evidence/WP12/AC-W2V-04.verifier.log | long-fn (fn 2600 ms, hold 1500 ms) spans ≥ 2600 and < 3000 ms. long-hold (fn 300 ms, hold > 4 s) spans ≥ hold. The next beat starts after the previous one ends. |
| AC-W2V-05 | PASS | AC-W2V-05-cursor.verifier.jpg, -no-cursor.verifier.jpg, -cursor-targets.verifier.jpg, -no-cursor-targets.verifier.jpg, AC-W2V-05-06.verifier.json | Fresh ui-demo takes, sampled every 500 ms over the whole take (19 stills). A black arrow pointer is in all 19. It rests on the input during both `type`s and on the Buy milk checkbox through 2.75–4.25 s, between the `done` click and the next glide. It rests on Active through 5.25–6.25 s (the `wait(1100)` gap), then on Done, Clear done and All, including the final hold. The 0.25 s still shows it mid-glide from viewport centre, because the first `type` starts at once. The pulse ring shows on top of the arrow at clicks (0.75, 1.25 s). In the target sheet (7 stills, each 150 ms after arrival), the arrow tip sits on each type/click target. With `--no-cursor`, none of the 18 stills has an arrow or pulse; captions and actions are unchanged. The test's pixel check also passes. |
| AC-W2V-06 | PASS | AC-W2V-06-overlay.verifier.jpg, AC-W2V-06-dom.verifier.jpg, AC-W2V-05-06.verifier.json | Two-page fixture, overlay and DOM caption engines, sampled every 400 ms (14 stills each). After the hash route to Details (1.8–3.0 s), every still has exactly one arrow (on Page two) and one caption ("Hash route to details"). After `goto(page2.html)` (3.4–5.4 s), every still has exactly one arrow (on Done) and one caption ("Page two after goto"). No still shows a doubled cursor, a doubled caption or a stale caption from the earlier document, in either engine. |
| AC-W2V-07 | PASS | evidence/WP12/AC-W2V-07.verifier.log | `scrollBy('#list', {y:1500, ms:600})` at 30 fps on 120 rows gives ≥ 10 distinct frames over the scroll, and the list moved. |
| AC-W2V-08 | PASS | evidence/WP12/AC-W2V-08.verifier.log | The test passes. My own `grep -rnE '\bsay\(\|waitForVoice'` over `*.mjs/*.js/*.html` in skills/, evals/ and docs/build/fixtures/ finds 0 hits, and `capture.mjs` has no mention of either name. |

## Brief review (`capture.mjs`)

- **Beat sources.** Exactly one of `--script`, `--spine` or `--plates/--plate` is required; otherwise a usage error names all three (L207–210). `--script` is parsed with `parseScript`.
- **Beat rules.** Unknown, nested, repeated, out-of-order and uncalled beats each raise a one-line `CliError` naming the fix. A non-function `fn` is also rejected.
- **`say` / `waitForVoice`.** Fully gone from the code.
- **Context and mode.**
  - The storyboard context is `{ beat, goto, click, type, point, scrollTo, scrollBy, wait, page, context, mode, fps, viewport, elapsedMs }` (L852).
  - Mode is `narrated` for a narration spine; otherwise `captions` or `silent` (L294). A beatgrid spine is `captions`/`silent`.
- **Plate mode.** Clips are selected by `clip.beat === plate.beat` (L69, L91). The window, and the hold to the window's end, are kept (L891–897).
- **Spine beats.**
  - They wait for clip start − offset (L752).
  - `lateMs` is recorded and logged (L754, L927–928). A late start moves the picture, not the voice.
- **Script beats.** They end at max(fn, hold) (L758–763).
- **Manifest.**
  - Keeps the v1 shape, with one `beats[]` entry per beat called (`id`, `startMs`, `durationMs`, `clipNs`, plus `onScreenText` for beatgrid).
  - Clips keep `beat` = the beat id.
  - `x-take.beats[]` carries `plannedMs`/`lateMs`; `x-take.says` is gone.
  - `PATH_FLAGS` includes `script`; `--no-cursor` is an option.
- **Cursor.**
  - `showOverlay` draws one overlay per glide, with the DOM fallback only if `showOverlay` is missing or throws.
  - It is restored after `goto`. `--no-cursor` turns it off.
- **Scope.**
  - `git diff --stat 28c14be..HEAD` shows only owned files, plus `acceptance.md` and `wp/WP12/brief.md`, which come from the Lead's merged commit `b39cb4a`.
  - No MP4, WAV or WEBM files are in the diff.
  - `grep -rli peakflames` over skills, lib, schemas, brand-packs, vendor, scripts and evals finds 0 hits.

## Findings

- **minor — the full storyboard context isn't documented in two places.** The `loadStoryboard` error (L179) and the `--storyboard` help line (L975) list `{ beat, goto, click, type, point, scrollTo, scrollBy, wait, page }`. The context also passes `context, mode, fps, viewport, elapsedMs`. The brief asks for the `loadStoryboard` text to show "the new signature"; it shows only part of it.
- **minor — Lead decision (from the handoff, confirmed in code): a captioned narrated take fails `check-take`.** AC-REC-07 now runs the narrated deck with `--no-captions` to avoid it. This needs a decision before WP15/UAT (mask the caption band in `check-take`, or document the failure). I didn't re-run `check-take` on a captioned narrated take.
- **nit — `showOverlay` strips inline `<svg>`.** The builder worked around it with a data-URI CSS background. This isn't recorded in `decisions.md`; it's worth a findings line next to U3.
- **nit — the DOM cursor fallback is untested.** It can't be forced from the CLI, so only the overlay cursor is exercised (the handoff says the same).
- **nit — `--no-cursor` changes the take's timing.** Without glides the helpers run about 400 ms sooner, so the ui-demo take is 9.17 s instead of 9.73 s. This is expected and harmless, but `--no-cursor` is not a timing-neutral toggle.
- **Markdown docs still describe `say()`** (`SKILL.md`, `references/storyboard-api.md`). This is out of scope here; WP15 owns them.

No blockers. No majors.
