'use client';
import {useEffect,useRef,useState} from 'react';
import type {FormEvent,ReactNode} from 'react';
import {Sparkles, PencilLine, ArrowUpRight, ArrowRight, Plus, SlidersHorizontal, Shuffle, Aperture, Check, ChevronDown, Download, History, Maximize2, LoaderCircle, KeyRound, AlignLeft, Layers3, Coins, X, Upload, Unplug, Cable, WandSparkles, Ratio, Images, PanelTop, CircleHelp} from 'lucide-react';
import {examples} from '../lib/studio/examples';
import {listVersions, saveVersions, type Version} from '../lib/studio/gallery';
import {conversationCost, costLabel, dollars, type Receipt} from '../lib/studio/costs';
import {CostPanel} from './cost-panel';
import {RegionPicker} from './region-picker';
import {prepareRegion} from '../lib/studio/region';
import type {Selection} from '../lib/studio/paint';
import {VersionCompare} from './version-compare';
import {BlobImage} from './blob-image';
import {ReferencePhotos} from './reference-photos';
import {maxUploadBytes, validImage, type ReferencePhoto} from '../lib/studio/references';
import {FrameEditor} from './frame-editor';
import {formats, renderFrame, type Frame} from '../lib/studio/framing';
type Mode='create'|'edit';
type Source={blob:Blob;name:string;version?:Version};
const dims:Record<string,string>={'1024x1024':'Quadrado (1:1)','1536x1024':'Paisagem (3:2)','1024x1536':'Retrato (2:3)'};
const qlabels:Record<string,string>={low:'Rápida',medium:'Padrão',high:'Alta'};
const date=(n:number)=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(n);
function Dialog({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close()},[]);
  return <dialog ref={ref} className={wide?'wide':''} aria-label={title} onCancel={e=>{e.preventDefault();onClose()}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><section><div className="dialog-head"><h2>{title}</h2><button className="icon-btn" aria-label="Fechar" onClick={onClose}><X size={19}/></button></div>{children}</section></dialog>;
}
function Brand(){return <span className="brand"><svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-34 32 32)" stroke="currentColor" strokeWidth="4.8" fill="none"><ellipse cx="32" cy="32" rx="11" ry="24"/><ellipse cx="32" cy="32" rx="21" ry="15"/><ellipse cx="32" cy="32" rx="25" ry="7"/></g></svg><b>Lume</b><span>Studio</span></span>}
export default function Studio({account}:{account:string}){
  const [page,setPage]=useState<'studio'|'gallery'>('studio');
  const [mode,setMode]=useState<Mode>('create');
  const [drafts,setDrafts]=useState({create:'',edit:''});
  const prompt=drafts[mode];
  const setPrompt=(value:string)=>setDrafts(x=>({...x,[mode]:value}));
  const [size,setSize]=useState('1024x1024'),[quality,setQuality]=useState('medium');
  const [reference,setReference]=useState<Source|null>(null),[print,setPrint]=useState<Source|null>(null);
  const [photos,setPhotos]=useState<ReferencePhoto[]>([]);
  const [selecting,setSelecting]=useState(false);
  const [selection,setSelection]=useState<{blob:Blob;region:Selection}|null>(null);
  const region=mode==='edit' && selection && selection.blob===reference?.blob ? selection.region : null;
  const attachment=mode==='edit'?reference:print;
  const [items,setItems]=useState<Version[]>([]),[current,setCurrent]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),lock=useRef(false);
  const [message,setMessage]=useState(''),[warning,setWarning]=useState(''),[drag,setDrag]=useState(false);
  const [apiOpen,setApiOpen]=useState(false),[help,setHelp]=useState(false),[full,setFull]=useState(false);
  const [key,setKey]=useState(''),[keyDraft,setKeyDraft]=useState(''),[serverKey,setServerKey]=useState(false);
  const [checking,setChecking]=useState(false),[connectError,setConnectError]=useState('');
  const [drawingIdea,setDrawingIdea]=useState(false);
  const ideaRequest=useRef<AbortController|null>(null),recentIdeas=useRef<string[]>([]);
  useEffect(()=>()=>{ideaRequest.current?.abort()},[mode,page]);
  const [example,setExample]=useState<number|null>(null);
  const file=useRef<HTMLInputElement>(null),area=useRef<HTMLTextAreaElement>(null),resultPanel=useRef<HTMLElement>(null);
  const selected=items.find(v=>v.id===current);
  const [compare,setCompare]=useState(false);
  const [framing,setFraming]=useState(false),[frameError,setFrameError]=useState('');
  const parentVersion=selected?.parent ? items.find(v=>v.id===selected.parent) : undefined;
  const family=items.filter(v=>v.root===selected?.root).sort((a,b)=>a.created-b.created);
  const editingRoot=mode==='edit'?reference?.version?.root:undefined;
  const composerCost=conversationCost(editingRoot?items.filter(v=>v.root===editingRoot):[]);
  const roots=Array.from(new Set([...items].sort((a,b)=>b.created-a.created).map(v=>v.root)));
  const connected=Boolean(key||serverKey);
  useEffect(()=>{
    const refresh=()=>listVersions(account).then(rows=>setItems(prev=>[...rows.filter(r=>!prev.some(p=>p.id===r.id)),...prev])).catch(()=>setWarning('O navegador não liberou o histórico local. Baixe as imagens que quiser guardar.'));
    const sync=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('lume-versions-'+account);
    if(sync)sync.onmessage=refresh;
    void refresh();
    window.addEventListener('focus',refresh);
    fetch('/img_editor/api/status').then(async r=>await r.json() as {configured?:boolean}).then(v=>setServerKey(Boolean(v.configured))).catch(()=>{});
    return ()=>{sync?.close();window.removeEventListener('focus',refresh)};
  },[]);
  useEffect(()=>{if(message){const timer=setTimeout(()=>setMessage(''),4200);return()=>clearTimeout(timer)}},[message]);
  function receive(blob:File){
    if(busy)return;
    if(!validImage(blob)){setWarning('Escolha um PNG, JPEG ou WebP de até 20 MB.');return}
    const next={blob,name:blob.name||'Imagem colada'};
    if(mode==='edit'){setSelection(null);setPhotos([]);setReference(next)}else setPrint(next);
    setWarning('');setMessage(mode==='edit'?'Imagem pronta para editar.':'Print de prompt adicionado.');
  }
  useEffect(()=>{
    function paste(e:ClipboardEvent){if(page!=='studio'||apiOpen||help||example!==null||full||compare||framing||busy)return;const f=Array.from(e.clipboardData?.items||[]).find(i=>i.kind==='file'&&i.type.startsWith('image/'))?.getAsFile();if(f){e.preventDefault();receive(f)}}
    window.addEventListener('paste',paste);return()=>window.removeEventListener('paste',paste);
  });
  function switchMode(m:Mode){setMode(m);setWarning('')}
  function showStudio(){setPage('studio');setWarning('')}
  function startEdit(v:Version){
    const [width, height] = v.size.split('x').map(Number);
    setSize(v.size in dims ? v.size : (width > height ? '1536x1024' : '1024x1536'));
    setMode('edit');setPhotos([]);setSelection(null);setReference({blob:v.blob,name:v.title,version:v});setDrafts(x=>({...x,edit:''}));setPage('studio');setFull(false);setWarning('');
    setTimeout(()=>{area.current?.focus();area.current?.scrollIntoView({behavior:'smooth',block:'center'})},50);
  }
  function openVersion(id:string){setCurrent(id);setPage('studio');setTimeout(()=>resultPanel.current?.scrollIntoView({behavior:'smooth',block:'start'}),60)}
  function download(v:Version){
    const url=URL.createObjectURL(v.blob),a=document.createElement('a');a.href=url;a.download='lume-'+v.id.slice(0,8)+'.'+(v.blob.type.split('/')[1]||'png');a.click();setTimeout(()=>URL.revokeObjectURL(url),6000);
  }
  function openApi(){setKeyDraft('');setConnectError('');setApiOpen(true)}
  async function connect(e:FormEvent){
    e.preventDefault();if(checking)return;setChecking(true);setConnectError('');
    try{const k=keyDraft.trim();const r=await fetch('/img_editor/api/connect',{method:'POST',headers:{'x-lume-key':k,'x-lume-account':account}});const j=await r.json() as {error?:string};if(!r.ok)throw Error(j.error||'Falha ao conectar.');setKey(k);setKeyDraft('');setApiOpen(false);setMessage('API conectada. O estúdio está pronto.')}
    catch(e){setConnectError(e instanceof Error?e.message:'Não foi possível conectar.')}finally{setChecking(false)}
  }
  async function drawIdea() {
    if (ideaRequest.current || busy) return;
    if (!connected) {openApi();return}
    const controller=new AbortController();
    ideaRequest.current=controller;
    setDrawingIdea(true);setWarning('');
    try {
      const response=await fetch('/img_editor/api/idea',{
        method:'POST', signal:controller.signal,
        headers:{'Content-Type':'application/json','x-lume-account':account,...(key?{'x-lume-key':key}:{})},
        body:JSON.stringify({recent:recentIdeas.current}),
      });
      const result=await response.json();
      if (!response.ok || !result.idea) throw Error(result.error || 'Não foi possível sortear a ideia.');
      if (controller.signal.aborted) return;
      recentIdeas.current=[...recentIdeas.current,result.idea].slice(-6);
      setDrafts(prev=>prev.create===prompt ? {...prev,create:result.idea} : prev);
    } catch(error) {
      if (!controller.signal.aborted) setWarning(error instanceof Error?error.message:'Não foi possível sortear a ideia.');
    } finally {
      ideaRequest.current=null;setDrawingIdea(false);
    }
  }
  async function requestImage(body:FormData) {
      const r=await fetch('/img_editor/api/images',{method:'POST',headers:{...(key?{'x-lume-key':key}:{}),'x-lume-account':account},body});
      const data=await r.json().catch(()=>({error:'O servidor não devolveu a imagem. Confira seu uso na OpenAI antes de repetir.'})) as {image?:string;error?:string;receipt?:Receipt|null};if(!r.ok||!data.image)throw Error(data.error||'Geração incompleta.');
      const blob=await (await fetch('data:image/png;base64,'+data.image)).blob();
      return {blob, receipt:data.receipt??null};
  }
  async function saveResult(blob:Blob, description:string, outputSize:string, receipt:Receipt|null, local=false) {
      const now=Date.now(), id=crypto.randomUUID(), pending:Version[]=[];
      let parent=mode==='edit'?reference?.version:undefined;
      if(mode==='edit'&&reference&&!parent){
        const originalId=crypto.randomUUID();parent={id:originalId,root:originalId,created:now-1,prompt:'Imagem enviada para edição.',title:reference.name,size,quality,blob:reference.blob,original:true};pending.push(parent);setReference({...reference,version:parent});
      }
      const v:Version={id,root:parent?.root||id,parent:parent?.id,created:now,prompt:description,size:outputSize,quality,blob,receipt,local,title:description.length>62?description.slice(0,61)+'…':description};
      pending.push(v);setItems(prev=>[...prev,...pending]);
      if(mode==='edit'){setSelection(null);setReference({blob:v.blob,name:v.title,version:v});setDrafts(x=>({...x,edit:''}));}
      openVersion(v.id);
      try{await saveVersions(account,pending);if(typeof BroadcastChannel!=='undefined'){const sync=new BroadcastChannel('lume-versions-'+account);sync.postMessage('saved');sync.close()}setMessage('Imagem salva na galeria deste navegador.')}catch{setWarning('Imagem pronta. O histórico local está indisponível. Baixe a imagem para guardá-la.')}
  }
  async function applyFrame(frame:Frame, needsAI:boolean) {
    if (!reference || lock.current) return;
    setFrameError('');
    if (needsAI && !connected) {openApi();return}
    lock.current=true;
    setBusy(true);
    try {
      const target = formats[frame.format];
      let receipt:Receipt|null = null;
      const blob = await renderFrame(reference.blob, frame, async (input, mask, modelSize) => {
        const body = new FormData();
        body.set('mode', 'edit');
        body.set('prompt', 'Prolongue a cena da foto nas margens transparentes, mantendo a perspectiva, a iluminação e a continuidade do fundo.');
        body.set('image', input, 'enquadramento.png');
        body.set('mask', mask, 'margens.png');
        body.set('size', modelSize);
        body.set('quality', quality);
        const result = await requestImage(body);
        receipt = result.receipt;
        return result.blob;
      });
      const action = frame.mode==='crop'?'Recorte':needsAI?'Expansão':'Enquadramento';
      await saveResult(blob, action+' · '+target.label, target.width+'x'+target.height, receipt, !needsAI);
      setFraming(false);
    } catch(e) {
      setFrameError(e instanceof Error ? e.message : 'Não foi possível salvar o enquadramento.');
    } finally {lock.current=false;setBusy(false)}
  }
  async function run(e:FormEvent){
    e.preventDefault();if(lock.current||selecting||drawingIdea)return;setWarning('');
    if(mode==='edit'&&!reference){setWarning('Adicione a imagem que deseja editar.');return}
    if(!prompt.trim()&&!(mode==='create'&&print)){setWarning(mode==='edit'?'Descreva a alteração que deseja fazer.':'Escreva um prompt ou adicione um print da conversa.');area.current?.focus();return}
    if(!connected){openApi();return}
    lock.current=true;setBusy(true);
    try{
      const body=new FormData();body.set('mode',mode==='edit'?'edit':print?'print':'create');body.set('prompt',prompt.trim());body.set('size',size);body.set('quality',quality);if(attachment)body.set('image',attachment.blob,attachment.name);
      const localEdit = region && reference ? await prepareRegion(reference.blob, region) : null;
      if (localEdit) {
        body.set('image', localEdit.input, 'recorte.png');
        body.set('mask', localEdit.stencil, 'mascara.png');
        body.set('size', '1024x1024');
      }
      if (mode === 'edit' && reference && photos.length) {
        const primaryBytes = localEdit ? localEdit.input.size + localEdit.stencil.size : reference.blob.size;
        if (photos.reduce((bytes, photo) => bytes + photo.file.size, primaryBytes) > maxUploadBytes)
          throw Error('A foto principal, a máscara e as referências devem somar até 20 MB.');
        for (const photo of photos) {
          body.append('reference', photo.file);
          body.append('referenceRole', photo.role);
        }
      }
      const {blob:generated, receipt} = await requestImage(body);
      const blob=localEdit ? await localEdit.compose(generated) : generated;
      await saveResult(blob, prompt.trim()||(print?'Imagem a partir de '+print.name:'Imagem gerada'), size, receipt);
    }catch(e){setWarning(e instanceof Error?e.message:'Não foi possível concluir a solicitação.')}
    finally{lock.current=false;setBusy(false)}
  }
  function useExample(i:number){setMode('create');setDrafts(x=>({...x,create:examples[i].prompt}));setPrint(null);setExample(null);setWarning('');setTimeout(()=>area.current?.focus(),20)}
  return <>
    <header className="top"><div className="top-inner"><button className="brandbtn" aria-label="Lume Studio, início" onClick={showStudio}><Brand/></button>
      <nav aria-label="Principal"><button className={page==='studio'?'active':''} onClick={showStudio}><PanelTop/>Estúdio</button><button className={page==='gallery'?'active':''} onClick={()=>setPage('gallery')}><Images/>Galeria</button></nav>
      <button className="connect" onClick={openApi}><span className={'dot '+(connected?'on':'')}/>{connected?'API conectada':'Conectar API'}<Cable size={15}/></button>
    </div></header>
    <main>
    {page==='studio'?<>
      <section className="hero"><div><span className="modeltag"><span className="dot on"/>GPT IMAGE 2.6</span><h1>Estúdio de imagem</h1><p>Gere e edite imagens com prompts e referências visuais.</p></div></section>
      <div className="workspace">
      <section className="card composer" aria-label="Editor de prompts">
        <div className="tabs"><button disabled={busy} aria-pressed={mode==='create'} className={mode==='create'?'selected':''} onClick={()=>switchMode('create')}><Sparkles/>Gerar imagem</button><button disabled={busy} aria-pressed={mode==='edit'} className={mode==='edit'?'selected':''} onClick={()=>switchMode('edit')}><PencilLine/>Editar imagem</button></div>
        <form onSubmit={run} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])receive(e.dataTransfer.files[0])}} className={drag?'drag':''}>
          <input type="file" accept="image/png,image/jpeg,image/webp" ref={file} hidden onChange={e=>{if(e.target.files?.[0])receive(e.target.files[0]);e.target.value=''}}/>
          {mode==='edit'&&!reference&&<button type="button" className="upload" onClick={()=>file.current?.click()} disabled={busy}><Upload size={18}/>Enviar ou colar foto principal <small>PNG, JPG, WebP · até 20 MB</small></button>}
          {mode==='edit' && reference && <button type="button" disabled={busy} className="secondary frame-open"
            onClick={()=>{setFrameError('');setFraming(true)}}><Ratio/>Enquadrar foto</button>}
          {mode==='edit' && reference && <RegionPicker onPending={setSelecting} blob={reference.blob} region={region} disabled={busy} onChange={value=>setSelection(value ? {blob:reference.blob, region:value} : null)}/>}
          {mode==='edit' && reference && <ReferencePhotos photos={photos} disabled={busy} onChange={setPhotos} onWarning={setWarning}/>}
          <div className="field-title"><label htmlFor="prompt"><AlignLeft/>{mode==='edit'?(region?'Instruções para a área selecionada':'Instruções de edição'):'Seu prompt'}</label>{mode==='create'&&<button className="idea" type="button" disabled={busy||drawingIdea} onClick={drawIdea}
            title="Gerar uma sugestão com GPT-6.2 Sol">{drawingIdea?<LoaderCircle className="spin"/>:<Shuffle/>}{drawingIdea?'Sorteando…':'Sortear ideia'}</button>}</div>
          <div className="prompt-box"><textarea id="prompt" ref={area} value={prompt} maxLength={12000} disabled={busy} onChange={e=>setPrompt(e.target.value)} placeholder={mode==='edit'?'O que você gostaria de mudar nesta imagem?':print?'Acrescente detalhes ao pedido do print (opcional)…':'Descreva a imagem que você imagina…'} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}/>
          <div className="prompt-tools">{attachment?<div className="attached"><BlobImage blob={attachment.blob} alt={mode==='edit'?'Foto principal':'Print anexado'}/><span>{mode==='edit'?'Principal · ':''}{attachment.name}</span><button type="button" disabled={busy} aria-label="Remover anexo" onClick={()=>{if(mode==='edit'){setReference(null);setPhotos([]);setSelection(null)}else setPrint(null)}}><X size={13}/></button></div>:<button type="button" className="attach" disabled={busy} onClick={()=>file.current?.click()}><Plus size={14}/>{mode==='create'?'Adicionar print':'Adicionar imagem'}</button>}<small>{prompt.length.toLocaleString('pt-BR')} / 12.000</small></div></div>
          <div className="options"><label><span><Ratio/>Proporção</span><div className="select"><select disabled={busy || !!region} value={region ? "original" : size} onChange={e=>setSize(e.target.value)}>{region && <option value="original">Original da foto</option>}{Object.entries(dims).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><ChevronDown/></div></label><label><span><SlidersHorizontal/>Qualidade</span><div className="select"><select disabled={busy} value={quality} onChange={e=>setQuality(e.target.value)}>{Object.entries(qlabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select><ChevronDown/></div></label></div>
          <div className="composer-cost"><span><Coins size={15}/>{editingRoot?'Acumulado da conversa':'Nova conversa'}</span><strong>{costLabel(composerCost)}</strong></div>
          {warning&&<p className="error" role="alert">{warning}</p>}
          <button className="primary generate" disabled={busy||selecting||drawingIdea}>{busy?<LoaderCircle className="spin"/>:<WandSparkles/>}{busy?'Criando sua imagem…':mode==='edit'?(region?'Editar área selecionada':'Aplicar edição'):'Gerar imagem'}<ArrowRight className="end"/></button>
        </form></section>
      <aside className="card inspire"><div className="panel-title"><div className="tileicon"><Aperture/></div><div><h2>Inspiração</h2><p>Explore um estilo para começar.</p></div></div>
        <div className="examples">{examples.map((ex,i)=><button key={ex.id} disabled={busy} className="example" onClick={()=>setExample(i)}><img src={'/img_editor/art/'+ex.id+'.webp'} alt=""/><div className="ex-label"><small>{ex.category}</small><b>{ex.title}</b></div><span className="ex-arrow"><ArrowUpRight/></span></button>)}</div>
      </aside></div>
      {selected&&<section ref={resultPanel} className="card result"><div className="result-header"><div><p className="eyebrow">RESULTADO</p><h2>{selected.original?'Imagem original':'Sua imagem'}</h2></div><div className="mask-tools">{parentVersion&&<button className="secondary" onClick={()=>setCompare(true)}>Comparar antes/depois</button>}<button className="secondary" onClick={()=>download(selected)}><Download/>Baixar</button></div></div><div className="result-layout"><button className="canvas" onClick={()=>setFull(true)} aria-label="Ampliar imagem"><BlobImage blob={selected.blob} alt={selected.prompt}/><Maximize2/></button><div className="details"><CostPanel version={selected} family={family}/><h3><History/>Histórico de versões</h3><p>Escolha uma versão para continuar a edição.</p><div className="versions">{family.map((v,i)=><button key={v.id} className={selected.id===v.id?'chosen':''} onClick={()=>setCurrent(v.id)}><span><BlobImage blob={v.blob} alt=""/></span><div><b>{v.original?'Original':'Versão '+(i+1)}</b><small>{v.parent?'A partir de V'+(family.findIndex(x=>x.id===v.parent)+1):'Ponto de partida'}</small></div><small className="version-amount">{v.original?'Envio local':v.local?'Edição local':v.receipt?dollars(v.receipt.nanoUsd):'Sem dados'}</small>{selected.id===v.id&&<Check size={16}/>}</button>)}</div><p className="versionprompt">{selected.prompt}</p><button disabled={busy} className="primary" onClick={()=>startEdit(selected)}><PencilLine/>Editar esta versão</button></div></div></section>}
    </>:<><div className="gallery-head"><span className="modeltag"><Layers3 size={13}/>HISTÓRICO LOCAL</span><h1>Minha galeria</h1><p>Suas criações e versões salvas neste navegador.</p></div>
    {roots.length?<div className="gallery">{roots.map(root=>{const group=items.filter(v=>v.root===root).sort((a,b)=>b.created-a.created);const v=group[0];const title=group.find(image=>image.id===root)?.title||v.title;return <button key={root} className="card gallery-item" onClick={()=>openVersion(v.id)}><BlobImage blob={v.blob} alt={v.title}/><div><small>{group.length} {group.length===1?'versão':'versões'} · {date(v.created)}</small><h3>{title}</h3><div className="gallery-cost"><span><Coins size={13}/>Custo estimado</span><strong>{costLabel(conversationCost(group))}</strong></div></div></button>})}</div>:<div className="card empty"><Images size={35}/><h2>Sua galeria começa aqui</h2><p>As imagens que você gerar e editar aparecerão aqui.</p><button className="primary" onClick={showStudio}><Plus/>Criar imagem</button></div>}</>}
    <footer><form method="post" action="/img_editor/api/logout"><button>Sair · {account}</button></form><span><span className="footer-mark">✧</span>Lume Studio</span><button onClick={()=>setHelp(true)}><CircleHelp size={14}/>Como funciona</button></footer>
    </main>
    {message&&<div className="toast" role="status"><Check size={16}/>{message}</div>}
    {framing&&reference&&<Dialog wide title="Enquadrar foto" onClose={()=>{if(!lock.current)setFraming(false)}}>
      <FrameEditor blob={reference.blob} busy={busy} error={frameError} onApply={applyFrame}/>
    </Dialog>}
    {apiOpen&&<Dialog title="Conexão com a OpenAI" onClose={()=>{if(!checking){setApiOpen(false);setKeyDraft('')}}}><p>Use uma chave de projeto com acesso ao GPT Image 2.6 Sunburst. Cada geração ou edição usa os créditos desse projeto.</p>{serverKey?<div className="note"><Check/>O servidor já tem uma chave configurada.</div>:null}
    <form onSubmit={connect}><label className="modal-label" htmlFor="secret">Chave da API</label><input id="secret" type="password" autoComplete="off" value={keyDraft} placeholder="sk-…" required disabled={checking} onChange={e=>setKeyDraft(e.target.value)}/><small>A chave fica em memória nesta aba e segue ao servidor somente para acessar a OpenAI. Ao recarregar, ela é descartada.</small>{connectError&&<p role="alert" className="error">{connectError}</p>}<button className="primary" disabled={checking}>{checking?<LoaderCircle className="spin"/>:<KeyRound/>}{checking?'Verificando…':key?'Trocar chave':'Conectar chave'}</button></form><div className="dialog-links"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Gerenciar chaves <ArrowUpRight size={14}/></a>{key&&<button onClick={()=>{setKey('');setKeyDraft('');setApiOpen(false);setMessage('Chave da sessão removida.')}}><Unplug size={14}/>Desconectar</button>}</div></Dialog>}
    {example!==null&&<Dialog title={examples[example].title} onClose={()=>setExample(null)}><img className="samplelarge" src={'/img_editor/art/'+examples[example].id+'.webp'} alt={examples[example].title}/><p>{examples[example].prompt}</p><button className="primary" onClick={()=>useExample(example)}><Sparkles/>Usar este prompt</button></Dialog>}
    {help&&<Dialog title="Como usar o estúdio" onClose={()=>setHelp(false)}><p><strong>Gerar.</strong> Escreva o que deseja criar ou adicione um print de uma conversa com o prompt. Você também pode colar um print diretamente na página.</p><p><strong>Editar.</strong> Envie a foto principal e descreva as mudanças. Você pode anexar fotos de referência e indicar quais devem orientar o rosto, a roupa ou o estilo. Para refinar um resultado, selecione “Editar esta versão”.</p><p><strong>Explorar versões.</strong> Abra uma criação na galeria e escolha qualquer versão do histórico para iniciar uma nova variação.</p><p><strong>Custos em dólares.</strong> Cada criação inicia uma conversa. O total soma a geração e todas as suas edições, inclusive variações de versões anteriores. O contador usa o consumo informado nas imagens concluídas e as tarifas padrão do modelo. Consulte o faturamento da OpenAI para créditos, descontos ou pedidos interrompidos.</p><p><strong>Guardar.</strong> A galeria fica neste navegador. Use “Baixar” para guardar uma cópia do arquivo.</p></Dialog>}
    {compare&&selected&&parentVersion&&<Dialog wide title="Antes e depois" onClose={()=>setCompare(false)}><VersionCompare before={parentVersion.blob} after={selected.blob}/></Dialog>}
    {full&&selected&&<Dialog title={selected.original?'Imagem original':'Visualização da imagem'} wide onClose={()=>setFull(false)}><div className="full"><BlobImage blob={selected.blob} alt={selected.prompt}/></div><button className="secondary" onClick={()=>download(selected)}><Download/>Baixar imagem</button></Dialog>}
  </>
}
