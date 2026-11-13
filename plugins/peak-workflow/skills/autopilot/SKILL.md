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

1. **It never edits project code** — or any file in the project, with one exception: the `setup`,
   `copy` and `readOnly` entries of `<root>/.claude/peak-workflow/autopilot.json`, written through
   `DRIVER configure` after the owner confirms them (Step 1 item 5). Otherwise it writes only
   inside the workspace (a sibling of the project): the new run's `config.json`, through the
   driver a gate's recorded answer, and through `DRIVER prepare` the private clone.
2. **It never runs `/peak-workflow:start-epic` or `/peak-workflow:wrapup-epic`**, and never does
   their work by hand. Only the driver's sessions build and verify.
3. **It never answers a gate.** A parked gate is the owner's decision. Ask the gate's own
   question, with its own options, and record exactly what the owner chose. Do not recommend an
   option, mark one as the default, or infer the answer from anything said earlier.
4. **It never picks among ready epics.** The proposed queue is every eligible epic in phase and
   index order. The owner removes or reorders; you do not choose a subset or a "best first" epic.

**Asking the owner.** Every question with a fixed set of answers goes through
`AskUserQuestion`, never as a question left in the chat. Plain text is only for answers that are
free text (a changed queue, a budget, an end time) or a list too long for the tool.

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

1. Run `DRIVER preflight --project "<root>" --json`. It reads files only and changes nothing
   (item 5's `prepare` is the one readiness command that writes, and only in the workspace). It
   exits 1 when `ok` is false; a refusal in `launch.refuse` alone still exits 0, and the JSON is
   printed either way — always read it. If Node is
   missing or older than 22, say so and stop. Whenever this command is run again in this
   session, use the newest output: `launch.run` and `launch.runDir` name a new run each time.

2. **A run is already going** (`launch.lastRun.status` is `running`): do not offer a new one. Show
   where it is — for each entry of `queue` in `<launch.lastRun.runDir>/state.json`, its label
   and `state` — then the stop command from Step 3 item 4, and stop.

3. **Refusals.** If `ok` is false or `launch.ok` is false, list every line of `refuse` and
   `launch.refuse` with what fixes it, and stop. Typical fixes: add the `**Test directories:**`
   or `**Tests:**` line through `/peak-workflow:setup`; run from a project that is the root of
   its own git repository with a `develop`, `main` or `master` branch; free disk space; wait for
   the running autopilot or stop it; for a run that "did not finish", run the `--resume` command
   the refusal prints (it parks what was in flight and writes the report).

   **Diverged** (`launch.sync.state` is `diverged`): the project and the autopilot clone each
   have commits the other lacks — the owner committed by day without first bringing in the work
   autopilot merged. Print both tips and the fetch command from the refusal, and say: fetch,
   merge `autopilot/<integration>` into `<integration>` in the project, then run this again.
   Do not run the fetch or the merge yourself.

   **A test double.** If a refusal says `claudeBin` is not the real `claude`, `<ws>/settings.json`
   names a stand-in binary. If that is the only refusal and no epic is runnable, skip the
   question and go to item 8. In `dry-run` mode, say that sessions would use the stand-in and
   carry on without asking (a dry run starts nothing). Otherwise say so plainly and ask with `AskUserQuestion`: "Sessions would use a
   stand-in binary (<its file name>), not real Claude Code. Is this run a rehearsal that should
   use it?" — options `Yes — this run is a rehearsal` and `No — stop here`. On no: stop — the
   owner removes `claudeBin` from `<ws>/settings.json`. On
   yes: run the preflight again with `--allow-test-double` added, and in Step 2 item 4 add
   `"allowTestDouble": true` to the run's `config.json`. Never add it unasked: it is per run on
   purpose, so a rehearsal's stand-in is never inherited by a real run. After a yes, the
   `claudeBin` warning is expected: state it once, in the Step 2 block.

4. **Warnings.** Print every line of `launch.warn`. If it says gates wait for a decision,
   recommend `/peak-workflow:autopilot report` first and ask with `AskUserQuestion` — "<N>
   gate(s) wait for your decision. Launch a run anyway? Those epics are left alone." with options
   `Decide the gates first` and `Continue anyway`; stop unless the owner chooses to continue. `launch.sync.state` says how the project and
   the clone compare, and the run acts on it by itself: `project-ahead` — the clone is
   fast-forwarded first (a decision on a parked branch still holds if the branch merges cleanly
   into the new tip; the run checks that when it starts); `clone-ahead` — merged work is still waiting to be fetched, and
   the run builds on top of it (epics merged there show as already Complete); `same` — nothing
   to do; `no-clone` — the first run, which makes the clone at launch.

5. **Make the copy able to build and test.** Autopilot works in a private copy of the project
   (the clone), and a clone holds only what git carries. Everything git ignores — installed
   dependencies, a virtual environment, a `.env`, local data — is missing from it unless the
   project says how to get it there. Three entries in `launch.projectSettingsFile` say so:
   `setup`, one shell command the driver runs in the clone before each run's first test check
   (with network); `copy`, the git-ignored files it copies in from the project each run; and
   `readOnly`, directories outside the clone that sessions may read and never write (a
   dependency cache the build tools keep in the home directory). Skip this item when no epic is
   runnable.

   a. **Show what the copy starts without.** From `launch.env.ignored` (each entry has `path` and
      `status`), under "In your project, but not in autopilot's copy": one line per entry, in
      plain words — `copied` → "copied in each run"; `present` → "rebuilt in the copy"; `absent`
      → "not carried over". Fold build output and caches (`bin/`, `obj/`, `target/`, `dist/`,
      `__pycache__/`) into one line with a count. If the list is empty, say so in one line.

   b. **Work out the entries** when any is missing, or when the proof in item d fails.
      Learn it from how the project is really built and tested without autopilot: read
      `CLAUDE.md` (prerequisites, the `**Tests:**` and `**Run:**` lines, and every quality gate
      `/peak-workflow:wrapup-epic` will run), the README, the manifests and lockfiles, the build
      scripts, and any CI configuration. Reading the project is fine; changing it is not.
      - `setup` rebuilds what can be rebuilt: a virtual environment and its packages, `npm ci`,
        `dotnet restore`, `cargo fetch`, a code generator. It must work in a plain `/bin/sh`
        with no alias and no activated environment, be safe to run again, and leave nothing git
        would commit (so `npm ci`, never `npm install`). Include what the quality gates need,
        not only the tests.
      - `copy` lists only ignored files that cannot be rebuilt and that the tests or quality
        gates read: a `.env`, a local configuration file. Never a dependency directory or build
        output; never large data unless a test needs it.
      - `readOnly` lists the dependency caches the stack reads from outside the project. A
        session may otherwise read nothing outside the clone, so a build that opens a package's
        files there is refused. Draft it from the stack, and list only directories that exist
        (`ls -d`): .NET → `~/.nuget/packages`; Rust → `~/.cargo/registry`; Go → the output of
        `go env GOMODCACHE`; Java → `~/.m2/repository` (Gradle: `~/.gradle/caches`). Node and
        Python projects keep their packages inside the clone and need none. Never the home
        directory, a whole folder of it, or anywhere credentials live: the driver refuses those.
      - A `**Tests:**` line that names a shell alias or an activated environment (`python` for
        `python3`, a bare tool that lives in `.venv/bin`) cannot run unattended. Say which line
        and what it should say; the owner changes and commits it, you do not.

   c. **Confirm, then save.** Show the entries exactly as they will be saved; for each
      `copy` file one sentence: "The build sessions can read this file. They have no network, so
      it cannot leave this machine, and git ignores it, so it is never committed."; and for each
      `readOnly` directory: "The build sessions can read everything in this directory and can
      change nothing in it." Ask with
      `AskUserQuestion`: "Save these so autopilot's copy can build and test?" — options
      `Save these`, `Change them`, `Skip — leave the copy as it is`. On save:

      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs" configure --project "<root>" --setup '<command>' --copy <path>,<path> --read-only <dir>,<dir>
      ```

      Pass only the flags for entries that change; an empty value removes an entry. It keeps
      the file's other keys, refuses a `copy` path that is missing or that git does not ignore,
      and refuses a `readOnly` directory that is missing, too broad, private, or overlaps the
      project. Never write that file any other way, and do not commit it: the driver reads it
      from the project as it is. Say once that the file is the owner's to commit so teammates
      get the same setup.

   d. **Prove it** — not in `dry-run` mode, which writes nothing: say the proof is skipped and
      carry on. Run `DRIVER prepare --project "<root>"` with a ten-minute timeout. It makes the
      clone (or brings it up to date), copies the files, runs `setup`, then runs the project's
      test command in the clone, in the same plain shell a run uses. It writes only inside the
      workspace and prints JSON; exit 1 means the proof failed.
      - `ok: true` → one line: "Autopilot's copy builds and passes your tests (<n> files copied,
        setup ran)." Then run the item 1 preflight again and use its output: the clone now exists.
      - `failed: "copy"` → print `problems`. `failed: "setup"` or `"tests"` → print that step's
        `tail`; when its `couldNotRun` is true say plainly that the command was not found in a
        plain shell and the tests never ran, which is a missing tool or setup step and not a
        failing test. `failed: "leftovers"` → `leftovers` lists files that setup or the tests
        changed or created and git would commit; the fix is a different setup command or a
        `.gitignore` line.
      - Diagnose from the output, go back to item b with a corrected entry, and prove again —
        at most three rounds, each confirmed by the owner. A fix that belongs in the project
        (the `**Tests:**` line, `.gitignore`, a test that truly fails on `<integration>`) is the
        owner's: say exactly what to change, and stop.
      - **Never launch while the proof fails.** The run would stop at its first test check.

      If the owner chose `Skip`, still run the proof: with no entries it passes for a project
      that needs nothing git ignores.

6. **Readiness table.** One row per entry of `epics`, in the order given (phase and index order —
   do not re-sort):

   | Column | Source |
   |---|---|
   | Epic | `label` |
   | Depends on | `deps` (each as its own label), or `—` |
   | Tonight | From `eligibility` (not `status`): `eligible` → "runs"; `eligible` with `humanCheck: true` → "builds, then parks for you"; `park` → "parks before starting"; `skip` → "skipped"; `complete` → "already Complete". When the epic has a `gate` field, its `state` wins: `resume` → "resumes at `<gate.enters>`"; `waiting` → "waits for your decision"; `void` or `fresh` → "starts over" |
   | Why | `reasons`, joined; empty for a plain "runs" and for "already Complete" |

   Then mark as **blocked** any runnable epic with a dependency that is neither `complete` nor
   itself going to run to a merge tonight (a dependency that is skipped, waits for a decision,
   parks, or builds and then parks). The driver will not start it; say which dependency holds it.

7. **Scope and cost review.** For each epic that will run, look at `scopeFlags`. For every
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

8. **Nothing runnable.** Before stopping, look at the skipped epics. If any is skipped only
   because its status is not `Not Started` or because it belongs to someone else (the two
   reasons Step 2 item 1 allows), list them and ask with `AskUserQuestion` (`multiSelect: true`, one option per
   epic, by label, plus `None — stop here`; a numbered plain-text list instead when there are
   more than three) which the owner wants to queue explicitly; continue to Step 2 with those. Otherwise say that no
   epic is runnable and stop: nothing is launched for an empty queue. If `launch.sync.state` is
   `clone-ahead`, also print the fetch command from the warning — merged work is waiting — and
   point to `/peak-workflow:autopilot report`.

## Step 2: Confirm

1. **Proposed queue.** Every epic whose Tonight column is "runs", "builds, then parks for you",
   "resumes at …" or "starts over", in the order given. Do not shorten it. An epic that "waits
   for your decision" is not offered: it is decided in `/peak-workflow:autopilot report` first. An epic the owner asks to add although preflight skips
   it is allowed only for two reasons — its status is not `Not Started` (for example, paused by
   `/peak-workflow:pause`), or it belongs to someone else — and goes into `explicit` as well as
   `queue`. Safety, hardware and no-anchor epics are never added. An epic that resumes or starts
   over from a decided gate needs no `explicit` entry.

2. **Show the run**, as one block:

   - The queue, numbered, each with its dependencies. For an epic with a `gate`, say what
     happens: "resumes at `<gate.enters>` on its branch — you answered "<gate.answer>"", or
     "starts over" with the reason from `reasons`.
   - **Safety caps** from `launch.caps`, under exactly that heading, with this sentence first:
     "A cap is where autopilot stops a step that has run away. It is a ceiling, not what a step
     usually takes or costs." Then a table with one row per entry — `plan`, `build`, `audit`,
     `verify`, then `fix` marked "only if the one repair round happens" — and the columns
     Step, Cap, Model, Effort. The Cap cell is the entry's `size` followed by its ceiling in
     brackets, for example `S (30 min, $5)`. Under the table, one line: "Sizes: XS up to 15
     minutes, S up to 30, M up to 60, L up to 120." Do not show turns, and do not call any of
     these an estimate or say what a run will cost.
   - Run limits: `launch.config.runBudgetUsd` dollars; end time `launch.endByLocal`; the run also
     stops on a red base, low disk (`launch.config.diskFloorGb` GB), or two infrastructure errors
     in a row.
   - **When an epic parks or fails** (`launch.config.onPark`): `stop` — "the run stops at the
     first epic that parks or fails; the epics after it are not started tonight"; `continue` —
     "epics that depend on it are blocked, independent epics still run". Say where it is set:
     `launch.projectSettingsFile` (`<root>/.claude/peak-workflow/autopilot.json`, `{"onPark": "continue"}`),
     a file the owner edits and commits; this skill never writes it. With `stop`, add that
     "independent" is the planner's judgement, which is why stopping is the default.
   - **Gates.** Read `${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/policy/gates.json`. List the
     `answer` rows as "answered for you: <skillStep> → <answer>", and the `park` rows as "parks
     for you: <skillStep> — <why>". Add: every other question parks; the plan is approved by a
     lint, not by a person; an auditor reads each build and a high finding in
     `launch.config.audit.parkOn` parks it.
   - **The copy's environment:** the `setup` command, the `copy` files and the `readOnly`
     directories from `launch.env` (or "none needed") — for `readOnly`: "sessions may read
     these and change nothing in them" — and that the copy passed the project's tests in
     Step 1 item 5. The
     driver runs `setup` and the copy again at the start of the run and after each merge; a
     session that adds a new dependency has no network to fetch it, and parks.
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
   the confirmed queue (add `--explicit <id>,<id>` for epics queued explicitly, and
   `--allow-test-double` never — a dry run starts nothing), and show its output (the queue, each exact session command, the settings
   and the gate policy). It starts no session and writes nothing; a changed budget or end time is
   not saved either. Say that `/peak-workflow:autopilot` launches the real run, and stop.

2. **Start the driver detached**, so it outlives this session. On macOS:

   ```bash
   nohup caffeinate -i node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs" run --workspace "<launch.workspace>" --run "<launch.run>" >> "<launch.runDir>/autopilot.log" 2>&1 &
   ```

   On Linux or Windows (Git Bash, WSL), drop `caffeinate -i`. The redirect is `>>`, never `>`:
   the driver appends to `autopilot.log` itself, and `>` would truncate what it writes.

3. **Check it started:** wait three seconds, then `cat "<launch.workspace>/lock"` and
   `tail -n 5 "<launch.runDir>/autopilot.log"`. A `lock` file (JSON with a `pid`) means it is running.
   If there is no lock but the log tail has a `run ended:` line, the run already finished (a
   short queue, or a red base): say so in one line, skip item 4, and **go straight on to
   Step 4 (Report) in this session** — present the report and ask any waiting question now,
   rather than telling the owner to run `/peak-workflow:autopilot report`. Step 4 item 1's
   preflight is still run: it names the run that just ended. If there
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
   If the run ended with no report (the driver was killed), this command writes one. The
   report's `sync` is how the project and the clone compared when the run started; for how they
   compare now, use `launch.sync` from item 1.

4. **Present it**, for someone who has never seen this report and does not know the jargon.
   Lead with what happened and what they must do; keep file paths and IDs for the detail.

   a. **TL;DR first.** Print `report.json`'s `tldr` lines verbatim as a short bullet list under
      the heading "TL;DR". Add nothing before it.

   b. **One line of orientation**: "Autopilot built these in its own private copy of your
      project. Your project has not been changed." Then three short lists from `report.json`'s
      `epics`, each epic by `label`, under plain headings:
      - **Finished and merged** (`outcome: MERGED`) — with cost.
      - **Waiting for you** (`outcome: PARKED`) — in one plain sentence each: why it stopped
        (`reason`, reworded if it is jargon) and the question you will be asked (the `question`
        of each entry of the top-level `gates` whose `epic` is this epic's `id`). Give the
        `evidence` path (relative to `<ws>`) last.
      - **Did not finish or did not start** (`FAILED`, `BLOCKED`, `SKIPPED`, `NOT STARTED`) —
        `outcome` in plain words and `reason`.

      Omit a list that is empty, except say "Nothing is waiting for you" when that is so.

   c. **Guardrails**, in plain sentences rather than the report's own lines: how many actions
      the rules refused and what kind, how many routine questions were answered from the
      pre-agreed list, what the independent reviewer (the auditor) found, and whether any
      existing test was changed. For any epic with auditor findings, or with entries in
      `testChanges`, show them: each one is something only a person judges. If a rehearsal's
      stand-in ran the sessions, say the review results are not real.

   d. The first time a term from the report's "Words used in this report" list appears in what
      you write (epic, parked, gate, merged, clone, integration line, referee, auditor), add a
      few words saying what it means. Give the path `<run>/report.md` for the full detail and
      say that its last section explains every term.

5. **Decide the parked gates.** For each entry of `report.json`'s `gates` whose `decided` is
   null, in order:

   a. Show the gate's `label`, `kind`, `why`, and what there is to look at: the `artifacts`
      (paths under `<ws>`; `clone:` means inside `<ws>/clone`); when `tor` is set, that
      requirement's Scenario (`sh "${CLAUDE_PLUGIN_ROOT}/scripts/tor-lifecycle" --root "<ws>/clone" text <tor>`);
      the `branch` the work is on; the session's files in
      `<ws>/runs/<gate's run>/epics/<epic>/<session>/` (a gate may come from an earlier run, and
      step names repeat across runs); and —
      for an `audit` gate — that epic's high findings with their evidence. If `artifacts` is
      empty, say so and point to the session's files and the branch. Offer to open any of
      them; reading is fine, changing anything is not.

      **For a `human-check` gate, do the opening for them.** Many owners are not developers.
      For each path in the gate's `open` list (a built page, a chart), run the system's opener
      yourself — macOS `open "<path>"`, Windows `cmd.exe /c start "" "<path>"`, Linux
      `xdg-open "<path>"` — and say: "I've opened `<file name>` for you; it should be in front
      of you now." Then give the full path on its own line in case nothing appeared. If `open`
      is empty, say there is nothing to open and show `run-output.txt` in the chat instead.
      Then print each entry of `checklists` (the steps the build wrote for looking at it) as a
      short numbered list under "How to check it", in plain words. Never ask the owner to find
      or open a file themselves.

   b. **Ask the gate's own question.** Use `AskUserQuestion` with `question` verbatim and
      `options` verbatim as the option labels, plus one more option, `Decide later`. No
      "(Recommended)", no reordering, no added options. If the question's own text carries a
      recommendation (a build session's deferral question does), say before asking that it is
      that session's recommendation, not autopilot's and not yours. If the gate has fewer than two options or
      more than three, do not use `AskUserQuestion`: print the question and its options as a
      numbered list and take the typed answer. A gate with no options (`preflight`) has no answer
      to record — the fix is in the project, and it clears when preflight passes: say what to
      fix (its `question`) and move on.

      **A `human-check` gate with `checks` is a short form, not the gate's own question.**
      `checks` holds the requirement's own Then lines: what a person must see for it to be met.
      Ask one `AskUserQuestion` question per entry, at most four per call, in `n` order. The
      question is the line as a plain question a non-developer can answer by looking (for
      "every label should be readable in full, with no label drawn over another label or over
      a bar": "Can you read every label in full, with none overlapping?"); the options are
      exactly `Yes, I saw this`, `No`, `Couldn't tell`, and each option's description quotes
      the line verbatim. Do not ask the gate's `question` as well: the answers decide it.
      - If the gate has `asks` (the verifier asked for more after an earlier look), show them
        first in plain words, and say that what was recorded before is kept: only these lines
        are asked.
      - Every answer `Yes, I saw this` → the answer is `Looks right`. No note is needed; offer
        "Anything you want to add?" once and accept "no".
      - Any `No` → the answer is `Not right — describe`. Ask in plain text: "What is wrong, and
        what should it look like instead?" That is the note; it briefs the repair.
      - Any `Couldn't tell` → help them look again (re-open the file, re-read the step). If it
        stays, record nothing and treat the gate as `Decide later`. Never turn it into a yes.

      Never tick a line for them and never infer an answer from the artifacts: each yes is the
      owner's observation, and the next run hands it to the verifier as such.

      **A `human-check` gate without `checks`** (an older gate, or a UI epic with no
      operator-observed requirement) keeps the earlier flow: ask the gate's own question, then
      "What did you do to check it?" (`AskUserQuestion`, `multiSelect: true`, up to three ways
      of looking built from `artifacts`), then in plain text "In a sentence or two, what did you
      see?" or, after `Not right — describe`, "What is wrong, and what should it look like
      instead?" The note is `<what they did>. <what they saw, verbatim>`; never write it for
      them. The driver refuses a look with neither a note nor the form's answers.

   c. **Record what the owner chose**, exactly, unless it was `Decide later`:

      ```bash
      node "${CLAUDE_PLUGIN_ROOT}/scripts/autopilot/driver.mjs" decide --workspace "<ws>" --gate "<file>" --answer "<the chosen option label>"
      ```

      For a `human-check` form, add `--observations '<json>'`: an array with one
      `{"n": <the check's n>, "answer": "yes" | "no"}` per entry of `checks` (and `--note` for
      the words that go with a "no"). The driver refuses a missing line, a "couldn't tell", and
      an answer that does not follow from the lines.

      `<file>` is the gate's `file` value. Add `--note "<their words>"` when the owner explained
      the choice; for a `human-check` gate the note from item b is required. The command writes
      `decided: {answer, by, date, scope: "next-run"}` into the gate file, with `by` taken from
      `git config user.name`, and re-renders the report. It refuses an answer that is not one of
      the gate's options; if it refuses, ask again — never substitute a different option.

   d. **Say what the answer does, in one sentence**, from the command's output: "Recorded. The
      next autopilot run continues this epic at `<enters>`." Nothing else here: no conditions,
      no commands, no alternatives. An answer that tells the session to stop (a deferral gate's
      "Stop — I'll take it from here") is replayed like any other and the epic parks or fails
      again: say that in the same sentence, and that continuing by hand is then the way forward.

6. **Close with the one thing to do next.** Many owners are not developers: a list of options
   reads as a list of chores. Print a heading "Do this next" and exactly one action, chosen in
   this order:

   1. Gates are still undecided and the owner chose `Decide later` → "Run
      `/peak-workflow:autopilot report` again when you are ready to answer <n> question(s)."
   2. A gate was decided and not yet used, or epics are still unbuilt → "Run
      `/peak-workflow:autopilot`" with the queue to give, as IDs in order, in a code block.
   3. Otherwise, `launch.sync.state` is `clone-ahead` → "Bring the finished work into your
      project" with these two lines in a code block — print, do not run — and one sentence:
      the first line shows what will come in, the second brings it in.

      ```bash
      git fetch "<ws>/clone" <integration>:autopilot/<integration> && git log <integration>..autopilot/<integration>
      git merge --ff-only autopilot/<integration>
      ```
   4. Otherwise → "Nothing. Everything autopilot built is already in `<integration>`."

   Then one line, and only this line, for everything else: "Other things I can help with if
   you ask: bring finished work into your project now, continue a stopped epic by hand, or
   walk through the full report (`<run>/report.md`)." Do not print the fetch commands, the
   by-hand `resume` line, the `validWhile` condition or the report's own "Do this next" list
   unless the owner asks. When they do ask:
   - **Bring the work in**: the two lines above. Add that the private clone is the only copy
     of that work until it is fetched, so the workspace must not be deleted first; that a
     resumed epic's history includes a `wip(autopilot)` commit from its park, which is
     expected; and that decisions not yet used stay usable however the work is merged, as long
     as the parked branch still merges cleanly into `<integration>`.
   - **Continue by hand**: the gate's `resume` line, after fetching the branch
     (`git fetch "<ws>/clone" <branch>:<branch>`); the epic should then not be queued for
     autopilot again.
   - **How long a decision holds**: while that branch is unchanged and still merges cleanly
     into the integration line; otherwise it is void and the epic is planned again.

   Then stop.

## Step 5: Stop (`/peak-workflow:autopilot stop`)

`DRIVER preflight --project "<root>" --json` (ignore `ok` and the refusals here); if `launch.lastRun.status` is not `running`, say
nothing is running and stop. Otherwise run `DRIVER stop --workspace "<launch.workspace>"`. It
writes the `STOP` file, waits for the driver to park the epic in flight and write its report,
removes the `STOP` file, and prints the report path. Then offer `/peak-workflow:autopilot report`.

## What autopilot leaves behind

| Path | What it is |
|---|---|
| `<project>.autopilot/` | The workspace: one per project, kept between runs. Never inside the project |
| `settings.json` | The owner's settings for every run (budgets, scope, audit, `claudeBin`). Edited by hand; the driver only creates it |
| `clone/` | The one private clone, with no remote. Merged epics are on its integration line; parked and failed epics keep their branch. Work left uncommitted at a park is kept as a `wip(autopilot)` commit on that branch, and stays in its history when the epic later merges |
| `gates/<epic>-<n>.json` | One file per question that needs the owner, from every run |
| `epics.json` | What a parked or failed epic carries into the next run (its plan, audits, fix round) |
| `runs/<YYYYMMDD-HHMMSS>/` | One directory per run; `current` names the latest |
| `runs/<run>/config.json` | That run's queue, end time and run budget, confirmed in Step 2 |
| `runs/<run>/state.json`, `preflight.json` | The driver's state machine (each epic's `state`) and the preflight it ran from |
| `runs/<run>/epics/<id>/…` | Every session's stream, referee log, plan, checks and audit |
| `runs/<run>/report.md`, `report.json`, `autopilot.log` | The morning report and the driver's log |
| `lock`, `STOP` | The single-instance lock and the kill switch, one per workspace |
| `prepare.json` | The latest proof from Step 1 item 5: what was copied, how `setup` and the tests ended |
| `<project>/.claude/peak-workflow/autopilot.json` | The owner's project settings, such as `"onPark": "continue"`. Autopilot writes only its `setup`, `copy` and `readOnly` entries, through `driver.mjs configure`, after the owner confirms them |
