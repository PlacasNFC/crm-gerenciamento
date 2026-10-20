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

Para trocar a senha: `vercel env rm ADMIN_PASSWORD production` → `vercel env add ADMIN_PASSWORD production` → redeploy.

## Deploy
Push na `main` → deploy de produção automático na Vercel. Branches/PRs → preview. GitHub Actions roda lint, typecheck e build.
