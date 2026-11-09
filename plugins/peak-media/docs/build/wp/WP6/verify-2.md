verifier-id: verifier-wp6-r2-cdedb5bb

# WP6 verify-2

Worktree `agent-a249fce8413cca960`, branch `feature/peak-media-wp6` @ 470b9b0. Builder `builder-wp6-39c42218` and round-1 verifier `verifier-wp6-r1-90efea8d` both differ from my id.

## Inputs (real merged work, no stand-ins)

- **Spine:** `spine.mjs --brief F1/brief.md --tts-model fake/tone`, with both API keys unset and a temp `PEAK_MEDIA_TTS_CACHE`. The beats are hook 0–5591, compare 5591–16273 and close 16273–20773 ms. `totalMs` is 20773.
- **Plates:** WP4 `render-plate.mjs --all`, default brand.
  - The committed F1 `plates.json` no longer matches the spine (see S-3), so assemble rejects it.
  - I re-timed a temp copy of `plates.json` to the spine's beats and re-rendered the three real plates (5600, 10700 and 4500 ms).
- **Assembly:** `assemble.mjs <project> --brand brand-packs/default`.
- **Stems:** synthetic music (110/165/220 Hz, 22 s) and SFX (1.5 kHz, 150 ms hits at 5.40, 16.10 and 20.00 s), kept in `$TMPDIR`.
- **Clean-up:** I deleted all temp media afterwards.
- **Test suites:** `node --test plugins/peak-media/evals` passes 61/61, including AC-BRD-03. `ac-run --wp WP6` passes all 6 script ACs, and `ac-run --trace` reports 77 ACs, 0 problems. Logs: `node-test.r2.log`, `ac-run-WP6.r2.log`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-ASM-01 | PASS | evidence/WP6/AC-ASM-01.r2.log | **Real F1 run:** exit 0. My `check-cuts --cuts 5591,16273 --min-silence-ms 300 --expect-cuts 2` finds both cuts in 500 ms silences, and scene detection (5.600, 16.267) agrees. On `final.mp4` the outro cut at 20.767 s sits in 3244 ms of silence. **Negative case:** a 1 kHz tone over the cut at 5.3–6.3 s gives exit 1 with `cut not in a ≥300 ms silence at 0:05.591 (p1-hook\|p2-table: over sound)`. The stale `out/final.mp4` and `review-mix.mp4` I planted are both gone (N-1 fixed) |
| AC-ASM-02 | PASS | evidence/WP6/AC-ASM-02.r2.log | `-map 0:v -c copy -f md5` gives `84a8257a…80ac` for `review.mp4`, the music-only, SFX-only and music+SFX remuxes, and assemble's own `review-mix.mp4` (1080p60 run). An already-mixed source is refused |
| AC-ASM-03 | PASS | evidence/WP6/AC-ASM-03.r2.log | **Source export:** probe-spec passes all 10 checks: 1280×720@30, 23767 ms against 20773 + 3000 = 23773 ms (6 ms off, within 1 frame), 713 frames. **1080p60 with stems:** also passes all 10: 1920×1080@60, 23767 ms |
| AC-ASM-04 | PASS | evidence/WP6/AC-ASM-04.r2.log | With no `--music`/`--sfx`, exit 0 and no `review-mix.mp4`. The final carries AAC 48 kHz stereo. `review.mp4` and `final.mp4` both measure −16.0 LUFS |
| AC-ASM-05 | PASS | evidence/WP6/AC-ASM-05-verifier-r2.jpg | **Sheet:** 25 frames, one per second. 0–5 s is the real p1 motion plate ("Two tools." / "One promise: spec before code." / "Who checks the work?" in accent blue, building line by line). 6–16 s is the p2 slide: "Head-to-head on four dimensions", a 4-row table and a progress bar. 17–20 s is p3 ("OpenSpec wins on speed." / "Peak Workflow wins on an auditable record."). 21 s shows the logo outline fading in, 22–23 s the default outro (rounded-square logo with a blue dot, "Your Name"), and 23.73 s has faded to the dark background. No test patterns. **Spot sheet** at 20.8–23.6 s confirms the fade in, hold and fade out |
| AC-ASM-06 | BLOCKED | evidence/WP6/AC-ASM-06.r2.log | **Needs user listen.** The mechanical levels pass: narration −16.0 LUFS; music −28.0 LUFS under the voice (12.2 dB below); music between lines −22.0 LUFS; SFX −20.0 LUFS; mix TP −8.4 dBFS. Under stress (`--music-lufs -14 --sfx-db 20`) the limiter holds TP at −1.4 dBFS |
| AC-BASE-11 | PASS | evidence/WP6/AC-BASE-11.r2.log | `--help` lists all 14 options plus -h/--version. `--version` prints 0.1.0, matching plugin.json. Every error is one line with no stack: usage errors exit 2, input errors exit 1. Cases: no args, missing input, bad export, invalid plates.json, missing brand, missing music, negative ms, unknown flag, missing `--outro`. The scripts have no network code |
| AC-BASE-12 | PASS | evidence/WP6/AC-BASE-12.r2.log | `--help` lists all 13 options plus -h/--version. `--version` prints 0.1.0. Every error is one line with no stack. Cases: no args, missing `--out`, nothing to mix, out==in, a stem with no audio, non-media input, positive LUFS, negative fade, missing stem, missing input, non-numeric dB |

## Audio levels (real F1 `review.mp4`, defaults `--music-lufs -28 --duck-db 6 --sfx-lufs -20`)

**Method:** ffmpeg ebur128 with `peak=true` on the decoded audio.
- The music is isolated as (music pass − narration) and the SFX as (music+SFX mix − music pass).
- The residual error floor is gated out: −70 LUFS, TP −78.8 dBFS.

| Quantity | Target | Measured |
|---|---|---|
| Narration | ≈ −16 LUFS | −16.0 integrated; −15.8 in each speech window |
| Music under the voice | ≈ 12 dB below the narration | −28.0 / −28.0 / −28.4 LUFS in the three clip windows, i.e. 12.2–12.6 dB below. The tool reports −28.1 LUFS and `belowVoiceDb` 12.3 |
| Music between lines | ≈ −22 LUFS | −22.0 LUFS. F1's own gaps are only 500 ms, so I measured this on F1 narration with clip 2 muted 9–12 s, passed via `--narration`, over the 9.5–11.5 s interior. In F1's real 500 ms gaps the duck only half releases: −24.6 LUFS |
| SFX hits | ≈ −20 LUFS | −20.0 LUFS (gated), TP −16.0 dBFS |
| True peak | ≤ −1 dBFS | mix −8.4 dBFS; stress case −1.4 dBFS |

## Round-1 findings

- **B-1: fixed.** Assemble renders `brand-packs/default/outro` through the plate layout (`assemble.mjs:109-141`), and the real F1 final ends on it.
- **S-1: fixed.** `evals/video-assemble/fixtures/brand-outro/` is deleted. SKILL.md documents `brand/…` and `vendor/gsap.min.js`. Nothing under `skills/` or `evals/video-assemble` uses `../tokens.css`. The WP1 contract fixture `evals/fixtures/brand-min/outro/index.html:2` still does, but it is only validated, never rendered.
- **S-2: fixed** (option: note).
  - `--export 1080p60` from 30 fps plates prints `note … duplicates frames to 60 fps (motion stays 30 fps) …` and records it in `report.note`.
  - The outro renders at 60/1 with 180 frames, and consecutive outro frames differ through the animation, so it is true 60 fps motion.
  - `--help` and SKILL.md step 5 say so.
- **N-1: fixed.** `assemble.mjs:168-169` removes `out/final.mp4` and `review/review-mix.mp4` up front. The negative run confirms neither survives.

## Other checks

- **No `say` or time-stretching:** `grep -rnE "\bsay\b|atempo|rubberband|asetrate|stretch|sox|tempo"` over `skills/`, `lib/` and `evals/` finds only prose, the `--bpm` beat-grid help and text in a legacy fixture. Nothing invokes macOS `say` or time-stretches narration. `listen-mix.mjs` is gone.
- **Scope:** the WP6 commits in `a2ed450..aef8d28` (70965b2, aef8d28) touch only `skills/video-assemble/**`, `evals/video-assemble/**`, `docs/build/evidence/WP6/` and `wp/WP6/handoff.md`. The rest of that range is the integration merge e3e08f8 (WP3a, WP5 and F1 fixture changes), which isn't WP6's work.
- **No committed media:** `git ls-files plugins/peak-media` has no MP4, WAV or other audio, and there is none on disk in the tree. AC-BRD-03 passes in the suite.
- **No brand strings:** `grep -rni peakflames skills/ evals/` is empty.

## New findings

- **S-3 (should-fix, outside WP6's owned folders; for the Lead): the F1 fixture is out of step with the merged spine.**
  - **The mismatch:**
    - `docs/build/fixtures/F1/plates.json:13-14,27-28,42-43` still uses 0/6500, 6500/7500 and 14000/6000.
    - `fixtures/F1/spine/manifest.json:5` hand-authors `totalMs` 20000.
    - The merged `spine.mjs` (fake/tone) on F1's approved script gives beats 0/5591, 5591/10682 and 16273/4500, with a total of 20773.
  - **Effect:** `assemble` on the real F1 spine correctly refuses: `plate 'p1-hook' (0–6500 ms) is outside beat 'hook' (0–5591 ms); … 'p3-close' (14000–20000 ms) is outside beat 'close' (16273–20773 ms)`.
  - **Why the evals miss it:** they don't run the real spine or real plates. `evals/video-assemble/helpers/fixtures.mjs:39-56` builds a tone `narration.wav` from the hand-authored manifest and testsrc2 plate MP4s.
  - **Fix:** before the Lead's F1 end-to-end run (DEC-32), regenerate the F1 spine fixture and re-time `plates.json` from it, or have the F1 run derive plate timings from the spine.
- **N-2 (nit): `--outro` is checked too late.**
  - `--outro <missing.mp4>` is checked only inside `outroRender` (`assemble.mjs:111`, called at `:225`).
  - By then the composite and cut check have run, and the previous `out/final.mp4` has already been deleted (`:168`).
  - Check it up front with `--music`/`--sfx` (one-line exit 1 either way, no stack).
- **N-3 (nit, observation): the duck barely releases in short gaps.** With the defaults (150 ms attack, 350 ms release, pauses under 500 ms stay ducked), a 500 ms gap between beats, which is what the spine produces with 250/250 lead/tail, only half-releases the duck (−24.6 LUFS rather than −22). This matches the documented behaviour. Worth hearing at the AC-ASM-06 listen.
