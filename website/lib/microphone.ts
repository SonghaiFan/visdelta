import { encodeVoice, type VoiceInput } from './voice-audio';
export type MicrophoneRecording = { stop(): Promise<VoiceInput>; cancel(): void };

export async function openMicrophone(workletUrl: string, signal: AbortSignal): Promise<MicrophoneRecording> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Microphone requires localhost or HTTPS in a supported browser.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let worklet: AudioWorkletNode | undefined;
  let stopped = false;
  let chunks: Float32Array[] = [];
  let count = 0;
  let flushed: (() => void) | undefined;
  const cancel = () => {
    stopped = true; stream.getTracks().forEach(track => track.stop());
    source?.disconnect(); worklet?.disconnect(); worklet?.port.close();
    if (context && context.state !== 'closed') void context.close();
    signal.removeEventListener('abort', cancel);
    chunks = [];
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw new Error('Microphone recording cancelled.');
    context = new AudioContext();
    await context.audioWorklet.addModule(workletUrl);
    if (signal.aborted) throw new Error('Microphone recording cancelled.');
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, 'microphone-capture');
    worklet.port.onmessage = event => {
      if (event.data.type === 'flushed') { flushed?.(); return; }
      const data = event.data.data as Float32Array;
      if (!stopped && data instanceof Float32Array && count + data.length <= context!.sampleRate * 30) { chunks.push(data); count += data.length; }
    };
    source.connect(worklet); worklet.connect(context.destination); await context.resume();
    return {
      cancel,
      async stop() {
        if (stopped || signal.aborted) throw new Error('Microphone recording cancelled.');
        try {
          await new Promise<void>(resolve => { const timeout = setTimeout(resolve, 500); flushed = () => { clearTimeout(timeout); resolve(); }; worklet!.port.postMessage('flush'); });
          if (signal.aborted) throw new Error('Microphone recording cancelled.');
          const samples = new Float32Array(count); let offset = 0;
          for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
          const rate = context!.sampleRate;
          cancel(); // Release hardware before resampling or network access.
          if (count < rate * 0.2) throw new Error('Record at least 0.2 seconds before sending.');
          if (rate === 24000) return encodeVoice(samples);
          const offline = new OfflineAudioContext(1, Math.min(720000, Math.floor(count * 24000 / rate)), 24000);
          const buffer = offline.createBuffer(1, count, rate); buffer.copyToChannel(samples, 0);
          const player = offline.createBufferSource(); player.buffer = buffer; player.connect(offline.destination); player.start();
          const resampled = await offline.startRendering();
          if (signal.aborted) throw new Error('Microphone recording cancelled.');
          return encodeVoice(resampled.getChannelData(0));
        } finally { cancel(); }
      },
    };
  } catch (error) { cancel(); throw error; }
}
