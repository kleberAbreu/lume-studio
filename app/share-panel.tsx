'use client';
import {useEffect,useState} from 'react';
import {galleryRequest,type Version} from '../lib/studio/gallery';
type Scope='photo'|'project';
type Link={scope:Scope;token:string};
export function SharePanel({account,version}:{account:string;version:Version}) {
  const [scope,setScope]=useState<Scope>('photo'),[links,setLinks]=useState<Link[]>([]);
  const [busy,setBusy]=useState(true),[message,setMessage]=useState('');
  useEffect(()=>{
    let live=true;
    galleryRequest(account,{op:'links',id:version.id,root:version.root}).then(data=>{if(live)setLinks(data.links)})
      .catch(e=>{if(live)setMessage(e.message)}).finally(()=>{if(live)setBusy(false)});
    return ()=>{live=false};
  },[account,version.id,version.root]);
  const token=links.find(l=>l.scope===scope)?.token;
  const url=token?location.origin+'/img_editor/s/'+token:'';
  async function changeLink() {
    setBusy(true);setMessage('');
    try {
      if(token){await galleryRequest(account,{op:'revoke'},JSON.stringify({token}));setLinks(prev=>prev.filter(l=>l.token!==token));setMessage('Link desativado.')}
      else {const data=await galleryRequest(account,{op:'share'},JSON.stringify({scope,target:scope==='photo'?version.id:version.root}));
        setLinks(prev=>[...prev.filter(l=>l.scope!==scope),{scope,token:data.token}]);}
    }catch(e){setMessage(e instanceof Error?e.message:'Tente novamente.')}finally{setBusy(false)}
  }
  async function copy() {
    try{await navigator.clipboard.writeText(url);setMessage('Link copiado.')}catch{setMessage('Selecione e copie o endereço abaixo.')}
  }
  return <div className="share-panel">
    <label>O que compartilhar<select disabled={busy} value={scope} onChange={e=>{setScope(e.target.value as Scope);setMessage('')}}>
      <option value="photo">Somente esta foto</option><option value="project">Projeto inteiro</option></select></label>
    <p>{scope==='photo'?'Quem tiver o link poderá ver e baixar esta foto.':'Quem tiver o link poderá ver e baixar as imagens de todas as versões deste projeto, inclusive as que você salvar depois.'}</p>
    {url && <><label>Link de visualização<input readOnly value={url} onFocus={e=>e.currentTarget.select()}/></label>
      <button className="primary" onClick={copy}>Copiar link</button>
      {typeof navigator.share==='function' && <button className="secondary" onClick={()=>navigator.share({url}).catch(e=>{if(e.name!=='AbortError')setMessage('Use Copiar link para compartilhar.')})}>Compartilhar pelo aparelho</button>}</>}
    <button className={token?'secondary':'primary'} disabled={busy} onClick={changeLink}>{token?'Desativar link':'Criar link de visualização'}</button>
    {message&&<p role="status">{message}</p>}
  </div>;
}
