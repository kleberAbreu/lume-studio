// Standard synchronous PNG pricing, checked 2026-11-17.
// https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst
const rates = { text: 5000, image: 8000, output: 30000, cachedText: 1250, cachedImage: 2000 };
export const model = 'gpt-image-2.6-sunburst';
export type Receipt = {
  model: string;
  rateDate: string;
  nanoUsd: number;
  text: number;
  image: number;
  output: number;
  cachedText: number;
  cachedImage: number;
};
type Usage = {
  input_tokens?: number;
  input_tokens_details?: {text_tokens?: number; image_tokens?: number};
  output_tokens?: number;
  output_tokens_details?: {image_tokens?: number; text_tokens?:number};
  cached_tokens?: number;
  cached_tokens_details?: {cached_text_tokens?: number; cached_image_tokens?: number};
};
function count(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}
export function estimateCost(usage?: Usage | null): Receipt | null {
  const text = usage?.input_tokens_details?.text_tokens;
  const image = usage?.input_tokens_details?.image_tokens;
  const output = usage?.output_tokens_details?.image_tokens ?? usage?.output_tokens;
  if (!count(text) || !count(image) || !count(output)) return null;
  if (usage?.input_tokens != null && usage.input_tokens !== text + image) return null;
  const cachedText = usage?.cached_tokens_details?.cached_text_tokens ?? 0;
  const cachedImage = usage?.cached_tokens_details?.cached_image_tokens ?? 0;
  if (!count(cachedText) || !count(cachedImage) || cachedText > text || cachedImage > image) return null;
  if (usage?.cached_tokens != null && usage.cached_tokens !== cachedText + cachedImage) return null;
  const nanoUsd = (text - cachedText) * rates.text + cachedText * rates.cachedText
    + (image - cachedImage) * rates.image + cachedImage * rates.cachedImage + output * rates.output;
  if (!Number.isSafeInteger(nanoUsd)) return null;
  return {model, rateDate:'2026-11-17', text, image, output, cachedText, cachedImage, nanoUsd};
}
type MeteredVersion = {original?:boolean; receipt?:Receipt | null};
export function conversationCost(versions: MeteredVersion[]) {
  let nanoUsd = 0, known = 0, missing = 0;
  for (const version of versions) {
    if (version.original) continue;
    if (version.receipt == null) missing++;
    else {
      known++;
      nanoUsd += version.receipt.nanoUsd;
    }
  }
  return {nanoUsd, known, missing};
}
const currency = new Intl.NumberFormat('pt-BR', {
  style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:8
});
export const dollars = (nanoUsd:number) => currency.format(nanoUsd / 1e9);
export function costLabel(total:ReturnType<typeof conversationCost>) {
  if (!total.known && total.missing) return 'Sem dados';
  return dollars(total.nanoUsd) + (total.missing ? ' (parcial)' : '');
}
