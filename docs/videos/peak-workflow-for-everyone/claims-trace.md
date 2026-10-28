# Claims Trace

Every factual claim on a slide or in the narration, and its source. Skill paths are relative to
`plugins/peak-workflow/skills/` in claude-plugins-peakflames (peak-workflow v2.1.0).
Demo evidence paths are relative to the session scratchpad.

Opinion and earned-praise lines ("Guys, honestly, this is really good."; "this is the part I
really like") sit only on slides 6 and 9, each right after the evidence it reacts to.

The four thesis words (systematic, iterative, human-steered, backed by evidence) are the video's
framing. Each one is backed by the head-to-head rows on slides 5 to 9. One line on slide 6 is dramatized and marked below.

| Slide | Claim | Source |
|---|---|---|
| 1 | Vibe coding means chatting with Claude until it works | Definition used for this audience; matches `vibe-build/EVIDENCE.md` §1 (plain chat requests, no plan) |
| 2 | A tool crib is where a shop lends out gear; the app tracks who borrowed what | `vibe-build/EVIDENCE.md` §1 Request 1 |
| 2 | Three plain chat messages, no plan (bubbles quote requests 1 to 3, request 1 shortened) | `vibe-build/EVIDENCE.md` §1 Requests 1-3 |
| 2 | "Is this app done?" is the fourth message | `vibe-build/EVIDENCE.md` §1 Request 4 |
| 2, 5 | Four steps: talk it through, write the requirements, plan the epics, build then a fresh check | See slide 5 rows |
| 3 | Checkout, due dates, overdue flag, double-checkout block | `vibe-build/EVIDENCE.md` §3 "What it does today" |
| 3 | 22 browser checks, nothing broke | `vibe-build/EVIDENCE.md` §2 Regression checks (15 earlier + 7 new after request 3) |
| 4 | A brand-new Claude Code chat with no memory of the first one | `vibe-build/EVIDENCE.md` §1 Request 4 (fresh-session view, "no memory of the earlier chat") |
| 4 | "I can't tell you it's done, because nothing in this folder says what done means." | `vibe-build/EVIDENCE.md` §3, verbatim fresh-session answer |
| 4 | No list of needs, no record of what was asked | `vibe-build/EVIDENCE.md` §3 ("No requirements, no list of needs, no tests, no README") |
| 5 | Free plugin for Claude Code | Public marketplace `github.com/peakflames/claude-plugins-peakflames`, root `README.md` install steps |
| 5 | You answer questions; Claude does the paperwork | `discover/SKILL.md` Step 2A Interview Protocol ("Draft first ... do NOT ask open-ended questions") |
| 5 | Every need becomes a requirement you can test | `capture-requirements/SKILL.md` description + Step 3A.2 |
| 5 | The work is planned as epics; an epic is a chunk of work | `plan-project/SKILL.md` Steps 3A.1-3A.3 (walking skeleton, vertical slices) |
| 5, 9 | A fresh chat that didn't build it checks every requirement | `wrapup-epic/SKILL.md` Session Guard + Step 1.2 ("You are the independent reviewer") |
| 6 | Six silent decisions: where the data lives, what counts as the same item, loan length, when overdue starts, who can erase history, how old records count | `vibe-build/EVIDENCE.md` "Ambiguities decided silently by the builder" + "No identity or audit trail" |
| 6 | Two changes nobody approved: the list was re-sorted, and due dates became mandatory | `vibe-build/EVIDENCE.md` "Behavior changes nobody asked for or approved" |
| 6 | "For our team", but the data lives on one computer | `vibe-build/EVIDENCE.md` "For our team" bullet |
| 6 | Claude's device question (verbatim, shortened) | `peak-build/INTERVIEW-LOG.md` Q3 (setup shape questions), item 1 |
| 6 | **Dramatized.** Jordan's answer "One PC? That breaks our IT policy. Team data has to live on the company servers, with backups." and "That one answer changed the whole app" | Written at the producer's direction to show a stakeholder need that reshapes the app; labeled "Dramatized" on screen. The logged answer was "It lives on the one crib PC by the cage. That's fine." (`peak-build/INTERVIEW-LOG.md` Q3). The closest real need: "if IT reimages that PC I lose everything", which became the Backup and Restore epic (discover Q4; `06-backup.feature.md`, 7 requirements) |
| 6 | The vibe-coded version would have broken that policy on day one | Follows from the dramatized policy: the vibe build stores data only in one browser (`vibe-build/EVIDENCE.md` "For our team") |
| 6 | Asked in plain words | `setup/SKILL.md` shape questions; plugin `CLAUDE.md` "Product shape drives the stack" |
| 7 | Vibe: no plan; every request went into one 242-line file | `vibe-build/EVIDENCE.md` §1 ("Main file: `tool-crib.html` (242 lines, one file)") and §4 git log |
| 7 | Vibe: the only checks were run by the builder on its own work | `vibe-build/EVIDENCE.md` §2 (regression checks run by the builder) |
| 7 | Peak: six epics mapped up front, in dependency order; epic one is a bare-bones version (walking skeleton) | `peak-build/docs/implementation-plan/README.md` Dependency Graph; `plan-project/SKILL.md` Step 3A.1 |
| 7 | Each epic after the first builds on the ones it needs | `start-epic/SKILL.md:158` (dependencies must be Implemented or Complete). No claim that an epic waits for the previous one's check |
| 7 | Every epic gets its own fresh check | `wrapup-epic/SKILL.md` description (runs per epic after implementation) |
| 8 | The builder also found that two open tabs can erase each other's records; not fixed; not recorded in the folder | `vibe-build/EVIDENCE.md` §2 "Defect found" ("Not fixed, because nobody asked"); the folder holds only `tool-crib.html` and git (§4) |
| 8 | "We only know because we kept our own notes" | The defect is recorded only in `vibe-build/EVIDENCE.md`, the experiment log kept outside the app folder |
| 8 | Peak writes the two-tab case down as a requirement before any code | `peak-build/docs/requirements/02-lending.feature.md:62-72` (TOR-02-g9IiAyK, stale second tab). This requirement covers a stale-tab **checkout**, not the vibe build's stale-tab **return**. The narration says "the two-tab case", not "the same bug" |
| 8 | Given / When / Then in three parts | `capture-requirements/SKILL.md` Step 3A.2 (Given/When/Then scenarios) |
| 8 | Given/When/Then wording on the slide | TOR-02-g9IiAyK, **condensed**: the Given and When are shortened; the Then message is verbatim minus the due date |
| 8 | Planned for epic two | `peak-build/EVIDENCE.md` excerpt 2 ("planned for epic kNjvG4o"), the second epic in the dependency graph |
| 8 | 64 requirements | Scenario counts across the 6 feature files on `develop` (23+13+8+7+6+7) |
| 9 | A fresh chat checked epic one's 23 requirements, caught one gap, the reviewer added a real test to close it, then all 23 passed | `peak-build/docs/implementation-plan/session-handoffs/epic-UlTMHqM-complete.md` Counts + Conclusion ("1 fixed at wrapup") |
| 9 | The builder had marked a step done without proof | Same handoff: undisclosed deferral on the "opens with a double-click" requirement |
| 9 | Vibe: the checks ran outside the folder, so a new chat finds no proof | `vibe-build/EVIDENCE.md` "What the folder could NOT tell" ("How it was verified") |
| 9 | The same check runs on every epic | `wrapup-epic/SKILL.md` description |
| 9 | Screenshot: epic 1 of 6; loans shown are sample data | `peak-build/EVIDENCE.md` "Built app" |
| 10 | Vibe wins on speed: a working app after 3 chat messages | `vibe-build/EVIDENCE.md` §1 Requests 1-3 |
| 10 | After epic one of six, Peak can't check gear out yet | `peak-build/EVIDENCE.md` "Built app" (lending is epic 2) |
| 10 | Scorecard rows | Restate slides 5 to 9 |
| 10 | Triage says whether a change is a quick fix or needs the full workflow | `triage/SKILL.md:61-63` (TRIVIAL goes through quick-fix; EPIC and HEAVY go through epics and requirements) |
| 11 | More steps, but Claude writes the paperwork and you answer questions | Slide 5 rows; slide 10 speed row |
| 11 | new-project figures out where you are | `new-project/SKILL.md` Steps 1-3 |
| 11 | Repo URL; the README walks you through the install; install commands on screen | Root `README.md` "Installation" (lines 18-32) |
| 11 | "Build one you can check" | Closing line; restates slides 8 and 9 (written requirements, independent check) |
