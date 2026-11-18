// Package the pinned Google MagicTouch model and matching MediaPipe WASM runtime on our own origin.
import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
const assets = 'public/segmenter/assets/1.2.3-magic-touch-1';
const sdk = 'node_modules/@mediapipe/tasks-vision';
const model = assets + '/magic-touch-v1.task';
const checksum = '38431bc66b883404e8397f74c3579404315b9b52b04a46c6346fe906a7309b03';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(assets, {recursive:true});
await Promise.all(['vision_bundle.js', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm']
  .map(file => copyFile(sdk+'/'+file, assets+'/'+file.split('/').pop())));
if (digest(await readFile(model).catch(() => Buffer.alloc(0))) !== checksum) {
  const url = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task';
  const response = await fetch(url, {signal:AbortSignal.timeout(120000)});
  if (!response.ok) throw Error('Download do modelo falhou: HTTP '+response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== checksum) throw Error('O modelo recebido não corresponde à versão esperada.');
  const tmp = model+'.'+process.pid;
  await writeFile(tmp, bytes);
  await rename(tmp, model);
}
