builder-id: builder-wp9-ae42bf332f2a3a11c

# WP9 handoff — Packaging

Branch `feature/peak-media-wp9`, based on `feature/new-peak-media-plugin` @ d643813. Model: claude-opus-5-5,
worktree Builder session (agent ae42bf332f2a3a11c), 2026-11-09. Every run used a scratch `TMPDIR`, deleted
afterwards. No MP4/WAV/MP3 in the repo; `.DS_Store` strays deleted.

## Done

| AC | What | Evidence |
|---|---|---|
| AC-PKG-01 | `evals/packaging/packaging.test.mjs`: plugin.json version = top CHANGELOG entry; marketplace.json lists `peak-media` once, `source: ./plugins/peak-media` | evidence/WP9/AC-PKG-01.log |
| AC-PKG-03 | Walks `skills lib schemas brand-packs vendor scripts evals` (file names and bytes) for the brand name, case-insensitive: 0 hits. Examples carry no images, fonts, audio or logo/brand/outro files | evidence/WP9/AC-PKG-03.log |
| AC-PKG-04 | Test runs `setup.sh`, then F1 end to end with no key: fake/tone spine at 20 s → `retime-plates` → `render-plate --all` (default pack) → `assemble` → `probe-spec` (size, fps, spine + 3 s outro). Run in a clean node:22-slim linux/amd64 container (see Container) and on macOS | evidence/WP9/AC-PKG-04-08.container-amd64.log, evidence/WP9/AC-PKG-04-08.macos.log |
| AC-PKG-06 | Test: exactly the five DEC-21 skills (no `web2video`), each SKILL.md names itself, each `evals/<skill>/` has ≥ 1 test. "All pass" = the full suite | evidence/WP9/AC-PKG-06-suite.log |
| AC-PKG-07 | Test parses VENDORED.md: every `vendor/*` folder has Destination, Source URL, 40-char commit, date, licence (+ LICENSE file) and ≥ 3 local-change bullets; GSAP row `Fetched` from npm; every font folder (`brand-packs/*/fonts/*`, `evals/fixtures/*/fonts/*`) `Bundled` with source, version, date, sha256, licence, local changes and its OFL.txt | evidence/WP9/AC-PKG-07.log |
| AC-PKG-08 | Test: with no deps, `setup.sh --check` is one line naming setup.sh (exit 3); with no ffmpeg, one line with the install command; with a browser that can't start, one line; skeleton F0 with no deps is one line. Then `setup.sh` for real: if it can't finish it must be one line; otherwise F0 renders and passes probe-spec | evidence/WP9/AC-PKG-04-08.container-amd64.log, evidence/WP9/AC-PKG-08.container-arm64.log, evidence/WP9/AC-PKG-08.container-amd64-qemu.log, evidence/WP9/AC-PKG-04-08.macos.log |

Also delivered:
- **README.md** — install (marketplace add / install, `#develop` for unreleased), prerequisites (Node 22+, ffmpeg, Linux browser libraries, disk, arm64 note), `setup.sh`, the key (`PEAK_MEDIA_OPENROUTER_API_KEY`, ZDR note), the three modes, the five skills, the house voice, brand packs (placeholder "Your Name" outro, `--brand`), music/SFX (none ships), project layout. No pinned version strings (AC-SKL-07).
- **VENDORED.md (final)** — summary table; HyperFrames section (WP4's text kept, `Fetched` row renamed `Date`); bundled fonts table (from WP5's handoff); fetched-by-setup table (GSAP, HyperFrames CLI, Playwright, ajv, browser — versions point at `lib/pins.json`).
- **marketplace.json** — peak-media entry (description from plugin.json); `metadata.version` not bumped (DEC-19).
- **Eval temp dirs** — `tmpDir(prefix)` in `evals/helpers/run.mjs` (deleted on process exit; `PEAK_MEDIA_KEEP_TMP=1` keeps them); every eval switched from `mkdtempSync(os.tmpdir…)`.
- **Reference notes** — `skills/video-spine/references/{narration-writing,voices}.md` already exist (adapted copies, Rasalgethi default); no skill points into `docs/`. Nothing to copy.
- **Runbook** — `wp/WP9/pkg-02-05-runbook.md`.
- **`.gitignore`** checked: keeps `node_modules/`, `renders/`, `out/` and media under `docs/build` out.
- Extra test (not AC-bound): `docs/` holds only `.md .mjs .json .log .jpg`; no audio/video anywhere in the plugin.

### Lead decisions applied (2026-11-09, ownership widened)

- **setup.sh / lib/hf.mjs:** new `browserCheck(bin)` in `lib/hf.mjs` starts the browser once (`--headless --dump-dom about:blank`); on Linux a failure runs `ldd` and returns one line naming the missing libraries and the `apt-get install` packages. `setup.sh` (install and `--check`) calls it after the browser step and exits 3 with that line. `render()` failures now use a `✗` line, then the browser check's message, then the last non-empty output line, instead of "no output". AC-BASE-01 eval still passes.
- **setup.sh on Linux arm64:** before downloading, it stops with one line: `no headless browser build exists for Linux arm64 — use macOS or an x86_64 Linux host, or set HYPERFRAMES_BROWSER_PATH` (was: "browser download failed — see browser.log").
- **README:** Linux browser libraries listed; linux/arm64 unsupported (no headless browser build), use macOS or amd64.
- **Node 22:** `ac-run.mjs` passes `<evals>/**/*.test.mjs` instead of the folder (Node 22's `--test` doesn't take a directory). Eval comments and the AC-PKG-06 test name use `node --test "plugins/peak-media/evals/**/*.test.mjs"`.

## Nit sweep (lead-todo "WP9 sweep" + "WP8 carry-forward")

| Nit | Fix |
|---|---|
| WP7b N5 | `alone.mjs`: needs 2 consecutive empty polls; the sync test re-samples siblings after its takes and records `siblingsAfterTakes` / `aloneThroughout` in `ranAlone` (warns if not alone) |
| WP7b N6 | `check-take.mjs`: on an `--expect-cuts` mismatch the closing FAIL line now leads with the reason |
| WP7b N7 | video-capture SKILL.md: decks should always pass `--expect-cuts <slides − 1>` |
| WP7b N3 | **Not done** (v2 `kind: "take"` is a contract change) — next version |
| WP6 N-2 | `assemble.mjs`: `--outro` checked up front with `--music`/`--sfx`; eval asserts the refusal and that `out/final.mp4` is untouched |
| WP4 N-2 (verify-3) | slide template `over()` also checks the body's bottom edge (no sub-pixel overrun past the content box) |
| WP4 N-3 (verify-3) | slide template: a first fit pass rejects layouts that split an ordinary word (≤ 20 chars) across rows; if no size reaches that, the old rule applies. F1/F2 layouts measured identical before and after; new `layout.test.mjs` case (URL table + six bullets) fails on the old template, passes now. `plate-authoring.md` row updated |
| WP8 verify-3 F1 | Listed as a known limit in `stages.md` (checker only orders first passing gate lines), not added to the checker |
| WP8 verify-3 F3 | `stages.md`: double blank line removed, long line wrapped |

## Results

- `node --test "plugins/peak-media/evals/**/*.test.mjs"` with a fresh TMPDIR: **100/100 pass**, 398 s (evidence/WP9/AC-PKG-06-suite.log). TMPDIR afterwards holds only `node-compile-cache` (Node's own); no `pm-*` folders (evidence/WP9/tmpdir-after-suite.log).
- `ac-run --wp WP9`: all six script ACs pass (evidence/WP9/ac-run-WP9.log). `ac-run --trace`: 79 ACs, 12 briefs, 0 problems.

### Container (AC-PKG-04 / -08)

Colima VM (`--disk 8`, vz + Rosetta), image `node:22-slim` (Debian 12, Node 22.23.4), worktree mounted read-only. Script (`tmp/wp9/in-container.sh`, gitignored, quoted in the logs): `apt-get install --no-install-recommends ffmpeg ca-certificates libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libxcomposite1 libxdamage1` (the README's prerequisites), `setup.sh --check` (one line, exit 3), then `node --test --test-name-pattern='^AC-PKG-0[48]:' 'evals/packaging/*.test.mjs'` (each test runs `setup.sh` itself).

| Run | Result |
|---|---|
| linux/amd64 (Rosetta), with the README's packages | **AC-PKG-04 pass** (F1 20.8 s + outro, probe-spec PASS, 151 s), **AC-PKG-08 pass**; `setup.sh --check` after: ready; ldd: nothing missing |
| linux/arm64 (native) | AC-PKG-08 pass via its one-line branch (`no headless browser build exists for Linux arm64 …`); AC-PKG-04 fails as expected (documented as unsupported) |
| linux/amd64 under qemu (no Rosetta) | Chrome itself crashes under qemu (`Assertion failed: p_rcu_reader->depth != 0 … qemu/rcu.h`); the new browser check reports it in one line. Emulator limit, not ours |
| first amd64 run, ffmpeg only (before the fix) | setup said "ready" but every render failed `no output`: the browser lacked libnspr4/libnss3/… — what led to the browserCheck change |

A first Rosetta attempt had the fake/tone spine idle in `epoll` for 12 min; a standalone rerun of the spine and the full rerun both finished normally, so it is recorded as a one-off. All containers and the image were removed; the VM was stopped and deleted with its data disk (`colima delete -f --data`).

## Open

- **AC-PKG-02 — blocked: needs user.** Needs the branch pushed (user approval), then the install check in `pkg-02-05-runbook.md`.
- **AC-PKG-05 — blocked: needs user.** Fresh-session cold start (a) explainer, (b) captioned TodoMVC demo, plus reviewer-agent D7–D10 prompt: runbook.
- **AC-PKG-09 — blocked: needs user** (read the README).
- **AC-PKG-04 macOS manual check** — the eval passes on this Mac (log above); the "checked once by hand" part is the user's.
- Root `README.md` plugin table doesn't list peak-media (not an owned file); CHANGELOG bullets for WP9 are for the Lead.

## Deviations from the brief

- Ownership widened per the Lead notes and the 2026-11-09 Lead decisions (setup.sh, lib/hf.mjs, ac-run.mjs).
- "WP4 N-2/N-3" read as verify-3's (slide template); verify-2's N-3 was already fixed by the Lead in `lib/hf.mjs`.
- Container: linux/amd64 via Rosetta on Apple silicon (no native amd64 host here); see Container above.
