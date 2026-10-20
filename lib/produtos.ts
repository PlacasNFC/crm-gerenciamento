// Produtos, custos e vínculos de anúncios (acesso ao banco).
import { sql } from "./db";
import { CANAIS, type Canal } from "./constants";
import { expandirLinha, type CanalConfig, type ItemVenda, type ProdutoOpcao, type Vinculo } from "./itens";

// Custo atual de cada produto: custo extra + Σ (quantidade × custo unitário do insumo).
export async function custosProdutos(ids?: number[]): Promise<Map<number, number>> {
  const filtro = ids ?? null;
  const rows = (await sql`SELECT p.id, p.custo_extra + COALESCE((SELECT SUM(pi.quantidade * i.custo_unitario)
      FROM produto_insumos pi JOIN insumos i ON i.id = pi.insumo_id WHERE pi.produto_id = p.id), 0) AS custo
    FROM produtos p WHERE ${filtro}::int[] IS NULL OR p.id = ANY(${filtro}::int[])`) as { id: number; custo: string }[];
  return new Map(rows.map((r) => [r.id, Number(r.custo)]));
}

export async function configCanais(): Promise<Record<Canal, CanalConfig>> {
  const rows = (await sql`SELECT * FROM canais_config`) as ({ canal: string } & Record<keyof CanalConfig, string>)[];
  const cfg = {} as Record<Canal, CanalConfig>;
  for (const c of Object.keys(CANAIS) as Canal[]) {
    const r = rows.find((x) => x.canal === c);
    cfg[c] = {
      taxa_pct: Number(r?.taxa_pct ?? 0),
      taxa_fixa: Number(r?.taxa_fixa ?? 0),
      frete_estimado: Number(r?.frete_estimado ?? 0),
      custo_flex: Number(r?.custo_flex ?? 0),
    };
  }
  return cfg;
}

// Produtos ativos para o formulário de venda.
export async function opcoesProdutos(): Promise<ProdutoOpcao[]> {
  const [prods, precos, custos] = await Promise.all([
    sql`SELECT id, nome, sku FROM produtos WHERE ativo ORDER BY nome`,
    sql`SELECT produto_id, canal, preco FROM produto_precos`,
    custosProdutos(),
  ]);
  return (prods as { id: number; nome: string; sku: string | null }[]).map((p) => ({
    ...p,
    custo: custos.get(p.id) ?? 0,
    precos: Object.fromEntries(
      (precos as { produto_id: number; canal: string; preco: string }[])
        .filter((x) => x.produto_id === p.id)
        .map((x) => [x.canal, Number(x.preco)]),
    ),
  }));
}

const json = (v: unknown) => JSON.stringify(v);

// Insere os itens de uma venda (para usar dentro de sql.transaction).
export const sqlInserirItens = (vendaId: number, itens: ItemVenda[]) =>
  sql`INSERT INTO venda_itens (venda_id, produto_id, anuncio_id, variacao_id, descricao, quantidade, valor, custo_unitario, custo_manual)
    SELECT ${vendaId}, x.* FROM jsonb_to_recordset(${json(itens)}::jsonb) AS x(produto_id int, anuncio_id text, variacao_id text,
      descricao text, quantidade int, valor numeric, custo_unitario numeric, custo_manual boolean)`;

// custo_produto da venda = soma dos itens (para vendas que têm itens).
export const sqlSomarCusto = (vendaIds: number[]) =>
  sql`UPDATE vendas v SET custo_produto = s.total
    FROM (SELECT venda_id, ROUND(SUM(custo_unitario * quantidade), 2) AS total FROM venda_itens
      WHERE venda_id = ANY(${vendaIds}::int[]) GROUP BY venda_id) s
    WHERE v.id = s.venda_id`;

export async function vinculosDoAnuncio(canal: string, anuncioId: string, variacaoId: string) {
  return (await sql`SELECT produto_id, quantidade FROM anuncio_vinculos
    WHERE canal = ${canal} AND anuncio_id = ${anuncioId} AND variacao_id = ${variacaoId} ORDER BY id`) as Vinculo[];
}

// Vincula um anúncio a produtos e preenche as vendas que estavam "sem produto" por causa dele. Devolve quantas vendas mudaram.
export async function vincularAnuncio(canal: string, anuncioId: string, variacaoId: string, novos: Vinculo[]) {
  await sql.transaction(
    novos.map((v) => sql`INSERT INTO anuncio_vinculos (canal, anuncio_id, variacao_id, produto_id, quantidade)
      VALUES (${canal}, ${anuncioId}, ${variacaoId}, ${v.produto_id}, ${v.quantidade})
      ON CONFLICT (canal, anuncio_id, variacao_id, produto_id) DO UPDATE SET quantidade = EXCLUDED.quantidade`),
  );
  const vinculos = await vinculosDoAnuncio(canal, anuncioId, variacaoId);
  const pendentes = (await sql`SELECT i.id, i.venda_id, i.descricao, i.quantidade, i.valor FROM venda_itens i
    JOIN vendas v ON v.id = i.venda_id
    WHERE v.canal = ${canal} AND i.produto_id IS NULL AND i.anuncio_id = ${anuncioId} AND i.variacao_id = ${variacaoId}`) as {
    id: number; venda_id: number; descricao: string; quantidade: number; valor: string;
  }[];
  if (!pendentes.length) return 0;
  const custos = await custosProdutos(vinculos.map((v) => v.produto_id));
  const vendaIds = [...new Set(pendentes.map((p) => p.venda_id))];
  await sql.transaction([
    ...pendentes.flatMap((p) => [
      sql`DELETE FROM venda_itens WHERE id = ${p.id}`,
      sqlInserirItens(
        p.venda_id,
        expandirLinha(
          { anuncio_id: anuncioId, variacao_id: variacaoId, descricao: p.descricao, quantidade: p.quantidade, valor: Number(p.valor) },
          vinculos,
          custos,
        ),
      ),
    ]),
    sqlSomarCusto(vendaIds),
  ]);
  return vendaIds.length;
}

// Recalcula o custo congelado dos itens no período com o custo atual dos produtos (pula custos editados à mão).
export async function recalcularCustos(ini: string, prox: string) {
  const custos = [...(await custosProdutos())].map(([id, custo]) => ({ id, custo }));
  const [itens] = await sql.transaction([
    sql`UPDATE venda_itens i SET custo_unitario = c.custo
      FROM vendas v, jsonb_to_recordset(${json(custos)}::jsonb) AS c(id int, custo numeric)
      WHERE v.id = i.venda_id AND i.produto_id = c.id AND NOT i.custo_manual AND v.data >= ${ini} AND v.data < ${prox}
      RETURNING i.id`,
    sql`UPDATE vendas v SET custo_produto = s.total
      FROM (SELECT venda_id, ROUND(SUM(custo_unitario * quantidade), 2) AS total FROM venda_itens GROUP BY venda_id) s
      WHERE v.id = s.venda_id AND v.data >= ${ini} AND v.data < ${prox}`,
  ]);
  return (itens as unknown[]).length;
}
