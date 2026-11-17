import { estimateCost, model } from './costs.ts';
export const MODEL = model;
const base = 'https://api.openai.com/v1';
const supported = new Set(['image/png', 'image/jpeg', 'image/webp']);
const json = (body, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
const fail = (message, status = 400) => json({error:message}, status);
function apiError(status, code) {
  if (status === 401) return 'A OpenAI recusou a chave. Confira a chave em Conexão API.';
  if (status === 403 || status === 404) return 'Seu projeto não tem acesso ao GPT Image 2.6 Sunburst. Confira as permissões e a verificação da organização na OpenAI.';
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached') return 'Seu projeto atingiu o limite de créditos da OpenAI. Confira o faturamento na plataforma.';
  if (status === 429) return 'A OpenAI atingiu o limite de uso do projeto. Aguarde um pouco e confira seus créditos.';
  if (code === 'moderation_blocked' || code === 'content_policy_violation') return 'A OpenAI recusou este conteúdo. Revise a descrição ou a imagem e tente novamente.';
  return 'A OpenAI não concluiu o pedido (HTTP ' + status + '). Revise os parâmetros ou tente novamente.';
}
export async function handleStudio(request, env, upstream = fetch) {
  const path = new URL(request.url).pathname;
  if (path === '/api/status' && request.method === 'GET') return json({configured: Boolean(env.OPENAI_API_KEY)});
  if (request.method !== 'POST') return fail('Método inválido.', 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Origem inválida.', 403);
  const key = request.headers.get('x-lume-key') || env.OPENAI_API_KEY;
  if (!key) return fail('Conecte uma chave da OpenAI para continuar.', 401);
  const headers = {Authorization:'Bearer ' + key};
  try {
    if (path === '/api/connect') {
      const result = await upstream(base + '/models/' + MODEL, {headers});
      return result.ok ? json({connected:true}) : fail(apiError(result.status),result.status);
    }
    if (path !== '/api/images') return fail('Rota desconhecida.', 404);
    const maxBytes = 20 * 1024 * 1024;
    if (Number(request.headers.get('content-length')) > maxBytes + 100000) return fail('Use uma imagem de até 20 MB.', 413);
    const data = await request.formData().catch(() => null);
    if (!data) return fail('Envio de imagem inválido.');
    const mode = data.get('mode');
    let prompt = String(data.get('prompt') || '').trim();
    const size = data.get('size'), quality = data.get('quality');
    if (!['create','edit','print'].includes(mode) || !['1024x1024','1536x1024','1024x1536'].includes(size) || !['low','medium','high'].includes(quality)) return fail('Parâmetros de geração inválidos.');
    if ((!prompt && mode !== 'print') || prompt.length > 12000) return fail('Escreva um prompt de até 12.000 caracteres.');
    const editing = mode !== 'create';
    if (mode === 'print') prompt = 'Leia o pedido de criação visual contido na captura de tela de uma conversa e produza a imagem que ele descreve. Omita a interface e os elementos da conversa, salvo se forem solicitados no pedido. Instruções adicionais do usuário: ' + prompt;
    let body;
    const args = {model:MODEL, prompt, size, quality, n:'1', output_format:'png'};
    if (editing) {
      const file = data.get('image');
      if (!file || typeof file === 'string' || !supported.has(file.type) || !file.size || file.size > maxBytes) return fail('Envie um PNG, JPEG ou WebP de até 20 MB.');
      body = new FormData();
      for (const [name,value] of Object.entries(args)) body.set(name,value);
      body.set('image',file,'referencia.' + file.type.split('/')[1]);
    } else {
      headers['Content-Type']='application/json';
      body=JSON.stringify({...args,n:1});
    }
    const result = await upstream(base + '/images/' + (editing ? 'edits':'generations'), {method:'POST',headers,body});
    if (!result.ok) {
      const error = await result.json().catch(() => ({}));
      return fail(apiError(result.status,error?.error?.code),result.status);
    }
    const resultData = await result.json();
    const encoded = resultData?.data?.[0]?.b64_json;
    if (!encoded) return fail('A OpenAI devolveu uma resposta sem imagem. Você pode tentar novamente.',502);
    return json({image:encoded,model:MODEL,receipt:estimateCost(resultData.usage)});
  } catch {
    return fail('A conexão com a OpenAI foi interrompida. Confira o histórico de uso antes de repetir o pedido.',502);
  }
}
