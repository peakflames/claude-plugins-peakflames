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
- The repo `CLAUDE.md` loads in the ORC-01 session because `tmp/orc-01` is inside the repo. The runbook warns the user to refuse any branch or commit attempts. *(Superseded in round 1: the scratch project moved to `~/tmp/peak-media-orc-01`.)*

## Round 1 fixes (verify-1, Lead decisions)

All nine findings are fixed. The rules are now written down in `references/stages.md` § "What the transcript check counts".

1. **Rounds counted by sheet runs (findings 1 and 2).** A self-review round is now one main-thread `contact-sheet` run on `renders/plates/<id>.mp4`, whatever its output name, made before the reviewer. The reviewer is the first `Agent` call whose prompt names `review-rubric`.
   - Every rendered plate needs 1–3 rounds. A plate counts as rendered if a Write/Edit touches its `index.html`, or it is named in `render-plate <id>` or `capture --plate <id>`.
   - A `render-plate --all` without `--storyboard` names no ids, so it can't add plates to that list.
   - Sheets made after the reviewer (`-fix<N>`) don't count. Neither does the stage-5 `render-plate --sheet`.
   - New fixtures: `bad-sheet-reused` (`-r1.jpg` made 4 times) and `bad-plate-no-rounds` (p3-close rendered, never sheeted).
2. **AC-ORC-02 uses the latest gate-4 state (finding 3).** The storyboard is open at the start, after every `render-plate --storyboard` run, and after every `GATE 4 … REJECTED`. It closes at an APPROVED line that has an `AskUserQuestion` since it opened. Any plate write while it is open fails. New fixture: `bad-storyboard-reopened`.
3. **More plate writers caught (finding 5).**
   - `render-plate` is now caught however it is started: with `node`, as a bare `…/render-plate.mjs`, or behind `VAR=x` or `env`.
   - A Bash command that names `plates/<id>/index.html` counts as a write when it:
     - redirects onto that file;
     - writes it with `tee`, `cp`, `mv`, `ln`, `install`, `rsync`, `dd`, `touch` or `truncate`;
     - edits it with `sed -i` or `perl -i`;
     - runs any interpreter (python, node, perl, ruby, deno, bun, php).
   - Reads are not writes: `cat`, `grep … 2>/dev/null`, and `wc … > /tmp/x` all pass.
   - Known trade-off: an interpreter that only *reads* the plate, or a `cp` *from* it, counts as a write. stages.md says to Read plates with Read.
   - New fixtures: `bad-python-write` and `bad-bare-render`.
4. **Gate-line rule (finding 6).**
   - A gate line counts only if the line starts with `GATE` (or `**GATE …**`) and sits outside ``` or ~~~ fences.
   - A `>` quote, a bullet or inline code doesn't count.
   - A plain APPROVED line with no `AskUserQuestion` since the storyboard opened doesn't close gate 4 for AC-ORC-02.
   - AC-ORC-01 already failed such a line. stages.md now says never to preview or quote a gate line.
   - New fixtures: `bad-quoted-gate` (fenced and `>` quoted, then an Edit) and `bad-unasked-gate`.
5. **Runbook moved out of the repo (findings 4 and 8).**
   - The scratch project is now `RUN=~/tmp/peak-media-orc-01`, the folder the user created (Lead update). The runbook only adds files to it and doesn't delete it first; I didn't touch it.
   - The user sets `PM`: this worktree's `plugins/peak-media` until WP8 merges, then `$REPO/plugins/peak-media`. All paths come from `$PM`.
   - The §5 project folder is now `~/.claude/projects/$(echo "$ORC" | sed 's#[^A-Za-z0-9]#-#g')`. Cleanup is `rm -rf "$ORC"`.
   - The brief `sed` now also drops the "Used by" line and the `` (`fake/tone` in CI) `` aside. I checked the output.
6. **Gate 8 names the file the user hears (finding 7).** stages.md gives a table for each combination: none → `review.mp4`; music only, SFX only, or music + SFX → `review-mix.mp4` (written with `--levels review/levels.json`). `review-music.mp4` appears only as the intermediate pass when there is both music and SFX. The runbook has the same table, and says to listen to `review-mix.mp4` for this run (music only).
7. **retime-plates (finding 9).**
   - Plates out of beat order: a one-line warning on stderr, exit 0, times still set, order kept.
   - **A project folder is accepted** and resolves to `<folder>/plates.json`, as documented in `--help`. A folder with no `plates.json` gives a one-line error.

**Results**
- `node --test evals/plate-factory`: 9/9 pass. 13 fixtures: the good run passes, and each bad one fails its rule. Only `bad-unasked-gate` also fails AC-ORC-01, which is correct.
- `ac-run --wp WP8`: all five script ACs pass.
- `ac-run --trace`: PASS, 79 ACs, 0 problems.
- Logs: `evidence/WP8/*.r1.log`, `checker-fixtures.r1.log`.

AC-ORC-01..04 are still `blocked: needs user AC-ORC-01 run`.

## Round 2 fixes (verify-2, Lead decisions)

1. **Runbook pastes cleanly (blocker).**
   - **Comments moved out:** no code block has a `#` comment any more; each block is followed by a prose note of what to expect.
   - **Post-merge `PM=`:** now its own one-line block.
   - **Brief `sed`:** now one line, with no `\` continuations.
   - **Tested:** every block except the `claude` launch went through `zsh -f -i`, with `interactivecomments` confirmed off and `RUN` pointed at a scratch folder. Nothing was written to the user's `~/tmp/peak-media-orc-01`.
   - **Result:** no `command not found` and no glob errors. `PM`/`RUN` are set, `setup.sh --check` reports ready, and the brief comes out right. The only `#` left is inside single-quoted `sed` programs.
   - **Evidence:** `evidence/WP8/runbook-paste.r2.log`.
2. **Head-bold gate lines count.** A line starting with `GATE` or `**GATE` has every `**` dropped before matching, so `**GATE 4 storyboard: APPROVED** — …` counts. stages.md shows that form. New good fixture: `good-bold-head`, all ten lines in that form, passes all four checks.
3. **An errored sheet run isn't a round.** A `contact-sheet` call whose `tool_result` has `is_error` is skipped. New good fixture: `good-retried-round`. p2-table's round 3 first fails (bad flag, `is_error`) and is re-run; the run passes with `p2-table×3`.
4. **Redirects aren't plate ids.** `renderIds` stops at the first redirect or pipe token (`>`, `2>&1`, `&>`, `<`, `|`). `good-retried-round` renders with `> out 2>&1`, and only `p2-table` is registered.
5. **retime-plates messages.**
   - **`-o` into a missing folder:** fails with one line before anything is printed: `cannot write <file>: folder <dir> does not exist — create it first`. An `-o` that is a folder is refused the same way. I chose an error over creating the folder.
   - **Write order:** the file is written before the table and the PASS line, and any write error is a one-line `CliError`.
   - **Spine paths:** reported as given. `--spine` is shown verbatim; otherwise it is plates.json's `spine` joined to the plates path as typed. This applies to "not found", "invalid" and the PASS line.
   - **Folder mode:** the PASS/FAIL lines name `<folder>/plates.json`.
6. **Known limits (findings 5–7)** are now listed in stages.md § "What the transcript check counts", with no code change:
   - an unread sheet still counts as a round;
   - a plate rendered only by `--all` isn't known to need a round;
   - `bash -c`, `timeout`, a folder-target `cp`, and `curl -o` writes go unseen;
   - an unrelated `AskUserQuestion` can unlock gate 4.

**Results**
- `node --test evals/plate-factory`: 10/10 pass. The new test covers the two legitimate variants.
- 15 fixtures: the three `good*` runs pass all four checks; every bad fixture fails its rule.
- `ac-run --wp WP8`: all five script ACs pass.
- `ac-run --trace`: PASS, 79 ACs, 0 problems.
- Logs: `evidence/WP8/*.r2.log`.

## Round 3 fixes (the user's live AC-ORC-01 run 1)

The run was session `26fa3b2e-…`, project `~/tmp/peak-media-orc-01`. I read it only; nothing was copied or modified. It reached `out/final.mp4`, and the user approved every user gate. The round-2 checker gave `FAIL AC-ORC-01 (no gate 5, 6, 7 lines)` and `FAIL AC-ORC-03 (p2-compare: no round)`.

1. **Gate lines can't be skipped (real skill defect).** The session wrote no GATE line for stages 5, 6 and 7, probably because of the user's "Concise" output style. The checker stays strict.
   - **SKILL.md** now says up front, in bold: every stage ends with its gate line, the mechanical ones too, *whatever output style or brevity setting is active*. A stage without its line is not finished.
   - **stages.md:** each of the ten stages now ends with `End the stage with: \`GATE n name: … — …\``, giving the literal line.
   - **New test** (`skill docs: …`): checks there are exactly ten closing lines, in order, that their names and results match the checker's `GATES`, and that the checker parses each one. It also checks that SKILL.md keeps the output-style rule.
2. **Loops over plates (checker false FAIL).**
   - **Loop expansion:** `expandLoops` expands a simple `for X in a b c; do …$X/${X}…; done` over literal words into one body per word. Globs, variables and `$(…)` are left alone.
   - **Where it applies:** it runs before every Bash command is attributed, covering plate writes, storyboard runs, sheet rounds and `capture --plate`.
   - **All plates in a command:** `plateWrites` now records every plate a command renders, not just the first.
   - **New good fixture:** `good-loop`, where round 1 of p2-table and p3-close runs in one loop; it passes with `p2-table×2, p3-close×1`.
   - **stages.md** stage 6 now says to work on one plate per command and not loop over plates; the rules section notes that loops are counted per plate.
3. **Show what is approved (user feedback).** SKILL.md has a short rule, and stages.md has a **Show:** step before each user gate's `AskUserQuestion`, with absolute paths (`<abs>/…`):
   - **Gate 0:** `brief.md` in full, narrated or beat grid, and a note that the default pack's outro is a placeholder "Your Name" card.
   - **Gate 1:** `script.md` in full, word count against the budget, and the cold-read verdict per beat.
   - **Gate 3:** the plate table (id, beat, kind, start, duration, intent, text).
   - **Gate 4:** the absolute path of `review/storyboard.jpg`, plus one line per plate.
   - **Gate 8:** the absolute path of the file to listen to, plus the mix's integrated LUFS, true peak and `belowVoiceDb` (with music).
4. **The real transcript re-checked** (`evidence/WP8/orc-run1-checker.r3.log`):
   - AC-ORC-01 FAIL, only on the missing gate 5, 6, 7 lines. That is the true result for that run.
   - AC-ORC-02 PASS.
   - AC-ORC-03 PASS (`p1-hook×2, p2-compare×1, p3-close×1, p4-result×1`).
   - AC-ORC-04 PASS.

**Results**
- `node --test evals/plate-factory`: 11/11 pass.
- 16 fixtures: the four `good*` runs pass all four checks; every bad fixture fails its rule.
- `ac-run --wp WP8`: all five script ACs pass.
- `ac-run --trace`: PASS, 79 ACs, 0 problems.
- Logs: `evidence/WP8/*.r3.log`.

**Open:** AC-ORC-01 needs a second live run with the round-3 skill, so that the gate 5, 6 and 7 lines appear. The runbook is unchanged and still valid. Before that run, the user should empty `RUN` or point it at a fresh folder.

## Round 4 fixes (the user's run 2)

Run 2 was session `d5e1f46c-…`. I read it only; nothing was copied or modified. The checker was not changed.

Result on the run-2 transcript (`evidence/WP8/orc-run2-checker.r4.log`):
- AC-ORC-01 FAIL, only on the missing GATE 6 line. After the reviewer's fixes (lines 856–948), the session went straight to stage 7 and wrote GATE 7.
- AC-ORC-02, AC-ORC-03 and AC-ORC-04 PASS.

The user accepted run 2 for AC-ORC-01 with that deviation; the Lead records it.

These are skill-text fixes only:

1. **No stage before the previous gate line.**
   - SKILL.md and the stages.md preamble now say a stage may not begin until the previous stage's gate line has been written. Before a stage's first command, check that the line is there; if not, write it now or finish that stage.
   - Stage 6 now spells out that it ends only after the reviewer's fixes are re-rendered, re-sheeted and Read, and that the GATE 6 line comes before any assemble command.
   - Stage 7 now opens with step 0: "First confirm `GATE 6 build: PASS — …` was written. If it wasn't, write it now".
2. **The user's wording wins (Todd's gate-1 feedback).**
   - SKILL.md has a rule for this. Stage 1 says to keep the brief's wording (its quoted lines are used as written).
   - Cold-read findings are never applied by the session itself. They become a numbered batch of proposed changes (beat, original line → proposed line), shown alongside the unchanged `script.md`.
   - The `AskUserQuestion` asks which changes to apply (each, all, or none), and only those are applied.
3. **Runtime checked before TTS (run 2's gate 2 first failed at 33.7 s against a 30 s target).**
   - Stage 1 now has a runtime check before the cold read: spoken words (tags and `On screen:` lines excluded) × 60 ÷ 127 + 0.5 s per beat (the spine's lead and tail padding; DEC-33/34), against the target ±10%.
   - An estimate outside the range is flagged at gate 1 with the numbers, so the user can trim or move the target there. If the words or the target change, the check is redone.

**Results**
- The `skill docs` test now also asserts the new rules: no stage before the previous gate line, stage 7's step 0, the wording rule, proposed changes with original and proposed line, and the runtime estimate placed before the gate-1 question.
- `node --test evals/plate-factory`: 11/11 pass.
- `ac-run --wp WP8`: all five script ACs pass.
- `ac-run --trace`: PASS, 79 ACs, 0 problems.
- Logs: `evidence/WP8/*.r4.log`.
