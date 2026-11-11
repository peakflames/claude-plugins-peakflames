# WP17 — handoff

builder-id: wp17-lead-driver

Ran by the Lead's UAT driver agents (headless `claude -p`, one case at a time) and the user (AC-UAT-05, interactive).

- Round 1: eleven cases (01–04, 06–12) — `uat-results.md`; 10 PASS, AC-UAT-02 FAIL; defects D1–D8.
- Fix round: `fix-handoff.md` (builder-id wp17-fix-builder), merged at `1779d1a`.
- Round 2: re-ran 02, 03, 08, 11 — all PASS; D9/D10 found and fixed by the Lead (`a163f93`, `7ed0942`).
- AC-UAT-05: user, session `18373780…`, PASS; D11 fixed (`7a71794`).
- Evidence: `evidence/WP17/AC-UAT-NN/` (round 2 under `r2/`). MP4s stay in `~/tmp/pm-w2v-uat/` and `~/tmp/pm-w2v-uat-r2/`.
- Not re-run after fixes: 01, 04, 06, 07, 09, 10, 12 (their round-1 PASS stands; the fixes touched exploration serving, hide-before-t0, the privacy still set, budget wording, gate wording and the re-record command).
