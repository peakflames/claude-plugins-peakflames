verifier-id: wp15-verifier-1

# WP15 verify-1 — live plates and docs

Builder: `wp15-builder` (handoff.md). Branch `feature/peak-media-wp15` at `059ac05`, compared with `90d1c00`.
Tests run (no full suite, docs-only WP): `ac-run --wp WP15`, then each of `evals/plate-factory/live-plates.test.mjs`,
`evals/video-capture/docs.test.mjs` and `evals/plate-factory/plate-factory.test.mjs` once, one after another, in a fresh `TMPDIR`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-W2V-39 | PASS | `evidence/WP15/AC-W2V-39.verifier.log`, `evidence/WP15/ac-run.verifier.log` | 1/1 pass (26.7 s). The test does what the AC says. For each of F3's 3 live plates it checks that the storyboard calls `beat('<plate beat>',`, captures with `--plates --plate --json` (no `--preset`), and checks that the take ran exactly that beat. ffprobe then shows a single `video` stream (picture-only). Duration from `nb_read_frames` is within 1 frame of `durationMs`; the frame count equals `framesFor(durationMs, fps)` and the size matches plates.json. `loadProject` and `checkRenders` accept all 3. |
| AC-W2V-41 | PASS | `evidence/WP15/AC-W2V-41.verifier.log`, `evidence/WP15/AC-W2V-41.grep.verifier.log`, `evidence/WP15/ac-run.verifier.log` | 2/2 pass. My own grep (`\bsay\(\|waitForVoice` over the 18 `*.md` files under `skills/` and `docs/reference/`) finds 0 hits. The flag test parses the Options block of both `capture --help` (22 flags) and `capture signin --help`. It requires each flag in SKILL.md or storyboard-api.md, with a guard so `--no-captions` doesn't match a longer flag. |

Regression: `plate-factory.test.mjs` passes 18/18 (`evidence/WP15/plate-factory.verifier.log`).

## Scope

- `git diff --stat 90d1c00..HEAD` touches only owned files: video-capture SKILL.md and storyboard-api.md, narration-writing.md, the plate-factory SKILL.md row and stages.md (live-plate text only), the 2 new tests, handoff.md and `evidence/WP15/ac-run.log`. `capture.mjs` is unchanged.
- No MP4 or WAV in `evidence/WP15/`. `grep -ri peakflames` over the runtime tree finds 0 hits.
- The shipped docs have no `say(`, no `waitForVoice` and no "previously/now" narration. The WP15 diff adds no DEC or WP references. stages.md lines 71 and 153 carry earlier `DEC-` references; they predate WP15 and are out of scope.

## Doc accuracy

I compared SKILL.md and storyboard-api.md line by line with `capture.mjs` (`planTake`, `beatList`, `beat`, the helpers, `takeManifest`, `report`, `signinTarget`) and with `lib/presets.mjs`, `check-take --help`, `probe-spec --help` and `spine --help`. These all match the code:
- the presets table
- every flag's default
- the beat-rule error strings (word for word)
- the helper defaults (`goto` settle 900, `click` settle 420, `type` delay 45, `scrollTo`/`scrollBy` ms 600, glide 400)
- the hold rule (`max(1500, words/3 s)`, computed from the caption even with `--no-captions`)
- the page resolution order (including `about:blank`)
- the watchdog (window + 2000, else 600000)
- the overrun check (more than 1 frame)
- the late-beat threshold (more than 1 frame)
- the page-error limits (5 in the report, 20 in the manifest)
- the `--preset` refusal with `--plates`
- the session file modes (folder 0700, file 0600) and the `--timeout` formats
- check-take's caption band and threshold scaling
- the youtube ~21 ms priming note (`atrim` of 1024 samples)
- the TTS cache path in narration-writing.md
- the plate-factory live-plate text: `--plates --plate`, no `--preset`, `beat('<plate beat>', fn)`

No blockers and no majors.

| # | Severity | Where | Finding |
|---|---|---|---|
| 1 | minor | SKILL.md § Signed-in pages, "`--save` refuses both" | `signinTarget` refuses only `<cwd>/web2video/` and any git work tree. A project folder elsewhere that is not in a git tree is accepted. Say "refuses `./web2video/` and any git work tree" (the `signin --help` wording). |
| 2 | minor | SKILL.md § Cursor; storyboard-api.md "Every pointer helper glides…" | `goto` never glides; it only redraws the cursor after navigation. `scrollTo` glides only to a nested scroll container's centre; for the page it just shows the cursor. `scrollBy(null)` doesn't glide. The `--help` text says the same thing, so this is a code-text nit there too (for the Lead). |
| 3 | minor | storyboard-api.md, the paragraph under the Deck example | "The deck changes each slide 1150 ms after the previous beat ends (900 ms before the first)" is wrong. The slide changes about 250 ms after the previous beat ends, and the next `beat()` is called about 1150 ms after it (900 ms after the change, and 900 ms in for the first beat). The `--lead-ms 950` advice is still right. |
| 4 | minor | SKILL.md § Modes table ("Narrated \| `--spine`") | Only a `kind: "narration"` spine makes the take narrated. A beatgrid spine (allowed, per the `--spine` flag row) runs in captions mode, or silent with `--no-captions`, with a silent track. Add one line saying so. |
| 5 | minor | SKILL.md § Examples; storyboard-api.md Deck note | The commands `capture …`, `spine …` and `check-take …` are bare, with no `node ${CLAUDE_PLUGIN_ROOT}/skills/…/scripts/*.mjs`. A fresh session that copies them gets "command not found". The Workflow block uses `node capture.mjs` relative to the scripts folder, which is fine. |
| 6 | minor | SKILL.md § Report, `x-take` list | Lists a subset. It leaves out `storyboard`, `script`, `url`, `audio` (narrated takes: clips, lufs) and `pointer[]` (where each helper acted). The per-beat fields `n`, `text`, `durationMs`, `caption`, `plannedMs` and `clipNs` are also missing. `pointer[]` is useful for checking that the cursor was on target. |
| 7 | nit | SKILL.md § Report sample | `take manifest:` prints the absolute path, not `out/…`. The late-beat line on stderr starts with `capture: `. |
| 8 | nit | storyboard-api.md § Beat rules | The errors name the actual beat source: the `--script` file's name, the spine file's name (for example `manifest.json`), or `plate '<id>'`. The examples show only `script.md`. |
| 9 | nit | SKILL.md § Checks, probe-spec | The audio limit is the preset's bitrate +15 %, not "no more than the preset's bitrate". |
| 10 | nit | SKILL.md § Cursor ("drawn into the captured frames, not the page") | When `showOverlay` is missing or throws, the cursor falls back to the page DOM. The Captions section mentions its own fallback; the Cursor section does not. |
| 11 | nit | storyboard-api.md § Timing, narrated | A beat ends at its last clip's end minus `--audio-offset-ms`, not at the clip's end. The two are the same with the default offset of 0. |
| 12 | nit | SKILL.md § Signed-in pages step 1 | If the user quits the whole browser instead of closing the tab, nothing is saved (the error says so). Add "(not the whole browser)". |

## Agent-readability

A fresh session following SKILL.md alone would make all three takes correctly:
- **Captions take:** the Workflow, the script.md format (with `examples/ui-demo/script.md`), the storyboard API and `probe-spec --preset` are enough.
- **Narrated take:** SKILL.md sends the agent to `video-spine` for the spine, gives the deck's `--lead-ms 950`, and requires `check-take --expect-cuts <slides − 1>`.
- **Signed-in take:** the agent asks the user to run `signin`, passes `--storage-state`, and treats the session file as a credential (don't Read it, offer to delete it).

The only real stumble is finding 5 (bare command names in the Examples section), and the error makes it obvious how to recover.
