"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ErroValidacao, marcado, tentar, type Resultado } from "@/lib/form";
import { importarXml, type ResultadoImportacao } from "@/lib/notas";

export type ResultadoLote = { itens: ResultadoImportacao[] } | { erro: string } | null;

export async function importarLote(_: ResultadoLote, f: FormData): Promise<ResultadoLote> {
  const arquivos = f.getAll("xml").filter((a): a is File => a instanceof File && a.size > 0);
  if (!arquivos.length) return { erro: "Selecione um ou mais arquivos XML." };
  if (arquivos.length > 50) return { erro: "Importe no máximo 50 arquivos por vez." };
  const gerar = marcado(f, "gerar_contas");
  const itens: ResultadoImportacao[] = [];
  // notas antes de cancelamentos, para o lote poder trazer os dois
  const textos = await Promise.all(arquivos.map(async (a) => ({ nome: a.name, xml: a.size > 2_000_000 ? "" : await a.text() })));
  textos.sort((a, b) => Number(a.xml.includes("<procEventoNFe")) - Number(b.xml.includes("<procEventoNFe")));
  for (const t of textos) {
    if (!t.xml) itens.push({ arquivo: t.nome, ok: false, msg: "Arquivo grande demais." });
    else itens.push(await importarXml(t.nome, t.xml, { gerarContasPagar: gerar }));
  }
  revalidatePath("/", "layout");
  return { itens };
}

export async function vincularVenda(_: Resultado, f: FormData) {
  return tentar(async () => {
    const id = Number(f.get("id"));
    const vendaId = Number(f.get("venda_id")) || null;
    if (vendaId) {
      const v = await sql`SELECT id FROM vendas WHERE id = ${vendaId}`;
      if (!v.length) throw new ErroValidacao(`Venda #${vendaId} não existe.`);
    }
    await sql`UPDATE notas_fiscais SET venda_id = ${vendaId} WHERE id = ${id} AND direcao = 'emitida'`;
    revalidatePath("/", "layout");
    return vendaId ? `Vinculada à venda #${vendaId}.` : "Vínculo removido.";
  });
}

export async function excluirNota(_: Resultado, f: FormData) {
  const r = await tentar(async () => {
    // contas a pagar geradas pela nota e ainda em aberto saem junto
    const id = Number(f.get("id"));
    await sql.transaction([
      sql`DELETE FROM contas WHERE nota_id = ${id} AND pago_em IS NULL`,
      sql`DELETE FROM notas_fiscais WHERE id = ${id}`,
    ]);
    revalidatePath("/", "layout");
  });
  if (r?.ok) redirect("/notas");
  return r;
}
