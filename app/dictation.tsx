'use client';

import {useEffect, useRef, useState, type RefObject} from 'react';
import {LoaderCircle, Mic, RotateCcw, Square} from 'lucide-react';

type Props = {
  account: string;
  apiKey: string;
  disabled: boolean;
  area: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onActive: (active: boolean) => void;
  ensureConnected: () => boolean;
};
type Take = {
  controller: AbortController;
  recorder?: MediaRecorder;
  deadline?: ReturnType<typeof setTimeout>;
  clock?: ReturnType<typeof setInterval>;
  audio?: Blob;
  transcript?: string;
  value: string;
  cursor: number;
};
type Phase = 'idle' | 'permission' | 'recording' | 'sending' | 'retry' | 'insert';
const duration = 60;
function release(take: Take) {
  clearTimeout(take.deadline);
  clearInterval(take.clock);
  const recorder = take.recorder;
  if (recorder) {
    recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
    if (recorder.state !== 'inactive') recorder.stop();
    recorder.stream.getTracks().forEach(track => track.stop());
    take.recorder = undefined;
  }
}
function microphoneError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Permita o microfone nas configurações deste site para ditar. Você também pode digitar.';
  if (name === 'NotFoundError') return 'Nenhum microfone disponível. Conecte um microfone ou digite o pedido.';
  return 'Não foi possível gravar. Confira o microfone e tente novamente.';
}

export function Dictation({account, apiKey, disabled, area, onChange, onActive, ensureConnected}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState('');
  const [seconds, setSeconds] = useState(0);
  const current = useRef<Take | null>(null);
  useEffect(() => {
    function discard() {
      const take = current.current;
      if (!take) return;
      current.current = null;
      take.controller.abort();
      release(take);
      onActive(false);
    }
    function hide() {
      if (document.hidden && current.current?.recorder?.state === 'recording') {
        discard();
        setPhase('idle');
        setNotice('Gravação cancelada ao sair da tela.');
      }
    }
    document.addEventListener('visibilitychange', hide);
    return () => {document.removeEventListener('visibilitychange', hide); discard()};
  }, [onActive]);

  function end(message: string) {
    const take = current.current;
    current.current = null;
    if (take) {take.controller.abort(); release(take)}
    onActive(false);
    setPhase('idle');
    setNotice(message);
  }
  function insert(take: Take) {
    const field = area.current;
    if (!field || !take.transcript) return;
    const value = field.value;
    const position = take.value === value ? take.cursor : field.selectionEnd;
    const left = value.slice(0, position), right = value.slice(position);
    const prefix = left && !/\s$/.test(left) && !/^[,.;:!?)]/.test(take.transcript) ? ' ' : '';
    const suffix = right && !/^[\s,.;:!?)]/.test(right) ? ' ' : '';
    const inserted = prefix + take.transcript;
    const next = left + inserted + suffix + right;
    if (next.length > field.maxLength) {
      setPhase('insert');
      setNotice('O texto ultrapassa 12.000 caracteres. Encurte o pedido e toque em Inserir ditado.');
      return;
    }
    onChange(next);
    const caret = left.length + inserted.length;
    requestAnimationFrame(() => { if (field.isConnected && field.value === next) field.setSelectionRange(caret, caret) });
    end('Ditado inserido. Revise o texto antes de continuar.');
  }
  async function send(take: Take) {
    if (!take.audio || take.controller.signal.aborted) return;
    setPhase('sending');
    setNotice('');
    try {
      const response = await fetch('/img_editor/api/transcribe', {
        method: 'POST', headers: {'x-lume-account': account, ...(apiKey ? {'x-lume-key': apiKey} : {})},
        body: take.audio, signal: take.controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (current.current !== take) return;
      if (!response.ok || typeof result.text !== 'string' || !result.text.trim()) {
        const message = result.error || 'Não foi possível transcrever o áudio.';
        if ([400, 401, 403, 404, 409, 413, 415, 422].includes(response.status)) {end(message); return}
        throw Error(message);
      }
      take.audio = undefined;
      take.transcript = result.text.trim();
      insert(take);
    } catch (error) {
      if (current.current !== take) return;
      setPhase('retry');
      setNotice(error instanceof TypeError ? 'Falha na conexão. Você pode reenviar esta gravação.' :
        error instanceof Error ? error.message : 'Falha ao transcrever. Tente novamente.');
    }
  }
  function finish(take: Take) {
    if (take.recorder?.state !== 'recording') return;
    clearInterval(take.clock);
    clearTimeout(take.deadline);
    setPhase('sending');
    take.recorder.stop();
  }
  async function start() {
    if (current.current || disabled || !ensureConnected()) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Este navegador não permite gravar aqui. Você pode digitar o pedido.'); return;
    }
    const field = area.current;
    if (!field) return;
    const take: Take = {controller: new AbortController(), value: field.value, cursor: field.selectionEnd};
    current.current = take;
    onActive(true);
    setNotice('');
    setPhase('permission');
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: true});
      if (current.current !== take) {stream.getTracks().forEach(track => track.stop()); return}
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
      take.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {if (event.data.size) chunks.push(event.data)};
      recorder.onerror = () => {if (current.current === take) end('A gravação foi interrompida. Tente ditar novamente.')};
      recorder.onstop = () => {
        if (current.current !== take) return;
        const audio = new Blob(chunks, {type: chunks[0]?.type || recorder.mimeType});
        release(take);
        if (!audio.size) {end('A gravação ficou vazia. Tente ditar novamente.'); return}
        take.audio = audio;
        void send(take);
      };
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
        if (current.current === take && take.recorder?.state === 'recording') end('O microfone foi desconectado. Grave outro trecho.');
      }, {once: true}));
      recorder.start();
      const started = performance.now();
      setSeconds(0);
      setPhase('recording');
      take.clock = setInterval(() => setSeconds(Math.min(duration, Math.floor((performance.now() - started) / 1000))), 250);
      take.deadline = setTimeout(() => finish(take), duration * 1000);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (current.current === take) end(microphoneError(error));
    }
  }

  const take = current.current;
  return <div className="dictation">
    <div className="dictation-actions">
      {phase === 'idle' && <button type="button" disabled={disabled} onClick={start} title="Ditar em português por até 1 minuto"><Mic/>Ditar</button>}
      {phase === 'permission' && <span role="status">Aguardando microfone…</span>}
      {phase === 'recording' && take && <><button type="button" onClick={() => finish(take)}><Square/>Concluir</button>
        <span role="timer" aria-label="Tempo de gravação">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / 1:00</span></>}
      {phase === 'sending' && <span role="status"><LoaderCircle className="spin"/>Transcrevendo…</span>}
      {phase === 'retry' && take && <button type="button" onClick={() => send(take)}><RotateCcw/>Tentar novamente</button>}
      {phase === 'insert' && take && <button type="button" onClick={() => insert(take)}>Inserir ditado</button>}
      {phase !== 'idle' && <button type="button" onClick={() => end('Ditado cancelado.')}>Cancelar</button>}
    </div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
