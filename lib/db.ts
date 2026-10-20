import { neon } from "@neondatabase/serverless";

// Em `next dev` usa o banco de desenvolvimento, para nunca mexer nos dados reais.
const url = (process.env.NODE_ENV === "development" && process.env.DEV_DATABASE_URL) || process.env.DATABASE_URL;
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
    sql`CREATE TABLE IF NOT EXISTS kanban_boards (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      cor TEXT NOT NULL DEFAULT 'azul',
      posicao INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS kanban_colunas (
      id SERIAL PRIMARY KEY,
      board_id INTEGER NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT 'cinza',
      limite INTEGER,
      posicao INTEGER NOT NULL DEFAULT 0
    )`,
    sql`CREATE TABLE IF NOT EXISTS kanban_cards (
      id SERIAL PRIMARY KEY,
      coluna_id INTEGER NOT NULL REFERENCES kanban_colunas(id) ON DELETE CASCADE,
      titulo TEXT NOT NULL,
      descricao TEXT,
      etiqueta TEXT,
      cor TEXT,
      prazo DATE,
      responsavel TEXT,
      posicao INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS ideias (
      id SERIAL PRIMARY KEY,
      titulo TEXT NOT NULL,
      descricao TEXT,
      categoria TEXT,
      status TEXT NOT NULL DEFAULT 'nova',
      votos INTEGER NOT NULL DEFAULT 0,
      custo_estimado NUMERIC(12,2),
      preco_estimado NUMERIC(12,2),
      link TEXT,
      autor TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS kanban_colunas_board_idx ON kanban_colunas (board_id, posicao)`,
    sql`CREATE INDEX IF NOT EXISTS kanban_cards_coluna_idx ON kanban_cards (coluna_id, posicao)`,
    sql`CREATE INDEX IF NOT EXISTS vendas_data_idx ON vendas (data)`,
    sql`CREATE INDEX IF NOT EXISTS vendas_pedido_idx ON vendas (canal, pedido_externo)`,
    sql`CREATE INDEX IF NOT EXISTS movimentacoes_data_idx ON movimentacoes (data)`,
  ]).catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}
