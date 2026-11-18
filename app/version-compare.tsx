'use client';
import {useEffect,useRef,useState} from 'react';

export function VersionCompare({before,after}:{before:Blob;after:Blob}) {
  const [urls,setUrls]=useState<string[]>([]), [split,setSplit]=useState(50), [zoom,setZoom]=useState(1);
  const frame=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const pair=[URL.createObjectURL(before),URL.createObjectURL(after)];
    setUrls(pair); return ()=>pair.forEach(URL.revokeObjectURL);
  },[before,after]);
  function slide(clientX:number){
    const box=frame.current!.getBoundingClientRect();
    setSplit(Math.max(0,Math.min(100,100*(clientX-box.left)/box.width)));
  }
  return <>
    <div className="compare-labels"><strong>Antes · versão anterior</strong><strong>Depois · versão escolhida</strong></div>
    <div className="compare-scroll"><div ref={frame} className="compare-frame" style={{width:zoom*100+'%'}}>
      {urls.length===2 && <><img src={urls[1]} alt="Depois"/><div className="compare-before" style={{clipPath:'inset(0 '+(100-split)+'% 0 0)'}}><img src={urls[0]} alt="Antes"/></div></>}
      <div role="slider" aria-label="Divisória antes e depois" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} tabIndex={0}
        className="compare-handle" style={{left:split+'%'}}
        onKeyDown={e=>{const changes:Record<string,number>={ArrowLeft:split-1,ArrowRight:split+1,Home:0,End:100};if(e.key in changes){e.preventDefault();setSplit(Math.max(0,Math.min(100,changes[e.key])));}}}
        onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);slide(e.clientX);}}
        onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))slide(e.clientX);}}><span>↔</span></div>
    </div></div>
    <div className="mask-controls"><label>Divisória <input type="range" min="0" max="100" value={split} onChange={e=>setSplit(+e.target.value)}/></label>
      <label>Zoom {zoom}× <input type="range" min="1" max="4" step=".5" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label></div>
  </>;
}
