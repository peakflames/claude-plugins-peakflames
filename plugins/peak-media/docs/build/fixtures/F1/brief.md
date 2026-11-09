# F1 — explainer-short

- **Used by:** WP3a/3b (spine), WP4 (plates), WP5 (rebrand), WP6 (assembly), WP8 (orchestrator)
- **Audience:** developers choosing a spec-driven workflow for AI coding
- **Runtime:** 20 s target (±10%), 1280×720, 30 fps
- **Spine:** narration (`fake/tone` in CI; real TTS optional)
- **Brand:** default pack
- **Source:** `../../references/openspec-vs-peak-workflow.md` §4 and §7

## Beats

1. **hook** (motion) — "Two tools, one promise: spec before code. They differ on who checks the work."
2. **compare** (slide) — head-to-head table, 4 rows: unit of work, requirement IDs, verification (traced to tests + status), human checks (recorded)
3. **close** (motion) — "OpenSpec wins on speed. Peak Workflow wins on an auditable record."

Script approved by the user 2026-11-08 (AC-SPN-04), (trimmed to 50 words to fit the ±10% runtime gate) after the cold reads flagged the "separate reviewer" wording and "wins on proof" as unclear/overclaiming.

`spine/manifest.json` and `plates.json` here are the *expected shapes* (hand-authored for WP1); WP3b regenerates the spine from this brief.
