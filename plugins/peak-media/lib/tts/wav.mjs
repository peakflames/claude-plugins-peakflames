// Raw PCM <-> WAV (DEC-03: OpenRouter /audio/speech returns headerless s16le PCM).

/** Wrap s16le (or other bit depth) PCM in a 44-byte RIFF/WAVE header. */
export function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bits = 16 } = {}) {
  const block = channels * (bits / 8);
  const len = pcm.length - (pcm.length % block); // drop a trailing partial sample
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'latin1');
  h.writeUInt32LE(36 + len, 4);
  h.write('WAVE', 8, 'latin1');
  h.write('fmt ', 12, 'latin1');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * block, 28);
  h.writeUInt16LE(block, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36, 'latin1');
  h.writeUInt32LE(len, 40);
  return Buffer.concat([h, pcm.subarray(0, len)]);
}

/** Parse a WAV header: {sampleRate, channels, bits, dataBytes, durationMs}; throws on non-WAV. */
export function wavInfo(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let pos = 12, fmt = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      fmt = { channels: buf.readUInt16LE(pos + 10), sampleRate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk');
      const dataBytes = Math.min(size, buf.length - pos - 8);
      const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bits / 8);
      return { ...fmt, dataBytes, durationMs: Math.round((dataBytes / bytesPerSec) * 1000) };
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
