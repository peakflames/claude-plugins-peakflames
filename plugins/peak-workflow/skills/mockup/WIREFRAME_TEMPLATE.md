# Wireframe Template — `/peak-workflow:mockup`

Used by `mockup` Step 5.1. Write one populated copy per screen to
`docs/product-vision-planning/ux/wireframes/{S-NN}-{kebab-name}.html`. Each file is
self-contained: inline CSS, grayscale only, system font, no external resources, and no JS
beyond the state toggle. The wireframe is a planning artifact — it shows *what is on the screen
and what it is called*, never how it looks.

---

## Placeholder Reference

| Placeholder | Meaning |
|---|---|
| `{S-NN}` | Screen ID from `ux/screens.md` |
| `{Screen Name}` | Screen name from `ux/screens.md` |
| `{S3.4, S5.1}` | ConOps steps this screen serves (the `Serves` column) |
| `{entry points}` | The `Entry points` column, in prose |
| `{Region}` | A layout area — App shell, Page header, Filters, Order table, Form, Confirm dialog … |
| `{Component}` | The design-system primitive the region becomes: `Button`, `Dialog`, `Table`, `Form`, `Input`, `Sidebar`, `Tabs`, `Sheet`, `Toast` (plus `Card`, `Select`, `Checkbox`, `Breadcrumb` when needed) |
| `{control text}` | Exact visible text of a control — must match `ux/screens.md` and the ConOps step |
| `{state copy}` | The visible text for the empty or error state, from `## States` |
| `{linked screens}` | Screens this one navigates to, `S-NN Name` each |

Rules the populated file must keep:
- Every control is a real `<button>`, `<a>`, `<input>`, or `<select>` so Tab reaches it, and the
  `:focus-visible` rule stays — the wireframe models keyboard focus.
- `data-component` on every `.region`; the `.label` text names the region in plain words.
- The menu-bar `<nav>` is for desktop apps only — delete it for web apps.
- A screen marked `n/a — not data-bearing` keeps only `#state-populated` and drops the switcher.
- Destructive actions render their confirmation `Dialog` region inside the populated state with
  Cancel first.

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
  .layout { display: flex; min-height: 60vh; }
  .layout > main { flex: 1; }
  .state { display: none; padding: 16px; }
  .state.active { display: block; }
  .region { position: relative; border: 2px dashed var(--line); padding: 16px 12px 12px; margin: 12px 0; min-height: 48px; }
  .region > .label { position: absolute; top: -9px; left: 8px; padding: 0 4px; background: var(--paper); font-size: 11px; color: var(--mid); text-transform: uppercase; letter-spacing: .05em; }
  .region button, .region a { font: inherit; color: var(--ink); border: 1px solid var(--ink); background: var(--fill); padding: 4px 10px; margin: 4px 4px 0 0; text-decoration: none; display: inline-block; cursor: pointer; }
  .region label { display: block; margin-top: 8px; }
  .region input, .region select { font: inherit; border: 1px solid var(--line); padding: 4px; width: 100%; max-width: 320px; }
  .placeholder { min-height: 40px; margin: 6px 0; background: repeating-linear-gradient(45deg, var(--fill), var(--fill) 6px, var(--paper) 6px, var(--paper) 12px); }
  .muted { color: var(--mid); }
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

<div class="layout">
  <div class="region" data-component="Sidebar" style="width: 180px; margin: 12px;">
    <span class="label">App shell — primary nav</span>
    <a href="#" aria-current="page">{Nav item}</a><br>
    <a href="#">{Nav item}</a>
  </div>

  <main>
    <section class="state" id="state-loading" aria-label="Loading state">
      <div class="region" data-component="Table"><span class="label">{Region} — loading</span>
        <p class="muted" role="status">Loading {things}…</p>
        <div class="placeholder"></div><div class="placeholder"></div>
      </div>
    </section>

    <section class="state" id="state-empty" aria-label="Empty state">
      <div class="region" data-component="Card"><span class="label">{Region} — empty</span>
        <p>{state copy — e.g. "No orders yet"}</p>
        <button type="button">{control text — e.g. Create first order}</button>
      </div>
    </section>

    <section class="state" id="state-error" aria-label="Error state">
      <div class="region" data-component="Toast"><span class="label">{Region} — error</span>
        <p role="alert">{state copy — names the problem and the next action}</p>
        <button type="button">Retry</button>
      </div>
    </section>

    <section class="state active" id="state-populated" aria-label="Populated state">
      <div class="region" data-component="Button"><span class="label">Page header</span>
        <h1 style="font-size: 18px; margin: 0 0 8px;">{Screen Name}</h1>
        <button type="button">{control text}</button>
        <button type="button">{control text}…</button>
      </div>
      <div class="region" data-component="Table"><span class="label">{Region}</span>
        <div class="placeholder"></div><div class="placeholder"></div>
      </div>
      <div class="region" data-component="Dialog"><span class="label">Confirm dialog — opens from "{control text}…"</span>
        <p>{Delete {thing}?}</p>
        <button type="button">Cancel</button>
        <button type="button">Delete</button>
      </div>
    </section>
  </main>
</div>

<footer class="wf-footer">
  ConOps steps: {S3.4, S5.1} &middot; Links to: {linked screens} &middot; Low-fidelity planning wireframe — no visual design implied.
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
