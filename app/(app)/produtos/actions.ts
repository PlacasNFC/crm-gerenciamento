"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { CANAIS } from "@/lib/constants";
import { txt, valor } from "@/lib/form";
import { recalcularCustos, vincularAnuncio } from "@/lib/produtos";
import { intervaloMes, mesValido } from "@/components/MesFiltro";

function refresh() {
  revalidatePath("/", "layout");
}

const positivo = (f: FormData, k: string) => {
  const v = valor(f, k);
  if (v < 0) throw new Error(`Valor negativo em ${k}`);
  return v;
};

export async function criarProduto(f: FormData) {
  await ensureSchema();
  const nome = txt(f, "nome");
  if (!nome) throw new Error("Nome obrigatório");
  const [{ id }] = (await sql`INSERT INTO produtos (nome, sku) VALUES (${nome}, ${txt(f, "sku")}) RETURNING id`) as { id: number }[];
  refresh();
  redirect(`/produtos/${id}`);
}

export async function salvarProduto(id: number, f: FormData) {
  await ensureSchema();
  const nome = txt(f, "nome");
  if (!nome) throw new Error("Nome obrigatório");
  const precos = Object.keys(CANAIS).map((c) => ({ canal: c, preco: txt(f, `preco_${c}`) === null ? null : positivo(f, `preco_${c}`) }));
  await sql.transaction([
    sql`UPDATE produtos SET nome = ${nome}, sku = ${txt(f, "sku")}, custo_extra = ${positivo(f, "custo_extra")},
      ativo = ${f.get("ativo") === "on"} WHERE id = ${id}`,
    ...precos.map((p) =>
      p.preco === null
        ? sql`DELETE FROM produto_precos WHERE produto_id = ${id} AND canal = ${p.canal}`
        : sql`INSERT INTO produto_precos (produto_id, canal, preco) VALUES (${id}, ${p.canal}, ${p.preco})
            ON CONFLICT (produto_id, canal) DO UPDATE SET preco = EXCLUDED.preco`,
    ),
  ]);
  refresh();
}

// Produto com vendas é arquivado (as vendas guardam o vínculo); sem vendas, é excluído.
export async function excluirProduto(id: number) {
  await ensureSchema();
  const [usado] = await sql`SELECT 1 FROM venda_itens WHERE produto_id = ${id} LIMIT 1`;
  if (usado) await sql`UPDATE produtos SET ativo = false WHERE id = ${id}`;
  else await sql`DELETE FROM produtos WHERE id = ${id}`;
  refresh();
  redirect("/produtos");
}

export async function salvarComposicao(produtoId: number, f: FormData) {
  await ensureSchema();
  const insumo = Number(f.get("insumo_id"));
  if (!Number.isInteger(insumo)) throw new Error("Escolha um insumo");
  const qtd = positivo(f, "quantidade");
  if (qtd === 0) await sql`DELETE FROM produto_insumos WHERE produto_id = ${produtoId} AND insumo_id = ${insumo}`;
  else
    await sql`INSERT INTO produto_insumos (produto_id, insumo_id, quantidade) VALUES (${produtoId}, ${insumo}, ${qtd})
      ON CONFLICT (produto_id, insumo_id) DO UPDATE SET quantidade = EXCLUDED.quantidade`;
  refresh();
}

export async function removerDaComposicao(produtoId: number, insumoId: number) {
  await ensureSchema();
  await sql`DELETE FROM produto_insumos WHERE produto_id = ${produtoId} AND insumo_id = ${insumoId}`;
  refresh();
}

export async function criarInsumo(f: FormData) {
  await ensureSchema();
  const nome = txt(f, "nome");
  if (!nome) throw new Error("Nome obrigatório");
  await sql`INSERT INTO insumos (nome, unidade, custo_unitario) VALUES (${nome}, ${txt(f, "unidade") ?? "un"}, ${positivo(f, "custo_unitario")})`;
  refresh();
}

export async function salvarInsumo(id: number, f: FormData) {
  await ensureSchema();
  const nome = txt(f, "nome");
  if (!nome) throw new Error("Nome obrigatório");
  await sql`UPDATE insumos SET nome = ${nome}, unidade = ${txt(f, "unidade") ?? "un"}, custo_unitario = ${positivo(f, "custo_unitario")}
    WHERE id = ${id}`;
  refresh();
}

export async function excluirInsumo(id: number) {
  await ensureSchema();
  await sql`DELETE FROM insumos WHERE id = ${id}`;
  refresh();
}

// Vincula um anúncio a até 3 produtos (kit = quantidade, combo = vários) e preenche as vendas pendentes dele.
export async function vincular(f: FormData) {
  await ensureSchema();
  const canal = String(f.get("canal"));
  if (!(canal in CANAIS)) throw new Error("Canal inválido");
  const anuncio = txt(f, "anuncio_id")?.toUpperCase();
  if (!anuncio) throw new Error("Informe o anúncio");
  const vinculos = [1, 2, 3]
    .map((k) => ({ produto_id: Number(f.get(`produto_${k}`)), quantidade: Math.max(1, Math.round(valor(f, `quantidade_${k}`) || 1)) }))
    .filter((v) => Number.isInteger(v.produto_id) && v.produto_id > 0);
  if (!vinculos.length) throw new Error("Escolha ao menos um produto");
  const n = await vincularAnuncio(canal, anuncio, txt(f, "variacao_id") ?? "", vinculos);
  refresh();
  const voltar = txt(f, "voltar");
  redirect(`${voltar?.startsWith("/produtos") ? voltar : "/produtos/anuncios"}?vinculadas=${n}`);
}

export async function removerVinculo(id: number) {
  await ensureSchema();
  await sql`DELETE FROM anuncio_vinculos WHERE id = ${id}`;
  refresh();
}

export async function salvarCanais(f: FormData) {
  await ensureSchema();
  await sql.transaction(
    Object.keys(CANAIS).map((c) => sql`INSERT INTO canais_config (canal, taxa_pct, taxa_fixa, frete_estimado, custo_flex)
      VALUES (${c}, ${positivo(f, `taxa_pct_${c}`)}, ${positivo(f, `taxa_fixa_${c}`)}, ${positivo(f, `frete_estimado_${c}`)},
        ${positivo(f, `custo_flex_${c}`)})
      ON CONFLICT (canal) DO UPDATE SET taxa_pct = EXCLUDED.taxa_pct, taxa_fixa = EXCLUDED.taxa_fixa,
        frete_estimado = EXCLUDED.frete_estimado, custo_flex = EXCLUDED.custo_flex`),
  );
  refresh();
  redirect("/produtos/canais?salvo=1");
}

export async function recalcular(f: FormData) {
  await ensureSchema();
  const mes = mesValido(String(f.get("mes") ?? ""), "");
  if (!mes) throw new Error("Mês inválido");
  const { ini, prox } = intervaloMes(mes);
  const n = await recalcularCustos(ini, prox);
  refresh();
  redirect(`/produtos?mes=${mes}&recalculados=${n}`);
}
