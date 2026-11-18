export type Region = {x: number; y: number; width: number; height: number};
export type Point = {x: number; y: number};

export function rectangle(a: Point, b: Point): Region {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y)
  };
}

// Keep a little surrounding context. A square input and output share one coordinate system.
export function contextFrame(region: Region, width: number, height: number) {
  const side = Math.ceil(Math.max(region.width, region.height) * 1.4);
  function origin(start: number, span: number, limit: number) {
    if (side >= limit) return Math.floor((limit - side) / 2);
    return Math.max(0, Math.min(limit - side, Math.floor(start + (span - side) / 2)));
  }
  return {x: origin(region.x, region.width, width), y: origin(region.y, region.height, height), side};
}

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('O navegador não conseguiu preparar a foto para edição.');
  return ctx;
}

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('O navegador não conseguiu salvar a imagem.')), 'image/png')
  );
}

export async function prepareRegion(original: Blob, region: Region) {
  const image = await createImageBitmap(original);
  try {
    const {x, y, width, height} = region;
    if (width < 1 || height < 1 || x < 0 || y < 0 ||
        x + width > image.width || y + height > image.height) throw Error('Selecione a área novamente.');
    const output = surface(image.width, image.height);
    output.drawImage(image, 0, 0);
    const frame = contextFrame(region, image.width, image.height);
    const resolution = 1024;
    const scale = resolution / frame.side;
    const regionX = (x - frame.x) * scale;
    const regionY = (y - frame.y) * scale;
    const sample = surface(resolution, resolution);
    sample.fillStyle = '#ffffff';
    sample.fillRect(0, 0, resolution, resolution);
    sample.drawImage(image, -frame.x * scale, -frame.y * scale, image.width * scale, image.height * scale);
    const mask = surface(resolution, resolution);
    mask.fillRect(0, 0, resolution, resolution);
    const left = Math.floor(regionX), top = Math.floor(regionY);
    mask.clearRect(left, top, Math.ceil(regionX + width * scale) - left, Math.ceil(regionY + height * scale) - top);
    const [input, stencil] = await Promise.all([png(sample.canvas), png(mask.canvas)]);
    return {
      input, stencil,
      async compose(result: Blob) {
        const patch = await createImageBitmap(result);
        try {
          if (patch.width !== patch.height) throw Error('A edição retornou com proporção inesperada.');
          const ratio = patch.width / resolution;
          output.clearRect(x, y, width, height);
          output.drawImage(patch, regionX * ratio, regionY * ratio, width * scale * ratio, height * scale * ratio, x, y, width, height);
          return await png(output.canvas);
        } finally { patch.close(); }
      }
    };
  } finally { image.close(); }
}
