# UAT — autopilot, first real run of the 2026-11-13 fixes, PeakMedia, 2026-11-13 (second run)

One `/peak-workflow:autopilot` in a fresh PeakMediaMcpServers session (plugin from
`feature/peak-workflow-autopilot-poc` at `a2d716b`, driver 0.6.0), observed from a second session
reading its transcript, the run's `events.jsonl`, each step's `hooks.jsonl` and `autopilot.log`.
The owner stepped away after launch and came back for one question.

## What happened

| Time | Run | What |
|---|---|---|
| 11:12 | — | Step 0 → `readiness`, 6 epics can run. Launch check runs the gates, including the live OpenRouter test, which fails once (`costUsd` 0) |
| 11:13 | — | Launch popup: 6 epics, $80, a warning about the live failure, and the real-money question. Owner types "just do 1 epic, the next in line" and "Yes — when a check needs it" |
| 11:14 | — | Second launch popup for the one-epic queue (`8nPWJzI`). Owner: Launch |
| 11:16 | `111435` | Config has `realSpend: true`, `autoContinue: 2`. Plan 3 min $0.90; "Start epic?" answered by policy |
| 11:19 | `111435` | Build 13 min $3.64. One test-edit refusal (R7). At 11:26 `NEEDS YOU: sign in to Okta…`; pushed to the owner's phone; nobody there; OAuth callback times out at 11:31. Live OpenRouter test passes |
| 11:33 | `111435` | Build checks pass. Review 49 s $0.99, one low `never-ran-real` note |
| 11:34 | `111435` | Verify 9 min $1.56. Second Okta sign-in at 11:37, second push, second 5-minute timeout. PASS 8/8, then parks on "Did you perform any manual verification…?" (R8: the pre-approved answer's wording did not match the option) |
| 11:43 | — | Owner answers "No — only automated gates" |
| 11:43 | `114341` | Relaunch from `status.relaunch`. Verify session resumed (`--resume … --fork-session`), goes straight to Proceed, one git refusal (R3), merge gate green, MERGED. 3 min, reported $2.44 |
| 11:48 | — | Closing screen: merged, $9.53 of $80, two things not proven for real, friction, the two fetch lines |

Outcome: one command typed, three popups answered, epic merged in the clone, project untouched.

## Issues

### Major

1. **[Fixed 2026-11-13]** **A pre-approved answer does not apply when the session shortens the option label.** The
   wrapup-epic skill and `policy/gates.json` both say "No — only automated gates were run"; the
   verify session offered "No — only automated gates". R8 found no option equal to the answer and
   parked a finished, passing epic. Cost: a stopped run, a phone push, an owner question and a
   relaunch. *Hook R8 (`hooks/pretool.mjs`).* Fix: match the pre-approved answer to an option
   tolerantly (normalised case and punctuation, then prefix either way, then the unique option
   sharing its leading words); park only when no option or more than one fits.
2. **[Fixed 2026-11-13]** **Nothing reports how a `NEEDS YOU` command ended.** The sign-in timed out at 11:31; a minute
   later the attending session told the owner it "may still be waiting", then at step end "no
   longer needs you", then retracted that ("I don't actually know whether the sign-in was completed
   or skipped"). The phone push is never corrected. *Driver (`Run.event`) / `attend.mjs` / skill
   Step 3b.* Fix: when a `Needs you:` command returns, emit a closing line with the outcome
   (done, or "nobody answered; it gave up after N min"), and have the skill relay it.
3. **[Fixed 2026-11-13]** **The same human-only step is tried twice in one epic with nobody there.** Build and verify
   each opened the Okta sign-in and each waited the full 5 minutes: 10 minutes of the 31-minute
   run and two phone pings for a check that never ran. *Driver (`BUILD_RULES`, `VERIFY_RULES`).*
   Fix: build sessions do not start steps that need a person (record them as not proven);
   remember per epic that a `Needs you:` command went unanswered and tell later sessions not to
   retry it; at launch, ask whether the owner will be at the computer.
4. **[Fixed 2026-11-13]** **A resumed session's cost is counted twice (confirmed in the afternoon run's data).** In the
   result message of a `--resume --fork-session` session, `usage` is the session's own, but
   `modelUsage` and `total_cost_usd` include the parent: Opus cache-read 4,348,585 = 2,130,400
   (parent) + 2,218,185 (own); cache-write 138,482 = 111,034 + 27,448; output 21,660 = 12,083 +
   9,577. The driver adds `total_cost_usd` to `spentUsd`, so the parent's $1.56 was counted again:
   the epic cost about $7.97, not $9.53. *Driver (`state.spentUsd += total_cost_usd`).* Fix: for
   a resumed step, subtract the resumed-from session's recorded cost.

### Minor

5. **The launch check spends real money before the real-money question.** `test-live` (one paid
   OpenRouter call) ran in the launch check; the owner was asked about paid calls afterwards.
   *Skill Step 1 / `driver.mjs prepare`.* Fix: ask first, or skip gates marked as paid until
   `realSpend` is known.
6. **One flaky gate failure becomes "every epic will probably stop".** The live test failed once
   at launch and passed in build and verify with no change to the code it tests. The popup warned
   that each epic's final check would stop. *Skill Step 1.* Fix: re-run a failed gate once before
   warning, and say "failed once" rather than predict.
7. **Step 1 (5d) has no path for a gate that fails on a product bug.** It covers setup and copy
   fixes only; the session improvised a "Needs you" note. *Skill.* (Reported by the session.)
8. **Step 2 (3) has no path for a free-text launch answer.** "Just do 1 epic, the next in line"
   was treated as a queue change and the launch question asked again — reasonable, unscripted.
   *Skill.* (Reported by the session.) Fix: say so in the skill; a second popup is correct when
   the queue changed.
9. **The opening line shows one run's spend, not the chain's.** "$2.32 of $71.54" for work that
   cost $10.78 of $80 (issue 8 of the earlier notes, again). *Driver `status` / skill Step 0.*
10. **The launch popup lists epics by ID only.** Six IDs, no titles. *Skill Step 2.*
11. **Routine refusals and quiet test lines wake the attending session.** `REFUSED (test edit
    without reason)`, `REFUSED (git rule)` and three `TESTS passed` lines each cost a turn to say
    "still building" (issue 9 of the earlier notes, again). *`attend.mjs` `watch`.* Fix: keep
    them for the closing friction list; do not print them live.
12. **A resumed step reads as a second verification.** "Verifying (carrying on)" and "back on the
    final check" made the owner think everything was being checked again; the session only
    finished up. *`attend.mjs` `eventLine` / skill Step 3b.* Fix: "Finishing 8nPWJzI with your
    answer".
13. **"Verification finished" when it stopped to ask** (issue 10 of the earlier notes, again).
14. **R3's refusal does not say what was wrong.** `git merge $B --no-ff` chained with
    `git branch -d` was refused with "only `git merge --no-ff feature/epic-…` into develop is
    allowed" — which is what the command did. *Hook R3.* Fix: say "write the branch name
    literally, as a command of its own".

### Trivial

15. **The builder's handoff says "CANNOT VERIFY", not "Not proven for real".** The verifier
    restated it, so it was caught; a build-only path would miss it. *`BUILD_RULES`.*
16. **A 49-second review of a 935-line change.** 14 reads, one note. No evidence it missed
    anything; worth watching across runs.

## What worked

- **Resumed session after an answer (fix `1588c2b`).** `--resume c78ed90b… --fork-session`, log
  line "resuming session … with the owner's answer"; no re-ask, no checks re-run, 3 minutes to
  merged.
- **`NEEDS YOU`.** Both sessions wrote `Needs you:` descriptions; the driver emitted the line;
  the attending session relayed it in plain words and pushed to the phone, both times.
- **Real-money question.** Asked in the launch popup, written as `realSpend: true`, carried into
  the relaunch config with `autoContinue` and `continues`.
- **"Not proven for real".** Two items (reviewer: eviction timer never ran; verifier: tool list
  not checked against real Okta) in `state.json`, on the `merged` event, in the report and on the
  closing screen, with how to prove each by hand.
- The session explained the park in plain words ("autopilot's pre-agreed answer didn't match the
  wording of these options").
- Closing screen: merged, spend, unproven items, friction with the costliest named, one next step.

## Not exercised

- The process sweep: build and verify stopped their own servers; no "left N process(es)" line.
- The reworded-question reminder (`remind`): no question was asked twice.
- `autoContinue`: no technical stop occurred.

## Afternoon run, same day (run `135500`, 5 epics queued, owner away)

Fresh session after PeakMedia moved the real Okta check to release (`ed5eb10`). Plugin unchanged
(`56792d7`, docs only since the morning).

| Time | What |
|---|---|
| 13:53 | Step 0 → `readiness`, 5 epics. Launch popup with titles and which epic waits for a look. Owner: Launch; "Yes" to paid calls with a typed note: not at the computer for any browser popup |
| 13:57 | `EYGrros` plan 4 min $1.06, build 11 min $4.71, review 65 s (3 notes), verify 5 min $2.37; manual-verification question answered by policy; MERGED, 21 min, $9.48 |
| 14:20 | `YVOjXtI` plan 3 min, build 13 min $4.91, review 42 s (2 notes), verify 7 min $2.67; MERGED, 23 min, $9.53 |
| 14:45 | `Ail1fOL` plan 3 min; build parks after 90 s on an amendment gate: `TOR-09-fjQhX70` cannot be met as written. Run stops, $21.09 of $80. Push, then popup |

No Okta prompt, no `NEEDS YOU`, no wording-mismatch park: two epics merged with no owner input.

### Issues (numbering continues)

#### Major

17. **[Fixed 2026-11-13]** **The watch says `TESTS failed` when no test failed.** A verify command that only contained
    `build.py test-live` died on a shell typo (`echo ===LIVE` in zsh) before any test ran; the
    owner-facing line was `TESTS failed`. *`attend.mjs` `watch` (the `testCommand` check).* Fix:
    match the test command on a word boundary (`test` must not match `test-live`); say "failed"
    only when the test command is the whole command or its exit is reported separately; otherwise
    stay silent, as for piped commands.

#### Minor

18. **[Fixed 2026-11-13]** **Nowhere to record "I will not be at the computer".** The owner typed it into the real-money
    answer; the run config has no field for it and no session was told. Only the PeakMedia fix
    kept the browser sign-in away. *Skill Step 2 / run config / `BUILD_RULES`, `VERIFY_RULES`.*
    Fix with major 3: an `attended` answer at launch that sessions receive as a rule.
19. **[Fixed 2026-11-13]** **Whether the manual-verification question parks is luck.** Both verify sessions quoted the
    option verbatim this time and policy answered; the morning session shortened it and parked.
    Same fix as major 1.
20. **A "this test cannot fail" review note does not reach the run state.** `EYGrros` F1 (medium,
    `cannot-fail`): the live OpenRouter test asserts cost > 0, and the epic made an unreadable
    cost fall back to a configured price, so the test passes without the real cost being read.
    `state.json` `unproven` is empty; only the report has it. *`attend.mjs` `UNPROVEN_CATEGORIES`
    / closing screen.* Fix: carry medium `cannot-fail` notes with the unproven items.
21. **A requirement that cannot be met is found in the build, not before.** The planner read
    `TOR-09-fjQhX70` and passed the plan; the builder parked on it 90 seconds in, after the owner
    had left. *Planner rules / launch check.* Fix: have the planner raise amendment questions, or
    check the queue's requirements for contradictions before the launch popup.
22. **The amendment popup is the build session's text.** Requirement IDs, "Then", bounding boxes.
    *Skill Step 4.* Fix: restate in plain words (what the rule says, why it cannot be met, what
    the new wording changes); keep the original as detail.
23. **`preflight --json` is 31 KB.** A session that did not redirect it had the harness spill it
    to a file and then parsed that by hand. *Skill Step 1 / driver.* Fix: tell sessions to write
    it to a file, or add a short summary output.
24. **`git merge $B --no-ff` refused again** (issue 14), by both verify sessions of the day that
    reached a merge. It is a pattern: accept a variable that resolves to the epic branch, or have
    the wrapup rules give the literal command.
25. **Build sessions learn the test-edit rule by being refused.** Three refusals across two
    builds, each relayed to the attending session. *`BUILD_RULES`.* Fix: state the rule up front.
26. **Opening line shows one run's spend** (issue 9 again): "$2.44 of $72.91" for an epic that
    cost $9.53 of $80 as reported.

### What worked

- Five-epic launch popup: titles, order, which epic waits for a look and what follows it.
- Two epics end to end (43 epic-minutes, $19.01) with no question to the owner.
- The amendment rule ("requirements are never amended during a run") parked cheaply ($1.17).
- The attending session stayed quiet on routine lines and pushed once, when the run stopped.

## Evening continuation (run `152055`, after the amendment answer)

The build session was resumed with the owner's "Amend" answer and carried on. Two referee false
alarms, both fixed the same day:

27. **[Fixed 2026-11-13] `git stash push` refused as `git push`** (minor). *Hook R3.* The push
    check matched any `push` after `git`.
28. **[Fixed 2026-11-13] `sed -i ''` read as a change to the test directory** (minor). The empty
    backup suffix of macOS `sed -i ''` was taken as a path and resolved to the working directory;
    the session was told to record a reason for `tests/PeakMediaRemoteMcpServer.Tests`, and did,
    for the whole directory. *Hook R7 (`bashWriteTargets`).*

### Critical

29. **[Fixed 2026-11-13] The owner's "Amend" answer is carried out and then failed by the driver.**
    The owner approved amending `TOR-09-fjQhX70`; the resumed build retired it for
    `TOR-09-qu5yesw` with a change record in the owner's name; CHECK_BUILD then failed the build
    for changing requirement files ("requirements are frozen during a run"), for not testing the
    retired ID, and because its last commit was `test(epic-…)`. The repair round was told to undo
    it and asked the owner a second question whose every option was a loss. *Driver
    (`checkBuild`, verify checks).* Fixed: an approved amendment unfreezes requirement files for
    that epic, the anchors follow the branch's sidecar, and any commit of the epic may be last.
30. **A gate with four options cannot go in the popup** (minor). The fifth, "Decide later", is one
    more than `AskUserQuestion` takes, so the question arrived as chat text. *Skill Step 4.* Fix:
    keep the four real options in the popup and say "close this to decide later" in the question.
31. **The owner could not tell what the requirement was for** (minor, UX). They had to ask: what
    is it, is it functional, what if we drop it. *Skill Step 4.* Fix: an amendment question leads
    with one plain sentence of intent and where the rule comes from, before any ID or wording.
