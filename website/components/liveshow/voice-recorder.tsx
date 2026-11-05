'use client';
import { useEffect, useRef, useState } from 'react';
import { openMicrophone, type MicrophoneRecording } from '@/lib/microphone';
import { SpeechPlayer } from '@/lib/speech-player';

type Props = { disabled: boolean; supported: boolean; api: string; onInterrupt: () => void; onTranscript: (text: string, signal: AbortSignal) => Promise<{ text: string; verified: boolean }> };
type Session = { controller: AbortController; recording?: MicrophoneRecording; released: boolean; finishing: boolean; limit?: ReturnType<typeof setTimeout> };
export function VoiceRecorder({ disabled, supported, api, onInterrupt, onTranscript }: Props) {
  const [holding, setHolding] = useState(false);
  const [status, setStatus] = useState('Hold to speak, release to send');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [speak, setSpeak] = useState(true);
  const speakRef = useRef(true);
  const current = useRef<Session | null>(null);
  const player = useRef<SpeechPlayer | null>(null);
  const callback = useRef(onTranscript);
  useEffect(() => { callback.current = onTranscript; });
  useEffect(() => () => { current.current?.controller.abort(); current.current?.recording?.cancel(); clearTimeout(current.current?.limit); player.current?.close(); }, []);
  function cancel() {
    const session = current.current; current.current = null;
    session?.controller.abort(); session?.recording?.cancel(); clearTimeout(session?.limit); player.current?.stop();
    setHolding(false); setStatus('Hold to speak, release to send');
  }
  async function finish(session: Session) {
    if (session.finishing || !session.recording || current.current !== session) return;
    session.finishing = true; clearTimeout(session.limit);
    const signal = session.controller.signal;
    try {
      const audio = await session.recording.stop();
      if (signal.aborted) return;
      setStatus('Transcribing…');
      const response = await fetch(`${api}/transcribe/`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Voice transcription failed.');
      if (signal.aborted) return;
      setTranscript(result.text); setStatus('Updating chart…');
      const outcome = await callback.current(result.text, signal);
      if (signal.aborted) return;
      setReply(outcome.text);
      if (!outcome.verified || !outcome.text || !speakRef.current) { setStatus('Text response ready'); return; }
      setStatus('Preparing voice reply…');
      const speech = await fetch(`${api}/speech/`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: outcome.text }) });
      if (!speech.ok) { const failure = await speech.json(); throw new Error(failure.error || 'Voice reply failed; the text remains available.'); }
      const bytes = await speech.arrayBuffer();
      if (signal.aborted) return;
      if (!speakRef.current) { setStatus('Text response ready'); return; }
      setStatus('Speaking result · hold again to interrupt');
      await player.current?.play(bytes, signal);
      if (!signal.aborted) setStatus('Hold to speak, release to send');
    } catch (reason) {
      if (!signal.aborted) { setError(reason instanceof Error ? reason.message : 'Voice request failed.'); setStatus('Hold to try again'); }
    }
  }
  function release() {
    const session = current.current; if (!session || session.released) return;
    session.released = true; setHolding(false); setStatus('Preparing audio…');
    void finish(session);
  }
  async function start() {
    if (disabled || !supported || (current.current && !current.current.released)) return;
    cancel(); onInterrupt(); setError(''); setTranscript(''); setReply(''); setHolding(true); setStatus('Allow microphone access…');
    if (!player.current) player.current = new SpeechPlayer();
    void player.current.resume().catch(() => {});
    const session: Session = { controller: new AbortController(), released: false, finishing: false }; current.current = session;
    try {
      const recording = await openMicrophone(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/microphone-worklet.js`, session.controller.signal);
      if (current.current !== session || session.controller.signal.aborted) { recording.cancel(); return; }
      session.recording = recording;
      if (session.released) { void finish(session); return; }
      setStatus('● Listening · release to send');
      session.limit = setTimeout(release, 30000);
    } catch (reason) {
      if (!session.controller.signal.aborted) { cancel(); setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Microphone access was denied. Allow it in your browser, or type your request.' : reason instanceof Error ? reason.message : 'Microphone could not start.'); }
    }
  }
  return <section className="live-voice" aria-label="Voice input"><div>
    <button type="button" className={`pg-tool ${holding ? 'pg-tool-primary' : ''}`} style={{ touchAction: 'none', userSelect: 'none' }} disabled={disabled || !supported} aria-pressed={holding} aria-label="Hold to speak"
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); void start(); }}
      onPointerUp={release} onLostPointerCapture={release} onPointerCancel={cancel} onContextMenu={event => event.preventDefault()}
      onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); void start(); } }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release(); } }}>
      {holding ? 'Release to send' : 'Hold to speak'}
    </button>
    <label><input type="checkbox" checked={speak} onChange={event => { speakRef.current = event.target.checked; setSpeak(event.target.checked); if (!event.target.checked) player.current?.stop(); }} /> Voice replies</label>
    <span aria-live="polite" aria-label="Microphone status">{status}</span>
  </div><p>Audio is sent after release · up to 30 seconds · AI-generated voice replies</p>{transcript && <p aria-label="Voice transcript">{transcript}</p>}{reply && <p aria-label="Voice reply text">{reply}</p>}{error && <p role="alert">{error}</p>}</section>;
}
