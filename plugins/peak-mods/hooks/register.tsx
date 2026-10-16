import type { Register } from 'claude-code'

import { registerFileTree } from './mods/file-tree/index'

// The bundle's one hooks entry module. Each mod is reached through a static
// import and registered only when its userConfig toggle is on.
export const register: Register = (on, options) => {
  if (options.enableFileTree !== false) {
    registerFileTree(on, options)
  }
}
