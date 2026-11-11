---
name: triage
description: Triage a GitHub issue on this plugin repo — find the root cause, grill whether it's worth fixing, and plan the fix in plan mode.
argument-hint: "<issue number or URL>"
disable-model-invocation: true
---

Triage one GitHub issue on `peakflames/claude-plugins-peakflames` from report to an approved plan. The argument is the issue number or URL; with none, list the open issues (`gh issue list --state open`) and ask which one.

Every step below happens in **plan mode**: read, run read-only commands and tests, and ask, but edit nothing until the plan is approved.

## 1. Enter plan mode and read the issue

Load `EnterPlanMode` with ToolSearch (`select:EnterPlanMode`) and call it. Then read the issue with its comments, labels and milestone: `gh issue view <n> --comments`. Follow its links to `lead-todo.md` entries, decisions (`DEC-NN`), evidence and earlier PRs.

Done when you can restate each problem in the issue in one sentence, naming the plugin, the skill or script, and the observed versus expected behaviour.

## 2. Find the root cause

For each problem in the issue, trace the behaviour to the code, prompt or doc line that causes it. Reproduce it when you can: a failing test, a command, a fixture run. Use the plugin's `docs/build/` records (decisions, acceptance register, verify reports) for intent. Dispatch an Explore subagent when the trace spans many files; finding facts is your job, never the user's.

Done when every problem has a **root cause** stated with `file:line` evidence and how you confirmed it (reproduced, or read and reasoned), or an explicit "not reproduced" with what you tried. A symptom restated is not a root cause.

## 3. Grill: is it worth fixing, and how

Grill the user relentlessly until you share one understanding of the fix. Map it as a **design tree**: each decision branches into the decisions that hang off it. Work it in **rounds**: the **frontier** is every decision whose prerequisites are settled. Ask the whole frontier in one round, numbered, each with your recommended answer and the evidence behind it:

```
❓ **Q1** - **<title>**: <question, with the choices>

➡️ <recommended answer and why>
```

Wait for the answers, recompute the frontier, and ask the next round. The tree always covers these branches:

- **Root cause**: does the user agree with step 2's finding?
- **Worth fixing**: user impact, how often it bites, criticality and effort, against the cost of the change. Verdict: fix now, defer (which milestone), won't fix, or duplicate.
- **Scope**: what is in, what moves to its own issue.
- **Approach**: the fix itself, any behaviour or contract change (a skill contract or flag change is a SemVer major or minor decision), and the version bump it implies.
- **Verification**: which tests prove it, and whether it touches platform-sensitive code (`lib/watchdog.mjs`, `scripts/setup.mjs`, paths, spawning), which needs the 3-OS CI matrix (DEC-53).

Done when the frontier is empty (every branch visited, nothing silently assumed) and the user confirms you share the understanding.

## 4. Close out the verdict

- **Defer, won't fix or duplicate**: draft a short issue comment (root cause, verdict, reason) and the label or milestone change, show both, and post them only after the user says yes. Exit plan mode without a build plan.
- **Fix**: write the plan (step 5).

## 5. Write the plan and exit plan mode

Write the plan into plan mode's own plan file, the standard plan Claude Code builds from, then call `ExitPlanMode`. The plan is the only build artifact: no work-package briefs, acceptance-register rows or other files under `docs/build/`. It covers:

- **Context**: the issue link, each problem with its root cause, and the decisions from step 3.
- **Changes**: the files to edit and what changes in each, in build order, on a `feature/<plugin>-<short-name>` branch from `develop` (or `hotfix/<slug>` from `main` for an urgent fix).
- **Versioning**: the `plugin.json` version and its matching `CHANGELOG.md` entry, changed in the same commit.
- **Verification**: the tests to run per change (affected files only), the full suite once at the end, and the CI matrix when step 3 said so.
- **Delivery**: a PR to `develop` whose body says `Fixes #<n>`, with the user asked before every push.

Once the plan is approved, offer to post a short triage comment on the issue (root cause and plan summary); post it only after the user says yes.
