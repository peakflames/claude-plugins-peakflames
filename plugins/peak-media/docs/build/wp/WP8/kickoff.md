# WP8 kickoff — fresh Lead session

*Written 2026-11-09 by the outgoing Lead session, after WP7b was verified and merged (integration HEAD `85ccfb0`). The user asked to continue WP8 in a fresh session.*

## Paste this into the new session

Start Claude Code at the repo root (`~/github/peakflames/claude-plugins-peakflames`), on branch `feature/new-peak-media-plugin`, **not** in plan mode, and paste:

> You are the Lead for the peak-media build. Read, in order: `plugins/peak-media/docs/build/wp/WP8/kickoff.md` (this handoff), `plugins/peak-media/docs/build/orchestration-plan.md`, `plan.md`, `decisions.md` (all DEC entries — DEC-21..36 changed things since the plan), `acceptance.md`, `lead-todo.md`, and `wp/WP8/brief.md`. Then run WP8 exactly as WP1–WP7b were run: one Builder in a worktree, then a fresh Opus Verifier, then a fix round if needed, then merge `--no-ff` into `feature/new-peak-media-plugin` and update the register, CHANGELOG and milestone commit. Strict order (DEC-32): WP8 is the only active WP. After WP8, continue with WP9 then WP10 the same way, and finish with `lead-todo.md`. Never merge to `develop`. Ask before any push or `gh repo create`.

## Where the build stands

| WP | Status | Report |
|---|---|---|
| WP1 Contracts | verified, v1 frozen (DEC-24) | wp/WP1/verify-2.md |
| WP2 Skeleton + verify tools | verified | wp/WP2/verify-1.md |
| WP3a Spine TTS | verified (incl. live TTS-07, user listened) | wp/WP3a/verify-1.md |
| WP3b Spine script + manifest | verified (F1 script user-approved) | wp/WP3b/verify-1.md |
| WP4 Motion + slide plates (+ layout follow-up) | verified | wp/WP4/verify-3.md |
| WP5 Brand pack | verified | wp/WP5/verify-1.md |
| WP6 Assembly | verified (mix user-approved, AC-ASM-06) | wp/WP6/verify-2.md |
| WP7a Capture engine | verified | wp/WP7a/verify-1.md |
| WP7b Captions + mux | verified | wp/WP7b/verify-2.md |
| **WP8 Orchestrator** | **next** | — |
| WP9 Packaging | not started | — |
| WP10 Real video | not started | — |

`ac-run --trace`: 77 ACs, 0 problems. `node --test plugins/peak-media/evals`: 81/81 (about 6 min; the WP7b sync test waits to run alone at the end).

## What WP8 must know (not obvious from the brief)

- **Skill names changed (DEC-21).** The live-page renderer is `video-capture` (`capture.mjs`, `check-take.mjs`), plate kind `live`, block `live: {url?, storyboard, viewport}`. Older docs saying "recorded"/`video-record` mean this. The five skills: `plate-factory`, `video-spine`, `video-plates`, `video-capture`, `video-assemble`.
- **Plate timing must come from the spine.** After stage 2 the orchestrator must set every plate's `startMs`/`durationMs` from its beat in `spine/manifest.json` (or `beatgrid.json`). Hand-authored times drift from real TTS; `assemble` correctly refuses a mismatch (WP6 verify-2 S-3). The F1 fixture `plates.json` still carries 20 s-era times — re-time it from the spine, don't trust it.
- **House voice (DEC-33).** Default is Gemini `Rasalgethi` with the style "No-nonsense tech content creator. Plain, measured delivery: honest facts and conclusions only, no hype, no sales tone. Paced for learning." It reads at ~125–130 wpm: size scripts at that rate, not 165. Understated mood tags (`<Warm>`, `<Matter-of-fact>`, `<Calm and confident>`) are performed, not read (DEC-31). Style-instructed accents are unreliable (abandoned experiment).
- **F1 targets 26 s (DEC-34)** with the approved script (`docs/build/fixtures/F1/script.md`). Fake/tone evals run F1 at `--target-ms 20000`.
- **Music levels (WP6):** defaults `--music-lufs -28` (under the voice), `--duck-db 6`, `--sfx-lufs -20`; user approved the mix. No music ships; for F1 listening the Lead used the user's own track locally (`~/github/peakflames/peakflames-videos/videos/2026-10-peak-workflow-short/audio/src/groove-sauce.mp3`, never committed) and synthetic SFX (`evals/video-assemble/helpers/fixtures.mjs` `sfxWav`).
- **Layout (WP4 follow-up):** motion text is centred and wraps rather than shrinks; table rows and bullets reveal progressively; guarded by `evals/video-plates/layout.test.mjs`. Known nit the user may notice: the hook's first line sits alone above centre for ~1 s.
- **Prior art for the review loop:** `~/github/peakflames/peakflames-videos/.claude/skills/peakflames-video/SKILL.md` (read, don't copy — brand-specific, D17).
- **A working end-to-end F1 project** (real TTS, plates, mix) is at `tmp/f1-e2e/` (gitignored): `brief.md`, `script.md`, re-timed `plates.json`, `spine/`, `renders/`, `out/final.mp4`. Useful as a reference for what each stage produces. AC-ORC-01 still needs a fresh `/peak-media:plate-factory` run from the F1 brief.
- **AC-ORC-01 is manual and needs the plugin loaded.** The plugin isn't in `marketplace.json` until WP9, so a fresh test session must load it another way (e.g. `claude --plugin-dir plugins/peak-media`, or check current Claude Code docs for loading a local plugin). Plan for that in the WP8 brief to the Builder/Verifier.

## Rules that grew out of this build

- **Strict order (DEC-32):** one WP at a time; builders build only on merged work and stop and ask instead of using stand-ins (`agents/builder.md` rule 8).
- **The Lead checks every human-review artifact before handing it over** (open the contact sheet, measure loudness) — a stand-in test once reached the user and wasted their time.
- **Verify fixes that change behaviour** (a round 2 verifier, focused on the changes); small mechanical fixes can merge on the green suite.
- **Worktrees sometimes start on `main`.** Every Builder prompt must begin with `git checkout -B feature/peak-media-<wp> feature/new-peak-media-plugin` and a HEAD check.
- **Disk is tight (~2 GB free on 2026-11-09).** Run suites and renders with `TMPDIR=$(mktemp -d)` and delete it afterwards; evals don't yet clean their temp dirs (lead-todo item). Don't set `PEAK_MEDIA_EVIDENCE_DIR` suite-wide (WP6 and WP7b both read it).
- **`.DS_Store`** is gitignored in the plugin; delete strays in worktrees before merging (`find . -name .DS_Store -delete`).
- **Verifier independence:** `handoff.md` starts with `builder-id:`, `verify-N.md` with `verifier-id:`; `ac-run` rejects equal ids.
- **The user is terse and wants decisions, not surveys;** ask one question at a time only when it's genuinely theirs to decide (taste, scope, credentials, external repos).

## Housekeeping for the new Lead

- Eight finished agent worktrees remain under `.claude/worktrees/` (gitignored locally via `.git/info/exclude`). Their branches are merged; remove them with `git worktree remove --force <path>` once you're sure nothing is running, then `git worktree prune`.
- Open carry-forward items are in `lead-todo.md` (orchestration-plan update to strict order, eval temp-dir cleanup, WP9 nit sweep).
