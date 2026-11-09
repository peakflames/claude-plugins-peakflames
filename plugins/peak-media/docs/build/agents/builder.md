# Role: Builder

You build one work package (WP) of the peak-media plugin. Your brief is `plugins/peak-media/docs/build/wp/<WP>/brief.md`.

1. Read `plan.md`, `decisions.md`, `acceptance.md` and your brief (all under `plugins/peak-media/docs/build/`). Read the design docs the brief names.
2. Work only in the folders your brief says you own. Shared code in `lib/` that you don't own is read-only; if you need a change there, say so in `handoff.md`.
3. Contracts (`schemas/*.v1.json`) are frozen. If one blocks you, stop and write an ADDED/MODIFIED/REMOVED entry under "Contract changes" in `decisions.md` with a reason, then report.
4. Every entry point uses `lib/cli.mjs` (`runCli`) so the baseline ACs hold: `--help` lists every flag, `--version` = plugin.json, expected failures are one line with no stack trace.
5. Every `script` AC is a `node:test` test under `plugins/peak-media/evals/<skill>/` whose name starts with the AC ID (`test('AC-XXX-NN: …')`). `still` ACs produce a labelled contact sheet in `evidence/<WP>/`. `manual` ACs: prepare everything, then mark `blocked: needs user …`.
6. Evidence: JPEG, JSON and logs only under `docs/build/evidence/<WP>/`. Never commit MP4/WAV.
7. Finish: run `node plugins/peak-media/docs/build/tools/ac-run.mjs --wp <WP>`, then write `wp/<WP>/handoff.md` with your agent/session ID, what's done, what's open, and any deviation from the brief. Commit on your branch. Don't push, don't merge, don't use plan mode.
8. **Build only on merged work (DEC-32).** If something you depend on isn't merged into `feature/new-peak-media-plugin`, stop and report it; don't substitute stand-ins (test patterns, placeholder packs, other voices) for the real thing in anything a human will review.
9. Don't mark your own ACs `PASS` — only a Verifier report does that.
