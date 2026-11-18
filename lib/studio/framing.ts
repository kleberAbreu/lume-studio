import {canvasContext} from './paint.ts';
import {png} from './region.ts';

export const formats = {
  feed: {label: 'Feed 4:5', width: 1080, height: 1350},
  story: {label: 'Story 9:16', width: 1080, height: 1920},
  wallpaper: {label: 'Papel de parede 16:9', width: 1920, height: 1080},
};
export type FrameMode = 'crop' | 'expand';
export type Frame = {format: keyof typeof formats; mode: FrameMode; scale: number; x: number; y: number};
type Dimensions = {width: number; height: number};
export const defaultFrame: Frame = {format:'feed', mode:'crop', scale:1, x:0.5, y:0.5};

// x and y are fractions of the available travel on each axis, also when cropping.
export function framePlacement(source: Dimensions, frame: Frame) {
  const target = formats[frame.format];
  const fit = frame.mode === 'crop' ? Math.max : Math.min;
  const factor = frame.scale * fit(target.width / source.width, target.height / source.height);
  const width = Math.max(1, Math.round(source.width * factor));
  const height = Math.max(1, Math.round(source.height * factor));
  return {width, height, x:Math.round((target.width-width)*frame.x), y:Math.round((target.height-height)*frame.y)};
}

export async function renderFrame(source: Blob, frame: Frame, expand: (input: Blob, mask: Blob, size: string) => Promise<Blob>) {
  const image = await createImageBitmap(source);
  try {
    const target = formats[frame.format];
    const rect = framePlacement(image, frame);
    const output = canvasContext(target.width, target.height);
    output.imageSmoothingQuality = 'high';
    output.drawImage(image, rect.x, rect.y, rect.width, rect.height);

    if (frame.mode === 'expand' && (rect.width < target.width || rect.height < target.height)) {
      // Fit the target inside a supported model size. Crop the same window back out of the response.
      const landscape = target.width > target.height;
      const model = canvasContext(landscape ? 1536 : 1024, landscape ? 1024 : 1536);
      const {width, height} = model.canvas;
      const factor = Math.min(width/target.width, height/target.height);
      const w = target.width * factor, h = target.height * factor;
      const x = (width-w)/2, y = (height-h)/2;
      model.drawImage(output.canvas, x, y, w, h);
      const mask = canvasContext(width, height);
      mask.fillRect(x+rect.x*factor, y+rect.y*factor, rect.width*factor, rect.height*factor);
      const [input, stencil] = await Promise.all([png(model.canvas), png(mask.canvas)]);
      const result = await createImageBitmap(await expand(input, stencil, width+'x'+height));
      try {
        if (result.width * height !== result.height * width) throw Error('A expansão retornou em uma proporção inesperada.');
        const ratio = result.width / width;
        // Keep only generated margins, including for originals with transparent pixels.
        output.save();
        output.beginPath();
        output.rect(0, 0, target.width, target.height);
        output.rect(rect.x, rect.y, rect.width, rect.height);
        output.clip('evenodd');
        output.drawImage(result, x*ratio, y*ratio, w*ratio, h*ratio, 0, 0, target.width, target.height);
        output.restore();
      } finally { result.close(); }
    }
    return await png(output.canvas);
  } finally { image.close(); }
}
