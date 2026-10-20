"use server";

import { LOGISTICAS, buscarCategorias, nomeCategoria, simular, type Entrada, type Resultado, type Categoria } from "@/lib/simulador";

export type RespostaSimulacao = { ok: true; resultados: Resultado[] } | { ok: false; erro: string };

const num = (v: unknown, nome: string, { min = 0, max = 1e6, opcional = false } = {}) => {
  const s = String(v ?? "").trim().replace(/\s|R\$/g, "");
  if (s === "" && opcional) return null;
  const n = Number(/,/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Confira o campo ${nome}.`);
  return n;
};

export async function simularAction(dados: Record<string, string>): Promise<RespostaSimulacao> {
  try {
    const categoria = String(dados.categoria ?? "").trim().toUpperCase();
    if (!/^MLB\d+$/.test(categoria)) throw new Error("Escolha a categoria do produto.");
    const logistica = String(dados.logistica) as Entrada["logistica"];
    if (!(logistica in LOGISTICAS)) throw new Error("Forma de envio inválida.");
    const e: Entrada = {
      preco: num(dados.preco, "preço", { min: 1 })!,
      categoria,
      logistica,
      altura: num(dados.altura, "altura", { min: 1, max: 300 })!,
      largura: num(dados.largura, "largura", { min: 1, max: 300 })!,
      comprimento: num(dados.comprimento, "comprimento", { min: 1, max: 300 })!,
      peso: num(dados.peso, "peso", { min: 1, max: 100000 })!,
      custoProduto: num(dados.custoProduto, "custo do produto", { opcional: true }) ?? 0,
      embalagem: num(dados.embalagem, "embalagem", { opcional: true }) ?? 0,
      impostoPct: num(dados.impostoPct, "imposto", { max: 100, opcional: true }) ?? 0,
      margemAlvo: num(dados.margemAlvo, "margem desejada", { max: 90, opcional: true }),
    };
    return { ok: true, resultados: await simular(e) };
  } catch (err) {
    return { ok: false, erro: (err as Error).message || "Não foi possível simular." };
  }
}

export async function buscarCategoriasAction(q: string): Promise<Categoria[]> {
  const t = q.trim().slice(0, 120);
  if (t.length < 3) return [];
  try {
    return await buscarCategorias(t);
  } catch {
    return [];
  }
}

export async function categoriaAction(id: string): Promise<Categoria | null> {
  if (!/^MLB\d+$/.test(id)) return null;
  try {
    return await nomeCategoria(id);
  } catch {
    return null;
  }
}

export type { Categoria };
