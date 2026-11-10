// Output presets for standalone captures (DEC-47, web2video plan §4.6; U1 confirmed the youtube
// row, U2 1080p60 capture; DEC-51 how probe-spec checks bitrates). One table, read by
// skills/video-capture/scripts/capture.mjs (capture size, fps and the encode) and by
// lib/verify/probe-spec.mjs --preset (what a file encoded with it must show).

/**
 * capture: the viewport and fps a take records at (--viewport/--fps override them); video/audio:
 * the encode, which an override never changes. youtube is bitrate-targeted (VBR about `kbps`,
 * `highKbps` above 30 fps, peak `maxFactor` × that), with a closed GOP of half the frame rate,
 * 2 consecutive B-frames and no edit lists.
 */
export const PRESETS = {
  web: {
    capture: { width: 1280, height: 720, fps: 30 },
    video: { crf: 26, x264Preset: 'medium' },
    audio: { kbps: 128 },
  },
  youtube: {
    capture: { width: 1920, height: 1080, fps: 30 },
    video: { kbps: 8000, highKbps: 12000, maxFactor: 1.5, closedGop: true, bframes: 2, editList: false, x264Preset: 'medium' },
    audio: { kbps: 384 },
  },
  hifi: {
    capture: { width: 1920, height: 1080, fps: 60 },
    video: { crf: 16, x264Preset: 'slow' },
    audio: { kbps: 256 },
  },
};
export const DEFAULT_PRESET = 'web';

/** youtube's target video bitrate at `fps`: 8 Mbps up to 30 fps, 12 Mbps above. */
const targetKbps = (v, fps) => (fps > 30 ? v.highKbps : v.kbps);
/** A closed GOP of half the frame rate, in frames. */
const gopFrames = (fps) => Math.max(1, Math.round(fps / 2));

/**
 * The ffmpeg arguments of preset `name` at the take's fps: video (H.264 High, yuv420p), audio
 * (AAC-LC 48 kHz stereo at the preset's bitrate) and mux (faststart; no edit lists for youtube).
 */
export function presetArgs(name, fps) {
  const p = PRESETS[name];
  const v = p.video;
  const video = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', v.x264Preset];
  if (v.kbps) {
    const k = targetKbps(v, fps);
    const g = gopFrames(fps);
    // scenecut=0 keeps every GOP exactly g frames (x264 clamps min-keyint to g/2+1, so it isn't set)
    video.push('-b:v', `${k}k`, '-maxrate', `${Math.round(k * v.maxFactor)}k`, '-bufsize', `${k * 2}k`,
      '-g', String(g), '-sc_threshold', '0', '-bf', String(v.bframes),
      '-x264-params', `open-gop=0:b-adapt=0:bframes=${v.bframes}:scenecut=0:keyint=${g}:cabac=1:interlaced=0`);
  } else {
    video.push('-crf', String(v.crf));
  }
  const audio = ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', `${p.audio.kbps}k`, '-ar', '48000', '-ac', '2'];
  // no edit lists: B-frame reordering then goes in negative composition offsets (ctts v1), so the
  // picture still starts at 0 with the audio instead of two frames late. The AAC encoder delay
  // (AAC_PRIMING_SAMPLES) is normally trimmed by an edit list too; without one, the first
  // AAC_PRIMING_SAMPLES of the mix are dropped before encoding, so the decoded sound (priming
  // included) lines up with the picture again (WP13 verify-1 M2), then padded back to length.
  if (v.editList === false) audio.push('-af', `atrim=start_sample=${AAC_PRIMING_SAMPLES},asetpts=PTS-STARTPTS,apad`);
  const mux = v.editList === false ? ['-movflags', '+faststart+negative_cts_offsets', '-use_editlist', '0'] : ['-movflags', '+faststart'];
  return { video, audio, mux };
}

/** ffmpeg's AAC encoder delay: 1024 samples (21.3 ms at 48 kHz) of priming before the first input sample. */
export const AAC_PRIMING_SAMPLES = 1024;

/** One line describing a preset, for --help. */
export function presetSummary(name) {
  const { capture: c, video: v, audio: a } = PRESETS[name];
  const enc = v.kbps
    ? `VBR ~${v.kbps / 1000} Mbps (${v.highKbps / 1000} above 30 fps, peak ×${v.maxFactor}), CABAC, closed GOP of half the fps, ${v.bframes} B-frames, progressive, no edit lists`
    : `CRF ${v.crf}, x264 ${v.x264Preset}`;
  return `${c.width}x${c.height} @ ${c.fps} fps; ${enc}; audio ${a.kbps} kbps`;
}

/**
 * What a file encoded with preset `name` shows to ffprobe at the take's fps and size (--viewport
 * and --fps change those, never the encode). probe-spec --preset checks against it.
 */
export function presetExpect(name, { fps, width, height } = {}) {
  const p = PRESETS[name];
  if (!p) return null;
  const f = fps ?? p.capture.fps;
  const e = { preset: name, width: width ?? p.capture.width, height: height ?? p.capture.height, fps: f, audioKbps: p.audio.kbps, channels: 2, sampleRate: 48000 };
  if (p.video.kbps) {
    const k = targetKbps(p.video, f);
    Object.assign(e, { videoKbps: k, videoMaxKbps: Math.round(k * p.video.maxFactor), gop: gopFrames(f), closedGop: p.video.closedGop, bframes: p.video.bframes, editList: p.video.editList });
  }
  return e;
}
