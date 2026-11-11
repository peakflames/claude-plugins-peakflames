# Sign-in pages

The user signs in by hand, once, in a visible browser. You record nothing then, and you never
see their password: `capture signin` saves only the session (cookies and local storage), and
every take starts from it.

## 1. Save a session

Tell the user, before you run it: "A Chromium window will open on <url>. Sign in there yourself,
then close the tab (not the whole browser). You have 5 minutes." Then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/video-capture/scripts/capture.mjs" signin <url>
```

Use a Bash timeout above the signin `--timeout` (default `300s`), e.g. 360000 ms. You run the
command; the user does the signing in, in the window.

- On success it prints one line: the saved path, `<data dir>/auth/<host>.json` (`<data dir>` is
  `$CLAUDE_PLUGIN_DATA`, else `~/.cache/peak-media`). Keep that path for the take and hand-off.
- On timeout, or if the browser was quit instead of the tab closed, it saves nothing and exits 1.
  Explain and offer to run it again.
- Missing headed browser: it stops with one line naming `setup.mjs`. Ask before running setup.

Keep the default path. `--save` refuses `./web2video/` and any git work tree, but other folders
are allowed, and the session belongs outside the project.

## 2. Explore signed in

Before writing the storyboard, explore the page as the take will see it:

```bash
playwright-cli open
playwright-cli state-load "<saved path>"
playwright-cli goto <url>
```

Snapshot and dry-run as usual. When done, `playwright-cli delete-data` and `playwright-cli close`,
so no copy of the session stays in playwright-cli's profile.

## 3. Record signed in

Add `--storage-state <saved path>` to the capture command. A missing or unreadable session file
stops the take before a browser opens and names `capture signin <url>`. The take manifest records
`signedIn: true`, never the file's contents.

Check the stills: no sign-in form in any of them. A sign-in form means the session expired or
belongs to another host (the file is named for the host you signed in to): sign in again.

## The session file is a credential

- It lives only in `<data dir>/auth/`. Never copy it into the project, Read it, print it or
  commit it.
- On macOS and Linux the file is 0600 (owner only). On Windows file modes don't apply: what
  protects it is that `<data dir>` sits in the user's own profile folder, which other standard
  users can't read. Don't point `CLAUDE_PLUGIN_DATA` at a shared folder there.
- At hand-off, offer to delete it: "Delete the saved session at `<path>`? You'd sign in again for
  the next recording." On yes: `rm "<path>"`, and confirm it is gone.

## No session possible

If the user can't or won't sign in: record only the public pages, or ask for a demo account with
seeded data and have them sign in to that.
