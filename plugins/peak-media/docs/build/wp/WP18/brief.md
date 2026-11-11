# WP18 — Release bookkeeping (0.2.0)

**Runs as:** Lead · **Branch:** `feature/peak-media-web2video` · **Contracts:** v1

- `CHANGELOG.md` 0.2.0 bullets (≤ 50 words each; breaking changes under Changed), stays `UNDER DEVELOPMENT` until the marketplace release step dates it.
- `.claude-plugin/plugin.json` version 0.2.0 in the same commit.
- `README.md`: a web2video section (the three example prompts, presets, login) and the six-skill table.
- Then: `packaging.test.mjs` (AC-PKG-01 now passes) and `ac-run --trace` clean; ask the user before pushing and opening the PR to `develop`.

No new ACs: AC-PKG-01 (WP9) re-checks the version sync.
