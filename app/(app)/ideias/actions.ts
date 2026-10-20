"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { STATUS_IDEIA } from "@/lib/ideias";

const txt = (f: FormData, k: string, max = 2000) => {
  const v = String(f.get(k) ?? "").trim().slice(0, max);
  return v === "" ? null : v;
};
const dinheiro = (f: FormData, k: string) => {
  const raw = String(f.get(k) ?? "").trim().replace(/\s|R\$/g, "");
  if (!raw) return null;
  const n = Number(/,/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido em ${k}`);
  return n;
};
const link = (f: FormData) => {
  const v = txt(f, "link", 500);
  if (!v) return null;
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return new URL(url).toString();
  } catch {
    throw new Error("Link inválido");
  }
};

function dados(f: FormData) {
  const titulo = txt(f, "titulo", 200);
  if (!titulo) throw new Error("Dê um nome para a ideia");
  return {
    titulo,
    descricao: txt(f, "descricao", 5000),
    categoria: txt(f, "categoria", 60),
    custo: dinheiro(f, "custo_estimado"),
    preco: dinheiro(f, "preco_estimado"),
    link: link(f),
    autor: txt(f, "autor", 60),
  };
}

function refresh() {
  revalidatePath("/ideias");
}

export async function criarIdeia(f: FormData) {
  await ensureSchema();
  const d = dados(f);
  await sql`INSERT INTO ideias (titulo, descricao, categoria, custo_estimado, preco_estimado, link, autor)
    VALUES (${d.titulo}, ${d.descricao}, ${d.categoria}, ${d.custo}, ${d.preco}, ${d.link}, ${d.autor})`;
  refresh();
}

export async function atualizarIdeia(id: number, f: FormData) {
  await ensureSchema();
  const d = dados(f);
  await sql`UPDATE ideias SET titulo = ${d.titulo}, descricao = ${d.descricao}, categoria = ${d.categoria},
    custo_estimado = ${d.custo}, preco_estimado = ${d.preco}, link = ${d.link}, autor = ${d.autor} WHERE id = ${id}`;
  refresh();
}

export async function votarIdeia(id: number, delta: 1 | -1) {
  await ensureSchema();
  await sql`UPDATE ideias SET votos = GREATEST(0, votos + ${delta === -1 ? -1 : 1}) WHERE id = ${id}`;
  refresh();
}

export async function mudarStatusIdeia(id: number, status: string) {
  await ensureSchema();
  if (!(status in STATUS_IDEIA)) throw new Error("Status inválido");
  await sql`UPDATE ideias SET status = ${status} WHERE id = ${id}`;
  refresh();
}

export async function excluirIdeia(id: number) {
  await ensureSchema();
  await sql`DELETE FROM ideias WHERE id = ${id}`;
  refresh();
}

// Cria um card na primeira coluna do board escolhido e marca a ideia como aprovada.
export async function ideiaParaKanban(id: number, f: FormData) {
  await ensureSchema();
  const boardId = Number(f.get("board"));
  if (!Number.isInteger(boardId)) throw new Error("Escolha um board");
  const [col] = (await sql`SELECT id FROM kanban_colunas WHERE board_id = ${boardId} ORDER BY posicao, id LIMIT 1`) as { id: number }[];
  if (!col) throw new Error("Esse board não tem colunas");
  const [i] = (await sql`SELECT * FROM ideias WHERE id = ${id}`) as {
    titulo: string; descricao: string | null; link: string | null; categoria: string | null;
  }[];
  if (!i) throw new Error("Ideia não encontrada");
  const descricao = [i.descricao, i.link].filter(Boolean).join("\n\n") || null;
  await sql.transaction([
    sql`INSERT INTO kanban_cards (coluna_id, titulo, descricao, etiqueta, cor, posicao)
      VALUES (${col.id}, ${i.titulo}, ${descricao}, ${i.categoria ?? "ideia"}, 'roxo',
        (SELECT COALESCE(MAX(posicao), -1) + 1 FROM kanban_cards WHERE coluna_id = ${col.id}))`,
    sql`UPDATE ideias SET status = 'aprovada' WHERE id = ${id}`,
  ]);
  revalidatePath("/kanban", "layout");
  refresh();
  redirect(`/kanban/${boardId}`);
}
