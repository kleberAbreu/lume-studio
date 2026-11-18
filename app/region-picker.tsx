'use client';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {PointerEvent} from 'react';
import {canvasContext, emptySelection, renderLayer, type Mark, type Selection, type Tool} from '../lib/studio/paint';

type Props = {blob: Blob; region: Selection|null; disabled: boolean; onChange: (value: Selection|null) => void};
const tools = {rectangle:'Retângulo', edit:'Pincel', protect:'Proteger', erase:'Borracha', pan:'Mover'};

export function RegionPicker({blob, region, disabled, onChange}: Props) {
  const {marks, feather} = region ?? emptySelection;
  const [tool, setTool] = useState<Tool|'pan'>('rectangle');
  const [zoom, setZoom] = useState(1), [diameter, setDiameter] = useState(30);
  const [url,setUrl] = useState(''), [failed,setFailed] = useState(false);
  const [size,setSize] = useState({w:0,h:0}), [viewport,setViewport] = useState(1);
  const [draft,setDraft] = useState<Mark|null>(null);
  const gesture = useRef<{id:number; mark:Mark|null; x:number; y:number; left:number; top:number}|null>(null);
  const overlay=useRef<HTMLCanvasElement>(null), scroller=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const src=URL.createObjectURL(blob); setUrl(src); setFailed(false); setSize({w:0,h:0}); setZoom(1);
    gesture.current=null; setDraft(null);
    return ()=>URL.revokeObjectURL(src);
  },[blob]);
  useLayoutEffect(()=>{
    const el=scroller.current!;
    const observer=new ResizeObserver(()=>setViewport(el.clientWidth));
    observer.observe(el); setViewport(el.clientWidth); return ()=>observer.disconnect();
  },[]);
  const fit=size.w ? Math.min(viewport/size.w, 360/size.h) : 1;
  const width=Math.max(1,Math.round(size.w*fit*zoom)), height=Math.max(1,Math.round(size.h*fit*zoom));
  useLayoutEffect(()=>{
    const ctx=overlay.current?.getContext('2d');
    if (!ctx || !size.w) return;
    const strokes=draft ? [...marks,draft] : marks;
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,width,height);
    ctx.scale(width/size.w,height/size.h);
    renderLayer(ctx,strokes,false,'#bf7fff');
    const guard=canvasContext(width,height);
    guard.scale(width/size.w,height/size.h);
    renderLayer(guard,strokes,true,'#46ecc1');
    ctx.setTransform(1,0,0,1,0,0); ctx.drawImage(guard.canvas,0,0);
  },[marks,draft,width,height,size]);
  function point(e:PointerEvent<HTMLDivElement>) {
    const box=e.currentTarget.getBoundingClientRect();
    return {x:Math.round(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*size.w),
      y:Math.round(Math.max(0,Math.min(1,(e.clientY-box.top)/box.height))*size.h)};
  }
  function move(e:PointerEvent<HTMLDivElement>) {
    const g=gesture.current;
    if (!g || g.id!==e.pointerId) return;
    if (!g.mark) {
      scroller.current!.scrollTo(g.left+g.x-e.clientX,g.top+g.y-e.clientY);
      return;
    }
    const p=point(e), points=g.mark.points, last=points[points.length-1];
    if (last.x===p.x && last.y===p.y) return;
    g.mark={...g.mark,points:g.mark.tool==='rectangle'?[points[0],p]:[...points,p]};
    setDraft(g.mark);
  }
  function cancel(){gesture.current=null;setDraft(null);}
  function update(next:Mark[]){onChange(next.length?{marks:next,feather}:null);}
  return <fieldset className="mask-editor" disabled={disabled}><legend>Área de edição</legend>
    <div className="mask-tools">{(Object.keys(tools) as (keyof typeof tools)[]).map(t=>
      <button type="button" key={t} aria-pressed={tool===t} onClick={()=>setTool(t)}>{tools[t]}</button>)}</div>
    <div className="mask-controls"><label>Zoom {zoom}× <input type="range" min="1" max="4" step=".5" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label>
    {tool!=='rectangle' && tool!=='pan' && <label>Tamanho {diameter} px <input type="range" min="1" max="200" value={diameter} onChange={e=>setDiameter(+e.target.value)}/></label>}</div>
    <div ref={scroller} className="mask-scroll"><div className="mask-photo" style={{width,height,cursor:tool==='pan'?'grab':'crosshair'}}
      onPointerDown={e=>{
        if (disabled || !size.w || !e.isPrimary || e.button!==0) return;
        const mark=tool==='pan'?null:{tool,diameter,points:[point(e)]};
        gesture.current={id:e.pointerId,mark,x:e.clientX,y:e.clientY,left:scroller.current!.scrollLeft,top:scroller.current!.scrollTop};
        e.currentTarget.setPointerCapture(e.pointerId); setDraft(mark);
      }} onPointerMove={move} onLostPointerCapture={cancel} onPointerCancel={cancel}
      onPointerUp={e=>{
        if (gesture.current?.id!==e.pointerId) return;
        move(e); const mark=gesture.current.mark;
        if (mark && (mark.tool!=='erase' || marks.length)) {
          const a=mark.points[0], b=mark.points[mark.points.length-1];
          if (mark.tool!=='rectangle' || (a.x!==b.x && a.y!==b.y)) update([...marks,mark]);
        }
        cancel();
      }}>
      {url && <img src={url} alt="Foto para marcar" draggable={false} onError={()=>setFailed(true)}
        onLoad={e=>setSize({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})}/>}
      <canvas ref={overlay} width={width} height={height} aria-hidden="true"/>
    </div></div>
    <small>{failed?'Não foi possível abrir a prévia.':marks.length?'Roxo · editar　 Verde · proteger':'Arraste para selecionar ou pintar. Sem marcas, a edição usa a foto inteira.'}</small>
    {marks.some(m=>m.tool==='protect') && !marks.some(m=>m.tool==='edit'||m.tool==='rectangle') && <small>A edição pode alterar toda a foto fora da proteção.</small>}
    <div className="mask-controls"><label>Borda suave {feather} px <input type="range" min="0" max="40" disabled={!marks.length} value={feather} onChange={e=>onChange({marks,feather:+e.target.value})}/></label>
    <button type="button" disabled={!marks.length} onClick={()=>update(marks.slice(0,-1))}>Desfazer traço</button>
    <button type="button" disabled={!marks.length} onClick={()=>onChange(null)}>Limpar seleção</button></div>
  </fieldset>;
}
