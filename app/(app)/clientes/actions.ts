"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { documentoValido, soDigitos, UFS } from "@/lib/fiscal";
import { ErroValidacao, marcado, obrigatorio, tentar, texto, type Resultado } from "@/lib/form";

export async function salvarCliente(_: Resultado, f: FormData) {
  let id = Number(f.get("id")) || null;
  const r = await tentar(async () => {
    const nome = obrigatorio(f, "nome", "Nome");
    const doc = soDigitos(texto(f, "documento"));
    if (doc && !documentoValido(doc)) throw new ErroValidacao("CPF/CNPJ inválido.");
    const uf = texto(f, "uf")?.toUpperCase() ?? null;
    if (uf && !(UFS as readonly string[]).includes(uf)) throw new ErroValidacao("UF inválida.");
    if (doc) {
      const dup = await sql`SELECT id FROM clientes WHERE documento = ${doc} AND id IS DISTINCT FROM ${id}`;
      if (dup.length) throw new ErroValidacao("Já existe um cliente com esse CPF/CNPJ.");
    }
    const v = {
      nome, doc: doc || null, ie: soDigitos(texto(f, "ie")) || null, contribuinte: marcado(f, "contribuinte"),
      email: texto(f, "email"), telefone: texto(f, "telefone"), cep: soDigitos(texto(f, "cep")) || null,
      logradouro: texto(f, "logradouro"), numero: texto(f, "numero"), complemento: texto(f, "complemento"),
      bairro: texto(f, "bairro"), municipio: texto(f, "municipio"), uf,
    };
    if (v.contribuinte && !v.ie) throw new ErroValidacao("Contribuinte de ICMS precisa de inscrição estadual.");
    if (id) {
      await sql`UPDATE clientes SET nome = ${v.nome}, documento = ${v.doc}, ie = ${v.ie}, contribuinte = ${v.contribuinte},
        email = ${v.email}, telefone = ${v.telefone}, cep = ${v.cep}, logradouro = ${v.logradouro}, numero = ${v.numero},
        complemento = ${v.complemento}, bairro = ${v.bairro}, municipio = ${v.municipio}, uf = ${v.uf} WHERE id = ${id}`;
      await sql`UPDATE vendas SET cliente = ${v.nome} WHERE cliente_id = ${id}`;
    } else {
      [{ id }] = (await sql`INSERT INTO clientes (nome, documento, ie, contribuinte, email, telefone, cep, logradouro, numero, complemento, bairro, municipio, uf)
        VALUES (${v.nome}, ${v.doc}, ${v.ie}, ${v.contribuinte}, ${v.email}, ${v.telefone}, ${v.cep}, ${v.logradouro}, ${v.numero},
        ${v.complemento}, ${v.bairro}, ${v.municipio}, ${v.uf}) RETURNING id`) as { id: number }[];
    }
    revalidatePath("/clientes");
  });
  if (r?.ok) redirect(String(f.get("voltar") || "/clientes"));
  return r;
}

export async function excluirCliente(_: Resultado, f: FormData) {
  const id = Number(f.get("id"));
  const r = await tentar(async () => {
    await sql`DELETE FROM clientes WHERE id = ${id}`;
  });
  if (r?.ok) redirect("/clientes");
  return r;
}
