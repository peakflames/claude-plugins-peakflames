# AC-UAT-05 — result (run by the user, 2026-11-10)

Session `18373780-e5e5-465a-9e7c-d65d5f91b856` (interactive, `claude --plugin-dir`), scratch `~/tmp/pm-w2v-uat/AC-UAT-05/`.
Checked by the Lead from the transcript, the take manifest, and the contact sheet.

| Then | Result |
|---|---|
| The skill asks the user to sign in through `capture signin` | PASS — Claude ran `capture.mjs signin http://127.0.0.1:4173`; the user signed in in the window and closed the tab |
| Claude types no password | PASS — no fill/type tool call against the sign-in form; exploration used `playwright-cli state-load` of the saved session |
| The take opens on the dashboard | PASS — every still (0.00, 2.50, 7.60, 12.60, 15.03 s) shows "Dashboard"; `x-take.signedIn: true` |
| No sign-in form in any still | PASS — none in the sheet or the first/last frames |
| Offer to delete the session file | PASS — hand-off ends "Delete the saved session at …/auth/127.0.0.1.json?"; the user said yes; file removed |
| The file is outside `web2video/` | PASS — `~/.cache/peak-media/auth/127.0.0.1.json` (dir 0700) |
| One approval question before recording | PASS — one AskUserQuestion before the first capture |

Other: 15.1 s against 15 s; probe-spec `--preset web` PASS; no page errors.
Covers AC-W2V-20 (signin saved, mode 0600, outside the project), 21, 22, 37.

**New defect D11 (minor, skill):** the hand-off gave the MP4 path relative to the start dir after the session had `cd`'d into the project, so the user's `open` failed. Hand-off should print the absolute path.
**Note:** after the gate the session re-recorded once with a `setup()` tweak to aim the cursor at text (no word or timing change) — within step 9's "fix and re-record" latitude.
