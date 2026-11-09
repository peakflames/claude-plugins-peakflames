# Lead todo (end of build)

Items the Lead does after WP10, before the release.

- [ ] **Update `orchestration-plan.md` to require strict order** (user request, 2026-11-08; DEC-32). Replace the parallel-wave model in §4/§8 with one WP at a time, each verified and merged before the next starts, plus an end-to-end fixture run before any human listening or viewing gate. Record why: Wave 2 ran five builders in parallel, and builders filled unmerged dependencies with stand-ins (test-pattern plates, a test brand pack, macOS `say` sped up with `atempo`). That hid a blocker (the default pack's outro wouldn't render in `assemble`), produced a meaningless listening test for the user, and cost a fix round on WP6 plus re-verification. Carry the builder rule "build only on merged work; stop and ask instead of using stand-ins" into the plan and `agents/builder.md` (already added there).

- [ ] **Evals must clean up their temp dirs** (found 2026-11-08: 1,218 `pm-*` folders, ~3 GB, filled the disk mid-verify). Add an auto-cleaning `tmpDir()` to `evals/helpers/run.mjs` and switch every eval to it — WP9 sweep. Until then, run suites with `TMPDIR=$(mktemp -d)` and delete it after.
