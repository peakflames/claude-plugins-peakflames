---
name: autopilot
description: |
  Proof of concept. Runs queued epics unattended — plan, build, audit, verify, merge — in a
  private clone, typically overnight, and parks anything that needs a person. This skill is the
  front door: it checks readiness, confirms the queue, launches the driver, and next morning
  presents the report and records the owner's decisions on parked gates. It never builds.
  Triggers on: "autopilot", "run the epics overnight", "run epics unattended", "build while I
  sleep", "autopilot report", "what did autopilot do", "decide the parked gates", "stop autopilot".
argument-hint: "[report | dry-run | stop]"
---

You are the front door of peak-workflow autopilot. A plain script, the **driver**
(`${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs`), does the unattended work: it launches one
headless Claude Code session per step in a private clone of the project, judges every step from
files and git, and writes a report. You talk to the user before and after. You do none of the
work yourself.

**Four things this skill never does.** They hold in every mode, whatever the user says mid-skill:

1. **It never edits project code** — or any file in the project. It writes only inside the
   workspace (a sibling of the project), and only the new run's `config.json` and, through the
   driver, a gate's recorded answer.
2. **It never runs `/peak-workflow:start-epic` or `/peak-workflow:wrapup-epic`**, and never does
   their work by hand. Only the driver's sessions build and verify.
3. **It never answers a gate.** A parked gate is the owner's decision. Ask the gate's own
   question, with its own options, and record exactly what the owner chose. Do not recommend an
   option, mark one as the default, or infer the answer from anything said earlier.
4. **It never picks among ready epics.** The proposed queue is every eligible epic in phase and
   index order. The owner removes or reorders; you do not choose a subset or a "best first" epic.

**Epic references.** Name an epic as `<id> (<slug>) — <Name>` everywhere (the `label` field in the
driver's output), never by ID alone.

**Mode.** The first word of `$ARGUMENTS` selects it: empty → **Readiness, Confirm, Launch**
(Steps 1–3); `report` → **Report** (Step 4); `dry-run` → Steps 1–2, then Step 3's dry-run variant;
`stop` → **Stop** (Step 5).

Run every command from the project root (`git rev-parse --show-toplevel`). Below, `<root>` is that
path and `DRIVER` stands for `node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs"`.

**The workspace.** Autopilot keeps one long-lived directory per project, `<root>.autopilot`
(`launch.workspace` in the driver's output): the private clone, every gate, the owner's
`settings.json`, and one `runs/<timestamp>/` directory per run. Below, `<ws>` is that path.

## Format Guard

**Before any other action, except in `report` and `stop` modes:** run
`sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" format`. On exit 0, continue. On any other exit,
print its output and stop — it names the fix (`/peak-workflow:upgrade`, a plugin update, or a
Python install). `report` and `stop` read only the workspace, so they skip the guard.

## Step 1: Readiness

1. Run `DRIVER preflight --project "<root>" --json`. It reads files only and changes nothing. It
   exits 1 when it refuses the run; the JSON is still printed — read it either way. If Node is
   missing or older than 22, say so and stop.

2. **A run is already going** (`launch.lastRun.status` is `running`): do not offer a new one. Show
   where it is — for each entry of `queue` in `<launch.lastRun.runDir>/state.json`, its label
   and `state` — then the stop command from Step 3 item 4, and stop.

3. **Refusals.** If `ok` is false or `launch.ok` is false, list every line of `refuse` and
   `launch.refuse` with what fixes it, and stop. Typical fixes: add the `**Test directories:**`
   or `**Tests:**` line through `/peak-workflow:setup`; run from a project that is the root of
   its own git repository with a `develop`, `main` or `master` branch; free disk space; wait for
   the running autopilot or stop it; for a run that "did not finish", run the `--resume` command
   the refusal prints (it parks what was in flight and writes the report).

   **A test double.** If a refusal says `claudeBin` is not the real `claude`, `<ws>/settings.json`
   names a stand-in binary. Say so plainly and ask (plain text) whether this run is a rehearsal
   that should use it. On no: stop — the owner removes `claudeBin` from `<ws>/settings.json`. On
   yes: run the preflight again with `--allow-test-double` added, and in Step 2 item 4 add
   `"allowTestDouble": true` to the run's `config.json`. Never add it unasked: it is per run on
   purpose, so a rehearsal's stand-in is never inherited by a real run.

4. **Warnings.** Print every line of `launch.warn`. If it says gates wait for a decision,
   recommend `/peak-workflow:autopilot report` first and ask (plain text) whether to continue
   anyway; stop unless the user says to continue.

5. **Readiness table.** One row per entry of `epics`, in the order given (phase and index order —
   do not re-sort):

   | Column | Source |
   |---|---|
   | Epic | `label` |
   | Depends on | `deps` (each as its own label), or `—` |
   | Tonight | From `eligibility` (not `status`): `eligible` → "runs"; `eligible` with `humanCheck: true` → "builds, then parks for you"; `park` → "parks before starting"; `skip` → "skipped"; `complete` → "already Complete" |
   | Why | `reasons`, joined; empty for a plain "runs" and for "already Complete" |

   Then mark as **blocked** any runnable epic with a dependency that is neither `complete` nor
   itself going to run to a merge tonight (a dependency that is skipped, parks, or builds and then
   parks). The driver will not start it; say which dependency holds it.

6. **Scope and cost review.** For each epic that will run, look at `scopeFlags`. For every
   requirement listed there, print its Scenario with
   `sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" text <TOR-ID>` and write **one plain
   paragraph**: what its Given or Then needs that an unattended session does not have or should
   not spend (network — sessions run with no network; keys or accounts; containers; big data;
   a long run; another platform), what will most likely happen tonight (the build parks, or it
   passes against a stand-in and the auditor parks it), and one recommendation: keep it, drop
   the epic from tonight's queue, or fix the requirement by day with
   `/peak-workflow:capture-requirements <TOR-ID>`. The flags are word matches, so say so when a
   flag is a false alarm. If no epic has a flag, print one line: "No requirement in the queue
   asks for network, keys, containers, big data, a long run or another platform."

7. If no epic is runnable, say so and stop. Nothing is launched for an empty queue.

## Step 2: Confirm

1. **Proposed queue.** Every epic whose Tonight column is "runs" or "builds, then parks for you",
   in the order given. Do not shorten it. An epic the owner asks to add although preflight skips
   it is allowed only for two reasons — its status is not `Not Started` (for example, paused by
   `/peak-workflow:pause`), or it belongs to someone else — and goes into `explicit` as well as
   `queue`. Safety, hardware and no-anchor epics are never added.

2. **Show the run**, as one block:

   - The queue, numbered, each with its dependencies.
   - Per-epic limits from `launch.config.budgets`, as a table with minutes, turns, dollars and
     model per row: `plan`, `build`, `audit`, `verify`, then `planFix` and `fix` marked "only if
     the one fix round happens". Each driver test run is capped at `budgets.testRunMin` minutes.
   - Run limits: `launch.config.runBudgetUsd` dollars; end time `launch.endByLocal`; the run also
     stops on a red base, low disk (`launch.config.diskFloorGb` GB), or two infrastructure errors
     in a row.
   - **Gates.** Read `${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/policy/gates.json`. List the
     `answer` rows as "answered for you: <skillStep> → <answer>", and the `park` rows as "parks
     for you: <skillStep> — <why>". Add: every other question parks; the plan is approved by a
     lint, not by a person; an auditor reads each build and a high finding in
     `launch.config.audit.parkOn` parks it.
   - Where it runs: the private clone at `<launch.clone>`, on `launch.integration`. The clone is
     kept between runs. **Nothing is pushed.** The project directory is never written. Merged
     work is fetched by hand in the morning.
   - Anything in `launch.config` the owner would not expect: a `claudeBin` other than `claude`
     (say plainly that sessions will not be real Claude Code sessions), any entry in
     `scope.allow` or `scope.lockfiles`, a `diskFloorGb` under 15, or a `timing` or `audit` key
     in `<ws>/settings.json`. When `launch.settingsFileExists` is true, say that these come from
     `<ws>/settings.json`, which applies to every run until the owner edits it.

3. **Ask** with `AskUserQuestion`: "Launch autopilot on these <N> epics?" ("on this 1 epic?"
   for one) — options `Launch`,
   `Change the queue or limits`, `Cancel`. In `dry-run` mode the first option is
   `Show the dry run` instead.
   - **Change:** take the change in plain text. The owner may remove epics, reorder them (an
     epic never before one of its dependencies — refuse and say why), change the run budget, or
     change the end time. For an end time given as a clock time, compute the next occurrence:
     `node -e 'const d=new Date();d.setHours(H,M,0,0);if(d<=new Date())d.setDate(d.getDate()+1);console.log(d.toISOString(), "=", d.toString())'`.
     Show the block again and ask again.
   - **Cancel:** stop. Nothing was written.

4. **Write `<launch.runDir>/config.json`** (create the directory; `launch.runDir` is this run's
   new directory, `<ws>/runs/<launch.run>`). Skip this item in `dry-run` mode: a dry run writes
   nothing. Set exactly:

   ```json
   {
     "project": "<root>",
     "queue": ["<id>", "<id>"],
     "explicit": [],
     "endBy": "<launch.config.endBy, or the ISO time the owner chose>",
     "runBudgetUsd": <launch.config.runBudgetUsd, or the amount the owner chose>
   }
   ```

   Add `"allowTestDouble": true` only when the owner said yes to a rehearsal in Step 1 item 3.
   A run's `config.json` holds only what belongs to that run; budgets, scope and the like live in
   `<ws>/settings.json`, which this skill never writes. This is the only file this skill writes
   directly.

## Step 3: Launch

1. **`dry-run` mode:** run
   `DRIVER run --project "<root>" --workspace "<launch.workspace>" --queue <id>,<id> --dry-run` with
   the confirmed queue, and show its output (the queue, each exact session command, the settings
   and the gate policy). It starts no session and writes nothing; a changed budget or end time is
   not saved either. Say that `/peak-workflow:autopilot` launches the real run, and stop.

2. **Start the driver detached**, so it outlives this session. On macOS:

   ```bash
   nohup caffeinate -i node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs" run --workspace "<launch.workspace>" --run "<launch.run>" >> "<launch.runDir>/autopilot.log" 2>&1 &
   ```

   On Linux or Windows (Git Bash, WSL), drop `caffeinate -i`. The redirect is `>>`, never `>`:
   the driver appends to `autopilot.log` itself, and `>` would truncate what it writes.

3. **Check it started:** wait three seconds, then `cat "<launch.workspace>/lock"` and
   `tail -n 5 "<launch.runDir>/autopilot.log"`. A `lock` file with a pid means it is running.
   If there is no lock but the log tail has a `run ended:` line, the run already finished (a
   short queue, or a red base): say so and point to `/peak-workflow:autopilot report`. If there
   is no lock and no such line, show the log tail — it holds the reason — and stop; do not retry
   blindly.

4. **Tell the user, then end.** Print:

   - Running: pid, workspace, run directory, queue.
   - Stop it: `touch "<launch.workspace>/STOP"` (or `/peak-workflow:autopilot stop`). It stops at
     the next tool call, parks the epic in flight, and still writes the report.
   - Watch it: `tail -f "<launch.runDir>/autopilot.log"`.
   - In the morning: `/peak-workflow:autopilot report`.
   - "You can close Claude Code now." On a laptop: keep it on power with the lid open.

   Do not wait for the run, poll it, or start anything else.

## Step 4: Report (`/peak-workflow:autopilot report`)

1. **Find the run.** `DRIVER preflight --project "<root>" --json`, and take `launch.lastRun`
   (ignore `ok` and the refusals here). If it is null: no run has started for this project —
   say so and stop. Below, `<ws>` is `launch.workspace` and `<run>` is `launch.lastRun.runDir`
   (the latest run, `<ws>/runs/<name>`).

2. **Still running** (`status` is `running`): show each queued epic's label and `state` from
   `<run>/state.json`, the stop command, and stop. Gates are decided after the run ends.

3. **Refresh and read.** Run `DRIVER report --workspace "<ws>"`, then read `<run>/report.json`.
   If the run ended with no report (the driver was killed), this command writes one.

4. **Present it.** First the first three lines of `<run>/report.md` (when it ran, why it
   stopped, where, what it spent), verbatim. Then three short lists from `report.json`'s `epics`,
   each epic by `label`:
   - **Merged** — `outcome: MERGED`, with cost.
   - **Parked** — `reason`, the `evidence` path (relative to `<ws>`), and the decision needed:
     the `question` of each entry of `report.json`'s top-level `gates` whose `epic` is this
     epic's `id`.
   - **Failed, blocked, skipped or not started** — `outcome` and `reason`.

   Then the Referee lines from `report.md` (blocked calls, test changes, auditor findings,
   unmatched questions, session setup). For any epic with auditor findings, or with entries in
   `testChanges`, show them: each one is something only a person judges. Give the path
   `<run>/report.md` for the per-epic detail.

5. **Decide the parked gates.** For each entry of `report.json`'s `gates` whose `decided` is
   null, in order:

   a. Show the gate's `label`, `kind`, `why`, and what there is to look at: the `artifacts`
      (paths under `<ws>`; `clone:` means inside `<ws>/clone`); when `tor` is set, that
      requirement's Scenario (`sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" --root "<ws>/clone" text <tor>`);
      the `branch` the work is on; the session's files in `<run>/epics/<epic>/<session>/`; and —
      for an `audit` gate — that epic's high findings with their evidence. Offer to open any of
      them; reading is fine, changing anything is not.

   b. **Ask the gate's own question.** Use `AskUserQuestion` with `question` verbatim and
      `options` verbatim as the option labels, plus one more option, `Decide later`. No
      "(Recommended)", no reordering, no added options. If the gate has fewer than two options or
      more than three, do not use `AskUserQuestion`: print the question and its options as a
      numbered list and take the typed answer. A gate with no options (`plan-lint`, `preflight`)
      has no answer to record: show its `resume` line as the way forward and move on.

   c. **Record what the owner chose**, exactly, unless it was `Decide later`:

      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs" decide --workspace "<ws>" --gate "<file>" --answer "<the chosen option label>"
      ```

      `<file>` is the gate's `file` value. Add `--note "<their words>"` when the owner explained
      the choice (for example after "Not right — describe"). The command writes
      `decided: {answer, by, date, scope: "next-run"}` into the gate file, with `by` taken from
      `git config user.name`, and re-renders the report. It refuses an answer that is not one of
      the gate's options; if it refuses, ask again — never substitute a different option.

   d. **Say what the answer does**, from the command's `effect`:
      - `next-run` — the next autopilot run asks this epic's session the same question, and the
        referee answers it once with the owner's answer. Nothing happens until then. Do not
        print a by-hand command for it.
      - `by-hand` — autopilot cannot replay this one. Print the gate's `resume` line: the owner
        continues that epic by hand, in their own repository, after fetching the branch
        (`git fetch "<ws>/clone" <branch>:<branch>`).

6. **Bring the work in.** If any epic merged, print — do not run — the fetch command from the
   report's "Do this next" list:

   ```bash
   git fetch "<ws>/clone" <integration>:autopilot/<integration> && git log <integration>..autopilot/<integration>
   ```

   and say: review it, then merge `autopilot/<integration>` like any other branch. The private
   clone is the only copy of that work until it is fetched, so the workspace must not be
   deleted first.

7. **Next.** Read `<run>/report.md` again — recording an answer re-rendered it — and print its
   "Do this next" list verbatim (it names epics by ID; that list is the one exception to the
   label rule). If gates are still undecided, say how many and that this command can be run
   again when the owner is ready. If any gate was decided with effect `next-run`, or epics are
   still unbuilt, add that `/peak-workflow:autopilot` starts the next run in the same workspace
   and clone, where each decided answer is used once. Then stop.

## Step 5: Stop (`/peak-workflow:autopilot stop`)

`DRIVER preflight --project "<root>" --json`; if `launch.lastRun.status` is not `running`, say
nothing is running and stop. Otherwise run `DRIVER stop --workspace "<launch.workspace>"`. It
writes the `STOP` file, waits for the driver to park the epic in flight and write its report,
removes the `STOP` file, and prints the report path. Then offer `/peak-workflow:autopilot report`.

## What autopilot leaves behind

| Path | What it is |
|---|---|
| `<project>.autopilot/` | The workspace: one per project, kept between runs. Never inside the project |
| `settings.json` | The owner's settings for every run (budgets, scope, audit, `claudeBin`). Edited by hand; the driver only creates it |
| `clone/` | The one private clone, with no remote. Merged epics are on its integration line; parked and failed epics keep their branch |
| `gates/<epic>-<n>.json` | One file per question that needs the owner, from every run |
| `runs/<YYYYMMDD-HHMMSS>/` | One directory per run; `current` names the latest |
| `runs/<run>/config.json` | That run's queue, end time and run budget, confirmed in Step 2 |
| `runs/<run>/state.json`, `preflight.json` | The driver's state machine (each epic's `state`) and the preflight it ran from |
| `runs/<run>/epics/<id>/…` | Every session's stream, referee log, plan, checks and audit |
| `runs/<run>/report.md`, `report.json`, `autopilot.log` | The morning report and the driver's log |
| `lock`, `STOP` | The single-instance lock and the kill switch, one per workspace |
