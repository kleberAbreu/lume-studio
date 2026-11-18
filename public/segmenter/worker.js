// Classic worker because MediaPipe's WASM loader uses importScripts.
const assets = new URL('assets/1.2.3-magic-touch-1/', self.location.href).href;
let segmenter;
self.onmessage = async ({data}) => {
  try {
    if (!segmenter) {
      importScripts(assets+'vision_bundle.js');
      const wasm = await Vision.FilesetResolver.forVisionTasks(assets.slice(0,-1));
      segmenter = await Vision.InteractiveSegmenter.createFromOptions(wasm, {
        baseOptions: {delegate:'CPU', modelAssetPath:assets+'magic-touch-v1.task'},
      });
    }
    if (data.photo) {
      const bitmap = await createImageBitmap(data.photo);
      try {
        const scale = Math.min(1, 1024/Math.max(bitmap.width, bitmap.height));
        const canvas = new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)), Math.max(1,Math.round(bitmap.height*scale)));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        segmenter.setImage(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } finally { bitmap.close(); }
    }
    const mask = segmenter.segment([{brushMode:1, point:[data.point], isCompleted:true}]);
    try {
      const values = mask.getAsFloat32Array();
      const bits = Uint8Array.from(values, value => value >= 0.5 ? 255 : 0);
      self.postMessage({width:mask.width, height:mask.height, bits}, [bits.buffer]);
    } finally { mask.close(); }
  } catch (error) {
    console.error('Falha na segmentação local.', error);
    self.postMessage({error:true});
  }
};
