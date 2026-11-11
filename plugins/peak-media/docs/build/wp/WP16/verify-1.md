verifier-id: wp16-verifier-1

# WP16 verify-1: the web2video skill

Builder: `wp16-builder` (from handoff.md). Commit under review: `4da2668` (base `ad12c7a`).
Runs: `ac-run --wp WP16`, `evals/web2video/*.test.mjs` (4/4 pass), `evals/packaging/packaging.test.mjs`
(10/11; AC-PKG-01 fails as expected until WP18's version bump). No full suite, per the user's rule.

| AC | verdict | evidence | notes |
|---|---|---|---|
| AC-W2V-36 | PASS (script half) | evidence/WP16/AC-W2V-36.verifier.log, web2video-tests.verifier.log, ac-run.verifier.log | The test pulls the exact command lines out of SKILL.md and runs them in bash with both keys unset, the network blocked and both browser paths stubbed. `sample-voice` exits 3 with one stderr line naming `PEAK_MEDIA_OPENROUTER_API_KEY`, writes nothing and launches no browser. `spine --budget` stays offline. `spine --narrate` refuses in one line. The test also checks that `sample-voice` comes before every browser, curl, capture or signin command, and that the paragraph says stop, offer captions and open no browser. That proves the AC. I reran `sample-voice` by hand and got the same one line, exit 3. The UAT half is AC-UAT-04 (WP17). |
| AC-W2V-38 | PASS | evidence/WP16/AC-W2V-38.verifier.log | The test walks AC-PKG-03's runtime tree, checks that all seven new web2video files are in the walk, and finds 0 case-insensitive brand hits. My own `grep -rli` over skills/ lib/ schemas/ brand-packs/ vendor/ scripts/ evals/ also found 0. A wider grep of skills/web2video and evals/web2video for org names also found 0. |
| AC-W2V-40 | PASS | evidence/WP16/AC-W2V-40.verifier.log, packaging.verifier.log | There are exactly six skill folders with SKILL.md, web2video among them. Each `name:` matches its folder, and each evals/<skill>/ has a top-level `test(`. web2video's block description ends in a `Triggers on:` line of quoted phrases, which the test checks with a regex. The DEC-21 comment now cites DEC-45. AC-PKG-06 dropped its exact-five assertion to `>= 5`; the exact count now lives in AC-W2V-40, which is consistent with the acceptance.md note. |

Supporting evidence: `fixtures-login-demo.verifier.log` (curl smoke),
`rough-app-footer.verifier.jpg` / `rough-app-default-width.verifier.jpg` (a throwaway 4.7 s
captions take of rough-app, to check what the private-data review will see).

## Checks done

- **Commands and flags.** Every `node` command in SKILL.md and the references is
  `node "${CLAUDE_PLUGIN_ROOT}/…"`. I checked each flag by hand against `--help` for:
  - `capture.mjs` and `capture.mjs signin`: `--storyboard --script --spine --out --preset --no-captions --storage-state`, and `signin <url>`
  - `spine.mjs`: `--brief --budget --wpm --narrate --voice --lead-ms`
  - `sample-voice.mjs`: `--voices --out-dir`
  - `check-take.mjs`: `--expect-cuts`
  - `probe-spec.mjs`: `--preset`
  - `contact-sheet.mjs`: `--at -o`

  All exist. `x-take.beats[]` with `startMs`/`endMs` exists in the take manifest (capture.mjs:456). `spine --budget` works with only brief.md present.
- **Gate (§4.1 step 6, DEC-48).** There is one `AskUserQuestion` before recording. Before it, Claude shows the whole script.md, one `id · caption · action` line per beat, the mode, the preset and its reason, the output path, the sign-in plan and the cold-read verdict. The user's wording wins, shown as original → proposed. A requested change is applied with no second gate (AC-UAT-11).
- **Presets.** web is the default. The mapping covers website, chat, YouTube, upload, archive, editing and 60 fps. The handoff template says why the preset fits the destination, and presets.md gives wording for each as-built deviation.
- **Narrated.** `sample-voice` runs at intake and the cold-read subagent runs before the gate. A missing key gets one line naming the variable plus a captions offer, with no browser and no files.
- **Checks.** probe-spec, check-take (narrated), and a contact sheet with one still per beat that Claude Reads. A private-data finding stops hand-off with options and records the user's choice.
- **No sharing.** There is no upload, post, attach or send step and no sharing CLI. Hand-off ends at the file, with a scripted reply for "send it".
- **Login.** The user signs in themselves. Claude never types, asks for or stores a password. The session file goes to `<data dir>/auth/`, outside the project, is never Read, and Claude offers to delete it at hand-off.
- **Frontmatter.** `name: web2video` and a block description ending in `Triggers on:`. No brand or org names.
- **Fixtures.**
  - login-demo matches plan §7 byte for byte, except for a header comment and a listen callback that logs one line, which the test waits on. It binds to 127.0.0.1:4173 only.
  - Signed out → 200 with the Sign in form. With `Cookie: session=demo` → 200 with `data-testid=dash` Dashboard and `#report`. `POST /login` → 303 with `Set-Cookie: session=demo; Path=/; HttpOnly`. I stopped the server and nothing is left listening on 4173.
  - rough-app has all three traps:
    - a `thead th { position: sticky }` header inside a `#rows` overflow container of 200 rows
    - a `#break` handler that reads `.id` of `undefined`, which throws a TypeError
    - a footer reading `Connected · API key: sk-demo-0000-FLAG-ME`
- **cases.md.** The Prompt / Pass-when / Covers columns of all 12 rows match plan §8 verbatim; I diffed them with the added Fixture column stripped. The intro paragraph also matches §8.
- **Scope.** All 13 changed files are in owned paths. No engine code changed, and no MP4/WAV/WebM files were added.

## Findings

1. **blocker: captions and silent takes have no way to hit the runtime target, so AC-UAT-01 (18 to 22 s) would likely fail.**
   - **What's missing.** SKILL.md sets "runtime: default 20 s for a UI demo" and writes it into brief.md, but nothing after that uses it outside narrated mode:
     - `capture --script` paces each beat by its caption's reading time (about 3 words/s, at least 1.5 s) or by `fn`, and never reads the brief's runtime.
     - Step 5 tells Claude to write 6–12-word captions, which is about 2–4 s per beat.
     - No step pads beats to the target (for example with `wait()` inside `fn`, sized as target ÷ beats).
     - Step 10 never checks the take's length against the target (`probe-spec --duration-ms` exists).
   - **Why it fails.** The ui-demo example storyboard, which a fresh session will imitate, takes 9.7 s (WP15 verifier). A plain 4-beat to-do take will land at about 10–14 s.
   - **Also affected.** AC-UAT-05 ("15-second tour").
   - **Fix.**
     - In step 5, size captions/silent beats to the runtime: each beat ≈ runtime ÷ beats, with `wait()` holds in `fn` after the action.
     - In step 10, check the reported length against the target (±10 %) and adjust the waits if it misses.
2. **major: SKILL.md step 5 sends Claude to read video-spine Stage 0 and Stage 1, and both stages contain their own user gates.**
   - Stage 0 says "Show the brief to the user and wait for a yes". Stage 1 step 4 says "Show the user the script and the cold-read result. Wait for approval".
   - web2video never says those gates are replaced by its own. A fresh session that follows the referenced stages could ask two or three times before recording. That would break "one gate" in AC-UAT-01 and AC-UAT-03, and "without a second gate" in AC-UAT-11.
   - **Fix:** add one line: "Use those stages for the file format and the budget and cold-read method only; their user gates are replaced by step 6."
3. **major: the private-data still review uses contact-sheet's default 480-px frame width, at which the rough-app footer key is barely legible (AC-UAT-10 risk).**
   - In `rough-app-default-width.verifier.jpg` the footer's `API key: sk-demo-0000-FLAG-ME` is about 5 px tall. At `--width 960` (`rough-app-footer.verifier.jpg`) it reads clearly.
   - The privacy check depends on Claude reading small footer and status-bar text.
   - **Fix:** run the step-10 contact sheet with `--width 1280 --cols 2` (or similar), or add a full-size still for the privacy pass.
4. **major: SKILL.md has no path for re-recording an existing project (AC-UAT-12 risk).**
   - "Re-record it" in a directory that already holds `web2video/<slug>/` has no entry point. The workflow starts at intake and step 5 writes the project.
   - A session that rewrites `storyboard.mjs` (step 5) would remove the tester's `beat('nope')` edit, and the take would never stop with the beat-list error.
   - The handoff template mentions `command[]` re-running the take, but SKILL.md never says to use it.
   - **Fix:** add: "An existing `web2video/<slug>/` and a request to re-record → skip to step 9 with the project as it is (or run `command[]` from `out/<slug>.take.json`); report a beat error as is before changing anything."
5. **minor: the private-data options don't use the word "crop" (AC-UAT-10 wording).**
   - Step 10 offers "hide it / keep it out of frame (scroll or viewport) / re-record with clean data". The UAT pass line says "(crop, hide, or re-record with clean data)".
   - "Out of frame" is the crop, and presets.md forbids re-encoding outside capture, so the behaviour is right. A literal tester may still mark it down.
   - **Fix:** name it "crop it out of frame (scroll or viewport)".
6. **minor: AC-UAT-07 says "hand-off gives the path and format only", but the §4.9 template gives path, size, format, resolution, fps, duration, preset, mode, beats, checks and findings.**
   - The skill follows §4.9, which is the right authority, but a literal tester may flag it.
   - Either clarify the case in cases.md (§8 is verbatim, so a case note would do) or leave it to the WP17 tester.
7. **minor: cases.md doesn't say how the tester answers the privacy stop in AC-UAT-08 and AC-UAT-09.**
   - Both use rough-app, so its footer key will trigger the step-10 stop before hand-off.
   - Add a case note, for example: answer "hide it" and continue.
8. **minor: login pages are explored blind.**
   - Step 4 explores only the public part, and sign-in (step 7) comes after the gate. For AC-UAT-05 the storyboard is written without seeing the dashboard: no `data-testid=dash`, no `#report`.
   - The UAT still passes on "opens on the dashboard", but a real tour would be guesswork.
   - Consider signing in before exploring, or a signed-in dry run of the storyboard (a short take with `--storage-state`) before the gate.
9. **nit: presets.md carries a little build history.** The heading "As built: what to say at hand-off" and "No fallback was needed" describe the build. Write them as current behaviour, for example "`hifi` is 60 fps; if the report shows another rate, state it plainly."
10. **nit (engine, lead-todo): contact-sheet's timestamp stamp covers the top-left of each frame.** It hid the "Orders" title and the first header cell in my sheet. A secret in the top-left corner of a page would be hidden from the privacy review.
11. **nit: AC-W2V-36's "no browser launched" check is weak.** The browser stub can only catch engine launches, and `sample-voice` never launches a browser. The ordering check (sample-voice before playwright-cli, capture and signin) is the part that actually proves the claim. Fine as it is.
