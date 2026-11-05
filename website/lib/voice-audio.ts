export type VoiceInput = { format: 'pcm16'; sampleRate: 24000; channels: 1; data: string };

/** Clamp and encode little-endian signed PCM, with bounded allocation. */
export function pcm16(samples: Float32Array): Uint8Array {
  if (samples.length < 4800 || samples.length > 720000) throw new Error('Record between 0.2 and 30 seconds.');
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    peak = Math.max(peak, Math.abs(sample));
    view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  if (peak < 0.0001) throw new Error('No microphone audio detected. Check the selected microphone and try again.');
  return bytes;
}
export function encodeVoice(samples: Float32Array): VoiceInput {
  const bytes = pcm16(samples);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { format: 'pcm16', sampleRate: 24000, channels: 1, data: btoa(binary) };
}
