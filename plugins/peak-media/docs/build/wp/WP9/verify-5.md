verifier-id: verifier-wp9-r5-576c7f04

# WP9 verify-5: Packaging (round 6 fixes for verify-4 F1–F6, cold start r3 G1/G6)

- Builder: `builder-wp9-ae42bf332f2a3a11c` (handoff.md). Earlier verifiers were r1–r4. This ID is distinct from all of them.
- Scope: `git diff 2a54786..46f6005` (worktree `agent-ae42bf332f2a3a11c`, branch `feature/peak-media-wp9`, HEAD `46f6005`). macOS only, no containers.
- Evidence: `evidence/WP9/*.r5.verifier.log`. Nothing committed, and no code, tests or docs edited.
- A cold-start r4 session (`~/tmp/pm-pkg05/explainer-r4`) was live on this machine during my checks. I didn't touch it.

## ACs re-checked

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PKG-01 | PASS | ac-run-WP9.r5.verifier.log | ac-run script pass; versions not touched in round 6 |
| AC-PKG-02 | BLOCKED: needs user (user evidence present) | AC-PKG-02-user.md | Unchanged |
| AC-PKG-03 | PASS | ac-run-WP9.r5.verifier.log | 0 brand-name hits, including the new gate.mjs code and fixtures |
| AC-PKG-04 | PASS | ac-run-WP9.r5.verifier.log, AC-PKG-06-suite.r5.verifier.log | macOS: setup, then F1 with no key |
| AC-PKG-05 | BLOCKED: needs user | AC-PKG-05-a-r3.md | Round 6 is untested in a cold start. An r4 run was live during my checks. F2-r5 below can fail AC-ORC-02 at gate 4 |
| AC-PKG-06 | PASS | AC-PKG-06-suite.r5.verifier.log | Full suite, fresh TMPDIR: **110 tests, 110 pass, 0 fail**, 515 s. This ran alongside the r4 cold start and my own probes, and had no flakes. TMPDIR afterwards held only `node-compile-cache`, which I deleted |
| AC-PKG-07 | PASS | ac-run-WP9.r5.verifier.log | Unchanged |
| AC-PKG-08 | PASS | ac-run-WP9.r5.verifier.log | The eval's assertion changed: stderr must be one line, and stdout may hold only `GATE … FAIL` lines. That's consistent with F4 |
| AC-PKG-09 | BLOCKED: needs user (user evidence present) | AC-PKG-09-user.md | Unchanged |
| AC-ORC-01 (transcript part) | PASS (fixtures) / open (live run) | checker-fixtures.r5.verifier.log, checker-forgery-probes.r5.verifier.log, G1-approved-with-edits.r5.verifier.log | All 20 fixtures behave as named. The r3 transcript fails gate 1 only. See F1-r5 and F2-r5 |
| AC-ORC-02..05, AC-BASE-13 | PASS | ac-run-WP8.r5.verifier.log | ac-run --wp WP8: every script AC passes |
| AC-BASE-01 | PASS | AC-BASE-01.r5.verifier.log | `--help` works; `--version` gives 0.1.0, which matches plugin.json; `--bogus` gives one line and exit 2 |
| trace | PASS | ac-run-trace.r5.verifier.log | 79 ACs, 12 briefs, 0 problems |

## My own probes

### G6: `gate.mjs build` counts the reviewer's defect lines

Evidence: `gate-build.r5.verifier.log`, which runs the real CLI on a copy of the cold-start r3 project, and `parse-review.r5.verifier.log`, which calls `parseReview` directly on 35 edge reports.

**r3's original `plate-review.md` now FAILs.** That file has `Defects: 1`, defect lines with no plate id, and `VERDICT (before fixes): …`. The gate reports "no reviewer VERDICT line".

**The same report saved the way stages.md asks now PASSes.** That is 1 major and 3 minor, with one minor left `— open`. The gate prints `GATE 6 build: PASS — 3 plates; reviewer: 4 defects, 3 fixed`, so the G6 mismatch is gone.

**FAIL cases, each with exit 1 and a clear reason:**
- an open major or blocker
- `— not fixed`
- a major or minor with no status
- the VERDICT disagreeing with the listed lines, in either direction
- a missing VERDICT, or one that leaves out the blocker field
- an unknown plate id, or a plate id in a different case
- a plate re-rendered after its last sheet
- a non-exact sheet name (`contact-p2-reason-old.jpg`)
- an empty `-fix2.jpg`

**PASS cases:**
- a stale `Defects: 1` summary line (it is ignored)
- bullets, bold ids, bold severity, and a severity without brackets
- `**VERDICT:**` and `**VERDICT**:`
- the prefix ids `p1` / `p10`
- `VERDICT: 0/0/0` with no lines

**Safe false FAILs, where the message is the problem:** the parser drops these lines, so the gate then says "the VERDICT says N but M listed — list every defect":
- numbered-list lines (`1. p1 @…`)
- `## p1 @…` heading lines
- table rows
- time ranges (`@2.0–3.5s`, `@ 00:05`)

Status forms the gate rejects: `— **fixed**`, `— fixed (re-rendered)` and `— fixed ✅`. See N2.

Two problems found: N1 (an unmarked line credited as fixed) and the accepted limit below.

**Accepted limit, not a finding:** the model owns the file. If it drops a defect line and also edits the VERDICT to match, the gate PASSes.

### F1/F3: script gate-line credit (`runsGateScript`)

Evidence: `checker-forgery-probes.r5.verifier.log`, as unit probes and as full-transcript replacements of `good-script-gates`' GATE 5 call.

**All r4 forgeries are now rejected.** These are:
- `--help; cat fake`
- `cat | tee | --version`
- `/tmp/render-plate.mjs`
- `node -e … render-plate.mjs`
- `X=GATE` heredoc
- `echo`
- `printf \x47`

**New forgeries that are rejected:**
- the real run followed by `; cat`, `&& cat`, `|| cat` or `echo "$X 5 …"`
- `(cat fake)` and `{ cat fake; }`
- `| tee` then `cat`
- `xargs cat`
- `node -e` with the plugin path as an argument
- `bash -c "real; cat fake"`
- `bash -c 'cat fake'`
- `bash -c 'cat $0' fake`
- `cat fake >/dev/stdout` and `>&1`
- `NODE_OPTIONS="--require …"` (quoted)
- `node --require` and `env node --import`
- `spine.mjs` printing a gate 5 line
- `--pipeline-test -h`

**Still credited** (F1 below): tail, head or grep reading a file, a `tail <<EOF` heredoc, `$(… >&2)` or backticks, `cat > $OUT` with `OUT=/dev/stdout`, an unquoted `NODE_OPTIONS=--require=…`, and a fake `lib/verify/*.mjs`. A copied script under a fake `skills/*/scripts` path is also still credited, as documented.

**Honest forms that still count:**
- a plain run
- `cd … &&`
- `2>&1 | tail -3`
- `2>/dev/null | tail -1`
- `| grep -E "lint|GATE 5"`
- `bash -c` and `zsh -c` real runs
- a `$PM` path
- `retime && run`
- running the script directly
- `time node …`
- for gate 6: a heredoc record write, then `gate build`
- for gate 7: `assemble | tail -3 && contact-sheet`

**Honest forms not credited:** `| tee log`, `; echo "exit $?"`, `&& ls review/`, `&& open sheet`, and Windows `\` paths. stages.md says "another program in the same call isn't" fine, so these are consistent with the docs. See N3.

**Fixtures:** all 20 behave as named. The 6 good ones pass. Each bad one fails only its own AC (`checker-fixtures.r5.verifier.log`).

**The real r3 transcript** fails AC-ORC-01 for gate 1 only, which matches the handoff. AC-ORC-02 also fails, as expected for headless typed approvals.

### F2/F4: gate lines last, and FAIL on early failures

Evidence: `script-gates.r5.verifier.log`, on a copy of the r3 project.

**assemble:**
- `assemble . 2>&1 | tail -1` gives `GATE 7 composite: PASS — …` (F2 fixed).
- With `--json`, the gate line is the last line on stderr.
- A missing render gives `GATE 7 composite: FAIL — plate 'p3-tip': no render …`, with the error after it.

**spine:**
- A missing brief gives `GATE 2 spine: FAIL — cannot read brief …`.
- A `--lead-ms 100` usage error gives a FAIL line with exit 2.
- `--budget` gives no line, as documented.
- An unknown flag gives no line, because it is a parser error.

**render-plate `--pipeline-test`:**
- `--all`, two ids, or the wrong id each give a FAIL line with exit 2.
- A real run piped through `| tail -1` gives the PASS line.

**gate:**
- `build nope/` gives a FAIL line.
- An unknown gate name is a usage error with no line.

**With ffmpeg missing** (only node on PATH): render-plate prints a FAIL line. **assemble and gate print no GATE line** (exit 3, one stderr line). The same is true of assemble's usage errors (`--min-silence-ms -5`). See N4.

### G1: approval with changes

Evidence: `G1-approved-with-edits.r5.verifier.log`, using extra variants built in memory with `generate.mjs`'s own `render()`. No fixture files were written.

The builder's fixtures behave as named:
- `good-approved-with-edits` passes.
- `bad-approved-with-edits` fails with "no passing gate line for gate(s) 1".

My gate 1 variants both pass:
- edit, re-ask, then GATE 1
- GATE 1, then the edit

The SKILL.md and stages.md wording agree with each other. Problems: F2-r5 (gate 4) and N5 (gate 1 step 7 vs step 8).

### Scope

Every non-evidence file in the diff is in the handoff's round-6 Ownership line:
- the evals
- plate-factory `SKILL.md`, `review-rubric.md`, `stages.md` and `gate.mjs`
- `assemble.mjs`, `render-plate.mjs` and `spine.mjs`

There are no schema or contract changes, no MP4/WAV/MP3 in the diff, and 0 `peakflames` hits in the changed skills/evals.

## Findings

| ID | Severity | Finding | Repro |
|---|---|---|---|
| F2-r5 | Major | **The new "approved with changes" rule conflicts with stage 4 and with the storyboard-window check.** Stage 1 step 8 says "The same holds at every user gate: edits first, then the `APPROVED` line". Stage 4 step 5 routes storyboard changes through `render-plate --all --storyboard --rescaffold`, and that run reopens the storyboard window. A model following step 8 at gate 4 ("Change p2's heading, then approved") edits plates.json, re-scaffolds, then writes `GATE 4 storyboard: APPROVED` with no new AskUserQuestion. The checker then doesn't count that line, and the first plate write fails AC-ORC-02. r3's gate-4 answer was exactly this kind of approval ("Approve, as you recommend", which carried a suggested change). r3 deferred the change, but the new rule now tells the model not to defer it. Fix: either say that gate 4 changes which re-run the storyboard need a fresh ask, or limit step 8's last sentence to gates whose edits don't reopen a window | `G1-approved-with-edits.r5.verifier.log`, variant `v5-g4-approved-with-edits-rescaffold`: `FAIL AC-ORC-02 … the APPROVED line at line 54 had no AskUserQuestion since the storyboard opened`. The same edit without the re-scaffold (`…-no-rerun`) passes |
| F1-r5 | Minor | **The script-gate credit is still forgeable by deliberate tricks.** All of these accompany a real run of the plugin script: (a) `tail`/`head`/`grep` are passive even when they **read a file**, e.g. `real; tail -1 fake.txt`, `real; grep "GATE 5" fake.txt`, `printf '\x47ATE…' > f; real; tail f`; (b) `tail <<'EOF' … EOF`, because the heredoc body is stripped before the check; (c) command substitution in the run's arguments, e.g. `real $(cat fake >&2)` or a backtick form; (d) `cat fake > $OUT` with `OUT=/dev/stdout`; (e) unquoted `NODE_OPTIONS=--require=/tmp/x.cjs node real…`, a preload that can print anything; (f) a fake `…/lib/verify/x.mjs` counted as a plugin tool (the documented limit names only `skills/*/scripts`). All of these need intent. Cheap tightening: treat tail/head/grep as passive only when they read stdin (no file operand, no heredoc); reject `$(`/backticks; accept only literal `/dev/null` and file paths as redirect targets; reject a `NODE_OPTIONS` prefix | `checker-forgery-probes.r5.verifier.log`: lines marked `<-- CREDITED (forgery)`. In the full-transcript section, AC-ORC-01 PASSes for `real; tail fake`, `real; grep`, `real; head`, `tail <<EOF` and `$(cat fake >&2)` |
| N1 | Minor | **An unmarked defect line whose fix text ends in `-fixed` or `-open` is read as having a status.** The status regex accepts a single `-` directly before the word. `p2 @5s [major] 2: nav drifts → make the nav position-fixed` (no ` — fixed` added) PASSes as fixed. `… → draw it half-open` FAILs as "major defect not fixed" instead of "no status". Fix: require whitespace before the dash (` — `, ` – `, ` - `, ` -- `) | `gate-build.r5.verifier.log`, "major with no status, fix text ends 'position-fixed'": `GATE 6 build: PASS — … 4 defects, 3 fixed` |
| N2 | Nit | **The review parser drops some plausible line forms, and the FAIL message then misleads.** Dropped: numbered-list items (`1. p1 @…`), `##` headings, table rows, and time ranges (`@2.0–3.5s`, `@ 00:05`). The result is "VERDICT says 3 minor but 2 … listed — list every defect", when the line *is* listed. Rejected statuses: `— **fixed**`, `— fixed (re-rendered)` and `— fixed ✅`. All of these fail safe | `parse-review.r5.verifier.log` (numbered list, heading, table row, time range, status variants); `gate-build.r5.verifier.log` "numbered-list line" |
| N3 | Nit | **Honest calls that aren't credited:** `real 2>&1 \| tee log`, `real; echo "exit $?"`, `real && ls review/` and `real \| tail -3 && open sheet`. This matches stages.md's wording, but `tee` and `echo $?` are common model habits, and `tee` could reasonably count as passive like `tail`. In each of these cases the model would also need to write the line itself, which it is told never to do for gates 2/5/6/7. So such a run fails AC-ORC-01 | `checker-forgery-probes.r5.verifier.log`, lines marked `<-- NOT credited (honest)` |
| N4 | Nit | **F4 is partial.** `assemble` (missing ffmpeg, `--min-silence-ms`/level usage errors) and `gate build` (missing ffmpeg) exit without a `GATE … FAIL` line, while spine and render-plate print one for both usage errors and missing ffmpeg. This doesn't affect AC-ORC-01 | `script-gates.r5.verifier.log`, "no ffmpeg on PATH" and `--min-silence-ms -5` |
| N5 | Nit | **Stage 1 steps 7 and 8 overlap.** Step 7 says that if words changed, redo step 4, show and ask again. Step 8 says that after "apply 1, approved", apply, write GATE 1 and run the spine. Applying a proposed change always changes words, so the two read as contradictory. Both paths pass the checker (variant `v5-g1-edit-reask`) | stages.md lines 163–168 |
| N6 | Info | **On a FAIL, the gate line is not the last line of combined output.** The one-line error follows it on stderr, so `2>&1 \| tail -1` shows the error, not the FAIL gate line. This is harmless: only PASS lines matter to AC-ORC-01, and the error carries the same text | `script-gates.r5.verifier.log`, assemble missing render |

## Verdict

Round 6 does what the handoff says:
- **G6 is fixed.** gate.mjs counts the reviewer's own defect lines, checks them against the VERDICT, fails on lines with no status and on an open blocker or major, and allows an open minor. On r3's real report it prints "4 defects, 3 fixed".
- **The F1 forgeries from r4 are all rejected.** Honest trimming (`| tail`, `| grep`, `cd &&`, `bash -c`) still counts.
- **F2 is fixed:** GATE 7 is printed last.
- **F4 is mostly done.**
- **F6 is fixed.**
- The full suite is 110/110, ac-run WP9 and WP8 pass, trace passes, and AC-BASE-01 passes. Scope matches the handoff, and no stray processes were left.

There are no blockers. The open items:
- **F2-r5 (Major)** should be fixed before the next cold start. The new "approved with changes → edits, then APPROVED, at every user gate" rule leads a compliant model to re-scaffold the storyboard and then write GATE 4 without a fresh ask, which fails AC-ORC-02.
- **F1-r5 (Minor).** Deliberate forgeries still get through: tail, head or grep reading a file, `tail <<EOF`, `$(…>&2)`, `NODE_OPTIONS`.
- **N1 (Minor).** An unmarked defect line whose fix text ends in `-fixed` counts as fixed.

The rest are nits. AC-PKG-02, AC-PKG-05 and AC-PKG-09 stay blocked until the user acts.
