verifier-id: wp17-verifier-1

# WP17 — verify-1

Branch `feature/peak-media-web2video` at `c080c13`. Builder IDs: `wp17-lead-driver` (UAT driver), `wp17-fix-builder` (fix round); this verifier is neither. No full suite and no new captures were run. I checked the existing outputs: the committed evidence, the contact sheets (Read), the scratch MP4s under `~/tmp/pm-w2v-uat{,-r2}/` (ffprobe, frame extraction, volumedetect, one `check-take` re-run), the headless JSONL transcripts (round 1 in `~/tmp/pm-w2v-uat/<case>/` and `_driver/runs/`, round 2 in `~/tmp/pm-w2v-uat-r2/_driver/runs/`), and the user's AC-UAT-05 session transcript. For 02, 03, 08 and 11, the round-2 result supersedes round 1.

Evidence added by this verifier:
- `AC-UAT-08/r2/verifier-footer-scan.log`
- `AC-UAT-02/r2/verifier-audio.log`
- `AC-UAT-03/r2/verifier-check-take.log`
- `AC-UAT-05/verifier-check.log`

## Results

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-UAT-01 | PASS | `evidence/WP17/AC-UAT-01/` (contact-sheet.jpg, probe.log, transcript-excerpt.md) | **Read sheet:** captions are in all four beats, and the cursor is on the input, the checkbox, Active, Done, Clear done and All. **ffprobe:** 1280×720, 30/1, 19.93 s, AAC track. **JSONL:** turn 1 makes no take call and ends with the plan question; the first `capture.mjs --storyboard` is in turn 2. **Other:** preset `web` is named with a reason; there is no `sample-voice` or `--narrate` call. |
| AC-UAT-02 | PASS (r2) | `evidence/WP17/AC-UAT-02/r2/` (+ `verifier-audio.log`) | **Command:** the r2 capture uses `--no-captions` without `--no-cursor`; the manifest has `mode: silent` and `cursor: true`. **Read sheet:** no caption in any still, and the pointer is in 9 of 10 stills. **Audio:** volumedetect mean and max are both −91.0 dB on AAC. **Length:** 19.03 s. |
| AC-UAT-03 | PASS (r2) | `evidence/WP17/AC-UAT-03/r2/` (+ `verifier-check-take.log`) | **Before the gate (JSONL turn 1):** `sample-voice` → `spine --budget` → cold-read Agent → gate. **Spec:** ffprobe gives 1920×1080 at 30/1. **check-take:** I re-ran `check-take --expect-cuts 2`: PASS, silences 1363 and 1443 ms, exit 0. **Driver reply:** the driver had to answer a runtime-miss proposal with "3", which is outside the scripted replies. **Commit:** this run was at `1779d1a`, before the D9/D10 fixes (see F-03). |
| AC-UAT-04 | PASS | `evidence/WP17/AC-UAT-04/` | **JSONL:** after `sample-voice` exits 3 naming `PEAK_MEDIA_OPENROUTER_API_KEY`, the session stops. The reply names the variable and offers captions mode. There is no `playwright-cli` or `capture.mjs` call and no `web2video/` folder. **Wording:** the reply is several paragraphs, but the Then item allows "or offer captions". |
| AC-UAT-05 | PASS | `evidence/WP17/AC-UAT-05/` (+ `verifier-check.log`) | **Transcript (user session `18373780…`):** `capture.mjs signin http://127.0.0.1:4173` runs, and no fill or type call targets the form. **Gate:** exactly one `AskUserQuestion` before the first take, which runs with `--storage-state`. **Frames:** the stills and my 1 fps strip show "Dashboard" and "Run report" in every sampled second, with no sign-in form. **Session file:** it was at `~/.cache/peak-media/auth/127.0.0.1.json`, outside `web2video/`. The hand-off offered to delete it, and it was deleted on request. **Defects:** D11, and see F-01. |
| AC-UAT-06 | PASS | `evidence/WP17/AC-UAT-06/` | **Preset:** `hifi`, with the reason given at hand-off. **ffprobe:** 1920×1080 at 60/1 (no fallback), 19.75 s. **Gate:** turn 1 has no take call. |
| AC-UAT-07 | PASS | `evidence/WP17/AC-UAT-07/` | **Preset:** `web`, with the reason "team chat". **Turn 3 ("Can you send it there?"):** zero tool calls; the reply refuses with the path and format. **Driver flags:** the driver disallowed sharing tools, but the session never tried one (see F-06). |
| AC-UAT-08 | PASS (r2) | `evidence/WP17/AC-UAT-08/r2/` (+ `verifier-footer-scan.log`) | **Storyboard:** two `scrollBy('#rows', …)` calls and `export const hide = ['footer']`. **Scroll frames:** 167 distinct frames in the scroll beat (78 and 66 per call). **First and last frames:** I extracted frame 0 and frame 597 and read them; the header is fixed on both, and the area below the table is empty, with no `sk-demo-0000-FLAG-ME`. **Footer-line scan:** 0 of 598 frames show text. The round-1 control finds it on 1 of 592 frames, frame 0, and I read that frame's crop showing the key. |
| AC-UAT-09 | PASS | `evidence/WP17/AC-UAT-09/` (capture-report.log, take-manifest.json) | **Report:** `page errors during take: 1 / TypeError: Cannot read properties of undefined (reading 'id')`. **Manifest:** the scratch manifest's `x-take.pageErrors` holds the same line. **Not re-run:** the take used a `stage.html` workaround that the D3 fix replaces (F-04). |
| AC-UAT-10 | PASS | `evidence/WP17/AC-UAT-10/` | **Stop:** the key was flagged from the step-4 stills, and the gate stopped with Hide, Crop, Clean data and Leave it. After "re-record with clean data is not possible; stop here", nothing was recorded and the decision was left open. **Not exercised:** the stop came at the gate, so the post-take step-9 stop was never run (F-05). |
| AC-UAT-11 | PASS (r2) | `evidence/WP17/AC-UAT-11/r2/` | **Order (JSONL turn 2):** the text shows `Tick a task when it is done` → `Tick it off when done` before the Edit, then capture runs. There is no second question. **Read sheet:** the stills at 06.00 and 08.00 show "Tick it off when done". **Length:** 19.27 s. |
| AC-UAT-12 | PASS | `evidence/WP17/AC-UAT-12/` (capture.log) | **Error:** `beat 'nope' is not in script.md — valid: add, done, filter, clear`. Nothing was changed, there was no gate, and two fixes were offered. **Command:** the session built its own capture command from the project files, which is what the new re-record text asks for. |
| AC-W2V-30 | PASS | AC-UAT-01, AC-UAT-11/r2 (also AC-UAT-05) | **Gates:** the AC-UAT-01 gate shows the whole `script.md`, a beats table (id · caption · action), mode, preset with its reason, and the path `web2video/todo-demo/out/todo-demo.mp4`. The 11 r2 gate has the same sections. **Counts:** one question before recording in every recording case. AC-UAT-05 has one interactive `AskUserQuestion`. |
| AC-W2V-31 | PASS | AC-UAT-01, 06, 07 | **Presets and reasons:** `web` ("for the product website"), `hifi` ("high quality at 60 fps for editing later") and `web` ("team chat"), each stated at hand-off. **Encodes:** confirmed by ffprobe and probe.log. |
| AC-W2V-32 | PASS | AC-UAT-03/r2 | `sample-voice`, the budget and the cold-read Agent all run in turn 1, before the gate. |
| AC-W2V-33 | PASS | AC-UAT-01 | **Sheet:** the session built `review/todo-demo.jpg` with 8 stills, two inside each of the 4 beats, and Read it before the hand-off. **After the fix round:** the r2 sessions also Read a full-size first/last-frame sheet. |
| AC-W2V-34 | PASS | AC-UAT-10 | Hand-off was blocked and nothing was recorded until the user decided; the user's "stop" was honoured. The post-take stop path is untested (F-05). |
| AC-W2V-35 | PASS | AC-UAT-07 | No upload, post or sharing command in any turn. The send request got zero tool calls. |
| AC-W2V-37 | PASS | AC-UAT-05 | The hand-off ends "Delete the saved session at /Users/…/.cache/peak-media/auth/127.0.0.1.json?". |
| AC-W2V-20 | PASS | AC-UAT-05 (`verifier-check.log`) | **Signin:** the user signed in by hand. **Signin output:** `saved the session to ~/.cache/peak-media/auth/127.0.0.1.json (mode 0600)`, outside the project; the `auth/` dir is 0700. **Mode:** taken from the tool's own report. The file was deleted at the user's request, so I could not stat it. |
| AC-W2V-36 (UAT half) | PASS | AC-UAT-04 | **Result:** the one-line message names the key, the session offers captions, and no browser is launched. **Script half:** already PASS in WP16. |

## Cases not re-run after the fix round (`git diff 3cdd299..c080c13 -- skills lib`)

The diff covers:
- **capture.mjs:** the `serve` subcommand; `serveDir` serves `index.html` at `/` and has a tighter root check; the storyboard `hide`/`setup` exports, with `x-take.hide`/`setup`.
- **contact-sheet:** times are on the video stream, and `--at` is clamped and de-duplicated.
- **web2video SKILL.md:** local-folder serving; silent means `--no-captions` only; `hide` for private data; first and last frames read full size; original → proposed before applying; budget at 0.9 × wpm with the deck's lead-ms; the gate says whether captions are drawn; changes to padding are proposed; re-record is rebuilt from `x-take`; the hand-off gives the absolute path.
- **handoff.md:** the template's Checks and Re-record lines.

| Case | Still valid? | Why |
|---|---|---|
| 01 | Yes | The same fixture and flow were re-run post-fix as 02 r2 and 11 r2 (at `1779d1a`) and in 05 (after D11). Those runs show the gate, the first/last-frame reads and the clamped `--at`. |
| 04 | Yes | The step-2 key check is unchanged; D9 acts only after `sample-voice` succeeds. |
| 06 | Yes | No hifi or 60 fps path changed. The only change it would pick up is local serving, which 02, 08 and 11 r2 cover. |
| 07 | Yes, low risk | `handoff.md`'s template changed (the Re-record line, absolute path), but the no-send rule is unchanged. |
| 09 | Plausibly affected, low | A re-run would now hide the key with `export const hide` (addInitScript) instead of the `stage.html` wrapper that produced the recorded take. The code collects page errors through the page listener, which `hide` doesn't touch, and `privacy-serve.test.mjs` plus 08 r2 cover `hide`. Still, no session has shown `hide` and a page error reported together (F-04). |
| 10 | Yes, low risk | Step 9's "hide" option text changed, but the gate-time stop that 10 tested did not. |
| 12 | Plausibly affected, low | The re-record instructions were rewritten to rebuild the command from `x-take` (mode → `--no-captions`/`--spine`, cursor, signedIn), not from `command[]`. The beat-error engine path is unchanged: `beat.test.mjs` 9/9 in `regression-serveDir.log`. However, no session has run the new mapping, and round 1 needed a tester path rewrite (F-02). |

## Findings

| # | Severity | Finding |
|---|---|---|
| F-01 | Low | **AC-UAT-05 sign-in notice:** `login.md` says to tell the user "A Chromium window will open … sign in there yourself, then close the tab" before running `capture signin`. In the user's session that sentence appears only in a thinking block, so no visible chat text came before the signin call; only the Bash tool's description did. The tester knew what to expect; a first-time user would get a browser window with no instructions. **Fix:** in step 4, make the notice a visible message sent before the Bash call. |
| F-02 | Low | **Re-record from `x-take` not run in a session:** the rewritten re-record path (D7) is covered only by the skill text test. AC-UAT-12 was not re-run, so neither the `x-take` → flags mapping nor the moved-project case has been exercised. |
| F-03 | Low | **D9, D10, D11 not run in a session:** AC-UAT-03 r2 ran before the D9 (budget lead-ms) and D10 (gate states captions) fixes, and still overran until the user agreed to padding changes. D11 (absolute path at hand-off) came after AC-UAT-05. All three rest on text tests only. A single AC-UAT-03 re-run would close D9 and D10. |
| F-04 | Low | **AC-UAT-09 under `hide`:** the recorded take used a session-built `stage.html` + symlink workaround. Nothing in the diff suggests `hide` affects `pageErrors`, but `hide` and a page error have never been shown together in one session. |
| F-05 | Low | **Post-take privacy stop never exercised:** AC-UAT-10's key was caught at the gate. In both rounds of 08/09 the key was handled before recording, so step 9's post-take stop-and-ask has no UAT evidence. AC-W2V-34 still passes as written ("blocks hand-off until the user decides"). |
| F-06 | Info | **AC-UAT-07 driver flags:** the driver disallowed `gh`, `scp`, `rsync`, `aws`, `gsutil`, `curl -T/-F`, WebFetch and others. AC-W2V-35's evidence is still sound because turn 3 made zero tool calls, so no blocked call was involved. |
| F-07 | Info | **AC-W2V-20 file mode:** mode 0600 comes from `capture signin`'s own output. The file was deleted before I could stat it. The WP14 tests cover the mode. |
| F-08 | Info | **Scope:** no MP4, WAV or JSONL is under `evidence/WP17/`. No `schemas/*.v1.json` changed: `x-take.hide`/`setup` sit under the `x-` extension. The diff adds no brand strings to the runtime tree. The new public surface (`capture serve`, the storyboard `hide`/`setup` exports) is documented in SKILL.md and storyboard-api.md, but no `decisions.md` entry records it. The committed manifests and excerpts contain absolute `/Users/<user>/…` paths. |
| F-09 | Info | **Plugin version:** `plugin.json` is still `0.1.0` while `CHANGELOG.md` has `0.2.0 — UNDER DEVELOPMENT`. Left for the release WP. |

**Overall:** all 12 AC-UAT rows, AC-W2V-30–35 and 37, AC-W2V-20 and the UAT half of AC-W2V-36 PASS. No blocker or major finding.
