# UAT — `/peak-workflow:setup` on PeakMediaMcpServers (2026-11-12)

**Project:** `~/github/peakflames/PeakMediaMcpServers` → https://github.com/peakflames/PeakMediaMcpServers
**Plugin:** peak-workflow (format 2), loaded with `claude --plugin-dir`
**Scenario:** greenfield, empty folder, no git repo. C# MCP server modelled on a sibling repo
(`~/github/peakflames/BitbucketMcpServers`). Hybrid: Okta-protected HTTP gateway holding a shared
OpenRouter key + a stdio server using the user's own key.

## Outcome

Setup completed. Files: CLAUDE.md (all 13 sections), README, CHANGELOG, LICENSE (MIT, copied),
docs/architecture.md, docs/design-notes.md, docs/requirements/README.md, docs/.peak-workflow.toml
(format 2). First commit on `main`, `develop` created, published public to the `peakflames` org,
default branch `develop`, both branches protected (admin bypass verified).

## Findings

1. **No-git folder caught too late.** The only `git init` handling is in Step 9.0's Unborn-HEAD
   check, and it *skips* the commit — which also blocks `develop`. `new-project` doesn't check for
   it either. Suggest: Step 1 detects "not a git repository" and runs (or asks to run)
   `git init -b main` before anything is written.

2. **No Hybrid MCP-server shape.** The Service-or-API route asks only HTTP-shaped questions. An MCP
   server shipped as stdio + HTTP raised a decision setup has no prompt for: where each transport
   gets its upstream credential (here: the stdio app can't hide a shared key, so it takes the
   user's own). Consider an "MCP server" project-type gloss or a Hybrid follow-up asking what each
   entry point does that the other doesn't.

3. **A named sibling repo isn't treated as "existing code".** Defaults take precedence from code in
   *this* repo only. The user said "follow the same project structure as `<sibling repo>`", but the
   toolchain table still proposed .NET's built-in JSON console logger, while the sibling uses Serilog
   plain text + stderr. Suggest: when the description points at a reference repo, read its manifests
   and CLAUDE.md as the first default source (between existing code and a named stack).

4. **The confirmation summary is too long for `AskUserQuestion`.** A full Hybrid summary only fit in
   an option `preview`, which is easy to miss. Suggest: print the summary as text, then ask a short
   question that refers to it — or keep the summary to the 8–10 lines in the skill's example.

5. **The user asked to "grill" mid-setup.** The user interrupted to ask for a
   grilling-style interview (`mattpocock-skills:grilling`), then asked for `AskUserQuestion` rounds.
   Setup's "ask little, default the rest" left many real decisions as silent defaults: target
   framework, project names, build helper/port, logging, version source, env var names, CI, storage,
   license. For engineer-owners, an opt-in "review the defaults" mode (round-based, up to 4
   questions per round, each with a recommended answer) would fit better than prose overrides at
   the single confirmation.

6. **Out-of-support runtime not flagged.** The toolchain table has no version guidance; the sibling
   targeted net9.0, whose support had just ended. Setup has no step that checks the chosen runtime's
   support status or whether the SDK is installed (`dotnet --list-sdks`); Python gets a probe, other
   toolchains don't.

7. **Prerequisite installs aren't verified.** The user reported installing `psutil`/`fastmcp`, but
   none of the five `python3` interpreters on PATH could import them (Homebrew 3.15's pip vs. other
   interpreters / PEP 668). Setup lists prerequisites but never re-checks them; a
   `python3 -c 'import psutil, fastmcp'`-style probe in Step 1 or in the walking skeleton would catch this.

8. **Repo vs. org secrets.** Setup's Release Protocol note said the CI needs repository secrets
   `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`. The sibling repo has *no* repo secrets and its tag
   workflow succeeds, so they come from **organization** secrets. Release Protocol CI notes should
   say "repository or organization secrets" and, when publishing into an org, flag that an org admin
   may need to grant the new repo access.

## Decisions recorded (for the next UAT step, `/peak-workflow:discover`)

net11.0 · PeakMedia* names (image generation planned later) · `build.py` on port 5108 · Serilog ·
`Directory.Build.props` version · stdio key `PEAK_MEDIA_OPENROUTER_API_KEY` (legacy
`TTS_OPENROUTER_API_KEY`) · gateway key `OpenRouter__ApiKey` · Okta org-only, no roles, no
anonymous mode · live progress updates, no uploads · SQLite `data/peakmedia.db` (gateway only):
usage log, quotas, audio cache · CI exactly like Bitbucket (Docker Hub on `v*` tags) · MIT.
