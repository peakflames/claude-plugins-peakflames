// Pure tree logic: directory listings + expanded set + ignore list -> the
// ordered rows the pane draws. No `$`, so it is unit-tested directly.

export type Entry = {
  name: string
  kind: 'file' | 'dir' | 'other'
  isLink: boolean
}

// A folder's listing, or `unreadable` when $.fs.list rejected for it.
// A folder missing from the map has not been listed yet.
export type Listing = readonly Entry[] | 'unreadable'

export type Row =
  | { kind: 'dir'; path: string; name: string; depth: number; isExpanded: boolean }
  | { kind: 'file'; path: string; name: string; depth: number }
  | { kind: 'link'; path: string; name: string; depth: number }
  | { kind: 'note'; path: string; text: '(empty)' | '(unreadable)' | '(loading)'; depth: number }

export const DEFAULT_IGNORE = '.git,node_modules,.DS_Store'

// The root folder's key in listings and its relative path: the empty string.
export const ROOT = ''

export const parseIgnore = (text: string | undefined): Set<string> =>
  new Set(
    (text ?? DEFAULT_IGNORE)
      .split(',')
      .map(name => name.trim())
      .filter(name => name !== ''),
  )

export const join = (parent: string, name: string): string =>
  parent === ROOT ? name : `${parent}/${name}`

const rank = (entry: Entry): number => (entry.kind === 'dir' && !entry.isLink ? 0 : 1)

// Folders first, then everything else; case-insensitive alphabetical.
export const sortEntries = (entries: readonly Entry[]): Entry[] =>
  [...entries].sort((a, b) => {
    const byKind = rank(a) - rank(b)
    if (byKind !== 0) return byKind
    const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    return byName !== 0 ? byName : a.name.localeCompare(b.name)
  })

export const visibleRows = (
  listings: ReadonlyMap<string, Listing>,
  expanded: ReadonlySet<string>,
  ignore: ReadonlySet<string>,
): Row[] => {
  const rows: Row[] = []

  const walk = (folder: string, depth: number): void => {
    const listing = listings.get(folder)
    if (listing === undefined) {
      rows.push({ kind: 'note', path: folder, text: '(loading)', depth })
      return
    }
    if (listing === 'unreadable') {
      rows.push({ kind: 'note', path: folder, text: '(unreadable)', depth })
      return
    }
    const shown = sortEntries(listing.filter(entry => !ignore.has(entry.name)))
    if (shown.length === 0) {
      rows.push({ kind: 'note', path: folder, text: '(empty)', depth })
      return
    }
    for (const entry of shown) {
      const path = join(folder, entry.name)
      if (entry.isLink) {
        // Symlinks are shown and never followed, so a cycle cannot recurse.
        rows.push({ kind: 'link', path, name: entry.name, depth })
      } else if (entry.kind === 'dir') {
        const isExpanded = expanded.has(path)
        rows.push({ kind: 'dir', path, name: entry.name, depth, isExpanded })
        if (isExpanded) walk(path, depth + 1)
      } else {
        rows.push({ kind: 'file', path, name: entry.name, depth })
      }
    }
  }

  walk(ROOT, 0)
  return rows
}

// The folders whose listings the rows need: the root and every expanded
// folder reachable through expanded parents.
export const neededFolders = (expanded: ReadonlySet<string>): string[] => {
  const folders = [ROOT]
  for (const path of expanded) {
    const parts = path.split('/')
    const isReachable = parts.every((_, i) => i === parts.length - 1 || expanded.has(parts.slice(0, i + 1).join('/')))
    if (isReachable) folders.push(path)
  }
  return folders
}

export const toggle = (expanded: readonly string[], path: string): string[] =>
  expanded.includes(path) ? expanded.filter(one => one !== path) : [...expanded, path]

// Cuts `text` to `width` cells with a trailing ellipsis, never wrapping.
export const truncate = (text: string, width: number): string => {
  if (width <= 0) return ''
  const chars = [...text]
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
}

export const rowKey = (path: string): string => `row:${path}`

export const rowLabel = (row: Row, width: number): string => {
  const indent = '  '.repeat(row.depth)
  switch (row.kind) {
    case 'dir':
      return truncate(`${indent}${row.isExpanded ? '▾' : '▸'} ${row.name}`, width)
    case 'file':
      return truncate(`${indent}  ${row.name}`, width)
    case 'link':
      return truncate(`${indent}  ${row.name} →`, width)
    case 'note':
      return truncate(`${indent}  ${row.text}`, width)
  }
}

export const baseName = (path: string): string => {
  const trimmed = path.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return cut < 0 ? trimmed : trimmed.slice(cut + 1)
}
