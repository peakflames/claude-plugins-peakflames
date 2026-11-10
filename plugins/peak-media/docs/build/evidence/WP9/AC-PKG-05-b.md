# AC-PKG-05 (b) — captioned live-capture demo, cold start

- **Date:** 2026-11-09
- **Driver:** agent standing in for the user (user-approved), headless `claude -p` sessions.
- **Plugin:** peak-media 0.1.0 as installed from GitHub by AC-PKG-02 (cache copy at
  `~/tmp/pm-pkg02/.claude-config/plugins/cache/peakflames-plugins/peak-media/0.1.0`, commit
  `afffa64`), loaded with `--plugin-dir` on that cached install. See "Harness note".
- **Folder:** `~/tmp/pm-pkg05/demo` (no CLAUDE.md, outside any repo)
- **Session id:** `afd06e7b-c29b-411b-9ce7-ddc51402f04d`

## Prompt

> Make a captioned 20-second demo of this todo app: https://demo.playwright.dev/todomvc/ — add
> three todos, complete one, then filter to the active ones. No narration. Save it as
> out/demo.mp4.

## Run

One turn, no questions asked, no answers given. The session invoked
`Skill peak-media:video-capture`, read `skills/video-capture/references/storyboard-api.md` and the
`examples/ui-demo` storyboard, explored the page with `playwright-cli` (snapshot, fill, press),
wrote `storyboard.mjs`, recorded with `skills/video-capture/scripts/capture.mjs`, retimed one wait
and re-recorded, then made a review sheet with `lib/verify/contact-sheet.mjs` sampled inside the
caption windows (`--at 1.5s,6.5s,10.5s,14s,18…`) and Read it.

Session's own report: 19.97 s, 1280×720, 30 fps, H.264 + silent AAC 48 kHz, faststart, passed
the format and take checks. It flagged one issue itself: caption 2 ends at ~6.4 s while the third
todo is still being typed, leaving ~1.5–2 s with no caption.

## Outputs

| Path | Present |
|---|---|
| `~/tmp/pm-pkg05/demo/out/demo.mp4` | yes (170 KB) |
| `~/tmp/pm-pkg05/demo/out/demo.take.json` | yes — `videoMs` 19967, 5 captions, `narrate: false` |
| `~/tmp/pm-pkg05/demo/storyboard.mjs` | yes |
| `~/tmp/pm-pkg05/demo/review/demo.jpg` | yes (session's caption-window sheet) |

Contact sheet (1 s, plugin's `contact-sheet.mjs --every 1s`): `AC-PKG-05-b-sheet.jpg`.
All steps visible in order: three todos added (Buy groceries, Walk the dog, Pay the electric bill),
"Walk the dog" ticked, Active filter showing two items. Captions sit at the bottom, clear of the
list. No caption at ~6.5–8.5 s and ~14.9–15.5 s; last ~1.4 s uncaptioned (end hold).

## Only SKILL.md check — PASS

Transcript `~/tmp/pm-pkg02/.claude-config/projects/-Users-schaveyt-tmp-pm-pkg05-demo/afd06e7b-c29b-411b-9ce7-ddc51402f04d.jsonl`
scanned for any Read/cat/grep/find of `plugins/peak-media/docs/` or `docs/build/`: **0 hits**.
Plugin files read: `skills/video-capture/SKILL.md` (via Skill), `skills/video-capture/references/storyboard-api.md`,
`skills/video-capture/examples/ui-demo/storyboard.mjs`; scripts run: `capture.mjs`, `contact-sheet.mjs`.

## Reviewer (D7–D10)

Not run here; the Lead runs a separate reviewer agent.

## Harness note

The first attempt (session `dcca04bb-5d18-489c-9b16-6aa450db2920`, folder kept as
`~/tmp/pm-pkg05/demo-attempt1-noplugin`) is **invalid**: the PKG-02 install is project-scoped to
`~/tmp/pm-pkg02` (`installed_plugins.json` → `projectPath`), so copying `.claude/settings.json`
into the run folder did not load the plugin, and the session hand-rolled a Playwright + ffmpeg
recording without peak-media. Re-run with `--plugin-dir` pointed at the same cached GitHub install.

## Reviewer (fresh agent, no repo context) — 2026-11-09
- D7 PASS — probe-spec exit 0 (1280×720, H.264 High, yuv420p, AAC 48 kHz, faststart); 19.967 s vs videoMs 19967.
- D8 PASS — all 5 caption stills show their action done or under way; no lateMs (captions mode).
- D9 PASS — check-take: silent whole take; 9 scene changes, 0 outside silence.
- D10 PASS — 5/5 captions readable bottom-centre, clear of the action; none at 11.7 s; 6.4–8.5 s uncaptioned typing doesn't hurt.
- Actions PASS — 3 todos added, one completed, Active filter with 2 left.
