# WP2 handoff — Walking skeleton + shared verify tools

builder-id: lead-main-session (claude-opus-5-5, interactive Lead session, 2026-11-08)

## Done

- `brew install ffmpeg` → ffmpeg/ffprobe 9.0.2 (no `drawtext`; see DEC-27).
- `lib/pins.json` (hyperframes 0.9.25, playwright 1.65.0, gsap 3.15.1, ajv 8.20.0); `package.json`/`package-lock.json` mirror it (DEC-25).
- `scripts/setup.sh` — prerequisites, `npm ci --ignore-scripts` into `${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/deps/<lockhash>/`, `hyperframes browser ensure` (or the cloud headless shell), `--check`, `--skip-browser`, `--data-dir`.
- `lib/hf.mjs` (HF wrapper, env per DEC-26, pinned-version check, `render`, `gsapPath`, `browserPath`), `lib/ffmpeg.mjs` (ffmpeg/ffprobe access, `PEAK_MEDIA_FFMPEG`/`PEAK_MEDIA_FFPROBE` overrides for simulating a missing binary), `lib/preflight.mjs`, `lib/deps.mjs` additions (`depRoot`, `pins`).
- `lib/verify/contact-sheet.mjs`, `probe-spec.mjs`, `check-cuts.mjs` — CLIs on `lib/cli.mjs`, also importable.
- `skills/video-plates/templates/motion/index.html` — minimal kinetic-type template (WP4 owns it from here).
- `docs/build/tools/skeleton.mjs` (dev tool) and `docs/build/tools/ac-run.mjs` (`--wp`, `--trace`, independence guard; skipped tests count as not passing).
- Evals: `evals/skeleton/`, `evals/verify/`, `evals/trace/`; `evals/helpers/run.mjs` runs `.sh` entry points too.

## Notes for the verifier

- AC-SKL-03 is `still`: the F0 sheet is `evidence/WP2/F0-contact.jpg` (sample times in `F0-contact.json`). The Lead read it: "spec-aware / vs. / spec-accountable" rise in from 0.1–1.6 s and hold, all legible.
- F0's `plates.json` points at `brand-packs/default` (WP5). Until then the skeleton and its evals pass `--brand evals/fixtures/brand-min` (system fonts).
- AC-SKL-06 uses macOS `sandbox-exec` (outbound denied, loopback allowed — the renderer talks to its own browser over localhost) and first proves the sandbox blocks `fetch`. On Linux it uses `unshare -rn` when allowed, otherwise it skips, and `ac-run` counts a skip as not passing.
- AC-SKL-07 excludes `docs/` (design/build docs quote versions) and allows `lib/pins.json`, `package.json`, `package-lock.json`, `VENDORED.md`.

## Open

- `lib/hf.mjs` `render()` uses `--quality standard`; WP4 may expose quality.
- The skeleton composite is a stand-in for WP6's `assemble`.
