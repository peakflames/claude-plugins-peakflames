builder-id: builder-wp8-abeb5dcaa90418466

# WP8 handoff — Orchestrator (`/plate-factory`)

Branch `feature/peak-media-wp8`, based on `feature/new-peak-media-plugin` @ d254fd0. Model: claude-opus-5-5, worktree Builder session (agent abeb5dcaa90418466), 2026-11-09. Every run used a scratch `TMPDIR`, deleted afterwards. No video or WAV in the repo. The full skill was not run (AC-ORC-01 is the user's run).

## Done

- **`skills/plate-factory/SKILL.md`**: a thin orchestrator over video-spine, video-plates, video-capture and video-assemble. It has the stage table with each gate line, and the rules:
  - stages run in order;
  - user gates use `AskUserQuestion`;
  - plate times come only from `retime-plates`;
  - no plate write before gate 4;
  - `runtimes.md` is Read before the first plate;
  - plates are built in the main session (subagents only for the cold read and the reviewer).
  It also names the plugin root once, so reference files can say `PM/` (Read'd references don't get `${CLAUDE_PLUGIN_ROOT}` substituted).
- **`references/stages.md`** covers:
  - the project layout and sheet naming (`review/<id>-r<N>.jpg` is reserved for self-review round N; `<id>-fix<N>.jpg` is for reviewer fixes);
  - the exact gate-line format `GATE <n> <name>: <RESULT> — <evidence>` (names brief, script, spine, plates, storyboard, pipeline, build, composite, audio, export; user gates APPROVED/REJECTED, check gates PASS/FAIL);
  - the DEC-37 "plate written" rule;
  - commands for every stage.
  The cold read is one `Agent` call with only the script text and audience. The house voice is sized at ~127 wpm (DEC-33/34). Music levels use the WP6 defaults.
- **Reviewer: one per video** (my choice, documented in stages.md). It runs after every plate's last self-review round, so one reviewer sees cross-plate consistency. Its prompt gives only `review-rubric.md`, `plates.json`, `review/storyboard.jpg` and each plate's last `-r<N>.jpg`. At most one more reviewer call, on the fixed plates only.
- **`references/review-rubric.md`**: a 13-item checklist (spec, legibility, brand, motion/frames, real material), blocker/major/minor severity, and the reviewer's answer format (`<plate> @<t>s [sev] <#>: … → fix`, then `VERDICT:`).
- **`scripts/retime-plates.mjs`** (on `runCli`; AC-BASE-13, AC-ORC-05).
  - Sets each plate's `startMs`/`durationMs` from its beat in `plates.json`'s spine, or `--spine`; that can be `manifest.json` or `beatgrid.json`.
  - Refuses a plate on an unknown beat, a beat with no plate, or two plates on one beat. The refusal is one line naming the plate or beat, and nothing is written.
  - Validates the result against `plates.v1.json`, then writes in place or to `-o`. With `-o`, relative `spine`/`brand` paths are rebased, and become absolute when the two folders share nothing below `/`.
  - `--check` writes nothing and exits 1 if any plate is off its beat. A missing spine file suggests the other spine file if one exists.
- **`evals/plate-factory/`**:
  - `transcript.mjs`: the library (`loadTranscript`, `checkGates`, `checkStoryboardFirst`, `checkSelfReview`, `checkRuntimesFirst`, `checkAll`).
  - `check-transcript.mjs`: the CLI, on `runCli`.
  - `fixtures/generate.mjs`: builds the synthetic JSONL. One good F1-shaped run, plus `bad-gate-order`, `bad-plate-before-approval`, `bad-four-rounds`, `bad-no-reviewer` and `bad-runtimes-late`, each with a reviewer subagent transcript under `session/subagents/` where one exists. A test checks the committed files equal the generator output.
  - `plate-factory.test.mjs`: 9 tests (5 AC-named, 4 checker tests). The tests clean their own temp dirs.
- **`wp/WP8/orc-01-runbook.md`** covers:
  - scratch `tmp/orc-01/` with the F1 brief (build notes stripped, Source repointed to a copied `source/` doc);
  - launching from inside it with `claude --plugin-dir "$REPO/plugins/peak-media"`;
  - the prompt, and the answer for each gate (music = the user's local groove-sauce track, SFX none);
  - finding the JSONL under `~/.claude/projects/<launch-dir-slug>/`, and the checker command.

### What the checker checks

The "line" it reports is the line number in the JSONL file. It names the subagent file when the line is in one.

- **AC-ORC-01 (transcript part).**
  - Every gate line has the right name, and a result that fits its kind.
  - Gates 0–9 each have a passing line, and the first passes come in order.
  - Each user gate has an `AskUserQuestion` since the previous gate.
  - There is an `Agent` (cold read) between gates 0 and 1.
  - Gate 9's evidence names `out/final.mp4`.
  - Markdown bold or backticks around a gate line are tolerated.
- **AC-ORC-02.** A `node … render-plate … --storyboard` call comes before `GATE 4 storyboard: APPROVED`, and no plate write comes before that line. A plate write is:
  - a Write/Edit/MultiEdit of `…/plates/<id>/index.html`;
  - a `node … render-plate` without `--storyboard` (`--help`/`--version` excluded);
  - a Bash command that redirects, tees, `sed -i`s, copies or moves onto `plates/<id>/index.html`. This shell case is beyond DEC-37's wording, so a hand fix by shell can't slip past.
- **AC-ORC-03.** Self-review rounds are main-thread Reads of `review/<id>-r<N>.jpg`. The check fails if any plate has more than 3 rounds or N > 3. It then needs an `Agent` call whose prompt or description names `review-rubric` after the last round.
- **AC-ORC-04.** The first Read of `…/vendor/hyperframes/hyperframes/references/runtimes.md` comes before the first plate write. This is checked per transcript source, so a subagent that writes a plate needs its own earlier Read.

## Results

- `node --test plugins/peak-media/evals/plate-factory`: **9/9 pass** (`evidence/WP8/builder-node-test.log`; per-AC logs `AC-ORC-02..05.log`, `AC-BASE-13.log`; checker output on all six fixtures in `checker-fixtures.log`: good = 4 PASS; each bad fixture fails only its own rule).
- `ac-run --wp WP8`: ORC-02, 03, 04, 05 and BASE-13 run **pass**; ORC-01 manual (`evidence/WP8/ac-run-WP8.log`).
- `ac-run --trace`: PASS, 79 ACs, 12 briefs, 0 problems (`evidence/WP8/ac-run-trace.log`).
- I did not run the full suite (the Lead runs it at merge).

## Open

- **AC-ORC-01, AC-ORC-02, AC-ORC-03, AC-ORC-04 — `blocked: needs user AC-ORC-01 run`.** The ORC-02..04 evals prove the checker on synthetic transcripts. The ACs themselves are about the real run: the Verifier runs `check-transcript.mjs` on the user's session JSONL (runbook §5). I didn't edit `acceptance.md` (Lead-owned); please set these statuses there.
- AC-ORC-05 and AC-BASE-13 are ready for verification.

## Deviations from the brief

- None in scope.
- Additions beyond the brief:
  - `retime-plates --check`, `--json`, and `-o` path rebasing.
  - The checker's shell-write rule and per-subagent `runtimes.md` rule.
  - Checker tests not named by AC ID: the gate-order test belongs to manual AC-ORC-01, so it carries no AC prefix.

## Notes for the Lead / Verifier

- **Not verified here: how `--plugin-dir` sets `CLAUDE_PLUGIN_DATA`.** If it points to a fresh folder, stage 0's `setup.sh --check` reports deps missing, and the skill asks before running `setup.sh` (~135 MB). The runbook says so.
- **Not verified here: `${CLAUDE_PLUGIN_ROOT}` substitution.** SKILL.md relies on it being substituted in skill text, as the sibling skills do. If the run shows it isn't substituted in Bash, every skill needs the same fix (not WP8-specific).
- The repo `CLAUDE.md` loads in the ORC-01 session because `tmp/orc-01` is inside the repo. The runbook warns the user to refuse any branch or commit attempts.
