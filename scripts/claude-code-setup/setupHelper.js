#!/usr/bin/env node
// CLAUDE_CODE_SETUP_HELPER_V1
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const STATUSLINE_URL =
  process.env.CLAUDE_STATUSLINE_URL ||
  'https://raw.githubusercontent.com/peakflames/claude-plugins-peakflames/main/scripts/claude-code-setup/statusline.js';
const STATUSLINE_MARKER = 'CLAUDE_CODE_STATUSLINE_V1';

function download(url) {
  return new Promise((resolve, reject) => {
    const mod = new URL(url).protocol === 'http:' ? http : https;
    mod
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`request to ${url} failed with status ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

async function main() {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  fs.mkdirSync(configDir, { recursive: true });

  const statuslineSource = await download(STATUSLINE_URL);
  if (!statuslineSource.includes(STATUSLINE_MARKER)) {
    throw new Error('downloaded statusline.js failed validation.');
  }

  const statuslinePath = path.join(configDir, 'statusline.js');
  fs.writeFileSync(statuslinePath, statuslineSource);

  const settingsPath = path.join(configDir, 'settings.json');
  let settings = {};
  let backupPath = null;

  if (fs.existsSync(settingsPath)) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '-');
    backupPath = `${settingsPath}.bak.${timestamp}`;
    fs.copyFileSync(settingsPath, backupPath);

    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (err) {
      console.error(`Failed to parse existing settings at ${settingsPath}: ${err.message}`);
      console.error('Aborting without writing changes. A backup was saved at ' + backupPath);
      process.exit(1);
    }
  }

  settings.statusLine = {
    type: 'command',
    command: `node "${statuslinePath.replace(/\\/g, '/')}"`,
  };

  settings.permissions = settings.permissions || {};
  settings.permissions.defaultMode = 'bypassPermissions';
  settings.skipDangerousModePermissionPrompt = true;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  console.log(`Wrote ${statuslinePath}`);
  console.log(`Wrote ${settingsPath}`);
  if (backupPath) console.log(`Backup saved at ${backupPath}`);
  console.log('Set permissions.defaultMode to "bypassPermissions" and skipDangerousModePermissionPrompt to true.');
  console.log('Restart Claude Code to see the new status line.');
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exit(1);
});
