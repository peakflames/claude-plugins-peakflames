# Lead todo (end of build)

Items the Lead does after WP10, before the release.

- [ ] **Update `orchestration-plan.md` to require strict order** (user request, 2026-11-08; DEC-32). Replace the parallel-wave model in §4/§8 with one WP at a time, each verified and merged before the next starts, plus an end-to-end fixture run before any human listening or viewing gate. Record why: Wave 2 ran five builders in parallel, and builders filled unmerged dependencies with stand-ins (test-pattern plates, a test brand pack, macOS `say` sped up with `atempo`). That hid a blocker (the default pack's outro wouldn't render in `assemble`), produced a meaningless listening test for the user, and cost a fix round on WP6 plus re-verification. Carry the builder rule "build only on merged work; stop and ask instead of using stand-ins" into the plan and `agents/builder.md` (already added there).

- [ ] **Evals must clean up their temp dirs** (found 2026-11-08: 1,218 `pm-*` folders, ~3 GB, filled the disk mid-verify). Add an auto-cleaning `tmpDir()` to `evals/helpers/run.mjs` and switch every eval to it — WP9 sweep. Until then, run suites with `TMPDIR=$(mktemp -d)` and delete it after.

- [ ] **WP9 sweep — open nits carried forward:** WP7b N3 (take manifests use a nominal `bpm: 60`; consider a v2 `kind: "take"`), N5 (`evals/video-capture/helpers/alone.mjs` should require two empty checks and re-check after the sync takes), N6 (check-take's last line should repeat the `--expect-cuts` reason), N7 (SKILL.md: recommend `--expect-cuts <slides−1>` for decks); WP6 N-2 (check `--outro` up front); WP4 N-2/N-3; WP7a overrun nits are fixed in WP7b.

- [ ] **WP8 carry-forward:** verify-3 F1 — the transcript checker doesn't catch a stage starting before the previous GATE line (run 2 ran the spine before GATE 1); add a stage→first-command map or list it as a known limit in `stages.md`. F3 — stray blank line / long line in `stages.md`. Test-session memory `~/.claude/projects/-Users-schaveyt-tmp-peak-media-orc-01/memory/show-artifact-before-gate.md` reinforced the gate rule during run 2.

- [ ] **WP9 carry-forward (v0.2):** verify-3 N6 — interrupted/timed-out renders leave HyperFrames' `hf-render-*` and Chrome profile folders in TMPDIR (step is SIGKILLed at once); send SIGTERM, wait 1–2 s, then SIGKILL. WP7b N3 (v2 `kind: "take"`). Repo-root README plugin table and root CHANGELOG don't list peak-media yet — add at release.

- [ ] **WP9 verify-6 carry-forward (v0.2):** I1 — the checker does not enforce re-ask after gate 4 storyboard changes or re-listen after gate 8 re-mix; N7 — status ` -fixed` / `— fixed ❌` counted as fixed; N8 — unknown flags / bad `--duck-db` exit without a GATE FAIL line. Checker can be fooled by deliberate forgery (known limit).

- [ ] **After WP10 — Peakflames pack follow-up (user, 2026-11-10):** the user wants to do something with the pack at `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/` once the build is done (likely its own private repo, DEC-16 — ask before `gh repo create --private`). It must never be committed to this repo.

- [ ] **WP10a verify-1 carry-forward (v0.2):** m1 — gate 8 `audio-options` tests (`stage 8: …`) are not tied to an AC ID; nits — missing x-sfx manifest is silent; any JSON accepted as brand.json; `evals/real` rewrites committed evidence and renders the teaser on every full run; music stops at the outro (manual-steps M8).
