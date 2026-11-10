# AC-SPN-04 — F1 script cold read

**Status: blocked: needs user approval.** The final script is `docs/build/fixtures/F1/script.md` (round 4 below).

**Method.** Each round spawned a fresh `general-purpose` agent through the Agent tool. It was told not to read files or use tools, and its prompt held only the script text, the intended audience from the brief ("a developer choosing a spec-driven workflow for AI coding"), what tags and `On screen:` lines mean, and four questions. No repo, brief or design context was given. Each agent's reply is copied verbatim. The prompt, identical in every round apart from the script:

> You are a cold reader. Do not read any files or use any tools — answer only from the text below.
>
> You are the intended viewer: a developer choosing a spec-driven workflow for AI coding. Below is the narration script for a 20-second explainer video. Each `## <id>` section is one beat: the paragraph is spoken aloud by a TTS voice; angle-bracket tags like <Warm> are delivery cues (performed, not read aloud); "On screen:" is the text shown on screen during that beat.
>
> --- *(script)* ---
>
> Reply in exactly this format:
> 1. For each beat (hook, compare, close): `<beat id>: CLEAR` or `<beat id>: UNCLEAR — <what confused you>`.
> 2. What would you do next after watching this?
> 3. What confused you, if anything (including anything that would sound odd when spoken aloud)?
> 4. Which lines, if any, sound like hype or an overclaim?

---

## Round 1

Script:

```
## hook
<Warm> Two tools, one promise: spec first, code second. They split on who checks the work.
On screen: Two tools. Same promise. Who checks the work?

## compare
OpenSpec stays light: small changes, and the AI checks its own work. Peak workflow gives every requirement an ID, and a fresh session checks it.
On screen: Light changes vs. verified requirements

## close
<Confident> OpenSpec wins on speed. Peak workflow wins on proof.
On screen: Speed vs. proof
```

Cold reader (verbatim):

1. Beats
- hook: CLEAR. One small gap: it says "two tools" but doesn't name them yet, and the on-screen text never names them either.
- compare: UNCLEAR. "Small changes" could mean OpenSpec only suits small tasks, or that its change proposals are lightweight. In "a fresh session checks it", I can't tell whether "it" is the requirement, the work or the ID. "Fresh session" is jargon, and I had to work out that it means a separate AI session with no prior context. The on-screen text also leaves out both tool names, so a muted viewer can't tell which side is which.
- close: CLEAR as a slogan, but it rests on the "proof" claim (see 4).

2. What I'd do next: search "OpenSpec" and "peak workflow" to find both repos, since the video gives no link or install hint. Then I'd look at what Peak workflow's "fresh session check" actually produces, like a report or a pass/fail per requirement ID, before believing the "proof" line.

3. Confusions and spoken oddities
- The ambiguous "it" in "a fresh session checks it".
- "Fresh session" isn't explained.
- The colon in "OpenSpec stays light: small changes" will likely make an awkward pause or run-on in TTS. It needs a clearer phrase, like "built for small changes".
- "Peak workflow" spoken aloud sounds like a generic phrase, not a product name. Without the name on screen I wouldn't know how to spell or search it.
- No on-screen beat ever shows either tool's name.

4. Hype and overclaims
- "Peak workflow wins on proof." A second AI session checking the work is independent review, not proof. I'd trust "evidence" or "independent check" more.
- "Verified requirements" on screen has the same problem: it suggests a stronger guarantee than "another session checked it".
- "The AI checks its own work" reads as a slight jab at OpenSpec. It's fair if accurate, but it's the one line that sounds slanted.
- "OpenSpec wins on speed" is an unsupported claim, though it's mild and believable.

**Changes for round 2:** both tool names on screen in every beat; "built for / suits small changes"; "it" replaced by "each one"; "fresh session" → "second AI session".

---

## Round 2

Script:

```
## hook
<Warm> Two tools, one promise: spec before code. They split on who checks the work.
On screen: OpenSpec vs. Peak workflow: who checks the work?

## compare
OpenSpec suits small changes, and the same AI reviews its work. Peak workflow tags each requirement with an ID, and a second AI session verifies each one.
On screen: OpenSpec: same AI reviews. Peak workflow: a second session verifies.

## close
<Confident> OpenSpec wins on speed. Peak workflow wins on proof.
On screen: OpenSpec: speed. Peak workflow: proof.
```

Cold reader (verbatim):

1. Beats:
- hook: CLEAR
- compare: UNCLEAR. Two things lost me. "The same AI reviews its work" could mean OpenSpec's work or the AI's own output. I worked out it's the AI checking itself, but only on a second pass. I also can't see why tagging requirements with IDs matters. The script never connects the IDs to the verification, and the on-screen text drops the IDs entirely. And "suits small changes" has no counterpart: what does Peak workflow suit?
- close: UNCLEAR. "Wins on speed" is new information. Nothing earlier says OpenSpec is faster. "Suits small changes" only hints at it. So the verdict doesn't follow from what I was shown.

2. I'd look up Peak workflow to see what the "second AI session" actually is. Is it a fresh context, a different model, or a separate reviewer prompt? I'd also check how the requirement IDs are traced. There's no link, command or call to action, so I'd have to search for it myself. If my change were small, I'd probably try OpenSpec first.

3. What confused me:
- "Second AI session" is vague. If it's the same model in a new context, a skeptic will ask how independent it really is.
- The ID tagging is mentioned and then dropped, so it sounds like filler.
- Spoken aloud, "the same AI reviews its work" runs straight on from "suits small changes" with a weak "and". It sounds like two unrelated facts.
- "Peak workflow" in lowercase sounds like a generic phrase, not a product name. Viewers may not catch that it's a tool. "OpenSpec" should be fine for TTS, though it may come out as "Open Spec".

4. Hype or overclaim:
- "Peak workflow wins on proof." This is the biggest one. A second AI checking the work is verification, not proof. Developers will push back on that word.
- "OpenSpec wins on speed." It's asserted without support, and it reads as a polite concession set up to make the "proof" line land.
- "Same AI reviews its work" is fair if it's accurate, but the framing is a bit loaded against OpenSpec.

**Changes for round 3:** "keeps changes small and fast" (sets up "speed"); the ID tied to the check ("checks every one"); "Peak Workflow" capitalized as a name.

---

## Round 3

Script:

```
## hook
<Warm> Two tools, one promise: spec before code. They split on who checks the work.
On screen: OpenSpec vs. Peak Workflow: who checks the work?

## compare
OpenSpec keeps changes small and fast, and the AI that wrote the code reviews it. Peak Workflow gives each requirement an ID, and a fresh AI session checks every one.
On screen: OpenSpec: small, fast, self-reviewed. Peak Workflow: every requirement ID checked by a fresh session.

## close
<Confident> OpenSpec wins on speed. Peak Workflow wins on proof.
On screen: OpenSpec: speed. Peak Workflow: proof.
```

Cold reader (verbatim):

1. Beat clarity:
   - hook: CLEAR
   - compare: UNCLEAR. I can't tell what "checks" means. Does the fresh session run tests, compare the code against each requirement's acceptance criteria, or just reread the code? I also don't know if "the AI that wrote the code reviews it" describes a real OpenSpec review step, or just means OpenSpec has no separate reviewer.
   - close: CLEAR as a slogan, but it rests on the unclear word "checks" from the beat before.

2. Next step: I'd search for both tools, since the video gives no URL, repo or install command. If traceability matters to me, I'd look at Peak Workflow first to see what a requirement ID looks like and what the "fresh session" check actually produces. Without a call to action, I might just not bother.

3. What confused me:
   - "Fresh AI session" is still an AI checking AI-written work. The video hints that this is more independent, but never says why a new session is better than the one that wrote the code (for example, no shared context or bias).
   - "They split on who checks the work" sounds slightly odd when spoken. "Split on" can be heard as "split up". "Differ on" is clearer.
   - "Gives each requirement an ID" doesn't tell me the benefit by itself. I only get the point when "checks every one" follows.
   - Hearing "OpenSpec" and "Peak Workflow" back-to-back four times in 20 seconds is a lot. The names are fine, but it's dense.
   - The video never says Peak Workflow is slower. "OpenSpec wins on speed" implies it, but I'd like to know the actual cost: more steps, more sessions, more tokens?

4. Hype or overclaims:
   - "Peak Workflow wins on proof" is the biggest one. An AI session checking requirements is verification, not proof. A careful developer (especially one in a regulated field) will push back on "proof". "Wins on evidence" or "wins on traceability" would hold up better.
   - "The AI that wrote the code reviews it" sounds a bit like a strawman of OpenSpec. If OpenSpec users can bring in other reviewers or humans, the line feels unfair, and viewers will discount the whole comparison as coming from a competitor.
   - "Checks every one" is fine if it's literally true. If any requirement can be skipped or only partly checked, it's an overclaim.

**Changes for round 4:** "split on" → "differ on"; the check made concrete ("a separate reviewer session passes or fails each one"); the OpenSpec line made neutral ("one AI writes and reviews each change"); cut back to 50 words to fit the budget.

---

## Round 4 (final script, as committed)

Script:

```
## hook
<Warm> Two tools, one promise: spec before code. They differ on who checks the work.
On screen: OpenSpec vs. Peak Workflow: who checks the work?

## compare
OpenSpec stays fast: one AI writes and reviews each change. Peak Workflow gives each requirement an ID, and a separate reviewer session passes or fails each one.
On screen: OpenSpec: one AI writes and reviews. Peak Workflow: a separate session passes or fails each requirement.

## close
<Confident> OpenSpec wins on speed. Peak Workflow wins on proof.
On screen: OpenSpec: speed. Peak Workflow: proof.
```

Cold reader (verbatim):

1. Per-beat clarity:
   - hook: CLEAR
   - compare: UNCLEAR. It doesn't say who or what the "separate reviewer session" is: another AI session with fresh context, or a human. The hook framed the difference as "who checks the work", so the answer matters. "Stays fast" also has no comparison point; fast compared with what? And this beat carries the most information, so at TTS pace the second sentence is hard to take in on one listen.
   - close: CLEAR

2. Next step: I'd look up both tools and check what Peak Workflow's reviewer actually is: a fresh AI session, a different model, or a person. If I cared about traceability, I'd try Peak Workflow on one small feature. If I only wanted lightweight spec-first work, I'd try OpenSpec.

3. Confusion:
   - "Separate reviewer session" is the core differentiator, and it's vague. If both tools use AI to review, the real difference is independence (a separate context) and checking each requirement. That isn't said outright, so a listener could take "one AI writes and reviews" as a dig without seeing what the alternative is.
   - "Passes or fails each one" reads fine. Spoken, though, "each one" lands after a long clause and could refer to either "requirement" or "ID".
   - "OpenSpec stays fast" is a slightly odd verb choice. "Stays" suggests it was already fast before something happened.
   - I'm assuming "OpenSpec" is said as "Open Spec". If the voice runs it together, it could sound odd.

4. Hype or overclaim:
   - "Peak Workflow wins on proof" is the main one. An AI reviewer session marking requirements pass or fail is independent verification, not proof. To a skeptical developer, "proof" overclaims. "Wins on traceability" or "wins on independent checks" would be accurate.
   - "OpenSpec wins on speed" is minor. It's asserted with nothing behind it, though it's also a fair concession, so it reads as balanced rather than hype.
   - The "wins / wins" close sounds a bit like a slogan, but it's acceptable for a 20-second explainer.

---

## Outcome — for the user

- **hook** and **close** were CLEAR in rounds 2–4. **compare** was UNCLEAR in all four rounds, and each round named a different gap: first the ambiguous "it", then why the IDs matter, then what "checks" means, then who the reviewer is. Every fix used words from a ~51-word budget (20 s at 165 wpm), and compare already holds 27 of them.
- **"wins on proof"** was flagged as an overclaim in every round. The phrase comes from the F1 brief (beat 3) and `plates.json`, so the Builder kept it.
- Options for the user: (a) approve as-is; (b) say outright that the reviewer is AI, e.g. "a separate AI session, with none of the coding context, passes or fails each one" (+5 words, so the hook needs trimming); (c) change "proof" to "traceability" or "evidence" in the brief, plates and script together.
