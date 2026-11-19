const maxBytes = 8 * 1024 * 1024;
const extensions = new Map([['audio/webm', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg', 'ogg'], ['audio/wav', 'wav']]);
const reply = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});

export async function transcribe(request, headers, upstream) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const extension = extensions.get(type);
  if (!extension) return reply({error: 'Formato de áudio incompatível. Tente outro navegador.'}, 415);
  const tooLarge = () => reply({error: 'A gravação excedeu 8 MB. Dite um trecho mais curto.'}, 413);
  if (Number(request.headers.get('content-length')) > maxBytes) return tooLarge();
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request.body ?? []) {
      size += chunk.byteLength;
      if (size > maxBytes) return tooLarge();
      chunks.push(chunk);
    }
    if (!size) return reply({error: 'A gravação ficou vazia. Tente ditar novamente.'}, 400);
    const form = new FormData();
    form.set('file', new Blob(chunks, {type}), 'ditado.' + extension);
    form.set('model', 'gpt-transcribe');
    form.set('language', 'pt');
    const response = await upstream('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers, body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
    });
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) return reply({error: 'Confira se a chave da OpenAI tem acesso à transcrição.'}, response.status);
      if (response.status === 429) return reply({error: 'Limite de uso da OpenAI atingido. Aguarde e confira os créditos da chave.'}, 429);
      if (response.status === 400) return reply({error: 'Não foi possível ler o áudio. Grave outro trecho.'}, 422);
      return reply({error: 'O serviço de transcrição está indisponível. Tente enviar o áudio novamente.'}, 502);
    }
    const result = await response.json();
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    return text ? reply({text}) : reply({error: 'Não foi possível reconhecer a fala. Grave outro trecho.'}, 422);
  } catch {
    return reply({error: 'A conexão foi interrompida. Tente enviar o áudio novamente.'}, 502);
  }
}
