# Plate Factory: A Faceless Motion-Graphics Workflow with HyperFrames

**Source:** a creator's 46-minute "can AI really edit?" day-long experiment (Opus 5.5 + Claude Code), with the filmed talking-head parts removed.

**TL;DR:** The workflow the creator settled on is a **plate factory**. A timed **spine** sets the clock: narration, or a music beat grid when there is no voice. Every visual beat is its own short HyperFrames composition, called a **motion plate**. Each plate is approved as a still first, then rendered on its own, then composited onto the spine. Music and sound effects are added in separate passes after the picture is locked. HyperFrames is the workhorse. Remotion was a close second, and AI-driven editing in DaVinci Resolve was the dead end.

---

## 1. The process the video landed on

1. **Pick the lane.** There are two ways AI makes video:
   - **Editing filmed footage**, for example through a Resolve MCP. This scored about 3/10 one-shot.
   - **Writing the video as code** with HyperFrames or Remotion. This scored about 7/10 one-shot.

   Faceless motion graphics belong entirely in the second lane.
2. **Script to length first.** The breakthrough was "if you want a short video, make a short script." Asking the AI to carve 45 s out of 5 minutes of material failed. Write the script to the target runtime before anything visual exists.
3. **Warm-start with real assets.** Give Claude real product screenshots or UI views, the logo, and brand colors and fonts. Don't let it invent the product's UI.
4. **Pipeline test.** Render a throwaway clip of about 10 s to prove the toolchain works (ffmpeg, the renderer, fonts) before any creative work starts.
5. **Storyboard and contact sheet before motion.** Claude produces static key frames and asks option questions, such as which headline and what length. The human picks before any animation code is written.
6. **Build motion plates.** Each beat is a self-contained 3–8 s composition built against real UI: zooms, pans, kinetic type, and hits timed to the music. Each plate renders to its own file and is reviewed through a contact sheet.
7. **Composite.** Drop the plates onto the spine at their timecodes and render one review MP4.
8. **Music pass, then SFX pass.** These are separate, later passes: background track first, then whooshes, plops and risers.
9. **Polish loop.** Getting from about 85% to about 97% took around 20 small prompts:
   - fixing flash frames;
   - toning down "AI-slop" gradients;
   - adjusting layout;
   - swapping placeholder imagery for realistic imagery.
10. **Rebrand is cheap.** A new logo arrived late in the day. Updating the design tokens and re-rendering every plate took one prompt, not a manual redo.

**Result:** about 6 hours from zero knowledge to roughly 97% of a professional editor's motion graphics, at no cost beyond the Claude subscription.

## 2. The five lessons, as rules

| Lesson | Rule for the workflow |
|---|---|
| Treat the AI like a human editor | Give it the brief you'd give a person, at the same level of detail and scope. |
| Learn the professionals' vocabulary | Use the precise terms in prompts: motion plate, contact sheet, storyboard, cut. |
| Show the plan before building | Stills and contact sheets are cheap to fix; finished renders are not. |
| A short video needs a short script | Size the script to the runtime first; never ask the AI to trim. |
| Video as code makes changes cheap | Keep brand in tokens and beats in separate plates, so any change is a re-render. |

## 3. Glossary

- **Motion plate:** a short, finished, already-rendered piece of motion graphics that drops into a timeline as a self-contained visual layer.
- **Contact sheet:** a grid of still frames sampled from a storyboard or render, used for quick review. Claude can read images but cannot watch video.
- **Spine:** the timing track the plates hang on. In this workflow it is narration clips or a music beat grid.
- **Pipeline test:** a minimal render that proves the toolchain end to end.

---

## 4. Meta-skill design: `/plate-factory`

The skill is a thin orchestrator over the smaller skills described in section 6. It calls a pinned HyperFrames CLI and uses vendored copies of any HyperFrames skills worth keeping (see section 7). It runs in stages, and each stage has a gate.

| Stage | Output | Gate |
|---|---|---|
| 0. Brief | `brief.md`: audience, runtime, aspect ratio, assets, path to brand tokens | User confirms |
| 1. Script | Narration with one paragraph per beat, sized as words ≈ seconds × wpm ÷ 60 | A cold-read agent checks it, then the user |
| 2. Spine | TTS clips plus a manifest giving each beat's start and duration, or a music beat grid if there is no narration | Runtime within ±10% of target |
| 3. Plate list | `plates.json`: id, beat, start, duration, intent (one idea per plate), assets | User confirms |
| 4. Storyboard | One key-frame still per plate, assembled into a contact sheet | **User approves before any animation** |
| 5. Pipeline test | A 3 s render of plate 1 | Renders cleanly |
| 6. Build plates | One rendered file per plate, built by that plate's kind (section 5) and rendered alone | Self-review via contact sheet (up to 3 rounds), then an independent reviewer agent |
| 7. Composite | Plates placed on the spine, giving a review MP4 | Sync check: every cut lands in a silent gap |
| 8. Music, then SFX | Separate audio stems, remuxed onto the video with no re-render | User listens |
| 9. Export | Final render at 1080p60 or 4K supersampled | Final contact sheet |

### Design rules

- **The plate is the unit of work.** Every fix names a plate ("plate 4: text overlaps the chart") and re-renders only that plate.
- **One shared theme file.** It holds colors, fonts, easing and spacing. Every plate imports it, so a rebrand is just a re-render.
- **Narration is optional.** With no TTS provider, the spine falls back to a music beat grid carrying on-screen text.
- **Determinism.** No wall-clock timing and no unseeded randomness. Fonts are vendored locally. The HyperFrames version is pinned.
- **Stills, not video, for review.** Every review step goes through contact sheets of sampled frames.
- **Audio never forces a re-render.** Music and SFX are mixed as stems and remuxed onto the rendered picture.

### Suggested project layout

```
<video>/
  brief.md
  script.md            # tagged narration, one paragraph per beat
  spine/               # narration clips + manifest.json (or beatgrid.json)
  plates.json          # the plate list
  theme/tokens.css     # single source of brand
  plates/<id>/index.html
  renders/plates/<id>.mp4
  review/contact-*.jpg
  audio/music.wav  audio/sfx.wav
  out/final.mp4
```

---

## 5. Plate kinds

The input to `/plate-factory` is web content: a URL, a repo, a document, or a concept brief. That content is source material (facts, screenshots, brand assets), not something to record. Claude does not need to build a separate website and then record it, because every motion plate is already an HTML page that HyperFrames renders frame by frame.

Each entry in `plates.json` declares a `kind`:

| Kind | Built by | Use it for |
|---|---|---|
| `motion` (default) | A HyperFrames HTML composition, rendered frame by frame | Invented visuals: kinetic type, diagrams, zooms and pans over screenshots |
| `slide` | A `motion` plate in a deck layout | Animated slide presentations; a deck is a plate list where every plate is a slide |
| `recorded` | The record skill, which plays a live page or app in real time and captures it | Things that cannot be seeked: a real app flow, a real terminal session, a live site |

All kinds produce a rendered video file of the plate's planned duration. The composite stage treats them the same way: recorded clips drop onto the spine as video layers, like any other plate.

## 6. Splitting the work by job

The parts are split by job, not by tool, so each can be used on its own and improved without touching the others.

| Part | Job | Input → output |
|---|---|---|
| 1. Spine | Brief, script and narration | Brief → `script.md`, TTS clips and `spine/manifest.json` (or `beatgrid.json` with no narration) |
| 2. Renderers | Turn each plate into a video file | Plate entry → `renders/plates/<id>.mp4`. `motion` and `slide` use HyperFrames; `recorded` uses the record skill |
| 3. Assembly | Composite, audio passes, outro, export | Manifest, plate renders and audio stems → `out/final.mp4` |
| 4. Brand pack | Tokens, logo, fonts, outro, music rules | A folder every part reads. It is configuration, not a skill |
| Orchestrator | `/plate-factory` runs parts 1–3 with the gates from section 4 | Brief → finished video |

### One timing model

Narration comes first and sets the clock. Every renderer, including the record skill, is timed to the spine manifest. Narration is never generated inside a renderer, so there is one TTS component, one cache, and one way to re-time a beat.

### One review loop

Storyboard stills, the self-review rounds, the reviewer agent and the sync check live in the orchestrator, not in each renderer. Renderers only have to produce files that can be sampled into contact sheets.

## 7. Packaging for publication

The skills are meant to be published for other Claude Code users to install. That makes the contracts between the parts the real product.

- **One plugin, several small skills.** Ship the spine, plates, record and assemble skills plus the `/plate-factory` orchestrator in one plugin. Users install one thing and can still call any piece on its own.
- **Versioned file contracts.** `spine/manifest.json`, `plates.json` and the brand-pack layout each carry a `schemaVersion`. They are what make the parts composable, and changing them is what breaks users, so changes are deliberate and documented.
- **Brand pack is a user folder.** The plugin ships a neutral default brand pack. Any user's own brand pack replaces it by path; the first real brand pack doubles as a test fixture.
- **Pin HyperFrames; vendor what you depend on.** HyperFrames is pre-1.0 and changes weekly. Pin the CLI version in one place. Copy any HyperFrames skills (or other external skills) the plugin relies on into the plugin itself, keeping their licenses and recording each one's source, version, date and local changes in a `VENDORED.md`. Users then get a repeatable set of artifacts instead of whatever the upstream plugin looks like that week.
- **Every external piece is optional:**
  - TTS is provider-agnostic. With no key, the spine falls back to a music beat grid with on-screen text.
  - No music ships with the plugin, for licensing reasons. Users supply their own tracks and credits.
  - The same skills run locally (full quality) and in cloud sessions (headless browser detected, network-restricted installs handled).
- **Evals per skill.** Each skill has a fixture brief and checks its output: the spine's runtime against the target, each plate's duration and contact sheet, and the composite's sync check. Updates cannot silently regress.
- **The author is the first user.** Each new capability is proven by making a real video with it before it is generalized. A step becomes part of a skill after it has been done by hand twice.
