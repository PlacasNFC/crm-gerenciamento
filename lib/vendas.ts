import { sql } from "./db";
import { CANAIS, STATUS_ENTREGA } from "./constants";
import { ErroValidacao } from "./form";

export type ItemVenda = { produto_id: number | null; descricao: string; quantidade: number; valor_unitario: number };

export type DadosVenda = {
  data: string | null;
  canal: string;
  pedido_externo: string | null;
  cliente_id: number | null;
  taxa_plataforma: number;
  frete: number;
  custo_produto: number;
  status_entrega: string;
  codigo_rastreio: string | null;
  observacoes: string | null;
};

export const STATUS_INATIVOS = ["cancelado", "devolvido"];

export function validarVenda(d: DadosVenda, itens: ItemVenda[]) {
  if (!(d.canal in CANAIS)) throw new ErroValidacao("Canal inválido.");
  if (!(d.status_entrega in STATUS_ENTREGA)) throw new ErroValidacao("Status inválido.");
  if (itens.length === 0) throw new ErroValidacao("Inclua pelo menos um item.");
  for (const i of itens) {
    if (!i.descricao.trim()) throw new ErroValidacao("Todo item precisa de descrição.");
    if (!(i.quantidade > 0)) throw new ErroValidacao(`Quantidade inválida em "${i.descricao}".`);
    if (!(i.valor_unitario >= 0)) throw new ErroValidacao(`Valor inválido em "${i.descricao}".`);
  }
}

/**
 * Reescreve itens, estoque e conta a receber de uma venda numa única transação.
 * - estoque: uma saída por item com produto, só se a venda estiver ativa
 * - conta a receber: líquido (bruto − taxa − frete), vencimento = data + dias de repasse do canal;
 *   contas já recebidas nunca são alteradas
 */
function regravar(id: number, d: DadosVenda, itens: ItemVenda[]) {
  const pids = itens.map((i) => i.produto_id);
  const descs = itens.map((i) => i.descricao.trim());
  const qtds = itens.map((i) => i.quantidade);
  const vals = itens.map((i) => i.valor_unitario);
  const bruto = Math.round(itens.reduce((a, i) => a + i.quantidade * i.valor_unitario, 0) * 100) / 100;
  const qtdTotal = Math.max(1, Math.round(qtds.reduce((a, q) => a + q, 0)));
  const resumo = descs.length === 1 ? descs[0] : `${descs[0]} + ${descs.length - 1} item(ns)`;

  return [
    sql`UPDATE vendas SET
        data = COALESCE(${d.data}::date, data), canal = ${d.canal}, pedido_externo = ${d.pedido_externo},
        cliente_id = ${d.cliente_id}, cliente = (SELECT nome FROM clientes WHERE id = ${d.cliente_id}),
        produto = ${resumo}, quantidade = ${qtdTotal}, valor_bruto = ${bruto},
        taxa_plataforma = ${d.taxa_plataforma}, frete = ${d.frete}, custo_produto = ${d.custo_produto},
        status_entrega = ${d.status_entrega}, codigo_rastreio = ${d.codigo_rastreio}, observacoes = ${d.observacoes}
      WHERE id = ${id}`,
    sql`DELETE FROM venda_itens WHERE venda_id = ${id}`,
    sql`INSERT INTO venda_itens (venda_id, produto_id, descricao, quantidade, valor_unitario)
      SELECT ${id}, t.p, t.d, t.q, t.v
      FROM unnest(${pids}::int[], ${descs}::text[], ${qtds}::numeric[], ${vals}::numeric[]) AS t(p, d, q, v)`,
    ...sincronizar(id),
  ];
}

// Estoque e financeiro derivados da venda (usado também quando só o status muda).
export function sincronizar(id: number) {
  return [
    sql`DELETE FROM estoque_movs WHERE venda_id = ${id}`,
    sql`INSERT INTO estoque_movs (produto_id, quantidade, motivo, venda_id, data)
      SELECT i.produto_id, -i.quantidade, 'Venda #' || v.id, v.id, v.data::timestamptz + interval '12 hours'
      FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
      WHERE v.id = ${id} AND i.produto_id IS NOT NULL AND v.status_entrega NOT IN ('cancelado','devolvido')`,
    sql`DELETE FROM contas c USING vendas v
      WHERE c.venda_id = v.id AND v.id = ${id} AND c.pago_em IS NULL
        AND (v.status_entrega IN ('cancelado','devolvido') OR v.valor_bruto - v.taxa_plataforma - v.frete <= 0)`,
    sql`INSERT INTO contas (tipo, descricao, categoria, valor, vencimento, venda_id)
      SELECT 'receber',
        'Venda #' || v.id || ' · ' || CASE v.canal WHEN 'mercado_livre' THEN 'Mercado Livre' WHEN 'shopee' THEN 'Shopee' WHEN 'tiktok' THEN 'TikTok Shop' ELSE 'Direto' END || COALESCE(' · pedido ' || v.pedido_externo, ''),
        'Vendas · ' || CASE v.canal WHEN 'mercado_livre' THEN 'Mercado Livre' WHEN 'shopee' THEN 'Shopee' WHEN 'tiktok' THEN 'TikTok Shop' ELSE 'Direto' END,
        v.valor_bruto - v.taxa_plataforma - v.frete,
        v.data + COALESCE((e.dias_repasse ->> v.canal)::int, 0),
        v.id
      FROM vendas v CROSS JOIN empresa e
      WHERE v.id = ${id} AND v.status_entrega NOT IN ('cancelado','devolvido')
        AND v.valor_bruto - v.taxa_plataforma - v.frete > 0
      ON CONFLICT (venda_id) WHERE venda_id IS NOT NULL DO UPDATE
        SET valor = EXCLUDED.valor, vencimento = EXCLUDED.vencimento, descricao = EXCLUDED.descricao, categoria = EXCLUDED.categoria
        WHERE contas.pago_em IS NULL`,
  ];
}

export async function criarVenda(d: DadosVenda, itens: ItemVenda[]) {
  validarVenda(d, itens);
  const [{ id }] = (await sql`SELECT nextval('vendas_id_seq')::int AS id`) as { id: number }[];
  await sql.transaction([
    sql`INSERT INTO vendas (id, data, canal, produto, status_entrega)
        VALUES (${id}, COALESCE(${d.data}::date, CURRENT_DATE), ${d.canal}, '', ${d.status_entrega})`,
    ...regravar(id, d, itens),
  ]);
  return id;
}

export async function atualizarVenda(id: number, d: DadosVenda, itens: ItemVenda[]) {
  validarVenda(d, itens);
  await sql.transaction(regravar(id, d, itens));
}

export async function atualizarStatus(id: number, status: string, rastreio: string | null) {
  if (!(status in STATUS_ENTREGA)) throw new ErroValidacao("Status inválido.");
  await sql.transaction([
    sql`UPDATE vendas SET status_entrega = ${status}, codigo_rastreio = ${rastreio} WHERE id = ${id}`,
    ...sincronizar(id),
  ]);
}

export async function excluirVenda(id: number) {
  // itens, estoque e contas da venda caem em cascata; notas ficam desvinculadas
  await sql`DELETE FROM vendas WHERE id = ${id}`;
}

export async function recalcularContasEmAberto() {
  // quando os dias de repasse mudam, reprograma os recebimentos ainda não recebidos
  await sql`UPDATE contas c SET vencimento = v.data + COALESCE((e.dias_repasse ->> v.canal)::int, 0)
    FROM vendas v CROSS JOIN empresa e
    WHERE c.venda_id = v.id AND c.pago_em IS NULL`;
}
