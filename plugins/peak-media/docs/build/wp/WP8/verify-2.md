verifier-id: verifier-wp8-r2-45519089

# WP8 verify-2 — `/plate-factory` orchestrator

HEAD `8fcf8a4` on `feature/peak-media-wp8`. Builder: `builder-wp8-abeb5dcaa90418466`; verify-1: `verifier-wp8-r1-f4dd4434`. This round checks the round-1 fixes (`git diff 73fcd85..8fcf8a4`). AC-ORC-01 is still the user's live run, so AC-ORC-01..04 can't reach PASS yet.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-ORC-01 | BLOCKED: needs user AC-ORC-01 run | evidence/WP8/orc-01-runbook.verifier-r2.log | The runbook's content is right: the brief, the paths, the music file, `--plugin-dir`, the empty RUN outside the repo with no CLAUDE.md above it, and the transcript folder `-Users-schaveyt-tmp-peak-media-orc-01`. But its trailing `# …` comments break when pasted into the user's zsh (finding 1, blocker). Full-bold gate lines pass. Gate lines bolded only on the head don't count (finding 2) |
| AC-ORC-02 | BLOCKED: needs user AC-ORC-01 run | evidence/WP8/AC-ORC-02-04-checker-attacks.verifier-r2.log | Sound. The original attacks for findings 3, 5 and 6 now FAIL, and so do 10 fresh variants: a re-run without REJECTED, REJECTED alone, a re-APPROVED with no new ask, a subagent write while reopened, a python heredoc, macOS `sed -i ''`, a quoted absolute-path redirect, and bulleted or inline-code gate lines. Remaining holes are nits (findings 6 and 7) |
| AC-ORC-03 | BLOCKED: needs user AC-ORC-01 run | evidence/WP8/AC-ORC-02-04-checker-attacks.verifier-r2.log | Was FAIL in round 1; findings 1 and 2 are fixed. A 4th round now FAILs whether it comes from re-made `r3`, a reused `r1`, an off-pattern sheet name or two chained sheet runs; so does a plate with no round. It can't silently pass more than 3 rounds on the main thread (SKILL.md keeps plate building out of subagents). Two false-FAIL risks: findings 3 and 4 |
| AC-ORC-04 | BLOCKED: needs user AC-ORC-01 run | evidence/WP8/AC-ORC-02-04-checker-attacks.verifier-r2.log | Unchanged and sound. With the new writer forms (python, bare `render-plate`) it also names the first write correctly |
| AC-ORC-05 | PASS | evidence/WP8/AC-ORC-05.verifier-r2.log | I retimed the stale F1 fixture (6500/7500/6000) onto a fresh fake/tone spine (6591/11682/5500) with `--spine -o`. I also retimed it onto a `--no-narrate` beat grid (7500/12500/6000) using the new folder argument, in place. Every plate equals its beat, `validate` gives `ok` and `--check` passes. Plates out of order now get the warning on stderr, exit 0, keep their order and get correct times; `--json` stdout still parses. Missing, unknown and doubled beats, a duplicate id and an empty list each give exit 1 with one line naming the plate or beat, and nothing is written. The fixture is untouched |
| AC-BASE-13 | PASS | evidence/WP8/AC-BASE-13.verifier-r2.log, evidence/WP8/plate-factory-evals.verifier-r2.log | `--help` lists every flag and the new `<plates.json\|project-folder>` usage. `--version` = 0.1.0 = plugin.json. Of 14 bad inputs, usage errors exit 2 and the rest exit 1, each with one line and no stack trace. A folder without plates.json now says so (verify-1 finding 9). Imports are node: modules plus lib only. `node --test evals/plate-factory/` passes 9/9. Small message nits: finding 8 |

## Round-1 findings

| # | status | how checked |
|---|---|---|
| 1 rounds missed | fixed | Both original repros (re-made `r3`, reused `r1`) FAIL with "contact-sheet run #4". Fresh: an off-pattern sheet name and two `contact-sheet` runs in one Bash call FAIL too |
| 2 plate with no round | fixed, rule redefined | The fixture repro (sheet run and Read both gone) FAILs, and so does a fresh one (p3 only Edited). verify-1's literal repro (drop only the Read) now PASSes, because a round is now a sheet run, as stages.md documents (finding 5) |
| 3 storyboard reopened | fixed | The original repro FAILs. Fresh: a re-run with no REJECTED, REJECTED with no re-run, a re-APPROVED with no new ask and a subagent write while reopened all FAIL |
| 4 runbook in repo | fixed | RUN=`~/tmp/peak-media-orc-01` is empty and outside the repo, with no CLAUDE.md in `~/tmp` or `~`. The §5 folder is correct |
| 5 missed writers | fixed for the listed forms | The originals (bare `render-plate`, `python3 -c`) FAIL. Fresh: a python heredoc, `sed -i ''` and a quoted redirect FAIL. Remaining bypasses: finding 6 |
| 6 quoted gate line | fixed | The original repro (fenced or `>` quote, then Edit) FAILs, and a plain line before the ask FAILs both 01 and 02. Fresh: bulleted and inline-code lines FAIL. Known limit: finding 7 |
| 7 stage-8 file | fixed | stages.md now has a table of what to listen to for each stem choice; runbook §4 matches |
| 8 brief build notes | fixed | The `sed` block in a scratch dir produces a brief with 0 hits for "Used by", fake/tone or `../../references` |
| 9 retime-plates | fixed | Out-of-order input warns; a folder argument works or says "folder with no plates.json" |

**Trade-off (an interpreter that only reads a plate counts as a write): acceptable.** stages.md says "Read a plate with Read, never with an interpreter". `cat`, `grep` and `head` on a plate are not counted (my legit run did all three and passed). An interpreter read only matters in two places: inside the storyboard window, and before runtimes.md is Read. Even there it fails loudly with the line named (TRADE-OFF row), never silently. After the storyboard is approved it has no effect on 02 or 04. For 03 it only marks a plate "rendered", which every plate is anyway.

**Legit run:** this run follows stages.md exactly. Every gate line is bold. It runs `validate` and asks for a storyboard change once (rescaffold, then a second ask) before the single approval. It Reads plate HTML with Read, uses `cat`/`grep`/`head` on plates, and gives p2 3 rounds, p1 and p3 one each. A reviewer runs once, followed by fix sheets. All four checks PASS. On real sessions (3305 lines with 27 subagent files, 1197 lines with 9, and 761 lines with 1) the parser runs in ≤ 3.5 s with no crash and finds subagent `render-plate` calls.

## Scope

- `git diff d254fd0..HEAD` touches only `skills/plate-factory`, `evals/plate-factory`, `docs/build/wp/WP8` and `docs/build/evidence/WP8`. No schema or decisions.md changes this round.
- No MP4/WAV/MP3 in `evidence/WP8`.
- `grep -riE 'peakflames|groove-sauce|schaveyt'` over `skills/` and `evals/` finds 0 hits. The fixtures use `/opt/plugins` and `/home/user` paths only.

## Findings

1. **blocker (runbook): trailing `# …` comments break copy-paste in the user's shell.**
   - **Why:** the user's shell is zsh 5.9 with `interactivecomments` off, which I checked in an interactive pty.
   - **What happens:** I pasted §1 lines 24–30 and 37 one at a time:
     - line 25 runs `#` with PM as a prefix assignment: `zsh: command not found: #`, and PM stays empty (`PM=[]`);
     - lines 27, 28 and 37 die with `unknown sort specifier` or `missing end of string`, because the `(…)` in the comment is read as a glob qualifier, so the setup check never runs;
     - line 30 passes the comment words to `tail`.
   - **Knock-on:** every later `"$PM/…"` command, including `claude --plugin-dir "$PM"`, then gets an empty path. Lines 45, 114 and 115 also carry comments; they misfire, but harmlessly.
   - **Repro:** evidence/WP8/orc-01-runbook.verifier-r2.log.
   - **Fix:** move the comments into prose, or put `setopt interactivecomments` as the first line of the block.
2. **should-fix: a gate line bolded only on its head doesn't count.**
   - **What happens:** `**GATE 4 storyboard: APPROVED** — review/storyboard.jpg` isn't recognised. The strip regex needs the `**` to close at the end of the line. On the good run, all ten lines in this form give AC-ORC-01 "no passing gate line for gate(s) 0–9" and AC-ORC-02 FAIL.
   - **Why it matters:** stages.md only says "bold around it is fine", and this is a natural way for the model to format it. One stray format would spoil the single live run.
   - **Fix:** strip `**` pairs wherever they sit before matching, or make stages.md say the whole line, `**GATE … — <evidence>**`.
   - **Repro:** the "LEGIT: bold only the head" row.
3. **should-fix: a `contact-sheet` run that errored still counts as a round.**
   - **What happens:** in round 3 a typo'd sheet command fails (`is_error`) and is re-run. The checker reports "4 self-review rounds" and FAILs AC-ORC-03.
   - **Fix:** the parser already records `isError` on the `tool_result`. Count only runs whose result isn't an error.
   - **Repro:** the "LEGIT: round-3 contact-sheet errors once" row.
4. **nit: `renderIds` reads redirect targets as plate ids.**
   - **What happens:** `render-plate … p1-hook --lint > out 2>&1` registers a plate `out` with no rounds, and AC-ORC-03 FAILs.
   - **Fix:** stop at `>`, `2>&1` and similar tokens.
   - **Repro:** the "LEGIT: … `> out 2>&1`" row.
5. **nit: the minimum-round check still has two gaps.**
   - **Unread sheet:** a sheet that was made but never Read counts as a round (verify-1's literal finding-2 repro now PASSes).
   - **`--all` renders:** a plate rendered only by `render-plate plates.json --all --lint` is never registered, so having no round passes.
   - **Risk:** low, because stages.md renders each plate alone and Reads each sheet.
   - **Fix (if wanted):** require a main-thread Read of the sheet's `-o` path; treat `--all` as every plate id seen elsewhere.
6. **nit: remaining plate writers AC-ORC-02 misses (all PASS before gate 4):**
   - `bash -c "node …/render-plate.mjs plates.json p1-hook"`;
   - `timeout 600 node …/render-plate.mjs …`, because `timeout` isn't in WRAPPERS;
   - `cp /tmp/x/index.html plates/p1-hook/`, where the target is the folder;
   - `curl -o plates/p1-hook/index.html …`.

   Low risk. Adding `timeout` to WRAPPERS and treating `bash/sh/zsh -c` as a recursive parse are cheap fixes.
7. **nit (known limit, accept): an unrelated AskUserQuestion can unlock gate 4 early.**
   - **What happens:** an unrelated question after the storyboard run ("dark or light logo?"), then a premature plain `GATE 4 storyboard: APPROVED` line, then an Edit, passes 01 and 02.
   - **Why accept:** the checker can't read whether the answer was about the storyboard.
8. **nit: `retime-plates` messages.**
   - `-o /nope/dir/x.json` prints the plate table, then exits 70 with `unexpected error: ENOENT …`. It should be a CliError like "cannot write <file>", with the table printed only after the write.
   - `--spine /nope.json` reports the path rebased as `../../../…/nope.json`.
   - In folder mode the PASS line ends `→ <folder>` instead of `<folder>/plates.json`.
