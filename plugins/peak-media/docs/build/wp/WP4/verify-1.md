verifier-id: verifier-wp4-r1-ea97e47c

# WP4 verify-1 — Motion + slide plates

Builder: `builder-wp4-2674f17c` (from handoff.md). Commit verified: `8227677` on `feature/peak-media-wp4` (base `c5eb616`). Every render, lint and sheet below was produced by the Verifier into `/tmp/vwp4/`, outside the repo, with `--brand evals/fixtures/brand-min`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PLT-01 | PASS | evidence/WP4/AC-PLT-01.log | `render-plate F1 --all` gave p1-hook 6.500 s/195 fr, p2-table 7.500 s/225 fr, p3-close 6.000 s/180 fr. `F2 --all` gave 5 × 5.000 s/150 fr. All 1280x720 at 30/1. Each ffprobe duration equals durationMs exactly (0 frames off). |
| AC-PLT-02 | PASS | evidence/WP4/AC-PLT-02-verifier-{p1-hook,p2-table,p3-close}.jpg | There is one sheet per plate, one frame every 0.5 s. Colours and fonts come only from tokens (see "Sheets"). No overflow or clipping on the fixtures. A synthetic over-long line does clip (F-1). |
| AC-PLT-03 | PASS | evidence/WP4/AC-PLT-03-verifier-s{1..5}-*.jpg | Five slide plates in deck layout: a title, an accent rule, bullets with accented `Label:`, a logo dot, `n / 5` and a progress line. Text is readable and nothing wraps badly. |
| AC-PLT-04 | PASS | evidence/WP4/AC-PLT-04.log | I ran the installed `hyperframes` 0.9.25 binary with the DEC-26 env on all 8 plates. `lint` reports 0 errors and 0 warnings. `check --strict --no-cache` reports 0 errors and 0 warnings, plus 1 info (`audio_none`). Every exit code is 0. |
| AC-VND-01 | PASS | evidence/WP4/AC-VND-01.log | My own script found 44 listed paths, 0 missing, 13 vendor folders and 0 orphans. Every vendored file is named in the map. |
| AC-VND-02 | PASS | evidence/WP4/AC-VND-02.log | Grepping the whole vendor tree for `hyperframes\s+events` gives 0 hits. `LICENSE` is Apache-2.0 and byte-identical to upstream. The upstream diff is in the same log. |
| AC-BASE-08 | PASS | evidence/WP4/AC-BASE-08.verifier.log | `--help` lists all 13 flags. `--version` prints 0.1.0, which equals plugin.json. Bad input (no args, missing file, bad JSON, schema errors, unknown flag/id/quality/every, ids + `--all`, missing brand) exits 1 or 2 with one actionable line and 0 stack-trace lines. A named `live` plate is refused with a pointer to `skills/video-capture/scripts/capture.mjs`. An all-live file is refused. All of these ran under `sandbox-exec (deny network*)`. The builder's own `AC-BASE-08.log` is left unchanged. |

Suite runs (evidence/WP4/verifier-suite.log): `node --test plugins/peak-media/evals` passes 32/32, including WP2's AC-SKL-01/02/05/06/07 against the new motion template. `ac-run --wp WP4` passes every script AC. `ac-run --trace` reports PASS for 77 ACs, 12 briefs and 0 problems.

## Sheets — what I saw

The sheets were made with my own ffmpeg command: every 15th frame, 640 px tiles, 4 columns and grey gutters so the frame edges show. All of them use the test pack's dark #111 background, #f5f5f5 text, #3b82f6 accent and a system sans.

- **p1-hook**: At frame 0, "Two tools." is visible alone. By 0.5 s the accent bar has grown. "Same promise." enters by 1.0 s and the blue "Who checks the work?" by 1.5 s. The three-line block then holds with a slight push-in. It is left-aligned with a bar, centred as a block, and well inside the frame.
- **p2-table**: Frame 0 shows only the logo dot. The title "Head-to-head on four dimensions" and the accent rule appear by 0.5 s. Then 4 rows × 3 columns with blue bold row heads enter one by one, and all are in by about 2 s. "fresh session, PASS/FAIL" wraps cleanly to 2 lines. The progress line runs along the bottom edge. Nothing clips.
- **p3-close**: Same layout as p1. Two lines, the second blue, both in by 1.0 s.
- **s1–s5**: Frame 0 shows only the logo dot and the counter. The title and rule are in by 0.5 s and the bullets by about 1.5 s. s1–s3 have blue `OpenSpec:` / `peak-workflow:` labels, and s4–s5 have plain bullets. Only s3's second bullet wraps, and it wraps cleanly. The counters read `1 / 5` … `5 / 5` in mono. There is no overflow on any slide.

Token-only check: I grepped the templates and all 8 generated `index.html` files for hex, `rgb()`, `hsl()` and named colours, then removed `var(--…)` matches. The only hit was a false positive (`white-space`). Every `font-family` is `var(--font-display|body|mono)`. `color-mix()` only mixes `--color-fg` and `--color-bg`. The WP5 default pack's `tokens.css` carries its `@font-face` with relative `fonts/…` URLs. render-plate copies the whole pack into `plates/<id>/brand/`, so real brand fonts will resolve. AC-BRD-02 (WP5) confirms that with the real pack.

## Other checks

- **Upstream diff** (codeload tarball @327e2020, evidence/WP4/AC-VND-02.log): every difference appears in `VENDORED.md`. That covers the 6 renames to `SKILL.reference.md`, the 3 beacon lines, the 3 plugin-install lines, the removed presets, plugin-cli and `scripts/lib`, skill-lifecycle, cloud/lambda/cloudrun and standalone-harness, plus the edits to look.md, conventions.md, preview-render.md, doctor-browser.md, upgrade-info-misc.md, the seam-gate.mjs comment and the CREDITS.md header (upstream text is kept unchanged below it). cut-the-curve and seam-craft differ only by the rename. There are no dangling references to removed files, and no `hyperframes@<ver>` or `@latest` strings.
- **DEC-07/08**: exactly the six skills, LICENSE and CREDITS.md are present. There are 0 path hits for media-use, figma, remotion-to-hyperframes, reverse-any-video, style-sampling and changelog-video. `find plugins/peak-media -name SKILL.md` returns only `skills/video-plates/SKILL.md`.
- **GSAP / determinism (DEC-09)**: both templates load only `<script src="vendor/gsap.min.js">`. There is no URL anywhere in them, and no `Math.random`, `Date.now` or `performance.now`. No `gsap.min.js` is committed; it is copied from the data dir at scaffold time. The timeline is registered at the end of `document.fonts.ready.then`, which is allowed by vendored `runtimes.md:7`.
- **Scope**: everything outside the owned folders is `evals/video-plates/*.test.mjs` (2 new files), plus WP4's own `evidence/` and `wp/WP4/`. Acceptable, because DEC-18 puts script-AC evals in `evals/` and the brief requires them. No skeleton or WP2 eval was touched. The `templates/motion/index.html` rewrite is inside `skills/video-plates/**`, which WP4 owns. It keeps the `{{LINES}}` placeholder that `docs/build/tools/skeleton.mjs:25` fills, and AC-SKL-01/05/06 still pass, so I judge it acceptable. No `lib/`, schema or decisions change. No MP4/WAV/MOV/MP3 is in the tree. `grep -ri peakflames` over skills/, vendor/ and evals/ is empty.

## Findings

**Blocker**: none.

**Should-fix**
- **F-1** `skills/video-plates/templates/motion/index.html:19` and `:51`. Lines are `white-space: nowrap` and the fit loop stops at 3.5 % of height. A line too long to fit at that size runs off the right edge. `render-plate --lint` (`render-plate.mjs:112-118`) still reports `lint+check ok`, so nothing catches it before the contact sheet. To reproduce, give p1-hook a ~110-character second line, then run `--lint --scaffold-only` followed by `--storyboard`. The result is evidence/WP4/AC-PLT-02-verifier-edge-overflow.jpg. Suggested fix: allow wrapping at the floor size, or make render-plate fail (or warn) when the fit hits the floor.
- **F-2** `skills/video-plates/templates/slide/index.html:32` and `:70`. The counter is `0.03 × H`, which is 21.6 px at 720p. The body fit floor is `0.032 × H`, which is 23 px. Both are below the rule the plugin itself adopts in `references/vendored-map.md` step 11, which requires at least 27 px at 720p for text the audience reads. The fixtures stay at the default 43 px body. Raise the floors to `0.0375 × H`, or say explicitly that the counter is chrome and exempt.

**Nit**
- **F-3** `skills/video-plates/templates/slide/index.html:78`. Every slide opens on an empty frame with only the logo and counter. The title fades in from 0.1 s and is fully in at about 0.65 s. In a deck cut back-to-back, that gives a short blank beat on each slide. Starting the title visible at frame 0 (as the motion template does at `motion/index.html:65`) would avoid it.
- **F-4** `skills/video-plates/scripts/render-plate.mjs:148-152`. With no ids and no `--all`, a plates.json whose brand path is missing reports "brand pack not found" before the usage error "name plate id(s)… or pass --all". The usage check could run first.
- **F-5** `skills/video-plates/scripts/render-plate.mjs:184`. `--help` shows `--quality <value>` with its default but not the allowed values. They only show up in the error message.
- **F-6** `skills/video-plates/scripts/render-plate.mjs:156`. `--all` skips `live` plates without saying so. A one-line "skipped p3-live (live → video-capture)" would make that visible.
