verifier-id: verifier-wp4-r2-a91e50a1

# WP4 verify-2 — Motion + slide plates

Builder: `builder-wp4-2674f17c`. Round 1: `verifier-wp4-r1-ea97e47c`. Commit verified: HEAD `047a6f2` on `feature/peak-media-wp4`; WP4's round-1 fix commit is `926eb61`. Every render, lint, sheet and measurement below was made by me into `/tmp/vwp4r2/`, outside the repo, with `--brand brand-packs/default` on `docs/build/fixtures/F1/plates.json` (the approved texts) and F2.

**Environment note:** partway through the run the host disk fell to about 1.0 GB free (100 % used). It was not caused by this run, which used 8 MB of temp files. From then on HyperFrames refused every render with "Low disk space". My F1/F2 renders below finished before that. The later full renders (adversarial plates and the render-dependent evals) are blocked by the environment, not by the code. See "Suite runs".

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PLT-01 | PASS | evidence/WP4/AC-PLT-01.r2.log | `render-plate F1 --all --lint --sheet` and `F2 --all …` with the default pack. My own ffprobe with `-count_frames` gives p1-hook 195 fr / 6.500 s, p2-table 225 / 7.500, p3-close 180 / 6.000, and s1–s5 150 / 5.000 each. All 1280x720, 30/1, 0 frames off plan. The eval of the same AC now fails only on the host disk (see Suite runs). |
| AC-PLT-02 | PASS | evidence/WP4/AC-PLT-02-verifier-r2-{p1-hook,p2-table,p3-close}.jpg, AC-PLT-02.r2.log | One sheet per plate. Inter and the pack colours are used, nothing overflows or clips, and text is ≥ 27 px (see "Sheets"). |
| AC-PLT-03 | PASS | evidence/WP4/AC-PLT-03-verifier-r2-s{1..5}-*.jpg, AC-PLT-03.r2.log | 5 slide plates in deck layout. The title is on screen at frame 0 and the counter is 27 px JetBrains Mono. Text is readable with no overflow. |
| AC-PLT-04 | PASS | evidence/WP4/AC-PLT-04.r2.log | Direct `hyperframes` 0.9.25 with the DEC-26 env on all 8 plates. `lint`: exit 0, 0 findings. `check --strict --no-cache`: exit 0, `ok:true`, 0 errors, 0 warnings, 1 info (`audio_none`), contrast all passed. `render-plate --lint` printed `lint+check ok` for all 8 as well. |
| AC-VND-01 | PASS | evidence/WP4/AC-VND-01.r2.log | My own script: 44 listed paths, 0 missing; 13 vendor folders, 0 orphans; 0 uncovered files. `vendor/`, `vendored-map.md` and `VENDORED.md` are unchanged since round 1 (`git diff 8227677 HEAD` is empty). |
| AC-VND-02 | PASS | evidence/WP4/AC-VND-02.r2.log | `hyperframes\s+events` and `hyperframes[^a-z]{1,3}events` both give 0 hits in vendor/. `LICENSE` is Apache-2.0. |
| AC-BASE-08 | PASS | evidence/WP4/AC-BASE-08.r2.log | All under `sandbox-exec (deny network*)`. `--help` lists all 13 flags, and `--quality` now names draft/looks/standard/high/delivery. `--version` = 0.1.0 = plugin.json. 10 bad inputs give exit 1/2 with one actionable line and 0 stack lines. With a missing brand, "name plate id(s)…" and "ids or --all, not both" come first (exit 2), and the brand error only once those pass. `--all` with a live plate prints `p3-live: skipped (live plate — render it with video-capture)` and `--json` has `skipped: ["p3-live"]`. A named live plate is refused with the video-capture pointer. |

## Sheets — what I saw

My own ffmpeg sheets: every 15th frame (0.5 s), 640 px tiles, 4 columns, grey gutters so the frame edges show. Sizes are computed styles measured in the pinned chrome-headless-shell on the scaffolded `index.html` (AC-PLT-02.r2.log). They show the fonts loaded: Inter 400/700 and JetBrains Mono 400. The background is rgb(15,17,21) = #0f1115, text #f4f4f5 and accent #4f8cff, which matches `brand-packs/default/tokens.css`. No text or logo box lies outside the frame or overflows sideways at timeline end.

- **p1-hook**: "Two tools." is on screen alone at frame 0, with no blank frame. The accent bar grows by 0.5 s. "One promise: spec before code." is in by 1.0 s and the blue "Who checks the work?" by 1.5 s. Each line is on one row of bold Inter at 69 px. The block is centred, well inside the frame, and holds with a slight push-in.
- **p2-table**: the title "Head-to-head on four dimensions" (61 px) and the logo are on screen at frame 0. Rows enter one by one from 0.5 s and are all in by about 2 s, in 3 columns with bold blue row heads. "each requirement traced to its test + status" wraps cleanly to 2 lines. Cells are 31.2 px (≥ 27). The progress line runs along the bottom. Nothing clips.
- **p3-close**: "OpenSpec wins on speed." is on screen at frame 0. The blue "Peak Workflow wins on an auditable record." is in by 1.0 s. Both are on one row at 51 px, inside the frame.
- **s1–s5**: each title is on screen at frame 0 with the logo and the `n / 5` counter (JetBrains Mono, 27 px). The rule grows by 0.5 s and the bullets are in by about 1.0–1.5 s. Bullets are 43.2 px Inter. s1–s3 have blue bold `OpenSpec:` / `peak-workflow:` labels. s2's and s3's second bullets wrap cleanly to 2 lines. s4–s5 have plain bullets. There is no overflow on any slide.

## F-1 adversarial plates (F-1-adversarial.r2.log, AC-PLT-02-verifier-r2-F1-adversarial.jpg)

These are my own plates, one plates.json each, with the default pack. Each ran `--lint --scaffold-only`; stills come from `--storyboard`, because full renders were disk-blocked.

| plate | input | result |
|---|---|---|
| a1-longline | motion, opener + 118-char line | wraps to 4 rows at 65 px, inside the frame; lint+check ok |
| a1b-hugeline | motion, one 499-char line | wraps to 10 rows at 44 px, inside the frame; lint+check ok (see N-2) |
| a2-manyshort | motion, 10 short lines | 43 px, all inside the frame; lint+check ok |
| a2b-toomany | motion, 16 short lines | fails before scaffolding: `plate a2b-toomany: on-screen text (134 chars) can't fit the frame at the 27 px minimum — shorten "text" or split the beat…` (exit 1) |
| a3-word25 | motion, 25-char unbroken word | one row at 83 px, inside the frame; lint+check ok |
| a3b-word25-slide | slide, 25- and 35-char unbroken words in bullets | fits at 43.2 px; lint+check ok |
| a4-8bullets | slide, title + 8 bullets | fails fast with one line naming `a4-8bullets` (exit 1) |
| a4b-6bullets | slide, title + 6 bullets (control) | body shrinks to 33.2 px (≥ 27) and fits |
| a3c-token60-slide | slide, bullet holding a ~55-char URL (extra probe) | **runs off the right edge** (bullet box x 102–1178, clipped in the still). `--lint` catches it: `plate a3c-token60-slide: hyperframes check --strict failed — text_box_overflow …` (one line). Without `--lint` it renders clipped (see N-1). |

## Status of round-1 findings

- **F-1** — **fixed** for the motion template (wrap pass to the 27 px floor, plus the `checkTextFits` pre-check). All 4 requested shapes either render inside the frame or fail with one line naming the plate. A related gap remains in the slide template (N-1).
- **F-2** — **fixed**. `.counter` is `0.0375 × H` = 27 px (measured), and the slide body floor is `ceil(0.0375 × H)` = 27. Measured body sizes are 43.2, 33.2 and 31.2 px, all ≥ 27.
- **F-3** — **fixed**. Every slide sheet shows the title at frame 0 (`slide/index.html:78`).
- **F-4** — **fixed**. The ids/`--all` checks (`render-plate.mjs:173-174`) run before the brand check (`:183-184`), confirmed with a plates.json whose brand path is missing.
- **F-5** — **fixed**. `--help` shows `--quality <level>  … draft, looks, standard, high or delivery (default: standard)`.
- **F-6** — **fixed**. `--all` prints `<id>: skipped (live plate — render it with video-capture)`, and `--json` carries `skipped[]`.

## New findings

**Blocker**: none.

**Should-fix**
- **N-1** `skills/video-plates/templates/slide/index.html:23` (`.bullet`) and `:28` (`.cell`) have no `overflow-wrap`. The fit loop at `:70` checks only `scrollHeight`, and `checkTextFits` (`scripts/render-plate.mjs:150-165`) assumes text can wrap. So a long unbroken token in a slide bullet or table cell (URL, path, ID longer than about 40 characters) runs off the right edge. It is caught only when `--lint` is passed. SKILL.md step 4 does pass `--lint`, which is why this isn't a blocker. To reproduce, use a slide bullet `see https://example.com/aaaa…` (55 chars) and run `render-plate <file> <id> --storyboard`. Suggested fix: `overflow-wrap: anywhere` on `.bullet`, `.cell` and `.title` (as the motion template does in `.wrap`), or add a `scrollWidth` test to the fit loop.

**Nit**
- **N-2** `scripts/render-plate.mjs:150-165`: the fit estimate accepts a single 499-char motion line, which renders as 10 rows of accent-coloured 44 px text. It sits inside the frame but is not one beat's reading. A per-plate character or row budget could warn here.
- **N-3** `lib/hf.mjs:54` (not a WP4-owned folder; for its owner): the render-error filter keeps only lines that match `/error|fail/`. HyperFrames' `✗  Low disk space … Free disk space before rendering.` is dropped, so `render-plate` reports `render failed for <dir>: no output`. Matching `✗` too, or falling back to the last non-empty stderr line, would make the message actionable.
- **N-4** `scripts/render-plate.mjs:184`: when `--brand <pack>` is given and doesn't exist, the message still says `fix "brand" in <plates.json> or pass --brand <pack>`. It could name the `--brand` value as the thing to fix.

## Suite runs (verifier-suite.r2.log)

- `node --test plugins/peak-media/evals`: every non-render test passes. That includes AC-PLT-04, AC-VND-01/02, AC-BASE-08 ×3, the 27 px fail-fast test and the hand-authored-index test. The 9 tests that render fail, each with `render failed … no output`: AC-PLT-01 ×2, AC-SKL-01/02/05/06/07, AC-BRD-02, the default outro and WP2 F-9 re-check. I ran the same HyperFrames render directly and it reports `Low disk space — 1.0 GB free`. This is **BLOCKED by the environment**, not a code failure. AC-PLT-01 is covered by my own renders above, made before the disk filled. Re-run the suite once there is free space.
- `ac-run --wp WP4`: PLT-04, VND-01, VND-02 and BASE-08 pass. PLT-01 fails for the same disk reason. `ac-run --trace`: PASS, 77 ACs, 12 briefs, 0 problems.

## Scope

- `git diff --stat d9cb5bb..926eb61` covers 100 files, but nearly all of it comes from merge `4e3660e` (WP3a/WP5 integration: `brand-packs/`, `lib/tts`, video-spine, the F1 fixture and acceptance/decisions edits). WP4's own commit, `git diff --stat 4e3660e 926eb61`, touches only:
  - `skills/video-plates/**` (render-plate.mjs, both templates, plate-authoring.md);
  - `evals/video-plates/render-plate.test.mjs` (allowed by DEC-18);
  - `evidence/WP4/` and `wp/WP4/handoff.md`.
- No `lib/`, schema or decisions change. The verifier's round-1 evidence is unchanged.
- No MP4/WAV/MOV/MP3 is tracked, and none is in the commit range. The builder's untracked MP4s sit under the git-ignored `plugins/peak-media/tmp/`.
- `grep -ri peakflames` over skills/, vendor/ and evals/ gives 0 hits.
