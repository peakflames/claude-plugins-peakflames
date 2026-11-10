verifier-id: verifier-wp9-r2-5d1e9a73

# WP9 verify-2 — Packaging (round 2)

Branch `feature/peak-media-wp9` @ c50972c (builder `builder-wp9-ae42bf332f2a3a11c`; round 1 verifier
`verifier-wp9-r1-ec380cb6`). Diff reviewed: `git diff a79e511..c50972c`. Host: macOS 14.6.1 arm64,
Node 26.8.1. Per DEC-41 / user instruction: macOS only, no container or Docker run. Evidence paths are
under `docs/build/evidence/WP9/`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PKG-01 | PASS | AC-PKG-01.r2.verifier.log | plugin.json 0.1.0 = top CHANGELOG `## [0.1.0] — UNDER DEVELOPMENT`; one `peak-media` marketplace entry, `source` resolves, description = plugin.json's; `metadata.version` 1.3.1 untouched (DEC-19). Eval passes in the suite |
| AC-PKG-02 | BLOCKED: needs user | wp/WP9/pkg-02-05-runbook.md | Needs the branch pushed. Runbook runnable as written; F2 fixed (`~/tmp/pm-pkg02` kept, cleanup moved after PKG-05) |
| AC-PKG-03 | PASS | AC-PKG-03.r2.verifier.log | My own `grep -rIi peakflames` over `skills lib schemas brand-packs vendor scripts evals`: 0 content hits, 0 binary hits, 0 tracked file names. Examples hold only css/html/md/mjs |
| AC-PKG-04 | PASS | AC-PKG-04.r2.verifier.log, AC-PKG-06-suite.r2.verifier.log | macOS form (DEC-41): `setup.sh` then F1 no-key (fake/tone spine 20.8 s, 3 beats → retime → render-plate --all → assemble → probe-spec 1280x720/30 fps/spine+3 s outro) passes, 156 s under suite load |
| AC-PKG-05 | BLOCKED: needs user | wp/WP9/pkg-02-05-runbook.md | Preparation complete: scratch folder outside repo, prompts (a)/(b), "only SKILL.md" transcript check, reviewer-agent D7–D10 prompt. Now starts from the kept PKG-02 config (F2) |
| AC-PKG-06 | PASS | AC-PKG-06-suite.r2.verifier.log, tmpdir-after-suite.r2.verifier.log | `TMPDIR=$(mktemp -d) node --test "plugins/peak-media/evals/**/*.test.mjs"`: **101 tests, 101 pass, 0 fail**, 432 s. TMPDIR after: 0 `pm-*`; `node-compile-cache/` (Node's) and one `puppeteer_dev_chrome_profile-*` (see N4). Deleted |
| AC-PKG-07 | PASS | AC-PKG-07.r2.verifier.log | VENDORED.md and vendor/ unchanged since r1; re-checked: one vendor folder, source/commit/date/licence/local-changes rows, 6 `SKILL.reference.md` / 0 `SKILL.md`, 0 `hyperframes events`, GSAP `Fetched`, every font folder has `OFL.txt` |
| AC-PKG-08 | PASS | AC-PKG-08.r2.verifier.log | macOS form (DEC-41), my own probes. **ffmpeg removed from PATH** (not the env override): `setup.sh` and `--check` → one line, exit 3; F0 → `skeleton: ffmpeg not found — install it (macOS: brew install ffmpeg …)` exit 3. **Browser** that can't start / missing path: `--check` exit 3 and F0 exit 1, one line each naming setup.sh. **Key** unset: `spine --narrate` → one line naming `PEAK_MEDIA_OPENROUTER_API_KEY`, exit 3; F0 (beat grid) with no key → passes. Nothing missing → `--check` exit 0, F0 passes. (The first F0 lines in the log, exit 127 `env: node …`, are a quoting slip in my probe; re-run below them) |
| AC-PKG-09 | BLOCKED: needs user | plugins/peak-media/README.md | Covers install (marketplace add/install, `#develop`), prerequisites (macOS only, Node 22+, ffmpeg, disk, network), the key, the three modes, plus new "When a step hangs" (`PEAK_MEDIA_STEP_TIMEOUT_S`) and the F5 pack tree (`music/`, `sfx/`). No Linux instructions left |

## verify-1 findings

| # | status | evidence |
|---|---|---|
| F1 watchdog | Fixed for its stated purpose (hung step → one line, group killed, no orphans). One regression on interrupt: see **N1** | F1-fake-ffmpeg, F1-real-render-timeout, F1-normal-path, F1-interrupt (`*.r2.verifier.log`) |
| F2 runbook cleanup | Fixed | runbook "Cleanup (after PKG-05)" |
| F3 quote in plugin path | Fixed: `setup.sh --check` via `/tmp/…/q'dir/peak-media` → `peak-media ready`, exit 0 | F3.r2.verifier.log |
| F4 .gitignore mp3/m4a | Fixed (`git check-ignore` matches lines 8–9) | scope.r2.verifier.log |
| F5 README pack tree | Fixed (`music/`, `sfx/`, `music-rules.md`, `x-tracks`) | README "Brand packs" |

### F1 review (lib/watchdog.mjs)

- **Hung step:** fake `ffmpeg` on PATH that sleeps 300 s with a background child, limit 3 s →
  `contact-sheet: frame at 00.00 timed out after 3 s with no exit — stopped it; …` (one line, exit 1,
  4 s); both the fake and its child gone; no `pm-run-*` left.
- **Real render:** F0 with `PEAK_MEDIA_STEP_TIMEOUT_S=4|5` → one line `hyperframes render timed out after N s …
  run …/setup.sh --check …`, exit 1. Chrome was running at the kill (puppeteer launches it in its own
  process group, so the group kill doesn't reach it directly) and was gone within 0.5 s (it exits when
  its `--remote-debugging-pipe` parent dies). No leftovers.
- **Normal path:** exit 0/3 kept; stdout/stderr captured separately; stdin `input` works; args with
  spaces/quotes/`$` pass through literally; cwd/env honoured; 300 MB stdout read whole (no maxBuffer);
  missing binary → `error.code ENOENT` (PATH and absolute). Parent CPU while waiting 5 s: 14 ms
  (Atomics.wait backoff 1→50 ms; up to 50 ms extra latency per step; 20 `true` calls in 115 ms).
  Full suite and real renders pass (101/101).
- **Override:** `PEAK_MEDIA_STEP_TIMEOUT_S` documented in README "When a step hangs" and in the timeout
  messages. The eval helper's `PEAK_MEDIA_EVAL_STEP_TIMEOUT_S` is documented only in handoff (test-only, fine).

## Findings

**N1 — should-fix: Ctrl-C no longer stops a running render/encode; it orphans it.**
`runWatched()` spawns the step `detached: true` (own process group) so it can kill the group on
timeout, but nothing kills that group when node itself is interrupted (and `Atomics.wait` blocks the
event loop, so no JS signal handler could run anyway). Before r2, `spawnSync` children shared the
caller's process group, so a terminal Ctrl-C reached them.
Repro (F1-interrupt.r2.verifier.log): start F0 as its own job
(`perl -e 'setpgrp(0,0); exec @ARGV' node docs/build/tools/skeleton.mjs --fixture … --out X &`), after 3 s
`kill -INT -<pgid>` → node exits at once, but `sh pm-watchdog` + `hyperframes render` (+ chrome) are
reparented to PID 1 and run on unsupervised until the render ends; the `pm-run-*` dir leaks in
TMPDIR. Same for SIGTERM to the node pid (pre-existing for that case). With the 30 min render default
this is a long-lived stray when a user or Claude Code's Bash tool cancels a step. Fix idea: have the
sh wrapper watch its parent (run the step in the background, loop `kill -0 $PPID` every second, and
`kill -- -$$` when node is gone), or keep the step in the caller's group (no `detached`) and kill the
sh's descendants on timeout instead of the group.

**N2 — nit: false ENOENT on exit 127.** `runWatched` maps status 127 + stderr matching
`not found|No such file` to ENOENT. A real binary exiting 127 with such stderr (F1-normal-path:
`bin exits 127 itself` → `err: ENOENT`) would be reported as "ffmpeg not found". Unlikely for
ffmpeg; check stderr starts with `pm-watchdog:` instead. A non-executable binary now gives status 126
rather than `EACCES` (message still one line).

**N3 — nit: Linux wording left in user-facing runtime messages (DEC-41).** README, runbook and
skills are clean, but on macOS the ffmpeg message still reads `… · Debian/Ubuntu: sudo apt-get install
ffmpeg` (`scripts/setup.sh:56`, `lib/ffmpeg.mjs:15`); the ffmpeg timeout says `check the machine
(emulated Linux?)` (`lib/ffmpeg.mjs:10`); `setup.sh:121` tells Linux arm64 users to "use macOS or an
x86_64 Linux host", implying x86_64 Linux is supported. Handoff says the Linux one-liners were kept
on purpose; harmless, but they contradict "macOS only".

**N4 — nit: suite leaves HyperFrames' warm-check browser for ~5 min.** `hyperframes lint/check`
spawns a detached `warmCheck.js 300000` daemon with its own chrome; after the suite it was alive
(parent PID 1) with its `puppeteer_dev_chrome_profile-*` inside the suite TMPDIR, and exited on its
own ~5 min later. Upstream behaviour, not r2-specific; worth a known-limit line, or
`HYPERFRAMES_*`/flag to disable warm checks in `hf()` if one exists.

**N5 — nit:** `remux-audio.mjs:19` still calls ffmpeg via bare `spawnSync` (no watchdog), so
README's "every … ffmpeg step runs under a watchdog" is slightly over-stated. Eval helper message
rounds 1.5 s to "2 s" (cosmetic).

## Scope and other checks

- Files changed a79e511..c50972c: all under `plugins/peak-media/`. Owned/granted: README, evals/**,
  `scripts/setup.sh`, `lib/hf.mjs`, WP9 docs/evidence; `lib/watchdog.mjs` and `lib/ffmpeg.mjs` are new
  to the grant but are what verify-1 F1 asked for and what the Lead's round-2 instruction names
  (handoff "Deviations" still lists only setup.sh/hf.mjs/ac-run.mjs — nit, add them).
  `acceptance.md` / `brief.md` (AC-PKG-04/08 rewording) and `decisions.md` (DEC-41) recorded as
  Lead-granted edits per handoff; text matches DEC-41. No schema, plugin.json or CHANGELOG change.
- DEC-41, acceptance rows, brief and README agree on macOS only; AC-PKG-04 asserts `darwin`.
- AC-BASE-01 (setup.sh baseline) passes in the suite after the F3 change.
- No audio/video tracked anywhere in the repo (0 mp4/webm/wav/mov/mp3/m4a/aac/flac/ogg);
  `docs/build` tracked types: jpg/json/log/md/mjs (scope.r2.verifier.log).
- Cleanup: suite TMPDIR deleted; probe scratch in `/tmp/pm-v2probe` (outside repo); no stray
  processes left (warm-check daemon exited on its own). Nothing committed.
