import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleStudio } from '../lib/studio/api.mjs';
import { generateIdea } from '../lib/studio/idea.mjs';
import { PublicError } from './budget.mjs';

const fileMax=5*1024*1024;
const decoder=fileURLToPath(new URL('./photo.py',import.meta.url));
async function photo(file, mask=false) {
  if (!(file instanceof Blob) || !file.size || file.size>(mask?262144:fileMax)) throw new PublicError(400,'Envie uma foto de até 5 MB ou refaça a seleção.');
  const buf=Buffer.from(await file.arrayBuffer());
  return new Promise((resolve,reject)=>{
    const proc=spawn(process.env.LUME_PYTHON || '/usr/bin/python3',[decoder,mask?'mask':'photo'],{stdio:['pipe','pipe','ignore'],timeout:12000});
    const chunks=[];
    proc.stdout.on('data',c=>chunks.push(c));
    proc.stdin.on('error',()=>{});
    proc.on('error',()=>reject(new PublicError(503,'Processamento de imagem indisponível.')));
    proc.on('close',code=>code===0?resolve(new Blob(chunks,{type:'image/png'})):reject(new PublicError(400,'Foto ou seleção inválida. Use JPEG, PNG ou WebP de até 16 megapixels.')));
    proc.stdin.end(buf);
  });
}
export function service({book,key,paused=()=>false,upstream=fetch}) {
  const active=new Set();
  return async function run(network,id,bucket,form) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id||'')) throw new PublicError(400,'Identificador de pedido inválido.');
    if (form.get('consent')!=='yes') throw new PublicError(400,'Confirme o envio à OpenAI.');
    if (paused()) throw new PublicError(503,'A demonstração está pausada.');
    if (active.has(network)||active.size>=2) throw new PublicError(429,'Há uma operação em andamento. Aguarde um instante.');
    active.add(network);
    try {
      let req;
      if (bucket==='image') {
        const mode=form.get('mode'), prompt=form.get('prompt');
        if (!['create','edit'].includes(mode) || typeof prompt!=='string' || !prompt.trim() || Buffer.byteLength(prompt)>1600) throw new PublicError(400,'Escreva um pedido de até 1.600 bytes.');
        const safe=new FormData();
        for(const [k,v] of Object.entries({mode,prompt:prompt.trim(),quality:'low',size:'1024x1024'})) safe.set(k,v);
        if (mode==='edit') {
          safe.set('image',await photo(form.get('image')),'foto.png');
          if(form.has('mask')) safe.set('mask',await photo(form.get('mask'),true),'selecao.png');
        }
        req=new Request('http://studio/api/images',{method:'POST',body:safe});
      } else {
        req=new Request('http://studio/api/idea',{method:'POST',body:JSON.stringify({recent:[]})});
      }
      let dispatched=false, cost=null;
      const metered=async(url,options)=>{
        if (dispatched) throw new Error('duplicate dispatch');
        if (paused()) throw new PublicError(503,'A demonstração está pausada.');
        book.start(network,id,bucket);
        dispatched=true;
        const resp=await upstream(url,{...options,redirect:'error',signal:AbortSignal.timeout(bucket==='image'?180000:45000)});
        if (resp.ok && bucket==='prompt') {
          const {usage}=await resp.clone().json();
          // Conservative upper rates (micro-USD/token), ignoring caching discounts.
          if ([usage?.input_tokens,usage?.output_tokens].every(n=>Number.isSafeInteger(n)&&n>=0))
            cost=usage.input_tokens*15+usage.output_tokens*90;
        }
        return resp;
      };
      // Reserve here so quota and budget errors keep their precise public status,
      // before the private image handler's generic network-error translation.
      const gate=book.status(network)[bucket];
      if (!gate.remaining || !gate.funded) throw new PublicError(429,!gate.remaining?'Esta rede já usou suas cinco chamadas nesta categoria.':'Limite mensal da demonstração atingido para esta operação.');
      let reservationError;
      const dispatch=async (...args)=>{try{return await metered(...args)}catch(e){if(e instanceof PublicError)reservationError=e;throw e}};
      try {
        const response=bucket==='image'?await handleStudio(req,{OPENAI_API_KEY:key},dispatch):await generateIdea(req,{Authorization:'Bearer '+key},dispatch,1);
        if(reservationError) throw reservationError;
        if(!response.ok) throw new PublicError(502,'O provedor não concluiu o pedido. Consulte o saldo antes de tentar novamente.');
        const result=await response.json();
        if(bucket==='image' && Number.isSafeInteger(result.receipt?.nanoUsd)) cost=Math.ceil(result.receipt.nanoUsd/1000);
        return bucket==='image'?{image:result.image}:{idea:result.idea};
      } finally {if(dispatched) book.finish(network,id,cost)}
    } finally {active.delete(network)}
  }
}
