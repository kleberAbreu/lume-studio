# Demonstração pública do Lume Studio

O Nginx encaminha apenas `/lume-demo/` ao serviço de loopback na porta 3141 e sobrescreve o endereço do visitante. A conta de serviço tem banco, diretório e credenciais próprios. O editor privado continua no serviço original. A chave do projeto dedicado concede acesso a Images e Responses. O orçamento configurado no projeto é US$ 10 mensais com bloqueio.

## Operação

Use Node 22.18 ou superior e Python 3 com Pillow. A unidade e o trecho Nginx estão em `ops/`. Instale a release com `demo/` e os módulos `lib/studio/` em `/opt/lume-demo/current`. Mantenha `/etc/lume-demo/api-key` e `/etc/lume-demo/ip-pepper` com proprietário root e modo 0600. Preserve o segredo HMAC e o banco SQLite nas restaurações. O cadastro de uma nova chave pertence exclusivamente ao projeto da demo.

Para pausar chamadas pagas, execute `sudo touch /var/lib/lume-demo/paused`. As imagens editoriais continuam disponíveis. Para liberar, remova esse arquivo. A tabela `calls` em `/var/lib/lume-demo/quota.sqlite` contém identificadores HMAC, identificadores de operação, categoria, mês UTC, reserva e estado. Para consultar o total conservador do mês, some `amount` das linhas do mês corrente ou ainda pendentes e divida por um milhão.

A reserva prévia é US$ 1 por imagem ou US$ 0,06 por prompt. A resposta com consumo válido reduz a reserva ao custo estimado. Falhas após o envio conservam a reserva integral e contam como chamada. Uma reserva interrompida por encerramento do processo permanece pendente e conta nos meses seguintes até reconciliação manual com o provedor. As cotas por IP duram enquanto o banco e o segredo forem preservados. O aplicativo aceita uma operação simultânea por IP e duas no serviço. A alteração de preços ou modelos exige revisão das reservas e das tarifas.

As fotos de visitantes ficam em memória durante a operação. Imagens e textos são enviados à OpenAI após confirmação. O aplicativo não registra os conteúdos. As fotografias editoriais em `public/examples/` foram criadas e editadas no próprio serviço. O identificador de cada exemplo pode ser usado em `?foto=jarra`, `?foto=frasco` e `?foto=bolsa`.

Execute `node --test demo/demo.test.mjs` na raiz. Os testes usam SQLite temporário e provedor simulado. Para verificar produção sem custo, consulte o saldo e compare os exemplos. A solicitação de um novo prompt ou de uma nova imagem faz uma chamada real.
