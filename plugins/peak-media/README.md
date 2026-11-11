# peak-media

Faceless motion-graphics video from a written brief or a live web page, made inside Claude Code.

A **spine** sets the clock: a narration track, or a beat grid when there is no voice. Each visual
beat on it is a **plate**: a HyperFrames `motion` or `slide` composition rendered frame by frame, or
a `live` web page captured in real time. Assembly puts the plates on the spine, lays music and SFX
under the voice without re-encoding the picture, appends your brand's outro, and writes
`out/final.mp4` (H.264 High, yuv420p, AAC 48 kHz, faststart).

You approve the brief, the script, the plate list, the storyboard stills and the mix. Claude checks
the rest (runtime, lint, cut timing, delivery spec) and shows you contact sheets, not raw video.

## Install

In Claude Code:

```
/plugin marketplace add peakflames/claude-plugins-peakflames
/plugin install peak-media@peakflames-plugins
```

Restart Claude Code, then check that `/plugin` lists the six skills below.

The marketplace tracks the repository's `main` branch, which holds released versions only. To try
unreleased work, add a branch instead, e.g. `peakflames/claude-plugins-peakflames#develop`; expect
it to change without a release.

## Prerequisites

| Need | Why | Check |
|---|---|---|
| **macOS** | The only supported platform | |
| **Node.js 22 or newer** (with npm) | Every script is Node; HyperFrames needs 22 | `node -v` |
| **ffmpeg and ffprobe** | Encoding, loudness, cut checks | `ffmpeg -version` |
| **About 1 GB of disk** for the runtime, plus room for renders | Runtime deps ≈ 140 MB, render browser ≈ 400 MB, sign-in browser ≈ 380 MB; a 1–2 minute video needs a few hundred MB more while it is built | |
| **Network** for setup, and for narration | Setup downloads the pinned packages and a headless browser once; rendering is offline | |

Install ffmpeg with `brew install ffmpeg`.

**peak-media 0.1.0 supports macOS only** (Apple silicon or Intel). Linux and Windows are not
supported.

## Setup

The runtime (the pinned HyperFrames CLI, Playwright, GSAP and ajv, plus a headless Chromium) is not
shipped in the plugin. `scripts/setup.mjs` installs it once into the plugin's data folder
(`$CLAUDE_PLUGIN_DATA`, or `~/.cache/peak-media`), so plugin updates don't wipe it.

The easiest way: ask Claude to *"run the peak-media setup"*. Any skill that finds a dependency
missing also offers to run it. By hand:

```bash
node ~/.claude/plugins/cache/peakflames-plugins/peak-media/<version>/scripts/setup.mjs
node …/scripts/setup.mjs --check     # report what's missing; install nothing
```

It is safe to re-run; it only downloads what is missing. Options: `--data-dir <dir>` to install
elsewhere, `--skip-browser` when `HYPERFRAMES_BROWSER_PATH` already points at a Chromium headless
shell. Every failure is one line naming the fix (for example `ffmpeg not found — install it …`).

## The narration key

Narration is synthesized through [OpenRouter](https://openrouter.ai). Put your key in the
environment Claude Code starts from:

```bash
export PEAK_MEDIA_OPENROUTER_API_KEY=sk-or-…
```

(The older name `TTS_OPENROUTER_API_KEY` is also read.) The key is never written to a file or a
log; `--debug-requests` logs show it redacted.

**Zero data retention.** Every speech request asks OpenRouter for zero-data-retention providers
only (`provider: { zdr: true }`). The default Gemini voices are served through Google Vertex, which
keeps safety logs: your OpenRouter account must allow that ("Allow Safety Retention" in its privacy
settings) or the request is refused. If you'd rather not, use Microsoft's voices instead, which have
no retention: `--tts-model microsoft/mai-voice-2.1-flash`.

**No key, no problem.** Without a key nothing is sent anywhere: the spine becomes a silent beat
grid (below).

## Four ways to make a video

### 1. Narrated explainer

Write or paste a brief and ask:

> Make a 30-second explainer video from this brief: …

or run `/peak-media:plate-factory`. Claude takes it through ten stages, each ending with a
`GATE n …` line:

| # | Stage | You |
|---|---|---|
| 0 | Brief: runtime, audience, beats, brand pack | approve |
| 1 | Script, sized to the runtime and cold-read by a fresh agent | approve |
| 2 | Spine: narration synthesized, beats timed with silent gaps between them | |
| 3 | Plate list: one plate per beat, timed from the spine | approve |
| 4 | Storyboard: one still per plate, before any animation | approve |
| 5–6 | Plates built and rendered one at a time, self-reviewed, then checked by a separate reviewer | |
| 7 | Composite onto the spine; every cut must land in a silent gap | |
| 8 | Music, then SFX, mixed under the voice | listen and approve |
| 9 | Export `out/final.mp4` with the brand outro, spec-checked | |

### 2. Beat grid (no key, no voice)

Without a key (or when you ask for no narration), the spine is a beat grid: each beat's on-screen
text and a duration weighted by its words. The video is captions and motion on a silent track, plus
whatever music you add. Nothing goes over the network.

> Make a 20-second silent motion video from this brief, no narration.

### 3. Live capture of a web page

`video-capture` plays a real page in Chromium from a storyboard (clicks, typing, scrolling, slide
changes) and records it, with captions by default:

> Make a captioned demo of the to-do app in ./app: add two items and filter to the open ones.

It works on its own (a captioned demo, a silent screen recording, or a narrated deck timed to a
spine) or as the `live` plates inside a plate-factory video. It never synthesizes speech itself.
No key is needed for captions.

### 4. A video of a web page, for a destination: `web2video`

Point it at a page or a local folder and say where the video is going:

> Make a 20-second captioned demo of the sign-up flow at http://localhost:5173 for our website.
>
> Turn the deck in `./deck` into a narrated video I can put on YouTube.
>
> Record a silent tour of our dashboard. It needs a login.

Claude explores the page, writes `script.md` and a storyboard, and asks **once** before recording,
showing the script, the beats, the mode, the preset and the output path. It then records, checks
the result (format, length, one still per beat, anything private on screen) and hands you the file
at `web2video/<slug>/out/<slug>.mp4`. It never uploads, posts or sends the file.

| Preset | Size | Pick it for |
|---|---|---|
| `web` (default) | 1280×720 @ 30 fps, small | websites, docs, chat, email |
| `youtube` | 1920×1080 @ 30 fps | YouTube and other video platforms |
| `hifi` | 1920×1080 @ 60 fps, high quality | archive and editing |

**Pages behind a login:** Claude opens a browser window with `capture signin`; you sign in
yourself and close the tab. The session is saved outside the project (`~/.cache/peak-media/auth/`)
and every take starts signed in. Claude never types a password and offers to delete the session
file when it hands over the video.

Narrated mode needs the narration key; captions and silent mode don't.

## The skills

| Skill | What it does |
|---|---|
| `plate-factory` | The orchestrator: brief → `out/final.mp4` through gates 0–9 |
| `video-spine` | Brief → `script.md` → narration (`spine/manifest.json`) or a beat grid (`spine/beatgrid.json`); voice samples |
| `video-plates` | Motion and slide plates: storyboard stills, render each plate alone, lint and contact sheets, rebrand |
| `video-capture` | Live page capture from a `beat()` storyboard: cursor, captions, presets, sign-in; take checks |
| `video-assemble` | Composite, cut check, music and SFX remux, brand outro, final export |
| `web2video` | A page or folder → an MP4 for a named destination: one approval, sign-in, presets, checks, no upload |

Each skill also works on its own, e.g. *"re-render plate p2 with the new copy"* or *"add this
track under review.mp4"*.

## The house voice

The default is Gemini **Rasalgethi** with the style *"No-nonsense tech content creator. Plain,
measured delivery: honest facts and conclusions only, no hype, no sales tone. Paced for learning."*
It reads at about 125–130 words a minute, so scripts are sized at that rate. Mood tags in the script
such as `<Warm>` or `<Matter-of-fact>` are performed, not read aloud.

Pick another voice by asking (Claude can play the same line in a few voices side by side), or with
`--voice` / `--style` on the spine. Clips are cached, so re-running an unchanged script costs
nothing.

## Brand packs

Every colour, font, logo and outro comes from a **brand pack** folder:

```
my-pack/
  brand.json        # name, and paths to everything below
  tokens.css        # --color-bg --color-fg --color-accent --font-display --font-body --font-mono --ease-*
  fonts/<family>/   # woff2 files + their licence
  logo.svg
  outro/index.html  # the closing card, a HyperFrames composition
  music-rules.md    # what music suits the brand, its levels, and the pack's approved tracks
  music/            # optional: tracks you have the rights to, each listed in music-rules.md
                    #   and in brand.json "x-tracks" (title, file, credit)
  sfx/              # optional: sound effects (CC0 or your own), each with its source URL,
                    #   licence, duration and peak offset recorded
```

At the music stage, name a track or SFX file from the pack's `music/` or `sfx/` folder (or any folder you choose).

The plugin ships one neutral pack, `brand-packs/default` (Inter and JetBrains Mono, a placeholder
logo, and an outro card that reads **"Your Name"**). It is a starting point, not a brand. To use
your own, copy the default pack outside the plugin folder, edit it, and point the video at it: say
*"use the brand pack at ~/brand/my-pack"* at the brief stage, or set `"brand"` in `plates.json`, or
pass `--brand <pack>` to `render-plate` and `assemble`. A rebrand is a re-render with a different
`--brand`; nothing else changes. Check a pack with `node <plugin>/scripts/validate.mjs my-pack/brand.json`.

## When a step hangs

Every render and ffmpeg step runs under a watchdog: if it doesn't finish (default 30 min for a
render or an encode, 10 min for other HyperFrames commands, 2 min for a probe), it is stopped and
the run fails with one line naming the step. Raise or lower every limit at once with
`PEAK_MEDIA_STEP_TIMEOUT_S=<seconds>`. Stopping a run (Ctrl-C, or cancelling the command) also
stops the step it was running.

## Known limits

- After `hyperframes lint`/`check`, HyperFrames keeps a warm headless browser running in the
  background for about 5 minutes; it exits on its own.

## Music and sound effects

**The plugin ships no music and no sound effects.** At stage 8 Claude asks what to use: a track
and an SFX file you name (kept in your brand pack or any folder you choose), or none (narration
only). Claude never searches your disk for audio.
Whatever you supply is copied into the video's `audio/` folder with its credit in
`audio/CREDITS.md`. Use only audio you have the right to use. Music sits about 12 dB under the voice
and ducks while it speaks; you listen and approve the levels before export.

## A video project folder

```
my-video/
  brief.md  script.md
  spine/manifest.json  spine/narration.wav  spine/clips/   # or spine/beatgrid.json
  plates.json  plates/<id>/index.html
  renders/plates/<id>.mp4
  review/storyboard.jpg  review/contact-<id>.jpg  review/review.mp4  review/review-mix.mp4
  audio/        # only what you supply
  out/final.mp4
```

Keep `script.md`, `spine/` and `plates/` with the video: they reproduce it exactly.

## Third-party material

The vendored HyperFrames references (Apache-2.0), the bundled OFL fonts, and what `setup.mjs`
fetches (including GSAP, which is downloaded, never shipped) are listed in [VENDORED.md](VENDORED.md).
