# Autopilot cockpit — what a Claude Code mod could add

Design evaluation, 2026-11-13, revised the same day. Nothing here is built.

**Grounded in:**

- the `plugin-authoring` skill (Claude Code 2.1.323: `reference.md`, the examples and
  `claude-code.d.ts`);
- the autopilot skill;
- `attend.mjs` and `driver.mjs` on `feature/peak-workflow-autopilot-poc` at `5a8d3a6`;
- today's UAT notes (`uat-2026-11-13-autopilot-attend-peakmedia.md`);
- the PeakMedia workspace's real runs.

## Settled (Todd, 2026-11-13)

1. **Hosts: the terminal CLI and the Claude desktop app.** Nothing in this document is designed
   for VS Code or mobile. Wherever the skill does not say how something draws on one of these two
   hosts, it is listed as a thing to test first.
2. **The mod ships inside `plugins/peak-workflow/`**, not as a separate plugin. §2 covers what that
   requires.

## Recommendation

**Build both views.** A **band** of 2–4 rows above the prompt is always shown while a run is
attended. A **pane** gives the full picture of the queue, on demand or opened automatically when
the terminal is wide enough. A native notification goes out when the owner must act or the run is
done.

**Build the band first.** It is the only view that shows at any terminal width without the owner
doing anything. Add the pane second: it is where seven epics, the reviewer's notes and a short
timeline fit.

**Rules that stay as they are:**

- **The driver decides.** The mod only draws a `view` that `driver.mjs status --json` computes in
  `attend.mjs`.
- **The chat shrinks to conversation:** questions, stops, `NEEDS YOU`, the closing screen.

**What changed since the first draft:**

- The old main uncertainty is gone. The driver now reports the command in flight (`inFlight`) and
  sessions mark waits with "Needs you:", so "waiting on you at your browser" can be shown
  truthfully.
- **Two things are now the main uncertainty, and they are the first two things to test:**
  - **How the band and the pane look in the desktop app.** The skill says the desktop draws both,
    but gives no geometry.
  - **Whether `peak-workflow` loads cleanly when its `hooks/hooks.json` holds a module**, on any
    Claude Code build an owner may have.

---

## 1. What a mod can do on these two hosts

A mod is a hooks module inside a plugin:

- It draws with `ui.render`.
- It runs host commands (`$.process.run`).
- It keeps session state (`$.state`).
- It runs timers (`$.clock`).
- It lives inside a Claude Code session and ends with it.

The module has no Node, so it cannot import `attend.mjs`, which uses `node:fs`. It reads the
driver by running it.

| Surface | Terminal CLI (per the skill) | Desktop app (per the skill) | Fit |
|---|---|---|---|
| **Band** (`AbovePrompt`) | Rows above the input. At most `maxRows` (half the terminal); taller scrolls. The owner collapses it with `[-]` or ctrl+x ctrl+a. Any width | Raised on desktop. **The skill gives no size, collapse or placement details for the desktop: test first** | Always-on cockpit |
| **Pane** (`$.ui.open`) | Fullscreen layout (the default; tmux and `CLAUDE_CODE_NO_FLICKER=0` are not): **docked beside the transcript from 110 columns**, at most 45% of the width and at least 24. Otherwise inline above the prompt, about a third of the height. Opens unasked only from **144 columns** (110 once the owner has opened it before) | Seats `dock`, `inline` or **`widget`**: the small form of a minimized pane, in a corner of the chat area or in the session rail, where clicks may not reach. **The skill does not say what `dock` looks like on desktop (width, side): test first** | Full picture |
| **Text styling** | Colour, bold, dim, inverse. `size` and `weight` are ignored. No `Svg` | Adds `size` and `weight` headings and `Svg`. An `Svg` drawn with `interactive` runs **SMIL animation**, so a real pulse without redraws | Fun differs per host |
| **Pulse** | Only by redrawing on a `$.clock.every` timer | An animated `Svg` dot | |
| **Status line** (`$.ui.status`) | One plain line under the prompt | Drawn remotely (up to 10,000 characters); look not described: test | Idle state |
| **Toast** (`$.ui.toast`) | A box at the top right for about 4 s | Look not described: test | Small moments |
| **Notification** (`$.ui.notify`) | The owner's terminal channel | Handed to the host app ("`client`") | "Needs you", "done" |
| **Around the question popup** | At most 12 rows, no Markdown | At most 48 rows, in a frame above the question card | One context line |

**Not to be used:**

- `$.ui.ask`: asking stays with the skill.
- Themes, backdrops, the engine's spinner.
- Sound: an optional chime, off by default, is the only exception.

## 2. Packaging inside `peak-workflow`

**What it requires.** The plugin has no `hooks/` folder today. The additions:

- `hooks/hooks.json`: `{ "modules": ["./cockpit.tsx"] }` (one path).
- `hooks/cockpit.tsx`, and any `.ts` / `.tsx` files it imports. No `import()`, no Node.
- `types/index.d.ts`, declaring `interface PluginState { "peak-workflow": { … } }`.
- `"types": "./types/index.d.ts"` in `plugin.json`, with a minor version bump and a changelog
  entry, as the repo's rules require.

**Benefits:**

- The mod finds the driver at `$.plugin.root`, never at a stale `pluginDir`.
- When the owner types `/peak-workflow:autopilot`, a `prompt.submit` hook sees it, and a pane
  opened from that hook counts as "asked". It is then placed at any width.
- `claude plugin validate plugins/peak-workflow` and `claude plugin test` check it.
- Desktop owners install through **+ → Plugins → Add marketplace**, as today.

**What the skill does not settle.** It shows plugins whose function hooks sit beside other parts
(`agents/*.md` files), so skills plus a module look supported. It does not say what a build or
host **without mod support** does with a `hooks/hooks.json` that has `modules` and no `hooks` key.
Such a host might skip the module, or reject the plugin's hooks, or reject the whole plugin, which
would take every peak-workflow skill with it. **Test before shipping:**

- the current CLI;
- the desktop app's local session;
- one older CLI build;
- mods turned off.

**Nearest workable arrangement if that test fails:** a nested plugin folder,
`plugins/peak-workflow/cockpit/`, with its own `.claude-plugin/plugin.json` and `hooks/`. It gets
its own marketplace entry (`"source": "./plugins/peak-workflow/cockpit"`), so the code still lives
inside `peak-workflow`. The cost is a second install line, and the mod finds the driver
through `../scripts/autopilot/driver.mjs` relative to its own root.

## 3. The stage model ("n of 6" is always true)

| # | Stage | Driver phases | Notes |
|---|---|---|---|
| — | *Getting ready* | `run-start` → first `epic-start` (clone setup) | Header only. No event yet (G6) |
| 1 | Plan | `PLAN` | |
| 2 | Build | `BUILD`, `FIX_BUILD`, `CHECK_BUILD_INTERRUPTED` | `FIX_BUILD` shows as **Build ↻ repair** |
| 3 | Check | `CHECK_BUILD` | |
| 4 | Review | `AUDIT` | |
| 5 | Verify | `VERIFY` | A `human-check` epic's look parks here |
| 6 | Merge | `CHECK_VERIFY` → `MERGED` | The verify session merges; this stage is the merge gate |

**Rules for the number:**

- **It is the stage of the phase in flight, or the stage where the epic stopped.** It never comes
  from time, and it never runs ahead of `state.json`.
- **A repair goes back.** The one repair round returns to 2, tagged `↻ repair 1/1`, and stages 3–5
  keep the tag.
- **A resumed epic shows earlier stages as done.** It enters at `epic-start.resumedAt`, and the
  earlier stages are drawn `✓·` (done in an earlier run).
- **A session resumed after an answer is labelled.** It has `step-start.continuing`, and is shown
  as "carrying on with your answer".

**Glyphs.** The shape carries the meaning and colour only reinforces it.

| Glyph | Meaning |
|---|---|
| `●` green | Working. Pulses only while the step shows recent activity |
| `✓` | Merged |
| `○` dim | Queued |
| `▲` amber | Question for you |
| `◆` amber | Needs you at this computer |
| `↻` | Being continued |
| `✗` red | Did not pass |
| `⊘` dim | Blocked |
| `◼` grey | Cut off |

## 4. Mockups

### The band

Mockups are 80 columns. Colour is described in brackets.

**One epic, mid-way**

```
 ● Narrate a spine · verifying · 3 min                              $4.12 of $80
   Plan ━━ Build ━━ Check ━━ Review ━━ ◉ Verify ┄┄ Merge                 5 of 6
```

**Seven queued, the third active**

```
 ● Export captions · building · 12 min                             $18.40 of $80
   Plan ━━ ◉ Build ┄┄ Check ┄┄ Review ┄┄ Verify ┄┄ Merge                 2 of 6
   ✓ ✓ ● ○ ○ ○ ○   epic 3 of 7
```

**A question waits** (amber, plus a notification)

```
 ▲ Narrate a spine has a question for you                          $10.78 of $80
   Plan ━━ Build ━━ Check ━━ Review ━━ ▲ Verify ┄┄ Merge                 5 of 6
   Answer it in the chat. Nothing else runs until you do.
```

**A step waits on the owner at the browser** (`inFlight.needsYou`)

```
 ◆ Needs you at this computer · Narrate a spine · 2 min             $8.46 of $80
   Plan ━━ Build ━━ Check ━━ Review ━━ ◆ Verify ┄┄ Merge                 5 of 6
   Sign in to Okta in the browser window that opened. It carries on by itself.
```

**A failed epic, others still running** (`onPark: continue` only; the default `stop` ends the run)

```
 ● Export captions · reviewing · 6 min                             $31.20 of $80
   Plan ━━ Build ━━ Check ━━ ◉ Review ┄┄ Verify ┄┄ Merge                 4 of 6
   ✓ ✗ ● ○ ○   epic 3 of 5
   ✗ Narrate a spine did not pass, even after the repair. Details at the end.
```

**A technical stop, continued automatically**

```
 ↻ Narrate a spine stopped at its time limit — continuing, as you asked (1 of 2)
   Plan ━━ ◉ Build ┄┄ Check ┄┄ Review ┄┄ Verify ┄┄ Merge                 2 of 6
```

**Run finished, work to fetch**

```
 ✓ All 7 merged in autopilot's copy · 2 h 14 min · $46.10 of $80
   ✓ ✓ ✓ ✓ ✓ ✓ ✓   The next step is in the chat.
```

After the closing screen, one status line stays until the work is fetched:
`Autopilot: 7 epics merged, waiting to be brought into your project`.

**Nothing running.** Nothing is drawn. One exception: questions still wait from an earlier run.
Then a status line shows: `Autopilot: 1 question waits for you — /peak-workflow:autopilot`.

**Other cases:**

- Budget at 80% or more: the spend turns amber, and a row says "It stops at $80."
- Cut off: `◼ Autopilot was cut off during Narrate a spine (Build) · last heard 41 min ago — run
  /peak-workflow:autopilot to pick it back up`.
- Under 60 columns: the track becomes `●●●●◉○ 5/6 Verify`.

### The pane

The pane is about 46 columns wide: docked, that fits a 110-column terminal at its 45% ceiling.
Claude Code draws the frame and the close mark; the content is the mod's. Each epic gets a
six-cell mini track: `━` done, `◉` here, `┄` to come. The spend bar is drawn with Boxes, as the
skill advises for a level against a limit. There are no buttons in v1, because the pane never acts.

**One epic, mid-way**

```
╭──────────────────────────────────────────────╮
│ Narrate a spine                               │
│ ● verifying · 3 min                           │
│                                               │
│   ✓ Plan            2 min                     │
│   ✓ Build          18 min                     │
│   ✓ Check                                     │
│   ✓ Review          1 min   3 notes, none     │
│                             serious           │
│   ◉ Verify          3 min                     │
│   ○ Merge                                     │
│                                               │
│ ▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱   $4.12 of $80           │
│                                               │
│ 14:39  carrying on with your answer           │
│ 14:31  review: nothing serious                │
╰──────────────────────────────────────────────╯
```

**Seven queued, the third active**

```
╭──────────────────────────────────────────────╮
│ Autopilot · epic 3 of 7          $18.40 of $80│
│                                               │
│ ✓ Captions import      ━━━━━━   14 min        │
│ ✓ Speaker labels       ━━━━━━   22 min        │
│ ● Export captions      ━◉┄┄┄┄   12 min        │
│     building                                  │
│ ○ Burn-in subtitles                           │
│ ○ Chapter markers                             │
│ ○ Narrate a spine                             │
│ ○ Thumbnail picker                            │
│                                               │
│ ▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱                          │
│ 14:52  Speaker labels merged ✓                │
╰──────────────────────────────────────────────╯
```

**A question waits**

```
╭──────────────────────────────────────────────╮
│ ▲ A question for you             $10.78 of $80│
│                                               │
│ Narrate a spine        ━━━━▲┄   Verify        │
│                                               │
│ "Should I open the browser sign-in now so     │
│  the live check can run?"                     │
│                                               │
│ Answer it in the chat. Nothing else runs      │
│ until you do.                                 │
╰──────────────────────────────────────────────╯
```

**A step waits on the owner at the browser**

```
╭──────────────────────────────────────────────╮
│ ◆ Needs you at this computer      $8.46 of $80│
│                                               │
│ Narrate a spine        ━━━━◆┄   Verify        │
│                                               │
│ Sign in to Okta in the browser window that    │
│ opened.                     waiting 2 min     │
│                                               │
│ It carries on by itself once you have         │
│ signed in.                                    │
╰──────────────────────────────────────────────╯
```

**A failed epic, others still running**

```
╭──────────────────────────────────────────────╮
│ Autopilot · epic 3 of 5          $31.20 of $80│
│                                               │
│ ✓ Captions import      ━━━━━━                 │
│ ✗ Narrate a spine      ━━━━✗┄   did not pass  │
│ ● Export captions      ━━━◉┄┄   reviewing 6m  │
│ ○ Burn-in subtitles                           │
│ ⊘ Chapter markers      waits on Narrate a     │
│                        spine                  │
│                                               │
│ Narrate a spine failed its final check, even  │
│ after the one repair. More in the chat at the │
│ end.                                          │
╰──────────────────────────────────────────────╯
```

**A technical stop, continued automatically**

```
╭──────────────────────────────────────────────╮
│ ↻ Continuing, as you asked       $12.10 of $80│
│                                               │
│ Narrate a spine        ━◉┄┄┄┄   Build ↻       │
│                                               │
│ The build reached its 30-minute limit.        │
│ Carrying on where it stopped (1 of 2).        │
╰──────────────────────────────────────────────╯
```

**Run finished, work to fetch**

```
╭──────────────────────────────────────────────╮
│ ✓ All 7 merged            2 h 14 min · $46.10 │
│                                               │
│ ✓ Captions import      ━━━━━━   14 min        │
│ ✓ Speaker labels       ━━━━━━   22 min        │
│ ✓ Export captions      ━━━━━━   19 min        │
│ ✓ …4 more                                     │
│                                               │
│ ✦ The work is in autopilot's copy of your     │
│   project. The chat shows how to bring it in. │
╰──────────────────────────────────────────────╯
```

**Nothing running.** The mod closes its pane when the closing screen is printed. Opened by hand,
it says:

```
╭──────────────────────────────────────────────╮
│ No autopilot run here.                        │
│ /peak-workflow:autopilot starts one.          │
╰──────────────────────────────────────────────╯
```

**Desktop widget form.** When the pane is minimized on the desktop app, it shows a glance: no
clicks, an animated dot.

```
 ● Export captions · 2 of 6 · Build
   ✓ ✓ ● ○ ○ ○ ○        $18.40
```

### What the pane needs, and what it gives that the band cannot

**What it needs:**

- **Terminal:** the fullscreen layout and at least 110 columns to dock. It opens by itself only
  from 144 columns (110 once opened before). Below that, it sits inline and takes a third of the
  screen, so there the band is the better view.
- **Desktop:** the app decides the seat. The widget form is confirmed by the skill; the docked
  form's size is not, so test it.

**What it gives:**

- every epic on its own line, with a mini track and time;
- stage times;
- the reviewer's notes count;
- a two-line timeline;
- room to quote the question;
- a proper merge moment.

### Band vs pane vs both

| | Band only | Pane only | **Both** (band always, pane on demand or when room) |
|---|---|---|---|
| Visible without the owner doing anything | Yes, at any width | Only at 144+ columns, or after opening | Yes |
| Seven epics readable | A strip of glyphs | A line each | A line each in the pane |
| Screen cost | 2–4 rows | 45% of the width, or a third of the height inline | Band shrinks to its attention row while the pane is shown (`$.ui.panes()`) |
| Desktop | Drawn; look untested | Dock untested; widget confirmed | Widget plus band may duplicate: test, then drop one |
| Build cost | about 1 day | about 1.5–2 days | about 2.5–3 days |

**Recommendation: both, band first.** On the terminal, the band is the only view that is always
truthful and visible. The pane is the reward for a wide screen. On the desktop app, if the test
shows the widget reads well, the widget may replace the band there.

## 5. Fun, and where it stops

**Where the fun comes from:**

- **A truthful pulse.** About 1 Hz on the terminal, an animated `Svg` dot on desktop. It runs only
  while the step wrote something in the last minute. After 5 quiet minutes it turns steady, with
  "quiet for 6 min".
- **The stage track filling in.**
- **The merge moment.** `✦ ✧ ✓`, plus a toast: "Merged: Narrate a spine ✓ (10 min, $2.32)".
- **The finish.** The queue strip fills with ticks: "All 7 merged".
- **Warm, plain verbs.**

**Where it stops:**

- No motion on anything wrong or waiting. Those are steady amber or red, plus one notification.
- No sound by default.
- No celebration of a partial finish.
- No estimates of time left.
- No emoji.
- The band never grows past 4 rows.

## 6. How the mod and the skill divide the work

**What leaves the chat:**

- "Starting…", "Planning / Building / Reviewing / Verifying…"
- "… finished in N min ($x)", check results, "starting the repair round", the reviewer's result.
- "Finished and merged" (Q1).
- The long opening line, cut to: "Running — the bar above the prompt shows where it is."

**What stays:**

- Every question (`AskUserQuestion`, the human-check form, recording through `decide`).
- `NEEDS YOU` as "Needs you now: …". It is the one milestone kept, because the owner must move.
- "Continuing, as you asked".
- "Stopped: …"
- `RUN ENDED`, then Step 0 and the closing screen.
- "How is it going?"

**Mechanism.** The mod adds a prompt section at thread start: "autopilot cockpit: on". When the
skill sees it, it starts the watch with `--attention`. With that flag, `watch` prints only what
the session acts on: `Waiting for you`, `NEEDS YOU`, `Stopped`, a technical stop,
`REFUSED 3 times` and `RUN ENDED`. Without the mod, the skill runs exactly as today.

**Drawing attention:**

1. The band and pane switch to amber.
2. The mod sends one `$.ui.notify` per gate or per `NEEDS YOU`. This is deterministic, so it no
   longer depends on the model remembering.
3. The skill asks in the chat.
4. Optionally, one context line drawn over the question popup: `Narrate a spine · 5 of 6 Verify ·
   $10.78 of $80`.

The mod never asks, records or continues anything.

## 7. Data

**Rule: the driver decides, everything else reads.** The mod runs
`node <plugin root>/scripts/autopilot/driver.mjs status --project <root> --json --view`:

- every 3 s while a driver runs (this path returns before the preflight);
- once at session start;
- once after `RUN ENDED`. This call pays for the preflight (about 1 s), which `sync` needs.

`--view` adds a `view` object computed by a pure `cockpitView()` in `attend.mjs`: stage, "n of 6",
glyph, attention kind and words. `status.say`, `watch` and the closing screen use the same
function, so the cockpit and the chat cannot disagree.

| Element | Source today | Gap |
|---|---|---|
| Running or not, cut off | `running`, `lock` pid; `refuse` "did not finish" | — |
| Active epic, phase, time in stage | `state.json` `queue[].state`, `step`; `status.epics[].minutes` | — |
| Command in flight, **needs you at this computer** | `status.inFlight {description, minutes, needsYou}` (`openCommand()`); `watch` `NEEDS YOU:` | — (new) |
| Resumed session carrying on with an answer | `step-start.continuing` | — (new) |
| Stage of a parked or failed epic | `gate.phase` / `enters`, `queue[].lastStep` | **G3** |
| Resumed entry, repair round | `queue[].resumed.phase`, `epic-start.resumedAt`; `fixRounds` | `fixRounds` not in `status` (small) |
| Queue across chained runs | each run's `config.json` `continues` + `state.json` | **G4** |
| Spend | `status.spentUsd` (chain) of `runBudgetUsd` (first run) | **G2**, **G5** |
| Pulse / "quiet for N min" | mtime of the step's `hooks.jsonl` / `stream.jsonl` | **G8** (small) |
| Question, technical stop | `status.waiting`, `status.autoContinue` | — |
| End and why; work to fetch | `state.status`, `stoppedBecause`; `status.sync` | — |
| "Outside services may / may not spend real money" (pane detail) | `realSpend`: in `status` and `state.json` **in the uncommitted `feature/peak-workflow-autopilot-real-spend` worktree, not yet on the PoC branch** | — once merged |
| Getting ready | nothing | **G6** |

**Driver gaps now:**

| Gap | What is missing |
|---|---|
| ~~G1 owner-wait~~ | Closed by `inFlight.needsYou`, the "Needs you:" rule and `NEEDS YOU` |
| **G2** | Claude spend does not count the step in flight (cost is known only at step end). `realSpend` is about outside services and does not change this |
| **G3** | A parked or failed epic does not keep its stage (`finish()` overwrites `state`). Add `stoppedAt` |
| **G4** | `status.epics` is the latest run only. Add the first run's confirmed queue, with each epic's latest state across the chain |
| **G5** | One spend figure everywhere. `watch`'s first line and `say[0]` still use the run total (UAT #8) |
| **G6** | No `preparing` event while the copy is set up (UAT #25) |
| **G7** | `watch --attention`, and the flag that keeps `TESTS` and heartbeats out (UAT #9) |
| **G8** | `status --view`: the `cockpitView()` fields, `fixRounds`, last-activity time, and skipping `friction` (it re-reads every referee log on each call) |

## 8. UAT issues and new risks

**Fixed in the driver or skill since the UAT:** #1, #2 (answers resumed, not re-asked), #3 and #4
(answer wording), #5 (`inFlight`, `NEEDS YOU`), #6 (leftover processes). The cockpit builds on
these and does not replace them.

**What the cockpit adds:**

| UAT issue | How |
|---|---|
| #5 | A persistent display |
| #8 | One spend figure (G5) |
| #9 | Milestones leave the chat (G7) |
| #10 | The band draws from state, not from a step's end line |
| #13 | The pane shows the reviewer's notes |
| #19 | A deterministic notification |
| #20–22 | Far fewer chat lines to repeat or rephrase |
| #25 | G6 |
| #26 | The idle line can say "6 more epics ready" |

**Not the cockpit's job:** #7, #11, #12, #14–18, #23, #24.

**New risks:**

- **Packaging (§2).** A host without mod support may reject the plugin. Test it before anything
  else.
- **Staleness.** Laptop sleep and timer pauses can leave the band looking alive. The answer is a
  pid check on every poll, "last heard N min ago", and a pulse tied to real activity.
- **A second source of truth.** Avoided only if the mod draws `view` and computes nothing.
- **A closed session.** No cockpit and no notification while it is closed. The next session shows
  the cockpit again.
- **Desktop unknowns** (§1). Plan for a layout tweak after the first look.
- **Flicker** from the 1 Hz terminal redraw. If it flickers, the pulse goes.
- **Early-access API.** It moves between releases. The chat path must stay complete.

## 9. First version and later

| Piece | Size |
|---|---|
| **Spike (first):** packaging test (§2); band, pane and widget on desktop; band under the question popup; pulse flicker | ~0.5 day |
| **v1 driver:** `status --view` + `cockpitView()` + tests; G3, G4, G5, G6, G7, G8 | ~1.5 days |
| **v1 mod:** band (all forms), idle status line, merge toast, `notify`, prompt section, narrow layout; plugin version and changelog | ~1 day |
| **v1 skill:** Step 3b cockpit branch | ~0.5 day |
| **Next:** the pane (all forms + widget glance), auto-open on `/peak-workflow:autopilot` when there is room, band shrinks while the pane shows | ~1.5–2 days |
| **Later:** G2 in-flight spend ("about"), context line over the question popup, merge chime | ~1–1.5 days |

## 10. Open questions for Todd

1. **Should merges still get a chat line** once the cockpit celebrates them? The chat is then quiet
   for hours, and the closing screen lists them.
2. **Notifications and sound.** Is a native notification on "needs you" and "finished" the right
   default, with sound off?
3. **Desktop app.** If the widget turns out to read well, should it replace the band there, or
   should owners get both?
