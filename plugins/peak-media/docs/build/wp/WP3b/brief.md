# WP3b — Spine script + manifest

**Runs as:** Builder · **Branch:** `feature/peak-media-wp3b` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP3b`, a `wp/WP3b/handoff.md` that records your agent/session ID, and evidence in `evidence/WP3b/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Brief → `script.md` → clips → `spine/manifest.json` (v1 schema). Script sizing words ≈ s × wpm ÷ 60; gaps ≥ 400 ms between beats (DEC-13); beat-grid fallback (`beatgrid.json`) when no key, with zero OpenRouter calls. Use WP3a's `lib/tts` API (stub until it lands). `narration-writing.md` is a brand-neutral port of `docs/reference/narration-writing.md`. AC-SPN-04 is a user gate: produce the F1 `script.md`, run a cold-reader agent, record its output, mark `blocked: needs user approval`.

## Owns

- `skills/video-spine/SKILL.md`
- `skills/video-spine/scripts/spine.mjs`
- `skills/video-spine/references/narration-writing.md`

## Acceptance criteria

- **AC-SPN-01** (script) — G F1 (target 20 s) and the fake provider · W brief → script → spine · T `manifest.totalMs` is within 20 s ±10% and validates
- **AC-SPN-02** (script) — G F1 with the key unset · W spine runs · T `beatgrid.json` validates, there are 0 OpenRouter calls (network spy), and runtime is within ±10%
- **AC-SPN-03** (script) — G the F1 manifest · W the gaps between beats are inspected · T each is ≥ 400 ms, and `check-cuts` on `narration.wav` at the beat boundaries passes
- **AC-SPN-04** (manual) — G the F1 `script.md` · W a cold-reader agent reads it with no context · T no beat is flagged unclear; the user approves
- **AC-BASE-06** (script) — G the `spine` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
