verifier-id: verifier-wp2-r1-6d4d8f45

# WP2 verify-1: Walking skeleton + shared verify tools

Verified HEAD `c7f9907` on `feature/new-peak-media-plugin`. Builder-id in handoff.md: `lead-main-session (…)`, which differs from this verifier's id. Host: macOS, Node 22+, ffmpeg 9.0.2 (no drawtext). `scripts/setup.sh` re-run: `deps: up to date`, `browser: present`, exit 0. `node --test plugins/peak-media/evals`: 20/20 pass, 0 skipped. `ac-run --wp WP2`: every script AC `pass`, exit 0. `ac-run --trace`: `PASS 77 ACs, 12 briefs, 0 problem(s)`. Log: `evidence/WP2/ac-run-WP2.log`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-SKL-01 | PASS | evidence/WP2/AC-SKL-01.log | Ran the skeleton CLI directly with `TTS_OPENROUTER_API_KEY=` and `--brand evals/fixtures/brand-min` (`brand-packs/default` lands in WP5; without `--brand` it fails with a one-line error). `out/final.mp4` exists. ffprobe reports format duration 3.000000 s and 90 decoded frames at 30 fps. probe-spec duration ±1 frame is ok. |
| AC-SKL-02 | PASS | evidence/WP2/AC-SKL-02.log | probe-spec `--size 1280x720` exits 0. Independent ffprobe: h264 High, yuv420p, 1280×720, aac LC, 48000 Hz. A separate Python box walk gives `ftyp,moov,free,mdat`, so faststart holds. |
| AC-SKL-03 | PASS | evidence/WP2/AC-SKL-03-verifier.jpg, evidence/WP2/AC-SKL-03.log | `still`, read by the verifier. 4×2 grid with 7 frames. Every tile has a legible white 7-segment timecode at top left: 00.00, 00.50, 01.00, 01.50, 02.00, 02.50, 02.97. At 00.00 the frame is empty, at 00.50 "spec-aware" is in, and at 01.00 all three lines are in with the last one mid-fade. From 01.50 to the end, "spec-aware / vs. / spec-accountable" is fully legible, with "vs." in accent blue. The sheet is byte-identical to the builder's F0-contact.jpg. |
| AC-SKL-04 | PASS | evidence/WP2/AC-SKL-04.log | Built my own synthetic: 5 s at 25 fps, cuts at 1.5 s (silence 1.0–2.2 s) and 3.5 s (660 Hz tone). `--min-silence-ms 300` gives `ok cut at 0:01.520` and `FAIL cut at 0:03.520`, exit 1. Detected times are frame-quantised, which is correct for 25 fps. I read the eval synthetic myself: red\|blue at 1.0 s, audio silent 0–2 s, green at 3.0 s, tone 2–4 s, so the cuts are where the test claims. See F-4, F-5, F-6 for edge cases. |
| AC-SKL-05 | PASS | evidence/WP2/AC-SKL-05.log | Two separate CLI renders give identical `framemd5` over 90 frames, and the p1.mp4 files are byte-identical. There are 40 distinct frame hashes, so the test is not comparing a constant image. |
| AC-SKL-06 | PASS | evidence/WP2/AC-SKL-06.log | Inside the same sandbox-exec profile, a non-Node `curl` is blocked (exit 7). A grandchild `node→sh→curl` is also blocked, which shows descendants such as the browser inherit the sandbox. The pinned chrome-headless-shell returns an empty DOM for example.com (outside the sandbox it gets "Example Domain"). The F0 render inside the sandbox exits 0, its framemd5 is identical to the online render, and the plate HTML/CSS has no remote URLs. This was exercised only with brand-min system fonts (F-9). |
| AC-SKL-07 | PASS | evidence/WP2/AC-SKL-07.log | Independent `git grep` for `0.9.25` / `1.65.0` / `(hyperframes\|playwright)@` across the repo: runtime hits only in `lib/pins.json` and `package.json`. Other hits are in `docs/build/*` (decisions, handoff, WP4 brief), which the eval excludes on purpose. pins = package.json = lockfile for all four deps. The eval regex is keyword-anchored (F-8). |
| AC-TRC-01 | PASS | evidence/WP2/AC-TRC-01.log | Own fixtures: an orphan (owner has no brief) fails, a brief listing an unknown AC fails, and PASS with `—`, an empty cell or a missing file fails. A lower-case `pass` is caught. An escaped `\|` in G/W/T parses correctly. The real register passes. Gaps: see F-1, F-2. |
| AC-TRC-02 | PASS | evidence/WP2/AC-TRC-02.log | Identical ids are rejected by both `--trace` and `--wp --no-run`, including ids with trailing whitespace and the real handoff's long-form id. A missing verifier-id is rejected. A partial or case-variant id is not caught (F-3). |
| AC-BASE-01 | PASS | evidence/WP2/AC-BASE-01.log | All runs had outbound network denied. `--help` lists every flag, `--version` = 0.1.0 = plugin.json. `--bogus`, a bare `--data-dir`, an empty `--data-dir` and a stray positional each exit 2 with a one-line actionable error. `--check --data-dir <empty dir>` exits 3 with one line and creates nothing. Missing ffmpeg or ffprobe exits 3 with an install hint. Nit F-11. |
| AC-BASE-03 | PASS | evidence/WP2/AC-BASE-03.log | Ran under the no-network preload with zero NETWORK-ATTEMPT lines. Help lists every flag and the version matches. Bad args (none, missing file, `--every soon/0`, `--cols 0`, `--count 0`, `--width abc`, unknown flag, extra positional, directory, garbage or empty file, `--at` past the end, missing ffmpeg or ffprobe) all give a non-zero exit, one line and no stack trace. Nits F-7, F-10, F-12. |
| AC-BASE-04 | PASS | evidence/WP2/AC-BASE-04.log | Same baseline checks as above, all pass. Adversarial: an MP4 without faststart fails `ftyp,free,mdat,moov`. 44.1 kHz audio plus 2 extra frames fails both the sample-rate and duration checks. `--no-audio` skips the audio checks. |
| AC-BASE-05 | PASS | evidence/WP2/AC-BASE-05.log | Same baseline checks as above, all pass. `--noise-db -50` is rejected as "ambiguous" (F-6), and `--scene-threshold 7` gives a vacuous PASS (F-5). Neither breaks the AC's then-clause, but both should be fixed before WP6/WP7 rely on check-cuts. |

## Scope check

`git show --stat c7f9907` lists 26 files. Most are in WP2's owned set: `lib/{pins.json,hf,ffmpeg,preflight}.mjs`, `lib/verify/*`, `scripts/setup.sh`, `skills/video-plates/templates/motion/index.html`, `docs/build/tools/ac-run.mjs`, plus handoff and evidence. The rest are outside the Owns list:

- **Disclosed in handoff.md:**
  - `docs/build/tools/skeleton.mjs` (dev tool)
  - `evals/{skeleton,trace,verify}/*` (needed so `ac-run --wp` has tests)
  - `evals/helpers/run.mjs` (expected Lead edit: `.sh` support)
  - `lib/deps.mjs` (`depRoot`, `pins`)
  - `package.json` / `package-lock.json` (DEC-25 mirror)
- **Expected Lead edits not itemised in handoff.md:**
  - `CHANGELOG.md`: 3 Added bullets under the existing 0.1.0 entry. Plugin version unchanged, so no version bump is involved.
  - `decisions.md`: DEC-25..28 and three run-time findings. handoff.md cites DEC-25/26/27 but not DEC-28.
- **Undisclosed:** `scripts/validate.mjs` changed mode from 100644 to 100755 with no content change (WP1-owned file). Harmless.
- **Contracts:** no changes to `schemas/*.v1.json` and no Contract-changes entries.
- **No MP4/WAV/MOV tracked** in the repo or anywhere in history. `evidence/WP2` holds only JPEG, JSON and logs.
- `grep -ri peakflames plugins/peak-media/{lib,scripts,schemas,skills,evals}` → empty.

## Findings

**Blockers:** none.

**Should-fix**

- **F-1:** `docs/build/tools/ac-run.mjs:29`. Only rows with fewer than 7 columns are rejected. A G/W/T cell with an unescaped `|` produces 8 columns and shifts every cell after it, so `status` becomes `script` and `evidence` becomes `PASS`. A PASS with no evidence then passes `--trace` silently (repro in AC-TRC-01.log, "UNescaped pipe"). Reject `c.length !== 7`.
- **F-2:** `docs/build/tools/ac-run.mjs:85`. `existsSync` accepts a directory (`evidence/WP1` passes) and paths outside the build folder (`../../../../etc/hosts` passes). Require a regular file under `root`.
- **F-3:** `docs/build/tools/ac-run.mjs:53,67`. Independence is an exact whole-line string match. The real builder-id is `lead-main-session (claude-opus-5-5, …)`, so a verifier writing `verifier-id: lead-main-session` passes, and `Agent-ABC` vs `agent-abc` also passes. Compare the first token, case-insensitively, or require a bare id with no free-text suffix.
- **F-4:** `lib/verify/check-cuts.mjs:37`. A cut exactly at a silence boundary passes with zero margin (repro: `--cuts 1000` and `--cuts 2200` on a 1.0–2.2 s gap both pass), so a cut landing on the first sample of speech is accepted. Consider requiring the cut to sit at least some margin inside the gap (DEC-13 doesn't specify one). This could also be logged as a decision instead.
- **F-5:** `lib/verify/check-cuts.mjs:35,41,52`. Two vacuous-pass paths:
  - Zero cuts, detected or given, returns `PASS 0 cut(s)`.
  - `--scene-threshold` is not range-checked: `7` detects nothing and passes.

  As an assembly gate (DEC-13) this hides a bad threshold or a file with no scene changes. Validate 0 < threshold < 1, and make 0 detected cuts a distinct outcome: a note at minimum, or exit non-zero unless `--allow-no-cuts` is passed.
- **F-6:** `lib/cli.mjs:68` (strict `parseArgs`), surfaced by `check-cuts --noise-db -50`. Negative numbers given as a separate argument are rejected with "Option '--noise-db' argument is ambiguous." `--noise-db` only takes negative values, so the natural spelling always fails and the message doesn't say to use `--noise-db=-50`. The same happens with `--min-silence-ms -100` and `contact-sheet --every -1s`. Either accept negative numerics or turn the message into an actionable one.

**Nits**

- **F-7:** `lib/verify/contact-sheet.mjs:12`. The 7-segment `1` lights only the right-hand segments, so `01.00` reads as `0 1.00` on the sheet. Still legible, but cosmetic.
- **F-8:** `evals/skeleton/skeleton.test.mjs:72`. The AC-SKL-07 regex needs `hyperframes`/`playwright` directly before the version (allowing only `@" :=v` between them). A bare literal such as `HF_VERSION = "0.9.25"` would be missed. Also grep for the bare version strings (my repo-wide grep found none).
- **F-9:** `evals/skeleton/skeleton.test.mjs:41-63`. AC-SKL-06 only exercises `brand-min` (system-ui fonts), so "fonts are local" is trivially true today. Re-run it with `brand-packs/default` once WP5 adds web fonts.
- **F-10:** `lib/verify/contact-sheet.mjs:116`. `--width 0` is accepted and silently renders at source width. Reject widths below 1, as is already done for `--cols` and `--count`.
- **F-11:** `scripts/setup.sh:86`. With an unwritable `--data-dir` (e.g. `/dev/null/x`), `mkdir`'s own stderr line (`mkdir: /dev/null: Not a directory`) appears before the actionable `setup.sh:` line. That is two lines, not one. Redirect `mkdir` stderr.
- **F-12:** `lib/cli.mjs:33`. Help shows `<arg>` placeholders only for string options, so numeric options like `--count`, `--width`, `--fps`, `--duration-ms`, `--min-silence-ms` and `--noise-db` show no value hint even where `arg` is set. This is a WP1 file.
- **F-13:** `lib/verify/check-cuts.mjs:13`. A file with no audio stream is treated as fully silent, so every cut passes (stdout notes this). That's fine for plates, but a final assembly with a dropped audio track would pass check-cuts. probe-spec catches that case, so this is informational.
- **F-14:** `lib/verify/check-cuts.mjs:64-67`. A `--cuts` value past the end of the file (`9000` on a 5 s file) is reported as "not in silence" instead of as an out-of-range input.
