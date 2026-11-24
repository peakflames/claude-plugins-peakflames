# UAT — autopilot "stays with the run", PeakMedia, 2026-11-13

One `/peak-workflow:autopilot` in a fresh PeakMediaMcpServers session (plugin from
`feature/peak-workflow-autopilot-poc` at `0c1290b`, driver 0.6.0), observed from a second
session reading its transcript and the workspace.

## What happened

| Time | Run | What |
|---|---|---|
| 09:28 | — | Step 0 → `decide`. Report shown, then "continue `8po1tRg`?" (resume gate `-4`). Owner: Resume |
| 09:29 | `092945` | Relaunch, no second confirm. Build checks pass, reviewer 3 notes, verify parks on a question: live check needs an Okta sign-in (gate `-5`, `unmatched`). Owner: "Yes — open sign-in" |
| 09:34 | `093449` | Fresh verify session redoes everything, asks the same thing in other words (gate `-6`). The recorded answer is spent unused. $1.52 |
| 09:38 | `093856` | Owner: "Yes — open the browser". Verify runs `mcp tools --oauth`; owner closes the tab; 4-minute timeout; retry as a detached process; sign-in completes; PASS 27/27; merge gate green; MERGED |
| 09:49 | — | Step 0, closing screen with the two fetch lines |

Outcome: one command typed, three questions answered, epic merged in the clone, project
untouched. Session spend $10.78 of $80 over four chained runs. The loop itself (Step 0, attend,
ask, relaunch, closing screen) worked every pass.

## Issues

### Critical

1. **[Fixed 2026-11-13, `1588c2b`] A recorded answer is lost when the re-run session rewords its question.** Gate `-5`
   ("Should I open the browser sign-in now?", 2 options) was decided; the next verify session asked
   "Can you complete that sign-in now?" (3 options), matched nothing, parked on gate `-6`, and
   `-5` was marked `used: the question was not asked again`. Every mid-session question can loop
   at the price of a full step. *Driver / hook R8.* Fix: hand the owner's earlier question and
   answer to the resumed session up front (as `owner-look.md` does for a look), so it acts on the
   answer instead of asking again; match on meaning, not text; never mark an answer used when it
   was not applied.

### Major

2. **[Fixed 2026-11-13, `1588c2b`] An answered question restarts the whole step.** Each answer re-ran verify from the top
   (about 2 minutes and $1.5–1.7) to get back to the same point. *Driver.* Fix: resume the
   session (`--resume <session-id>`) where the tooling allows, or give the new session the earlier
   session's findings.
3. **[Fixed 2026-11-13]** **Nothing says what an answer will do, or when.** After "Yes — open sign-in" the owner waited
   for a browser that was two minutes away, then never came. *Skill Step 4 item 5d.* Fix: after
   recording, say what happens next and what the owner will see ("it re-checks first, about two
   minutes; then a browser window opens for you to sign in; you run nothing yourself").
4. **[Fixed 2026-11-13]** **An option that needs a person at the machine is offered as if any answer can run
   unattended.** *Skill / gate.* Fix: when a gate's option implies an interactive act (a browser,
   a device, a sign-in), say so in the question text and tell the owner to stay; or mark such
   gates in the driver.
5. **[Fixed 2026-11-13]** **The attending session cannot see inside a step.** For five minutes a browser sign-in
   waited on the owner and the session said nothing; asked "how is it going?", it guessed
   ("may be waiting on the Okta sign-in") after the sign-in had succeeded and the verdict was
   PASS. *`watch` / `status`.* Fix: a watch line when the step in flight runs a long or
   interactive command (a Bash call open longer than N seconds, with its description), and the
   same fact in `status.say`.
6. **[Fixed 2026-11-13]** **A session's detached processes escape the referee and the driver's cleanup.** The verify
   session left the gateway listening on port 5108 after the run ended (killed by hand), and
   later started `(nohup … &)`; rule R6 passed both. *Hooks R6, driver cleanup.* Fix: refuse or
   track `nohup`/`&`/`setsid` launches; at step end, kill what still runs with its cwd in the clone.

7. **[Fixed 2026-11-13: directions (a) and (b), approved by the owner]** **What was not proven for real never reaches the owner.** Reported by the attending
   session after the run, at the owner's prompting. Epic `8po1tRg` merged 27/27 without one
   request to real OpenRouter: every test uses `tests/Fakes/FakeOpenRouter`, the verifier wrote
   "Not run: a real OpenRouter synthesis, to avoid spending the shared credit", and its one live
   call used a model refused before any spend. The auditor's finding F1 (medium,
   `never-ran-real`) says the per-clip cost rests on an assumed header and response body that
   the fake was written to match; if the real service differs every clip records $0, and the
   quota epic that follows builds on that cost. The owner heard only "3 things to note, none
   serious"; the closing screen has no line for what a session chose not to run or for findings
   that do not park; he found out by asking why there were no charges. He is willing to spend
   real money when a test needs it, and was never asked. (Supersedes minor 16, which assumed a
   real call had been made, and sharpens minor 13.) *Skill closing screen, `watch`, audit
   policy, launch question.* Directions, to decide with the owner: (a) a "Not proven for real"
   section on the closing screen and at `RUN ENDED`, from the verifier's "Not run" lines and
   auditor findings of category `never-ran-real` or `claim-without-evidence`, shown even when
   they do not park; (b) spending real money on an external call becomes an owner answer given
   at launch, like `autoContinue`, not a session's silent choice; (c) a medium `never-ran-real`
   finding parks, or at least notifies; (d) project side, a live round-trip epic before quotas.

### Minor

7. **`autoContinue` is never offered when a session starts at a waiting question.** The
   relaunch inherited `0` from a run that predates it. *Skill Step 4 / `status.relaunch`.* Fix:
   add the standing-answer sentence to the first gate question of a session whose last run has
   none.
8. **Spend is shown three ways.** The watch's first line says "$0.00 of $75.77" (this relaunch's
   remainder, reset each relaunch); `status` and the closing screen say "of $80" for the session;
   neither counts the step in flight. *`snapshotLine`, `status`.* Fix: session total against the
   original budget everywhere.
9. **Quiet lines still wake the session.** `TESTS passed` is "not relayed", but it is a
   notification, a model turn, and a "(Still verifying.)" in the chat. *`watch`.* Fix: print
   `TESTS …` and heartbeats only with a flag; the skill then has nothing to suppress.
10. **"Verification finished in 2 min" when it stopped to ask.** *`eventLine` step-end.* Fix:
    when the step ends with a new gate, say "Verification paused with a question for you".
11. **The resume gate's own question is driver jargon** ("CHECK_BUILD … failed: clean-tree,
    tests-green, test-integrity"), shown verbatim first. *Driver `parkResumable`.* Fix: write the
    question with `plainReason`; keep the raw reason in `reason`.
12. **The report's TL;DR still tells the owner to run `/peak-workflow:autopilot report`** and
    speaks of "the next run". *`report.mjs` `tldr`, `nextSteps`.* Fix: reword for the loop.
13. **Reviewer notes have nowhere to go.** "3 things to note, none serious" is all the owner
    hears. *Skill closing screen.* Fix: one line offering them, or list them on the closing screen.
14. **No wait in the launch check.** "Wait three seconds" made the session write a `perl`
    delay loop (foreground `sleep` is blocked). *Skill Step 3 item 3 / driver.* Fix: `watch`
    already waits for the driver; drop the check, or add `driver.mjs status --wait-running`.
15. **Several file reads before a yes/no "continue it?"** (Step 4 item 5a applied in full to a
    resume gate). *Skill.* Fix: for a `resume` gate, the gate's `why` and one plain sentence are
    enough.
16. **Live verification spends outside the run budget.** `synthesize_narration` was called
    with the real OpenRouter key from the copied `.env`. *Readiness scope review.* Fix: say on the
    confirm screen that a copied key can be spent by verification.
17. **Policy recorded "No — only automated gates were run"** although the owner signed in by
    hand for the live check. *`policy/gates.json`.* Fix: when the run used an owner answer that
    led to a manual act, answer that question from it.
18. **The "live check needs a sign-in" question parks as `unmatched`** and will recur on this
    project. *Policy / readiness.* Fix: a readiness warning for a quality gate that needs an
    interactive sign-in, with the owner's choice recorded once.
19. **No push notification** was sent for either waiting question (the tool was not used).
    *Skill Step 3b item 5.* Check whether the tool was available; if it was, the rule is too soft.

27. **The referee's own record ended up committed on the integration line.** The verifier
    committed `.autopilot/test-changes.jsonl` onto `develop`; `.gitignore` does not exclude it.
    *Driver / build rules.* Decide whether it belongs in history; if not, keep it out of the merge.
28. **`report.json` `next` said "1 parked epic with no question to answer"** while a gate was
    waiting (the one `report` had just written). *`report.mjs` `nextSteps`.*
29. **The epic's build did not update the project's `CHANGELOG.md`**; the owner asked for it
    after the merge. *start-epic / wrapup-epic, not autopilot.*

### Trivial

20. "Continuing `8po1tRg`…" is said three times per relaunch (answer, relaunch, watch).
21. The full opening line ("I'll stay here… close this window…") repeats on every relaunch.
22. Watch lines were lightly rephrased ("…and cost $0.98", "…now.") against "relay as worded".
23. The session added `"allowTestDouble": false` to a `relaunch.config` meant to be written as given.
24. Step 4 item 4 ("was away while the run ended") and Step 0 "Coming back" do not cover `decide`.
25. Twenty silent seconds between "Autopilot started" and the first epic line while `setup` runs.
26. The last Step 0 was run without `--queue` (by the closing-screen rule) and returned
    `readiness: 6 epic(s) can run`; the closing screen was still right, but it does not mention
    that more epics are ready.

## What worked

- Step 0 → `decide` → ask → relaunch with no second confirm, three times.
- The build-check fix from this morning held in a real run.
- Monitor + `watch --run … --replay` delivered every milestone; one line each.
- "How is it going?" used `status` as written.
- Closing screen: merged, session spend, friction in plain words with the costliest rule named,
  one next step.
