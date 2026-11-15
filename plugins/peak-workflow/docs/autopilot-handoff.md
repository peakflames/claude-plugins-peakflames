# Handoff — peak-workflow autopilot (written 2026-11-14, evening)

For a fresh session, on any machine. Everything is on `feature/peak-workflow-autopilot-poc`
(pushed). This file replaces the earlier handoffs kept outside the repository.

## Where things stand

- **The first real queue finished.** On the PeakMedia project all queued epics are merged and
  fetched into the owner's local `develop` (not pushed there). No autopilot run is going.
- **The plugin** is at `[3.1.0] — UNDER DEVELOPMENT`. Tests: 172 pass, 11 skipped (the skipped
  ones need the real `claude`: `AUTOPILOT_LIVE=1`), lab suite 10 pass.
- **Not merged to `develop`, not released**, by the owner's decision. Next phase is beta use.
- **The cockpit mod is deferred** (`autopilot-cockpit-mod-handoff.md`, note at its top): the run
  announces itself in chat instead, because chat is the one display every device has.

## How to work with the owner

- Short, plain messages. Lead with the result; say what he must do now, or "nothing".
- Assume a non-technical owner: do routine commands for him, never hand them over. He often
  checks in from a phone.
- Never answer an autopilot popup or gate for him. Never write into a project's autopilot
  workspace (`<project>.autopilot`); reading is fine (`driver.mjs status` and `preflight` only
  read; `report`, `continue` and `configure` write).
- New work on this repository normally arrives as GitHub issues planned with `/triage`. The
  autopilot proof of concept has been worked directly on sub-branches of the PoC branch.

## Working rules

- Work in a worktree on a sub-branch cut from `feature/peak-workflow-autopilot-poc`; merge
  `--no-ff` into the PoC branch, then push (pushes to this branch have been pre-approved; ask
  for anything else).
- **A session using the plugin reads it live from the main checkout.** Merge only when no
  driver is running there. `pgrep -f "driver.mjs run"` can match your own shell: check the
  workspace's `lock` file pid instead (`kill -0 <pid>`). A change that touches no referee hook
  and no skill a running session uses is safe mid-run; when unsure, wait.
- Both suites before each code merge: `node --test plugins/peak-workflow/scripts/autopilot/test/`
  (about 5 minutes) and `node --test scripts/autopilot-lab/test/`. Do not edit files in a
  worktree while a suite runs there. Golden report files:
  `UPDATE_GOLDEN=1 node --test plugins/peak-workflow/scripts/autopilot/test/report.test.mjs`.
- Shell heredocs that embed Python or JavaScript may be blocked: write a patch script to a temp
  file and run it. Make patch scripts all-or-nothing (check every anchor before writing).
- Changelog bullets ≤ 50 words under `[3.1.0] — UNDER DEVELOPMENT`; commits
  `<type>(peak-workflow): … (v3.1.0)`; no attribution lines.

## Open issues, most costly first

### Core behaviour — do these next

1. **A failed merge check throws away the verifier's work.** `rollback()` resets the integration
   line and the epic branch, so a rerun repeats the whole final check (twice on 2026-11-14:
   about $4.50 and $3). Keep the verified branch; re-judge only the merge.
   *`driver.mjs`: `rollback`, `doCheckVerify`, `checkVerify`.*
2. **A merge check that fails for any reason other than a small-fix limit parks with no
   question.** The epic then looks eligible and would be planned and built again from scratch.
   Only the small-fix case has a gate (`fixLimitGate`). *`doCheckVerify`, `missingResumeGates`.*
   Do 1 and 2 together: same code.
3. **The run budget is not enforced inside a step.** Cost is known only when a step ends; a
   chain finished at $80.51 of $80. *`driver.mjs` spend accounting (evaluation gap G2).*
4. **An attending session keeps the skill text it loaded.** After a plugin update it works from
   stale instructions until `/peak-workflow:autopilot` is run again; seen several times.
5. **The fake `claude` hid a real bug.** It read every `--append-system-prompt-file`; the real
   one keeps the last, so the owner's recorded look never reached a verifier (issue 44). Run
   the 11 live tests (`AUTOPILOT_LIVE=1`) and look for other places the double is kinder than
   the real thing.

### Built on 2026-11-14, not yet seen live

6. The run announcer (`chainOf`, `queueLine`, "Next: …", the relayed heartbeat) and the single
   spend figure; the $250 default budget and `configure --run-budget`; "Bring it in for me" and
   the tidy-up after it; the relaunch questions (`relaunch.ask`); "Start it so I can check for
   real" at the look and `how: live`; keeping a look across a repair that changes no screen;
   "Combine them for me" on a diverged project.

   Seen live and working: the joined instruction file, the referee refusing a repeated check,
   "Not now" not carried forward, a no-verdict check parking instead of failing, the standing
   answer for small fixes and its "allow a fix of that size?" question, the planner's
   contradiction line, `"look": "after"`.

### Smaller (numbers are from the UAT notes)

7. The launch check spends real money before the real-money question (5).
8. One flaky gate failure is reported as "every epic will probably stop" (6).
9. No path for a launch gate that fails on a product bug (7), or for a free-text launch answer
   such as "just do one epic" (8).
10. The launch popup lists epics by ID only (10).
11. The builder's handoff says "CANNOT VERIFY" where the report says "not proven for real" (15).
12. The independent review can be very short: 49 seconds on a 935-line change (16). Unexamined.
13. The build missed a console error the verifier later found (38).
14. Gate answers are dated in UTC (40).
15. The look question for a UI epic with no pictures is asked in chat, not the popup (41).
16. `preflight --json` is 31 KB (23).

### Housekeeping

17. The verifier makes scratch git worktrees under `/tmp`, outside the clone, and tries forced
    git commands the referee refuses. Harmless so far.
18. `skills/autopilot/SKILL.md` is about 1,080 lines; every attending session carries it.

## Where the detail is

- Every finding, in the order it happened (1–49), with what was fixed:
  `plugins/peak-workflow/docs/uat-2026-11-13b-autopilot-first-run-of-fixes-peakmedia.md`.
  Earlier UAT notes are beside it.
- What changed: `git log a2d716b..feature/peak-workflow-autopilot-poc` and
  `plugins/peak-workflow/CHANGELOG.md` `[3.1.0]`.
- The driver's own design notes: `plugins/peak-workflow/scripts/autopilot/SPIKE.md`,
  `EVALUATION.md`; the plugin's rules: `plugins/peak-workflow/CLAUDE.md`.
- Project settings a project may carry (`<project>/.claude/peak-workflow/autopilot.json`):
  `setup`, `copy`, `readOnly`, `network`, `budgets`, `onPark`, `look`, `runBudgetUsd`,
  `smallFixes`. Written through `driver.mjs configure`.

## Suggested skills

- `mattpocock-skills:diagnosing-bugs` and `mattpocock-skills:tdd` — issues 1–3 (write the
  fake-`claude` scenario first; patterns in `test/resume.test.mjs`).
- `mattpocock-skills:writing-for-agents` — any edit to `SKILL.md` or the rule texts sessions
  are given (`PLAN_RULES`, `BUILD_RULES`, `VERIFY_RULES`).
- `code-review` (low or medium) — before merging a driver change.
