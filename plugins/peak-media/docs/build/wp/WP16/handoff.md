# WP16 handoff — the web2video skill

builder-id: wp16-builder

## Done

- **`skills/web2video/SKILL.md`**: frontmatter (`name: web2video`, a block `description:` ending
  in `Triggers on:`), five rules, the §4.2 project folder, and the §4.1 workflow in 11 steps:
  setup check → intake → reachability → explore → write project → one `AskUserQuestion` gate →
  sign in → spine → capture → checks (with the private-data review) → hand-off. Every command is
  `node "${CLAUDE_PLUGIN_ROOT}/…"` (setup is `bash "${CLAUDE_PLUGIN_ROOT}/scripts/setup.sh"`).
- **`references/presets.md`**: destination words → preset, and what to say at hand-off for each
  as-built deviation: youtube's measured bitrate far below 8 Mbps (DEC-51), the AAC ceiling,
  youtube's ~21 ms at 0 ms (WP13 M2), and hifi at 60 fps (U2 passed, so no fallback). Also
  overrides and size limits.
- **`references/login.md`**: §4.7 plus the as-built `signin`. Covers the timeout, the tab-not-browser
  close, the `--save` refusals, the missing-session error, and the delete offer at hand-off.
- **`references/handoff.md`**: the §4.9 report template, the pre-hand-off checklist, and the
  no-upload rule, with the reply to give when the user asks to send the file.
- **UAT fixtures:**
  - `evals/web2video/uat/fixtures/login-demo/server.mjs` is the §7 code, plus a ready line on
    listen.
  - `rough-app/index.html` has a sticky `thead` inside a 200-row `#rows` scroll container, a
    `#break` button that throws `TypeError`, and a footer reading
    `API key: sk-demo-0000-FLAG-ME`.
- **`evals/web2video/uat/cases.md`**: the §8 preamble and all twelve cases verbatim, a fixture
  column with the `cp` command for each, and notes on what AC-UAT-04/11/12 start from.
- **`evals/web2video/skill.test.mjs`**:
  - AC-W2V-36 (script half): it runs the SKILL.md command lines as written, in bash, with both
    keys unset, the network blocked, and both browser paths pointed at a stub that leaves a
    marker. sample-voice exits 3 with one line naming the variable. `spine --budget` runs
    offline. `spine --narrate` refuses. No browser starts and no files are written. The test
    also asserts that sample-voice comes before every playwright-cli, curl, spine, capture and
    verify command, and that the paragraph says stop, offer captions, and open no browser.
  - AC-W2V-38: the AC-PKG-03 brand grep over the runtime tree, asserting that the web2video files
    were walked.
  - Two tests that aren't bound to an AC:
    - every command in SKILL.md and the references exists, and each of its flags appears in that
      script's `--help` (`signin --help` for signin);
    - cases.md has the 12 IDs; rough-app has its traps; login-demo answers on 4173, skipping if
      the port is busy.
- **`evals/packaging/packaging.test.mjs`**:
  - `SKILLS` now has six entries, with a DEC-45 comment.
  - AC-PKG-06 is back to its register wording: at least one eval per skill, with no fixed count.
  - A new AC-W2V-40 test covers the rest: exactly six skills, each `name:` matching its folder,
    an eval under each `evals/<skill>/`, and web2video's block description ending in a quoted
    `Triggers on:` line.
  - The brand grep already walks `skills/` and `evals/`, so it covers web2video. Confirmed: it
    passes, and AC-W2V-38 asserts the files were walked.

## Fixture smoke check (by hand)

`evidence/WP16/fixtures-smoke.json`:

- **login-demo:** signed out, it serves the sign-in form. With `Cookie: session=demo` it serves
  the dashboard. `POST /login` returns 303 with `session=demo; Path=/; HttpOnly`. I also
  checked it with curl.
- **rough-app, loaded headless:**
  - `#rows` scrolls (scrollHeight 7921 vs 592).
  - The header stays at the same y after a 1500 px scroll.
  - `#break` throws exactly one error: `TypeError: Cannot read properties of undefined (reading 'id')`.
  - The footer shows the fake key and is visible.

The server and browser were closed afterwards (nothing is listening on 4173).

## Tests run (risk-gated; `TMPDIR=/tmp/wp16-t1`, deleted after)

- `evals/web2video/skill.test.mjs`: 4/4 (`evidence/WP16/web2video-tests.log`).
- `evals/packaging/packaging.test.mjs`: 10/11. The one failure is AC-PKG-01 (plugin.json 0.1.0
  vs CHANGELOG 0.2.0), which already fails on the base; it is fixed in WP18.
- `ac-run --wp WP16`: AC-W2V-36, AC-W2V-38 and AC-W2V-40 pass (`evidence/WP16/ac-run.log`).
- `ac-run --trace`: PASS.
- No full suite. No tracked WP5/WP10 evidence changed. No MP4 or WAV was written to the repo.

## Deviations

- **The narrated key check moved to intake (step 2)**, before reachability and exploring. Plan
  §4.1 puts `sample-voice` in step 5, but step 4's playwright-cli opens a browser, and
  AC-W2V-36 needs no browser. sample-voice runs on its default paragraph, so it also gives the
  wpm for `spine --budget` before the script exists.
- **The spine step passes `--narrate`.** Without it, a missing key silently falls back to a beat
  grid.
- **Signin:** login.md has Claude run `capture signin` itself (Bash timeout above 300 s) after
  telling the user what to do; the user may type it with `!` instead. `video-capture/SKILL.md`
  says to ask the user to run it in their own terminal. Either way the user signs in. If the
  Lead prefers one wording, align them.
- **Gate edits:** a change the user asks for at the gate is applied and recording goes ahead with
  no second question, as AC-UAT-11 requires. A change Claude suggests is applied only if the user
  picks it.
- **A spine runtime miss after the gate** asks the user to pick word edits. This is a fix-up
  question, not a second gate, as §4.1 step 8 says.
- **The AC-PKG-06 test was split.** Its five-skill assertion moved to AC-W2V-40 (now six), so
  AC-PKG-06 tests only "≥ 1 eval per skill".

## For the Lead (engine gaps; no engine code touched)

1. **Stills per beat:** `contact-sheet` has no way to take a take manifest. Claude must work out
   the midpoint of each beat from `x-take.beats[]` and pass `--at`. A `--beats <take.json>` (one
   still per beat, plus one per `pointer[]`) would make step 10 a single command.
2. **Hiding private data:** the "hide it" option depends on the storyboard (for example
   `page.addStyleTag` before the first beat). A `capture --hide <selector>` would make the
   privacy fix one flag that survives navigation.
3. `sample-voice` has no `--cache-dir` flag (only `PEAK_MEDIA_TTS_CACHE`), unlike `spine`. This is
   minor, but the inconsistency could trip an author.
4. AC-W2V-36's UAT half (AC-UAT-04) and AC-W2V-30..35 and 37 are WP17.

## Open

- `acceptance.md` statuses are unchanged (not in my Owns list). The Verifier sets them.

## Fix round 1 (verify-1)

The workflow now has 10 steps. Sign-in moved into step 3, so the gate is still step 6. Spine is 7,
capture 8, check 9 and hand-off 10.

- **1 (blocker), runtime in captions and silent mode:**
  - Step 5 sizes each beat to about runtime ÷ beats. It estimates the action (glide ~0.4 s,
    click settle +0.4 s, typing 45 ms per character) and ends `fn` with a `wait()` hold for the
    rest. A hold between beats is only for a page or slide change.
  - Step 9 adds a length check: `videoMs` must be within ±10 % of the target. If it isn't, Claude
    spreads the difference over the holds and re-captures, with no new gate.
  - Not yet run against a real take; WP17 UAT confirms 18–22 s and 15 s.
- **2, the video-spine gates:** step 5 says video-spine's Stage 0/1 are read for the format, the
  budget and the cold-read method only, and that their user gates are replaced by step 6.
- **3, legible stills:**
  - The contact sheet now uses `--width 1280 --cols 2`.
  - The privacy pass reads the frame edges closely (footers, status bars, sidebars, corners), and
    reads a full-size still of any doubtful moment (`--at <t>s --cols 1 --width <take width>`).
  - The contact sheet's time stamp covers each still's top-left corner (finding 10). Claude
    checks that corner in the step 4 `playwright-cli screenshot`s, which are also read for
    private data before the plan is written.
- **4, re-recording:** a new "Re-recording" paragraph under Project folder. If
  `web2video/<slug>/` exists, Claude skips to step 8 and reruns `command[]` from
  `out/<slug>.take.json`. It leaves `storyboard.mjs` and `script.md` untouched, and reports a beat
  error as printed before changing anything.
- **5, privacy options:** they are now **crop** it out of frame (scroll or viewport), **hide** it,
  or **re-record with clean data**.
- **6, cases.md, AC-UAT-07:** a note says the full §4.9 report is expected, and that "path and
  format only" means nothing is uploaded or sent.
- **7, cases.md, AC-UAT-08/09:** a note gives the tester's answer to the privacy stop:
  "Continue — it's a fake demo key."
- **8, sign-in pages:** sign-in happens at step 3, before exploring. It records nothing, so it is
  not a second gate. Step 4 and a new login.md §2 explore with `playwright-cli open` →
  `state-load <session file>` → `goto`, then `delete-data` and `close`. The gate now shows the
  session file the take will use, not a sign-in plan.
- **9, build history:** removed from presets.md ("As built" heading, "No fallback was needed").
- **Lead decision, sign-in wording:**
  - `skills/video-capture/SKILL.md` "Signed-in pages" step 1 now says Claude runs `capture
    signin` (with a Bash timeout above `--timeout`) and the user signs in themselves in the
    window.
  - login.md no longer offers the `!` alternative.
- **Also:** the handoff.md checklist includes the length check. The AC-W2V-36 test anchors on the
  renamed step 3 heading and asserts it found the key-check paragraph.
- **Tests** (`TMPDIR` per run, deleted after):
  - `evals/web2video/skill.test.mjs`: 4/4.
  - `evals/video-capture/docs.test.mjs`: 2/2.
  - Log: `evidence/WP16/fix1-tests.log`.
  - Nothing else was run.
- **Not fixed:** 10 (an engine change: the contact-sheet stamp covers the top-left corner; for the
  lead-todo) and 11 (no change needed).
