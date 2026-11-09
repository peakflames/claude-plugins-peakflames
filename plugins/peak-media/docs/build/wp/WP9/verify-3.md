verifier-id: verifier-wp9-r3-c31628c6

# WP9 verify-3 — Packaging (round 3)

Branch `feature/peak-media-wp9` @ 47ca593 (builder `builder-wp9-ae42bf332f2a3a11c`; earlier verifiers
`verifier-wp9-r1-ec380cb6`, `verifier-wp9-r2-5d1e9a73`). Diff reviewed: `git diff 7328282..47ca593`.
Host: macOS 14.6.1 arm64, Node 26.8.1. macOS only (DEC-41); no Docker or container run. Evidence
paths are under `docs/build/evidence/WP9/`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PKG-01 | PASS | AC-PKG-01.r3.verifier.log, AC-PKG-06-suite.r3.verifier.log | plugin.json 0.1.0 = top CHANGELOG `## [0.1.0] — UNDER DEVELOPMENT`; one `peak-media` entry, `source` resolves, description matches; `metadata.version` 1.3.1; none of these files changed in r3. Eval passes |
| AC-PKG-02 | BLOCKED: needs user | wp/WP9/pkg-02-05-runbook.md | Needs the branch pushed (user approval). Runbook unchanged since r2 and still accurate (`feature/new-peak-media-plugin` exists locally and on origin; five skills listed; `~/tmp/pm-pkg02` kept for PKG-05) |
| AC-PKG-03 | PASS | AC-PKG-03.r3.verifier.log | My own `grep -rIi peakflames` over `skills lib schemas brand-packs vendor scripts evals`: 0 text hits, 0 binary hits, 0 file names. Examples hold only css/html/md/mjs. Eval passes |
| AC-PKG-04 | PASS | AC-PKG-06-suite.r3.verifier.log | macOS form (DEC-41): `setup.sh` then F1 no-key (fake/tone spine, default pack) passes in the suite, 173 s |
| AC-PKG-05 | BLOCKED: needs user | wp/WP9/pkg-02-05-runbook.md | Preparation still complete: scratch folder outside the repo, prompts (a)/(b), "only SKILL.md" transcript check, reviewer-agent D7–D10 prompt, starts from the PKG-02 config |
| AC-PKG-06 | PASS | AC-PKG-06-suite.r3.verifier.log, tmpdir-after-suite.r3.verifier.log | `TMPDIR=$(mktemp -d) node --test "plugins/peak-media/evals/**/*.test.mjs"`: **103 tests, 103 pass, 0 fail**, 433 s. TMPDIR after: 0 `pm-*`; `node-compile-cache/` and one `puppeteer_dev_chrome_profile-*` (HyperFrames warm-check daemon, README Known limits); it exited on its own ~5 min after the lint step. Deleted. No stray processes left |
| AC-PKG-07 | PASS | AC-PKG-07.r3.verifier.log | VENDORED.md and vendor/ unchanged since r1; re-checked source/commit/date/licence/local-changes rows, 6 `SKILL.reference.md` / 0 `SKILL.md`, 0 `hyperframes events`, GSAP `Fetched`, fonts Bundled with `OFL.txt` in every font folder |
| AC-PKG-08 | PASS | AC-PKG-08.r3.verifier.log | My own probes (macOS form). ffmpeg off PATH: `setup.sh` and `--check` → `ffmpeg not found — install it (macOS: brew install ffmpeg)`, exit 3; F0 → one line, exit 3. Browser missing / can't start: `--check` exit 3, F0 exit 1, one line each. Key unset: `spine --narrate` → one line naming `PEAK_MEDIA_OPENROUTER_API_KEY`, exit 3. Nothing missing: `--check` 0, F0 (no key) 0. (Two early key-probe lines in the log are usage slips of mine, re-run below them) |
| AC-PKG-09 | BLOCKED: needs user | plugins/peak-media/README.md | Covers install (marketplace add/install, `#develop`), prerequisites (macOS only, Node 22+, ffmpeg), the key, the three modes; r3 adds "Stopping a run … also stops the step" and "Known limits" (warm-check browser). No Linux instructions |

## verify-2 findings

| # | status | evidence |
|---|---|---|
| N1 Ctrl-C orphans the step | **Fixed** | N1-fake-step.r3.verifier.log, N1-real-render.r3.verifier.log, N1-N2-normal-path.r3.verifier.log |
| N2 false ENOENT on exit 127 | **Fixed** | N1-N2-normal-path.r3.verifier.log |
| N3 Linux wording in runtime messages | **Fixed** (macOS-reachable messages) | AC-PKG-08.r3.verifier.log |
| N4 warm-check browser lingers | **Documented** (README Known limits); observed again, exited on its own | tmpdir-after-suite.r3.verifier.log |
| N5 remux md5 unwatched; "2 s" rounding | **Fixed** (`videoStreamMd5` via `ffmpeg()`; message says `1.5 s`) | diff; suite |

### N1 probes (my own, independent of the builder's eval)

- **(a) Fake step** (node blocked in `runWatched` on `sh` that backgrounds `sleep 300`; node in its own
  process group): Ctrl-C to the group → node exit 130, step group (watchdog sh, watcher, step sh,
  sleeper) gone in 1.05 s; SIGINT to node pid → 130, 0.93 s; SIGTERM → 143, 1.03 s; SIGKILL → 137,
  1.05 s. `pm-run-*` gone every time.
- **(b) Real F0 HyperFrames render**, signal ~1 s after Chrome is up: all 11 step processes (watchdog sh,
  watcher, hyperframes render, its helper in its own group, ffmpeg, chrome-headless-shell + 4 children in
  Chrome's own group) gone within 0.69–0.82 s for Ctrl-C (130), SIGTERM (143) and SIGKILL (137). No
  process mentions the run dir afterwards; no `pm-run-*` left. See N6 for HyperFrames' own temp folders.
- **Wrong-target review:** the watcher kills `-$$` — the step's own process group, of which the watcher
  itself is a member, so the group id can't have been reused while it runs. On normal completion the
  sh kills `$w` (its own unreaped child, so no PID reuse) before writing the status file. The only
  reuse window is the watched PID: if node dies and its PID is taken by another process of the same
  user within 1 s, the watcher keeps waiting on that process (fails safe: delayed cleanup, never a
  wrong kill). macOS allocates PIDs sequentially, so negligible.
- **Normal path unchanged:** exit 0/3, stdout/stderr separate, stdin `input`, args with spaces/quotes/`$`
  literal, cwd/env honoured, signalled step → 143, 50 MB stdout read whole, `encoding: 'buffer'` works,
  1.5 s timeout → `timedOut`; 20 `true` calls 114 ms; no `pm-run-*` and no watcher left 1.2 s after.
  F0 to completion: exit 0, 8 s, TMPDIR only `node-compile-cache`. Each step leaves its watcher's
  `sleep 1` running ≤ 1 s after it ends (harmless).
- **N2:** a real binary printing `No such file or directory` and exiting 127 → status 127, no `error`;
  via `lib/ffmpeg.mjs` → `ffmpeg failed: No such file or directory: input.mp4`, exit 1. Missing absolute
  path / missing on PATH → ENOENT → `ffmpeg not found — install it (macOS: brew install ffmpeg) …`,
  exit 3. A non-executable file → status 126, one-line `Permission denied` failure.

## Findings

**N6 — nit: HyperFrames' own temp folders stay in TMPDIR after an interrupt or a timeout.**
The step group gets SIGKILL straight away, so `hyperframes render` can't clean up: after each of my
Ctrl-C/SIGTERM/SIGKILL probes, and after the `PEAK_MEDIA_STEP_TIMEOUT_S=5` timeout run, TMPDIR held
`hf-render-*` (12 KB) and `puppeteer_dev_chrome_profile-*` (2.7 MB). Pre-existing on the timeout path
since r2; not on the normal path. Repro: N1-real-render.r3.verifier.log (fresh TMPDIR, F0, signal
node once Chrome is up, then `ls $TMPDIR`). Fix idea, optional: SIGTERM the group, wait ~1–2 s, then
SIGKILL. The OS cleans `/var/folders/.../T` eventually; small.

**N7 — info: Linux-only wording left where only Linux reaches it.** `lib/hf.mjs:115`
(`Debian/Ubuntu: sudo apt-get install …`, inside `process.platform === 'linux'`) and the `setup.sh:75`
comment. Not reachable on macOS; no action needed for DEC-41.

No blocking or should-fix findings.

## Scope and other checks

- Files changed 7328282..47ca593: README, WP9 handoff/evidence, `evals/helpers/run.mjs`,
  `evals/packaging/packaging.test.mjs`, `lib/watchdog.mjs`, `lib/ffmpeg.mjs`, `scripts/setup.sh`,
  `skills/video-assemble/scripts/remux-audio.mjs` — all under `plugins/peak-media/`, all in the grant
  (handoff "Deviations" now lists watchdog/ffmpeg/remux-audio). No schema, plugin.json, CHANGELOG,
  acceptance or contract change.
- AC-BASE-01 (setup.sh baseline) passes in the suite.
- No audio/video tracked anywhere in the repo (0 mp4/webm/wav/mov/mp3/m4a/aac/flac/ogg).
- New evals (interrupt, ENOENT) pass in the suite (2.3 s, 0.3 s).
- Cleanup: suite TMPDIR deleted; probe scratch in `/tmp/pm-v3probe` (outside the repo) deleted; no
  stray processes left. Nothing committed.
