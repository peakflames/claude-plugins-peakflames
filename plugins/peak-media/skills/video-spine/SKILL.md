---
name: video-spine
description: |
  Turns a video brief into a timed spine: writes script.md sized to the runtime, gets it
  cold-read and approved, then synthesizes narration (or a beat grid when there is no voice)
  into spine/manifest.json or spine/beatgrid.json that every plate is timed to.
  Stages 0–2 of the plate factory; usable on its own.
  Triggers on: "write the narration", "script this video", "make the spine", "time the beats",
  "narrate this brief", "voice-over for the explainer", "beat grid".
---

You build the **spine**: the clock every plate hangs on. Narration sets the timing; with no
voice, a beat grid carrying on-screen text does. Never generate narration anywhere else.

Scripts: `${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/` (`spine.mjs`, `sample-voice.mjs`).
Run `node <script> --help` for every flag. If a script says a dependency is missing, run
`bash ${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh` and retry.

Before writing a script, Read `references/narration-writing.md` (and `references/voices.md` when
picking a voice).

## Stage 0 — Brief (gate: user confirms)

`brief.md` in the video project folder must give:

- **Runtime**, as a line like `- **Runtime:** 20 s target` (`s`, `ms` or `min`).
- **Beats**, under a `## Beats` heading, one list item per beat starting with its id in bold:
  `1. **hook** (motion) — what the beat says`. Ids are lowercase letters, digits and dashes.
- Audience, aspect ratio, assets and the brand pack path (read by later stages).

Show the brief to the user and wait for a yes.

## Stage 1 — Script (gate: cold read, then the user)

1. **Size it first.** Words ≈ (seconds − beats × 0.5 s padding) × wpm ÷ 60. Get the word budget
   with `spine --brief brief.md --budget --wpm <rate>`. For a real voice, measure the rate with
   `sample-voice.mjs` on the opening paragraph; without one, use 165. Write to the budget; never
   write long and trim.
2. **Write `script.md`** next to the brief, in this format:

   ```markdown
   # <title>                         (optional; text before the first beat is ignored)

   ## hook
   <Warm> Two tools, one promise: spec before code. They differ on who checks the work.

   On screen: Who checks the work?

   ## compare
   One paragraph, written for the ear. It may wrap over several lines.
   Style: Slower and deliberate.      (optional: overrides --style for this clip only)
   ```

   - One `## <beat-id>` section per brief beat, **in the brief's order** (the spine rejects a mismatch).
   - Exactly **one paragraph** of narration per beat; it becomes one TTS clip. Mood tags such as
     `<Warm>` stay in the text: they are performed, not read, and are not counted as words.
   - `On screen:` is the beat's short visible text. It is required in practice for a beat grid
     (without it the spine uses the paragraph's first sentence).
   - `<!-- comments -->` are ignored.
3. **Cold read.** Spawn a fresh agent with *only* the script text (no repo, no brief) playing the
   brief's audience. Ask it to mark each beat CLEAR or UNCLEAR, what it would do next, what
   confused it, and which lines sound like hype. Fix every UNCLEAR beat and read again.
4. Show the user the script and the cold-read result. Wait for approval.

## Stage 2 — Spine (gate: runtime within ±10% of target)

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/video-spine/scripts/spine.mjs --brief brief.md [--voice <v> --style "<s>"]
```

- **Narration** (when `PEAK_MEDIA_OPENROUTER_API_KEY`, or the legacy `TTS_OPENROUTER_API_KEY`, is set, or `--tts-model fake/tone` for offline
  tests): one clip per beat → `spine/narration.wav`, `spine/manifest.json`, and the clips copied
  to `spine/clips/`. Each beat is `--lead-ms` + clip + `--tail-ms` (250 ms each by default, at
  least 200), so beats are separated by ≥ 400 ms of silence and plate cuts can land in it. A
  spine that runs short holds each beat up to `--max-hold-ms` (1 s) longer, never past the target.
- **Beat grid** (no key, or `--no-narrate`): `spine/beatgrid.json` with each beat's on-screen
  text, durations weighted by the paragraph's words and snapped to whole beats at `--bpm`, and a
  silent `spine/narration.wav`. No network calls. Pass `--narrate` to fail instead of falling back.
- The spine prints a per-clip wpm table and warns when a clip runs far slower than the rest
  (usually a mood tag read aloud): fix that line and rerun. A rerun reuses cached clips
  ("N/N cached").
- **Gate:** it ends with `PASS  runtime …` and the gate line `GATE 2 spine: PASS — …` (printed by the script; plate-factory relies on it). On `runtime … outside ±10%` (exit 1) the files
  are still written; cut or add words in `script.md` and rerun. Don't stretch the spine by hand.
- Check cuts land in silence (DEC-13) before handing on:
  `check-cuts spine/narration.wav --cuts <each beat's startMs after the first> --min-silence-ms 400`.

The manifest (schema `schemas/spine-manifest.v1.json`) gives each beat's `startMs` and
`durationMs`; the plate list (stage 3) copies them. Keep `script.md`, `spine/manifest.json` and
`spine/clips/` with the video: the tagged text plus the clips reproduce the audio exactly.
