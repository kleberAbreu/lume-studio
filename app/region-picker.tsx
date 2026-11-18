'use client';
import {useEffect, useRef, useState} from 'react';
import type {PointerEvent} from 'react';
import {rectangle, type Point, type Region} from '../lib/studio/region';

type Props = {blob: Blob; region: Region | null; disabled: boolean; onChange: (value: Region | null) => void};

export function RegionPicker({blob, region, disabled, onChange}: Props) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState({width: 0, height: 0});
  const [draft, setDraft] = useState<Region | null>(null);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{id: number; start: Point} | null>(null);
  useEffect(() => {
    const src = URL.createObjectURL(blob);
    setUrl(src);
    setSize({width: 0, height: 0});
    setFailed(false);
    setDraft(null);
    drag.current = null;
    return () => URL.revokeObjectURL(src);
  }, [blob]);
  function point(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const bound = (v: number, max: number) => Math.round(Math.max(0, Math.min(1, v)) * max);
    return {x: bound((e.clientX - box.left) / box.width, size.width), y: bound((e.clientY - box.top) / box.height, size.height)};
  }
  function cancel() { drag.current = null; setDraft(null); }
  const box = draft ?? region;
  return <div className="region-picker">
    <div className="field-title"><strong>Área de edição</strong>{region && <button className="idea" type="button" disabled={disabled} onClick={() => onChange(null)}>Limpar seleção</button>}</div>
    <p>Arraste sobre a foto para marcar o trecho que deseja editar.</p>
    <div className="region-preview"><div className="region-surface"
      onPointerDown={e => {
        if (disabled || !size.width || !e.isPrimary || e.button !== 0) return;
        const start = point(e);
        drag.current = {id: e.pointerId, start};
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraft(rectangle(start, start));
      }}
      onPointerMove={e => {if (drag.current?.id === e.pointerId) setDraft(rectangle(drag.current.start, point(e)));}}
      onPointerUp={e => {
        if (drag.current?.id !== e.pointerId) return;
        const next = rectangle(drag.current.start, point(e));
        if (next.width && next.height) onChange(next);
        cancel();
      }}
      onLostPointerCapture={cancel} onPointerCancel={cancel}>
      {url && <img src={url} alt="Foto para selecionar a área de edição" draggable={false}
        onLoad={e => setSize({width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight})}
        onError={() => setFailed(true)} />}
      {box && size.width > 0 && <span className="region-box" style={{
        left: box.x / size.width * 100 + '%', top: box.y / size.height * 100 + '%',
        width: box.width / size.width * 100 + '%', height: box.height / size.height * 100 + '%'
      }}/>}
    </div></div>
    <small aria-live="polite">{failed ? 'Não foi possível abrir a prévia.' : region ? 'Área selecionada · ' + region.width + ' × ' + region.height + ' px' : 'Imagem inteira'}</small>
  </div>;
}
