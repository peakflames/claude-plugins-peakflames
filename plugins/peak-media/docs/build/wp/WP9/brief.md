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
- **AC-PKG-04** (script) — G macOS with the prerequisites · W `setup.sh` then the F1 neutral eval · T it passes with no manual steps
- **AC-PKG-05** (manual) — G a fresh session with only the plugin · W it is asked for (a) a 20 s explainer and (b) a captioned live-capture demo · T both pass using only SKILL.md files; a reviewer agent checks D7–D10
- **AC-PKG-06** (script) — G `evals/` · W `node --test plugins/peak-media/evals` · T at least one eval per skill, and all pass
- **AC-PKG-07** (script) — G VENDORED.md · W check · T each vendor folder has source, commit, date, licence and a list of local changes; GSAP and fonts are listed as fetched or bundled
- **AC-PKG-08** (script) — G macOS · W setup + F0 with a prerequisite missing (ffmpeg, browser, key) · T it prints the one-line message for what's missing
- **AC-PKG-09** (manual) — G README · W read · T it covers install steps, prerequisites, the key setup, and the three modes

## Lead notes (2026-11-09)

Read `wp/WP8/kickoff.md` § "Rules that grew out of this build" and `lead-todo.md` first.

- **Ownership added for the nit sweep:** besides the folders above, you may make the small fixes listed in `lead-todo.md` → "WP9 sweep" and "WP8 carry-forward" in the files they name (`skills/video-capture/**`, `skills/video-assemble/**`, `skills/video-plates/**`, `skills/plate-factory/**`, `evals/**`). Behaviour must not change beyond what each nit says; list each one in `handoff.md`. WP7b N3 (a v2 take kind) is a contract change — don't do it; note it as next-version.
- **Eval temp dirs (lead-todo):** add an auto-cleaning `tmpDir()` to `evals/helpers/run.mjs` and switch every eval to it. After a full suite run with a fresh `TMPDIR`, that dir must be empty (log it as evidence).
- **Five skills** (DEC-21): `plate-factory`, `video-spine`, `video-plates`, `video-capture`, `video-assemble`. AC-PKG-06 needs ≥ 1 eval per skill.
- **Marketplace:** add the peak-media entry to `.claude-plugin/marketplace.json` (`source: ./plugins/peak-media`); don't bump `metadata.version` (DEC-19 — that's the release step). Check `plugins/peak-media/.gitignore` keeps `node_modules/` and renders out of the repo.
- **README:** install (marketplace add, `#develop` / branch for unreleased), prerequisites (Node ≥ 22, ffmpeg, disk), `setup.sh`, the key (`PEAK_MEDIA_OPENROUTER_API_KEY`, ZDR note DEC-04), the three modes (narrated, beat grid with no key, live capture), the house voice (DEC-33), the default pack's placeholder outro ("Your Name") and how to point `--brand` at your own pack, and where music/SFX come from (DEC-39/40: your pack or a folder you name; nothing ships). Keep it user-facing; no build-process detail.
- **AC-PKG-04/08 container:** Docker is installed but not running; `colima` is at `/opt/homebrew/bin/colima`. You may `colima start` (and `colima stop` when done) and use `node:22` (slim is fine if setup.sh installs what it needs; document what you used). Disk is ~10 GB free — remove images/containers you create when finished. If the container can't run, stop and report rather than mark anything.
- **AC-PKG-02 and AC-PKG-05 are manual and need the Lead/user:** PKG-02 needs the branch on GitHub (a push the user must approve). Prepare `wp/WP9/pkg-02-05-runbook.md`: for PKG-02, the exact `/plugin marketplace add …#feature/new-peak-media-plugin` and `/plugin install` steps and what to look for; for PKG-05, a fresh-session plan (scratch folder outside the repo, prompts for (a) a 20 s explainer and (b) a captioned live-capture demo, and the reviewer-agent prompt that checks D7–D10). Mark both `blocked: needs user`.
- **D17 (AC-PKG-03):** zero `peakflames` hits in the runtime tree, case-insensitive.
- Disk: `TMPDIR=$(mktemp -d)` for every suite run; delete after. Delete `.DS_Store` strays before committing.
