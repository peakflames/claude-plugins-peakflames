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

1. **A pre-approved answer does not apply when the session shortens the option label.** The
   wrapup-epic skill and `policy/gates.json` both say "No — only automated gates were run"; the
   verify session offered "No — only automated gates". R8 found no option equal to the answer and
   parked a finished, passing epic. Cost: a stopped run, a phone push, an owner question and a
   relaunch. *Hook R8 (`hooks/pretool.mjs`).* Fix: match the pre-approved answer to an option
   tolerantly (normalised case and punctuation, then prefix either way, then the unique option
   sharing its leading words); park only when no option or more than one fits.
2. **Nothing reports how a `NEEDS YOU` command ended.** The sign-in timed out at 11:31; a minute
   later the attending session told the owner it "may still be waiting", then at step end "no
   longer needs you", then retracted that ("I don't actually know whether the sign-in was completed
   or skipped"). The phone push is never corrected. *Driver (`Run.event`) / `attend.mjs` / skill
   Step 3b.* Fix: when a `Needs you:` command returns, emit a closing line with the outcome
   (done, or "nobody answered; it gave up after N min"), and have the skill relay it.
3. **The same human-only step is tried twice in one epic with nobody there.** Build and verify
   each opened the Okta sign-in and each waited the full 5 minutes: 10 minutes of the 31-minute
   run and two phone pings for a check that never ran. *Driver (`BUILD_RULES`, `VERIFY_RULES`).*
   Fix: build sessions do not start steps that need a person (record them as not proven);
   remember per epic that a `Needs you:` command went unanswered and tell later sessions not to
   retry it; at launch, ask whether the owner will be at the computer.
4. **A resumed session's cost looks over-counted (to investigate).** The resumed verify reported
   $2.44 for 19 turns, 2.22M cache-read, 27K cache-write and 9.6K output tokens; the original
   reported $1.56 for 27 turns, 2.13M / 111K / 12.1K. At the original's rates the resumed session
   should be about $1.15. `total_cost_usd` of a `--resume --fork-session` session appears to
   carry part of the parent's cost, which the driver then adds a second time
   (`driver.mjs` `state.spentUsd += total_cost_usd`). *Driver.* Fix: confirm with a small
   experiment; if confirmed, subtract the parent session's recorded cost, or price the step from
   its own `usage`.

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
