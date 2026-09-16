# UAT — PokeMeta (existing-repo / no-sheet route)

**Route under test:** `code_present = true`. No reference sheet is read, nothing is
re-scaffolded, and the defaults come from the **C# / .NET row** of `setup`'s toolchain table.
Exercises the `**Not decided yet:**` line, the Service-or-API shape questions phrased for
callers, and the absence of a UX Baseline.

**Persona:** *Priya*, a technical program manager. She knows the repo is .NET 8 and that her org
standardises on .NET. She does not make architecture decisions.

**Time:** ~2–3 hours.

Read [README.md](README.md) first — prerequisites, plugin loading, global criteria G1–G10, defect
template.

---

## 0. Prerequisites for this run

- **.NET 8 SDK** (`dotnet --version` → 8.x)
- `git`
- No Bun, no Docker, no cloud account

## 1. Create the UAT repo — **with code already in it**

This is the whole point of this run: `setup` and `plan-project` must detect existing code and
extend it. Build the pre-existing repo exactly like this, and commit it, so `code_present` is
true and there is a real git history:

```bash
mkdir -p ~/uat-workspace/pokemeta && cd ~/uat-workspace/pokemeta
git init

dotnet new sln --name PokeMeta
dotnet new webapi --output src/PokeMeta.Api --name PokeMeta.Api --framework net8.0
dotnet sln add src/PokeMeta.Api/PokeMeta.Api.csproj

dotnet new gitignore
dotnet build

git add -A
git commit -m "chore: dotnet new webapi scaffold"
```

**Check before you start:**

```bash
ls src/PokeMeta.Api                       # Program.cs, PokeMeta.Api.csproj, appsettings.json
grep -rn 'WeatherForecast' src/           # the template sample code — the skeleton must replace it
grep -n '<Version>' src/PokeMeta.Api/PokeMeta.Api.csproj   # expect NOTHING — this is deliberate
git log --oneline                         # one commit
```

The **missing `<Version>` element is intentional.** `setup` should write
`TBD — set by the walking-skeleton epic (add <Version> to src/PokeMeta.Api/PokeMeta.Api.csproj)`
— naming the exact file — rather than a default pointing at something that does not exist.

---

## 2. Session 1 — `/peak-workflow:new-project`

```bash
cd ~/uat-workspace/pokemeta
claude --plugin-dir /Users/schaveyt/github/peakflames/claude-plugins-peakflames/plugins/peak-workflow
```

```
/peak-workflow:new-project We already started a C# web API project in this repo — it's just the empty template right now. I want it to serve Pokemon metadata: look up a Pokemon by name or number and get back its types, its base stats, and what it evolves into. Anyone can call it, there's no login. It needs to be something our other teams can point their apps at.
```

**Expect:** Verdict **GREENFIELD** — *with* `Existing code (build manifest or src/): yes`. The
verdict stays GREENFIELD (a repo with code and no peak-workflow artifacts still starts at
`setup`), but the wording must change to something like *"There's code here already, but no
peak-workflow planning yet. Setup reads your existing stack from the code — nothing gets
re-scaffolded."*

**Answer:** *"I'll run it manually"*.

| # | Check | Pass when |
|---|---|---|
| 2.1 | Verdict GREENFIELD, **`Existing code: yes`** | both |
| 2.2 | The "nothing gets re-scaffolded" wording appeared | this is the v1.11.0 behavior |
| 2.3 | Nothing written, no branch created | `git status --porcelain` empty, `git branch` shows the initial branch only |

---

## 3. Session 2 — `/peak-workflow:setup`

Fresh session, then `/peak-workflow:setup <same description>`.

### What to answer

| Order | Question | Answer as Priya |
|---|---|---|
| 1 | Project type | **"Service or API"** — "no screen, other teams' apps call it" |
| 2 | Required language or platform | **"It has to be .NET — that's what we standardise on, and it's already started."** |
| 3 | Shape questions **2–4, phrased for callers** | "No — callers don't identify themselves, it's open read-only data. No uploads. No, callers don't need to be told about changes as they happen." |
| 4 | One combined confirmation | Read and accept |
| 5 | **Publish to GitHub** — asked on its own, *after* the setup commit, as one question pair (where / who can see it) | **"Not now — keep it on this computer"** |

`setup` must **not** ask about the stack — the code is the stack.

### The traps this run sets

Record a **Critical** finding if `setup` does any of these:

1. Reads a reference sheet or proposes the Bun web stack.
2. Reports "divergence from the reference sheet" as a finding.
3. Proposes re-scaffolding, rewriting, or swapping a library.
4. Tells a .NET service to configure **Pino** or names a Bun logger path. The correct default is
   the toolchain table's .NET row: `Microsoft.Extensions.Logging` JSON console, configured in
   `Program.cs`.
5. Writes a UX Baseline section (there is no user interface).

### What to check

```bash
cd ~/uat-workspace/pokemeta
grep -n 'Q[1-6] \|Not decided yet\|TBD — set by the walking-skeleton epic\|N/A' CLAUDE.md
grep -n '^## ' CLAUDE.md
git log --oneline
```

| # | Check | Pass when |
|---|---|---|
| 3.1 | Question count ≤ 4 (G8) | counted |
| 3.2 | `**Product shape:**` block present with **Q2, Q3, Q4 answered** and **Q1 and Q5 written `not asked (Service or API)`** | the labels are fixed — not omitted |
| 3.3 | **No** `**Access rule:**` line | `grep -c 'Access rule' CLAUDE.md` → 0 |
| 3.4 | Tech Stack is read **from the code**: .NET 8, `src/PokeMeta.Api`, the `.sln` | no sheet named anywhere in the section |
| 3.5 | Run/test/lint/build defaults come from the **.NET row**: `dotnet run --project src/PokeMeta.Api`, `dotnet test` (`tests/`), `dotnet format --verify-no-changes` / `dotnet format`, `dotnet build` | verbatim from the toolchain table |
| 3.6 | Logging is `Microsoft.Extensions.Logging` **JSON console**, configured at `Program.cs`, with levels in that logger's own names (`Debug / Information / Warning / Error`) | **not Pino**, not a Bun path |
| 3.7 | Version single source of truth records `TBD — set by the walking-skeleton epic (add <Version> to src/PokeMeta.Api/PokeMeta.Api.csproj)` naming the exact file | the missing-element rule |
| 3.8 | A `**Not decided yet:**` line exists listing only layers the Project Overview actually needs — e.g. `database (default SQLite), CI` — and **not** container/hosting/backups unless deploying is in scope, and **not** secrets (the product holds none) | over-listing is a finding |
| 3.9 | Version exposure is `GET /version` returning `{name, version}`, **reachable without signing in** | the Service/API mechanism |
| 3.10 | Exit code + stdout/stderr rows marked `N/A` | marked, not omitted |
| 3.11 | Error message standard is **RFC 9457 problem details with a `detail` naming the next action** | the Service/API form |
| 3.12 | **No `## UX Baseline` section** | `grep -c 'UX Baseline' CLAUDE.md` → 0 |
| 3.13 | Frontend Stack Summary rows, if any table is written, marked `N/A — no user interface (Service or API)` | marked |
| 3.14 | Step 8 reported `[N/A] Recommended skills — none required for Service or API` | neither `frontend-design` nor `playwright-cli` recommended |
| 3.15 | A `chore: peak-workflow setup` commit exists (the repo already had commits, so this is **not** "initial project setup") and stages only setup's own files by path | `git show --stat HEAD` |
| 3.16 | **The existing code is untouched** | `git show --stat HEAD` lists no file under `src/` |
| 3.17 | **`develop` created from the existing branch and checked out** — the existing branch (`main`, or `master` if `git init` made that) is **not** renamed, because the repository already had commits | `git branch` shows `* develop` plus the original branch; the Release Protocol names the original branch as the release branch |
| 3.18 | The publish question came **after** the commit, on its own, and "Not now" reported `[N/A] GitHub — not published` | nothing was created on GitHub |
| 3.19 | **No** shadcn skill, `shadcn` MCP server, `**shadcn tooling:**` line, or Playwright install step | `ls .claude/skills .mcp.json` finds no shadcn; `grep -ci 'shadcn\|playwright install' CLAUDE.md` → 0 |

---

## 4. Session 3 — `/peak-workflow:discover`

Fresh session, `/peak-workflow:discover`. Accept the `docs/pokemeta` branch.

**Expect brownfield-ish framing but greenfield mode** — there is code, but no vision/ConOps, so
this is the full discovery interview.

**Answer as Priya:**

- *Problem:* "Three of our teams each scrape or hard-code Pokémon data. It drifts and nobody owns
  it."
- *Users:* "Other teams' applications. A developer integrating against it is the user."
- *Success:* "One documented endpoint per lookup, stable response shapes, and a version other
  teams can pin against."
- *Data:* "Static reference data we load at startup. It changes when a new generation ships,
  which is rarely."
- *Out of scope:* "Battle simulation, user accounts, writes of any kind."

**Step 4.5:** re-check confirms Q2–Q4 all no. Expect no contradictions.

**At Step 6:** *"Continue planning"*.

| # | Check | Pass when |
|---|---|---|
| 4.1 | On `docs/pokemeta`; the base branch untouched (G1) | verified |
| 4.2 | Vision 11 sections, ConOps 9 sections, substantive | no placeholders |
| 4.3 | ConOps Section 5 scenarios are **API-shaped** — requests, parameters, response fields, status codes — not screen steps | present |
| 4.4 | ConOps Section 6 names the interface (HTTP, JSON) and the data flow | present |
| 4.5 | **`/peak-workflow:mockup` is NOT recommended** in the Next Step | Service or API has no UI |
| 4.6 | The existing .NET project is described as the starting point, not as something to replace | present |

---

## 5. Session 4 — `/peak-workflow:capture-requirements`

There is **no mockup session** on this project — go straight here. Fresh session,
`/peak-workflow:capture-requirements`.

Approve a capability-shaped grouping (e.g. `lookup`, `evolution`, `operability`).

| # | Check | Pass when |
|---|---|---|
| 5.1 | Feature file + tracing sidecar pairs exist | matched |
| 5.2 | TOR IDs unique and well-formed (G3) | `grep -rhoE 'TOR-[0-9]{2}-[A-Za-z0-9]{7}' docs/requirements/ \| sort \| uniq -d` empty |
| 5.3 | `# Tool Hygiene & Operability` block present: `GET /version`, the startup log record in the .NET logger's JSON form, the logging convention, and the RFC 9457 error standard | present |
| 5.4 | **No `# UX Baseline` block** | correct — the section does not exist in `CLAUDE.md` |
| 5.5 | **No exit-code or stdout/stderr TORs** | those lines are `N/A` |
| 5.6 | Negative-path TORs exist: unknown Pokémon name, out-of-range number, malformed request — each asserting the status code and the problem-details `detail` | present |
| 5.7 | **No access-control TORs** | no sign-in on this product |
| 5.8 | The Step 7 summary shows ConOps steps covered `X of Y` with X = Y or explicit deferrals | no silent gaps |
| 5.9 | Nothing committed | merge is the approval gate |

---

## 6. Session 5 — `/peak-workflow:plan-project`

Fresh session, `/peak-workflow:plan-project`.

**The headline check for this run:** the walking skeleton must **extend** the existing project.

| # | Check | Pass when |
|---|---|---|
| 6.1 | v2.5.0 layout complete | present |
| 6.2 | Every TOR owned by exactly one epic (G4) | `uniq -d` on the sidecars is empty |
| 6.3 | The skeleton **never re-scaffolds**: no `dotnet new`, no project generator, no reference sheet read | any of these is **Critical** |
| 6.4 | The skeleton spec **names every existing project and file it will modify** in Key Components — `src/PokeMeta.Api/Program.cs`, `PokeMeta.Api.csproj`, the `.sln` | present |
| 6.5 | The skeleton **replaces the `WeatherForecast` template sample code** with the tool-hygiene baseline | named explicitly |
| 6.6 | The skeleton **adds the `<Version>` element** to `src/PokeMeta.Api/PokeMeta.Api.csproj` | the TBD it resolves |
| 6.7 | The skeleton adds only the layers the `**Not decided yet:**` line lists, and **deletes that line** once each is a Tech Stack row | present |
| 6.8 | CI is planned **only if** `CLAUDE.md`'s Release Protocol or `**Not decided yet:**` line named one — and a CI provider depends on team accounts, so it must be **confirmed with the user** in the start-epic plan | not picked silently |
| 6.9 | The skeleton names the **test-only fault/latency switch** — an env var read at startup, ignored when `ASPNETCORE_ENVIRONMENT=Production` — so an error-path TOR such as "data source unavailable" has a Given to cite | present |
| 6.10 | **No `## Screens` section** on any epic | no UI |
| 6.11 | The skeleton spec states the architectural pattern it establishes (how a request reaches a handler, where tests live) and that `docs/architecture.md` records it once complete | present |
| 6.12 | Scenario titles in Requirements Anchors are verbatim | spot-check three |

---

## 7. Merge the `docs/` branch

```bash
git status --short
git checkout develop
git merge docs/pokemeta --no-ff
ls docs/requirements/*.feature.md
```

---

## 8. Session 6 — `/peak-workflow:start-epic <skeleton-id>`

Fresh session. Approve the plan, then let it run unaided.

| # | Check | Pass when |
|---|---|---|
| 8.1 | Plan mode entered before any write; placeholders substituted | verified |
| 8.2 | CI (if planned) confirmed with you, with a recommended default | not silent |
| 8.3 | Branch `feature/epic-<id>-<short-name>` off the base branch | verified |
| 8.4 | `git diff --stat` on the branch shows the **existing** `Program.cs` and `.csproj` modified — **not** a parallel new project created beside them | the extension rule |
| 8.5 | `WeatherForecast` is gone | `grep -rn 'WeatherForecast' src/` returns nothing |
| 8.6 | `<Version>` now exists in `src/PokeMeta.Api/PokeMeta.Api.csproj` | present |
| 8.7 | **G5** — `grep -nE 'TBD — set by the walking-skeleton epic\|— unconfirmed\|\*\*Not decided yet:\*\*' CLAUDE.md` on this branch returns nothing | resolved |
| 8.8 | `dotnet run --project src/PokeMeta.Api` starts, and the **first log line** is a JSON record whose message is `PokeMeta.Api v0.1.0 starting` | the startup stamp |
| 8.9 | `curl localhost:<port>/version` returns `{"name":…,"version":…}` without authentication | version TOR |
| 8.10 | An error response is RFC 9457 problem details with a `detail` naming the next action | error standard |
| 8.11 | **G6** — you run `dotnet build`, `dotnet test` and `dotnet format --verify-no-changes` yourself, cold, and all pass | verify by hand |
| 8.12 | **No** Design pass step, `mcp__shadcn__*` call, or `bunx playwright install` in the plan or transcript | no UI |

---

## 9. Session 7 — `/peak-workflow:wrapup-epic <skeleton-id>`

Try it first in the implementer's session — the **Session Guard must refuse** (PASS). Then a
fresh session.

| # | Check | Pass when |
|---|---|---|
| 9.1 | Session Guard fired | refusal printed |
| 9.2 | Feature branch checked out before reading the sidecar/spec; `CLAUDE.md` re-read from it | verified |
| 9.3 | Deferred-value gate run and reported PASS | skeleton-only gate |
| 9.4 | **No UX Baseline check** ran | correct — no section |
| 9.5 | **No access-control check** ran | correct — no `**Access rule:**` line |
| 9.6 | **No visual/console check, and neither `playwright-cli` nor a Playwright harness was used** | no UI was changed |
| 9.7 | Every TOR's Given/When/Then verified independently, against the running service | not from the implementer's handoff |
| 9.8 | Any verifier fix recorded `FIXED DURING WRAPUP` | disclosed |
| 9.9 | Sidecar → `status: Complete`; handoff written | verified |
| 9.10 | Ship mode asked neutrally | choose **Solo** |

---

## 10. Session 8 — `/peak-workflow:status`

| # | Check | Pass when |
|---|---|---|
| 10.1 | Dashboard renders; Requirements Coverage 100% planned (G7) | no errors |
| 10.2 | Read-only | `git status --porcelain` empty |

---

## 11. Optional — the lookup slice

Run the lookup epic through `start-epic` → `wrapup-epic`. It is the best second slice here: real
domain logic on an existing codebase, negative-path TORs with problem-details bodies, and the
first use of whatever data layer the `**Not decided yet:**` line resolved to.

---

## 12. Run summary

```
Project: PokeMeta (existing .NET 8 repo, Service or API)
Plugin ref: <git rev-parse --short HEAD in the plugin repo>
Date: 
.NET SDK: ____
Global criteria:  G1 __  G2 __  G3 __  G4 __  G5 __  G6 __  G7 __  G8 __  G9 __  G10 __
Questions asked by setup: __
Sheet avoided (no Bun stack proposed)?  YES / NO
Pino avoided (correct .NET logging default)?  YES / NO
Existing code extended, not re-scaffolded?  YES / NO
`<Version>` TBD named the exact file, then resolved?  YES / NO
Skeleton build: PASS / FAIL
Findings filed: F-__ … F-__
Overall: PASS / PASS WITH FINDINGS / FAIL
```
