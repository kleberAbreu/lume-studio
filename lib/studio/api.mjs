import { estimateCost, model } from './costs.ts';
import { isReferenceRole, maxReferences, maxUploadBytes, referenceRoles, validImage } from './references.ts';
import { generateIdea } from './idea.mjs';
import { transcribe } from './transcribe.mjs';
export const MODEL = model;
const base = 'https://api.openai.com/v1';
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
    if (path === '/api/transcribe') return await transcribe(request, headers, upstream);
    if (path === '/api/idea') return await generateIdea(request, headers, upstream);
    if (path === '/api/connect') {
      const result = await upstream(base + '/models/' + MODEL, {headers});
      return result.ok ? json({connected:true}) : fail(apiError(result.status),result.status);
    }
    if (path !== '/api/images') return fail('Rota desconhecida.', 404);
    if (Number(request.headers.get('content-length')) > maxUploadBytes + 100000) return fail('O envio completo deve ter até 20 MB.', 413);
    const data = await request.formData().catch(() => null);
    if (!data) return fail('Envio de imagem inválido.');
    const mode = data.get('mode');
    let prompt = String(data.get('prompt') || '').trim();
    const size = data.get('size'), quality = data.get('quality');
    if (!['create','edit','print'].includes(mode) || !['1024x1024','1536x1024','1024x1536'].includes(size) || !['low','medium','high'].includes(quality)) return fail('Parâmetros de geração inválidos.');
    if ((!prompt && mode !== 'print') || prompt.length > 12000) return fail('Escreva um prompt de até 12.000 caracteres.');
    const editing = mode !== 'create';
    if (mode === 'print') prompt = 'Leia o pedido de criação visual contido na captura de tela de uma conversa e produza a imagem que ele descreve. Omita a interface e os elementos da conversa, salvo se forem solicitados no pedido. Instruções adicionais do usuário: ' + prompt;
    const mask = data.get('mask');
    if (mask !== null && (mode !== 'edit' || typeof mask === 'string' || mask.type !== 'image/png' || !mask.size || mask.size > 4 * 1024 * 1024)) return fail('Máscara de edição inválida.');
    if (mask) prompt = 'Edite a área indicada pela máscara, mantendo o enquadramento e o contexto da foto. Pedido: ' + prompt;
    const references = data.getAll('reference');
    const roles = data.getAll('referenceRole');
    if (references.length !== roles.length || references.length > maxReferences ||
        (references.length && mode !== 'edit') || !roles.every(isReferenceRole) ||
        !references.every(validImage)) return fail('Confira os arquivos e as funções das referências.');
    if (references.length) {
      const instructions = roles.map((role, i) => 'Foto ' + (i + 2) + ': referência de ' + referenceRoles[role].toLowerCase() + '.');
      prompt = ['Edite a foto 1, que é a imagem principal. Use cada foto adicional apenas para orientar o aspecto indicado.',
        ...instructions, prompt].join('\n');
    }
    let body;
    const args = {model:MODEL, prompt, size, quality, n:'1', output_format:'png'};
    if (editing) {
      const file = data.get('image');
      if (!validImage(file)) return fail('Envie um PNG, JPEG ou WebP de até 20 MB.');
      body = new FormData();
      for (const [name,value] of Object.entries(args)) body.set(name,value);
      if (mask) body.set('mask', mask, 'mascara.png');
      const totalBytes = references.reduce((sum, photo) => sum + photo.size, file.size + (mask?.size ?? 0));
      if (totalBytes > maxUploadBytes) return fail('O envio completo deve ter até 20 MB.', 413);
      if (references.length) {
        for (const [i, photo] of [file, ...references].entries()) {
          body.append('image[]', photo, 'foto-' + (i + 1) + '.' + photo.type.split('/')[1]);
        }
      } else {
        body.set('image', file, 'referencia.' + file.type.split('/')[1]);
      }
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
    if (path === '/api/idea') return fail('Não foi possível obter a ideia da OpenAI. Tente novamente.',502);
    return fail('A conexão com a OpenAI foi interrompida. Confira o histórico de uso antes de repetir o pedido.',502);
  }
}
