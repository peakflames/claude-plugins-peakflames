verifier-id: verifier-wp4l-a9349ae4

# WP4 verify-3: plate layout follow-up

Builder: `builder-wp4l-eb96f9ca` (handoff-layout.md). Earlier verifiers: `verifier-wp4-r1-ea97e47c` and `verifier-wp4-r2-a91e50a1`. I verified HEAD `5151294` on `feature/peak-media-wp4-layout`; the layout commit is `5cf766c`. I made every render, measurement and sheet below myself, in a temp dir outside the repo, and deleted the dir afterwards.

- **F1:** a copy of `tmp/f1-e2e/{plates.json,spine/}` with `brand` set to this worktree's `brand-packs/default`.
- **F2:** `docs/build/fixtures/F2/plates.json --brand brand-packs/default`.

Sizes are computed styles at the end of the timeline. I measured them on the scaffolded `index.html` in HyperFrames' pinned chrome-headless-shell 152, through playwright-core. Pages were served from 127.0.0.1 and every remote request was aborted; none was attempted.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PLT-01 | PASS | evidence/WP4/AC-PLT-01.layout.log | My `ffprobe -count_frames` results, all 1280x720 at 30/1. Frame counts:<br>• p1-hook: 216 fr = 7.200 s (plan 7.173)<br>• p2-table: 367 fr = 12.233 s (plan 12.213)<br>• p3-close: 199 fr = 6.633 s (plan 6.613)<br>• s1–s5: 150 fr = 5.000 s each<br>Each is at most +27 ms off plan, which is under 1 frame (33.3 ms). |
| AC-PLT-02 | PASS | evidence/WP4/AC-PLT-02-verifier-layout-{p1-hook,p2-table,p3-close}.jpg, AC-PLT-02-verifier-layout-adversarial.jpg, AC-PLT-02.layout.log | There is one sheet per plate. Fonts are Inter 400/700, the background is rgb(15,17,21), and the accent is #4f8cff. No box lies outside the frame and nothing overflows. The smallest text is 27 px (the counter). See "Sheets". |
| AC-PLT-03 | PASS | evidence/WP4/AC-PLT-03-verifier-layout-s{1..5}-*.jpg, AC-PLT-03.layout.log | 5 slide plates in deck layout:<br>• the title is 61.2 px and on screen at 0 s;<br>• bullets are 47 px, labels are accented;<br>• the counter is 27 px JetBrains Mono.<br>Bullets reveal one by one, and the last settles at 2.93 s (59%). Nothing overflows. |
| AC-PLT-04 | PASS | evidence/WP4/AC-PLT-04.layout.log | `hyperframes lint` (via lib/hf.mjs) reports 0 errors and 0 warnings. `check --strict --no-cache` exits 0 with `ok:true`. Both hold for all 12 plates: 3 F1, 5 F2 and 4 adversarial. `render-plate --lint` printed `lint+check ok` for each one. |
| AC-BASE-08 | PASS | evidence/WP4/AC-BASE-08.layout.log | `render-plate.mjs` is unchanged in `f503621..5cf766c`. I re-checked it anyway, under `sandbox-exec (deny network*)`:<br>• `--help` lists 13 options;<br>• `--version` prints 0.1.0, matching plugin.json;<br>• 8 bad inputs each exit 1 or 2 with one actionable line and no stack trace. |

Suites (evidence/WP4/verifier-suite.layout.log):
- `node --test plugins/peak-media/evals`: 61 tests, 61 pass, 0 fail.
- `ac-run --wp WP4`: PLT-01, PLT-04, VND-01, VND-02 and BASE-08 pass. Exit 0.
- `ac-run --trace`: PASS, 77 ACs, 12 briefs, 0 problems.

Determinism:
- I rendered p1-hook twice; the second run used `--rescaffold`. `index.html` is byte-identical, and `framemd5` is identical for all 216 frames.
- In `templates/` I grepped for `Date.now`, `Math.random`, `new Date`, `performance.now`, timers, rAF, `http(s)://`, CDN and `@import`. There are 0 hits.

## The three user fixes

| # | Fix | Verdict | Measured |
|---|---|---|---|
| 1 | Motion plates are a centred, deliberate composition that uses most of the frame | **Achieved** | The block centre is at (0.500, 0.500) of the frame on every motion plate.<br>• p1-hook: block 301–979 × 115–605, which is 53% × 68% of the frame.<br>• p3-close: 117–1163 × 216–504, which is 82% × 40%.<br>The text is now a large centred stack with an accent bar, not a small top-left block (compare `layout-before-f1-contact-final.jpg`). See N-1 for the first second of the reveal. |
| 2 | Close text doesn't shrink; long lines wrap to balanced rows; display text ≥ ~56 px | **Achieved** | p3-close: "OpenSpec wins on speed." is 64.8 px on 1 row. "Peak Workflow wins on an auditable record." is 90 px on 2 balanced rows ("Peak Workflow wins / on an auditable record."). Before, both were about 51 px on one row each.<br>p1-hook: 69.8 / 69.8 / 97 px, with rows 1/2/2. |
| 3 | Table rows reveal progressively by ~60%; the table is larger and fills the content area; cells > 27 px | **Achieved** | p2-table rows settle at 0.93, 3.03, 5.13 and 7.23 s. That is 8%, 25%, 42% and 59% of 12.16 s, and the title is on screen at 0 s.<br>Cells are 40 px (before: about 31 px at full size). The table spans 100% of the content width. Its bottom is at 621.8 against the content bottom of 626.4, so it fills 99% of the height below the title. The rules are evenly spaced. |

## Sheets: what I saw

My sheets are the `render-plate --sheet` output, one frame every 0.5 s. I read each one with the Read tool.

- **p1-hook:** "Two tools." (white) is alone at 0 s. The accent bar grows by 0.5 s. "One promise: / spec before code." enters by 1.0 s, and the blue "Who checks / the work?" by 1.5 s, the largest type on the plate. After that the stack holds, centred, with a slow push-in. Nothing clips.
- **p2-table:**
  - The title "Head-to-head on four dimensions" and the logo are on screen at 0 s, and the rule grows by 0.5 s.
  - Rows arrive at about 1.0, 3.0, 5.0 and 7.0 s, in 3 columns with blue bold heads.
  - "same AI reviews" and "each requirement traced / to its test + status" wrap to 2 rows.
  - From about 7.5 s the table fills the area down to just above the footer. The progress line runs along the bottom.
  - The plate no longer sits static for 12 s, though the last 4.4 s hold the full table (by design).
- **p3-close:** "OpenSpec wins on speed." is on screen at 0 s, and the bar grows by 0.5 s. The blue 2-row "Peak Workflow wins / on an auditable record." is in by 1.0 s. The stack is centred and fills about 80% of the width. Nothing clips.
- **s1–s5:** the title is on screen at 0 s with the logo and an `n / 5` counter, and the rule grows by 0.5 s. Bullets arrive one at a time and are all in by about 3 s. s2's and s3's second bullets wrap cleanly to 2 rows. The lower third of each slide is empty, because bullets are capped at 6.5% of the height; this is by design and not a regression.

## Adversarial plates (AC-PLT-02-verifier-layout-adversarial.jpg, AC-PLT-02.layout.log)

Each plate has its own plates.json, runs 4000 ms with the default pack, and was fully rendered with `--lint --sheet`. All exit 0 with `lint+check ok`.

| plate | input | result |
|---|---|---|
| a1-longline | motion, opener + 120-char line | Centred. The emphasis is 79 px on 5 rows and the opener is 56.9 px. The block is 77% × 71%, inside the frame. |
| a2-tenshort | motion, 10 short lines | Centred. Lead lines are 37.4 px and the last is 52 px. The block is 20% × 74%. Lines reveal by 53% of the plate. Inside the frame. |
| a3-sixbullets | slide, title + 6 bullets (one long, one labelled) | Bullets are 36 px and fill 99% of the content height, ending at 619.7 against 626.4. They reveal from 21% to 59% of the plate. No overflow. |
| a4-tableurl | table, a cell holding a 95-char URL | The URL wraps inside its column (`overflow-wrap: anywhere`), so verify-2's N-1 is fixed for cells. Cells are 38 px. The body ends 1.2 px past the content box (N-2) and 20 px clear of the footer. "peak-workflow" breaks at its hyphen (N-3). |

## Scope

- `git diff --stat f503621..5cf766c` changes 13 files, all inside the allowed scope:
  - `skills/video-plates/templates/{motion,slide}/index.html`;
  - `skills/video-plates/references/plate-authoring.md`;
  - `evidence/WP4/layout-*.jpg` (10 files);
  - `wp/WP4/handoff-layout.md`.
- Nothing outside scope changed. `render-plate.mjs`, `lib/`, schemas, acceptance.md and decisions.md are unchanged. `evals/video-plates/**` is unchanged too (see S-1).
- The merge `5151294` brings in only integration-branch docs (WP6 evidence, voices.md).
- No MP4, WAV, MOV, MP3 or M4A file is tracked, and none is in the range. `grep -ri peakflames` over skills/ and evals/ gives 0 hits.

## Findings

**Blocker**: none.

**Should-fix**
- **S-1** `evals/video-plates/render-plate.test.mjs`: no test was added for the three user-requested behaviours, so the layout the user just approved can regress silently. Cheap checks, all measurable on the scaffolded `index.html` without a render:
  - F1 p3-close lines ≥ 56 px;
  - the motion block centre within ±2% of the frame centre;
  - the last table row settled at ≤ 0.62 × D;
  - table cells ≥ 27 px and the body bottom ≤ the content bottom.

**Nit**
- **N-1** `skills/video-plates/templates/motion/index.html:87-101`: the block is laid out at its final size, and later lines wait at opacity 0. So for the first 1.0–1.5 s the opener sits alone at the upper-left of the eventual block.
  - p1-hook: "Two tools." is at about x 340, y 115–185 of 1280×720 from 0 to 1.0 s.
  - p3-close: the opener is alone from 0 to 0.5 s.

  The settled composition is centred. But the opening second still reads a little like the "top-left" the user flagged, so it's worth showing them. Possible fixes: start the opener at the block's vertical centre, or tween the block's y as lines arrive.
- **N-2** `skills/video-plates/templates/slide/index.html:73` and `:101-106`: `over()` allows +1 px, and the row-padding spread starts from that state. In a4-tableurl the body ends at 627.6, while the content box ends at 626.4. It is invisible (20 px above the footer), but it slightly breaks the content-box contract.
- **N-3** `skills/video-plates/templates/slide/index.html:89`: with a very long token in the last column, the k=1 weighting gives that column 511 px and leaves column 2 at 224 px, so "peak-workflow" breaks at its hyphen onto 2 rows. It is readable but cosmetic. Capping one column's share, or trying k=0.5 first when a token exceeds the column, would avoid it.
- **N-4** `skills/video-plates/references/plate-authoring.md:46`: "lets words break and shrinks to that floor" now follows "≥ 7.8% of the height". As a result, "that floor" reads as 7.8% instead of the 27 px reading floor. It could say "to the 27 px floor".
