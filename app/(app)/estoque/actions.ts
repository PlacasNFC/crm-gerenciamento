"use server";

import { revalidatePath } from "next/cache";
import { sql, ensureSchema } from "@/lib/db";
import { hoje } from "@/lib/constants";
import { num, txt } from "@/lib/form";
import { CATEGORIAS_ESTOQUE, UNIDADES, qtdFmt, type CategoriaEstoque } from "@/lib/estoque";

function dados(f: FormData) {
  const nome = txt(f, "nome", 200);
  if (!nome) throw new Error("Dê um nome para o item");
  const cat = String(f.get("categoria") ?? "");
  const categoria = (cat in CATEGORIAS_ESTOQUE ? cat : "outro") as CategoriaEstoque;
  const un = String(f.get("unidade") ?? "");
  const unidade = categoria === "filamento" ? "kg" : UNIDADES.includes(un) ? un : CATEGORIAS_ESTOQUE[categoria].unidade;
  return {
    nome,
    categoria,
    unidade,
    custo: num(f, "custo_unitario", "custo") ?? 0,
    minimo: num(f, "estoque_minimo", "estoque mínimo"),
    material: categoria === "filamento" ? txt(f, "material", 40) : null,
    cor: txt(f, "cor", 60),
    marca: txt(f, "marca", 60),
    fornecedor: txt(f, "fornecedor", 120),
    observacoes: txt(f, "observacoes", 2000),
  };
}

const data = (f: FormData) => {
  const d = String(f.get("data") ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hoje();
};

function refresh() {
  revalidatePath("/estoque");
  revalidatePath("/calculadora", "layout");
}

export async function criarItem(f: FormData) {
  await ensureSchema();
  const d = dados(f);
  const qtd = num(f, "quantidade", "quantidade") ?? 0;
  const [{ id }] = (await sql`INSERT INTO estoque_itens
      (nome, categoria, unidade, quantidade, custo_unitario, estoque_minimo, material, cor, marca, fornecedor, observacoes)
    VALUES (${d.nome}, ${d.categoria}, ${d.unidade}, ${qtd}, ${d.custo}, ${d.minimo}, ${d.material}, ${d.cor}, ${d.marca}, ${d.fornecedor}, ${d.observacoes})
    RETURNING id`) as { id: number }[];
  if (qtd > 0) {
    await sql`INSERT INTO estoque_movimentos (item_id, tipo, quantidade, observacao) VALUES (${id}, 'ajuste', ${qtd}, 'Estoque inicial')`;
  }
  refresh();
}

export async function atualizarItem(id: number, f: FormData) {
  await ensureSchema();
  const d = dados(f);
  await sql`UPDATE estoque_itens SET nome = ${d.nome}, categoria = ${d.categoria}, unidade = ${d.unidade},
    custo_unitario = ${d.custo}, estoque_minimo = ${d.minimo}, material = ${d.material}, cor = ${d.cor},
    marca = ${d.marca}, fornecedor = ${d.fornecedor}, observacoes = ${d.observacoes} WHERE id = ${id}`;
  refresh();
}

// Compra: soma ao estoque e recalcula o custo médio ponderado (se informou o valor pago).
export async function entradaItem(id: number, f: FormData) {
  await ensureSchema();
  const qtd = num(f, "quantidade", "quantidade");
  if (!qtd) throw new Error("Informe a quantidade comprada");
  const valor = num(f, "valor_total", "valor pago");
  const dia = data(f);
  const obs = txt(f, "observacao", 300);
  const [item] = (await sql`SELECT nome, categoria, unidade FROM estoque_itens WHERE id = ${id}`) as {
    nome: string; categoria: CategoriaEstoque; unidade: string;
  }[];
  if (!item) throw new Error("Item não encontrado");
  const caixa = f.get("lancar_caixa") === "on" && valor != null && valor > 0;
  await sql.transaction([
    sql`UPDATE estoque_itens SET
      custo_unitario = CASE WHEN ${valor}::numeric IS NULL THEN custo_unitario
        ELSE (GREATEST(quantidade, 0) * custo_unitario + ${valor}::numeric) / (GREATEST(quantidade, 0) + ${qtd}::numeric) END,
      quantidade = quantidade + ${qtd}::numeric
      WHERE id = ${id}`,
    sql`INSERT INTO estoque_movimentos (item_id, data, tipo, quantidade, valor_total, observacao)
      VALUES (${id}, ${dia}, 'entrada', ${qtd}, ${valor}, ${obs})`,
    ...(caixa
      ? [sql`INSERT INTO movimentacoes (data, tipo, categoria, descricao, valor)
          VALUES (${dia}, 'saida', ${CATEGORIAS_ESTOQUE[item.categoria]?.lancamento ?? "Outros"},
            ${`Compra: ${item.nome} (${qtdFmt(qtd, item.unidade)})`}, ${valor})`]
      : []),
  ]);
  refresh();
  if (caixa) revalidatePath("/movimentacoes");
}

// Baixa (consumo) ou contagem (define a quantidade real e registra a diferença).
export async function saidaItem(id: number, f: FormData) {
  await ensureSchema();
  const modo = f.get("modo") === "contagem" ? "contagem" : "baixa";
  const valor = num(f, "quantidade", "quantidade");
  if (valor == null) throw new Error("Informe a quantidade");
  const obs = txt(f, "observacao", 300);
  if (modo === "baixa") {
    if (!valor) return;
    await sql.transaction([
      sql`UPDATE estoque_itens SET quantidade = quantidade - ${valor}::numeric WHERE id = ${id}`,
      sql`INSERT INTO estoque_movimentos (item_id, data, tipo, quantidade, observacao) VALUES (${id}, ${data(f)}, 'saida', ${-valor}, ${obs})`,
    ]);
  } else {
    const [atual] = (await sql`SELECT quantidade::float AS q FROM estoque_itens WHERE id = ${id}`) as { q: number }[];
    if (!atual) throw new Error("Item não encontrado");
    const delta = Math.round((valor - atual.q) * 1000) / 1000;
    if (!delta) return;
    await sql.transaction([
      sql`UPDATE estoque_itens SET quantidade = ${valor} WHERE id = ${id}`,
      sql`INSERT INTO estoque_movimentos (item_id, data, tipo, quantidade, observacao)
        VALUES (${id}, ${data(f)}, 'ajuste', ${delta}, ${obs ?? "Contagem de estoque"})`,
    ]);
  }
  refresh();
}

// Desfaz o efeito do movimento na quantidade (o custo médio não volta).
export async function excluirMovimento(id: number) {
  await ensureSchema();
  await sql`WITH m AS (DELETE FROM estoque_movimentos WHERE id = ${id} RETURNING item_id, quantidade)
    UPDATE estoque_itens i SET quantidade = i.quantidade - m.quantidade FROM m WHERE i.id = m.item_id`;
  refresh();
}

export async function excluirItem(id: number) {
  await ensureSchema();
  await sql`DELETE FROM estoque_itens WHERE id = ${id}`;
  refresh();
}
