import { neon, types } from "@neondatabase/serverless";

// DATE como texto "YYYY-MM-DD": evita deslocamento de fuso ao virar Date.
types.setTypeParser(1082, (v: string) => v);

// Em `next dev` usa o banco de desenvolvimento, nunca o de produção.
const url = process.env.NODE_ENV === "development" ? process.env.DEV_DATABASE_URL : process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não configurada");

export const sql = neon(url);

// Cada migração roda numa transação com lock, e todas as instruções são idempotentes:
// se duas instâncias subirem juntas, a segunda só espera e não duplica nada.
const migracoes = [
  // v1 — CRM original
  () => [
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
    sql`CREATE INDEX IF NOT EXISTS vendas_data_idx ON vendas (data)`,
    sql`CREATE INDEX IF NOT EXISTS movimentacoes_data_idx ON movimentacoes (data)`,
  ],
  // v2 — ERP: empresa, clientes, produtos, estoque, itens de venda, notas, contas, integrações
  () => [
    sql`CREATE TABLE IF NOT EXISTS empresa (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      razao_social TEXT, nome_fantasia TEXT, cnpj TEXT, ie TEXT,
      regime TEXT NOT NULL DEFAULT 'simples',
      uf TEXT NOT NULL DEFAULT 'SP', municipio TEXT, cep TEXT, endereco TEXT,
      csosn_padrao TEXT NOT NULL DEFAULT '102',
      dias_repasse JSONB NOT NULL DEFAULT '{"mercado_livre":0,"shopee":0,"tiktok":0,"outro":0}'
    )`,
    sql`INSERT INTO empresa (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
    sql`CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL, documento TEXT, ie TEXT, contribuinte BOOLEAN NOT NULL DEFAULT false,
      email TEXT, telefone TEXT,
      cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, municipio TEXT, uf TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS clientes_documento_idx ON clientes (documento)`,
    sql`CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, gtin TEXT,
      ncm TEXT, cest TEXT, unidade TEXT NOT NULL DEFAULT 'UN',
      origem SMALLINT NOT NULL DEFAULT 0,
      producao_propria BOOLEAN NOT NULL DEFAULT false,
      preco_venda NUMERIC(12,2) NOT NULL DEFAULT 0,
      custo NUMERIC(12,2) NOT NULL DEFAULT 0,
      estoque_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
      ativo BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`ALTER TABLE vendas ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL`,
    sql`CREATE INDEX IF NOT EXISTS vendas_pedido_idx ON vendas (canal, pedido_externo)`,
    sql`CREATE TABLE IF NOT EXISTS venda_itens (
      id SERIAL PRIMARY KEY,
      venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
      produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
      descricao TEXT NOT NULL,
      quantidade NUMERIC(12,3) NOT NULL CHECK (quantidade > 0),
      valor_unitario NUMERIC(12,2) NOT NULL DEFAULT 0
    )`,
    sql`CREATE INDEX IF NOT EXISTS venda_itens_venda_idx ON venda_itens (venda_id)`,
    // vendas antigas (um produto por venda) viram um item
    sql`INSERT INTO venda_itens (venda_id, descricao, quantidade, valor_unitario)
      SELECT v.id, v.produto, GREATEST(v.quantidade, 1), ROUND(v.valor_bruto / GREATEST(v.quantidade, 1), 2)
      FROM vendas v WHERE NOT EXISTS (SELECT 1 FROM venda_itens i WHERE i.venda_id = v.id)`,
    sql`CREATE TABLE IF NOT EXISTS notas_fiscais (
      id SERIAL PRIMARY KEY,
      chave CHAR(44) NOT NULL UNIQUE,
      numero INTEGER NOT NULL, serie INTEGER NOT NULL, modelo TEXT NOT NULL,
      direcao TEXT NOT NULL CHECK (direcao IN ('emitida','recebida')),
      data_emissao TIMESTAMPTZ NOT NULL,
      emit_nome TEXT, emit_documento TEXT,
      dest_nome TEXT, dest_documento TEXT, dest_uf TEXT,
      valor_total NUMERIC(12,2) NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('autorizada','cancelada')),
      protocolo TEXT,
      xml TEXT NOT NULL,
      xml_cancelamento TEXT,
      venda_id INTEGER REFERENCES vendas(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS notas_venda_idx ON notas_fiscais (venda_id)`,
    sql`CREATE TABLE IF NOT EXISTS estoque_movs (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
      data TIMESTAMPTZ NOT NULL DEFAULT now(),
      quantidade NUMERIC(12,3) NOT NULL,
      motivo TEXT NOT NULL,
      venda_id INTEGER REFERENCES vendas(id) ON DELETE CASCADE,
      observacao TEXT
    )`,
    sql`CREATE INDEX IF NOT EXISTS estoque_movs_produto_idx ON estoque_movs (produto_id)`,
    sql`CREATE INDEX IF NOT EXISTS estoque_movs_venda_idx ON estoque_movs (venda_id)`,
    sql`CREATE TABLE IF NOT EXISTS contas (
      id SERIAL PRIMARY KEY,
      tipo TEXT NOT NULL CHECK (tipo IN ('pagar','receber')),
      descricao TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT 'Outros',
      valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
      vencimento DATE NOT NULL,
      pago_em DATE,
      venda_id INTEGER REFERENCES vendas(id) ON DELETE CASCADE,
      nota_id INTEGER REFERENCES notas_fiscais(id) ON DELETE SET NULL,
      movimentacao_id INTEGER UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    sql`CREATE INDEX IF NOT EXISTS contas_venc_idx ON contas (tipo, vencimento)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS contas_venda_uidx ON contas (venda_id) WHERE venda_id IS NOT NULL`,
    // entradas/saídas antigas viram contas já quitadas
    sql`INSERT INTO contas (tipo, descricao, categoria, valor, vencimento, pago_em, movimentacao_id)
      SELECT CASE m.tipo WHEN 'entrada' THEN 'receber' ELSE 'pagar' END,
        COALESCE(NULLIF(m.descricao, ''), m.categoria), m.categoria, m.valor, m.data, m.data, m.id
      FROM movimentacoes m WHERE m.valor > 0
      ON CONFLICT (movimentacao_id) DO NOTHING`,
    // vendas antigas ativas geram conta a receber (líquido) em aberto
    sql`INSERT INTO contas (tipo, descricao, categoria, valor, vencimento, venda_id)
      SELECT 'receber', 'Venda #' || v.id || ' · ' || CASE v.canal WHEN 'mercado_livre' THEN 'Mercado Livre' WHEN 'shopee' THEN 'Shopee' WHEN 'tiktok' THEN 'TikTok Shop' ELSE 'Direto' END, 'Vendas · ' || CASE v.canal WHEN 'mercado_livre' THEN 'Mercado Livre' WHEN 'shopee' THEN 'Shopee' WHEN 'tiktok' THEN 'TikTok Shop' ELSE 'Direto' END,
        v.valor_bruto - v.taxa_plataforma - v.frete, v.data, v.id
      FROM vendas v
      WHERE v.status_entrega NOT IN ('cancelado','devolvido') AND v.valor_bruto - v.taxa_plataforma - v.frete > 0
      ON CONFLICT (venda_id) WHERE venda_id IS NOT NULL DO NOTHING`,
    sql`CREATE TABLE IF NOT EXISTS integracoes (
      provedor TEXT PRIMARY KEY,
      conta_id TEXT, conta_nome TEXT,
      access_token TEXT, refresh_token TEXT, expira_em TIMESTAMPTZ,
      ultima_sync TIMESTAMPTZ, ultimo_erro TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  ],
];

async function migrar() {
  await sql`CREATE TABLE IF NOT EXISTS schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), versao INTEGER NOT NULL)`;
  for (let v = 1; v <= migracoes.length; v++) {
    const [{ versao } = { versao: 0 }] = (await sql`SELECT versao FROM schema_version WHERE id = 1`) as { versao: number }[];
    if (versao >= v) continue;
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(724100)`,
      ...migracoes[v - 1](),
      sql`INSERT INTO schema_version (id, versao) VALUES (1, ${v})
          ON CONFLICT (id) DO UPDATE SET versao = GREATEST(schema_version.versao, EXCLUDED.versao)`,
    ]);
  }
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  schemaReady ??= migrar().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

// Tipagem das linhas retornadas (o driver devolve Record<string, any>[]).
export const linhas = <T,>(q: PromiseLike<Record<string, unknown>[]>) => Promise.resolve(q).then((r) => r as T[]);
