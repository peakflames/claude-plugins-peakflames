# Autopilot PoC — evaluation (DRAFT for the owner's go/no-go)

Written 2026-11-12 from Runs A, B and C. Source of truth for the details:
`docs/autopilot-poc-plan.md` §10 (P4 status note) and §11 (metrics and thresholds).
Everything below is a draft; the call is the owner's.

## Recommendation

**No-go as the §11 thresholds are written; go-after-fixes is within reach.** The safety side held
in every run. The reliability side did not: wording-matching parked epics that should have
proceeded, five times. I recommend one more clean run of the A scenario after the matching fix
below, rather than P6 now.

## What held

- **No false merge** in any run (0 of 6 merges in Run A, 2 in Run B; oracle tests pass).
- **Contradiction caught.** Run B: the builder found E2's requirement contradicted E1's verified
  rule, stopped with an amendment question and changed nothing; dependents were blocked, the
  independent epic (E6) merged.
- **Base red caught.** Run C: stopped in under a second, $0, no session started.
- **Live-rates epic (E4) parked** in Run A, as designed.
- **Referee**: it denied every permission request and blocked risky actions; no unblocked
  violation was found (hook-log audit per rule was not built).

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

1. **Replace wording matches with a classify-only model call** (it names which known question a
   prompt is; it never chooses the answer), or at minimum ship the current patterns and expect
   more. Decide which.
2. **Prove the three fake-only fixes live**: the one-session repair, the inline "Fix now" merge,
   the unsettled-look gate.
3. **Measure the unmeasured**: human review time with a stopwatch on a real report, per-rule
   violations from the hook logs, and auditor precision.
4. **Make `onPark: stop` the default** (Run A's stale-base conflict under `continue` is the
   evidence) and say so in the README.
5. **Rerun A on final code** and count first-launch matches.

## Open product questions (not blockers)

- Owner's Playwright rule: let measurable visual claims be checked by a browser instead of a
  person; needs a spike on whether a browser launches in the sandbox.
- Whether `onPark: stop` should be the only mode.
