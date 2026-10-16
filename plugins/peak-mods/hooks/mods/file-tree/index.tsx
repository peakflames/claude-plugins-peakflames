// file-tree: an Explorer-style pane over the working directory. Folders
// expand and collapse; a file opens in a read-only viewer in the same pane.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions } from 'claude-code'

import { baseName, neededFolders, parseIgnore, ROOT, rowKey, rowLabel, toggle, visibleRows } from './tree'
import type { Entry, Listing } from './tree'
import { drawViewer, loadDoc } from './viewer'
import type { Doc } from './viewer'

export const PANE = 'file-tree'
const TITLE = 'Files'
const REFRESH_MS = 5000
const REFRESH_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'Bash'] as const

const expandedAtom = atom({ plugin: 'peak-mods', key: 'file-tree:expanded' } as const, [])
const modeAtom = atom({ plugin: 'peak-mods', key: 'file-tree:mode' } as const, 'tree')
const openFileAtom = atom({ plugin: 'peak-mods', key: 'file-tree:openFile' } as const, null)
const focusKeyAtom = atom({ plugin: 'peak-mods', key: 'file-tree:focusKey' } as const, null)

// The mod's caches: rebuilt after a hot reload. Position lives in $.state.
type Context = {
  listings: Map<string, Listing>
  docs: Map<string, Doc>
  cwd: string
  timer: { cancel: () => void } | undefined
}

async function listFolder($: EngineInterface, folder: string): Promise<Listing> {
  try {
    const entries = await $.fs.list(folder === ROOT ? '.' : folder)
    return entries.map((entry): Entry => ({ name: entry.name, kind: entry.kind, isLink: entry.isLink }))
  } catch {
    return 'unreadable'
  }
}

const signature = (listing: Listing | undefined): string =>
  listing === undefined || listing === 'unreadable'
    ? String(listing)
    : listing
        .map(entry => `${entry.kind}${entry.isLink ? '@' : ''}:${entry.name}`)
        .sort()
        .join('\n')

// Re-lists the folders on screen and re-reads an open file whose mtime moved;
// redraws only when something changed.
async function refresh($: EngineInterface, ctx: Context): Promise<void> {
  let isChanged = false
  const needed = neededFolders(new Set(await read($, expandedAtom)))
  for (const folder of [...ctx.listings.keys()]) {
    if (!needed.includes(folder)) ctx.listings.delete(folder)
  }
  for (const folder of needed) {
    if (!ctx.listings.has(folder)) continue
    const fresh = await listFolder($, folder)
    if (signature(fresh) !== signature(ctx.listings.get(folder))) {
      ctx.listings.set(folder, fresh)
      isChanged = true
    }
  }
  const openFile = await read($, openFileAtom)
  const doc = openFile === null ? undefined : ctx.docs.get(openFile)
  if (openFile !== null && doc !== undefined) {
    const mtimeMs = await $.fs.stat(openFile).then(
      stat => stat.mtimeMs,
      () => -1,
    )
    if (mtimeMs !== doc.mtimeMs) {
      ctx.docs.set(openFile, await loadDoc($, openFile))
      isChanged = true
    }
  }
  if (isChanged) $.ui.invalidate('ui.render')
}

function startTimer($: EngineInterface, ctx: Context): void {
  ctx.timer?.cancel()
  ctx.timer = $.clock.every(REFRESH_MS, () => void refresh($, ctx))
}

// The pane closed: stop polling and drop the caches, so refreshes after a
// tool call have nothing to re-list until it opens again.
function stopTimer(ctx: Context): void {
  ctx.timer?.cancel()
  ctx.timer = undefined
  ctx.listings.clear()
  ctx.docs.clear()
}

async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

async function openPane($: EngineInterface, ctx: Context, isAsked: boolean) {
  const opened = await $.ui.open(isAsked ? { id: PANE, title: TITLE, focus: true } : { id: PANE, title: TITLE })
  startTimer($, ctx)
  return opened
}

export const registerFileTree = (on: On, options: PluginOptions): void => {
  const ignore = parseIgnore(typeof options.fileTreeIgnore === 'string' ? options.fileTreeIgnore : undefined)
  const isAutoOpen = options.fileTreeAutoOpen === true
  const ctx: Context = { listings: new Map(), docs: new Map(), cwd: '', timer: undefined }

  on('session.start', async ($, e, next) => {
    ctx.cwd = e.cwd
    await $.command.register({ name: 'files', description: 'Toggle the Files pane (file-tree)' })
    if (await isPaneOpen($)) {
      // A hot reload kept the pane up; its timer died with the old module.
      startTimer($, ctx)
    } else if (isAutoOpen) {
      // Unasked, the engine places the pane only where it docks as a sidebar.
      void openPane($, ctx, false)
    }
    return next(e)
  })

  on('command.run', { command: 'files' }, async $ => {
    if (await isPaneOpen($)) {
      await $.ui.close({ id: PANE })
      stopTimer(ctx)
      return { text: 'Files pane closed.' }
    }
    const opened = await openPane($, ctx, true)
    return { text: opened.isPlaced ? 'Files pane opened.' : `Files pane waits to be placed: ${opened.reason}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    stopTimer(ctx)
    return closed
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: REFRESH_TOOLS }, async ($, e, next) => {
    const ran = await next(e)
    void refresh($, ctx)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const columns = Math.max(8, e.props.bodyColumns)
    const mode = await read($, modeAtom)
    const openFile = await read($, openFileAtom)

    if (mode === 'viewer' && openFile !== null) {
      let doc = ctx.docs.get(openFile)
      if (doc === undefined) {
        doc = await loadDoc($, openFile)
        ctx.docs.set(openFile, doc)
      }
      return drawViewer(els, {
        path: openFile,
        doc,
        columns,
        offset: e.props.scroll.offset,
        bodyRows: e.props.scroll.bodyRows,
        onBack: async () => {
          const key = await read($, focusKeyAtom)
          await update($, modeAtom, () => 'tree')
          if (key !== null) {
            // Requests the site may refuse (it may not hold the keys); the tree
            // is restored either way.
            await $.ui.focus({ requestId: PANE, key }).catch(() => undefined)
            await $.ui.scroll({ in: PANE, to: { key } }).catch(() => undefined)
          }
        },
        onAdd: () => void $.prompt.fill({ text: `@${openFile} `, mode: 'insert' }),
      })
    }

    if (ctx.cwd === '') ctx.cwd = await $.session.cwd()
    const expanded = new Set(await read($, expandedAtom))
    for (const folder of neededFolders(expanded)) {
      if (!ctx.listings.has(folder)) ctx.listings.set(folder, await listFolder($, folder))
    }
    const rows = visibleRows(ctx.listings, expanded, ignore)

    return (
      <Box flexDirection="column">
        <Box key="file-tree:header">
          <Text bold wrap="truncate-end">
            {baseName(ctx.cwd) || ctx.cwd}
          </Text>
        </Box>
        {rows.map(row => {
          const label = rowLabel(row, columns)
          if (row.kind === 'note') {
            return <Text dimColor>{label}</Text>
          }
          const onPress =
            row.kind === 'dir'
              ? async () => {
                  await update($, expandedAtom, list => {
                    // Expanding lists the folder afresh rather than from cache.
                    if (!list.includes(row.path)) ctx.listings.delete(row.path)
                    return toggle(list, row.path)
                  })
                }
              : async () => {
                  ctx.docs.delete(row.path)
                  await update($, openFileAtom, () => row.path)
                  await update($, focusKeyAtom, () => rowKey(row.path))
                  await update($, modeAtom, () => 'viewer')
                }
          return <Button key={rowKey(row.path)} plain label={label} onPress={onPress} />
        })}
      </Box>
    )
  })
}
