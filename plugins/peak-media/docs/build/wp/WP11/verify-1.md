verifier-id: wp11-verifier-1

# WP11 verify-1 — 2026-11-10

Builder: `wp11-builder (agent aa59ec2e0ef11a1b6)` (from handoff.md). Verifier ID differs. Verified at HEAD `8eedf36`, against base `754663c`.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-TRC-03 | PASS | `evidence/WP11/AC-TRC-03.verifier.log` | `--test-name-pattern='^AC-TRC-03:'`: 1/1 pass. The test covers a listed W2V row (clean), an orphan W2V row, a brief that names an unknown W2V ID, and `--wp` reporting W2V pass and fail. `ac-run --wp WP11`: AC-TRC-03 run=pass, exit 0. `ac-run --trace`: 80 ACs, 13 briefs, 0 problems. Full `evals/trace/ac-run.test.mjs`: 4/4 pass. Diff: all three ID patterns (L15, L27, L109) now come from one `AC_ID = 'AC-[A-Z0-9]+-\\d+'`. The only other behaviour change drops `NODE_TEST_CONTEXT` from the nested `node --test` env. **Sound:** node:test sets that variable for its child processes, so a nested runner would report over the parent's private channel and print no TAP to stdout. Outside a test run the variable is unset, so a normal CLI run is unchanged. |
| U1 | finding recorded: yes | `evidence/WP11/U1-youtube-settings.log` | Dated 2026-11-10 (page read the same day). Values in the log match the bullet: AAC-LC 48 kHz 384 kbps, H.264 High, 2 B-frames, closed GOP of half the fps, 8/12 Mbps. Consequence: WP13. |
| U2 | finding recorded: yes | `evidence/WP11/U2-screencast-1080p60.json` | PASS. Evidence has one take: 1775/1800, 0.9861, 59.17 fps, max gap 18 ms. That matches the bullet's second take. **Minor:** the bullet's other take (1798/1800, 59.9 fps, 19 ms gap) is not in evidence. The result does not depend on it. |
| U3 | finding recorded: yes | `evidence/WP11/U3-overlay-cursor.json` | PASS. Reissue: 12–13 positions at 30 fps and 24–25 at 60 fps (563–683 overlay calls per glide). CSS: 12–13 at 30 fps and 24–25 at 60 fps (1 call). showActions: 16–18 at 60 fps. Nav check: 80 magenta pixels before, after goto and after reload; 0 after dispose. All match the bullet. **Minor:** the `actions` 30 fps run timed out. Only the evidence note records this; the bullet does not. |
| U4 | finding recorded: yes | `evidence/WP11/U4-storage-after-close.json` | PASS. Ran on both Playwright Chromium and Chrome, non-persistent and persistent, with `page.close()` and CDP `closeTarget`. In every case the close event came in 4–7 ms, the context and browser stayed up, and `storageState` held cookies `js` and `srv` plus localStorage `token`. `window.close()` was ignored, as the bullet says. A real tab-× click was not tested, and the bullet says so. Consequence: WP14. |
| U5 | finding recorded: yes | `evidence/WP11/U5-headed-screencast.json` | PASS. pw 30 fps: 0.96 (28.8). pw 60 fps: 0.9967 (59.8). Chrome 30 fps: 0.9667 (29). These match the bullet. Depends on U6. |
| U6 | finding recorded: yes | `evidence/WP11/U6-headed-launch.log` | FAIL, with no written fallback; the bullet escalates to the Lead with options (a), (b) and (c). The log matches the bullet. `browserPath()` is the headless shell 152 (headless UA). Playwright's chromium-1254 (158) and `channel: 'chrome'` (157) can run headed, but `setup.sh` installs neither. WP14 is blocked on a Lead decision. |

## Scope

- `git diff --stat 754663c..HEAD` touches only the files WP11 owns: `ac-run.mjs`, `evals/trace/ac-run.test.mjs`, `decisions.md` (6 lines added under Run-time findings, nothing else), `wp/WP11/handoff.md`, and `evidence/WP11/*`. The one other change is `wp/WP11/brief.md`, from the Lead's commit `d2d239d`.
- No MP4, WAV or other media in the diff. Evidence is JSON and logs only.
- Brand strings: `grep -rli peakflames` over `skills lib schemas brand-packs vendor scripts evals` finds 0 hits.
- No contract (schema) changes.
- Note, not a failure: the U6 log has absolute local paths, including the user's home directory. It lives under `docs/`, outside the runtime tree.
