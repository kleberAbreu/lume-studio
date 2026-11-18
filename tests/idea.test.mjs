import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStudio} from '../lib/studio/api.mjs';
const req = (recent=[]) => new Request('https://studio.test/api/idea', {method:'POST',body:JSON.stringify({recent})});
const env = {OPENAI_API_KEY:'fixture'};
const response = text => Response.json({status:'completed',output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text}]}]});

test('cada sorteio faz uma solicitação distinta ao GPT-6.2 Sol e evita a ideia anterior', async () => {
  const sent=[];
  const upstream=async (url, options) => {
    assert.equal(url,'https://api.openai.com/v1/responses');
    const body=JSON.parse(options.body);assert.equal(body.model,'gpt-6.2-sol');
    sent.push(body.input[1].content);
    return response(sent.length===1?'Cena um.':sent.length===2?'CENA UM!':'Cena dois.');
  };
  assert.deepEqual(await (await handleStudio(req(),env,upstream)).json(),{idea:'Cena um.'});
  assert.deepEqual(await (await handleStudio(req(['Cena um.']),env,upstream)).json(),{idea:'Cena dois.'});
  assert.equal(new Set(sent).size,3);
  assert.deepEqual(JSON.parse(sent[1]).ideiasRecentes,['Cena um.']);
});
test('preserva erros de acesso e recusa histórico inválido ou resposta incompleta', async () => {
  assert.equal((await handleStudio(req(),{},()=>assert.fail())).status,401);
  assert.equal((await handleStudio(req(['x'.repeat(901)]),env,()=>assert.fail())).status,400);
  assert.equal((await handleStudio(req(),env,()=>new Response(null,{status:429}))).status,429);
  assert.equal((await handleStudio(req(),env,()=>Response.json({status:'incomplete',output:[]}))).status,502);
});
