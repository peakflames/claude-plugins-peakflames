# WP15 — Live plates and docs

**Runs as:** Builder · **Branch:** `feature/peak-media-wp15` (worktree, from `feature/peak-media-web2video`) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` (DEC-44..51 and the WP11 run-time findings), `acceptance.md`, `agents/builder.md`, the WP12–WP14 `handoff.md` files, and `plugins/peak-media/docs/web2video-plan.md` §4.3–§4.8 before starting.
- You own only the files listed below (paths relative to `plugins/peak-media/`). Touch nothing else. No changes to `capture.mjs` — if the docs reveal a code bug, record it in `handoff.md` for the Lead.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP15`, a `wp/WP15/handoff.md` with a `builder-id:` line, and evidence in `evidence/WP15/` (JPEG, JSON, logs only — no MP4/WAV).
- **Tests are risk-gated (user, 2026-11-10):** run only the test files your change affects. Do not run the full suite; the Verifier runs it once, and only if this WP touched shared code.
- No plan mode. Don't push. Don't merge. `TMPDIR=$(mktemp -d)` per suite run.
- Write for agents (the readers are Claude sessions following a skill): imperative, exact flags, no build-process history, no "previously/now" narration, no mention of `say()` even as a removed API.

## Scope

Rewrite against the merged code (`capture.mjs --help` is the source of truth for flags):

- `skills/video-capture/SKILL.md` — modes (§4.5: `--script`, `--spine`, `--plates/--plate`; `--no-captions`), presets (§4.6), sign-in and `--storage-state` (§4.7), the report and manifest (§4.8), cursor and `--no-cursor`, `--headed` as built, the check steps (`probe-spec --preset`, `check-take --expect-cuts <slides−1>` for decks — lead-todo WP7b N7).
- `skills/video-capture/references/storyboard-api.md` — the §4.4 API: `beat(id, fn?)`, every helper with defaults, the beat rules and their error messages as built, "between beats = silence", both example storyboards.
- `docs/reference/narration-writing.md` — any storyboard guidance moves to `beat()` and `script.md`.
- `skills/plate-factory/references/stages.md` and `skills/plate-factory/SKILL.md` where they guide live plates: a live plate's storyboard calls `beat('<plate beat>', fn)`; capture with `--plates --plate <id>` (no `--preset`).

Also document, from verify reports: `--no-cursor` also shortens a take (no ~400 ms glides); on `youtube` (no edit lists) a clip starting at 0 ms loses its first ~21 ms, so keep the spine's lead padding; `check-take` masks the caption band (`--caption-band`) and scales its threshold by frame size (DEC-50); sign-in session files are credentials (never in the project, offer deletion).

## Owns

- `skills/video-capture/SKILL.md`, `skills/video-capture/references/**`
- `docs/reference/narration-writing.md`
- `skills/plate-factory/SKILL.md`, `skills/plate-factory/references/stages.md` (live-plate text only)
- `evals/plate-factory/**` (new AC-W2V-39 test), a new `evals/video-capture/docs.test.mjs` for AC-W2V-41
- `docs/build/wp/WP15/handoff.md`, `docs/build/evidence/WP15/`

## Acceptance criteria

- **AC-W2V-39** (script) — G the F3 project (`evals/video-capture/helpers/projects.mjs` `makeF3Project`, local page) with its `beat()` storyboards · W each live plate is captured with `--plates --plate`, then `assemble` loads the project · T each plate MP4 lasts its `durationMs` ±1 frame, is picture-only, and `checkRenders` accepts it
- **AC-W2V-41** (script, grep) — G the repo · W grep `\bsay\(|waitForVoice` over Markdown in `skills/` and `docs/reference/` · T 0 hits; and every flag in `capture --help` appears in `skills/video-capture/SKILL.md` or `references/storyboard-api.md`
