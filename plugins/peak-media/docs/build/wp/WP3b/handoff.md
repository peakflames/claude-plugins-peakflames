builder-id: builder-wp3b-0a9e3be0

# WP3b handoff — Spine script + manifest

Builder: worktree agent on `feature/peak-media-wp3b` (base `c5eb616`), claude-opus-5-5, 2026-11-08.

## Done

- `skills/video-spine/scripts/spine.mjs` (on `runCli`). It reads `brief.md` (runtime + `## Beats` ids) and `script.md`, then writes either:
  - **narration**: one clip per beat through `lib/tts` → `spine/narration.wav` (48 kHz mono, clips placed with ffmpeg `adelay`+`amix`), `spine/manifest.json` (v1, validated before writing), and clips exported to `spine/clips/`;
  - **beat grid** (`--no-narrate`, or no key for a real model): `spine/beatgrid.json`, with `onScreenText` per beat and durations weighted by words and snapped to whole beats at `--bpm`, plus a silent `narration.wav`. No ffmpeg and no network.
- Each beat is `--lead-ms` + clip + `--tail-ms` (250/250 by default, each at least 200), so beats sit ≥ 400 ms apart (DEC-13) and every boundary is ≥ 200 ms inside its silence (DEC-29). A spine short of target holds each beat up to `--max-hold-ms` (1 s), never past the target.
- **Runtime gate:** outside ±10% → exit 1 with one line; the files are still written. It prints the wpm table, slow-clip warnings and `N/N cached`. `--budget [--wpm n]` prints the word budget and the script's word counts (no synthesis).
- Mode: `--narrate` forces narration (fails without a key unless fake), `--no-narrate` forces a beat grid. Otherwise it narrates when a key is set or the model is `fake/*`. The key follows **DEC-30**: `PEAK_MEDIA_OPENROUTER_API_KEY`, with `TTS_OPENROUTER_API_KEY` as fallback.
- **`script.md` format** (defined in SKILL.md): one `## <beat-id>` per brief beat, in the brief's order; exactly one paragraph each; optional `On screen:` and `Style:` lines; comments ignored. Errors are one line naming the beat.
- `skills/video-spine/SKILL.md`: stages 0–2 and their gates (brief confirm, sizing, cold read, user approval, ±10%, check-cuts).
- `skills/video-spine/references/narration-writing.md`: brand-neutral port, adapted to the spine (no recorder/storyboard sections; plugin cache path).
- `evals/video-spine/spine.test.mjs`: AC-SPN-01/02/03, AC-BASE-06, plus one unbound test (parser, layout, neutral brief). Children get both key vars blanked. The suite also passes with a key in the parent env.
- `docs/build/fixtures/F1/script.md`: 50 words. With the stub's 165 wpm it gives 20.00 s; the gate holds for a fake provider at about 150–210 wpm.

## Stub: `lib/tts/index.mjs`

Marked `// STUB — replaced by WP3a`. It implements the agreed API, but only `fake/tone` synthesizes: a 48 kHz tone at 165 wpm. The evals use only the documented API and result fields; the one exception is that the wpm table must contain each clip's `wpm` value (exact or rounded). **For the merge:**

- WP3a's `checkTtsOptions` must throw a `CliError` for an unknown model.
- The spine passes `cacheDir` explicitly (default `~/.cache/peak-media/tts`), and `exportDir` = `<out>/clips`.
- AC-TTS-01 says "spine runs". Spine calls `checkTtsOptions` in **every** mode, so `--voice Nope` fails even when no key means it would write a beat grid. It calls `requireFfmpeg` only when narrating.

## Open

- **AC-SPN-04: `blocked: needs user approval`.** Four cold-read rounds are recorded verbatim in `evidence/WP3b/AC-SPN-04-cold-read.md`. hook and close are CLEAR, but **compare was still UNCLEAR in round 4**: the reader asked who the "separate reviewer session" is. Every round flagged "wins on proof" as an overclaim; that wording comes from the F1 brief and plates. The user's options are listed at the end of the evidence file.
- `scripts/validate.mjs` / `detectKind` cover `beatgrid.json`; no change needed.

## Deviations

- The beat-grid spine also writes a silent `narration.wav` and sets `audio`. The schema says audio is "always written by the spine", and this way assembly always finds a track. The F0 hand-made beatgrid has no `audio`, which the schema still allows.
- I added flags the brief didn't name: `--budget`, `--wpm`, `--max-hold-ms`, `--bpm`, `--lead-ms`, `--tail-ms`.
- I didn't edit anything outside my folders except `fixtures/F1/script.md` (asked for) and the `lib/tts/index.mjs` stub. `fixtures/F1/run/` holds my gitignored scratch scripts (`smoke.sh`, `evidence.sh`, which regenerates the logs).

## Evidence (`docs/build/evidence/WP3b/`)

`AC-SPN-01.log`, `AC-SPN-02.log`, `AC-SPN-03.log`, `AC-BASE-06.log`, `AC-SPN-04-cold-read.md`, `builder-node-test.log` (26/26 pass), `ac-run-WP3b.log`.

## Suggested CHANGELOG bullet

- **`video-spine` skill and `spine` script**: turn a brief and a beat-tagged `script.md` into `spine/manifest.json` + `narration.wav`, or into a no-network `beatgrid.json` when there's no key. Beats sit at least 400 ms apart, with a ±10% runtime gate, a wpm table and `--budget` sizing.

## Round 1 fixes (Lead, after verify-1)

- S1: `spine.mjs` passes `--cache-dir` only when given, so `PEAK_MEDIA_TTS_CACHE` and the lib default apply.
- S2: superseded by DEC-31 (user): mood tags are performed, not read. The SKILL/narration guidance stands; narration-writing.md now says to keep tags understated.
- S3: user kept the approved wording; understated tags added to the F1 script (evidence/WP3b/AC-SPN-04-user-approval.md).
