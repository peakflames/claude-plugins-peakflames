# peak-media v0.1.0 — WP0 plan

*Approved 2026-11-08 (WP0, plan mode). Decisions live in `decisions.md`, the AC register in `acceptance.md`, and each WP brief in `wp/<WP>/brief.md`. This file is the approved plan as written; later changes go in `decisions.md`, not here.*

## Context

We're building `plugins/peak-media/`, a public Claude Code plugin whose first capability is faceless motion-graphics video made from web content. The design is the "plate factory" (`plugins/peak-media/docs/plate-factory-workflow.md`): a **spine** sets the clock, each visual beat is a **plate** (`motion` | `slide` | `recorded`), and assembly composites the plates onto the spine. The unbuilt `/web2video` plan (at `0ea0ea6`, DEC-44) folds in as the `recorded` renderer, and its TTS layer moves into the spine. The work runs under `plugins/peak-media/docs/build/orchestration-plan.md`: the Lead does WP1–WP2, worktree Builders do the other WPs, a fresh Opus Verifier checks each WP, and every AC result points to evidence on file.

## 1. Decisions

See `decisions.md` (DEC-01 … DEC-20).

## 2. Folder layout

```
plugins/peak-media/
  .claude-plugin/plugin.json          # 0.1.0
  CHANGELOG.md  README.md  VENDORED.md
  package.json  package-lock.json     # pinned deps (installed by setup into data dir)
  scripts/setup.sh                    # idempotent; node>=22, ffmpeg, deps, browser
  lib/
    pins.json                         # hyperframes, playwright, gsap versions (ONLY place)
    cli.mjs                           # shared --help/--version/error handling (baseline ACs)
    schemas.mjs  preflight.mjs  ffmpeg.mjs  hf.mjs
    tts/{index,openrouter,fake,cache,wav,voices}.mjs
    verify/{contact-sheet,probe-spec,check-cuts}.mjs
  schemas/{spine-manifest,plates,brand-pack}.v1.json
  skills/
    plate-factory/   SKILL.md  references/{stages,review-rubric}.md
    video-spine/     SKILL.md  references/{narration-writing,voices}.md
                     scripts/{spine,sample-voice}.mjs
    video-plates/    SKILL.md  references/{vendored-map,plate-authoring}.md
                     scripts/render-plate.mjs  templates/{motion,slide}/
    video-record/    SKILL.md  references/storyboard-api.md
                     scripts/{record,check-take}.mjs  examples/{deck,ui-demo}/
    video-assemble/  SKILL.md  scripts/{assemble,remux-audio}.mjs
  brand-packs/default/  brand.json tokens.css fonts/ logo.svg outro/index.html music-rules.md
  vendor/hyperframes/   LICENSE CREDITS.md hyperframes/ hyperframes-cli/ slideshow/
                        motion-doctrine/ cut-the-curve/ seam-craft/
  evals/  fixtures/neutral-brief/  <skill>/*.test.mjs   # node --test plugins/peak-media/evals
  docs/
    plate-factory-workflow.md  web2video-plan.md  reference/   # design (stay)
    build/  kickoff-prompt.md orchestration-plan.md            # moved from docs/peak-media-build/
            plan.md decisions.md acceptance.md
            wp/<WP>/{brief,handoff,verify-N}.md  evidence/<WP>/ (jpg/json/log only)
            fixtures/{F0..F4}/  references/openspec-vs-peak-workflow.md
            tools/ac-run.mjs  agents/{builder,verifier,researcher}.md
  .gitignore            # renders/, out/, *.mp4 under docs/build
```

Nothing about peak-media lives outside `plugins/peak-media/` except its `marketplace.json` entry. The Peakflames brand pack lives in its own private repo (DEC-16).

Video project layout (what a user gets) follows design §4: `brief.md script.md spine/ plates.json plates/<id>/ renders/plates/ review/ audio/ out/final.mp4`, plus `brand` as a path in `plates.json`.

## 3. Contract sketches (frozen at the end of WP1)

- **spine/manifest.json**: `schemaVersion`, `kind: narration|beatgrid`, `targetMs`, `totalMs`, `model`, `voice`, `style`, `audioOffsetMs`, `command[]`, `narrate`, `audio` (path to `spine/narration.wav`), `beats[] {id, startMs, durationMs, clipNs[], onScreenText?}`, `clips[] {n, beat, text, style, startMs, durationMs, words, wpm, file}`. Narration clips are a superset of the `narration.json` shape (D11). For a beat grid: `bpm`, and `clips: []`.
- **plates.json**: `schemaVersion`, `spine`, `brand`, `fps`, `width`, `height`, `plates[] {id, beat, kind, startMs, durationMs, intent, assets[], text?, record?{url, storyboard, viewport}}`.
- **brand pack `brand.json`**: `schemaVersion`, `name`, `tokens` (css path; required custom props `--color-bg --color-fg --color-accent --font-display --font-body --font-mono --ease-*`), `fonts[] {family, files[], license}`, `logo`, `outro {composition, durationMs, audio?}`, `captionCss?`, `music {rules, credits?}`.

## 4. Acceptance register

See `acceptance.md` (generated from this section of the approved plan; IDs are stable).

**Contracts (WP1)**
- AC-CON-01 · §7 · WP1 · G the three v1 schemas · W `validate` runs on the F0, F1 and neutral fixtures · T exit 0 for each · script
- AC-CON-02 · §7 · WP1 · G 6 bad fixtures (missing schemaVersion, schemaVersion 2, negative duration, unknown kind, plate without beat, brand missing tokens) · W validate · T each exits non-zero and names the field · script
- AC-CON-03 · D11 · WP1 · G the archived `narration.json` mapped into the manifest · W validate · T it passes and every legacy clip field is kept · script

**Skeleton + shared verify tools (WP2)**
- AC-SKL-01 · kickoff §3 · WP2 · G F0 and no TTS key · W `skeleton` runs beatgrid → 1 motion plate → composite · T `out/final.mp4` exists and lasts 3.0 s ±1 frame · script
- AC-SKL-02 · D7 · WP2 · G AC-SKL-01's output · W `probe-spec` · T H.264 High, yuv420p, AAC 48 kHz, faststart, 1280×720 · script
- AC-SKL-03 · kickoff §5 · WP2 · G any MP4 · W `contact-sheet --every 0.5s` · T a JPEG grid with a timecode label on each frame; the Lead reads the F0 sheet and the kinetic text is legible · still
- AC-SKL-04 · DEC-13 · WP2 · G a synthetic MP4 with one cut in silence and one cut over a tone · W `check-cuts --min-silence-ms 300` · T the first passes, the second fails, and the timecode is reported · script
- AC-SKL-05 · determinism · WP2 · G F0 · W the plate is rendered twice · T the per-frame `framemd5` matches exactly · script
- AC-SKL-06 · determinism · WP2 · G the network is blocked during render · W the F0 plate renders · T it succeeds (fonts and GSAP are local) · script
- AC-SKL-07 · DEC-05 · WP2 · G the repo · W grep for the HF/Playwright version strings · T they appear only in `lib/pins.json` (plus lockfile/VENDORED.md) · script
- AC-TRC-01 · orch §5 · WP2 · G acceptance.md and the briefs · W `ac-run --trace` · T fails on an orphan AC, an unknown AC in a brief, or a PASS with no evidence; passes on the real register · script
- AC-TRC-02 · orch §7 · WP2 · G a verify report whose agent ID equals the handoff's builder ID · W `ac-run` · T the report is rejected · script

**Spine TTS (WP3a)**
- AC-TTS-01 · D2 · WP3a · G `--voice Nope`; `--narrate` with the key unset; ffmpeg missing (simulated) · W spine runs · T each exits non-zero in under 2 s, one line naming the fix (the env var name for the key case), and no network call · script
- AC-TTS-02 · D4 · WP3a · G the 9 clips in `fixtures/legacy-narration.json` · W cache key is computed · T `sha256(model\0voice\0style\0text)` equals each `file` byte for byte · script
- AC-TTS-03 · D5 · WP3a · G a WAV seeded only in the legacy cache dir · W spine runs with the fake provider · T the clip is reused with 0 synthesis calls · script
- AC-TTS-04 · D12 · WP3a · G F1 with the fake provider · W spine runs twice · T run 2 reports "N/N cached" with 0 calls; exported clips put into an empty cache reproduce the run · script
- AC-TTS-05 · D13 · WP3a · G one fake clip slowed 2× · W spine runs · T the wpm table prints and the warning names that clip · script
- AC-TTS-06 · D15 · WP3a · G 3 Gemini voices (fake transport in eval; live in AC-TTS-07) · W `sample-voice` · T 3 WAVs and 3 wpm lines · script
- AC-TTS-07 · D14 · WP3a · G the user's key · W one Gemini and one MAI clip are synthesized with `--debug-requests` · T speech is audible at a plausible wpm; the log shows `"zdr":true` and the key is redacted; PCM sample rate is recorded in decisions.md · manual
- AC-TTS-08 · DEC-03 · WP3a · G a PCM response · W the clip is cached · T it is a valid WAV (ffprobe reads its rate and channels) · script

**Spine script + manifest (WP3b)**
- AC-SPN-01 · kickoff milestone · WP3b · G F1 (target 20 s) and the fake provider · W brief → script → spine · T `manifest.totalMs` is within 20 s ±10% and validates · script
- AC-SPN-02 · D3 · WP3b · G F1 with the key unset · W spine runs · T `beatgrid.json` validates, there are 0 OpenRouter calls (network spy), and runtime is within ±10% · script
- AC-SPN-03 · DEC-13 · WP3b · G the F1 manifest · W the gaps between beats are inspected · T each is ≥ 400 ms, and `check-cuts` on `narration.wav` at the beat boundaries passes · script
- AC-SPN-04 · design stage 1 · WP3b · G the F1 `script.md` · W a cold-reader agent reads it with no context · T no beat is flagged unclear; the user approves · manual

**Plates (WP4)**
- AC-PLT-01 · kickoff milestone · WP4 · G F1 `plates.json` · W `render-plate` runs for each plate · T each MP4's duration equals the planned `durationMs` ±1 frame · script
- AC-PLT-02 · kickoff milestone · WP4 · G every rendered plate · W contact-sheet · T one sheet per plate; the Verifier confirms the brand fonts and colours, with no overflow or clipping · still
- AC-PLT-03 · design §5 · WP4 · G F2 (5 slides) · W the deck is rendered · T 5 slide plates; the sheet shows deck layout and readable text · still
- AC-PLT-04 · DEC-07 · WP4 · G every plate · W `hyperframes lint` and `check --strict` · T 0 errors · script
- AC-VND-01 · DEC-07 · WP4 · G `vendored-map.md` · W the script checks every listed path, and checks that every vendor folder is referenced · T no missing files, no orphan folders · script
- AC-VND-02 · DEC-07 · WP4 · G the vendor tree · W grep `hyperframes events` · T 0 hits; LICENSE is present · script

**Brand pack (WP5)**
- AC-BRD-01 · §7 · WP5 · G `brand-packs/default` · W validate · T it passes; every font has a licence file · script
- AC-BRD-02 · design §1.10 · WP5 · G F1 plate 1 rendered with the default pack and with a second synthetic pack · W both contact sheets are compared · T colours and fonts differ, and nothing but `--brand` changed · still
- AC-BRD-03 · §7 · WP5 · G the plugin tree · W search for audio files · T no music ships · script

**Assembly (WP6)**
- AC-ASM-01 · kickoff milestone · WP6 · G the F1 manifest and plate MP4s · W assemble · T every plate cut lands in a silent gap (`check-cuts --min-silence-ms 300`) · script
- AC-ASM-02 · design rule · WP6 · G the review MP4 · W music and SFX stems are remuxed · T the md5 of the video stream (`-map 0:v -f md5`) is unchanged · script
- AC-ASM-03 · D7 · WP6 · G `out/final.mp4` · W probe-spec · T the spec passes and duration = spine + outro ±1 frame · script
- AC-ASM-04 · §7 · WP6 · G no music supplied · W assemble · T it succeeds with narration only · script
- AC-ASM-05 · kickoff · WP6 · G the brand pack outro · W assemble · T the final contact sheet's last frames show the outro · still
- AC-ASM-06 · design stage 8 · WP6 · G a user-supplied track and SFX · W the music pass, then the SFX pass · T the user listens and approves the levels (narration −16 LUFS, music ducked) · manual

**Recorder (WP7a/b)**
- AC-REC-01 · D1 · WP7a · G `record --help` · W parsed · T it lists `--storyboard --out --mp4 --viewport --no-captions --caption-css --url --debug-requests --audio-offset-ms --spine` and no narration flags; a test parses each flag · script
- AC-REC-02 · D2 · WP7a · G a missing Chromium or ffmpeg, or a bad `--spine` · W record · T exits non-zero in under 2 s with no browser launch · script
- AC-REC-03 · D6 · WP7a · G `examples/deck/storyboard.mjs` (original loop) · W it runs in silent, captions and spine-timed modes · T it runs unmodified in all three · script
- AC-REC-04 · DEC-06 · WP7a · G F3 with a 3-clip spine · W record · T the plate duration equals the planned duration ±1 frame · script
- AC-REC-05 · D7 · WP7b · G the recorder `--mp4` output · W probe-spec · T it passes · script
- AC-REC-06 · D8 · WP7b · G a sync page that flips a full-frame colour on each `say()`, with fake tones · W record (run alone) · T median offset ≤ 120 ms and worst ≤ 200 ms · script
- AC-REC-07 · D9 · WP7b · G the narrated example deck · W `check-take` · T every scene change (threshold 0.02) is inside silence (−40 dB, ≥ 900 ms) · script
- AC-REC-08 · D10 · WP7b · G the ui-demo · W stills are sampled inside each `say()` window · T the caption text shows; with `--no-captions` it doesn't; `--caption-css` changes the style · still
- AC-REC-09 · D11 · WP7b · G a take · W the manifest is written · T it validates; `command[]` reproduces the take · script
- AC-REC-10 · D3 · WP7b · G the key is unset · W the captions-only example runs · T it passes with 0 OpenRouter calls · script

**Orchestrator (WP8)**
- AC-ORC-01 · kickoff milestone · WP8 · G the F1 brief and a fresh session · W `/peak-media:plate-factory` runs · T it reaches `out/final.mp4`, and the transcript shows each gate 0–9 in order · manual
- AC-ORC-02 · design stage 4 · WP8 · G the same run · W the transcript is checked · T the storyboard contact sheet is produced and approved **before** any `plates/<id>/index.html` is written · script (transcript grep)
- AC-ORC-03 · design stage 6 · WP8 · G the same run · W the transcript is checked · T at most 3 self-review rounds per plate, then a separate reviewer agent call · script
- AC-ORC-04 · DEC-07 · WP8 · G the same run · W the transcript is checked · T `runtimes.md` is Read before the first plate is written · script

**Packaging (WP9)**
- AC-PKG-01 · D19 · WP9 · G the repo · W check · T `plugin.json` version = the top CHANGELOG entry; marketplace.json lists peak-media · script
- AC-PKG-02 · D19 · WP9 · G `/plugin marketplace add peakflames/claude-plugins-peakflames#feature/new-peak-media-plugin` · W install · T the 5 peak-media skills are listed, and `web2video` is not · manual
- AC-PKG-03 · D17 · WP9 · G the plugin tree · W `grep -ri peakflames` over the runtime tree (`skills/ lib/ schemas/ brand-packs/ vendor/ scripts/ evals/`, so `docs/` and the plugin.json author/repository fields are excluded) · T 0 hits; no brand assets in examples · script
- AC-PKG-04 · D16 · WP9 · G a clean Linux container (node:22) · W `setup.sh` then the F1 neutral eval · T it passes with no manual steps; macOS is checked once by hand · script + manual
- AC-PKG-05 · D18 · WP9 · G a fresh session with only the plugin · W it is asked for (a) a 20 s explainer and (b) a captioned recorded demo · T both pass using only SKILL.md files; a reviewer agent checks D7–D10 · manual
- AC-PKG-06 · §7 · WP9 · G `evals/` · W `node --test plugins/peak-media/evals` · T at least one eval per skill, and all pass · script
- AC-PKG-07 · kickoff · WP9 · G VENDORED.md · W check · T each vendor folder has source, commit, date, licence and a list of local changes; GSAP and fonts are listed as fetched or bundled · script
- AC-PKG-08 · §7 · WP9 · G a headless or cloud environment (CI container) · W setup + F0 · T it passes, or prints the one-line message for what's missing · script
- AC-PKG-09 · README · WP9 · G README · W read · T it covers install steps, prerequisites, the key setup, and the three modes · manual

**Real video (WP10)**
- AC-REAL-01 · kickoff §7 · WP10 · G F4 and the Peakflames pack · W the plugin makes the video · T the final contact sheet is approved and the user listens and approves · manual
- AC-REAL-02 · kickoff §7 · WP10 · G the run · W it ends · T `wp/WP10/manual-steps.md` lists every hand step as a next-version backlog item · manual
- AC-REAL-03 · DEC-16 · WP10 · G the Peakflames pack · W validate · T it passes; the outro reproduces `#s6`, checked on the contact sheet · script + still

**Baseline (applies to every shipped entry point)**
AC-BASE-01..12: one per entry point (`setup.sh`, `validate`, `contact-sheet`, `probe-spec`, `check-cuts`, `spine`, `sample-voice`, `render-plate`, `record`, `check-take`, `assemble`, `remux-audio`). Each checks five things: `--help` lists every flag · bad input gives a non-zero exit and a one-line actionable error · no stack trace on expected failures · `--version` = `plugin.json` · no network unless needed. Method: script. Each is owned by the WP that builds that entry point.

## 5. WP briefs

Written to `wp/<WP>/brief.md`. Every brief also says: read plan.md, decisions.md and acceptance.md; you own only the listed folders; contracts are v1 and any change is a request to the Lead; finish with `ac-run --wp <WP>`, `handoff.md` with your agent ID, and evidence in `evidence/<WP>/`; no plan mode; don't push.

## 6. Execution after approval

1. `git mv docs/peak-media-build/* docs/references/openspec-vs-peak-workflow.md` into `plugins/peak-media/docs/build/` (fixing the paths in kickoff-prompt.md and orchestration-plan.md), then write plan.md, decisions.md, acceptance.md and the `wp/*/brief.md` files. Commit `docs(peak-media): WP0 plan, decisions, acceptance register`.
2. WP1 → user contract freeze → WP2. Each is checked by a fresh Opus verifier and gets a milestone commit with the `ac-run --wp` table in the body.
3. Wave 2: WP3a, WP3b and WP5 run in parallel, with at most 2 render-heavy WPs at once (WP4, WP6). Builders use `Agent(isolation:"worktree")` on `feature/peak-media-<wp>` and merge `--no-ff` into `feature/new-peak-media-plugin` after verification.
4. Wave 3: WP7a → WP7b run alone, and WP8 runs after them. Wave 4: WP9. Wave 5: WP10, interactive.
5. Never merge to `develop`. Ask before any push or `gh repo create`.

## 7. Verification

- After each WP: `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp <WP>` (the table goes in the commit body) and `ac-run --trace`.
- Whole plugin: `node --test plugins/peak-media/evals`. F1 end to end through `/peak-media:plate-factory` produces `out/final.mp4` and a contact sheet the Lead reads.
- Gates that need the user: the contract freeze (WP1), F1 script cold read (WP3b), the TTS key run (TTS-07), storyboard approval (WP8/WP10), listening (WP6/WP10), and the Peakflames pack repo creation (WP10).
