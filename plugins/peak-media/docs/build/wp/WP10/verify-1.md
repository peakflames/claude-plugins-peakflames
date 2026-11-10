verifier-id: verifier-wp10a-r1-7e3c91d4

# WP10a verify-1 — Peakflames pack, AC-REAL-03, gate 8 audio offer

Scope: `git diff 39ef962..df0aec9` on `feature/peak-media-wp10` (HEAD df0aec9). Builder: `builder-wp10a-4cf5151f`.
macOS, no Docker. Lean run, as directed: only the evals this change touches (plate-factory, brand, real,
packaging), not the full suite.

**Verdict: PASS.** No blockers, no majors.

## Acceptance criteria

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-REAL-01 | not this WP's part | — | F4 belongs to WP10b (needs the user) |
| AC-REAL-02 | not this WP's part | — | `manual-steps.md` is started (M1–M10, each with a backlog item). It is checked when F4 is done |
| AC-REAL-03 (script) | PASS | evidence/WP10/AC-REAL-03.verifier.log, AC-REAL-03.verifier.json | Ran `node --test evals/real` myself: 1/1 pass. Validator reports `ok … brand.json (brand v1)`. Outro is 4000 ms. SSIM against `#s6` (teaser 22–26 s, scaled to 1280×720) over 0.8–4 s, 96 frames: mean 0.9976, min 0.9972. My numbers match the Builder's |
| AC-REAL-03 (still) | PASS | evidence/WP10/AC-REAL-03-hstack.verifier.jpg (my run); AC-REAL-03-outro-vs-s6.jpg (Builder's sheet, read) | Details under "Still" below |

### Still (what I saw)

The teaser's `#s6` is `data-start="22" data-duration="4"`, with a 0.8 s opacity fade-in at 22.0 (`index.html` lines 201 and 297).

I read 10 tiles from my own hstack (left: original, right: pack outro).

- **0.0 and 0.4 s:** the original shows the `#s5` end card fading out: logo, "peak-workflow", marketplace command, credit lines. The pack side is the dark pack background, still fading in. This is the known cross-fade difference, and it is correct because a standalone outro has no `#s5`.
- **0.8–3.4 s:** both sides show the same frames: the flame logo centred on a near-black night gradient, an orange halo, and embers rising above the logo in the same positions and amounts at each time.
- **3.9 s:** both have faded nearly to black with the logo barely visible, identical on both sides.

The labelled Builder sheet (`-outro-vs-s6.jpg`) shows the same thing row against row.

**Conclusion:** the pack outro visibly reproduces `#s6`.

## Other checks

| Check | Result | Evidence |
|---|---|---|
| Pack `brand.json` | Valid v1 (plugin validator). `x-tracks` has 1 entry: Groove Sauce (title, file, credit, use, levels −28 LUFS / 6 dB). `x-sfx` → `sfx/manifest.json` (`files: []`, with a note) | gate8-baseline.verifier.log |
| Fonts | Archivo, IBM Plex Sans and JetBrains Mono are local woff2 files. Each family has an `OFL.txt` with the SIL OFL text. `tokens.css` uses only relative `url('fonts/…')`, and no `http` appears in `tokens.css` or `outro/index.html` | — |
| Music | `music/groove-sauce.mp3` is byte-identical to the source (`cmp`) | — |
| `music-rules.md` | Lists the track with when-to-use and `--music-lufs -28 --duck-db 6`. Levels table: narration −16 LUFS, music −28 LUFS ducked 6 dB | — |
| Groove Sauce credit | "Groove Sauce" by Stan Town, YouTube Audio Library, attribution required. Recorded in `brand.json`, `music-rules.md` and `music/CREDITS.md`. Matches the teaser/short READMEs in `peakflames-videos` | — |
| Privacy | The diff adds no audio, font, SVG, PNG or MP4 files. No tracked `.mp3`, `.wav` or `.mp4` anywhere. The tracked `jetbrains-mono` files are the existing default pack's, not the private pack's. Evidence/WP10 has only JPEG, JSON and logs | privacy-scope.verifier.log |
| AC-PKG-03 grep | `grep -ri peakflames` over skills, lib, schemas, brand-packs, vendor, scripts and evals: 0 hits. `evals/packaging` 10/10 pass | AC-PKG-03-grep.verifier.log, evals-packaging.verifier.log |
| Gate 8 baseline | `--help` lists `--folder`, `--json`, `-h` and `--version`. `--version` = 0.1.0 = plugin.json. A bad flag or missing argument exits 2 with an error line plus the standard "Run --help" hint. A missing path or folder exits 1 with one line. No stack traces | gate8-baseline.verifier.log |
| No disk-wide search | `audio-options.mjs` reads only `brand.json`, the manifest that `x-sfx` names, and with `--folder`, one non-recursive `readdirSync`. The eval's stray and leftover WAVs are not offered | — |
| `SKILL.md` and `stages.md` | They agree. The entry-point table adds stage 8 and `audio-options.mjs`. The rule says to offer only pack tracks/SFX or a folder the user names and never to search. `stages.md` stage 8 gives pack → named folder → narration only, then `AskUserQuestion` by name with the pack levels as the start | — |
| Evals | `node --test evals/plate-factory evals/brand`: 27/27 pass (includes the 4 new `stage 8:` tests) | evals-pf-brand.verifier.log |
| Scope | The diff touches only `skills/plate-factory/`, `evals/plate-factory/`, `evals/real/`, `docs/build/wp/WP10/` and `docs/build/evidence/WP10/`. No change to schemas, `acceptance.md` or `decisions.md` | privacy-scope.verifier.log |

## Findings

No blockers. No majors.

**Minor**

- **m1:** The gate 8 change has no AC ID, so its 4 `stage 8:` tests are not tied to the register (the Builder says so). The Lead should add an AC, for example AC-PF-xx / DEC-39, or record it as not AC-bound.

**Nits**

- **n1:** `packAudio` silently ignores an `x-sfx` manifest path that does not exist. A missing listed track fails, but a missing manifest does not.
- **n2:** `brandJsonOf` treats any other `.json` file as a `brand.json`. For example, `audio-options spine.json` prints `pack undefined`.
- **n3:** `evals/real/real.test.mjs` rewrites tracked evidence files (`AC-REAL-03.log`, `.json`, `-hstack.jpg`) on every run, including runs of the full suite on this machine, where it also renders the teaser (about 60 s). Verifier runs dirty the Builder's evidence. I backed up and restored those files; my outputs are the `*.verifier.*` copies.
- **n4:** `music-rules.md` says "Fade out by the end of the outro". Assemble currently cuts the music at the outro (M8), so the rule cannot be met yet. This is already logged as backlog M8.
- **n5:** The committed contact sheets show the brand logo and end card as rendered frames under `docs/`, which ships with installs. They are not asset files, and the brief allows them. Noted for the user's awareness.
- **n6:** `ac-run-WP10.log` shows AC-REAL-03 as `register: not-started`. The Lead updates the register.

## Scope deviations (handoff)

All are reasonable:

- `evals/real/` and `wp/WP10/real-pack.json` live outside "Owns". They are needed for the script AC and to keep the brand name out of the runtime tree.
- `x-sfx` is an `x-*` key, so no contract change is needed.
- The 1280×720 outro is scaled 2/3 from the original, and SSIM confirms the match.
- No private repo was created, because it needs the user's OK (DEC-16).
