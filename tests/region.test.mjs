import test from 'node:test';
import assert from 'node:assert/strict';
import {rectangle, contextFrame} from '../lib/studio/region.ts';
import {handleStudio} from '../lib/studio/api.mjs';

test('reverse drags and edge selections stay inside the square sent for editing', () => {
  for (const [width, height] of [[900, 1600], [1600, 900], [101, 101]]) {
    for (const [a,b] of [
      [{x: width, y: height}, {x: width - 35, y: height - 5}],
      [{x: 0, y: 10}, {x: width, y: 11}],
      [{x: 0, y: 0}, {x: width, y: height}],
    ]) {
      const area = rectangle(a, b);
      assert.deepEqual(area, rectangle(b, a));
      const frame = contextFrame(area, width, height);
      assert.ok(frame.x <= area.x && frame.y <= area.y);
      assert.ok(frame.x + frame.side >= area.x + area.width && frame.y + frame.side >= area.y + area.height);
    }
  }
});

test('regional edits forward the mask, context image, and instruction together', async () => {
  const form = new FormData();
  for (const [k,v] of Object.entries({mode:'edit',prompt:'Troque a cor',size:'1024x1024',quality:'medium'})) form.set(k,v);
  form.set('image', new Blob(['context'], {type:'image/png'}), 'a.png');
  form.set('mask', new Blob(['alpha'], {type:'image/png'}), 'b.png');
  const request = () => new Request('https://example.test/api/images', {method:'POST', body:form});
  const result = await handleStudio(request(), {OPENAI_API_KEY:'test'}, async (url, {body}) => {
    assert.ok(url.endsWith('/images/edits'));
    assert.equal(await body.get('mask').text(), 'alpha');
    assert.equal(await body.get('image').text(), 'context');
    assert.match(body.get('prompt'), /Troque a cor/);
    return Response.json({data:[{b64_json:'image'}]});
  });
  assert.equal(result.status, 200);
  form.set('mode', 'create');
  assert.equal((await handleStudio(request(), {OPENAI_API_KEY:'test'}, assert.fail)).status, 400);
});
