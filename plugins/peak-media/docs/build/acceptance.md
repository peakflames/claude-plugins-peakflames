# peak-media acceptance register

Generated from `plan.md` §4 in WP0; edited by hand after that. IDs are stable — never reused or renumbered. Methods: `script` (deterministic; lives in `plugins/peak-media/evals/` where it doubles as a shipped eval), `still` (Verifier reads a labelled contact sheet), `manual` (user).

Status values: `not-started` · `PASS` · `FAIL` · `blocked: <reason>`. Only a verifier report sets `PASS`. Every `PASS` must name an evidence file under `evidence/<WP>/` (checked by `ac-run --trace`).

## WP status

| WP | Status | Verify report |
|---|---|---|
| WP1 | verified | wp/WP1/verify-2.md |
| WP2 | verified | wp/WP2/verify-1.md |
| WP3a | not-started | — |
| WP3b | not-started | — |
| WP4 | not-started | — |
| WP5 | not-started | — |
| WP6 | not-started | — |
| WP7a | not-started | — |
| WP7b | not-started | — |
| WP8 | not-started | — |
| WP9 | not-started | — |
| WP10 | not-started | — |

## Register

| ID | source | WP | given / when / then | method | status | evidence |
|---|---|---|---|---|---|---|
| AC-CON-01 | §7 | WP1 | G the three v1 schemas · W `validate` runs on the F0, F1 and neutral fixtures · T exit 0 for each | script | PASS | evidence/WP1/AC-CON-01.log |
| AC-CON-02 | §7 | WP1 | G 6 bad fixtures (missing schemaVersion, schemaVersion 2, negative duration, unknown kind, plate without beat, brand missing tokens) · W validate · T each exits non-zero and names the field | script | PASS | evidence/WP1/AC-CON-02.log |
| AC-CON-03 | D11 | WP1 | G the archived `narration.json` mapped into the manifest · W validate · T it passes and every legacy clip field is kept | script | PASS | evidence/WP1/AC-CON-03.log |
| AC-SKL-01 | kickoff §3 | WP2 | G F0 and no TTS key · W `skeleton` runs beatgrid → 1 motion plate → composite · T `out/final.mp4` exists and lasts 3.0 s ±1 frame | script | PASS | evidence/WP2/AC-SKL-01.log |
| AC-SKL-02 | D7 | WP2 | G AC-SKL-01's output · W `probe-spec` · T H.264 High, yuv420p, AAC 48 kHz, faststart, 1280×720 | script | PASS | evidence/WP2/AC-SKL-02.log |
| AC-SKL-03 | kickoff §5 | WP2 | G any MP4 · W `contact-sheet --every 0.5s` · T a JPEG grid with a timecode label on each frame; the Lead reads the F0 sheet and the kinetic text is legible | still | PASS | evidence/WP2/AC-SKL-03-verifier.jpg |
| AC-SKL-04 | DEC-13 | WP2 | G a synthetic MP4 with one cut in silence and one cut over a tone · W `check-cuts --min-silence-ms 300` · T the first passes, the second fails, and the timecode is reported | script | PASS | evidence/WP2/AC-SKL-04.log |
| AC-SKL-05 | determinism | WP2 | G F0 · W the plate is rendered twice · T the per-frame `framemd5` matches exactly | script | PASS | evidence/WP2/AC-SKL-05.log |
| AC-SKL-06 | determinism | WP2 | G the network is blocked during render · W the F0 plate renders · T it succeeds (fonts and GSAP are local) | script | PASS | evidence/WP2/AC-SKL-06.log |
| AC-SKL-07 | DEC-05 | WP2 | G the repo · W grep for the HF/Playwright version strings · T they appear only in `lib/pins.json` (plus lockfile/VENDORED.md) | script | PASS | evidence/WP2/AC-SKL-07.log |
| AC-TRC-01 | orch §5 | WP2 | G acceptance.md and the briefs · W `ac-run --trace` · T fails on an orphan AC, an unknown AC in a brief, or a PASS with no evidence; passes on the real register | script | PASS | evidence/WP2/AC-TRC-01.log |
| AC-TRC-02 | orch §7 | WP2 | G a verify report whose agent ID equals the handoff's builder ID · W `ac-run` · T the report is rejected | script | PASS | evidence/WP2/AC-TRC-02.log |
| AC-TTS-01 | D2 | WP3a | G `--voice Nope`; `--narrate` with the key unset; ffmpeg missing (simulated) · W spine runs · T each exits non-zero in under 2 s, one line naming the fix (the env var name for the key case), and no network call | script | not-started | — |
| AC-TTS-02 | D4 | WP3a | G the 9 clips in `fixtures/legacy-narration.json` · W cache key is computed · T `sha256(model\0voice\0style\0text)` equals each `file` byte for byte | script | not-started | — |
| AC-TTS-03 | D5 | WP3a | G a WAV seeded only in the legacy cache dir · W spine runs with the fake provider · T the clip is reused with 0 synthesis calls | script | not-started | — |
| AC-TTS-04 | D12 | WP3a | G F1 with the fake provider · W spine runs twice · T run 2 reports "N/N cached" with 0 calls; exported clips put into an empty cache reproduce the run | script | not-started | — |
| AC-TTS-05 | D13 | WP3a | G one fake clip slowed 2× · W spine runs · T the wpm table prints and the warning names that clip | script | not-started | — |
| AC-TTS-06 | D15 | WP3a | G 3 Gemini voices (fake transport in eval; live in AC-TTS-07) · W `sample-voice` · T 3 WAVs and 3 wpm lines | script | not-started | — |
| AC-TTS-07 | D14 | WP3a | G the user's key · W one Gemini and one MAI clip are synthesized with `--debug-requests` · T speech is audible at a plausible wpm; the log shows `"zdr":true` and the key is redacted; PCM sample rate is recorded in decisions.md | manual | not-started | — |
| AC-TTS-08 | DEC-03 | WP3a | G a PCM response · W the clip is cached · T it is a valid WAV (ffprobe reads its rate and channels) | script | not-started | — |
| AC-SPN-01 | kickoff milestone | WP3b | G F1 (target 20 s) and the fake provider · W brief → script → spine · T `manifest.totalMs` is within 20 s ±10% and validates | script | not-started | — |
| AC-SPN-02 | D3 | WP3b | G F1 with the key unset · W spine runs · T `beatgrid.json` validates, there are 0 OpenRouter calls (network spy), and runtime is within ±10% | script | not-started | — |
| AC-SPN-03 | DEC-13 | WP3b | G the F1 manifest · W the gaps between beats are inspected · T each is ≥ 400 ms, and `check-cuts` on `narration.wav` at the beat boundaries passes | script | not-started | — |
| AC-SPN-04 | design stage 1 | WP3b | G the F1 `script.md` · W a cold-reader agent reads it with no context · T no beat is flagged unclear; the user approves | manual | not-started | — |
| AC-PLT-01 | kickoff milestone | WP4 | G F1 `plates.json` · W `render-plate` runs for each plate · T each MP4's duration equals the planned `durationMs` ±1 frame | script | not-started | — |
| AC-PLT-02 | kickoff milestone | WP4 | G every rendered plate · W contact-sheet · T one sheet per plate; the Verifier confirms the brand fonts and colours, with no overflow or clipping | still | not-started | — |
| AC-PLT-03 | design §5 | WP4 | G F2 (5 slides) · W the deck is rendered · T 5 slide plates; the sheet shows deck layout and readable text | still | not-started | — |
| AC-PLT-04 | DEC-07 | WP4 | G every plate · W `hyperframes lint` and `check --strict` · T 0 errors | script | not-started | — |
| AC-VND-01 | DEC-07 | WP4 | G `vendored-map.md` · W the script checks every listed path, and checks that every vendor folder is referenced · T no missing files, no orphan folders | script | not-started | — |
| AC-VND-02 | DEC-07 | WP4 | G the vendor tree · W grep `hyperframes events` · T 0 hits; LICENSE is present | script | not-started | — |
| AC-BRD-01 | §7 | WP5 | G `brand-packs/default` · W validate · T it passes; every font has a licence file | script | not-started | — |
| AC-BRD-02 | design §1.10 | WP5 | G F1 plate 1 rendered with the default pack and with a second synthetic pack · W both contact sheets are compared · T colours and fonts differ, and nothing but `--brand` changed | still | not-started | — |
| AC-BRD-03 | §7 | WP5 | G the plugin tree · W search for audio files · T no music ships | script | not-started | — |
| AC-ASM-01 | kickoff milestone | WP6 | G the F1 manifest and plate MP4s · W assemble · T every plate cut lands in a silent gap (`check-cuts --min-silence-ms 300`) | script | not-started | — |
| AC-ASM-02 | design rule | WP6 | G the review MP4 · W music and SFX stems are remuxed · T the md5 of the video stream (`-map 0:v -f md5`) is unchanged | script | not-started | — |
| AC-ASM-03 | D7 | WP6 | G `out/final.mp4` · W probe-spec · T the spec passes and duration = spine + outro ±1 frame | script | not-started | — |
| AC-ASM-04 | §7 | WP6 | G no music supplied · W assemble · T it succeeds with narration only | script | not-started | — |
| AC-ASM-05 | kickoff | WP6 | G the brand pack outro · W assemble · T the final contact sheet's last frames show the outro | still | not-started | — |
| AC-ASM-06 | design stage 8 | WP6 | G a user-supplied track and SFX · W the music pass, then the SFX pass · T the user listens and approves the levels (narration −16 LUFS, music ducked) | manual | not-started | — |
| AC-REC-01 | D1 | WP7a | G `capture --help` · W parsed · T it lists `--storyboard --out --mp4 --viewport --no-captions --caption-css --url --debug-requests --audio-offset-ms --spine` and no narration flags; a test parses each flag | script | not-started | — |
| AC-REC-02 | D2 | WP7a | G a missing Chromium or ffmpeg, or a bad `--spine` · W capture · T exits non-zero in under 2 s with no browser launch | script | not-started | — |
| AC-REC-03 | D6 | WP7a | G `examples/deck/storyboard.mjs` (original loop) · W it runs in silent, captions and spine-timed modes · T it runs unmodified in all three | script | not-started | — |
| AC-REC-04 | DEC-06 | WP7a | G F3 with a 3-clip spine · W capture · T the plate duration equals the planned duration ±1 frame | script | not-started | — |
| AC-REC-05 | D7 | WP7b | G the recorder `--mp4` output · W probe-spec · T it passes | script | not-started | — |
| AC-REC-06 | D8 | WP7b | G a sync page that flips a full-frame colour on each `say()`, with fake tones · W capture (run alone) · T median offset ≤ 120 ms and worst ≤ 200 ms | script | not-started | — |
| AC-REC-07 | D9 | WP7b | G the narrated example deck · W `check-take` · T every scene change (threshold 0.02) is inside silence (−40 dB, ≥ 900 ms) | script | not-started | — |
| AC-REC-08 | D10 | WP7b | G the ui-demo · W stills are sampled inside each `say()` window · T the caption text shows; with `--no-captions` it doesn't; `--caption-css` changes the style | still | not-started | — |
| AC-REC-09 | D11 | WP7b | G a take · W the manifest is written · T it validates; `command[]` reproduces the take | script | not-started | — |
| AC-REC-10 | D3 | WP7b | G the key is unset · W the captions-only example runs · T it passes with 0 OpenRouter calls | script | not-started | — |
| AC-ORC-01 | kickoff milestone | WP8 | G the F1 brief and a fresh session · W `/peak-media:plate-factory` runs · T it reaches `out/final.mp4`, and the transcript shows each gate 0–9 in order | manual | not-started | — |
| AC-ORC-02 | design stage 4 | WP8 | G the same run · W the transcript is checked · T the storyboard contact sheet is produced and approved **before** any `plates/<id>/index.html` is written | script (transcript grep) | not-started | — |
| AC-ORC-03 | design stage 6 | WP8 | G the same run · W the transcript is checked · T at most 3 self-review rounds per plate, then a separate reviewer agent call | script | not-started | — |
| AC-ORC-04 | DEC-07 | WP8 | G the same run · W the transcript is checked · T `runtimes.md` is Read before the first plate is written | script | not-started | — |
| AC-PKG-01 | D19 | WP9 | G the repo · W check · T `plugin.json` version = the top CHANGELOG entry; marketplace.json lists peak-media | script | not-started | — |
| AC-PKG-02 | D19 | WP9 | G `/plugin marketplace add peakflames/claude-plugins-peakflames#feature/new-peak-media-plugin` · W install · T the 5 peak-media skills are listed, and `web2video` is not | manual | not-started | — |
| AC-PKG-03 | D17 | WP9 | G the plugin tree · W `grep -ri peakflames` over the runtime tree (`skills/ lib/ schemas/ brand-packs/ vendor/ scripts/ evals/`, so `docs/` and the plugin.json author/repository fields are excluded) · T 0 hits; no brand assets in examples | script | not-started | — |
| AC-PKG-04 | D16 | WP9 | G a clean Linux container (node:22) · W `setup.sh` then the F1 neutral eval · T it passes with no manual steps; macOS is checked once by hand | script + manual | not-started | — |
| AC-PKG-05 | D18 | WP9 | G a fresh session with only the plugin · W it is asked for (a) a 20 s explainer and (b) a captioned live-capture demo · T both pass using only SKILL.md files; a reviewer agent checks D7–D10 | manual | not-started | — |
| AC-PKG-06 | §7 | WP9 | G `evals/` · W `node --test plugins/peak-media/evals` · T at least one eval per skill, and all pass | script | not-started | — |
| AC-PKG-07 | kickoff | WP9 | G VENDORED.md · W check · T each vendor folder has source, commit, date, licence and a list of local changes; GSAP and fonts are listed as fetched or bundled | script | not-started | — |
| AC-PKG-08 | §7 | WP9 | G a headless or cloud environment (CI container) · W setup + F0 · T it passes, or prints the one-line message for what's missing | script | not-started | — |
| AC-PKG-09 | README | WP9 | G README · W read · T it covers install steps, prerequisites, the key setup, and the three modes | manual | not-started | — |
| AC-REAL-01 | kickoff §7 | WP10 | G F4 and the Peakflames pack · W the plugin makes the video · T the final contact sheet is approved and the user listens and approves | manual | not-started | — |
| AC-REAL-02 | kickoff §7 | WP10 | G the run · W it ends · T `wp/WP10/manual-steps.md` lists every hand step as a next-version backlog item | manual | not-started | — |
| AC-REAL-03 | DEC-16 | WP10 | G the Peakflames pack · W validate · T it passes; the outro reproduces `#s6`, checked on the contact sheet | script + still | not-started | — |
| AC-BASE-01 | orch §5 baseline | WP2 | G the `setup.sh` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | PASS | evidence/WP2/AC-BASE-01.log |
| AC-BASE-02 | orch §5 baseline | WP1 | G the `validate` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | PASS | evidence/WP1/AC-BASE-02.log |
| AC-BASE-03 | orch §5 baseline | WP2 | G the `contact-sheet` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | PASS | evidence/WP2/AC-BASE-03.log |
| AC-BASE-04 | orch §5 baseline | WP2 | G the `probe-spec` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | PASS | evidence/WP2/AC-BASE-04.log |
| AC-BASE-05 | orch §5 baseline | WP2 | G the `check-cuts` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | PASS | evidence/WP2/AC-BASE-05.log |
| AC-BASE-06 | orch §5 baseline | WP3b | G the `spine` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
| AC-BASE-07 | orch §5 baseline | WP3a | G the `sample-voice` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
| AC-BASE-08 | orch §5 baseline | WP4 | G the `render-plate` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
| AC-BASE-09 | orch §5 baseline | WP7a | G the `capture` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
| AC-BASE-10 | orch §5 baseline | WP7b | G the `check-take` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
| AC-BASE-11 | orch §5 baseline | WP6 | G the `assemble` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
| AC-BASE-12 | orch §5 baseline | WP6 | G the `remux-audio` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed | script | not-started | — |
