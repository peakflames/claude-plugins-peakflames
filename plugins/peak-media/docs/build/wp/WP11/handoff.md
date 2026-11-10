# WP11 handoff — Unknowns and tooling

builder-id: wp11-builder (agent aa59ec2e0ef11a1b6)

## Read this first: two items need the Lead

1. **U6 FAIL, and it has no written fallback.** `setup.sh` installs only HyperFrames'
   `chrome-headless-shell`, which can't open a window. A headed browser works on this Mac only
   because of things setup didn't install: Playwright's `chromium-1254` (left by an unrelated
   project) and the user's Google Chrome. Options are in `decisions.md` (U6). WP14 (`signin`,
   `--headed`) is blocked until the Lead picks one.
2. **The real register fails `ac-run --trace`, and so does AC-TRC-01.** With digit area codes
   now recognised, `wp/WP11/brief.md` names `AC-W2V-01` (as an example), and the register has no
   such row yet, so trace reports `wp/WP11/brief.md lists unknown AC-W2V-01`. I don't own the
   brief or `acceptance.md`. Fix: write the example as `AC-W2V-nn` in the brief, or add the
   AC-W2V rows (WP12) first.

## Verdicts

- U1: CONFIRMED — YouTube page (read 2026-11-10) matches plan §4.6 `youtube` on every value; add CABAC and no edit lists
- U2: PASS — 1080p60 screencast: 99.9 % and 98.6 % of slots fresh (59.9 / 59.2 unique fps) over 30 s
- U3: PASS — `showOverlay` cursor: 12–13 positions per 400 ms glide at 30 fps, 24–25 at 60 fps; survives navigation
- U4: PASS — `storageState()` reads cookies and localStorage after the last tab closes (page.close and CDP closeTarget; no real mouse click)
- U5: PASS — headed screencast delivers frames (96–99.7 % of slots), given a headed-capable browser
- U6: **FAIL — no written fallback** → Lead decision (see above)

## Done

- `docs/build/tools/ac-run.mjs`: one shared `AC_ID` pattern `AC-[A-Z0-9]+-\d+` used in all three places.
- `evals/trace/ac-run.test.mjs`: `AC-TRC-03` (orphan, unlisted, unknown-in-brief, and `--wp` pass/fail reporting for `AC-W2V-0n` tests).
- `decisions.md` Run-time findings: one dated bullet per U1–U6.
- Evidence: `evidence/WP11/U1-youtube-settings.log`, `U2-screencast-1080p60.json`, `U3-overlay-cursor.json`, `U4-storage-after-close.json`, `U5-headed-screencast.json`, `U6-headed-launch.log`.
- Prototypes ran in a scratch dir under `$TMPDIR` (deleted afterwards); every browser was closed, no leftover processes.

## Deviations

- **Extra fix in `ac-run.mjs`:** `runTests` now drops `NODE_TEST_CONTEXT` from the child env. Without it, `ac-run --wp` run *from inside* a node:test test (as AC-TRC-03 does) got no TAP output and reported every AC as `no-test`. No effect when run from a shell.
- Evidence for U2–U5 is JSON, not `.log` (the brief allows logs/JSON).
- U4's "real user-style close" used CDP `Target.closeTarget` instead of a mouse click on the tab ×, to avoid driving the user's screen.

## Full suite (one run, `TMPDIR` scratch, deleted)

118 tests, 116 pass, 2 fail:
- `AC-TRC-01` — real register `--trace`, caused by item 2 above.
- `AC-PKG-01` — plugin.json `0.1.0` vs CHANGELOG top entry `0.2.0`. Already true on
  `feature/peak-media-web2video`; release bookkeeping is WP18's.

The suite rewrites tracked WP5/WP10 evidence files as a side effect; I restored them and left them out of the commit.

## ac-run --wp WP11

| AC | method | run | register | evidence |
|---|---|---|---|---|
| AC-TRC-03 | script | pass | not-started | — |
