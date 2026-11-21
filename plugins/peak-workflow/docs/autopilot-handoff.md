# Handoff — peak-workflow autopilot (written 2026-11-14, updated 2026-11-21)

For a fresh session, on any machine. Everything is on `feature/peak-workflow-autopilot-poc`
(pushed). This file replaces the earlier handoffs kept outside the repository.

## Where things stand

- **The first real queue finished.** On the PeakMedia project all queued epics are merged and
  fetched into the owner's local `develop` (not pushed there). No autopilot run is going.
- **The plugin** is at `[3.1.0] — UNDER DEVELOPMENT`. Tests: 195 pass, 11 skipped (the skipped
  ones need the real `claude`: `AUTOPILOT_LIVE=1`), lab suite 10 pass.
- **Not merged to `develop`, not released**, by the owner's decision. Next phase is beta use.
- **The cockpit mod is deferred** (`autopilot-cockpit-mod-handoff.md`, note at its top): the run
  announces itself in chat instead, because chat is the one display every device has.

## Alpha feedback, issue #41 (2026-11-20)

A second owner ran the alpha on Windows 11 (project Wayframe) and filed #41: 9 bugs, 7
improvements. Five bugs and two improvements are fixed on this branch, each with tests against
the fake `claude`; none has been seen in a real run yet, and nothing here was run on Windows.

| Item | What changed |
|---|---|
| B2 | Tests are told from code by file name (`lib.mjs`: `testNamed`, `testNamedDirs`, `isTestPath`), one rule for the referee and the driver. A listed directory with no test-named file keeps the whole-directory rule |
| B5 | The final check has its own fix round (`verifyFixRounds`); a requirement that only lacks a test gets it on the standing answer for small fixes (`testOnly`); a FAIL after the repair parks with a `resume` gate at `FIX_BUILD` (`verifyFailGate`) |
| B1 | The auditor follows `sandbox`; it was always sandboxed |
| B4 | An unreadable run `config.json` stops the launch (`runConfig`); the launch line passes `--project`; the log states the run's limits |
| B9 | An approved amendment is carried into an epic that is started over (`enter`, the from-scratch path) |
| I2 | `onPark` follows the launch answer: owner away → `continue`, here or not asked → `stop`; an `onPark` in the project file wins (`loadConfig`, `onParkFrom`). Preflight reports `launch.config.onPark` as null when nothing sets it |
| I6a | Autopilot answers technical stops itself: one rule, `standingAnswer` (`lib.mjs`), one count per epic (`autoContinue`). Covers `resume` gates marked `technical`, `plan-lint` (re-plan) and `audit` findings (repaired; never `never-ran-real`). Past the count: `atLimitAsk`, "Try again" / "Leave it for now" |
| I6b | No by-hand path in anything the owner reads: the report, gate `why` text, `SKILL.md`. A gate's `resume` line and `report.json`'s `fetch` stay as records |

**Risk the owner accepted with I6a (decision 4, 2026-11-21).** A fix the final check makes to
the product itself, or one over the small-fix size, now merges on autopilot's own answer:
nobody but that same final check judges it. Two refusals still hold and have tests: a change
to a requirement file, and a test that loses checks (`checkVerify`, `autoFix`). The second is
a heuristic: test-named files in the listed test directories, net loss of assert/test lines.
Every such fix is listed for the owner (`status.fixes` with `auto`, and the report); keep
that list complete. An answer the owner did not give to the gate's own question (autopilot's,
or "Try again") is `resumed.unasked` and never counts as their approval of a fix.

Left as they were, found by the review of I6a:
- A standing answer whose branch has moved or no longer merges is void, and the epic is then
  planned again from scratch without a question (`gateFacts`, `enter`). Old behaviour, now
  reachable from more gates.
- A final check that ended with no verdict because the owner put a check off is re-run on the
  standing answer, and asks again; it spends the epic's count.
- "Stopped N times" counts autopilot's own answers plus this stop, not stops the owner answered.
- The report reads `autoContinue` from its own run's config; `status` from the current run's.
- `launch.warn` lines for a clone that is ahead or diverged still carry a `git fetch` command;
  the skill paraphrases them.

Still open from #41: B3 (preflight text ignores `look`), B6 (no retry for a flaky base check),
B7 (numbering by phase index), B8 (36 driver tests fail on Windows before any change), I1,
I3–I5, I7, and I6c: autopilot cannot yet repair a red base, a preflight refusal or a merge
conflict itself. Only the wording changed ("it needs someone who maintains the code"); the
repair is its own issue, with #40 item 9. Add I2 and the wider standing answer to the
live-proof checklist (#39).
Ask the reporter to confirm B1 and B4 on their machine; their local commit `4dcf789` is
superseded by the B1 change here.

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
  (about 5 minutes) and `node --test scripts/autopilot-lab/test/`. Run them under
  `caffeinate -i`: a laptop that sleeps mid-suite fails a test by timeout. They need Python 3.11+
  first on `PATH` (`tor-lifecycle` probes `python3`); with an older one every driver test stops
  at the format guard and fails with a null reason. Do not edit files in a
  worktree while a suite runs there. Golden report files:
  `UPDATE_GOLDEN=1 node --test plugins/peak-workflow/scripts/autopilot/test/report.test.mjs`.
- Shell heredocs that embed Python or JavaScript may be blocked: write a patch script to a temp
  file and run it. Make patch scripts all-or-nothing (check every anchor before writing).
- Changelog bullets ≤ 50 words under `[3.1.0] — UNDER DEVELOPMENT`; commits
  `<type>(peak-workflow): … (v3.1.0)`; no attribution lines.

## Open issues, most costly first

Tracked on GitHub (peakflames/claude-plugins-peakflames): **#35** items 1–2, **#36** item 3,
**#37** item 4, **#38** item 5, **#39** item 6 (live-proof checklist), **#40** items 7–18.
Plan each with `/triage <issue>`.

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
