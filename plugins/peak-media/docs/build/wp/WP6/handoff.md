builder-id: builder-wp6-39c42218

# WP6 handoff — Assembly

Branch `feature/peak-media-wp6`, based on `feature/new-peak-media-plugin` @ c5eb616. Model: claude-opus-5-5, worktree Builder session, 2026-11-08.

## Done

- `skills/video-assemble/SKILL.md` — stages 7–9 (composite, then music, then SFX, then export), project layout, gates.
- `scripts/assemble.mjs` (AC-BASE-11) does these steps in order:
  1. Validates `plates.json`, the spine and the brand pack. Each `renders/plates/<id>.mp4` must exist, match the plate size and last `durationMs` ±1 frame.
  2. Builds the frame-exact concat timeline (plates at their start frames, black in any gaps) and writes `review/review.mp4` with the narration at −16 LUFS. A beat grid gets a silent AAC track.
  3. Runs `checkCuts` (300 ms, edge 100 ms) at every plate boundary. If a cut fails, it exits 1 with one line naming the timecode(s) and plates and doesn't write `final.mp4`.
  4. If `--music`/`--sfx` are given, passes them to `remuxAudio` → `review/review-mix.mp4`.
  5. Renders the brand outro with `lib/hf` and caches it as `renders/outro-<sha16 of pack bytes+fps>.mp4`. `--outro`/`--rerender-outro` override this.
  6. Writes `out/final.mp4` (`--export source|1080p60`) and checks it with `probeSpec`: duration = `totalMs` + outro `durationMs` ±1 frame. The report goes to `review/assemble.json`.
- `scripts/remux-audio.mjs` (AC-BASE-12):
  - Narration (the input's audio, or `--narration`) is levelled to −16 LUFS. The music bed is levelled to −28 LUFS, faded, and ducked by `sidechaincompress` keyed on the narration. SFX gets `--sfx-db`.
  - A true-peak limiter (−1.5 dBFS, latency-compensated) runs on the sum.
  - The output uses `-c:v copy` and the tool checks that the video-stream md5 is unchanged.
  - It tags its output (`comment=peak-media remux-audio…`) and refuses a tagged file as the narration source, so a pass never double-mixes.
  - Reports LUFS and true peak per stem and for the mix, plus the measured duck (dB).
- `scripts/audio.mjs` — shared loudness (ebur128), stem levelling, mix and ducking helpers.
- Evals `evals/video-assemble/assemble.test.mjs` (AC-ASM-01..05, AC-BASE-11/12). Each run generates its media in a temp dir with `evals/video-assemble/helpers/fixtures.mjs`:
  - three testsrc2 plate MP4s (0–6500, 6500–14000, 14000–20000 ms, 1280×720@30)
  - a tone `narration.wav` inside the F1 manifest clip windows
  - a synthetic music pad and whoosh+thud SFX
- `evals/video-assemble/fixtures/brand-outro/` — a test pack whose 3 s outro is visible (logo, "THANKS FOR WATCHING", accent bar, GSAP staged at render time). `brand-min`'s outro is a flat colour, so it can't show that the outro was appended.
- `evals/video-assemble/helpers/listen-mix.mjs` — rebuilds the AC-ASM-06 listening files.

## Evidence (`docs/build/evidence/WP6/`)

- `AC-ASM-05-final-contact.jpg` (+ `.json`) — the final sheet, 1 frame/s, 24 frames.
  - 0–6 s: plate 1 (testsrc2, normal hues).
  - 7–13 s: plate 2 (hue +120).
  - 14–19 s: plate 3 (hue +240).
  - 20.00: the outro's first frame, navy brand background with the logo still at opacity 0.
  - 21.00, 22.00, 22.97: the outro, an orange circle logo, "THANKS FOR WATCHING" and an orange accent bar on navy.
  - The eval also pixel-compares final@21/22/22.9 s against the outro render (mean abs diff < 6) and final@19 s against it (> 30).
- `AC-ASM-assemble-report.json` — assembly report for the F1 run: cuts, narration level, outro, spec checks.
- `AC-ASM-06-levels.json` — ebur128 for the four listening files plus the per-pass levels reports.
- `ac-run-WP6.log`, `builder-node-test.log` (whole suite, 28/28), `video-assemble-node-test.log`.

## ac-run --wp WP6

| AC | method | run | register | evidence |
|---|---|---|---|---|
| AC-ASM-01 | script | pass | not-started | — |
| AC-ASM-02 | script | pass | not-started | — |
| AC-ASM-03 | script | pass | not-started | — |
| AC-ASM-04 | script | pass | not-started | — |
| AC-ASM-05 | still | — | not-started | — |
| AC-ASM-06 | manual | — | not-started | — |
| AC-BASE-11 | script | pass | not-started | — |
| AC-BASE-12 | script | pass | not-started | — |

`ac-run --trace`: PASS (77 ACs, 12 briefs, 0 problems). `node --test plugins/peak-media/evals`: 28/28 pass.

## Open

- **AC-ASM-06 — blocked: needs user listen.** The files are in `/Users/schaveyt/github/peakflames/claude-plugins-peakflames/tmp/peak-media-wp6-listen/` (the main checkout's gitignored `tmp/`):
  - `AC-ASM-06-pass0-narration-only.mp4`
  - `AC-ASM-06-pass1-music.mp4` (music pass)
  - `AC-ASM-06-pass2-music-sfx.mp4` (SFX pass)
  - `AC-ASM-06-final.mp4` (with the outro)
  - The narration is macOS `say` (Samantha) fitted into the F1 clip windows. Music and SFX are synthetic.
  - Measured levels:
    - narration stem −16.0 LUFS
    - music −28.1 LUFS before ducking, ducked by 14.2 dB under the voice (−44.7 vs −30.5 dBFS RMS)
    - SFX −21.3 LUFS at `--sfx-db -6`
    - mix ≈ −16.3 to −16.5 LUFS integrated, true peak ≤ −3.7 dBFS
  - The register's "user-supplied track" is stood in for by the synthetic bed. Re-run `helpers/listen-mix.mjs` after swapping in a real track if the user wants to.
- The ducking amount (`DUCK` in `audio.mjs`: threshold 0.025, ratio 5, attack 20 ms, release 400 ms) and the −28 LUFS bed are first guesses for the listening gate to tune. Only `--music-lufs` is a flag today.
- The real default pack (WP5) wasn't in this worktree. The outro renderer stages the whole pack, so `../tokens.css`, `../fonts/…` and `../logo.svg` resolve, and it copies the local GSAP in if `outro/index.html` loads `vendor/gsap.min.js`. Re-run AC-ASM-05 with `--brand brand-packs/default` after the WP5 merge.
- If a plate is shorter than planned (still within ±1 frame), its last frame is repeated (`tpad clone`) rather than showing a black flash.

## Deviations

- The brief says I own only `skills/video-assemble/**`. Per builder rule 5 I also added `evals/video-assemble/**`: tests, generated-media helpers, and the `brand-outro` test pack.
- AC-ASM-05 and AC-ASM-06 also have mechanical checks in the evals (a pixel match against the outro, and duck ≥ 6 dB in AC-ASM-02). They stay still/manual in the register.
- No contract changes. No `lib/` changes.

## Suggested CHANGELOG bullets (0.1.0, Added)

- **`video-assemble` skill** — composites rendered plates onto the spine into a review MP4 with narration at −16 LUFS and fails with the timecode when a plate cut isn't in silence.
- **`assemble` export** — appends the cached brand outro and writes `out/final.mp4` (source size or `--export 1080p60`), checked against the delivery spec and spine + outro duration.
- **`remux-audio`** — lays music and SFX stems under the narration with sidechain ducking and a true-peak limiter; the video stream is copied and its md5 is unchanged.
