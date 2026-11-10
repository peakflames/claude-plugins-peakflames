# WP8 — Orchestrator

**Runs as:** Builder · **Branch:** `feature/peak-media-wp8` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP8`, a `wp/WP8/handoff.md` that records your agent/session ID, and evidence in `evidence/WP8/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Thin `/plate-factory` SKILL.md running stages 0–9 with gates (design §4): storyboard stills + contact sheet approved before any `plates/<id>/index.html`, self-review ×3 then a separate reviewer agent, vendored files loaded per `vendored-map.md` (`runtimes.md` before the first plate). References: `stages.md`, `review-rubric.md`. Prior art: self-review loop in `peakflames-videos/.claude/skills/peakflames-video/SKILL.md`. AC-ORC-02..04 are transcript greps — write the grep script into `evals/plate-factory/`.

## Owns

- `skills/plate-factory/**` (SKILL.md, `references/{stages,review-rubric}.md`, `scripts/retime-plates.mjs`)
- `evals/plate-factory/**` (transcript checker, its fixtures and tests)
- `docs/build/wp/WP8/**`, `docs/build/evidence/WP8/**`

## Acceptance criteria

- **AC-ORC-01** (manual) — G the F1 brief and a fresh session · W `/peak-media:plate-factory` runs · T it reaches `out/final.mp4`, and the transcript shows each gate 0–9 in order
- **AC-ORC-02** (script (transcript grep)) — G the same run · W the transcript is checked · T the storyboard contact sheet is produced and approved **before** any `plates/<id>/index.html` is written
- **AC-ORC-03** (script) — G the same run · W the transcript is checked · T at most 3 self-review rounds per plate, then a separate reviewer agent call
- **AC-ORC-04** (script) — G the same run · W the transcript is checked · T `runtimes.md` is Read before the first plate is written
- **AC-ORC-05** (script) — G the F1 fixture `plates.json` (stale 20 s-era times) and an F1 spine manifest · W `retime-plates` runs · T every plate's `startMs`/`durationMs` equals its beat's, the file validates, and a plate list that doesn't map one plate per beat (missing beat, unknown beat, two plates on one beat) exits non-zero naming the plate or beat
- **AC-BASE-13** (script) — G the `retime-plates` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed

## Lead notes (2026-11-09)

Read `wp/WP8/kickoff.md` § "What WP8 must know" first: skill names (DEC-21), house voice and pacing (DEC-33/34), music levels, layout. The rest:

- **Use what exists; don't rebuild it.** `video-spine/spine.mjs` (stage 2), `render-plate --storyboard` (stage 4, writes `review/storyboard.jpg` + `review/storyboard/<id>.png`), `render-plate <id>` (stages 5–6), `contact-sheet` (`lib/verify/contact-sheet.mjs`), `assemble` with `--music/--sfx/--export` (stages 7–9), `video-capture` for `live` plates. The orchestrator is a thin SKILL.md over these. Call scripts through `${CLAUDE_PLUGIN_ROOT}` like the other skills. Read every sibling SKILL.md before writing yours. Prior art for the review loop: `~/github/peakflames/peakflames-videos/.claude/skills/peakflames-video/SKILL.md` (read, don't copy — D17).
- **Plate timing comes from the spine (DEC-37).** Build `skills/plate-factory/scripts/retime-plates.mjs` on `lib/cli.mjs`: reads `plates.json` + its spine (`manifest.json` or `beatgrid.json`), sets each plate's `startMs`/`durationMs` from its beat, validates against `plates.v1.json`, writes in place (or `-o`). One plate per beat; anything else is a one-line refusal (assembly needs cuts in the silent gaps between beats). The skill runs it right after stage 2/3, before the storyboard.
- **Gate markers.** Every stage ends with one grep-able line in the assistant's text, same format for all ten, e.g. `GATE 4 storyboard: APPROVED — review/storyboard.jpg`. Specify the exact format in `references/stages.md`. User gates (0 brief, 1 script, 3 plate list, 4 storyboard, 8 listen) ask with `AskUserQuestion`; mechanical gates (2, 5, 6, 7, 9) report the check's result. Stage 1 cold read is a separate `Agent` call with no repo context.
- **Self-review ×3 then a reviewer.** Each self-review round writes a numbered sheet (e.g. `review/<id>-r<N>.jpg`) and Reads it; at most 3 rounds per plate, then one `Agent` call per video (or per plate — your choice, document it) with `references/review-rubric.md`, the sheets and `plates.json` only. Fixes name the plate and re-render only that plate.
- **AC-ORC-02 meaning (DEC-37).** `render-plate --storyboard` scaffolds `plates/<id>/index.html` from the kind's template; that is not authoring. "Written" = a `Write`/`Edit` tool call on `plates/<id>/index.html`, or a `render-plate` call without `--storyboard`. Either must come after the stage-4 approval.
- **Transcript checker.** `evals/plate-factory/` holds a checker (library + CLI: `node evals/plate-factory/check-transcript.mjs <session.jsonl>`) that reads a Claude Code session JSONL and reports ORC-01's gate order (0–9 present, in order) and ORC-02/03/04 as PASS/FAIL with the offending line. Learn the JSONL shape from a real file under `~/.claude/projects/-Users-schaveyt-github-peakflames-claude-plugins-peakflames/` (tool calls are `tool_use` blocks in `assistant` messages; check how `Agent`, `Read`, `Write`, `Bash`, `AskUserQuestion` appear; subagent transcripts may live in a `<session>/subagents/` folder). Copy no real transcript into the repo: the evals use small synthetic JSONL fixtures — one good run, and one bad fixture per rule (gate out of order, plate written before approval, 4 self-review rounds, no reviewer call, `runtimes.md` read after the first plate). The ORC-02..04 evals pass on the good one and fail correctly on each bad one; the Verifier later runs the CLI on the real AC-ORC-01 transcript.
- **AC-ORC-01 is the user's run.** Prepare `wp/WP8/orc-01-runbook.md`: a scratch project under the repo's gitignored `tmp/orc-01/` with a copy of the F1 brief; the launch command (`claude --plugin-dir plugins/peak-media`, started where the project expects — check current Claude Code docs for how `--plugin-dir` resolves and whether setup/deps need `CLAUDE_PLUGIN_DATA`); the prompt to type (`/peak-media:plate-factory` with the brief path, target 26 s); what to answer at each gate; how to find the session JSONL afterwards; and the checker command. Mark ORC-01..04 `blocked: needs user AC-ORC-01 run`. Do not run the full skill yourself.
- **No stand-ins (DEC-32).** Everything you need is merged. If something is missing, stop and report.
- **Disk is tight (~4 GB free).** Run anything that renders with `TMPDIR=$(mktemp -d)` and delete it after. Run only the evals you touch plus `ac-run --trace`; the full suite takes ~6 min and the Lead runs it at merge. Delete `.DS_Store` strays before committing.
