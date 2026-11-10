builder-id: builder-wp10a-4cf5151f

# WP10a handoff — Peakflames brand pack, gate 8 offers pack audio

Branch `feature/peak-media-wp10`, from `feature/new-peak-media-plugin` @ 39ef962. Model claude-opus-5-5,
worktree Builder session, 2026-11-10. Scope: WP10a (pack + AC-REAL-03 + gate 8 change), not F4.

## Done

| Item | What | Evidence |
|---|---|---|
| Pack (DEC-16) | `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/` (plain folder; no `git init`, no `gh repo create`): `brand.json` (v1), `tokens.css` (design-system colours/fonts/eases mapped to the pack token names), `logo.svg` (design-system `assets/logo.svg`), `fonts/{archivo,ibm-plex-sans,jetbrains-mono}/` (latin woff2 from `@fontsource/*@5.3.0` via `npm pack`, `LICENSE` → `OFL.txt`), `outro/index.html` (`#s6` reproduced, 4 s), `music-rules.md` | `node scripts/validate.mjs <pack>` → ok |
| Music (DEC-39) | `music/groove-sauce.mp3` copied; `music/CREDITS.md`; `music-rules.md` row (when to use, `--music-lufs -28 --duck-db 6`); `brand.json` `x-tracks` entry (title, file, credit, use, levels) and `music.credits` | AC-REAL-03.log |
| SFX (DEC-40) | `fire()` is Python synth code, not an audio file → `sfx/manifest.json` with no entries (note names `fire()` as the source to render); `brand.json` `"x-sfx": "sfx/manifest.json"`. Nothing downloaded | — |
| Gate 8 | New `skills/plate-factory/scripts/audio-options.mjs` (runCli): lists the active pack's `x-tracks` + SFX manifest (from a pack, `brand.json`, `plates.json` or project folder), or `--folder <dir>` (not recursive); never searches. `stages.md` stage 8 step 1 and `SKILL.md` (entry-point table, rule) updated. Eval `evals/plate-factory/audio-options.test.mjs` (4 tests, fixture = brand-min + generated tone in tmp) | plate-factory + brand evals: 27/27 pass |
| AC-REAL-03 | `evals/real/real.test.mjs`: validate, licences, x-tracks/rules/levels, SFX manifest fields, outro rendered with assemble's `outroRender` (4000 ms), original teaser rendered and `#s6` (22–26 s) compared: SSIM 0.8–4 s mean 0.9976, min 0.9972 (≥ 0.98 / 0.95). Paths come from `wp/WP10/real-pack.json` | evidence/WP10/AC-REAL-03.log, .json, `AC-REAL-03-hstack.jpg` (test output), `AC-REAL-03-outro-vs-s6.jpg` (labelled sheet), ac-run-WP10.log |
| AC-REAL-02 (started) | `wp/WP10/manual-steps.md`: M1–M10 hand steps as backlog items | — |

Still: `AC-REAL-03-outro-vs-s6.jpg` — row 1 original `#s6`, row 2 pack outro, same 10 times. Identical from
0.8 s on; 0–0.8 s differs only because `#s6` cross-fades over the end card `#s5` in the teaser.

## Open

- AC-REAL-01, AC-REAL-02: F4 not made (WP10b, user-interactive).
- Fire crackle: not in the pack (no audio file); the outro is silent under assemble. Backlog M7/M8.
- Private repo for the pack: not created; needs the user's OK (DEC-16).

## Deviations

- **Files outside the brief's Owns:** `evals/real/real.test.mjs` (AC-REAL-03's script test needs a home under
  `evals/`), `wp/WP10/real-pack.json` (pack/reference paths), `wp/WP10/handoff.md`, `evidence/WP10/`.
  `skills/plate-factory/**` and `evals/plate-factory/audio-options.test.mjs` were granted for the gate 8 change.
- **No house-brand name in the runtime tree (D17 / AC-PKG-03):** the AC-REAL-03 test reads the pack paths from
  `docs/build/wp/WP10/real-pack.json` (env `PEAK_MEDIA_REAL_PACK` / `PEAK_MEDIA_REAL_REF` override); with no
  pack it skips. AC-PKG-03/06/07 re-run: pass.
- **Gate 8 change has no AC ID** in the register; its tests are plain `stage 8: …` tests. Lead may add one.
- `x-sfx` (a string path to the manifest) is a new pack key next to `x-tracks`; v1 allows `x-*`, no contract change.
- Outro is 1280×720 like the default pack (the original is 1920×1080; a 2/3 scale wrapper keeps its geometry).
