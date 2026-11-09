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

## Suggested CHANGELOG bullets (0.1.0)

- **Added — `video-plates` skill**: renders `motion` and `slide` plates from `plates.json`, each alone, to `renders/plates/<id>.mp4` at the planned duration ±1 frame.
- **Added — `render-plate` entry point**: scaffolds from templates, refreshes the brand pack and local GSAP, and adds `--lint` (HyperFrames lint + check --strict), `--sheet` contact sheets and `--storyboard` stills.
- **Added — motion and slide templates**: kinetic type and a deck layout (bullets or table rows) that take colours, fonts and easing only from brand tokens.
- **Added — vendored HyperFrames references**: six skills trimmed per DEC-07, loaded through explicit Read steps in `vendored-map.md`; changes logged in `VENDORED.md`.
