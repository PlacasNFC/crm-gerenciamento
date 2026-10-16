"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { CANAIS } from "@/lib/constants";
import { cnpjValido, soDigitos, UFS } from "@/lib/fiscal";
import { ErroValidacao, numero, tentar, texto, type Resultado } from "@/lib/form";
import { recalcularContasEmAberto } from "@/lib/vendas";

export async function salvarEmpresa(_: Resultado, f: FormData) {
  return tentar(async () => {
    const cnpj = soDigitos(texto(f, "cnpj"));
    if (cnpj && !cnpjValido(cnpj)) throw new ErroValidacao("CNPJ inválido.");
    const uf = (texto(f, "uf") ?? "SP").toUpperCase();
    if (!(UFS as readonly string[]).includes(uf)) throw new ErroValidacao("UF inválida.");
    const csosn = texto(f, "csosn_padrao") ?? "102";
    if (!/^\d{3}$/.test(csosn)) throw new ErroValidacao("CSOSN deve ter 3 dígitos.");
    const dias: Record<string, number> = {};
    for (const c of Object.keys(CANAIS)) {
      const n = numero(f, `dias_${c}`);
      if (!Number.isInteger(n) || n > 180) throw new ErroValidacao("Dias de repasse devem ser inteiros entre 0 e 180.");
      dias[c] = n;
    }
    await sql`UPDATE empresa SET razao_social = ${texto(f, "razao_social")}, nome_fantasia = ${texto(f, "nome_fantasia")},
      cnpj = ${cnpj || null}, ie = ${soDigitos(texto(f, "ie")) || null}, uf = ${uf}, municipio = ${texto(f, "municipio")},
      cep = ${soDigitos(texto(f, "cep")) || null}, endereco = ${texto(f, "endereco")}, csosn_padrao = ${csosn},
      dias_repasse = ${JSON.stringify(dias)}::jsonb WHERE id = 1`;
    await recalcularContasEmAberto();
    revalidatePath("/", "layout");
    return "Configurações salvas.";
  });
}
