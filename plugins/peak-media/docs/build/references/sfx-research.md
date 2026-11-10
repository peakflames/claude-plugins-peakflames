# SFX with HyperFrames — research note

*Researcher agent, checked 2026-11-09, for the Lead (WP10 / post-v0.1.0 planning). Read-only research; decisions go in `decisions.md`.*

**Short answer:** in 0.9.25, nothing makes in-composition audio better than our stem approach. HyperFrames' own SFX route (`media-use`) brings in the licence exposure we rejected in DEC-08. Keep the stems. Draw SFX from a CC0 brand pack plus a user folder, and build the stem from a cue list each plate exports.

## 1. What HyperFrames 0.9.25 supports

Tag v0.9.25 is commit 327e20208c3f, the same commit we vendored.

- **Audio in a composition.** A composition takes `<audio id … data-start data-duration>`, where `data-start` is local to its composition.
  - `data-volume` runs from 1 = 0 dB up to 3.98 = +12 dB.
  - Also available: `data-fade-in/out`, `data-automation`, `data-fx-chain`, `data-audio-group`.
  - An `<audio>` with no `id` is left out of the mix (`format.md`, `SKILL.reference.md` rule 8, `docs/reference/audio-effects.mdx`).
- **How the renderer mixes.** Each clip is trimmed, gain-set, faded and delayed by ffmpeg, then summed with `amix normalize=0` and a true-peak guard (`packages/engine/src/services/audioMixer.ts` L369, L954). Two issues are closed before the tag: #5546 (mixing ~180 short SFX clips was slow) and #5669 (the mix order changed from run to run).
- **Timing helpers.** There is no automatic sync. The only aid is a rule: put a clip's peak one frame after its picture.
  - `npx hyperframes audio <file> --json` finds where the file hits (`sound.md` §4).
  - `timeline --json` lists the absolute start of each audio clip.
  - `sound.md` also says each hit should sit 3–6 dB over the bed, two or three takes of a repeated sound should rotate, and there should be no synthesised tones.
- **`media-use` SFX** (`packages/cli/src/media-use/lib/sfx-provider.mjs`, `resolve.mjs`, `skills/media-use/audio/references/sfx.md`):
  - **Source order:** HeyGen sound search when signed in, then Openverse (CC0 and CC BY only, mostly Freesound, credits written to `CREDITS.md`), then 21 bundled Pixabay MP3s.
  - **The docs disagree:** `sfx.md` says "Openverse first" and never mentions HeyGen; the `SKILL.md` table and the code put HeyGen first.
  - **How it places hits:** each narration line names its cues (`lines[].sfx`), and each cue gets `offset_s` from the line start and volume 0.35.
  - It never generates SFX.

## 2. What the community does

Little is public.

- HeyGen's API docs fetch an SFX with `GET /v3/audio/sounds?type=sound_effects` and lay it in as `<audio data-hf-src=… data-hf-start="0.5">`. The URLs are short-lived pre-signed links, and the docs give no licence terms.
- One case study generated five SFX with the ElevenLabs Sound Effects API, rendered silent HF video, then mixed with ffmpeg timed to each clip's beat. That is essentially our design.
- CreativeClaw's "SFX and Music Launch" example doesn't say where its sounds come from.
- No GitHub issues or discussions about SFX timing were found.
- **Remotion, for comparison:** `@remotion/sfx` ships CC0 Freesound files on its CDN, each placed with `<Sequence from={frame}>` around `<Audio>`. Placement is by frame offset, as in HF.

## 3. Timing and sourcing options

- **Timing.** Every composition registers a paused GSAP timeline on `window.__timelines[id]`.
  - A cue list per plate can be read from the timeline itself: named labels, or tween start times read through GSAP's own timeline API (not checked in this pass).
  - Adding the plate's offset from the narration spine gives absolute cue times.
  - Beat and caption word times work too; `media-use` itself places cues relative to narration lines.
- **Licences:**
  - **CC0:** safe; no attribution needed.
  - **CC BY:** usable, but every published video needs a credit line.
  - **CC BY-NC and Freesound's legacy Sampling+:** unusable for monetised videos.
  - **Pixabay:** free, no attribution, but it bans "Standalone" distribution. Shipping files in a plugin is close to that ban.
  - **Content ID:** Freesound warns that a sound used unchanged can draw a YouTube Content ID claim.
  - **HeyGen sounds:** no published terms.

## 4. Recommendation for peak-media

1. **Where SFX come from.**
   - **The brand pack:** an `sfx/` folder of CC0 files only, each with a manifest entry (source URL, licence, duration, peak offset).
   - **A user folder,** `audio/sfx/`, comes second. The user asserts its rights; we record them in a `CREDITS.md`.
   - **Generated SFX** (ElevenLabs and similar) only if the user brings the key and accepts that provider's terms. Synthesised tones are against HF's own doctrine.
   - **Never ship** Pixabay files or HeyGen URLs in the plugin.
2. **Getting cues onto the stem.**
   - Each plate exports `cues.json`, a list of `{label, t_local, sfx}` read from its registered timeline's labels at render time.
   - Assembly adds each plate's offset from the narration spine, then shifts each hit back by the file's measured peak offset so the peak lands about one frame after the picture.
   - It then builds the stem with the same `adelay`/`amix` recipe (our `levelStem`/`mixStems` already do this) and hands it to `remux-audio --sfx`.
   - Hand placement stays as an override. This keeps "audio never forces a re-render."
3. **In-composition audio in 0.9.25.** Its real gains are fades and automation per clip, and Studio editing. Neither matters to us: each plate is rendered silent and one beat long, so a hit that crosses a cut would be clipped at the plate edge. Our ducking and levels already cover this.

**Licence risks:** Pixabay standalone redistribution, CC BY credit duties, NC and Sampling+ files slipping in from a user folder, HeyGen's unstated terms, and Content ID claims on unchanged CC0 or Pixabay sounds.

## Sources (all checked 2026-11-09)

- https://github.com/heygen-com/hyperframes, tag v0.9.25 = 327e20208c3f542841de670cce54754473f58d30 (committed 2026-11-08). Files read:
  - `skills/hyperframes/references/{sound,format}.md`, `skills/hyperframes/SKILL.md`
  - `skills/media-use/SKILL.md`, `skills/media-use/audio/references/sfx.md`, `skills/media-use/audio/assets/sfx/{CREDITS.md,manifest.json}`
  - `packages/cli/src/media-use/lib/{sfx-provider,openverse}.mjs`, `packages/cli/src/media-use/resolve.mjs`
  - `packages/engine/src/services/audioMixer.ts`
  - `docs/guides/voice-and-audio.mdx`, `docs/reference/audio-effects.mdx`
- https://github.com/heygen-com/hyperframes/issues/5546 (closed 2026-10-13) and https://github.com/heygen-com/hyperframes/issues/5669 (closed 2026-10-23)
- https://developers.heygen.com/hyperframes-heygen and https://developers.heygen.com/sound-effects (no version shown; silent on licence)
- https://pixabay.com/service/license-summary/
- https://freesound.org/help/faq/#licenses
- https://www.remotion.dev/docs/audio/sfx and https://www.remotion.dev/docs/sfx/whoosh (@remotion/sfx 4.0.429)
- https://mighty-garnet-jm6w.here.now/ (undated) and https://creativeclaw.co/examples/hyperframes-launch-sfx-music/ (commit 6259ea7)
- Local: `vendor/hyperframes/hyperframes/references/sound.md`, `skills/video-assemble/scripts/{remux-audio,audio}.mjs`
