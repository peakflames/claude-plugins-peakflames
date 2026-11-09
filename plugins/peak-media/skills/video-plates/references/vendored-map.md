# Vendored HyperFrames references — what to Read, when

peak-media ships trimmed copies of six HyperFrames skills under
`${CLAUDE_PLUGIN_ROOT}/vendor/hyperframes/` (source, commit and every local change:
`${CLAUDE_PLUGIN_ROOT}/VENDORED.md`). They are **references, not registered skills**: each
`SKILL.md` was renamed `SKILL.reference.md`, so `/hyperframes` and friends do not exist in a
peak-media session. Load them with explicit Read steps from the table below.

Paths are relative to `${CLAUDE_PLUGIN_ROOT}`. Every path in backticks that starts with
`vendor/hyperframes/` is checked by eval AC-VND-01 (it must exist, and every vendor folder must
appear here).

## Rules that override the vendored text

- **Never run `npx hyperframes …`.** The CLI version is pinned in `lib/pins.json` and run through
  `lib/hf.mjs` with telemetry, update checks and skill installs off. Use
  `skills/video-plates/scripts/render-plate.mjs` (render, `--lint` for `lint` + `check --strict`,
  `--storyboard` for snapshots). Where a vendored file says `npx hyperframes <cmd>`, read it as
  "what render-plate does for you", or ask the user before anything else.
- **Never run** `events`, `feedback`, `publish`, `upgrade`, `auth`, `tts`, `capture`, `preview` or
  `present`: they talk to the network or change the pinned install. Hosted/Lambda/Cloud Run
  rendering and the frame presets are not vendored.
- **Skills named in the vendored text that are not vendored** (`/hyperframes-registry`,
  `/media-use`, `/remotion-to-hyperframes`, `/reverse-any-video`, `/figma`) are unavailable. Build
  the effect by hand; get media from the brief's real assets; audio belongs to video-assemble.
- **One plate = one root composition** (`plates/<id>/index.html`), rendered alone. The vendored
  advice about sub-compositions, Studio, variables and decks applies inside a plate only where it
  helps; peak-media never mounts plates into one master timeline (assembly composites the MP4s).
- **Brand comes only from the pack's tokens** (`brand/tokens.css`), never from presets.

## Read steps, by task

### Before writing the first plate of a video (every video)

1. Read `vendor/hyperframes/hyperframes/SKILL.reference.md` — the render contract (12 rules).
2. Read `vendor/hyperframes/hyperframes/references/runtimes.md` — GSAP facts that bite, seeded
   randomness, the seek protocol. **Required before the first `plates/<id>/index.html` is written.**
3. Read `vendor/hyperframes/hyperframes/references/format.md` — composition shape, fonts, timing,
   layout-audit opt-outs, the lint errors you'll meet first.

### Storyboard stills (stage 4, before any animation)

4. Read `vendor/hyperframes/hyperframes/references/storyboard.md` and
   `vendor/hyperframes/hyperframes/references/storyboard-format.md` for what a key frame must
   show. Produce the stills with `render-plate <plates.json> --all --storyboard`.

### Authoring a motion plate

5. Read `vendor/hyperframes/motion-doctrine/SKILL.reference.md` (the motion law: vector law,
   carrier elements, no idle wobble), then the technique you need from
   `vendor/hyperframes/cut-the-curve/SKILL.reference.md` (waterfall entry for kinetic type, the
   nudge curve for group moves) with its code in
   `vendor/hyperframes/cut-the-curve/examples/gsap-implementation.md`.
6. Read `vendor/hyperframes/hyperframes/references/motion.md` for eases, titles, punch-ins, holds.
7. By plate content: kinetic type, a website or a real place →
   `vendor/hyperframes/hyperframes/references/film.md`; a chart or numbers →
   `vendor/hyperframes/hyperframes/references/types/data.md`; an explainer beat →
   `vendor/hyperframes/hyperframes/references/types/explainer.md`; a launch/promo beat →
   `vendor/hyperframes/hyperframes/references/types/launch.md`; 3D or generative →
   `vendor/hyperframes/hyperframes/references/types/3d.md` and
   `vendor/hyperframes/hyperframes/references/path-tracing.md`; a mascot →
   `vendor/hyperframes/hyperframes/references/types/character.md`; a vertical cut →
   `vendor/hyperframes/hyperframes/references/types/vertical.md`; a beat-synced music piece →
   `vendor/hyperframes/hyperframes/references/types/music.md`.
8. Look and palette roles inside the brand tokens: `vendor/hyperframes/hyperframes/references/look.md`.
9. Overlays or captions burned into a plate: `vendor/hyperframes/hyperframes/references/overlays.md`,
   `vendor/hyperframes/hyperframes/references/captions.md`.
10. Locating a point in a screenshot (for a zoom or a callout): the grid method in
    `vendor/hyperframes/hyperframes/scripts/locate.mjs` (header comment). Baked map moves:
    `vendor/hyperframes/hyperframes/scripts/bake-basemap.mjs` (network — ask first).

### Authoring a slide plate

11. Read `vendor/hyperframes/slideshow/SKILL.reference.md` for deck rules (text the audience
    reads is ≥ 40 px at 1080p, i.e. ≥ 27 px at 720p; hold states must look right when seeked).
    Ignore its JSON island and `present`: a peak-media slide is one plate, rendered alone.

### Seams between plates

12. Plates are cut at silent gaps by video-assemble, so in-plate seams are rare. When one plate
    holds several scenes, Read `vendor/hyperframes/seam-craft/SKILL.reference.md` (opaque stage
    ground, no white flash) and the Seam Gate in
    `vendor/hyperframes/motion-doctrine/references/seam-gate.md`; its scripts are
    `vendor/hyperframes/motion-doctrine/scripts/seam-stamp.mjs` and
    `vendor/hyperframes/motion-doctrine/scripts/seam-gate.mjs` (reference only — they expect a
    HyperFrames repo checkout).

### Checking and reviewing a plate

13. Before `render-plate --lint`: Read
    `vendor/hyperframes/hyperframes-cli/references/lint-validate-inspect.md` (what `lint` and
    `check` report, layout/contrast/craft findings). The CLI by job:
    `vendor/hyperframes/hyperframes-cli/SKILL.reference.md`; flag conventions:
    `vendor/hyperframes/hyperframes-cli/references/conventions.md`.
14. Reviewing frames: `vendor/hyperframes/hyperframes/references/review.md` (what to look for in
    a contact sheet). For a long piece also `vendor/hyperframes/hyperframes/references/story.md`
    and `vendor/hyperframes/hyperframes/references/spec.md`.

### When a render fails

15. Read `vendor/hyperframes/hyperframes-cli/references/doctor-browser.md` (Chrome missing or
    blocked) and `vendor/hyperframes/hyperframes-cli/references/preview-render.md` (render flags,
    quality levels). Batch/compare: `vendor/hyperframes/hyperframes-cli/references/compare-and-batch.md`.

### Rarely needed (context only)

- `vendor/hyperframes/hyperframes-cli/references/init-and-scaffold.md` — render-plate scaffolds
  instead of `init`.
- `vendor/hyperframes/hyperframes-cli/references/beats.md` — beat detection (the spine owns timing).
- `vendor/hyperframes/hyperframes-cli/references/upgrade-info-misc.md` — `timeline`, `info`, `docs`.
- `vendor/hyperframes/hyperframes-cli/references/feedback.md` — do not send feedback (network).
- `vendor/hyperframes/hyperframes/references/sound.md` — sound design; audio is video-assemble's job.
- `vendor/hyperframes/LICENSE`, `vendor/hyperframes/CREDITS.md` — Apache-2.0 and attribution.
