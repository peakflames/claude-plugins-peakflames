verifier-id: verifier-wp9-r1-ec380cb6

# WP9 verify-1 — Packaging

Branch `feature/peak-media-wp9` @ a79e511 (builder `builder-wp9-ae42bf332f2a3a11c`). Diff reviewed:
`git diff d643813..a79e511`. Host: macOS arm64, Node 26.8.1. Containers: colima (r1), then Docker
Desktop 29.7.2 (r2); linux/amd64 `node:22-slim` (Node 22.23.4) via Rosetta in both.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-PKG-01 | PASS | evidence/WP9/AC-PKG-01.verifier.log | plugin.json 0.1.0 = top CHANGELOG `## [0.1.0] — UNDER DEVELOPMENT`; marketplace.json lists `peak-media` once, `source: ./plugins/peak-media` (resolves), description = plugin.json's; `metadata.version` still 1.3.1 (DEC-19). Eval passes in the full suite |
| AC-PKG-02 | BLOCKED: needs user | wp/WP9/pkg-02-05-runbook.md | Needs the branch pushed. Runbook steps are runnable; see F2 (it deletes the config dir PKG-05 reuses) |
| AC-PKG-03 | PASS | evidence/WP9/AC-PKG-03.verifier.log | My own `grep -ri peakflames` over `skills lib schemas brand-packs vendor scripts evals` (on-disk and tracked, contents and file names): 0 hits. Examples (`skills/video-capture/examples/{deck,ui-demo}`) hold only .md/.html/.mjs/.css, no logo/brand/outro/font/image/audio files. Hits exist only in `docs/` and README (install command), both outside the runtime tree |
| AC-PKG-04 | FAIL (not reproduced in a container) | evidence/WP9/AC-PKG-04-08.container-amd64-r1-hang.verifier.log, evidence/WP9/AC-PKG-04-08.container-amd64-r2-stall.verifier.log, evidence/WP9/AC-PKG-06-suite.verifier.log | macOS: passes (suite, 185 s). Clean Linux amd64 container (README packages, `setup.sh` ready, ldd nothing missing): **2 of 2 runs hung** inside the F1 eval with no output: r1 in `assemble.mjs` (~1 h 45 m, per the Lead), r2 in `render-plate.mjs` (stopped after 10 min with no process change). See F1. Only Rosetta-emulated amd64 is available here; a native x86_64 host is needed to tell emulator from product. The "macOS once by hand" part is the user's |
| AC-PKG-05 | BLOCKED: needs user | wp/WP9/pkg-02-05-runbook.md | Preparation complete: scratch folder outside the repo, prompts (a)/(b), "only SKILL.md" transcript check, reviewer-agent D7–D10 prompt; every script/flag it names exists (`probe-spec --size`, `contact-sheet --at`, `check-cuts --cuts --min-silence-ms`, `check-take`). See F2 |
| AC-PKG-06 | PASS | evidence/WP9/AC-PKG-06-suite.verifier.log | `TMPDIR=$(mktemp -d) node --test "plugins/peak-media/evals/**/*.test.mjs"`: **100 tests, 100 pass, 0 fail**, 408 s. TMPDIR afterwards held only `node-compile-cache/` (Node's own, 5.7 MB); no `pm-*` folders; deleted. Five DEC-21 skills, no `web2video`; each `evals/<skill>/` has ≥ 1 test |
| AC-PKG-07 | PASS | evidence/WP9/AC-PKG-07.verifier.log | One vendor folder (`vendor/hyperframes/`): source URL, 40-char commit, date, Apache-2.0 + LICENSE, local-change list; I spot-checked the list against the tree (6 `SKILL.reference.md`, no `SKILL.md`, frame presets / cloud refs / skill-lifecycle removed, 0 `hyperframes events`). GSAP row `Fetched` (npm, licence). All 4 font folders on disk have a `Bundled` row and `OFL.txt` |
| AC-PKG-08 | BLOCKED | evidence/WP9/AC-PKG-04-08.container-amd64-r2-stall.verifier.log, evidence/WP9/AC-PKG-06-suite.verifier.log | One-line "what's missing" messages confirmed in a fresh container: no ffmpeg → `setup.sh: ffmpeg not found — install it (… sudo apt-get install ffmpeg)` exit 3 (install and `--check`); ffmpeg but no browser libs → `setup.sh: render browser can't start — missing system libraries: libXcomposite.so.1 … — install them (Debian/Ubuntu: sudo apt-get install libatk-bridge2.0-0 … libxdamage1)` exit 3 (install and `--check`); with the README packages `setup.sh` → `peak-media ready`. The F0 render in the container was never reached (AC-PKG-04 runs first in the file and hung, F1). macOS: passes. linux/arm64 message not re-run by me (builder evidence only) |
| AC-PKG-09 | BLOCKED: needs user | plugins/peak-media/README.md | README covers install (marketplace add/install, `#develop`), prerequisites (Node 22+, ffmpeg, disk, network, Linux apt line, arm64 unsupported), the key (`PEAK_MEDIA_OPENROUTER_API_KEY`, ZDR / Safety Retention), the three modes (narrated, beat grid, live capture). Claims I spot-checked against code hold (Rasalgethi default, `--debug-requests` redaction, `mai-voice-2.1-flash`, `scripts/validate.mjs`, `--brand`). See F5 |

## Findings

**F1 — should-fix (blocks AC-PKG-04 in a container): a stuck render/assemble hangs forever instead of failing in one line.**
Repro: `docker run --platform linux/amd64 -v <worktree>:/repo:ro node:22-slim` on Apple silicon (Rosetta),
install the README's apt line, `setup.sh`, then
`node --test --test-name-pattern='^AC-PKG-0[48]:' 'evals/packaging/*.test.mjs'`. r1: `assemble.mjs` sat
~1 h 45 m in `ep_poll` with an open socket and no child processes. r2: `render-plate.mjs` sat in
`do_epoll_wait` 10+ min with no children (no chrome, no ffmpeg, no hyperframes process left in the
container; `pm-pkg04-*` scratch present). The builder saw the same shape once in `spine.mjs` (12 min).
- `lib/hf.mjs` `hf()` passes `timeout: 20 min` to `spawnSync`, yet r1 ran 5× past it, so that timeout
  is not a reliable guard here. `lib/ffmpeg.mjs` `ffmpeg()`/`probe()` and `evals/helpers/run.mjs` `run()`
  have no timeout at all.
- Where the timeout belongs: in `lib/hf.mjs` `render()` / `hf()` (serves `render-plate` and assemble's
  outro render at `assemble.mjs:132`), as a watchdog that does not depend on the child-exit wakeup:
  e.g. async `spawn` in its own process group with a timer that kills the group, plus a no-progress
  check on the output file, failing with one line (`render timed out after N min — the render browser
  may have crashed; run setup.sh --check`). The same guard for `lib/ffmpeg.mjs` calls, and a per-step
  `timeout` in the eval `run()` helper so AC-PKG-04/08 fail in one line rather than hang the suite.
- Cause not proven. Neither `render-plate` nor `assemble` opens a CDP socket itself (all child work is
  `spawnSync`), and three different scripts hung with no children left, which points at lost
  child-exit wakeups under Rosetta (Docker Desktop also injects `--no-opt -r /proc/.reset` into
  node there) rather than a browser crash. Either way the plugin should fail in one line. A run on a
  native x86_64 host decides whether AC-PKG-04 itself passes.

**F2 — should-fix: runbook deletes the config PKG-05 needs.** `pkg-02-05-runbook.md` says PKG-02
ends with `rm -rf ~/tmp/pm-pkg02`, then PKG-05's setup starts `claude` with
`CLAUDE_CONFIG_DIR=$HOME/tmp/pm-pkg02/.claude-config` ("the PKG-02 install"). Followed in order, PKG-05
starts with no plugin installed. Move the cleanup to after PKG-05.

**F3 — nit:** `setup.sh` `browser_starts` builds JS with `import('$ROOT/lib/hf.mjs')` inside single
quotes; a plugin path containing `'` breaks it (same pattern pre-exists at line 60 for `deps.mjs`).
Pass `$ROOT` via an env var instead.

**F4 — nit:** `plugins/peak-media/.gitignore` ignores `docs/build/**/*.{mp4,webm,wav,mov}` but not
`*.mp3`/`*.m4a`; the packaging eval catches them, git doesn't.

**F5 — nit:** README "Brand packs" tree has no place for the pack's music/SFX (DEC-39 `x-tracks` /
`music-rules.md` tracks, DEC-40 `sfx/`), though "Music and sound effects" says tracks can live in
the pack and gate 8 offers the pack's tracks by name.

## Scope and other checks

- Files changed: owned (`README.md`, `VENDORED.md`, marketplace entry, `evals/**`, WP9 docs/evidence)
  plus the Lead-granted ones (`scripts/setup.sh`, `lib/hf.mjs`, `docs/build/tools/ac-run.mjs`, nit-sweep
  files in `skills/{video-capture,video-assemble,video-plates,plate-factory}/**`). Nothing else. No
  contract (schema) change; WP7b N3 correctly left for v2. CHANGELOG untouched (Lead's).
- Nit sweep reviewed: alone.mjs two empty polls + re-sample after takes; check-take FAIL line leads
  with the reason; video-capture SKILL.md `--expect-cuts <slides − 1>`; assemble `--outro` checked up
  front (eval asserts refusal and untouched `final.mp4`); slide template `over()` body-bottom check and
  whole-word first pass (fallback keeps the old rule; bullets unaffected); stages.md known-limit note
  and whitespace. All correct as described; the suite passes.
- `browserCheck` / setup.sh: correct on the two Linux cases I ran (libs missing → one line with the
  apt packages; libs present → ready). `render()` falls back to the browser check only when HyperFrames
  printed nothing recognisable. AC-BASE-01 (setup.sh baseline) passes in the suite.
- `ac-run.mjs` glob change: correct by reading (`existsSync`/`statSync` imported; glob passed unexpanded
  to `node --test`); its eval passes on Node 26. Not re-run on Node 22 by me.
- No MP4/WAV/MP3 tracked anywhere in the plugin; `docs/build` holds only jpg/json/log/md/mjs; largest
  tracked file 991 KB (evidence/WP9/docs-heavy-files.verifier.log).
- Cleanup: both containers and the `node:22-slim` image removed; colima instance gone (user removed
  colima); Docker Desktop untouched. Suite TMPDIR deleted.
