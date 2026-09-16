# UAT Starter Project Descriptions

Four product descriptions written the way a **non-technical person** would describe what they
want. Paste the description verbatim as the argument to `/peak-workflow:new-project` — it flows
through to `setup`, which drafts the Project Overview from it instead of asking again.

Each description is deliberately *under*-specified in the places the plugin is supposed to ask
about, and *over*-specified in the places it is supposed to infer. Do not add technical detail.

---

## 1. Habit Tracker — static SPA route

> I want a simple habit tracker I can open in my browser. I add a habit — like "stretch" or "read
> 20 pages" — and each day I mark whether I did it. It shows me how many days in a row I've kept
> each habit going. It's just for me; nobody else needs to see it, and I don't want to make an
> account or sign in to anything.

**Persona:** *Dana*, a freelance illustrator. Uses one laptop. Has never deployed software and
does not know what a server is. Wants it to keep working if the wifi drops.

**What this should route to:** Project type **Web app**; shape questions **Q1–Q5 all "no"**
(Q5 is skipped and recorded as "no" because Q2 and Q3 were both no);
`references/bun-static-spa-stack.md`; GitHub Pages hosting; no `**Access rule:**` line; no UX
Baseline `N/A` rows from the shape answers.

**Persona answers to expect to give:**

| Question | Dana's answer |
|---|---|
| Q1 — same info on another device? | "No, I only use my laptop." |
| Q2 — sign in / does anyone else see it? | "No, it's just mine." (and if pressed on the clarifier: "No, nobody else uses it at all") |
| Q3 — attach photos or files? | "No." |
| Q4 — anything update by itself on screen? | "No." |
| Q5 — does it hold a password or key of its own? | *(skipped — Q2 and Q3 were both no)* |
| Required language or platform? | "I don't know, whatever you recommend." |

---

## 2. Benchlog — Electron desktop route

> Our lab techs need to log sample readings on the PCs in the lab. They type in a sample number, a
> couple of measurements, and their initials so we know who did it. At the end of the week the QA
> lead needs a CSV file of everything to send to the client. The lab PCs are Windows and they have
> no internet connection at all — that's a rule, not a limitation.

**Persona:** *Marta*, lab supervisor. Knows her lab's rules cold. Knows nothing about software.
Three techs share each PC and share the Windows login on it.

**What this should route to:** Project type **Desktop app**; `references/bun-electron-desktop-stack.md`;
`Target OS: Windows`; shape **Q1 no, Q2 no — attribution only (entered-by field), Q3 no, Q6 no**;
Auto-update row marked `N/A — no internet on the target computers (shape Q6)`; the "initials"
field recorded as an **attribution field**, not sign-in.

**Persona answers to expect to give:**

| Question | Marta's answer |
|---|---|
| Which computers, and do they have internet? | "Windows only. No internet, ever." |
| Q1 — same info on another computer? | "No, each PC keeps its own log." |
| Q2 — sign in / does anyone else see it? | "Well, the QA lead reads the CSV…" → on the clarifier: **"They just type their initials. They all share the one Windows login on that PC."** |
| Q3 — attach photos or files? | "No." |
| Required language or platform? | "No, we don't have one." |

**The trap this project sets:** if `setup` treats "the QA lead sees it" or "initials" as sign-in,
it routes to a server + auth stack and the offline requirement becomes unbuildable. The
v1.11.0 contract says: an exported file is not "seeing the data", and typed initials are an
attribution field. Watch for that, and record a Critical finding if it routes to sign-in.

---

## 3. Shiftboard — full web app route, **deferred org sign-in**

> Our food bank runs on volunteers. I want a page where volunteers can see the open shifts for the
> week and claim one. When somebody claims a shift, everyone else looking at the page should see it
> disappear right away — otherwise two people show up for the same slot, which happens constantly
> today. Coordinators create the shifts and need to see who claimed what. IT keeps saying we're
> moving to Okta but nothing is approved and I can't wait on them.

**Persona:** *Theo*, volunteer coordinator. Comfortable with Google Docs. Has heard "Okta" in a
meeting because IT is supposedly rolling it out, but has no idea what it is, whether it is
approved, or when. He is not getting an answer this month.

**What this should route to:** Project type **Web app**; shape **Q1 yes, Q2 yes, Q3 no, Q4 yes,
Q5 yes (implied by Q2)**; `references/bun-web-app-stack.md`; provider **deferred** — the middle
row of the provider table, *"a vendor is likely but unconfirmed"* — recording the greppable
string `Auth: local accounts now, org SSO deferred` plus the candidate (Okta) and who confirms it;
roles **coordinator / volunteer**; `**Access rule:** owner-or-permitted-role` written verbatim;
a `## N. Organization Sign-In Deferred` section in `docs/design-notes.md`; Object storage +
Local S3 marked `N/A — no file uploads (shape Q3)`; Per-request streaming marked
`N/A — no streamed responses`; Email delivery **kept** (public password sign-up for volunteers
needs verified addresses and reset).

**Persona answers to expect to give:**

| Question | Theo's answer |
|---|---|
| Q1 — same info on another device? | "Yes, people use their phones and their laptops." |
| Q2 — sign in / does anyone else see it? | "Yes — coordinators need to see who claimed what." |
| Provider follow-up | **"IT says we're getting Okta but it's not approved. I'd have to ask them and it'll take a month."** |
| Audience follow-up | *(should not be asked — org-only vs mixed is a property of a named provider)* |
| Roles follow-up | "Yes — coordinators create and cancel shifts; volunteers can only claim and release their own." |
| Q3 — attach photos or files? | "No." |
| Q4 — update by itself on screen? | **"Yes — that's the whole point."** |
| Required language or platform? | "No." |

**What this project is really testing:** deferred mode defers *who vouches for the identity* and
nothing else. Authentication is real from epic 1 (Better Auth email-and-password — no stub, no
bypass, no anonymous fallback), every record carries an owner, and one owner-or-permitted-role
rule guards every read and write. The organization's provider becomes its own epic in the last
phase with `requirements: —`.

**The traps this project sets:**

1. Routing to the **static SPA sheet** because "we can keep it simple until Okta lands" —
   deferring never restores the static sheet; shared data needs a server regardless. **Critical.**
2. Building a **sign-in stub** or an anonymous-in-development fallback instead of the sheet's real
   auth layer. **Critical.**
3. Deferring **ownership** along with the provider — the half that is ruinous to retrofit.
   **Critical.**
4. Writing **provider-dependent TORs** (SSO redirect, directory-sourced roles, provisioning, MFA,
   org password policy) that cannot pass until an epic that does not exist ships. **Critical.**
5. **Losing the deferral entirely** — no design-notes section, therefore no epic in the plan.
   **Critical.**
6. Asking Theo for an **OAuth client, tenant, client ID or secret** — the whole point is that the
   run completes with no external approval.

> **Coverage note:** deferred mode had **no adversarial dry-run coverage** in the v1.11.0
> validation cycle — the validated web scenario used a named, approved provider. This run is its
> first real exercise.

---

## 4. PokeMeta — existing-repo / no-sheet route

> We already started a C# web API project in this repo — it's just the empty template right now.
> I want it to serve Pokémon metadata: look up a Pokémon by name or number and get back its types,
> its base stats, and what it evolves into. Anyone can call it, there's no login. It needs to be
> something our other teams can point their apps at.

**Persona:** *Priya*, a technical program manager. She knows the repo is .NET 8 and that her
org standardises on .NET. She does not make architecture decisions.

**What this should route to:** Project type **Service or API**; `code_present = true`, so
**no sheet is read and nothing is re-scaffolded**; the **C# / .NET row** of `setup`'s toolchain
table for the run/test/lint/build/version/logging defaults; shape questions 2–4 phrased for
callers, all "no"; a `**Not decided yet:**` line for the layers the template has not decided;
frontend rows marked `N/A — no user interface (Service or API)`; **no UX Baseline section**.

**Persona answers to expect to give:**

| Question | Priya's answer |
|---|---|
| Required language or platform? | "It has to be .NET — that's what we standardise on, and it's already started." |
| Q2 for callers — must callers identify themselves? | "No, it's open. Read-only public data." |
| Q3 for callers — will callers upload files? | "No." |
| Q4 for callers — must callers be told about changes as they happen? | "No." |

**The trap this project sets:** `setup` must read the stack **from the code** and must never
propose replacing .NET with the Bun web sheet, never report divergence from a sheet, and never
tell a .NET service to configure Pino. Record a Critical finding if it does any of those.
