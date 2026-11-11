# WP17 — UAT fix round hand-off

- builder-id: `wp17-fix-builder`
- branch: `feature/peak-media-wp17-fixes` (from `feature/peak-media-web2video` @ `3cdd299`)
- scope: defects D1–D8 in `uat-results.md`. No contract (`schemas/*.v1.json`) change.

## Per defect

| ID | What changed | Test |
|---|---|---|
| D1 | New `capture.mjs serve <dir\|file.html> [--port n]` (own `--help`): `serveDir` on 127.0.0.1 only, prints the URL on stdout and the pid on stderr, runs until SIGINT/SIGTERM, exits 0; busy port / missing folder are one line. `serveDir` now serves a folder's `index.html` at `/`, tightens the outside-root check, and drops idle connections on close. web2video step 4 gives the one command (background, `file://` is blocked, no other server, how to stop it); video-capture SKILL.md § Local pages, storyboard-api.md "Which page loads" | `evals/video-capture/privacy-serve.test.mjs` (2 × `WP17-D1`); `docs.test.mjs` now also checks `serve --help` flags; `skill.test.mjs` docs test resolves `serve` as a subcommand |
| D2 | web2video step 2: silent / "no text" / "nothing on screen but the app" = `--no-captions` only, cursor stays; `--no-cursor` only on an explicit no-cursor/pointer request | `skill.test.mjs` `WP17 UAT fixes…` |
| D3 | Storyboard exports `hide = ['sel', …]` (style sheet via `context.addInitScript` before the first navigation: holds from frame 0 and across `goto`; `visibility:hidden !important` on the element and its children) and `setup({ page, context, viewport, mode, fps })` (after load, before warm-up and t0; 60 s limit). Bad exports stop before a browser opens; invalid selector stops before recording; no-match is logged. `x-take.hide` / `x-take.setup` recorded when present. web2video steps 5 and 9 and storyboard-api.md § "Before t0" point at it | `privacy-serve.test.mjs` (4 × `WP17-D3`): control proves a top-of-storyboard `addStyleTag` leaks into frame 0; with `hide` no frame has the secret (incl. after a `goto` to page 2); with `setup()` no frame has it; bad exports are one line |
| D4 | web2video step 9: the sheet is `--at 0s,<beat midpoints>,<videoMs>ms`; the privacy pass always Reads the first and last frames full size (`--at 0s,<videoMs>ms --cols 1 --width <take width>`); hand-off names the frames read (`references/handoff.md`) | `skill.test.mjs` `WP17 UAT fixes…` |
| D5 | `contact-sheet`: times use the video stream's duration (stream `duration`, else `nb_frames`/fps, else container); last sample = last frame; an `--at` past it is clamped to it (so `<videoMs>ms` means the last frame) | `evals/verify/verify-tools.test.mjs` `WP17-D5` (1 s video + 1.5 s audio) |
| D6 | Checked: `sample-voice` and `spine` both send `DEFAULT_STYLE` (AC-UAT-03's manifest carries it on every clip), so the gap is text-dependent. web2video step 5 budgets at measured wpm × 0.9 (rounded down) and says to pass `spine`'s `--style` to `sample-voice` too; step 7: words, pauses and padding (`--lead-ms`, `--tail-ms`, storyboard waits) changed to hit the runtime are proposed, never applied silently | `skill.test.mjs` `WP17 UAT fixes…` |
| D7 | Skill-side fix: web2video's re-record runs the step 8 command from inside the project, rebuilt from its files and `x-take` (`preset`, `mode`, `cursor`, `signedIn`), not the saved `command[]`. `command[]` itself is unchanged (absolute), and video-capture SKILL.md says it re-runs in place only | `skill.test.mjs` `WP17 UAT fixes…`; AC-W2V-24 (login-reports) and AC-REC-09 (captions-mux) re-run: PASS |
| D8 | web2video step 6: a change requested at the gate is printed as `original → proposed` before it is applied and before any spine or capture command runs | `skill.test.mjs` `WP17 UAT fixes…` |

## Tests run (risk-gated, each alone, TMPDIR per run, deleted after)

- `evals/video-capture/privacy-serve.test.mjs` — 6/6 pass (new)
- `evals/verify/verify-tools.test.mjs` — 10/10 pass
- `evals/video-capture/docs.test.mjs` + `evals/web2video/skill.test.mjs` — 7/7 pass
- `evals/video-capture/login-reports.test.mjs` — 11/11 pass (AC-W2V-24 included)
- `evals/video-capture/captions-mux.test.mjs --test-name-pattern AC-REC-09` — 1/1 pass

Not run: beat / presets / capture / rest of captions-mux (the `serveDir` change is exercised by every local-page take above). No tracked evidence was rewritten; no MP4/WAV written to the repo.

## Open / notes

- D7 is fixed in the skill, not the engine; a moved project's `command[]` still names the old paths. If an engine fix is wanted later, store `x-take` args relative to the manifest folder.
- `CHANGELOG.md` 0.2.0 is still empty; not touched here.
