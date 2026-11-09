builder-id: builder-wp6-39c42218

# WP6 handoff — Assembly

Branch `feature/peak-media-wp6`, based on `feature/new-peak-media-plugin` @ c5eb616, with `feature/new-peak-media-plugin` merged in for round 1. Model: claude-opus-5-5, worktree Builder session, 2026-11-08.

## Done

- `skills/video-assemble/SKILL.md` — stages 7–9 (composite, then music, then SFX, then export), project layout, levels table, gates.
- `scripts/assemble.mjs` (AC-BASE-11) does these steps in order:
  1. Validates `plates.json`, the spine and the brand pack. Each `renders/plates/<id>.mp4` must exist, match the plate size and last `durationMs` ±1 frame. Deletes any old `out/final.mp4`.
  2. Builds the frame-exact concat timeline (plates at their start frames, black in any gaps) and writes `review/review.mp4` with the narration at −16 LUFS. A beat grid gets a silent AAC track.
  3. Runs `checkCuts` (300 ms, edge 100 ms) at every plate boundary. If a cut fails, it exits 1 with one line naming the timecode(s) and plates and writes no `final.mp4`.
  4. If `--music`/`--sfx` are given, passes them to `remuxAudio` → `review/review-mix.mp4`.
  5. Renders the brand outro like a plate (see Round 1, B-1) at the export fps with `lib/hf`, cached as `renders/outro-<sha16>.mp4`. `--outro`/`--rerender-outro` override this.
  6. Writes `out/final.mp4` (`--export source|1080p60`) and checks it with `probeSpec`: duration = `totalMs` + outro `durationMs` ±1 frame. The report goes to `review/assemble.json`.
- `scripts/remux-audio.mjs` (AC-BASE-12):
  - Narration (the input's audio, or `--narration`) is levelled to −16 LUFS, never time-stretched.
  - Music sits at `--music-lufs` (−22) under the voice and rises by `--duck-db` (8) between lines, using a look-ahead duck envelope built from the narration's speech windows. SFX hits are levelled to `--sfx-lufs` (−20) plus `--sfx-db`.
  - A true-peak limiter (−1.5 dBFS, latency-compensated) runs on the sum.
  - The output uses `-c:v copy` and the tool checks that the video-stream md5 is unchanged.
  - It tags its output (`comment=peak-media remux-audio…`) and refuses a tagged file as the narration source, so a pass never double-mixes.
  - Reports LUFS and true peak per stem and for the mix, plus the measured music level under the voice (`belowVoiceDb`).
- `scripts/audio.mjs` — shared loudness (ebur128), stem levelling, duck envelope and mix helpers.
- Evals `evals/video-assemble/assemble.test.mjs` (AC-ASM-01..05, AC-BASE-11/12, plus a default-levels test). Each run generates its media in a temp dir with `evals/video-assemble/helpers/fixtures.mjs`:
  - three testsrc2 plate MP4s (0–6500, 6500–14000, 14000–20000 ms, 1280×720@30)
  - a tone `narration.wav` inside the F1 manifest clip windows
  - a synthetic music pad and whoosh+thud SFX
  - brand: `brand-packs/default`

## Evidence (`docs/build/evidence/WP6/`)

- `AC-ASM-05-final-contact.jpg` (+ `.json`) — final sheet of F1 assembled with the shipping `brand-packs/default`, 1 frame/s, 24 frames.
  - 0–6 s: plate 1 (testsrc2, normal hues). 7–13 s: plate 2 (hue +120). 14–19 s: plate 3 (hue +240).
  - 20.00: the outro's first frame — the near-black default background, logo and name not yet faded in.
  - 21.00 and 22.00: the default outro — a rounded-square outline logo with a blue dot and "Your Name" below it, centred on near-black.
  - 22.97: background only; WP5's outro fades its logo and name out from 2.4 s, by design.
  - The eval checks that F1 names `brand-packs/default`, that outro content is on screen at 21 s, and pixel-compares final@21/22/22.9 s against the outro render (mean abs diff < 6) and final@19 s against it (> 30).
- `AC-ASM-assemble-report.json` — assembly report for the F1 run: cuts, narration level, outro, spec checks.
- `AC-ASM-06-levels.json` — round-1 levels with the new defaults (music pass, then music + SFX pass) on the eval fixture.
- `ac-run-WP6.log`, `builder-node-test.log` (whole suite, 43/43), `video-assemble-node-test.log` (8/8).
- Verifier files from verify-1 (`AC-*.log`, `AC-ASM-05-verifier-final.jpg`) are committed as received.

## ac-run --wp WP6 (round 1)

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

`ac-run --trace`: PASS (77 ACs, 12 briefs, 0 problems). `node --test plugins/peak-media/evals`: 43/43 pass.

## Round 1 fixes (verify-1 + Lead additions)

- **Merge:** `feature/new-peak-media-plugin` merged in (`--no-ff`, no conflicts). It brings WP5 `brand-packs/default`, WP3a `lib/tts` and the approved F1 fixtures.
- **B-1:** the outro is staged exactly like a plate (`scaffoldPlate`): `outro.composition` is copied to `<tmp>/index.html`, the pack to `<tmp>/brand/` and the local GSAP to `<tmp>/vendor/gsap.min.js`, and `<tmp>` is rendered. The cache key now includes the layout. AC-ASM-05 runs on `brand-packs/default`.
- **S-1:** the `../tokens.css` eval pack (`evals/video-assemble/fixtures/brand-outro/`) is deleted. SKILL.md documents the plate layout: `brand/tokens.css`, `brand/logo.svg`, `brand/fonts/…`, `vendor/gsap.min.js`, no `../`, no CDN.
- **S-2, chosen option: keep duplicating frames, with a note.**
  - The outro renders at the export fps (60 for `1080p60`), so it really is 60 fps.
  - If plates.json fps is below the export fps, assemble prints `note … duplicates frames to 60 fps (motion stays 30 fps); for true 60 fps motion set "fps": 60 in plates.json and re-render the plates` and records it as `report.note`.
  - Documented in `--help` and SKILL.md step 5. The eval asserts the note and that the outro render is 60/1.
- **N-1:** assemble deletes `out/final.mp4` (and `review/review-mix.mp4`) before it starts. The AC-ASM-01 negative case plants a stale final and asserts it's gone after the failed cut check.
- **6 (levels):** the sidechain compressor is replaced by an exact look-ahead duck envelope built from the narration's speech windows (attack 150 ms before each line, release 350 ms, pauses < 500 ms stay ducked). New defaults, on both `remux-audio` and `assemble`, in `--help` and a SKILL.md table:
  - `--music-lufs -22` is the music loudness **under the voice** (after ducking), about 6 dB below the −16 LUFS narration.
  - `--duck-db 8` (new) is how much louder the bed is between lines, so about −14 LUFS in clear gaps.
  - `--sfx-lufs -20` (new) is the per-hit SFX loudness (gated integrated). `--sfx-db 0` stays as a trim.
  - Narration −16 LUFS and the −1.5 dBFS true-peak limiter are unchanged.
  - New eval `default levels: …`: recovers the music from the mix (mix − narration) and asserts it sits 6–12 dB under the voice in each F1 clip window, rises between lines, and that SFX hits measure −20 ±1 LUFS.
  - On F1: music 6.2 dB under the voice, mix −14.2 LUFS, true peak −5.1 dBFS.
  - **Interpretation, for the Lead to confirm:** "music −22 LUFS, duck 8 dB" and "6–12 dB under the voice" only fit together if −22 is the level *under* the voice. Read as the bed before ducking, the music would sit 14 dB under the voice, outside 6–12. With my reading the bed swells to about −14 LUFS between lines, 2 dB above the narration. Lower `--duck-db` if that's too much.
- **7:** `helpers/listen-mix.mjs` is deleted. Nothing in the plugin uses `say` or time-stretches narration. `remux-audio <review.mp4> --music … --sfx … -o …` is the mix-only tool. The `say`-based listening folder `tmp/peak-media-wp6-listen/` is deleted, so no listening MP4 is left.

## Open

- **AC-ASM-06: blocked, needs user listen.** Per the Lead, the real listening sample is produced after merge with real TTS and real plates. `AC-ASM-06-levels.json` holds the fixture levels for the new defaults.
- If a plate is shorter than planned (still within ±1 frame), its last frame is repeated (`tpad clone`) rather than showing a black flash.

## Deviations

- The brief says I own only `skills/video-assemble/**`. Per builder rule 5 I also added `evals/video-assemble/**` (tests and generated-media helpers).
- AC-ASM-05 and AC-ASM-06 also have mechanical checks in the evals (outro pixel match; music 6–12 dB under the voice, SFX level). They stay still/manual in the register.
- No contract changes. No `lib/` changes.

## Suggested CHANGELOG bullets (0.1.0, Added)

- **`video-assemble` skill** — composites rendered plates onto the spine into a review MP4 with narration at −16 LUFS and fails with the timecode when a plate cut isn't in silence.
- **`assemble` export** — appends the brand outro (staged like a plate, rendered at the export fps, cached) and writes `out/final.mp4` (source or `--export 1080p60`), checked against the delivery spec and spine + outro duration.
- **`remux-audio`** — lays music and SFX stems under the narration (music −22 LUFS under the voice, 8 dB look-ahead duck, SFX hits −20 LUFS, true-peak limiter); the video stream is copied and its md5 is unchanged.

## Lead change after round 1

- Music defaults: `--music-lufs -28` (under the voice, about 12 dB below narration) and `--duck-db 6` (about −22 LUFS between lines). The round-1 reading made the bed swell to about −14 LUFS between lines, louder than the voice. Evals now expect 9–15 dB under the voice.
