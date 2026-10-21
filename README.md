# Placas NFC · CRM

CRM simples para controlar vendas (Mercado Livre, Shopee, TikTok Shop, direto), entradas/saídas e entregas.

- **Stack:** Next.js 15 (App Router, Server Actions) + Postgres (Neon, via Vercel Marketplace)
- **Login:** usuário único definido por `ADMIN_USER` / `ADMIN_PASSWORD` (sessão JWT em cookie httpOnly, 7 dias)
- **Tabelas:** criadas automaticamente na primeira requisição (`lib/db.ts`)

## Telas
- **Resumo** — faturamento bruto, líquido, lucro por canal e resultado do mês
- **Vendas** — cadastro/edição de pedidos com taxas, frete e custo
- **Entregas** — pedidos em aberto, status e código de rastreio
- **Entradas e saídas** — despesas e receitas fora dos marketplaces
- **Calculadora de custo** — custo de peça impressa em 3D (filamento do estoque, energia, máquina, falhas, mão de obra, insumos), margens e preço sugerido por canal
- **Estoque de insumos** — filamentos (R$/kg), chips NFC, embalagens, etiquetas; compras com custo médio, baixas e contagem
- **Integrações** — conexão com o Mercado Livre e importação de pedidos

## Rodar local
```bash
vercel env pull .env.local
npm install
npm run dev
```

## Variáveis de ambiente
| Nome | Descrição |
| --- | --- |
| `DATABASE_URL` | Postgres (criada pela integração Neon) |
| `AUTH_SECRET` | segredo do JWT (≥ 32 caracteres) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | credenciais de acesso |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | app do Mercado Livre (opcional) |
| `CRON_SECRET` | protege a importação diária do Mercado Livre (Vercel Cron) |

## Mercado Livre
No app em developers.mercadolivre.com.br (escopos de leitura, pedidos e `offline_access`):
- **Redirect URI:** `https://placas-nfc-crm.vercel.app/api/integracoes/ml/callback`
- **Notificações** (tópicos Orders e Shipments): `https://placas-nfc-crm.vercel.app/api/integracoes/ml/notificacoes`

Depois, em **Integrações**, clique em *Conectar conta do Mercado Livre*. Os pedidos pagos viram vendas (uma por pedido); a importação roda todo dia às 7h (Vercel Cron), a cada notificação do ML e pelo botão *Importar pedidos agora*.

Para trocar a senha: `vercel env rm ADMIN_PASSWORD production` → `vercel env add ADMIN_PASSWORD production` → redeploy.

## Deploy
Push na `main` → deploy de produção automático na Vercel. Branches/PRs → preview. GitHub Actions roda lint, typecheck e build.
