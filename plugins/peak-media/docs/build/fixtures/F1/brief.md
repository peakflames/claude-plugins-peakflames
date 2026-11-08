# F1 — explainer-short

- **Used by:** WP3a/3b (spine), WP4 (plates), WP5 (rebrand), WP6 (assembly), WP8 (orchestrator)
- **Audience:** developers choosing a spec-driven workflow for AI coding
- **Runtime:** 20 s target (±10%), 1280×720, 30 fps
- **Spine:** narration (`fake/tone` in CI; real TTS optional)
- **Brand:** default pack
- **Source:** `../../references/openspec-vs-peak-workflow.md` §4 and §7

## Beats

1. **hook** (motion) — "Two tools, same promise…"
2. **compare** (slide) — head-to-head table, 4 rows: unit of work, requirement IDs, verification, ceremony
3. **close** (motion) — "OpenSpec wins on speed; peak-workflow wins on proof"

`spine/manifest.json` and `plates.json` here are the *expected shapes* (hand-authored for WP1); WP3b regenerates the spine from this brief.
