# AC-SPN-04 — final cold read (verifier-wp3b-r1-6d778e6e, 2026-11-08)

**Script:** `docs/build/fixtures/F1/script.md` at HEAD 0dce4ae (commit 1e6575c, user-approved 2026-11-08 per `fixtures/F1/brief.md` and the script's header comment).

**Method:** a fresh Agent (general-purpose, model sonnet), told not to use tools, given ONLY the spoken paragraph of each beat (no `On screen:` lines, no brief, no audience, no repo). The prompt asked: for each beat CLEAR/UNCLEAR with a reason, and any overclaim. The prompt, verbatim:

> You are a cold reader. Do not read any files or use any tools. Answer only from the text below.
>
> Below is the spoken narration for a short video, split into three beats. Each beat is read aloud by a voice.
>
> hook:
> "Two tools, one promise: spec before code. They differ on who checks the work."
>
> compare:
> "OpenSpec: the same AI writes and reviews each change. Peak Workflow traces every requirement to its test and status, and records what the human checked beyond the tests."
>
> close:
> "OpenSpec wins on speed. Peak Workflow wins on an auditable record."
>
> Reply in exactly this format:
> 1. For each beat (hook, compare, close): `<beat>: CLEAR — <reason>` or `<beat>: UNCLEAR — <reason>`.
> 2. Overclaims: list any line that overclaims or sounds like hype, with the reason, or write "none".

## Cold reader answer (verbatim, 0 tool uses)

1. hook: CLEAR — States the shared premise (spec before code) and the single point of contrast (who checks the work).
   compare: UNCLEAR — Dense for spoken audio. "Traces every requirement to its test and status" and "what the human checked beyond the tests" are hard to follow by ear. It also doesn't say what "the same AI writes and reviews" means for the viewer.
   close: CLEAR — Two short claims, each tied to one tool. "Speed" is never shown in the compare beat, though, so it arrives unsupported.

2. Overclaims:
   - compare: "the same AI writes and reviews each change" is an absolute claim about OpenSpec. It implies no independent or human review is possible, and that is unsupported here.
   - compare: "traces every requirement" is an absolute ("every"). It needs a qualifier or evidence.
   - close: "OpenSpec wins on speed" is asserted with no basis in the narration. "Wins" is also verdict-style framing.
   - close: "Peak Workflow wins on an auditable record" is a similar verdict, and "auditable" is a strong word that the compare beat only partly supports.

## Verdict

Not PASS. User approval is recorded, but the reader flagged **compare** UNCLEAR: by ear the beat is too dense, and it doesn't say why "same AI writes and reviews" matters. This is the fifth cold read in a row to flag compare (rounds 1–4 in `AC-SPN-04-cold-read.md`). Overclaims: the absolutes "the same AI … each change" and "every requirement", plus the unsupported "wins on speed". The user decides: accept the approved wording despite the flag, or revise compare (and update brief/plates together if the claims change).
