# Handoff — peak-workflow autopilot (written 2026-11-14, updated 2026-11-23)

For a fresh session, on any machine. Everything is on `feature/peak-workflow-autopilot-poc`
(pushed). This file replaces the earlier handoffs kept outside the repository.

## Where things stand

- **The first real queue finished.** On the PeakMedia project all queued epics are merged and
  fetched into the owner's local `develop` (not pushed there). No autopilot run is going.
- **The plugin** is at `[3.1.0] — UNDER DEVELOPMENT`. Tests (2026-11-23, after the run fixes
  below, before the quote-aware splitter): 268, of which 254 pass, 1 fails (known, see below) and
  13 are skipped (the skipped ones need the real `claude`: `AUTOPILOT_LIVE=1`; all 13
  passed on 2026-11-21), lab suite 10 pass. The helper's tests (`tests/peak-workflow/`,
  Python 3.11+): 269, 2 fail in `test_wrapper.py` on the owner's machine on the unchanged
  base as well (cause not looked for).
- **Pilot Light** (the second real project) is mid-queue. Run `20261123-140347` (prototype)
  merged Waiting and Conversation drawer and parked Outstanding on a question; a prototype run
  started 19:26 on 2026-11-23 plans Outstanding again, then runs Session stream (F5hv9T4).
  What it proved is under Step 12 and "2026-11-23 session" below.
- **Not merged to `develop`, not released**, by the owner's decision. Next phase is beta use.
- **The cockpit mod is deferred** (`autopilot-cockpit-mod-handoff.md`, note at its top): the run
  announces itself in chat instead, because chat is the one display every device has.

## Alpha feedback, issue #41 (2026-11-20)

A second owner ran the alpha on Windows 11 (project Wayframe) and filed #41: 9 bugs, 7
improvements. Five bugs and two improvements are fixed on this branch, each with tests against
the fake `claude`. The reporter confirmed B1, B4 and I2 (owner away) in a real run on Windows on
2026-11-21; the rest has not been seen in a real run, and our suites were not run on Windows.

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

The review of I6a left six problems unfixed, and #41 still has B3, B6–B8, I1, I3–I5, I7 and
I6c open (I6c is **#42**: only the wording changed, "it needs someone who maintains the
code"). All of them are in the to-do list below.

**The reporter's follow-up (2026-11-21, #41 comments and #43).** New items B10–B16 and I8, B3
seen again, and two Windows fixes he carries locally that this branch lacks; his patches were
asked for on #41. #43 tracks B11 only (sessions cannot use MCP connectors); its body is a pasted
evaluation whose other lessons repeat #41. His run logs are on his machine
(`Wayframe.autopilot/runs/20261121-130134/`). All of it is in the to-do list below.

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
  `--no-ff` into the PoC branch. Ask before every push, this branch included (owner,
  2026-11-22); remind him when commits are waiting to be pushed.
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

## To-do list, in working order

Work the steps top to bottom. Tick a box when the item is fixed and tested; a step is done when
all its boxes are ticked. Order and criticality were agreed with the owner on 2026-11-21 and
reordered the same day after the Windows owner's real runs (#41 comments, #43).

Criticality: **C1** something wrong could merge · **C2** wastes money or a night · **C3**
confuses the owner, nothing lost · **C4** housekeeping.

Tracked on GitHub (peakflames/claude-plugins-peakflames): #35–#43, named on each item. Plan each
with `/triage <issue>`. Items marked *no issue* are tracked only here. Numbers in brackets are
from the UAT notes; B and I numbers are from #41 (B10–B16 and I8 are in its comments).

How far each item reported on 2026-11-21 was checked: **in code** = the cause was found by
reading the code; **code agrees** = the code is consistent with the report, cause not pinned
down; **not checked** = taken from the report as written. None was reproduced here.

Why this order:
- Step 1 comes first: these stopped the last real runs, and the Windows owner is the one
  running autopilot for real. He carries two of the fixes as local patches (asked for on #41).
- Step 2 before the rest: every fix is trusted only as far as the fake `claude` is.
- Step 3's four items are the same code (`doCheckVerify`, `missingResumeGates`, `enter`): a
  stop that leaves no way back but starting over.
- Step 5 comes before the real run in step 6: a stale attending session would spoil what the
  run proves.
- In step 8, B6 and B10 come before #42: otherwise autopilot would try to repair a project that
  is only flaky or was only asleep. #42 also covers "a launch gate fails on a product bug".
- Step 10's items share the launch check and its one screen; do them as one piece of work.
- Step 7 is independent.

### Step 1 — What stopped the last real runs (C2)

- [x] **A resumed epic is not put back on its branch** (#41 B14). Fixed 2026-11-21, tested
  against the fake `claude`: before every session the driver checks the epic's branch out and
  verifies HEAD (`driver.mjs`, `ensureOnBranch`, called from `step`). Uncommitted work comes
  along with the checkout. A checkout that fails parks the epic as a technical stop; that path
  has no test, and a continued build parked that way is started from the top. Not seen in a
  real run or on Windows.
- [x] **Scratch files left by a session block the next run** (#41 B15). Fixed 2026-11-21,
  tested against the fake `claude`: uncommitted and untracked files are set aside under
  `refs/autopilot/leftover/` in the clone, never deleted, and the log and report say how many
  (`driver.mjs`, `setAside`), at launch, at the readiness proof (`prepare.json`, `setAside`)
  and before each epic. Left: nothing brings a set-aside file back for the owner; a launch
  that is refused after setting files aside says so only in the previous run's log. Not seen
  in a real run or on Windows.
- [x] **`**Not decided yet:** none` parks every epic** (#41 comment). Fixed 2026-11-21, tested
  against the fake `claude`: a line that names nothing is the all-clear (`driver.mjs`, `tbd`).
  Left: `wrapup-epic`'s deferred-value grep still fails a skeleton epic on any such line, and
  whether `/peak-workflow:setup` writes the `none` form itself is not checked. The reporter's
  patch (#41, 2026-11-22) was compared and ours kept: ours still parks `none of the …` and
  `- database`, which his pattern lets through. He then found on Windows (#41, 2026-11-22) that
  `none — <a reason>` still parked every epic; fixed 2026-11-21 with his suggested rule: `none`,
  `nothing` or `n/a` followed by a dash or colon and text is also the all-clear.
- [x] **`tor-lifecycle` cannot find its folder from a backslash path** (#41 comment). Fixed
  2026-11-21: either separator ends the folder. Tested on macOS with a stand-in path; not run
  on Windows. The reporter's patch (#41, 2026-11-22) is the same fix; ours also handles a path
  that mixes both separators.

### Step 2 — Make the tests trustworthy (C1)

- [x] **The fake `claude` is kinder than the real one** (#38). Done 2026-11-21.
  - **The live run.** All live tests (now 13) pass on the real `claude` 2.1.323, about $4 in
    all. They run on Sonnet or Opus only (owner's decision; never Fable) and each asserts the
    model the session reports. One failed at first: "a read outside the clone is denied". The
    test was stale, not the code: the sandbox has been off by default since 2026-11-13, and
    with it off sessions read outside the clone. It is now two checks, sandbox on and off.
    `--append-system-prompt-file`, `--permission-prompt-tool` and `--max-turns` are not in
    `claude --help` of 2.1.323 and still work.
  - **The fake goes through the referee.** Every scripted action a real session would need a
    tool call for (`write`, `rm`, `sidecar`, `commit`, `merge`, `branch`, `checkout`, `exec`)
    is put to the session's real `PreToolUse` hook first; a refused action is skipped and listed
    in `permission_denials`. `unchecked: "<why>"` skips the hook and must give its reason. A
    script marks the actions it expects to be refused with `refused: true`; a refusal it did
    not expect, or an expected one that did not come, fails the test (`fake-claude.mjs`,
    header). Switching it on failed 13 of 200 tests and one lab test. None
    was a fault in the referee or the driver: 9 were test bookkeeping written into the
    workspace, 3 did on purpose what the referee refuses, to test the driver's check behind
    it, and 2 edited an existing test before recording the reason. The suite takes about 6.5
    minutes instead of 5.
  - **Open: differences the fake still has** (owner's decision: fix only what the live tests
    show). It accepts any flag, a flag given twice, and `--resume` of a session that never
    existed. It enforces no turn or money limit. A resumed session's cost is not the two
    sessions added up. The shared build script switches to the epic branch itself, which hid
    B14. Its `Edit` and `Write` calls carry no real `old_string`.
- [x] **The referee's guards** (*no issue*; owner's decisions of 2026-11-21). The referee has
  two jobs: plumbing autopilot cannot run without (questions R8, the plan R9, the STOP file R1)
  and guards. The guards were reviewed because two refused ordinary work.

  | Guard | Decision | What changed |
  |---|---|---|
  | Containers, background commands (R4, R6) | Keep | Nothing |
  | `git push` (R3) | Keep | Nothing |
  | Writes outside the clone (R2) | Keep; add a scratch folder | Each working session gets `<step>/scratch/` in the workspace (`scratchDir`, `scratchRule`, `AUTOPILOT_SCRATCH`); a refused write names it. `/tmp` is left as it was |
  | Reads outside the clone (R2) | Loosen for what `CLAUDE.md` points to | A single existing file `CLAUDE.md` names in backticks is readable (`claudeMdReads`, the run's `readFiles`). In `~/.claude` only below `scripts/`, `bin/` or `tools/`; never a hidden file or folder, never where credentials live |
  | Test edits without a recorded reason (R7) | No change | Nothing |

  What the code showed, against what was assumed: with the sandbox off, `/tmp` is writable
  on macOS and Linux and refused only on Windows (the referee does not know `/tmp` there) or
  with the sandbox on; reads outside the clone are open with the sandbox off, except
  credentials and `~/.claude`. Both refusals reported on #41 fit that. **The tally of real
  refusals was not made:** the PeakMedia run logs are on another machine. Tested against the
  fake and by three live rule checks on macOS (a real session used its scratch folder without
  being refused first). Not seen on Windows; the reporter is asked to confirm on #41. Left:
  - The scratch folders are never emptied, and their size is not counted by the growth cap.
  - `CLAUDE.md` is a file sessions edit and merge, so the list of readable files can grow
    without the owner typing it. It is shown at every launch; nothing asks him to confirm it.
  - The referee's own credential checks compare names by case (`cat ~/.SSH/id_rsa` passes
    with the sandbox off on macOS). Old behaviour, found by the review; belongs to step 4.
  - A command can still reach the workspace through a variable it builds itself (`D=$PWD/..`).
    Old behaviour: the Bash check is best effort. The scratch folder's own name is refused in
    any form but `$AUTOPILOT_SCRATCH`.

### Step 3 — No stop that can only be started over (C2)

- [ ] **A failed merge check throws away the verifier's work** (#35). `rollback()` resets the
  integration line and the epic branch, so a rerun repeats the whole final check (twice on
  2026-11-14: about $4.50 and $3). Keep the verified branch; re-judge only the merge.
  *`driver.mjs`: `rollback`, `doCheckVerify`, `checkVerify`.*
- [ ] **A merge check that fails for any reason other than a small-fix limit parks with no
  question** (#35). The epic then looks eligible and would be planned and built again from
  scratch. *`doCheckVerify`, `missingResumeGates`.*
- [ ] **"Real — fix before verify" after the repair is used goes straight to FAILED** (#41 B13;
  in code). The reviewer gate offers the answer although `fixRounds` is already 1; the owner
  cannot then change to "verify as built". Offer only answers that are possible, or write a
  resume gate into VERIFY. *`driver.mjs:2562`, `missingResumeGates`.*
- [ ] **An epic is started over without asking** (*no issue*; review of I6a). A standing answer
  whose branch has moved or no longer merges is void, and the epic is planned again from
  scratch without a question. Old behaviour, reachable from more gates since I6a.
  *`gateFacts`, `enter`.*

### Step 4 — Strengthen the guards on what merges unasked (C1)

- [ ] **The test-weakening guard is a heuristic** (*no issue*; review of I6a). It is the main
  brake on a fix autopilot allows itself: test-named files in the listed test directories, net
  loss of assert/test lines. A weakening it does not recognise merges unasked.
  *`checkVerify`, `autoFix`.*
- [ ] **The final check saw a defect and passed it without a word** (*no issue*; Pilot Light,
  run `20261122-090420`). The verifier noted that the "Page not found" picture carries the
  wrong text, did not fix it and did not park; the epic merged. What the verifier notes and
  leaves should reach the owner (the report, or a question).
- [ ] **The independent review can be very short** (#40) (16): 49 seconds on a 935-line change;
  48 seconds on Pilot Light's whole walking skeleton (2026-11-22; it did find the deleted
  lockfile, rated low); 47 seconds on its second epic (run `20261122-094004`, 4 findings, none
  that park). Unexamined.

- [x] **The scope check made the walking skeleton worse** (*no issue*; Pilot Light, run
  `20261122-025513`; owner's decisions of 2026-11-22). It refused the new `bun.lock` and the
  setup and run commands the skeleton wrote into `CLAUDE.md`; the one repair round deleted the
  lockfile, git-ignored it and reverted `CLAUDE.md`, and the check passed. Now: a lockfile is
  in scope when its manifest changed in the same epic (`MANIFEST_OF`); the first epic of the
  plan, if it has no dependencies, may change `CLAUDE.md` in `SKELETON_SECTIONS`, and then
  always parks for a look with the changed lines in the gate (`claudeMd`), whatever `look`
  says. Also fixed: the `CLAUDE.md` rule skipped every changed line that began `+-` or `--`
  (any list item). Tested against the fake (`test/scope.test.mjs`); not seen in a real run.
  Left: the same `(?![+-])` pattern is in the test-weakening count (`driver.mjs`, the
  `TEST_CHECK_LINE` filter), where it skips a removed line whose own text starts with `-`.

### Step 5 — Keep the attending session current (C2)

- [ ] **An attending session keeps the skill text it loaded** (#37). After a plugin update it
  works from stale instructions until `/peak-workflow:autopilot` is run again.

### Step 6 — Prove it in one real run (C1)

- [ ] **Tick off the live-proof checklist** (#39): the 2026-11-14 changes (run announcer, single
  spend figure, $250 budget and `configure --run-budget`, "Bring it in for me", "Combine them
  for me", the relaunch questions, "Start it so I can check for real", a look kept across a
  repair, the 80-line small-fix limit) and the 2026-11-21 changes (I2, I6a, the at-limit
  question, no by-hand offers), and step 1's fixes (B14 a resumed epic put back on its
  branch, B15 leftover files set aside, `Not decided yet: none — <a reason>`), the scratch
  folder and the files `CLAUDE.md` names. Open a bug for any that misbehaves.

  **The test project from 2026-11-22 is Pilot Light** (`~/github/peakflames/pilot-light`,
  github.com/peakflames/pilot-light, private): a dashboard for peak-workflow and autopilot,
  planned with the plugin's own skills (13 epics, 168 requirements, screens, four
  requirements a person confirms). Its planning sessions listed 28 problems in the planning
  skills (`docs/session-handoff.md` there); not yet filed. Its last epic (F5hv9T4) must not be
  queued until a real step folder with `stream.jsonl` is in its `samples/`. Seen working there
  on real runs: the no-tests-yet start, the Python check, a file `CLAUDE.md` names, and a
  resumed epic put back on its branch (B14). Its walking skeleton was planned, built,
  repaired, reviewed, looked at and merged from an empty repository on 2026-11-22 for $15.70
  (build and final check on Opus 5.5): the first epic autopilot has built with no code to
  start from. Also seen there: the owner's look with 25 pictures, a small fix made by the
  final check on the standing answer, and the scratch folder in use.

  Its second run (`20261122-094004`, 11 epics queued, owner away, $6.38, 20 minutes) merged
  nothing: one epic parked for its operator-observed requirement, two parked on planner and
  builder questions about requirements that did not match the samples (mistakes in the
  project's plan, not autopilot's), eight were blocked behind them. Seen working: setup with
  the lockfile, a planner's amendment question before any build spend, a deferral question,
  dependents blocked while independent epics went on, a clean end with a report. Not reached:
  the lockfile-with-its-manifest rule in the scope check, the final check, a merge.

  Seen live and working: the joined instruction file, the referee refusing a repeated check,
  "Not now" not carried forward, a no-verdict check parking instead of failing, the standing
  answer for small fixes and its "allow a fix of that size?" question, the planner's
  contradiction line, `"look": "after"`. On Windows, 2026-11-21 (the reporter's run
  `20261121-130134`): B1, B4, and I2 with the owner away (the run continued past a park and
  blocked the dependent). I2 with the owner there is not yet seen.

### Step 7 — Windows tests (C2)

- [ ] **36 driver tests fail on Windows before any change** (#41 B8).

### Step 8 — A project that is broken, flaky or asleep before or during a run (C2)

- [x] **A project with no code yet stopped as "base red"** (*no issue*; found 2026-11-22 while
  preparing the Pilot Light test project, in code). The base test run failed because there was
  nothing to test. Now: when no declared test directory holds a committed file, the base run
  and the probe are skipped and the first epic's checks run the tests (`noTestsYet` in
  `driver.mjs`). Not proven on a real run yet: Pilot Light's first epic is that proof.
- [x] **The Python check stopped the launch although a current Python was installed** (*no
  issue*; found 2026-11-22 on Pilot Light's first launch). macOS's Python 3.9 came first on
  PATH and hid Homebrew's. `scripts/tor-lifecycle` now tries `python3` in every PATH folder,
  then `/opt/homebrew/bin` and `/usr/local/bin`.
- [ ] **A new project's first epic has 22,386 files set aside before its final check** (*no
  issue*; Pilot Light, run `20261122-090420`). Build output and `node_modules` left by the
  build are untracked on the integration line, whose `.gitignore` does not know them until the
  epic merges, so `setAside` stores them all. The final check still passed; time and safety of
  a set-aside that large are not examined.
- [ ] **`setup` is not run for a new project's first epic** when it is guarded by a file the
  epic creates (`if [ -f package.json ]`): it runs on the integration line before the branch
  is checked out. The first real run of `setup` is the run after the merge. Not examined.
- [ ] **A test that times out leaves its fake `claude` running** (*no issue*; seen 2026-11-21:
  six stray `fake-claude.mjs` processes after timed-out attend tests). Test-only; kill the
  child when a test ends.
- [ ] **A laptop that sleeps during the base check reads as a red base** (#41 B10; in code).
  Any failing exit ends the run; nothing looks at how long the check took. Treat a check that
  ran far past its usual time as interrupted and run it once more; on Windows hold a
  keep-awake request for the driver's life, or warn at launch (the warning exists for macOS
  only). *`driver.mjs:2769`, `:2844`.*
- [ ] **The base check has no retry for a flaky test** (#41 B6). One slow test ended two runs.
- [ ] **One flaky gate failure is reported as "every epic will probably stop"** (#40) (6). C3.
- [ ] **Autopilot cannot repair a red base, a preflight refusal or a merge conflict itself**
  (#42, I6c). Includes "no path for a launch gate that fails on a product bug" (#40) (7).

### Step 9 — The budget (C2)

- [ ] **The run budget is not enforced inside a step** (#36). Cost is known only when a step
  ends; a chain finished at $80.51 of $80. *`driver.mjs` spend accounting (evaluation gap G2).*

- [ ] **A session that is killed costs nothing on the books** (*no issue*; Pilot Light,
  2026-11-22, runs `20261122-023444` and `-025133`). Two planners stopped by the STOP file had
  made 20 and 30 model turns; neither has a `result.json` and the run reads $0.00. Cost comes
  only from the session's closing line, which a killed session never writes. The same holds
  for a time limit or a crash. Belongs with #36.

### Step 10 — The launch check and its screen (C2 and C3)

- [ ] **Sessions cannot use MCP connectors, and nothing says so up front** (#43, B11; in code:
  `--allowedTools` is fixed, `driver.mjs:868`). One epic spent four relaunches on a block no
  answer could change. Preflight should flag a requirement that needs an external app or API
  read-back as something a run cannot prove; every session should be told MCP tools are
  unavailable; a question caused by a host denial should park once, with only possible
  answers. C2.
- [ ] **The undecided-values check parks every epic** (#41, the reporter's comment of
  2026-11-22; not examined). A `TBD — set by the walking-skeleton epic` value or a
  `**Not decided yet:**` line that lists a layer parks every queued epic (`driver.mjs`, `tbd`).
  He suggests it should apply to the walking-skeleton epic only, since that epic is the one
  that settles those values. C2.
- [ ] **Requirement questions are the main cause of stops** (#41 I3). Ask them once at launch
  (a requirements check over the queued epics), not mid-night. C2.
- [ ] **The launch check spends real money before the real-money question** (#40) (5). C2.
- [ ] **The popup hides the "Ready to run" screen** (#41 I5). The question must carry the queue
  and limits itself.
- [ ] **The launch popup lists epics by ID only** (#40) (10).
- [ ] **No path for a free-text launch answer** such as "just do one epic" (#40) (8).
- [ ] **A setting changed during a run does not reach it** (*no issue*; Pilot Light,
  2026-11-22). The owner asked for Opus for the build one minute in: `configure` saved it, but
  the driver reads settings once, so it took a stop, a resume question and a relaunch. Ask for
  models on the launch screen, or let the driver read budgets again before each step. C3.
- [ ] **A run's files do not say which model and effort each step will use** (*no issue*;
  Pilot Light). Only a fresh `preflight` shows them. C3.
- [ ] **Autopilot's own settings file sets off its own warning** (*no issue*; Pilot Light).
  `launch.warn` says "1 uncommitted change(s) in the project" when the only one is the
  untracked `.claude/peak-workflow/autopilot.json` that `configure` just wrote. C3.
- [ ] **`decide` refuses when the repository has no `git config user.name`** (*no issue*;
  Pilot Light), although commits there carry a name from elsewhere. The skill text never
  mentions `--by`. Fall back to the commit author name. C3.
- [ ] **A stop the owner asked for leaves a question to answer before the next run**, even
  one minute into planning (*no issue*; Pilot Light). C3.
- [ ] **A format-guard refusal repeats the whole install hint** in `refuse` (*no issue*). C3.
- [ ] **Preflight text ignores `"look": "after"`** (#41 B3; in code, `driver.mjs:715`; the
  reporter saw it again on `93a8b35`).

### Step 11 — An approved amendment reaches every later step (C2 and C3)

- [ ] **The reviewer flags an amendment the owner already approved** as `test-weakened`, and the
  repair parks to have it confirmed (#41 B12; not checked). Pass decided amendment gates to the
  reviewer and the fix session, as B9 did for plan and build. C2: it cost a relaunch.
- [ ] **A person-only check quotes a requirement the owner already replaced** (#41 B16; not
  checked). Gate `checks`, `live` and `question` should name the current requirement.

### Step 12 — Time and progress (C2 and C3)

- [ ] **The full end-to-end suite runs several times per epic** (#41 I7). C2.
- [ ] **No hourly progress report** (#41 I1).
- [ ] **The first epic is announced as "5 of 8"** (#41 B7): numbered by phase, not by queue
  position.
- [ ] **One early stop idles most of an unattended run** (*no issue*; Pilot Light, run
  `20261122-094004`). The second epic of 11 parked in planning after one minute; eight epics
  depended on it, so the run ended in 20 minutes with the owner away. Unexamined: whether
  launch should warn when most of the queue hangs on one epic. C3.
- [x] **A check that needs another machine parks as if the owner could do it** (*no issue*;
  Pilot Light, gate `yZQYIVE-1`, 2026-11-22). TOR-01-bhQV3eP is operator-observed on Windows
  11; the owner was on a Mac. The skill's "Start it so I can check for real" offer assumes
  his machine meets the Given. Owner's wish: do not stop for it; carry on and report it as
  not checked here. C2.
  **Built 2026-11-22, in a prototype run only** (next item): the epic goes to the final check,
  the verifier is given `not-observed.md`, and the merge check passes the requirement only
  with an `unverified:` line that says "NOT OBSERVED"; a `verified:` line for it fails the
  merge. A full run still parks. **Not proven:** that a real verifier follows
  `not-observed.md` (the tests use the fake `claude`); if it does not, the merge check parks
  the epic rather than merging it as verified.
- [x] **Owner's idea: a lighter "prototype" strictness chosen at launch** (*no issue*;
  2026-11-22). Looks collected for the end, a planner's own amendment or a
  builder's deferral taken and recorded for review; failing tests, scope and pushing still
  stop. `look: "after"` covers part of it. He thinks Arun wants the same.
  **Built 2026-11-22** as the run's `mode` (`full` by default, `prototype`), asked at launch.
  Hook R8 takes "Amend TOR-…" when offered and a recommended "Fix now" or "Defer" (one per
  requirement, three per epic, the epic's own requirements only) and writes the gate already
  decided (`decided.prototype`); looks are skipped; `onPark` defaults to `continue`. The
  report and the closing screen list all of it under "Decided for you in this prototype
  run". Tests: `test/prototype.test.mjs`, and the R8 cases in `test/hooks.test.mjs`.
  **Changed 2026-11-23, on the owner's decision:** a full run does not rely on an amendment
  or a deferral a prototype run took for an epic not yet merged. When a full run resumes such
  an epic, `enter()` starts no session: it marks each of those `decided.prototype` gates
  superseded, writes the same question as a new undecided gate (`reask: {of, took, phase}`)
  and parks. The answer the prototype run gave re-enters where the epic stood; any other
  answer re-enters at the session that asked (`gateEntry`). A start from scratch supersedes
  them without asking. As a second guard, `approvedAmendments()` and the build and merge
  checks count a `decided.prototype` gate only when the run's `mode` is `prototype`. An epic
  that already merged is not reopened (it is only listed).
  Found while building it: in a full run the owner's own "Defer" never got through (the
  build check parked "a human decision", the next run planned again and asked again). Now a
  deferral gate a person answered "Defer" to (`ownerDeferred` in `lib.mjs`) passes the build
  and merge checks, in any run, for that requirement only, and hook R8 answers the final
  check's same question from it; a session that then recommends something other than
  "Defer" is asking the owner again. Tests: the "full run…" cases at the end of
  `test/prototype.test.mjs`, and "R8 the owner's own Defer" in `test/hooks.test.mjs`.
  Not proven against real sessions. Not covered: an epic with several prototype answers
  where the owner keeps one and changes another (coded: it re-enters at the earliest
  session that asked; no test).
  **Not proven, all against real sessions** (first proof: Pilot Light's next run):
  - A deferral end to end. After "Defer" the skill asks which later epic builds the missing
    part; the hook reminds the session once to use the epic it named, and a second ask parks.
    The final check must then recommend "Defer" for the same requirement and write the
    `waived:` line; otherwise policy answers "Stop" and the epic goes to its repair round.
  - The build check lets a deferring epic change the later epic's spec and status file, and
    allows one skipped test per `Deferred: <TOR>` marker. It does not check what was changed
    in those two files.
  - ~~An amendment's change record names the owner as approver.~~ Changed 2026-11-23: the
    record names `autopilot (prototype run)`, the build check requires it
    (`amendment-record`), and the project's `status` lists the requirement until a person
    keeps or changes it. Not proven: that a real session writes the record so.
  - The section prints the reverify command for an unobserved requirement. Every other
    command is kept out of `report.md` (#41 I6); the owner asked for this one.
  **What Pilot Light's prototype run `20261123-081039` proved (2026-11-23, real sessions;
  3 epics merged, 1 parked, 6 not started, $41.28, 08:11 to 10:06):**
  - Proven: a prototype run does not stop for a look at screens. `wotOahf` logged
    `prototype-skip`, kept 17 pictures, went to the final check and merged; `status` and
    `report.md` list it under "Looks that were skipped".
  - Proven: an amendment the owner approved in an earlier run reaches the next run's planner
    and builder without being asked again (`n2g5TvI`, TOR-03-BIA0vmf: "told 1 answer(s) the
    owner already gave"; scope passed "under the owner's approved amendment"). This answers
    "does an approved amendment survive a stop?" below: yes.
  - Proven: three epics in a row from plan to merge with no person (22 to 27 minutes and
    $8.56 to $13.02 each), one of them through a repair round (tests citing a requirement ID
    that does not exist).
  - **Not proven, because the run stopped before the Board and Run epics:** a requirement
    only a person can observe going to the final check as not observed (the verifier and
    `not-observed.md`); a planner's amendment taken by the run; a builder's deferral taken,
    end to end; the later epic gaining the deferred requirement.
  - Not proven at all, built the same day and tested only against the fake `claude`: a full
    run asking again what a prototype run took; the owner's own "Defer" passing the checks;
    the notes written into the status file after a merge (`unconfirmed-…:`); the project's
    `status` "Left for Later" panel.
- [x] **A usage limit is reported as an "infra error", retried, and never named** (*no
  issue*; run `20261123-081039`, `Vbz68Ea` build-1 and build-2). The owner's 5-hour limit was
  reached: `result.json` has `is_error: true`, `terminal_reason: "api_error"`,
  `api_error_status: 429`, and the text "You've hit your 5-hour limit · resets 1pm". The
  driver logged "infra error (success); retrying once in 300 s", the retry failed at once, and
  the run ended "stopped: infra" with the reason "infra error during build-2: success". The
  owner learned the cause from Claude, not from autopilot. Wanted: recognise a 429 usage
  limit, do not retry, stop the run saying in plain words that the usage limit was reached
  and when it resets (the session's own text), and say that the same command continues it.
  The resume gate it wrote was correct, and the standing answer decided it. C2.
  **Fixed 2026-11-23, tested against the fake `claude` only.** The owner chose to wait rather
  than stop: the driver reads the limit from the result and the stream's `rate_limit_event`
  (`resetsAt`), waits until two minutes after the reset, and resumes the same session; watch
  and `status` say it is waiting and until when. It stops the run (a resume gate for the owner, not a technical one: relaunching before the reset cannot cure it)
  only for a wait over 6 hours (a weekly limit), past the end time, or a fourth limit in one
  step. The same run showed a second fault, now fixed: the cut-off build re-entered at
  CHECK_BUILD, because its error result still says `success`, so the half-done branch went to
  the checks and a fix session (`Vbz68Ea` fix-1 in run `20261123-100729`). Not proven on a
  real limit yet.
- [ ] **An epic that extends a screen another epic owns gets no look** (*no issue*; same run,
  `n2g5TvI`). Its spec has no Screens table ("S-01 is owned by the skeleton; this epic
  extends it"), so it is not a "UI epic" and never stops for a look, in a full run either.
  Unexamined. C3.
- [x] **`status` gave the run budget as $250; the run's `config.json` says $243.62**
  (*no issue*; same run). Not a wrong number: runs chained by `continues` share one budget
  ($250); each run's `config.json` holds what was left of it when that run started ($250 less
  the $6.38 spent before). `status` showed the chain ("$47.85 of $250"), the report the run
  ("$41.28 of a $243.62 limit"). Fixed 2026-11-23: the report and the run log now give both
  ("spent $41.28 in this run; with the 2 runs before it, $47.66 of the $250 budget is spent").
- [ ] **The watch repeats its progress line once per blocked epic** (*no issue*; run
  `20261122-094004`): "Progress: 0 of 11 done" eight times in a row. C3.
- [x] **Unknown: does an approved amendment survive a stop?** (run `20261122-100728`).
  Answered by run `20261123-081039`: yes, see above. The
  owner's "Amend" answer for n2g5TvI was given to a resumed plan session that he then
  stopped after 2 minutes; a new resume gate was written. Check on the next launch whether
  the planner asks again. That stop also added nothing to the spend (see "A session that is
  killed costs nothing on the books").
- [ ] **A builder was denied a tool its project uses** (*no issue*; same run):
  `mcp__shadcn__get_item_examples_from_registries`. Harmless there; a project's own MCP tools
  are not reachable from an autopilot session. Unexamined. C3.

### Step 13 — Wording and small behaviour (C3)

- [ ] One of the epic's automatic tries can be wasted: a final check with no verdict because
  the owner put a check off is re-run on the standing answer and asks again (*no issue*).
- [ ] "Stopped N times" counts autopilot's own answers plus this stop, not the stops the owner
  answered (*no issue*).
- [ ] The report reads `autoContinue` from its own run's config, `status` from the current
  run's, so the two can differ (*no issue*).
- [ ] `launch.warn` lines for a clone that is ahead or diverged still carry a `git fetch`
  command; the skill paraphrases them (*no issue*).
- [ ] No gate kind for a value the owner types, such as a document ID; it travels in `--note`
  (#41 I8).
- [x] Sessions write scratch files in the clone, because the referee's path rule refuses
  `/tmp` (#41 B15). Fixed 2026-11-21 with the scratch folder (step 2, "The referee's guards").
  A session can still leave a file in the clone; step 1's B15 fix sets it aside.
- [x] A project's `CLAUDE.md` can tell sessions to use a script outside the clone, which the
  referee refuses (#41: the dev-server tether in `~/.claude/scripts`). Fixed 2026-11-21: a file
  `CLAUDE.md` names in backticks is readable (step 2). Not seen on Windows. Whether a dev
  server started that way survives the ban on background commands is not checked.
- [ ] The look question reads "UI epic: parks for a human look before verify. Does what was
  built look right?": the driver's own reason, not owner's words (*no issue*; Pilot Light).
- [ ] The watch said "One command has been running for 3 min" for a tool call that had ended:
  its `PreToolUse` had no `PostToolUse` (a failed command), so it counted as still running
  (*no issue*; Pilot Light, `build-1/hooks.jsonl` line 57).
- [ ] A look with 25 pictures and no operator-observed requirement is one yes for the whole
  set; nothing lists what to check (*no issue*; Pilot Light). Maybe as intended.
- [ ] The referee refused "$AUTOPILOT_SCRATCH" used in a cut-down form four times in one epic,
  and four cwd-relative paths that resolved into the workspace (*no issue*; Pilot Light). The
  scratch rule's wording may need an example.
- [ ] The builder's handoff says "CANNOT VERIFY" where the report says "not proven for real"
  (#40) (15).
- [ ] The build missed a console error the verifier later found (#40) (38).
- [ ] Gate answers are dated in UTC (#40) (40).
- [ ] The look question for a UI epic with no pictures is asked in chat, not the popup (#40) (41).
- [ ] The skill text does not cover the sandbox-off case (#41 I4); mostly moot after B1.

### Step 14 — Housekeeping (C4)

- [ ] `preflight --json` is 31 KB (#40) (23).
- [ ] The verifier makes scratch git worktrees under `/tmp`, outside the clone, and tries forced
  git commands the referee refuses (#40). Harmless so far.
- [ ] `skills/autopilot/SKILL.md` is about 1,080 lines; every attending session carries it (#40).
- [ ] The cockpit mod is deferred (`autopilot-cockpit-mod-handoff.md`).

## 2026-11-23 session — live fixes, what the run proved, and a rename

### Decided (2026-11-23): "prototype" becomes **Provisional**; not yet built

The owner finds "prototype" untrue: the mode builds and tests to the same standard. What it
skips is waiting for a person. The AI makes the judgment calls that are the owner's (take a
session's own recommendation on a correction or a deferral, skip the owner's looks, merge a
requirement nobody observed as NOT OBSERVED), records them as `approved_by = "autopilot
(prototype run)"`, and lists every one at the end for the owner to confirm. Requirement IDs,
traced tests, failing tests, scope and Safety still stop it.

- **The name is Provisional** (the owner's choice, after weighing "AI-Supervised-Only",
  Delegated/Supervised, Sign-off later and Hands-off; "Unattended" is taken, it means the owner
  is away, in any mode). **Full** stays as the other mode.
- **The description must lead with the idea: "the AI decides now, you confirm later."** Offered
  to the owner at launch, Provisional says that first, and Full is its opposite: you decide as it
  goes. Suggested wording (the launch popup, `skills/autopilot/SKILL.md` near line 541):
  - *Provisional* — "The AI decides now, you confirm later. It keeps building where a Full run
    would stop and ask: it makes the calls that are yours (a requirement correction, a deferral,
    a screen to look at) and lists every one at the end for you to review."
  - *Full* — "You decide as it goes. It stops and asks whenever a requirement, a deferral or a
    look needs you."
- **What "confirm later" is, in the code** (checked 2026-11-23): the end-of-run report's
  "Decided for you in this prototype run" (corrections with old and new wording, deferrals and
  fixes taken on a recommendation, requirements nobody observed, screens merged without a look
  with the pictures kept, a changed `CLAUDE.md`); the "not proven" and "should still confirm"
  notes written into each epic's status file, listed by `status` under Left for Later; and a
  later Full run, which asks about each correction or deferral on an epic that has not merged
  yet. It is an invitation, not a gate: nothing stops merged work from standing unreviewed. The
  records say the AI decided; whether a later confirmation changes `approved_by` was not checked.
- **Where the word "prototype" is**: `driver.mjs`, `hooks/pretool.mjs` (R8), `report.mjs` (the
  intro line and the "Decided for you in this prototype run" heading), `attend.mjs`,
  `skills/autopilot/SKILL.md` (the launch question near lines 541 and 609), the launch screen,
  the tests. It is also stored in project files (`approved_by = "autopilot (prototype run)"`, for
  instance Pilot Light's CR-hWfKoMk) and in each run's `config.json` as `mode: "prototype"`: the
  rename must keep reading both old values. Do it as one change, with no run going.

### Fixed this session (all on `feature/peak-workflow-autopilot-poc`)

Live-confirmed in run `20261123-140347`: the usage-limit wait (waited, resumed at the minute,
same session); the catch-up before a build (log line "brought up to date with develop before
the build"); the budget wording ("$117.36 left of $250 (the N earlier runs … spent $…)").

- Status banner for epics waiting in autopilot's copy. Usage-limit wait. Cut-off build continued.
- Referee false alarms, found in the run's `hooks.jsonl` (each a test that failed first):
  a quoted heredoc's text read as commands (`kind` in a table cell refused as the container
  tool, `../support/control` in a test import as a workspace path); a resumed session writing
  to its earlier step's scratch folder; `git worktree remove --force` on its own scratch
  worktree; a file in the scratch folder passed as a one-command prefix
  (`CONTROL="$AUTOPILOT_SCRATCH/c.json" cmd`).
- Verifier: "Seen but not fixed" is a heading in its report; each line reaches the run report
  ("Verifier saw this wrong and left it") and the project's status notes. Not yet seen in a
  real run.
- Small-fix guard: a verify-session fix that skips a test (`it.skip`, `.only`, `xit`,
  `pytest.mark.skip`, `[Fact(Skip=…)]`), or swaps a precise check for one that passes for nearly
  any value (`toBeTruthy`, `not.toThrow`, `assert True`), parks for a person (`testWeakening`
  in `lib.mjs`). Not yet seen in a real run.

### Fixed late in the session

- **The referee cut a command at `;`, `|`, `&&` and brackets without reading quotes**: the `;`
  in a quoted sed script made `"../support/samples"` look like a path (refused live, 2026-11-24
  00:34 UTC). Single-quoted text is no longer cut (`splitCommand`, commit `f28dfec`, merged
  `827ed0b`, live for the running build).

- **A build is told who approved an amendment a prototype run took** (`amendmentRule`, commit
  `e43e32c`): its change record must say `approved_by = "autopilot (prototype run)"`. Before, only
  the planner knew and the build spent the one repair round on it (seen on F5hv9T4). Not yet seen
  working in a real run.

### Run 20261123-192602 (prototype), result

Merged: Outstanding (rxNf3oR, 31 min, $11.27). Parked: Session stream (F5hv9T4) on the auditor's
high finding "F3 stand-in": every test uses a stream the test writes itself, never checked against
a real recorded stream (gate `F5hv9T4-2`, the owner's to answer). The verifier's "Seen but not
fixed" section worked live on Outstanding (3 lines; one is an absolute path not stripped from
change-record notes).

### Known, not fixed

- `attend.test.mjs` "watch and status see inside the step … each said once" fails (expected 2,
  actual 3), on the base branch too. 2 `test_wrapper.py` failures (pre-existing).
- **The independent review is short**: 33–49 seconds on large changes (run `20261123-140347`:
  33 s on Outstanding). Unexamined; first thing to look at is whether the reviewer reads the
  diff or only the summary.
- **A voided "Resume"**: the owner's answer to keep Outstanding's finished build was void
  because its branch no longer merged once Conversation drawer merged (both touch
  `epic-detail-drawer.tsx` and `.autopilot/test-changes.jsonl`). The epic was planned again;
  the old branch is kept at `refs/autopilot/superseded/…`. The same item as the Step 3 line
  "An epic is started over without asking": it says so in the log but spends the money again.
- **"Resume" after a failed merge check repeats the whole final check** (about $5.85 and 29
  minutes on Outstanding). Step 3, first item.
- The build is told to log a reason before it edits an existing test, but a build whose first
  command was refused for another reason (the false alarms above) tried the edit first and was
  refused again: a few seconds each, no stop.
- The watch repeats its progress line once per blocked epic, and prints a refusal that has
  already cleared in words that read as a live blocker.
- An epic that extends another epic's screen gets no look (`n2g5TvI`).
- The verifier's how-to for phone checks (`HOST=0.0.0.0`; "`--lan` doesn't exist until
  yZQYIVE") is not saved in the project.
- Windows: 36 driver tests fail before any change (#41 B8), and the 2026-11-21 fixes have not
  run on Windows.

### Before handing a run to the beta tester

Done: the false referee refusals, the usage-limit wait, verifier notes, the stricter test
guard. Still open: the short review (above); a note for the tester that Windows is unproven and
what to send back if it breaks (the run report and the run's `hooks.jsonl`); the rename to
Provisional built.

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

- `mattpocock-skills:diagnosing-bugs` and `mattpocock-skills:tdd` — steps 1, 3 and 9 (write the
  fake-`claude` scenario first; patterns in `test/resume.test.mjs`).
- `mattpocock-skills:writing-for-agents` — any edit to `SKILL.md` or the rule texts sessions
  are given (`PLAN_RULES`, `BUILD_RULES`, `VERIFY_RULES`).
- `code-review` (low or medium) — before merging a driver change.
