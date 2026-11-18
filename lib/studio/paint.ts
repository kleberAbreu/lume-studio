import type {Point, Region} from './region';

export type Tool = 'rectangle' | 'edit' | 'protect' | 'erase';
export type Mark = {tool: Tool; diameter: number; points: Point[]};
export type Selection = {marks: Mark[]; feather: number};
export const emptySelection: Selection = {marks: [], feather: 0};

export function canvasContext(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('O navegador não conseguiu preparar a foto para edição.');
  return ctx;
}

function paint(ctx: CanvasRenderingContext2D, mark: Mark) {
  const [a] = mark.points;
  const b = mark.points[mark.points.length - 1];
  if (mark.tool === 'rectangle') {
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  } else if (mark.points.length === 1) {
    ctx.beginPath(); ctx.arc(a.x, a.y, mark.diameter / 2, 0, 2 * Math.PI); ctx.fill();
  } else {
    ctx.lineWidth = mark.diameter;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    for (const p of mark.points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

// Replay the same marks in preview and photo coordinates. Protection always wins.
export function renderLayer(ctx: CanvasRenderingContext2D, marks: Mark[], protectedLayer: boolean, color: string) {
  ctx.fillStyle = color; ctx.strokeStyle = color;
  const lastRectangle = marks.filter(mark => mark.tool === 'rectangle').pop();
  for (const mark of marks) {
    if (mark.tool === 'rectangle' && mark !== lastRectangle) continue;
    if (mark.tool !== 'erase' && (mark.tool === 'protect') !== protectedLayer) continue;
    ctx.globalCompositeOperation = mark.tool === 'erase' ? 'destination-out' : 'source-over';
    paint(ctx, mark);
  }
  ctx.globalCompositeOperation = 'source-over';
}

export function editMask(width: number, height: number, selection: Selection) {
  const editable = selection.marks.some(m => m.tool === 'edit' || m.tool === 'rectangle');
  const ctx = canvasContext(width, height);
  if (editable) renderLayer(ctx, selection.marks, false, 'white');
  else ctx.fillRect(0, 0, width, height);
  const guard = canvasContext(width, height);
  renderLayer(guard, selection.marks, true, 'white');
  const pixels = ctx.getImageData(0, 0, width, height);
  const protectedPixels = guard.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1, hasGuard = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4 + 3;
    if (protectedPixels[i]) { pixels.data[i] = 0; hasGuard = true; }
    if (pixels.data[i]) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < 0 || (!editable && !hasGuard)) throw Error('A máscara está vazia. Marque uma área ou limpe a seleção para editar a imagem inteira.');
  ctx.putImageData(pixels, 0, 0);
  const bounds: Region = {x:left, y:top, width:right-left+1, height:bottom-top+1};
  return {ctx, bounds};
}

// Two distance passes measure inward from the edge, including holes around protected areas.
export function inwardWeights(mask: ImageData, radius: number) {
  const {width:w, height:h, data} = mask;
  const weight = new Uint8Array(w*h);
  if (!radius) { for (let i=0;i<weight.length;i++) weight[i]=data[i*4+3]; return weight; }
  const distance = new Float32Array(w*h);
  for (let i=0;i<distance.length;i++) {
    const x=i%w, y=Math.floor(i/w);
    if (data[i*4+3]) distance[i]=Math.min(radius,
      x ? distance[i-1]+1 : 1, y ? distance[i-w]+1 : 1,
      x && y ? distance[i-w-1]+1.414 : radius, x+1<w && y ? distance[i-w+1]+1.414 : radius);
  }
  for (let i=distance.length-1;i>=0;i--) {
    const x=i%w, y=Math.floor(i/w);
    distance[i]=Math.min(distance[i], x+1<w ? distance[i+1]+1 : 1, y+1<h ? distance[i+w]+1 : 1,
      x+1<w && y+1<h ? distance[i+w+1]+1.414 : radius, x && y+1<h ? distance[i+w-1]+1.414 : radius);
    weight[i]=Math.round(data[i*4+3]*distance[i]/radius);
  }
  return weight;
}

export function blendPatch(original: ImageData, patch: ImageData, weights: Uint8Array) {
  for (let i=0;i<weights.length;i++) {
    if (!weights[i]) continue;
    const k=i*4, t=weights[i]/255;
    const a=original.data[k+3]*(1-t), b=patch.data[k+3]*t, alpha=a+b;
    for (let c=0;c<3;c++) original.data[k+c]=alpha ? (original.data[k+c]*a+patch.data[k+c]*b)/alpha : 0;
    original.data[k+3]=alpha;
  }
}
