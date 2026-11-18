import assert from 'node:assert/strict';
import test from 'node:test';
import {formats, framePlacement, defaultFrame} from '../lib/studio/framing.ts';
import {conversationCost} from '../lib/studio/costs.ts';

test('todos os formatos usam escala proporcional e respeitam os limites de movimentação', () => {
  for (const [format, target] of Object.entries(formats)) {
    for (const source of [{width:641,height:411}, {width:323,height:765}, target]) {
      for (const mode of ['crop','expand']) {
        for (const scale of mode === 'crop' ? [1,2.5] : [0.35,1]) {
          for (const pos of [0,0.5,1]) {
            const r = framePlacement(source,{format,mode,scale,x:pos,y:pos});
            const within = mode === 'expand';
            assert.ok(within ? r.x >= 0 && r.y >= 0 : r.x <= 0 && r.y <= 0);
            assert.ok(within ? r.x+r.width <= target.width && r.y+r.height <= target.height :
              r.x+r.width >= target.width && r.y+r.height >= target.height);
            assert.ok(Math.abs(r.width/source.width-r.height/source.height) <= 0.5/source.width+0.5/source.height);
          }
        }
      }
    }
  }
});

test('a foto pode ser deslocada até a borda inferior de um story sem alterar sua escala', () => {
  assert.deepEqual(framePlacement(formats.feed,{...defaultFrame,format:'story',mode:'expand',y:1}),
    {x:0,y:570,width:1080,height:1350});
});

test('o recorte local não acrescenta custo nem operação sem dados', () => {
  assert.deepEqual(conversationCost([{original:true},{local:true},{receipt:{nanoUsd:300}},{receipt:null}]),
    {nanoUsd:300,known:1,missing:1});
});
