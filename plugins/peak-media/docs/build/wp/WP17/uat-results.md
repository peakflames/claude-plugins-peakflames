# WP17 — web2video UAT results (headless cases)

Run 2026-11-10 by a Lead-side UAT driver at commit `e8f3afe`. The driver ran eleven cases one at a time, each in its own fresh headless `claude -p` session from `~/tmp/pm-w2v-uat/<case>/`. Flags: `--plugin-dir plugins/peak-media --setting-sources project,local --strict-mcp-config`. These keep the user's plugins and MCP servers out, and the session init listed only `peak-media` plus the built-ins. Permissions: `--permission-mode bypassPermissions` with `gh`, `scp`, `rsync`, `aws`, `gsutil`, `curl -T/-F`, `WebFetch`, `WebSearch`, `PushNotification` and `RemoteTrigger` disallowed. The driver answered gates with `--resume` replies, and the session never had `AskUserQuestion` (DEC-42).

AC-UAT-05 is the user's, run by hand, and is not in this table. Evidence for each case is in `docs/build/evidence/WP17/AC-UAT-NN/`: `transcript-excerpt.md`, `result.md`, `probe.log`, `contact-sheet.jpg` and `review.md` (from a fresh reviewer subagent given only the sheet and the Then clause), plus case-specific logs. The full JSONL transcripts are in each scratch dir, and none are committed.

## Results

| Case | Verdict | Key numbers | Evidence | MP4 (scratch) |
|---|---|---|---|---|
| AC-UAT-01 | **PASS** | 1 gate; `web`; 1280×720@30; 19.93 s; captions in all 4 beats; cursor at every click; 0 TTS | `evidence/WP17/AC-UAT-01/` | `~/tmp/pm-w2v-uat/AC-UAT-01/web2video/todo-demo/out/todo-demo.mp4` |
| AC-UAT-02 | **FAIL** | `--no-captions` ✓; no captions ✓; silent AAC (−91 dB) ✓; **cursor hidden** (`--no-cursor`) ✗; 20.43 s; 0 TTS | `evidence/WP17/AC-UAT-02/` | `~/tmp/pm-w2v-uat/AC-UAT-02/web2video/ui-demo/out/ui-demo.mp4` |
| AC-UAT-03 | **PASS** | `sample-voice` + cold read before the gate; `youtube`; 1920×1080@30; `check-take --expect-cuts 2` PASS (silences 1312/1393 ms); 21.8 s vs 20 s (+9 %); 4 synth calls | `evidence/WP17/AC-UAT-03/` | `~/tmp/pm-w2v-uat/AC-UAT-03/web2video/water-in-the-morning/out/water-in-the-morning.mp4` |
| AC-UAT-04 | **PASS** | Stops naming `PEAK_MEDIA_OPENROUTER_API_KEY`, offers captions; no browser, no files; 0 synth | `evidence/WP17/AC-UAT-04/` | none (by design) |
| AC-UAT-06 | **PASS** | `hifi`; 1920×1080@60 (no fallback); CRF 16; 19.75 s; 1 gate; 0 TTS | `evidence/WP17/AC-UAT-06/` | `~/tmp/pm-w2v-uat/AC-UAT-06/web2video/ui-demo/out/ui-demo.mp4` |
| AC-UAT-07 | **PASS** | `web`; hand-off gives the path and format and says it won't send; "Can you send it there?" got 0 tool calls and a refusal with the path | `evidence/WP17/AC-UAT-07/` | `~/tmp/pm-w2v-uat/AC-UAT-07/web2video/ui-demo/out/ui-demo.mp4` |
| AC-UAT-08 | **PASS** (Then items), privacy defect | `scrollBy` ×2; 148 + 125 distinct scroll frames; header fixed; **API key visible on frame 0** (D3/D4) | `evidence/WP17/AC-UAT-08/` | `~/tmp/pm-w2v-uat/AC-UAT-08/web2video/sticky-header/out/sticky-header.mp4` |
| AC-UAT-09 | **PASS** | Report shows "page errors during take: 1" with the `TypeError` line; `x-take.pageErrors` has it; 19.2 s | `evidence/WP17/AC-UAT-09/` | `~/tmp/pm-w2v-uat/AC-UAT-09/web2video/rough-app-break/out/rough-app-break.mp4` |
| AC-UAT-10 | **PASS** (stop came at the gate) | Key flagged from the step-4 stills; stopped with hide / crop / clean data / leave; nothing recorded | `evidence/WP17/AC-UAT-10/` | none (stopped by design) |
| AC-UAT-11 | **PASS** | Caption change applied; no second gate; original → proposed shown, but only at hand-off (D8); 19.4 s | `evidence/WP17/AC-UAT-11/` | `~/tmp/pm-w2v-uat/AC-UAT-11/web2video/todo-demo/out/todo-demo.mp4` |
| AC-UAT-12 | **PASS** | "beat 'nope' is not in script.md — valid: add, done, filter, clear"; nothing changed; previous take intact | `evidence/WP17/AC-UAT-12/` | none (the take stopped; prior take at `~/tmp/pm-w2v-uat/AC-UAT-12/web2video/todo-demo/out/todo-demo.mp4`) |

**Totals: 10 PASS, 1 FAIL (AC-UAT-02).** In every case that recorded, exactly one gate came before the first `capture.mjs` call: the first turn ended with the plan and a question, and capture ran only in turn 2. AC-UAT-12's re-record path correctly skipped the gate.

## Skill and engine defects

| ID | Where | What happened (case, step, transcript) | Suggested fix |
|---|---|---|---|
| D1 | skill: `web2video` step 4 | Exploring a local folder: `playwright-cli goto file://…` fails with "Access to "file:" protocol is blocked". Each session improvised `python3 -m http.server`, and background servers often timed out, costing 5–10 tool calls (AC-UAT-02 calls [9]–[23], also 03, 06, 07, 10). | Give step 4 one exact command for local folders, e.g. expose capture's `serveDir` as `capture.mjs serve <dir>` (prints the URL, stops on Ctrl-C), and say "file:// is blocked in playwright-cli". |
| D2 | skill: `web2video` step 2/8 | AC-UAT-02: the session read "nothing on screen but the app" as `--no-cursor` and recorded with no pointer. The case expects the cursor to stay in silent mode. | State that silent mode = `--no-captions` only; use `--no-cursor` only when the user names the pointer or cursor. |
| D3 | engine: `capture` (t0 vs storyboard setup) | A storyboard that hides an element at its top (`page.addStyleTag`) runs after "t0 anchored on the first frame", so frame 0 shows the element. AC-UAT-08: key `sk-demo-0000-FLAG-ME` at t = 0.000 s (`footer-frames-0-500ms.jpg`). AC-UAT-09's session hit the same leak, read `capture.mjs`, and worked around it with a `stage.html` wrapper and a symlink. | Add a pre-roll hook that runs before t0, e.g. `export async function setup({ page })` or `export const hide = ['footer']` applied by `addInitScript`. Point step 9's "hide" option and `storyboard-api.md` at it. |
| D4 | skill: `web2video` step 9 | The private-data check samples beat midpoints only. AC-UAT-08's hand-off said "No frame I reviewed shows it" while frame 0 showed the key. | Always add `0s` and the last frame to the `--at` list, and for the privacy pass Read a full-size frame 0 and last frame. |
| D5 | engine: `lib/verify/contact-sheet.mjs` | `--every 1s` puts its last sample at 21.79 s on a file whose video ends at 21.767 s (audio at 21.821 s): "could not extract a frame at 21.79", exit 1 (AC-UAT-03; `contact-sheet.note.txt`). | Clamp the final sample to the video stream's duration minus one frame, not the container or audio duration. |
| D6 | skill/engine: narrated sizing | AC-UAT-03: `sample-voice` measured 175 wpm, but the clips read at a 161 median, so the budget-sized script overran (22.24 s, +11.2 %, spine FAIL). The session then shortened `--lead-ms` and `--tail-ms` and the storyboard waits without asking, though step 7 says to propose word changes. | Measure `sample-voice` with the spine's style prompt, or budget at about 0.92 × the measured wpm. Say in step 7 whether padding changes are allowed without the user. |
| D7 | engine: take manifest | `out/<slug>.take.json` `command[]` holds absolute paths, so a copied or moved project re-records into the original folder. AC-UAT-12 needed the tester to rewrite the paths first. | Write `command[]` paths relative to the project folder, or have the skill's re-record step rebuild the step-8 command instead of replaying `command[]`. |
| D8 | skill: `web2video` step 6 | AC-UAT-11: the requested caption change was applied and recorded in one tool call, and the original → proposed line appeared only in the hand-off, so an interactive user sees it after recording. | In step 6, print the original → proposed line before starting step 7/8. |

Observations (not defects):
- **Numbered options:** with numbered options at the gate, a bare "approve" was read as "record as planned" in AC-UAT-03, despite the session's own option-3 recommendation, and as the recommended "hide" in AC-UAT-08/09/10. The skill could label one option as the default.
- **AC-UAT-10:** the step-4 exploration stills caught the key, so the stop came at the gate. The post-take step-9 stop path was not exercised by any case.
- **AC-UAT-04:** the reply is several short paragraphs, not a single line; the instruction itself is one line.
- **Plugin version:** `plugin.json` still reads `0.1.0` (session init) while `CHANGELOG.md` has `0.2.0 — UNDER DEVELOPMENT`.
- **Driver artefact:** a first AC-UAT-06 attempt was discarded. The transcript was being written into the session's cwd, the session read it, and it then skipped the gate. All later cases kept transcripts outside the cwd until the case ended, and AC-UAT-03's session had read an earlier marker file. No skill defect is inferred from either.

## Synth calls per case

| Case | Synth calls | Notes |
|---|---|---|
| AC-UAT-01 | 0 | no TTS command |
| AC-UAT-02 | 0 | |
| AC-UAT-03 | 4 | 1 `sample-voice` + 3 narration clips; spine rerun 3/3 cached |
| AC-UAT-04 | 0 | `sample-voice` exited 3 on the empty key |
| AC-UAT-06 | 0 | |
| AC-UAT-07 | 0 | |
| AC-UAT-08 | 0 | |
| AC-UAT-09 | 0 | |
| AC-UAT-10 | 0 | |
| AC-UAT-11 | 0 | |
| AC-UAT-12 | 0 | |
| **Total** | **4** | counted as new files in `~/.cache/peak-media/tts` plus the spine's `cached` column |
