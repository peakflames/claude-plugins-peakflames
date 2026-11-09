# Vendored, bundled and fetched third-party material

Three kinds of third-party material reach a peak-media user:

- **Vendored** — copied into `vendor/` with local changes, all listed below.
- **Bundled** — shipped in the plugin unmodified.
- **Fetched** — downloaded by `scripts/setup.sh` into the plugin data dir
  (`${CLAUDE_PLUGIN_DATA:-~/.cache/peak-media}`); never shipped in the plugin.

The plugin ships no music, sound effects or other audio.

| Material | Kind | Where | Licence |
|---|---|---|---|
| HyperFrames skills (6, as references) | Vendored | `vendor/hyperframes/` | Apache-2.0 |
| Inter, JetBrains Mono | Bundled | `brand-packs/default/fonts/` | OFL 1.1 |
| Playfair Display, Space Mono | Bundled (eval fixture only) | `evals/fixtures/brand-alt/fonts/` | OFL 1.1 |
| GSAP | Fetched | data dir, then copied into each video project | GSAP Standard "no charge" License |
| HyperFrames CLI, Playwright, ajv | Fetched | data dir | Apache-2.0, Apache-2.0, MIT |
| Render browser (chrome-headless-shell) | Fetched | HyperFrames' browser cache | Chromium licences |

## Vendored: HyperFrames skills

| | |
|---|---|
| Kind | Vendored |
| Destination | `vendor/hyperframes/` |
| Source | https://github.com/heygen-com/hyperframes |
| Commit | `327e20208c3f542841de670cce54754473f58d30` (DEC-07 names it `327e20208c3f`) |
| Date | 2026-11-08, fetched as the GitHub archive of that commit (`codeload.github.com/heygen-com/hyperframes/tar.gz/327e20208c3f`) |
| Licence | Apache-2.0 — upstream `LICENSE` copied unchanged to `vendor/hyperframes/LICENSE` |
| Credits | `vendor/hyperframes/CREDITS.md` = a peak-media header (source, commit, licence) + the upstream `CREDITS.md` unchanged |
| Role | Read-only references loaded through explicit Read steps in `skills/video-plates/references/vendored-map.md`. **Not registered skills.** |
| Local changes | Listed in full under "Local changes" below |

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

## Bundled: fonts

Each family was fetched with `npm pack` from its `@fontsource` package; the latin 400 and 700
woff2 files were copied unmodified, and `OFL.txt` is the package's `LICENSE` file.

| Family | Kind | Destination | Source | Version | Date | Package sha256 | Licence | Local changes |
|---|---|---|---|---|---|---|---|---|
| Inter | Bundled | `brand-packs/default/fonts/inter/` | npm `@fontsource/inter` | 5.3.0 | 2026-11-08 | `02034af8d41dcc67ac8eab88f642e129bb8a2e8922abf30229c32725f54d8fd6` | OFL 1.1 (The Inter Project Authors) | none |
| JetBrains Mono | Bundled | `brand-packs/default/fonts/jetbrains-mono/` | npm `@fontsource/jetbrains-mono` | 5.3.0 | 2026-11-08 | `1bbea47d1387406da5b6ccc4184cc61eae6851cc0db5c1d9bbd088ea9daa0b4a` | OFL 1.1 (The JetBrains Mono Project Authors) | none |
| Playfair Display | Bundled | `evals/fixtures/brand-alt/fonts/playfair-display/` | npm `@fontsource/playfair-display` | 5.3.0 | 2026-11-08 | `564e61951ecc3e962793cd50395f718cda6350cb934f9000dbe0139c768dc023` | OFL 1.1, Reserved Font Name "Playfair Display" (shipped unmodified) | none |
| Space Mono | Bundled | `evals/fixtures/brand-alt/fonts/space-mono/` | npm `@fontsource/space-mono` | 5.3.0 | 2026-11-08 | `e0cd78cb7aa93e772905297d8d5ad2a3d9eea7a6a12f281a3940a28ec01c19eb` | OFL 1.1 (The Space Mono Project Authors) | none |

Latin subset only: other scripts fall back to system fonts.

## Fetched by setup.sh (not shipped)

Versions are pinned in `lib/pins.json` (the only place they are set) and mirrored in
`package.json` / `package-lock.json`. `setup.sh` runs `npm ci --ignore-scripts` from that lockfile
into `<data dir>/deps/<lockhash>/`, then `hyperframes browser ensure`.

| Package | Kind | Source | Version | Licence | Where it ends up |
|---|---|---|---|---|---|
| GSAP | Fetched | npm `gsap` | `lib/pins.json` | GSAP Standard "no charge" License (https://gsap.com/standard-license), not OSI | Data dir. `render-plate` and `assemble` copy `gsap.min.js` into each plate's (and the outro's) `vendor/` folder inside the user's video project. Not redistributed by the plugin (DEC-09) |
| HyperFrames CLI | Fetched | npm `hyperframes` | `lib/pins.json` | Apache-2.0 | Data dir; run only through `lib/hf.mjs` with updates, telemetry and skill installs off (DEC-26) |
| Playwright | Fetched | npm `playwright` | `lib/pins.json` | Apache-2.0 | Data dir; used by `video-capture` |
| ajv | Fetched | npm `ajv` | `lib/pins.json` | MIT | Data dir; schema validation |
| Render browser | Fetched | chrome-headless-shell, downloaded by `hyperframes browser ensure` | chosen by the pinned HyperFrames CLI | Chromium (BSD-3-Clause and third-party licences) | HyperFrames' browser cache; skipped when `HYPERFRAMES_BROWSER_PATH` is set |
