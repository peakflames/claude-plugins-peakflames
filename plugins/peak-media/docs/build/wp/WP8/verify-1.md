verifier-id: verifier-wp8-r1-f4dd4434

# WP8 verify-1 — `/plate-factory` orchestrator

HEAD `1aed81f` on `feature/peak-media-wp8`. Builder: `builder-wp8-abeb5dcaa90418466`. Round 1. AC-ORC-01 is the user's live run (not done yet), so ORC-01..04 can't reach PASS this round.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-ORC-01 | BLOCKED: needs user AC-ORC-01 run | this report § Preparation | Every stage 0–9 maps onto merged scripts whose flags exist (checked against each `--help`). Gate names and kinds in SKILL.md and stages.md match the checker. House voice, 127 wpm, 26 s target and music defaults (−28 / 6 dB / −20) are right. Findings 4, 7 and 8 are about the runbook |
| AC-ORC-02 | BLOCKED: needs user AC-ORC-01 run | evidence/WP8/plate-factory-evals.verifier.log, evidence/WP8/AC-ORC-02-04-checker-attacks.verifier.log | Sound for the AC as written: it catches Write, Edit, heredoc, `node -e`, `render-plate` without `--storyboard` and subagent writes made before gate 4, plus a storyboard that was never produced. Holes: findings 3 and 5 |
| AC-ORC-03 | FAIL | evidence/WP8/AC-ORC-02-04-checker-attacks.verifier.log | The checker can report PASS on a run with more than 3 self-review rounds (finding 1), and on a plate that had none (finding 2). It correctly catches a missing reviewer, a reviewer called before the self-review rounds, a reviewer with no rubric, and sheets Read only by a subagent |
| AC-ORC-04 | BLOCKED: needs user AC-ORC-01 run | evidence/WP8/AC-ORC-02-04-checker-attacks.verifier.log | Sound: it fails on a late Read, a Read only by a subagent, a `cat` instead of a Read, and a subagent writing a plate without its own Read |
| AC-ORC-05 | PASS | evidence/WP8/AC-ORC-05.verifier.log, evidence/WP8/plate-factory-evals.verifier.log | Took the stale F1 fixture times (6500/7500/6000) onto a fake/tone F1 spine at 26 s (6591/11682/5500) and onto a `--no-narrate` beatgrid (7500/12500/6000). All plates equal their beats; `validate` passes; `--check` passes afterwards; the fixture is untouched. A missing beat, an unknown beat, two plates on one beat, a duplicate id and an empty list each give exit 1 with one line naming the plate or beat, and nothing is written |
| AC-BASE-13 | PASS | evidence/WP8/AC-BASE-13.verifier.log | `--help` lists `-o/--out --spine --check --json -h --version`. `--version` = 0.1.0 = plugin.json. 14 bad inputs: usage errors exit 2 (one line plus the shared "Run --help" hint), the rest exit 1 with one actionable line, and no stack trace anywhere. Imports are node:fs/path/url plus lib/cli and lib/schemas only, so it makes no network calls |

## Preparation (AC-ORC-01)

- **Commands vs `--help`:** I checked spine (`--budget --wpm`, defaults Rasalgethi plus house style), render-plate (`--all --storyboard --rescaffold --lint --sheet`), contact-sheet (`--every -o`), check-cuts (`--cuts --min-silence-ms`), assemble (`. --music --sfx --export`, defaults −28/6/−20), remux-audio (`-o --music --sfx --levels`), capture (`--plates --plate`), `validate` and `setup.sh --check`. Every flag used in stages.md exists.
- **Vendored files:** the stage-4 Read list matches vendored-map steps 1–4, and every file exists.
- **Checker's regexes vs stages.md:** they match how stages.md names `runtimes.md`, `review/<id>-r<N>.jpg` and the reviewer prompt that names `review-rubric.md`.
- **Plugin loading:** `claude --plugin-dir` exists. The CLI binary substitutes `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` in plugin skill text.
- **Deps:** `setup.sh --check` is ready under `~/.cache/peak-media`. A `--plugin-dir` session may set its own `CLAUDE_PLUGIN_DATA`, which would mean a ~135 MB setup on the first run. The runbook already covers this.
- **Brief:** the runbook's `sed` produces a valid brief (26 s, 3 beats, `source/…` path), apart from finding 8.
- **Real JSONL shape:** I compared the checker's parsing with two real sessions and their `subagents/` folders. Tool calls, inputs, `tool_result` blocks, `isSidechain` and `agent-*.jsonl` (with `.meta.json` ignored) all match. `api-request-blob` and `attachment` lines are correctly ignored. The checker runs on a real 4k-line session without crashing and finds a subagent's `render-plate` call.

## Scope

- No files outside the owned folders: `git diff d254fd0 HEAD` touches only `skills/plate-factory`, `evals/plate-factory`, `wp/WP8` and `evidence/WP8`.
- No changes to schemas or decisions.md. The `retime-plates` entry point is logged as DEC-37.
- No MP4, WAV or other audio/video in `evidence/WP8`.
- `grep -ri peakflames` over `skills/` and `evals/` finds nothing.

## Findings

1. **should-fix (it causes the AC-ORC-03 FAIL): the self-review count can miss rounds.**
   - **What happens:** `checkSelfReview` counts *distinct* sheet numbers. If the same sheet name is rendered and Read again, that is an extra round, but it isn't counted.
   - **Repro:** in a copy of the good fixture, after `p2-table-r2.jpg` add twice: Edit `plates/p2-table/index.html`, then `render-plate … p2-table --lint`, then `contact-sheet … -o review/p2-table-r3.jpg`, then Read it. That is 4 rounds. The checker says `PASS … p2-table×3`. Reusing `-r1` after `-r3` passes the same way.
   - **Fix:** count `contact-sheet … -o review/<id>-r<N>.jpg` calls (or Reads that follow a new render of that plate) per plate, not distinct N.
2. **should-fix: a plate with no self-review round passes AC-ORC-03.**
   - **What happens:** `checkSelfReview` only looks at plates that already have rounds, but its own help text says "1–3 self-review rounds per plate".
   - **Repro:** drop the Read of `review/p3-close-r1.jpg` from the good fixture. The checker says `PASS … p1-hook×1, p2-table×2`.
   - **Fix:** take the plate ids from the plate writes and `render-plate <id>` calls, and require at least 1 round for each.
3. **should-fix: AC-ORC-02 only uses the first `GATE 4 storyboard: APPROVED`.**
   - **What happens:** once the storyboard is re-opened (`render-plate --all --storyboard --rescaffold`, then `GATE 4 storyboard: REJECTED`), a plate edited before the new APPROVED still passes, although SKILL.md says "going back repeats every stage after it".
   - **Repro:** before the reviewer call in the good fixture, add: storyboard `--rescaffold`, Read the storyboard, `GATE 4 … REJECTED`, Edit `plates/p3-close/index.html`, ask, `GATE 4 … APPROVED`. The checker says PASS.
   - **Fix:** a later `--storyboard` run or a REJECTED gate-4 line opens a window in which writes FAIL until the next APPROVED.
4. **should-fix: move the runbook's scratch project out of the repo.**
   - **Why:** `tmp/orc-01` sits inside the repo, so the session loads the repo's CLAUDE.md (git and release rules) and runs inside a git work tree on a feature branch. More importantly, the "fresh" session can reach the finished `tmp/f1-e2e/` project (plates.json, renders, `out/final.mp4`), the F1 fixtures and the plugin source. It could copy from them or "fix" plugin code mid-run, which spoils the test and isn't how a user would run it.
   - **Fix:** use e.g. `ORC=~/peak-media-orc-01`. The copies use absolute paths and `--plugin-dir` is already absolute. Change the §5 project folder to `$(echo "$ORC" | sed 's#/#-#g')`, and change cleanup to match.
5. **nit: AC-ORC-02 misses some ways of writing a plate.**
   - **What's missed:** `render-plate` started without `node` (`"…/render-plate.mjs" plates.json p1-hook`), and writers that aren't shell redirects, such as `python3 -c "open('plates/p1-hook/index.html','w')"`.
   - **Repro:** insert either before gate 4. The checker says PASS.
   - **Risk:** low, because stages.md always uses `node`.
6. **nit: a gate line the assistant merely quotes counts as that gate passing.**
   - **What happens:** a gate line quoted alone on a line (e.g. "when you approve I'll write:" followed by the line) is taken as the pass. AC-ORC-01 would then FAIL, because there's no AskUserQuestion before it. But AC-ORC-02 would measure from the quote, so a plate written between the quote and the real approval would pass.
   - **Fix:** for user gates, count only a line that comes after an AskUserQuestion since the previous gate.
7. **nit: stage 8 with music and no SFX (the runbook's answer).**
   - **What happens:** the first pass writes `review/review-music.mp4`; `review-mix.mp4` comes only from the `--sfx` pass. Yet the gate-8 line and runbook §4 point the user to `review/review-mix.mp4`.
   - **Fix:** say that with music only, the music pass writes `review/review-mix.mp4` (`--levels review/levels.json`).
8. **nit: the runbook's brief keeps build notes.** The `- **Used by:** WP3a/3b …` line and the `` (`fake/tone` in CI) `` aside survive the `sed`, and the aside could steer the session toward `--tts-model fake/tone`. Strip both.
9. **nit: two small `retime-plates` issues.**
   - **Order:** it accepts plates out of beat order and writes them in that order, although stages.md says "in beat order". Sort or warn.
   - **Message:** a directory argument says "no such file".
