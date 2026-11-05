import { AIError } from './ai.mjs';
import { validateVoiceInput } from './voice.mjs';

export function wavFromVoice(input) {
  const voice = validateVoiceInput(input), pcm = Buffer.from(voice.data, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
export async function transcribeSpeech(input, { key, signal, fetchImpl = fetch } = {}) {
  if (!key?.trim()) throw new AIError(503, 'Add OPENAI_API_KEY and restart.');
  const form = new FormData(); form.set('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe');
  form.set('file', new Blob([wavFromVoice(input.audio)], { type: 'audio/wav' }), 'request.wav');
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal });
  if (!response.ok) throw new AIError(502, 'Voice transcription failed. Check OpenAI access or try typing.');
  const result = await response.json();
  if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 2000) throw new AIError(422, 'No usable speech was recognized. Please try again.');
  return { text: result.text.trim() };
}
export async function synthesizeSpeech(input, { key, signal, fetchImpl = fetch } = {}) {
  if (!key?.trim()) throw new AIError(503, 'Add OPENAI_API_KEY and restart.');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1200) throw new AIError(400, 'Speech needs a short result of at most 1200 characters.');
  const response = await fetchImpl('https://api.openai.com/v1/audio/speech', { method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice: 'coral', input: input.text, instructions: 'Read the provided result clearly and briefly in its original language. Do not add any words or claims.', response_format: 'mp3' }) });
  if (!response.ok) throw new AIError(502, 'Voice reply failed. The text result is still available.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 2_000_000) throw new AIError(502, 'Voice reply was incomplete. The text result is still available.');
  return bytes;
}
