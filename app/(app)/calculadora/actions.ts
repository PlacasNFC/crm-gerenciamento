"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { hoje } from "@/lib/constants";
import { num, txt } from "@/lib/form";
import {
  PARAMETROS_PADRAO, custoPeca, normalizarEntrada, normalizarFaixas, parametrosEfetivos, resultado, type Parametros,
} from "@/lib/calculadora";
import { carregarCanais, carregarItens, carregarParametros, paraItemCusto } from "@/lib/estoque";

function refresh() {
  revalidatePath("/calculadora", "layout");
}

export type SimulacaoPayload = { nome: string; entrada: unknown; ideia_id: number | null; observacoes: string };

// Salva (cria ou atualiza; o navegador abre a nova) e grava custo/preço/margem do momento, para o histórico.
export async function salvarSimulacao(id: number | null, payload: SimulacaoPayload) {
  await ensureSchema();
  const nome = String(payload.nome ?? "").trim().slice(0, 200);
  if (!nome) throw new Error("Dê um nome para o produto");
  const entrada = normalizarEntrada(payload.entrada);
  const observacoes = String(payload.observacoes ?? "").trim().slice(0, 5000) || null;
  const ideiaId = Number.isInteger(payload.ideia_id) ? payload.ideia_id : null;

  const [itens, base, canais] = await Promise.all([carregarItens(), carregarParametros(), carregarCanais()]);
  const p = parametrosEfetivos(base, entrada.ajustes);
  const custo = custoPeca(entrada, p, itens.map(paraItemCusto)).total;
  const canal = canais.find((c) => c.id === entrada.canal_id) ?? null;
  const r = resultado(entrada.preco_venda, custo, canal, p);
  const json = JSON.stringify(entrada);

  let simId = id;
  if (id == null) {
    const [row] = (await sql`INSERT INTO calc_simulacoes (nome, entrada, ideia_id, custo, preco, margem, observacoes)
      VALUES (${nome}, ${json}::jsonb, ${ideiaId}, ${custo}, ${r.preco}, ${r.margem}, ${observacoes}) RETURNING id`) as { id: number }[];
    simId = row.id;
  } else {
    await sql`UPDATE calc_simulacoes SET nome = ${nome}, entrada = ${json}::jsonb, ideia_id = ${ideiaId}, custo = ${custo},
      preco = ${r.preco}, margem = ${r.margem}, observacoes = ${observacoes}, updated_at = now() WHERE id = ${id}`;
  }
  // A ideia de produto passa a mostrar o custo e o preço calculados.
  if (ideiaId != null) {
    await sql`UPDATE ideias SET custo_estimado = ${Math.round(custo * 100) / 100}, preco_estimado = ${r.preco || null} WHERE id = ${ideiaId}`;
    revalidatePath("/ideias");
  }
  refresh();
  return { id: simId! };
}

export async function duplicarSimulacao(id: number) {
  await ensureSchema();
  const [row] = (await sql`INSERT INTO calc_simulacoes (nome, entrada, custo, preco, margem, observacoes)
    SELECT nome || ' (cópia)', entrada, custo, preco, margem, observacoes FROM calc_simulacoes WHERE id = ${id}
    RETURNING id`) as { id: number }[];
  if (!row) throw new Error("Simulação não encontrada");
  refresh();
  redirect(`/calculadora/${row.id}`);
}

export async function excluirSimulacao(id: number) {
  await ensureSchema();
  await sql`DELETE FROM calc_simulacoes WHERE id = ${id}`;
  refresh();
  redirect("/calculadora");
}

// Produziu N peças: dá baixa no filamento (com a perda) e nos insumos da simulação.
export async function registrarProducao(id: number, f: FormData) {
  await ensureSchema();
  const pecas = num(f, "pecas", "peças");
  if (!pecas) throw new Error("Informe quantas peças foram produzidas");
  const [sim] = (await sql`SELECT nome, entrada FROM calc_simulacoes WHERE id = ${id}`) as { nome: string; entrada: unknown }[];
  if (!sim) throw new Error("Simulação não encontrada");
  const e = normalizarEntrada(sim.entrada);
  const p = parametrosEfetivos(await carregarParametros(), e.ajustes);
  const obs = `Produção: ${pecas}× ${sim.nome}`.slice(0, 300);

  const baixas = new Map<number, number>();
  for (const l of e.filamentos) {
    const kg = ((l.gramas / e.pecas_por_impressao) * (1 + p.perda_pct / 100) * pecas) / 1000;
    baixas.set(l.item_id, (baixas.get(l.item_id) ?? 0) + kg);
  }
  for (const l of e.insumos) baixas.set(l.item_id, (baixas.get(l.item_id) ?? 0) + l.qtd * pecas);
  const linhas = [...baixas].map(([item, q]) => [item, Math.round(q * 1000) / 1000] as const).filter(([, q]) => q > 0);
  if (!linhas.length) return;

  await sql.transaction(
    linhas.flatMap(([item, q]) => [
      sql`UPDATE estoque_itens SET quantidade = quantidade - ${q}::numeric WHERE id = ${item}`,
      sql`INSERT INTO estoque_movimentos (item_id, data, tipo, quantidade, observacao)
        SELECT ${item}::int, ${hoje()}::date, 'saida', ${-q}::numeric, ${obs}::text WHERE EXISTS (SELECT 1 FROM estoque_itens WHERE id = ${item})`,
    ]),
  );
  revalidatePath("/estoque");
  refresh();
}

export async function salvarParametros(f: FormData) {
  await ensureSchema();
  const dados: Partial<Parametros> = {};
  for (const k of Object.keys(PARAMETROS_PADRAO) as (keyof Parametros)[]) {
    const v = num(f, k);
    if (v != null) dados[k] = v;
  }
  await sql`UPDATE calc_config SET dados = ${JSON.stringify(dados)}::jsonb WHERE id = 1`;
  refresh();
}

export async function salvarCanal(id: number | null, f: FormData) {
  await ensureSchema();
  const nome = txt(f, "nome", 80);
  if (!nome) throw new Error("Dê um nome para o canal");
  let bruto: unknown = [];
  try {
    bruto = JSON.parse(String(f.get("faixas") ?? "[]"));
  } catch {
    throw new Error("Faixas inválidas");
  }
  const faixas = JSON.stringify(normalizarFaixas(bruto));
  const ativo = f.get("ativo") === "on";
  if (id == null) {
    await sql`INSERT INTO calc_canais (nome, faixas, ativo, posicao)
      VALUES (${nome}, ${faixas}::jsonb, ${ativo}, (SELECT COALESCE(MAX(posicao), -1) + 1 FROM calc_canais))`;
  } else {
    await sql`UPDATE calc_canais SET nome = ${nome}, faixas = ${faixas}::jsonb, ativo = ${ativo} WHERE id = ${id}`;
  }
  refresh();
}

export async function excluirCanal(id: number) {
  await ensureSchema();
  await sql`DELETE FROM calc_canais WHERE id = ${id}`;
  refresh();
}

