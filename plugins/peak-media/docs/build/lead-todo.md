# Lead todo (end of build)

Items the Lead does after WP10, before the release.

- [ ] **Update `orchestration-plan.md` to require strict order** (user request, 2026-11-08; DEC-32). Replace the parallel-wave model in §4/§8 with one WP at a time, each verified and merged before the next starts, plus an end-to-end fixture run before any human listening or viewing gate. Record why: Wave 2 ran five builders in parallel, and builders filled unmerged dependencies with stand-ins (test-pattern plates, a test brand pack, macOS `say` sped up with `atempo`). That hid a blocker (the default pack's outro wouldn't render in `assemble`), produced a meaningless listening test for the user, and cost a fix round on WP6 plus re-verification. Carry the builder rule "build only on merged work; stop and ask instead of using stand-ins" into the plan and `agents/builder.md` (already added there).

- [ ] **Evals must clean up their temp dirs** (found 2026-11-08: 1,218 `pm-*` folders, ~3 GB, filled the disk mid-verify). Add an auto-cleaning `tmpDir()` to `evals/helpers/run.mjs` and switch every eval to it — WP9 sweep. Until then, run suites with `TMPDIR=$(mktemp -d)` and delete it after.

- [ ] **WP9 sweep — open nits carried forward:** WP7b N3 (take manifests use a nominal `bpm: 60`; consider a v2 `kind: "take"`), N5 (`evals/video-capture/helpers/alone.mjs` should require two empty checks and re-check after the sync takes), N6 (check-take's last line should repeat the `--expect-cuts` reason), N7 (SKILL.md: recommend `--expect-cuts <slides−1>` for decks); WP6 N-2 (check `--outro` up front); WP4 N-2/N-3; WP7a overrun nits are fixed in WP7b.

- [ ] **WP8 carry-forward:** verify-3 F1 — the transcript checker doesn't catch a stage starting before the previous GATE line (run 2 ran the spine before GATE 1); add a stage→first-command map or list it as a known limit in `stages.md`. F3 — stray blank line / long line in `stages.md`. Test-session memory `~/.claude/projects/-Users-schaveyt-tmp-peak-media-orc-01/memory/show-artifact-before-gate.md` reinforced the gate rule during run 2.
