# Lead todo (end of build)

Items the Lead does after WP10, before the release.

- [ ] **Update `orchestration-plan.md` to require strict order** (user request, 2026-11-08; DEC-32). Replace the parallel-wave model in §4/§8 with one WP at a time, each verified and merged before the next starts, plus an end-to-end fixture run before any human listening or viewing gate. Record why: Wave 2 ran five builders in parallel, and builders filled unmerged dependencies with stand-ins (test-pattern plates, a test brand pack, macOS `say` sped up with `atempo`). That hid a blocker (the default pack's outro wouldn't render in `assemble`), produced a meaningless listening test for the user, and cost a fix round on WP6 plus re-verification. Carry the builder rule "build only on merged work; stop and ask instead of using stand-ins" into the plan and `agents/builder.md` (already added there).

- [ ] **Evals must clean up their temp dirs** (found 2026-11-08: 1,218 `pm-*` folders, ~3 GB, filled the disk mid-verify). Add an auto-cleaning `tmpDir()` to `evals/helpers/run.mjs` and switch every eval to it — WP9 sweep. Until then, run suites with `TMPDIR=$(mktemp -d)` and delete it after.

- [ ] **WP9 sweep — open nits carried forward:** WP7b N3 (take manifests use a nominal `bpm: 60`; consider a v2 `kind: "take"`), N5 (`evals/video-capture/helpers/alone.mjs` should require two empty checks and re-check after the sync takes), N6 (check-take's last line should repeat the `--expect-cuts` reason), N7 (SKILL.md: recommend `--expect-cuts <slides−1>` for decks); WP6 N-2 (check `--outro` up front); WP4 N-2/N-3; WP7a overrun nits are fixed in WP7b.

- [ ] **WP8 carry-forward:** verify-3 F1 — the transcript checker doesn't catch a stage starting before the previous GATE line (run 2 ran the spine before GATE 1); add a stage→first-command map or list it as a known limit in `stages.md`. F3 — stray blank line / long line in `stages.md`. Test-session memory `~/.claude/projects/-Users-schaveyt-tmp-peak-media-orc-01/memory/show-artifact-before-gate.md` reinforced the gate rule during run 2.

- [ ] **WP9 carry-forward (v0.2):** verify-3 N6 — interrupted/timed-out renders leave HyperFrames' `hf-render-*` and Chrome profile folders in TMPDIR (step is SIGKILLed at once); send SIGTERM, wait 1–2 s, then SIGKILL. WP7b N3 (v2 `kind: "take"`). Repo-root README plugin table and root CHANGELOG don't list peak-media yet — add at release.

- [ ] **WP9 verify-6 carry-forward (v0.2):** I1 — the checker does not enforce re-ask after gate 4 storyboard changes or re-listen after gate 8 re-mix; N7 — status ` -fixed` / `— fixed ❌` counted as fixed; N8 — unknown flags / bad `--duck-db` exit without a GATE FAIL line. Checker can be fooled by deliberate forgery (known limit).

- [x] **After WP10 — Peakflames pack follow-up (user, 2026-11-10):** the user wants to do something with the pack at `~/github/peakflames/peakflames-brand-guidelines/peak-media-pack/` once the build is done (likely its own private repo, DEC-16 — ask before `gh repo create --private`). It must never be committed to this repo.

- [ ] **WP10a verify-1 carry-forward (v0.2):** m1 — gate 8 `audio-options` tests (`stage 8: …`) are not tied to an AC ID; nits — missing x-sfx manifest is silent; any JSON accepted as brand.json; `evals/real` rewrites committed evidence and renders the teaser on every full run; music stops at the outro (manual-steps M8).

- [ ] **F4 draft 1 findings (v0.2):** (1) GATE 1 line missing again after "apply edits, approved" (prose rule unreliable; consider making spine.mjs print/require the script approval or checking script.md hash). (2) With no screenshots supplied, plate-factory proposed text-only plates: small left-aligned type in the top-left of a 1920×1080 frame, no visuals, placeholder TOR IDs — the skill should propose live captures/diagrams from the brief and scale type to the frame. (3) Music landed 2.5 dB under the pack target (-30.5 vs -28 LUFS). (4) Slide template cut the head-to-head to 3 rows.

- [x] **Peakflames brand pack home (user, 2026-11-10):** manage the brand pack inside the existing `/Users/schaveyt/github/peakflames/peakflames-brand-guidelines` folder (pack currently at its `peak-media-pack/`), and make that whole folder the private GitHub repo (supersedes a separate pack repo in DEC-16). Ask before `git init` / `gh repo create --private` / push. Never commit it to this repo.
  Done 2026-11-10: private repo https://github.com/peakflames/peakflames-brand-guidelines (whole folder, incl. `peak-media-pack/`).

- [ ] **WP12 verify-1 carry-forward (v0.2):** the DOM fallback cursor is untested (the CLI can't force it); `--no-cursor` also shortens a take (no ~400 ms glides) — document in WP15. The `loadStoryboard` error / `--storyboard` help listing the full context is folded into WP13.

- [ ] **WP13 verify-2 carry-forward (v0.2):** m3 — check-take's 150 ms merge window is shorter than the deck's 200 ms fade (false fail only; not seen today); n3 — youtube (no edit lists) loses a clip's first 21.3 ms if it starts at 0 ms (`--lead-ms 0`) — document in WP15; n4 — WP13 handoff deviations stale; n5 — check-take text output still says threshold 0.02 on 1080p takes (JSON is right); verify-1 n2 — progressive check passes when ffprobe reports no field order.

- [ ] **WP14 verify-1 carry-forward (v0.2):** (1) `signin --save` web2video/ refusal compares an unresolved path — `realpath` both sides (symlinked `/var` bypass); (2) a headed browser that fails to start prints Playwright's multi-line log and exits 70 instead of one line; (3) signin runbook hard-codes `~/.cache/peak-media` (wrong when `CLAUDE_PLUGIN_DATA` is set) — fix when WP17 runs it; (5) `--storage-state <dir>` says "no such file".

- [ ] **WP15 verify-1 carry-forward (v0.2):** nits 8 (beat-error examples show only `script.md`), 10 (DOM cursor fallback undocumented), 11 (narrated beat end shifts with `--audio-offset-ms`). Findings 1–6 fixed in fix round 1 (`b13f8ab`), spot-checked by the Lead (docs test 2/2).

- [ ] **WP16 carry-forward (v0.3 engine gaps):** `contact-sheet --beats <take.json>` (one still per beat from the manifest); `capture --hide <selector>` for private data; `sample-voice --cache-dir`; contact-sheet timecode covers each still's top-left corner (verify-1 #10). WP16 fix round 1 (`92b0aeb`) was spot-checked by the Lead; the runtime sizing (verify-1 #1, blocker) is proven only by WP17's AC-UAT-01/05.

- [ ] **WP17 verify-1 carry-forward (v0.2):** F-02 re-record-from-project (D7) and F-03 D9/D10/D11 are text-tested only — one AC-UAT-03 and AC-UAT-12 re-run would exercise them; F-04 `hide` + page errors in one take unexercised; F-05 the post-recording privacy stop never triggered (every case caught it while exploring). F-01 fixed (chat message before the sign-in window).
