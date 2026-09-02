#!/usr/bin/env node
// CLAUDE_CODE_STATUSLINE_V1
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function stripModelPrefix(name) {
  return name.replace(/^Claude\s+/i, '');
}

function tildeAbbreviate(cwd) {
  if (!cwd) return cwd;
  const normalized = cwd.replace(/\\/g, '/');
  const home = os.homedir().replace(/\\/g, '/');
  if (!home) return normalized;

  const isWindows = process.platform === 'win32';
  const cmp = isWindows ? normalized.toLowerCase() : normalized;
  const homeCmp = isWindows ? home.toLowerCase() : home;

  if (cmp === homeCmp) return '~';
  if (cmp.startsWith(homeCmp + '/')) {
    return '~' + normalized.slice(home.length);
  }
  return normalized;
}

function findGitDir(startDir) {
  let dir = startDir;
  while (true) {
    const gitPath = path.join(dir, '.git');
    let stat;
    try {
      stat = fs.statSync(gitPath);
    } catch {
      stat = null;
    }

    if (stat) {
      if (stat.isDirectory()) {
        return gitPath;
      }
      if (stat.isFile()) {
        let contents;
        try {
          contents = fs.readFileSync(gitPath, 'utf8');
        } catch {
          return null;
        }
        const match = contents.match(/^gitdir:\s*(.+?)\s*$/m);
        if (!match) return null;
        const resolved = path.resolve(dir, match[1]);
        return resolved;
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function branchFromGitDir(gitDir) {
  const headPath = path.join(gitDir, 'HEAD');
  let head;
  try {
    head = fs.readFileSync(headPath, 'utf8').trim();
  } catch {
    return { conclusive: false, branch: null };
  }

  const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/);
  if (refMatch) {
    return { conclusive: true, branch: refMatch[1] };
  }

  if (/^[0-9a-f]{40}$/i.test(head)) {
    return { conclusive: true, branch: null };
  }

  return { conclusive: false, branch: null };
}

function getBranch(cwd) {
  const gitDir = findGitDir(cwd);
  if (gitDir) {
    const result = branchFromGitDir(gitDir);
    if (result.conclusive) {
      return result.branch;
    }
  }

  try {
    const out = execFileSync('git', ['branch', '--show-current'], {
      cwd,
      timeout: 500,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

function buildBar(pct) {
  const cells = 10;
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = (clamped / 100) * cells;
  let full = Math.floor(filled);
  let eighths = Math.round((filled - full) * 8);
  const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

  if (eighths === 8) {
    full += 1;
    eighths = 0;
  }
  if (full > cells) full = cells;

  const partial = eighths > 0 && full < cells ? PARTIALS[eighths] : '';
  const emptyCount = cells - full - (partial ? 1 : 0);
  return '█'.repeat(full) + partial + '░'.repeat(Math.max(0, emptyCount));
}

function colorize(text, pct) {
  if (process.env.NO_COLOR) return text;
  let code;
  if (pct < 20) code = '\x1b[32m';
  else if (pct <= 25) code = '\x1b[38;5;208m';
  else code = '\x1b[31m';
  return `${code}${text}\x1b[0m`;
}

function render() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  const segments = [];

  try {
    const displayName = data?.model?.display_name;
    if (displayName) {
      segments.push(stripModelPrefix(displayName));
    }
  } catch {}

  let cwd;
  try {
    cwd = data?.workspace?.current_dir ?? data?.cwd;
    if (cwd) {
      segments.push(tildeAbbreviate(cwd));
    }
  } catch {}

  try {
    if (cwd) {
      const branch = getBranch(cwd);
      if (branch) segments.push(branch);
    }
  } catch {}

  try {
    const pct = data?.context_window?.used_percentage;
    if (pct !== null && pct !== undefined) {
      const bar = buildBar(pct);
      const skull = pct > 25 ? ' ☠️' : '';
      const text = `${Math.round(pct)}% [${bar}]${skull}`;
      segments.push(colorize(text, pct));
    }
  } catch {}

  try {
    const cost = data?.cost?.total_cost_usd ?? 0;
    segments.push(`$${cost.toFixed(2)}`);
  } catch {}

  if (segments.length > 0) {
    process.stdout.write(segments.join(' | ') + '\n');
  }
}

render();
