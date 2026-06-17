# WhatsApp Baileys Admin para Render

Aplicação única para Render que junta painel admin Next.js 15, API Express interna, Bot WhatsApp com Baileys `7.0.0-rc.9`, Prisma e PostgreSQL. Não usa Vercel, serverless nem Edge Functions: o processo Node permanece vivo para manter WebSocket, reconexão e sessão do WhatsApp.

## Arquitetura

- `server.ts` sobe um servidor Express persistente na porta `PORT` e acopla o Next.js App Router.
- Rotas `/api/*` são atendidas pelo Express antes do Next e controlam autenticação, bot, histórico, downloads, logs SSE e configurações.
- `src/server/services/bot.ts` transforma o Baileys em serviço controlável por API: `startBot`, `requestPairingCode`, `analyzeGroup`, `disconnect`, `logout` e `getStatus`.
- `SESSION_PATH` guarda o `auth_info` fora da pasta pública.
- `EXPORT_PATH` guarda relatórios TXT/CSV.
- `LOG_PATH` fica reservado para logs em disco e o banco salva `SystemLog`.
- PostgreSQL da Render é usado em produção; SQLite é apenas uma alternativa para desenvolvimento local caso você ajuste o provider do Prisma em um branch local.

## Variáveis de ambiente

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
ADMIN_TOKEN=troque-este-token
INTERNAL_API_TOKEN=troque-este-token-interno
SESSION_PATH=/data/auth_info
EXPORT_PATH=/data/exports
LOG_PATH=/data/logs
PORT=10000
```

## Rodando localmente

1. Instale dependências:
   ```bash
   npm install
   ```
2. Configure `.env` com base em `.env.example` e um PostgreSQL local.
3. Gere o Prisma Client:
   ```bash
   npm run prisma:generate
   ```
4. Aplique migrações quando existir uma migration criada:
   ```bash
   npx prisma migrate dev
   ```
5. Rode o app persistente:
   ```bash
   npm run dev
   ```
6. Acesse `http://localhost:10000/login` e entre com `ADMIN_TOKEN`.

## Deploy na Render

### Banco PostgreSQL

1. Crie um PostgreSQL na Render ou use o `render.yaml`, que declara `whatsapp-baileys-db`.
2. Copie a `connectionString` para `DATABASE_URL` se criar manualmente.

### Web Service

1. Crie um **Web Service** a partir deste repositório.
2. Use Docker/blueprint `render.yaml` ou configure manualmente **Build Command** como `yarn` e **Start Command** como `yarn start`. O `start` agora também cria o build de produção, evitando o erro `Cannot find module dist/server.js` quando a Render executa apenas `yarn` no build.
3. Configure o health check em `/api/health`.
4. Garanta `PORT=10000`.
5. Defina `ADMIN_TOKEN` e `INTERNAL_API_TOKEN` como secrets. Configure também `DATABASE_URL`; sem ela o app sobe, mas o banco aparecerá como indisponível até a variável ser adicionada.

### Persistent Disk

Adicione um disco persistente montado em `/data`. O blueprint já cria:

- `/data/auth_info` para sessão Baileys.
- `/data/exports` para TXT/CSV.
- `/data/logs` para logs em disco.

Redeploys não apagam a sessão se o disco continuar anexado ao serviço.

## Scripts

- `npm run dev` — sobe Express + Next em desenvolvimento.
- `npm run build` — gera Prisma Client, build Next e compila o servidor Express.
- `npm run start` — caminho compatível com o padrão da Render: gera Prisma Client, aplica `prisma db push` somente quando `DATABASE_URL` existir, executa `next build` e sobe `tsx server.ts` em processo persistente.
- `npm run prisma:generate` — gera Prisma Client.
- `npm run prisma:migrate` — roda `prisma migrate deploy`.
- `npm run render:build` — instalação limpa e build para Render.
- `npm run render:start` — alias de produção para o mesmo start persistente usado pela Render.

## Pareamento WhatsApp pela interface

1. Abra **Pareamento**.
2. Digite o número com DDI, por exemplo `5511999999999`.
3. Clique em **Gerar código de pareamento**.
4. No WhatsApp, siga: **Aparelhos conectados > Conectar com número de telefone**.
5. Informe o código exibido no painel, no formato `1234-5678`.

O fluxo não usa terminal, `readline` nem QR Code como caminho principal.

## Análise de grupos

Use apenas em grupos próprios, com autorização e consentimento. O painel exige aviso de uso autorizado antes da análise. O backend valida links `https://chat.whatsapp.com/...`, entra no grupo, aguarda sincronização, busca `groupMetadata`, sai imediatamente, resolve PN/LID, gera TXT/CSV e salva histórico no PostgreSQL. O link completo não é salvo; apenas hash parcial do convite.

## Logs

A tela **Logs** consome `/api/logs/stream` por Server-Sent Events. Logs sensíveis são sanitizados para não exibir tokens, sessão, `auth_info` ou credenciais.

## Erro de sessão

Se a sessão corromper ou o WhatsApp fizer logout:

1. Abra **Dashboard**.
2. Clique em **Apagar sessão**.
3. Volte para **Pareamento** e gere um novo código.
4. Confirme que `/api/health` mostra disco persistente OK.

## Redeploy sem perder sessão

Nunca remova o Persistent Disk da Render. O deploy pode recriar o container, mas `/data/auth_info`, `/data/exports` e `/data/logs` permanecem no disco anexado.

## Segurança

- Todas as rotas privadas exigem cookie httpOnly de admin ou `Authorization: Bearer INTERNAL_API_TOKEN`.
- `auth_info` nunca fica em `public/` e nunca é enviado ao frontend.
- Há rate limit global, validação Zod e auditoria para login, pairing, análise, logout e apagar sessão.
- Não há disparo em massa, spam ou automação para abordar contatos sem consentimento.
