# WP11 — Unknowns and tooling (web2video 0.2.0)

**Runs as:** Builder · **Branch:** `feature/peak-media-wp11` (worktree, from `feature/peak-media-web2video`) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md`, `acceptance.md` (all in `plugins/peak-media/docs/build/`), `agents/builder.md`, and `plugins/peak-media/docs/web2video-plan.md` (§4.4–§4.7, §9) before starting.
- You own only the files listed below (paths relative to `plugins/peak-media/`). Touch nothing else.
- Contracts are **v1** and frozen. Any change is a request to the Lead.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP11`, a `wp/WP11/handoff.md` with a `builder-id:` line, and evidence in `evidence/WP11/` (JPEG, JSON, logs only — no MP4/WAV).
- No plan mode. Don't push. Don't merge. Build only on merged work (DEC-32).
- Run suites with `TMPDIR=$(mktemp -d)` and delete it afterwards. One full `node --test 'plugins/peak-media/evals/**/*.test.mjs'` at the end, not per change.

## Scope

1. **Widen `ac-run`'s ID pattern** so area codes may contain digits (`AC-W2V-nn`). Today `AC-[A-Z]+-\d+` appears at `docs/build/tools/ac-run.mjs` L15, L27 and L109; change all three to `AC-[A-Z0-9]+-\d+` (one shared constant is fine). Add an `AC-TRC-03` test to `evals/trace/ac-run.test.mjs` that builds a fixture register with an `AC-W2V-nn` row and proves `--trace` sees it (orphan detection, brief listing) and `--wp` picks up a test named `AC-W2V-nn: …`.
2. **Prototype U1–U6** in a scratch dir outside the repo (`$TMPDIR`), using the pinned Playwright from `lib/deps.mjs` (`resolveDep`) and the browser from `lib/hf.mjs` (`browserPath`). Record each result as a dated bullet under **Run-time findings** in `decisions.md`, with the number, the result, and what later WPs must do. Save logs/JSON under `evidence/WP11/U<n>-*.log`.

| # | Question | How | Written fallback |
|---|---|---|---|
| U1 | Current YouTube recommended upload settings for 1080p30 SDR (bitrate, GOP, B-frames, audio codec/rate/bitrate) | Read YouTube Help "Recommended upload encoding settings" (support.google.com/youtube/answer/1722171); record the date read and the values | Use what the page says; note any difference from plan §4.6 |
| U2 | Does `page.screencast` sustain 1920×1080 @ 60 fps on this Mac? | 30 s take of a page with continuous motion (CSS animation); count unique frames per fps slot the way `FrameGrid` in `skills/video-capture/scripts/capture.mjs` does. Pass = ≥ 90 % of slots get a fresh frame | `hifi` captures at 30 fps and the skill says so |
| U3 | Can `screencast.showOverlay` move a cursor smoothly (≥ 10 distinct positions per 400 ms glide)? | Prototype a glide by re-issuing / updating an overlay; count distinct cursor positions in the captured frames | Cursor in the page DOM, re-injected after each navigation |
| U4 | Does the pinned Playwright keep the browser context alive after the user closes the last tab, so `context.storageState()` can still be read? | Headed prototype: launch, open a page, set a cookie, close the page programmatically (`page.close()` and, if possible, a real user-style close), then call `storageState()` | Save on a terminal keypress the user sends with `!` |
| U5 | Does `page.screencast` deliver frames with `headless: false`? | Short headed take; count frames | `--headed` is debug-only and records nothing |
| U6 | Can a **headed** Chromium be launched at all with what `scripts/setup.sh` installs? (`lib/hf.mjs` L26–30 and `setup.sh` L116 may resolve only a headless shell) | Inspect what `browserPath()` returns on this Mac; try `chromium.launch({ headless: false, executablePath })`. If that fails, try Playwright's own `chromium` without `executablePath`, and Google Chrome via `channel: 'chrome'` if installed | **None written.** If no headed browser is available without new downloads, stop and report to the Lead with the options you found (do not add downloads to `setup.sh`) |

Headed prototypes (U4–U6) will open a window on the user's screen; close every browser you launch. Do not type credentials anywhere.

3. **WP status rows** — already added by the Lead; leave them.

## Owns

- `docs/build/tools/ac-run.mjs`
- `evals/trace/ac-run.test.mjs`
- `docs/build/decisions.md` (Run-time findings section only)
- `docs/build/wp/WP11/handoff.md`, `docs/build/evidence/WP11/`

## Acceptance criteria

- **AC-TRC-03** (script) — G a register with an `AC-W2V-nn` row and a test named `AC-W2V-nn: …` · W `ac-run --trace` and `ac-run --wp` · T the row is traced like any other ID (orphan detected when unlisted; listed when in a brief) and its test result is reported

The U1–U6 findings have no AC; the Verifier checks each has a dated finding in `decisions.md` with evidence under `evidence/WP11/`.

## Handoff

In `handoff.md`, give a one-line verdict per unknown (`U2: PASS — 58.7 unique fps` / `U3: FAIL → DOM cursor`) and flag any whose result has no written fallback (U6 failing) at the top.
