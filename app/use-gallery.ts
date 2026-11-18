'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {galleryRequest,listVersions,localIds,localVersion,pushVersion,saveVersions,type Version} from '../lib/studio/gallery';

export function useGallery(account:string) {
  const [items,setItems]=useState<Version[]>([]);
  const [status,setStatus]=useState('Carregando galeria…');
  const [ready,setReady]=useState<Set<string>>(new Set());
  const queue=useRef(new Map<string,Version>()), active=useRef<Promise<void>|null>(null);
  const refresh=useCallback(async () => {
    if(active.current) return active.current;
    const work=async()=>{
      try {
        const {versions}:{versions:Version[]}=await galleryRequest(account,{});
        const known=new Set(versions.map(v=>v.id));
        for(const id of known)queue.current.delete(id);
        const ids=await localIds(account).catch(()=>[] as string[]);
        const todo=new Set([...ids,...queue.current.keys()].filter(id=>!known.has(id)));
        setItems(prev=>Array.from(new Map([...versions,...prev].map(v=>[v.id,v])).values()));
        setReady(new Set(known));
        async function push(id:string,ancestors:Set<string>) {
          if(known.has(id))return;
          const row=queue.current.get(id) ?? await localVersion(account,id);
          if(!row || ancestors.has(id)) throw Error('Versão local incompleta.');
          if(row.parent && !known.has(row.parent)) await push(row.parent,new Set([...ancestors,id]));
          await pushVersion(account,row);known.add(id);queue.current.delete(id);
          setItems(prev=>prev.some(v=>v.id===id)?prev:[...prev,row]);
        }
        if(todo.size) setStatus('Sincronizando versões…');
        for(const id of todo) await push(id,new Set());
        setReady(new Set(known));setStatus('Galeria sincronizada');
      } catch(e) {
        const cached=await listVersions(account).catch(()=>[]);
        setItems(prev=>Array.from(new Map([...prev,...cached].map(v=>[v.id,v])).values()));
        setStatus('Sincronização pendente. '+(e instanceof Error?e.message:'Verifique a conexão.'));
      }
    };
    active.current=work().finally(()=>{active.current=null});
    return active.current;
  },[account]);
  useEffect(()=>{
    const wake=()=>{if(!document.hidden)void refresh()};
    const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('lume-versions-'+account);
    if(channel)channel.onmessage=wake;
    void refresh();const timer=window.setInterval(wake,45000);
    window.addEventListener('online',wake);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
    return ()=>{clearInterval(timer);window.removeEventListener('online',wake);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);channel?.close()};
  },[account,refresh]);
  async function save(rows:Version[]) {
    for(const v of rows)queue.current.set(v.id,v);
    setItems(prev=>[...prev,...rows.filter(v=>!prev.some(row=>row.id===v.id))]);
    setStatus('Sincronizando versões…');
    let cached=true;
    try {await saveVersions(account,rows)}catch{cached=false}
    await active.current;await refresh();
    if(rows.some(v=>queue.current.has(v.id))) return cached?'Salvo neste aparelho. Sincronização pendente.':'Imagem em memória. Baixe uma cópia antes de fechar.';
    if(typeof BroadcastChannel!=='undefined'){const c=new BroadcastChannel('lume-versions-'+account);c.postMessage('saved');c.close()}
    return 'Salvo na sua conta.';
  }
  return {items,status,ready,refresh,save};
}
