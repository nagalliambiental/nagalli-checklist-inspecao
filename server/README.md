# API de sincronização (Neon + Render)

API Node/Express que guarda os documentos sincronizados no Postgres do Neon.

## Endpoints

- `GET /health`
- `POST /auth/register` `{ email, password, name }` → `{ token, user }`
- `POST /auth/login` `{ email, password }` → `{ token, user }`
- `POST /sync/push` (Bearer) `{ docs: [{ kind, id, data, deleted, updatedAt }] }`
- `GET /sync/pull?since=<ms>` (Bearer) → `{ serverTime, docs: [...] }`

`kind` usado pelo app: `empreendimento`, `inspection`, `action`.

A nuvem guarda apenas dados de texto. As fotos e os documentos ficam no
aparelho e podem ser exportados pelo recurso de **Backup** do app.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Connection string do Neon (com `sslmode=require`). |
| `JWT_SECRET` | Segredo para assinar os tokens. |
| `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_NAME` | Conta criada automaticamente no primeiro start (opcional). |

A migração do schema roda sozinha ao iniciar.

## Deploy no Render

1. Suba este repositório no GitHub.
2. No Render: **New → Blueprint** e aponte para o repositório (usa o `render.yaml`).
3. Preencha `DATABASE_URL`, `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_NAME`.
4. Deploy. Teste `GET /health`.

## Rodar local

```bash
cd server
cp .env.example .env   # preencha DATABASE_URL e JWT_SECRET
npm install
npm start
```
