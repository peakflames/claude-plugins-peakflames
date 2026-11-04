# Storyboard: Peak Workflow for Everyone

A narrated explainer: the same app built twice, once by plain vibe coding and once with Peak
Workflow, compared head to head. This file is everything needed to recreate it with any slide
tool, any visual style, and any narrator or text-to-speech voice.

## Reference cut

| | |
|---|---|
| Slides | 11, one narration paragraph each |
| Narration | 904 words |
| Runtime | 5:20 (320.0 s) at about 175 to 190 words per minute |
| Slide changes | In the pause before each paragraph, never mid-sentence |
| Captions | None. Voice only |

## How to read the script

- **Delivery tags.** Each paragraph opens with a tag such as `<Confident>` or `<Thoughtful>`, and two
  paragraphs change tone midway. Tags are performance direction, never spoken. Give them to a voice
  that can act on them, or follow them as a human narrator; strip them for a voice that would read them aloud.
- **Spoken forms.** Numbers are written as words ("twenty-three"), the command is spoken ("Slash peak
  workflow, new project"), and the repo is said as "the peak flames repo on GitHub". The exact
  command and URL appear on screen.
- **Tone.** A level-headed creator voice. Praise appears only twice, on slides 6 and 9, right after
  the evidence it reacts to.
- **One line is dramatized.** Jordan's answer on slide 6 is labeled "Dramatized" on screen. See
  `03-claims-trace.md` for the real logged answer.

## Slides

On slides 6 to 9, vibe coding is always on the left and Peak Workflow on the right, with the Peak
side emphasized. Screenshots are in `shots/`.

### Slide 1: Cover

**On screen:** Title-card background. Text sits bottom left: eyebrow "Peak Workflow for everyone" and display headline "Same App. Built Twice."

**Script:**

```text
<Energetic and excited> So, you vibe-coded a tool. You just chatted with Claude until it worked. And it does work! And then someone asks you, "Is it actually done?" And honestly... you have no idea. <Tone becomes informative> So we ran an experiment. We built the exact same app twice: once just vibe coding, and once with Peak Workflow. <Thoughtful> And the real question is, do you even need a workflow if you're not an engineer? Is this just extra paperwork? Let's find out.
```

**Pacing:** 77 words, 26.8 s in the reference cut.

### Slide 2: The experiment

**On screen:** Eyebrow "The experiment · A tool crib checkout app (the cage where a shop lends out gear)". Two cards. Left, "Just Vibe Coding": four quoted chat bubbles, "Build me a simple app for our team to track who borrowed equipment.", "Can you add due dates and show me which stuff is overdue?", "Someone checked out the same multimeter twice. Can you stop that?", and "Is this app done?" (marked as the key question). Right, "Peak Workflow" (Peak side, emphasized): "01 Talk it through", "02 Write the requirements", "03 Plan the epics", "04 Build, then a fresh check".

**Script:**

```text
<Tone becomes informative> So here's the setup. The app is a tool crib checkout. A tool crib is the cage where a shop lends out gear, and the app tracks who borrowed what. On the left, just vibe coding. We gave Claude Code three plain chat messages. No plan, nothing else. On the right, Peak Workflow. Same app, but it goes through four steps first. Let's see how each one did.
```

**Pacing:** 68 words, 21.7 s in the reference cut.

### Slide 3: Vibe result

**On screen:** Split layout. Left: eyebrow "Just vibe coding", headline "It Works.", lead "22 browser checks. Nothing broke." Right: screenshot of the vibe-coded Tool Crib Equipment Checkout page with one overdue multimeter.

**Script:**

```text
<Confident> So first, vibe coding. And honestly, it works. You can check out gear, set due dates, it flags what's overdue, and it blocks double checkouts. We ran twenty-two browser checks, and nothing broke. So far, a win.
```

**Pacing:** 37 words, 14.2 s in the reference cut.

### Slide 4: The turn

**On screen:** Centered statement. Eyebrow "A brand-new Claude Code chat, asked "Is it done?"". Hero quote: "I can't tell you it's done, because nothing in this folder says what done means." ("done" emphasized).

**Script:**

```text
<Thoughtful> But here's where it gets interesting. We opened a brand new Claude Code chat, one with no memory of the first one, and asked one question. Is it done? And Claude said, "I can't tell you it's done, because nothing in this folder says what done means." And, well, that's fair. There's no list of needs, and no record of what was asked.
```

**Pacing:** 63 words, 20.1 s in the reference cut.

### Slide 5: Systematic (the thesis)

**On screen:** Eyebrow "Take two · Peak Workflow, a free plugin for Claude Code". Four thesis pills: "Systematic" (highlighted), "Iterative", "Human-steered", "Backed by evidence" (not highlighted). Title "You Answer. Claude Writes." Four step cards: "01 Talk it through /discover", "02 Write the requirements /capture-requirements", "03 Plan the epics" with "An epic is a chunk of work" and "/plan-project", "04 Build, then a fresh check /start-epic · /wrapup-epic" (emphasized).

**Script:**

```text
<Tone becomes informative> So, take two. Peak Workflow is a free plugin for Claude Code, and it's different in four ways. It's systematic, iterative, human-steered, and backed by evidence. Here's the system. You answer questions, and Claude does the paperwork. Step one, you talk it through. Step two, Claude writes down every need as a requirement you can test. Step three, it plans the work as epics. An epic is just a chunk of work. And step four, Claude builds each epic, and then a brand new chat, one that didn't build it, checks every requirement. Now, let's put the other three side by side.
```

**Pacing:** 102 words, 33.8 s in the reference cut.

### Slide 6: 1/3 Human-steered

**On screen:** Pillar label "1/3" + "Human-steered". Title "Who Decides?" Left card, "Vibe coding · Decided for you": six tags, "Only on one computer" (flagged), "Items are typed names", "7-day loans", "When overdue starts", "Anyone can erase history", "Old records never overdue"; then "+2 changes nobody approved: the list got re-sorted, and due dates became mandatory." Right card (emphasized), "Peak Workflow · Asks you, before any code": "If someone uses this on their laptop and later opens it on their phone, should they see the same information?"; "Jordan, the crib manager: "One PC? That breaks our IT policy. Team data has to live on the company servers, with backups.""; emphasized, "One answer changed the whole app: hosted, and backed up."; small label "Dramatized".

**Script:**

```text
<Engaged> Number one, human-steered. With vibe coding, Claude quietly made six decisions for you. Where the data lives, what counts as the same item, loan length, when overdue starts, who can erase the history, and how old records count. Then it made two changes nobody approved. The list got re-sorted, and due dates became mandatory. And the big one: you said the tool was for your team, but the data lives in one browser, on one computer. Nobody asked you about it. Peak Workflow did, in plain words, before any code. And Jordan, our crib manager, said, "One PC? That breaks our IT policy. Team data has to live on the company servers, with backups." That one answer changed the whole app. The vibe-coded version would have broken policy on day one. Guys, honestly, this is really good.
```

**Pacing:** 137 words, 47.8 s in the reference cut.

### Slide 7: 2/3 Iterative

**On screen:** Pillar label "2/3" + "Iterative". Title "Is There A Plan?" Left card, "Vibe coding · No route": a dashed file box "tool-crib.html · 242 lines / requests 1, 2, and 3, all in one file"; "The next step is whatever you ask for next."; "Checked by: the builder, grading its own work." Right card (emphasized), "Peak Workflow · Route mapped first": a dependency tree, "1 Bare-bones version: built · fresh check ✓", then "2 Check out and return", "3 Overdue tracking", "4 Item history", "5 Backup and restore", "6 Add and retire items", each "planned"; "Every epic gets its own fresh check."

**Script:**

```text
<Engaged> Number two, iterative. Vibe coding has no plan. You find the next step by asking for it, and every request piles into one growing file. And the only checks? The builder grading its own work. Peak Workflow maps the route first. Six epics, in order. Epic one is a bare-bones version that runs, and each epic after it builds on the ones it needs. And every single epic gets its own fresh check.
```

**Pacing:** 73 words, 25.0 s in the reference cut.

### Slide 8: 3/3 Evidence: written down

**On screen:** Pillar label "3/3" + "Backed by evidence". Title "Is It Written Down?" Left card, "Vibe coding": "22 checks passed. Also found: two open tabs can erase each other's records."; "✗ Fixed"; "✗ Written down in the folder"; ""Not fixed, because nobody asked."" Right card (emphasized), "Peak Workflow · Before any code": Given "Headset HS-01 is checked out to Riley in one tab", When "someone in a second tab tries to check it out to Casey", Then ""Could not check out Headset HS-01: it is already checked out to Riley."" Data line "1 of 64 requirements · planned for epic 2 · TOR-02-g9IiAyK, condensed".

**Script:**

```text
<Confident> Number three, backed by evidence. Remember those twenty-two passing checks? Along the way, the builder also found that two open tabs can erase each other's records. It never got fixed, because nobody asked. And nothing in the folder even mentions it. We only know because we kept our own notes. Peak Workflow writes the two-tab case down as a requirement, before any code exists, in three parts. Given a starting point, when something happens, then here's what you should see. So, given a headset is checked out to Riley in one tab, when someone in a second tab tries to check it out to Casey, then the app says no, and tells you Riley has it. Our tool crib ended up with sixty-four requirements like this one.
```

**Pacing:** 127 words, 41.0 s in the reference cut.

### Slide 9: 3/3 Evidence: a fresh check

**On screen:** Pillar label "3/3" + "Backed by evidence". Title "Who Checks The Work?" Narrow left card, "Vibe coding": "The builder checks itself."; "The checks ran outside the folder, so a new chat finds no proof." Wide right card (emphasized), "Peak Workflow · A brand-new chat checks epic 1": large "23/23", "Requirements passed", "After it caught 1 gap the builder missed, and closed it with a real test."; screenshot of the Crib Checkout items list after epic 1.

**Script:**

```text
<Animated> Now, this is the part I really like. After epic one was built, a brand new chat checked each of its twenty-three requirements. And it caught one gap. The builder had marked a step as done without any proof. So the reviewer added a real test to close it, and then all twenty-three passed. And that same check runs on every epic. That's kind of the whole point.
```

**Pacing:** 68 words, 21.1 s in the reference cut.

### Slide 10: Scorecard

**On screen:** Eyebrow "The scorecard · same app, built twice". Title "Vibe Coding vs Peak Workflow". Table with columns Vibe coding and Peak Workflow (emphasized); a check marks the winner of each row. "Speed to a first working app": ✓ "3 chat messages" vs "After epic 1 of 6, no checkouts yet". "Systematic": "No plan, no list of needs" vs ✓ "4 steps, 64 requirements". "Human-steered": "6 silent decisions, 2 unapproved changes" vs ✓ "You decide, in plain words". "Iterative": "One growing file" vs ✓ "6 epics, mapped up front". "Backed by evidence": "No proof left in the folder" vs ✓ "23/23 checked by a fresh chat". Below: "Not sure how big a change is? /triage says quick fix or full workflow."

**Script:**

```text
<Thoughtful> So, here's the scorecard. To be fair, vibe coding wins on speed. After epic one of six, Peak Workflow can't even check gear out yet. But on the other four, Peak Workflow wins. And once you're using it, if you're not sure how big a change is, triage tells you whether it's a quick fix, or needs the full workflow.
```

**Pacing:** 60 words, 20.1 s in the reference cut.

### Slide 11: Call to action and get started

**On screen:** Title-card background. Eyebrow "Before you type "build me an app"". Large command "/peak-workflow:new-project". Eyebrow "Get started · see the README". Title "github.com/peakflames/claude-plugins-peakflames". Two command lines: "/plugin marketplace add https://github.com/peakflames/claude-plugins-peakflames.git" and "/plugin install peak-workflow". Subheadline "Build tools you can check".

**Script:**

```text
<Energetic and excited> So, back to the question. Is it extra paperwork? Well, it is more steps. But Claude writes the paperwork, and your job is answering questions. So next time, before you type build me an app, type this instead. Slash peak workflow, new project. It figures out where you are, and walks you through the rest. To get started, head to the peak flames repo on GitHub. The readme walks you through the install. <Relaxed and warm, slowing down to wrap up> And next time you build a tool... build one you can check. I'll see you in the next one.
```

**Pacing:** 92 words, 28.2 s in the reference cut.

