# WP9 — Packaging

**Runs as:** Builder · **Branch:** `feature/peak-media-wp9` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP9`, a `wp/WP9/handoff.md` that records your agent/session ID, and evidence in `evidence/WP9/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

README (install, prerequisites, key setup, three modes), final VENDORED.md (HF skills, GSAP fetched, fonts bundled), marketplace entry (no marketplace version bump — DEC-19), one eval per skill, D17 grep, clean node:22 container run, and a check that `docs/build/` holds nothing heavier than JPEG/JSON/log. Copy reference notes the skills need into `skills/video-spine/references/`.

## Owns

- `README.md`
- `VENDORED.md` (final)
- `.claude-plugin/marketplace.json` (peak-media entry only)
- `evals/ sweep`

## Acceptance criteria

- **AC-PKG-01** (script) — G the repo · W check · T `plugin.json` version = the top CHANGELOG entry; marketplace.json lists peak-media
- **AC-PKG-02** (manual) — G `/plugin marketplace add peakflames/claude-plugins-peakflames#feature/new-peak-media-plugin` · W install · T the 5 peak-media skills are listed, and `web2video` is not
- **AC-PKG-03** (script) — G the plugin tree · W `grep -ri peakflames` over the runtime tree (`skills/ lib/ schemas/ brand-packs/ vendor/ scripts/ evals/`, so `docs/` and the plugin.json author/repository fields are excluded) · T 0 hits; no brand assets in examples
- **AC-PKG-04** (script + manual) — G a clean Linux container (node:22) · W `setup.sh` then the F1 neutral eval · T it passes with no manual steps; macOS is checked once by hand
- **AC-PKG-05** (manual) — G a fresh session with only the plugin · W it is asked for (a) a 20 s explainer and (b) a captioned recorded demo · T both pass using only SKILL.md files; a reviewer agent checks D7–D10
- **AC-PKG-06** (script) — G `evals/` · W `node --test plugins/peak-media/evals` · T at least one eval per skill, and all pass
- **AC-PKG-07** (script) — G VENDORED.md · W check · T each vendor folder has source, commit, date, licence and a list of local changes; GSAP and fonts are listed as fetched or bundled
- **AC-PKG-08** (script) — G a headless or cloud environment (CI container) · W setup + F0 · T it passes, or prints the one-line message for what's missing
- **AC-PKG-09** (manual) — G README · W read · T it covers install steps, prerequisites, the key setup, and the three modes
