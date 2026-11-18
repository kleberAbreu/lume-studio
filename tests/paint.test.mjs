import assert from 'node:assert/strict';
import test from 'node:test';
import {inwardWeights, blendPatch} from '../lib/studio/paint.ts';

function pixels(width,height,color) {
  const data = new Uint8ClampedArray(width*height*4);
  for (let i=0;i<data.length;i+=4) data.set(color,i);
  return {width,height,data};
}
test('inner feather respects outer edges, partial coverage and protected holes',()=>{
  const mask=pixels(15,15,[0,0,0,255]);
  const index=(x,y)=>15*y+x;
  mask.data[4*index(7,7)+3]=0;
  mask.data[3]=128;
  const weights=inwardWeights(mask,4);
  assert.equal(weights[index(7,7)],0);
  assert.equal(weights[index(8,7)],64);
  assert.equal(weights[index(3,3)],255);
  assert.equal(weights[0],32);
  assert.equal(inwardWeights(mask,0)[0],128);
});
test('zero mask preserves RGBA bytes and feather blends transparent sources correctly',()=>{
  const original=pixels(3,1,[40,120,10,0]);
  const patch=pixels(3,1,[200,15,90,255]);
  blendPatch(original,patch,new Uint8Array([0,128,255]));
  assert.deepEqual([...original.data],[40,120,10,0,200,15,90,128,200,15,90,255]);
});
