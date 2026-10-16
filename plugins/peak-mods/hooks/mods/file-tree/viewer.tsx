// The read-only viewer: loading a file into a capped, line-split document,
// binary and size handling, and the viewer's drawing.

import type { Elements, EngineInterface, RenderSurface } from 'claude-code'

export const MAX_LINES = 2000
export const MAX_BYTES = 256 * 1024
// $.fs.read rejects anything larger, so such a file is not previewed at all.
export const MAX_READ_BYTES = 4 * 1024 * 1024
const SNIFF_BYTES = 8 * 1024

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tif', 'tiff', 'psd',
  'pdf', 'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'jar', 'war',
  'exe', 'dll', 'so', 'dylib', 'o', 'a', 'lib', 'bin', 'class', 'pyc', 'wasm',
  'mp3', 'mp4', 'm4a', 'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'webm',
  'ttf', 'otf', 'woff', 'woff2', 'eot', 'sqlite', 'db', 'dmg', 'iso',
])

export type Doc =
  | {
      kind: 'text'
      mtimeMs: number
      lines: string[]
      totalLines: number
      isTruncated: boolean
    }
  | { kind: 'binary'; mtimeMs: number; size: number }
  | { kind: 'too-large'; mtimeMs: number; size: number }
  | { kind: 'not-file'; mtimeMs: number }
  | { kind: 'error'; mtimeMs: number; message: string }

export const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export const hasBinaryExtension = (path: string): boolean => BINARY_EXTENSIONS.has(extensionOf(path))

export const hasNul = (bytes: Uint8Array): boolean => {
  const end = Math.min(bytes.length, SNIFF_BYTES)
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true
  return false
}

export const decodeBase64 = (base64: string): Uint8Array => {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const countLines = (bytes: Uint8Array): number => {
  if (bytes.length === 0) return 0
  let count = 0
  for (const byte of bytes) if (byte === 10) count++
  return bytes[bytes.length - 1] === 10 ? count : count + 1
}

// Splits a text file's bytes into at most MAX_LINES lines read from at most
// MAX_BYTES bytes, counting the lines of the whole file for the note.
export const toTextDoc = (bytes: Uint8Array, mtimeMs: number): Doc => {
  const totalLines = countLines(bytes)
  const isByteCapped = bytes.length > MAX_BYTES
  const text = new TextDecoder('utf-8').decode(isByteCapped ? bytes.subarray(0, MAX_BYTES) : bytes)
  const all = text.split('\n')
  if (all.length > 0 && all[all.length - 1] === '') all.pop()
  const lines = all.slice(0, MAX_LINES)
  return { kind: 'text', mtimeMs, lines, totalLines, isTruncated: lines.length < totalLines }
}

export const formatCount = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const truncationNote = (doc: { lines: string[]; totalLines: number }): string =>
  `Showing first ${formatCount(doc.lines.length)} of ${formatCount(doc.totalLines)} lines`

export async function loadDoc($: EngineInterface, path: string): Promise<Doc> {
  try {
    const stat = await $.fs.stat(path)
    const { mtimeMs, size } = stat
    if (stat.kind !== 'file') return { kind: 'not-file', mtimeMs }
    if (hasBinaryExtension(path)) return { kind: 'binary', mtimeMs, size }
    if (size > MAX_READ_BYTES) return { kind: 'too-large', mtimeMs, size }
    const bytes = decodeBase64((await $.fs.read(path, { as: 'bytes' })).base64)
    if (hasNul(bytes)) return { kind: 'binary', mtimeMs, size: bytes.length }
    return toTextDoc(bytes, mtimeMs)
  } catch (error) {
    return { kind: 'error', mtimeMs: 0, message: error instanceof Error ? error.message : String(error) }
  }
}

// Terminal cells cannot draw a tab or a carriage return reliably.
const clean = (line: string): string => line.replace(/\t/g, '    ').replace(/[\r\x00-\x08\x0b-\x1f\x7f]/g, '')

type Els = Pick<Elements[RenderSurface], 'Box' | 'Text' | 'Button'>

export type ViewerView = {
  path: string
  doc: Doc
  // Lines are cut to the body's width (never wrapped), so one line is one row.
  columns: number
  // The pane's scroll window, so lines far outside it draw as their gutter
  // alone and the tree stays within the engine's per-tree text budget.
  offset: number
  bodyRows: number
  onBack: () => void
  onAdd: () => void
}

const HEADER_ROWS = 1

export const drawViewer = ({ Box, Text, Button }: Els, view: ViewerView) => {
  const { doc } = view
  const bar = (
    <Box flexDirection="row" gap={1}>
      <Button key="file-tree:back" label="← Back" hotkey="b" onPress={view.onBack} />
      <Box flexGrow={1} flexShrink={1}>
        <Text wrap="truncate-start">{view.path}</Text>
      </Box>
      <Button key="file-tree:add" label="@ Add to prompt" hotkey="a" onPress={view.onAdd} />
    </Box>
  )

  if (doc.kind !== 'text') {
    const message =
      doc.kind === 'binary'
        ? `Binary file, ${formatSize(doc.size)}`
        : doc.kind === 'too-large'
          ? `File too large to preview, ${formatSize(doc.size)}`
          : doc.kind === 'not-file'
            ? 'Not a regular file (links are not followed)'
            : `Cannot read this file: ${doc.message}`
    return (
      <Box flexDirection="column">
        {bar}
        <Box key="file-tree:message">
          <Text dimColor>
            {message}
          </Text>
        </Box>
      </Box>
    )
  }

  const gutter = String(Math.max(1, doc.lines.length)).length
  const margin = Math.max(view.bodyRows, 20) * 2
  const first = view.offset - HEADER_ROWS - margin
  const last = view.offset - HEADER_ROWS + view.bodyRows + margin
  const width = Math.max(1, view.columns - gutter - 1)

  return (
    <Box flexDirection="column">
      {bar}
      {doc.lines.length === 0 && <Text dimColor>(empty file)</Text>}
      {doc.lines.map((line, i) => (
        <Text wrap="truncate-end">
          <Text dimColor>{String(i + 1).padStart(gutter)} </Text>
          {i >= first && i <= last ? [...clean(line)].slice(0, width).join('') : ''}
        </Text>
      ))}
      {doc.isTruncated && (
        <Box key="file-tree:note">
          <Text dimColor>
            {truncationNote(doc)}
          </Text>
        </Box>
      )}
    </Box>
  )
}
