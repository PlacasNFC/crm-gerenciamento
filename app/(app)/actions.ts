"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, STATUS_ENTREGA, r2 } from "@/lib/constants";
import { custoDosItens, type ItemVenda } from "@/lib/itens";
import { sqlInserirItens } from "@/lib/produtos";
import { txt, valor } from "@/lib/form";

// Itens enviados pelo formulário de venda (JSON); o valor e o custo da venda saem da soma deles.
function itensDe(f: FormData): ItemVenda[] {
  let bruto: unknown;
  try {
    bruto = JSON.parse(String(f.get("itens") ?? "[]"));
  } catch {
    throw new Error("Itens inválidos");
  }
  if (!Array.isArray(bruto)) throw new Error("Itens inválidos");
  const numero = (v: unknown) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) throw new Error("Valor inválido nos itens");
    return x;
  };
  return bruto
    .map((i) => ({
      produto_id: Number.isInteger(i?.produto_id) ? i.produto_id : null,
      anuncio_id: typeof i?.anuncio_id === "string" && i.anuncio_id ? i.anuncio_id : null,
      variacao_id: typeof i?.variacao_id === "string" ? i.variacao_id : "",
      descricao: String(i?.descricao ?? "").trim(),
      quantidade: Math.max(1, Math.round(numero(i?.quantidade) || 1)),
      valor: r2(numero(i?.valor)),
      custo_unitario: Math.round(numero(i?.custo_unitario) * 10000) / 10000,
      custo_manual: i?.custo_manual === true,
    }))
    .filter((i) => i.descricao);
}

function vendaDe(f: FormData) {
  const canal = String(f.get("canal"));
  if (!(canal in CANAIS)) throw new Error("Canal inválido");
  const status = String(f.get("status_entrega") ?? "a_enviar");
  if (!(status in STATUS_ENTREGA)) throw new Error("Status inválido");
  const itens = itensDe(f);
  if (!itens.length) throw new Error("Produto obrigatório");
  const unico = itens.length === 1;
  return {
    itens,
    data: txt(f, "data"),
    canal,
    pedido_externo: txt(f, "pedido_externo"),
    cliente: txt(f, "cliente"),
    produto: unico ? itens[0].descricao : itens.map((i) => `${i.quantidade}× ${i.descricao}`).join(", "),
    quantidade: unico ? itens[0].quantidade : 1,
    valor_bruto: r2(itens.reduce((a, i) => a + i.valor, 0)),
    taxa_plataforma: valor(f, "taxa_plataforma"),
    frete: valor(f, "frete"),
    reembolso_frete: valor(f, "reembolso_frete"),
    custo_produto: custoDosItens(itens),
    status_entrega: status,
    codigo_rastreio: txt(f, "codigo_rastreio"),
    observacoes: txt(f, "observacoes"),
  };
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function criarVenda(f: FormData) {
  await ensureSchema();
  const v = vendaDe(f);
  const [{ id }] = (await sql`INSERT INTO vendas
    (data, canal, pedido_externo, cliente, produto, quantidade, valor_bruto, taxa_plataforma, frete, reembolso_frete, custo_produto,
      status_entrega, codigo_rastreio, observacoes)
    VALUES (COALESCE(${v.data}::date, CURRENT_DATE), ${v.canal}, ${v.pedido_externo}, ${v.cliente}, ${v.produto}, ${v.quantidade},
      ${v.valor_bruto}, ${v.taxa_plataforma}, ${v.frete}, ${v.reembolso_frete}, ${v.custo_produto}, ${v.status_entrega},
      ${v.codigo_rastreio}, ${v.observacoes})
    RETURNING id`) as { id: number }[];
  await sqlInserirItens(id, v.itens);
  refresh();
}

export async function atualizarVenda(id: number, f: FormData) {
  await ensureSchema();
  const v = vendaDe(f);
  await sql.transaction([
    sql`UPDATE vendas SET
      data = COALESCE(${v.data}::date, data), canal = ${v.canal}, pedido_externo = ${v.pedido_externo}, cliente = ${v.cliente},
      produto = ${v.produto}, quantidade = ${v.quantidade}, valor_bruto = ${v.valor_bruto}, taxa_plataforma = ${v.taxa_plataforma},
      frete = ${v.frete}, reembolso_frete = ${v.reembolso_frete}, frete_pendente = false, custo_produto = ${v.custo_produto},
      status_entrega = ${v.status_entrega}, codigo_rastreio = ${v.codigo_rastreio}, observacoes = ${v.observacoes}
      WHERE id = ${id}`,
    sql`DELETE FROM venda_itens WHERE venda_id = ${id}`,
    sqlInserirItens(id, v.itens),
  ]);
  refresh();
  redirect("/vendas");
}

export async function excluirVenda(id: number) {
  await ensureSchema();
  await sql`DELETE FROM vendas WHERE id = ${id}`;
  refresh();
}

export async function atualizarEntrega(id: number, f: FormData) {
  await ensureSchema();
  const status = String(f.get("status_entrega"));
  if (!(status in STATUS_ENTREGA)) throw new Error("Status inválido");
  await sql`UPDATE vendas SET status_entrega = ${status}, codigo_rastreio = ${txt(f, "codigo_rastreio")} WHERE id = ${id}`;
  refresh();
}

export async function criarMovimentacao(f: FormData) {
  await ensureSchema();
  const tipo = String(f.get("tipo"));
  if (tipo !== "entrada" && tipo !== "saida") throw new Error("Tipo inválido");
  const categoria = txt(f, "categoria") ?? "Outros";
  const v = valor(f, "valor");
  if (!(v > 0)) throw new Error("Valor deve ser maior que zero");
  await sql`INSERT INTO movimentacoes (data, tipo, categoria, descricao, valor)
    VALUES (COALESCE(${txt(f, "data")}::date, CURRENT_DATE), ${tipo}, ${categoria}, ${txt(f, "descricao")}, ${v})`;
  refresh();
}

export async function excluirMovimentacao(id: number) {
  await ensureSchema();
  await sql`DELETE FROM movimentacoes WHERE id = ${id}`;
  refresh();
}
