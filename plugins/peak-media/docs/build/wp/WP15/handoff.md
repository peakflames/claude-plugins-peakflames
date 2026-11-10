# WP15 handoff — live plates and docs

builder-id: wp15-builder

## Done

- **`skills/video-capture/SKILL.md`** rewritten against `capture --help` and `capture signin --help`:
  - modes table (`--script`, `--script --no-captions`, `--spine`, `--plates/--plate`)
  - presets table with when to pick each
  - the youtube note: a clip at 0 ms loses ~21 ms, so keep the spine lead-in
  - workflow, the full flag table, cursor (including that `--no-cursor` skips the ~400 ms glides and shortens the take)
  - captions
  - signed-in pages: `signin`, `--storage-state`, the session file as a credential (never in the project or a git work tree, never Read/printed/committed, offer deletion at hand-off), `--headed`
  - report and take manifest (§4.8 and the late-beat stderr line)
  - checks: `probe-spec --preset`; `check-take` with the caption band, frame-size scaling (DEC-50), and `--expect-cuts <slides − 1>` for decks (WP7b N7)
- **`references/storyboard-api.md`** rewritten for the §4.4 API:
  - every helper with its defaults as built
  - the beat rules, with the error messages as `capture.mjs` throws them
  - timing per mode, and "between beats is silence"
  - both example storyboards as they exist in `examples/` (the deck has the `if (n) await wait(250)` the plan's version lacks), plus a one-beat live-plate example
- **`docs/reference/narration-writing.md`**:
  - The text now lives in `script.md`, and the storyboard names beats.
  - The mid-sentence check is now `check-take --expect-cuts`.
  - The deck loop is on `beat()`.
  - The stale recorder flags and cache path are replaced with the spine folder and `~/.cache/peak-media/tts/`.
- **plate-factory** (live-plate text only):
  - `stages.md` stage 3: a live storyboard runs `beat('<plate beat>', fn)` once.
  - `stages.md` stage 6: `capture --plates --plate <id>` with no `--preset`.
  - `SKILL.md`: the `live` row in the stage table says the same, and no longer lists `check-take` (it refuses a picture-only plate).
- **Tests**
  - `evals/plate-factory/live-plates.test.mjs`: AC-W2V-39
  - `evals/video-capture/docs.test.mjs`: AC-W2V-41. It checks the grep and every long flag in the Options of `capture --help` **and** `capture signin --help`.

## Results (risk-gated; each run alone, `TMPDIR` per run, deleted after)

- `docs.test.mjs` 2/2; `live-plates.test.mjs` 1/1 (3 real plate captures, ~27 s).
- `plate-factory.test.mjs` + `audio-options.test.mjs` 22/22 (they read the plate-factory docs).
- `beat.test.mjs`, filtered to AC-W2V-08: pass.
- `ac-run --wp WP15`: AC-W2V-39 pass, AC-W2V-41 pass (`evidence/WP15/ac-run.log`).
- No full suite. No tracked WP5/WP10 evidence changed. No MP4/WAV committed.

## Deviations

- AC-W2V-41 also checks the `signin` subcommand's flags (`--save`, `--timeout`). This goes beyond the AC wording.
- To satisfy "every flag", SKILL.md now mentions `--version` too.

## For the Lead (no code changed)

- `check-take.mjs --help` still says "Defaults are the recorder's (web2video D9, DEC-13)". That is build-process history in user-facing help, and D9 now means the old plan (DEC-44). Suggest dropping the parenthetical.
- The plan's §4.4 deck example has no `if (n) await wait(250)`. The merged example has it, so the docs follow the code.
