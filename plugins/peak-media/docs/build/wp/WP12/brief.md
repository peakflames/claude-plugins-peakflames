# WP12 — `beat()` storyboard API

**Runs as:** Builder · **Branch:** `feature/peak-media-wp12` (worktree, from `feature/peak-media-web2video`) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` (DEC-44..48 and the WP11 run-time findings), `acceptance.md`, `agents/builder.md`, and `plugins/peak-media/docs/web2video-plan.md` §4.3–§4.5 before starting.
- You own only the files listed below (paths relative to `plugins/peak-media/`). Touch nothing else.
- Contracts are **v1** and frozen; the take manifest keeps its v1 shape (see "Take manifest").
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP12`, a `wp/WP12/handoff.md` with a `builder-id:` line, and evidence in `evidence/WP12/` (JPEG, JSON, logs only — no MP4/WAV).
- No plan mode. Don't push. Don't merge. Build only on merged work (DEC-32).
- Captures are real time: run the video-capture evals alone. `TMPDIR=$(mktemp -d)` for every suite run; delete it afterwards. One full `node --test 'plugins/peak-media/evals/**/*.test.mjs'` at the end.
- Out of scope here (later WPs): presets and output flags (`--mp4` and `.webm` stay until WP13), sign-in, page-error reports (WP14), Markdown docs (`SKILL.md`, `references/storyboard-api.md`, `docs/reference/narration-writing.md`, plate-factory `stages.md` — WP15). Keep `--help` text accurate for what you change.

## Scope — `skills/video-capture/scripts/capture.mjs`

**Inputs.** Add `--script <script.md>`, parsed with `parseScript` from `skills/video-spine/scripts/spine.mjs` (import-safe). Exactly one of `--script`, `--spine`, or `--plates/--plate` is required; otherwise a usage error naming the three. The beat list ("the script") is:

| Input | Beat ids, in order | Caption per beat | Timing per beat |
|---|---|---|---|
| `--script` | `## <id>` sections | `On screen:` line, else the paragraph's first sentence | hold = `holdMs(caption)` (3 words/s, ≥ 1.5 s); `--no-captions` keeps the hold, shows nothing |
| `--spine` (narration) | `beats[]` | the beat's `onScreenText`, else the first sentence of its clip text | its clips (`clipNs`, normally one) at their spine times |
| `--spine` (beatgrid) | `beats[]` | `onScreenText` | the beat's own `startMs`/`durationMs` |
| `--plates --plate` | only the plate's `beat` | as the spine | as the spine, window-relative to the plate's `startMs` |

Plate mode selects clips by `clip.beat === plate.beat`, not by the time window (replace the time filter in `spineWindow`, L63–71). The plate's window (`startMs`, `durationMs`) and the hold-to-window-end behaviour stay; live plates must still render to `durationMs` ±1 frame.

**`beat(id, fn?)`** replaces `say()` and `waitForVoice()` (delete both, and every mention in `capture.mjs`). It shows the caption, starts the clip (spine) or hold (script), runs `fn` under it, and resolves when **both** `fn` and the voice/hold have ended. Spine: `beat` first waits for its clip's planned start (clip start − audio offset, as `say()` does today at L541–564, re-keyed from call index to beat id); a late start is logged and recorded as `lateMs`, and the voice stays at its spine time. Script: a longer `fn` lengthens the beat. Each rule below is a take-stopping `CliError`, one line, naming the fix:

- id not in the script → lists the valid ids (`beat 'nope' is not in script.md — valid: add, done, filter, clear`);
- out of script order; called twice; called inside another beat's `fn`;
- a script beat never called by the time the storyboard returns.

**Helpers** (plan §4.4 table; `target` = selector string or Playwright locator): `goto(url, {settle=900})` (network idle ≤ 5 s, then settle), `click(target, {settle=420, ...opts})`, `type(target, text, {delay=45, enter=false})`, `point(target)`, `scrollTo(target, {ms=600})`, `scrollBy(container, {x=0, y=0, ms=600})` (`null` = window; animated with rAF so it is motion, not a jump), `wait(ms)`. Storyboard context: `{ beat, goto, click, type, point, scrollTo, scrollBy, wait, page, context, mode, fps, viewport, elapsedMs }`. `mode` is `'narrated'` for a narration spine (replacing `'spine'`, L249), `'captions'` or `'silent'` otherwise (a beatgrid spine is `'captions'`, or `'silent'` with `--no-captions`). Update the `loadStoryboard` error text (L149) to the new signature.

**Cursor.** Per U3 (PASS): draw it with `page.screencast.showOverlay` — one overlay per glide whose HTML carries a CSS keyframe animation from the last position to the target; the overlay lives in the captured frames only and survives `goto`/`reload`, so no DOM re-injection. Use the DOM caption fallback's pattern only if `showOverlay` is missing or throws (as `captionEngine` does). Keep the cursor's last position between helpers. Shown whenever a pointer helper runs (`click`, `type`, `point`, `scrollTo`, `scrollBy`); glides to the element centre (ease, ~400 ms) and pulses on click. `--no-cursor` turns it off. Cursor and captions survive `goto` and hash-route changes with no duplicates.

**Take manifest.** Keep the v1 shape. `beats[]` now holds one real entry per beat called (`id`, `startMs`, `durationMs`, `clipNs`, and `onScreenText` where the schema needs it) instead of the single `take` beat; clips keep `beat` = the beat id. Per-beat `lateMs` goes in `x-take.beats[]`; replace `x-take.says` with that. `command[]` still re-runs the take (add `--script`, `--no-cursor` to `PATH_FLAGS`/options as needed).

## Scope — callers

- `examples/ui-demo/`: rewrite `storyboard.mjs` per plan §4.4; add `script.md` and `brief.md` per plan §4.3 (beats `add`, `done`, `filter`, `clear`).
- `examples/deck/storyboard.mjs`: rewrite per plan §4.4 (beats `intro`, `why`, `how` from its `script.md`); drop the header's reference to the old plan.
- `docs/build/fixtures/F3/storyboard-*.mjs`: one `beat(<plate beat>, fn)` each (`feature`, `anchor`, `openspec`).
- `evals/video-capture/**` (tests, helpers, `fixtures/sync/*`, `fixtures/live-page`): move to `beat()`. Every existing test keeps its AC ID and must still pass (AC-REC-01..10, AC-BASE-09/10, watchdog, caption-engine). AC-REC-01's flag list gains `--script` and `--no-cursor`; update `REC01_FLAGS` accordingly, nothing else about it.

## Owns

- `skills/video-capture/scripts/capture.mjs`, `skills/video-capture/examples/**`
- `docs/build/fixtures/F3/*.mjs`
- `evals/video-capture/**` (new tests may go in a new file there, e.g. `beat.test.mjs`)
- `docs/build/wp/WP12/handoff.md`, `docs/build/evidence/WP12/`

## Acceptance criteria

- **AC-W2V-01** (script) — G the ui-demo `script.md` (captions) and the deck narrated on a fake/tone spine · W each beat runs · T the caption shown in each beat is that beat's `On screen:` / spine `onScreenText` (assert from the take manifest `captions[]` and a frame sample)
- **AC-W2V-02** (script) — G a storyboard calling `beat('nope')` · W capture · T non-zero exit before any frame is encoded; the one-line error lists the valid ids
- **AC-W2V-03** (script) — G four storyboards (out of order, repeated, nested, one beat never called) · W capture · T each exits non-zero with a one-line message naming the fix
- **AC-W2V-04** (script) — G a beat whose `fn` outlasts its hold, and one whose hold outlasts `fn` · W capture · T each beat's recorded span ≥ max(fn, hold) and the next beat starts after it
- **AC-W2V-05** (still) — G the ui-demo · W captured with and without `--no-cursor` · T a labelled contact sheet shows the cursor at each click/type target, and none with `--no-cursor` (`evidence/WP12/AC-W2V-05-*.jpg`)
- **AC-W2V-06** (still) — G a two-page fixture with a hash-route link and a `goto` · W captured · T after each navigation exactly one cursor and one caption are visible (`evidence/WP12/AC-W2V-06-*.jpg`)
- **AC-W2V-07** (script) — G a scroll container with ≥ 100 rows · W `scrollBy(container, {y: 1500, ms: 600})` at 30 fps · T at least 10 distinct frames over the scroll
- **AC-W2V-08** (script, grep) — G the repo · W grep `\bsay\(|waitForVoice` over code files (`*.mjs`, `*.js`, `*.html`) in `skills/`, `evals/`, `docs/build/fixtures/` · T 0 hits (Markdown docs are WP15's; `scripts/setup.sh`'s shell `say` is outside the grep)
