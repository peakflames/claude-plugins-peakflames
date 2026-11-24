# Handoff — build the autopilot cockpit mod (written 2026-11-14)

> **Deferred by the owner, 2026-11-14 (later the same day).** The chat is the one display every
> device has, mobile included, and no mod reaches mobile. So the run now announces itself in
> chat instead: which epic of how many, what comes next after each step, "n of m done (%)" over
> the confirmed queue across relaunches, one spend figure, and a ten-minute "still working"
> line. Start this work only when the owner asks; the band remains a sound idea for desktop,
> and what the announcer now says (`chainOf`, `queueLine` in `attend.mjs`) is the data a band
> would draw.

For a fresh session, possibly on another laptop. Everything you need is in this repository on
`feature/peak-workflow-autopilot-poc`; nothing here depends on the machine that wrote it.

## The job

Give the owner a heads-up display for an autopilot run, drawn by a Claude Code mod, so progress
is visible without chat lines (which cost context on every run). The design is done and approved
in outline; nothing is built.

**Read first, in this order:**

1. `plugins/peak-workflow/docs/autopilot-cockpit-mod-evaluation.md` — the design. Sections 2
   (packaging), 4 (mockups), 7 (data and driver gaps G2–G8), 8 (risks), 9 (sizes), 10 (open
   questions).
2. The `plugin-authoring` skill — how a mod is written, validated and tested. Load it before
   writing any mod code; the API is early-access and moves between Claude Code releases (the
   evaluation was grounded in 2.1.323; 2.1.325 was installed on 2026-11-14).
3. `plugins/peak-workflow/skills/autopilot/SKILL.md` Step 0, Step 3b and "Closing screen" — what
   the chat says today and what the cockpit takes over.
4. `plugins/peak-workflow/scripts/autopilot/attend.mjs` (`eventLine`, `snapshotLine`, `watch`,
   `activity`) and `status()` in `driver.mjs` — where the data comes from.

## Decisions already made (do not reopen)

- **Hosts: the terminal CLI and the Claude desktop app.** Not VS Code, not mobile.
- **The mod ships inside `plugins/peak-workflow/`**, not as a separate plugin, unless the
  packaging test below fails; then the nested-plugin arrangement in the evaluation §2.
- **Band first, pane second.** A band of 2–4 rows above the prompt while a run is attended; the
  pane with the full queue comes after.
- **The driver decides, the mod only draws.** The mod renders a `view` object that
  `driver.mjs status --json --view` computes in a pure `cockpitView()` in `attend.mjs`. It
  computes nothing itself, so the cockpit and the chat cannot disagree.
- **The chat shrinks to conversation:** questions, stops, `NEEDS YOU`, the closing screen.
- **History (2026-11-14):** the owner found run feedback "almost too minimal", first chose this
  mod over more chat lines, then chose the chat announcer (see the note at the top).

## Do these first: the spike (about half a day)

Answer these before writing v1. Each is a yes/no with a screenshot or a command's output.

1. **Does `peak-workflow` still load everywhere once `hooks/hooks.json` holds a module?** Test
   the current CLI, the desktop app's local session, one older CLI build, and mods turned off.
   A host that rejects the plugin takes every peak-workflow skill with it. `claude plugin
   validate plugins/peak-workflow` first.
2. **How do the band and the pane look in the desktop app?** The skill says the desktop draws
   both and gives no geometry.
3. **Does the band stay readable under an `AskUserQuestion` popup?**
4. **Does a 1 Hz pulse flicker in the terminal?** If it does, the pulse goes.

Show the owner the band drawing against a real or fixture workspace before building further.

## Working rules

- **Branch:** cut `feature/peak-workflow-autopilot-cockpit` from
  `feature/peak-workflow-autopilot-poc`. Sub-branches merge back into it with `--no-ff`. The PoC
  branch is not merged to `develop` yet, by the owner's decision.
- **Never break a live run.** On the owner's main laptop a PeakMedia session loads this plugin
  live from the main checkout of the PoC branch. A broken `hooks/hooks.json` there breaks every
  running session. So: work in your own worktree or clone; merge into the PoC branch only when
  the spike's packaging test has passed and no driver is running
  (`pgrep -fl "driver.mjs run"`); ask the owner before that merge.
- **Tests before each merge:** `node --test plugins/peak-workflow/scripts/autopilot/test/`
  (about 5 minutes; 170 pass, 11 skipped at `5563216`) and
  `node --test scripts/autopilot-lab/test/` (10 pass). Do not edit files in a worktree while a
  suite runs there. Driver changes get tests in the same style (`test/attend.test.mjs` for
  `status` and `watch`).
- **Versioning:** adding `"types"` to `plugin.json` and a `hooks/` folder is a minor change;
  `plugin.json` and `CHANGELOG.md` move together (repo `CLAUDE.md`). Changelog bullets ≤ 50
  words under `[3.1.0] — UNDER DEVELOPMENT`. Commits `<type>(peak-workflow): … (v3.1.0)`, no
  attribution lines. Ask before every push.
- **A workspace to draw from.** Without the PeakMedia project: the report fixture
  `plugins/peak-workflow/scripts/autopilot/test/fixtures/report/state/` is a complete workspace
  with five epics in different states, and `scripts/autopilot-lab/` builds scenario workspaces
  with the fake `claude`. `driver.mjs status` and `preflight` only read.
- **How the owner likes to work:** short, plain messages; lead with the result; say what he must
  do now, or "nothing". He is not always at the keyboard.

## What changed on the PoC branch since the evaluation was written

The evaluation's data table (§7) predates these; check each before relying on it.

- `status` now also returns `fixes` (small fixes made on the standing answer), `unlooked`
  (screens merged without the owner's look), `look` (`before` | `after`), `smallFixes` (the
  limits), `attended`, `realSpend` (now on the PoC branch) and `relaunch.ask`.
- New gate shapes the band may have to name: a `resume` gate at `VERIFY` for a final check
  that ended without a verdict, for a held-back small fix (`approvesFix`), and one answered by
  the `"look": "after"` project setting (`lookAfter`, `decided.by` is the setting).
- `watch` is unchanged: `still …` heartbeats every ten quiet minutes are still not relayed to
  chat. They are a natural input for the band's pulse.
- Driver gaps G2–G8 in §7 are all still open. G3 (`stoppedAt`), G4 (queue across chained runs)
  and G5 (one spend figure) matter most for a truthful band; today's live runs showed the spend
  line switching between the chain total and the run total.
- The day's findings are issues 42–45 in
  `plugins/peak-workflow/docs/uat-2026-11-13b-autopilot-first-run-of-fixes-peakmedia.md`.

## Open questions for the owner (ask when the band draws, not before)

1. Should a merge still get a chat line once the cockpit shows it?
2. Native notification on "needs you" and "finished", sound off: the right default?
3. On desktop, if the widget reads well, does it replace the band or sit beside it?

## Suggested skills

- `plugin-authoring` — required, before any mod code.
- `mattpocock-skills:prototype` — for the spike's throwaway band.
- `mattpocock-skills:tdd` — for `cockpitView()` and `status --view`.
- `code-review` (low or medium) — before merging driver changes.
