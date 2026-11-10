# WP10 — manual steps (next-version backlog)

Every step done by hand in WP10, each a candidate for the plugin to do itself next version
(AC-REAL-02). Started in WP10a (pack build); F4 steps are added when the video is made.

| # | Step done by hand (WP10a) | Backlog item |
|---|---|---|
| M1 | Copied the default pack's layout and wrote `brand.json`, `tokens.css`, `music-rules.md` for the Peakflames pack from scratch | `new-pack` command: scaffold a pack from `brand-packs/default` with the name, colours and fonts filled in |
| M2 | Mapped the design system's tokens (`landing-page-minimal/design-system/tokens/*.css`) to the pack's `--color-*`, `--font-*`, `--ease-*` names by reading them | Import tokens from a design-system CSS folder (map `bg-canvas`, `text-heading`, `accent`, `font-*`, `ease-*`) |
| M3 | Picked the font weights (Archivo 400/700/800, IBM Plex Sans 400/600, JetBrains Mono 400/700, latin only), fetched them with `npm pack @fontsource/<family>@5.3.0`, copied the woff2 files and `LICENSE` → `OFL.txt` | Vendor fonts by family and weights into a pack (`@fontsource`, licence copied, sha256 recorded) |
| M4 | Rewrote `#s6` from the teaser as a standalone 1280×720 composition: times shifted by −22 s, the 1920×1080 layout scaled by 2/3 in a wrapper, logo path → `brand/logo.svg` | Extract a scene from an existing HyperFrames composition as a pack outro (time shift, rescale, asset rebasing) |
| M5 | Rendered the original teaser and cut 22–26 s to compare with the pack outro; built the labelled side-by-side sheet with a throw-away script (ffmpeg has no `drawtext` here, so labels came from an HTML page shot in Chromium) | `contact-sheet --compare a.mp4 b.mp4 --labels …`: side-by-side labelled sheet, plus an SSIM figure |
| M6 | Copied `groove-sauce.mp3` into `music/`, wrote its credit in `music/CREDITS.md`, its `x-tracks` entry and the `music-rules.md` row with the approved levels | `add-track` command: copy a track into a pack and write the `x-tracks` entry, credit and rules row together |
| M7 | Decided the outro sting/fire crackle can't go in the pack: `fire()` in `peakflames-videos/tools/build_soundtrack.py` is code, not an audio file, so `sfx/manifest.json` is empty and `outro.audio` is unset | Render user-owned synth SFX (e.g. `fire()`) to `sfx/*.wav` with a manifest entry (source, licence, duration, peak offset), and use it as `outro.audio` |
| M8 | The music bed stops at the outro (assemble puts only `outro.audio`, or silence, under the outro), unlike the teaser where music fades under the fire | Let the music stem run on and fade out under the outro |
| M9 | SFX stems are placed by hand (DEC-40) | Each plate exports a cue list from its timeline labels; assembly builds the SFX stem from it (DEC-40 next version) |
| M10 | The pack is a plain folder; making it a private GitHub repo (`gh repo create --private`) was not done — it needs the user's go-ahead (DEC-16) | Ask, then create the private repo for the pack |

| # | Step done by hand (WP10b, F4 draft run) | Backlog item |
|---|---|---|
| M11 | Copied the source doc (`references/openspec-vs-peak-workflow.md`) into the project as `source.md` before the session started, so plate-factory could read the talking points | Accept a `--source <file>` (or a path in the prompt) at stage 0 and copy it into the project, recorded in `brief.md` |
| M12 | The session copied `groove-sauce.mp3` from the pack into `audio/` and wrote `audio/CREDITS.md` itself with shell commands | Gate 8 "use the pack's track <id>" copies the track and writes the credit from the pack's `x-tracks` entry in one step |
| M13 | The session read `music-rules.md` and passed `--music-lufs -28 --duck-db 6` to `assemble.mjs` by hand; music under the voice measured −30.5 LUFS against the −28 target | `assemble --music <pack track id>` reads the pack's levels itself, and reports or corrects the measured under-voice level against the target |
| M14 | The music credit must still be checked by hand against the exact YouTube Audio Library text before publishing (pack rule) | Store the verified credit string in the pack's `x-tracks` entry and print it with GATE 9 |
| M15 | The F4 brief's live-capture beats (OpenSpec docs page, GitHub TOR page), the delta-merge motion diagram and the terminal replay were not proposed; every plate is a typographic text stack. Getting them would have needed a prompt naming them | plate-factory proposes `capture` plates when the brief or source names public pages, and diagram/terminal-replay templates for "loop", "merge" and command beats |
| M16 | Placeholder TOR IDs (`TOR-NN-XXXXXXX`) are on screen; real IDs need the user to name a repo/file | Ask for an example repo at stage 0 when the brief references IDs or files, and use real values |

| # | Step done by hand (WP10b, F4 draft 2) | Backlog item |
|---|---|---|
| M17 | The user had to direct the visuals and type size at gate 3 (live captures of the OpenSpec README and a peak-workflow requirements page, an animated delta diagram, a terminal replay, a readable table slide, "big and centred" text); the skill's first plate list was text stacks again | plate-factory proposes visual treatments per beat (capture / diagram / terminal / table) and a big-centred layout by default, before gate 3 |
| M18 | The user had to send the storyboard back once at gate 4: the head-to-head slide was small and left-aligned, and the live-capture page text was small | Storyboard self-check for type size and centring (and capture zoom) before showing gate 4 |
| M19 | The session drew the designed storyboard stills itself (`review/storyboard/design/*.png` from a hand-written `index.html`), because the plate template only lays text out as a list | A storyboard renderer that draws diagram, terminal and table layouts, not only the text-list template |
| M20 | The session hand-wrote CSS/JS injection to restyle GitHub pages for the live captures (`live/p3-setup.js`, `live/p5-setup.js`: zoom, hide file tree, centre, highlight a line) | `capture` options for zoom, hide-chrome, centre-element and highlight-line on a page |
| M21 | The session wrote `live/hold-first-frames.sh` (ffmpeg) to replace the first 9–12 frames of each live take, which showed the unstyled page before the setup script ran | `capture` applies page setup before recording starts (or trims the pre-setup frames itself) |
| M22 | The terminal replay was typeset by hand in a plate (no template); its text was pulled by hand with `gh api` from `peakflames/summit` and from the local `peak-workflow/skills/wrapup-epic/SKILL.md` | A terminal-replay plate template that takes a transcript (command, output, colours, timing) |
| M23 | The real TOR ID was found by the session searching another repo (`peakflames/summit`) with `gh api`; the user had to approve swapping it in for the repo the user named | Stage 0 asks for the example repo/file that real IDs and pages come from |
| M24 | Gate 1 took two turns: the session under-counted the words its edits added, then needed a runtime decision (trims + raise target to 84 s) | Count words and estimate runtime for each proposed edit set before offering it |
