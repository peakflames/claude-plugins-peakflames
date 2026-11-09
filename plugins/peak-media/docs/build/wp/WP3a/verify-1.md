verifier-id: verifier-wp3a-r1-7f5d5559

# WP3a verify-1 — Spine TTS

Builder: `builder-wp3a-23f6dc0a` (differs). Worktree head `b13ed42`, base `c5eb616`. Both
`PEAK_MEDIA_OPENROUTER_API_KEY` and `TTS_OPENROUTER_API_KEY` were unset (`env -u`) for every run. The verifier made no
live OpenRouter call and read no key.

Suite: `node --test plugins/peak-media/evals` gives 29/29 pass (`evidence/WP3a/verifier-node-test.log`).
`ac-run --wp WP3a` gives all 8 script ACs pass, and `ac-run --trace` gives PASS with 77 ACs and 0 problems
(`evidence/WP3a/verifier-ac-run.log`). I also ran the TTS tests with `HOME` set to an empty temp dir: 8/8 pass,
nothing was written under that HOME, and nothing under the real `~/.cache/{peak-media,web2video,record-website-interaction}`
changed during the full suite. Each per-AC log below has my own reproduction first, then the node:test output.
(The builder's versions of these logs are still in git at `b13ed42`.)

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-TTS-01 | PASS | evidence/WP3a/AC-TTS-01.log | Run through sample-voice with the no-network preload. Bad voice (Gemini and MAI): exit 2, ~55 ms. Key unset (Gemini and MAI): exit 3, the line names `PEAK_MEDIA_OPENROUTER_API_KEY`. ffmpeg or ffprobe missing: exit 3, gives the install hint. 0 network attempts and 0 cache writes. On exit-2 cases the shared CLI adds a second `Run '… --help'` line, which the test filters out (nit N1). The test asserts the AC's time limit, single line, fix and no-network clauses. |
| AC-TTS-02 | PASS | evidence/WP3a/AC-TTS-02.log | I recomputed the keys with my own Python `hashlib` (`model\0voice\0style\0text`): 9/9 byte-equal to `file`. lib `cacheKey` also gives 9/9. The fixture is unchanged since WP1. |
| AC-TTS-03 | PASS | evidence/WP3a/AC-TTS-03.log | I seeded a WAV written by Python's wave module (22050 Hz, 777 ms of silence, which fake/tone can't produce) only in a legacy dir. Through sample-voice it was reused: `1/1 cached`, 22050 Hz. Through the lib: `calls=0 source=legacy`. The control with no legacy dir made 1 call at 48 kHz. The legacy file stayed byte-identical; the hit is copied into the plugin cache. |
| AC-TTS-04 | PASS | evidence/WP3a/AC-TTS-04.log | F1 manifest, fake/tone, lib: run 1 made 3 calls; run 2 made 0 calls, `3/3 cached`. Exported clips copied into an empty cache: 0 calls, and the file, duration and sha256 match run 1. Clip files equal the F1 manifest. sample-voice run twice: `0/3` then `3/3 cached`. |
| AC-TTS-05 | PASS | evidence/WP3a/AC-TTS-05.log | I slowed each F1 clip 2× in turn (1, 2, 3). Each time the table printed and exactly one warning named that clip (`slow clip N: …`). Unslowed: no warning. `wpmReport` returns the warnings but doesn't print them; the spine must print them (WP3b). |
| AC-TTS-06 | PASS | evidence/WP3a/AC-TTS-06.log | I used my own voice set (Achird, Zephyr, Charon) through the eval fake transport and the no-network preload. Result: 3 WAVs (pcm_s16le, 24 kHz, mono, per ffprobe) and 3 wpm lines. Every request body has `provider {"zdr":true}`, `response_format: pcm` and the correct endpoint. The dummy key never appears; `Bearer ***REDACTED***` appears 3×. |
| AC-TTS-07 | PASS (mechanical) · audible speech: user-confirmed | evidence/WP3a/AC-TTS-07.log, AC-TTS-07-{gemini,mai}-debug.log | Each log has `"zdr":true` once and `sk-or` 0 times. Authorization is only `Bearer ***REDACTED***`; the only long tokens are generation ids. Both WAVs are pcm_s16le 24000 Hz mono. Loudness: −19.3 / −16.8 LUFS. There are syllabic/phrase gaps. 20 ms frame RMS CV is 0.62 / 0.70 and ZCR CV is 1.29 / 1.14, which looks like speech; the fake tone control gives 0.01 / 0.03. wpm: 19 words in 6.44 s / 7.10 s = 177 / 161, inside 120–200. MAI voice sent as `en-GB-Emily:MAI-Voice-2.1-Flash`. The 24 kHz rate is recorded in the main-checkout decisions.md Run-time findings. I can't confirm intelligibility by ear; that relies on the user's listen. |
| AC-TTS-08 | PASS | evidence/WP3a/AC-TTS-08.log | My own fetch stub returned raw s16le PCM with an odd byte count (72001 bytes) for Gemini and MAI. The cached files are 72044 bytes (header + trimmed data). ffprobe reads wav / pcm_s16le / 24000 Hz / 1 ch / 1.500 s, and ffmpeg decodes them cleanly. |
| AC-BASE-07 | PASS | evidence/WP3a/AC-BASE-07.log | `--help` lists all 8 spec flags plus `--help` and `--version`. `--version` prints 0.1.0, which equals plugin.json. I ran 9 bad inputs (unknown flag, bad voice, empty voices, bad model, missing text file, positional, text plus text-file, no key, blank text). Each exits non-zero with 1 actionable line (plus the usage hint), and gives no stack and no network. |

## Is "spine runs" → lib + sample-voice a fair equivalent?

Yes, for WP3a. Every AC behaviour lives in `lib/tts/index.mjs`, and sample-voice is a real CLI entry point that calls the
same code (`checkTtsOptions` → `synthesizeClips` → `wpmReport` / `cacheSummary`). What the library can't prove, and
**WP3b must re-check through `spine.mjs`**, is:
- TTS-01: the three failures happen before any Chromium launch (D2 says "no Chromium launch recorded"). `spine.mjs` must
  call `checkTtsOptions({narrate:true})` and `requireFfmpeg()` before the browser starts.
- TTS-03 and TTS-04: the spine passes the env-driven cache dirs through, and *prints* `cacheSummary` ("N/N cached"). The
  export-clips path must go through the manifest and clip export.
- TTS-05: the spine prints the `wpmReport` table **and** its `warnings` (the lib only returns them).
- TTS-01 (b): the spine's `--narrate` must trigger the key check. Today only sample-voice reaches it (via `narrate:true`).

## Review of lib/tts against the OpenRouter TTS docs

The code matches create-speech. It sends `POST https://openrouter.ai/api/v1/audio/speech` with `Authorization: Bearer`.
The body is `{model, input, voice, response_format:"pcm", provider:{zdr:true}, instructions?}`. `zdr` and `instructions`
are documented fields. Errors are parsed as JSON `{error:{code,message}}`.
- `provider:{zdr:true}` is set unconditionally in `requestBody` (lib/tts/openrouter.mjs:17). That is the only body
  builder, and `synthesize` is the only fetch.
- The debug log redacts the key: the whole JSON line passes through `redact()` before writing
  (lib/tts/openrouter.mjs:28). Error messages are redacted too (:51, :59).
- Cache isolation: `PEAK_MEDIA_TTS_CACHE` and `PEAK_MEDIA_TTS_LEGACY_DIRS` (lib/tts/cache.mjs:17-25). Lib tests pass
  `cacheDir`/`legacyDirs` explicitly, and subprocess tests use `isoEnv()` (evals/video-spine/tts.test.mjs:29-32).
  The empty-HOME run confirmed it.

## Scope

- `git diff --stat c5eb616..b13ed42` shows 22 files. All are in owned folders, `evidence/WP3a/` or `wp/WP3a/`, **except**
  `evals/video-spine/tts.test.mjs` and `evals/video-spine/helpers/fake-openrouter.mjs`. builder.md rule 5 requires
  script-AC tests under `evals/<skill>/`, so that's sanctioned. The brief's Owns list just omits it (nit N4).
- No WAV, MP4, MP3 or PCM is committed or in the diff. `grep -ri peakflames` over lib/ skills/ evals/ finds nothing.
  There are no contract, schema, decisions.md or acceptance.md changes. The only `sk-or` string committed is the
  test dummy `sk-or-v1-TESTSECRET…`.
- The two `AC-TTS-07-*-debug.log` files are untracked; the Lead needs to commit them.

## Findings

**Blocker:** none.

**Should-fix**
- S1. lib/tts/openrouter.mjs:63 takes the PCM rate from the static `MODELS` table (or `PEAK_MEDIA_TTS_PCM_RATE`). The
  live response says the rate itself: `Content-Type: audio/pcm;rate=24000;channels=1` (AC-TTS-07 logs). The docs leave
  the rate unspecified. Parse `rate=`/`channels=` from the content type and fall back to the table. Otherwise a provider
  change would silently give wrong-speed audio and wrong wpm.
- S2. lib/tts/openrouter.mjs:68: the missing-key message says "or drop --narrate". That suits the spine, but
  sample-voice (the only shipped caller) has no `--narrate` flag, so the advice is wrong there. Let the caller supply the
  alternative, or word it neutrally.

**Nit**
- N1. lib/cli.mjs (WP2): usage errors print a second `Run '… --help' for usage.` line. The AC-TTS-01 and BASE-07 tests
  filter it out (tts.test.mjs:33, evals/helpers/run.mjs). That's acceptable as the plugin-wide convention, but "one
  line" is read loosely.
- N2. lib/tts/openrouter.mjs:23/28: `redact` does a string split on the raw key after `JSON.stringify`. A key containing
  `"` or `\` would be JSON-escaped and slip past. OpenRouter keys are `[a-z0-9-]`, so this is theoretical. Redacting the
  header value before stringify would be more robust.
- N3. Legacy-cache compatibility is proven only for Gemini (the fixture is Gemini/Rasalgethi). For MAI the key uses the
  short id without the `:MAI-Voice-…` suffix (lib/tts/index.mjs:73). That's correct if the old recorder keyed the same
  way, but no test shows it.
- N4. wp/WP3a/brief.md "Owns" should list `evals/video-spine/` (WP3b will write there too, so coordinate filenames).
