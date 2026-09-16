# peak-workflow — User Acceptance Test Materials

**Plugin under test:** `peak-workflow` v1.11.0 (UNDER DEVELOPMENT on `develop`)
**Purpose:** exercise the full greenfield lifecycle by hand, on four throwaway projects, and
record what actually happens.

This is the **first time the reference sheets' code is executed**. Every stack snippet in
`plugins/peak-workflow/references/*.md` was checked against library documentation only — never
compiled, never run. Expect the walking-skeleton epic to surface real build errors. Those are
findings, not surprises; file them with the template at the bottom of this page.

---

## 1. The four projects

| # | Project | Project type | Route under test | Doc |
|---|---------|--------------|------------------|-----|
| 1 | **Habit Tracker** | Web app, all five shape answers "no" | `bun-static-spa-stack.md` — browser-only SPA, IndexedDB, GitHub Pages. **No dry-run coverage this cycle — highest risk.** | [habit-tracker.md](habit-tracker.md) |
| 2 | **Benchlog** | Desktop app | `bun-electron-desktop-stack.md` — offline Windows Electron app, attribution field instead of sign-in, `N/A (shape Q6)` on Auto-update | [benchlog.md](benchlog.md) |
| 3 | **Shiftboard** | Web app, four "yes" answers | `bun-web-app-stack.md` — sign-in in **deferred mode** (real email-and-password now, Okta pending IT approval), roles, live updates, `**Access rule:** owner-or-permitted-role`. **No dry-run coverage this cycle.** | [shiftboard.md](shiftboard.md) |
| 4 | **PokeMeta** | Service or API, **existing repo** | No sheet — `code_present = true`, .NET row of the toolchain table, `**Not decided yet:**` line | [pokemeta.md](pokemeta.md) |

Run them in that order if you are running all four: 1 and 2 are the cheapest, 3 needs Docker, 4
needs the .NET SDK. **None of them needs a cloud account or an OAuth client** — Shiftboard's
deferred mode is specifically the path that does not block on an external approval.

The four product descriptions in one place (paste-ready): [project-descriptions.md](project-descriptions.md).

---

## 2. Prerequisites

Shared by every project:

| Tool | Why | Check |
|---|---|---|
| `git` | every skill branches and commits | `git --version` |
| Claude Code CLI | runs the plugin | `claude --version` |
| Bun 1.2+ | projects 1–3 | `bun --version` |

Per project:

| Project | Extra prerequisite | Check |
|---|---|---|
| Habit Tracker | Playwright browsers (`bunx playwright install`, one time) | `bunx playwright --version` |
| Benchlog | **Node.js 22.12+ (LTS)** — Playwright's runner and electron-vite both run on Node; without it `bun run test:e2e` can hang | `node --version` |
| Shiftboard | Docker (running) for `docker compose` and the E2E harness | `docker info` |
| PokeMeta | .NET 8 SDK | `dotnet --version` |

Also set up a scratch workspace outside this repo so nothing lands in the plugin repo by accident:

```bash
mkdir -p ~/uat-workspace
```

---

## 3. Loading the plugin under test

### 3.1 Local directory (recommended for UAT — picks up uncommitted work)

`claude plugin install` has **no `--plugin-dir` flag**. The local-directory route is a session
flag on `claude` itself:

```bash
cd ~/uat-workspace/<project>
claude --plugin-dir /Users/schaveyt/github/peakflames/claude-plugins-peakflames/plugins/peak-workflow
```

- The plugin is loaded **for that session only** — it is not installed, and closing the session
  unloads it. Every UAT step below that says "start a fresh session" means re-running this exact
  command.
- The flag is repeatable (`--plugin-dir A --plugin-dir B.zip`), and pointing it at a *folder of
  plugins* loads each child. There is also `--plugin-url <url>` for a `.zip`.
- Because it reads the working tree, this route tests **exactly what is on your `develop`
  checkout**, including uncommitted edits. That is what you want while validating v1.11.0.

Confirm it loaded: type `/` in the session and look for the `peak-workflow:*` skills, or run
`/peak-workflow:new-project` and check it responds.

### 3.2 Marketplace route (what a real user does — tests the released path)

```bash
# unreleased work on develop:
claude plugin marketplace add https://github.com/peakflames/claude-plugins-peakflames.git#develop
claude plugin install peak-workflow@peakflames-plugins
```

Drop the `#develop` fragment to track `main` (the released line). Note that plugin entries in this
marketplace use **relative paths**, so they cannot pin a ref of their own — they follow whatever
ref the marketplace was added at.

Use 3.1 for the UAT runs. Use 3.2 once at the end, as a smoke test that the install path works.

---

## 4. How to run a UAT session

Each skill in the lifecycle gets its **own fresh Claude Code session**. This is not optional
politeness — `wrapup-epic` has a Session Guard that refuses to run in a session that implemented
the epic, and the other skills are written assuming clean context.

```
session 1  /peak-workflow:new-project "<description>"   (routes, writes nothing)
session 2  /peak-workflow:setup
session 3  /peak-workflow:discover
session 4  /peak-workflow:mockup              (UI projects only)
session 5  /peak-workflow:capture-requirements
session 6  /peak-workflow:plan-project
           — merge the docs/ branch to the base branch —
session 7  /peak-workflow:start-epic <skeleton-id>
session 8  /peak-workflow:wrapup-epic <skeleton-id>
session 9  /peak-workflow:status              (read-only, any time)
```

**Answer as the persona.** Each doc gives you a persona who is non-technical. Answer in their
words. If a skill asks something the persona could not possibly know, that is itself a finding —
record it and answer "I don't know" to see how the skill recovers.

**Do not help the agent.** Do not paste file paths it should find, do not correct its stack
choices, do not run the build for it. The point is to observe what the plugin does unaided.

---

## 5. Pass/fail criteria that apply to every project

Record PASS / FAIL for each of these at the end of the run, in addition to the per-step checks in
each project doc:

| # | Criterion | How to check |
|---|---|---|
| G1 | Planning work never touched the base branch | `git log --oneline main` (or `develop`) shows no planning commits before the merge |
| G2 | `CLAUDE.md` has all required sections after `setup` | Project Overview, Tech Stack, Local Environment, Tool Hygiene & Operability, Security Baseline, Verification & Quality Gates, Release Protocol (+ UX Baseline on UI projects) |
| G3 | Every TOR ID matches `TOR-[0-9]{2}-[A-Za-z0-9]{7}` | `grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/requirements/ \| sort -u \| wc -l` |
| G4 | Every TOR ID is owned by exactly one epic | compare the union of `requirements:` lines in `docs/implementation-plan/status/epic-*.md` against G3's list — no duplicates, no orphans |
| G5 | No unresolved deferred values survive the skeleton | on the skeleton's feature branch: `grep -nE 'TBD — set by the walking-skeleton epic\|— unconfirmed\|Board: not chosen\|\*\*Not decided yet:\*\*' CLAUDE.md` returns nothing |
| G6 | The skeleton actually builds and its tests pass | run the Tests command from `CLAUDE.md`'s Verification & Quality Gates section yourself, cold |
| G7 | `/peak-workflow:status` reports coverage without errors | run it after the merge; Requirements Coverage should be 100% planned |
| G8 | The question count is sane | count every question asked across `setup` — the v1.11.0 contract is 2–5 typical. More than ~8 is a finding |

---

## 6. Defect reporting template

One entry per defect, in a file named `findings-<project>.md` next to these docs (or paste into a
GitHub issue on `peakflames/claude-plugins-peakflames`).

```markdown
### F-NN — <one-line summary>

- **Severity:** Critical (blocks the run or produces wrong artifacts) / UX (confusing, wrong
  question, bad wording) / Minor (cosmetic, typo)
- **Project:** Habit Tracker / Benchlog / Shiftboard / PokeMeta
- **Skill + step:** e.g. `setup` Step 3, shape questions
- **What the agent asked / did:** <quote it verbatim>
- **What I answered:** <verbatim>
- **File written:** <path, plus the exact lines that are wrong>
- **Expected:** <what the SKILL.md says should have happened — quote the line>
- **Actual:** <what happened>
- **Session log:** <path to the transcript, or the timestamp>
```

**Severity guidance for build failures:** a reference-sheet snippet that does not compile is
**Critical** — the sheets are the single source of truth for the greenfield stack and the skeleton
writes them verbatim. Record the exact file, the exact error, and the library version resolved
(`bun pm ls` / `dotnet list package`).
