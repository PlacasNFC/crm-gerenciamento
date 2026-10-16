"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { hoje } from "@/lib/constants";
import { parcelar } from "@/lib/contas";
import { ErroValidacao, dataISO, numero, obrigatorio, tentar, texto, type Resultado } from "@/lib/form";

const tipoDe = (f: FormData) => {
  const t = String(f.get("tipo"));
  if (t !== "pagar" && t !== "receber") throw new ErroValidacao("Tipo inválido.");
  return t;
};

export async function criarConta(_: Resultado, f: FormData) {
  return tentar(async () => {
    const tipo = tipoDe(f);
    const descricao = obrigatorio(f, "descricao", "Descrição");
    const categoria = texto(f, "categoria") ?? "Outros";
    const valor = numero(f, "valor");
    if (!(valor > 0)) throw new ErroValidacao("Valor deve ser maior que zero.");
    const venc = dataISO(f, "vencimento") ?? hoje();
    const n = numero(f, "parcelas") || 1;
    const pago = f.get("ja_pago") === "on";
    const parcelas = parcelar(valor, n, venc);
    await sql.transaction(
      parcelas.map((p) => sql`INSERT INTO contas (tipo, descricao, categoria, valor, vencimento, pago_em)
        VALUES (${tipo}, ${n > 1 ? `${descricao} (${p.numero}/${n})` : descricao}, ${categoria}, ${p.valor}, ${p.vencimento},
        ${pago ? p.vencimento : null})`),
    );
    revalidatePath("/", "layout");
    return n > 1 ? `${n} parcelas lançadas.` : "Conta lançada.";
  });
}

export async function baixarConta(_: Resultado, f: FormData) {
  return tentar(async () => {
    const id = Number(f.get("id"));
    const em = dataISO(f, "pago_em") ?? hoje();
    await sql`UPDATE contas SET pago_em = ${em} WHERE id = ${id}`;
    revalidatePath("/", "layout");
  });
}

export async function estornarConta(_: Resultado, f: FormData) {
  return tentar(async () => {
    await sql`UPDATE contas SET pago_em = NULL WHERE id = ${Number(f.get("id"))}`;
    revalidatePath("/", "layout");
  });
}

export async function salvarConta(_: Resultado, f: FormData) {
  const id = Number(f.get("id"));
  let tipo = "receber";
  const r = await tentar(async () => {
    const [c] = (await sql`SELECT tipo, venda_id FROM contas WHERE id = ${id}`) as { tipo: string; venda_id: number | null }[];
    if (!c) throw new ErroValidacao("Conta não encontrada.");
    tipo = c.tipo;
    const valor = numero(f, "valor");
    if (!(valor > 0)) throw new ErroValidacao("Valor deve ser maior que zero.");
    const venc = dataISO(f, "vencimento");
    if (!venc) throw new ErroValidacao("Informe o vencimento.");
    const pagoEm = dataISO(f, "pago_em");
    if (c.venda_id) {
      // valor vem da venda; aqui só ajusta datas
      await sql`UPDATE contas SET vencimento = ${venc}, pago_em = ${pagoEm} WHERE id = ${id}`;
    } else {
      await sql`UPDATE contas SET descricao = ${obrigatorio(f, "descricao", "Descrição")}, categoria = ${texto(f, "categoria") ?? "Outros"},
        valor = ${valor}, vencimento = ${venc}, pago_em = ${pagoEm} WHERE id = ${id}`;
    }
    revalidatePath("/", "layout");
  });
  if (r?.ok) redirect(`/financeiro/${tipo}`);
  return r;
}

export async function excluirConta(_: Resultado, f: FormData) {
  const id = Number(f.get("id"));
  let tipo = "receber";
  const r = await tentar(async () => {
    const [c] = (await sql`SELECT tipo, venda_id FROM contas WHERE id = ${id}`) as { tipo: string; venda_id: number | null }[];
    if (!c) return;
    tipo = c.tipo;
    if (c.venda_id) throw new ErroValidacao(`Esta conta vem da venda #${c.venda_id}. Cancele ou exclua a venda.`);
    await sql`DELETE FROM contas WHERE id = ${id}`;
    revalidatePath("/", "layout");
  });
  if (r?.ok) redirect(`/financeiro/${tipo}`);
  return r;
}
