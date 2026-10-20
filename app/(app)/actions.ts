"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS, STATUS_ENTREGA } from "@/lib/constants";

const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(v || 0);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido em ${k}`);
  return n;
};
// aceita "1234.56" (input number) e "1.234,56" (digitado)
const valor = (f: FormData, k: string) => {
  const raw = String(f.get(k) ?? "").trim();
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return num(f, k);
};

function vendaDe(f: FormData) {
  const canal = String(f.get("canal"));
  if (!(canal in CANAIS)) throw new Error("Canal inválido");
  const status = String(f.get("status_entrega") ?? "a_enviar");
  if (!(status in STATUS_ENTREGA)) throw new Error("Status inválido");
  const produto = txt(f, "produto");
  if (!produto) throw new Error("Produto obrigatório");
  return {
    data: txt(f, "data"),
    canal,
    pedido_externo: txt(f, "pedido_externo"),
    cliente: txt(f, "cliente"),
    produto,
    quantidade: Math.max(1, Math.round(valor(f, "quantidade") || 1)),
    valor_bruto: valor(f, "valor_bruto"),
    taxa_plataforma: valor(f, "taxa_plataforma"),
    frete: valor(f, "frete"),
    custo_produto: valor(f, "custo_produto"),
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
  await sql`INSERT INTO vendas
    (data, canal, pedido_externo, cliente, produto, quantidade, valor_bruto, taxa_plataforma, frete, custo_produto, status_entrega, codigo_rastreio, observacoes)
    VALUES (COALESCE(${v.data}::date, CURRENT_DATE), ${v.canal}, ${v.pedido_externo}, ${v.cliente}, ${v.produto}, ${v.quantidade},
      ${v.valor_bruto}, ${v.taxa_plataforma}, ${v.frete}, ${v.custo_produto}, ${v.status_entrega}, ${v.codigo_rastreio}, ${v.observacoes})`;
  refresh();
}

export async function atualizarVenda(id: number, f: FormData) {
  await ensureSchema();
  const v = vendaDe(f);
  await sql`UPDATE vendas SET
    data = COALESCE(${v.data}::date, data), canal = ${v.canal}, pedido_externo = ${v.pedido_externo}, cliente = ${v.cliente},
    produto = ${v.produto}, quantidade = ${v.quantidade}, valor_bruto = ${v.valor_bruto}, taxa_plataforma = ${v.taxa_plataforma},
    frete = ${v.frete}, custo_produto = ${v.custo_produto}, status_entrega = ${v.status_entrega},
    codigo_rastreio = ${v.codigo_rastreio}, observacoes = ${v.observacoes}
    WHERE id = ${id}`;
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
