# WP10 — Real video

**Runs as:** Lead + user (interactive) · **Branch:** `feature/new-peak-media-plugin` · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP10`, a `wp/WP10/handoff.md` that records your agent/session ID, and evidence in `evidence/WP10/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Build the Peakflames brand pack (DEC-16; **ask before `gh repo create --private`**), make F4 with the plugin, and log every hand step in `manual-steps.md` as a next-version backlog item.

## Owns

- `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/`
- `docs/build/wp/WP10/manual-steps.md`

## Acceptance criteria

- **AC-REAL-01** (manual) — G F4 and the Peakflames pack · W the plugin makes the video · T the final contact sheet is approved and the user listens and approves
- **AC-REAL-02** (manual) — G the run · W it ends · T `wp/WP10/manual-steps.md` lists every hand step as a next-version backlog item
- **AC-REAL-03** (script + still) — G the Peakflames pack · W validate · T it passes; the outro reproduces `#s6`, checked on the contact sheet

## Lead notes (2026-11-09)

- **Music goes in the Peakflames pack (DEC-39).** Copy the user's track `~/github/peakflames/peakflames-videos/videos/2026-10-peak-workflow-short/audio/src/groove-sauce.mp3` into the private pack (e.g. `peak-media-pack/music/`). List it in the pack's `music-rules.md` (when to use it, the approved levels `--music-lufs -28 --duck-db 6`) and in a `x-tracks` entry in `brand.json` (v1 allows `x-*`; no contract change). It never enters this repo.
- **Gate 8 offers the pack's tracks.** The plate-factory stage 8 should list the brand pack's tracks (and SFX, once sourced) by name and offer them; otherwise ask for a folder the user names; otherwise narration only. No disk-wide search. This is a plate-factory change: do it as a small follow-up WP or fold it into WP10, verified like any other change.
- **SFX (DEC-40):** the pack gets an `sfx/` folder of CC0-only files with a manifest entry each (source URL, licence, duration, peak offset); F4's SFX stem is placed by hand. Automatic per-plate cue lists are next-version work — log it in `manual-steps.md`. Background: `references/sfx-research.md`.
