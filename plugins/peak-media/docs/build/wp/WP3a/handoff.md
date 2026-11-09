builder-id: builder-wp3a-23f6dc0a

# WP3a handoff — Spine TTS

Agent: Builder subagent (claude-opus-5-5), worktree `agent-a9ea22f327c64a0d5`, branch `feature/peak-media-wp3a` from `feature/new-peak-media-plugin` @ c5eb616, 2026-11-08.

## Shared API (for WP3b), `lib/tts/index.mjs`

Implemented as specified; names and shapes unchanged. Fields added:

- `checkTtsOptions(...)` also returns `family` (`gemini|mai|fake`) and `warnings[]` (the DEC-04 "Allow Safety Retention" note for narrated Gemini, and a note for MAI ids outside the built-in list). `voice` omitted means the model's default (`Achird`, or `en-GB-Emily` for MAI). Exit codes: unknown model or voice gives 2, missing key gives 3.
- `synthesizeClips(...)` accepts `legacyDirs` and `env` too. `voice` omitted means the model default. Each result also has `source` (`cache|legacy|synth`), `sampleRate` and `channels`. A clip's own `style` beats the `style` argument. The key is required only when a clip actually has to be synthesized, so a fully cached run works with no key. `onCall` fires once per synthesis, for fake/tone too.
- `wpmReport(results, { label })` also returns `medianWpm`. Its table ends with `median N wpm · N/M cached`. A clip below `SLOW_RATIO` (0.7) × the median wpm gets a warning naming it (`slow clip 2: …`).
- Also exported: `cacheSummary(results)` gives `"N/M cached"` (the AC-TTS-04 report string the spine should print), plus `KEY_ENV`, `countWords` (mood tags excluded, matching the legacy `words`), `defaultCacheDir`, `legacyCacheDirs`, `wavInfo`, `MODELS`, `GEMINI_VOICES`, `MAI_VOICES` and `DEFAULT_VOICES`.
- The `debugRequests` option is either `true` (writes `[debug-requests] {json}` lines to stderr) or a `function(line)`.

## Done

- `lib/tts/voices.mjs`: models and voices, case-insensitive Gemini names, MAI short ids with per-model suffixes (`:MAI-Voice-2.1-Flash`, `:MAI-Voice-2.1`), `fake/tone`.
- `lib/tts/openrouter.mjs`: `POST https://openrouter.ai/api/v1/audio/speech` with body `{model, input, voice, response_format:"pcm", provider:{zdr:true}, instructions?}`. `instructions` (the style) goes to Gemini only. Every error is one line and the key is redacted. It explains 401, 402, and Gemini 404 (no ZDR endpoint).
- `lib/tts/wav.mjs`: PCM to WAV header (DEC-03) and WAV header parsing.
- `lib/tts/fake.mjs`: 440 Hz tone, 48 kHz mono s16le, 165 wpm of the words, full level from sample 0.
- `lib/tts/cache.mjs`: DEC-12 key, `~/.cache/peak-media/tts/`, plus the read-only legacy `~/.cache/web2video/tts/` and `~/.cache/record-website-interaction/tts/`. A legacy hit is copied into the plugin cache. Writes are atomic.
- `skills/video-spine/scripts/sample-voice.mjs` (on `runCli`): `--voices --text --text-file --tts-model --style --out-dir --debug-requests --json`. Writes `<out-dir>/<voice>.wav` and prints one wpm line per voice with the ffprobe'd sample rate. It requires ffmpeg because it ffprobes its output, which is how AC-TTS-07 records the real PCM rate.
- `skills/video-spine/references/voices.md`: models, voices, ZDR, cache, test knobs.
- Evals: `evals/video-spine/tts.test.mjs` (8 tests) and `evals/video-spine/helpers/fake-openrouter.mjs`. The helper is a fake transport, usable in-process as `fetchImpl` or as a `--import` preload that logs requests to `$PEAK_MEDIA_FAKE_OR_LOG`.
- Evidence (`evidence/WP3a/`): one `<AC>.log` per script AC, `builder-node-test.log` (full suite, 29/29 pass), `ac-run-WP3a.log`, `ac-run-trace.log`.

**OpenRouter source** (checked 2026-11-08): https://openrouter.ai/docs/api/api-reference/tts/create-speech (body fields, `provider.zdr`, `response_format` mp3|pcm with pcm the default, PCM is 16-bit LE, errors are JSON `{error:{code,message}}`) and https://openrouter.ai/docs/features/multimodal/tts (MAI voice = full Azure id with model suffix; MAI PCM is 24 kHz mono; Gemini returns PCM only; `X-Generation-Id` header). The Gemini PCM rate isn't documented. I assume 24 kHz (Gemini's native rate), and `PEAK_MEDIA_TTS_PCM_RATE` overrides it. AC-TTS-07 confirms it.

## Fake slow-clip mechanism (AC-TTS-05)

`PEAK_MEDIA_FAKE_SLOW=<n>[,<n>…]` makes those `fake/tone` clip numbers `PEAK_MEDIA_FAKE_SLOW_FACTOR` (default 2) times longer. It works in-process through the `env` option and in a subprocess through the environment. A slowed clip is cached like any other, so use an isolated `PEAK_MEDIA_TTS_CACHE`. This is documented in `references/voices.md`.

Test isolation: `PEAK_MEDIA_TTS_CACHE` sets the cache dir, and `PEAK_MEDIA_TTS_LEGACY_DIRS` (path.delimiter list, `''` = none) sets the legacy dirs. Every eval uses temp dirs, and none touches `~/.cache`.

## ac-run --wp WP3a

```
| AC | method | run | register | evidence |
|---|---|---|---|---|
| AC-TTS-01 | script | pass | not-started | — |
| AC-TTS-02 | script | pass | not-started | — |
| AC-TTS-03 | script | pass | not-started | — |
| AC-TTS-04 | script | pass | not-started | — |
| AC-TTS-05 | script | pass | not-started | — |
| AC-TTS-06 | script | pass | not-started | — |
| AC-TTS-07 | manual | — | not-started | — |
| AC-TTS-08 | script | pass | not-started | — |
| AC-BASE-07 | script | pass | not-started | — |
```
`ac-run --trace`: `PASS  trace: 77 ACs, 12 briefs, 0 problem(s)`.

## Open

### AC-TTS-07: blocked, needs the user's key

The Lead runs this with the user, from any scratch dir. It uses the real `~/.cache/peak-media/tts/`, which is fine for a live run.

```bash
export TTS_OPENROUTER_API_KEY=sk-or-...        # the user's key
P=<repo>/plugins/peak-media/skills/video-spine/scripts/sample-voice.mjs
mkdir -p /tmp/tts07 && cd /tmp/tts07
node "$P" --voices Achird --style "Clear, friendly, unhurried explainer tone." \
  --text "This is a short test of the narration voice. If you can hear it clearly, the voice pipeline works." \
  --out-dir gemini --debug-requests 2> gemini-debug.log
node "$P" --tts-model microsoft/mai-voice-2.1-flash --voices en-GB-Emily \
  --text "This is a short test of the narration voice. If you can hear it clearly, the voice pipeline works." \
  --out-dir mai --debug-requests 2> mai-debug.log
grep -c '"zdr":true' gemini-debug.log mai-debug.log         # each >= 1
grep -c 'Bearer \*\*\*REDACTED\*\*\*' gemini-debug.log mai-debug.log
grep -c "$TTS_OPENROUTER_API_KEY" gemini-debug.log mai-debug.log   # each 0
afplay gemini/Achird.wav; afplay mai/en-GB-Emily.wav       # listen
ffprobe -v error -show_entries stream=sample_rate,channels -of csv=p=0 gemini/Achird.wav mai/en-GB-Emily.wav
```
Pass when both clips are clear speech at normal pitch, about 140–200 wpm (the stdout line), with `zdr` present and the key redacted. If a clip sounds like a chipmunk or slowed down, the assumed 24 kHz is wrong. Re-run with `PEAK_MEDIA_TTS_PCM_RATE=<rate>` after deleting that clip from the cache, and update `MODELS[...].sampleRate` in `lib/tts/voices.mjs`. Then record the rates under "Run-time findings" in `decisions.md` (the Lead's file). If Gemini fails with a no-endpoint/404 error, the account lacks "Allow Safety Retention" (DEC-04).

### Notes and deviations

- **AC-TTS-01 says "spine runs"**, but `spine.mjs` is WP3b's. The eval checks the same three failures through `checkTtsOptions` (the API the spine calls) and through the `sample-voice` entry point (`--voices Nope` gives exit 2; key unset gives exit 3 naming `TTS_OPENROUTER_API_KEY`; `PEAK_MEDIA_FFMPEG=/nonexistent` gives exit 3). Each run takes under 100 ms, prints one line and makes no network attempt. AC-TTS-03/04/05 likewise exercise `synthesizeClips` and `wpmReport` with the fake provider. AC-TTS-03 also runs end to end through `sample-voice`. WP3b's spine should re-assert these at the CLI level.
- **Mood tags vs Gemini 3.8.** OpenRouter's TTS guide says Gemini 3.8 models "read `input` verbatim, so delivery directions written into the text may be spoken aloud". The legacy script relies on `<Warm>`-style tags (narration-writing.md, owned by WP3b), and the slow-clip warning is the safety net. Worth checking during AC-TTS-07 by adding a tag to the Gemini line.
- The MAI voice list is the 12 English voices. Other ids of the form `xx-YY-Name` are accepted with a note, not rejected.
- No npm dependencies added. No files outside the owned folders touched, apart from the evals and evidence.

## Suggested CHANGELOG bullet (Lead to add)

- **Spine TTS layer** (`lib/tts`, `sample-voice`): OpenRouter speech with ZDR on every request, cache-compatible with the old recorder (plus legacy cache dirs), offline `fake/tone` provider, and a wpm table that warns on slow clips.
