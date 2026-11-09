# WP9 runbook — AC-PKG-02 and AC-PKG-05 (manual)

Both need the user. Run PKG-02 first: PKG-05 uses the plugin it installs.

## Before either: push the branch (user approval)

PKG-02 installs from GitHub, so `feature/new-peak-media-plugin` (with WP9 merged) must be on
`origin`. The Lead asks the user before:

```bash
git push origin feature/new-peak-media-plugin
```

## AC-PKG-02 — install from the marketplace

**Then:** the 5 peak-media skills are listed, and `web2video` is not.

The user already has the `peakflames-plugins` marketplace added (tracking `main`, which has no
peak-media yet). Use an isolated Claude Code config so that install is left alone:

```bash
mkdir -p ~/tmp/pm-pkg02 && cd ~/tmp/pm-pkg02
CLAUDE_CONFIG_DIR=$HOME/tmp/pm-pkg02/.claude-config claude      # log in when asked
```

In that session:

1. `/plugin marketplace add peakflames/claude-plugins-peakflames#feature/new-peak-media-plugin`
   - Expect: marketplace `peakflames-plugins` added, listing `epic-workflow`, `peak-workflow`,
     `peak-media`.
2. `/plugin install peak-media@peakflames-plugins`, then quit and restart (same command as above).
3. `/plugin` → Installed → `peak-media` (version **0.1.0**). Look at its skills.
4. Type `/peak-media:` and look at the completions.

**Pass if** steps 3–4 show exactly these five: `plate-factory`, `video-spine`, `video-plates`,
`video-capture`, `video-assemble`. **Fail if** `web2video`, `video-record`, or anything from
`vendor/hyperframes/` (`hyperframes`, `hyperframes-cli`, `slideshow`, `motion-doctrine`,
`cut-the-curve`, `seam-craft`) appears as a skill: those are references, renamed
`SKILL.reference.md`.

5. (Not part of the AC, but cheap while you're here.) Ask: *"run the peak-media setup, then check
   it"*. Expect `setup.sh` to end `peak-media ready: deps …` and `setup.sh --check` to exit 0.
   Note which data folder it used (`$CLAUDE_PLUGIN_DATA` or `~/.cache/peak-media`).

Record the result in `evidence/WP9/AC-PKG-02-user.md`: the `/plugin` skill list (paste or a JPEG
screenshot), the date, and pass/fail. Afterwards `rm -rf ~/tmp/pm-pkg02` removes the isolated
config.

## AC-PKG-05 — cold start from SKILL.md only

**Then:** (a) a 20 s explainer and (b) a captioned live-capture demo both pass, using only the
SKILL.md files (and the references they point to); a reviewer agent checks D7–D10.

### Setup

- A scratch folder **outside the repo**, with no `CLAUDE.md`, so the session has no build context:
  ```bash
  mkdir -p ~/tmp/pm-pkg05 && cd ~/tmp/pm-pkg05
  CLAUDE_CONFIG_DIR=$HOME/tmp/pm-pkg02/.claude-config claude     # the PKG-02 install
  ```
  (Or, before the push: `claude --plugin-dir <repo>/plugins/peak-media` from the same folder.)
- `PEAK_MEDIA_OPENROUTER_API_KEY` set in that shell for (a). (b) needs no key.
- Start each prompt in a **new** session, in its own subfolder. Don't help: answer the gates as a
  user would, and don't point at files. If the session asks a question, answer it briefly.

### (a) Prompt — 20 s explainer

Run from `~/tmp/pm-pkg05/explainer`:

> Make a 20-second narrated explainer video for home gardeners: why to water plants in the
> morning. Three beats: the habit, the reason (less evaporation, leaves dry before night), and the
> tip (water the roots, early). Use the default brand pack. Keep everything in this folder.

Expect the plate-factory gates 0–9, each `GATE n …` line in order, ending with `out/final.mp4`.
Approve at gates 0, 1, 3, 4; at gate 8 answer "no music, no SFX" and approve the levels.

### (b) Prompt — captioned live-capture demo

Run from `~/tmp/pm-pkg05/demo`:

> Make a captioned 20-second demo of this todo app: https://demo.playwright.dev/todomvc/ — add
> three todos, complete one, then filter to the active ones. No narration. Save it as
> out/demo.mp4.

Expect `video-capture`: exploration of the page, a `storyboard.mjs`, a take at
`out/demo.mp4` + `out/demo.take.json`, and a contact sheet sampled inside the `say()` windows.

### What counts as "only SKILL.md"

After each run, check the session transcript
(`$CLAUDE_CONFIG_DIR/projects/<folder>/<session>.jsonl`) for any Read of a path under
`plugins/peak-media/docs/` or `docs/build/`. **Fail** if there is one. Reads of `skills/**`,
`vendor/hyperframes/**`, `lib/**` `--help` output and `brand-packs/**` are fine.

### Reviewer agent (one per run, fresh, no repo context)

Spawn a general-purpose agent with this prompt, filling in `<dir>`, `<mp4>` and the plugin path:

> You review a finished video for a release check. You have no other context. Plugin scripts are
> at `<plugin>/lib/verify/` and `<plugin>/skills/video-capture/scripts/`; run any with `--help`.
> The video is `<mp4>`; its project folder is `<dir>`. Check and report PASS/FAIL with evidence for:
>
> - **D7 — delivery spec.** Run `node <plugin>/lib/verify/probe-spec.mjs <mp4> --size 1280x720`.
>   Pass if it exits 0 (H.264 High, yuv420p, AAC 48 kHz, faststart, 1280×720). For (b) also
>   compare the duration with the take manifest's `videoMs` (`<dir>/out/demo.take.json`): within 1 s.
> - **D8 — sync.** (a) For each beat in `<dir>/spine/manifest.json`, make a still at the beat's
>   start + 1 s with `contact-sheet.mjs <mp4> --at …` and Read it: the picture must be that beat's
>   plate. (b) A captions-only take has no voice to sync to: pass if each caption's D10 still shows
>   the action it describes (done or under way). If the take manifest's `x-take.says` entries carry
>   `lateMs` (a narrated take), also report any over 200 ms.
> - **D9 — cuts in silence.** (a) Run `check-cuts.mjs <dir>/review/review.mp4 --cuts <each beat's
>   startMs after the first> --min-silence-ms 300`; pass on exit 0. (b) Run
>   `check-take.mjs <mp4>`: a captions-only take has a silent track, so it passes and says so;
>   report that line.
> - **D10 — captions** (b only). For each entry in the take manifest's `captions[]`, make a still
>   in the middle of its window and Read it: the caption text must be on screen and readable,
>   not covering the action. Then make one still between two captions: no caption.
>
> Also Read a 1 s contact sheet of the whole video and report anything broken: blank frames,
> clipped or overflowing text, half-loaded pages, private data on screen.
> End with one line per check: `D7 PASS|FAIL — …`, and so on.

### Record

`evidence/WP9/AC-PKG-05-(a|b).md` per run: the prompt, the session id, the gate lines (a), the
"only SKILL.md" check, the reviewer's verdict lines, and the final contact sheet as a JPEG. No
MP4/WAV in the repo. Afterwards `rm -rf ~/tmp/pm-pkg05`.
