# WhatsApp Bot Admin + Baileys Worker

Painel profissional para controlar um bot WhatsApp com **Baileys v7.0.0-rc.9** sem executar o bot na Vercel. A Vercel hospeda apenas o frontend Next.js; o processo Baileys roda em um worker Node.js persistente.

## Arquitetura

- **Frontend/Admin Panel**: Next.js 15, App Router, TypeScript, TailwindCSS, componentes estilo shadcn/ui, React Hook Form, Zod, Sonner e Lucide.
- **Bot Worker**: Node.js + Express + Baileys `7.0.0-rc.9`, com API REST protegida por `INTERNAL_API_TOKEN`.
- **Persistência**: Prisma ORM; SQLite para desenvolvimento e PostgreSQL em produção. Sessões Baileys devem ficar em volume/disco persistente ou storage privado, nunca em pasta pública.
- **Comunicação**: o frontend chama rotas internas `/api/bot/*`; essas rotas fazem proxy para o worker usando `Authorization: Bearer INTERNAL_API_TOKEN`. O token interno nunca é exposto ao navegador.

## Variáveis de ambiente

Frontend (`.env.example`):

```bash
NEXT_PUBLIC_BOT_API_URL=https://worker.example.com
ADMIN_TOKEN=change-me-admin-token
INTERNAL_API_TOKEN=change-me-internal-token
DATABASE_URL=file:./dev.db
```

Worker (`worker/.env.example`):

```bash
PORT=8080
NODE_ENV=production
INTERNAL_API_TOKEN=change-me-internal-token
DATABASE_URL=postgresql://bot:bot@localhost:5432/bot?schema=public
SESSION_DIR=/data/baileys-session
MAX_RUNS_PER_HOUR=5
ANALYSIS_COOLDOWN_SECONDS=600
MAX_GROUP_SIZE=1024
```

## Desenvolvimento local

```bash
npm install
npx prisma generate
npm run dev
```

Worker:

```bash
cd worker
npm install
npm run dev
```

> O arquivo `worker/src/server.ts` entrega a API, segurança, SSE, histórico e stubs operacionais. Para produção, conecte as funções reais do Baileys usando `useMultiFileAuthState(process.env.SESSION_DIR)` e persista `SESSION_DIR` em volume privado.

## Deploy na Vercel

1. Configure `NEXT_PUBLIC_BOT_API_URL`, `ADMIN_TOKEN` e `INTERNAL_API_TOKEN` no projeto Vercel.
2. Faça deploy somente do frontend Next.js.
3. Não coloque sessão Baileys, `auth_info`, tokens ou credenciais em `public/`.
4. O painel exige login com `ADMIN_TOKEN` e todas as páginas internas são protegidas por middleware.

## Deploy do Bot Worker

Use VPS, Railway, Render, Fly.io ou Docker. O processo precisa ser persistente por causa de WebSocket, conexão WhatsApp e sessão contínua.

### Docker Compose opcional

```bash
docker compose up -d --build
```

O compose cria PostgreSQL e um volume `/data/baileys-session` para sessão persistente.

## Gerar código de pareamento

1. Entre no painel.
2. Abra **Pareamento**.
3. Informe o telefone com DDI, por exemplo `5511999999999`.
4. Clique em **Gerar código de pareamento**.
5. No WhatsApp, acesse: **Aparelhos conectados > Conectar com número de telefone**.

## Segurança e uso permitido

- Todas as rotas do worker, exceto `GET /health`, exigem `Authorization: Bearer INTERNAL_API_TOKEN`.
- O painel não implementa disparo em massa, spam ou automação para adicionar pessoas sem consentimento.
- A análise de grupo deve ser usada somente em grupos próprios, com autorização e finalidade interna permitida.
- O histórico salva apenas `inviteHash` parcial, nunca o link completo.
- Logs sanitizam tokens e não devem exibir credenciais ou sessão.

## Rotas do Worker

- `GET /health`
- `GET /bot/status`
- `POST /bot/pairing-code`
- `POST /bot/disconnect`
- `POST /bot/logout`
- `POST /groups/analyze`
- `GET /groups/history`
- `GET /groups/history/:id`
- `DELETE /groups/history/:id`
- `GET /logs/stream`
