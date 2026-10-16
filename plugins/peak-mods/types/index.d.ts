// $.state contract for every mod in the bundle: one block of keys per mod,
// each key prefixed with the mod's name.

export type FileTreeMode = 'tree' | 'viewer'

declare module 'claude-code' {
  interface PluginState {
    'peak-mods': {
      // file-tree
      'file-tree:expanded': string[]
      'file-tree:mode': FileTreeMode
      'file-tree:openFile': string | null
      'file-tree:focusKey': string | null
    }
  }
}
