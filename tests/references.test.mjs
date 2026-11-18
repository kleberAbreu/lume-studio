import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStudio} from '../lib/studio/api.mjs';
import {maxUploadBytes} from '../lib/studio/references.ts';

function form(mode = 'edit') {
  const data = new FormData();
  for (const [key, value] of Object.entries({mode, prompt:'Remova os óculos.',size:'1024x1024',quality:'medium'})) data.set(key,value);
  data.set('image', new Blob(['principal'], {type:'image/png'}), 'principal.png');
  return data;
}
function add(data, role, content = role, type = 'image/jpeg') {
  data.append('reference', new Blob([content], {type}), 'referencia');
  data.append('referenceRole', role);
}
function send(data, upstream) {
  return handleStudio(new Request('https://localhost/api/images', {method:'POST',body:data}),
    {OPENAI_API_KEY:'fixture'}, upstream);
}
for (const masked of [true, false]) {
  test('mantém a principal primeiro e associa cada referência à sua função, máscara ' + masked, async () => {
    const data = form();
    for (const role of ['style','face','clothing']) add(data,role);
    if (masked) data.set('mask', new Blob(['stencil'], {type:'image/png'}));
    let sent;
    const response = await send(data, async (url, {body}) => {
      sent = {url, body};
      return Response.json({data:[{b64_json:'resultado'}]});
    });
    assert.equal(response.status,200);
    assert.ok(sent.url.endsWith('/images/edits'));
    const images = sent.body.getAll('image[]');
    assert.deepEqual(await Promise.all(images.map(photo => photo.text())), ['principal','style','face','clothing']);
    const prompt = sent.body.get('prompt');
    for (const text of ['foto 1','Foto 2: referência de estilo','Foto 3: referência de rosto','Foto 4: referência de roupa','Remova os óculos.']) assert.ok(prompt.includes(text));
    assert.equal(sent.body.has('mask'), masked);
    if (masked) assert.equal(await sent.body.get('mask').text(),'stencil');
  });
}
test('preserva edições de uma imagem e prints', async () => {
  for (const mode of ['edit','print']) {
    const data = form(mode);
    let sent;
    assert.equal((await send(data, async (_, {body}) => {
      sent = body;
      return Response.json({data:[{b64_json:'resultado'}]});
    })).status,200);
    assert.equal(await sent.get('image').text(),'principal');
    assert.equal(sent.has('image[]'),false);
  }
});
test('recusa combinações inválidas antes de enviar ao provedor', async () => {
  const cases = [
    data => add(data,'unknown'), data => data.append('referenceRole','face'),
    data => {add(data,'face');data.delete('referenceRole')}, data => add(data,'face','','image/png'),
    data => add(data,'face','data','text/plain'), data => {for(let i=0;i<4;i++) add(data,'face')},
    data => {add(data,'style');data.set('mode','print')}, data => {add(data,'face');data.set('mode','create')},
    data => add(data,'face',new Uint8Array(maxUploadBytes)),
  ];
  for (const [i, configure] of cases.entries()) {
    const data = form(); configure(data);
    let called = false;
    const response = await send(data, () => {called = true});
    assert.equal(called,false);
    assert.equal(response.status,i === cases.length - 1 ? 413 : 400);
  }
});
