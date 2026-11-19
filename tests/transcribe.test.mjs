import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStudio} from '../lib/studio/api.mjs';

const env = {OPENAI_API_KEY: 'fixture'};
function request(type, body = 'audio-fixture', headers = {}) {
  return new Request('https://studio.test/api/transcribe', {
    method: 'POST', headers: {'content-type': type, ...headers}, body, duplex: 'half',
  });
}
test('transcreve em português, usando a chave da sessão e o tipo de captura do navegador', async () => {
  for (const [type, extension] of [['audio/mp4', 'm4a'], ['audio/webm;codecs=opus', 'webm'], ['audio/ogg', 'ogg']]) {
    const response = await handleStudio(request(type, 'exemplo', {'x-lume-key':'sessao'}), env, async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions');
      assert.equal(init.headers.Authorization, 'Bearer sessao');
      assert.equal(init.body.get('model'), 'gpt-transcribe');
      assert.equal(init.body.get('language'), 'pt');
      const file = init.body.get('file');
      assert.equal(file.name, 'ditado.' + extension);
      assert.equal(await file.text(), 'exemplo');
      return Response.json({text:'  Não altere o rosto.  '});
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {text:'Não altere o rosto.'});
  }
});
test('rejeita origem, chave ausente, áudio vazio, formato ou tamanho inválido antes do envio', async () => {
  const blocked = () => {throw Error('envio indevido')};
  assert.equal((await handleStudio(request('audio/mp4'), {}, blocked)).status, 401);
  assert.equal((await handleStudio(request('audio/mp4','x',{origin:'https://other.test'}), env, blocked)).status, 403);
  assert.equal((await handleStudio(request('image/png'), env, blocked)).status, 415);
  assert.equal((await handleStudio(request('audio/mp4', ''), env, blocked)).status, 400);
  assert.equal((await handleStudio(request('audio/mp4','x',{'content-length':String(9*1024*1024)}), env, blocked)).status, 413);
  const body = new ReadableStream({start(stream) {
    const chunk = new Uint8Array(1024 * 1024);
    for (let i = 0; i < 9; i++) stream.enqueue(chunk);
    stream.close();
  }});
  assert.equal((await handleStudio(request('audio/webm',body), env, blocked)).status, 413);
});
test('distingue áudio sem fala, limite do serviço e indisponibilidade temporária', async () => {
  for (const [upstream, status] of [
    [() => Response.json({text:'  '}), 422],
    [() => new Response(null,{status:429}), 429],
    [() => {throw Error('rede')}, 502],
  ]) assert.equal((await handleStudio(request('audio/mp4'), env, upstream)).status, status);
});
