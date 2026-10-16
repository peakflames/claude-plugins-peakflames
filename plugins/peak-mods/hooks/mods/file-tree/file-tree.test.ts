import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, On, RenderPropsOf } from 'claude-code'

import { DEFAULT_IGNORE, parseIgnore, visibleRows } from './tree'
import type { Entry, Listing } from './tree'
import { MAX_BYTES, MAX_LINES } from './viewer'

const PLUGIN = 'peak-mods'
const SURFACES = ['terminal', 'desktop'] as const

// ---------------------------------------------------------------- tree.ts

const dir = (name: string): Entry => ({ name, kind: 'dir', isLink: false })
const file = (name: string): Entry => ({ name, kind: 'file', isLink: false })
const link = (name: string): Entry => ({ name, kind: 'other', isLink: true })

const LISTINGS = new Map<string, Listing>([
  ['', [file('b.txt'), dir('src'), file('A.md'), dir('.git'), dir('node_modules'), file('.env'), dir('docs'), link('latest')]],
  ['src', [file('main.ts'), dir('lib')]],
  ['src/lib', [file('util.ts')]],
  ['docs', []],
])

const paths = (expanded: string[], ignore = parseIgnore(DEFAULT_IGNORE)) =>
  visibleRows(LISTINGS, new Set(expanded), ignore).map(row => (row.kind === 'note' ? `${row.path}:${row.text}` : row.path))

describe('tree flattening', () => {
  test('folders first, then files, case-insensitive; default ignore list', () => {
    expect(paths([])).toEqual(['docs', 'src', '.env', 'A.md', 'b.txt', 'latest'])
  })

  test('a custom ignore list replaces the defaults', () => {
    expect(paths([], parseIgnore('src, .env'))).toEqual(['.git', 'docs', 'node_modules', 'A.md', 'b.txt', 'latest'])
  })

  test('nested expand shows descendants in place', () => {
    expect(paths(['src', 'src/lib'])).toEqual(['docs', 'src', 'src/lib', 'src/lib/util.ts', 'src/main.ts', '.env', 'A.md', 'b.txt', 'latest'])
  })

  test('collapsing a parent hides its expanded descendants', () => {
    expect(paths(['src/lib'])).toEqual(['docs', 'src', '.env', 'A.md', 'b.txt', 'latest'])
  })

  test('empty and unreadable folders get a note row; symlinks are not followed', () => {
    const listings = new Map<string, Listing>([...LISTINGS, ['src', 'unreadable']])
    const rows = visibleRows(listings, new Set(['docs', 'src', 'latest']), parseIgnore(undefined))
    expect(rows.map(row => (row.kind === 'note' ? row.text : row.kind))).toEqual([
      'dir', '(empty)', 'dir', '(unreadable)', 'file', 'file', 'file', 'link',
    ])
  })
})

// ---------------------------------------------------------------- the pane

type FakeFile = { kind: 'file'; content: string; mtimeMs?: number } | { kind: 'dir' }

const FILES: Record<string, FakeFile> = {
  'README.md': { kind: 'file', content: '# Demo\nhello\n' },
  src: { kind: 'dir' },
  'src/main.ts': { kind: 'file', content: 'export const x = 1\n' },
  'src/lib': { kind: 'dir' },
  'src/lib/util.ts': { kind: 'file', content: 'export {}\n' },
  'long.txt': { kind: 'file', content: Array.from({ length: 2500 }, (_, i) => `line ${i + 1}`).join('\n') + '\n' },
  'wide.txt': { kind: 'file', content: Array.from({ length: 100 }, () => 'x'.repeat(4000)).join('\n') + '\n' },
  'blob.dat': { kind: 'file', content: 'PK\u0003\u0004\u0000\u0000binary' },
}


const encode = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw)
}

type Calls = { commands: string[]; opens: string[]; fills: string[] }

// The engine's bottom for everything the mod reaches: a fake folder tree.
const fakeEngine = (on: On): Calls => {
  const calls: Calls = { commands: [], opens: [], fills: [] }
  // The engine hands fs hooks absolute paths under its own working directory;
  // the pane always lists the root first, so the first listing names it.
  let root: string | undefined
  const norm = (path: string) => {
    root ??= path
    return path === root ? '' : path.slice(root.length + 1)
  }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/demo' }))
  on('command.register', ($, e) => {
    calls.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => {
    calls.opens.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('prompt.fill', ($, e) => {
    calls.fills.push(e.text)
    return { isFilled: true }
  })
  on('clock.every', () => ({ value: undefined }))
  on('fs.list', ($, e) => {
    const folder = norm(e.path)
    const prefix = folder === '' ? '' : `${folder}/`
    const value = Object.entries(FILES)
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && path !== folder)
      .map(([path, entry]): FsEntry => ({
        name: path.slice(prefix.length),
        kind: entry.kind,
        size: entry.kind === 'file' ? entry.content.length : 0,
        mtimeMs: 1,
        isLink: false,
      }))
    return { value }
  })
  on('fs.stat', ($, e) => {
    const entry = FILES[norm(e.path)]
    if (entry === undefined) throw new Error(`ENOENT: ${e.path}`)
    const size = entry.kind === 'file' ? new TextEncoder().encode(entry.content).length : 0
    return { value: { kind: entry.kind, size, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', ($, e) => {
    const entry = FILES[norm(e.path)]
    if (entry === undefined || entry.kind !== 'file') throw new Error(`ENOENT: ${e.path}`)
    return { value: { base64: encode(entry.content) } }
  })
  return calls
}

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Files',
  isFocused: true,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const mountPane = <S extends (typeof SURFACES)[number]>($: Engine, surface: S) =>
  $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'file-tree', props: PANE_PROPS })

describe('file-tree pane', () => {
  for (const surface of SURFACES) {
    test(`${surface}: a folder row toggles; a file row opens the viewer; Back restores`, async ($, on) => {
      const calls = fakeEngine(on)
      await $.session.start({ cwd: '/work/demo', surface, isInteractive: true })
      expect(calls.commands).toEqual(['files'])

      const ui = await mountPane($, surface)
      expect((await ui.find({ key: 'file-tree:header' }))?.text).toBe('demo')
      expect(await ui.find({ key: 'row:src/main.ts' })).toBeUndefined()

      await ui.press({ key: 'row:src' })
      await ui.press({ key: 'row:src/lib' })
      expect(await ui.find({ key: 'row:src/lib/util.ts' })).toBeDefined()

      await ui.press({ key: 'row:src/main.ts' })
      expect(await ui.find({ key: 'file-tree:back' })).toBeDefined()
      expect(await ui.find({ key: 'row:src' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /export const x = 1/ })).toBeDefined()

      await ui.press({ key: 'file-tree:add' })
      expect(calls.fills).toEqual(['@src/main.ts '])

      await ui.press({ key: 'file-tree:back' })
      expect(await ui.find({ key: 'file-tree:back' })).toBeUndefined()
      expect(await ui.find({ key: 'row:src/lib/util.ts' })).toBeDefined()

      await ui.press({ key: 'row:src' })
      expect(await ui.find({ key: 'row:src/main.ts' })).toBeUndefined()
      await ui.unmount()
    })

    test(`${surface}: the line cap produces the truncation note`, async ($, on) => {
      fakeEngine(on)
      const ui = await mountPane($, surface)
      await ui.press({ key: 'row:long.txt' })
      expect((await ui.find({ key: 'file-tree:note' }))?.text).toBe(`Showing first 2,000 of 2,500 lines`)
      expect(await ui.find({ type: 'Text', text: /^ {3}1 line 1$/ })).toBeDefined()
      // Lines far below the scroll window draw their gutter alone.
      expect(await ui.find({ type: 'Text', text: new RegExp(`^${MAX_LINES} $`) })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^2001 / })).toBeUndefined()
      await ui.unmount()
    })

    test(`${surface}: the byte cap produces the truncation note`, async ($, on) => {
      fakeEngine(on)
      const ui = await mountPane($, surface)
      await ui.press({ key: 'row:wide.txt' })
      const shown = Math.ceil(MAX_BYTES / 4001)
      expect((await ui.find({ key: 'file-tree:note' }))?.text).toBe(`Showing first ${shown} of 100 lines`)
      await ui.unmount()
    })

    test(`${surface}: a binary file shows one line and no body`, async ($, on) => {
      fakeEngine(on)
      const ui = await mountPane($, surface)
      await ui.press({ key: 'row:blob.dat' })
      expect((await ui.find({ key: 'file-tree:message' }))?.text).toMatch(/^Binary file, \d+ B$/)
      expect(await ui.find({ key: 'file-tree:note' })).toBeUndefined()
      expect(await ui.findAll({ type: 'Text', text: /binary$/ })).toHaveLength(0)
      await ui.unmount()
    })
  }

  test('enableFileTree: false registers no command and no pane', { options: { enableFileTree: false } }, async ($, on) => {
    const calls = fakeEngine(on)
    await $.session.start({ cwd: '/work/demo', surface: 'terminal', isInteractive: true })
    expect(calls.commands).toEqual([])
    await expect(mountPane($, 'terminal')).rejects.toThrow(/no implementation for ui.render/)
    expect(calls.opens).toEqual([])
  })
})
