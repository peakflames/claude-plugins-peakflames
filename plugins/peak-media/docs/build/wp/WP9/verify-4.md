verifier-id: verifier-wp9-r4-301eaf5b

# WP9 verify-4 — Packaging (rounds 4 and 5: gate lines printed by scripts)

- Builder: `builder-wp9-ae42bf332f2a3a11c` (handoff.md). Earlier verifiers: r1–r3. This ID is distinct.
- Scope: `git diff 232ab7b..30d0f64` (worktree `agent-ae42bf332f2a3a11c`, branch `feature/peak-media-wp9`, HEAD `30d0f64`). macOS only, no containers.
- Evidence: `evidence/WP9/*.r4.verifier.log`. Nothing committed, no code/tests/docs edited.

## ACs re-checked

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PKG-01 | PASS | ac-run-WP9.r4.verifier.log | ac-run script pass; plugin.json / CHANGELOG / marketplace.json not touched in r4/r5 |
| AC-PKG-02 | BLOCKED: needs user (user evidence present) | evidence/WP9/AC-PKG-02-user.md | The user recorded a PASS (5 skills, no `web2video`). A verifier can't run it |
| AC-PKG-03 | PASS | ac-run-WP9.r4.verifier.log | 0 `peakflames` hits in the runtime tree, including the new `gate.mjs` and the new fixtures |
| AC-PKG-04 | PASS | AC-PKG-06-suite.r4.verifier.log | macOS setup.sh then F1 with no key, run in the suite |
| AC-PKG-05 | BLOCKED: needs user | AC-PKG-05-a.md, AC-PKG-05-a-r2.md | The r2 cold start still fails AC-ORC-01 (gates 1, 2, 5, 6). Round 5 is untested in a cold start, so the Lead needs to re-run it (an `explainer-r3` run was in progress on this machine during my checks) |
| AC-PKG-06 | PASS | AC-PKG-06-suite.r4.verifier.log, AC-REC-06-rerun.r4.verifier.log | Full suite, fresh TMPDIR: **107 tests, 106 pass, 1 fail**, 526 s. The failure was AC-REC-06, one take with a 284 ms outlier (limit 200 ms) while another cold-start render was running. video-capture and lib didn't change in r4/r5. Rerunning `captions-mux.test.mjs` alone gave 10/10 pass. TMPDIR afterwards held only `node-compile-cache`, then I deleted it |
| AC-PKG-07 | PASS | ac-run-WP9.r4.verifier.log | Unchanged |
| AC-PKG-08 | PASS | ac-run-WP9.r4.verifier.log | Unchanged |
| AC-PKG-09 | BLOCKED: needs user (user evidence present) | evidence/WP9/AC-PKG-09-user.md | The user recorded a PASS |
| AC-ORC-01 (transcript part) | PASS (fixtures) / open (live run) | checker-probes.r4.verifier.log | All 18 fixtures behave as named: the 5 good ones pass, and each bad one fails only its own AC. The real r2 transcript still fails (1, 2, 5, 6), as expected for an older skill |
| AC-ORC-02/03/04 | PASS | ac-run-WP8.r4.verifier.log | ac-run --wp WP8: all script ACs pass (ORC-02..05, BASE-13) |
| AC-BASE-01 | PASS | AC-BASE-01.r4.verifier.log | `setup.sh --help` lists the flags, `--version` 0.1.0 = plugin.json, `--bogus` gives one line and exit 2 |
| trace | PASS | ac-run-trace.r4.verifier.log | 79 ACs, 12 briefs, 0 problems |

## My own probes

**Scripts** (`script-gates.r4.verifier.log`). I built a real project from F1 (brief, script, plates) with the default pack and no key:
- `spine.mjs`. Beat grid (no key) prints `GATE 2 spine: PASS — spine/beatgrid.json 26000 ms (target 26000 ±10%)`. fake/tone narration prints `… spine/manifest.json 23773 ms (target 26000 ±10%)`. With `--target-ms 15000` it prints `GATE 2 spine: FAIL — …`, writes one stderr line and exits 1. All match the SKILL.md table.
- `render-plate --pipeline-test`. PASS prints `GATE 5 pipeline: PASS — renders/plates/p1-hook.mp4 (6600 ms, lint clean)`. A wrong id gives FAIL and exit 2. A broken `__timelines` gives a lint FAIL line, one stderr line and exit 1.
- `gate.mjs build .` FAILs correctly, with one line and exit 1, on each of these:
  - missing renders
  - no `plate-review.md`
  - a plate not named in the review
  - 1 of 2 defects unfixed
  - no Defects/Fixed lines
  - a render newer than its sheet
  - a wrong-duration render
  - a missing plates.json

  It PASSes with `3 plates; reviewer: 1 defects, 1 fixed`.
- `assemble.mjs .` prints `GATE 7 composite: PASS — review/review.mp4 (2 cuts in ≥300 ms silence)`. With `--json` the line goes to stderr. The cut-FAIL form is covered by the AC-ASM-01 eval.

**Checker** (`checker-probes.r4.verifier.log`). I replaced the `good-script-gates` GATE 5 Bash command and kept its output:
- Not counted: echo, printf with `\x47ATE`, `cat` of a file with the script name only in a comment, a literal heredoc, and spine.mjs or gate.mjs printing a GATE 5 line.
- Counted, correctly: the real run, `2>&1 | tail -3`, `retime && pipeline-test`, and `$PM/…` paths.
- Fooled (F1 below).

**Docs.** SKILL.md and stages.md agree:
- The model writes 0, 1, 3, 4, 8, 9.
- The scripts print 2, 5, 6, 7, and the model is told never to type or echo them.
- No gate line while waiting; REJECTED only for a refusal.

video-spine and video-plates SKILL.md match. There are no contradictions, only the nits below.

**Scope.** Changes outside the brief's "Owns" list:
- `spine.mjs` and `video-spine/SKILL.md`: the Lead's round-5 instruction, recorded in the handoff.
- New `plate-factory/scripts/gate.mjs`.
- `render-plate.mjs`, `video-plates/SKILL.md`, `assemble.mjs` and the plate-factory docs/evals: these are the round-5 task itself (my brief names them), but the handoff's Ownership line lists only spine and gate.mjs.

There are no schema or contract changes. No MP4/WAV in the diff. No stray processes after my runs.

## Findings

| ID | Severity | Finding | Repro |
|---|---|---|---|
| F1 | Minor | **The checker credits any GATE 2/5/6/7 line in the output of a Bash call where any segment runs a file with that script's basename.** It doesn't check the plugin path or the arguments, and other output from the same call counts too. It is fooled by `node …/render-plate.mjs --help; cat fake.txt`, `cat fake.txt \| node render-plate.mjs --version`, `node /tmp/render-plate.mjs` (the model's own file), `node -e "console.log('GA'+'TE 5 …')" render-plate.mjs`, and `X=GATE; cat <<EOF … $X 5 …`. All of these take deliberate forgery; an honest run won't hit them. A tighter rule would need the script path under the plugin root and no `--help`/`--version`, or a list in "Known limits" | checker-probes.r4.verifier.log, "forged/legit variants" |
| F2 | Minor | **`assemble` prints GATE 7 fourth from the end** (outro, final and the path follow it). The cold-start model habitually pipes output through `\| tail -N` (r2 used `tail -12`/`-8`), so `assemble . 2>&1 \| tail -3` drops the gate line and AC-ORC-01 fails for gate 7. The other three scripts print their line last. Fix: print the line last, or tell the model not to trim assemble's output | script-gates log, assemble section: the last 3 lines contain no GATE |
| F3 | Minor | **Checker false negatives on plausible commands:** a command that greps for the line (`… --pipeline-test \| grep -E "lint\|GATE 5"`) is skipped by the "command contains a gate line" rule, and a `bash -c '…render-plate…'` wrapper isn't recognised. stages.md "Known limits" lists `bash -c` for plate writes but not for gate lines | checker-probes log, "legit-ish" and "bash -c" |
| F4 | Minor | **Failures before the check print no `GATE … FAIL` line:** spine (missing script.md, beat mismatch, TTS error) and assemble (missing render, plates outside a beat) print only the one-line error. render-plate `--pipeline-test` with `--all` (usage) does the same. gate.mjs prints a FAIL line on all of its own checks; I didn't probe the case where ffmpeg is missing. That doesn't break AC-ORC-01, which only needs the first PASS. But the handoff's "FAIL on stdout plus the one-line error" holds only for the runtime and cut checks | script-gates log, "spine FAIL (no script.md)" and "assemble (p3-close render missing)" |
| F5 | Nit | **`gate.mjs` record and sheet matching is looser and stricter than it reads:** (a) `**Defects:** 1` (bold with the colon inside, the common Markdown form) and `- Defects: 1` are rejected, while `**Defects**: 1` passes. The FAIL message says what to write, so this costs only a rerun. (b) A sheet counts if any `review/*.jpg` name *contains* the plate id and is newer than the render; an empty `x-p1-hook-unrelated.jpg` passed. Ids that are prefixes of other ids (`p1` / `p10`) would share sheets and review mentions | script-gates log, gate build section |
| F6 | Nit | **stages.md still says "the stage-5 `render-plate --sheet`"** in the self-review-round rule (stage 5 is now `--pipeline-test`). The "Known limits" bullet says "write gate n−1's line" without the "(or run its script)" qualifier the next section adds | stages.md § "What the transcript check counts" |
| F7 | Info | AC-REC-06's timing assertion (worst ≤ 200 ms) is load-sensitive. It failed once under a concurrent render and passed alone | AC-REC-06-rerun.r4.verifier.log |

## Verdict

The round 4/5 changes do what the handoff says: each of the four scripts prints the SKILL.md gate line on PASS, and a FAIL line with non-zero exit on its own check. The docs are consistent. The checker counts real script output and rejects echoed and quoted lines. The suite (with a load-flake rerun), ac-run WP9/WP8, trace and AC-BASE-01 all pass. No blockers. F2 is the one worth fixing before the cold-start re-run, because that model trims output with `tail`. AC-PKG-05 stays blocked until a cold start on this commit is done.
