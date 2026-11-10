builder-id: builder-wp5-e69583e1

# WP5 — Brand pack — Builder handoff

Branch `feature/peak-media-wp5` (from `feature/new-peak-media-plugin` @ c5eb616). No contract changes.

## Done

- `brand-packs/default/`: `brand.json` (v1, validates), `tokens.css` (required props + `--ease-out/-in-out/-in`,
  plus `--color-muted/-surface`, `--weight-*`, `--space-1..8`, `--size-*`, `--radius`; four `@font-face` rules on
  local woff2 with `font-display: block`), `fonts/inter/` + `fonts/jetbrains-mono/` (latin 400 + 700 woff2,
  `OFL.txt` each), neutral `logo.svg` (grey rounded square, blue dot), `outro/index.html` (3 s logo + "Your Name"
  fade in, hold, fade out), `music-rules.md` (no music ships; narration −16 LUFS, music ducked; bring your own
  track + credits).
- `evals/fixtures/brand-alt/`: same files and token names; only colour values (cream `#f6f1e7` bg, ink `#1d1a16`,
  burnt-orange `#c2410c` accent) and fonts (Playfair Display + Space Mono) differ. logo, outro and music-rules are
  byte-identical copies.
- `evals/brand/brand.test.mjs`: AC-BRD-01, AC-BRD-02 (produces the sheets and asserts the "only `--brand` changed"
  part), AC-BRD-03, plus an untagged outro render test and the WP2 F-9 re-check.

## AC status (Builder view — not PASS until verified)

| AC | result | evidence |
|---|---|---|
| AC-BRD-01 | eval passes | `evidence/WP5/builder-node-test.log` |
| AC-BRD-02 | sheets produced; Builder reading below | `evidence/WP5/AC-BRD-02-default.jpg`, `AC-BRD-02-alt.jpg` (+ `.json` frame lists) |
| AC-BRD-03 | eval passes | `evidence/WP5/builder-node-test.log` |

`ac-run --wp WP5` (`evidence/WP5/ac-run-WP5.log`):

```
| AC | method | run | register | evidence |
|---|---|---|---|---|
| AC-BRD-01 | script | pass | not-started | — |
| AC-BRD-02 | still | — | not-started | — |
| AC-BRD-03 | script | pass | not-started | — |
```

`ac-run --trace`: `PASS  trace: 77 ACs, 12 briefs, 0 problem(s)`. `node --test plugins/peak-media/evals`: 26/26 pass.

### AC-BRD-02 reading

F1 plate `p1-hook` (copied verbatim from `docs/build/fixtures/F1/plates.json` into a temp fixture with a one-beat
beat grid), rendered by `docs/build/tools/skeleton.mjs --brand <pack>`, 6.5 s, sheets every 0.5 s.

- **default**: near-black slate background, white Inter Bold sans; line 2 "Same promise." in blue accent.
- **alt**: cream background, dark ink Playfair Display Bold serif (high-contrast strokes, ball terminals); line 2 in
  burnt orange.
- Same layout, line breaks, timing and staggered rise (line 1 at 0.5 s, all three by 1.5 s, hold to 6.47 s) in both.
  The eval asserts the scaffolded `plates/p1-hook/index.html` is byte-identical between the runs, durations are equal,
  only `--color-*`/`--font-*` token values differ, and the frame-3 s corner pixel equals each pack's `--color-bg`.

### WP2 F-9 re-check (AC-SKL-06 with the default pack)

Passes. Under `sandbox-exec` (outbound network denied, loopback allowed; probe fetch confirmed blocked), F0 renders
with `--brand brand-packs/default`; its framemd5 (90 frames) equals the online render. Control: the same pack with
`fonts/` deleted renders differently, so the woff2 files are really used. Evidence: `evidence/WP5/recheck-SKL-06-default.json`.

## Notes for other WPs

- **Outro render layout (WP6):** `outro/index.html` uses the plate scaffold layout — copy it to `<dir>/index.html`,
  the pack to `<dir>/brand/`, GSAP to `<dir>/vendor/gsap.min.js` (same as `skeleton.scaffoldPlate`). It renders to
  3.0 s; sheet in `evidence/WP5/outro-default.jpg`. It is fixed at 1280×720/30 fps and the name text is a literal
  "Your Name" (no placeholder substitution).
- **AC-BRD-03 scan** uses `git ls-files --cached --others --exclude-standard` over the plugin (so gitignored renders
  don't count) and checks extensions plus WAV/MP3/Ogg/FLAC/AIFF/M4A/MIDI headers. Any WP that commits an audio
  fixture (e.g. a TTS WAV) will fail it — generate such fixtures at test time instead.
- **Path in F0/F1 plates.json** (`../../../../brand-packs/default`) resolves to the plugin root's
  `brand-packs/default`, so those fixtures now find the pack without `--brand`.

## Font licence / source details (for WP9 → VENDORED.md)

Fetched with `npm pack` into a temp dir (not runtime deps); files copied unmodified; `OFL.txt` = the package's `LICENSE`.

| Family | Package | Version | tgz sha256 | Files copied | Licence |
|---|---|---|---|---|---|
| Inter | `@fontsource/inter` | 5.3.0 | `02034af8…8fd6` | `files/inter-latin-{400,700}-normal.woff2` → `brand-packs/default/fonts/inter/` | OFL 1.1 (The Inter Project Authors) |
| JetBrains Mono | `@fontsource/jetbrains-mono` | 5.3.0 | `1bbea47d…0b4a` | `files/jetbrains-mono-latin-{400,700}-normal.woff2` → `brand-packs/default/fonts/jetbrains-mono/` | OFL 1.1 (The JetBrains Mono Project Authors) |
| Playfair Display | `@fontsource/playfair-display` | 5.3.0 | `564e6195…c023` | `files/playfair-display-latin-{400,700}-normal.woff2` → `evals/fixtures/brand-alt/fonts/playfair-display/` | OFL 1.1, Reserved Font Name "Playfair Display" (shipped unmodified) |
| Space Mono | `@fontsource/space-mono` | 5.3.0 | `e0cd78cb…19eb` | `files/space-mono-latin-{400,700}-normal.woff2` → `evals/fixtures/brand-alt/fonts/space-mono/` | OFL 1.1 (The Space Mono Project Authors) |

Full tgz sha256: inter `02034af8d41dcc67ac8eab88f642e129bb8a2e8922abf30229c32725f54d8fd6`, jetbrains-mono
`1bbea47d1387406da5b6ccc4184cc61eae6851cc0db5c1d9bbd088ea9daa0b4a`, playfair-display
`564e61951ecc3e962793cd50395f718cda6350cb934f9000dbe0139c768dc023`, space-mono
`e0cd78cb7aa93e772905297d8d5ad2a3d9eea7a6a12f281a3940a28ec01c19eb`. Latin subset only.

## Suggested CHANGELOG bullet

- **Neutral default brand pack** — `brand-packs/default` with Inter and JetBrains Mono (OFL, bundled woff2), design
  tokens, a placeholder logo, a 3 s outro and music rules; no music ships, and a rebrand is a re-render with `--brand`.

## Open / deviations

- None blocking. Deviation: AC-BRD-02 renders through the WP2 skeleton + motion template (WP4's `render-plate` is not
  on this branch), as the brief allows.
- Fonts are latin subset only; non-Latin text falls back to system fonts.
