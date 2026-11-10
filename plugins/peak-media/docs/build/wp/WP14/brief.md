# WP14 — Login and reports

**Runs as:** Builder · **Branch:** `feature/peak-media-wp14` (worktree, from `feature/peak-media-web2video`) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` (DEC-44..51 and the WP11 run-time findings U4–U6), `acceptance.md`, `agents/builder.md`, `wp/WP13/handoff.md`, and `plugins/peak-media/docs/web2video-plan.md` §4.7–§4.8 before starting.
- You own only the files listed below (paths relative to `plugins/peak-media/`). Touch nothing else.
- Contracts are **v1** and frozen.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP14`, a `wp/WP14/handoff.md` with a `builder-id:` line, and evidence in `evidence/WP14/` (JPEG, JSON, logs only — no MP4/WAV, and **never a session file**).
- **Tests are risk-gated (user, 2026-11-10):** run only the test files your change affects. Do not run the full suite; the Verifier runs it once, and only if this WP touched shared code.
- No plan mode. Don't push. Don't merge. Build only on merged work (DEC-32).
- Captures are real time: run the video-capture evals alone. `TMPDIR=$(mktemp -d)` per suite run; delete it afterwards.
- Never type a real password anywhere. Tests use a local fixture server and cookies set by the test itself.

## Scope — `skills/video-capture/scripts/capture.mjs`

**`capture signin <url> [--save <file>] [--timeout 300s]`.** `runCli` allows no positionals (`lib/cli.mjs` L74), so dispatch the `signin` subcommand before `parseArgs` with its own spec (its own `--help`; `--version` still matches `plugin.json`). It opens a headed browser at `<url>`, the user signs in by hand, and the session (`context.storageState()`) is saved when the user is done. Per U4 (PASS): wait for the last page's `close` event, then read `storageState()` (the context stays alive); `--timeout` is the escape. Per DEC-49: launch Playwright's own Chromium (installed by `setup.sh`, below), headed; if it is missing, one line telling the user to run `setup.sh`. Default file: `<dataDir()>/auth/<host>.json` (`dataDir` from `lib/deps.mjs` L12), directory created `0700`, file written `0600`. Refuse a `--save` path inside the current working directory's `web2video/` folder or any folder that is a git work tree (one-line error naming the default). Prints the saved path and nothing of its contents. `--timeout` exits non-zero with nothing saved.

**`--storage-state <file>`.** Pre-flight in `planTake`: a missing or unreadable file stops the take before a browser opens (one line, naming `capture signin`). The context is created with `storageState`. The manifest records `signedIn: true` only — never the path's contents. `command[]` keeps the flag and the path.

**`--headed`.** Per U5 (PASS) and DEC-49: the take runs in a visible window of Playwright's Chromium and records normally (same frame grid). Pre-flight checks that browser exists.

**`scripts/setup.sh` (DEC-49).** Also install Playwright's Chromium for the pinned Playwright into the data dir (`PLAYWRIGHT_BROWSERS_PATH=<dataDir>/browsers`, via the pinned Playwright's own CLI from the deps dir), report it in `--check` like the render browser, and keep `--skip-browser` skipping both. Export a resolver (e.g. `headedBrowserPath()` in `lib/hf.mjs` or a new `lib/browser.mjs`) that `capture` uses. AC-PKG-04/08 and AC-BASE-01 must still pass.

**Reports (plan §4.8).** Listen for `pageerror` during the take. After every take print:

```
wrote out/todo-demo.mp4 (3.8 MB, 1280x720 @ 30 fps, 19.6 s, preset web)
beats: add 0.00–5.10 s · done 5.10–8.40 s · filter 8.40–13.9 s · clear 13.9–19.1 s
page errors during take: 1
  TypeError: Cannot read properties of undefined (reading 'id')
```

(the page-error lines only when there are any; at most 5 printed, then `… and N more`). Plate takes print the same lines with `plate <id>` in place of the preset. `--json` keeps printing the summary object.

**Take manifest (settled shape, no schema change).** `beats[]` stays one real entry per beat (`id`, `startMs`, `durationMs`). In `x-take`: `preset`, `beats[]` (`id`, `startMs`, `endMs`, `lateMs`), `pageErrors[]` (first line of each, at most 20), `cursor` (boolean), `signedIn` (boolean), `sizeBytes`. It still validates against the v1 spine schema and `command[]` reproduces the take.

## Owns

- `skills/video-capture/scripts/capture.mjs`
- `scripts/setup.sh`, `lib/hf.mjs` (or a new `lib/browser.mjs`) for the headed-browser resolver
- `evals/video-capture/**` (new tests, e.g. `login-reports.test.mjs`, and a tiny local login fixture under `evals/video-capture/fixtures/`)
- `docs/build/wp/WP14/` (handoff and a runbook for AC-W2V-20), `docs/build/evidence/WP14/`

## Acceptance criteria

- **AC-W2V-20** (manual) — G the login-demo fixture server · W the user runs `capture signin http://127.0.0.1:4173`, signs in by hand, and closes the tab · T the session is saved at `<dataDir>/auth/127.0.0.1.json`, mode 0600, outside the project. Prepare `wp/WP14/signin-runbook.md`; mark `blocked: needs user` (run in WP17 with the login UAT case)
- **AC-W2V-21** (script) — G `--storage-state /nonexistent.json` · W capture · T non-zero exit, one line naming `capture signin`, and no browser launched (launch spy as in AC-REC-02)
- **AC-W2V-22** (still) — G a local login fixture and a storage-state file the test builds from its cookie · W a take of the protected page · T no sign-in form in any still of the contact sheet (`evidence/WP14/AC-W2V-22-*.jpg`); the manifest has `signedIn: true` and no cookie value
- **AC-W2V-23** (script) — G a page whose button throws `TypeError` seven times · W a take that clicks it · T the report prints the first 5 errors and `… and 2 more`; the manifest's `x-take.pageErrors` holds all 7 first lines (and a 25-error page records 20)
- **AC-W2V-24** (script) — G a captions take of the ui-demo · W its manifest is validated and `command[]` is re-run · T it validates against the v1 spine schema; the re-run produces the same beat ids, preset and fps, and a frame count within ±1 (a `--script` take runs in real time; spine-timed takes are exact)
