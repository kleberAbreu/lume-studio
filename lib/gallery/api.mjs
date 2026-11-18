import {database,chunkSize,putChunk,putVersion,catalogue,imageResponse,createLink,GalleryError} from './store.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function body(req,limit) {
  const reader=req.body?.getReader();
  if(!reader) throw new GalleryError(400,'Envio vazio.');
  let total=0;const buffers=[];
  while(true) {
    const {done,value}=await reader.read();if(done)break;
    total+=value.length;
    if(total>limit){await reader.cancel();throw new GalleryError(413,'Envio muito grande.')}
    buffers.push(value);
  }
  return Buffer.concat(buffers,total);
}
export async function galleryApi(req,owner) {
  const q=new URL(req.url).searchParams;
  if(q.get('account')!==owner) return json({error:'A conta mudou. Entre novamente.'},409);
  try {
    const db=database(), op=q.get('op');
    if(req.method==='GET') {
      if(!op) return json({versions:catalogue(db,owner)});
      if(op==='media') return imageResponse(db,owner,q.get('id')||'',q.get('kind')||'image');
      if(op==='links') return json({links:db.prepare('SELECT scope,target,token FROM links WHERE owner=? AND ((scope=? AND target=?) OR (scope=? AND target=?))')
        .all(owner,'photo',q.get('id'),'project',q.get('root'))});
    }
    if(req.method==='POST') {
      if(op==='chunk') return json({hash:putChunk(db,owner,await body(req,chunkSize))});
      const data=JSON.parse((await body(req,96000)).toString());
      if(op==='version'){putVersion(db,owner,data);return json({saved:true})}
      if(op==='share') return json({token:createLink(db,owner,data.scope,data.target)});
      if(op==='revoke'){db.prepare('DELETE FROM links WHERE owner=? AND token=?').run(owner,String(data.token));return json({revoked:true})}
    }
    return json({error:'Operação desconhecida.'},400);
  } catch(e) {
    if(e instanceof GalleryError) return json({error:e.message},e.status);
    if(e instanceof SyntaxError) return json({error:'Dados inválidos.'},400);
    console.error('Falha na galeria',e.code || e.name);
    return json({error:'A galeria está indisponível. Tente novamente.'},503);
  }
}
