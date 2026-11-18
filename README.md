# Lume Studio

Estúdio privado em português para gerar e editar imagens com GPT Image 2.6 Sunburst. Aceita prompts, prints de conversas e imagens de referência. O histórico mantém as variações e o custo estimado em dólares por operação e conversa.

## Hostinger com Node.js gerenciado

Importe o repositório ou o ZIP no hPanel como aplicação Next.js. Escolha Node.js 24, instale com `npm ci`, compile com `npm run build` e inicie com `npm start`. Nas variáveis de ambiente, configure `LUME_KLEBER_PASSWORD` e `LUME_RENATO_PASSWORD` para os logins individuais e `LUME_SESSION_SECRET` com um valor aleatório de pelo menos 32 caracteres e `APP_ORIGIN` com o endereço HTTPS público (por exemplo, `https://www.kleberabreu.com.br`). A configuração de produção depende do domínio e das permissões da conta na Hostinger.

## VPS com Docker Compose

Copie `.env.example` para `.env`, preencha as variáveis e proteja o arquivo com `chmod 600 .env`. Execute `docker compose up -d --build` a partir deste diretório. A porta padrão do host é 3137, vinculada apenas ao loopback. Para alterá-la, defina `LUME_PORT` no arquivo de ambiente. O caminho público é https://www.kleberabreu.com.br/img_editor. Configure o proxy HTTPS existente para encaminhar apenas /img_editor e seus descendentes a essa porta, preservando caminho e Host. Para Nginx, use o trecho de deploy/nginx-location.conf dentro do virtual host existente, valide com nginx -t e só então recarregue. Para Nginx, use `client_max_body_size 21m` e `proxy_read_timeout 300s` no virtual host da aplicação.

## OpenAI e histórico

A chave da OpenAI pode ser fornecida por sessão na interface ou em `OPENAI_API_KEY` no servidor. Use HTTPS para o login e para enviar a chave. Cada geração e edição utiliza os créditos da chave correspondente. A aplicação estima o custo com os tokens informados na resposta. A galeria sincroniza versões e rascunhos por conta em SQLite no volume Docker `gallery` (/app/gallery). Mantenha esse volume ao recriar o container e use a API de backup do SQLite para cópias consistentes. Na instalação sem Docker, configure `LUME_GALLERY_DIR` em um disco persistente gravável pelo processo.

Ao abrir o estúdio no navegador e no domínio em que as imagens antigas foram criadas, a conta autenticada envia o histórico local ao VPS. Falhas de conexão permitem nova tentativa. No outro aparelho, entre na mesma conta e abra a galeria. “Salvar rascunho” guarda a imagem, o prompt, as seleções, as referências e a qualidade. Links de foto abrem apenas a versão escolhida. Links de projeto mostram as imagens atuais e futuras desse projeto. O titular pode desativá-los em “Compartilhar”.

**Selecionar objeto** usa o MagicTouch do MediaPipe no navegador. O primeiro uso baixa o modelo e o runtime do próprio estúdio. Clique no objeto e refine o contorno com o pincel, a borracha ou a proteção. O build baixa e verifica o modelo antes de empacotá-lo.

**Sortear ideia** usa a chave da sessão ou do servidor para gerar um prompt em português com GPT-6.2 Sol. Cada clique usa créditos de texto. O painel de custos acompanha as operações de imagem.

## Desenvolvimento

Com Node.js 24, execute `npm ci`, configure o ambiente em `.env.local` e execute `npm run dev`. Para verificar, rode `npm test` e `npm run build`. O diretório `lib/studio` contém a integração da API, o cálculo de custos e a persistência da galeria.
