// plate-factory live plates (WP15): F3's three live plates, each storyboard one beat('<plate beat>', fn),
// captured with `capture --plates --plate <id>` (no --preset) against a local page, then loaded by
// video-assemble. Real-time captures: run this file alone.
import { test, after } from '../helpers/suite.mjs';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { run, tmpDir } from '../helpers/run.mjs';
import { CAPTURE, F3, LOCAL_PAGE, makeF3Project } from '../video-capture/helpers/projects.mjs';
import { framesFor } from '../../skills/video-capture/scripts/capture.mjs';
import { loadProject, checkRenders } from '../../skills/video-assemble/scripts/assemble.mjs';

const tmp = tmpDir('pm-live-plates-');
after(() => rmSync(tmp, { recursive: true, force: true }));

function streams(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames,r_frame_rate,width,height', '-of', 'json', file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).streams;
}

test('AC-W2V-39: F3 live plates on beat() capture to durationMs ±1 frame, picture-only, and assemble accepts them', async () => {
  const proj = makeF3Project(path.join(tmp, 'f3'), { url: LOCAL_PAGE });
  const { fps, width, height } = proj.plates;
  const tol = 1000 / fps;
  assert.equal(proj.plates.plates.length, 3);
  for (const p of proj.plates.plates) {
    // the plate's storyboard is a beat() storyboard for exactly its beat
    const src = readFileSync(path.join(F3, path.basename(p.live.storyboard)), 'utf8');
    assert.match(src, new RegExp(`\\bbeat\\('${p.beat}',`), `${p.id}: storyboard calls beat('${p.beat}', fn)`);

    const r = run(CAPTURE, ['--plates', proj.platesFile, '--plate', p.id, '--json'], { network: true });
    assert.equal(r.code, 0, `${p.id}: ${r.stderr}`);
    const take = JSON.parse(r.stdout);
    assert.deepEqual(take.beats.map((b) => b.id), [p.beat], `${p.id}: ran its plate's beat`);

    const out = path.join(proj.dir, 'renders', 'plates', `${p.id}.mp4`);
    const ss = streams(out);
    assert.deepEqual(ss.map((s) => s.codec_type), ['video'], `${p.id}: picture-only (no audio stream)`);
    const v = ss[0];
    const [a, b] = v.r_frame_rate.split('/').map(Number);
    const ms = (Number(v.nb_read_frames) / (a / b)) * 1000;
    assert.ok(Math.abs(ms - p.durationMs) <= tol + 0.5, `${p.id}: ${ms.toFixed(1)} ms vs durationMs ${p.durationMs} (±1 frame)`);
    assert.equal(Number(v.nb_read_frames), framesFor(p.durationMs, fps), `${p.id}: frame count`);
    assert.deepEqual([v.width, v.height], [width, height], `${p.id}: plates.json size`);
  }
  const plan = await loadProject(proj.platesFile);
  const renders = checkRenders(plan, path.join(proj.dir, 'renders', 'plates'));
  assert.equal(renders.length, 3, 'checkRenders accepts all three live plates');
});
