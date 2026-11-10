verifier-id: verifier-wp6-r1-90efea8d

# WP6 verify-1

Worktree `agent-a249fce8413cca960`, branch `feature/peak-media-wp6` @ a2ed450 (based on c5eb616). The builder id is `builder-wp6-39c42218`, which differs from mine. I built my own F1 project in `/tmp/vwp6`, outside the repo:

- **Plates:** three 1280×720@30 plates from `testsrc`, `color` and `testsrc2`, at 0–6500, 6500–14000 and 14000–20000 ms.
- **Narration:** `narration.wav` with 330 Hz tones inside the F1 clip windows (200–6000, 6700–13500, 14200–19500 ms).
- **Music and SFX:** a 110/138/165/220 Hz music bed, and 1.5 kHz SFX blips around each cut.
- **Brand:** `--brand evals/video-assemble/fixtures/brand-outro` unless stated otherwise.

I ran `assemble.mjs` and `remux-audio.mjs` directly. I also ran `node --test plugins/peak-media/evals` (28/28 pass), `ac-run --wp WP6` (6 script ACs pass) and `ac-run --trace` (77 ACs, 0 problems). Those outputs are in `AC-ASM-01.log`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-ASM-01 | PASS | evidence/WP6/AC-ASM-01.log | Assemble exits 0. I ran `check-cuts --cuts 6500,14000 --min-silence-ms 300 --expect-cuts 2` myself: both cuts sit in 700 ms silences, and scene detection agrees. With a bad narration (tone over 6500 ms), assemble exits 1 with `cut not in a ≥300 ms silence at 0:06.500 (p1-hook\|p2-table: over sound)` and writes no `out/final.mp4` |
| AC-ASM-02 | PASS | evidence/WP6/AC-ASM-02.log | My own `ffmpeg -map 0:v -c copy -f md5` gives `7329fcd8…accbd` for `review.mp4`, the music-only remux, the SFX-only remux, the music+SFX remux, and the `review-mix.mp4` inside assemble. It refuses an already-mixed source |
| AC-ASM-03 | PASS | evidence/WP6/AC-ASM-03.log | probe-spec passes all 10 checks for the source export (1280×720@30, 23000 ms = 20000 spine + 3000 outro, 690 frames). `--export 1080p60` with stems also passes: 1920×1080@60, 1380 frames, 23000 ms |
| AC-ASM-04 | PASS | evidence/WP6/AC-ASM-04.log | No `--music`/`--sfx`: exit 0, the final has an AAC track, and `review.mp4` measures −16.0 LUFS |
| AC-ASM-05 | FAIL | evidence/WP6/AC-ASM-05-verifier-final.jpg, evidence/WP6/AC-ASM-05.log | **Eval pack passes.** On the sheet (24 frames, every 1 s), 0–6 s is the testsrc plate, 7–13 s the blue plate, 14–19 s the testsrc2 plate, 20.00 is navy (outro fade-in), and 21.00–22.97 show the orange logo, "THANKS FOR WATCHING" and an underline. **Default pack fails.** `brand-packs/default` from main (the pack F1's `plates.json` names) gives exit 1 with `render failed … media_load_failed`. See B-1 |
| AC-ASM-06 | BLOCKED | evidence/WP6/AC-ASM-06.log | **Needs user listen.** The mechanical part checks out. My ebur128 run on `tmp/peak-media-wp6-listen/AC-ASM-06-*.mp4` matches `AC-ASM-06-levels.json` exactly: narration-only −16.0 LUFS (TP −4.9), music pass −16.5, music+SFX −16.3, final −16.5 (LRA 8.5, TP −4.9). Isolating the 110 Hz music partial, it sits at about −48/−49 dB under the voice and −34.5 dB in the gaps, a duck of about 14 dB (the report says 14.2). Speech-window power is unchanged to 0.1 dB with the music added. The outro tail is silent (−91 dB) |
| AC-BASE-11 | PASS | evidence/WP6/AC-BASE-11.log | `--help` lists all 12 options plus -h/--version. `--version` prints 0.1.0, matching plugin.json. Usage errors exit 2, input errors exit 1, each with one line and no stack. Error cases: bad export, not-a-plates.json, missing brand, invalid plates.json, short render, negative values, missing stem. No network code in the scripts |
| AC-BASE-12 | PASS | evidence/WP6/AC-BASE-12.log | `--help` lists all 11 options. `--version` prints 0.1.0. Error cases, each one line with no stack: missing `--out`, nothing to mix, out==in, a stem with no audio, a non-media input, positive LUFS, negative fade, missing file |

## Scope

- **Files touched:** `git diff --stat c5eb616..a2ed450` covers 20 files, all under `skills/video-assemble/**`, `evals/video-assemble/**` (allowed by the builder rules), `docs/build/evidence/WP6/` and `docs/build/wp/WP6/handoff.md`. Nothing else changed, and no contract change is logged or needed.
- **No committed media:** no MP4, WAV or other audio is in the diff or tracked anywhere under `plugins/peak-media` (`git ls-files | grep -iE '\.(mp4|wav|mp3|m4a|aac|ogg|flac|mov|webm)$'` is empty). The evals generate media into `os.tmpdir()` (`assemble.test.mjs:30`). AC-BRD-03 is not at risk. Evidence holds only JPEG, JSON and logs.
- **No brand strings:** `grep -rni peakflames` over `skills/` and `evals/` is empty.

## Findings

- **B-1 (blocker): assemble cannot render the shipping default brand outro.**
  - **Cause:** `skills/video-assemble/scripts/assemble.mjs:122-132` copies the pack to `<tmp>/brand/` and renders `<tmp>/brand/outro/`. The outro must therefore reach its pack through `../tokens.css`, with GSAP staged into `outro/vendor/`. The WP5 default outro (`brand-packs/default/outro/index.html:2-4,10,24`) is written for the plate scaffold instead: index.html in `<dir>/`, the pack at `<dir>/brand/`, GSAP at `<dir>/vendor/gsap.min.js`. It loads `brand/tokens.css` and `brand/logo.svg`, which don't exist in the staged layout, so HyperFrames fails with `media_load_failed`.
  - **Repro:** `node skills/video-assemble/scripts/assemble.mjs <F1 project> --brand <main>/plugins/peak-media/brand-packs/default` (log in `AC-ASM-05.log`).
  - **Fix:** stage the outro the way a plate is staged: copy `outro/index.html` to `<tmp>/index.html`, the pack to `<tmp>/brand/`, and GSAP to `<tmp>/vendor/`. Then point the AC-ASM-05 eval at `brand-packs/default`, which is now merged.
- **S-1 (should-fix): the docs and eval pack encode the wrong outro layout, which hid B-1.**
  - `skills/video-assemble/SKILL.md:79-80` documents the `../tokens.css` / `../logo.svg` convention.
  - `evals/video-assemble/fixtures/brand-outro/outro/index.html:8,23` uses it.
  - Align both with WP5's layout, or delete the eval pack once the eval uses the default pack.
- **S-2 (should-fix): `--export 1080p60` only upscales and duplicates frames.** `assemble.mjs:21,230` upscales the 30 fps timeline and duplicates frames to reach 60 fps; it does not render at 60. The spec passes, but motion stays 30 fps. Design §4 stage 9 says "final render at 1080p60". Either say this in `--help` and SKILL.md step 5, or render plates and the outro at the export fps.
- **N-1 (nit): a failed run can leave an older final in place.** If an earlier run succeeded, a run that later fails the cut check (`assemble.mjs:200`) leaves that stale `out/final.mp4` behind. Consider removing it before step 2, or saying so in the error.
