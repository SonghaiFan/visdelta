/* Microphone capture only: no audio is copied to the output speakers. */
class MicrophoneCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.port.onmessage = event => { if (event.data === 'flush') { this.flush(); this.port.postMessage({ type: 'flushed' }); } };
  }
  flush() {
    if (!this.samples.length) return;
    const data = new Float32Array(this.samples);
    this.port.postMessage({ type: 'samples', data }, [data.buffer]); this.samples = [];
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) for (let i = 0; i < channels[0].length; i++) {
      let sample = 0; for (const channel of channels) sample += channel[i] / channels.length;
      this.samples.push(sample);
    }
    if (this.samples.length >= 2048) this.flush();
    return true;
  }
}
registerProcessor('microphone-capture', MicrophoneCapture);
