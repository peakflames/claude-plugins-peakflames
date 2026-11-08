# WP3a — Spine TTS

**Runs as:** Builder · **Branch:** `feature/peak-media-wp3a` (worktree) · **Contracts:** v1

## Ground rules

- Read `plan.md`, `decisions.md` and `acceptance.md` (all in `plugins/peak-media/docs/build/`) before starting.
- You own only the folders listed below (paths relative to `plugins/peak-media/` unless absolute). Touch nothing else.
- Contracts are **v1** (`schemas/*.v1.json`). Any change is a request to the Lead: stop, write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md`, and report.
- Finish with `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp WP3a`, a `wp/WP3a/handoff.md` that records your agent/session ID, and evidence in `evidence/WP3a/` (JPEG, JSON, logs only — no MP4s).
- No plan mode. Don't push. Don't merge.

## Scope

Port the web2video TTS layer (see `docs/web2video-plan.md` §1–2 and `docs/reference/`): OpenRouter `POST /api/v1/audio/speech`, raw PCM → WAV header (DEC-03), MAI voice suffix per model, `provider:{zdr:true}` on every request (DEC-04), `fake/tone` provider, cache + legacy cache dirs (DEC-12), wpm table and slow-clip warning. **Export the `lib/tts/index.mjs` API first** (stub ok) and note it in handoff so WP3b isn't blocked. AC-TTS-07 needs the user's `TTS_OPENROUTER_API_KEY`: prepare the command and mark it `blocked: needs user key` — the Lead runs it with the user. `evals/fixtures/legacy-narration.json` (copied in WP1) is the AC-TTS-02 fixture.

## Owns

- `lib/tts/*`
- `skills/video-spine/scripts/sample-voice.mjs`
- `skills/video-spine/references/voices.md`

## Acceptance criteria

- **AC-TTS-01** (script) — G `--voice Nope`; `--narrate` with the key unset; ffmpeg missing (simulated) · W spine runs · T each exits non-zero in under 2 s, one line naming the fix (the env var name for the key case), and no network call
- **AC-TTS-02** (script) — G the 9 clips in `fixtures/legacy-narration.json` · W cache key is computed · T `sha256(model\0voice\0style\0text)` equals each `file` byte for byte
- **AC-TTS-03** (script) — G a WAV seeded only in the legacy cache dir · W spine runs with the fake provider · T the clip is reused with 0 synthesis calls
- **AC-TTS-04** (script) — G F1 with the fake provider · W spine runs twice · T run 2 reports "N/N cached" with 0 calls; exported clips put into an empty cache reproduce the run
- **AC-TTS-05** (script) — G one fake clip slowed 2× · W spine runs · T the wpm table prints and the warning names that clip
- **AC-TTS-06** (script) — G 3 Gemini voices (fake transport in eval; live in AC-TTS-07) · W `sample-voice` · T 3 WAVs and 3 wpm lines
- **AC-TTS-07** (manual) — G the user's key · W one Gemini and one MAI clip are synthesized with `--debug-requests` · T speech is audible at a plausible wpm; the log shows `"zdr":true` and the key is redacted; PCM sample rate is recorded in decisions.md
- **AC-TTS-08** (script) — G a PCM response · W the clip is cached · T it is a valid WAV (ffprobe reads its rate and channels)
- **AC-BASE-07** (script) — G the `sample-voice` entry point · W run with `--help`, `--version`, and bad input · T `--help` lists every flag; bad input → non-zero exit + one-line actionable error; no stack trace on expected failures; `--version` = plugin.json; no network unless needed
