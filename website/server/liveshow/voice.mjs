import { AIError } from './ai.mjs';

export function validateVoiceInput(input) {
  if (!input || input.format !== 'pcm16' || input.sampleRate !== 24000 || input.channels !== 1 || typeof input.data !== 'string'
    || input.data.length > 1_920_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new AIError(400, 'Voice input must be mono PCM16 at 24 kHz, up to 30 seconds.');
  const bytes = Buffer.from(input.data, 'base64');
  if (bytes.length < 9600 || bytes.length % 2 || bytes.toString('base64') !== input.data) throw new AIError(400, 'Record at least 0.2 seconds of valid microphone audio.');
  return input;
}
