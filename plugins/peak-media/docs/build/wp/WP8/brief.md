# WP8 — Orchestrator

**Runs as:** Builder · **Branch:** `feature/peak-media-wp8` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP8`, a `wp/WP8/handoff.md` that records your agent/session ID, and evidence in `evidence/WP8/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Thin `/plate-factory` SKILL.md running stages 0–9 with gates (design §4): storyboard stills + contact sheet approved before any `plates/<id>/index.html`, self-review ×3 then a separate reviewer agent, vendored files loaded per `vendored-map.md` (`runtimes.md` before the first plate). References: `stages.md`, `review-rubric.md`. Prior art: self-review loop in `peakflames-videos/.claude/skills/peakflames-video/SKILL.md`. AC-ORC-02..04 are transcript greps — write the grep script into `evals/plate-factory/`.

## Owns

- `skills/plate-factory/**`

## Acceptance criteria

- **AC-ORC-01** (manual) — G the F1 brief and a fresh session · W `/peak-media:plate-factory` runs · T it reaches `out/final.mp4`, and the transcript shows each gate 0–9 in order
- **AC-ORC-02** (script (transcript grep)) — G the same run · W the transcript is checked · T the storyboard contact sheet is produced and approved **before** any `plates/<id>/index.html` is written
- **AC-ORC-03** (script) — G the same run · W the transcript is checked · T at most 3 self-review rounds per plate, then a separate reviewer agent call
- **AC-ORC-04** (script) — G the same run · W the transcript is checked · T `runtimes.md` is Read before the first plate is written
