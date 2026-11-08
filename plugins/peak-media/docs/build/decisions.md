# peak-media decisions log

IDs are stable. A decision is changed by adding a new entry that supersedes it, never by editing the old one. Contract changes use the ADDED / MODIFIED / REMOVED form in the **Contract changes** section (orchestration §7).

| # | Decision | Reason |
|---|---|---|
| DEC-01 | Skills: `plate-factory`, `video-spine`, `video-plates` (motion+slide), `video-record`, `video-assemble` | The `video-` prefix groups these cleanly when `image-*` skills arrive (user Q1) |
| DEC-02 | All code is Node ESM (≥22), with shared code in `plugins/peak-media/lib/` that the skill scripts import through `${CLAUDE_PLUGIN_ROOT}` | HyperFrames needs Node 22; one language and one test runner (`node:test`) |
| DEC-03 | Default TTS is `google/gemini-3.8-flash-lite-tts`, voice `Achird`. MAI is supported. A `fake/tone` provider is used for tests | User Q3. Research: `POST /api/v1/audio/speech` returns raw PCM, so we add a WAV header ourselves; `instructions` carries the style (Gemini only) |
| DEC-04 | ZDR: every request sends `provider: { zdr: true }`. Pre-flight warns that Gemini needs the account to "Allow Safety Retention", and suggests `--tts-model microsoft/mai-voice-2.1-flash` | Gemini's only ZDR endpoint is Vertex, which has safety retention; MAI has none (OpenRouter ZDR docs) |
| DEC-05 | HyperFrames is pinned to `hyperframes@0.9.25`, set only in `lib/pins.json`, and run with `HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_AUTO_INSTALL=1`. If WP2 fails on 0.9.25, fall back to 0.9.23 and log the change | User Q4. 0.9.25 seeds randomness so re-renders repeat. 0.9.24 was never published |
| DEC-06 | Playwright is pinned to `1.65.0` in `lib/pins.json`. The recorder uses `page.screencast.start({path,fps,onFrame})` and anchors t0 on the timestamp of the first `onFrame`. Captions are drawn with `showOverlay(html,{duration})`, with injected caption DOM as the fallback | `page.screencast` is stable since 1.59 and `fps` since 1.64. Logging against a wall-clock t0 drifts |
| DEC-07 | Vendored HF skills go in `vendor/hyperframes/` as **references, not registered skills**: `hyperframes` (presets dropped), `hyperframes-cli` (lambda/cloudrun/cloud refs dropped), `slideshow` (`present` part dropped), `motion-doctrine`, `cut-the-curve`, `seam-craft`. Source: `heygen-com/hyperframes@327e20208c3f` (2026-11-08). Apache-2.0 LICENSE and CREDITS.md are kept, `npx hyperframes events` telemetry lines are removed, and every change is listed in `VENDORED.md` | User Q5/Q6. Our skills load the vendored files through explicit Read steps listed in `video-plates/references/vendored-map.md`. `hyperframes lint`/`check --strict` enforce the same rules mechanically |
| DEC-08 | Not vendored: `media-use` (HeyGen TTS and Pixabay SFX licence), figma, remotion-to-hyperframes, reverse-any-video, style-sampling, changelog-video (commercial fonts) | No value for us, or licence risk |
| DEC-09 | GSAP is **not shipped**. `setup` installs a pinned `gsap` from npm into the data dir, and the scaffold copies it into each video project | GSAP's Standard License is not OSI. Fetching it keeps the plugin's redistribution clean |
| DEC-10 | Runtime deps (pinned `hyperframes`, `playwright`, `gsap`, `ajv`) are installed by `scripts/setup.sh` into `${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}/deps/<lockhash>/`. Chromium comes from `hyperframes browser ensure` | The plugin cache is replaced on every plugin update, so deps live in the persistent data dir |
| DEC-11 | ffmpeg/ffprobe are a user prerequisite that pre-flight checks. On this Mac: `brew install ffmpeg` at the start of WP2 | User Q2 |
| DEC-12 | TTS cache is `~/.cache/peak-media/tts/<sha256(model\0voice\0style\0text)>.wav`. It also reads `~/.cache/web2video/tts/` and `~/.cache/record-website-interaction/tts/` | Keeps the old D4/D5 behaviour, with one cache for the whole plugin |
| DEC-13 | Cuts in silence: `check-cuts` takes `--min-silence-ms`. The spine puts a gap of at least 400 ms between beats; assembly checks with 300 ms, the recorder with 900 ms (the original D9) | A 0.9 s gap is too long between plates in a 20 s explainer |
| DEC-14 | Contracts: `schemas/spine-manifest.v1.json`, `plates.v1.json`, `brand-pack.v1.json`, all JSON Schema 2020-12, each with `schemaVersion: 1`. Changing a contract is a request to the Lead (ADDED/MODIFIED/REMOVED entry in decisions.md) | Orchestration §1 |
| DEC-15 | The neutral default brand pack ships OFL fonts (Inter, JetBrains Mono) as woff2 files with OFL.txt, a placeholder logo, and a plain 3 s outro composition. No music | §7 publishing rules; D17 |
| DEC-16 | The first real brand pack is the **Peakflames pack**, assembled in WP10 at `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/` from `landing-page-minimal/design-system/` (tokens, logo; Google-imported fonts vendored locally from `@fontsource`) and `peakflames-videos` (signature outro `#s6` + `fire()` SFX, references). Making that folder a private GitHub repo is a WP10 step, and the Lead asks before running `gh repo create --private` | User Q7/Q8. Keeps private brand assets out of the public repo |
| DEC-17 | The real video is F4 (OpenSpec vs. peak-workflow, about 75–90 s), per orchestration §6 | Kickoff test-video topic |
| DEC-18 | **Everything peak-media lives under `plugins/peak-media/`** (user direction). Build state goes in `plugins/peak-media/docs/build/`: plan, decisions, register, WP briefs/handoffs/verify reports, evidence, F0–F4 fixtures, `tools/ac-run.mjs`, and Builder/Verifier/Researcher role prompts in `agents/` (not registered as plugin agents). The former `docs/peak-media-build/*` and `docs/references/openspec-vs-peak-workflow.md` were `git mv`'d there in WP0. Design docs stay in `plugins/peak-media/docs/`. `script` ACs that double as evals go in `plugins/peak-media/evals/` | All plugin material in one root. Trade-off: `docs/` ships with installs, so evidence is limited to JPEG contact sheets and JSON/logs; MP4s and renders are gitignored |
| DEC-19 | Version `0.1.0`. `plugin.json` and `CHANGELOG.md` (`## [0.1.0] — UNDER DEVELOPMENT`) are created together in WP1. The marketplace entry is added in WP9. No marketplace version bump until release | Repo CLAUDE.md versioning protocol |
| DEC-20 | Prior art to read, not copy: `peakflames-videos/tools/contact_sheet.sh`, `build_soundtrack.py`, `.claude/skills/peakflames-video/SKILL.md` (self-review loop) | Proven locally, but brand-specific. Generalize it; D17 still applies |

## Contract changes

*None yet. Format:*

```
### CC-NN — <contract> v<N> — <date> — requested by <WP>
ADDED:    <field> — <reason>
MODIFIED: <field> — <old> → <new> — <reason>
REMOVED:  <field> — <reason>
Decision: accepted | rejected — schemaVersion bump? yes/no
```

## Run-time findings

*Facts learned during the build that later WPs depend on (e.g. the PCM sample rate from AC-TTS-07).*
