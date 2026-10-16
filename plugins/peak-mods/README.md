# peak-mods

A bundle of Claude Code **mods**: hooks-module plugins that change Claude Code's own interface.
Install it once and every mod in it comes along; each one can be switched off on its own in
`/config`.

| Mod | What it does | Command |
|-----|--------------|---------|
| [file-tree](#file-tree) | Explorer-style pane over the working directory, with a read-only file viewer | `/files` |

## Install

At the prompt of a terminal session:

```
/plugin install peak-mods --marketplace peakflames/claude-plugins-peakflames
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; Enter takes it).

From a shell:

```bash
claude plugin install peak-mods --marketplace peakflames/claude-plugins-peakflames
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `peakflames/claude-plugins-peakflames`, then **Add plugin**
and pick `peak-mods`.

For unreleased work, add the marketplace from `develop`:
`/plugin marketplace add peakflames/claude-plugins-peakflames#develop`.

## Options

Every option is a row in `/config`.

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `enableFileTree` | boolean | `true` | Turns the file-tree mod and `/files` on or off |
| `fileTreeAutoOpen` | boolean | `false` | Opens the Files pane at session start, where the terminal is wide enough to dock it as a sidebar |
| `fileTreeIgnore` | string | `.git,node_modules,.DS_Store` | Comma-separated names the tree hides; replaces the default list |

---

## file-tree

`/files` toggles a **Files** pane. In fullscreen from about 110 columns it docks beside the
transcript; on a narrower or non-fullscreen terminal it opens inline above the prompt.

### Tree

- The header is the working directory's name. Folders sort first, then files, case-insensitive.
- **Enter** or a click on a folder expands or collapses it (`▸` / `▾`). A folder is listed only
  the first time it is expanded.
- **Enter** or a click on a file opens it in the viewer.
- Symlinks are shown with `→` and not followed. Empty folders show `(empty)`; folders that
  cannot be read show `(unreadable)`.
- Long names are cut with `…` to the pane's width, never wrapped.
- `.git`, `node_modules` and `.DS_Store` are hidden by default; other dotfiles show. Set
  `fileTreeIgnore` to change the list. `.gitignore` is not read.

### Viewer

| Key | Button | Action |
|-----|--------|--------|
| `b` | `[ ← Back ]` | Back to the tree, on the row you opened, with the same folders expanded |
| `a` | `[ @ Add to prompt ]` | Inserts `@<path> ` into the prompt so Claude can read the whole file |
| `Esc` | — | Hands the keyboard back to the prompt (the engine's own key). The viewer stays as it was: focus the pane again to carry on |

- Plain text with a dim line-number gutter. Long lines are cut to the pane's width.
- Shows the first **2,000 lines or 256 KB**, whichever comes first, then
  `Showing first 2,000 of N lines`.
- Binary files (a NUL byte in the first 8 KB, or a known binary extension) are not opened: the
  viewer shows `Binary file, <size>`. Files over 4 MB are not previewed.

### Refresh

The tree re-lists its open folders after Claude runs `Write`, `Edit`, `NotebookEdit` or `Bash`,
and every 5 seconds while the pane is open (to catch edits made outside Claude). An open file
whose modification time changes is re-read, keeping the scroll position.

---

## Adding a mod

Rules for the bundle:

1. **One entry module.** `hooks/hooks.json` names only `hooks/register.tsx`, and every mod is
   reached from it by a static `import`. Dynamic `import()` is not allowed: a module containing
   it does not load.
2. **Namespace everything a mod owns.** Pane ids, command names, `$.state` keys and Button keys
   carry the mod's name as a prefix (`file-tree`, `file-tree:`).
3. **Mods never import from each other.** Code shared by two or more mods goes in
   `hooks/shared/`, created when the second mod needs it, not before.
4. **Adding a mod** means: a folder under `hooks/mods/<mod>/` exporting `register<Mod>(on, options)`,
   one line in `hooks/register.tsx`, one `enable<Mod>` toggle under `userConfig` in
   `.claude-plugin/plugin.json`, a block of `$.state` keys in `types/index.d.ts`, a section in
   this README, and a CHANGELOG bullet.

A function that takes `$` must be declared at the top level of its file (or imported from a file
of the plugin): `claude plugin validate` refuses `$` passed to a nested closure.

### Checks

```bash
claude plugin validate plugins/peak-mods
claude plugin test plugins/peak-mods
tsc -p plugins/peak-mods   # after Claude Code has loaded the plugin from this folder once
```

`tsc` needs the API types Claude Code writes to `.claude-plugin/types/` when it loads the plugin
from a working folder (`claude --plugin-dir plugins/peak-mods`). That folder is git-ignored.
