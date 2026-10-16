"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ncmValido, ORIGENS, soDigitos } from "@/lib/fiscal";
import { ErroValidacao, marcado, numero, obrigatorio, tentar, texto, type Resultado } from "@/lib/form";

export async function salvarProduto(_: Resultado, f: FormData) {
  let id = Number(f.get("id")) || null;
  const r = await tentar(async () => {
    const sku = obrigatorio(f, "sku", "Código (SKU)");
    const nome = obrigatorio(f, "nome", "Descrição");
    const ncm = soDigitos(texto(f, "ncm"));
    if (ncm && !ncmValido(ncm)) throw new ErroValidacao("NCM deve ter 8 dígitos.");
    const cest = soDigitos(texto(f, "cest"));
    if (cest && cest.length !== 7) throw new ErroValidacao("CEST deve ter 7 dígitos.");
    const gtin = soDigitos(texto(f, "gtin"));
    if (gtin && ![8, 12, 13, 14].includes(gtin.length)) throw new ErroValidacao("GTIN/EAN deve ter 8, 12, 13 ou 14 dígitos.");
    const origem = Number(f.get("origem") ?? 0);
    if (!(origem in ORIGENS)) throw new ErroValidacao("Origem inválida.");
    const v = {
      sku, nome, ncm: ncm || null, cest: cest || null, gtin: gtin || null,
      unidade: (texto(f, "unidade") ?? "UN").toUpperCase().slice(0, 6), origem,
      producao_propria: marcado(f, "producao_propria"),
      preco: numero(f, "preco_venda"), custo: numero(f, "custo"), minimo: numero(f, "estoque_minimo"),
      ativo: id ? marcado(f, "ativo") : true,
    };
    const dup = await sql`SELECT id FROM produtos WHERE lower(sku) = lower(${sku}) AND id IS DISTINCT FROM ${id}`;
    if (dup.length) throw new ErroValidacao("Já existe um produto com esse código.");
    if (id) {
      await sql`UPDATE produtos SET sku = ${v.sku}, nome = ${v.nome}, ncm = ${v.ncm}, cest = ${v.cest}, gtin = ${v.gtin},
        unidade = ${v.unidade}, origem = ${v.origem}, producao_propria = ${v.producao_propria}, preco_venda = ${v.preco},
        custo = ${v.custo}, estoque_minimo = ${v.minimo}, ativo = ${v.ativo} WHERE id = ${id}`;
    } else {
      const inicial = numero(f, "estoque_inicial");
      const [row] = (await sql`INSERT INTO produtos (sku, nome, ncm, cest, gtin, unidade, origem, producao_propria, preco_venda, custo, estoque_minimo)
        VALUES (${v.sku}, ${v.nome}, ${v.ncm}, ${v.cest}, ${v.gtin}, ${v.unidade}, ${v.origem}, ${v.producao_propria}, ${v.preco}, ${v.custo}, ${v.minimo})
        RETURNING id`) as { id: number }[];
      id = row.id;
      if (inicial > 0) await sql`INSERT INTO estoque_movs (produto_id, quantidade, motivo) VALUES (${id}, ${inicial}, 'Estoque inicial')`;
    }
    revalidatePath("/produtos");
  });
  if (r?.ok) redirect(`/produtos/${id}`);
  return r;
}

export async function lancarEstoque(_: Resultado, f: FormData) {
  return tentar(async () => {
    const id = Number(f.get("id"));
    const tipo = String(f.get("tipo"));
    const qtd = numero(f, "quantidade");
    const obs = texto(f, "observacao");
    if (tipo === "balanco") {
      const [{ saldo }] = (await sql`SELECT COALESCE(SUM(quantidade), 0)::float AS saldo FROM estoque_movs WHERE produto_id = ${id}`) as { saldo: number }[];
      const delta = Math.round((qtd - saldo) * 1000) / 1000;
      if (delta === 0) return "Saldo já está correto.";
      await sql`INSERT INTO estoque_movs (produto_id, quantidade, motivo, observacao) VALUES (${id}, ${delta}, 'Balanço', ${obs})`;
    } else {
      if (!(qtd > 0)) throw new ErroValidacao("Informe uma quantidade maior que zero.");
      if (tipo !== "entrada" && tipo !== "saida") throw new ErroValidacao("Tipo inválido.");
      const motivo = tipo === "entrada" ? "Entrada manual" : "Saída manual";
      await sql`INSERT INTO estoque_movs (produto_id, quantidade, motivo, observacao)
        VALUES (${id}, ${tipo === "entrada" ? qtd : -qtd}, ${motivo}, ${obs})`;
    }
    revalidatePath(`/produtos/${id}`);
    revalidatePath("/estoque");
    return "Estoque atualizado.";
  });
}

export async function excluirProduto(_: Resultado, f: FormData) {
  const id = Number(f.get("id"));
  const r = await tentar(async () => {
    const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM venda_itens WHERE produto_id = ${id}`) as { n: number }[];
    if (n > 0) throw new ErroValidacao(`Produto usado em ${n} venda(s). Desative em vez de excluir.`);
    await sql`DELETE FROM produtos WHERE id = ${id}`;
  });
  if (r?.ok) redirect("/produtos");
  return r;
}
