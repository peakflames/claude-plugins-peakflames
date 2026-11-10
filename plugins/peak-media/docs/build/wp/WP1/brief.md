# WP1 — Contracts

**Runs as:** Lead · **Branch:** `feature/new-peak-media-plugin` · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP1`, a `wp/WP1/handoff.md` that records your agent/session ID, and evidence in `evidence/WP1/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Write the three v1 JSON Schemas (2020-12) per plan §3, a `validate` entry point (`lib/schemas.mjs` + CLI via `lib/cli.mjs`), good fixtures (F0, F1, neutral) and six bad fixtures, and the legacy `narration.json` → manifest mapping (D11). Write the F0–F4 fixture briefs from orchestration §6 and the Builder/Verifier/Researcher role prompts.

## Owns

- `schemas/`
- `lib/schemas.mjs`
- `lib/cli.mjs`
- `evals/fixtures/neutral-brief/`
- `docs/build/fixtures/F0..F4/` (briefs)
- `docs/build/agents/*.md`
- `.claude-plugin/plugin.json` + `CHANGELOG.md` (0.1.0, UNDER DEVELOPMENT)

## Acceptance criteria

- **AC-CON-01** (script) — G the three v1 schemas · W `validate` runs on the F0, F1 and neutral fixtures · T exit 0 for each
- **AC-CON-02** (script) — G 6 bad fixtures (missing schemaVersion, schemaVersion 2, negative duration, unknown kind, plate without beat, brand missing tokens) · W validate · T each exits non-zero and names the field
- **AC-CON-03** (script) — G the archived `narration.json` mapped into the manifest · W validate · T it passes and every legacy clip field is kept
- **AC-BASE-02** (script) — G the `validate` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed

## Gate

User freezes the v1 contracts before WP2 starts.
