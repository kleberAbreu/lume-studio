import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ledger,visitor,PublicError} from './budget.mjs';
import {service} from './service.mjs';

const dir=process.env.CREDENTIALS_DIRECTORY;
const state=process.env.STATE_DIRECTORY;
const key=readFileSync(join(dir,'api-key'),'utf8').trim();
const pepper=readFileSync(join(dir,'ip-pepper'),'utf8').trim();
if(!key || pepper.length<32) throw new Error('Credenciais da demo indisponíveis.');
const book=ledger(join(state,'quota.sqlite'));
const paused=()=>existsSync(join(state,'paused'));
const run=service({book,key,paused});
const prefix='/lume-demo/';
const assets=fileURLToPath(new URL('./public/',import.meta.url));
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',webp:'image/webp'};
const origin=process.env.LUME_ORIGIN || 'https://www.kleberabreu.com.br';
let reading=0;
const server=http.createServer(async(req,res)=>{
  const json=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self' blob: data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(!path.startsWith(prefix)) throw new PublicError(404,'Página não encontrada.');
    const route=path.slice(prefix.length);
    if(!route.startsWith('api/')) {
      if(!['GET','HEAD'].includes(req.method)) throw new PublicError(405,'Método inválido.');
      const file=route||'index.html';
      if(!/^(?:index\.html|app\.js|style\.css|examples\.js|examples\/(?:jarra|frasco|bolsa)-(?:antes|depois)\.webp)$/.test(file)) throw new PublicError(404,'Página não encontrada.');
      const body=await readFile(join(assets,file)).catch(()=>{throw new PublicError(404,'Arquivo indisponível.')});
      res.writeHead(200,{'Content-Type':types[file.split('.').pop()],'Cache-Control':file.endsWith('.webp')?'public, max-age=86400':'no-cache'});
      res.end(req.method==='HEAD'?undefined:body);
      return;
    }
    const network=visitor(req.headers['x-lume-demo-ip'],pepper);
    if(route==='api/status' && req.method==='GET') return json(200,{...book.status(network),paused:paused()});
    if(!['api/image','api/prompt'].includes(route)) throw new PublicError(404,'Operação indisponível.');
    if(req.method!=='POST') throw new PublicError(405,'Método inválido.');
    if(req.headers.origin!==origin) throw new PublicError(403,'Origem inválida.');
    const type=req.headers['content-type']||'';
    if(!type.startsWith('multipart/form-data;')) throw new PublicError(415,'Formato inválido.');
    const max=route==='api/image'?5*1024*1024+300000:8192;
    if(reading>=4) throw new PublicError(429,'Aguarde um instante.');
    if(Number(req.headers['content-length'])>max) throw new PublicError(413,'Arquivo muito grande.');
    reading++;
    try {
      let size=0;const chunks=[];
      for await (const c of req) {size+=c.length;if(size>max) throw new PublicError(413,'Arquivo muito grande.');chunks.push(c)}
      const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':type}}).formData().catch(()=>{throw new PublicError(400,'Envio inválido.')});
      const result=await run(network,req.headers['idempotency-key'],route.slice(4),form);
      json(200,result);
    } finally {reading--}
  } catch(e){if(!res.headersSent) json(e instanceof PublicError?e.status:503,{error:e instanceof PublicError?e.message:'Serviço temporariamente indisponível.'})}
});
server.requestTimeout=30000;
server.listen(3141,'127.0.0.1');
