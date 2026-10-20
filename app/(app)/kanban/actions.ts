"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql, ensureSchema } from "@/lib/db";
import { MODELOS, corValida } from "@/lib/cores";

const txt = (f: FormData, k: string, max = 2000) => {
  const v = String(f.get(k) ?? "").trim().slice(0, max);
  return v === "" ? null : v;
};
const obrigatorio = (f: FormData, k: string, rotulo: string, max = 200) => {
  const v = txt(f, k, max);
  if (!v) throw new Error(`${rotulo} é obrigatório`);
  return v;
};
const ids = (lista: unknown) => {
  if (!Array.isArray(lista) || !lista.every((x) => Number.isInteger(x))) throw new Error("Lista inválida");
  return lista as number[];
};
const data = (f: FormData, k: string) => {
  const v = txt(f, k, 10);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

function refresh() {
  revalidatePath("/kanban", "layout");
}

// ---- boards

export async function criarBoard(f: FormData) {
  await ensureSchema();
  const nome = obrigatorio(f, "nome", "Nome do board");
  const modelo = MODELOS[String(f.get("modelo"))] ?? MODELOS.tarefas;
  const [b] = (await sql`INSERT INTO kanban_boards (nome, descricao, cor, posicao)
    VALUES (${nome}, ${txt(f, "descricao", 500)}, ${corValida(f.get("cor"), "azul")},
      (SELECT COALESCE(MAX(posicao), -1) + 1 FROM kanban_boards))
    RETURNING id`) as { id: number }[];
  if (modelo.colunas.length) {
    await sql`INSERT INTO kanban_colunas (board_id, nome, cor, posicao)
      SELECT ${b.id}, c.nome, c.cor, c.ord - 1
      FROM unnest(${modelo.colunas.map((c) => c[0])}::text[], ${modelo.colunas.map((c) => c[1])}::text[]) WITH ORDINALITY AS c(nome, cor, ord)`;
  }
  refresh();
  redirect(`/kanban/${b.id}`);
}

export async function atualizarBoard(id: number, f: FormData) {
  await ensureSchema();
  await sql`UPDATE kanban_boards SET nome = ${obrigatorio(f, "nome", "Nome do board")}, descricao = ${txt(f, "descricao", 500)},
    cor = ${corValida(f.get("cor"), "azul")} WHERE id = ${id}`;
  refresh();
}

export async function excluirBoard(id: number) {
  await ensureSchema();
  await sql`DELETE FROM kanban_boards WHERE id = ${id}`;
  refresh();
  redirect("/kanban");
}

// ---- colunas

export async function criarColuna(boardId: number, f: FormData) {
  await ensureSchema();
  await sql`INSERT INTO kanban_colunas (board_id, nome, cor, posicao)
    VALUES (${boardId}, ${obrigatorio(f, "nome", "Nome da coluna", 80)}, ${corValida(f.get("cor"))},
      (SELECT COALESCE(MAX(posicao), -1) + 1 FROM kanban_colunas WHERE board_id = ${boardId}))`;
  refresh();
}

export async function atualizarColuna(id: number, f: FormData) {
  await ensureSchema();
  const limite = Number(f.get("limite") || 0);
  await sql`UPDATE kanban_colunas SET nome = ${obrigatorio(f, "nome", "Nome da coluna", 80)}, cor = ${corValida(f.get("cor"))},
    limite = ${Number.isInteger(limite) && limite > 0 ? limite : null} WHERE id = ${id}`;
  refresh();
}

export async function excluirColuna(id: number) {
  await ensureSchema();
  await sql`DELETE FROM kanban_colunas WHERE id = ${id}`;
  refresh();
}

// Grava a nova ordem das colunas de um board.
export async function ordenarColunas(boardId: number, lista: number[]) {
  await ensureSchema();
  await sql`UPDATE kanban_colunas c SET posicao = o.ord - 1
    FROM unnest(${ids(lista)}::int[]) WITH ORDINALITY AS o(id, ord)
    WHERE c.id = o.id AND c.board_id = ${boardId}`;
  refresh();
}

// ---- cards

export async function criarCard(colunaId: number, f: FormData) {
  await ensureSchema();
  await sql`INSERT INTO kanban_cards (coluna_id, titulo, posicao)
    VALUES (${colunaId}, ${obrigatorio(f, "titulo", "Título", 300)},
      (SELECT COALESCE(MAX(posicao), -1) + 1 FROM kanban_cards WHERE coluna_id = ${colunaId}))`;
  refresh();
}

export async function atualizarCard(id: number, f: FormData) {
  await ensureSchema();
  const cor = txt(f, "cor");
  await sql`UPDATE kanban_cards SET titulo = ${obrigatorio(f, "titulo", "Título", 300)}, descricao = ${txt(f, "descricao", 5000)},
    etiqueta = ${txt(f, "etiqueta", 40)}, cor = ${cor ? corValida(cor) : null}, prazo = ${data(f, "prazo")}::date,
    responsavel = ${txt(f, "responsavel", 60)}, updated_at = now()
    WHERE id = ${id}`;
  refresh();
}

export async function excluirCard(id: number) {
  await ensureSchema();
  await sql`DELETE FROM kanban_cards WHERE id = ${id}`;
  refresh();
}

// Grava a ordem completa de uma coluna (inclui cards que vieram de outra coluna).
export async function moverCards(colunaId: number, lista: number[]) {
  await ensureSchema();
  await sql`UPDATE kanban_cards c SET coluna_id = ${colunaId}, posicao = o.ord - 1, updated_at = now()
    FROM unnest(${ids(lista)}::int[]) WITH ORDINALITY AS o(id, ord)
    WHERE c.id = o.id
      AND (SELECT board_id FROM kanban_colunas WHERE id = c.coluna_id) = (SELECT board_id FROM kanban_colunas WHERE id = ${colunaId})`;
  refresh();
}
