import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");

export const sql = neon(url);

let schemaReady: Promise<unknown> | null = null;

// Cria as tabelas na primeira requisição (idempotente).
export function ensureSchema() {
  schemaReady ??= sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS vendas (
      id SERIAL PRIMARY KEY,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      canal TEXT NOT NULL,
      pedido_externo TEXT,
      cliente TEXT,
      produto TEXT NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      valor_bruto NUMERIC(12,2) NOT NULL DEFAULT 0,
      taxa_plataforma NUMERIC(12,2) NOT NULL DEFAULT 0,
      frete NUMERIC(12,2) NOT NULL DEFAULT 0,
      custo_produto NUMERIC(12,2) NOT NULL DEFAULT 0,
      status_entrega TEXT NOT NULL DEFAULT 'a_enviar',
      codigo_rastreio TEXT,
      observacoes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS movimentacoes (
      id SERIAL PRIMARY KEY,
      data DATE NOT NULL DEFAULT CURRENT_DATE,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
      categoria TEXT NOT NULL,
      descricao TEXT,
      valor NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS integracoes (
      provedor TEXT PRIMARY KEY,
      conta_id TEXT, conta_nome TEXT,
      access_token TEXT, refresh_token TEXT, expira_em TIMESTAMPTZ,
      ultima_sync TIMESTAMPTZ, ultimo_erro TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS vendas_data_idx ON vendas (data)`,
    sql`CREATE INDEX IF NOT EXISTS vendas_pedido_idx ON vendas (canal, pedido_externo)`,
    sql`CREATE INDEX IF NOT EXISTS movimentacoes_data_idx ON movimentacoes (data)`,
  ]).catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}
