# WP17 — web2video UAT

**Runs as:** Lead (headless driver) + user (AC-UAT-05) · **Branch:** `feature/peak-media-web2video` · **Contracts:** v1

## Model (settled 2026-11-10)

- **Hybrid.** The Lead drives eleven cases headlessly: one fresh `claude -p` session per case with `--plugin-dir plugins/peak-media` (no other plugins), from an empty scratch dir outside the repo (`~/tmp/pm-w2v-uat/<case>/`) holding only the case's fixture. Gate answers are scripted as `--resume` replies, the case's prompt typed exactly as in `evals/web2video/uat/cases.md`. Headless sessions answer the gate by typed reply, not `AskUserQuestion` (DEC-42 precedent); the transcript still has to show exactly one gate question before the first capture.
- The **user** runs AC-UAT-05 by hand (sign-in in a visible browser); the Lead prepares the folder, starts the login-demo server, and checks the result.
- A fresh **reviewer agent** reads each case's contact sheet for the `still` items; it gets the sheet, the case's Then clause, and nothing else.
- TTS spend is allowed with the user's key, cache-first; report the number of synth calls per case.

## Evidence

Per case under `docs/build/evidence/WP17/AC-UAT-NN/`: `transcript.jsonl` excerpt (gate question, commands run), `probe.log` (`probe-spec --preset`), `check-take.log` when narrated, `contact-sheet.jpg`, `review.md` (reviewer verdict), `result.md` (Given/When/Then outcome). No MP4/WAV. No session files.

## Acceptance criteria

UAT rows (method `manual`, the case's Given/When/Then from `cases.md`): **AC-UAT-01**, **AC-UAT-02**, **AC-UAT-03**, **AC-UAT-04**, **AC-UAT-05** (user), **AC-UAT-06**, **AC-UAT-07**, **AC-UAT-08**, **AC-UAT-09**, **AC-UAT-10**, **AC-UAT-11**, **AC-UAT-12**.

Skill behaviour rows proven by those cases:

- **AC-W2V-30** (UAT) — exactly one approval question before recording, showing script, beats, mode, preset, and path (AC-UAT-01, 11)
- **AC-W2V-31** (UAT) — the destination maps to a preset (`web` default) and the reason is stated at hand-off (AC-UAT-01, 06, 07)
- **AC-W2V-32** (UAT) — narrated mode runs a cold read and `sample-voice` before the gate (AC-UAT-03)
- **AC-W2V-33** (UAT) — a contact sheet with one still per beat is Read before hand-off (AC-UAT-01)
- **AC-W2V-34** (UAT) — visible private data blocks hand-off until the user decides (AC-UAT-10)
- **AC-W2V-35** (UAT) — the skill never uploads, posts, or attaches the file, and runs no sharing CLI (AC-UAT-07)
- **AC-W2V-37** (UAT) — the skill offers to delete the session file at hand-off (AC-UAT-05)

Also closed here: AC-W2V-20 (WP14, manual, with AC-UAT-05) and the UAT half of AC-W2V-36 (WP16, with AC-UAT-04).

A fresh Verifier then checks every row's evidence and writes `wp/WP17/verify-1.md`.
