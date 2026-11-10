builder-id: builder-wp9-ae42bf332f2a3a11c

# WP9 handoff — Packaging

Branch `feature/peak-media-wp9`, based on `feature/new-peak-media-plugin` @ d643813. Model: claude-opus-5-5,
worktree Builder session (agent ae42bf332f2a3a11c), 2026-11-09. Every run used a scratch `TMPDIR`, deleted
afterwards. No MP4/WAV/MP3 in the repo; `.DS_Store` strays deleted.

## Done

| AC | What | Evidence |
|---|---|---|
| AC-PKG-01 | `evals/packaging/packaging.test.mjs`: plugin.json version = top CHANGELOG entry; marketplace.json lists `peak-media` once, `source: ./plugins/peak-media` | evidence/WP9/AC-PKG-01.log |
| AC-PKG-03 | Walks `skills lib schemas brand-packs vendor scripts evals` (file names and bytes) for the brand name, case-insensitive: 0 hits. Examples carry no images, fonts, audio or logo/brand/outro files | evidence/WP9/AC-PKG-03.log |
| AC-PKG-04 | (macOS, DEC-41) Test runs `setup.sh`, then F1 end to end with no key: fake/tone spine at 20 s → `retime-plates` → `render-plate --all` (default pack) → `assemble` → `probe-spec` (size, fps, spine + 3 s outro) | evidence/WP9/AC-PKG-04-08.macos.r2.log |
| AC-PKG-06 | Test: exactly the five DEC-21 skills (no `web2video`), each SKILL.md names itself, each `evals/<skill>/` has ≥ 1 test. "All pass" = the full suite | evidence/WP9/AC-PKG-06-suite.log |
| AC-PKG-07 | Test parses VENDORED.md: every `vendor/*` folder has Destination, Source URL, 40-char commit, date, licence (+ LICENSE file) and ≥ 3 local-change bullets; GSAP row `Fetched` from npm; every font folder (`brand-packs/*/fonts/*`, `evals/fixtures/*/fonts/*`) `Bundled` with source, version, date, sha256, licence, local changes and its OFL.txt | evidence/WP9/AC-PKG-07.log |
| AC-PKG-08 | (macOS, DEC-41) Test: after `setup.sh`, each missing prerequisite gives one line, non-zero exit, no stack — ffmpeg (`setup.sh --check` and F0), runtime deps (`--check`, and F0 when no dev `node_modules`), a render browser that can't start (`--check` and F0's render), the narration key (`spine --narrate` with no key, < 5 s). With nothing missing, F0 passes | evidence/WP9/AC-PKG-04-08.macos.r2.log |

Also delivered:
- **README.md** — install (marketplace add / install, `#develop` for unreleased), prerequisites (macOS only, Node 22+, ffmpeg, disk, network), `setup.sh`, the key (`PEAK_MEDIA_OPENROUTER_API_KEY`, ZDR note), the three modes, the five skills, the house voice, brand packs (placeholder "Your Name" outro, `--brand`), music/SFX (none ships), project layout. No pinned version strings (AC-SKL-07).
- **VENDORED.md (final)** — summary table; HyperFrames section (WP4's text kept, `Fetched` row renamed `Date`); bundled fonts table (from WP5's handoff); fetched-by-setup table (GSAP, HyperFrames CLI, Playwright, ajv, browser — versions point at `lib/pins.json`).
- **marketplace.json** — peak-media entry (description from plugin.json); `metadata.version` not bumped (DEC-19).
- **Eval temp dirs** — `tmpDir(prefix)` in `evals/helpers/run.mjs` (deleted on process exit; `PEAK_MEDIA_KEEP_TMP=1` keeps them); every eval switched from `mkdtempSync(os.tmpdir…)`.
- **Reference notes** — `skills/video-spine/references/{narration-writing,voices}.md` already exist (adapted copies, Rasalgethi default); no skill points into `docs/`. Nothing to copy.
- **Runbook** — `wp/WP9/pkg-02-05-runbook.md`.
- **`.gitignore`** checked: keeps `node_modules/`, `renders/`, `out/` and media under `docs/build` out.
- Extra test (not AC-bound): `docs/` holds only `.md .mjs .json .log .jpg`; no audio/video anywhere in the plugin.

### Lead decisions applied (2026-11-09, ownership widened)

- **setup.sh / lib/hf.mjs:** new `browserCheck(bin)` in `lib/hf.mjs` starts the browser once (`--headless --dump-dom about:blank`); on Linux a failure runs `ldd` and returns one line naming the missing libraries and the `apt-get install` packages. `setup.sh` (install and `--check`) calls it after the browser step and exits 3 with that line. `render()` failures now use a `✗` line, then the browser check's message, then the last non-empty output line, instead of "no output". AC-BASE-01 eval still passes.
- **setup.sh on Linux arm64:** before downloading, it stops with one line: `no headless browser build exists for Linux arm64 — use macOS or an x86_64 Linux host, or set HYPERFRAMES_BROWSER_PATH` (was: "browser download failed — see browser.log").
- **README:** Linux browser libraries listed; linux/arm64 unsupported (no headless browser build), use macOS or amd64.
- **Node 22:** `ac-run.mjs` passes `<evals>/**/*.test.mjs` instead of the folder (Node 22's `--test` doesn't take a directory). Eval comments and the AC-PKG-06 test name use `node --test "plugins/peak-media/evals/**/*.test.mjs"`.

## Nit sweep (lead-todo "WP9 sweep" + "WP8 carry-forward")

| Nit | Fix |
|---|---|
| WP7b N5 | `alone.mjs`: needs 2 consecutive empty polls; the sync test re-samples siblings after its takes and records `siblingsAfterTakes` / `aloneThroughout` in `ranAlone` (warns if not alone) |
| WP7b N6 | `check-take.mjs`: on an `--expect-cuts` mismatch the closing FAIL line now leads with the reason |
| WP7b N7 | video-capture SKILL.md: decks should always pass `--expect-cuts <slides − 1>` |
| WP7b N3 | **Not done** (v2 `kind: "take"` is a contract change) — next version |
| WP6 N-2 | `assemble.mjs`: `--outro` checked up front with `--music`/`--sfx`; eval asserts the refusal and that `out/final.mp4` is untouched |
| WP4 N-2 (verify-3) | slide template `over()` also checks the body's bottom edge (no sub-pixel overrun past the content box) |
| WP4 N-3 (verify-3) | slide template: a first fit pass rejects layouts that split an ordinary word (≤ 20 chars) across rows; if no size reaches that, the old rule applies. F1/F2 layouts measured identical before and after; new `layout.test.mjs` case (URL table + six bullets) fails on the old template, passes now. `plate-authoring.md` row updated |
| WP8 verify-3 F1 | Listed as a known limit in `stages.md` (checker only orders first passing gate lines), not added to the checker |
| WP8 verify-3 F3 | `stages.md`: double blank line removed, long line wrapped |

## Results

- `node --test "plugins/peak-media/evals/**/*.test.mjs"` with a fresh TMPDIR: **100/100 pass**, 398 s (evidence/WP9/AC-PKG-06-suite.log). TMPDIR afterwards holds only `node-compile-cache` (Node's own); no `pm-*` folders (evidence/WP9/tmpdir-after-suite.log).
- `ac-run --wp WP9`: all six script ACs pass (evidence/WP9/ac-run-WP9.log). `ac-run --trace`: 79 ACs, 12 briefs, 0 problems.

### Container runs (superseded by DEC-41)

Round 1 ran AC-PKG-04/08 in linux/amd64 and arm64 `node:22-slim` containers (logs `evidence/WP9/*.container-*.log` kept as history). The user then made v0.1.0 macOS-only (DEC-41), so there is no container run in round 2 and no Linux eval remains.

## Round 2 (verify-1 fixes, DEC-41)

- **F1 watchdog.** New `lib/watchdog.mjs` `runWatched()`: the child runs detached (own process group) under `sh`, with stdout/stderr to files and the exit status written to a file; the caller polls for that file (no reliance on the child-exit signal reaching node) and past the deadline kills the group with `process.kill(-pid, 'SIGKILL')`. Used by `lib/hf.mjs` `hf()`/`render()` (render-plate, assemble's outro render, lint/check/snapshot, `browser path`), `browserCheck`, and `lib/ffmpeg.mjs` `ffmpeg()`/`probe()`. Defaults: render 30 min, other HyperFrames 10 min, ffmpeg 30 min, ffprobe 2 min, browser start 1 min; `PEAK_MEDIA_STEP_TIMEOUT_S` overrides all (README "When a step hangs"). A timeout fails with one line naming the step and the limit. The eval `run()` helper uses the same watchdog (default 30 min per step, `opts.timeoutMs`, `PEAK_MEDIA_EVAL_STEP_TIMEOUT_S`) and returns `code: null` + a one-line reason. New eval `watchdog: …` (packaging) proves it: a fake ffprobe that waits on a `sleep` child fails `probe-spec` in one line within 2 s and the sleeper is gone; `hf()` with a sleeping wrap throws the one-line timeout; a never-ending script fails its eval step. Whether this changes the Rosetta container result is untested (no containers after DEC-41).
- **F2** runbook: `~/tmp/pm-pkg02` is kept for PKG-05; cleanup moved to a final section after PKG-05.
- **F3** `setup.sh` passes `$ROOT` to node in `PM_ROOT` (both inline imports, incl. the older `deps.mjs` one), not inside the JS string.
- **F4** `.gitignore`: `docs/build/**/*.mp3` and `*.m4a`.
- **F5** README brand-pack tree: optional `music/` (listed in `music-rules.md` and brand.json `x-tracks`) and `sfx/` (CC0 or own, with source URL, licence, duration, peak offset) per DEC-39/40.
- **DEC-41 (user, macOS only):** acceptance.md AC-PKG-04/08 rows and the brief reworded as instructed (Lead-granted edits); DEC-41 added to decisions.md; README says macOS only and drops the Linux package list and arm64 note; AC-PKG-04 asserts darwin; AC-PKG-08 rewritten to the macOS "prerequisite missing" form. `render()` now puts the browser check's message first, and browser messages say "run setup.sh to fetch the render browser" (no Linux advice). setup.sh keeps its existing Linux one-liners.

### Round 2 results

- Full suite, fresh TMPDIR: **101/101 pass**, 394 s (evidence/WP9/AC-PKG-06-suite.r2.log); TMPDIR afterwards held only Node's `node-compile-cache`.
- macOS AC-PKG-04, AC-PKG-08 and the watchdog eval: pass (evidence/WP9/AC-PKG-04-08.macos.r2.log).
- `ac-run --wp WP9`: all six script ACs pass (evidence/WP9/ac-run-WP9.r2.log); `--trace`: 79 ACs, 0 problems.

## Round 3 (verify-2 fixes)

- **N1** `lib/watchdog.mjs`: a background watcher in the step's `sh` checks every second that node is alive; once node is gone it removes the `pm-run-*` folder and `kill -KILL -- -<group>`. Eval: a node process blocked in a watched step with a sleeping child gets SIGINT, then SIGTERM; each time node ends by that signal, the step's whole group is gone within 5 s and no `pm-run-*` folder is left. Mutation-checked (fails without the watcher).
- **N2** "not found" (ENOENT) only when the binary path doesn't exist or isn't on PATH, checked before spawning; a real binary exiting 127 is reported as its exit. Eval added.
- **N3** setup.sh ffmpeg hint and the Linux arm64 line, lib/ffmpeg.mjs install hint and timeout text: macOS wording only.
- **N4** README "Known limits": HyperFrames' warm-check browser lingers ~5 min after lint/check (upstream).
- Results: full suite, fresh TMPDIR: **103/103 pass**, 423 s (evidence/WP9/AC-PKG-06-suite.r3.log); TMPDIR afterwards only Node's `node-compile-cache`. `ac-run --wp WP9`: six script ACs pass (evidence/WP9/ac-run-WP9.r3.log); `--trace`: 79 ACs, 0 problems.
- **N5** `remux-audio.mjs` `videoStreamMd5` goes through `ffmpeg()` (watchdog); the eval helper's timeout message shows the exact limit (`1.5 s`).

## Round 4 (AC-PKG-05 run a: no GATE 2/5/6/7 lines)

- **Cause (transcript `f4df6d2b…`):** the session printed a gate line only at the top of the turn after a user answer (`GATE n … Starting stage n+1`). Automatic stages ran inside the same turn as the next user gate (2 with 3; 5, 6, 7 with 8) and were reported in plain prose ("The voice-over is recorded…", "The narrated cut is assembled"), never as `GATE` lines.
- **Fix:** `SKILL.md` gets a short rule above the general one: stages 2, 5, 6, 7 have no user stop, so their `GATE … PASS` line is the only record; write it as visible text the moment the check passes, before the next stage's first command, even mid-turn (a turn running 5→7 prints 5, 6 and 7). The stage table's column is now "Gate line (required, every stage)". `stages.md` adds one line above each automatic stage's closing gate: "No user stop here, so the line is required: write it as text now, before stage N+1's first command."
- **Results:** full suite, fresh TMPDIR: **104/104 pass**, 428 s (evidence/WP9/AC-PKG-06-suite.r4.log); TMPDIR afterwards only Node's `node-compile-cache`. `ac-run --wp WP9`: six script ACs pass (evidence/WP9/ac-run-WP9.r4.log); `--trace`: 79 ACs, 0 problems. The Lead re-runs the AC-PKG-05 cold start on a reinstall.
- **Eval:** `plate-factory.test.mjs` checks both docs state the rule for 2/5/6/7, and that the `good` transcript with the 2/5/6/7 lines removed fails AC-ORC-01 with "no passing gate line for gate(s) 2, 5, 6, 7".

## Round 5 (cold-start r2: still no GATE 1, 2, 5, 6 — gate lines move into the scripts)

- **Cause (r2 transcript `223063fc…`):** the session printed `GATE n … REJECTED (awaiting approval)` while waiting at user gates and then did not always write the APPROVED line (gate 1); the automatic stages again ran inside other turns with prose only (only GATE 7 appeared). A written rule isn't enough.
- **Scripts print gates 2, 5, 6, 7** in the SKILL.md table's exact formats, PASS on stdout (exit 0) or `FAIL — <reason>` on stdout plus the usual one-line error (non-zero):
  - `spine.mjs` → `GATE 2 spine: PASS — spine/manifest.json <ms> ms (target <ms> ±10%)` (or `spine/beatgrid.json`); target from the brief or `--target-ms` (already a flag).
  - `render-plate.mjs plates.json <first id> --pipeline-test` (new flag: one plate, must be the first motion/slide plate; implies `--lint --sheet`) → `GATE 5 pipeline: PASS — renders/plates/<id>.mp4 (<ms> ms, lint clean)`.
  - new `skills/plate-factory/scripts/gate.mjs build <plates.json|project>` → `GATE 6 build: PASS — <n> plates; reviewer: <d> defects, <f> fixed`; checks each plate's render (duration ±1 frame, fps, size), a sheet of each final render (sheet mtime ≥ render mtime) and `review/plate-review.md` (the reviewer's report, naming every plate, with `Defects:`/`Fixed:` lines, fixed ≥ defects).
  - `assemble.mjs` → `GATE 7 composite: PASS — review/review.mp4 (<k> cuts in ≥300 ms silence)` when the cut check passes (to stderr under `--json`). It prints it again on the stage-9 run; the checker counts the first.
- **SKILL.md / stages.md:** gate lines for 2, 5, 6, 7 come from those commands ("never type or echo these four lines"); the model writes 0, 1, 3, 4, 8, 9, writes a user gate's APPROVED right after the answer, and prints no gate line while waiting (REJECTED only for a refusal). Round-4 prose removed; stage 6 adds "write `review/plate-review.md`, then `gate.mjs build .`". `video-spine` and `video-plates` SKILL.md mention the printed lines.
- **Checker (`transcript.mjs`):** gates 2/5/6/7 also count from a main-thread Bash result whose command runs that gate's script (`spine`, `render-plate`, `gate`, `assemble`), unless the command itself contains a gate line (`echo "GATE …"`). Fixtures: `good-script-gates` (lines only in script output) passes; `bad-echoed-gate` (`render-plate … && echo "GATE 5 …"`) fails with "no passing gate line for gate(s) 5"; `bad-quoted-gate` still fails AC-ORC-02.
- **Evals:** spine PASS (narration and beat grid) and FAIL lines; render-plate `--pipeline-test` PASS and FAIL; `gate build` PASS, FAIL (no record, open defect, render newer than its sheets) and baseline; assemble PASS and FAIL; doc and fixture checks.
- **Results:** full suite, fresh TMPDIR: **107/107 pass**, 440 s (evidence/WP9/AC-PKG-06-suite.r5.log); TMPDIR afterwards only Node's `node-compile-cache`. `ac-run --wp WP9`: six script ACs pass (evidence/WP9/ac-run-WP9.r5.log); `--trace`: 79 ACs, 0 problems. The cold start itself needs the Lead's re-run on a reinstall.
- Ownership: `skills/video-spine/scripts/spine.mjs` and `skills/video-spine/SKILL.md` (Lead round-5 instruction); new `skills/plate-factory/scripts/gate.mjs` (entry point, baseline-tested; not a register AC).

## Open

- **AC-PKG-02 — blocked: needs user.** Needs the branch pushed (user approval), then the install check in `pkg-02-05-runbook.md`.
- **AC-PKG-05 — blocked: needs user.** Fresh-session cold start (a) explainer, (b) captioned TodoMVC demo, plus reviewer-agent D7–D10 prompt: runbook.
- **AC-PKG-09 — blocked: needs user** (read the README).
- Root `README.md` plugin table doesn't list peak-media (not an owned file); CHANGELOG bullets for WP9 are for the Lead.

## Deviations from the brief

- Ownership widened per the Lead notes and the 2026-11-09 Lead decisions (setup.sh, lib/hf.mjs, ac-run.mjs), and by the verify-1 F1 fix: new `lib/watchdog.mjs`, `lib/ffmpeg.mjs`, and `skills/video-assemble/scripts/remux-audio.mjs` (verify-2 N5).
- verify-2 N1: JS signal handlers can't run while node is blocked in the watchdog's synchronous wait, so instead of node-side handlers the step's `sh` wrapper watches node: when node is gone (Ctrl-C, SIGTERM, crash) it deletes the step's temp folder and kills the step's process group. Node itself ends by the signal (shell exit 130/143); no handlers to remove.
- "WP4 N-2/N-3" read as verify-3's (slide template); verify-2's N-3 was already fixed by the Lead in `lib/hf.mjs`.
- AC-PKG-04/08 now follow DEC-41 (macOS only), as worded by the Lead.
