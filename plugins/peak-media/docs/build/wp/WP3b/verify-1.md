verifier-id: verifier-wp3b-r1-6d778e6e

# WP3b verify-1: spine script + manifest

The builder was `builder-wp3b-0a9e3be0`, so my id differs. I verified HEAD 0dce4ae, which has the real WP3a `lib/tts` and the stub dropped. Every run had `PEAK_MEDIA_OPENROUTER_API_KEY` and `TTS_OPENROUTER_API_KEY` unset (`env -u`), `HOME` and `PEAK_MEDIA_TTS_CACHE` pointed at a temp dir, `PEAK_MEDIA_TTS_LEGACY_DIRS=` and the `evals/helpers/no-network.mjs` spy preloaded. I made no live OpenRouter calls, and no key appears in any log (`sk-or` matches 0). Outputs went to temp dirs, and the fixtures are untouched. The per-AC logs below replace the Builder's files of the same name; the Builder's copies are still at 135c6bd.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-SPN-01 | PASS | evidence/WP3b/AC-SPN-01.log | I ran `spine.mjs --brief fixtures/F1/brief.md --out $T/s1 --tts-model fake/tone`. kind=narration, totalMs 20773 against a 20000 target (+3.9%). `scripts/validate.mjs` reports `ok (spine v1)`. It made 3 clips, exported to `s1/clips/`, and the file names match the manifest. |
| AC-SPN-02 | PASS | evidence/WP3b/AC-SPN-02.log | Default model with no key: it prints the note naming `PEAK_MEDIA_OPENROUTER_API_KEY` and writes `beatgrid.json` (bpm 120, clips [], onScreenText on every beat) and a silent `narration.wav`. No manifest.json. Validates. **0 NETWORK-ATTEMPT**; the spy did catch a test `fetch`. totalMs is 20000 (0.0%). `--no-narrate` with fake/tone gives the same result. |
| AC-SPN-03 | PASS | evidence/WP3b/AC-SPN-03.log | The clip-to-clip gaps are 500 ms and 500 ms, with each clip inside its beat. `check-cuts narration.wav --cuts 5591,16273 --min-silence-ms 400 --expect-cuts 2` gives PASS (500 ms silences). Negative controls fail as they should: cuts mid-clip, and `--min-silence-ms 600`. In the hold case (`--target-ms 24000`) the gaps are 1500 ms and check-cuts passes. `--lead-ms 150` is rejected (exit 2). |
| AC-SPN-04 | BLOCKED: needs user | evidence/WP3b/AC-SPN-04-cold-read-final.md (+ AC-SPN-04-cold-read.md) | User approval is recorded (fixtures/F1/brief.md, script.md:3–4). A fresh cold read (sonnet, spoken text only) marked hook CLEAR, **compare UNCLEAR** ("dense for spoken audio … hard to follow by ear"; doesn't say why same-AI review matters) and close CLEAR. It flagged overclaims: the absolutes "same AI … each change" and "every requirement", and the unsupported "wins on speed". That makes five reads in a row that flag compare, so this isn't a PASS by the stated rule. The user decides. |
| AC-BASE-06 | PASS | evidence/WP3b/AC-BASE-06.log | `--help` lists all 19 spec flags plus `-h` and `--version`. `--version` prints 0.1.0, which matches plugin.json. I ran 16 bad inputs (unknown flag, positional, missing brief or script, no runtime, 2 paragraphs, beat order mismatch, no beats, bad id, narrate+no-narrate, bpm 0, target-ms 10, non-numeric, fractional offset, bad model, runtime off target). Each exits non-zero with a 1-line actionable error, no stack trace and 0 network attempts. A runtime miss exits 1 with the files written, as documented. `--budget` makes no network calls. |

Suite runs, all with keys unset:

| Run | Result | Log |
|---|---|---|
| `node --test plugins/peak-media/evals` | 40/40 pass | evidence/WP3b/verifier-node-test.log |
| `ac-run --wp WP3b` | SPN-01/02/03 and BASE-06 pass; SPN-04 manual | evidence/WP3b/verifier-ac-run-WP3b.log |
| `ac-run --trace` | PASS, 77 ACs, 0 problems | evidence/WP3b/verifier-ac-run-trace.log |

## WP3a deferred re-checks through spine.mjs

| Item | Verdict | Evidence | Notes |
|---|---|---|---|
| TTS-01 bad voice / `--narrate` no key / no ffmpeg | PASS | evidence/WP3b/AC-TTS-01-via-spine.log | Each fails in 71–90 ms with 1 line, exit 2/3/3, no stack and 0 network attempts. Nothing is written to out or cache. `checkTtsOptions` (spine.mjs:210) runs before `requireFfmpeg` (:230). spine.mjs launches no browser (0 playwright/chromium refs). `--narrate` without a key reaches the key check, and the message names `PEAK_MEDIA_OPENROUTER_API_KEY`. |
| TTS-03/04 cache pass-through, "N/N cached", export | PASS with should-fix S1 | evidence/WP3b/AC-TTS-03-04-via-spine.log | `--cache-dir`: run 1 printed `0/3 cached`, run 2 `3/3 cached`. Exported files equal the manifest's `clips[].file`. Exported clips copied into an empty cache gave `3/3 cached`, with identical sha256 and an identical manifest. `--export-clips <dir>` works. `PEAK_MEDIA_TTS_LEGACY_DIRS` passes through (`3/3 cached` from the legacy dir only). **`PEAK_MEDIA_TTS_CACHE` does not pass through:** with no `--cache-dir`, the clips landed in `$HOME/.cache/peak-media/tts` (3 files) and the env dir stayed empty. See S1. |
| TTS-05 wpm table and slow-clip warning | PASS | evidence/WP3b/AC-TTS-05-via-spine.log | With `PEAK_MEDIA_FAKE_SLOW=1`, `2` and `3`, the table prints each time and exactly one `warn  slow clip N: …` names the slowed clip. The unslowed control prints no warning. |

## Doc review

- Brand-neutral: `grep -ril peakflames skills evals` is empty, and so are `openspec|peak.workflow|archer` over skills/, evals/ and lib/.
- SKILL.md:71 names `PEAK_MEDIA_OPENROUTER_API_KEY` and the legacy fallback. narration-writing.md doesn't name a key, which is acceptable.
- The Gemini read-aloud warning is **missing**. See S2.

## Scope

- `git diff --stat c5eb616..0dce4ae -- plugins/peak-media` lists 92 files. With the WP3a/WP5 content removed (`git diff 0dce4ae^2 0dce4ae`), WP3b's net change is 13 files. 3 are owned files (SKILL.md, spine.mjs, narration-writing.md). The other 10 are `evals/video-spine/spine.test.mjs`, `fixtures/F1/script.md`, 7 files in `evidence/WP3b/` and `wp/WP3b/handoff.md`.
  - `spine.test.mjs` is sanctioned by builder.md rule 5.
  - `script.md` is required by the brief ("produce the F1 `script.md`").
- The builder's `lib/tts/index.mjs` stub (135c6bd) was dropped in the merge, so WP3b has no net lib change.
- No schema changes, and no contract-change entry is needed.
- WAV/MP4: `git ls-files plugins/peak-media` holds 0 `.wav`/`.mp4`/`.mov`/`.webm`. The builder's scratch `fixtures/F1/run/` is gitignored (`.gitignore:8`).

## Findings

### Blocker

None.

### Should-fix

- **S1. spine.mjs:231 bypasses `PEAK_MEDIA_TTS_CACHE`.**
  - `path.resolve(v['cache-dir'] ?? path.join(os.homedir(), '.cache', 'peak-media', 'tts'))` always passes an explicit `cacheDir`. That skips lib's `defaultCacheDir(env)` (lib/tts/cache.mjs:17–19), so the documented isolation override is ignored. A test or user that relies on the env var writes into the real home cache.
  - Repro: in the TTS-03/04 log's last section, the env dir is empty and `$HOME/.cache/peak-media/tts` holds 3 files.
  - Fix: pass `cacheDir: v['cache-dir'] && path.resolve(v['cache-dir'])` and let lib default. Also mention the env var in the `--cache-dir` help (spine.mjs:154).
  - The evals don't catch this because they always pass `--cache-dir` (spine.test.mjs:32, :112).
- **S2. The skill docs say mood tags are never read aloud.**
  - SKILL.md:45 opens the example with `<Warm>`, and SKILL.md:55–56 says tags "are performed, not read". narration-writing.md:38–41 says the same, and :62–64 calls a read tag the exception.
  - That contradicts WP3a's finding in voices.md:62–65 ("Gemini 3.8 models read `input` as written, so a mood tag such as `<Warm>` may be spoken aloud") and the F1 script's own rule (script.md:4: "No <style> tags: Gemini may read them aloud").
  - Neither doc warns that Gemini may read the tags aloud. Add the warning to both, drop `<Warm>` from the SKILL.md example or mark it as model-dependent, and point to the slow-clip warning as the check.
- **S3. AC-SPN-04: the cold reader still marks compare UNCLEAR.**
  - The beat is too dense by ear and doesn't explain why "same AI writes and reviews" matters.
  - The reader also flagged three overclaims: "the same AI writes and reviews each change", "traces every requirement" and "OpenSpec wins on speed".
  - The wording is user-approved, so the user decides: accept despite the flag, or revise compare. Any claim change also touches the brief and plates.json.

### Nit

- **N1.** script.md:3 and fixtures/F1/brief.md say "50 words", but the spine's `countWords` gives 53 (14 + 28 + 11; `--budget` prints `script 53 words (on budget)`). The count is still within the budget of about 51 ±10%.
- **N2.** spine.mjs:137: the `--help` sentence "Narration is on by default when PEAK_MEDIA_OPENROUTER_API_KEY is set" leaves out the legacy key, which also turns narration on (:208). spine.mjs:144 (`--narrate` desc) is the same. spine.mjs:136 is an unwrapped long line in the help.
- **N3.** spine.mjs:254: the slow-clip warning names only the clip number. Adding the beat id (`clips[n-1].beat`) would point straight at the script section.
- **N4.** spine.mjs:148: `--style` help renders as `(default: )`.
- **N5.** brief.md "Owns" omits `evals/video-spine/spine.test.mjs` and `fixtures/F1/script.md`, though both are sanctioned. This is the same gap as WP3a's N4.
