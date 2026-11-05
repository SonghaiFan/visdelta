import test from 'node:test';
import assert from 'node:assert/strict';
import { wavFromVoice, transcribeSpeech, synthesizeSpeech } from '../../website/server/liveshow/speech.mjs';
const audio = { format: 'pcm16', sampleRate: 24000, channels: 1, data: Buffer.alloc(12000, 3).toString('base64') };
test('STT sends a real WAV with bounded PCM in multipart form and returns plain text', async () => {
 const wav = wavFromVoice(audio);
 assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(40), 12000);
 const result = await transcribeSpeech({ audio }, { key: 'fake-only', fetchImpl: async (url, init) => {
  assert.match(url, /audio\/transcriptions$/); assert.equal(init.body.get('model'), 'gpt-transcribe');
  assert.equal(init.body.get('file').type, 'audio/wav'); return Response.json({ text: 'Show profit.' });
 } });
 assert.deepEqual(result, { text: 'Show profit.' });
});
test('TTS speaks exactly the supplied verified text, with no summarizer', async () => {
 const text = 'Profit applied.';
 const bytes = await synthesizeSpeech({ text }, { key: 'fake-only', fetchImpl: async (url, init) => {
  assert.match(url, /audio\/speech$/); assert.equal(JSON.parse(init.body).input, text);
  assert.equal(JSON.parse(init.body).response_format, 'mp3'); return new Response(Buffer.from('fake-audio'));
 } });
 assert.equal(bytes.toString(), 'fake-audio');
 await assert.rejects(synthesizeSpeech({ text: 'x'.repeat(1201) }, { key: 'fake-only' }), /short result/);
});
test('empty transcripts and provider failures do not expose raw provider bodies', async () => {
 await assert.rejects(transcribeSpeech({ audio }, { key: 'fake-only', fetchImpl: async () => Response.json({ text: '' }) }), /No usable speech/);
 await assert.rejects(synthesizeSpeech({ text: 'Done.' }, { key: 'fake-only', fetchImpl: async () => new Response('secret-provider-body', { status: 500 }) }), error => !error.message.includes('secret-provider-body'));
});
