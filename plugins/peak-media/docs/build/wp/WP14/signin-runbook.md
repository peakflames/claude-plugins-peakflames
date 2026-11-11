# AC-W2V-20 runbook — `capture signin` by hand

**Status:** `blocked: needs user`. This runs in WP17, together with the login UAT case.

**What it proves:** a person signs in by hand in a visible browser and closes the tab. The
session is then saved at `<dataDir>/auth/127.0.0.1.json` with mode 0600, outside the project.

## Before you start

- `setup.sh --check` prints `peak-media ready`. That means the headed browser (Playwright's
  Chromium, DEC-49) is installed. If it reports it missing, run `scripts/setup.sh`. The download
  is about 376 MB.
- `<dataDir>` is `$CLAUDE_PLUGIN_DATA`, or `~/.cache/peak-media` if that isn't set.
- Port 4173 is free.
- Don't use a real password. The fixture accepts any input, including blank fields.

## Steps

Run these from `plugins/peak-media/`.

1. Start the login fixture in terminal A:

   ```bash
   node evals/video-capture/fixtures/login/server.mjs
   # login fixture on http://127.0.0.1:4173/ (Ctrl-C to stop)
   ```

   (WP17's UAT fixture `evals/web2video/uat/fixtures/login-demo/server.mjs` can be used instead.
   It serves the same app, without the red sign-in background.)

2. Remove any earlier session in terminal B: `rm -f ~/.cache/peak-media/auth/127.0.0.1.json`.

3. Run sign-in in terminal B:

   ```bash
   node skills/video-capture/scripts/capture.mjs signin http://127.0.0.1:4173
   ```

   A Chromium window opens on the red **Sign in** page. stderr says: `sign in to 127.0.0.1 in the
   browser window, then close the tab …`

4. In the window, type anything (or nothing) and click **Sign in**. The white **Dashboard** page
   appears.

5. Close the tab with its ×, or press ⌘W. Don't quit Chromium with ⌘Q: that saves nothing and
   prints a one-line error.

## Expected

- The command exits 0 and prints exactly one line:
  `saved the session to /Users/<you>/.cache/peak-media/auth/127.0.0.1.json (mode 0600) — record signed in with --storage-state …`
  The cookie value is never printed.
- `stat -f '%Lp %N' ~/.cache/peak-media/auth ~/.cache/peak-media/auth/127.0.0.1.json` prints
  `700 …/auth` and `600 …/127.0.0.1.json`.
- `git status` in the repo shows no new file. The session is outside the project.

Optional: check that the saved session works with a take of the protected page.

```bash
node skills/video-capture/scripts/capture.mjs --storyboard evals/video-capture/fixtures/login/storyboard.mjs \
  --script evals/video-capture/fixtures/login/script.md --url http://127.0.0.1:4173 \
  --out /tmp/signed-in.mp4 --storage-state ~/.cache/peak-media/auth/127.0.0.1.json
node lib/verify/contact-sheet.mjs /tmp/signed-in.mp4 -o /tmp/signed-in.jpg   # white dashboard, no red sign-in page
```

## Negative checks

These are optional. Each should take about a minute.

- `capture signin http://127.0.0.1:4173 --timeout 10s`, and don't close the tab. After 10 s it
  exits non-zero with `not done within 10s — nothing saved`, and no file is written.
- `capture signin http://127.0.0.1:4173 --save ./web2video/s.json`, run inside any git checkout.
  It is refused in one line that names the default path, and no browser opens.

## Clean up

- Stop the fixture with Ctrl-C.
- `rm ~/.cache/peak-media/auth/127.0.0.1.json`. The skill offers this at hand-off too.
- `rm /tmp/signed-in.*`
