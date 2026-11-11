# WP16 — The web2video skill

**Runs as:** Builder · **Branch:** `feature/peak-media-wp16` (worktree, from `feature/peak-media-web2video`) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` (DEC-44..51 and the WP11 run-time findings), `acceptance.md`, `agents/builder.md`, the WP12–WP15 `handoff.md` files, and **all of** `plugins/peak-media/docs/web2video-plan.md` before starting. Read `skills/video-capture/SKILL.md`, `skills/video-spine/SKILL.md` and `skills/plate-factory/SKILL.md` for house style.
- You own only the files listed below (paths relative to `plugins/peak-media/`). Touch nothing else. No engine code: web2video calls `capture.mjs`, `spine.mjs`, `sample-voice.mjs`, `check-take.mjs` and `lib/verify/*`; a missing engine feature is a note to the Lead in `handoff.md`.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP16`, a `wp/WP16/handoff.md` with a `builder-id:` line, and evidence in `evidence/WP16/` (JPEG, JSON, logs only — no MP4/WAV).
- **Tests are risk-gated (user, 2026-11-10):** run only the test files your change affects. Do not run the full suite; the Verifier runs it once, and only if this WP touched shared code.
- No plan mode. Don't push. Don't merge. `TMPDIR=$(mktemp -d)` per suite run.
- Write for agents: imperative steps, exact commands with `${CLAUDE_PLUGIN_ROOT}`, no build-process history. No brand or organization names.

## Scope

- `skills/web2video/SKILL.md` — frontmatter `name: web2video` and a block `description:` that says what it does and ends with `Triggers on: …` (match the other skills' frontmatter format). Body: the §4.1 workflow (setup check → intake → reachability → explore with playwright-cli → write project → **one** `AskUserQuestion` gate showing script, beats, mode, preset, path, sign-in plan, cold-read verdict → sign-in → spine → capture → checks incl. the private-data still review → hand-off). Rules: user's wording wins (edits shown original → proposed); never type a password; never upload/post/attach/send, and run no sharing CLI; a private finding blocks hand-off until the user decides (crop, hide, re-record with clean data); narrated mode with no key gives the one-line fix naming `PEAK_MEDIA_OPENROUTER_API_KEY` (or offers captions) and launches no browser; offer to delete the session file at hand-off; project folder per §4.2 (session files never inside it). Keep `SKILL.md` lean; move detail to references.
- `skills/web2video/references/presets.md` (destination words → preset, as built, incl. any U1/U2 deviations and how to state the reason at hand-off), `login.md` (§4.7), `handoff.md` (§4.9 report template and the no-upload rule).
- UAT fixtures (§7): `evals/web2video/uat/fixtures/login-demo/server.mjs` (as in §7, port 4173, loopback) and `evals/web2video/uat/fixtures/rough-app/` (sticky header over a 200-row `#rows` scroll container, a `#break` button that throws `TypeError`, footer `API key: sk-demo-0000-FLAG-ME`). Plus `evals/web2video/uat/cases.md`: the twelve UAT cases from §8 verbatim (IDs `AC-UAT-NN`), with the fixture each copies into its empty working dir.
- `evals/web2video/*.test.mjs` — the tests below.
- `evals/packaging/packaging.test.mjs` — six skills (`web2video` added; update the DEC-21 comment and message to cite DEC-45), and the brand grep covers `skills/web2video/` (it already walks `skills/`; confirm).

## Owns

- `skills/web2video/**`
- `evals/web2video/**`
- `evals/packaging/packaging.test.mjs`
- `docs/build/wp/WP16/handoff.md`, `docs/build/evidence/WP16/`

## Acceptance criteria

- **AC-W2V-36** (script + UAT) — script half here: G `PEAK_MEDIA_OPENROUTER_API_KEY` and `TTS_OPENROUTER_API_KEY` unset · W the commands web2video's narrated path runs first (`sample-voice` / `spine --budget` as the skill orders them) · T a one-line message naming `PEAK_MEDIA_OPENROUTER_API_KEY`, non-zero exit, and no browser launched; and `SKILL.md` tells Claude to stop there and offer captions. The UAT half is the missing-key UAT case (WP17)
- **AC-W2V-38** (script, grep) — G the plugin tree incl. `skills/web2video/` and `evals/web2video/` · W `grep -ri` for the brand/org names AC-PKG-03 checks · T 0 hits outside author metadata
- **AC-W2V-40** (script) — G `skills/` · W the packaging test · T exactly six skills with `SKILL.md`, `web2video` included, each `name:` matching its folder, web2video's `description` ending in a `Triggers on:` line, and each `evals/<skill>/` holding a `test(`
