/** Playback is interruptible independently from recording and agent work. */
export class SpeechPlayer {
  private context = new AudioContext();
  private source?: AudioBufferSourceNode;
  resume() { return this.context.resume(); }
  stop() { this.source?.stop(); this.source = undefined; }
  async play(bytes: ArrayBuffer, signal: AbortSignal) {
    const buffer = await this.context.decodeAudioData(bytes);
    if (signal.aborted || this.context.state === 'closed') return;
    this.stop();
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.context.destination); this.source = source;
    await new Promise<void>(resolve => {
      const abort = () => { if (this.source === source) this.stop(); };
      source.onended = () => { signal.removeEventListener('abort', abort); if (this.source === source) this.source = undefined; resolve(); };
      signal.addEventListener('abort', abort, { once: true });
      source.start();
    });
  }
  close() { this.stop(); if (this.context.state !== 'closed') void this.context.close(); }
}
