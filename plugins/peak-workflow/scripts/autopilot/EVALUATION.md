# Autopilot PoC — evaluation (DRAFT for the owner's go/no-go)

Written 2026-11-12 from Runs A, B and C; updated the same day with scenario D. Source of truth for the details:
`docs/autopilot-poc-plan.md` §10 (P4 status note) and §11 (metrics and thresholds).
Everything below is a draft; the call is the owner's.

## Recommendation

**No-go as the §11 thresholds are written; go-after-fixes is within reach.** The safety side held
in every run. The reliability side did not: wording-matching parked epics that should have
proceeded, five times. I recommend one more clean run of the A scenario after the matching fix
below, rather than P6 now.

Scenario D (added after this was first written) moves two of the three unproven repair paths to
proven and found three more driver defects, all now fixed but none yet rerun live. It does not
change the call: still no-go as written, with a shorter list.

## What held

- **No false merge** in any run (0 of 6 merges in Run A, 2 in Run B; oracle tests pass).
- **Contradiction caught.** Run B: the builder found E2's requirement contradicted E1's verified
  rule, stopped with an amendment question and changed nothing; dependents were blocked, the
  independent epic (E6) merged.
- **Base red caught.** Run C: stopped in under a second, $0, no session started.
- **Live-rates epic (E4) parked** in Run A, as designed.
- **Referee**: it denied every permission request and blocked risky actions; no unblocked
  violation was found (hook-log audit per rule was not built).

## Scenario D — the repair paths, in real sessions

A separate four-epic project (`shelf`), four launches with the owner answering between them,
$13.16. The first launch matched 4 of 4 expected outcomes with no needless park.

| Path | Result |
|---|---|
| One-session repair | Proven. The owner's "Not right" note produced one repair session that changed the page and committed it (34 s, $0.23) |
| Unsettled look | Proven. The verifier refused a note that left out the bar heights; the driver returned to the owner with the reason and started no repair; with a full note the epic merged |
| Inline "Fix now" | Not reached. The builder closed the planted gap itself, so the verifier never asked |

Defects it exposed, each hidden by the test double and each in what follows a repair or a wait:
the build check rejected the repair's `fix(…)` commit subject; the merge gate blamed a verifier
for another epic's files after a catch-up merge; a verified epic that could not finish its merge
was reported FAILED. All three are fixed. Two epics had to be un-stuck by hand, with the owner's
approval, because a park that leaves no question makes the next run start the epic over.

One design change followed: before verify, the driver now merges the integration line into a
branch that is behind it, so the per-epic docs refresh cannot collide with an earlier epic's.

## What did not hold

| Metric (§11) | Result | Threshold | Met? |
|---|---|---|---|
| Unattended completion, first launch | A 3/6, B 5/6, C 6/6 = 14/18 (78 %) | ≥ 90 % | No |
| Happy-path merges (Run A) | 4 of 4 eventually, 2 on the first run | ≥ 3 of 4 | Only after fixes |
| False merges | 0 | 0 | Yes |
| Parked-correctly | A: yes; B: E2 yes, E4 parked for the wrong reason (1 of 2); C: n/a | 100 % | No |
| Needless parks | 5 wording matches (3 in A, 2 in B) | not a §11 metric; each cost a human round | — |
| Rule violations blocked | not measured per rule | 100 % | Unknown |
| Stalls | none | 0 | Yes |
| Gate handling (policy answers re-asked) | none seen | 0 | Yes |
| Auditor value | not tallied | ≥ 80 % precise | Unknown |
| Cost | A $17.52 (iterative, incl. aborted attempt); B $3.65 + $5.11; C $0 | report only | — |
| Time | B ~14 min for the working launch; A ~40 min over an evening | report only | — |
| Human review time | not measured (no stopwatch run) | ≤ 10 min | Unknown |

Caveat: Run A was iterative with fixes between launches, so its numbers describe the prototype
being debugged. Only Run B's second launch and Run C ran on near-final code, and Run B's
second launch was itself the first to run on the fix for its first.

## Cause of the misses

Every needless park was the same thing: a policy or lint rule that matches the skill's own wording
and the model phrased the question slightly differently ("verdict: PASS", "Start it?" without
"Start Epic", shortened headings). Each was fixed by widening a pattern, and each fix covers only
the phrasing already seen.

## To reach go

1. **Wording matching: decided, keep it for now** and see whether it survives more scenarios.
   Scenario D's first launch had no needless park (7 questions answered from policy).
2. **Rerun scenario D on the fixed driver.** The three defect fixes and the catch-up merge have
   passed fake-backed tests only.
3. **Prove the inline "Fix now" merge live.** It needs a planted situation that makes a real
   verifier ask; the first attempt did not.
4. **Measure the unmeasured**: human review time with a stopwatch on a real report, per-rule
   violations from the hook logs, and auditor precision.
5. **`onPark: stop` is already the driver's default**; say so in the README. (The lab scenarios
   override it to `continue` on purpose.)
6. **Rerun A on final code** and count first-launch matches. Deferred by the owner.
7. **Make every park resumable.** A park with no question (after a fix round, after a rolled-back
   merge) throws the work away on the next run.

## Open product questions (not blockers)

- Owner's Playwright rule: let measurable visual claims be checked by a browser instead of a
  person; needs a spike on whether a browser launches in the sandbox.
- Whether `onPark: stop` should be the only mode.
