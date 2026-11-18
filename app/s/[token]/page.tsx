import {notFound} from 'next/navigation';
import {database, sharedItems} from '../../../lib/gallery/store.mjs';
export const dynamic='force-dynamic';
export const metadata={title:'Compartilhado · Lume Studio',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function SharedPage({params}:{params:Promise<{token:string}>}) {
  const {token}=await params, share=sharedItems(database(),token);
  if(!share) notFound();
  return <main className="shared-view"><header><span>Lume Studio</span>
    <h1>{share.scope==='photo'?'Foto compartilhada':'Projeto compartilhado'}</h1>
    {share.scope==='project' && <p>{share.items.length} {share.items.length===1?'versão':'versões'}</p>}
  </header>{share.items.map((item,i)=>{
    const url='/img_editor/s/'+token+'/'+item.id;
    const label=share.scope==='photo'?'Foto':'Versão '+(share.items.length-i);
    return <figure className="card" key={item.id}><img src={url} alt={label} loading={i?'lazy':'eager'}/>
      <figcaption><strong>{label}</strong><a href={url} download={'lume-'+item.id}>Baixar foto</a></figcaption></figure>;
  })}</main>
}
