'use client';
import {useEffect, useRef, useState} from 'react';
import {defaultFrame, formats, framePlacement, type Frame, type FrameMode} from '../lib/studio/framing';
import {LoaderCircle} from 'lucide-react';

type Props = {
  blob: Blob; busy: boolean; error: string;
  onApply: (frame: Frame, needsAI: boolean) => void;
};

export function FrameEditor({blob, busy, error, onApply}: Props) {
  const [frame, setFrame] = useState(defaultFrame);
  const [url, setUrl] = useState('');
  const [source, setSource] = useState({width:0, height:0});
  const [failed, setFailed] = useState(false);
  const drag = useRef<{id:number; left:number; top:number; x:number; y:number} | null>(null);
  useEffect(() => {
    const src = URL.createObjectURL(blob);
    setUrl(src);
    return () => URL.revokeObjectURL(src);
  }, [blob]);
  const target = formats[frame.format];
  const rect = source.width ? framePlacement(source, frame) : null;
  const dx = target.width - (rect?.width ?? target.width);
  const dy = target.height - (rect?.height ?? target.height);
  const needsAI = frame.mode === 'expand' && (dx > 0 || dy > 0);
  function changeMode(mode: FrameMode) {
    setFrame({...defaultFrame, format:frame.format, mode});
  }
  const clamp = (value:number) => Math.max(0, Math.min(1, value));
  return <fieldset className="frame-editor" disabled={busy}>
    <label>Formato de saída
      <select value={frame.format} onChange={e => setFrame({...frame, format:e.target.value as Frame['format'], x:.5, y:.5})}>
        {Object.entries(formats).map(([id, f]) => <option key={id} value={id}>{f.label} · {f.width} × {f.height}</option>)}
      </select>
    </label>
    <div className="frame-modes">
      <button type="button" aria-pressed={frame.mode==='crop'} onClick={() => changeMode('crop')}>Recortar</button>
      <button type="button" aria-pressed={frame.mode==='expand'} onClick={() => changeMode('expand')}>Expandir com IA</button>
    </div>
    <div className="frame-stage" style={{aspectRatio:target.width/target.height, maxWidth:360*target.width/target.height}}
      onPointerDown={e => {
        if (busy || !rect || !e.isPrimary || e.button!==0) return;
        drag.current = {id:e.pointerId, left:e.clientX, top:e.clientY, x:frame.x, y:frame.y};
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        const start = drag.current;
        if (!start || e.pointerId!==start.id || busy) return;
        const box = e.currentTarget.getBoundingClientRect();
        setFrame(prev => ({...prev,
          x:dx ? clamp(start.x + (e.clientX-start.left)*target.width/(box.width*dx)) : prev.x,
          y:dy ? clamp(start.y + (e.clientY-start.top)*target.height/(box.height*dy)) : prev.y}));
      }}
      onLostPointerCapture={() => {drag.current=null}}>
      {url && <img src={url} alt="Prévia do enquadramento" draggable={false}
        onLoad={e => setSource({width:e.currentTarget.naturalWidth, height:e.currentTarget.naturalHeight})}
        onError={() => setFailed(true)}
        style={rect ? {left:100*rect.x/target.width+'%', top:100*rect.y/target.height+'%',
          width:100*rect.width/target.width+'%', height:100*rect.height/target.height+'%'} : {visibility:'hidden'}}/>}
    </div>
    <p>{frame.mode==='crop' ? 'Arraste a foto para escolher o recorte.' : 'Arraste a foto. A IA preenche as margens quadriculadas.'}</p>
    <div className="frame-adjust">
      <label>Escala · {Math.round(frame.scale*100)}%
        <input type="range" min={frame.mode==='crop'?100:35} max={frame.mode==='crop'?250:100}
          value={Math.round(frame.scale*100)} onChange={e => setFrame({...frame, scale:+e.target.value/100})}/>
      </label>
      <label>Posição horizontal<input type="range" min="0" max="100" disabled={!dx}
        value={Math.round(frame.x*100)} onChange={e => setFrame({...frame, x:+e.target.value/100})}/></label>
      <label>Posição vertical<input type="range" min="0" max="100" disabled={!dy}
        value={Math.round(frame.y*100)} onChange={e => setFrame({...frame, y:+e.target.value/100})}/></label>
    </div>
    {(failed || error) && <p className="error" role="alert">{failed?'Não foi possível abrir a foto.':error}</p>}
    <button type="button" className="primary" disabled={busy || !rect || failed}
      onClick={() => onApply(frame, needsAI)}>{busy && <LoaderCircle className="spin"/>}
      {busy?'Preparando imagem…':needsAI?'Preencher margens com IA':frame.mode==='crop'?'Salvar recorte':'Salvar enquadramento'}
    </button>
  </fieldset>;
}
