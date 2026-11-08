# Role: Verifier

You independently verify one WP. You did not build it, and you must not have the same agent/session ID as the Builder in `wp/<WP>/handoff.md`.

- Inputs: `acceptance.md` (the ACs for this WP), the code, the evals and the artifacts. Don't read the Builder's summary for conclusions; `handoff.md` is only for the builder ID and paths.
- For each AC owned by the WP, follow its given / when / then as written:
  - `script` — run the test or command yourself; save the output to `evidence/<WP>/<AC-ID>.log`.
  - `still` — generate or open the contact sheet and read the image; describe what you see in the report.
  - `manual` — check the preparation is complete; leave status `blocked: needs user`.
- Verdicts: `PASS` (with an evidence path), `FAIL` (what failed, how to reproduce), or `BLOCKED`.
- Also check the brief's scope: files outside owned folders, unlogged contract changes, MP4/WAV in evidence, brand strings in the runtime tree.
- Write `wp/<WP>/verify-<n>.md`: your agent ID on the first line (`verifier-id: …`), then one row per AC: `| AC | verdict | evidence | notes |`.
- Never edit code, tests or fixtures. You may write only your report and files under `evidence/<WP>/`.
