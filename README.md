# Placas NFC · ERP

Sistema de gestão da loja: vendas por canal (Mercado Livre, Shopee, TikTok Shop, direto), estoque, notas fiscais, financeiro e entregas.

**Stack:** Next.js 15 (App Router, Server Actions) · Postgres Neon (Vercel Marketplace, região gru1) · Vercel.

## Módulos
| Menu | O que faz |
| --- | --- |
| Início | Faturamento, líquido, margem por canal, resultado do mês, alertas (a enviar, sem nota, estoque baixo, vencidos) |
| Clientes / Produtos | Cadastros com dados fiscais (CPF/CNPJ validados, NCM, origem, CEST, GTIN) |
| Pedidos de venda | Pedido com vários itens; baixa estoque e gera conta a receber (líquido de taxa e frete) automaticamente |
| Notas fiscais | Importa XML autorizado (nfeProc) e cancelamento (procEventoNFe); vincula à venda; notas de compra viram contas a pagar pelas duplicatas |
| Entregas | Pedidos a enviar/em trânsito, rastreio; cancelar/devolver devolve estoque |
| Estoque | Saldo, mínimo, giro de 30 dias e cobertura |
| Contas a receber / pagar / Fluxo de caixa | Baixa, estorno, parcelamento, vencidos, saldo projetado |
| Integrações | Mercado Livre (OAuth + importação diária). Shopee e TikTok dependem de aprovação das plataformas |
| Configurações | CNPJ/IE, CSOSN padrão, dias de repasse por canal |

## Emissão de NF-e
A empresa emite no **emissor gratuito do Sebrae**, que não tem API. O pedido de venda mostra os dados prontos para digitar
(CFOP sugerido para Simples Nacional/SP, CSOSN, NCM, destinatário) e lista o que falta para a nota não ser rejeitada.
Depois de autorizada, importe o XML no pedido ou em Notas fiscais. As sugestões fiscais devem ser conferidas com o contador.

## Desenvolvimento
```bash
vercel env pull .env.local   # traz DATABASE_URL (produção) e DEV_DATABASE_URL (desenvolvimento)
npm install
npm run dev                  # usa DEV_DATABASE_URL — nunca o banco de produção
npm test                     # testes unitários
TEST_DATABASE_URL="$DEV_DATABASE_URL" npm test   # + integração (APAGA e recria o banco indicado)
```
Migrações ficam em `lib/db.ts`, rodam sozinhas na primeira requisição, são idempotentes e protegidas por lock.

## Variáveis de ambiente
| Nome | Uso |
| --- | --- |
| `DATABASE_URL` / `DEV_DATABASE_URL` | Postgres de produção / desenvolvimento (integração Neon) |
| `AUTH_SECRET` | assinatura da sessão (≥ 32 caracteres) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | login |
| `CRON_SECRET` | protege `/api/cron/ml` (Vercel Cron, diário) |
| `ML_CLIENT_ID` / `ML_CLIENT_SECRET` | app do Mercado Livre (opcional) |

## Deploy
Push na `main` → produção (quando a integração GitHub da Vercel estiver conectada). GitHub Actions roda lint, typecheck, testes e build.
