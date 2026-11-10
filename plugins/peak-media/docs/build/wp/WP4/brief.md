# WP4 — Motion + slide plates

**Runs as:** Builder (render-heavy) · **Branch:** `feature/peak-media-wp4` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP4`, a `wp/WP4/handoff.md` that records your agent/session ID, and evidence in `evidence/WP4/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Copy the HF skills from `heygen-com/hyperframes@327e20208c3f` and trim per DEC-07 (keep LICENSE + CREDITS.md, strip `npx hyperframes events` lines, log every change in VENDORED.md). Build `render-plate` (one HF composition per plate, rendered alone to `renders/plates/<id>.mp4`) and the motion + slide templates; templates import the brand pack's `tokens.css`. Write `references/vendored-map.md` (explicit Read steps, including `runtimes.md`) and `plate-authoring.md`. Fixtures: F1 and F2.

## Owns

- `vendor/hyperframes/`
- `skills/video-plates/**`
- `VENDORED.md` (hyperframes section)

## Acceptance criteria

- **AC-PLT-01** (script) — G F1 `plates.json` · W `render-plate` runs for each plate · T each MP4's duration equals the planned `durationMs` ±1 frame
- **AC-PLT-02** (still) — G every rendered plate · W contact-sheet · T one sheet per plate; the Verifier confirms the brand fonts and colours, with no overflow or clipping
- **AC-PLT-03** (still) — G F2 (5 slides) · W the deck is rendered · T 5 slide plates; the sheet shows deck layout and readable text
- **AC-PLT-04** (script) — G every plate · W `hyperframes lint` and `check --strict` · T 0 errors
- **AC-VND-01** (script) — G `vendored-map.md` · W the script checks every listed path, and checks that every vendor folder is referenced · T no missing files, no orphan folders
- **AC-VND-02** (script) — G the vendor tree · W grep `hyperframes events` · T 0 hits; LICENSE is present
- **AC-BASE-08** (script) — G the `render-plate` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
