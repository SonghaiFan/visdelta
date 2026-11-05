import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVoiceInput } from '../../website/server/liveshow/voice.mjs';
import { pcm16, encodeVoice } from '../../website/lib/voice-audio.ts';
const samples = new Float32Array(6000).fill(0.2);
test('browser PCM is signed little-endian, clipped, bounded and accepted by voice input', () => {
 samples[0] = -2; samples[1] = 2;
 const pcm = pcm16(samples); const view = new DataView(pcm.buffer);
 assert.equal(view.getInt16(0, true), -32768); assert.equal(view.getInt16(2, true), 32767);
 const audio = encodeVoice(samples);
 assert.equal(validateVoiceInput(audio), audio);
 assert.equal(Buffer.from(audio.data, 'base64').length, samples.length * 2);
 assert.throws(() => pcm16(new Float32Array(20)), /between/);
 assert.throws(() => pcm16(new Float32Array(720001)), /between/);
 assert.throws(() => pcm16(new Float32Array(6000)), /No microphone audio/);
});
test('malformed formats, overlong and truncated voice payloads fail before model access', () => {
 const input = encodeVoice(samples);
 for (const bad of [{ ...input, sampleRate: 48000 }, { ...input, channels: 2 }, { ...input, format: 'mp3' }, { ...input, data: '!invalid' }, { ...input, data: Buffer.alloc(11).toString('base64') }, { ...input, data: 'A'.repeat(1920004) }]) assert.throws(() => validateVoiceInput(bad));
});
