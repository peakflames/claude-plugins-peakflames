# Vendored and fetched third-party material

*WP4 wrote the HyperFrames section; WP9 finalises this file (GSAP, fonts, other sections).*

## HyperFrames skills

| | |
|---|---|
| Destination | `vendor/hyperframes/` |
| Source | https://github.com/heygen-com/hyperframes |
| Commit | `327e20208c3f542841de670cce54754473f58d30` (DEC-07 names it `327e20208c3f`) |
| Fetched | 2026-11-08, as the GitHub archive of that commit (`codeload.github.com/heygen-com/hyperframes/tar.gz/327e20208c3f`) |
| Licence | Apache-2.0 — upstream `LICENSE` copied unchanged to `vendor/hyperframes/LICENSE` |
| Credits | `vendor/hyperframes/CREDITS.md` = a peak-media header (source, commit, licence) + the upstream `CREDITS.md` unchanged |
| Role | Read-only references loaded through explicit Read steps in `skills/video-plates/references/vendored-map.md`. **Not registered skills.** |

### Folder mapping

The commit's layout differs from DEC-07's flat list: three of the six skills are repo-internal.

| `vendor/hyperframes/…` | Upstream path |
|---|---|
| `hyperframes/` | `skills/hyperframes/` |
| `hyperframes-cli/` | `skills/hyperframes-cli/` |
| `slideshow/` | `skills/slideshow/` |
| `motion-doctrine/` | `.claude/skills/motion-doctrine/` (identical copy in `.agents/skills/`) |
| `cut-the-curve/` | `.claude/skills/cut-the-curve/` (identical copy in `.agents/skills/`) |
| `seam-craft/` | `.claude/skills/seam-craft/` (identical copy in `.agents/skills/`) |

### Local changes

Every change was made by a script that fails if a target text is missing, so each line below is exact.

**All six folders**
- Every `SKILL.md` renamed `SKILL.reference.md`, so Claude Code does not register them as skills.
- The `**Usage beacon:** run \`npx hyperframes events --skill=…\`` telemetry line removed from `hyperframes`, `hyperframes-cli` and `slideshow` (the only `hyperframes events` hits; 0 remain — AC-VND-02).
- The `**Plugin installs:** …plugin-installation.md` line in those three replaced by a peak-media note: these are references, run the CLI only through `lib/hf.mjs` / `render-plate`, never `npx`.

**hyperframes** (presets dropped)
- Removed `assets/frame-presets/` (all frame presets, incl. their fonts and OFL texts).
- `references/look.md`: the `## Presets` section replaced by one line saying presets are not vendored and the look comes from the brand pack's `tokens.css`.
- Removed `references/plugin-installation.md` and `scripts/plugin-cli.mjs` + `scripts/plugin-cli.test.mjs` (the HyperFrames-plugin launcher downloads a CLI with npx; peak-media pins its own) and `scripts/lib/` (`main-module.mjs` + test, used only by that launcher).
- Removed `references/skill-lifecycle.md` (installing/updating HyperFrames skills and bumping a project's CLI pin; not applicable). `SKILL.reference.md`: its last pointer "Skills and the pinned CLI: `references/skill-lifecycle.md`." → "The CLI version is pinned by peak-media (`lib/pins.json`)."

**hyperframes-cli** (lambda/cloudrun/cloud refs dropped)
- Removed `references/cloud.md`, `references/lambda.md`, `references/cloudrun.md`.
- `SKILL.reference.md`: description "render locally or in the cloud" → "render locally"; `cloud`, `lambda`, `cloudrun` dropped from the "Show and ship" row; the "paid plan: `cloud render …`" clause dropped from loop step 5; the "Hosted, no local Chrome or FFmpeg" and "Your own AWS or GCP" rows dropped from "Render where"; the `auth`/`cloud` and `lambda`/`cloudrun` rows dropped from "References".
- `references/conventions.md`: the bullet about the hosted-cloud 200 MB upload limit removed.
- `references/preview-render.md`: the "Use cloud rendering when…" paragraph replaced by "peak-media renders locally only (hosted, Lambda and Cloud Run rendering are not vendored)."
- `references/doctor-browser.md`: "`render --docker` / cloud rendering where available" → "`render --docker` where available"; "handed to `--docker`, cloud, or the user" → "handed to `--docker` or the user".
- `references/upgrade-info-misc.md`: the `--project [dir]` paragraph (rewrites a project's pinned CLI to npm-latest) replaced by "peak-media pins the CLI in `lib/pins.json`; don't run `upgrade --project` on a peak-media video project." This also removes the versioned package specs AC-SKL-07 forbids outside `lib/pins.json`.

**slideshow** (`present` part dropped)
- Removed `references/standalone-harness.md` (workarounds for decks opened without `present`).
- `SKILL.reference.md`: the `## Present and hand off` section replaced by `## Hand off`, keeping the "never render a multi-scene deck to MP4" rule (with a note that a peak-media slide plate is a one-scene composition, so it does not apply) and the `check --json` rule; serving with `present`, the player/slideshow components and screen-sharing bullets dropped, with a one-line note saying so. The JSON-island section is unchanged.

**motion-doctrine**
- `scripts/seam-gate.mjs`: one code comment "skill forbids \`npx hyperframes@latest\` for it" → "skill forbids running the latest published CLI (npx) for it" (AC-SKL-07 forbids versioned package specs outside `lib/pins.json`). No code changed.

**cut-the-curve**, **seam-craft**: no changes beyond the rename.

### Not vendored (DEC-08)

`media-use`, `figma`, `remotion-to-hyperframes`, `reverse-any-video`, `style-sampling`, `hyperframes-registry`, and the repo-internal `changelog-video`, `captions-overlay`, `oversized-cursor`.
