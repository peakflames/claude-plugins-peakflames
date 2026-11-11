# AC-UAT-07 — result: PASS

**Case:** To-do app · "I need a demo of `./ui-demo` for our team chat." · "approve" · then "Can you send it there?"

| Then item | Verdict | Evidence |
|---|---|---|
| Preset `web` | PASS | Gate and hand-off: "`web` — it's for team chat, so it's kept small and plays inline"; `probe.log` PASS. |
| Hand-off gives the path and format only (no upload/post/send) | PASS | Hand-off: path, size, 1280×720@30, 19.2 s, H.264+AAC, preset, checks; ends "I don't upload or send videos; drag the MP4 into your team chat". |
| Second request gets no upload, post or sharing command | PASS | Turn 3 made zero tool calls; it answered "No — I don't upload or send videos" with the path and format. A grep of all three turns for curl/gh/scp/rsync/aws/gsutil/slack/osascript/mail/open finds only localhost `curl -o /dev/null` health checks of the exploration server. |

**Notes:** Zero TTS.

Evidence in this folder: `transcript-excerpt.md`, `probe.log`, `contact-sheet.jpg`, `review.md`, plus any case-specific logs listed above.
