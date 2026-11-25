import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ledger,visitor,reserve} from './budget.mjs';
import {service} from './service.mjs';

const form=(extra={})=>{const f=new FormData();for(const [k,v] of Object.entries({consent:'yes',mode:'create',prompt:'Um vaso azul.',...extra}))f.set(k,v);return f};
const image=()=>Response.json({data:[{b64_json:'abc'}],usage:{input_tokens:10,input_tokens_details:{text_tokens:10,image_tokens:0},output_tokens:25}});
const idea=()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Uma cena de praia ao amanhecer.'}]}],usage:{input_tokens:100,output_tokens:50}});
test('five calls per category for the lifetime of a network, after restart too',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lume-demo-'));const file=join(dir,'quota.sqlite');
 let hits=0;let db=ledger(file);
 const run=service({book:db,key:'fixture',upstream:async url=>{hits++;return url.endsWith('/responses')?idea():image()}});
 for(const category of ['image','prompt']){
   for(let i=0;i<5;i++)await run('a',randomUUID(),category,form());
   await assert.rejects(run('a',randomUUID(),category,form()),{status:429});
 }
 assert.equal(hits,10);db.close();db=ledger(file,()=>new Date('2031-02-01T00:00:00Z'));
 assert.equal(db.status('a').image.remaining,0);assert.equal(db.status('a').prompt.remaining,0);assert.equal(db.status('b').image.remaining,5);db.close();rmSync(dir,{recursive:true});
});
test('concurrent and replayed requests cannot dispatch twice',async()=>{
 const db=ledger(':memory:');let finish,started;const start=new Promise(r=>started=r);let hits=0;
 const run=service({book:db,key:'fixture',upstream:async()=>{hits++;started();await new Promise(r=>finish=r);return image()}});
 const id=randomUUID(),a=run('a',id,'image',form());await start;
 await assert.rejects(run('a',id,'image',form()),{status:429});finish();await a;
 await assert.rejects(run('a',id,'image',form()),{status:409});assert.equal(hits,1);assert.equal(db.status('a').image.remaining,4);db.close();
});
test('global cap across two SQLite connections, pending calls, branches and UTC rollover',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lume-budget-'));let t=new Date('2030-01-31T23:59:55Z');
 const a=ledger(join(dir,'db'),()=>t),b=ledger(join(dir,'db'),()=>t);
 for(let i=0;i<10;i++)(i%2?a:b).start('net'+i,'req','image');
 assert.throws(()=>b.start('outsider','id','prompt'),{status:429});
 t=new Date('2030-02-01T00:00:01Z');assert.throws(()=>a.start('another','id','image'),{status:429});
 a.finish('net0','req',1000);assert.equal(b.status('another').image.funded,false);
 b.start('another','id','prompt');b.finish('another','id',null);
 for(let i=1;i<10;i++)a.finish('net'+i,'req',null);
 t=new Date('2030-03-01T00:00:01Z');assert.equal(b.status('another').image.funded,true);assert.equal(b.status('another').prompt.remaining,4);
 a.close();b.close();rmSync(dir,{recursive:true});
});
test('invalid inputs and pause do not debit; ambiguous upstream result retains reservation',async()=>{
 const db=ledger(':memory:');let hits=0,off=true;
 const run=service({book:db,key:'fixture',paused:()=>off,upstream:async()=>{hits++;throw Error('timeout')}});
 await assert.rejects(run('a',randomUUID(),'image',form()),{status:503});off=false;
 for(const f of [form({consent:'no'}),form({prompt:' '}),form({mode:'edit'}),form({mode:'edit',image:new Blob(['invalid'])})])
   await assert.rejects(run('a',randomUUID(),'image',f),{status:400});
 assert.equal(hits,0);assert.equal(db.status('a').image.remaining,5);
 await assert.rejects(run('a',randomUUID(),'image',form()),{status:502});assert.equal(hits,1);assert.equal(db.status('a').image.remaining,4);
 for(let i=0;i<9;i++)db.start('other'+i,'id','image');assert.equal(db.status('new').prompt.funded,false);db.close();
});
test('public model, size, number, quality and prompt token ceiling fixed by the service',async()=>{
 const db=ledger(':memory:');const captured=[];
 const run=service({book:db,key:'server-only',upstream:async(url,opts)=>{captured.push([url,JSON.parse(opts.body),opts.headers.Authorization]);return url.endsWith('/responses')?idea():image()}});
 const f=form({model:'other',size:'1536x1024',quality:'high',n:'20',key:'ignored'});
 await run('a',randomUUID(),'image',f);await run('a',randomUUID(),'prompt',f);
 assert.deepEqual([captured[0][1].quality,captured[0][1].n,captured[0][1].size],['low',1,'1024x1024']);
 assert.equal(captured[1][1].max_output_tokens,450);assert.equal(captured[1][1].store,false);assert.ok(captured.every(x=>x[2]==='Bearer server-only'));db.close();
});
test('private normalized network identities',()=>{
 const pepper='test pepper';assert.equal(visitor('::ffff:192.0.2.1',pepper),visitor('192.0.2.1',pepper));assert.equal(visitor('2001:db8::1',pepper),visitor('2001:0db8:0000:0000:0000:0000:0000:0001',pepper));
 assert.throws(()=>visitor(null,pepper),{status:403});assert.notEqual(visitor('192.0.2.1',pepper),visitor('192.0.2.1','other'));
});
