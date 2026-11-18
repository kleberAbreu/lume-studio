import {randomInt, randomUUID} from 'node:crypto';

const approaches = ['fotografia documental', 'ilustração editorial', 'natureza-morta', 'colagem de papel',
  'cena cinematográfica', 'gravura', 'miniatura em stop motion', 'fotografia de rua', 'aquarela', 'retrato ambiental'];
const normalize = text => text.toLocaleLowerCase('pt-BR').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const reply = (body, status) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});

export async function generateIdea(request, headers, upstream) {
  if (Number(request.headers.get('content-length')) > 48000) return reply({error:'Histórico de ideias muito longo.'},413);
  const data = await request.json().catch(() => null);
  const recent = data?.recent;
  if (!Array.isArray(recent) || recent.length > 6 || !recent.every(s => typeof s==='string' && s.length<=900))
    return reply({error:'Histórico de ideias inválido.'},400);
  const previous = new Set(recent.map(normalize));
  for (let attempt=0; attempt<2; attempt++) {
    const input = [
      {role:'developer', content:'Crie um único prompt de imagem original em português brasileiro, pronto para uso, com 25 a 60 palavras. Invente uma cena específica com assunto, ação, composição e luz. Use a técnica sorteada e varie os temas. Evite repetir as ideias recentes. Responda apenas com o prompt, sem título, aspas ou explicações.'},
      {role:'user', content:JSON.stringify({tecnica:approaches[randomInt(approaches.length)], variacao:randomUUID(), ideiasRecentes:recent})},
    ];
    const response = await upstream('https://api.openai.com/v1/responses', {
      method:'POST', headers:{...headers,'Content-Type':'application/json'},
      signal:AbortSignal.any([request.signal, AbortSignal.timeout(45000)]),
      body:JSON.stringify({model:'gpt-6.2-sol', input, reasoning:{effort:'low'}, max_output_tokens:450, store:false}),
    });
    if (!response.ok) {
      const errors = {401:'Confira a chave da OpenAI.',403:'Esta chave não tem acesso ao GPT-6.2 Sol.',
        404:'GPT-6.2 Sol indisponível para esta chave.',429:'Confira os créditos ou tente novamente em instantes.'};
      return reply({error:'Falha ao sortear a ideia. '+(errors[response.status] ?? 'Tente novamente.')},response.status);
    }
    const result = await response.json();
    const idea = result.output?.filter(item => item.type==='message')
      .flatMap(item => item.content ?? []).filter(part => part.type==='output_text').map(part => part.text).join('').trim();
    if (result.status!=='completed' || !idea || idea.length>900) break;
    if (!previous.has(normalize(idea))) return reply({idea},200);
  }
  return reply({error:'O modelo não devolveu uma ideia nova e completa. Tente novamente.'},502);
}
