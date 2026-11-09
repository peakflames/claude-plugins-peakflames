builder-id: builder-wp4-2674f17c

# WP4 handoff — Motion + slide plates

Branch `feature/peak-media-wp4` (from `feature/new-peak-media-plugin` @ c5eb616). Not pushed, not merged.

## Done

- **Vendor** (`vendor/hyperframes/`): `hyperframes`, `hyperframes-cli`, `slideshow`, `motion-doctrine`, `cut-the-curve`, `seam-craft` + `LICENSE` (Apache-2.0) + `CREDITS.md`, from heygen-com/hyperframes commit `327e20208c3f542841de670cce54754473f58d30`. Trimmed per DEC-07: presets, cloud/lambda/cloudrun and the `present` part dropped; 3 `npx hyperframes events` beacon lines removed; every `SKILL.md` renamed `SKILL.reference.md` (not registered). Every change is listed in `VENDORED.md` → "HyperFrames skills".
- **`skills/video-plates/`**: `SKILL.md`; `references/vendored-map.md` (numbered Read steps, `runtimes.md` before the first plate); `references/plate-authoring.md`; `templates/motion/` (kinetic type: accent bar, staggered lines, accent last line, slow push-in, first line on screen at frame 0); `templates/slide/` (deck layout: title + accent rule, bullets with accented `Label:`, or a table when lines hold `|` cells, logo + `n / N` footer, progress line); `scripts/render-plate.mjs`.
- **render-plate**: `<plates.json> (<id>... | --all)`, `--brand`, `--out`, `--sheet`, `--every`, `--lint` (HF `lint` + `check --strict --no-cache`), `--storyboard` (one HF snapshot per plate → `review/storyboard.jpg`), `--scaffold-only`, `--rescaffold`, `--quality`, `--json`. It keeps a hand-authored `index.html` and refreshes `brand/` and `vendor/gsap.min.js` on every run, so a rebrand is a re-render. It renders each plate alone, then asserts duration ±1 frame plus fps and size via `probeSpec`. It refuses a named `live` plate with a pointer to video-capture and skips `live` plates under `--all`. Templates take colours, fonts and easing only from tokens (a `--ease-out` `cubic-bezier()` token becomes a GSAP ease).
- **Evals**: `evals/video-plates/render-plate.test.mjs` (AC-BASE-08 ×3, AC-PLT-01 ×2, AC-PLT-04) and `evals/video-plates/vendor.test.mjs` (AC-VND-01 ×3, AC-VND-02 ×2). `node --test plugins/peak-media/evals`: 32/32 pass, including WP2's AC-SKL-01/05/06 with the new motion template.

## ac-run --wp WP4

| AC | method | run | register | evidence |
|---|---|---|---|---|
| AC-PLT-01 | script | pass | not-started | — |
| AC-PLT-02 | still | — | not-started | — |
| AC-PLT-03 | still | — | not-started | — |
| AC-PLT-04 | script | pass | not-started | — |
| AC-VND-01 | script | pass | not-started | — |
| AC-VND-02 | script | pass | not-started | — |
| AC-BASE-08 | script | pass | not-started | — |

`ac-run --trace`: PASS (77 ACs, 12 briefs, 0 problems).

## Evidence (`evidence/WP4/`)

- `AC-PLT-02-p1-hook.jpg`, `AC-PLT-02-p2-table.jpg`, `AC-PLT-02-p3-close.jpg`: F1, one sheet per plate, one frame every 0.5 s.
- `AC-PLT-03-s1-unit.jpg` … `AC-PLT-03-s5-peak.jpg`: F2, 5 slide plates. `F2-storyboard.jpg` is the `--storyboard` output.
- `F1-render-plate.json`, `F2-render-plate.json`: render-plate `--lint --sheet --json` results (every plate `lint: ok`, durations 6500/7500/6000 and 5×5000 ms = planned).
- `AC-BASE-08.log`, `builder-node-test.log`, `ac-run-WP4.log`.

All rendered with `--brand evals/fixtures/brand-min` (#111 background, #f5f5f5 text, #3b82f6 accent, system-ui, which resolves to HF's bundled sans), because WP5's default pack is not in this worktree.

**What the final sheets show** (I read each one): dark background, white text, blue accent. Nothing overflows or clips, and every frame is legible.
- p1-hook: three lines centred as a block. "Two tools." is on screen at frame 0, then "Same promise." and the blue "Who checks the work?" rise in by 1.5 s and hold to the end.
- p3-close: the same layout with two lines; the blue "peak-workflow wins on proof." is in by 1.0 s.
- p2-table: title "Head-to-head on four dimensions" (the plate's `intent`), an accent rule, and 4 rows × 3 columns with blue bold row heads. All rows are in by about 2 s. Only "fresh session, PASS/FAIL" wraps to 2 lines.
- F2 slides: title + rule, bullets with blue `OpenSpec:` / `peak-workflow:` labels (s1–s3) or plain bullets (s4–s5). The footer shows a blue logo dot and `n / 5`, and a progress line runs along the bottom. Only s3's long second bullet wraps to two lines. Every slide's body is complete by about 1.5 s.

**Fixes made from the sheets:**
1. The contact-sheet timecode label covered the slide title. I moved the deck content to a 14% top margin and switched render-plate's sheets to 3 columns × 760 px.
2. The table's first column was too wide and cells wrapped. It is now `max-content`.
3. Slide body text was small with a lot of empty space. The base size went from 5% to 6% of the height, and the fit loop still shrinks it when needed.
4. HF `lint` warned `nested_structure_needs_subcomposition` on WP2's `.clip` wrapper, which fails `check --strict`. The templates now have no clip wrapper.
5. `check` warned `first_frame_empty`. The first motion line, and the slide's logo/footer, are now on screen at frame 0.

## Open / for the Verifier and Lead

- AC-PLT-02 and AC-PLT-03 are stills, ready for the Verifier. They were rendered with the test pack, so the "brand fonts" check covers the token plumbing, not WP5's Inter/JetBrains Mono. AC-BRD-02 (WP5) re-renders with the real pack.
- **Contact-sheet label (lib/verify, WP2, read-only for me):** the 7-segment timecode box covers the top-left of each tile. A `--label-corner` option, or a label above the tile, would help any plate with top-left content.
- `--storyboard` captures each plate at 70% of its duration (after the entrances). WP8 may want a per-plate key time (an `x-keyMs` field) later. That is not a contract change.

## Deviations from the brief

- The upstream layout differs: `motion-doctrine`, `cut-the-curve` and `seam-craft` live in the repo's `.claude/skills/`, not `skills/`. The mapping is in VENDORED.md.
- Fetched as the GitHub archive of the commit (the worktree guard blocks running `git` outside the worktree), so it is the same tree.
- Extra vendor drops beyond DEC-07, all logged: `hyperframes/references/plugin-installation.md`, `skill-lifecycle.md`, `scripts/plugin-cli*.mjs` and `scripts/lib/` (the HyperFrames plugin launcher that npx-installs a CLI). One comment in `motion-doctrine/scripts/seam-gate.mjs` and one paragraph in `hyperframes-cli/references/upgrade-info-misc.md` were reworded. Without that, AC-SKL-07 would fail on their `hyperframes@…` package specs.
- The motion template keeps the WP2 placeholder name `LINES`, so `docs/build/tools/skeleton.mjs` (not mine) still fills it. Slide-only placeholders are `BODY`, `LOGO` and `COUNTER`.
- Added `--storyboard`, `--scaffold-only`, `--rescaffold`, `--every`, `--quality`, `--json`, `--out` beyond the brief's flags.
- No change to `lib/`, the schemas, `decisions.md`, `acceptance.md`, `plan.md` or `CHANGELOG.md`.

## Round 1 fixes (after verify-1)

Merged `feature/new-peak-media-plugin` (`--no-ff`, no conflicts). That brought in WP5's `brand-packs/default`, WP3a's `lib/tts` and the approved F1 texts. The verifier's report and evidence are committed unchanged (`*-verifier-*`, `AC-*.log`, `verifier-suite.log`).

- **F-1 (motion overflow)** — `templates/motion/index.html`:
  - Pass 1 keeps one row per line down to 7% of the height.
  - Pass 2 lets lines wrap (`overflow-wrap: anywhere`, block 84% wide) and shrinks to the 27 px floor (3.75% of the height).
  - `render-plate` now checks every chosen plate before scaffolding (`checkTextFits`, a conservative 0.6 em/char estimate). Text that can't fit at the floor fails with one line: `plate <id>: on-screen text (N chars) can't fit the frame at the 27 px minimum — shorten "text" or split the beat…`.
  - New evals: `AC-PLT-01: an over-long motion line wraps inside the frame` renders the verifier's ~115-char line and asserts the left and right 4% strips of the last frame are background. `AC-PLT-01: text that cannot fit at the 27 px floor fails fast…` checks the one-line error and that nothing is scaffolded.
  - Still of the wrapped line: `evidence/WP4/F-1-long-line-wrap.jpg`. The long line wraps to 4 rows of Inter inside the frame.
- **F-2 (27 px floor)** — the slide counter is now `0.0375 × H` (27 px at 720p), and the body fit loop stops at `ceil(0.0375 × H)`.
- **F-3** — the slide title is on screen at frame 0 and settles 1.5% of the height upward over 0.55 s. The rule grows from 0.1 s and the items enter from 0.4 s.
- **F-4** — plate-id and `--all` checks (and the text-fit check) now run before the brand pack is resolved.
- **F-5** — `--help` lists the quality values: `--quality <level>  HyperFrames render quality: draft, looks, standard, high or delivery (default: standard)`.
- **F-6** — `--all` prints `<id>: skipped (live plate — render it with video-capture)` for each live plate, and `--json` adds a `skipped[]` array. The eval asserts the line.
- **Evals**: they now render with `brand-packs/default` instead of `brand-min`. `plate-authoring.md` rule 8 documents the floor and the wrap.

### Default-pack sheets (replacing the AC-PLT-02/03 sheets; the verifier's are kept)

All rendered with `--brand brand-packs/default`: #0f1115 background, #f4f4f5 text, #4f8cff accent, Inter (bold display, regular body), JetBrains Mono counter, and the pack's square logo. Every plate passed `--lint` (lint + check --strict). Every duration equals plan: 6500, 7500 and 6000 ms, then 5 × 5000 ms.

- **p1-hook** (approved text): "Two tools." is on screen at frame 0. "One promise: spec before code." enters by 1.0 s and the blue "Who checks the work?" by 1.5 s. Each line fits on one row. The block is centred with the accent bar and well inside the frame.
- **p2-table**: the title "Head-to-head on four dimensions" is on screen at frame 0. Rows enter one by one from 0.5 s and all 4 are in by about 2 s.
  - Columns: bold blue row heads, then the OpenSpec value, then the Peak Workflow value.
  - "each requirement traced to its test + status" wraps cleanly to 2 lines, and "—" sits in the Human-checks row.
  - The text is above the 27 px floor and nothing clips.
- **p3-close**: two lines, the second ("Peak Workflow wins on an auditable record.") in blue. Both are on one row; the block is sized to that longer line, so the type is smaller than p1's but well above the floor. Both lines are in by 1.0 s.
- **s1–s5**:
  - The title is on screen at frame 0 and the bullets are in by about 1.0–1.5 s.
  - s1–s3 have blue `OpenSpec:` / `peak-workflow:` labels; s2's and s3's second bullets wrap cleanly to 2 lines. s4–s5 have plain bullets.
  - The logo and the mono `n / 5` counter (now 27 px) sit in the footer, and the progress line runs along the bottom. There is no overflow on any slide.
- `F2-storyboard.jpg` was regenerated with the default pack.

## Suggested CHANGELOG bullets (0.1.0)

- **Added — `video-plates` skill**: renders `motion` and `slide` plates from `plates.json`, each alone, to `renders/plates/<id>.mp4` at the planned duration ±1 frame.
- **Added — `render-plate` entry point**: scaffolds from templates, refreshes the brand pack and local GSAP, and adds `--lint` (HyperFrames lint + check --strict), `--sheet` contact sheets and `--storyboard` stills.
- **Added — motion and slide templates**: kinetic type and a deck layout (bullets or table rows) that take colours, fonts and easing only from brand tokens.
- **Added — vendored HyperFrames references**: six skills trimmed per DEC-07, loaded through explicit Read steps in `vendored-map.md`; changes logged in `VENDORED.md`.
