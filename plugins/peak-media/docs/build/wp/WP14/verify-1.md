verifier-id: wp14-verifier-1

# WP14 verify-1 — login and reports

Builder: `wp14-builder` (from handoff.md), a different agent. Branch `feature/peak-media-wp14` at
`cfab8e5`, after merging `feature/peak-media-web2video` (the Lead's AC-W2V-24 ±1 rewording).
No visible window was opened and no password was typed. The headed browser was already installed
(`~/.cache/peak-media/browsers/chromium-1254`), so it was not downloaded again.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-W2V-20 | BLOCKED (needs user) | `wp/WP14/signin-runbook.md` | The runbook is complete and correct for a user: prerequisites, fixture start, sign-in, close the tab, expected one-line output, `stat` modes 700/600, `git status` clean, optional take, negative checks, clean-up. The CLI calls match `capture signin --help` and `contact-sheet --help`. Two Low nits are listed below. Runs in WP17. |
| AC-W2V-21 | PASS | `evidence/WP14/AC-W2V-21.verifier.log`, `login-reports.verifier.log` | By hand, with both browser paths pointing at launch-spy scripts: `--storage-state /nonexistent.json` exits 1 with one stderr line (`… no such file — save a session first with: capture signin <url>`), empty stdout, no spy marker and no MP4. An unreadable (000) file, a file without `cookies[]` and a directory are also refused in one line, with no launch. The eval passes. |
| AC-W2V-22 | PASS | `evidence/WP14/AC-W2V-22-verifier.jpg`, `AC-W2V-22.verifier.json` | My own take: login fixture with a random token, a storage-state built from the fixture's `Set-Cookie`, mode 0600. Contact sheet, 7 stills from 0.00 to 2.97 s: every still is the white Dashboard with "Run report" (and "Report ready: 42 rows" from 2.50 s), captions "Signed in: the dashboard" and "Run the report", and the cursor. None shows the red sign-in form. Manifest: `x-take.signedIn: true`. The token is not in the manifest, stdout or stderr, and there is no `"cookies"` key. `command[]` keeps `--storage-state <path>`. The eval, including its signed-out control, passes. |
| AC-W2V-23 | PASS | `login-reports.verifier.log` (AC-W2V-23 ok) | The eval output matches plan §4.8: `wrote …w23-seven.mp4 (17 kB, 1280x720 @ 30 fps, 1.7 s, preset web)`, `beats: boom 0.01–1.73 s`, `page errors during take: 7`, the first 5 `TypeError` lines indented, then `  … and 2 more`. The manifest's `pageErrors` holds all 7 first lines. With 25 errors it records 20 (`pageErrorCount` 25) and the report ends `… and 20 more`. |
| AC-W2V-24 | PASS | `login-reports.verifier.log` (AC-W2V-24 ok) | The ui-demo captions take validates against the v1 spine schema. `x-take` has `preset`, `cursor`, `signedIn`, `sizeBytes`, `pageErrors`, and `beats[]` with `id/startMs/endMs/lateMs`. Top-level `beats[]` has one real entry per beat. `command[]` re-run from another directory gives the same preset, fps and beat ids; frames were 292 and 291 (within ±1). My own take printed `wrote … (22 kB, 1280x720 @ 30 fps, 3.0 s, preset web)` / `beats: dash 0.01–1.51 s · report 1.51–3.01 s`, and no page-error lines because there were none. |

## Review

- **signin target.** The default is `<dataDir>/auth/<host>.json`. `writeSession` creates the folder
  0700 (and forces 0700 on the default folder) and writes the file 0600, also over an existing
  0644 file (eval). Only the path is printed. `--save` inside `./web2video/` or a git work tree
  exits 2 in one line naming the default, before any launch (by hand: `review-signin.verifier.log`).
  `signin --version` = 0.1.0 = plugin.json.
- **`--timeout`.** It rejects, then `finally` closes the browser. Nothing is written, and the exit
  code is non-zero (eval: `not done within 4s — nothing saved`, no file, empty stdout).
- **Headed browser (DEC-49).** `lib/browser.mjs` asks the pinned Playwright for
  `chromium.executablePath()` with `PLAYWRIGHT_BROWSERS_PATH=<dataDir>/browsers`. It resolves to
  `~/.cache/peak-media/browsers/chromium-1254/…/Google Chrome for Testing`, not the stray
  `~/Library/Caches/ms-playwright` copy. `signin` and `--headed` launch it. Otherwise
  `executablePath: plan.headed ?? plan.chrome` keeps recording on the HyperFrames headless shell
  (the eval's spies confirm the render browser is not launched for `--headed`).
- **setup.sh.** `--check` exits 0 here. When the headed browser is missing it exits 3 with one line
  (`headed browser missing (Playwright's Chromium, …) — run …/setup.sh`). `--check --skip-browser`
  exits 0. On install, it skips both browsers with `--skip-browser`, and otherwise runs
  `playwright/cli.js install --no-shell chromium` into `<dataDir>/browsers`.
- **Full suite** (one run, `TMPDIR` temp dir, deleted afterwards): 148 tests, 147 pass, 1 fail.
  The failure is AC-PKG-01 (plugin.json 0.1.0 vs CHANGELOG 0.2.0), which is expected until WP18.
  AC-PKG-04/08, AC-BASE-01 and AC-BASE-09 pass. The tracked WP5/WP10 evidence was restored with
  `git checkout --`. Log: `evidence/WP14/full-suite.verifier.log`.
- **Scope.** `git diff --stat 9c5a7fc..HEAD` touches only owned files. The one exception is
  `acceptance.md`, which came from the Lead's 285f6b8; WP14's `brief.md` change also came from it.
  There are no MP4/WAV/WebM/MKV files and no session files. The evidence contains no cookie values
  (the signin-simulated value is `<redacted>`). `grep -rli peakflames` over skills, lib, schemas,
  brand-packs, vendor, scripts and evals finds 0 hits. Contracts are unchanged; the new `x-take`
  fields fit the v1 spine schema. `pageErrorCount` is an additive `x-take` field not named in the
  brief (Info).
- No browser processes were left running.

## Findings

1. **Low — the `web2video/` refusal can be bypassed through a symlinked path.** `signinTarget`
   compares `path.resolve(cwd, 'web2video')` with the unresolved `--save` path, and the OS returns
   `process.cwd()` already realpath'd. With cwd `<v>/proj` on macOS (`/var` → `/private/var`),
   `--save <v>/proj/web2video/sub/x.json` was **not** refused, and the browser launched (spy). The
   same path spelled through the realpath is refused. The git-work-tree check is unaffected, so
   this matters only for a project that is not a git checkout. Fix: `realpath` the nearest
   existing ancestor of the `--save` path and the cwd before comparing. Repro:
   `review-signin.verifier.log`.
2. **Low — a headed-browser launch failure is not one line.** When the headed executable exists
   but fails to start, `signin` prints `unexpected error: browserType.launch: …` followed by
   Playwright's multi-line call log, and exits 70. I saw this only with a spy that exits 1. A real
   install is unlikely to hit it.
3. **Low — runbook nits (AC-W2V-20).** (a) Step 1 points to WP17's
   `evals/web2video/uat/fixtures/login-demo/server.mjs` and describes how it behaves, but that file
   does not exist yet. (b) Steps 2, Expected and Clean-up hard-code `~/.cache/peak-media`, which
   is right only when `CLAUDE_PLUGIN_DATA` is unset (line 13 says this, but the commands don't
   follow it).
4. **Info — the report shows an absolute path under symlinked temp dirs.** `report()` falls back
   to the absolute `--out` path when `path.relative(cwd, out)` starts with `..`. On macOS temp dirs
   (`/var` vs `/private/var`) that happens even when `--out` is inside the cwd. This is cosmetic.
5. **Info — wording.** `--storage-state <a directory>` says "no such file". The message is
   acceptable, but it is not exact.

No Critical, High or Medium findings. AC-W2V-21..24 PASS; AC-W2V-20 is blocked: needs user.
