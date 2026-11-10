verifier-id: verifier-wp7b-r2-1a9c45e8

# WP7b verify-2 (focused): round-1 fixes

- **What I checked:** branch `feature/peak-media-wp7b` @ d02e59f, delta 9ae47c5..d02e59f only.
- **Independence:** builder `builder-wp7b-6d3f8842`, round 1 `verifier-wp7b-r1-f4d34562`; this verifier differs from both.
- **Environment:** macOS arm64, Node 26.8.1, ffmpeg 9.0.2, 8 cores (`node --test` runs 7 files at once; 14 eval files).
- **How I ran:** alone, one thing at a time, with `TMPDIR=$(mktemp -d)` (deleted afterwards). Both key variables were unset. Driver scripts were kept outside the repo (`/tmp/wp7b-r2/`), and no video or WAV was written to the repo.
- **Evidence dir:** for the single full-suite run, `PEAK_MEDIA_EVIDENCE_DIR` pointed at a temp dir **outside** the repo (needed to read the sync numbers). Only summaries were copied into `evidence/WP7b/`, and no AC-ASM file landed there.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-REC-05 | PASS | evidence/WP7b/evals-all.r2.log | Not changed this round. It passes in the full suite (81/81) and in `ac-run --wp WP7b`. |
| AC-REC-06 | PASS | evidence/WP7b/AC-REC-06.r2.log, evals-all.r2.log | **Run:** full suite, `ranAlone {alone:true, waitedMs:167847, siblingsAtStart:6}`, 0 retry lines, and **both modes asserted** (2 interleaved takes each, 12 flips). **Voice-only** (`--no-captions`): median +17.45 ms, worst +18.3 ms. **Captioned** (overlay): median +17.45 ms, worst +18.3 ms. Every flip landed on its expected frame (+16.6…+18.3 is the ½-frame grid drift). The mechanism is judged in S2 below. |
| AC-REC-07 | PASS | evidence/WP7b/AC-REC-07.r2.log | **Deck as shipped (200 ms fades):** PASS with 2 changes (6.700 s, 15.200 s, each in a 1200 ms silence). `--expect-cuts 2` → 0; `3` → 1; `0` → 1. **Deck copy with 500 ms fades** (temp copy, `--lead-ms 950`): now **FAIL**, exit 1, **one line** (`FAIL  no scene changes found on a narrated take at threshold 0.02 — … lower --scene-threshold, or pass --expect-cuts 0 …`). `--json` gives `ok:false` and `error`. `--expect-cuts 0` passes; `--scene-threshold 0.005` finds the changes. **Synthetic narrated, no change:** one-line FAIL; `--expect-cuts 0` → 0, `1` → 1. **Silent track, no change:** PASS with both notes. **Captions-only ui-demo:** PASS with the silent-track note. |
| AC-REC-08 | PASS (still) | evidence/WP7b/AC-REC-08-verifier-r2-dom.jpg, AC-REC-08.r2.log | **`--caption-engine dom`:** take reports `captionEngine: "dom"`, 5 captions. I read the 5-still sheet (mid-window of each caption): all 5 captions are visible as the dark bottom-centre pill, with the right text per beat. Help, SKILL.md and the env-var checks are under S3. |
| AC-REC-09 | PASS | evidence/WP7b/AC-REC-09.r2.log | **Reproduction (full suite):** videoMs 14233 → 14200 (−33). Caption starts moved −33/−31/−32/−13/−22 ms, all inside ±150 ms. **Mutation:** I made `commandFor` skip `--caption-css`. AC-REC-09 then **fails**: `command[] has --caption-css` (actual false). Reverted with `git checkout`. The check is no longer circular. |
| AC-REC-10 | PASS | evidence/WP7b/evals-all.r2.log | Not changed this round. It passes in the full suite and in `ac-run`. |
| AC-BASE-10 | PASS | evidence/WP7b/AC-REC-07.r2.log, evals-all.r2.log | **New bad input** (`--expect-cuts -1`, `1.5`, `x`): exit 2, one actionable line plus the house "Run --help" line. **Also:** `capture --caption-engine bogus` exits 2 with `must be one of overlay, dom`. The eval passes. |

**Also run**
- `node --test plugins/peak-media/evals`: **81/81 pass**, exit 0, 5:59 wall time (evals-all.r2.log).
- `ac-run --wp WP7b`: AC-REC-05/06/07/09/10 and AC-BASE-10 `pass`; AC-REC-08 `—` (still); exit 0 (AC-REC-06.r2.log).
- `ac-run --trace`: `PASS trace: 77 ACs, 12 briefs, 0 problem(s)` (AC-REC-06.r2.log).

## Round-1 findings

| Finding | Status | Note |
|---|---|---|
| S1 check-take passes zero changes | **fixed** | **Behaviour:** a narrated take with no change fails as one line, which names both remedies. Silent and captions-only takes still pass with a note. `--expect-cuts n` works, including 0. **Re-test:** the 500 ms-fade deck now fails. |
| S2 AC-REC-06 retry and voice-only assert | **fixed** | **Assertions:** no retry, and both modes are asserted. The file waits for its siblings. **Mechanism:** judged below. |
| S3 caption engine only via env var | **fixed** | **Flag:** `--caption-engine <overlay\|dom>` is in `--help` (line 28), in the SKILL.md flag table (:75) with when-to-choose text (:88-93), and in storyboard-api.md (:77). Invalid values are rejected. **Env var:** `grep PEAK_MEDIA_CAPTION_ENGINE skills/ evals/` is empty. **Output:** dom draws visible captions. |
| N1 ±1 s tolerance, circular `command[]` | **fixed** | **Tolerance:** now ±150 ms. **`command[]`:** checked against the spawning argv: required flags, values, absolute paths, and no extra flags. The amber-card re-check is added. The mutation is caught. |
| N2 "no captions" sync take still drew captions | **fixed** | The voice-only take uses `--no-captions`, and the test asserts `captionEngine === null`. |
| N3 nominal `bpm: 60` | still-open (Lead) | Deferred to the Lead (possible v2 `kind: "take"`); not in scope here. |
| N4 first `say()` +224 ms warning | **fixed** | SKILL.md:133 explains that the warning is expected. |

### S2 mechanism (`evals/video-capture/helpers/alone.mjs`)

**Honest: yes.**
- The result of the gate is recorded in the evidence (`ranAlone`).
- The timeout path warns and records `alone:false` rather than hiding it.
- It really did wait: 168 s for the 6 files running beside it. The other 7 queued files started and finished while it waited.

**Runs alone: yes in practice, with one small hole (N5).** It treats only processes with the same parent pid and `process.execPath` as siblings, which is exactly what the `node --test` runner spawns.

**Deadlock: none under normal use.**
- Siblings never wait on this file, so they always drain. A hung sibling is capped by the 30-minute timeout.
- `--test-concurrency=1` and direct runs (including ac-run's nested `node --test`) have no siblings.
- The only deadlock-shaped case is a second file adopting the gate. It is documented in both headers, but nothing enforces it.

**Cost:** the gate runs in `before()`, so the whole file waits. That adds about 3 minutes to the suite and to `ac-run --wp WP7b` (the first test's reported time includes the wait). This is acceptable.

## New findings

**Blocker:** none. **Should-fix:** none.

**Nits**
- **N5. `evals/video-capture/helpers/alone.mjs:27` makes a single "zero siblings" observation and never re-checks.**
  - **The gap:** with 14 files and 7 slots, the runner launches a queued file as soon as a slot frees. If the poll lands in that gap, the gate opens while files remain, and they then run beside the sync takes. `ranAlone.alone` would still say `true`.
  - **Under `--test-isolation=none`** there are no child processes, so the gate returns at once and gives no isolation, while still reporting `alone:true`.
  - **Suggested fix:** require 2 consecutive empty polls, and re-sample `siblings()` after the AC-REC-06 takes, recording it in `ranAlone`.
- **N6. `skills/video-capture/scripts/check-take.mjs:87-92`: on an `--expect-cuts` mismatch the first line is the reason, but the closing summary line repeats the generic text.**
  - It reads `FAIL  2 scene change(s) … 0 not in a ≥ 900 ms silence`, which can mislead a reader who only sees the last line.
  - **Suggested fix:** put the reason in the summary line.
- **N7. The zero-change guard (check-take.mjs:34) only catches a take where *no* change is detected.**
  - A narrated take where some fades are caught and others missed still passes unless `--expect-cuts` is given.
  - **Suggested fix:** SKILL.md could recommend `--expect-cuts <slides−1>` for decks.

## Scope

- **Changed paths:** `git diff --stat 9ae47c5..d02e59f` has 36 files, all under `skills/video-capture/`, `evals/video-capture/`, `docs/build/evidence/WP7b/` or `docs/build/wp/WP7b/`. Nothing is outside those paths.
- **Media:** no MP4, WAV, WebM, MKV, MOV or M4A is tracked.
- **Evidence folder:** no AC-ASM files in `evidence/WP7b/`.
- **Removed:** `evals-wp7b.log` was deleted in this round; the change is disclosed via `evals-all.log`.
- **Working tree after this run:** clean apart from this report and the `*.r2.log`, `evals-all.r2.log` and `AC-REC-08-verifier-r2-dom.jpg` evidence. The mutation was reverted.
