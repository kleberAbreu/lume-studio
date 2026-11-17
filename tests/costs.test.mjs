import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCost, conversationCost, costLabel, dollars} from '../lib/studio/costs.ts';
import {handleStudio} from '../lib/studio/api.mjs';

const usage = (text, image, output) => ({
  input_tokens:text+image, input_tokens_details:{text_tokens:text,image_tokens:image}, output_tokens:output
});
const generation = estimateCost(usage(100,0,1000));
const edit = estimateCost(usage(50,500,1000));

test('USD totals include input modalities and preserve fractions of a cent', () => {
  assert.equal(generation.nanoUsd,30_500_000);
  assert.equal(edit.nanoUsd,34_250_000);
  assert.match(dollars(generation.nanoUsd),/0,0305/);
});
test('reported cache discounts and image-only output detail', () => {
  assert.equal(estimateCost({...usage(100,200,1020),cached_tokens:100,
    cached_tokens_details:{cached_text_tokens:80,cached_image_tokens:20},
    output_tokens_details:{image_tokens:1000,text_tokens:20}}).nanoUsd,31_680_000);
});
test('count each generated version, including siblings, and exclude a local upload', () => {
  const versions = [
    {id:'upload',original:true}, {id:'base',receipt:generation},
    {id:'a',parent:'base',receipt:edit}, {id:'b',parent:'base',receipt:edit}
  ];
  assert.deepEqual(conversationCost(versions), {nanoUsd:99_000_000,known:3,missing:0});
});
test('legacy and missing usage show a partial or unknown total', () => {
  assert.equal(estimateCost(null),null);
  assert.equal(estimateCost({output_tokens:500}),null);
  assert.equal(estimateCost({...usage(10,20,30),input_tokens:29}),null);
  assert.equal(costLabel(conversationCost([{}])),'Sem dados');
  assert.match(costLabel(conversationCost([{receipt:edit},{}])),/0,03425 \(parcial\)/);
});
test('create, edit and print return a receipt with the image, even if usage is missing',async () => {
  for (const mode of ['create','edit','print']) {
    for (const metered of [true,false]) {
      const form = new FormData();
      for (const [k,v] of Object.entries({mode,prompt:'Uma imagem',size:'1024x1024',quality:'medium'})) form.set(k,v);
      if(mode!=='create') form.set('image',new Blob(['fixture'],{type:'image/png'}),'input.png');
      const request = new Request('https://test.example/api/images',{method:'POST',body:form});
      const response = await handleStudio(request,{OPENAI_API_KEY:'test'},async()=>Response.json({
        data:[{b64_json:'fixture'}],usage:metered?usage(50,500,1000):undefined
      }));
      assert.equal(response.status,200);
      const result = await response.json();
      assert.equal(result.image,'fixture');
      assert.deepEqual(result.receipt,metered?edit:null);
    }
  }
});
