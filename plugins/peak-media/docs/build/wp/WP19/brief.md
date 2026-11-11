# WP19 — Windows x64 + Linux x64 support (peak-media 0.3.0)

**Runs as:** one session, work packages in order · **Branch:** `feature/peak-media-cross-platform` · **Decision:** DEC-53

## Scope

1. Node watchdog for every OS (`lib/watchdog.mjs`, `lib/watchdog-child.mjs`): no `/bin/sh`; `taskkill /T /F` on win32, process-group SIGKILL on POSIX; `resolveBin` with the OS PATH delimiter and PATHEXT.
2. `scripts/setup.mjs` replaces `setup.sh`: same flags and exit codes; npm through `process.execPath`; an "unsupported platform" stop on Windows ARM and Linux arm64; one ffmpeg install line per OS.
3. Portability fixes: `capture` serveDir on Windows paths, `serve` stop instructions, sign-in file docs, case-insensitive entry-point checks (`isMain`), the full eval suite skips on win32.
4. `evals/smoke` (setup → render a plate → capture the deck → assemble → check-take) and the 3-OS GitHub Actions matrix (`.github/workflows/peak-media.yml`).
5. DEC-53, this register, README prerequisites per OS (Windows and Linux beta), 0.3.0.

## Acceptance criteria

- **AC-XP-01** — the watchdog kills the step's process tree on timeout
- **AC-XP-02** — the watchdog cleans up when the parent dies
- **AC-XP-03** — `resolveBin` handles the PATH delimiter and PATHEXT
- **AC-XP-04** — serveDir handles Windows paths
- **AC-XP-05** — no `setup.sh`/`bash` setup line is left in skills or README

Also re-worded here (owned by WP9/WP2): AC-PKG-04, AC-PKG-08, AC-BASE-01.

## Done when

The CI matrix is green on all three OSes, the full macOS suite passes, and the user has reviewed the branch.
