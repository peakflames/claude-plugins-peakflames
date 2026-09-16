# Wireframe Template — `/peak-workflow:mockup`

Used by `mockup` Step 5.1. Write one populated copy per screen to
`docs/product-vision-planning/ux/wireframes/{S-NN}-{kebab-name}.html`. Each file is
self-contained: inline CSS, grayscale only, system font, no external resources, and no JS
beyond the state toggle. The wireframe is a planning artifact — it shows *what is on the screen
and what it is called*, never how it looks.

**Low fidelity governs color, type, and brand — not layout.** The wireframe must show the shell
the project's design system actually produces. A wireframe that invents its own layout is wrong
even if it is perfectly grayscale.

---

## Placeholder Reference

| Placeholder | Meaning |
|---|---|
| `{S-NN}` | Screen ID from `ux/screens.md` |
| `{Screen Name}` | Screen name from `ux/screens.md` |
| `{S3.4, S5.1}` | ConOps steps this screen serves (the `Serves` column) |
| `{entry points}` | The `Entry points` column, in prose |
| `{Region}` | A layout area — Page header, Filters, Order table, Form, Confirm dialog … |
| `{Component}` | The design-system primitive the region becomes — see the table below |
| `{control text}` | Exact visible text of a control — must match `ux/screens.md` and the ConOps step |
| `{state copy}` | The visible text for the empty or error state, from `## States` |
| `{linked screens}` | Screens this one navigates to, `S-NN Name` each |

### `data-component` values

| Value | Use for |
|---|---|
| `PageHeader` | The page-header row: `h1` + primary actions + subtitle. **Not** a shadcn primitive — a composed row of `h1` and `Button`s, listed here so page headers stop being mislabelled `Button`. |
| `Button` | A region whose content is a button or button group |
| `Dialog` | A focused modal: create/edit form, detail overlay |
| `AlertDialog` | A destructive confirmation — safe option first and default, Escape triggers it |
| `Sheet` | A drawer: side panel, long mobile-first form, collapsed mobile nav |
| `DropdownMenu` | An account/user menu, a row-level overflow menu |
| `Table` | A data table |
| `Form`, `Input`, `Select`, `Checkbox` | Form areas and individual fields |
| `Card` | A bounded content block, an item in a card list, an empty-state panel |
| `Tabs`, `Breadcrumb` | In-page section switching, hierarchy trail |
| `Toast` | A transient or inline message — errors, confirmations, refused actions |
| `Sidebar` | The sidebar shell's nav rail. **Only** with an App Shell justification (see below) |

Add nothing outside this list. If a screen genuinely needs a primitive that is missing, add the
row here in the same change rather than inventing a value in one wireframe.

Rules the populated file must keep:
- Every control is a real `<button>`, `<a>`, `<input>`, or `<select>` so Tab reaches it, and the
  `:focus-visible` rule stays — the wireframe models keyboard focus.
- `data-component` on every `.region`; the `.label` text names the region in plain words.
- The menu-bar `<nav>` is for desktop apps only — delete it for web apps.
- A screen marked `n/a — not data-bearing` keeps only `#state-populated` and drops the switcher.
- Destructive actions render their confirmation as an `AlertDialog` region inside the populated
  state, with the safe option first.
- The layout-floor `@media` block is **required**, not optional — see App Shell Conventions.

---

## App Shell Conventions

For shadcn/ui (the default UX Baseline declaration), pick **one** shell and record the choice in
a `## App Shell` section of `ux/screens.md`, naming which one and why:

| Shell | shadcn composition | Use when |
|---|---|---|
| **Site header** | brand + inline `nav` (current item marked) + account control right; a `Sheet` behind a `≡` trigger below the layout floor | 1–3 top-level destinations. **The default.** |
| **Sidebar shell** (admin dashboard) | `SidebarProvider` + `Sidebar` + `SidebarInset`; `SidebarTrigger` and `Breadcrumb` in the inset header; account control in `SidebarFooter`; off-canvas `Sheet` below the floor | 4+ destinations, or nav that needs grouping. **Never for a two-item nav** — a 180 px rail holding one link and a sign-out action is a defect, not a style choice. |
| **Auth block** | brand-only header over a centered column, 360–440 px | Signed-out screens: sign in, sign up, verify address, request reset, set password. |

Every shell also has:

- **A page-header row** — `h1` left, primary actions right, a count or subtitle line beneath.
  Marked `data-component="PageHeader"`. Not a boxed region full of loose buttons.
- **A footer strip** carrying the version — thin chrome (`.app-footer`), not a dashed region.
- **An identical shell on every signed-in screen.** A shell that changes per screen is a bug.
- **App chrome is not a region.** The header and footer are structural, like the desktop menu-bar
  strip: they get a small `.clabel` marker, not a dashed `.region` box, because they are the same
  on every screen and are not what the reviewer is being asked to judge.

### Overlays

| Need | Primitive | Notes |
|---|---|---|
| Focused create/edit form | `Dialog` | Focus moves in on open, Tab stays within, Escape closes, focus returns to the invoking control. |
| Side panel, or a long/mobile-first form | `Sheet` (drawer) | Prefer over `Dialog` when the form is long or the primary device is a phone. |
| Destructive confirmation | `AlertDialog` | Safe option listed first and default; Escape triggers it. Not a plain `Dialog`. |
| Collapsed mobile nav | `Sheet` | Behind the `≡` trigger, below the layout floor. |

A dialog or sheet with its own actions and data is its own screen with its own `S-NN`. Render it
over a one-line `.backdrop` note naming the parent screen, so the reviewer sees the context it
opens in.

---

## HTML Skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{S-NN} {Screen Name} — wireframe</title>
<style>
  /* Low fidelity on purpose: grayscale only, system font, no brand. Do not add colors or typefaces. */
  :root { --ink: #222; --mid: #777; --line: #999; --fill: #f2f2f2; --paper: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; font-size: 14px; color: var(--ink); background: var(--paper); }
  .wf-header { padding: 8px 16px; border-bottom: 2px solid var(--ink); }
  .wf-header strong { font-size: 16px; }
  .menubar { display: flex; gap: 16px; padding: 4px 16px; background: var(--fill); border-bottom: 1px solid var(--line); font-size: 13px; }
  .switcher { display: flex; gap: 8px; padding: 8px 16px; border-bottom: 1px dashed var(--line); }
  .switcher button { font: inherit; padding: 4px 10px; background: var(--paper); border: 1px solid var(--ink); cursor: pointer; }
  .switcher button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }

  /* App chrome — structural, not a dashed region. shadcn site-header pattern. */
  .chrome { position: relative; }
  .chrome > .clabel { position: absolute; top: 2px; right: 8px; font-size: 10px; color: var(--mid); text-transform: uppercase; letter-spacing: .05em; }
  .app-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px 10px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .app-header .brand { font-weight: bold; }
  .app-header nav { display: flex; gap: 4px; }
  .app-header .spacer { flex: 1 1 auto; }
  .app-header a, .app-header button { font: inherit; color: var(--ink); border: 1px solid var(--ink); background: var(--fill); padding: 3px 8px; text-decoration: none; cursor: pointer; }
  .app-header nav a[aria-current="page"] { background: var(--ink); color: var(--paper); }
  .menu-trigger { display: none; }
  .app-footer { padding: 8px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--mid); }

  main { padding: 0 16px 8px; }
  .auth-wrap { max-width: 400px; margin: 0 auto; }   /* auth-block shell only */
  .dialog-wrap { max-width: 520px; margin: 0 auto; } /* dialog / sheet screens only */
  .backdrop { padding: 8px 12px; margin: 12px 0 0; border: 1px solid var(--line); background: var(--fill); font-size: 12px; color: var(--mid); }
  .state { display: none; padding: 8px 0; }
  .state.active { display: block; }
  .region { position: relative; border: 2px dashed var(--line); padding: 16px 12px 12px; margin: 12px 0; min-height: 48px; }
  .region > .label { position: absolute; top: -9px; left: 8px; padding: 0 4px; background: var(--paper); font-size: 11px; color: var(--mid); text-transform: uppercase; letter-spacing: .05em; }
  .region button, .region a { font: inherit; color: var(--ink); border: 1px solid var(--ink); background: var(--fill); padding: 4px 10px; margin: 4px 4px 0 0; text-decoration: none; display: inline-block; cursor: pointer; }
  .region label { display: block; margin-top: 8px; }
  .region input, .region select { font: inherit; border: 1px solid var(--line); padding: 4px; width: 100%; max-width: 320px; }
  .placeholder { min-height: 40px; margin: 6px 0; background: repeating-linear-gradient(45deg, var(--fill), var(--fill) 6px, var(--paper) 6px, var(--paper) 12px); }
  .muted { color: var(--mid); }
  .fielderr { font-size: 12px; margin: 4px 0 0; }

  /* Page header — h1 left, actions right; stacks at the layout floor. */
  .page-header { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .page-header h1 { font-size: 18px; margin: 0; flex: 1 1 200px; min-width: 0; }
  .page-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .page-actions button { margin: 0; }
  .meta { color: var(--mid); margin: 8px 0 0; flex: 1 1 100%; }

  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 6px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--mid); border-bottom: 2px solid var(--ink); }

  /* REQUIRED — the UX Baseline layout floor. Narrow the window to verify it.
     Set the breakpoint from the declared floor (320 px floor -> 480 px breakpoint). */
  @media (max-width: 480px) {
    .app-header nav, .app-header .signout { display: none; }  /* collapse into the Sheet */
    .menu-trigger { display: inline-block; }
    .page-header { flex-direction: column; }
    .page-actions { width: 100%; flex-direction: column; align-items: stretch; }
    table, tbody, tr, td { display: block; }                  /* table -> stacked blocks */
    thead { display: none; }
    tr { border-bottom: 2px solid var(--ink); padding: 8px 0; }
    td { border: 0; padding: 2px 0; }
    td::before { content: attr(data-th) ": "; color: var(--mid); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
    td.actions::before { content: ""; }
  }
  :focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  .wf-footer { padding: 8px 16px; border-top: 1px solid var(--line); font-size: 12px; color: var(--mid); }
</style>
</head>
<body>
<header class="wf-header">
  <strong>{S-NN} — {Screen Name}</strong> &middot; Serves {S3.4, S5.1} &middot; Entry: {entry points}
</header>

<!-- Desktop apps only. Delete this strip for web apps. -->
<nav class="menubar" aria-label="Application menu (mock)">
  <span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span>
</nav>

<div class="switcher" role="group" aria-label="Screen state">
  <button type="button" data-state="loading" aria-pressed="false">Loading</button>
  <button type="button" data-state="empty" aria-pressed="false">Empty</button>
  <button type="button" data-state="error" aria-pressed="false">Error</button>
  <button type="button" data-state="populated" aria-pressed="true">Populated</button>
</div>

<!-- SITE-HEADER SHELL (default). Signed-out screens keep the brand only and drop the
     nav, spacer, trigger, and account control. -->
<div class="chrome"><span class="clabel">App header</span>
  <header class="app-header">
    <span class="brand">{Product Name}</span>
    <nav aria-label="Primary">
      <a href="#" aria-current="page">{Nav item}</a>
    </nav>
    <span class="spacer"></span>
    <button type="button" class="menu-trigger" aria-label="Open menu">&#8801;</button>
    <button type="button" class="signout">{account control}</button>
  </header>
</div>

<!-- SIDEBAR SHELL (admin dashboard) — use INSTEAD of the block above, only with an App Shell
     justification (4+ destinations). Wrap <main> in .layout alongside it:
<div class="layout" style="display: flex;">
  <div class="region" data-component="Sidebar" style="width: 220px; margin: 12px;">
    <span class="label">Sidebar — primary nav</span>
    <a href="#" aria-current="page">{Nav item}</a><br>
    <a href="#">{Nav item}</a><br>
    <a href="#">{Nav item}</a><br>
    <a href="#">{Nav item}</a>
    <p class="muted" style="font-size: 12px;">SidebarFooter: {account control}</p>
  </div>
  <main> … </main>
</div>
-->

<main>
  <section class="state" id="state-loading" aria-label="Loading state">
    <div class="region" data-component="PageHeader"><span class="label">Page header</span>
      <div class="page-header">
        <h1>{Screen Name}</h1>
        <div class="page-actions"><button type="button">{control text}</button></div>
      </div>
    </div>
    <div class="region" data-component="Table"><span class="label">{Region} — loading</span>
      <p class="muted" role="status">Loading {things}…</p>
      <div class="placeholder"></div><div class="placeholder"></div>
    </div>
  </section>

  <section class="state" id="state-empty" aria-label="Empty state">
    <div class="region" data-component="PageHeader"><span class="label">Page header</span>
      <div class="page-header">
        <h1>{Screen Name}</h1>
        <div class="page-actions"><button type="button">{control text}</button></div>
      </div>
    </div>
    <div class="region" data-component="Card"><span class="label">{Region} — empty</span>
      <p><strong>{state copy — e.g. "No orders yet"}</strong></p>
      <p class="muted">{why it is empty and what to do}</p>
      <button type="button">{control text — e.g. Create first order}</button>
    </div>
  </section>

  <section class="state" id="state-error" aria-label="Error state">
    <div class="region" data-component="PageHeader"><span class="label">Page header</span>
      <div class="page-header">
        <h1>{Screen Name}</h1>
        <div class="page-actions"><button type="button">{control text}</button></div>
      </div>
    </div>
    <div class="region" data-component="Toast"><span class="label">{Region} — error</span>
      <p role="alert">{state copy — names the problem and the next action}</p>
      <button type="button">Retry</button>
    </div>
  </section>

  <section class="state active" id="state-populated" aria-label="Populated state">
    <div class="region" data-component="PageHeader"><span class="label">Page header</span>
      <div class="page-header">
        <h1>{Screen Name}</h1>
        <div class="page-actions">
          <button type="button">{control text}</button>
          <button type="button">{control text}…</button>
        </div>
        <p class="meta">{count or subtitle line}</p>
      </div>
    </div>

    <div class="region" data-component="Table"><span class="label">{Region}</span>
      <table>
        <thead><tr><th>{Column}</th><th>{Column}</th><th>Actions</th></tr></thead>
        <tbody>
          <tr>
            <td data-th="{Column}">{value}</td>
            <td data-th="{Column}">{value}</td>
            <td class="actions"><button type="button">{control text}</button><button type="button">Delete…</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="region" data-component="AlertDialog"><span class="label">Confirm dialog — opens from "Delete…"</span>
      <p><strong>{Delete {thing}?}</strong></p>
      <p class="muted">{what is lost, and that it cannot be undone}</p>
      <button type="button">Cancel</button>
      <button type="button">Delete</button>
      <p class="muted" style="font-size: 12px; margin: 8px 0 0;">Escape closes without deleting. "Cancel" is the default.</p>
    </div>
  </section>
</main>

<div class="chrome"><span class="clabel">App footer</span>
  <footer class="app-footer">{product-name} v{version}</footer>
</div>

<footer class="wf-footer">
  ConOps steps: {S3.4, S5.1} &middot; Links to: {linked screens} &middot;
  Narrow the window below the breakpoint to see the {floor} layout. &middot;
  Low-fidelity planning wireframe — no visual design implied.
</footer>

<script>
  // The only script on the page: toggles which state section is visible.
  var buttons = document.querySelectorAll('.switcher button');
  function show(name) {
    document.querySelectorAll('.state').forEach(function (s) { s.classList.toggle('active', s.id === 'state-' + name); });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.state === name)); });
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.state); }); });
</script>
</body>
</html>
```

---

## Index Template — `wireframes/index.html`

Written by `mockup` Step 5.3, one per project, regenerated whenever the screen set changes. It is
the **entry point for review**: Step 6 opens this file in the user's default browser, and every
screen is one click away from it. Prefer it over a `file://` directory listing — a directory URL
opens Finder rather than a browser on macOS, and Safari will not render one at all.

Same constraints as a wireframe: inline CSS, grayscale, system font, no external resources, no
script. One `<tr>` per screen in `ux/screens.md`, in `S-NN` order, including the Application menu
and Window rows (desktop) — those link to nothing, so their Screen cell is plain text, not a link.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{Product Name} — wireframe index</title>
<style>
  /* Low fidelity on purpose: grayscale only, system font, no brand. Do not add colors or typefaces. */
  :root { --ink: #222; --mid: #777; --line: #999; --fill: #f2f2f2; --paper: #fff; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; font-size: 14px; color: var(--ink); background: var(--paper); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: var(--mid); margin: 0 0 20px; }
  table { border-collapse: collapse; width: 100%; max-width: 940px; }
  th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid var(--line); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--mid); border-bottom: 2px solid var(--ink); }
  td a { color: var(--ink); font-weight: bold; }
  .meta { color: var(--mid); font-size: 12px; }
  :focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
  footer { margin-top: 20px; font-size: 12px; color: var(--mid); }
</style>
</head>
<body>
<h1>{Product Name} — wireframe index</h1>
<p class="sub">{N} screens &middot; low-fidelity planning wireframes &middot; grayscale on purpose &middot; {shell} shell</p>
<table>
  <thead>
    <tr><th>Screen</th><th>Purpose</th><th>States</th><th>Serves</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="{S-NN}-{kebab-name}.html">{S-NN} {Screen Name}</a></td>
      <td>{purpose}</td>
      <td class="meta">{states}</td>
      <td class="meta">{S1.1, S1.2}</td>
    </tr>
  </tbody>
</table>
<footer>
  Open a screen and use its state buttons to switch loading / empty / error / populated.
  Narrow the window to check the layout floor.
  The inventory, the app shell, and the per-scenario flows live in <code>../screens.md</code>.
</footer>
</body>
</html>
```
