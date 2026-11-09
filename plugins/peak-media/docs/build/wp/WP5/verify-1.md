verifier-id: verifier-wp5-r1-942abb53

# WP5 — Brand pack — Verify 1

Worktree `feature/peak-media-wp5` @ da50385 (base c5eb616). Builder id `builder-wp5-e69583e1` (differs). Evidence paths relative to `plugins/peak-media/docs/build/`.

| AC | verdict | evidence | notes |
|----|---------|----------|-------|
| AC-BRD-01 | PASS | evidence/WP5/AC-BRD-01.log | `validate.mjs brand-packs/default` exit 0 (brand-alt too). Each font family dir has an OFL.txt with the OFL 1.1 text. All 8 woff2 start with `wOF2`. All 8 woff2 files and 4 licences are byte-identical to npm `@fontsource/{inter,jetbrains-mono,playfair-display,space-mono}@5.3.0` (`files/*.woff2`, `LICENSE`). tokens.css @font-face points at local files only |
| AC-BRD-02 | PASS | evidence/WP5/AC-BRD-02-verifier-default.jpg, evidence/WP5/AC-BRD-02-verifier-alt.jpg, evidence/WP5/AC-BRD-02.log | I rendered p1-hook myself through the builder's route (`skeleton.mjs --fixture <p1-hook-only beatgrid fixture> --brand <pack>`). **Default:** dark slate bg, near-white sans (Inter) and a blue accent on "Same promise.". **Alt:** cream bg, dark-ink serif (Playfair Display) and a burnt-orange accent. Both have the same 3-line layout, the same staggered reveal (line 1 at 0.5 s, all three by 1.0 s, grey-to-full on line 3 at 1.0→1.5 s), and run 6.500 s. Scaffolded `index.html` is identical; only the `brand/` copy differs (tokens.css, brand.json, fonts/), plus HyperFrames' own `.hyperframes/` render state. Pixel (4,4) at 3 s is #0f1115 vs #f5f1e6, matching each `--color-bg`. framemd5 differs |
| AC-BRD-03 | PASS | evidence/WP5/AC-BRD-03.log | Checked independently of the test: `find` over all of `plugins/peak-media` (gitignored files included) by audio/video extension, and `file --mime-type` on every file for audio/* and video/*. Both found nothing. No tracked media anywhere in the repo at HEAD. Neither brand.json has `outro.audio` or `music.credits` |
| WP2 F-9 re-check (AC-SKL-06 w/ default pack) | PASS | evidence/WP5/WP2-recheck-SKL-06.log | sandbox-exec blocks outbound traffic (probe exit 7). F0 `p1.mp4` gives the same video framemd5 online and offline. The scaffolded compositions (index.html, brand tokens/outro/svg/json) contain no http(s) URL, @import or CDN reference. The builder's eval also passes its no-fonts control, so the woff2 files are really used |

Other checks:
- `node --test plugins/peak-media/evals`: 26/26 pass, 0 skipped (evidence/WP5/verifier-node-test.log).
- `ac-run.mjs --wp WP5`: BRD-01 and BRD-03 pass; BRD-02 is `still`, so it has no run (evidence/WP5/verifier-ac-run-WP5.log). `--trace`: 77 ACs, 12 briefs, 0 problems (evidence/WP5/verifier-ac-run-trace.log).
- D17: `grep -ri peakflames` over brand-packs/ and evals/fixtures/brand-alt is empty. Also no archer/schavey/todd. The default pack's name is "Default (neutral)" and the outro text is the placeholder "Your Name".
- Outro (evidence/WP5/outro-default.jpg): a plain neutral outro. A grey rounded-square placeholder logo with a blue dot, and "Your Name" in white sans on the slate bg. It fades in by about 1 s, holds, and is blank by 2.97 s. No brand marks.
- Scope: `git diff --stat c5eb616..da50385` adds 32 files, and no existing file is modified. Outside the owned folders are evidence/WP5/*, wp/WP5/handoff.md and `evals/brand/brand.test.mjs`. No MP4 or WAV is committed. No schema or contract changes.

## Findings

- **blocker:** none.
- **should-fix:** none.
- **nit N-1 (scope):** `plugins/peak-media/evals/brand/brand.test.mjs` (new file) is outside the brief's Owns list (`brand-packs/default/**`, `evals/fixtures/brand-alt/`). DEC-18 puts script-AC evals in `evals/`, so it is reasonable, but the Lead should ratify it or add `evals/brand/` to the brief.
- **nit N-2:** `evals/brand/brand.test.mjs:126` rewrites the tracked `evidence/WP5/AC-BRD-02-{default,alt}.json` on every `node --test` run. The random `$TMPDIR/pm-brd02-*-XXXXXX` path changes, which leaves the tree dirty after any eval run. I reverted the churn from my run. Strip the tmp dir name or write to a gitignored path.
- **nit N-3:** the AC-BRD-02 plate shows only `--font-display`, `--color-bg/fg/accent`, so the `--font-mono` change (JetBrains Mono → Space Mono) is not covered visually. It is covered by the token diff in the test only. Acceptable for the AC as written.
- **nit N-4:** `brand-packs/default/outro/index.html:4` cites the internal decision ID "DEC-09" in a shipped user-facing file. Harmless, but the ID means nothing to pack authors.
