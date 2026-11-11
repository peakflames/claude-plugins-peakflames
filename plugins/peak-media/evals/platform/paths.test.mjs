// DEC-53 platform subset: path handling that differs on Windows (AC-XP-04), checked with
// path.win32 / path.posix so every OS runs both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { insideRoot } from '../../skills/video-capture/scripts/capture.mjs';
import { isMain } from '../../lib/cli.mjs';

test('AC-XP-04: capture serveDir keeps requests inside the served folder with Windows paths (case-insensitive, drive roots)', () => {
  const w = path.win32;
  assert.equal(insideRoot('C:\\Site', 'C:\\Site\\index.html', w), true);
  assert.equal(insideRoot('C:\\Site', 'c:\\site\\css\\a.css', w), true, 'drive letter and folder case differ');
  assert.equal(insideRoot('C:\\Site\\', 'C:\\Site\\index.html', w), true, 'a trailing separator on the root');
  assert.equal(insideRoot('C:\\', 'C:\\index.html', w), true, 'a drive root');
  assert.equal(insideRoot('C:\\', 'D:\\index.html', w), false, 'another drive');
  assert.equal(insideRoot('C:\\Site', 'C:\\Site2\\index.html', w), false, 'a sibling with the same prefix');
  assert.equal(insideRoot('C:\\Site', 'C:\\Site\\..\\secret.txt', w), false, 'a .. escape');
  assert.equal(insideRoot('C:\\Site', 'C:\\Site', w), false, 'the folder itself is not a file inside it');
  const p = path.posix;
  assert.equal(insideRoot('/srv/site', '/srv/site/a/b.html', p), true);
  assert.equal(insideRoot('/srv/site', '/srv/Site/a.html', p), false, 'POSIX stays case-sensitive');
  assert.equal(insideRoot('/srv/site', '/srv/site-2/a.html', p), false);
  assert.equal(insideRoot('/', '/a.html', p), true, 'the filesystem root');
});

test('isMain: matches the script node started with (not AC-bound)', () => {
  assert.equal(isMain(import.meta.url), true, 'node --test runs each file as its own script');
  assert.equal(isMain(new URL('../../lib/cli.mjs', import.meta.url).href), false);
});
