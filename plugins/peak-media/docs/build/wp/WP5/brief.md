# WP5 — Brand pack

**Runs as:** Builder (light) · **Branch:** `feature/peak-media-wp5` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP5`, a `wp/WP5/handoff.md` that records your agent/session ID, and evidence in `evidence/WP5/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Neutral default pack per DEC-15: `brand.json` (v1 schema), `tokens.css` with all required custom props, Inter + JetBrains Mono woff2 with OFL.txt, placeholder `logo.svg`, plain 3 s `outro/index.html`, `music-rules.md`. No audio files. Second synthetic pack differs in colours and fonts only. For AC-BRD-02, render F1 plate 1 with both packs (use WP4's `render-plate` if merged, else the WP2 motion template).

## Owns

- `brand-packs/default/**`
- `evals/fixtures/brand-alt/` (second synthetic pack)

## Acceptance criteria

- **AC-BRD-01** (script) — G `brand-packs/default` · W validate · T it passes; every font has a licence file
- **AC-BRD-02** (still) — G F1 plate 1 rendered with the default pack and with a second synthetic pack · W both contact sheets are compared · T colours and fonts differ, and nothing but `--brand` changed
- **AC-BRD-03** (script) — G the plugin tree · W search for audio files · T no music ships
- **Re-check (from WP2 F-9):** after the default pack lands, re-run AC-SKL-06 (offline render) with `--brand brand-packs/default` so web fonts are covered.
