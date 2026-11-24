# Scenario D — walkthrough for the owner

Scenario D runs on its own small project, `shelf` (a reading-list command-line tool, five epics).
It exists to exercise, in real sessions, three things that so far only passed against the test
double:

1. **The one-session repair** — you look at what was built, say it is not right, and one repair
   session fixes it.
2. **The unsettled look** — you say it looks right but your note leaves part of the requirement
   out; the verifier sends it back to you instead of guessing or starting a repair.
3. **The inline "Fix now"** — the verifier asks a question of its own, you answer "Fix now", and
   the verifier repairs it and merges.

Unlike runs A–C it is not one unattended run. It is about four launches with your answers between
them. Each launch is the same three steps: `/peak-workflow:autopilot`, give the queue, Launch.
Between launches, answer the parked questions with `/peak-workflow:autopilot report`.

The project keeps going after an epic parks (`onPark: continue`), on purpose: the two epics that
wait for your look must not stop the fourth one.

## The five epics

| Epic | What it builds | What it is for |
|---|---|---|
| `Sh1Add4` Add and list | `shelf add`, `list`, `finish` | Nothing special: it should merge on its own |
| `Sh2Pag6` Reading page | `shelf page --out shelf.html` | Path 1, the repair |
| `Sh3Chr2` Pages chart | `shelf chart --out chart.html` | Path 2, the unsettled look |
| `Sh4Cfg9` Settings check | `shelf config` | Path 3, "Fix now" (first attempt: a gap the builder may close itself) |
| `Sh5Exp3` CSV export | `shelf export --out books.csv` | Path 3, "Fix now" (second attempt: the epic's own brief says the wrong thing) |

## Launch 1 — no answers needed

Queue: `Sh1Add4, Sh2Pag6, Sh3Chr2, Sh4Cfg9, Sh5Exp3`.

Expected: `Sh1Add4` merges. `Sh2Pag6` and `Sh3Chr2` each stop and wait for you to look, with
`shelf.html` and `chart.html` attached. `Sh4Cfg9` and `Sh5Exp3` each either merge or stop at a
question from the verifier (see "Path 3" below).

Check it with `node scripts/autopilot-lab/lab.mjs evaluate --run D --dir <dir>`. That command
judges this first launch only; the later launches are judged against the tables below.

## Your answers after launch 1

**`Sh2Pag6` (reading page) — answer "Not right — describe".** Open `shelf.html`. The requirement
is a judgement: can you tell finished books from unfinished ones at a glance, and is the page
comfortable to read? Say what you would actually want changed. If nothing bothers you, use this
note, which is a fair reading of the requirement:

> Finished and unfinished books are mixed in one list, so I have to read each line to tell them
> apart. Put the books still to read first, under their own heading, and the finished ones below
> under a "Finished" heading.

(If the page already does that, ask for something else you can see, for example "the finished
books should also be greyed out".)

**`Sh3Chr2` (pages chart) — answer "Looks right", with a note that is deliberately incomplete.**
The requirement has three parts: one bar per month, heights in proportion to the pages, and labels
that do not overlap. Leave the heights out:

> I opened chart.html. There is one bar for each month and I can read every label.

**`Sh4Cfg9` (settings check) or `Sh5Exp3` (CSV export), only if it stopped at a question from the
verifier — answer "Fix now".**

## Launch 2

Queue: the epics that are not merged yet.

| Epic | Expected | What it proves |
|---|---|---|
| `Sh2Pag6` | One repair session runs on your note, then it stops again for a second look at the changed page | Path 1: the repair is one session and it can commit |
| `Sh3Chr2` | The verifier cannot settle the bar heights from your note. It comes back to you with the verifier's reason. No repair session runs | Path 2 |
| `Sh4Cfg9` / `Sh5Exp3` | The verifier makes the fix itself and the epic merges. The report says "Fixed during verification, on your Fix now" | Path 3 |

## Your answers after launch 2

- `Sh2Pag6`: look at the new `shelf.html`. If it now does what you asked, answer "Looks right"
  and say what you saw (the note is required).
- `Sh3Chr2`: look at `chart.html` again and cover all three parts, for example: "One bar per
  month. September is the tallest; August is half as tall and October a quarter, which matches
  600, 300 and 150 pages. No label overlaps another label or a bar."

## Launch 3

Queue: the epics that are not merged yet. Expected: `Sh2Pag6` and `Sh3Chr2` are verified and
merge. A fourth launch is needed only if something stops again.

## What can go differently

- **Path 3 depends on the verifier.** Two epics are built to reach it. `Sh4Cfg9`: the requirements
  say nothing about a missing settings file and the concept of operations says it is fine; in the
  first run of this scenario the builder handled it anyway and the epic just merged. `Sh5Exp3`:
  the epic's own brief says `export` prints nothing when it succeeds, while the concept of
  operations and the project's output rule say the tool confirms what it did, and no requirement
  settles it. If neither verifier asks, both merge and path 3 is still unproven. That is not a
  failure of autopilot.
- **`Sh5Exp3` may stop earlier, at a question from the build session**, if the builder notices the
  contradiction itself. That is a correct stop, but not path 3. Answer it as you see fit.
- **Path 2 depends on the verifier too.** If it accepts the incomplete note, `Sh3Chr2` merges in
  launch 2 and the unsettled-look gate was not exercised.
- **A repair can only happen once per epic.** If `Sh2Pag6` is still not right after the repair,
  answering "Not right" again ends that epic as failed. That is by design.
- A needless stop (a question whose wording no rule recognised) can still happen anywhere. Record
  it; it counts toward the wording-matching tally.
