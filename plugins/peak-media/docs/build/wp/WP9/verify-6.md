verifier-id: verifier-wp9-r6-07491b7a

# WP9 verify-6: Packaging (round 7 fixes for verify-5)

- Builder: `builder-wp9-ae42bf332f2a3a11c` (handoff.md). Earlier verifiers were r1–r5. This ID is distinct from all of them.
- Scope: `git diff 58feae7..0501d8f` (worktree `agent-ae42bf332f2a3a11c`, branch `feature/peak-media-wp9`, HEAD `0501d8f`). macOS only, no containers.
- Evidence: `evidence/WP9/*.r6.verifier.log`. Nothing committed. No code, tests or docs edited (see the probe incident below).
- Checked: F2-r5, N5, N1/N2, N4, and the checker-forgery known-limit line. F1-r5/N3 are accepted by the Lead and were not re-tested.

## ACs re-checked

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PKG-01 | PASS | ac-run-WP9.r6.verifier.log | ac-run script pass |
| AC-PKG-02 | BLOCKED: needs user (user evidence present) | AC-PKG-02-user.md | Unchanged |
| AC-PKG-03 | PASS | ac-run-WP9.r6.verifier.log | No `peakflames` hits in the added skills/evals lines |
| AC-PKG-04 | PASS | ac-run-WP9.r6.verifier.log | |
| AC-PKG-05 | BLOCKED: needs user | — | Round 7 has not had a cold start |
| AC-PKG-06 | PASS | AC-PKG-06-suite.r6.verifier.log | Full suite, fresh TMPDIR: **112 tests, 112 pass, 0 fail**, 471 s. TMPDIR afterwards held only `node-compile-cache`; I deleted it |
| AC-PKG-07 | PASS | ac-run-WP9.r6.verifier.log | |
| AC-PKG-08 | PASS | ac-run-WP9.r6.verifier.log | |
| AC-PKG-09 | BLOCKED: needs user (user evidence present) | AC-PKG-09-user.md | Unchanged |
| AC-ORC-01 (transcript part) | PASS (fixtures) / open (live run) | g4-g8-approved-with-changes.r6.verifier.log | |
| AC-ORC-02..05, AC-BASE-13 | PASS | ac-run-WP8.r6.verifier.log | Every script AC passes |
| AC-BASE-01 | PASS | AC-BASE-01.r6.verifier.log | `--help` lists the flags; `--version` gives 0.1.0, which matches plugin.json; `--bogus` gives one line and exit 2 |
| trace | PASS | ac-run-trace.r6.verifier.log | 79 ACs, 12 briefs, 0 problems |

## Probes

### F2-r5 and N5: the per-gate rule (docs)

`SKILL.md` and `stages.md` now agree on each gate:
- **Gates 0, 1 and 3:** apply the edits, then write `APPROVED`.
- **Gate 4:** edit `plates.json`, then `--rescaffold`, then ask again. `APPROVED` waits for the new yes. Stage 4 step 5 says the same.
- **Gate 8:** re-mix and listen again. Stage 8 step 4 says the same.

The blanket "same holds at every user gate" sentence is gone. A grep for "every gate / every user gate / at every / edits first" finds no remaining conflict.

**N5 is fixed.** Stage 1 is now a single step 7. It adds an exception: ask again if the change moves the runtime outside ±10%. SKILL.md's gate 0/1/3 bullet doesn't mention that exception, but it points to stages.md, so this is not a conflict (nit-level at most).

### Fixtures and my own variants

My variants were built in memory with the generator's own `fixtureFiles()`/`VARIANTS` and run through `checkAll`. Nothing was written to the repo. Evidence: `g4-g8-approved-with-changes.r6.verifier.log`.

| Variant | Checker | What the rule says |
|---|---|---|
| `good-g4-changes-reasked` | ORC-01..04 PASS | right |
| `bad-g4-changes-no-reask` | AC-ORC-02 FAIL ("had no AskUserQuestion since the storyboard opened") | wrong, caught |
| `good-` / `bad-approved-with-edits` (gate 1) | PASS / AC-ORC-01 FAIL | as named |
| v6 gate 3: edit `plates.json`, validate, then APPROVED | all PASS | right |
| v6 gate 0: edit `brief.md`, then APPROVED | all PASS | right |
| v6 gate 8: re-mix, then re-ask, then APPROVED | all PASS | right |
| v6 gate 8: re-mix, then APPROVED with **no** re-listen | all PASS | **wrong, not caught** (I1) |
| v6 gate 4: edit `plates.json`, then APPROVED with **no** rescaffold | all PASS | **wrong, not caught** (I1) |
| v6 gate 4: rescaffold, re-ask answered "Change something", then APPROVED | all PASS | wrong. Already a documented known limit (the check doesn't read the answer) |

### N1/N2: defect status token (`parseReview`)

Evidence: `parse-status.r6.verifier.log`. 30 of 31 cases behaved as I expected.

- **No status (as intended):**
  - `…position-fixed`, `…half-open`
  - `— fixed (re-rendered)`, `— fixed in fix1`
  - `y— fixed` (no space before the dash)
  - `unfixed`, `still open`
  - `_fixed_` and `` `fixed` ``
  - `**— fixed**`
  - `pin header - now fixed`
- **Read as a status:**
  - ` — fixed`, ` – open`, ` - fixed`, ` -- open`
  - `— **fixed**`, `— **not fixed**`, `— FIXED`, `— fixed.`
  - `— fixed ✅`, `✓`, `✔️`, `🎉🎉`
  - `—fixed` (no space after the dash)
- `gate.mjs` reports a null status as "defect line has no ' — fixed' or ' — open' at its end", so the N1 message problem is gone too.

The one case that differed from my expectation, plus one quirk, are in N7.

### N4: GATE FAIL lines

Evidence: `N4-gate-lines.r6.verifier.log`.

**`gate.mjs` prints a FAIL line for:**
- an unknown subcommand (exit 2)
- `PEAK_MEDIA_FFMPEG=/nonexistent` (exit 3)
- a PATH holding only node (exit 3)
- a missing `plates.json` (exit 1)

**`assemble.mjs` prints a FAIL line for:**
- `--min-silence-ms -5` (exit 2). With `--json` the line goes to stderr.
- a missing input (exit 1)
- `--music-lufs 5` (exit 2)
- no ffmpeg, either way (exit 3)

**Still no gate line (arg-parser errors before the handler, the same class verify-5 accepted for spine):**
- unknown flags
- missing positionals
- a non-numeric `--duck-db abc`

render-plate still prints its FAIL line. N6 still holds: with `2>&1 | tail -1`, the last line is the usage hint. That is harmless.

### Scope

- Every non-evidence file in the diff is in the handoff's ownership list: plate-factory `SKILL.md`/`stages.md`/`gate.mjs`, `assemble.mjs`, the evals and fixtures, and `handoff.md`.
- No media files are in the diff.
- No contract or schema changes.
- Running `generate.mjs` reproduces the committed fixtures byte for byte (git status clean afterwards).
- No stray ffmpeg, headless-chrome or peak-media processes after the suite.

### Probe incident (mine, cleaned up)

**What happened:** my "spine with no ffmpeg" regression probe ran `spine.mjs --brief docs/build/fixtures/F1/brief.md` in place. For about 40 s (01:20 EST) the spine wrote `F1/spine/beatgrid.json` and `narration.wav` and removed `F1/spine/manifest.json`. I also re-ran `generate.mjs` in place, which rewrites the fixtures with identical bytes.

**Cleanup:** I restored `manifest.json` from git and deleted the two files the spine created.

**Effect on results:** both events overlapped the suite run. The suite still passed 112/112, and git status is clean apart from my evidence files.

**Side finding:** beat-grid spine runs need no ffmpeg and exit 0 with a PASS line. That is fine.

## Findings

| ID | Severity | Finding | Repro |
|---|---|---|---|
| I1 | Info | **The new gate 4 and gate 8 "with changes" rules are documented but not enforced by the checker.** Any `AskUserQuestion` in stage 8 before the line is enough, and gate 4 only needs one if the storyboard was re-run. So two violations pass: re-mix → `APPROVED` (no re-listen), and an edit to `plates.json` → `APPROVED` (no rescaffold). This is the same class as the existing known limit ("can't tell whether the answer was about the storyboard"). Optional: name it in Known limits | `g4-g8-approved-with-changes.r6.verifier.log`, variants `v6-g8-changes-no-relisten`, `v6-g4-edit-no-rescaffold` |
| N7 | Nit | **Status token edges.** (a) ` -fixed` (a space, then a hyphen glued to the word) is read as `fixed`, although the handoff says "spaced dash". (b) `— fixed ❌` is read as `fixed`, because any pictograph is allowed after the token. Both are unlikely in practice | `parse-status.r6.verifier.log` (`x → y -fixed`, `fixed ❌`) |
| N8 | Nit | **A few parser-level errors still exit with no GATE line:** assemble/gate unknown flags, missing positionals, `--duck-db abc` (number parse). This is consistent with spine. It doesn't affect AC-ORC-01 | `N4-gate-lines.r6.verifier.log` |

## Verdict

Round 7 resolves verify-5's items:
- **F2-r5 is fixed.** Every gate has its own rule, the docs are consistent, and the gate 4 fixture pair behaves as named.
- **N5 is fixed.**
- **N1/N2 are fixed.**
- **N4 is fixed** for the cases in scope.
- **The forgery known-limit line is present.**

Results: suite 112/112, ac-run WP9 and WP8 pass, trace has 0 problems, and AC-BASE-01 passes.

There are no blockers, majors or minors. AC-PKG-02, AC-PKG-05 and AC-PKG-09 stay blocked until the user acts.
